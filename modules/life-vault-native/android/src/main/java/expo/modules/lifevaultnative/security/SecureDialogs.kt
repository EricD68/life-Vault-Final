package expo.modules.lifevaultnative.security

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Typeface
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import expo.modules.lifevaultnative.VaultRuntime
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

object SecureDialogs {
    fun promptPin(
        activity: Activity,
        title: String,
        message: String? = null,
        positiveLabel: String = "Continue",
        onResult: (List<Int>?) -> Unit,
    ) {
        promptPinDigits(
            activity = activity,
            title = title,
            message = message,
            positiveLabel = positiveLabel,
            enforcePolicy = false,
            onResult = onResult,
        )
    }

    fun promptNewPin(
        activity: Activity,
        title: String,
        message: String? = null,
        onResult: (List<Int>?) -> Unit,
    ) {
        promptPinDigits(
            activity = activity,
            title = title,
            message = message,
            positiveLabel = "Continue",
            enforcePolicy = true,
        ) { first ->
            if (first == null) {
                onResult(null)
                return@promptPinDigits
            }
            promptPinDigits(
                activity = activity,
                title = "Confirm Life Vault PIN",
                message = "Enter the same separate PIN again.",
                positiveLabel = "Confirm",
                enforcePolicy = false,
            ) { second ->
                when {
                    second == null -> onResult(null)
                    first == second -> onResult(first)
                    else -> showError(
                        activity,
                        title = "PINs do not match",
                        message = "The two Life Vault PINs were different. Start again.",
                    ) { promptNewPin(activity, title, message, onResult) }
                }
            }
        }
    }

