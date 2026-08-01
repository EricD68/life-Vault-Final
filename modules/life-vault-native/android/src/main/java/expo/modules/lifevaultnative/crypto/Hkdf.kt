package expo.modules.lifevaultnative.crypto

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object Hkdf {
    private const val HASH_LEN = 32

    fun sha256(ikm: ByteArray, salt: ByteArray? = null, info: ByteArray, length: Int = 32): ByteArray {
        require(length in 1..(255 * HASH_LEN))
        val actualSalt = salt ?: ByteArray(HASH_LEN)
        val extract = Mac.getInstance("HmacSHA256")
        extract.init(SecretKeySpec(actualSalt, "HmacSHA256"))
        val prk = extract.doFinal(ikm)

        try {
            val output = ByteArray(length)
            var previous = ByteArray(0)
            var offset = 0
            var counter = 1
            while (offset < length) {
                val expand = Mac.getInstance("HmacSHA256")
                expand.init(SecretKeySpec(prk, "HmacSHA256"))
                expand.update(previous)
                expand.update(info)
                expand.update(counter.toByte())
                val block = expand.doFinal()
                ByteOps.wipe(previous)
                previous = block
                val copyLength = minOf(block.size, length - offset)
                System.arraycopy(block, 0, output, offset, copyLength)
                offset += copyLength
                counter++
            }
            ByteOps.wipe(previous)
            return output
        } finally {
            ByteOps.wipe(prk)
        }
    }
}
