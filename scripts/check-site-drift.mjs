import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const jsonOutput = process.argv.includes("--json");
const errors = [];

const checks = {
  count: { status: "PASS", mismatches: [] },
  coverage: { status: "PASS", missing: [] },
  docs: { status: "INFO", missing: [] },
  changelog: {
    status: "PASS",
    markdownVersion: null,
    siteVersion: null,
  },
  bundle: { status: "PASS", version: null },
};

function addError(check, message, extra = {}) {
  errors.push({ check, message, ...extra });
  if (checks[check]) checks[check].status = "ERROR";
}

async function read(relativePath, check) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch (error) {
    addError(check, `Cannot read ${relativePath}: ${error.message}`, {
      file: relativePath,
    });
    return null;
  }
}

function parseJson(source, relativePath, check) {
  if (source === null) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    addError(check, `Invalid JSON in ${relativePath}: ${error.message}`, {
      file: relativePath,
    });
    return null;
  }
}

async function findTsxFiles(relativeDirectory, extensions = [".tsx"]) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    addError("count", `Cannot scan ${relativeDirectory}: ${error.message}`, {
      file: relativeDirectory,
    });
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTsxFiles(relativePath, extensions)));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(relativePath);
    }
  }
  return files;
}

const TENS = { seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

function spelledCount(phrase) {
  const words = phrase.toLowerCase().split(/[\s-]+/);
  if (words[0] === "one") words.shift(); // "one hundred" === "hundred"
  let total = 0;
  for (const word of words) total += TENS[word] ?? ONES[word] ?? 0;
  return total;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

const manifestSource = await read("manifest.json", "coverage");
const manifest = parseJson(manifestSource, "manifest.json", "coverage");
let manifestVersion = null;
let toolNames = null;

if (manifest !== null) {
  if (typeof manifest.version !== "string") {
    addError("coverage", "manifest.json .version must be a string", {
      file: "manifest.json",
    });
  } else {
    manifestVersion = manifest.version;
  }

  if (
    !Array.isArray(manifest.tools) ||
    manifest.tools.some(
      (tool) => tool === null || typeof tool !== "object" || typeof tool.name !== "string",
    )
  ) {
    addError(
      "coverage",
      "manifest.json .tools must be an array of objects with string .name values",
      { file: "manifest.json" },
    );
  } else {
    toolNames = manifest.tools.map((tool) => tool.name);
  }
}

if (toolNames === null) {
  checks.count.status = "ERROR";
  addError("count", "Cannot compare tool counts without a valid manifest.json .tools array", {
    file: "manifest.json",
  });
} else {
  const countFiles = [
    ...(await findTsxFiles("web/app")),
    // Public text surfaces claim counts too — llms.txt drifted to 99 unnoticed.
    ...(await findTsxFiles("web/public", [".txt", ".md"])),
  ].sort();
  for (const file of countFiles) {
    const source = await read(file, "count");
    if (source === null) continue;

    // Allow up to two qualifier words: "100 tools", "100 local tools",
    // "100 design-intelligence tools".
    const pattern = /\b(\d+)(?:\s+[a-z][a-z-]*){0,2}\s+tools\b/gi;
    for (const match of source.matchAll(pattern)) {
      const claimed = Number(match[1]);
      if (claimed !== toolNames.length) {
        const mismatch = {
          file,
          line: lineNumberAt(source, match.index),
          claimed,
          expected: toolNames.length,
        };
        checks.count.mismatches.push(mismatch);
        addError(
          "count",
          `${file}:${mismatch.line} claims ${claimed} tools; expected ${toolNames.length}`,
          mismatch,
        );
      }
    }

    // Spelled-out counts ("Ninety-Nine Tools") are invisible to the numeric
    // scan — the release preview caught three of those by eye once.
    // ponytail: only the 70–100 band appears in this copy; widen if it moves.
    const spelled = /\b((?:one[\s-]+)?(?:hundred|ninety|eighty|seventy)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?)\s+tools\b/gi;
    for (const match of source.matchAll(spelled)) {
      const claimed = spelledCount(match[1]);
      if (claimed === toolNames.length) continue;
      const mismatch = {
        file,
        line: lineNumberAt(source, match.index),
        claimed: match[1],
        expected: toolNames.length,
      };
      checks.count.mismatches.push(mismatch);
      addError(
        "count",
        `${file}:${mismatch.line} spells out "${match[1]} tools"; expected ${toolNames.length}`,
        mismatch,
      );
    }
  }
}

const toolsSectionPath = "web/components/tools/ToolsSection.tsx";
const toolsSection = await read(toolsSectionPath, "coverage");
if (toolsSection !== null && toolNames !== null) {
  const listed = new Set(
    [...toolsSection.matchAll(/\{\s*name\s*:\s*["']([^"']+)["']\s*,/g)].map(
      (match) => match[1],
    ),
  );
  checks.coverage.missing = toolNames.filter((name) => !listed.has(name));
  if (checks.coverage.missing.length > 0) {
    addError(
      "coverage",
      `${toolsSectionPath} is missing ${checks.coverage.missing.length} manifest tool(s)`,
      { file: toolsSectionPath, tools: checks.coverage.missing },
    );
  }
}

const docsPath = "web/app/docs/page.tsx";
const docsSource = await read(docsPath, "docs");
if (docsSource !== null && toolNames !== null) {
  // The page groups related tools into one narrative card and names the
  // siblings inline, so an h3-only scan under-reports by ~30 tools.
  checks.docs.missing = toolNames.filter(
    (name) => !new RegExp(`\\b${name}\\b`).test(docsSource),
  );
}

const markdownChangelog = await read("CHANGELOG.md", "changelog");
if (markdownChangelog !== null) {
  const match = markdownChangelog.match(
    /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/m,
  );
  if (match === null) {
    addError("changelog", "No dated release header found in CHANGELOG.md", {
      file: "CHANGELOG.md",
    });
  } else {
    checks.changelog.markdownVersion = match[1];
  }
}

const siteChangelogSource = await read("web/data/changelog.json", "changelog");
const siteChangelog = parseJson(
  siteChangelogSource,
  "web/data/changelog.json",
  "changelog",
);
if (siteChangelog !== null) {
  if (
    !Array.isArray(siteChangelog.releases) ||
    siteChangelog.releases.length === 0 ||
    typeof siteChangelog.releases[0]?.version !== "string"
  ) {
    addError(
      "changelog",
      "web/data/changelog.json .releases must start with a release containing a string .version",
      { file: "web/data/changelog.json" },
    );
  } else {
    checks.changelog.siteVersion = siteChangelog.releases[0].version.replace(/^v/, "");
  }
}

if (
  checks.changelog.markdownVersion !== null &&
  checks.changelog.siteVersion !== null &&
  checks.changelog.markdownVersion !== checks.changelog.siteVersion
) {
  addError(
    "changelog",
    `CHANGELOG.md is ${checks.changelog.markdownVersion}; web/data/changelog.json is ${checks.changelog.siteVersion}`,
    {
      markdownVersion: checks.changelog.markdownVersion,
      siteVersion: checks.changelog.siteVersion,
    },
  );
}

// release.sh rebuilds site/raven.mcpb, but the apex is served by the `web`
// project's own copy — it sat four releases behind at v2.0.0 before this check.
{
  const bundlePath = "web/public/raven.mcpb";
  const { execFileSync } = await import("node:child_process");
  try {
    const raw = execFileSync("unzip", ["-p", path.join(root, bundlePath), "manifest.json"], {
      encoding: "utf8",
      maxBuffer: 1 << 24,
    });
    checks.bundle.version = JSON.parse(raw).version;
    if (manifestVersion !== null && checks.bundle.version !== manifestVersion) {
      addError(
        "bundle",
        `${bundlePath} is v${checks.bundle.version}; manifest.json is v${manifestVersion} — copy site/raven.mcpb over it`,
        { file: bundlePath },
      );
    }
  } catch (error) {
    addError("bundle", `Cannot read ${bundlePath}: ${error.message}`, { file: bundlePath });
  }
}

const result = {
  ok: errors.length === 0,
  manifest: {
    version: manifestVersion,
    toolCount: toolNames?.length ?? null,
  },
  checks,
  errors,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const lines = [];

  lines.push("COUNT");
  if (checks.count.status === "PASS") {
    lines.push(`  PASS: all web/app + web/public tool counts equal ${toolNames.length}`);
  } else {
    for (const mismatch of checks.count.mismatches) {
      lines.push(
        `  ERROR: ${mismatch.file}:${mismatch.line} claims ${mismatch.claimed} tools; expected ${mismatch.expected}`,
      );
    }
    for (const error of errors.filter(
      (item) => item.check === "count" && item.line === undefined,
    )) {
      lines.push(`  ERROR: ${error.message}`);
    }
  }

  lines.push("\nCOVERAGE");
  if (checks.coverage.status === "PASS") {
    lines.push("  PASS: ToolsSection.tsx includes every manifest tool");
  } else {
    for (const error of errors.filter((item) => item.check === "coverage")) {
      lines.push(`  ERROR: ${error.message}`);
    }
    for (const name of checks.coverage.missing) lines.push(`    - ${name}`);
  }

  lines.push("\nDOCS");
  if (docsSource === null) {
    for (const error of errors.filter((item) => item.check === "docs")) {
      lines.push(`  ERROR: ${error.message}`);
    }
  } else if (checks.docs.missing.length === 0) {
    lines.push("  INFO: docs/page.tsx includes every manifest tool");
  } else {
    lines.push(
      `  INFO: docs/page.tsx omits ${checks.docs.missing.length} manifest tool(s):`,
    );
    for (const name of checks.docs.missing) lines.push(`    - ${name}`);
  }

  lines.push("\nCHANGELOG");
  if (checks.changelog.status === "PASS") {
    lines.push(`  PASS: newest version is ${checks.changelog.markdownVersion}`);
  } else {
    for (const error of errors.filter((item) => item.check === "changelog")) {
      lines.push(`  ERROR: ${error.message}`);
    }
  }

  lines.push("\nBUNDLE");
  if (checks.bundle.status === "PASS") {
    lines.push(`  PASS: web/public/raven.mcpb is v${checks.bundle.version}`);
  } else {
    for (const error of errors.filter((item) => item.check === "bundle")) {
      lines.push(`  ERROR: ${error.message}`);
    }
  }

  lines.push(
    `\nRESULT: ${errors.length === 0 ? "PASS" : `FAIL (${errors.length} error(s))`}`,
  );
  console.log(lines.join("\n"));
}

process.exit(errors.length === 0 ? 0 : 1);
