package expo.modules.lifevaultnative

import android.app.Activity
import android.content.Intent
import androidx.biometric.BiometricManager
import android.net.Uri
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.lifevaultnative.backup.BackupFormat
import expo.modules.lifevaultnative.security.BiometricController
import expo.modules.lifevaultnative.security.SecureDialogs
import expo.modules.lifevaultnative.security.SensitiveClipboard
import expo.modules.lifevaultnative.storage.InvalidPinException
import expo.modules.lifevaultnative.storage.PinLockedException
import expo.modules.lifevaultnative.storage.RecoveryRequiredException
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.util.Locale

class LifeVaultNativeModule : Module() {
    private data class PendingExport(val file: File, val promise: Promise)
    private val exportLock = Any()
    private var pendingExport: PendingExport? = null

    override fun definition() = ModuleDefinition {
        Name("LifeVaultNative")

        OnCreate {
            val context = appContext.reactContext
                ?: error("React context is unavailable")
            VaultRuntime.initialise(context)
            appContext.currentActivity?.let(::secureWindow)
        }

        OnActivityEntersForeground {
            appContext.currentActivity?.let(::secureWindow)
            VaultRuntime.onForeground()
        }

        OnActivityEntersBackground {
            VaultRuntime.onBackground()
        }

        OnUserLeavesActivity {
            VaultRuntime.onBackground()
        }

        OnDestroy {
            VaultRuntime.onBackground()
            cancelPendingExport("The backup export was interrupted.")
        }

        OnActivityResult { activity, payload ->
            if (payload.requestCode == BACKUP_DOCUMENT_REQUEST_CODE) {
                completeBackupDocumentSelection(activity, payload.resultCode, payload.data?.data)
            }
        }

        AsyncFunction("getState") {
            VaultRuntime.stateMap()
        }

        AsyncFunction("touch") {
            VaultRuntime.touch()
            true
        }

        AsyncFunction("lock") {
            VaultRuntime.lock()
            VaultRuntime.stateMap()
        }

        AsyncFunction("createVault") { region: String, promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            VaultRuntime.executor.execute {
                try {
                    VaultRuntime.repo().runPreflightChecks()
                    SecureDialogs.promptNewPin(
                        activity,
                        title = "Create Life Vault PIN",
                        message = "Use a separate PIN from your phone unlock. Eight digits is recommended; six is the minimum.",
                    ) { pin ->
                        if (pin == null) {
                            rejectCancelled(promise)
                            return@promptNewPin
                        }
                        VaultRuntime.executor.execute {
                            try {
                                val pending = VaultRuntime.repo().prepareNewVault(pin, region.uppercase(Locale.ROOT))
                                if (!VaultRuntime.trySetPendingSetup(pending)) {
                                    VaultRuntime.repo().abortSetup(pending)
                                    error("Another vault setup is already active")
                                }
                                SecureDialogs.showRecoveryPhrase(activity, pending.phrase) { continued ->
                                    if (!continued) {
                                        VaultRuntime.executor.execute {
                                            VaultRuntime.abortPendingSetup()
                                            rejectCancelled(promise)
                                        }
                                        return@showRecoveryPhrase
                                    }
                                    SecureDialogs.promptRecoveryPhrase(
                                        activity,
                                        title = "Confirm recovery phrase",
                                        message = "Enter all 24 words in order. Setup is not committed until this check succeeds.",
                                    ) { entered ->
                                        if (entered == null) {
                                            VaultRuntime.executor.execute {
                                                VaultRuntime.abortPendingSetup()
                                                rejectCancelled(promise)
                                            }
                                            return@promptRecoveryPhrase
                                        }
                                        VaultRuntime.executor.execute {
                                            try {
                                                val activePending = VaultRuntime.pendingSetup()
                                                    ?: error("Pending setup expired")
                                                VaultRuntime.repo().commitNewVault(activePending, entered)
                                                VaultRuntime.clearPendingSetup()
                                                VaultRuntime.onUnlocked()
                                                promise.resolve(VaultRuntime.stateMap())
                                            } catch (error: Throwable) {
                                                VaultRuntime.abortPendingSetup()
                                                reject(promise, error)
                                            }
                                        }
                                    }
                                }
                            } catch (error: Throwable) {
                                VaultRuntime.abortPendingSetup()
                                reject(promise, error)
                            }
                        }
                    }
                } catch (error: Throwable) {
                    reject(promise, IllegalStateException("Secure storage preflight failed before setup: ${error.message ?: "unknown error"}", error))
                }
            }
        }

        AsyncFunction("unlockWithPin") { promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            promptAndUnlockWithPin(activity, promise)
        }

        AsyncFunction("unlockWithBiometric") { promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            VaultRuntime.executor.execute {
                try {
                    val preparation = VaultRuntime.repo().prepareBiometricUnlock()
                    activity.runOnUiThread {
                        val controller = BiometricController(activity, activity.mainExecutor)
                        controller.authenticate(
                            title = "Unlock Life Vault",
                            subtitle = "Use a strong enrolled fingerprint or face",
                            cipher = preparation.cipher,
                            onSuccess = { authenticatedCipher ->
                                VaultRuntime.touch()
                                VaultRuntime.executor.execute {
                                    try {
                                        VaultRuntime.repo().completeBiometricUnlock(
                                            preparation.copy(cipher = authenticatedCipher)
                                        )
                                        VaultRuntime.onUnlocked()
                                        promise.resolve(VaultRuntime.stateMap())
                                    } catch (error: Throwable) {
                                        handleBiometricFailure(promise, error)
                                    }
                                }
                            },
                            onFailure = { message ->
                                VaultRuntime.touch()
                                promise.reject("ERR_BIOMETRIC", message, null)
                            },
                            onCancelledToPin = {
                                VaultRuntime.touch()
                                promptAndUnlockWithPin(activity, promise)
                            },
                        )
                    }
                } catch (error: Throwable) {
                    handleBiometricFailure(promise, error)
                }
            }
        }

        AsyncFunction("enableBiometric") { promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            SecureDialogs.promptPin(
                activity,
                title = "Confirm Life Vault PIN",
                message = "Your separate Life Vault PIN is required before biometrics can be enabled.",
            ) { pin ->
                if (pin == null) {
                    rejectCancelled(promise)
                    return@promptPin
                }
                VaultRuntime.executor.execute {
                    try {
                        VaultRuntime.repo().verifyPin(pin)
                        val preparation = VaultRuntime.repo().prepareBiometricEnrollment()
                        activity.runOnUiThread {
                            BiometricController(activity, activity.mainExecutor).authenticate(
                                title = "Enable biometric unlock",
                                subtitle = "Authenticate to create a hardware-protected biometric key",
                                cipher = preparation.cipher,
                                onSuccess = { authenticatedCipher ->
                                    VaultRuntime.touch()
                                    VaultRuntime.executor.execute {
                                        try {
                                            VaultRuntime.repo().completeBiometricEnrollment(
                                                preparation.copy(cipher = authenticatedCipher)
                                            )
                                            promise.resolve(VaultRuntime.stateMap())
                                        } catch (error: Throwable) {
                                            runCatching { VaultRuntime.repo().cancelBiometricEnrollment() }
                                                .exceptionOrNull()
                                                ?.let(error::addSuppressed)
                                            reject(promise, error)
                                        }
                                    }
                                },
                                onFailure = { message ->
                                    VaultRuntime.executor.execute {
                                        val cleanupError = runCatching {
                                            VaultRuntime.repo().cancelBiometricEnrollment()
                                        }.exceptionOrNull()
                                        if (cleanupError == null) {
                                            promise.reject("ERR_BIOMETRIC", message, null)
                                        } else {
                                            reject(promise, cleanupError)
                                        }
                                    }
                                },
                                onCancelledToPin = {
                                    VaultRuntime.executor.execute {
                                        val cleanupError = runCatching {
                                            VaultRuntime.repo().cancelBiometricEnrollment()
                                        }.exceptionOrNull()
                                        if (cleanupError == null) rejectCancelled(promise) else reject(promise, cleanupError)
                                    }
                                },
                            )
                        }
                    } catch (error: Throwable) {
                        reject(promise, error)
                    }
                }
            }
        }

        AsyncFunction("disableBiometric") { promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            SecureDialogs.promptPin(
                activity,
                title = "Disable biometric unlock",
                message = "Enter your separate Life Vault PIN to confirm.",
            ) { pin ->
                if (pin == null) {
                    rejectCancelled(promise)
                    return@promptPin
                }
                VaultRuntime.executor.execute {
                    try {
                        VaultRuntime.repo().verifyPin(pin)
                        VaultRuntime.repo().disableBiometrics()
                        promise.resolve(VaultRuntime.stateMap())
                    } catch (error: Throwable) {
                        reject(promise, error)
                    }
                }
            }
        }

        AsyncFunction("changePin") { promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            SecureDialogs.promptPin(activity, "Current Life Vault PIN") { currentPin ->
                if (currentPin == null) {
                    rejectCancelled(promise)
                    return@promptPin
                }
                SecureDialogs.promptNewPin(
                    activity,
                    title = "Choose a new Life Vault PIN",
                    message = "Use a PIN that is different from your phone unlock.",
                ) { newPin ->
                    if (newPin == null) {
                        rejectCancelled(promise)
                        return@promptNewPin
                    }
                    VaultRuntime.executor.execute {
                        try {
                            VaultRuntime.repo().changePin(currentPin, newPin)
                            promise.resolve(VaultRuntime.stateMap())
                        } catch (error: Throwable) {
                            reject(promise, error)
                        }
                    }
                }
            }
        }

        AsyncFunction("recoverPin") { promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            SecureDialogs.promptRecoveryPhrase(
                activity,
                title = "Recover Life Vault",
                message = "Enter the original 24-word recovery phrase. It remains inside native Android code.",
            ) { words ->
                if (words == null) {
                    rejectCancelled(promise)
                    return@promptRecoveryPhrase
                }
                SecureDialogs.promptNewPin(activity, "Choose a new Life Vault PIN") { newPin ->
                    if (newPin == null) {
                        rejectCancelled(promise)
                        return@promptNewPin
                    }
                    VaultRuntime.executor.execute {
                        var entropy: ByteArray? = null
                        try {
                            entropy = VaultRuntime.repo().decodeRecoveryWords(words)
                            VaultRuntime.repo().recoverLocalVault(entropy, newPin)
                            VaultRuntime.onUnlocked()
                            promise.resolve(VaultRuntime.stateMap())
                        } catch (error: Throwable) {
                            reject(promise, error)
                        } finally {
                            entropy?.fill(0)
                        }
                    }
                }
            }
        }

        AsyncFunction("exportBackup") { promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            SecureDialogs.promptPin(
                activity,
                title = "Authenticate before backup",
                message = "Choose a USB drive, local folder or cloud document provider after authentication. The backup never contains your PIN or recovery phrase.",
            ) { pin ->
                if (pin == null) {
                    rejectCancelled(promise)
                    return@promptPin
                }
                VaultRuntime.executor.execute {
                    try {
                        val file = VaultRuntime.repo().createBackup(pin)
                        val pending = PendingExport(file, promise)
                        val accepted = synchronized(exportLock) {
                            if (pendingExport == null) {
                                pendingExport = pending
                                true
                            } else {
                                false
                            }
                        }
                        if (!accepted) {
                            val conflict = IllegalStateException("Another backup export is already active.")
                            runCatching { cleanupExportFile(file) }.exceptionOrNull()?.let(conflict::addSuppressed)
                            throw conflict
                        }
                        activity.runOnUiThread {
                            try {
                                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                                    addCategory(Intent.CATEGORY_OPENABLE)
                                    type = BACKUP_MIME_TYPE
                                    putExtra(Intent.EXTRA_TITLE, backupFileName())
                                }
                                activity.startActivityForResult(intent, BACKUP_DOCUMENT_REQUEST_CODE)
                            } catch (error: Throwable) {
                                clearPendingExport()?.let { pending ->
                                    runCatching { cleanupExportFile(pending.file) }.exceptionOrNull()?.let(error::addSuppressed)
                                }
                                reject(promise, error)
                            }
                        }
                    } catch (error: Throwable) {
                        reject(promise, error)
                    }
                }
            }
        }

