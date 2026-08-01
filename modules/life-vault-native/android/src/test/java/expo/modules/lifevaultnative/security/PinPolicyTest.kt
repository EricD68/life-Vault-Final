package expo.modules.lifevaultnative.security

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PinPolicyTest {
    @Test fun rejectsShortAndCommonPins() {
        assertFalse(PinPolicy.validate(listOf(1, 2, 3, 4, 5)).valid)
        assertFalse(PinPolicy.validate("123456".map(Char::digitToInt)).valid)
        assertFalse(PinPolicy.validate("11111111".map(Char::digitToInt)).valid)
        assertFalse(PinPolicy.validate("12121212".map(Char::digitToInt)).valid)
    }

    @Test fun acceptsPracticalIndependentPins() {
        assertTrue(PinPolicy.validate("40719382".map(Char::digitToInt)).valid)
        val sixDigit = PinPolicy.validate("407193".map(Char::digitToInt))
        assertTrue(sixDigit.valid)
        assertNotNull(sixDigit.warning)
    }
}
