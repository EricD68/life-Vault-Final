package expo.modules.lifevaultnative.storage

import android.content.Context
import expo.modules.lifevaultnative.backup.BackupFormat
import expo.modules.lifevaultnative.crypto.AesGcm
import expo.modules.lifevaultnative.crypto.Argon2Kdf
import expo.modules.lifevaultnative.crypto.Bip39
import expo.modules.lifevaultnative.crypto.ByteOps
import expo.modules.lifevaultnative.crypto.CryptoConstants
import expo.modules.lifevaultnative.crypto.Hkdf
import expo.modules.lifevaultnative.crypto.WrappedBlob
import expo.modules.lifevaultnative.security.KeystoreManager
import expo.modules.lifevaultnative.security.RetryGate
import expo.modules.lifevaultnative.security.PinPolicy
import expo.modules.lifevaultnative.session.VaultSession
import java.io.Closeable
import java.io.File
import java.util.Locale
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher

class VaultRepository(private val context: Context) {
    private val files = VaultFiles(context)
    private val keystore = KeystoreManager()
    private val retryGate = RetryGate(context, keystore)
    private val bip39 = Bip39(context)

    private var session: VaultSession? = null

    data class PendingSetup(
        val slot: VaultFiles.Slot,
        val manifest: VaultManifest,
        val phrase: List<String>,
        private val rootKey: ByteArray,
        private val recoveryEntropy: ByteArray,
    ) : Closeable {
        fun rootCopy(): ByteArray = rootKey.copyOf()
        fun entropyCopy(): ByteArray = recoveryEntropy.copyOf()
        override fun close() {
            ByteOps.wipe(rootKey)
            ByteOps.wipe(recoveryEntropy)
        }
    }

    data class UnlockResult(
        val recordCount: Long,
        val manifest: VaultManifest,
        val hardware: KeystoreManager.KeySecurity,
    )

    data class BiometricPreparation(
        val cipher: Cipher,
        val wrapped: WrappedBlob? = null,
    )

    data class PinBlock(val blocked: Boolean, val remainingMillis: Long, val failures: Int)

    @Synchronized
    fun initialise(): Boolean {
        files.cleanupTransientFiles()
        var active = files.activeManifest()
        if (active != null) {
            val biometricAlias = keystore.biometricAlias(active.installId)
            if (active.biometricRootWrapped != null && !keystore.contains(biometricAlias)) {
                active = files.updateActiveManifest { it.copy(biometricRootWrapped = null) }
            } else if (active.biometricRootWrapped == null && keystore.contains(biometricAlias)) {
                // A cancelled or interrupted enrolment must not leave an unused
                // biometric key behind in the Android Keystore.
                keystore.delete(biometricAlias)
            }
        }
        val removed = files.cleanupOrphanedSlots(keepActive = true)
        removed.forEach { keystore.deleteInstallationKeys(it.installId) }
        return active != null
    }

    @Synchronized
    fun activeManifest(): VaultManifest? = files.activeManifest()

