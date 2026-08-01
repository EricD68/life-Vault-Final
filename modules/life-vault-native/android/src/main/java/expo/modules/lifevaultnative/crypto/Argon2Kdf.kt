package expo.modules.lifevaultnative.crypto

import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters

object Argon2Kdf {
    fun derive(
        pinBytes: ByteArray,
        salt: ByteArray,
        memoryKb: Int = CryptoConstants.ARGON_MEMORY_KB,
        iterations: Int = CryptoConstants.ARGON_ITERATIONS,
        parallelism: Int = CryptoConstants.ARGON_PARALLELISM,
    ): ByteArray {
        require(pinBytes.isNotEmpty())
        require(salt.size >= 16)
        require(memoryKb in 32_768..262_144)
        require(iterations in 2..10)
        require(parallelism in 1..4)

        val params = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withSalt(salt)
            .withMemoryAsKB(memoryKb)
            .withIterations(iterations)
            .withParallelism(parallelism)
            .build()

        val output = ByteArray(32)
        val generator = Argon2BytesGenerator()
        generator.init(params)
        generator.generateBytes(pinBytes, output)
        return output
    }
}
