#!/usr/bin/env python3
"""Write a minimal SwiftUI iOS .xcodeproj (no xcodegen required)."""
from __future__ import annotations

import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "sample-swiftui"
PROJ = ROOT / "RavenMobileGrabSample.xcodeproj"
APP_SWIFT = "RavenMobileGrabSampleApp.swift"
CONTENT = "ContentView.swift"


def uid() -> str:
    return uuid.uuid4().hex[:24].upper()


def main() -> None:
    file_app = uid()
    file_content = uid()
    build_app = uid()
    build_content = uid()
    product = uid()
    target = uid()
    project = uid()
    sources = uid()
    frameworks = uid()
    resources = uid()
    src_group = uid()
    products = uid()
    root_group = uid()
    cfg_list_proj = uid()
    cfg_list_tgt = uid()
    dbg_proj = uid()
    rel_proj = uid()
    dbg_tgt = uid()
    rel_tgt = uid()

    text = f"""// !$*UTF8*$!
{{
	archiveVersion = 1;
	classes = {{
	}};
	objectVersion = 56;
	objects = {{

/* Begin PBXBuildFile section */
		{build_app} /* {APP_SWIFT} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_app} /* {APP_SWIFT} */; }};
		{build_content} /* {CONTENT} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_content} /* {CONTENT} */; }};
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		{product} /* RavenMobileGrabSample.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = RavenMobileGrabSample.app; sourceTree = BUILT_PRODUCTS_DIR; }};
		{file_app} /* {APP_SWIFT} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {APP_SWIFT}; sourceTree = "<group>"; }};
		{file_content} /* {CONTENT} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {CONTENT}; sourceTree = "<group>"; }};
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		{frameworks} /* Frameworks */ = {{
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		{root_group} = {{
			isa = PBXGroup;
			children = (
				{src_group} /* RavenMobileGrabSample */,
				{products} /* Products */,
			);
			sourceTree = "<group>";
		}};
		{src_group} /* RavenMobileGrabSample */ = {{
			isa = PBXGroup;
			children = (
				{file_app} /* {APP_SWIFT} */,
				{file_content} /* {CONTENT} */,
			);
			path = RavenMobileGrabSample;
			sourceTree = "<group>";
		}};
		{products} /* Products */ = {{
			isa = PBXGroup;
			children = (
				{product} /* RavenMobileGrabSample.app */,
			);
			name = Products;
			sourceTree = "<group>";
		}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		{target} /* RavenMobileGrabSample */ = {{
			isa = PBXNativeTarget;
			buildConfigurationList = {cfg_list_tgt} /* Build configuration list for PBXNativeTarget "RavenMobileGrabSample" */;
			buildPhases = (
				{sources} /* Sources */,
				{frameworks} /* Frameworks */,
				{resources} /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = RavenMobileGrabSample;
			productName = RavenMobileGrabSample;
			productReference = {product} /* RavenMobileGrabSample.app */;
			productType = "com.apple.product-type.application";
		}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		{project} /* Project object */ = {{
			isa = PBXProject;
			attributes = {{
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1500;
				LastUpgradeCheck = 1500;
			}};
			buildConfigurationList = {cfg_list_proj} /* Build configuration list for PBXProject "RavenMobileGrabSample" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = {root_group};
			productRefGroup = {products} /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				{target} /* RavenMobileGrabSample */,
			);
		}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		{resources} /* Resources */ = {{
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		{sources} /* Sources */ = {{
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				{build_app} /* {APP_SWIFT} in Sources */,
				{build_content} /* {CONTENT} in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		{dbg_proj} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_MODULES = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = dwarf;
				ENABLE_TESTABILITY = YES;
				GCC_DYNAMIC_NO_PIC = NO;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			}};
			name = Debug;
		}};
		{rel_proj} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_MODULES = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				SDKROOT = iphoneos;
				SWIFT_COMPILATION_MODE = wholemodule;
				VALIDATE_PRODUCT = YES;
			}};
			name = Release;
		}};
		{dbg_tgt} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				CODE_SIGNING_ALLOWED = NO;
				CODE_SIGNING_REQUIRED = NO;
				CODE_SIGN_IDENTITY = "";
				CURRENT_PROJECT_VERSION = 1;
				ENABLE_PREVIEWS = YES;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = "Raven Mobile Grab";
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 0.1.0;
				PRODUCT_BUNDLE_IDENTIFIER = ai.ravenmcp.MobileGrabSample;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
				SUPPORTS_MACCATALYST = NO;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = 1;
			}};
			name = Debug;
		}};
		{rel_tgt} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				CODE_SIGNING_ALLOWED = NO;
				CODE_SIGNING_REQUIRED = NO;
				CODE_SIGN_IDENTITY = "";
				CURRENT_PROJECT_VERSION = 1;
				ENABLE_PREVIEWS = YES;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = "Raven Mobile Grab";
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 0.1.0;
				PRODUCT_BUNDLE_IDENTIFIER = ai.ravenmcp.MobileGrabSample;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
				SUPPORTS_MACCATALYST = NO;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = 1;
			}};
			name = Release;
		}};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		{cfg_list_proj} /* Build configuration list for PBXProject "RavenMobileGrabSample" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{dbg_proj} /* Debug */,
				{rel_proj} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
		{cfg_list_tgt} /* Build configuration list for PBXNativeTarget "RavenMobileGrabSample" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{dbg_tgt} /* Debug */,
				{rel_tgt} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
/* End XCConfigurationList section */
	}};
	rootObject = {project} /* Project object */;
}}
"""
    PROJ.mkdir(parents=True, exist_ok=True)
    out = PROJ / "project.pbxproj"
    out.write_text(text)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