    /**
     * Runs an isolated SQLCipher/schema/search/backup round-trip before first
     * setup. This catches native database integration faults before the user is
     * asked to record a recovery phrase.
     */
    @Synchronized
    fun runPreflightChecks() {
        check(files.activeSlot() == null) { "Preflight is only required before first setup" }
        files.cleanupPreflightFiles()
        val root = ByteOps.randomBytes(CryptoConstants.ROOT_KEY_BYTES)
        val entropy = ByteOps.randomBytes(32)
        val vaultId = "preflight-${UUID.randomUUID()}"
        val preflightInstallId = "preflight-${UUID.randomUUID()}"
        val databaseFile = files.preflightDatabaseFile()
        val backupFile = files.preflightBackupFile()
        val extractedFile = files.preflightExtractedFile()
        var operationFailure: Throwable? = null
        try {
            // Exercise the two portable primitives that setup depends on before
            // the user creates a PIN or writes down recovery words.
            val phrase = bip39.encode24(entropy)
            val decodedEntropy = bip39.decode24(phrase)
            try {
                require(ByteOps.constantTimeEquals(entropy, decodedEntropy)) { "Recovery phrase self-test failed" }
            } finally {
                ByteOps.wipe(decodedEntropy)
            }
            val testPin = "82736491".toByteArray(Charsets.US_ASCII)
            val testSalt = ByteOps.randomBytes(CryptoConstants.PIN_SALT_BYTES)
            val argonResult = try {
                Argon2Kdf.derive(testPin, testSalt)
            } finally {
                ByteOps.wipe(testPin)
                ByteOps.wipe(testSalt)
            }
            try {
                require(argonResult.size == 32) { "PIN derivation self-test failed" }
            } finally {
                ByteOps.wipe(argonResult)
            }

            val deviceSecurity = keystore.generateDeviceKey(keystore.deviceAlias(preflightInstallId))
            require(deviceSecurity.hardwareBacked) { "This phone did not provide a hardware-backed Android Keystore." }
            val retrySecurity = keystore.generateRetryHmacKey(keystore.retryAlias(preflightInstallId))
            require(retrySecurity.hardwareBacked) { "This phone did not provide hardware-backed retry-state protection." }
            val testSecret = ByteOps.randomBytes(CryptoConstants.DEVICE_SECRET_BYTES)
            try {
                val wrapped = keystore.encrypt(
                    keystore.deviceAlias(preflightInstallId),
                    testSecret,
                    CryptoConstants.AAD_DEVICE_SECRET,
                )
                val recovered = keystore.decrypt(
                    keystore.deviceAlias(preflightInstallId),
                    wrapped,
                    CryptoConstants.AAD_DEVICE_SECRET,
                )
                try {
                    require(ByteOps.constantTimeEquals(testSecret, recovered)) { "Android Keystore self-test failed" }
                    val retryTag = keystore.hmac(keystore.retryAlias(preflightInstallId), testSecret)
                    try {
                        require(retryTag.size == 32) { "Retry-state authentication self-test failed" }
                    } finally {
                        ByteOps.wipe(retryTag)
                    }
                } finally {
                    ByteOps.wipe(recovered)
                }
            } finally {
                ByteOps.wipe(testSecret)
            }

            VaultDatabase.create(databaseFile, root, vaultId, "ALL").use { database ->
                val now = java.time.Instant.now().toString()
                val projectId = "preflight-project"
                val accountId = "preflight-account"
                database.upsertEntityBundleJson(
                    JSONObject()
                        .put("id", projectId)
                        .put("entityType", "project")
                        .put("subtype", "project_app")
                        .put("category", "projects")
                        .put("name", "Preflight Project")
                        .put("description", "Database self-test")
                        .put("status", "")
                        .put("environment", "test")
                        .put("website", "")
                        .put("loginUrl", "")
                        .put("notes", "")
                        .put("aliases", JSONArray())
                        .put("tags", JSONArray().put("preflight"))
                        .put("favourite", false)
                        .put("createdAt", now)
                        .put("updatedAt", now)
                        .put("attributes", JSONArray())
                        .put("credentials", JSONArray())
                        .put("identifiers", JSONArray())
                        .put("renewals", JSONArray())
                        .put("relationships", JSONArray())
                        .toString()
                )
                database.upsertEntityBundleJson(
                    JSONObject()
                        .put("id", accountId)
                        .put("entityType", "account")
                        .put("subtype", "platform_account")
                        .put("category", "business")
                        .put("name", "Preflight Account")
                        .put("description", "")
                        .put("status", "")
                        .put("environment", "test")
                        .put("website", "")
                        .put("loginUrl", "")
                        .put("notes", "")
                        .put("aliases", JSONArray())
                        .put("tags", JSONArray())
                        .put("favourite", false)
                        .put("createdAt", now)
                        .put("updatedAt", now)
                        .put("attributes", JSONArray())
                        .put("credentials", JSONArray().put(
                            JSONObject()
                                .put("id", "preflight-credential")
                                .put("type", "login")
                                .put("label", "Login")
                                .put("username", "preflight@example.invalid")
                                .put("secret", "dummy-only")
                                .put("notes", "")
                                .put("sortOrder", 0)
                        ))
                        .put("identifiers", JSONArray())
                        .put("renewals", JSONArray())
                        .put("relationships", JSONArray().put(
                            JSONObject()
                                .put("id", "preflight-relationship")
                                .put("type", "used_by_project")
                                .put("toEntityId", projectId)
                                .put("label", "")
                                .put("notes", "")
                        ))
                        .toString()
                )
                val search = database.searchEntitiesJson("Preflight", null)
                require(search.contains(projectId) && search.contains(accountId)) {
                    "Relational search self-test failed"
                }
            }
            VaultDatabase.open(databaseFile, root, vaultId).use { it.validate(vaultId) }

            val recoveryKey = Hkdf.sha256(
                ikm = entropy,
                info = CryptoConstants.INFO_RECOVERY_WRAP.toByteArray(Charsets.UTF_8),
                length = 32,
            )
            val recoveryWrapped = try {
                AesGcm.encrypt(recoveryKey, root, CryptoConstants.AAD_RECOVERY_ROOT)
            } finally {
                ByteOps.wipe(recoveryKey)
            }
            BackupFormat.write(
                destination = backupFile,
                databaseFile = databaseFile,
                manifest = BackupFormat.BackupManifest(
                    backupVersion = CryptoConstants.BACKUP_VERSION,
                    vaultId = vaultId,
                    createdAtEpochMillis = System.currentTimeMillis(),
                    recoveryRootWrapped = recoveryWrapped,
                ),
                rootKey = root,
            )
            val descriptor = BackupFormat.inspect(backupFile)
            BackupFormat.verify(descriptor, root)
            BackupFormat.extractDatabase(descriptor, extractedFile)
            VaultDatabase.open(extractedFile, root, vaultId).use { restored ->
                require(restored.recordCount() == 2L) { "Backup restore self-test failed" }
            }
        } catch (error: Throwable) {
            operationFailure = error
            throw error
        } finally {
            ByteOps.wipe(root)
            ByteOps.wipe(entropy)
            var cleanupFailure: Throwable? = null
            try {
                keystore.deleteInstallationKeys(preflightInstallId)
            } catch (error: Throwable) {
                cleanupFailure = error
            }
            try {
                files.cleanupPreflightFiles()
            } catch (error: Throwable) {
                val first = cleanupFailure
                if (first == null) cleanupFailure = error else first.addSuppressed(error)
            }
            val primary = operationFailure
            if (primary != null) {
                cleanupFailure?.let(primary::addSuppressed)
            } else {
                cleanupFailure?.let { throw it }
            }
        }
    }

