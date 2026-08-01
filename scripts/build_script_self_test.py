#!/usr/bin/env python3
"""Exercise generated-Android and final-APK manifest validators with fixtures."""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANDROID_NS = "http://schemas.android.com/apk/res/android"

RULES = """<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup disableIfNoEncryptionCapabilities="true">
    <exclude domain="root" path="." /><exclude domain="file" path="." />
    <exclude domain="database" path="." /><exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
    <exclude domain="device_root" path="." /><exclude domain="device_file" path="." />
    <exclude domain="device_database" path="." /><exclude domain="device_sharedpref" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="." /><exclude domain="file" path="." />
    <exclude domain="database" path="." /><exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
    <exclude domain="device_root" path="." /><exclude domain="device_file" path="." />
    <exclude domain="device_database" path="." /><exclude domain="device_sharedpref" path="." />
  </device-transfer>
</data-extraction-rules>
"""
SOURCE_MANIFEST = f"""<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="{ANDROID_NS}" package="com.lifevault.mobile.test">
  <uses-sdk android:minSdkVersion="28" android:targetSdkVersion="36" />
  <uses-permission android:name="android.permission.HIDE_OVERLAY_WINDOWS" />
  <uses-permission android:name="android.permission.USE_BIOMETRIC" />
  <uses-permission android:name="android.permission.USE_FINGERPRINT" />
  <application android:allowBackup="false" android:fullBackupContent="false"
    android:dataExtractionRules="@xml/life_vault_data_extraction_rules"
    android:usesCleartextTraffic="false" android:debuggable="false" />
</manifest>
"""


def run(arguments: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *arguments],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )


def assert_result(result: subprocess.CompletedProcess[str], should_pass: bool, label: str) -> None:
    if "Traceback (most recent call last)" in result.stdout:
        raise AssertionError(f"{label}: validator emitted a traceback\n{result.stdout}")
    if should_pass and result.returncode != 0:
        raise AssertionError(f"{label}: expected pass\n{result.stdout}")
    if not should_pass and result.returncode == 0:
        raise AssertionError(f"{label}: expected failure")


def create_android_fixture(root: Path) -> tuple[Path, Path, Path]:
    properties = root / "android/gradle.properties"
    rules = root / "android/app/src/main/res/xml/life_vault_data_extraction_rules.xml"
    manifest = root / "android/app/src/main/AndroidManifest.xml"
    properties.parent.mkdir(parents=True, exist_ok=True)
    rules.parent.mkdir(parents=True, exist_ok=True)
    properties.write_text(
        "android.compileSdkVersion=36org.gradle.jvmargs=-Xmx2g\n"
        "android.minSdkVersion=27\nandroid.compileSdkVersion=35\n",
        encoding="utf-8",
    )
    rules.write_text(RULES, encoding="utf-8")
    manifest.write_text(SOURCE_MANIFEST, encoding="utf-8")
    return properties, rules, manifest


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="life-vault-build-scripts-") as temp:
        temp_root = Path(temp)
        fixture = temp_root / "valid"
        properties, _, _ = create_android_fixture(fixture)
        result = run([str(ROOT / "scripts/configure_generated_android.py"), "--project-root", str(fixture)])
        assert_result(result, True, "Gradle-property repair")
        text = properties.read_text(encoding="utf-8")
        required_lines = {
            "android.minSdkVersion=28",
            "android.compileSdkVersion=36",
            "android.targetSdkVersion=36",
            "org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8",
            "reactNativeArchitectures=arm64-v8a",
        }
        if not required_lines.issubset(set(text.splitlines())):
            raise AssertionError(f"Gradle-property repair produced unexpected output:\n{text}")

        broken_rules = temp_root / "broken-rules"
        _, rules_path, _ = create_android_fixture(broken_rules)
        rules_path.write_text("<data-extraction-rules><cloud-backup /></data-extraction-rules>", encoding="utf-8")
        result = run([str(ROOT / "scripts/configure_generated_android.py"), "--project-root", str(broken_rules)])
        assert_result(result, False, "Incomplete extraction rules")

        missing_generated = temp_root / "missing-generated"
        missing_generated.mkdir()
        result = run([str(ROOT / "scripts/configure_generated_android.py"), "--project-root", str(missing_generated)])
        assert_result(result, False, "Missing generated Android files")

        final_manifest = temp_root / "final-manifest.xml"
        final_manifest.write_text(SOURCE_MANIFEST, encoding="utf-8")
        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(final_manifest)])
        assert_result(result, True, "Valid final APK manifest")

        hexadecimal_manifest = SOURCE_MANIFEST.replace(
            'android:minSdkVersion="28"', 'android:minSdkVersion="0x1c"'
        ).replace('android:targetSdkVersion="36"', 'android:targetSdkVersion="0x24"')
        final_manifest.write_text(hexadecimal_manifest, encoding="utf-8")
        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(final_manifest)])
        assert_result(result, True, "Hexadecimal SDK values")

        future_permission_tag = SOURCE_MANIFEST.replace(
            '<uses-permission android:name="android.permission.HIDE_OVERLAY_WINDOWS" />',
            '<uses-permission-sdk-35 android:name="android.permission.HIDE_OVERLAY_WINDOWS" />',
        )
        final_manifest.write_text(future_permission_tag, encoding="utf-8")
        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(final_manifest)])
        assert_result(result, True, "Permission tag variant")

        final_manifest.write_text(SOURCE_MANIFEST.replace(
            '<uses-permission android:name="android.permission.HIDE_OVERLAY_WINDOWS" />',
            '<uses-permission android:name="android.permission.HIDE_OVERLAY_WINDOWS" />\n'
            '  <uses-permission android:name="android.permission.INTERNET" />',
        ), encoding="utf-8")
        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(final_manifest)])
        assert_result(result, False, "Unexpected final permission")

        final_manifest.write_text(SOURCE_MANIFEST.replace('android:minSdkVersion="28"', 'android:minSdkVersion="27"'), encoding="utf-8")
        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(final_manifest)])
        assert_result(result, False, "Wrong final min SDK")

        final_manifest.write_text(SOURCE_MANIFEST.replace('android:targetSdkVersion="36"', 'android:targetSdkVersion="35"'), encoding="utf-8")
        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(final_manifest)])
        assert_result(result, False, "Wrong final target SDK")

        final_manifest.write_text(SOURCE_MANIFEST.replace('android:debuggable="false"', 'android:debuggable="true"'), encoding="utf-8")
        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(final_manifest)])
        assert_result(result, False, "Debuggable final APK")

        result = run([str(ROOT / "scripts/verify_merged_manifest.py"), str(temp_root / "missing.xml")])
        assert_result(result, False, "Missing final manifest")

    print("Build-script self-tests passed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("BUILD-SCRIPT SELF-TEST FAILED")
        print(f"- {type(error).__name__}: {error}")
        sys.exit(1)
