export type ContractSpec = {
  mode?: "tokens" | "envelope";
  tokens?: string[];
  fields?: string[];
  schemaVersionPattern?: string;
};

export type FileInput = { path: string; content: string };

export type LayerReport = {
  path: string;
  present: string[];
  missing: string[];
  ordering_issues: string[];
  schema_version?: string | null;
};

export type ContractResult = {
  verdict: "PASS" | "BLOCK";
  mode: string;
  layers: LayerReport[];
  cross_layer: {
    inconsistent_tokens: string[];
    schema_versions?: Record<string, string | null>;
    missing_fields?: Record<string, string[]>;
  };
  block_reasons: string[];
};

type ContractMode = "tokens" | "envelope";

export function auditContract(spec: ContractSpec, files: FileInput[]): ContractResult {
  const mode = resolveMode(spec);

  if (files.length === 0 || isEmptySpec(spec)) {
    return emptyResult(mode);
  }

  if (mode === "envelope") {
    return auditEnvelopeContract(spec, files);
  }

  return auditTokenContract(spec, files);
}

function resolveMode(spec: ContractSpec): ContractMode {
  if (spec.mode) {
    return spec.mode;
  }

  if (spec.tokens && spec.tokens.length > 0) {
    return "tokens";
  }

  if (spec.fields && spec.fields.length > 0) {
    return "envelope";
  }

  if (Array.isArray(spec.tokens)) {
    return "tokens";
  }

  if (Array.isArray(spec.fields)) {
    return "envelope";
  }

  return "tokens";
}

function isEmptySpec(spec: ContractSpec): boolean {
  return (
    !spec.mode &&
    !Array.isArray(spec.tokens) &&
    !Array.isArray(spec.fields) &&
    typeof spec.schemaVersionPattern !== "string"
  );
}

function emptyResult(mode: ContractMode): ContractResult {
  return {
    verdict: "PASS",
    mode,
    layers: [],
    cross_layer: {
      inconsistent_tokens: []
    },
    block_reasons: []
  };
}

function auditTokenContract(spec: ContractSpec, files: FileInput[]): ContractResult {
  const tokens = spec.tokens || [];
  const distinctTokens = uniqueStrings(tokens);
  const layers: LayerReport[] = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    layers.push(auditTokenLayer(file, tokens, distinctTokens));
  }

  const inconsistentTokens = findInconsistentTokens(distinctTokens, layers);
  const blockReasons = tokenBlockReasons(layers, inconsistentTokens);

  return {
    verdict: blockReasons.length > 0 ? "BLOCK" : "PASS",
    mode: "tokens",
    layers,
    cross_layer: {
      inconsistent_tokens: inconsistentTokens
    },
    block_reasons: blockReasons
  };
}

function auditTokenLayer(
  file: FileInput,
  tokens: string[],
  distinctTokens: string[]
): LayerReport {
  const present: string[] = [];
  const missing: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (file.content.indexOf(token) !== -1) {
      present.push(token);
    } else {
      missing.push(token);
    }
  }

  return {
    path: file.path,
    present,
    missing,
    ordering_issues: findOrderingIssues(file.content, distinctTokens)
  };
}

function findOrderingIssues(content: string, tokens: string[]): string[] {
  const issues: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const shorter = tokens[i];
    const shorterIndex = content.indexOf(shorter);

    if (shorterIndex === -1) {
      continue;
    }

    for (let j = 0; j < tokens.length; j += 1) {
      const longer = tokens[j];

      if (shorter === longer || !hasOrderingRisk(shorter, longer)) {
        continue;
      }

      const longerIndex = content.indexOf(longer);
      if (longerIndex !== -1 && shorterIndex < longerIndex) {
        issues.push(
          "token '" +
            shorter +
            "' appears before longer '" +
            longer +
            "' — prefix-ordering risk (match longer tokens first)"
        );
      }
    }
  }

  return issues;
}

function hasOrderingRisk(shorter: string, longer: string): boolean {
  if (longer.length <= shorter.length) {
    return false;
  }

  if (longer.indexOf(shorter) !== -1) {
    return true;
  }

  const shorterParts = splitTokenPrefix(shorter);
  const longerParts = splitTokenPrefix(longer);

  if (
    shorterParts.prefix === "" ||
    shorterParts.prefix !== longerParts.prefix ||
    shorterParts.body === "" ||
    shorterParts.body === longerParts.body
  ) {
    return false;
  }

  return longerParts.body.indexOf(shorterParts.body) !== -1;
}

function splitTokenPrefix(token: string): { prefix: string; body: string } {
  const match = /^[^A-Za-z0-9_]+/.exec(token);
  const prefix = match ? match[0] : "";

  return {
    prefix,
    body: token.slice(prefix.length)
  };
}

function findInconsistentTokens(tokens: string[], layers: LayerReport[]): string[] {
  const inconsistentTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    let foundPresent = false;
    let foundMissing = false;

    for (let j = 0; j < layers.length; j += 1) {
      const layer = layers[j];

      if (layer.present.indexOf(token) !== -1) {
        foundPresent = true;
      }

      if (layer.missing.indexOf(token) !== -1) {
        foundMissing = true;
      }
    }

    if (foundPresent && foundMissing) {
      inconsistentTokens.push(token);
    }
  }

  return inconsistentTokens;
}

