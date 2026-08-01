package expo.modules.lifevaultnative.crypto

import java.security.MessageDigest
import java.util.Locale

class Bip39Codec(words: List<String>) {
    private val words = words.toList().also { require(it.size == 2048) { "BIP39 word list must contain 2048 words" } }
    private val indexByWord = this.words.withIndex().associate { it.value to it.index }

    fun encode24(entropy: ByteArray): List<String> {
        require(entropy.size == 32)
        val digest = MessageDigest.getInstance("SHA-256").digest(entropy)
        val checksum = digest[0].toInt() and 0xff
        ByteOps.wipe(digest)
        val bits = BooleanArray(264)
        for (i in entropy.indices) {
            val value = entropy[i].toInt() and 0xff
            for (bit in 0 until 8) bits[i * 8 + bit] = ((value shr (7 - bit)) and 1) == 1
        }
        for (bit in 0 until 8) bits[256 + bit] = ((checksum shr (7 - bit)) and 1) == 1

        return List(24) { wordIndex ->
            var index = 0
            for (bit in 0 until 11) {
                index = (index shl 1) or if (bits[wordIndex * 11 + bit]) 1 else 0
            }
            words[index]
        }
    }

    fun decode24(input: String): ByteArray = decode24(normalise(input).split(" ").filter(String::isNotBlank))

    fun decode24(inputWords: List<String>): ByteArray {
        require(inputWords.size == 24) { "Enter all 24 recovery words." }
        val phrase = inputWords.map { it.lowercase(Locale.ROOT).trim() }
        require(phrase.none(String::isBlank)) { "Enter all 24 recovery words." }

        val bits = BooleanArray(264)
        phrase.forEachIndexed { wordIndex, word ->
            val index = indexByWord[word] ?: throw IllegalArgumentException("Unknown recovery word: $word")
            for (bit in 0 until 11) {
                bits[wordIndex * 11 + bit] = ((index shr (10 - bit)) and 1) == 1
            }
        }

        val entropy = ByteArray(32)
        for (i in entropy.indices) {
            var value = 0
            for (bit in 0 until 8) value = (value shl 1) or if (bits[i * 8 + bit]) 1 else 0
            entropy[i] = value.toByte()
        }

        var checksum = 0
        for (bit in 0 until 8) checksum = (checksum shl 1) or if (bits[256 + bit]) 1 else 0
        val digest = MessageDigest.getInstance("SHA-256").digest(entropy)
        val expected = digest[0].toInt() and 0xff
        ByteOps.wipe(digest)
        if (checksum != expected) {
            ByteOps.wipe(entropy)
            throw IllegalArgumentException("The recovery phrase checksum is invalid.")
        }
        return entropy
    }

    fun normalise(input: String): String = input.lowercase(Locale.ROOT).trim().split(Regex("\\s+")).joinToString(" ")
}
