package expo.modules.lifevaultnative.storage

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream

class VaultFiles(context: Context) {
    private val root = File(context.noBackupFilesDir, "life_vault").also {
        ensureDirectory(it, "Life Vault storage directory")
    }
    private val activeFile = AtomicFile(File(root, "active_slot"))

    enum class Slot(val value: String) {
        A("a"), B("b");

        fun other(): Slot = if (this == A) B else A

        companion object {
            fun parse(value: String): Slot = entries.firstOrNull { it.value == value }
                ?: throw IllegalArgumentException("Unknown vault slot")
        }
    }

    fun activeSlot(): Slot? {
        val bytes = try {
            activeFile.openRead().use { input ->
                val size = input.channel.size()
                require(size in 1..MAX_ACTIVE_SLOT_BYTES) { "Active vault marker size is invalid" }
                input.readBytes()
            }
        } catch (_: FileNotFoundException) {
            return null
        }
        return try {
            Slot.parse(String(bytes, Charsets.US_ASCII).trim())
        } finally {
            bytes.fill(0)
        }
    }

    fun activeManifest(): VaultManifest? = activeSlot()?.let(::readManifest)

    fun activeDatabase(): File? = activeSlot()?.let(::databaseFile)

    fun slotDir(slot: Slot): File = File(root, "slot_${slot.value}")
    fun databaseFile(slot: Slot): File = File(slotDir(slot), "vault.db")
    private fun manifestFile(slot: Slot): File = File(slotDir(slot), "manifest.json")

    fun prepareInactiveSlot(): Slot {
        val slot = activeSlot()?.other() ?: Slot.A
        deleteSlot(slot)
        ensureDirectory(slotDir(slot), "Vault slot directory")
        return slot
    }

    fun writeManifest(slot: Slot, manifest: VaultManifest) {
        ensureDirectory(slotDir(slot), "Vault slot directory")
        val atomic = AtomicFile(manifestFile(slot))
        val stream = atomic.startWrite()
        try {
            stream.write(manifest.toJson().toString().toByteArray(Charsets.UTF_8))
            stream.fd.sync()
            atomic.finishWrite(stream)
        } catch (error: Exception) {
            atomic.failWrite(stream)
            throw error
        }
    }

    fun readManifest(slot: Slot): VaultManifest {
        val atomic = AtomicFile(manifestFile(slot))
        val bytes = try {
            atomic.openRead().use { input ->
                val size = input.channel.size()
                require(size in 1..MAX_MANIFEST_BYTES) { "Vault manifest size is invalid" }
                input.readBytes()
            }
        } catch (error: FileNotFoundException) {
            throw IllegalStateException("Vault manifest is missing", error)
        }
        return try {
            VaultManifest.fromJson(JSONObject(String(bytes, Charsets.UTF_8)))
        } finally {
            bytes.fill(0)
        }
    }

    fun activate(slot: Slot) {
        // Read through AtomicFile so a valid backup manifest can be recovered
        // before this slot becomes active.
        readManifest(slot)
        require(databaseFile(slot).isFile) { "Encrypted database is missing" }
        val stream = activeFile.startWrite()
        try {
            stream.write(slot.value.toByteArray(Charsets.US_ASCII))
            stream.fd.sync()
            activeFile.finishWrite(stream)
        } catch (error: Exception) {
            activeFile.failWrite(stream)
            throw error
        }
    }

    fun clearActive() {
        activeFile.delete()
        val markerStillReadable = try {
            activeFile.openRead().use { it.read() }
            true
        } catch (_: FileNotFoundException) {
            false
        }
        require(!markerStillReadable) { "Active vault marker could not be cleared" }
    }

    fun updateActiveManifest(transform: (VaultManifest) -> VaultManifest): VaultManifest {
        val slot = activeSlot() ?: error("No active vault")
        val updated = transform(readManifest(slot))
        writeManifest(slot, updated)
        return updated
    }