function tokenBlockReasons(layers: LayerReport[], inconsistentTokens: string[]): string[] {
  const blockReasons: string[] = [];

  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];

    if (layer.missing.length > 0) {
      blockReasons.push(layer.path + ": missing tokens " + quoteList(layer.missing));
    }

    for (let j = 0; j < layer.ordering_issues.length; j += 1) {
      blockReasons.push(layer.path + ": " + layer.ordering_issues[j]);
    }
  }

  for (let i = 0; i < inconsistentTokens.length; i += 1) {
    const token = inconsistentTokens[i];
    blockReasons.push(
      "token '" +
        token +
        "' inconsistent across layers: present in " +
        formatPaths(pathsWithToken(layers, token, true)) +
        ", missing in " +
        formatPaths(pathsWithToken(layers, token, false))
    );
  }

  return blockReasons;
}

function auditEnvelopeContract(spec: ContractSpec, files: FileInput[]): ContractResult {
  const fields = spec.fields || [];
  const hasSchemaVersionPattern = typeof spec.schemaVersionPattern === "string";
  const schemaVersionPattern =
    typeof spec.schemaVersionPattern === "string"
      ? new RegExp(spec.schemaVersionPattern)
      : null;
  const schemaVersions: Record<string, string | null> = {};
  const missingFields: Record<string, string[]> = {};
  const layers: LayerReport[] = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const layer: LayerReport = {
      path: file.path,
      present: [],
      missing: [],
      ordering_issues: []
    };

    if (schemaVersionPattern) {
      const match = schemaVersionPattern.exec(file.content);
      const schemaVersion = match && typeof match[1] === "string" ? match[1] : null;
      layer.schema_version = schemaVersion;
      schemaVersions[file.path] = schemaVersion;
    }

    const fileMissingFields = missingLiteralFields(fields, file.content);
    if (fileMissingFields.length > 0) {
      missingFields[file.path] = fileMissingFields;
    }

    layers.push(layer);
  }

  const crossLayer: ContractResult["cross_layer"] = {
    inconsistent_tokens: [],
    missing_fields: missingFields
  };

  if (hasSchemaVersionPattern) {
    crossLayer.schema_versions = schemaVersions;
  }

  const blockReasons = envelopeBlockReasons(
    spec.schemaVersionPattern,
    layers,
    schemaVersions,
    missingFields
  );

  return {
    verdict: blockReasons.length > 0 ? "BLOCK" : "PASS",
    mode: "envelope",
    layers,
    cross_layer: crossLayer,
    block_reasons: blockReasons
  };
}

function missingLiteralFields(fields: string[], content: string): string[] {
  const missingFields: string[] = [];

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (content.indexOf(field) === -1) {
      missingFields.push(field);
    }
  }

  return missingFields;
}

function envelopeBlockReasons(
  schemaVersionPattern: string | undefined,
  layers: LayerReport[],
  schemaVersions: Record<string, string | null>,
  missingFields: Record<string, string[]>
): string[] {
  const blockReasons: string[] = [];

  if (typeof schemaVersionPattern === "string") {
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      if (layer.schema_version === null) {
        blockReasons.push(
          layer.path + ": missing schema version using pattern '" + schemaVersionPattern + "'"
        );
      }
    }

    const versionGroups = groupSchemaVersionPaths(schemaVersions);
    if (versionGroups.versions.length > 1) {
      blockReasons.push(
        "schema versions differ across layers: " + formatVersionGroups(versionGroups)
      );
    }
  }

  const missingFieldPaths = Object.keys(missingFields);
  for (let i = 0; i < missingFieldPaths.length; i += 1) {
    const path = missingFieldPaths[i];
    blockReasons.push(path + ": missing fields " + quoteList(missingFields[path]));
  }

  return blockReasons;
}

function groupSchemaVersionPaths(
  schemaVersions: Record<string, string | null>
): { versions: string[]; pathsByVersion: Record<string, string[]> } {
  const versions: string[] = [];
  const pathsByVersion: Record<string, string[]> = {};
  const paths = Object.keys(schemaVersions);

  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i];
    const version = schemaVersions[path];

    if (version === null) {
      continue;
    }

    if (!pathsByVersion[version]) {
      pathsByVersion[version] = [];
      versions.push(version);
    }

    pathsByVersion[version].push(path);
  }

  return { versions, pathsByVersion };
}

function pathsWithToken(layers: LayerReport[], token: string, present: boolean): string[] {
  const paths: string[] = [];

  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    const tokenList = present ? layer.present : layer.missing;

    if (tokenList.indexOf(token) !== -1) {
      paths.push(layer.path);
    }
  }

  return paths;
}

function uniqueStrings(values: string[]): string[] {
  const uniqueValues: string[] = [];

  for (let i = 0; i < values.length; i += 1) {
    if (uniqueValues.indexOf(values[i]) === -1) {
      uniqueValues.push(values[i]);
    }
  }

  return uniqueValues;
}

function quoteList(values: string[]): string {
  const quotedValues: string[] = [];

  for (let i = 0; i < values.length; i += 1) {
    quotedValues.push("'" + values[i] + "'");
  }

  return quotedValues.join(", ");
}

function formatPaths(paths: string[]): string {
  return "[" + quoteList(paths) + "]";
}

function formatVersionGroups(versionGroups: {
  versions: string[];
  pathsByVersion: Record<string, string[]>;
}): string {
  const formattedGroups: string[] = [];

  for (let i = 0; i < versionGroups.versions.length; i += 1) {
    const version = versionGroups.versions[i];
    formattedGroups.push("'" + version + "' in " + formatPaths(versionGroups.pathsByVersion[version]));
  }

  return formattedGroups.join(", ");
}
