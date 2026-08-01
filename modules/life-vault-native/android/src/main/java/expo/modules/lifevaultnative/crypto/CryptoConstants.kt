package expo.modules.lifevaultnative.crypto

object CryptoConstants {
    const val ROOT_KEY_BYTES = 32
    const val DEVICE_SECRET_BYTES = 32
    const val PIN_SALT_BYTES = 32
    const val GCM_NONCE_BYTES = 12
    const val GCM_TAG_BITS = 128

    const val ARGON_MEMORY_KB = 65_536
    const val ARGON_ITERATIONS = 3
    const val ARGON_PARALLELISM = 1

    const val MANIFEST_VERSION = 1
    const val DATABASE_SCHEMA_VERSION = 2
    const val BACKUP_VERSION = 1

    const val AAD_DEVICE_SECRET = "life-vault/device-secret/v1"
    const val AAD_PIN_ROOT = "life-vault/pin-root/v1"
    const val AAD_RECOVERY_ROOT = "life-vault/recovery-root/v1"
    const val AAD_BIOMETRIC_ROOT = "life-vault/biometric-root/v1"

    const val INFO_PIN_WRAP = "life-vault/pin-wrap/v1"
    const val INFO_RECOVERY_WRAP = "life-vault/recovery-wrap/v1"
    const val INFO_DATABASE = "life-vault/database/v1"
    const val INFO_BACKUP_AUTH = "life-vault/backup-auth/v1"
}
