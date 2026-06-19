export type ShapeSchema = {
  required?: string[];
  types?: Record<string, "string" | "number" | "boolean" | "object" | "array">;
};

export type Query = {
  name: string;
  method?: "GET" | "POST";
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
  expect?: {
    contains?: string[];
    equals?: Record<string, unknown>;
  };
};

export type QueryVerdict = {
  name: string;
  verdict: "shape-valid" | "shape-invalid" | "confident-wrong" | "uncertain";
  reason: string;
  offending?: string;
  status?: number;
};

export type ApiContractResult = {
  results: QueryVerdict[];
  shape_valid_count: number;
  confident_wrong_count: number;
  shape_invalid_count: number;
  uncertain_count: number;
};

export function getPath(obj: unknown, path: string): unknown {
  const segments = path.split(".");
  let current = obj;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (Array.isArray(current)) {
      if (!isArrayIndex(segment)) {
        return undefined;
      }

      const arrayIndex = Number(segment);
      if (arrayIndex >= current.length) {
        return undefined;
      }

      current = current[arrayIndex];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

export function validateShape(
  response: unknown,
  schema: ShapeSchema
): { valid: boolean; offending?: string; reason: string } {
  const required = schema.required || [];
  for (let index = 0; index < required.length; index += 1) {
    const path = required[index];
    if (getPath(response, path) === undefined) {
      return {
        valid: false,
        offending: path,
        reason: "missing required path: " + path
      };
    }
  }

  const types = schema.types || {};
  const entries = Object.entries(types);
  for (let index = 0; index < entries.length; index += 1) {
    const path = entries[index][0];
    const expected = entries[index][1];
    const value = getPath(response, path);

    if (value === undefined) {
      continue;
    }

    if (!matchesType(value, expected)) {
      return {
        valid: false,
        offending: path,
        reason: "type mismatch at " + path + ": expected " + expected
      };
    }
  }

  return { valid: true, reason: "all checks passed" };
}

export async function runApiContract(
  endpointUrl: string,
  queries: Query[],
  schema: ShapeSchema
): Promise<ApiContractResult> {
  const results: QueryVerdict[] = [];

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    const controller = new AbortController();
    const timeout = setTimeout(function abortRequest() {
      controller.abort();
    }, 10000);

    let response: Response;
    try {
      response = await fetch(endpointUrl + (query.path || ""), {
        method: query.method || "GET",
        headers: requestHeaders(query),
        body: query.method === "POST" ? JSON.stringify(query.body) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      results.push({
        name: query.name,
        verdict: "uncertain",
        reason: errorMessage(error)
      });
      clearTimeout(timeout);
      continue;
    }

    clearTimeout(timeout);

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      results.push({
        name: query.name,
        verdict: "uncertain",
        reason: "non-JSON response",
        status: response.status
      });
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      results.push({
        name: query.name,
        verdict: "uncertain",
        reason: "HTTP " + response.status,
        status: response.status
      });
      continue;
    }

    const shape = validateShape(parsed, schema);
    if (!shape.valid) {
      results.push({
        name: query.name,
        verdict: "shape-invalid",
        reason: shape.reason,
        offending: shape.offending,
        status: response.status
      });
      continue;
    }

    const expected = query.expect;
    const confidentWrong = expected ? checkExpectations(parsed, expected) : null;
    if (confidentWrong) {
      results.push({
        name: query.name,
        verdict: "confident-wrong",
        reason: confidentWrong.reason,
        offending: confidentWrong.offending,
        status: response.status
      });
      continue;
    }

    results.push({
      name: query.name,
      verdict: "shape-valid",
      reason: "all checks passed",
      status: response.status
    });
  }

  return tallyResults(results);
}

function isArrayIndex(segment: string): boolean {
  return /^\d+$/.test(segment);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function matchesType(
  value: unknown,
  expected: "string" | "number" | "boolean" | "object" | "array"
): boolean {
  if (expected === "array") {
    return Array.isArray(value);
  }

  if (expected === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  return typeof value === expected;
}

function requestHeaders(query: Query): Record<string, string> | undefined {
  if (!query.headers && query.method !== "POST") {
    return undefined;
  }

  const headers = { ...(query.headers || {}) };
  if (query.method === "POST" && !hasHeader(headers, "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const names = Object.keys(headers);
  const target = name.toLowerCase();

  for (let index = 0; index < names.length; index += 1) {
    if (names[index].toLowerCase() === target) {
      return true;
    }
  }

  return false;
}

function checkExpectations(
  parsed: unknown,
  expected: NonNullable<Query["expect"]>
): { reason: string; offending: string } | null {
  const serialized = JSON.stringify(parsed);
  const contains = expected.contains || [];

  for (let index = 0; index < contains.length; index += 1) {
    const expectedString = contains[index];
    if (!serialized.includes(expectedString)) {
      return {
        reason: "expected string not found: " + expectedString,
        offending: expectedString
      };
    }
  }

  const equals = expected.equals || {};
  const entries = Object.entries(equals);
  for (let index = 0; index < entries.length; index += 1) {
    const path = entries[index][0];
    const expectedValue = entries[index][1];
    const actualValue = getPath(parsed, path);

    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      return {
        reason: "value mismatch at " + path,
        offending: path
      };
    }
  }

  return null;
}

function tallyResults(results: QueryVerdict[]): ApiContractResult {
  let shapeValidCount = 0;
  let confidentWrongCount = 0;
  let shapeInvalidCount = 0;
  let uncertainCount = 0;

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];

    if (result.verdict === "shape-valid") {
      shapeValidCount += 1;
    } else if (result.verdict === "confident-wrong") {
      confidentWrongCount += 1;
    } else if (result.verdict === "shape-invalid") {
      shapeInvalidCount += 1;
    } else if (result.verdict === "uncertain") {
      uncertainCount += 1;
    }
  }

  return {
    results,
    shape_valid_count: shapeValidCount,
    confident_wrong_count: confidentWrongCount,
    shape_invalid_count: shapeInvalidCount,
    uncertain_count: uncertainCount
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
