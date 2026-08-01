#!/usr/bin/env python3
"""Blocking static checks for Life Vault's security boundaries.

This checker examines only committed, application-owned files. It never scans
node_modules or generated Android output and it always reports controlled failures
rather than Python tracebacks.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
HEADING = "SECURITY STATIC CHECK FAILED"
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


def owned_source_files() -> list[Path]:
    roots = (
        ROOT / "App.tsx",
        ROOT / "index.ts",
        ROOT / "src",
        ROOT / "modules/life-vault-native/src",
        ROOT / "modules/life-vault-native/android/src",
        ROOT / "plugins",
    )
    extensions = {".kt", ".ts", ".tsx", ".xml", ".js", ".gradle"}
    files: list[Path] = []
    for source_root in roots:
        if source_root.is_file():
            files.append(source_root)
        elif source_root.is_dir():
            files.extend(
                path for path in source_root.rglob("*")
                if path.is_file() and path.suffix in extensions
            )
        else:
            failures.append(f"Missing application source root: {source_root.relative_to(ROOT)}")
    return sorted(set(files))


def check() -> None:
    app_json = load_required_json("app.json")
    expo_value = app_json.get("expo", {})
    expo = expo_value if isinstance(expo_value, dict) else {}
    android_value = expo.get("android", {})
    android = android_value if isinstance(android_value, dict) else {}
    require(isinstance(expo_value, dict), "app.json expo must be an object")
    require(isinstance(android_value, dict), "app.json expo.android must be an object")
    blocked = android.get("blockedPermissions", [])
    permissions = android.get("permissions", [])
    require(isinstance(blocked, list), "app.json blockedPermissions must be an array")
    require(isinstance(permissions, list), "app.json permissions must be an array")
    required_blocked_permissions = {
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.MANAGE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.VIBRATE",
    }
    if isinstance(blocked, list):
        missing_blocked = sorted(required_blocked_permissions - set(blocked))
        require(not missing_blocked, f"Required blocked Android permissions are missing: {missing_blocked}")
    require("android.permission.HIDE_OVERLAY_WINDOWS" in permissions, "Overlay-window protection permission is missing")
    require("android.permission.USE_BIOMETRIC" in permissions, "Biometric permission is missing")
    require("android.permission.USE_FINGERPRINT" in permissions, "Android 9 biometric compatibility permission is missing")
    require(
        set(permissions) == {
            "android.permission.HIDE_OVERLAY_WINDOWS",
            "android.permission.USE_BIOMETRIC",
            "android.permission.USE_FINGERPRINT",
        },
        f"Unexpected explicit Android permission surface: {sorted(permissions) if isinstance(permissions, list) else permissions!r}",
    )
    require(android.get("package") == "com.lifevault.mobile", "Unexpected Android package id")
    require(expo.get("newArchEnabled") is True, "React Native New Architecture is not enabled")

    package = load_required_json("package.json")
    for group_name in ("dependencies", "devDependencies"):
        group_value = package.get(group_name, {})
        group = group_value if isinstance(group_value, dict) else {}
        require(isinstance(group_value, dict), f"package.json {group_name} must be an object")
        for name, version in group.items():
            require(
                isinstance(version, str) and bool(re.fullmatch(r"\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?", version)),
                f"Dependency is not pinned exactly: {name}={version!r}",
            )

    forbidden_dependencies = (
        "expo-secure-store",
        "expo-local-authentication",
        "expo-sharing",
        "expo-clipboard",
        "@react-native-async-storage/async-storage",
        "react-native-quick-crypto",
    )
    for dependency in forbidden_dependencies:
        for group_name in ("dependencies", "devDependencies"):
            group = package.get(group_name, {})
            if isinstance(group, dict):
                require(dependency not in group, f"Forbidden direct dependency remains installed: {dependency}")

    source_files = owned_source_files()
    source_text: dict[Path, str] = {}
    for path in source_files:
        try:
            source_text[path] = path.read_text(encoding="utf-8", errors="strict")
        except (OSError, UnicodeError) as error:
            failures.append(f"Could not read source file {path.relative_to(ROOT)}: {error}")
            source_text[path] = ""
    all_source = "\n".join(source_text.values())

    forbidden_tokens = (
        "expo-secure-store",
        "expo-local-authentication",
        "expo-sharing",
        "expo-clipboard",
        "@react-native-async-storage/async-storage",
        "react-native-quick-crypto",
        "getVaultKey(",
        "getDatabaseKey(",
        "setUnlocked(",
        "deleteTemporaryFile",
        "checkpointAndCloseDatabase",
        'execSQL("PRAGMA',
    )
    for token in forbidden_tokens:
        require(token not in all_source, f"Forbidden legacy/security-boundary token remains: {token}")

    for path, text in source_text.items():
        relative = path.relative_to(ROOT)
        if path.suffix == ".tsx":
            require(
                re.search(r"<Text\b[^>]*\bselectable(?:\s*=|\s|>)", text, re.IGNORECASE | re.DOTALL) is None,
                f"Selectable React Native Text remains in {relative}",
            )
        if path.suffix == ".kt":
            require(
                re.search(r"\.setTextIsSelectable\(\s*true\s*\)", text) is None,
                f"Selectable Android text remains in {relative}",
            )

    base = "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative"
    native = read_required(f"{base}/LifeVaultNativeModule.kt")
    keystore = read_required(f"{base}/security/KeystoreManager.kt")
    runtime = read_required(f"{base}/VaultRuntime.kt")
    repository = read_required(f"{base}/storage/VaultRepository.kt")
    retry = read_required(f"{base}/security/RetryGate.kt")
    dialogs = read_required(f"{base}/security/SecureDialogs.kt")
    recovery_check = read_required(f"{base}/security/RecoveryPhraseCheck.kt")
    backup = read_required(f"{base}/backup/BackupFormat.kt")
    session = read_required(f"{base}/session/VaultSession.kt")
    clipboard = read_required(f"{base}/security/SensitiveClipboard.kt")
    database = read_required(f"{base}/storage/VaultDatabase.kt")
    vault_files = read_required(f"{base}/storage/VaultFiles.kt")
    bip39 = read_required(f"{base}/crypto/Bip39Codec.kt")
    index = read_required("index.ts")

    checks = (
        ("FLAG_SECURE" in native, "FLAG_SECURE is missing"),
        ("setHideOverlayWindows(true)" in native, "Overlay protection is missing"),
        ("OnActivityEntersBackground" in native, "Native background lock listener is missing"),
        ("copyBackupWithLimit" in native and "MAX_BACKUP_FILE_BYTES" in native, "Bounded restore-file copying is missing"),
        ("Authorise vault replacement" in native and "verifyPin(currentPin)" in native, "Existing-vault restore is not re-authorised"),
        ("Intent.ACTION_CREATE_DOCUMENT" in native and "BACKUP_DOCUMENT_REQUEST_CODE" in native, "Direct document/USB backup export is missing"),
        ("AUTH_BIOMETRIC_STRONG" in keystore, "Biometric Keystore key is not restricted to strong biometrics"),
        ("setInvalidatedByBiometricEnrollment(true)" in keystore, "Biometric key invalidation is missing"),
        ("setIsStrongBoxBacked(true)" in keystore, "StrongBox preference is missing"),
        (
            re.search(
                r"Mac\.getInstance\(\s*KeyProperties\.KEY_ALGORITHM_HMAC_SHA256\s*\)",
                keystore,
            ) is not None,
            "Android Keystore HMAC does not use provider-neutral Mac selection",
        ),
        (
            re.search(
                r"Mac\.getInstance\(\s*(?:KeyProperties\.KEY_ALGORITHM_HMAC_SHA256|\"HmacSHA256\")\s*,",
                keystore,
            ) is None,
            "AndroidKeyStore is incorrectly forced as the HMAC Mac provider",
        ),
        ('System.loadLibrary("sqlcipher")' in runtime, "SQLCipher native library is not loaded"),
        ("Logger.setTarget(NoopTarget())" in runtime, "SQLCipher Java logging is not disabled"),
        ("prepareNewVault" in repository and "commitNewVault" in repository, "Atomic two-stage setup is missing"),
        ("restoreBackup" in repository and "files.activate(slot)" in repository, "Transactional restore activation is missing"),
        ("AtomicFile" in retry and ".startWrite()" in retry and ".finishWrite(" in retry, "Retry state is not written atomically"),
        ("PinPad" in dialogs and "GridLayout" in dialogs, "App-owned native PIN keypad is missing"),
        ("RecoveryPhrasePad" in dialogs and "bip39_english.txt" in dialogs, "App-owned recovery phrase keypad is missing"),
        ("confirmRecoveryPhraseSample" in dialogs and "RecoveryWordPad" in dialogs, "Sampled setup recovery confirmation is missing"),
        (
            "confirmRecoveryPhraseSample" in native
            and "expectedWords = pending.phrase" in native
            and native.find("confirmRecoveryPhraseSample") < native.find('AsyncFunction("unlockWithPin")'),
            "New-vault setup does not use sampled recovery confirmation",
        ),
        (
            'message = "Enter all 24 words in order. Setup is not committed until this check succeeds."' not in native,
            "New-vault setup still requires all 24 words to be re-entered",
        ),
        (
            "The app will not display answer choices." in dialogs
            and "private class RecoveryWordPad" in dialogs
            and "bip39_english.txt" not in dialogs[
                dialogs.find("private class RecoveryWordPad"):
                dialogs.find("private class RecoveryPhrasePad")
            ],
            "Setup confirmation still exposes recovery-word answer choices",
        ),
        (
            "const val REQUIRED_WORDS = 24" in recovery_check
            and "const val SAMPLE_COUNT = 3" in recovery_check
            and "segment * SEGMENT_SIZE + offset" in recovery_check,
            "Recovery confirmation does not sample three spread positions",
        ),
        (
            "sizeRecoveryDialog(activity, dialog)" in dialogs
            and 'text = "Cancel setup"' in dialogs
            and 'text = "Continue"' in dialogs,
            "Recovery phrase display does not keep fixed setup actions visible",
        ),
        ("TYPE_NUMBER_VARIATION_PASSWORD" not in dialogs and "EditText" not in dialogs, "Security credentials still use the Android software keyboard"),
        ("MAX_BACKUP_FILE_BYTES" in backup, "Backup maximum size is not centralised"),
        ("rawQuery(statement, null)" in database and 'execSQL("PRAGMA' not in database, "SQLCipher PRAGMAs are not executed through rawQuery"),
        ("detachDatabaseForBackup" in session and "replaceDatabase" in session, "Backup database detach/reopen lifecycle is missing"),
        ("copySensitive" in native and "SensitiveClipboard.copy" in native, "Native sensitive clipboard method is missing"),
        ('android.content.extra.IS_SENSITIVE' in clipboard and "clearPrimaryClip()" in clipboard, "Sensitive clipboard flag/expiry is missing"),
        ('MessageDigest.getInstance("SHA-256")' in clipboard, "Clipboard expiry retains plaintext instead of a digest"),
        ("Temporary backup file could not be deleted" in native, "Backup temporary-file cleanup failure is not surfaced"),
        ("Temporary restore file could not be deleted" in native, "Restore temporary-file cleanup failure is not surfaced"),
        ("operationFailure" in repository and "cleanupFailure" in repository and "files.cleanupPreflightFiles()" in repository, "Preflight cleanup does not preserve operation and cleanup failures"),
        ('require(file.isFile) { "Backup file is missing or invalid" }' in backup, "Backup inspection accepts non-files"),
        ('require(file.isFile) { "Encrypted database is missing or invalid" }' in database, "Database opening accepts non-files"),
        ("Retry protection parent is not a directory" in retry, "Retry protection directory is not fully validated"),
        ("session!!" not in repository and "activeDatabase()!!" not in repository, "Unsafe non-null assertions remain in vault transactions"),
        ("MAX_FUTURE_CLOCK_SKEW_MILLIS" in backup and "WRAPPED_ROOT_BYTES" in backup, "Backup manifest validation is incomplete"),
        ("fun encode24" in bip39 and "inputWords.size == 24" in bip39 and "BooleanArray(264)" in bip39, "24-word BIP39 recovery implementation is missing"),
        ("private lateinit var repository" not in runtime, "Runtime initialisation can be permanently poisoned by failed setup"),
        ("initialised.set(true)" in runtime and runtime.find("initialised.set(true)") > runtime.find("candidate.initialise()"), "Runtime is marked initialised before repository setup succeeds"),
        ("repositoryOrNull()?.lock()" in runtime and "finally {" in runtime, "Background locking can be skipped if pending-setup cleanup fails"),
        ("pending.close()" in repository and "firstFailure.addSuppressed(error)" in repository, "Pending setup secrets are not guaranteed to be wiped"),
        ("cleanupExportFile" in native, "Backup-export temporary files are not cleaned consistently"),
        (database.count("searchable = 1 AND sensitive = 0") >= 2, "Sensitive searchable fields are not excluded from graph search"),
        ('row.optBoolean("searchable", true) && !row.optBoolean("sensitive")' in database, "Sensitive attributes/identifiers can still be stored as searchable"),
        ('import \'react-native-get-random-values\';' in index.splitlines()[:3], "UUID random-value polyfill is not loaded at the application entry point"),
        ("FileNotFoundException" in vault_files and "activeFile.openRead()" in vault_files, "Active-slot AtomicFile recovery is not handled"),
        ("AtomicFile(manifestFile(slot))" in vault_files and "input.channel.size()" in vault_files, "Manifest AtomicFile recovery or size validation is missing"),
        ("if (keepActive && active == null) return emptyList()" in vault_files, "Orphan cleanup can delete vault slots when the active marker is missing"),
        ("FileNotFoundException" in retry and "atomic.openRead()" in retry, "Retry-state AtomicFile recovery is not handled"),
    )
    for condition, message in checks:
        require(condition, message)

    plugin = read_required("plugins/withLifeVaultAndroidSecurity.js")
    require("android:allowBackup'] = 'false'" in plugin, "Android backup is not disabled")
    require("android:usesCleartextTraffic'] = 'false'" in plugin, "Cleartext traffic is not disabled")
    require("android.minSdkVersion', '28'" in plugin, "Android 9/API 28 compatibility is not configured")

    ts_contract = read_required("modules/life-vault-native/src/LifeVaultNativeModule.ts")
    ts_names = set(re.findall(r"^\s{2}([A-Za-z][A-Za-z0-9_]*)\([^)]*\): Promise<", ts_contract, re.MULTILINE))
    kotlin_names = set(re.findall(r'AsyncFunction\("([A-Za-z][A-Za-z0-9_]*)"\)', native))
    require(bool(ts_names), "No native methods were found in the TypeScript contract")
    require(bool(kotlin_names), "No AsyncFunction methods were found in the Kotlin module")
    require(
        ts_names == kotlin_names,
        f"Native contract mismatch: TypeScript-only={sorted(ts_names-kotlin_names)}, Kotlin-only={sorted(kotlin_names-ts_names)}",
    )


def main() -> int:
    try:
        check()
    except Exception as error:
        failures.append(f"Checker could not complete: {type(error).__name__}: {error}")
    if failures:
        print(HEADING)
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Security static checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
