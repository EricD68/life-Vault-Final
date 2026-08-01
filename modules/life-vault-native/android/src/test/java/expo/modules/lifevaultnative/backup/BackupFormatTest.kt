package expo.modules.lifevaultnative.backup

import expo.modules.lifevaultnative.crypto.AesGcm
import expo.modules.lifevaultnative.crypto.ByteOps
import expo.modules.lifevaultnative.crypto.CryptoConstants
import expo.modules.lifevaultnative.crypto.WrappedBlob
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files

class BackupFormatTest {
    @Test fun writesVerifiesAndExtractsAuthenticatedPackage() {
        withBackupFixture { database, backup, root, _ ->
            val extracted = File(backup.parentFile, "restored.db")
            val descriptor = BackupFormat.inspect(backup)
            BackupFormat.verify(descriptor, root)
            BackupFormat.extractDatabase(descriptor, extracted)
            assertArrayEquals(database.readBytes(), extracted.readBytes())
        }
    }

    @Test fun rejectsTamperingTruncationAndTrailingData() {
        withBackupFixture { _, backup, root, _ ->
            val descriptor = BackupFormat.inspect(backup)

            val tampered = File(backup.parentFile, "tampered.lvault").also { backup.copyTo(it) }
            RandomAccessFile(tampered, "rw").use { file ->
                file.seek(descriptor.databaseOffset + 10)
                val original = file.readByte()
                file.seek(descriptor.databaseOffset + 10)
                file.writeByte(original.toInt() xor 1)
            }
            assertThrows(IllegalArgumentException::class.java) {
                BackupFormat.verify(BackupFormat.inspect(tampered), root)
            }

            val truncated = File(backup.parentFile, "truncated.lvault").also { backup.copyTo(it) }
            RandomAccessFile(truncated, "rw").use { it.setLength(it.length() - 1) }
            assertThrows(IllegalArgumentException::class.java) { BackupFormat.inspect(truncated) }

            val trailing = File(backup.parentFile, "trailing.lvault").also { backup.copyTo(it) }
            trailing.appendBytes(byteArrayOf(1))
            assertThrows(IllegalArgumentException::class.java) { BackupFormat.inspect(trailing) }
        }
    }

    @Test fun rejectsMalformedBackupManifestFields() {
        val validWrapped = WrappedBlob(
            nonce = ByteArray(CryptoConstants.GCM_NONCE_BYTES),
            ciphertext = ByteArray(CryptoConstants.ROOT_KEY_BYTES + CryptoConstants.GCM_TAG_BITS / 8),
        )
        assertThrows(IllegalArgumentException::class.java) {
            BackupFormat.BackupManifest(
                backupVersion = CryptoConstants.BACKUP_VERSION,
                vaultId = "invalid vault id with spaces",
                createdAtEpochMillis = 1L,
                recoveryRootWrapped = validWrapped,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            BackupFormat.BackupManifest(
                backupVersion = CryptoConstants.BACKUP_VERSION,
                vaultId = "valid-vault",
                createdAtEpochMillis = 0L,
                recoveryRootWrapped = validWrapped,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            BackupFormat.BackupManifest(
                backupVersion = CryptoConstants.BACKUP_VERSION,
                vaultId = "valid-vault",
                createdAtEpochMillis = 1L,
                recoveryRootWrapped = WrappedBlob(ByteArray(1), ByteArray(1)),
            )
        }
    }

    private fun withBackupFixture(
        action: (database: File, backup: File, root: ByteArray, recoveryKey: ByteArray) -> Unit,
    ) {
        val directory = Files.createTempDirectory("life-vault-backup-test").toFile()
        val database = File(directory, "vault.db").apply { writeBytes(ByteArray(8192) { (it % 251).toByte() }) }
        val backup = File(directory, "vault.lvb")
        val root = ByteOps.randomBytes(32)
        val recoveryKey = ByteOps.randomBytes(32)
        val recoveryWrapped = AesGcm.encrypt(recoveryKey, root, CryptoConstants.AAD_RECOVERY_ROOT)
        val manifest = BackupFormat.BackupManifest(
            backupVersion = CryptoConstants.BACKUP_VERSION,
            vaultId = "test-vault",
            createdAtEpochMillis = 1234L,
            recoveryRootWrapped = recoveryWrapped,
        )

        try {
            BackupFormat.write(backup, database, manifest, root)
            action(database, backup, root, recoveryKey)
        } finally {
            ByteOps.wipe(root)
            ByteOps.wipe(recoveryKey)
            directory.deleteRecursively()
        }
    }
}
