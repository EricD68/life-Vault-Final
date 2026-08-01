#!/usr/bin/env python3
"""Validate the encrypted relational model, container hierarchy and privacy-preserving graph search."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADING = "STRUCTURE STATIC CHECK FAILED"
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


def function_body(source: str, start_marker: str, next_marker: str) -> str:
    start = source.find(start_marker)
    if start < 0:
        failures.append(f"Missing source section: {start_marker}")
        return ""
    end = source.find(next_marker, start + len(start_marker))
    if end < 0:
        failures.append(f"Missing source section after {start_marker}: {next_marker}")
        return source[start:]
    return source[start:end]


def check() -> None:
    base = "modules/life-vault-native/android/src/main/java/expo/modules/lifevaultnative"
    db = read_required(f"{base}/storage/VaultDatabase.kt")
    module = read_required(f"{base}/LifeVaultNativeModule.kt")
    manager = read_required("src/vault/vaultManager.ts")
    model = read_required("src/vault/entityModel.ts")
    category_model = read_required("src/vault/vaultModel.ts")
    list_screen = read_required("src/screens/VaultListScreen.tsx")
    editor = read_required("src/screens/AddEditItemScreen.tsx")
    detail = read_required("src/screens/ItemDetailScreen.tsx")

    for table in (
        "vault_entities",
        "vault_entity_aliases",
        "vault_entity_tags",
        "vault_entity_attributes",
        "vault_entity_credentials",
        "vault_entity_identifiers",
        "vault_entity_renewals",
        "vault_relationships",
    ):
        require(f"CREATE TABLE IF NOT EXISTS {table}" in db, f"Missing encrypted relational table: {table}")

    for relation in (
        "used_by_project", "account_on_platform", "controls_resource", "paid_from",
        "uses_email", "hosted_on", "domain_points_to", "production_of", "sandbox_of",
    ):
        require(relation in model, f"Missing relationship type: {relation}")

    for method in (
        "listEntitySummaries", "searchEntities", "connectedEntities", "getEntity",
        "saveEntity", "deleteEntity", "listRenewals",
    ):
        require(f'AsyncFunction("{method}")' in module, f"Native module does not expose {method}")
        require(f"{method}(" in manager, f"React Native manager does not expose {method}")

    require("migrateV1ToGraphSchema" in db and "legacyItemToEntity" in db, "Flat-record migration is missing")
    require("scopedDepths" in db, "Scoped ecosystem graph traversal is missing")
    search_body = function_body(db, "fun searchEntitiesJson", "fun connectedEntitiesJson")
    require("Credential secret" not in search_body, "Credential secrets appear in search code")
    require(
        "SELECT entity_id, label, username FROM vault_entity_credentials" in search_body,
        "Search should use credential labels/usernames only",
    )
    require("summary.remove(\"notes\")" in db and "summary.remove(\"loginUrl\")" in db, "List/search summaries expose full-record fields")
    require(db.count("searchable = 1 AND sensitive = 0") >= 2, "Sensitive attributes or identifiers are not excluded from search")

    for category in (
        "projects", "money", "household", "digital", "identity", "health",
        "people", "vehicles", "subscriptions", "business", "custom",
    ):
        require(f"'{category}'" in category_model, f"Missing top-level category: {category}")
    require("normaliseCategory" in category_model, "Legacy categories are not normalised non-destructively")

    for template in (
        "project_container", "household_container", "person_container", "business_container",
        "app_asset", "website_asset", "community_asset", "streaming_subscription",
        "electricity_account", "gas_account", "water_account", "medication_record",
        "vehicle_asset", "business_bank",
    ):
        require(f"'{template}'" in model, f"Missing required entity template: {template}")

    require("What are you adding?" in editor, "Real-world add-category chooser is missing")
    require("templatesForAddGroup" in editor, "Grouped template selection is missing")
    require("Login and access" in editor and "Account identifiers" in editor, "Progressive add/edit sections are missing")
    require("Legacy project web details" in editor, "Legacy project website values are not preserved")
    require("primaryContainerAction" in detail and "group: 'project_assets'" in detail, "Project containers do not provide a direct Add asset flow")
    require("+ Add subscription" in detail and "group: 'subscriptions'" in detail, "Household containers do not provide a direct subscription flow")
    require("+ Add health item" in detail and "group: 'health'" in detail, "Person containers do not provide a direct health flow")
    require('title="Assets"' in detail and 'title="Accounts and services"' in detail, "Container contents are not grouped by level")
    require("Search follows links between containers, assets, providers and accounts" in list_screen, "User-facing graph-search explanation is missing")
    require("flexShrink: 0" in list_screen, "Front-screen chips can shrink and truncate")
    require("normaliseCategory" in list_screen, "Legacy category filtering is not supported")


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
    print("Relational structure and interface checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