    private fun promptPinDigits(
        activity: Activity,
        title: String,
        message: String?,
        positiveLabel: String,
        enforcePolicy: Boolean,
        onResult: (List<Int>?) -> Unit,
    ) {
        activity.runOnUiThread {
            val finished = AtomicBoolean(false)
            val box = verticalBox(activity)
            if (!message.isNullOrBlank()) box.addView(helpText(activity, message))
            val pinPad = PinPad(activity)
            box.addView(pinPad.root)
            val error = errorText(activity)
            box.addView(error)

            val dialog = AlertDialog.Builder(activity)
                .setTitle(title)
                .setView(box)
                .setPositiveButton(positiveLabel, null)
                .setNegativeButton("Cancel") { _, _ -> finishOnce(finished, onResult, null) }
                .create()
            dialog.setOnCancelListener { finishOnce(finished, onResult, null) }
            dialog.setOnDismissListener { pinPad.clear() }
            dialog.setOnShowListener {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).apply {
                    filterTouchesWhenObscured = true
                    setOnClickListener {
                    VaultRuntime.touch()
                    val digits = pinPad.value()
                    val validation = if (enforcePolicy) PinPolicy.validate(digits) else null
                    when {
                        digits.size !in PinPolicy.MIN_LENGTH..PinPolicy.MAX_LENGTH -> {
                            error.text = "Enter ${PinPolicy.MIN_LENGTH} to ${PinPolicy.MAX_LENGTH} digits."
                        }
                        validation != null && !validation.valid -> {
                            error.text = validation.message ?: "That PIN is not permitted."
                        }
                        else -> {
                            dialog.dismiss()
                            finishOnce(finished, onResult, digits)
                        }
                    }
                }
                }
            }
            dialog.show()
            secureDialog(dialog)
        }
    }

    fun showRecoveryPhrase(
        activity: Activity,
        words: List<String>,
        onContinue: (Boolean) -> Unit,
    ) {
        activity.runOnUiThread {
            require(words.size == RecoveryPhraseCheck.REQUIRED_WORDS) {
                "A recovery phrase must contain ${RecoveryPhraseCheck.REQUIRED_WORDS} words."
            }

            val finished = AtomicBoolean(false)
            val root = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                filterTouchesWhenObscured = true
                setPadding(dp(activity, 20), dp(activity, 18), dp(activity, 20), dp(activity, 14))
            }

            root.addView(TextView(activity).apply {
                text = "Write down your 24-word recovery phrase"
                textSize = 20f
                typeface = Typeface.DEFAULT_BOLD
                setTextIsSelectable(false)
            })
            root.addView(helpText(
                activity,
                "This is the only portable recovery method. Write every word on paper, in order. Do not screenshot or store it digitally.",
            ).apply {
                setPadding(0, dp(activity, 10), 0, dp(activity, 10))
            })

            val phraseText = TextView(activity).apply {
                text = words.mapIndexed { index, word -> "${index + 1}. $word" }.joinToString("\n")
                textSize = 17f
                typeface = Typeface.MONOSPACE
                setTextIsSelectable(false)
                setPadding(dp(activity, 10), dp(activity, 10), dp(activity, 10), dp(activity, 10))
                contentDescription = "Twenty-four word recovery phrase"
            }
            val scroll = ScrollView(activity).apply {
                isFillViewport = true
                addView(
                    phraseText,
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ),
                )
            }
            root.addView(
                scroll,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f,
                ),
            )

            lateinit var dialog: AlertDialog
            val buttonRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(activity, 12), 0, 0)
            }
            val cancel = Button(activity).apply {
                text = "Cancel setup"
                isAllCaps = false
                filterTouchesWhenObscured = true
                setOnClickListener {
                    VaultRuntime.touch()
                    if (finished.compareAndSet(false, true)) {
                        dialog.dismiss()
                        onContinue(false)
                    }
                }
            }
            val continueButton = Button(activity).apply {
                text = "Continue"
                isAllCaps = false
                filterTouchesWhenObscured = true
                setOnClickListener {
                    VaultRuntime.touch()
                    if (finished.compareAndSet(false, true)) {
                        dialog.dismiss()
                        onContinue(true)
                    }
                }
            }
            buttonRow.addView(
                cancel,
                LinearLayout.LayoutParams(0, dp(activity, 52), 1f).apply {
                    marginEnd = dp(activity, 4)
                },
            )
            buttonRow.addView(
                continueButton,
                LinearLayout.LayoutParams(0, dp(activity, 52), 1f).apply {
                    marginStart = dp(activity, 4)
                },
            )
            root.addView(
                buttonRow,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )

            dialog = AlertDialog.Builder(activity)
                .setView(root)
                .create()
            dialog.setCanceledOnTouchOutside(false)
            dialog.setOnCancelListener {
                if (finished.compareAndSet(false, true)) onContinue(false)
            }
            dialog.setOnDismissListener {
                phraseText.text = ""
            }
            dialog.show()
            secureDialog(dialog)
            sizeRecoveryDialog(activity, dialog)
        }
    }

    fun confirmRecoveryPhraseSample(
        activity: Activity,
        expectedWords: List<String>,
        onResult: (Boolean) -> Unit,
    ) {
        activity.runOnUiThread {
            require(expectedWords.size == RecoveryPhraseCheck.REQUIRED_WORDS) {
                "A recovery phrase must contain ${RecoveryPhraseCheck.REQUIRED_WORDS} words."
            }

            val finished = AtomicBoolean(false)
            val positions = RecoveryPhraseCheck.selectPositions()
            var current = 0

            val root = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                filterTouchesWhenObscured = true
                setPadding(dp(activity, 20), dp(activity, 18), dp(activity, 20), dp(activity, 14))
            }
            root.addView(TextView(activity).apply {
                text = "Confirm recovery phrase"
                textSize = 20f
                typeface = Typeface.DEFAULT_BOLD
                setTextIsSelectable(false)
            })
            root.addView(helpText(
                activity,
                "Enter three words from your paper copy. The app will not display answer choices.",
            ).apply {
                setPadding(0, dp(activity, 10), 0, dp(activity, 8))
            })

            val progress = TextView(activity).apply {
                textSize = 13f
                setTextIsSelectable(false)
            }
            val prompt = TextView(activity).apply {
                textSize = 19f
                typeface = Typeface.DEFAULT_BOLD
                setTextIsSelectable(false)
                setPadding(0, dp(activity, 4), 0, dp(activity, 8))
            }
            root.addView(progress)
            root.addView(prompt)

            val wordPad = RecoveryWordPad(activity)
            val wordPadScroll = ScrollView(activity).apply {
                isFillViewport = true
                addView(
                    wordPad.root,
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ),
                )
            }
            root.addView(
                wordPadScroll,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f,
                ),
            )
            val error = errorText(activity)
            root.addView(error)

            val buttonRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(activity, 10), 0, 0)
            }
            val cancel = Button(activity).apply {
                text = "Cancel setup"
                isAllCaps = false
                filterTouchesWhenObscured = true
            }
            val check = Button(activity).apply {
                text = "Check word"
                isAllCaps = false
                filterTouchesWhenObscured = true
            }
            buttonRow.addView(
                cancel,
                LinearLayout.LayoutParams(0, dp(activity, 52), 1f).apply {
                    marginEnd = dp(activity, 4)
                },
            )
            buttonRow.addView(
                check,
                LinearLayout.LayoutParams(0, dp(activity, 52), 1f).apply {
                    marginStart = dp(activity, 4)
                },
            )
            root.addView(buttonRow)

            lateinit var dialog: AlertDialog
            fun finish(value: Boolean) {
                if (finished.compareAndSet(false, true)) {
                    dialog.dismiss()
                    onResult(value)
                }
            }
            fun refreshPrompt() {
                progress.text = "Check ${current + 1} of ${positions.size}"
                prompt.text = "Enter word ${positions[current] + 1} of ${RecoveryPhraseCheck.REQUIRED_WORDS}"
                error.text = ""
                wordPad.clear()
            }

            dialog = AlertDialog.Builder(activity)
                .setView(root)
                .create()
            dialog.setCanceledOnTouchOutside(false)
            dialog.setOnCancelListener {
                if (finished.compareAndSet(false, true)) onResult(false)
            }
            dialog.setOnDismissListener {
                wordPad.clear()
            }

            cancel.setOnClickListener {
                VaultRuntime.touch()
                finish(false)
            }
            check.setOnClickListener {
                VaultRuntime.touch()
                val entered = wordPad.word()
                when {
                    entered.isBlank() -> error.text = "Enter the requested word."
                    !RecoveryPhraseCheck.matches(expectedWords, positions[current], entered) -> {
                        error.text = "That word does not match. Check your paper copy and try again."
                        wordPad.clear()
                    }
                    current + 1 < positions.size -> {
                        current += 1
                        refreshPrompt()
                    }
                    else -> finish(true)
                }
            }

            refreshPrompt()
            dialog.show()
            secureDialog(dialog)
            sizeRecoveryDialog(activity, dialog)
        }
    }

    fun promptRecoveryPhrase(
        activity: Activity,
        title: String,
        message: String,
        onResult: (List<String>?) -> Unit,
    ) {
        activity.runOnUiThread {
            val finished = AtomicBoolean(false)
            val box = verticalBox(activity)
            box.addView(helpText(activity, message))
            val phrasePad = RecoveryPhrasePad(activity)
            box.addView(phrasePad.root)
            val error = errorText(activity)
            box.addView(error)

            val dialog = AlertDialog.Builder(activity)
                .setTitle(title)
                .setView(box)
                .setPositiveButton("Continue", null)
                .setNegativeButton("Cancel") { _, _ -> finishOnce(finished, onResult, null) }
                .create()
            dialog.setOnCancelListener { finishOnce(finished, onResult, null) }
            dialog.setOnDismissListener { phrasePad.clear() }
            dialog.setOnShowListener {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).apply {
                    filterTouchesWhenObscured = true
                    setOnClickListener {
                        VaultRuntime.touch()
                        val words = phrasePad.words()
                        if (words.size != 24) {
                            error.text = "Enter all 24 words. Current count: ${words.size}."
                            return@setOnClickListener
                        }
                        dialog.dismiss()
                        finishOnce(finished, onResult, words)
                    }
                }
            }
            dialog.show()
            secureDialog(dialog)
        }
    }

    fun showError(activity: Activity, title: String, message: String, onDismiss: (() -> Unit)? = null) {
        activity.runOnUiThread {
            val dialog = AlertDialog.Builder(activity)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("OK") { _, _ -> onDismiss?.invoke() }
                .setOnCancelListener { onDismiss?.invoke() }
                .create()
            dialog.show()
            secureDialog(dialog)
        }
    }


    private fun secureDialog(dialog: AlertDialog) {
        dialog.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        dialog.window?.decorView?.filterTouchesWhenObscured = true
    }

    private fun sizeRecoveryDialog(activity: Activity, dialog: AlertDialog) {
        val metrics = activity.resources.displayMetrics
        val width = (metrics.widthPixels * 0.94f).toInt()
        val height = (metrics.heightPixels * 0.88f).toInt()
        dialog.window?.setLayout(width, height)
    }

    private fun verticalBox(activity: Activity): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        filterTouchesWhenObscured = true
        setPadding(dp(activity, 24), dp(activity, 8), dp(activity, 24), 0)
    }

    private fun helpText(activity: Activity, value: String): TextView = TextView(activity).apply {
        text = value
        textSize = 14f
        setPadding(0, 0, 0, dp(activity, 12))
    }

    private fun errorText(activity: Activity): TextView = TextView(activity).apply {
        textSize = 13f
        setTextColor(0xffb00020.toInt())
        setPadding(0, dp(activity, 8), 0, 0)
    }

    private class RecoveryWordPad(private val activity: Activity) {
        private val value = StringBuilder()
        private val display = TextView(activity).apply {
            textSize = 20f
            typeface = Typeface.MONOSPACE
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            setTextIsSelectable(false)
            setPadding(dp(activity, 8), dp(activity, 10), dp(activity, 8), dp(activity, 10))
            minHeight = dp(activity, 56)
            contentDescription = "Recovery word entry"
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        }

        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            filterTouchesWhenObscured = true
            addView(
                this@RecoveryWordPad.display,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(activity, 64),
                ),
            )
            addView(letterRow("qwertyuiop"))
            addView(letterRow("asdfghjkl"))
            addView(letterRow("zxcvbnm"))
            val controls = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(keyButton("⌫", 1f) { backspace() })
                addView(keyButton("Clear", 1f) { clear() })
            }
            addView(
                controls,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(activity, 52),
                ),
            )
        }

        fun word(): String = value.toString().lowercase(Locale.ROOT).trim()

        fun clear() {
            for (index in value.indices) value.setCharAt(index, '\u0000')
            value.setLength(0)
            update()
        }

        private fun letterRow(keys: String): LinearLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            keys.forEach { letter ->
                addView(keyButton(letter.toString(), 1f) {
                    if (value.length < MAX_RECOVERY_WORD_CHARACTERS) {
                        value.append(letter)
                        update()
                    }
                })
            }
        }

        private fun keyButton(label: String, weight: Float, action: () -> Unit): Button =
            Button(activity).apply {
                text = label
                textSize = if (label.length == 1) 15f else 12f
                isAllCaps = false
                minWidth = 0
                minimumWidth = 0
                setPadding(0, 0, 0, 0)
                layoutParams = LinearLayout.LayoutParams(0, dp(activity, 48), weight).apply {
                    setMargins(dp(activity, 1), dp(activity, 1), dp(activity, 1), dp(activity, 1))
                }
                filterTouchesWhenObscured = true
                setOnClickListener {
                    VaultRuntime.touch()
                    action()
                }
            }

        private fun backspace() {
            if (value.isNotEmpty()) {
                value.deleteCharAt(value.lastIndex)
                update()
            }
        }

        private fun update() {
            display.text = if (value.isEmpty()) "—" else value.toString()
        }

        init {
            update()
        }

        companion object {
            private const val MAX_RECOVERY_WORD_CHARACTERS = 16
        }
    }

    private class RecoveryPhrasePad(private val activity: Activity) {
        private val value = StringBuilder()
        private val wordList: List<String> = activity.assets.open("bip39_english.txt")
            .bufferedReader()
            .useLines { lines -> lines.map(String::trim).filter(String::isNotBlank).toList() }
        private val display = TextView(activity).apply {
            textSize = 16f
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(false)
            setPadding(dp(activity, 10), dp(activity, 10), dp(activity, 10), dp(activity, 10))
            minHeight = dp(activity, 100)
            contentDescription = "Recovery phrase entry"
        }
        private val count = TextView(activity).apply {
            textSize = 12f
            setPadding(0, dp(activity, 4), 0, dp(activity, 6))
        }
        private val suggestions = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            filterTouchesWhenObscured = true
            val scroll = ScrollView(activity).apply {
                addView(this@RecoveryPhrasePad.display, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            }
            addView(scroll, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(activity, 120)))
            addView(count, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(suggestions, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(activity, 48)))
            addView(letterRow("qwertyuiop"))
            addView(letterRow("asdfghjkl"))
            addView(letterRow("zxcvbnm"))
            val controls = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(keyButton("Space", 2f) { appendSpace() })
                addView(keyButton("⌫", 1f) { backspace() })
                addView(keyButton("Clear", 1f) { clear() })
            }
            addView(controls, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(activity, 52)))
        }

        fun words(): List<String> = value.toString()
            .lowercase(Locale.ROOT)
            .trim()
            .split(Regex("\\s+"))
            .filter(String::isNotBlank)

        fun clear() {
            for (index in value.indices) value.setCharAt(index, '\u0000')
            value.setLength(0)
            update()
        }

        private fun letterRow(keys: String): LinearLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            keys.forEach { letter -> addView(keyButton(letter.toString(), 1f) { appendLetter(letter) }) }
        }

        private fun keyButton(label: String, weight: Float, action: () -> Unit): Button = Button(activity).apply {
            text = label
            textSize = if (label.length == 1) 15f else 12f
            isAllCaps = false
            minWidth = 0
            minimumWidth = 0
            setPadding(0, 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, dp(activity, 48), weight).apply {
                setMargins(dp(activity, 1), dp(activity, 1), dp(activity, 1), dp(activity, 1))
            }
            filterTouchesWhenObscured = true
            setOnClickListener {
                VaultRuntime.touch()
                action()
            }
        }

        private fun appendLetter(letter: Char) {
            if (value.length >= MAX_RECOVERY_CHARACTERS || words().size >= 24 && currentPrefix().isBlank()) return
            value.append(letter)
            update()
        }

        private fun appendSpace() {
            if (value.isNotEmpty() && value.last() != ' ' && words().size < 24) value.append(' ')
            update()
        }

        private fun backspace() {
            if (value.isNotEmpty()) value.deleteCharAt(value.lastIndex)
            update()
        }

        private fun currentPrefix(): String {
            val text = value.toString()
            val start = text.lastIndexOf(' ') + 1
            return text.substring(start).lowercase(Locale.ROOT)
        }

        private fun acceptSuggestion(word: String) {
            val start = value.lastIndexOf(" ") + 1
            value.delete(start, value.length)
            value.append(word)
            if (words().size < 24) value.append(' ')
            update()
        }

        private fun update() {
            val enteredWords = words()
            display.text = if (value.isEmpty()) "Use the private keypad below. Type a few letters and select the correct word." else value.toString()
            count.text = "Words: ${enteredWords.size} / 24"
            suggestions.removeAllViews()
            val prefix = currentPrefix()
            if (prefix.isNotBlank() && enteredWords.size <= 24) {
                wordList.asSequence().filter { it.startsWith(prefix) }.take(3).forEach { word ->
                    suggestions.addView(keyButton(word, 1f) { acceptSuggestion(word) })
                }
            }
        }

        init {
            update()
        }

        companion object {
            private const val MAX_RECOVERY_CHARACTERS = 256
        }
    }

    private class PinPad(private val activity: Activity) {
        private val digits = mutableListOf<Int>()
        private val display = TextView(activity).apply {
            textSize = 24f
            typeface = Typeface.MONOSPACE
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            contentDescription = "Life Vault PIN entry"
            setPadding(0, dp(activity, 8), 0, dp(activity, 12))
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        }

        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            filterTouchesWhenObscured = true
            addView(this@PinPad.display, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(activity, 56)))
            val grid = GridLayout(activity).apply {
                columnCount = 3
                rowCount = 4
                useDefaultMargins = true
            }
            val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫")
            keys.forEach { label ->
                if (label.isBlank()) {
                    grid.addView(View(activity), gridCell())
                } else {
                    val button = Button(activity).apply {
                        text = label
                        textSize = 20f
                        isAllCaps = false
                        contentDescription = if (label == "⌫") "Delete last digit" else "Digit $label"
                        filterTouchesWhenObscured = true
                        setOnClickListener {
                            VaultRuntime.touch()
                            if (label == "⌫") {
                                if (digits.isNotEmpty()) digits.removeAt(digits.lastIndex)
                            } else if (digits.size < PinPolicy.MAX_LENGTH) {
                                digits.add(label.single().digitToInt())
                            }
                            updateDisplay()
                        }
                    }
                    grid.addView(button, gridCell())
                }
            }
            addView(grid, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }

        fun value(): List<Int> = digits.toList()

        fun clear() {
            digits.indices.forEach { digits[it] = 0 }
            digits.clear()
            updateDisplay()
        }

        private fun updateDisplay() {
            display.text = if (digits.isEmpty()) "—" else "● ".repeat(digits.size).trim()
        }

        private fun gridCell(): GridLayout.LayoutParams = GridLayout.LayoutParams().apply {
            width = 0
            height = dp(activity, 56)
            columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
            setMargins(dp(activity, 3), dp(activity, 3), dp(activity, 3), dp(activity, 3))
        }

        init {
            updateDisplay()
        }
    }

    private fun <T> finishOnce(done: AtomicBoolean, callback: (T?) -> Unit, value: T?) {
        if (done.compareAndSet(false, true)) callback(value)
    }

    private fun dp(activity: Activity, value: Int): Int =
        (value * activity.resources.displayMetrics.density).toInt()
}
