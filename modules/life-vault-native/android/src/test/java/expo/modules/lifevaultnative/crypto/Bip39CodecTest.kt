package expo.modules.lifevaultnative.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class Bip39CodecTest {
    private val codec by lazy {
        val words = File("src/main/assets/bip39_english.txt").readLines().filter(String::isNotBlank)
        Bip39Codec(words)
    }

    @Test fun matchesTheOfficialZeroEntropyVector() {
        val entropy = ByteArray(32)
        val phrase = codec.encode24(entropy)
        assertEquals(List(23) { "abandon" } + "art", phrase)
        assertArrayEquals(entropy, codec.decode24(phrase.joinToString(" ")))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsAnInvalidChecksum() {
        val invalid = (List(23) { "abandon" } + "about").joinToString(" ")
        codec.decode24(invalid)
    }
}