        AsyncFunction("restoreBackup") { sourceUri: String, promise: Promise ->
            val activity = requireActivity(promise) ?: return@AsyncFunction
            VaultRuntime.executor.execute {
                val localCopy = VaultRuntime.repo().restoreTempFile()
                try {
                    val source = Uri.parse(sourceUri)
                    val input = when (source.scheme) {
                        "file" -> FileInputStream(File(requireNotNull(source.path)))
                        else -> activity.contentResolver.openInputStream(source)
                    }
                    requireNotNull(input) { "The selected backup could not be opened." }.use { opened ->
                        copyBackupWithLimit(opened, localCopy)
                    }
                    val descriptor = VaultRuntime.repo().inspectBackup(localCopy)
                    authoriseRestore(activity, descriptor, localCopy, promise)
                } catch (error: Throwable) {
                    runCatching { cleanupRestoreFile(localCopy) }.exceptionOrNull()?.let(error::addSuppressed)
                    reject(promise, error)
                }
            }
        }

        AsyncFunction("setAutoLockSeconds") { seconds: Int ->
            VaultRuntime.repo().setAutoLockSeconds(seconds)
            VaultRuntime.touch()
            VaultRuntime.stateMap()
        }

        AsyncFunction("copySensitive") { value: String, timeoutSeconds: Int ->
            val context = appContext.reactContext ?: error("React context is unavailable")
            SensitiveClipboard.copy(context, value, timeoutSeconds)
            VaultRuntime.touch()
            true
        }

