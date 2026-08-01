package expo.modules.lifevaultnative.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.os.Build
import expo.modules.lifevaultnative.crypto.ByteOps
import expo.modules.lifevaultnative.crypto.CryptoConstants
import expo.modules.lifevaultnative.crypto.WrappedBlob
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec

class KeystoreManager {
    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    data class KeySecurity(val hardwareBacked: Boolean, val strongBoxBacked: Boolean)

    fun deviceAlias(installId: String) = "life_vault_device_$installId"
    fun biometricAlias(installId: String) = "life_vault_biometric_$installId"
    fun retryAlias(installId: String) = "life_vault_retry_$installId"

    fun generateDeviceKey(alias: String): KeySecurity = generateAesKey(alias, biometric = false)

    fun generateBiometricKey(alias: String): KeySecurity = generateAesKey(alias, biometric = true)

    fun generateRetryHmacKey(alias: String): KeySecurity {
        if (keyStore.containsAlias(alias)) return keySecurity(alias)

        fun generate(strongBox: Boolean) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, ANDROID_KEYSTORE)
            val builder = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
            ).setDigests(KeyProperties.DIGEST_SHA256)
            if (strongBox) builder.setIsStrongBoxBacked(true)
            generator.init(builder.build())
            generator.generateKey()
        }

        try {
            generate(strongBox = true)
        } catch (_: Exception) {
            // StrongBox support varies by device and vendor. A failed StrongBox
            // attempt must not strand a half-created alias; retry with the TEE.
            delete(alias)
            generate(strongBox = false)
        }
        return keySecurity(alias)
    }

    private fun generateAesKey(alias: String, biometric: Boolean): KeySecurity {
        if (keyStore.containsAlias(alias)) return keySecurity(alias)
        fun builder(): KeyGenParameterSpec.Builder {
            val value = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
            if (biometric) {
                value.setUserAuthenticationRequired(true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    value.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    @Suppress("DEPRECATION")
                    value.setUserAuthenticationValidityDurationSeconds(-1)
                }
                value.setInvalidatedByBiometricEnrollment(true)
            }
            return value
        }

        fun generate(strongBox: Boolean) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
            val parameters = builder().apply {
                if (strongBox) setIsStrongBoxBacked(true)
            }.build()
            generator.init(parameters)
            generator.generateKey()
        }

        try {
            generate(strongBox = true)
        } catch (_: Exception) {
            // StrongBox support varies by device and vendor. A failed StrongBox
            // attempt must not strand a half-created alias; retry with the TEE.
            delete(alias)
            generate(strongBox = false)
        }
        return keySecurity(alias)
    }

    fun encrypt(alias: String, plaintext: ByteArray, aad: String): WrappedBlob {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(alias))
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return WrappedBlob(cipher.iv, cipher.doFinal(plaintext))
    }

    fun decrypt(alias: String, blob: WrappedBlob, aad: String): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(alias),
            GCMParameterSpec(CryptoConstants.GCM_TAG_BITS, blob.nonce),
        )
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return cipher.doFinal(blob.ciphertext)
    }

    fun prepareBiometricEncrypt(alias: String, aad: String): Cipher {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(alias))
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return cipher
    }

    fun prepareBiometricDecrypt(alias: String, blob: WrappedBlob, aad: String): Cipher {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(alias),
            GCMParameterSpec(CryptoConstants.GCM_TAG_BITS, blob.nonce),
        )
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return cipher
    }

    fun hmac(alias: String, bytes: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256", ANDROID_KEYSTORE)
        mac.init(secretKey(alias))
        return mac.doFinal(bytes)
    }

    fun contains(alias: String): Boolean = keyStore.containsAlias(alias)

    fun delete(alias: String) {
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
    }

    fun deleteInstallationKeys(installId: String) {
        delete(deviceAlias(installId))
        delete(biometricAlias(installId))
        delete(retryAlias(installId))
    }

    fun keySecurity(alias: String): KeySecurity {
        return try {
            val key = secretKey(alias)
            val factory = SecretKeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE)
            val info = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val level = info.securityLevel
                KeySecurity(
                    hardwareBacked = level == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
                        level == KeyProperties.SECURITY_LEVEL_STRONGBOX,
                    strongBoxBacked = level == KeyProperties.SECURITY_LEVEL_STRONGBOX,
                )
            } else {
                @Suppress("DEPRECATION")
                KeySecurity(hardwareBacked = info.isInsideSecureHardware, strongBoxBacked = false)
            }
        } catch (_: Exception) {
            KeySecurity(hardwareBacked = false, strongBoxBacked = false)
        }
    }

    private fun secretKey(alias: String): SecretKey =
        (keyStore.getKey(alias, null) as? SecretKey)
            ?: throw IllegalStateException("Required Android Keystore key is unavailable: $alias")

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }
}
