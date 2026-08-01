package expo.modules.lifevaultnative.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Test
import javax.crypto.AEADBadTagException

class AesGcmTest {
    @Test fun roundTripsAndRejectsTampering() {
        val key = ByteArray(32) { it.toByte() }
        val plaintext = "life-vault-test".toByteArray()
        val wrapped = AesGcm.encrypt(key, plaintext, "test-aad")
        assertArrayEquals(plaintext, AesGcm.decrypt(key, wrapped, "test-aad"))

        val damaged = wrapped.copy(ciphertext = wrapped.ciphertext.copyOf().also { it[0] = (it[0].toInt() xor 1).toByte() })
        try {
            AesGcm.decrypt(key, damaged, "test-aad")
            throw AssertionError("Tampered ciphertext was accepted")
        } catch (_: AEADBadTagException) {
            // Expected.
        }
    }
}
