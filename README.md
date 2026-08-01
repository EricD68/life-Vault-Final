# Life Vault — React Native app with native Android security and relational vault storage

This project keeps the cross-platform React Native application and places Android security, encrypted storage, recovery and graph search inside the local Kotlin module at `modules/life-vault-native`.

## Current architecture

### React Native owns

- Replaceable page layouts and visual design
- Navigation and form workflow
- Record templates
- Project/platform/account/resource views
- Relationship editing and masked record display

### Kotlin owns

- Separate Life Vault PIN and app-owned PIN keypad
- Argon2id PIN derivation
- Random 256-bit vault root key
- Hardware-backed Android Keystore wrapping
- Strong biometric cryptographic unlock
- SQLCipher key and database connection
- 24-word recovery phrase and recovery keypad
- Backup, restore and new-phone transfer
- Native lock state and retry controls
- Relational data storage and graph search

React Native never receives the root key, SQLCipher key, Life Vault PIN, biometric key or recovery-derived key.

## Relational organisation

The encrypted database now stores first-class:

- Projects / apps
- Platforms / providers
- Multiple accounts per platform
- Resources / assets
- Credentials
- Identifiers and account numbers
- Renewals
- Real relationships

A project-wide search such as `Guidance` returns the Guidance project and the accounts, resources and parent platforms linked to it. Search also matches aliases, tags, usernames, account/customer/project IDs, websites and non-sensitive fields. Passwords, PINs, API secrets and recovery codes are never searched.

See [DATA_MODEL.md](DATA_MODEL.md) for the full structure and traversal rules.

The present screens are a functional first interface over that model. They are deliberately separated from the native repository so their layout, navigation and visual treatment can be redesigned without replacing the encrypted schema.

## Migration

Existing schema-version-1 flat records are automatically migrated into schema version 2 when the vault is first opened after updating. Existing IDs and values are retained and classified into entities, credentials, identifiers, fields and renewals.

## Backup and transfer

`Create encrypted backup` opens Android's native **Create Document** picker after fresh Life Vault PIN authentication. The destination can be USB storage, local device storage or an installed document provider.

The `.lvault` file contains the encrypted SQLCipher database and recovery-wrapped root key. It does not contain the Life Vault PIN or the 24 recovery words. Because the complete encrypted database is backed up, relationships and project-wide search structure transfer with the records.

On a clean installation, choose **Restore existing vault**, select the `.lvault` file, enter the original 24-word phrase and choose a new separate Life Vault PIN.

## Build through GitHub Actions

1. Upload the **contents of this package** so `package.json` and the `.github` folder are both at the repository root. Do not upload the ZIP itself and do not mix in earlier patch files.
2. Push to the repository's build branch.
3. Open **Actions → Android security core**.
4. Run the workflow if it did not start automatically.
5. Download the `life-vault-android-test-build` artifact.
6. Install `life-vault-android-test.apk` on the spare Android phone.

GitHub installs Node, Java, the Android SDK and dependencies, then runs TypeScript checks, security checks, relational-structure checks, Expo prebuild, Gradle tests/lint and the Android build. No additional local Gradle installation is required.

The workflow also validates the stable test-signing certificate, blocks system backup/device-transfer of every private storage domain, signs the test APK and inspects the signed APK manifest before publishing the artifact.

Version 2.1.8 is the repaired snapshot made from the current repository ZIP. The checks listed in `AUDIT_RESULT.md` passed against the packaged source, but the next GitHub run remains the authoritative real Expo/Gradle/APK gate. It is not yet a verified release.

## Required real-device tests

Do not store genuine credentials until these pass:

1. Create projects, platforms and multiple accounts on the same platform.
2. Link Guidance to its accounts and resources, then verify `Guidance` search returns the correct ecosystem but not unrelated sibling accounts.
3. Search by username, website, account ID and alias.
4. Confirm a password or PIN value does not produce search results.
5. Edit and delete links and verify both related pages update.
6. Create a USB backup, reinstall the app and restore it.
7. Verify all links, accounts, credentials, identifiers and renewals survive restore.
8. Test correct/incorrect PINs, persistent retry delays and immediate background locking.
9. Corrupt a backup copy and confirm restore rejects it.
10. Change enrolled biometrics and confirm the separate Life Vault PIN is required again.

## Main locations

- `modules/life-vault-native/android/src/main/java/.../storage/VaultDatabase.kt` — encrypted relational schema, migration and graph search
- `modules/life-vault-native/android/src/main/java/...` — Kotlin security core
- `modules/life-vault-native/src/LifeVaultNativeModule.ts` — typed native contract
- `src/vault/entityModel.ts` — shared entity/relationship model
- `src/vault/entityFactory.ts` — template-to-relational-record conversion
- `src/vault/vaultManager.ts` — React Native facade
- `src/screens/` — replaceable first-iteration interface
- `scripts/security_static_check.py` — security-boundary assertions
- `scripts/structure_static_check.py` — relational model/search assertions
- `.github/workflows/android-native-build.yml` — compile/test/APK workflow
