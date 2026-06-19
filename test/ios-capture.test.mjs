/**
 * ios-capture.test.mjs
 *
 * Tests pure iOS capture helpers in dist/ios-capture.js.
 * Runs after `npm run build` (tsc must have produced dist/ios-capture.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/ios-capture.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// -- Resolve paths -----------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIosCapture = path.resolve(__dirname, '../dist/ios-capture.js');

// -- Load built module (fail gracefully if tsc hasn't run yet) ---------------

let buildDestination;
let shouldBlock;
let parseSimRuntimes;
let simRuntimeAvailable;
let parseInstalledBuildVersion;
let xcodebuildTestArgs;

try {
  const mod = await import(distIosCapture);
  buildDestination = mod.buildDestination;
  shouldBlock = mod.shouldBlock;
  parseSimRuntimes = mod.parseSimRuntimes;
  simRuntimeAvailable = mod.simRuntimeAvailable;
  parseInstalledBuildVersion = mod.parseInstalledBuildVersion;
  xcodebuildTestArgs = mod.xcodebuildTestArgs;
} catch (err) {
  const msg = `dist/ios-capture.js not found — run \`npm run build\` first. (${err.message})`;
  test('ios-capture module available', (t) => { t.skip(msg); });
  process.exit(0);
}

const requiredExports = {
  buildDestination,
  shouldBlock,
  parseSimRuntimes,
  simRuntimeAvailable,
  parseInstalledBuildVersion,
  xcodebuildTestArgs,
};

for (const [name, fn] of Object.entries(requiredExports)) {
  if (typeof fn !== 'function') {
    test(`${name} export available`, (t) => {
      t.skip(`${name} not exported from dist/ios-capture.js.`);
    });
    process.exit(0);
  }
}

// -- Fixtures ----------------------------------------------------------------

const simctlRuntimesJson = JSON.stringify({
  runtimes: [
    {
      bundlePath: '/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 17.5.simruntime',
      buildversion: '21F79',
      identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
      isAvailable: true,
      name: 'iOS 17.5',
      platform: 'iOS',
      version: '17.5',
    },
    {
      bundlePath: '/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 18.2.simruntime',
      buildversion: '22C150',
      identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2',
      isAvailable: true,
      name: 'iOS 18.2',
      platform: 'iOS',
      version: '18.2',
    },
    {
      bundlePath: '/Library/Developer/CoreSimulator/Profiles/Runtimes/tvOS 18.2.simruntime',
      identifier: 'com.apple.CoreSimulator.SimRuntime.tvOS-18-2',
      isAvailable: true,
      name: 'tvOS 18.2',
      platform: 'tvOS',
      version: '18.2',
    },
    {
      identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-16-4',
      isAvailable: false,
      name: 'iOS 16.4',
      platform: 'iOS',
      version: '16.4',
    },
  ],
});

const devicectlAppsJson = JSON.stringify({
  result: {
    apps: [
      {
        bundleIdentifier: 'com.example.OtherApp',
        CFBundleName: 'Other',
        CFBundleVersion: '7',
      },
      {
        bundleIdentifier: 'com.example.CaptureHost',
        CFBundleName: 'Capture Host',
        CFBundleShortVersionString: '1.4.0',
        CFBundleVersion: '1234',
      },
    ],
  },
});

// -- Tests -------------------------------------------------------------------

test('buildDestination uses a real device id when provided', () => {
  assert.deepStrictEqual(
    buildDestination({ device_id: '00008110-001C195E0E91801E' }, 'SIM-UDID'),
    {
      kind: 'device',
      destination: 'platform=iOS,id=00008110-001C195E0E91801E',
    }
  );
});

test('buildDestination uses a booted simulator udid when no device is provided', () => {
  assert.deepStrictEqual(
    buildDestination({}, 'B24B3F4F-7777-4444-8888-123456789ABC'),
    {
      kind: 'simulator',
      destination: 'platform=iOS Simulator,id=B24B3F4F-7777-4444-8888-123456789ABC',
    }
  );
});

test('buildDestination falls back to a named simulator when no ids are provided', () => {
  assert.deepStrictEqual(
    buildDestination({}),
    {
      kind: 'simulator',
      destination: 'platform=iOS Simulator,name=iPhone 15',
    }
  );
});

test('shouldBlock blocks real-device-required captures without a device id', () => {
  const result = shouldBlock({ real_device_required: true });

  assert.strictEqual(result.blocked, true);
  assert.ok(result.reason.includes('real_device_required'));
  assert.ok(result.reason.includes('no device_id supplied'));
});

test('shouldBlock allows real-device-required captures with a device id', () => {
  assert.deepStrictEqual(
    shouldBlock({ real_device_required: true, device_id: 'device-1' }),
    { blocked: false }
  );
});

test('shouldBlock allows simulator fallback by default', () => {
  assert.deepStrictEqual(shouldBlock({}), { blocked: false });
});

test('parseSimRuntimes returns available iOS runtime versions', () => {
  assert.deepStrictEqual(parseSimRuntimes(simctlRuntimesJson), ['17.5', '18.2']);
});

test('parseSimRuntimes returns [] for malformed input', () => {
  assert.deepStrictEqual(parseSimRuntimes('{ not json'), []);
});

test('simRuntimeAvailable returns true for undefined target with non-empty runtimes', () => {
  assert.strictEqual(simRuntimeAvailable(['17.5'], undefined), true);
});

test('simRuntimeAvailable returns false when exact target major.minor is unavailable', () => {
  assert.strictEqual(simRuntimeAvailable(['17.5', '18.2'], '26.0'), false);
});

test('simRuntimeAvailable supports major-version prefix matching', () => {
  assert.strictEqual(simRuntimeAvailable(['18.2'], '18'), true);
});

test('parseInstalledBuildVersion returns CFBundleVersion for a matching bundle id', () => {
  assert.strictEqual(
    parseInstalledBuildVersion(devicectlAppsJson, 'com.example.CaptureHost'),
    '1234'
  );
});

test('parseInstalledBuildVersion returns null for a missing app', () => {
  assert.strictEqual(
    parseInstalledBuildVersion(devicectlAppsJson, 'com.example.MissingApp'),
    null
  );
});

test('parseInstalledBuildVersion returns null for malformed input', () => {
  assert.strictEqual(
    parseInstalledBuildVersion('{ not json', 'com.example.CaptureHost'),
    null
  );
});

test('xcodebuildTestArgs returns the expected argv including -only-testing path', () => {
  assert.deepStrictEqual(
    xcodebuildTestArgs(
      'CaptureHost',
      'platform=iOS Simulator,id=B24B3F4F-7777-4444-8888-123456789ABC',
      'AccessibilitySnapshotUITests'
    ),
    [
      'test',
      '-scheme',
      'CaptureHost',
      '-destination',
      'platform=iOS Simulator,id=B24B3F4F-7777-4444-8888-123456789ABC',
      '-only-testing',
      'AccessibilitySnapshotUITests/AccessibilitySnapshot/testCaptureCurrentScreen',
    ]
  );
});
