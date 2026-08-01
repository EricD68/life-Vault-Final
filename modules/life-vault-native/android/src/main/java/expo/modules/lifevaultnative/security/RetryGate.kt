package expo.modules.lifevaultnative.security

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.util.AtomicFile
import expo.modules.lifevaultnative.crypto.ByteOps
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileNotFoundException

internal object RetryGateMath {
    fun remainingMillis(
        savedBootCount: Int,
        currentBootCount: Int,
        blockedUntilElapsed: Long,
        blockedUntilWall: Long,
        nowElapsed: Long,
        nowWall: Long,
    ): Long {
        val sameKnownBoot = savedBootCount >= 0 && currentBootCount >= 0 && savedBootCount == currentBootCount
        return if (sameKnownBoot) blockedUntilElapsed - nowElapsed else blockedUntilWall - nowWall
    }
}

class RetryGate(
    private val context: Context,
    private val keystore: KeystoreManager,
) {
    data class Status(val allowed: Boolean, val remainingMillis: Long, val failures: Int)

    private data class State(
        val failures: Int,
        val blockedUntilElapsed: Long,
        val blockedUntilWall: Long,
        val bootCount: Int,
        val lastWall: Long,
    )

    fun status(installId: String): Status {
        val state = readState(installId) ?: return Status(true, 0, 0)
        val nowElapsed = SystemClock.elapsedRealtime()
        val nowWall = System.currentTimeMillis()
        val currentBoot = bootCount()

        val remaining = RetryGateMath.remainingMillis(
            savedBootCount = state.bootCount,
            currentBootCount = currentBoot,
            blockedUntilElapsed = state.blockedUntilElapsed,
            blockedUntilWall = state.blockedUntilWall,
            nowElapsed = nowElapsed,
            nowWall = nowWall,
        )
        val rollbackPenalty = if (nowWall + CLOCK_ROLLBACK_TOLERANCE_MS < state.lastWall) MAX_DELAY_MS else 0L
        val effective = maxOf(remaining, rollbackPenalty, 0L)
        return Status(effective <= 0, effective, state.failures)
    }

    fun recordFailure(installId: String): Status {
        val previous = readState(installId) ?: State(0, 0, 0, bootCount(), System.currentTimeMillis())
        val failures = (previous.failures + 1).coerceAtMost(MAX_FAILURES)
        val delay = delayFor(failures)
        val nowElapsed = SystemClock.elapsedRealtime()
        val nowWall = System.currentTimeMillis()
        val state = State(
            failures = failures,
            blockedUntilElapsed = nowElapsed + delay,
            blockedUntilWall = nowWall + delay,
            bootCount = bootCount(),
            lastWall = maxOf(previous.lastWall, nowWall),
        )
        writeState(installId, state)
        return Status(delay <= 0, delay, failures)
    }

    fun reset(installId: String) {
        val atomic = atomicFile(installId)
        atomic.delete()
        val stateStillReadable = try {
            atomic.openRead().use { it.read() }
            true
        } catch (_: FileNotFoundException) {
            false
        }
        require(!stateStillReadable) { "Retry protection state could not be cleared" }
    }

    private fun delayFor(failures: Int): Long = when (failures) {
        in 1..3 -> 2_000L
        4 -> 10_000L
        5 -> 30_000L
        6 -> 120_000L
        7 -> 600_000L
        else -> MAX_DELAY_MS
    }

    private fun writeState(installId: String, state: State) {
        val payload = ByteArrayOutputStream().use { buffer ->
            DataOutputStream(buffer).use { out ->
                out.writeInt(STATE_VERSION)
                out.writeInt(state.failures)
                out.writeLong(state.blockedUntilElapsed)
                out.writeLong(state.blockedUntilWall)
                out.writeInt(state.bootCount)
                out.writeLong(state.lastWall)
            }
            buffer.toByteArray()
        }
        val tag = keystore.hmac(keystore.retryAlias(installId), payload)
        val atomic = atomicFile(installId)
        var output: java.io.FileOutputStream? = null
        try {
            output = atomic.startWrite()
            val out = DataOutputStream(output)
            out.writeInt(payload.size)
            out.write(payload)
            out.write(tag)
            out.flush()
            output.fd.sync()
            atomic.finishWrite(output)
            output = null
        } catch (error: Exception) {
            output?.let(atomic::failWrite)
            throw IllegalStateException("Could not persist retry protection state", error)
        } finally {
            ByteOps.wipe(payload)
            ByteOps.wipe(tag)
        }
    }

    private fun readState(installId: String): State? {
        val atomic = atomicFile(installId)
        val all = try {
            atomic.openRead().use { input ->
                val size = input.channel.size()
                require(size in MIN_STATE_FILE_BYTES..MAX_STATE_FILE_BYTES) { "Invalid retry-state file size" }
                input.readBytes()
            }
        } catch (_: FileNotFoundException) {
            return null
        }
        try {
            val input = DataInputStream(ByteArrayInputStream(all))
            val size = input.readInt()
            require(size == STATE_PAYLOAD_BYTES) { "Invalid retry-state length" }
            val payload = ByteArray(size)
            try {
                input.readFully(payload)
                val tag = ByteArray(32)
                input.readFully(tag)
                require(input.available() == 0) { "Trailing retry-state data" }
                val expected = keystore.hmac(keystore.retryAlias(installId), payload)
                try {
                    require(ByteOps.constantTimeEquals(tag, expected)) { "Retry-state authentication failed" }
                } finally {
                    ByteOps.wipe(expected)
                    ByteOps.wipe(tag)
                }
                return DataInputStream(ByteArrayInputStream(payload)).use { data ->
                    require(data.readInt() == STATE_VERSION)
                    val parsed = State(
                        failures = data.readInt(),
                        blockedUntilElapsed = data.readLong(),
                        blockedUntilWall = data.readLong(),
                        bootCount = data.readInt(),
                        lastWall = data.readLong(),
                    )
                    require(data.available() == 0) { "Trailing retry-state payload" }
                    require(parsed.failures in 0..MAX_FAILURES) { "Invalid retry failure count" }
                    parsed
                }
            } finally {
                ByteOps.wipe(payload)
            }
        } catch (error: Exception) {
            throw IllegalStateException("Retry protection state is damaged. Use recovery to regain access.", error)
        } finally {
            ByteOps.wipe(all)
        }
    }

    private fun file(installId: String): File = File(context.noBackupFilesDir, "life_vault/retry_$installId.bin").also {
        val parent = requireNotNull(it.parentFile) { "Retry protection directory is unavailable" }
        require(parent.isDirectory || parent.mkdirs()) { "Retry protection directory could not be created" }
        require(parent.isDirectory) { "Retry protection parent is not a directory" }
    }

    private fun atomicFile(installId: String): AtomicFile = AtomicFile(file(installId))

    private fun bootCount(): Int = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT)
    } catch (_: Exception) {
        -1
    }

    companion object {
        private const val STATE_VERSION = 1
        private const val STATE_PAYLOAD_BYTES = 36
        private const val STATE_TAG_BYTES = 32L
        private const val MIN_STATE_FILE_BYTES = 4L + STATE_PAYLOAD_BYTES + STATE_TAG_BYTES
        private const val MAX_STATE_FILE_BYTES = MIN_STATE_FILE_BYTES
        private const val MAX_FAILURES = 1_000_000
        private const val MAX_DELAY_MS = 30 * 60 * 1000L
        private const val CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000L
    }
}
