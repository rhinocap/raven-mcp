/**
 * ios-capture.ts - pure helpers for orchestrating iOS snapshot capture.
 * The exported functions do not spawn processes; scripts wire them to xcrun/xcodebuild.
 */

export type CaptureTarget = {
  device_id?: string;
  real_device_required?: boolean;
  osVersion?: string;
  scheme?: string;
  testTarget?: string;
};

export type IosInteraction = {
  id: string;
  event: "tap" | "swipe" | "focus" | "freeze_animation" | "hover";
  delay_ms: number;
  t_seconds?: number;
};

export type DestinationResult = {
  kind: "device" | "simulator";
  destination: string;
};

export type BlockResult = {
  blocked: boolean;
  reason?: string;
};

type JsonRecord = Record<string, unknown>;

type VersionParts = {
  major: string;
  minor?: string;
};

const REAL_DEVICE_REQUIRED_REASON =
  "real_device_required: no device_id supplied; refusing to fall back to the simulator.";

const BUNDLE_ID_KEYS = new Set([
  "cfbundleidentifier",
  "bundleidentifier",
  "bundleid",
  "bundle_id",
  "applicationidentifier",
  "identifier"
]);

const BUILD_VERSION_KEYS = [
  "cfbundleversion",
  "bundleversion",
  "buildversion",
  "buildnumber",
  "bundle_version",
  "version"
];

const IOS_INTERACTION_EVENTS = new Set<IosInteraction["event"]>([
  "tap",
  "swipe",
  "focus",
  "freeze_animation",
  "hover"
]);

/**
 * Build the xcodebuild destination string. Device UDIDs always win.
 */
export function buildDestination(
  opts: CaptureTarget,
  bootedSimUdid?: string
): DestinationResult {
  const deviceId = nonEmptyString(opts.device_id);
  if (deviceId) {
    return {
      kind: "device",
      destination: "platform=iOS,id=" + deviceId
    };
  }

  const simUdid = nonEmptyString(bootedSimUdid);
  if (simUdid) {
    return {
      kind: "simulator",
      destination: "platform=iOS Simulator,id=" + simUdid
    };
  }

  return {
    kind: "simulator",
    destination: "platform=iOS Simulator,name=iPhone 15"
  };
}

/**
 * Block unsafe fallback when the caller requires a real device but omitted one.
 */
export function shouldBlock(opts: CaptureTarget): BlockResult {
  if (opts.real_device_required === true && !nonEmptyString(opts.device_id)) {
    return {
      blocked: true,
      reason: REAL_DEVICE_REQUIRED_REASON
    };
  }

  return { blocked: false };
}

/**
 * Parse `xcrun simctl list runtimes --json` and return available iOS versions.
 */
export function parseSimRuntimes(simctlRuntimesJson: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(simctlRuntimesJson);
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.runtimes)) {
    return [];
  }

  const versions: string[] = [];
  for (const runtime of parsed.runtimes) {
    if (!isRecord(runtime)) {
      continue;
    }
    if (!isRuntimeAvailable(runtime) || !isIosRuntime(runtime)) {
      continue;
    }

    const version =
      normalizeRuntimeVersion(stringValue(runtime.version)) ||
      normalizeRuntimeVersion(stringValue(runtime.identifier)) ||
      normalizeRuntimeVersion(stringValue(runtime.name));

    if (version && !versions.includes(version)) {
      versions.push(version);
    }
  }

  return versions;
}

/**
 * Check whether any simulator runtime satisfies the target OS.
 * A target of "17" matches all 17.x runtimes; "17.5" matches 17.5.x.
 */
