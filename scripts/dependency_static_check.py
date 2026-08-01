#!/usr/bin/env python3
"""Validate the committed dependency, version, and build-input contract.

The checker is deliberately independent of GitHub Actions command formatting. It
parses repository files and always reports controlled failures instead of a Python
traceback when a file is missing or malformed.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
HEADING = "DEPENDENCY/BUILD STATIC CHECK FAILED"
EXPECTED_VERSION = "2.1.8"
EXPECTED_VERSION_CODE = 8
failures: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def read_required(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        failures.append(f"Missing required file: {relative}")
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        failures.append(f"Could not read {relative}: {error}")
        return ""


def load_required_json(relative: str) -> dict[str, Any]:
    text = read_required(relative)
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        failures.append(f"Invalid JSON in {relative}: line {error.lineno}, column {error.colno}")
        return {}
    if not isinstance(value, dict):
        failures.append(f"JSON root must be an object: {relative}")
        return {}
    return value


def check() -> None:
    package = load_required_json("package.json")
    package_dependencies = package.get("dependencies", {})
    package_dev_dependencies = package.get("devDependencies", {})
    dependencies = package_dependencies if isinstance(package_dependencies, dict) else {}
    dev_dependencies = package_dev_dependencies if isinstance(package_dev_dependencies, dict) else {}
    require(isinstance(package_dependencies, dict), "package.json dependencies must be an object")
    require(isinstance(package_dev_dependencies, dict), "package.json devDependencies must be an object")

    expected_dependencies = {
        "@react-navigation/native": "7.3.5",
        "@react-navigation/native-stack": "7.17.7",
        "expo": "57.0.9",
        "expo-document-picker": "57.0.1",
        "expo-status-bar": "57.0.1",
        "react": "19.2.3",
        "react-native": "0.86.2",
        "react-native-gesture-handler": "2.32.0",
        "react-native-get-random-values": "1.11.0",
        "react-native-safe-area-context": "5.7.0",
        "react-native-screens": "4.26.0",
        "uuid": "14.0.1",
    }
    expected_dev_dependencies = {
        "@types/react": "19.2.4",
        "typescript": "6.0.3",
    }

    for name, version in expected_dependencies.items():
        require(
            dependencies.get(name) == version,
            f"Dependency mismatch: {name}={dependencies.get(name)!r}, expected {version!r}",
        )
    for name, version in expected_dev_dependencies.items():
        require(
            dev_dependencies.get(name) == version,
            f"Dev dependency mismatch: {name}={dev_dependencies.get(name)!r}, expected {version!r}",
        )
    require(
        set(dependencies) == set(expected_dependencies),
        f"Unexpected or missing direct dependencies: {sorted(set(dependencies) ^ set(expected_dependencies))}",
    )
    require(
        set(dev_dependencies) == set(expected_dev_dependencies),
        f"Unexpected or missing dev dependencies: {sorted(set(dev_dependencies) ^ set(expected_dev_dependencies))}",
    )

    for group_name, group in (("dependency", dependencies), ("dev dependency", dev_dependencies)):
        for name, version in group.items():
            require(
                isinstance(version, str) and bool(re.fullmatch(r"\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?", version)),
                f"{group_name.capitalize()} is not pinned to an exact version: {name}={version!r}",
            )

    app_json = load_required_json("app.json")
    expo_value = app_json.get("expo", {})
    expo = expo_value if isinstance(expo_value, dict) else {}
    android_value = expo.get("android", {})
    android = android_value if isinstance(android_value, dict) else {}
    require(isinstance(expo_value, dict), "app.json expo must be an object")
    require(isinstance(android_value, dict), "app.json expo.android must be an object")
    require(package.get("version") == EXPECTED_VERSION, f"package.json version is not {EXPECTED_VERSION}")
    require(expo.get("version") == EXPECTED_VERSION, f"app.json version is not {EXPECTED_VERSION}")
    require(package.get("version") == expo.get("version"), "package.json and app.json versions differ")
    require(android.get("versionCode") == EXPECTED_VERSION_CODE, f"Android versionCode is not {EXPECTED_VERSION_CODE}")
    require(android.get("package") == "com.lifevault.mobile", "Unexpected production Android package id")

    plugin = read_required("plugins/withLifeVaultAndroidSecurity.js")
    for key, value in (
        ("android.minSdkVersion", "28"),
        ("android.compileSdkVersion", "36"),
        ("android.targetSdkVersion", "36"),
    ):
        require(
            re.search(rf"setProperty\(\s*['\"]{re.escape(key)}['\"]\s*,\s*['\"]{re.escape(value)}['\"]\s*\)", plugin) is not None,
            f"Config plugin does not set {key}={value}",
        )
    for domain in ("root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"):
        require(
            plugin.count(f'domain="{domain}"') == 2,
            f"Backup and device-transfer exclusions are incomplete for domain: {domain}",
        )

    native_gradle = read_required("modules/life-vault-native/android/build.gradle")
    expected_native_dependencies = (
        "implementation 'org.bouncycastle:bcprov-jdk18on:1.84'",
        "implementation 'net.zetetic:sqlcipher-android:4.17.0@aar'",
        "implementation 'androidx.sqlite:sqlite:2.6.2'",
        "implementation 'androidx.biometric:biometric:1.1.0'",
        "testImplementation 'junit:junit:4.13.2'",
        "testImplementation 'org.json:json:20250517'",
    )
    for declaration in expected_native_dependencies:
        require(declaration in native_gradle, f"Native dependency declaration is missing or changed: {declaration}")

    required_files = (
        ".github/workflows/android-native-build.yml",
        ".github/test-signing/life-vault-test.jks",
        "tsconfig.json",
        "assets/icon.png",
    )
    for relative in required_files:
        require((ROOT / relative).is_file(), f"Missing required build input: {relative}")

    lock_path = ROOT / "package-lock.json"
    if lock_path.exists():
        lock = load_required_json("package-lock.json")
        root_package = lock.get("packages", {}).get("", {}) if isinstance(lock.get("packages"), dict) else {}
        require(lock.get("lockfileVersion") == 3, "package-lock.json must use lockfileVersion 3")
        require(root_package.get("version") == EXPECTED_VERSION, "package-lock.json root version does not match package.json")
        require(root_package.get("dependencies") == expected_dependencies, "package-lock.json root dependencies do not match package.json")
        require(root_package.get("devDependencies") == expected_dev_dependencies, "package-lock.json root devDependencies do not match package.json")


def main() -> int:
    try:
        check()
    except Exception as error:  # Defensive: a checker must never emit an uncontrolled traceback.
        failures.append(f"Checker could not complete: {type(error).__name__}: {error}")
    if failures:
        print(HEADING)
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Dependency and build static checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
