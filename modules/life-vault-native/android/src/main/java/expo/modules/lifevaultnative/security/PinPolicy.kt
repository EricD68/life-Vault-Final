package expo.modules.lifevaultnative.security

object PinPolicy {
    const val MIN_LENGTH = 6
    const val RECOMMENDED_LENGTH = 8
    const val MAX_LENGTH = 12

    private val blocked = setOf(
        "000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999",
        "123456", "654321", "1234567", "7654321", "12345678", "87654321", "121212", "112233", "123123",
        "101010", "00000000", "11111111", "22222222", "12341234", "43214321", "25802580", "08520852",
    )

    data class Result(val valid: Boolean, val message: String? = null, val warning: String? = null)

    fun validate(digits: List<Int>): Result {
        if (digits.size !in MIN_LENGTH..MAX_LENGTH) {
            return Result(false, "Use $MIN_LENGTH to $MAX_LENGTH digits.")
        }
        val value = digits.joinToString("")
        if (value in blocked) return Result(false, "That PIN is too easy to guess.")
        if (value.toSet().size == 1) return Result(false, "Do not use the same digit repeatedly.")
        if (isStraightSequence(value)) return Result(false, "Do not use a straight ascending or descending sequence.")
        if (hasShortRepeatingBlock(value)) return Result(false, "Do not use a short repeating pattern.")

        return if (digits.size < RECOMMENDED_LENGTH) {
            Result(true, warning = "Six or seven digits are allowed, but eight or more is substantially stronger.")
        } else {
            Result(true)
        }
    }

    private fun isStraightSequence(value: String): Boolean {
        if (value.length < 4) return false
        val numbers = value.map { it.digitToInt() }
        val up = numbers.zipWithNext().all { (a, b) -> b == (a + 1) % 10 }
        val down = numbers.zipWithNext().all { (a, b) -> b == (a + 9) % 10 }
        return up || down
    }

    private fun hasShortRepeatingBlock(value: String): Boolean {
        for (blockSize in 1..(value.length / 2)) {
            if (value.length % blockSize != 0) continue
            val block = value.substring(0, blockSize)
            if (block.repeat(value.length / blockSize) == value) return true
        }
        return false
    }
}
