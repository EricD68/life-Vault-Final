package expo.modules.lifevaultnative.session

import expo.modules.lifevaultnative.crypto.ByteOps
import expo.modules.lifevaultnative.storage.VaultDatabase
import expo.modules.lifevaultnative.storage.VaultManifest
import java.io.Closeable

class VaultSession(
    rootKey: ByteArray,
    var manifest: VaultManifest,
    database: VaultDatabase,
) : Closeable {
    private val rootKeyBytes = rootKey.copyOf()
    private var database: VaultDatabase? = database
    @Volatile private var closed = false

    fun rootKeyCopy(): ByteArray {
        check(!closed) { "Vault is locked" }
        return rootKeyBytes.copyOf()
    }

    fun recordCount(): Long = activeDatabase().recordCount()
    fun region(): String = activeDatabase().region()
    fun listItemsJson(): String = activeDatabase().listItemsJson()
    fun listItemSummariesJson(): String = activeDatabase().listItemSummariesJson()
    fun getItemJson(id: String): String? = activeDatabase().getItemJson(id)
    fun upsertItemJson(json: String) = activeDatabase().upsertItemJson(json)
    fun deleteItem(id: String) = activeDatabase().deleteItem(id)

    fun listEntitySummariesJson(entityType: String?): String = activeDatabase().listEntitySummariesJson(entityType)
    fun searchEntitiesJson(query: String, entityType: String?): String = activeDatabase().searchEntitiesJson(query, entityType)
    fun connectedEntitiesJson(entityId: String, depth: Int): String = activeDatabase().connectedEntitiesJson(entityId, depth)
    fun getEntityBundleJson(id: String): String? = activeDatabase().getEntityBundleJson(id)
    fun upsertEntityBundleJson(json: String) = activeDatabase().upsertEntityBundleJson(json)
    fun deleteEntity(id: String) = activeDatabase().deleteEntity(id)
    fun listRenewalsJson(): String = activeDatabase().listRenewalsJson()

    /**
     * Flushes and detaches the database before its encrypted file is copied into
     * a backup. The root key remains in this native session so a verified new
     * connection can be attached immediately afterwards.
     */
    fun detachDatabaseForBackup() {
        check(!closed) { "Vault is locked" }
        val current = activeDatabase()
        current.checkpoint()
        // Detach before close so a close failure cannot leave the session
        // advertising a database handle that is already unusable.
        database = null
        current.close()
    }

    fun replaceDatabase(newDatabase: VaultDatabase) {
        check(!closed) { "Vault is locked" }
        check(database == null) { "The existing encrypted database must be detached before replacement" }
        database = newDatabase
    }

    fun hasOpenDatabase(): Boolean = !closed && database != null

    private fun activeDatabase(): VaultDatabase {
        check(!closed) { "Vault is locked" }
        return database ?: error("The encrypted database is temporarily unavailable")
    }

    override fun close() {
        if (closed) return
        closed = true
        runCatching { database?.close() }
        database = null
        ByteOps.wipe(rootKeyBytes)
    }
}