        AsyncFunction("listItemSummaries") {
            VaultRuntime.touch()
            VaultRuntime.repo().listItemSummariesJson()
        }

        AsyncFunction("listItems") {
            VaultRuntime.touch()
            VaultRuntime.repo().listItemsJson()
        }

        AsyncFunction("getItem") { id: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().getItemJson(id)
        }

        AsyncFunction("saveItem") { itemJson: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().upsertItemJson(itemJson)
            true
        }

        AsyncFunction("deleteItem") { id: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().deleteItem(id)
            true
        }

        AsyncFunction("listEntitySummaries") { entityType: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().listEntitySummariesJson(entityType.ifBlank { null })
        }

        AsyncFunction("searchEntities") { query: String, entityType: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().searchEntitiesJson(query, entityType.ifBlank { null })
        }

        AsyncFunction("connectedEntities") { entityId: String, depth: Int ->
            VaultRuntime.touch()
            VaultRuntime.repo().connectedEntitiesJson(entityId, depth)
        }

        AsyncFunction("getEntity") { id: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().getEntityBundleJson(id)
        }

        AsyncFunction("saveEntity") { entityJson: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().upsertEntityBundleJson(entityJson)
            true
        }

        AsyncFunction("deleteEntity") { id: String ->
            VaultRuntime.touch()
            VaultRuntime.repo().deleteEntity(id)
            true
        }

