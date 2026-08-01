package expo.modules.lifevaultnative.crypto

import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec


data class WrappedBlob(
    val nonce: ByteArray,
    val ciphertext: ByteArray,
)

object AesGcm {
    fun encrypt(key: ByteArray, plaintext: ByteArray, aad: String): WrappedBlob {
        require(key.size == 32)
        val nonce = ByteOps.randomBytes(CryptoConstants.GCM_NONCE_BYTES)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.ENCRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(CryptoConstants.GCM_TAG_BITS, nonce),
        )
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return WrappedBlob(nonce, cipher.doFinal(plaintext))
    }

    @Throws(AEADBadTagException::class)
    fun decrypt(key: ByteArray, blob: WrappedBlob, aad: String): ByteArray {
        require(key.size == 32)
        require(blob.nonce.size == CryptoConstants.GCM_NONCE_BYTES)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(CryptoConstants.GCM_TAG_BITS, blob.nonce),
        )
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return cipher.doFinal(blob.ciphertext)
    }
}
