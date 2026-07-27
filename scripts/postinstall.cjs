#!/usr/bin/env node

// Prints a one-line install notice. No network calls, no telemetry.
// Stays quiet on CI / non-TTY installs so it never spams logs.

if (process.stdout.isTTY && process.env.npm_config_loglevel !== "silent") {
  try {
    console.log("\n  ✨ Raven installed. Subscribe to release updates: https://ravenmcp.ai/#updates\n");
  } catch (_) { /* never fail the install */ }
}