export function simRuntimeAvailable(
  runtimes: string[],
  osVersion?: string
): boolean {
  const usable = runtimes
    .map((runtime) => parseVersionParts(runtime))
    .filter((runtime): runtime is VersionParts => runtime !== null);

  if (!nonEmptyString(osVersion)) {
    return usable.length > 0;
  }

  const target = parseVersionParts(osVersion);
  if (!target) {
    return false;
  }

  return usable.some((runtime) => {
    if (runtime.major !== target.major) {
      return false;
    }
    if (target.minor === undefined) {
      return true;
    }
    return runtime.minor === target.minor;
  });
}

/**
 * Parse `xcrun devicectl device info apps ... --json-output -` for CFBundleVersion.
 */
export function parseInstalledBuildVersion(
  devicectlAppsJson: string,
  bundleId: string
): string | null {
  const targetBundleId = nonEmptyString(bundleId);
  if (!targetBundleId) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(devicectlAppsJson);
  } catch {
    return null;
  }

  const candidates: Array<{ depth: number; version: string }> = [];
  collectBuildVersionCandidates(parsed, targetBundleId, 0, candidates);
  candidates.sort((a, b) => b.depth - a.depth);

  return candidates[0]?.version ?? null;
}

/**
 * Build the exact xcodebuild test invocation args for the snapshot XCUITest.
 */
export function xcodebuildTestArgs(
  scheme: string,
  destination: string,
  testTarget: string
): string[] {
  return [
    "test",
    "-scheme",
    scheme,
    "-destination",
    destination,
    "-only-testing",
    testTarget + "/AccessibilitySnapshot/testCaptureCurrentScreen"
  ];
}

/**
 * Parse interaction JSON for the XCUITest env contract.
 */
export function parseInteractions(json: string | undefined): IosInteraction[] {
  const raw = nonEmptyString(json);
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const interactions: IosInteraction[] = [];
  for (const item of parsed) {
    const interaction = parseInteractionItem(item);
    if (interaction) {
      interactions.push(interaction);
    }
  }

  return interactions;
}

/**
 * Convert the first freeze_animation marker with t_seconds into launch args.
 */
export function freezeLaunchArgs(interactions: IosInteraction[]): string[] {
  for (const interaction of interactions) {
    if (interaction.event !== "freeze_animation") {
      continue;
    }
    if (typeof interaction.t_seconds !== "number" || !Number.isFinite(interaction.t_seconds)) {
      continue;
    }

    return [
      "-RAVENFreezeAnimation",
      "1",
      "-RAVENFreezeT",
      String(interaction.t_seconds)
    ];
  }

  return [];
}

/**
 * Merge caller launch args with deterministic freeze args, preserving first wins.
 */
export function buildLaunchArgs(
  baseArgs: string[],
  interactions: IosInteraction[]
): string[] {
  const seen = new Set<string>();
  const launchArgs: string[] = [];

  for (const arg of [...baseArgs, ...freezeLaunchArgs(interactions)]) {
    if (seen.has(arg)) {
      continue;
    }
    seen.add(arg);
    launchArgs.push(arg);
  }

  return launchArgs;
}

/**
 * Build xcodebuild child env additions for the shared XCUITest contract.
 */
export function captureEnv(
  interactions: IosInteraction[],
  finalLaunchArgs: string[]
): Record<string, string> {
  const env: Record<string, string> = {};

  if (interactions.length > 0) {
    env.RAVEN_INTERACTIONS = JSON.stringify(interactions);
  }
  if (finalLaunchArgs.length > 0) {
    env.RAVEN_LAUNCH_ARGS = JSON.stringify(finalLaunchArgs);
  }

  return env;
}

function parseInteractionItem(value: unknown): IosInteraction | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = nonEmptyString(value.id);
  if (!id || !isIosInteractionEvent(value.event)) {
    return null;
  }
  if (typeof value.delay_ms !== "number" || !Number.isFinite(value.delay_ms)) {
    return null;
  }

  const interaction: IosInteraction = {
    id,
    event: value.event,
    delay_ms: Math.max(0, value.delay_ms)
  };

  if (typeof value.t_seconds === "number" && Number.isFinite(value.t_seconds)) {
    interaction.t_seconds = value.t_seconds;
  }

  return interaction;
}

