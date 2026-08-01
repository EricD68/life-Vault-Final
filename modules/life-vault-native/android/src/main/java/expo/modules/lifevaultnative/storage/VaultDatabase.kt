package expo.modules.lifevaultnative.storage

import expo.modules.lifevaultnative.crypto.ByteOps
import expo.modules.lifevaultnative.crypto.CryptoConstants
import expo.modules.lifevaultnative.crypto.Hkdf
import net.zetetic.database.sqlcipher.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.Closeable
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.ArrayDeque
import java.util.Locale

/**
 * SQLCipher-backed relational vault store.
 *
 * Security boundary:
 * - The SQLCipher key never leaves this native module.
 * - Secrets are excluded from graph search.
 * - React Native receives only requested entity data, never database/root keys.
 *
 * Product boundary:
 * - UI is intentionally independent of this schema. React Native pages can be
 *   redesigned without changing the relationship/search model.
 */
class VaultDatabase private constructor(
    private val database: SQLiteDatabase,
    private val databaseKey: ByteArray,
) : Closeable {

    private data class RelationRow(
        val id: String,
        val fromId: String,
        val toId: String,
        val type: String,
        val label: String,
        val notes: String,
    )

    fun initialise(vaultId: String, region: String) {
        require(region in setOf("UK", "US", "ALL"))
        configureDatabase()
        database.beginTransaction()
        try {
            createMetaAndLegacyTables()
            createGraphTables()
            putMeta("schema_version", CryptoConstants.DATABASE_SCHEMA_VERSION.toString())
            putMeta("vault_id", vaultId)
            putMeta("region", region)
            database.setTransactionSuccessful()
        } finally {
            database.endTransaction()
        }
    }

    fun validate(expectedVaultId: String) {
        configureDatabase()
        database.rawQuery("PRAGMA quick_check", null).use { cursor ->
            require(cursor.moveToFirst() && cursor.getString(0) == "ok") {
                "Encrypted database integrity check failed"
            }
        }
        database.rawQuery("PRAGMA foreign_key_check", null).use { cursor ->
            require(!cursor.moveToFirst()) { "Encrypted database relationship integrity check failed" }
        }
        ensureCurrentSchema()
        require(getMeta("schema_version")?.toIntOrNull() == CryptoConstants.DATABASE_SCHEMA_VERSION) {
            "Unsupported encrypted database schema"
        }
        require(getMeta("vault_id") == expectedVaultId) { "Vault identity does not match its manifest" }
        require(getMeta("region") in setOf("UK", "US", "ALL")) { "Vault region is invalid" }
    }

    fun region(): String = getMeta("region") ?: "ALL"

    fun recordCount(): Long = database.rawQuery("SELECT COUNT(*) FROM vault_entities", null).use { cursor ->
        if (cursor.moveToFirst()) cursor.getLong(0) else 0L
    }

    // -----------------------------------------------------------------------
    // Relational entity API
    // -----------------------------------------------------------------------

    fun listEntitySummariesJson(entityType: String?): String {
        val summaries = buildSummaryMap()
        val result = summaries.values
            .filter { entityType.isNullOrBlank() || it.optString("entityType") == entityType }
            .sortedWith(summaryComparator())
            .map(::summaryForOutput)
        return JSONArray(result).toString()
    }

    fun searchEntitiesJson(query: String, entityType: String?): String {
        val term = query.trim().lowercase(Locale.ROOT)
        if (term.isBlank()) return listEntitySummariesJson(entityType)

        val summaries = buildSummaryMap()
        val directReasons = mutableMapOf<String, LinkedHashSet<String>>()

        fun match(entityId: String, value: String?, reason: String) {
            if (!value.isNullOrBlank() && value.lowercase(Locale.ROOT).contains(term)) {
                directReasons.getOrPut(entityId) { linkedSetOf() }.add(reason)
            }
        }

        summaries.forEach { (id, entity) ->
            match(id, entity.optString("name"), "Name")
            match(id, entity.optString("description"), "Description")
            match(id, entity.optString("subtype"), "Type")
            match(id, entity.optString("category"), "Category")
            match(id, entity.optString("status"), "Status")
            match(id, entity.optString("environment"), "Environment")
            match(id, entity.optString("website"), "Website")
            match(id, entity.optString("loginUrl"), "Login URL")
            match(id, entity.optString("notes"), "Notes")
        }

        database.rawQuery("SELECT entity_id, alias FROM vault_entity_aliases", null).use { cursor ->
            while (cursor.moveToNext()) match(cursor.getString(0), cursor.getString(1), "Alias")
        }
        database.rawQuery("SELECT entity_id, tag FROM vault_entity_tags", null).use { cursor ->
            while (cursor.moveToNext()) match(cursor.getString(0), cursor.getString(1), "Tag")
        }
        database.rawQuery(
            "SELECT entity_id, label, value FROM vault_entity_attributes WHERE searchable = 1 AND sensitive = 0",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                match(cursor.getString(0), cursor.getString(1), "Field label")
                match(cursor.getString(0), cursor.getString(2), "Field")
            }
        }
        database.rawQuery(
            "SELECT entity_id, label, value FROM vault_entity_identifiers WHERE searchable = 1 AND sensitive = 0",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                match(cursor.getString(0), cursor.getString(1), "Identifier label")
                match(cursor.getString(0), cursor.getString(2), "Identifier")
            }
        }
        database.rawQuery(
            "SELECT entity_id, label, username FROM vault_entity_credentials",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                match(cursor.getString(0), cursor.getString(1), "Credential label")
                match(cursor.getString(0), cursor.getString(2), "Username")
            }
        }

        if (directReasons.isEmpty()) return "[]"

        val relations = loadRelations()
        val adjacency = buildAdjacency(relations)
        val minDepth = mutableMapOf<String, Int>()
        val connectedVia = mutableMapOf<String, LinkedHashSet<String>>()

        directReasons.keys.forEach { seed ->
            val seedName = summaries[seed]?.optString("name").orEmpty()
            GraphTraversal.scopedDepths(seed, GRAPH_SEARCH_DEPTH, adjacency, entityTypeMap(summaries)).forEach { (current, depth) ->
                val previous = minDepth[current]
                if (previous == null || depth < previous) minDepth[current] = depth
                if (current != seed && seedName.isNotBlank()) {
                    connectedVia.getOrPut(current) { linkedSetOf() }.add(seedName)
                }
            }
        }

        val results = minDepth.keys.mapNotNull { id ->
            val summary = summaries[id] ?: return@mapNotNull null
            if (!entityType.isNullOrBlank() && summary.optString("entityType") != entityType) return@mapNotNull null
            summaryForOutput(summary)
                .put("directMatch", directReasons.containsKey(id))
                .put("matchReasons", JSONArray(directReasons[id]?.toList() ?: emptyList<String>()))
                .put("connectionDepth", minDepth[id] ?: GRAPH_SEARCH_DEPTH)
                .put("connectedVia", JSONArray(connectedVia[id]?.toList() ?: emptyList<String>()))
        }.sortedWith(
            compareByDescending<JSONObject> { it.optBoolean("directMatch") }
                .thenBy { it.optInt("connectionDepth", GRAPH_SEARCH_DEPTH) }
                .thenByDescending { it.optBoolean("favourite") }
                .thenBy { it.optString("name").lowercase(Locale.ROOT) }
        )

        return JSONArray(results).toString()
    }

    fun connectedEntitiesJson(entityId: String, requestedDepth: Int): String {
        require(entityExists(entityId)) { "Entity not found" }
        val maxDepth = requestedDepth.coerceIn(1, GRAPH_SEARCH_DEPTH)
        val summaries = buildSummaryMap()
        val adjacency = buildAdjacency(loadRelations())
        val depthById = GraphTraversal.scopedDepths(entityId, maxDepth, adjacency, entityTypeMap(summaries))
        val rows = depthById
            .filterKeys { it != entityId }
            .mapNotNull { (id, depth) ->
                summaries[id]?.let { summaryForOutput(it).put("connectionDepth", depth) }
            }
            .sortedWith(compareBy<JSONObject> { it.optInt("connectionDepth") }.thenBy { it.optString("name") })
        return JSONArray(rows).toString()
    }

    fun getEntityBundleJson(entityId: String): String? {
        val base = loadEntityBase(entityId) ?: return null
        base.put("aliases", stringArray("SELECT alias FROM vault_entity_aliases WHERE entity_id = ? ORDER BY alias", entityId))
        base.put("tags", stringArray("SELECT tag FROM vault_entity_tags WHERE entity_id = ? ORDER BY tag", entityId))
        base.put("attributes", attributesJson(entityId))
        base.put("credentials", credentialsJson(entityId))
        base.put("identifiers", identifiersJson(entityId))
        base.put("renewals", renewalsJson(entityId))
        base.put("relationships", outgoingRelationshipsJson(entityId))
        base.put("incomingRelationships", incomingRelationshipsJson(entityId))
        return base.toString()
    }

    fun upsertEntityBundleJson(bundleJson: String) {
        requireUtf8SizeAtMost(bundleJson, MAX_ENTITY_BUNDLE_BYTES, "Entity is too large")
        val bundle = JSONObject(bundleJson)
        database.beginTransaction()
        try {
            upsertEntityBundleInternal(bundle)
            database.setTransactionSuccessful()
        } finally {
            database.endTransaction()
        }
    }

    fun deleteEntity(entityId: String) {
        database.beginTransaction()
        try {
            database.execSQL("DELETE FROM vault_records WHERE record_id = ?", arrayOf(entityId))
            database.execSQL("DELETE FROM vault_entities WHERE entity_id = ?", arrayOf(entityId))
            database.setTransactionSuccessful()
        } finally {
            database.endTransaction()
        }
    }

    fun listRenewalsJson(): String {
        val today = LocalDate.now()
        val rows = mutableListOf<JSONObject>()
        database.rawQuery(
            "SELECT r.renewal_id, r.entity_id, r.label, r.renewal_date, r.recurrence, r.notes, " +
                "e.name, e.entity_type, e.category " +
                "FROM vault_entity_renewals r JOIN vault_entities e ON e.entity_id = r.entity_id " +
                "ORDER BY r.renewal_date ASC",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val date = runCatching { LocalDate.parse(cursor.getString(3)) }.getOrNull() ?: continue
                rows.add(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("entityId", cursor.getString(1))
                        .put("label", cursor.getString(2))
                        .put("date", date.toString())
                        .put("recurrence", cursor.getString(4))
                        .put("notes", cursor.getString(5))
                        .put("entityName", cursor.getString(6))
                        .put("entityType", cursor.getString(7))
                        .put("category", cursor.getString(8))
                        .put("daysUntil", ChronoUnit.DAYS.between(today, date).toInt())
                )
            }
        }
        return JSONArray(rows).toString()
    }

    // -----------------------------------------------------------------------
    // Compatibility API for the first-iteration flat UI/data model.
    // Kept only so old installations can migrate safely. New UI does not use it.
    // -----------------------------------------------------------------------

    fun listItemsJson(): String {
        val array = JSONArray()
        database.rawQuery("SELECT payload FROM vault_records ORDER BY updated_at DESC", null).use { cursor ->
            while (cursor.moveToNext()) array.put(JSONObject(String(cursor.getBlob(0), Charsets.UTF_8)))
        }
        return array.toString()
    }

    fun listItemSummariesJson(): String {
        val array = JSONArray()
        database.rawQuery("SELECT payload FROM vault_records ORDER BY updated_at DESC", null).use { cursor ->
            while (cursor.moveToNext()) {
                val item = JSONObject(String(cursor.getBlob(0), Charsets.UTF_8))
                array.put(
                    JSONObject()
                        .put("id", item.getString("id"))
                        .put("templateId", item.getString("templateId"))
                        .put("category", item.getString("category"))
                        .put("name", item.getString("name"))
                        .put("tags", item.optJSONArray("tags") ?: JSONArray())
                        .put("favourite", item.optBoolean("favourite", false))
                        .put("createdAt", item.getString("createdAt"))
                        .put("updatedAt", item.getString("updatedAt"))
                )
            }
        }
        return array.toString()
    }

    fun getItemJson(recordId: String): String? = database.rawQuery(
        "SELECT payload FROM vault_records WHERE record_id = ? LIMIT 1",
        arrayOf(recordId),
    ).use { cursor -> if (cursor.moveToFirst()) String(cursor.getBlob(0), Charsets.UTF_8) else null }

    fun upsertItemJson(itemJson: String) {
        requireUtf8SizeAtMost(itemJson, MAX_ITEM_BYTES, "Record is too large")
        val item = JSONObject(itemJson)
        val id = item.getString("id").trim()
        val category = item.getString("category").trim()
        val title = item.getString("name").trim()
        require(id.length in 1..128) { "Record id is invalid" }
        require(category.length in 1..64) { "Record category is invalid" }
        require(title.length in 1..512) { "Record name is required" }
        require(item.has("fields") && item.get("fields") is JSONObject) { "Record fields are invalid" }
        val now = System.currentTimeMillis()
        database.beginTransaction()
        try {
            val existingCreated = database.rawQuery(
                "SELECT created_at FROM vault_records WHERE record_id = ? LIMIT 1",
                arrayOf(id),
            ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else null }
            val created = existingCreated ?: now
            database.execSQL(
                "INSERT OR REPLACE INTO vault_records(record_id, category, title, payload, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)",
                arrayOf(id, category, title, item.toString().toByteArray(Charsets.UTF_8), created, now),
            )
            // Keep compatibility writes visible in the new graph model atomically.
            upsertEntityBundleInternal(legacyItemToEntity(item))
            database.setTransactionSuccessful()
        } finally {
            database.endTransaction()
        }
    }

    fun deleteItem(recordId: String) {
        database.beginTransaction()
        try {
            database.execSQL("DELETE FROM vault_records WHERE record_id = ?", arrayOf(recordId))
            database.execSQL("DELETE FROM vault_entities WHERE entity_id = ?", arrayOf(recordId))
            database.setTransactionSuccessful()
        } finally {
            database.endTransaction()
        }
    }

    fun checkpoint() {
        // The vault deliberately uses DELETE journalling, so there is no WAL to
        // checkpoint. PRAGMA optimize is safe to consume as a query before close.
        database.rawQuery("PRAGMA optimize", null).use { cursor -> while (cursor.moveToNext()) Unit }
    }

    // -----------------------------------------------------------------------
    // Schema and migration
    // -----------------------------------------------------------------------

    private fun configureDatabase() {
        // sqlcipher-android treats PRAGMA statements as queries. Running them via
        // execSQL() throws: "Queries can be performed using SQLiteDatabase query
        // or rawQuery methods only". Execute and fully consume each PRAGMA cursor
        // so the setting is applied before schema work begins.
        applyPragma("PRAGMA journal_mode=DELETE")
        applyPragma("PRAGMA secure_delete=ON")
        applyPragma("PRAGMA foreign_keys=ON")
        applyPragma("PRAGMA temp_store=MEMORY")
        applyPragma("PRAGMA cipher_memory_security=ON")
    }

    private fun applyPragma(statement: String) {
        require(statement.startsWith("PRAGMA ", ignoreCase = true)) { "Only PRAGMA statements are permitted" }
        database.rawQuery(statement, null).use { cursor ->
            while (cursor.moveToNext()) Unit
        }
    }

    private fun createMetaAndLegacyTables() {
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_meta (meta_key TEXT PRIMARY KEY NOT NULL, meta_value TEXT NOT NULL)"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_records (" +
                "record_id TEXT PRIMARY KEY NOT NULL," +
                "category TEXT NOT NULL," +
                "title TEXT NOT NULL," +
                "payload BLOB NOT NULL," +
                "created_at INTEGER NOT NULL," +
                "updated_at INTEGER NOT NULL)"
        )
    }

    private fun createGraphTables() {
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_entities (" +
                "entity_id TEXT PRIMARY KEY NOT NULL," +
                "entity_type TEXT NOT NULL," +
                "subtype TEXT NOT NULL," +
                "category TEXT NOT NULL," +
                "name TEXT NOT NULL," +
                "description TEXT NOT NULL DEFAULT ''," +
                "status TEXT NOT NULL DEFAULT ''," +
                "environment TEXT NOT NULL DEFAULT ''," +
                "website TEXT NOT NULL DEFAULT ''," +
                "login_url TEXT NOT NULL DEFAULT ''," +
                "notes TEXT NOT NULL DEFAULT ''," +
                "favourite INTEGER NOT NULL DEFAULT 0," +
                "created_at INTEGER NOT NULL," +
                "updated_at INTEGER NOT NULL)"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_entity_aliases (" +
                "entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "alias TEXT NOT NULL," +
                "PRIMARY KEY(entity_id, alias))"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_entity_tags (" +
                "entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "tag TEXT NOT NULL," +
                "PRIMARY KEY(entity_id, tag))"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_entity_attributes (" +
                "attribute_id TEXT PRIMARY KEY NOT NULL," +
                "entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "attribute_key TEXT NOT NULL," +
                "label TEXT NOT NULL," +
                "value TEXT NOT NULL," +
                "value_type TEXT NOT NULL," +
                "sensitive INTEGER NOT NULL DEFAULT 0," +
                "searchable INTEGER NOT NULL DEFAULT 1," +
                "sort_order INTEGER NOT NULL DEFAULT 0)"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_entity_credentials (" +
                "credential_id TEXT PRIMARY KEY NOT NULL," +
                "entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "credential_type TEXT NOT NULL," +
                "label TEXT NOT NULL," +
                "username TEXT NOT NULL DEFAULT ''," +
                "secret TEXT NOT NULL DEFAULT ''," +
                "notes TEXT NOT NULL DEFAULT ''," +
                "sort_order INTEGER NOT NULL DEFAULT 0)"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_entity_identifiers (" +
                "identifier_id TEXT PRIMARY KEY NOT NULL," +
                "entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "identifier_type TEXT NOT NULL," +
                "label TEXT NOT NULL," +
                "value TEXT NOT NULL," +
                "sensitive INTEGER NOT NULL DEFAULT 0," +
                "searchable INTEGER NOT NULL DEFAULT 1," +
                "sort_order INTEGER NOT NULL DEFAULT 0)"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_entity_renewals (" +
                "renewal_id TEXT PRIMARY KEY NOT NULL," +
                "entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "label TEXT NOT NULL," +
                "renewal_date TEXT NOT NULL," +
                "recurrence TEXT NOT NULL DEFAULT ''," +
                "notes TEXT NOT NULL DEFAULT '')"
        )
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS vault_relationships (" +
                "relationship_id TEXT PRIMARY KEY NOT NULL," +
                "from_entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "to_entity_id TEXT NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE," +
                "relationship_type TEXT NOT NULL," +
                "label TEXT NOT NULL DEFAULT ''," +
                "notes TEXT NOT NULL DEFAULT ''," +
                "CHECK(from_entity_id <> to_entity_id))"
        )
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_entities_type ON vault_entities(entity_type)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_entities_name ON vault_entities(name)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_attributes_entity ON vault_entity_attributes(entity_id)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_credentials_entity ON vault_entity_credentials(entity_id)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_identifiers_entity ON vault_entity_identifiers(entity_id)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_renewals_date ON vault_entity_renewals(renewal_date)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_relationships_from ON vault_relationships(from_entity_id)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_relationships_to ON vault_relationships(to_entity_id)")
    }

    private fun ensureCurrentSchema() {
        createMetaAndLegacyTables()
        val version = getMeta("schema_version")?.toIntOrNull() ?: 1
        when (version) {
            CryptoConstants.DATABASE_SCHEMA_VERSION -> createGraphTables()
            1 -> migrateV1ToGraphSchema()
            else -> error("Unsupported encrypted database schema")
        }
    }

    private fun migrateV1ToGraphSchema() {
        database.beginTransaction()
        try {
            createGraphTables()
            val legacy = mutableListOf<JSONObject>()
            database.rawQuery("SELECT payload FROM vault_records", null).use { cursor ->
                while (cursor.moveToNext()) {
                    legacy.add(JSONObject(String(cursor.getBlob(0), Charsets.UTF_8)))
                }
            }
            legacy.forEach { upsertEntityBundleInternal(legacyItemToEntity(it)) }
            putMeta("schema_version", CryptoConstants.DATABASE_SCHEMA_VERSION.toString())
            database.setTransactionSuccessful()
        } finally {
            database.endTransaction()
        }
    }

    private fun legacyItemToEntity(item: JSONObject): JSONObject {
        val id = item.optString("id")
        val category = item.optString("category", "custom")
        val templateId = item.optString("templateId", "legacy")
        val fields = item.optJSONObject("fields") ?: JSONObject()
        val attributes = JSONArray()
        val credentials = JSONArray()
        val identifiers = JSONArray()
        val renewals = JSONArray()
        val keys = fields.keys()
        var order = 0
        while (keys.hasNext()) {
            val key = keys.next()
            val value = fields.optString(key)
            if (value.isBlank()) continue
            val lower = key.lowercase(Locale.ROOT)
            val label = humaniseKey(key)
            when {
                lower.contains("renewal") || lower.contains("expiry") || lower.contains("enddate") -> {
                    val normalisedDate = normaliseLegacyDate(value)
                    if (normalisedDate != null) {
                        renewals.put(
                            JSONObject()
                                .put("id", "$id-renewal-$key")
                                .put("label", label)
                                .put("date", normalisedDate)
                                .put("recurrence", "")
                                .put("notes", "")
                        )
                    } else {
                        attributes.put(
                            JSONObject()
                                .put("id", "$id-attribute-$key")
                                .put("key", key)
                                .put("label", label)
                                .put("value", value)
                                .put("valueType", "text")
                                .put("sensitive", false)
                                .put("searchable", true)
                                .put("sortOrder", order++)
                        )
                    }
                }
                isSecretKey(lower) -> {
                    credentials.put(
                        JSONObject()
                            .put("id", "$id-credential-$key")
                            .put("type", if (lower.contains("pin") || lower == "cvv") "pin" else "password")
                            .put("label", label)
                            .put("username", "")
                            .put("secret", value)
                            .put("notes", "")
                            .put("sortOrder", order++)
                    )
                }
                isIdentifierKey(lower) -> {
                    identifiers.put(
                        JSONObject()
                            .put("id", "$id-identifier-$key")
                            .put("type", key)
                            .put("label", label)
                            .put("value", value)
                            .put("sensitive", lower.contains("accountnumber") || lower.contains("cardnumber"))
                            .put("searchable", true)
                            .put("sortOrder", order++)
                    )
                }
                else -> {
                    attributes.put(
                        JSONObject()
                            .put("id", "$id-attribute-$key")
                            .put("key", key)
                            .put("label", label)
                            .put("value", value)
                            .put("valueType", if (lower.contains("url") || lower.contains("website")) "url" else "text")
                            .put("sensitive", false)
                            .put("searchable", true)
                            .put("sortOrder", order++)
                    )
                }
            }
        }
        return JSONObject()
            .put("id", id)
            .put("entityType", if (category == "custom") "record" else "account")
            .put("subtype", templateId)
            .put("category", category)
            .put("name", item.optString("name", "Migrated record"))
            .put("description", "")
            .put("status", "")
            .put("environment", "")
            .put("website", "")
            .put("loginUrl", "")
            .put("notes", "")
            .put("aliases", JSONArray())
            .put("tags", item.optJSONArray("tags") ?: JSONArray())
            .put("favourite", item.optBoolean("favourite", false))
            .put("createdAt", item.optString("createdAt", Instant.now().toString()))
            .put("updatedAt", item.optString("updatedAt", Instant.now().toString()))
            .put("attributes", attributes)
            .put("credentials", credentials)
            .put("identifiers", identifiers)
            .put("renewals", renewals)
            .put("relationships", JSONArray())
    }

    // -----------------------------------------------------------------------
    // Entity persistence helpers
    // -----------------------------------------------------------------------

    private fun upsertEntityBundleInternal(bundle: JSONObject) {
        val id = bundle.getString("id").trim()
        val entityType = bundle.getString("entityType").trim()
        val subtype = bundle.optString("subtype", "custom").trim()
        val category = bundle.optString("category", "custom").trim()
        val name = bundle.getString("name").trim()
        require(id.length in 1..128) { "Entity id is invalid" }
        require(entityType in ENTITY_TYPES) { "Entity type is invalid" }
        require(subtype.length in 1..128) { "Entity subtype is invalid" }
        require(category.length in 1..64) { "Entity category is invalid" }
        require(name.length in 1..512) { "Entity name is required" }

        val now = System.currentTimeMillis()
        val existingCreated = database.rawQuery(
            "SELECT created_at FROM vault_entities WHERE entity_id = ? LIMIT 1",
            arrayOf(id),
        ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else null }
        val createdAt = existingCreated ?: parseEpoch(bundle.optString("createdAt"), now)
        val updatedAt = parseEpoch(bundle.optString("updatedAt"), now)

        database.execSQL(
            "INSERT INTO vault_entities(" +
                "entity_id, entity_type, subtype, category, name, description, status, environment, website, login_url, notes, favourite, created_at, updated_at" +
                ") VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT(entity_id) DO UPDATE SET " +
                "entity_type=excluded.entity_type, subtype=excluded.subtype, category=excluded.category, " +
                "name=excluded.name, description=excluded.description, status=excluded.status, " +
                "environment=excluded.environment, website=excluded.website, login_url=excluded.login_url, " +
                "notes=excluded.notes, favourite=excluded.favourite, updated_at=excluded.updated_at",
            arrayOf(
                id,
                entityType,
                subtype,
                category,
                name,
                bounded(bundle.optString("description"), 10_000, "Description"),
                bounded(bundle.optString("status"), 256, "Status"),
                bounded(bundle.optString("environment"), 256, "Environment"),
                bounded(bundle.optString("website"), 2_048, "Website"),
                bounded(bundle.optString("loginUrl"), 2_048, "Login URL"),
                bounded(bundle.optString("notes"), 100_000, "Notes"),
                if (bundle.optBoolean("favourite")) 1 else 0,
                createdAt,
                updatedAt,
            ),
        )

        replaceStrings("vault_entity_aliases", "alias", id, bundle.optJSONArray("aliases") ?: JSONArray())
        replaceStrings("vault_entity_tags", "tag", id, bundle.optJSONArray("tags") ?: JSONArray())

        database.execSQL("DELETE FROM vault_entity_attributes WHERE entity_id = ?", arrayOf(id))
        val attributes = bundle.optJSONArray("attributes") ?: JSONArray()
        require(attributes.length() <= MAX_CHILD_ROWS) { "Too many additional fields" }
        for (index in 0 until attributes.length()) {
            val row = attributes.getJSONObject(index)
            val value = row.optString("value")
            if (value.isBlank()) continue
            database.execSQL(
                "INSERT INTO vault_entity_attributes(attribute_id, entity_id, attribute_key, label, value, value_type, sensitive, searchable, sort_order) " +
                    "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
                arrayOf(
                    requireChildId(row, "id"), id,
                    bounded(row.optString("key", "field_$index"), 128, "Attribute key"),
                    requiredBounded(row, "label", 512),
                    bounded(value, 100_000, "Attribute value"),
                    bounded(row.optString("valueType", "text"), 32, "Attribute type"),
                    if (row.optBoolean("sensitive")) 1 else 0,
                    if (row.optBoolean("searchable", true) && !row.optBoolean("sensitive")) 1 else 0,
                    row.optInt("sortOrder", index),
                ),
            )
        }

        database.execSQL("DELETE FROM vault_entity_credentials WHERE entity_id = ?", arrayOf(id))
        val credentials = bundle.optJSONArray("credentials") ?: JSONArray()
        require(credentials.length() <= MAX_CHILD_ROWS) { "Too many credentials" }
        for (index in 0 until credentials.length()) {
            val row = credentials.getJSONObject(index)
            val label = row.optString("label").trim()
            val username = row.optString("username")
            val secret = row.optString("secret")
            if (label.isBlank() && username.isBlank() && secret.isBlank()) continue
            database.execSQL(
                "INSERT INTO vault_entity_credentials(credential_id, entity_id, credential_type, label, username, secret, notes, sort_order) " +
                    "VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
                arrayOf(
                    requireChildId(row, "id"), id,
                    allowedValue(row.optString("type", "login"), CREDENTIAL_TYPES, "Credential type"),
                    bounded(if (label.isBlank()) "Login" else label, 512, "Credential label"),
                    bounded(username, 10_000, "Username"),
                    bounded(secret, 100_000, "Credential secret"),
                    bounded(row.optString("notes"), 100_000, "Credential notes"),
                    row.optInt("sortOrder", index),
                ),
            )
        }

        database.execSQL("DELETE FROM vault_entity_identifiers WHERE entity_id = ?", arrayOf(id))
        val identifiers = bundle.optJSONArray("identifiers") ?: JSONArray()
        require(identifiers.length() <= MAX_CHILD_ROWS) { "Too many identifiers" }
        for (index in 0 until identifiers.length()) {
            val row = identifiers.getJSONObject(index)
            val value = row.optString("value")
            if (value.isBlank()) continue
            database.execSQL(
                "INSERT INTO vault_entity_identifiers(identifier_id, entity_id, identifier_type, label, value, sensitive, searchable, sort_order) " +
                    "VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
                arrayOf(
                    requireChildId(row, "id"), id,
                    bounded(row.optString("type", "identifier"), 128, "Identifier type"),
                    requiredBounded(row, "label", 512),
                    bounded(value, 10_000, "Identifier value"),
                    if (row.optBoolean("sensitive")) 1 else 0,
                    if (row.optBoolean("searchable", true) && !row.optBoolean("sensitive")) 1 else 0,
                    row.optInt("sortOrder", index),
                ),
            )
        }

        database.execSQL("DELETE FROM vault_entity_renewals WHERE entity_id = ?", arrayOf(id))
        val renewals = bundle.optJSONArray("renewals") ?: JSONArray()
        require(renewals.length() <= MAX_CHILD_ROWS) { "Too many renewals" }
        for (index in 0 until renewals.length()) {
            val row = renewals.getJSONObject(index)
            val date = row.optString("date").trim()
            if (date.isBlank()) continue
            try {
                LocalDate.parse(date)
            } catch (_: DateTimeParseException) {
                error("Renewal dates must use YYYY-MM-DD")
            }
            database.execSQL(
                "INSERT INTO vault_entity_renewals(renewal_id, entity_id, label, renewal_date, recurrence, notes) VALUES(?, ?, ?, ?, ?, ?)",
                arrayOf(
                    requireChildId(row, "id"), id,
                    requiredBounded(row, "label", 512),
                    date,
                    bounded(row.optString("recurrence"), 128, "Recurrence"),
                    bounded(row.optString("notes"), 100_000, "Renewal notes"),
                ),
            )
        }

        // Only outgoing relationships belong to this editable bundle. Incoming
        // relationships are owned by their source entities and remain intact.
        database.execSQL("DELETE FROM vault_relationships WHERE from_entity_id = ?", arrayOf(id))
        val relationships = bundle.optJSONArray("relationships") ?: JSONArray()
        require(relationships.length() <= MAX_CHILD_ROWS) { "Too many relationships" }
        for (index in 0 until relationships.length()) {
            val row = relationships.getJSONObject(index)
            val target = row.getString("toEntityId").trim()
            require(target != id) { "An entity cannot link to itself" }
            require(entityExists(target)) { "A linked entity no longer exists" }
            database.execSQL(
                "INSERT INTO vault_relationships(relationship_id, from_entity_id, to_entity_id, relationship_type, label, notes) " +
                    "VALUES(?, ?, ?, ?, ?, ?)",
                arrayOf(
                    requireChildId(row, "id"), id, target,
                    allowedValue(row.optString("type", "related"), RELATIONSHIP_TYPES, "Relationship type"),
                    bounded(row.optString("label"), 512, "Relationship label"),
                    bounded(row.optString("notes"), 100_000, "Relationship notes"),
                ),
            )
        }
    }

    private fun loadEntityBase(entityId: String): JSONObject? = database.rawQuery(
        "SELECT entity_id, entity_type, subtype, category, name, description, status, environment, website, login_url, notes, favourite, created_at, updated_at " +
            "FROM vault_entities WHERE entity_id = ? LIMIT 1",
        arrayOf(entityId),
    ).use { cursor -> if (cursor.moveToFirst()) entityFromCursor(cursor) else null }

    private fun buildSummaryMap(): LinkedHashMap<String, JSONObject> {
        val entities = linkedMapOf<String, JSONObject>()
        database.rawQuery(
            "SELECT entity_id, entity_type, subtype, category, name, description, status, environment, website, login_url, notes, favourite, created_at, updated_at " +
                "FROM vault_entities",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val entity = entityFromCursor(cursor)
                entities[entity.getString("id")] = entity
            }
        }

        val tags = stringMap("SELECT entity_id, tag FROM vault_entity_tags ORDER BY tag")
        val aliases = stringMap("SELECT entity_id, alias FROM vault_entity_aliases ORDER BY alias")
        val relations = loadRelations()
        val adjacency = buildAdjacency(relations)
        val credentialCounts = countMap("SELECT entity_id, COUNT(*) FROM vault_entity_credentials GROUP BY entity_id")
        val identifierCounts = countMap("SELECT entity_id, COUNT(*) FROM vault_entity_identifiers GROUP BY entity_id")
        val renewalCounts = countMap("SELECT entity_id, COUNT(*) FROM vault_entity_renewals GROUP BY entity_id")
        val relationCounts = mutableMapOf<String, Int>()
        relations.forEach {
            relationCounts[it.fromId] = (relationCounts[it.fromId] ?: 0) + 1
            relationCounts[it.toId] = (relationCounts[it.toId] ?: 0) + 1
        }

        entities.forEach { (id, entity) ->
            val related = relatedTypeNames(id, adjacency, entities, GRAPH_SEARCH_DEPTH)
            entity.put("tags", JSONArray(tags[id].orEmpty()))
            entity.put("aliases", JSONArray(aliases[id].orEmpty()))
            entity.put("projectNames", JSONArray(related.first))
            entity.put("platformNames", JSONArray(related.second))
            entity.put("relationshipCount", relationCounts[id] ?: 0)
            entity.put("credentialCount", credentialCounts[id] ?: 0)
            entity.put("identifierCount", identifierCounts[id] ?: 0)
            entity.put("renewalCount", renewalCounts[id] ?: 0)
        }
        return entities
    }

    private fun entityFromCursor(cursor: android.database.Cursor): JSONObject = JSONObject()
        .put("id", cursor.getString(0))
        .put("entityType", cursor.getString(1))
        .put("subtype", cursor.getString(2))
        .put("category", cursor.getString(3))
        .put("name", cursor.getString(4))
        .put("description", cursor.getString(5))
        .put("status", cursor.getString(6))
        .put("environment", cursor.getString(7))
        .put("website", cursor.getString(8))
        .put("loginUrl", cursor.getString(9))
        .put("notes", cursor.getString(10))
        .put("favourite", cursor.getInt(11) != 0)
        .put("createdAt", Instant.ofEpochMilli(cursor.getLong(12)).toString())
        .put("updatedAt", Instant.ofEpochMilli(cursor.getLong(13)).toString())

    private fun attributesJson(entityId: String): JSONArray {
        val array = JSONArray()
        database.rawQuery(
            "SELECT attribute_id, attribute_key, label, value, value_type, sensitive, searchable, sort_order " +
                "FROM vault_entity_attributes WHERE entity_id = ? ORDER BY sort_order, label",
            arrayOf(entityId),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                array.put(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("key", cursor.getString(1))
                        .put("label", cursor.getString(2))
                        .put("value", cursor.getString(3))
                        .put("valueType", cursor.getString(4))
                        .put("sensitive", cursor.getInt(5) != 0)
                        .put("searchable", cursor.getInt(6) != 0)
                        .put("sortOrder", cursor.getInt(7))
                )
            }
        }
        return array
    }

    private fun credentialsJson(entityId: String): JSONArray {
        val array = JSONArray()
        database.rawQuery(
            "SELECT credential_id, credential_type, label, username, secret, notes, sort_order " +
                "FROM vault_entity_credentials WHERE entity_id = ? ORDER BY sort_order, label",
            arrayOf(entityId),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                array.put(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("type", cursor.getString(1))
                        .put("label", cursor.getString(2))
                        .put("username", cursor.getString(3))
                        .put("secret", cursor.getString(4))
                        .put("notes", cursor.getString(5))
                        .put("sortOrder", cursor.getInt(6))
                )
            }
        }
        return array
    }

    private fun identifiersJson(entityId: String): JSONArray {
        val array = JSONArray()
        database.rawQuery(
            "SELECT identifier_id, identifier_type, label, value, sensitive, searchable, sort_order " +
                "FROM vault_entity_identifiers WHERE entity_id = ? ORDER BY sort_order, label",
            arrayOf(entityId),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                array.put(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("type", cursor.getString(1))
                        .put("label", cursor.getString(2))
                        .put("value", cursor.getString(3))
                        .put("sensitive", cursor.getInt(4) != 0)
                        .put("searchable", cursor.getInt(5) != 0)
                        .put("sortOrder", cursor.getInt(6))
                )
            }
        }
        return array
    }

    private fun renewalsJson(entityId: String): JSONArray {
        val array = JSONArray()
        database.rawQuery(
            "SELECT renewal_id, label, renewal_date, recurrence, notes FROM vault_entity_renewals WHERE entity_id = ? ORDER BY renewal_date",
            arrayOf(entityId),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                array.put(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("label", cursor.getString(1))
                        .put("date", cursor.getString(2))
                        .put("recurrence", cursor.getString(3))
                        .put("notes", cursor.getString(4))
                )
            }
        }
        return array
    }

    private fun outgoingRelationshipsJson(entityId: String): JSONArray {
        val array = JSONArray()
        database.rawQuery(
            "SELECT r.relationship_id, r.relationship_type, r.to_entity_id, r.label, r.notes, e.name, e.entity_type " +
                "FROM vault_relationships r JOIN vault_entities e ON e.entity_id = r.to_entity_id " +
                "WHERE r.from_entity_id = ? ORDER BY e.name",
            arrayOf(entityId),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                array.put(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("type", cursor.getString(1))
                        .put("toEntityId", cursor.getString(2))
                        .put("label", cursor.getString(3))
                        .put("notes", cursor.getString(4))
                        .put("linkedEntityName", cursor.getString(5))
                        .put("linkedEntityType", cursor.getString(6))
                )
            }
        }
        return array
    }

    private fun incomingRelationshipsJson(entityId: String): JSONArray {
        val array = JSONArray()
        database.rawQuery(
            "SELECT r.relationship_id, r.relationship_type, r.from_entity_id, r.label, r.notes, e.name, e.entity_type " +
                "FROM vault_relationships r JOIN vault_entities e ON e.entity_id = r.from_entity_id " +
                "WHERE r.to_entity_id = ? ORDER BY e.name",
            arrayOf(entityId),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                array.put(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("type", cursor.getString(1))
                        .put("toEntityId", entityId)
                        .put("fromEntityId", cursor.getString(2))
                        .put("label", cursor.getString(3))
                        .put("notes", cursor.getString(4))
                        .put("linkedEntityName", cursor.getString(5))
                        .put("linkedEntityType", cursor.getString(6))
                )
            }
        }
        return array
    }

    private fun loadRelations(): List<RelationRow> {
        val rows = mutableListOf<RelationRow>()
        database.rawQuery(
            "SELECT relationship_id, from_entity_id, to_entity_id, relationship_type, label, notes FROM vault_relationships",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                rows.add(RelationRow(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3), cursor.getString(4), cursor.getString(5)))
            }
        }
        return rows
    }

    private fun buildAdjacency(relations: List<RelationRow>): Map<String, Set<String>> {
        val result = mutableMapOf<String, MutableSet<String>>()
        relations.forEach { relation ->
            result.getOrPut(relation.fromId) { linkedSetOf() }.add(relation.toId)
            result.getOrPut(relation.toId) { linkedSetOf() }.add(relation.fromId)
        }
        return result
    }

    private fun relatedTypeNames(
        entityId: String,
        adjacency: Map<String, Set<String>>,
        entities: Map<String, JSONObject>,
        maxDepth: Int,
    ): Pair<List<String>, List<String>> {
        val projects = linkedSetOf<String>()
        val platforms = linkedSetOf<String>()
        GraphTraversal.scopedDepths(entityId, maxDepth, adjacency, entityTypeMap(entities)).keys.forEach { current ->
            entities[current]?.let { entity ->
                when (entity.optString("entityType")) {
                    "project" -> projects.add(entity.optString("name"))
                    "platform" -> platforms.add(entity.optString("name"))
                    else -> Unit
                }
            }
        }
        return projects.filter { it.isNotBlank() }.sorted() to platforms.filter { it.isNotBlank() }.sorted()
    }

    private fun entityTypeMap(entities: Map<String, JSONObject>): Map<String, String> =
        entities.mapValues { (_, entity) -> entity.optString("entityType") }

    private fun stringMap(sql: String): Map<String, List<String>> {
        val result = mutableMapOf<String, MutableList<String>>()
        database.rawQuery(sql, null).use { cursor ->
            while (cursor.moveToNext()) result.getOrPut(cursor.getString(0)) { mutableListOf() }.add(cursor.getString(1))
        }
        return result
    }

    private fun countMap(sql: String): Map<String, Int> {
        val result = mutableMapOf<String, Int>()
        database.rawQuery(sql, null).use { cursor ->
            while (cursor.moveToNext()) result[cursor.getString(0)] = cursor.getInt(1)
        }
        return result
    }

    private fun stringArray(sql: String, entityId: String): JSONArray {
        val array = JSONArray()
        database.rawQuery(sql, arrayOf(entityId)).use { cursor -> while (cursor.moveToNext()) array.put(cursor.getString(0)) }
        return array
    }

    private fun replaceStrings(table: String, column: String, entityId: String, values: JSONArray) {
        require(table in setOf("vault_entity_aliases", "vault_entity_tags"))
        require(column in setOf("alias", "tag"))
        database.execSQL("DELETE FROM $table WHERE entity_id = ?", arrayOf(entityId))
        val unique = linkedSetOf<String>()
        for (index in 0 until values.length()) {
            val value = values.optString(index).trim()
            if (value.isNotBlank()) unique.add(value.take(256))
        }
        unique.forEach { value ->
            database.execSQL("INSERT INTO $table(entity_id, $column) VALUES(?, ?)", arrayOf(entityId, value))
        }
    }

    private fun entityExists(entityId: String): Boolean = database.rawQuery(
        "SELECT 1 FROM vault_entities WHERE entity_id = ? LIMIT 1",
        arrayOf(entityId),
    ).use { it.moveToFirst() }

    private fun summaryForOutput(source: JSONObject): JSONObject = JSONObject(source.toString()).also { summary ->
        // List/search calls should not copy long notes or login URLs for every
        // record into React Native memory. Full values are returned only by
        // getEntityBundleJson for the record the user opens.
        summary.remove("notes")
        summary.remove("loginUrl")
    }

    private fun summaryComparator(): Comparator<JSONObject> =
        compareByDescending<JSONObject> { it.optBoolean("favourite") }
            .thenBy { entityTypeOrder(it.optString("entityType")) }
            .thenBy { it.optString("name").lowercase(Locale.ROOT) }

    private fun entityTypeOrder(type: String): Int = when (type) {
        "project" -> 0
        "platform" -> 1
        "account" -> 2
        "resource" -> 3
        else -> 4
    }

    private fun putMeta(key: String, value: String) {
        database.execSQL(
            "INSERT OR REPLACE INTO vault_meta(meta_key, meta_value) VALUES(?, ?)",
            arrayOf(key, value),
        )
    }

    private fun getMeta(key: String): String? = database.rawQuery(
        "SELECT meta_value FROM vault_meta WHERE meta_key = ? LIMIT 1",
        arrayOf(key),
    ).use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }

    override fun close() {
        try {
            database.close()
        } finally {
            ByteOps.wipe(databaseKey)
        }
    }

    private fun requireUtf8SizeAtMost(value: String, maximumBytes: Int, message: String) {
        val encoded = value.toByteArray(Charsets.UTF_8)
        try {
            require(encoded.size <= maximumBytes) { message }
        } finally {
            ByteOps.wipe(encoded)
        }
    }

    companion object {
        private const val MAX_ITEM_BYTES = 1024 * 1024
        private const val MAX_ENTITY_BUNDLE_BYTES = 2 * 1024 * 1024
        private const val GRAPH_SEARCH_DEPTH = 3
        private const val MAX_CHILD_ROWS = 500
        private val ENTITY_TYPES = setOf("project", "platform", "account", "resource", "record")
        private val CREDENTIAL_TYPES = setOf(
            "login", "password", "pin", "totp", "recovery_code", "api_key", "secret", "security_answer", "other"
        )
        private val RELATIONSHIP_TYPES = setOf(
            "used_by_project", "account_on_platform", "controls_resource", "paid_from", "uses_email",
            "hosted_on", "domain_points_to", "login_owned_by", "production_of", "sandbox_of", "related"
        )

        fun deriveDatabaseKey(rootKey: ByteArray): ByteArray = Hkdf.sha256(
            ikm = rootKey,
            info = CryptoConstants.INFO_DATABASE.toByteArray(Charsets.UTF_8),
            length = 32,
        )

        fun create(file: File, rootKey: ByteArray, vaultId: String, region: String): VaultDatabase {
            file.parentFile?.let { parent ->
                require(parent.isDirectory || parent.mkdirs()) { "Vault database directory could not be created" }
                require(parent.isDirectory) { "Vault database parent is not a directory" }
            }
            require(!file.exists()) { "Refusing to overwrite an existing vault database" }
            val key = deriveDatabaseKey(rootKey)
            var db: SQLiteDatabase? = null
            try {
                db = SQLiteDatabase.openOrCreateDatabase(file, key, null, null, null)
                val vault = VaultDatabase(db, key)
                vault.initialise(vaultId, region)
                db = null // ownership moved to VaultDatabase
                return vault
            } catch (error: Exception) {
                runCatching { db?.close() }.exceptionOrNull()?.let(error::addSuppressed)
                ByteOps.wipe(key)
                if (file.exists() && (!file.delete() || file.exists())) {
                    error.addSuppressed(IllegalStateException("Partial vault database could not be deleted"))
                }
                throw error
            }
        }

        fun open(file: File, rootKey: ByteArray, vaultId: String): VaultDatabase {
            require(file.isFile) { "Encrypted database is missing or invalid" }
            val key = deriveDatabaseKey(rootKey)
            var db: SQLiteDatabase? = null
            try {
                db = SQLiteDatabase.openDatabase(
                    file.absolutePath,
                    key,
                    null,
                    SQLiteDatabase.OPEN_READWRITE,
                    null,
                    null,
                )
                val vault = VaultDatabase(db, key)
                vault.validate(vaultId)
                db = null // ownership moved to VaultDatabase
                return vault
            } catch (error: Exception) {
                runCatching { db?.close() }.exceptionOrNull()?.let(error::addSuppressed)
                ByteOps.wipe(key)
                throw error
            }
        }

        private fun parseEpoch(value: String?, fallback: Long): Long = try {
            if (value.isNullOrBlank()) fallback else Instant.parse(value).toEpochMilli()
        } catch (_: Exception) {
            fallback
        }

        private fun bounded(value: String, max: Int, label: String): String {
            require(value.length <= max) { "$label is too long" }
            return value
        }

        private fun allowedValue(value: String, allowed: Set<String>, label: String): String {
            val normalised = value.trim()
            require(normalised in allowed) { "$label is invalid" }
            return normalised
        }

        private fun requiredBounded(row: JSONObject, key: String, max: Int): String {
            val value = row.optString(key).trim()
            require(value.isNotBlank() && value.length <= max) { "${humaniseKey(key)} is invalid" }
            return value
        }

        private fun requireChildId(row: JSONObject, key: String): String {
            val value = row.optString(key).trim()
            require(value.length in 1..128) { "Child record id is invalid" }
            return value
        }

        private fun humaniseKey(key: String): String = key
            .replace(Regex("([a-z])([A-Z])"), "$1 $2")
            .replace('_', ' ')
            .trim()
            .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }

        private fun isSecretKey(lower: String): Boolean =
            lower.contains("password") || lower.contains("pin") || lower.contains("cvv") ||
                lower.contains("secret") || lower.contains("recoverycode")

        private fun isIdentifierKey(lower: String): Boolean =
            lower.contains("accountnumber") || lower.contains("reference") || lower.contains("policy") ||
                lower.contains("merchant") || lower.contains("projectid") || lower.contains("externalid") ||
                lower.contains("sortcode") || lower.contains("routing") || lower.endsWith("id")

        private fun normaliseLegacyDate(value: String): String? = runCatching { LocalDate.parse(value).toString() }
            .getOrNull()
    }
}