    fun deleteSlot(slot: Slot) {
        val directory = slotDir(slot)
        if (!directory.exists()) return
        require(directory.deleteRecursively() && !directory.exists()) { "Vault slot could not be deleted" }
    }

    fun cleanupOrphanedSlots(keepActive: Boolean = true): List<VaultManifest> {
        val active = if (keepActive) activeSlot() else null
        // If the activation marker was lost or interrupted, preserve both slots.
        // Deleting them here would turn a recoverable state into permanent data loss.
        if (keepActive && active == null) return emptyList()
        val removed = mutableListOf<VaultManifest>()
        Slot.entries.filter { it != active }.forEach { slot ->
            runCatching { readManifest(slot) }.getOrNull()?.let(removed::add)
            deleteSlot(slot)
        }
        return removed
    }

    fun cleanupTransientFiles() {
        deleteRequired(File(root, "pending_backup.lvb"), "temporary backup")
        deleteRequired(File(root, "pending_restore.lvb"), "temporary restore")
    }

    fun backupTempFile(): File = freshFile("pending_backup.lvb", "temporary backup")

    fun deleteBackupTempFile(): Boolean = deleteIfExists(File(root, "pending_backup.lvb"))

    fun restoreTempFile(): File = freshFile("pending_restore.lvb", "temporary restore")
    fun deleteRestoreTempFile(): Boolean = deleteIfExists(File(root, "pending_restore.lvb"))
    fun preflightDatabaseFile(): File = freshFile("preflight.db", "preflight database")
    fun preflightBackupFile(): File = freshFile("preflight.lvault", "preflight backup")
    fun preflightExtractedFile(): File = freshFile("preflight-restored.db", "preflight extracted database")

    fun cleanupPreflightFiles() {
        deleteRequired(File(root, "preflight.db"), "preflight database")
        deleteRequired(File(root, "preflight.lvault"), "preflight backup")
        deleteRequired(File(root, "preflight-restored.db"), "preflight extracted database")
    }

    fun copyDatabase(source: File, destination: File) {
        require(source.isFile) { "Source encrypted database is missing" }
        destination.parentFile?.let { ensureDirectory(it, "Encrypted database destination directory") }
        require(!destination.exists()) { "Refusing to overwrite an existing encrypted database copy" }
        try {
            source.inputStream().use { input ->
                FileOutputStream(destination).use { output ->
                    input.copyTo(output)
                    output.flush()
                    output.fd.sync()
                }
            }
            require(destination.length() == source.length()) { "Encrypted database copy is incomplete" }
        } catch (error: Throwable) {
            deleteAfterFailure(destination, error)
            throw error
        }
    }

    fun fsync(file: File) {
        require(file.isFile) { "File does not exist for fsync" }
        FileOutputStream(file, true).use { it.fd.sync() }
    }

    private fun freshFile(name: String, label: String): File = File(root, name).also {
        deleteRequired(it, label)
        require(!it.exists()) { "$label could not be prepared" }
    }


    private fun deleteIfExists(file: File): Boolean = !file.exists() || (file.delete() && !file.exists())

    private fun deleteRequired(file: File, label: String) {
        if (!file.exists()) return
        require(file.delete() && !file.exists()) { "$label could not be deleted" }
    }

    private fun deleteAfterFailure(file: File, failure: Throwable) {
        if (file.exists() && (!file.delete() || file.exists())) {
            failure.addSuppressed(IllegalStateException("Partial file could not be deleted: ${file.name}"))
        }
    }

    companion object {
        private const val MAX_ACTIVE_SLOT_BYTES = 16L
        private const val MAX_MANIFEST_BYTES = 64L * 1024L

        private fun ensureDirectory(directory: File, label: String) {
            require(directory.isDirectory || directory.mkdirs()) { "$label could not be created" }
            require(directory.isDirectory) { "$label is not a directory" }
        }
    }
}
