#!/usr/bin/env bash
# Build + boot the SwiftUI sample on a Simulator (optional for Path A demo).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJ="$ROOT/sample-swiftui/RavenMobileGrabSample.xcodeproj"
BUNDLE_ID="ai.ravenmcp.MobileGrabSample"
DEVICE_NAME="${RAVEN_MOBILE_SIM:-iPhone 17}"

if [[ ! -f "$PROJ/project.pbxproj" ]]; then
  python3 "$ROOT/scripts/generate-xcodeproj.py"
fi

echo "Building for simulator: $DEVICE_NAME"
xcodebuild \
  -project "$PROJ" \
  -scheme RavenMobileGrabSample \
  -destination "platform=iOS Simulator,name=$DEVICE_NAME" \
  -derivedDataPath "$ROOT/.cache/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build

APP="$(find "$ROOT/.cache/DerivedData" -type d -name 'RavenMobileGrabSample.app' | head -n1)"
if [[ -z "$APP" ]]; then
  echo "Could not find built .app" >&2
  exit 1
fi

UDID="$(xcrun simctl list devices available | awk -v n="$DEVICE_NAME" '
  $0 ~ n && $0 ~ /\([A-F0-9-]{36}\)/ {
    match($0, /\([A-F0-9-]{36}\)/);
    print substr($0, RSTART+1, RLENGTH-2);
    exit
  }')"
if [[ -z "$UDID" ]]; then
  echo "Simulator '$DEVICE_NAME' not found. Set RAVEN_MOBILE_SIM=..." >&2
  exit 1
fi

xcrun simctl boot "$UDID" 2>/dev/null || true
open -a Simulator
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE_ID"
echo "Launched $BUNDLE_ID on $DEVICE_NAME ($UDID)"
echo "Then: node $ROOT/server.mjs → Refresh from Simulator"