        AsyncFunction("listRenewals") {
            VaultRuntime.touch()
            VaultRuntime.repo().listRenewalsJson()
        }

        AsyncFunction("biometricAvailability") {
            val activity = appContext.currentActivity
                ?: return@AsyncFunction mapOf("available" to false, "reason" to "No active Android activity")
            val code = BiometricController(activity, activity.mainExecutor).availability()
            mapOf(
                "available" to (code == BiometricManager.BIOMETRIC_SUCCESS),
                "code" to code,
                "strongOnly" to true,
            )
        }
    }

    private fun completeBackupDocumentSelection(activity: Activity, resultCode: Int, destination: Uri?) {
        val pending = clearPendingExport() ?: return
        if (resultCode != Activity.RESULT_OK || destination == null) {
            try {
                cleanupExportFile(pending.file)
                rejectCancelled(pending.promise)
            } catch (error: Throwable) {
                reject(pending.promise, error)
            }
            return
        }
        VaultRuntime.executor.execute {
            var completed = false
            try {
                var bytesWritten = 0L
                val output = activity.contentResolver.openOutputStream(destination, "w")
                requireNotNull(output) { "The selected backup destination could not be opened." }.use { opened ->
                    FileInputStream(pending.file).use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        try {
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                opened.write(buffer, 0, count)
                                bytesWritten += count
                            }
                            opened.flush()
                        } finally {
                            buffer.fill(0)
                        }
                    }
                }
                require(bytesWritten == pending.file.length()) { "The backup destination received an incomplete file." }
                cleanupExportFile(pending.file)
                completed = true
                pending.promise.resolve(true)
            } catch (error: Throwable) {
                runCatching { cleanupExportFile(pending.file) }.exceptionOrNull()?.let(error::addSuppressed)
                runCatching { activity.contentResolver.delete(destination, null, null) }.exceptionOrNull()?.let(error::addSuppressed)
                reject(pending.promise, error)
            } finally {
                if (!completed) {
                    runCatching { cleanupExportFile(pending.file) }
                    runCatching { activity.contentResolver.delete(destination, null, null) }
                }
            }
        }
    }

    private fun clearPendingExport(): PendingExport? = synchronized(exportLock) {
        pendingExport.also { pendingExport = null }
    }

    private fun cancelPendingExport(message: String) {
        val pending = clearPendingExport() ?: return
        try {
            cleanupExportFile(pending.file)
            pending.promise.reject("ERR_CANCELLED", message, null)
        } catch (error: Throwable) {
            reject(pending.promise, error)
        }
    }

    private fun cleanupExportFile(file: File) {
        if (!file.exists()) return
        if (file.delete() && !file.exists()) return
        require(VaultRuntime.repo().deleteTemporaryBackup() && !file.exists()) {
            "Temporary backup file could not be deleted"
        }
    }

    private fun cleanupRestoreFile(file: File) {
        if (!file.exists()) return
        if (file.delete() && !file.exists()) return
        require(VaultRuntime.repo().deleteTemporaryRestore() && !file.exists()) {
            "Temporary restore file could not be deleted"
        }
    }

    private fun backupFileName(): String = "life-vault-${System.currentTimeMillis()}.lvault"

    private fun authoriseRestore(
        activity: Activity,
        descriptor: BackupFormat.Descriptor,
        localCopy: File,
        promise: Promise,
    ) {
        if (VaultRuntime.repo().activeManifest() == null) {
            promptRestoreCredentials(activity, descriptor, localCopy, promise)
            return
        }
        SecureDialogs.promptPin(
            activity,
            title = "Authorise vault replacement",
            message = "Enter the current Life Vault PIN before replacing this phone's existing vault.",
            positiveLabel = "Authorise",
        ) { currentPin ->
            if (currentPin == null) {
                try {
                    cleanupRestoreFile(localCopy)
                    rejectCancelled(promise)
                } catch (error: Throwable) {
                    reject(promise, error)
                }
                return@promptPin
            }
            VaultRuntime.executor.execute {
                try {
                    VaultRuntime.repo().verifyPin(currentPin)
                    promptRestoreCredentials(activity, descriptor, localCopy, promise)
                } catch (error: Throwable) {
                    runCatching { cleanupRestoreFile(localCopy) }.exceptionOrNull()?.let(error::addSuppressed)
                    reject(promise, error)
                }
            }
        }
    }

    private fun promptRestoreCredentials(
        activity: Activity,
        descriptor: BackupFormat.Descriptor,
        localCopy: File,
        promise: Promise,
    ) {
        SecureDialogs.promptRecoveryPhrase(
            activity,
            title = "Restore encrypted backup",
            message = "Enter the 24-word recovery phrase belonging to this backup.",
        ) { words ->
            if (words == null) {
                try {
                    cleanupRestoreFile(localCopy)
                    rejectCancelled(promise)
                } catch (error: Throwable) {
                    reject(promise, error)
                }
                return@promptRecoveryPhrase
            }
            SecureDialogs.promptNewPin(
                activity,
                title = "Create a PIN for this phone",
                message = "This PIN is local to this installation and should differ from the phone unlock.",
            ) { newPin ->
                if (newPin == null) {
                    try {
                        cleanupRestoreFile(localCopy)
                        rejectCancelled(promise)
                    } catch (error: Throwable) {
                        reject(promise, error)
                    }
                    return@promptNewPin
                }
                VaultRuntime.executor.execute {
                    var entropy: ByteArray? = null
                    try {
                        entropy = VaultRuntime.repo().decodeRecoveryWords(words)
                        VaultRuntime.repo().restoreBackup(descriptor, entropy, newPin)
                        VaultRuntime.onUnlocked()
                        cleanupRestoreFile(localCopy)
                        promise.resolve(VaultRuntime.stateMap())
                    } catch (error: Throwable) {
                        runCatching { cleanupRestoreFile(localCopy) }.exceptionOrNull()?.let(error::addSuppressed)
                        reject(promise, error)
                    } finally {
                        entropy?.fill(0)
                    }
                }
            }
        }
    }

    private fun copyBackupWithLimit(input: InputStream, destination: File) {
        destination.parentFile?.let { parent ->
            require(parent.isDirectory || parent.mkdirs()) { "Temporary restore directory could not be created" }
            require(parent.isDirectory) { "Temporary restore parent is not a directory" }
        }
        require(!destination.exists()) { "Refusing to overwrite an existing temporary restore file" }
        try {
            FileOutputStream(destination).use { output ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var total = 0L
                try {
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= BackupFormat.MAX_BACKUP_FILE_BYTES) {
                            "The selected backup exceeds the maximum supported size."
                        }
                        output.write(buffer, 0, count)
                    }
                    require(total > 0L) { "The selected backup is empty." }
                    output.flush()
                    output.fd.sync()
                } finally {
                    buffer.fill(0)
                }
            }
        } catch (error: Throwable) {
            if (destination.exists() && (!destination.delete() || destination.exists())) {
                error.addSuppressed(IllegalStateException("Partial temporary restore file could not be deleted"))
            }
            throw error
        }
    }

    private fun promptAndUnlockWithPin(activity: Activity, promise: Promise) {
        SecureDialogs.promptPin(
            activity,
            title = "Unlock Life Vault",
            message = "Enter the separate Life Vault PIN—not your phone unlock.",
            positiveLabel = "Unlock",
        ) { pin ->
            if (pin == null) {
                rejectCancelled(promise)
                return@promptPin
            }
            VaultRuntime.executor.execute {
                try {
                    VaultRuntime.repo().unlockWithPin(pin)
                    VaultRuntime.onUnlocked()
                    promise.resolve(VaultRuntime.stateMap())
                } catch (error: Throwable) {
                    reject(promise, error)
                }
            }
        }
    }

    private fun requireActivity(promise: Promise): Activity? {
        val activity = appContext.currentActivity
        if (activity == null) {
            promise.reject("ERR_NO_ACTIVITY", "No active Android activity is available.", null)
            return null
        }
        secureWindow(activity)
        return activity
    }

    private fun secureWindow(activity: Activity) {
        activity.runOnUiThread {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                activity.window.setHideOverlayWindows(true)
            }
        }
    }

    private fun handleBiometricFailure(promise: Promise, error: Throwable) {
        val invalidated = generateSequence(error as Throwable?) { it.cause }
            .any { it is android.security.keystore.KeyPermanentlyInvalidatedException }
        if (invalidated) {
            runCatching { VaultRuntime.repo().clearInvalidBiometricWrapper() }
                .exceptionOrNull()
                ?.let(error::addSuppressed)
            promise.reject(
                "ERR_BIOMETRIC_INVALIDATED",
                "Biometric enrolment changed. Unlock with the Life Vault PIN and enable biometrics again.",
                error,
            )
        } else {
            reject(promise, error)
        }
    }

    private fun rejectCancelled(promise: Promise) {
        promise.reject("ERR_CANCELLED", "The operation was cancelled.", null)
    }

    private fun reject(promise: Promise, error: Throwable) {
        when (error) {
            is InvalidPinException -> promise.reject(
                "ERR_INVALID_PIN",
                "Incorrect Life Vault PIN. Retry delay: ${error.delayMillis} ms.",
                error,
            )
            is PinLockedException -> promise.reject(
                "ERR_PIN_LOCKED",
                "PIN entry is temporarily locked for ${error.remainingMillis} ms.",
                error,
            )
            is RecoveryRequiredException -> promise.reject("ERR_RECOVERY_REQUIRED", error.message, error)
            else -> promise.reject("ERR_LIFE_VAULT", safeMessage(error), error)
        }
    }

    private fun safeMessage(error: Throwable): String {
        val message = error.message?.trim().orEmpty()
        return if (message.isBlank()) "The secure vault operation failed." else message.take(300)
    }

    companion object {
        private const val BACKUP_DOCUMENT_REQUEST_CODE = 7301
        private const val BACKUP_MIME_TYPE = "application/octet-stream"
    }
}
