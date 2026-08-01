package expo.modules.lifevaultnative.crypto

import android.content.Context

class Bip39(context: Context) {
    private val codec = Bip39Codec(
        context.assets.open("bip39_english.txt")
            .bufferedReader(Charsets.UTF_8)
            .useLines { sequence -> sequence.map(String::trim).filter(String::isNotEmpty).toList() },
    )

    data class Generated(val entropy: ByteArray, val phrase: List<String>)

    fun generate24Words(): Generated {
        val entropy = ByteOps.randomBytes(32)
        return Generated(entropy, codec.encode24(entropy))
    }

    fun encode24(entropy: ByteArray): List<String> = codec.encode24(entropy)
    fun decode24(input: String): ByteArray = codec.decode24(input)
    fun decode24(words: List<String>): ByteArray = codec.decode24(words)
    fun normalise(input: String): String = codec.normalise(input)
}
