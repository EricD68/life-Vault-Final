# Life Vault handoff status — 1 August 2026

## Package identity

Application source version: **2.1.8**.

This package was repaired from the exact `Lifevault-main.zip` taken from the present repository. It replaces the previous 2.1.7 repository contents and all individual patch files.

## Last real GitHub result before this repair

The workflow reached Gradle and failed because two generated Gradle properties had been concatenated into one value. Earlier runs had also been blocked by defective custom checkers rather than genuine application security failures.

Version 2.1.8 replaces those tools as one consistent snapshot. The checkers now report controlled failures, inspect only application-owned inputs and test themselves against the exact false-positive cases previously encountered. The Android backup exclusions now cover both credential-encrypted and device-protected storage, and the signing certificate is checked by its binary SHA-256 digest rather than locale-dependent `keytool` output.



## Runtime HMAC correction after the first green APK build

The first APK that completed CI reached the real-device preflight and failed with `NoSuchAlgorithmException: HmacSHA256 for provider AndroidKeyStore`. The defect was in `KeystoreManager.hmac`: it incorrectly requested `AndroidKeyStore` as the JCA `Mac` implementation provider. AndroidKeyStore stores and authorises the non-exportable HMAC key; the `Mac` implementation must be selected with provider-neutral `Mac.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256)` and then initialised with that key.

The retry HMAC key is now generated for `PURPOSE_SIGN` only, matching its actual use. The blocking security checker and its negative fixtures now reject any reintroduction of a provider-forced AndroidKeyStore HMAC call. The corrected source still requires a new green CI build and a new phone preflight before setup.

## Status of this exact source

- Included repository checks and their negative fixtures: passed.
- Workflow/configuration syntax and build-script fixtures: passed.
- Full main-source Kotlin isolated compiler check: passed.
- Core executable crypto/BIP39/PIN/graph checks: passed.
- Real Expo prebuild/Gradle/APK build: **not completed in this environment**.
- Phone testing: **not completed for version 2.1.8**.

This is a repaired build candidate, not a verified secure release.

## Architecture boundary

- React Native owns the shared interface, navigation and record editing.
- Kotlin owns Android PIN/recovery entry, root and database keys, Android Keystore, SQLCipher, biometrics, retry protection, backup/restore and lock state.
- React Native must never receive the Life Vault PIN, recovery-derived key, vault root key or SQLCipher key.
- Future iOS support must use the same React Native interface with a Swift native security module.

## Required next action

Upload the **contents** of this package over the current repository root and run **Actions → Android security core**. Do not create another repository and do not apply any earlier standalone patch.

Use only dummy data until the workflow and all setup, unlock, recovery, backup and restore phone tests pass.
