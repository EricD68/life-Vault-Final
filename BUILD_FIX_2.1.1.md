# Android Kotlin compile fix 2.1.1

This update fixes the four compile errors reported by the GitHub Android build:

1. Removes the unsupported platform `BIOMETRIC_ERROR_NEGATIVE_BUTTON` constant. The negative button is already handled by its dedicated click listener.
2. Casts `SecretKeyFactory.getKeySpec(...)` to Android `KeyInfo` before reading hardware-security properties.
3. Qualifies the recovery phrase TextView inside `ScrollView.apply`, avoiding collision with Android View's `display` property.
4. Qualifies the PIN TextView inside `LinearLayout.apply` for the same reason.

No database format, backup format, PIN rules, or recovery format changed.