    @Synchronized
    fun decodeRecoveryWords(words: List<String>): ByteArray = bip39.decode24(words)

    @Synchronized
    fun pinBlockStatus(): PinBlock {
        val manifest = files.activeManifest() ?: return PinBlock(false, 0, 0)
        val status = retryGate.status(manifest.installId)
        return PinBlock(!status.allowed, status.remainingMillis, status.failures)
    }

    @Synchronized
    fun prepareNewVault(pinDigits: List<Int>, region: String): PendingSetup {
        require(region in setOf("UK", "US", "ALL")) { "Unsupported region" }
        require(PinPolicy.validate(pinDigits).valid) { PinPolicy.validate(pinDigits).message ?: "PIN is not permitted." }
        check(files.activeSlot() == null) { "A vault already exists" }
        files.cleanupOrphanedSlots(keepActive = false).forEach { keystore.deleteInstallationKeys(it.installId) }

        val pinBytes = ByteOps.pinDigitsToBytes(pinDigits)
        val rootKey = ByteOps.randomBytes(CryptoConstants.ROOT_KEY_BYTES)
        val generated = bip39.generate24Words()
        val installId = UUID.randomUUID().toString()
        val vaultId = UUID.randomUUID().toString()
        val slot = files.prepareInactiveSlot()

        try {
            val manifest = buildManifest(
                installId = installId,
                vaultId = vaultId,
                createdAt = System.currentTimeMillis(),
                pinBytes = pinBytes,
                rootKey = rootKey,
                recoveryEntropy = generated.entropy,
                autoLockSeconds = 60,
            )
            VaultDatabase.create(files.databaseFile(slot), rootKey, vaultId, region).use { it.validate(vaultId) }
            files.writeManifest(slot, manifest)
            files.fsync(files.databaseFile(slot))
            VaultDatabase.open(files.databaseFile(slot), rootKey, vaultId).use { it.validate(vaultId) }
            return PendingSetup(slot, manifest, generated.phrase, rootKey, generated.entropy)
        } catch (error: Exception) {
            runCatching { files.deleteSlot(slot) }.exceptionOrNull()?.let(error::addSuppressed)
            runCatching { keystore.deleteInstallationKeys(installId) }.exceptionOrNull()?.let(error::addSuppressed)
            ByteOps.wipe(rootKey)
            ByteOps.wipe(generated.entropy)
            throw error
        } finally {
            ByteOps.wipe(pinBytes)
        }
    }

    @Synchronized
    fun commitNewVault(pending: PendingSetup, enteredWords: List<String>): UnlockResult {
        require(enteredWords.size == 24 && enteredWords.map { it.lowercase(Locale.ROOT).trim() } == pending.phrase) {
            "The recovery phrase does not match. Enter all 24 words in order."
        }
        val root = pending.rootCopy()
        var database: VaultDatabase? = null
        var newSession: VaultSession? = null
        var activated = false
        try {
            database = VaultDatabase.open(files.databaseFile(pending.slot), root, pending.manifest.vaultId).also {
                it.validate(pending.manifest.vaultId)
            }
            val result = unlockResult(database, pending.manifest)
            retryGate.reset(pending.manifest.installId)
            newSession = VaultSession(root, pending.manifest, database)
            database = null

            // Activation is the final durable step. Everything that can fail has
            // already been validated above.
            files.activate(pending.slot)
            activated = true
            session?.close()
            session = newSession
            newSession = null
            pending.close()
            return result
        } catch (error: Exception) {
            database?.close()
            newSession?.close()
            if (activated) {
                files.clearActive()
                session?.close()
                session = null
            }
            throw error
        } finally {
            ByteOps.wipe(root)
        }
    }

    @Synchronized
    fun abortSetup(pending: PendingSetup?) {
        if (pending == null) return
        var failure: Throwable? = null
        try {
            files.deleteSlot(pending.slot)
        } catch (error: Throwable) {
            failure = error
        }
        try {
            keystore.deleteInstallationKeys(pending.manifest.installId)
        } catch (error: Throwable) {
            val firstFailure = failure
            if (firstFailure == null) failure = error else firstFailure.addSuppressed(error)
        } finally {
            pending.close()
        }
        failure?.let { throw it }
    }

