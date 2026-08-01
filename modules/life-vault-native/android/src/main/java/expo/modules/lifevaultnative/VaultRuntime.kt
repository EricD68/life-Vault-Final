package expo.modules.lifevaultnative

import android.content.Context
import android.os.SystemClock
import expo.modules.lifevaultnative.storage.VaultRepository
import net.zetetic.database.Logger
import net.zetetic.database.NoopTarget
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

object VaultRuntime {
    private val initialised = AtomicBoolean(false)
    private val schedulerStarted = AtomicBoolean(false)
    private val initialiseLock = Any()
    private val lastActivityElapsed = AtomicLong(SystemClock.elapsedRealtime())
    private val backgrounded = AtomicBoolean(false)
    val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "life-vault-security").apply { isDaemon = true }
    }

    @Volatile
    private var repository: VaultRepository? = null
    @Volatile
    private var pendingSetup: VaultRepository.PendingSetup? = null

    fun initialise(context: Context) {
        if (initialised.get()) return
        synchronized(initialiseLock) {
            if (initialised.get()) return

            Logger.setTarget(NoopTarget())
            System.loadLibrary("sqlcipher")

            val candidate = VaultRepository(context.applicationContext)
            try {
                candidate.initialise()
                repository = candidate
                backgrounded.set(false)
                touch()
                if (schedulerStarted.compareAndSet(false, true)) {
                    try {
                        executor.scheduleAtFixedRate({ enforceIdleLock() }, 1, 1, TimeUnit.SECONDS)
                    } catch (error: Throwable) {
                        schedulerStarted.set(false)
                        throw error
                    }
                }
                initialised.set(true)
            } catch (error: Throwable) {
                repository = null
                runCatching { candidate.lock() }
                throw error
            }
        }
    }

    fun repo(): VaultRepository = repositoryOrNull()
        ?: error("Life Vault native core is not initialised")

    private fun repositoryOrNull(): VaultRepository? = if (initialised.get()) repository else null

    @Synchronized
    fun trySetPendingSetup(value: VaultRepository.PendingSetup): Boolean {
        if (pendingSetup != null) return false
        pendingSetup = value
        return true
    }

    @Synchronized
    fun pendingSetup(): VaultRepository.PendingSetup? = pendingSetup

    @Synchronized
    fun clearPendingSetup() {
        pendingSetup = null
    }

    @Synchronized
    fun abortPendingSetup() {
        val pending = pendingSetup ?: return
        pendingSetup = null
        val currentRepository = repositoryOrNull()
        if (currentRepository != null) {
            currentRepository.abortSetup(pending)
        } else {
            pending.close()
        }
    }

    fun touch() {
        lastActivityElapsed.set(SystemClock.elapsedRealtime())
    }

    fun onUnlocked() {
        backgrounded.set(false)
        touch()
    }

    fun onBackground() {
        backgrounded.set(true)
        executor.execute {
            try {
                abortPendingSetup()
            } finally {
                repositoryOrNull()?.lock()
            }
        }
    }

    fun onForeground() {
        backgrounded.set(false)
    }

    fun lock() {
        repositoryOrNull()?.lock()
    }

    fun stateMap(): Map<String, Any?> {
        val currentRepository = repo()
        return synchronized(currentRepository) {
            val manifest = currentRepository.activeManifest()
            val configured = manifest != null
            val unlocked = currentRepository.isUnlocked()
            val pinBlock = runCatching { currentRepository.pinBlockStatus() }.getOrNull()
            val hardware = if (configured) runCatching { currentRepository.hardwareSecurity() }.getOrNull() else null
            mapOf(
                "configured" to configured,
                "unlocked" to unlocked,
                "biometricEnabled" to (manifest?.biometricRootWrapped != null),
                "autoLockSeconds" to (manifest?.autoLockSeconds ?: 60),
                "pinBlockedMillis" to (pinBlock?.remainingMillis ?: 0L),
                "failedPinAttempts" to (pinBlock?.failures ?: 0),
                "hardwareBacked" to (hardware?.hardwareBacked ?: false),
                "strongBoxBacked" to (hardware?.strongBoxBacked ?: false),
                "region" to if (unlocked) runCatching { currentRepository.region() }.getOrNull() else null,
            )
        }
    }

    private fun enforceIdleLock() {
        if (backgrounded.get()) return
        val currentRepository = repositoryOrNull() ?: return
        runCatching {
            synchronized(currentRepository) {
                if (!currentRepository.isUnlocked()) return@synchronized
                val timeoutSeconds = currentRepository.currentManifest().autoLockSeconds
                val elapsed = SystemClock.elapsedRealtime() - lastActivityElapsed.get()
                if (elapsed >= timeoutSeconds * 1_000L) currentRepository.lock()
            }
        }
    }
}
