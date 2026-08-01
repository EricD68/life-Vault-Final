package expo.modules.lifevaultnative.crypto

import java.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

object ByteOps {
    private val random = SecureRandom()

    fun randomBytes(size: Int): ByteArray = ByteArray(size).also(random::nextBytes)

    fun concat(vararg arrays: ByteArray): ByteArray {
        val size = arrays.sumOf { it.size }
        val out = ByteArray(size)
        var offset = 0
        arrays.forEach {
            System.arraycopy(it, 0, out, offset, it.size)
            offset += it.size
        }
        return out
    }

    fun wipe(bytes: ByteArray?) {
        bytes?.fill(0)
    }

    fun b64(bytes: ByteArray): String = Base64.getEncoder().withoutPadding().encodeToString(bytes)

    fun fromB64(value: String): ByteArray = Base64.getDecoder().decode(value)

    fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean = MessageDigest.isEqual(a, b)

    fun pinDigitsToBytes(digits: List<Int>): ByteArray = ByteArray(digits.size) { index ->
        require(digits[index] in 0..9)
        ('0'.code + digits[index]).toByte()
    }
}