    @Synchronized
    fun unlockWithPin(pinDigits: List<Int>): UnlockResult {
        val manifest = files.activeManifest() ?: error("No vault exists")
        val root = rootFromPin(manifest, pinDigits, enforceRetryGate = true)
        var database: VaultDatabase? = null
        var newSession: VaultSession? = null
        try {
            val databaseFile = files.activeDatabase() ?: error("Encrypted database is missing")
            database = VaultDatabase.open(databaseFile, root, manifest.vaultId)
            val result = unlockResult(database, manifest)
            newSession = VaultSession(root, manifest, database)
            database = null
            session?.close()
            session = newSession
            newSession = null
            return result
        } finally {
            database?.close()
            newSession?.close()
            ByteOps.wipe(root)
        }
    }

    @Synchronized
    fun prepareBiometricUnlock(): BiometricPreparation {
        val manifest = files.activeManifest() ?: error("No vault exists")
        val wrapped = manifest.biometricRootWrapped ?: error("Biometric unlock is not enabled")
        val alias = keystore.biometricAlias(manifest.installId)
        if (!keystore.contains(alias)) {
            // Do not leave the UI advertising a biometric route whose hardware
            // key has disappeared after restore, OS reset or enrolment changes.
            files.updateActiveManifest { it.copy(biometricRootWrapped = null) }
            keystore.delete(alias)
            error("The biometric key is unavailable. Unlock with the Life Vault PIN and enable biometrics again.")
        }
        return BiometricPreparation(
            cipher = keystore.prepareBiometricDecrypt(alias, wrapped, CryptoConstants.AAD_BIOMETRIC_ROOT),
            wrapped = wrapped,
        )
    }

    @Synchronized
    fun completeBiometricUnlock(preparation: BiometricPreparation): UnlockResult {
        val manifest = files.activeManifest() ?: error("No vault exists")
        val wrapped = preparation.wrapped ?: error("Missing biometric wrapper")
        val root = preparation.cipher.doFinal(wrapped.ciphertext)
        var database: VaultDatabase? = null
        var newSession: VaultSession? = null
        try {
            require(root.size == CryptoConstants.ROOT_KEY_BYTES)
            database = VaultDatabase.open(
                files.activeDatabase() ?: error("Encrypted database is missing"),
                root,
                manifest.vaultId,
            )
            val result = unlockResult(database, manifest)
            newSession = VaultSession(root, manifest, database)
            database = null
            retryGate.reset(manifest.installId)
            session?.close()
            session = newSession
            newSession = null
            return result
        } finally {
            database?.close()
            newSession?.close()
            ByteOps.wipe(root)
        }
    }

    @Synchronized
    fun prepareBiometricEnrollment(): BiometricPreparation {
        val current = requireSession()
        require(current.manifest.biometricRootWrapped == null) { "Biometric unlock is already enabled" }
        val alias = keystore.biometricAlias(current.manifest.installId)
        keystore.delete(alias)
        try {
            val security = keystore.generateBiometricKey(alias)
            require(security.hardwareBacked) {
                "This phone did not provide hardware-backed biometric key protection."
            }
            return BiometricPreparation(
                cipher = keystore.prepareBiometricEncrypt(alias, CryptoConstants.AAD_BIOMETRIC_ROOT),
            )
        } catch (error: Exception) {
            keystore.delete(alias)
            throw error
        }
    }

    @Synchronized
    fun completeBiometricEnrollment(preparation: BiometricPreparation): VaultManifest {
        val current = requireSession()
        val root = current.rootKeyCopy()
        try {
            val ciphertext = preparation.cipher.doFinal(root)
            val wrapped = WrappedBlob(preparation.cipher.iv, ciphertext)
            val updated = files.updateActiveManifest { it.copy(biometricRootWrapped = wrapped) }
            current.manifest = updated
            return updated
        } catch (error: Exception) {
            keystore.delete(keystore.biometricAlias(current.manifest.installId))
            throw error
        } finally {
            ByteOps.wipe(root)
        }
    }

    @Synchronized
    fun cancelBiometricEnrollment() {
        val manifest = files.activeManifest() ?: return
        keystore.delete(keystore.biometricAlias(manifest.installId))
    }

    @Synchronized
    fun disableBiometrics(): VaultManifest {
        val current = requireSession()
        val updated = files.updateActiveManifest { it.copy(biometricRootWrapped = null) }
        current.manifest = updated
        runCatching { keystore.delete(keystore.biometricAlias(current.manifest.installId)) }
        return updated
    }

    @Synchronized
    fun clearInvalidBiometricWrapper() {
        val manifest = files.activeManifest() ?: return
        files.updateActiveManifest { it.copy(biometricRootWrapped = null) }
        keystore.delete(keystore.biometricAlias(manifest.installId))
    }

