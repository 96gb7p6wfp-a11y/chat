#!/usr/bin/env python3
"""Validate native project inputs without pretending to compile an iOS app."""

from __future__ import annotations

import fnmatch
import json
import plistlib
import re
import struct
import sys
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GROUP = "group.com.northstar.planner"
EXPECTED = {
    "Northstar": ("application", "com.northstar.planner", None, None),
    "MonitorExtension": (
        "app-extension", "com.northstar.planner.monitor",
        "com.apple.deviceactivity.monitor-extension", "NorthstarDeviceActivityMonitor",
    ),
    "ShieldConfigurationExtension": (
        "app-extension", "com.northstar.planner.shieldconfiguration",
        "com.apple.ManagedSettingsUI.shield-configuration-service", "NorthstarShieldConfiguration",
    ),
    "ShieldActionExtension": (
        "app-extension", "com.northstar.planner.shieldaction",
        "com.apple.ManagedSettings.shield-action-service", "NorthstarShieldAction",
    ),
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def local_path(value: str) -> Path:
    path = (ROOT / value).resolve()
    require(path.is_relative_to(ROOT), f"Path escapes native folder: {value}")
    require(path.exists(), f"Missing project input: {value}")
    return path


def swift_sources(target: dict) -> list[Path]:
    roots = []
    files = []
    for entry in target.get("sources", []):
        entry = {"path": entry} if isinstance(entry, str) else entry
        path = local_path(entry["path"])
        for previous in roots:
            require(not path.is_relative_to(previous) and not previous.is_relative_to(path),
                    f"Overlapping source roots in one target: {previous} and {path}")
        roots.append(path)
        candidates = path.rglob("*.swift") if path.is_dir() else [path]
        for source in candidates:
            relative = str(source.relative_to(path)) if path.is_dir() else source.name
            if not any(fnmatch.fnmatch(relative, pattern) for pattern in entry.get("excludes", [])):
                if source.suffix == ".swift":
                    files.append(source)
    require(len(files) == len(set(files)), "A Swift source is included twice in one target")
    require(bool(files), "Target has no Swift source files")
    return files


def validate_png(path: Path, width: int, height: int, opaque: bool) -> None:
    data = path.read_bytes()
    require(data[:8] == b"\x89PNG\r\n\x1a\n", f"Invalid PNG signature: {path.name}")
    offset = 8
    found_header = False
    found_end = False
    while offset + 12 <= len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        chunk_type = data[offset + 4:offset + 8]
        content = data[offset + 8:offset + 8 + length]
        require(offset + 12 + length <= len(data), f"Truncated PNG: {path.name}")
        checksum = struct.unpack_from(">I", data, offset + 8 + length)[0]
        require(zlib.crc32(chunk_type + content) & 0xFFFFFFFF == checksum,
                f"Invalid PNG checksum: {path.name}")
        if chunk_type == b"IHDR":
            png_width, png_height, _, color_type, _, _, _ = struct.unpack(">IIBBBBB", content)
            require((png_width, png_height) == (width, height), f"Wrong icon size: {path.name}")
            require(not opaque or color_type not in (4, 6), "App icon must not have an alpha channel")
            found_header = True
        require(not opaque or chunk_type != b"tRNS", "App icon must not contain transparency")
        if chunk_type == b"IEND":
            found_end = True
            break
        offset += length + 12
    require(found_header and found_end, f"Incomplete PNG: {path.name}")


def main() -> None:
    # JSON is a YAML subset; using it here keeps validation dependency-free.
    project = json.loads((ROOT / "project.yml").read_text())
    targets = project["targets"]
    require(set(targets) == set(EXPECTED) | {"NorthstarTests"}, "Unexpected target list")
    require(project["settings"]["base"]["SWIFT_VERSION"] == "5.0", "Use valid Swift 5 language mode")
    require(project["options"]["deploymentTarget"]["iOS"] == "17.0", "Expected iOS 17 deployment")
    all_sources = {}
    bundle_ids = []
    for name, (kind, bundle_id, extension_point, principal) in EXPECTED.items():
        target = targets[name]
        require(target["type"] == kind and target["platform"] == "iOS", f"Wrong type for {name}")
        settings = target["settings"]["base"]
        require(settings["PRODUCT_BUNDLE_IDENTIFIER"] == bundle_id, f"Wrong bundle ID for {name}")
        bundle_ids.append(bundle_id)
        plist = plistlib.loads(local_path(settings["INFOPLIST_FILE"]).read_bytes())
        require(plist["CFBundleIdentifier"] == "$(PRODUCT_BUNDLE_IDENTIFIER)", f"Non-build bundle ID in {name}")
        require(plist["CFBundleExecutable"] == "$(EXECUTABLE_NAME)", f"Missing executable in {name}")
        entitlements = plistlib.loads(local_path(settings["CODE_SIGN_ENTITLEMENTS"]).read_bytes())
        require(entitlements.get("com.apple.security.application-groups") == [GROUP], f"Wrong App Group in {name}")
        require(entitlements.get("com.apple.developer.family-controls") is True, f"Family Controls missing in {name}")
        sources = swift_sources(target)
        all_sources[name] = sources
        require(ROOT / "Shared/ScreenTimeShared.swift" in sources, f"Shared Screen Time source missing in {name}")
        if extension_point:
            extension = plist.get("NSExtension", {})
            require(extension.get("NSExtensionPointIdentifier") == extension_point, f"Wrong extension point in {name}")
            require(extension.get("NSExtensionPrincipalClass") == f"$(PRODUCT_MODULE_NAME).{principal}", f"Wrong principal class in {name}")
            source_text = "\n".join(source.read_text() for source in sources)
            require(bool(re.search(r"\bclass\s+" + re.escape(principal) + r"\b", source_text)), f"Principal class source missing: {principal}")
            require(settings.get("APPLICATION_EXTENSION_API_ONLY") == "YES", f"Extension-only APIs not configured in {name}")
        else:
            require(plist.get("LSRequiresIPhoneOS") is True, "Host must be an iOS app")
    require(len(bundle_ids) == len(set(bundle_ids)), "Duplicate signed bundle IDs")
    host_sources = all_sources["Northstar"]
    for filename in ("NorthstarApp.swift", "Views.swift", "Models.swift", "PlannerStore.swift", "ScreenTimeController.swift"):
        require(any(source.name == filename for source in host_sources), f"Missing host source: {filename}")
    require(any(re.search(r"@main\s+(?:@\w+\s+)?struct\s+NorthstarApp\b", source.read_text()) for source in host_sources),
            "SwiftUI host entry point is missing")
    require(GROUP in (ROOT / "Shared/ScreenTimeShared.swift").read_text(), "Shared source and App Group entitlements differ")
    embedded = {dep["target"] for dep in targets["Northstar"]["dependencies"] if dep.get("embed") is True}
    require(embedded == set(EXPECTED) - {"Northstar"}, "Host must embed every extension")
    tests = targets["NorthstarTests"]
    require(tests["type"] == "bundle.unit-test", "Expected XCTest bundle target")
    test_sources = swift_sources(tests)
    require(any(source.name == "PlannerTests.swift" for source in test_sources), "PlannerTests.swift missing")
    require(any("@testable import Northstar" in source.read_text() for source in test_sources), "Tests must import Northstar")
    scheme = project["schemes"]["Northstar"]
    require(set(scheme["build"]["targets"]) == set(targets), "Scheme must build all native targets")
    require(any(entry["name"] == "NorthstarTests" for entry in scheme["test"]["targets"]), "Scheme must run planner tests")
    catalog = ROOT / "Northstar/Assets.xcassets"
    for contents_path in catalog.rglob("Contents.json"):
        contents = json.loads(contents_path.read_text())
        require(contents["info"]["version"] == 1, f"Invalid asset metadata: {contents_path}")
        for image in contents.get("images", []):
            filename = image.get("filename")
            if filename:
                image_path = contents_path.parent / filename
                require(image_path.is_file(), f"Missing asset image: {filename}")
                if contents_path.parent.name == "AppIcon.appiconset":
                    require(image["size"] == "1024x1024", "Expected universal 1024 px iOS icon")
                    validate_png(image_path, 1024, 1024, opaque=True)
    icon_contents = json.loads((catalog / "AppIcon.appiconset/Contents.json").read_text())
    require(bool(icon_contents.get("images")), "App icon image list is empty")
    print("Native source configuration passed: 5 targets, plists, entitlements, source layout, scheme, and opaque 1024 px icon.")
    print("Not compiled: Xcode generation, iOS build, XCTest, signing, and physical-device Screen Time checks require a Mac.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, struct.error, plistlib.InvalidFileException) as error:
        print(f"Native source configuration failed: {error}", file=sys.stderr)
        sys.exit(1)
