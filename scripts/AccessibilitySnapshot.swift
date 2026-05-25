//
//  AccessibilitySnapshot.swift
//  RavenMCP — capture a rendered iOS screen for `audit_ios_screen`.
//
//  Drop this into your app's UI-test target (or a throwaway one), point it at
//  the screen you want, and run it headless. It walks the accessibility tree
//  and writes the {elements:[{label,rect,role}], viewport} JSON that
//  audit_ios_screen consumes, then feeds it to RavenMCP via the ios-audit CLI.
//
//  What it captures: geometry (rect in points), accessibility role, and label
//  for every on-screen element — which drives the 44×44pt touch-target check
//  and the alignment / gap-rhythm / optical-balance checks.
//
//  What it does NOT capture: fontPt / fgColor / bgColor. XCUITest can't read
//  rendered colors or font sizes, so the contrast check is skipped for snapshot
//  elements — contrast is caught statically instead by `audit_swiftui`
//  (hardcoded colors) and by your dark/light visual pass. If you want runtime
//  contrast too, sample the screenshot PNG at each rect and add fg/bg per element.
//
//  Run it:
//    1. (once) fix the simulator on this Mac:  sudo xcodebuild -runFirstLaunch
//    2. xcodebuild test \
//         -scheme Macro \
//         -destination 'platform=iOS Simulator,name=iPhone 15' \
//         -only-testing:MacroUITests/AccessibilitySnapshot/testCaptureCurrentScreen
//    3. the JSON is written to the path in RAVEN_SNAPSHOT_OUT (default
//       NSTemporaryDirectory()/raven-snapshot.json) and also attached to the
//       test result. Then:
//         node scripts/ios-audit.mjs /path/to/app --snapshot /tmp/raven-snapshot.json
//

import XCTest

final class AccessibilitySnapshot: XCTestCase {

    func testCaptureCurrentScreen() throws {
        let app = XCUIApplication()
        app.launch()

        // Give the first screen a beat to settle. Navigate here first if you
        // want a deeper screen (e.g. app.tabBars.buttons["Settings"].tap()).
        Thread.sleep(forTimeInterval: 1.0)

        let viewport = app.windows.firstMatch.frame
        var elements: [[String: Any]] = []

        for el in app.descendants(matching: .any).allElementsBoundByIndex {
            guard el.exists else { continue }
            let f = el.frame
            // Skip zero-size and off-screen elements.
            if f.width < 1 || f.height < 1 { continue }
            if f.maxY < 0 || f.minY > viewport.height { continue }

            var entry: [String: Any] = [
                "rect": ["x": Int(f.minX), "y": Int(f.minY), "w": Int(f.width), "h": Int(f.height)],
                "role": role(for: el.elementType)
            ]
            let label = el.label.trimmingCharacters(in: .whitespacesAndNewlines)
            if !label.isEmpty { entry["label"] = label }
            elements.append(entry)
        }

        let payload: [String: Any] = [
            "viewport": ["w": Int(viewport.width), "h": Int(viewport.height)],
            "elements": elements
        ]

        let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])

        // Attach to the test result so it's retrievable from xcresult bundles.
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "raven-snapshot.json"
        attachment.lifetime = .keepAlways
        add(attachment)

        // Also write to disk for the ios-audit CLI to pick up directly.
        let outPath = ProcessInfo.processInfo.environment["RAVEN_SNAPSHOT_OUT"]
            ?? (NSTemporaryDirectory() as NSString).appendingPathComponent("raven-snapshot.json")
        try data.write(to: URL(fileURLWithPath: outPath))
        print("RAVEN_SNAPSHOT → \(outPath)  (\(elements.count) elements)")
    }

    /// Map XCUIElement.ElementType to the role strings audit_ios_screen knows.
    /// Interactive roles (button/link/cell/tab/…) trigger the 44×44pt check.
    private func role(for type: XCUIElement.ElementType) -> String {
        switch type {
        case .button, .toolbarButton: return "button"
        case .link: return "link"
        case .cell, .collectionView: return "cell"
        case .tabBar: return "tabbar"
        case .menuItem: return "menuitem"
        case .switch: return "switch"
        case .slider: return "slider"
        case .stepper: return "stepper"
        case .segmentedControl: return "segmentedcontrol"
        case .textField, .secureTextField: return "textfield"
        case .searchField: return "searchfield"
        case .staticText: return "staticText"
        case .image, .icon: return "image"
        default: return "other"
        }
    }
}
