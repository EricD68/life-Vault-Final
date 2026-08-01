# Android 9 compatibility (v2.1.8)

- Minimum Android version lowered from API 30 (Android 11) to API 28 (Android 9).
- Biometric integration now uses AndroidX BiometricPrompt with BIOMETRIC_STRONG.
- Android 9/10 Keystore biometric keys use authentication-per-use via the legacy validity-duration API.
- Android 11+ uses setUserAuthenticationParameters.
- StrongBox is requested when available; TEE-backed Keystore remains the fallback.
- Android 12+ overlay blocking remains enabled only on supported versions. FLAG_SECURE remains enabled on Android 9.
