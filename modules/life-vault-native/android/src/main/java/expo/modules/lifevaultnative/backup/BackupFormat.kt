package expo.modules.lifevaultnative.backup

import expo.modules.lifevaultnative.crypto.ByteOps
import expo.modules.lifevaultnative.crypto.CryptoConstants
import expo.modules.lifevaultnative.crypto.Hkdf
import expo.modules.lifevaultnative.crypto.WrappedBlob
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object BackupFormat {
    private val MAGIC = byteArrayOf('L'.code.toByte(), 'V'.code.toByte(), 'B'.code.toByte(), 'A'.code.toByte(), 'K'.code.toByte(), '0'.code.toByte(), '0'.code.toByte(), '1'.code.toByte())
    private const val TAG_BYTES = 32
    private const val MAX_MANIFEST_BYTES = 64 * 1024
    private const val MAX_DATABASE_BYTES = 512L * 1024L * 1024L
    const val MAX_BACKUP_FILE_BYTES = MAX_DATABASE_BYTES + MAX_MANIFEST_BYTES + 128L

    data class BackupManifest(
        val backupVersion: Int,
        val vaultId: String,
        val createdAtEpochMillis: Long,
        val recoveryRootWrapped: WrappedBlob,
    ) {
        init {
            require(backupVersion == CryptoConstants.BACKUP_VERSION) { "Unsupported backup version: $backupVersion" }
            require(ID_PATTERN.matches(vaultId)) { "Invalid backup vault identifier" }
            require(createdAtEpochMillis > 0L) { "Invalid backup creation time" }
            require(createdAtEpochMillis <= System.currentTimeMillis() + MAX_FUTURE_CLOCK_SKEW_MILLIS) {
                "Backup creation time is implausibly far in the future"
            }
            require(recoveryRootWrapped.nonce.size == CryptoConstants.GCM_NONCE_BYTES) {
                "Invalid recovery wrapper nonce"
            }
            require(recoveryRootWrapped.ciphertext.size == WRAPPED_ROOT_BYTES) {
                "Invalid recovery wrapper ciphertext"
            }
        }
        fun toJson(): JSONObject = JSONObject().apply {
            put("backupVersion", backupVersion)
            put("vaultId", vaultId)
            put("createdAtEpochMillis", createdAtEpochMillis)
            put("recoveryRootWrapped", JSONObject().apply {
                put("nonce", ByteOps.b64(recoveryRootWrapped.nonce))
                put("ciphertext", ByteOps.b64(recoveryRootWrapped.ciphertext))
            })
        }

        companion object {
            fun fromJson(json: JSONObject): BackupManifest {
                val wrapped = json.getJSONObject("recoveryRootWrapped")
                return BackupManifest(
                    backupVersion = json.getInt("backupVersion"),
                    vaultId = json.getString("vaultId"),
                    createdAtEpochMillis = json.getLong("createdAtEpochMillis"),
                    recoveryRootWrapped = WrappedBlob(
                        ByteOps.fromB64(wrapped.getString("nonce")),
                        ByteOps.fromB64(wrapped.getString("ciphertext")),
                    ),
                )
            }
        }
    }

    data class Descriptor(
        val file: File,
        val manifest: BackupManifest,
        val databaseOffset: Long,
        val databaseLength: Long,
        val authenticatedLength: Long,
    )

    fun write(
        destination: File,
        databaseFile: File,
        manifest: BackupManifest,
        rootKey: ByteArray,
    ) {
        require(databaseFile.isFile) { "Encrypted database is missing" }
        destination.parentFile?.let { directory ->
            require(directory.isDirectory || directory.mkdirs()) { "Backup destination directory could not be created" }
            require(directory.isDirectory) { "Backup destination parent is not a directory" }
        }
        require(!destination.exists()) { "Refusing to overwrite an existing backup file" }
        val databaseLength = databaseFile.length()
        require(databaseLength in 1..MAX_DATABASE_BYTES)
        val manifestBytes = manifest.toJson().toString().toByteArray(Charsets.UTF_8)
        require(manifestBytes.size in 1..MAX_MANIFEST_BYTES)

        val authKey = Hkdf.sha256(
            ikm = rootKey,
            info = CryptoConstants.INFO_BACKUP_AUTH.toByteArray(Charsets.UTF_8),
            length = 32,
        )
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(authKey, "HmacSHA256")) }
        try {
            FileOutputStream(destination).use { raw ->
                val buffered = BufferedOutputStream(raw)
                val out = DataOutputStream(buffered)
                fun writeAuthenticated(bytes: ByteArray) {
                    out.write(bytes)
                    mac.update(bytes)
                }
                fun writeIntAuthenticated(value: Int) {
                    val bytes = byteArrayOf(
                        (value ushr 24).toByte(), (value ushr 16).toByte(),
                        (value ushr 8).toByte(), value.toByte(),
                    )
                    writeAuthenticated(bytes)
                }
                fun writeLongAuthenticated(value: Long) {
                    val bytes = ByteArray(8) { index -> (value ushr (56 - index * 8)).toByte() }
                    writeAuthenticated(bytes)
                }

                writeAuthenticated(MAGIC)
                writeIntAuthenticated(CryptoConstants.BACKUP_VERSION)
                writeIntAuthenticated(manifestBytes.size)
                writeLongAuthenticated(databaseLength)
                writeAuthenticated(manifestBytes)
                FileInputStream(databaseFile).use { input ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    try {
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            out.write(buffer, 0, count)
                            mac.update(buffer, 0, count)
                        }
                    } finally {
                        ByteOps.wipe(buffer)
                    }
                }
                val tag = mac.doFinal()
                try {
                    out.write(tag)
                    out.flush()
                    raw.fd.sync()
                } finally {
                    ByteOps.wipe(tag)
                }
            }
        } catch (error: Throwable) {
            deleteAfterFailure(destination, error)
            throw error
        } finally {
            ByteOps.wipe(authKey)
            ByteOps.wipe(manifestBytes)
        }
    }

    fun inspect(file: File): Descriptor {
        require(file.isFile) { "Backup file is missing or invalid" }
        require(file.length() in MIN_FILE_BYTES..MAX_BACKUP_FILE_BYTES) { "Backup file size is invalid" }
        val magic = ByteArray(MAGIC.size)
        try {
            DataInputStream(BufferedInputStream(FileInputStream(file))).use { input ->
                input.readFully(magic)
                require(ByteOps.constantTimeEquals(magic, MAGIC)) { "This is not a Life Vault backup" }
                val version = input.readInt()
                require(version == CryptoConstants.BACKUP_VERSION) { "Unsupported backup version: $version" }
                val manifestLength = input.readInt()
                require(manifestLength in 1..MAX_MANIFEST_BYTES) { "Backup manifest length is invalid" }
                val databaseLength = input.readLong()
                require(databaseLength in 1..MAX_DATABASE_BYTES) { "Backup database length is invalid" }
                val manifestBytes = ByteArray(manifestLength)
                val manifest = try {
                    input.readFully(manifestBytes)
                    BackupManifest.fromJson(JSONObject(String(manifestBytes, Charsets.UTF_8)))
                } finally {
                    ByteOps.wipe(manifestBytes)
                }

                val databaseOffset = (MAGIC.size + 4 + 4 + 8 + manifestLength).toLong()
                val authenticatedLength = databaseOffset + databaseLength
                val expectedLength = authenticatedLength + TAG_BYTES
                require(file.length() == expectedLength) { "Backup is truncated or contains trailing data" }
                return Descriptor(file, manifest, databaseOffset, databaseLength, authenticatedLength)
            }
        } finally {
            ByteOps.wipe(magic)
        }
    }

    fun verify(descriptor: Descriptor, rootKey: ByteArray) {
        val authKey = Hkdf.sha256(
            ikm = rootKey,
            info = CryptoConstants.INFO_BACKUP_AUTH.toByteArray(Charsets.UTF_8),
            length = 32,
        )
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(authKey, "HmacSHA256")) }
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        val actual = ByteArray(TAG_BYTES)
        var expected: ByteArray? = null
        try {
            FileInputStream(descriptor.file).use { input ->
                var remaining = descriptor.authenticatedLength
                while (remaining > 0) {
                    val count = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                    require(count > 0) { "Backup ended unexpectedly" }
                    mac.update(buffer, 0, count)
                    remaining -= count
                }
                DataInputStream(input).readFully(actual)
                require(input.read() == -1) { "Backup contains trailing data" }
                val calculated = mac.doFinal()
                expected = calculated
                require(ByteOps.constantTimeEquals(actual, calculated)) { "Backup authentication failed" }
            }
        } finally {
            ByteOps.wipe(authKey)
            ByteOps.wipe(buffer)
            ByteOps.wipe(actual)
            ByteOps.wipe(expected)
        }
    }

    fun extractDatabase(descriptor: Descriptor, destination: File) {
        destination.parentFile?.let { directory ->
            require(directory.isDirectory || directory.mkdirs()) { "Restore destination directory could not be created" }
            require(directory.isDirectory) { "Restore destination parent is not a directory" }
        }
        require(!destination.exists()) { "Refusing to overwrite an existing restored database" }
        RandomAccessFile(descriptor.file, "r").use { source ->
            source.seek(descriptor.databaseOffset)
            FileOutputStream(destination).use { output ->
                var remaining = descriptor.databaseLength
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                try {
                    while (remaining > 0) {
                        val count = source.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                        require(count > 0) { "Backup database ended unexpectedly" }
                        output.write(buffer, 0, count)
                        remaining -= count
                    }
                    output.flush()
                    output.fd.sync()
                } catch (error: Throwable) {
                    deleteAfterFailure(destination, error)
                    throw error
                } finally {
                    ByteOps.wipe(buffer)
                }
            }
        }
    }


    private fun deleteAfterFailure(file: File, failure: Throwable) {
        if (file.exists() && (!file.delete() || file.exists())) {
            failure.addSuppressed(IllegalStateException("Partial file could not be deleted: ${file.name}"))
        }
    }

    private val ID_PATTERN = Regex("[A-Za-z0-9._-]{1,128}")
    private const val WRAPPED_ROOT_BYTES = CryptoConstants.ROOT_KEY_BYTES + (CryptoConstants.GCM_TAG_BITS / 8)
    private const val MAX_FUTURE_CLOCK_SKEW_MILLIS = 24L * 60L * 60L * 1_000L
    private const val MIN_FILE_BYTES = 8L + 4 + 4 + 8 + 2 + TAG_BYTES
}
