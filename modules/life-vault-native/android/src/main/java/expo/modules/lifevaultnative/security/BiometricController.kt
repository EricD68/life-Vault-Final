package expo.modules.lifevaultnative.security

import android.app.Activity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher

class BiometricController(
    private val activity: Activity,
    private val executor: Executor,
) {
    private val fragmentActivity: FragmentActivity = activity as? FragmentActivity
        ?: throw IllegalStateException("Life Vault biometric authentication requires a FragmentActivity host.")

    fun availability(): Int = BiometricManager.from(activity)
        .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)

    fun authenticate(
        title: String,
        subtitle: String,
        cipher: Cipher,
        onSuccess: (Cipher) -> Unit,
        onFailure: (String) -> Unit,
        onCancelledToPin: () -> Unit,
    ) {
        val completed = AtomicBoolean(false)
        val prompt = BiometricPrompt(
            fragmentActivity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val authenticatedCipher = result.cryptoObject?.cipher
                    if (!completed.compareAndSet(false, true)) return
                    if (authenticatedCipher == null) {
                        onFailure("Android did not return the protected cryptographic operation.")
                    } else {
                        onSuccess(authenticatedCipher)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (!completed.compareAndSet(false, true)) return
                    if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                        onCancelledToPin()
                    } else {
                        onFailure(errString.toString())
                    }
                }

                override fun onAuthenticationFailed() {
                    // The system prompt remains open; no application-level retry is performed here.
                }
            },
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setConfirmationRequired(true)
            .setNegativeButtonText("Use Life Vault PIN")
            .build()

        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
    }
}