function isIosInteractionEvent(value: unknown): value is IosInteraction["event"] {
  return typeof value === "string" && IOS_INTERACTION_EVENTS.has(value as IosInteraction["event"]);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function isRuntimeAvailable(runtime: JsonRecord): boolean {
  if (runtime.isAvailable === false) {
    return false;
  }

  const availability = nonEmptyString(runtime.availability);
  if (!availability) {
    return true;
  }

  return !/unavailable|not available/i.test(availability);
}

function isIosRuntime(runtime: JsonRecord): boolean {
  const fields = [
    stringValue(runtime.identifier),
    stringValue(runtime.name),
    stringValue(runtime.platform),
    stringValue(runtime.platformIdentifier),
    stringValue(runtime.bundlePath)
  ].filter((value): value is string => value !== null);

  if (fields.some((field) => /tvos|watchos|xros|visionos/i.test(field))) {
    return false;
  }

  return fields.some((field) => /(^|\b|\.|-)ios(\b|\.|-)/i.test(field));
}

function normalizeRuntimeVersion(value: string | null): string | null {
  const parts = parseVersionParts(value);
  if (!parts) {
    return null;
  }
  return parts.minor === undefined ? parts.major : parts.major + "." + parts.minor;
}

function parseVersionParts(value: unknown): VersionParts | null {
  const raw = nonEmptyString(value);
  if (!raw) {
    return null;
  }

  const match = raw.match(/(\d+)(?:[._-](\d+))?/);
  if (!match) {
    return null;
  }

  return {
    major: match[1],
    minor: match[2]
  };
}

function collectBuildVersionCandidates(
  value: unknown,
  bundleId: string,
  depth: number,
  candidates: Array<{ depth: number; version: string }>
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBuildVersionCandidates(item, bundleId, depth + 1, candidates);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (recordHasDirectBundleId(value, bundleId)) {
    const version = findBuildVersionInSubtree(value);
    if (version) {
      candidates.push({ depth, version });
    }
  } else if (recordChildrenContainBundleId(value, bundleId)) {
    const directVersion = directBuildVersion(value);
    if (directVersion) {
      candidates.push({ depth, version: directVersion });
    }
  }

  for (const child of Object.values(value)) {
    collectBuildVersionCandidates(child, bundleId, depth + 1, candidates);
  }
}

function recordHasDirectBundleId(record: JsonRecord, bundleId: string): boolean {
  for (const [key, value] of Object.entries(record)) {
    if (!BUNDLE_ID_KEYS.has(normalizedKey(key))) {
      continue;
    }
    if (stringValue(value) === bundleId) {
      return true;
    }
  }
  return false;
}

function recordChildrenContainBundleId(record: JsonRecord, bundleId: string): boolean {
  for (const child of Object.values(record)) {
    if (containsBundleId(child, bundleId)) {
      return true;
    }
  }
  return false;
}

function containsBundleId(value: unknown, bundleId: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsBundleId(item, bundleId));
  }

  if (!isRecord(value)) {
    return false;
  }

  if (recordHasDirectBundleId(value, bundleId)) {
    return true;
  }

  return Object.values(value).some((child) => containsBundleId(child, bundleId));
}

function findBuildVersionInSubtree(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBuildVersionInSubtree(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const directVersion = directBuildVersion(value);
  if (directVersion) {
    return directVersion;
  }

  for (const child of Object.values(value)) {
    const found = findBuildVersionInSubtree(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function directBuildVersion(record: JsonRecord): string | null {
  for (const wantedKey of BUILD_VERSION_KEYS) {
    for (const [key, value] of Object.entries(record)) {
      if (normalizedKey(key) !== wantedKey) {
        continue;
      }

      const version = stringValue(value);
      if (version) {
        return version;
      }
    }
  }

  return null;
}
