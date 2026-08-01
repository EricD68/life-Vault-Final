package expo.modules.lifevaultnative.storage

import expo.modules.lifevaultnative.crypto.ByteOps
import expo.modules.lifevaultnative.crypto.CryptoConstants
import expo.modules.lifevaultnative.crypto.WrappedBlob
import org.json.JSONObject


data class VaultManifest(
    val formatVersion: Int = CryptoConstants.MANIFEST_VERSION,
    val installId: String,
    val vaultId: String,
    val createdAtEpochMillis: Long,
    val pinSalt: ByteArray,
    val argonMemoryKb: Int,
    val argonIterations: Int,
    val argonParallelism: Int,
    val deviceSecretWrapped: WrappedBlob,
    val pinRootWrapped: WrappedBlob,
    val recoveryRootWrapped: WrappedBlob,
    val biometricRootWrapped: WrappedBlob? = null,
    val autoLockSeconds: Int = 60,
) {
    init {
        require(formatVersion == CryptoConstants.MANIFEST_VERSION) { "Unsupported vault format: $formatVersion" }
        require(ID_PATTERN.matches(installId)) { "Invalid installation identifier" }
        require(ID_PATTERN.matches(vaultId)) { "Invalid vault identifier" }
        require(createdAtEpochMillis > 0L) { "Invalid vault creation time" }
        require(createdAtEpochMillis <= System.currentTimeMillis() + MAX_FUTURE_CLOCK_SKEW_MILLIS) {
            "Vault creation time is implausibly far in the future"
        }
        require(pinSalt.size == CryptoConstants.PIN_SALT_BYTES) { "Invalid PIN salt" }
        require(argonMemoryKb == CryptoConstants.ARGON_MEMORY_KB) { "Unsupported Argon2 memory setting" }
        require(argonIterations == CryptoConstants.ARGON_ITERATIONS) { "Unsupported Argon2 iteration setting" }
        require(argonParallelism == CryptoConstants.ARGON_PARALLELISM) { "Unsupported Argon2 parallelism setting" }
        validateWrapped(deviceSecretWrapped, "device secret")
        validateWrapped(pinRootWrapped, "PIN root")
        validateWrapped(recoveryRootWrapped, "recovery root")
        biometricRootWrapped?.let { validateWrapped(it, "biometric root") }
        require(autoLockSeconds in AUTO_LOCK_VALUES) { "Unsupported auto-lock duration" }
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("formatVersion", formatVersion)
        put("installId", installId)
        put("vaultId", vaultId)
        put("createdAtEpochMillis", createdAtEpochMillis)
        put("pinSalt", ByteOps.b64(pinSalt))
        put("argonMemoryKb", argonMemoryKb)
        put("argonIterations", argonIterations)
        put("argonParallelism", argonParallelism)
        put("deviceSecretWrapped", deviceSecretWrapped.toJson())
        put("pinRootWrapped", pinRootWrapped.toJson())
        put("recoveryRootWrapped", recoveryRootWrapped.toJson())
        if (biometricRootWrapped != null) put("biometricRootWrapped", biometricRootWrapped.toJson())
        put("autoLockSeconds", autoLockSeconds)
    }

    fun copyForBackup(): JSONObject = JSONObject().apply {
        put("formatVersion", formatVersion)
        put("vaultId", vaultId)
        put("createdAtEpochMillis", createdAtEpochMillis)
        put("recoveryRootWrapped", recoveryRootWrapped.toJson())
    }

    companion object {
        private val ID_PATTERN = Regex("[A-Za-z0-9._-]{1,128}")
        private val AUTO_LOCK_VALUES = setOf(30, 60, 120, 300)
        private const val WRAPPED_SECRET_BYTES = CryptoConstants.ROOT_KEY_BYTES + (CryptoConstants.GCM_TAG_BITS / 8)
        private const val MAX_FUTURE_CLOCK_SKEW_MILLIS = 24L * 60L * 60L * 1_000L

        fun fromJson(json: JSONObject): VaultManifest {
            val version = json.getInt("formatVersion")
            require(version == CryptoConstants.MANIFEST_VERSION) { "Unsupported vault format: $version" }
            return VaultManifest(
                formatVersion = version,
                installId = json.getString("installId"),
                vaultId = json.getString("vaultId"),
                createdAtEpochMillis = json.getLong("createdAtEpochMillis"),
                pinSalt = ByteOps.fromB64(json.getString("pinSalt")),
                argonMemoryKb = json.getInt("argonMemoryKb"),
                argonIterations = json.getInt("argonIterations"),
                argonParallelism = json.getInt("argonParallelism"),
                deviceSecretWrapped = wrappedFromJson(json.getJSONObject("deviceSecretWrapped")),
                pinRootWrapped = wrappedFromJson(json.getJSONObject("pinRootWrapped")),
                recoveryRootWrapped = wrappedFromJson(json.getJSONObject("recoveryRootWrapped")),
                biometricRootWrapped = if (json.has("biometricRootWrapped")) wrappedFromJson(json.getJSONObject("biometricRootWrapped")) else null,
                autoLockSeconds = json.optInt("autoLockSeconds", 60),
            )
        }

        fun wrappedFromJson(json: JSONObject): WrappedBlob = WrappedBlob(
            nonce = ByteOps.fromB64(json.getString("nonce")),
            ciphertext = ByteOps.fromB64(json.getString("ciphertext")),
        ).also { validateWrapped(it, "wrapped secret") }

        private fun validateWrapped(blob: WrappedBlob, label: String) {
            require(blob.nonce.size == CryptoConstants.GCM_NONCE_BYTES) { "Invalid $label nonce" }
            require(blob.ciphertext.size == WRAPPED_SECRET_BYTES) { "Invalid $label ciphertext" }
        }
    }
}

private fun WrappedBlob.toJson(): JSONObject = JSONObject().apply {
    put("nonce", ByteOps.b64(nonce))
    put("ciphertext", ByteOps.b64(ciphertext))
}
