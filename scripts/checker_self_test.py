#!/usr/bin/env python3
"""Exercise repository checkers against passing and deliberately broken fixtures."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKERS = (
    "dependency_static_check.py",
    "security_static_check.py",
    "structure_static_check.py",
    "import_graph_check.py",
)


def copy_repository(destination: Path) -> None:
    ignored = shutil.ignore_patterns(
        ".git", "node_modules", "build-artifacts", "__pycache__", "*.pyc"
    )
    shutil.copytree(ROOT, destination, ignore=ignored)


def run_checker(repository: Path, checker: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(repository / "scripts" / checker)],
        cwd=repository,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )


def assert_clean_output(result: subprocess.CompletedProcess[str], scenario: str) -> None:
    if "Traceback (most recent call last)" in result.stdout:
        raise AssertionError(f"{scenario}: checker emitted a traceback\n{result.stdout}")


def assert_pass(repository: Path, checker: str, scenario: str) -> None:
    result = run_checker(repository, checker)
    assert_clean_output(result, scenario)
    if result.returncode != 0:
        raise AssertionError(f"{scenario}: expected {checker} to pass\n{result.stdout}")


def assert_fail(repository: Path, checker: str, heading: str, scenario: str) -> None:
    result = run_checker(repository, checker)
    assert_clean_output(result, scenario)
    if result.returncode == 0:
        raise AssertionError(f"{scenario}: expected {checker} to fail")
    if heading not in result.stdout:
        raise AssertionError(f"{scenario}: missing controlled failure heading\n{result.stdout}")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="life-vault-checkers-") as temp:
        temp_root = Path(temp)

        baseline = temp_root / "baseline"
        copy_repository(baseline)
        for checker in CHECKERS:
            assert_pass(baseline, checker, "baseline")

        # Packaging hygiene must not be a security-check runtime dependency.
        no_gitignore = temp_root / "no-gitignore"
        copy_repository(no_gitignore)
        gitignore = no_gitignore / ".gitignore"
        if gitignore.exists():
            gitignore.unlink()
        assert_pass(no_gitignore, "security_static_check.py", "missing optional .gitignore")

        # Third-party/generated content must never create false positives.
        external_tokens = temp_root / "external-tokens"
        copy_repository(external_tokens)
        (external_tokens / "node_modules/fake").mkdir(parents=True)
        (external_tokens / "node_modules/fake/index.js").write_text(
            "expo-secure-store expo-local-authentication expo-sharing expo-clipboard selectable\n",
            encoding="utf-8",
        )
        (external_tokens / "package-lock.json").write_text(
            '{"name":"fixture","text":"@react-native-async-storage/async-storage expo-clipboard"}\n',
            encoding="utf-8",
        )
        (external_tokens / "android/app/src/main").mkdir(parents=True)
        (external_tokens / "android/app/src/main/generated.txt").write_text(
            "expo-secure-store selectable\n", encoding="utf-8"
        )
        assert_pass(external_tokens, "security_static_check.py", "third-party/generated forbidden-token noise")

        # The same token in application-owned source must remain blocking.
        owned_forbidden = temp_root / "owned-forbidden"
        copy_repository(owned_forbidden)
        (owned_forbidden / "src/forbiddenFixture.ts").write_text(
            "import * as Clipboard from 'expo-clipboard';\n", encoding="utf-8"
        )
        assert_fail(
            owned_forbidden,
            "security_static_check.py",
            "SECURITY STATIC CHECK FAILED",
            "forbidden application-owned import",
        )

        missing_package = temp_root / "missing-package"
        copy_repository(missing_package)
        (missing_package / "package.json").unlink()
        assert_fail(missing_package, "dependency_static_check.py", "DEPENDENCY/BUILD STATIC CHECK FAILED", "missing package.json")
        assert_fail(missing_package, "security_static_check.py", "SECURITY STATIC CHECK FAILED", "missing package.json")

        forbidden_dependency = temp_root / "forbidden-dependency"
        copy_repository(forbidden_dependency)
        package_path = forbidden_dependency / "package.json"
        package = json.loads(package_path.read_text(encoding="utf-8"))
        package["dependencies"]["expo-secure-store"] = "1.0.0"
        package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
        assert_fail(forbidden_dependency, "dependency_static_check.py", "DEPENDENCY/BUILD STATIC CHECK FAILED", "unexpected dependency")
        assert_fail(forbidden_dependency, "security_static_check.py", "SECURITY STATIC CHECK FAILED", "forbidden dependency")

        missing_native_file = temp_root / "missing-native-file"
        copy_repository(missing_native_file)
        target = missing_native_file / "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative/VaultRuntime.kt"
        target.unlink()
        assert_fail(missing_native_file, "security_static_check.py", "SECURITY STATIC CHECK FAILED", "missing native file")
        assert_fail(missing_native_file, "import_graph_check.py", "IMPORT/FILE GRAPH CHECK FAILED", "missing native file")

        malformed_json = temp_root / "malformed-json"
        copy_repository(malformed_json)
        (malformed_json / "app.json").write_text("{ invalid json\n", encoding="utf-8")
        assert_fail(malformed_json, "dependency_static_check.py", "DEPENDENCY/BUILD STATIC CHECK FAILED", "malformed app.json")
        assert_fail(malformed_json, "security_static_check.py", "SECURITY STATIC CHECK FAILED", "malformed app.json")

        missing_permission_block = temp_root / "missing-permission-block"
        copy_repository(missing_permission_block)
        app_path = missing_permission_block / "app.json"
        app = json.loads(app_path.read_text(encoding="utf-8"))
        app["expo"]["android"]["blockedPermissions"].remove("android.permission.SYSTEM_ALERT_WINDOW")
        app_path.write_text(json.dumps(app, indent=2) + "\n", encoding="utf-8")
        assert_fail(
            missing_permission_block,
            "security_static_check.py",
            "SECURITY STATIC CHECK FAILED",
            "missing required blocked permission",
        )

        broken_structure = temp_root / "broken-structure"
        copy_repository(broken_structure)
        db_path = broken_structure / "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative/storage/VaultDatabase.kt"
        db_path.write_text("package broken\n", encoding="utf-8")
        assert_fail(broken_structure, "structure_static_check.py", "STRUCTURE STATIC CHECK FAILED", "broken graph schema")

    print("Static-checker self-tests passed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("STATIC-CHECKER SELF-TEST FAILED")
        print(f"- {type(error).__name__}: {error}")
        sys.exit(1)
