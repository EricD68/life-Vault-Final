package expo.modules.lifevaultnative.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecoveryPhraseCheckTest {
    @Test
    fun selectsOneWordFromEachThirdOfThePhrase() {
        val values = ArrayDeque(listOf(0, 7, 3))
        val positions = RecoveryPhraseCheck.selectPositions { values.removeFirst() }

        assertEquals(listOf(0, 15, 19), positions)
        assertEquals(3, positions.distinct().size)
    }

    @Test
    fun comparisonIsTrimmedAndCaseInsensitiveWithoutRevealingTheAnswer() {
        val words = (1..24).map { "word$it" }

        assertTrue(RecoveryPhraseCheck.matches(words, 8, " WORD9 "))
        assertFalse(RecoveryPhraseCheck.matches(words, 8, "word10"))
    }
}
