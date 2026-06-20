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
let checkSnapshotWiring;
let gatherWiringFacts;

try {
  const mod = await import(distIosCapture);
  buildDestination = mod.buildDestination;
  shouldBlock = mod.shouldBlock;
  parseSimRuntimes = mod.parseSimRuntimes;
  simRuntimeAvailable = mod.simRuntimeAvailable;
  parseInstalledBuildVersion = mod.parseInstalledBuildVersion;
  xcodebuildTestArgs = mod.xcodebuildTestArgs;
  checkSnapshotWiring = mod.checkSnapshotWiring;
  gatherWiringFacts = mod.gatherWiringFacts;
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
  checkSnapshotWiring,
  gatherWiringFacts,
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

const { describe } = await import('node:test');
const {
  parseInteractions,
  freezeLaunchArgs,
  buildLaunchArgs,
  captureEnv,
} = await import(distIosCapture);

describe('parseInteractions', () => {
  test('valid JSON array of typed items returns typed items', () => {
    const raw = JSON.stringify([
      { id: 'tap-login', event: 'tap', delay_ms: 125 },
      { id: 'freeze', event: 'freeze_animation', delay_ms: 0, t_seconds: 1.66 },
    ]);

    assert.deepStrictEqual(parseInteractions(raw), [
      { id: 'tap-login', event: 'tap', delay_ms: 125 },
      { id: 'freeze', event: 'freeze_animation', delay_ms: 0, t_seconds: 1.66 },
    ]);
  });

  test('malformed JSON string returns []', () => {
    assert.deepStrictEqual(parseInteractions('{ not json'), []);
  });

  test('item with an unrecognised event field is dropped', () => {
    const raw = JSON.stringify([
      { id: 'good', event: 'focus', delay_ms: 10 },
      { id: 'bad', event: 'press_and_hold', delay_ms: 10 },
    ]);

    assert.deepStrictEqual(parseInteractions(raw), [
      { id: 'good', event: 'focus', delay_ms: 10 },
    ]);
  });

  test('item with negative delay_ms is clamped to 0', () => {
    const raw = JSON.stringify([
      { id: 'early', event: 'tap', delay_ms: -250 },
    ]);

    assert.deepStrictEqual(parseInteractions(raw), [
      { id: 'early', event: 'tap', delay_ms: 0 },
    ]);
  });

  test('non-array JSON returns []', () => {
    assert.deepStrictEqual(parseInteractions(JSON.stringify({ id: 'tap' })), []);
    assert.deepStrictEqual(parseInteractions(JSON.stringify(1)), []);
    assert.deepStrictEqual(parseInteractions(JSON.stringify('tap')), []);
  });
});

describe('freezeLaunchArgs', () => {
  test('freeze_animation with t_seconds 1.66 returns freeze launch args', () => {
    assert.deepStrictEqual(
      freezeLaunchArgs([
        { id: 'freeze', event: 'freeze_animation', delay_ms: 0, t_seconds: 1.66 },
      ]),
      ['-RAVENFreezeAnimation', '1', '-RAVENFreezeT', '1.66']
    );
  });

  test('array with no freeze_animation interaction returns []', () => {
    assert.deepStrictEqual(
      freezeLaunchArgs([
        { id: 'tap', event: 'tap', delay_ms: 0 },
      ]),
      []
    );
  });
});

describe('buildLaunchArgs', () => {
  test('base args are followed by de-duped freeze args', () => {
    const result = buildLaunchArgs(
      ['-x'],
      [{ id: 'freeze', event: 'freeze_animation', delay_ms: 0, t_seconds: 1.66 }]
    );

    assert.deepStrictEqual(result, [
      '-x',
      '-RAVENFreezeAnimation',
      '1',
      '-RAVENFreezeT',
      '1.66',
    ]);
    assert.strictEqual(new Set(result).size, result.length);
  });
});

describe('captureEnv', () => {
  test('empty interactions array and empty extra args returns no RAVEN keys', () => {
    assert.deepStrictEqual(captureEnv([], []), {});
  });

  test('non-empty interactions and launch args return JSON-parseable round-trip env', () => {
    const interactions = [
      { id: 'tap', event: 'tap', delay_ms: 10 },
      { id: 'freeze', event: 'freeze_animation', delay_ms: 0, t_seconds: 1.66 },
    ];
    const launchArgs = ['-x', '-RAVENFreezeAnimation', '1'];
    const env = captureEnv(interactions, launchArgs);

    assert.deepStrictEqual(JSON.parse(env.RAVEN_INTERACTIONS), interactions);
    assert.deepStrictEqual(JSON.parse(env.RAVEN_LAUNCH_ARGS), launchArgs);
  });
});

// ---------------------------------------------------------------------------
// checkSnapshotWiring — AccessibilitySnapshot preflight
// ---------------------------------------------------------------------------

/** Minimal fully-wired input — everything correct, hosted unit-test target */
const FULLY_WIRED_INPUT = {
  hasSnapshotSwift: true,
  testTargets: [
    {
      name: 'CaptureHostTests',
      productType: 'com.apple.product-type.bundle.unit-test',
      hasSnapshotDependency: true,
      isHosted: true,
    },
  ],
};

describe('checkSnapshotWiring', () => {
  test('returns ready=true when everything is wired correctly', () => {
    const result = checkSnapshotWiring(FULLY_WIRED_INPUT);
    assert.strictEqual(result.ready, true, 'should be ready');
    assert.deepStrictEqual(result.missing, [], 'missing should be empty');
    // No SWIFT_ENABLE_EXPLICIT_MODULES guidance expected at Xcode 16
    const hasExplicitModulesGuidance = result.guidance.some((g) =>
      g.includes('SWIFT_ENABLE_EXPLICIT_MODULES')
    );
    assert.strictEqual(hasExplicitModulesGuidance, false,
      'should not emit SWIFT_ENABLE_EXPLICIT_MODULES guidance for Xcode 16');
  });

  test('returns ready=false when hasSnapshotSwift is false', () => {
    const result = checkSnapshotWiring({
      ...FULLY_WIRED_INPUT,
      hasSnapshotSwift: false,
    });
    assert.strictEqual(result.ready, false, 'should not be ready');
    assert.ok(
      result.missing.some((m) => m.includes('AccessibilitySnapshot.swift')),
      'missing should mention AccessibilitySnapshot.swift'
    );
    assert.ok(
      result.guidance.some((g) => g.includes('Add scripts/AccessibilitySnapshot.swift')),
      'guidance should tell caller to add the swift file'
    );
  });

  test('returns ready=false when testTargets is empty', () => {
    const result = checkSnapshotWiring({
      hasSnapshotSwift: true,
      testTargets: [],
    });
    assert.strictEqual(result.ready, false, 'no test targets → not ready');
    assert.ok(result.guidance.length > 0, 'empty testTargets must still emit actionable guidance');
    assert.ok(
      result.guidance.some((g) => g.includes('hosted') && g.includes('AccessibilitySnapshot')),
      'guidance should tell the user to add a hosted target compiling AccessibilitySnapshot'
    );
  });

  test('returns ready=false when target lacks hasSnapshotDependency', () => {
    const result = checkSnapshotWiring({
      hasSnapshotSwift: true,
      testTargets: [
        {
          name: 'MyUITests',
          productType: 'com.apple.product-type.bundle.ui-testing',
          hasSnapshotDependency: false,
          isHosted: true,
        },
      ],
    });
    assert.strictEqual(result.ready, false, 'missing compile source → not ready');
    assert.ok(
      result.missing.some((m) => m.includes('AccessibilitySnapshot compile source missing') &&
        m.includes('"MyUITests"')),
      'missing should name the target and the missing source'
    );
    assert.ok(
      result.guidance.some((g) => g.includes('compile sources build phase') &&
        g.includes('"MyUITests"')),
      'guidance should tell caller to add to compile sources'
    );
  });

  test('UITest target without a host application emits Convert guidance', () => {
    const result = checkSnapshotWiring({
      hasSnapshotSwift: true,
      testTargets: [
        {
          name: 'MyUITests',
          productType: 'com.apple.product-type.bundle.ui-testing',
          hasSnapshotDependency: true,
          isHosted: false,          // <-- no host set
        },
      ],
    });
    assert.strictEqual(result.ready, false, 'unhosted UITest → not ready');
    assert.ok(
      result.missing.some((m) => m.includes('no host application set') &&
        m.includes('"MyUITests"')),
      'missing should name the unhosted target'
    );
    assert.ok(
      result.guidance.some((g) =>
        (g.includes('TEST_HOST') || g.includes('hosted unit-test')) &&
        g.includes('"MyUITests"')),
      'guidance should mention TEST_HOST or hosted unit-test conversion'
    );
  });

  test('unit-test target without TEST_HOST emits TEST_HOST guidance', () => {
    const result = checkSnapshotWiring({
      hasSnapshotSwift: true,
      testTargets: [
        {
          name: 'MyHostedTests',
          productType: 'com.apple.product-type.bundle.unit-test',
          hasSnapshotDependency: true,
          isHosted: false,          // TEST_HOST missing
        },
      ],
    });
    assert.strictEqual(result.ready, false, 'unhosted unit-test → not ready');
    assert.ok(
      result.missing.some((m) => m.includes('no TEST_HOST set') &&
        m.includes('"MyHostedTests"')),
      'missing should name the target'
    );
    assert.ok(
      result.guidance.some((g) => g.includes('TEST_HOST') &&
        g.includes('"MyHostedTests"')),
      'guidance should mention TEST_HOST'
    );
  });

  test('Xcode 26 emits SWIFT_ENABLE_EXPLICIT_MODULES=NO guidance', () => {
    const result = checkSnapshotWiring({
      ...FULLY_WIRED_INPUT,
      xcodeVersion: 'Xcode 26.0\nBuild version 26A5000a',
    });
    assert.strictEqual(result.ready, true, 'should still be ready');
    assert.ok(
      result.guidance.some((g) => g.includes('SWIFT_ENABLE_EXPLICIT_MODULES=NO')),
      'Xcode 26 should emit SWIFT_ENABLE_EXPLICIT_MODULES guidance'
    );
  });

  test('Xcode 25 does NOT emit SWIFT_ENABLE_EXPLICIT_MODULES=NO guidance', () => {
    const result = checkSnapshotWiring({
      ...FULLY_WIRED_INPUT,
      xcodeVersion: 'Xcode 25.0',
    });
    assert.strictEqual(result.ready, true, 'should be ready');
    const hasExplicitModulesGuidance = result.guidance.some((g) =>
      g.includes('SWIFT_ENABLE_EXPLICIT_MODULES')
    );
    assert.strictEqual(hasExplicitModulesGuidance, false,
      'Xcode 25 should not emit SWIFT_ENABLE_EXPLICIT_MODULES guidance');
  });

  test('result shape is complete', () => {
    const result = checkSnapshotWiring(FULLY_WIRED_INPUT);
    assert.ok('ready' in result, 'result must have ready');
    assert.ok('missing' in result, 'result must have missing');
    assert.ok('guidance' in result, 'result must have guidance');
    assert.ok(typeof result.ready === 'boolean', 'ready is boolean');
    assert.ok(Array.isArray(result.missing), 'missing is an array');
    assert.ok(Array.isArray(result.guidance), 'guidance is an array');
  });

  test('multiple issues accumulate into missing and guidance arrays', () => {
    const result = checkSnapshotWiring({
      hasSnapshotSwift: false,
      testTargets: [
        {
          name: 'BadTests',
          productType: 'com.apple.product-type.bundle.unit-test',
          hasSnapshotDependency: false,
          isHosted: false,
        },
      ],
    });
    assert.strictEqual(result.ready, false, 'should not be ready');
    // Expects at least: missing swift + missing dep + no TEST_HOST → ≥3 missing items
    assert.ok(result.missing.length >= 3,
      `expected ≥3 missing items, got ${result.missing.length}: ${JSON.stringify(result.missing)}`);
    assert.ok(result.guidance.length >= 3,
      `expected ≥3 guidance items, got ${result.guidance.length}`);
  });
});

describe('gatherWiringFacts stub', () => {
  test('throws with an actionable message so callers implement in the harness', async () => {
    await assert.rejects(
      () => gatherWiringFacts('/some/project/dir'),
      (err) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.ok(
          err.message.includes('harness') || err.message.includes('ios-audit.mjs'),
          `error message should mention the harness or ios-audit.mjs, got: ${err.message}`
        );
        return true;
      }
    );
  });
});