    @Synchronized
    fun verifyPin(pinDigits: List<Int>): Boolean {
        val manifest = files.activeManifest() ?: error("No vault exists")
        val verifiedRoot = rootFromPin(manifest, pinDigits, enforceRetryGate = true)
        try {
            val current = session
            if (current != null) {
                val sessionRoot = current.rootKeyCopy()
                try {
                    require(ByteOps.constantTimeEquals(verifiedRoot, sessionRoot)) { "PIN verification failed" }
                } finally {
                    ByteOps.wipe(sessionRoot)
                }
            }
            return true
        } finally {
            ByteOps.wipe(verifiedRoot)
        }
    }

    @Synchronized
    fun changePin(currentPin: List<Int>, newPin: List<Int>): VaultManifest {
        require(PinPolicy.validate(newPin).valid) { PinPolicy.validate(newPin).message ?: "PIN is not permitted." }
        val current = requireSession()
        val verifiedRoot = rootFromPin(current.manifest, currentPin, enforceRetryGate = true)
        val sessionRoot = current.rootKeyCopy()
        try {
            require(ByteOps.constantTimeEquals(verifiedRoot, sessionRoot)) { "PIN verification failed" }
            val deviceSecret = keystore.decrypt(
                keystore.deviceAlias(current.manifest.installId),
                current.manifest.deviceSecretWrapped,
                CryptoConstants.AAD_DEVICE_SECRET,
            )
            val newPinBytes = ByteOps.pinDigitsToBytes(newPin)
            try {
                val salt = ByteOps.randomBytes(CryptoConstants.PIN_SALT_BYTES)
                val wrapped = wrapRootWithPin(newPinBytes, salt, deviceSecret, sessionRoot)
                val updated = files.updateActiveManifest {
                    it.copy(pinSalt = salt, pinRootWrapped = wrapped)
                }
                current.manifest = updated
                retryGate.reset(updated.installId)
                return updated
            } finally {
                ByteOps.wipe(newPinBytes)
                ByteOps.wipe(deviceSecret)
            }
        } finally {
            ByteOps.wipe(verifiedRoot)
            ByteOps.wipe(sessionRoot)
        }
    }

    @Synchronized
    fun recoverLocalVault(recoveryEntropy: ByteArray, newPin: List<Int>): UnlockResult {
        require(PinPolicy.validate(newPin).valid) { PinPolicy.validate(newPin).message ?: "PIN is not permitted." }
        val oldSlot = files.activeSlot() ?: error("No vault exists")
        val old = files.readManifest(oldSlot)
        val oldDatabase = files.databaseFile(oldSlot)
        val entropy = recoveryEntropy.copyOf()
        val root = rootFromRecovery(entropy, old.recoveryRootWrapped)
        val newInstallId = UUID.randomUUID().toString()
        val newPinBytes = ByteOps.pinDigitsToBytes(newPin)
        val slot = files.prepareInactiveSlot()
        var database: VaultDatabase? = null
        var newSession: VaultSession? = null
        var activated = false
        try {
            // Close any live handle before copying the encrypted database file.
            session?.close()
            session = null
            VaultDatabase.open(oldDatabase, root, old.vaultId).use { it.validate(old.vaultId) }
            files.copyDatabase(oldDatabase, files.databaseFile(slot))
            val newManifest = buildManifest(
                installId = newInstallId,
                vaultId = old.vaultId,
                createdAt = old.createdAtEpochMillis,
                pinBytes = newPinBytes,
                rootKey = root,
                recoveryEntropy = entropy,
                autoLockSeconds = old.autoLockSeconds,
            )
            files.writeManifest(slot, newManifest)
            database = VaultDatabase.open(files.databaseFile(slot), root, old.vaultId).also { it.validate(old.vaultId) }
            val result = unlockResult(database, newManifest)
            retryGate.reset(newManifest.installId)
            newSession = VaultSession(root, newManifest, database)
            database = null

            files.activate(slot)
            activated = true
            session = newSession
            newSession = null

            // Cleanup is deliberately best-effort and happens only after the new
            // installation is fully active and usable.
            runCatching { keystore.deleteInstallationKeys(old.installId) }
            runCatching { retryGate.reset(old.installId) }
            runCatching { files.cleanupOrphanedSlots(keepActive = true) }
            return result
        } catch (error: Exception) {
            database?.close()
            newSession?.close()
            if (!activated) {
                runCatching { files.deleteSlot(slot) }.exceptionOrNull()?.let(error::addSuppressed)
                runCatching { keystore.deleteInstallationKeys(newInstallId) }.exceptionOrNull()?.let(error::addSuppressed)
            }
            throw error
        } finally {
            ByteOps.wipe(entropy)
            ByteOps.wipe(root)
            ByteOps.wipe(newPinBytes)
        }
    }

