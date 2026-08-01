package expo.modules.lifevaultnative.security

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.PersistableBundle
import expo.modules.lifevaultnative.VaultRuntime
import expo.modules.lifevaultnative.crypto.ByteOps
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

object SensitiveClipboard {
    private const val MAX_CLIPBOARD_CHARACTERS = 1_000_000

    fun copy(context: Context, value: String, timeoutSeconds: Int) {
        require(value.length <= MAX_CLIPBOARD_CHARACTERS) { "Clipboard value is too large" }
        require(timeoutSeconds in 5..120) { "Clipboard timeout is invalid" }

        val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Life Vault", value)
        clip.description.extras = PersistableBundle().apply {
            putBoolean("android.content.extra.IS_SENSITIVE", true)
        }
        manager.setPrimaryClip(clip)

        val valueBytes = value.toByteArray(Charsets.UTF_8)
        val expectedHash = try {
            MessageDigest.getInstance("SHA-256").digest(valueBytes)
        } finally {
            ByteOps.wipe(valueBytes)
        }
        val appContext = context.applicationContext
        VaultRuntime.executor.schedule({
            try {
                val clipboard = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val currentText = clipboard.primaryClip
                    ?.takeIf { it.itemCount > 0 }
                    ?.getItemAt(0)
                    ?.text
                    ?.toString()
                if (currentText != null) {
                    val currentBytes = currentText.toByteArray(Charsets.UTF_8)
                    val currentHash = try {
                        MessageDigest.getInstance("SHA-256").digest(currentBytes)
                    } finally {
                        ByteOps.wipe(currentBytes)
                    }
                    try {
                        if (ByteOps.constantTimeEquals(expectedHash, currentHash)) {
                            clipboard.clearPrimaryClip()
                        }
                    } finally {
                        ByteOps.wipe(currentHash)
                    }
                }
            } finally {
                ByteOps.wipe(expectedHash)
            }
        }, timeoutSeconds.toLong(), TimeUnit.SECONDS)
    }
}
