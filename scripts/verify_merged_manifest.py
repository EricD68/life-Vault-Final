#!/usr/bin/env python3
"""Verify security-critical properties in the final release APK manifest.

The input is the XML emitted by ``apkanalyzer manifest print`` for the signed
APK. Every failure is reported in a controlled form; malformed or unexpected
input must never produce a traceback in CI.
"""
from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HEADING = "FINAL APK MANIFEST CHECK FAILED"
ANDROID_NS = "http://schemas.android.com/apk/res/android"
ATTR = lambda name: f"{{{ANDROID_NS}}}{name}"
EXPECTED_PERMISSIONS = {
    "android.permission.HIDE_OVERLAY_WINDOWS",
    "android.permission.USE_BIOMETRIC",
    "android.permission.USE_FINGERPRINT",
}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_sdk(value: str | None, label: str, errors: list[str]) -> int | None:
    if value is None:
        errors.append(f"android:{label} is missing")
        return None
    try:
        return int(value, 0)
    except ValueError:
        errors.append(f"android:{label} is not numeric: {value!r}")
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", help="Path to XML printed from the final signed APK")
    parser.add_argument("--package", default="com.lifevault.mobile.test")
    parser.add_argument("--min-sdk", type=int, default=28)
    parser.add_argument("--target-sdk", type=int, default=36)
    args = parser.parse_args()
    path = Path(args.manifest)
    errors: list[str] = []

    try:
        if not path.is_file():
            errors.append(f"Final APK manifest is missing: {path}")
        else:
            root = ET.parse(path).getroot()
            if local_name(root.tag) != "manifest":
                errors.append(f"Unexpected root element: {root.tag!r}")
            if root.attrib.get("package") != args.package:
                errors.append(f"Unexpected package id: {root.attrib.get('package')!r}")

            uses_sdk = next((child for child in root if local_name(child.tag) == "uses-sdk"), None)
            if uses_sdk is None:
                errors.append("Final APK manifest has no uses-sdk element")
            else:
                min_sdk = parse_sdk(uses_sdk.attrib.get(ATTR("minSdkVersion")), "minSdkVersion", errors)
                target_sdk = parse_sdk(uses_sdk.attrib.get(ATTR("targetSdkVersion")), "targetSdkVersion", errors)
                if min_sdk is not None and min_sdk != args.min_sdk:
                    errors.append(f"android:minSdkVersion: expected {args.min_sdk}, found {min_sdk}")
                if target_sdk is not None and target_sdk != args.target_sdk:
                    errors.append(f"android:targetSdkVersion: expected {args.target_sdk}, found {target_sdk}")

            permissions = {
                child.attrib.get(ATTR("name"))
                for child in root
                if local_name(child.tag).startswith("uses-permission")
                and child.attrib.get(ATTR("name"))
            }
            unexpected_permissions = sorted(permissions - EXPECTED_PERMISSIONS)
            missing_permissions = sorted(EXPECTED_PERMISSIONS - permissions)
            if unexpected_permissions:
                errors.append(f"Unexpected requested permissions remain: {unexpected_permissions}")
            if missing_permissions:
                errors.append(f"Required permissions are missing: {missing_permissions}")

            application = next((child for child in root if local_name(child.tag) == "application"), None)
            if application is None:
                errors.append("Final APK manifest has no application element")
            else:
                expected = {
                    "allowBackup": "false",
                    "fullBackupContent": "false",
                    "usesCleartextTraffic": "false",
                }
                for name, expected_value in expected.items():
                    actual = application.attrib.get(ATTR(name))
                    if actual != expected_value:
                        errors.append(f"android:{name}: expected {expected_value!r}, found {actual!r}")
                data_rules = application.attrib.get(ATTR("dataExtractionRules"))
                if not data_rules:
                    errors.append("android:dataExtractionRules is missing")
                if application.attrib.get(ATTR("debuggable")) == "true":
                    errors.append("Release application is debuggable")
                if application.attrib.get(ATTR("testOnly")) == "true":
                    errors.append("Release application is marked testOnly")
    except (ET.ParseError, OSError) as error:
        errors.append(f"Could not parse final APK manifest: {error}")
    except Exception as error:
        errors.append(f"Checker could not complete: {type(error).__name__}: {error}")

    if errors:
        print(HEADING)
        for error in errors:
            print(f"- {error}")
        return 1
    print("Final APK manifest security checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
