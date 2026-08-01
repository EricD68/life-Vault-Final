# Life Vault implementation constraints

- Keep the complete product interface in React Native.
- Never move root keys, database keys, PINs or recovery-derived keys into JavaScript.
- Android security authority is the Kotlin local Expo module.
- Do not reintroduce Expo SecureStore, Expo LocalAuthentication, AsyncStorage or JavaScript cryptography for vault security.
- Build Android with the included GitHub workflow and treat compiler/lint/test failures as release blockers.
- Read the exact Expo SDK 57 module documentation before changing Expo Modules API code.
