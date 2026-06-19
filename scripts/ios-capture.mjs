#!/usr/bin/env node
// ios-capture - run the AccessibilitySnapshot XCUITest once and emit JSON.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDestination,
  parseInstalledBuildVersion,
  parseSimRuntimes,
  shouldBlock,
  simRuntimeAvailable,
  xcodebuildTestArgs
} from "../dist/ios-capture.js";

const argv = process.argv.slice(2);
const scheme = optionValue("--scheme");
const testTarget = optionValue("--test-target");
const deviceId = optionValue("--device");
const osVersion = optionValue("--os");
const bundleId = optionValue("--bundle-id");
const outPath = optionValue("--out") || join(tmpdir(), "raven-snapshot.json");
const requireDevice = argv.includes("--require-device");

if (!scheme || !testTarget) {
  console.error(
    "Usage: node scripts/ios-capture.mjs --scheme <S> --test-target <T> [--device <udid>] [--require-device] [--os <ver>] [--bundle-id <id>] [--out <path>] [--md]"
  );
  process.exit(2);
}

const target = {
  device_id: deviceId || undefined,
  real_device_required: requireDevice,
  osVersion: osVersion || undefined,
  scheme,
  testTarget
};

const block = shouldBlock(target);
if (block.blocked) {
  printJson({ blocked: true, reason: block.reason });
  process.exit(1);
}

const runtimeResult = await runXcrun(["simctl", "list", "runtimes", "--json"]);
if (runtimeResult.status !== 0) {
  fail({
    captured: false,
    error: "xcrun simctl list runtimes failed.",
    detail: commandTail(runtimeResult)
  });
}

const runtimes = parseSimRuntimes(runtimeResult.stdout);
const simRuntimeIsAvailable = simRuntimeAvailable(runtimes, osVersion || undefined);

if (!deviceId && !simRuntimeIsAvailable) {
  fail({
    captured: false,
    sim_runtime_available: false,
    note: "device is the only repro surface for this OS."
  });
}

let installedBuild = null;
if (deviceId && bundleId) {
  const appsResult = await runXcrun([
    "devicectl",
    "device",
    "info",
    "apps",
    "--device",
    deviceId,
    "--json-output",
    "-"
  ]);

  if (appsResult.status === 0) {
    installedBuild = parseInstalledBuildVersion(appsResult.stdout, bundleId);
  }
}

let bootedSimUdid = null;
if (!deviceId) {
  const bootedResult = await runXcrun(["simctl", "list", "devices", "booted", "--json"]);
  if (bootedResult.status === 0) {
    bootedSimUdid = parseBootedSimUdid(bootedResult.stdout);
  }
}

const destination = buildDestination(target, bootedSimUdid || undefined);
const xcodebuildArgs = xcodebuildTestArgs(scheme, destination.destination, testTarget);

mkdirSync(dirname(outPath), { recursive: true });

const captureResult = await runCommand("xcodebuild", xcodebuildArgs, {
  env: { ...process.env, RAVEN_SNAPSHOT_OUT: outPath },
  stream: true
});

if (captureResult.status !== 0) {
  fail({
    captured: false,
    target_kind: destination.kind,
    destination: destination.destination,
    snapshot_path: outPath,
    sim_runtime_available: simRuntimeIsAvailable,
    error: "xcodebuild test failed.",
    xcodebuild_tail: commandTail(captureResult)
  });
}

const result = {
  captured: true,
  target_kind: destination.kind,
  destination: destination.destination,
  snapshot_path: outPath,
  sim_runtime_available: simRuntimeIsAvailable
};

if (installedBuild !== null) {
  result.installed_build = installedBuild;
}

printJson(result);

function optionValue(name) {
  const index = argv.indexOf(name);
  if (index < 0) {
    return null;
  }

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    return null;
  }

  return value;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(value) {
  printJson(value);
  process.exit(1);
}

async function runXcrun(args) {
  try {
    return await runCommand("xcrun", args);
  } catch (error) {
    fail({
      captured: false,
      error: commandAvailabilityMessage("xcrun", error)
    });
  }
}

function runCommand(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: opts.env || process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (opts.stream) {
        process.stderr.write(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (opts.stream) {
        process.stderr.write(text);
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (status) => {
      resolve({
        status: status ?? 1,
        stdout,
        stderr
      });
    });
  }).catch((error) => {
    if (command === "xcodebuild") {
      fail({
        captured: false,
        error: commandAvailabilityMessage("xcodebuild", error)
      });
    }
    throw error;
  });
}

function commandAvailabilityMessage(command, error) {
  if (error && error.code === "ENOENT") {
    if (command === "xcrun") {
      return "xcrun not found - install Xcode command line tools.";
    }
    if (command === "xcodebuild") {
      return "xcodebuild not found - install Xcode and select it with xcode-select.";
    }
  }

  if (error instanceof Error && error.message) {
    return command + " failed: " + error.message;
  }

  return command + " failed.";
}

function commandTail(result) {
  const combined = (result.stdout + "\n" + result.stderr).trim();
  if (!combined) {
    return "";
  }

  const lines = combined.split(/\r?\n/);
  return lines.slice(-80).join("\n");
}

function parseBootedSimUdid(simctlDevicesJson) {
  let parsed;
  try {
    parsed = JSON.parse(simctlDevicesJson);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const devices = parsed.devices;
  if (!devices || typeof devices !== "object" || Array.isArray(devices)) {
    return null;
  }

  for (const [runtime, list] of Object.entries(devices)) {
    if (!/ios/i.test(runtime) || !Array.isArray(list)) {
      continue;
    }

    for (const device of list) {
      if (!device || typeof device !== "object" || Array.isArray(device)) {
        continue;
      }
      if (device.state !== "Booted" || typeof device.udid !== "string") {
        continue;
      }
      if (device.isAvailable === false) {
        continue;
      }
      return device.udid;
    }
  }

  return null;
}