    @Synchronized
    fun createBackup(reAuthenticationPin: List<Int>): File {
        val current = requireSession()
        val verifiedRoot = rootFromPin(current.manifest, reAuthenticationPin, enforceRetryGate = true)
        val sessionRoot = current.rootKeyCopy()
        val databaseFile = files.activeDatabase() ?: error("Encrypted database is missing")
        val destination = files.backupTempFile()
        var operationFailure: Throwable? = null
        var reopenFailure: Throwable? = null
        try {
            require(ByteOps.constantTimeEquals(verifiedRoot, sessionRoot)) { "PIN verification failed" }
            try {
                current.detachDatabaseForBackup()
                BackupFormat.write(
                    destination = destination,
                    databaseFile = databaseFile,
                    manifest = BackupFormat.BackupManifest(
                        backupVersion = CryptoConstants.BACKUP_VERSION,
                        vaultId = current.manifest.vaultId,
                        createdAtEpochMillis = System.currentTimeMillis(),
                        recoveryRootWrapped = current.manifest.recoveryRootWrapped,
                    ),
                    rootKey = sessionRoot,
                )
            } catch (error: Throwable) {
                operationFailure = error
            } finally {
                if (!current.hasOpenDatabase()) {
                    try {
                        current.replaceDatabase(VaultDatabase.open(databaseFile, sessionRoot, current.manifest.vaultId))
                    } catch (error: Throwable) {
                        reopenFailure = error
                        session?.close()
                        session = null
                    }
                }
            }

            if (operationFailure != null) {
                reopenFailure?.let(operationFailure::addSuppressed)
                throw operationFailure
            }
            if (reopenFailure != null) {
                throw reopenFailure
            }
            require(destination.exists() && destination.length() > 0L) { "Backup file was not created" }
            // Read the file back before exposing it to Android's document picker.
            val descriptor = BackupFormat.inspect(destination)
            BackupFormat.verify(descriptor, sessionRoot)
            return destination
        } catch (error: Throwable) {
            if (!files.deleteBackupTempFile()) {
                error.addSuppressed(IllegalStateException("Temporary backup file could not be deleted"))
            }
            throw error
        } finally {
            ByteOps.wipe(verifiedRoot)
            ByteOps.wipe(sessionRoot)
        }
    }

    @Synchronized
    fun deleteTemporaryBackup(): Boolean = files.deleteBackupTempFile()

    @Synchronized
    fun restoreTempFile(): File = files.restoreTempFile()

    @Synchronized
    fun deleteTemporaryRestore(): Boolean = files.deleteRestoreTempFile()

    @Synchronized
    fun inspectBackup(file: File): BackupFormat.Descriptor = BackupFormat.inspect(file)

    @Synchronized
    fun restoreBackup(
        descriptor: BackupFormat.Descriptor,
        recoveryEntropy: ByteArray,
        newPin: List<Int>,
    ): UnlockResult {
        require(PinPolicy.validate(newPin).valid) { PinPolicy.validate(newPin).message ?: "PIN is not permitted." }
        val entropy = recoveryEntropy.copyOf()
        val root = rootFromRecovery(entropy, descriptor.manifest.recoveryRootWrapped)
        val newPinBytes = ByteOps.pinDigitsToBytes(newPin)
        val newInstallId = UUID.randomUUID().toString()
        val oldManifest = files.activeManifest()
        val slot = files.prepareInactiveSlot()
        var database: VaultDatabase? = null
        var newSession: VaultSession? = null
        var activated = false
        try {
            BackupFormat.verify(descriptor, root)
            BackupFormat.extractDatabase(descriptor, files.databaseFile(slot))
            VaultDatabase.open(files.databaseFile(slot), root, descriptor.manifest.vaultId).use {
                it.validate(descriptor.manifest.vaultId)
            }
            val manifest = buildManifest(
                installId = newInstallId,
                vaultId = descriptor.manifest.vaultId,
                createdAt = descriptor.manifest.createdAtEpochMillis,
                pinBytes = newPinBytes,
                rootKey = root,
                recoveryEntropy = entropy,
                autoLockSeconds = oldManifest?.autoLockSeconds ?: 60,
            )
            files.writeManifest(slot, manifest)
            database = VaultDatabase.open(files.databaseFile(slot), root, manifest.vaultId).also {
                it.validate(manifest.vaultId)
            }
            val result = unlockResult(database, manifest)
            retryGate.reset(manifest.installId)
            newSession = VaultSession(root, manifest, database)
            database = null

            // Ensure the old database has no live handle before the slot switch.
            session?.close()
            session = null
            files.activate(slot)
            activated = true
            session = newSession
            newSession = null

            oldManifest?.let {
                runCatching { keystore.deleteInstallationKeys(it.installId) }
                runCatching { retryGate.reset(it.installId) }
            }
            runCatching { files.cleanupOrphanedSlots(keepActive = true) }
            return result
        } catch (error: Exception) {
            database?.close()
            newSession?.close()
            if (!activated) {
                runCatching { files.deleteSlot(slot) }.exceptionOrNull()?.let(error::addSuppressed)
                runCatching { keystore.deleteInstallationKeys(newInstallId) }.exceptionOrNull()?.let(error::addSuppressed)
            }
            throw error
        } finally {
            ByteOps.wipe(entropy)
            ByteOps.wipe(root)
            ByteOps.wipe(newPinBytes)
        }
    }

