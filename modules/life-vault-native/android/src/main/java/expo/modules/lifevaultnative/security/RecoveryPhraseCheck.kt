package expo.modules.lifevaultnative.security

import java.security.SecureRandom
import java.util.Locale

object RecoveryPhraseCheck {
    const val REQUIRED_WORDS = 24
    const val SAMPLE_COUNT = 3
    private const val SEGMENT_SIZE = REQUIRED_WORDS / SAMPLE_COUNT

    fun selectPositions(): List<Int> {
        val random = SecureRandom()
        return selectPositions { bound -> random.nextInt(bound) }
    }

    internal fun selectPositions(nextInt: (Int) -> Int): List<Int> {
        val positions = (0 until SAMPLE_COUNT).map { segment ->
            val offset = nextInt(SEGMENT_SIZE)
            require(offset in 0 until SEGMENT_SIZE) { "Random position was outside the segment" }
            segment * SEGMENT_SIZE + offset
        }
        require(positions.distinct().size == SAMPLE_COUNT) { "Recovery confirmation positions must be unique" }
        return positions
    }

    fun matches(expectedWords: List<String>, position: Int, enteredWord: String): Boolean {
        require(expectedWords.size == REQUIRED_WORDS) {
            "A recovery phrase must contain $REQUIRED_WORDS words."
        }
        require(position in expectedWords.indices) { "Recovery word position is outside the phrase" }
        return expectedWords[position].trim().lowercase(Locale.ROOT) ==
            enteredWord.trim().lowercase(Locale.ROOT)
    }
}
