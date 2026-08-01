#!/usr/bin/env python3
"""Check application-owned imports, required files, and native API wiring."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADING = "IMPORT/FILE GRAPH CHECK FAILED"
EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".json")
failures: list[str] = []


def read_required(path: Path) -> str:
    relative = path.relative_to(ROOT)
    if not path.is_file():
        failures.append(f"Missing required file: {relative}")
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        failures.append(f"Could not read {relative}: {error}")
        return ""


def source_files() -> list[Path]:
    roots = (ROOT / "App.tsx", ROOT / "index.ts", ROOT / "src", ROOT / "modules/life-vault-native/src")
    files: list[Path] = []
    for root in roots:
        if root.is_file():
            files.append(root)
        elif root.is_dir():
            files.extend(path for path in root.rglob("*") if path.is_file() and path.suffix in EXTENSIONS)
        else:
            failures.append(f"Missing application source root: {root.relative_to(ROOT)}")
    return sorted(set(files))


def resolves(base: Path, target: str) -> bool:
    candidate = (base / target).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError:
        return False
    if candidate.is_file():
        return True
    for extension in EXTENSIONS:
        if candidate.with_suffix(extension).is_file():
            return True
    return candidate.is_dir() and any((candidate / f"index{extension}").is_file() for extension in EXTENSIONS)


def check() -> None:
    patterns = (
        re.compile(r"(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"](\.[^'\"]+)['\"]"),
        re.compile(r"require\(['\"](\.[^'\"]+)['\"]\)"),
    )
    for file in source_files():
        text = read_required(file)
        for pattern in patterns:
            for target in pattern.findall(text):
                if not resolves(file.parent, target):
                    failures.append(f"{file.relative_to(ROOT)} -> unresolved import {target}")

    required = (
        ROOT / "App.tsx",
        ROOT / "index.ts",
        ROOT / "src/context/VaultContext.tsx",
        ROOT / "src/navigation/AppNavigator.tsx",
        ROOT / "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative/LifeVaultNativeModule.kt",
        ROOT / "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative/VaultRuntime.kt",
        ROOT / "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative/storage/VaultRepository.kt",
        ROOT / "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative/storage/VaultDatabase.kt",
        ROOT / "assets/icon.png",
    )
    for path in required:
        if not path.is_file():
            failures.append(f"Missing required file: {path.relative_to(ROOT)}")

    base = ROOT / "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative"
    module_path = base / "LifeVaultNativeModule.kt"
    runtime_path = base / "VaultRuntime.kt"
    repository_path = base / "storage/VaultRepository.kt"
    contract_path = ROOT / "modules/life-vault-native/src/LifeVaultNativeModule.ts"
    manager_path = ROOT / "src/vault/vaultManager.ts"
    if all(path.is_file() for path in (module_path, runtime_path, repository_path, contract_path, manager_path)):
        module = read_required(module_path)
        runtime = read_required(runtime_path)
        repository = read_required(repository_path)
        contract = read_required(contract_path)
        manager = read_required(manager_path)

        contract_names = set(re.findall(r"^\s{2}([A-Za-z_][A-Za-z0-9_]*)\([^)]*\):\s*Promise<", contract, re.MULTILINE))
        kotlin_names = set(re.findall(r'AsyncFunction\("([A-Za-z_][A-Za-z0-9_]*)"\)', module))
        manager_calls = set(re.findall(r"LifeVaultNative\.([A-Za-z_][A-Za-z0-9_]*)\s*\(", manager))
        if contract_names != kotlin_names:
            failures.append(
                "Native contract mismatch: "
                f"TypeScript-only={sorted(contract_names-kotlin_names)}, Kotlin-only={sorted(kotlin_names-contract_names)}"
            )
        unknown_manager_calls = manager_calls - contract_names
        if unknown_manager_calls:
            failures.append(f"vaultManager calls undefined native methods: {sorted(unknown_manager_calls)}")

        runtime_defined = set(re.findall(
            r"^\s*(?:(?:private|internal|public|override|suspend|inline)\s+)*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
            runtime,
            re.MULTILINE,
        ))
        runtime_defined.update(re.findall(
            r"^\s*(?:(?:private|internal|public|lateinit|const)\s+)*(?:val|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b",
            runtime,
            re.MULTILINE,
        ))
        runtime_used = set(re.findall(r"VaultRuntime\.([A-Za-z_][A-Za-z0-9_]*)", module))
        undefined_runtime = runtime_used - runtime_defined
        if undefined_runtime:
            failures.append(f"LifeVaultNativeModule uses undefined VaultRuntime members: {sorted(undefined_runtime)}")

        repository_defined = set(re.findall(
            r"^\s*(?:(?:private|internal|public|override|suspend|inline)\s+)*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
            repository,
            re.MULTILINE,
        ))
        repository_used = set(re.findall(r"VaultRuntime\.repo\(\)\.([A-Za-z_][A-Za-z0-9_]*)", module))
        undefined_repository = repository_used - repository_defined
        if undefined_repository:
            failures.append(f"LifeVaultNativeModule uses undefined VaultRepository methods: {sorted(undefined_repository)}")


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
    print("Import, required-file and native API graph checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