    @Synchronized
    fun setAutoLockSeconds(seconds: Int): VaultManifest {
        require(seconds in setOf(30, 60, 120, 300))
        val current = requireSession()
        val updated = files.updateActiveManifest { it.copy(autoLockSeconds = seconds) }
        current.manifest = updated
        return updated
    }

    @Synchronized
    fun recordCount(): Long = requireSession().recordCount()

    @Synchronized
    fun region(): String = requireSession().region()

    @Synchronized
    fun listItemsJson(): String = requireSession().listItemsJson()

    @Synchronized
    fun listItemSummariesJson(): String = requireSession().listItemSummariesJson()

    @Synchronized
    fun getItemJson(id: String): String? = requireSession().getItemJson(id)

    @Synchronized
    fun upsertItemJson(itemJson: String) { requireSession().upsertItemJson(itemJson) }

    @Synchronized
    fun deleteItem(id: String) { requireSession().deleteItem(id) }

    @Synchronized
    fun listEntitySummariesJson(entityType: String?): String = requireSession().listEntitySummariesJson(entityType)

    @Synchronized
    fun searchEntitiesJson(query: String, entityType: String?): String = requireSession().searchEntitiesJson(query, entityType)

    @Synchronized
    fun connectedEntitiesJson(entityId: String, depth: Int): String = requireSession().connectedEntitiesJson(entityId, depth)

    @Synchronized
    fun getEntityBundleJson(id: String): String? = requireSession().getEntityBundleJson(id)

    @Synchronized
    fun upsertEntityBundleJson(json: String) { requireSession().upsertEntityBundleJson(json) }

    @Synchronized
    fun deleteEntity(id: String) { requireSession().deleteEntity(id) }

    @Synchronized
    fun listRenewalsJson(): String = requireSession().listRenewalsJson()

    @Synchronized
    fun lock() {
        session?.close()
        session = null
    }

    @Synchronized
    fun isUnlocked(): Boolean = session != null

    @Synchronized
    fun currentManifest(): VaultManifest = requireSession().manifest

    @Synchronized
    fun hardwareSecurity(): KeystoreManager.KeySecurity {
        val manifest = files.activeManifest() ?: return KeystoreManager.KeySecurity(false, false)
        return keystore.keySecurity(keystore.deviceAlias(manifest.installId))
    }

    private fun buildManifest(
        installId: String,
        vaultId: String,
        createdAt: Long,
        pinBytes: ByteArray,
        rootKey: ByteArray,
        recoveryEntropy: ByteArray,
        autoLockSeconds: Int,
    ): VaultManifest {
        val deviceAlias = keystore.deviceAlias(installId)
        val deviceSecurity = keystore.generateDeviceKey(deviceAlias)
        require(deviceSecurity.hardwareBacked) {
            "Life Vault requires a hardware-backed Android Keystore on this phone."
        }
        val retrySecurity = keystore.generateRetryHmacKey(keystore.retryAlias(installId))
        require(retrySecurity.hardwareBacked) {
            "Life Vault requires hardware-backed retry-state authentication on this phone."
        }
        val deviceSecret = ByteOps.randomBytes(CryptoConstants.DEVICE_SECRET_BYTES)
        val pinSalt = ByteOps.randomBytes(CryptoConstants.PIN_SALT_BYTES)
        try {
            val deviceWrapped = keystore.encrypt(deviceAlias, deviceSecret, CryptoConstants.AAD_DEVICE_SECRET)
            val pinWrapped = wrapRootWithPin(pinBytes, pinSalt, deviceSecret, rootKey)
            val recoveryKey = Hkdf.sha256(
                ikm = recoveryEntropy,
                info = CryptoConstants.INFO_RECOVERY_WRAP.toByteArray(Charsets.UTF_8),
                length = 32,
            )
            val recoveryWrapped = try {
                AesGcm.encrypt(recoveryKey, rootKey, CryptoConstants.AAD_RECOVERY_ROOT)
            } finally {
                ByteOps.wipe(recoveryKey)
            }
            return VaultManifest(
                installId = installId,
                vaultId = vaultId,
                createdAtEpochMillis = createdAt,
                pinSalt = pinSalt,
                argonMemoryKb = CryptoConstants.ARGON_MEMORY_KB,
                argonIterations = CryptoConstants.ARGON_ITERATIONS,
                argonParallelism = CryptoConstants.ARGON_PARALLELISM,
                deviceSecretWrapped = deviceWrapped,
                pinRootWrapped = pinWrapped,
                recoveryRootWrapped = recoveryWrapped,
                biometricRootWrapped = null,
                autoLockSeconds = autoLockSeconds,
            )
        } finally {
            ByteOps.wipe(deviceSecret)
        }
    }

