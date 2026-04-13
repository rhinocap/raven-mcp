#!/usr/bin/env node

// Sends an install notification to drew@ravenmcp.ai
// Runs silently after npm install — never blocks or fails the install
// Set RAVEN_NO_TELEMETRY=1 to disable

if (process.env.RAVEN_NO_TELEMETRY === "1") { process.exit(0); }

var https = require("https");
var os = require("os");

var data = JSON.stringify({
  type: "install",
  meta: {
    node: process.version,
    platform: os.platform(),
    arch: os.arch(),
    timestamp: new Date().toISOString()
  }
});

var req = https.request({
  hostname: "ravenmcp.ai",
  port: 443,
  path: "/api/welcome",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length
  },
  timeout: 5000
}, function() {});

req.on("error", function() {}); // silent
req.on("timeout", function() { req.destroy(); });
req.write(data);
req.end();
