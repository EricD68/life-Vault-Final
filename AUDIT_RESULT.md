# Life Vault repository repair result — version 2.1.8

## Source used

This repair was made from the exact `Lifevault-main.zip` downloaded from the current GitHub repository on 1 August 2026. It does not rely on the earlier 2.1.6 or 2.1.7 working folders.

## Defects corrected in that repository

- Replaced the brittle CI workflow and static checkers that caused false build failures.
- Renamed the root `gitignore` file to `.gitignore`; no build or security checker now depends on that optional packaging file.
- Added checker self-tests covering the actual previous regressions: missing `.gitignore`, forbidden words inside `node_modules`, generated Android files and `package-lock.json`, malformed JSON, missing native files and forbidden imports in application-owned source.
- Replaced unsafe Gradle-property appending with a parser that repairs, rewrites and validates each required property independently.
- Added fixture tests for the exact concatenated `36org.gradle.jvmargs=...` failure.
- Made the workflow inspect the final signed APK manifest rather than an Android Gradle Plugin intermediate path.
- Enforced the final package ID, API 28 minimum, API 36 target, non-debuggable release state, backup/cleartext restrictions and exact requested-permission surface.
- Corrected the non-exhaustive Kotlin `when` expression in relational search.
- Corrected sensitive identifier storage so a sensitive value cannot remain marked searchable.
- Hardened AtomicFile reads and exact-size validation for active-slot, manifest and retry-state files.
- Made database replacement require a properly detached SQLCipher handle.
- Loaded the UUID random-value polyfill at the application entry point.
- Consolidated the native module's Gradle dependency block.
- Removed duplicate test-signing files accidentally stored below `.github/workflows` in the supplied repository snapshot.
- Restored SQLCipher's published Maven AAR declaration and retained the matching AndroidX SQLite dependency.
- Extended Android 12+ cloud-backup and device-transfer exclusions to all credential-encrypted and device-protected storage domains.
- Replaced locale-dependent signing-certificate text matching with a direct SHA-256 certificate digest check.
- Preserved both vault slots at startup when the active-slot marker is absent, preventing automatic deletion after marker damage.

## Checks completed against this exact repaired snapshot

- All four blocking repository checkers passed together.
- Static-checker positive and deliberately broken fixture tests passed.
- Generated-Android/Gradle-property and final-manifest fixture tests passed.
- Workflow YAML parsed and every shell block passed `bash -n`.
- All JSON configuration parsed and the Expo config plugin passed Node syntax checking.
- The bundled test key was opened with the workflow alias/password and its certificate was validated.
- Every main Kotlin source file passed an isolated compiler check against Android/Expo/API stubs; the stubs do not prove third-party binary compatibility.
- Executable checks against the exact current crypto/PIN/BIP39/graph source passed.
- Asset formats and required repository paths were checked.
- The final ZIP and every source-manifest hash were verified after packaging.

## What is not yet proven

This environment cannot install the complete npm/Expo/Gradle dependency graph, so it cannot perform the authoritative Expo prebuild, real Android/Kotlin dependency compilation, Gradle unit tests, Android lint, APK assembly, APK signing and final APK inspection end to end.

The GitHub Actions run is therefore still a build gate. Version 2.1.8 must be described as a repaired build candidate, not a verified APK or secure release, until that workflow is green and the real-device tests pass.
