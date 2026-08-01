package expo.modules.lifevaultnative.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class Argon2KdfTest {
    @Test fun isDeterministicAndSaltSensitive() {
        val pin = "40719382".toByteArray()
        val saltA = ByteArray(32) { it.toByte() }
        val saltB = saltA.copyOf().also { it[0] = 99 }
        val first = Argon2Kdf.derive(pin, saltA, memoryKb = 32_768, iterations = 2)
        val second = Argon2Kdf.derive(pin, saltA, memoryKb = 32_768, iterations = 2)
        val changed = Argon2Kdf.derive(pin, saltB, memoryKb = 32_768, iterations = 2)
        assertArrayEquals(first, second)
        assertFalse(first.contentEquals(changed))
        ByteOps.wipe(pin)
        ByteOps.wipe(first)
        ByteOps.wipe(second)
        ByteOps.wipe(changed)
    }
}
