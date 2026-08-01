package expo.modules.lifevaultnative.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Test

class HkdfTest {
    @Test fun matchesRfc5869TestCaseOne() {
        val ikm = ByteArray(22) { 0x0b }
        val salt = hex("000102030405060708090a0b0c")
        val info = hex("f0f1f2f3f4f5f6f7f8f9")
        val expected = hex("3cb25f25faacd57a90434f64d0362f2a" +
            "2d2d0a90cf1a5a4c5db02d56ecc4c5bf" +
            "34007208d5b887185865")
        assertArrayEquals(expected, Hkdf.sha256(ikm, salt, info, 42))
    }

    private fun hex(value: String): ByteArray = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