    private fun wrapRootWithPin(
        pinBytes: ByteArray,
        pinSalt: ByteArray,
        deviceSecret: ByteArray,
        rootKey: ByteArray,
    ): WrappedBlob {
        val argon = Argon2Kdf.derive(pinBytes, pinSalt)
        val input = ByteOps.concat(argon, deviceSecret)
        val wrapKey = Hkdf.sha256(
            ikm = input,
            salt = pinSalt,
            info = CryptoConstants.INFO_PIN_WRAP.toByteArray(Charsets.UTF_8),
            length = 32,
        )
        try {
            return AesGcm.encrypt(wrapKey, rootKey, CryptoConstants.AAD_PIN_ROOT)
        } finally {
            ByteOps.wipe(argon)
            ByteOps.wipe(input)
            ByteOps.wipe(wrapKey)
        }
    }

    private fun rootFromPin(
        manifest: VaultManifest,
        pinDigits: List<Int>,
        enforceRetryGate: Boolean,
    ): ByteArray {
        if (enforceRetryGate) {
            val status = retryGate.status(manifest.installId)
            if (!status.allowed) throw PinLockedException(status.remainingMillis)
        }
        val pinBytes = ByteOps.pinDigitsToBytes(pinDigits)
        val deviceSecret = try {
            keystore.decrypt(
                keystore.deviceAlias(manifest.installId),
                manifest.deviceSecretWrapped,
                CryptoConstants.AAD_DEVICE_SECRET,
            )
        } catch (error: Exception) {
            ByteOps.wipe(pinBytes)
            throw RecoveryRequiredException("This installation's hardware key is unavailable. Restore access with the recovery phrase.", error)
        }
        try {
            val argon = Argon2Kdf.derive(
                pinBytes,
                manifest.pinSalt,
                manifest.argonMemoryKb,
                manifest.argonIterations,
                manifest.argonParallelism,
            )
            val input = ByteOps.concat(argon, deviceSecret)
            val wrapKey = Hkdf.sha256(
                ikm = input,
                salt = manifest.pinSalt,
                info = CryptoConstants.INFO_PIN_WRAP.toByteArray(Charsets.UTF_8),
                length = 32,
            )
            try {
                val root = AesGcm.decrypt(wrapKey, manifest.pinRootWrapped, CryptoConstants.AAD_PIN_ROOT)
                try {
                    require(root.size == CryptoConstants.ROOT_KEY_BYTES)
                    retryGate.reset(manifest.installId)
                    return root
                } catch (error: Throwable) {
                    ByteOps.wipe(root)
                    throw error
                }
            } catch (error: AEADBadTagException) {
                val status = retryGate.recordFailure(manifest.installId)
                throw InvalidPinException(status.remainingMillis, status.failures)
            } finally {
                ByteOps.wipe(argon)
                ByteOps.wipe(input)
                ByteOps.wipe(wrapKey)
            }
        } finally {
            ByteOps.wipe(pinBytes)
            ByteOps.wipe(deviceSecret)
        }
    }

    private fun rootFromRecovery(entropy: ByteArray, wrapped: WrappedBlob): ByteArray {
        val recoveryKey = Hkdf.sha256(
            ikm = entropy,
            info = CryptoConstants.INFO_RECOVERY_WRAP.toByteArray(Charsets.UTF_8),
            length = 32,
        )
        try {
            return try {
                AesGcm.decrypt(recoveryKey, wrapped, CryptoConstants.AAD_RECOVERY_ROOT)
            } catch (error: AEADBadTagException) {
                throw IllegalArgumentException("The recovery phrase does not belong to this vault or backup.", error)
            }
        } finally {
            ByteOps.wipe(recoveryKey)
        }
    }

    private fun unlockResult(current: VaultSession): UnlockResult = UnlockResult(
        recordCount = current.recordCount(),
        manifest = current.manifest,
        hardware = keystore.keySecurity(keystore.deviceAlias(current.manifest.installId)),
    )

    private fun unlockResult(database: VaultDatabase, manifest: VaultManifest): UnlockResult = UnlockResult(
        recordCount = database.recordCount(),
        manifest = manifest,
        hardware = keystore.keySecurity(keystore.deviceAlias(manifest.installId)),
    )

    private fun requireSession(): VaultSession = session ?: error("Vault is locked")
}

class InvalidPinException(val delayMillis: Long, val failures: Int) : Exception("Incorrect Life Vault PIN")
class PinLockedException(val remainingMillis: Long) : Exception("PIN entry is temporarily locked")
class RecoveryRequiredException(message: String, cause: Throwable? = null) : Exception(message, cause)
