// SPDX-License-Identifier: GPL-3.0-or-later
package it.tabboz.simulator

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.UUID

class MainActivity : ComponentActivity() {
    companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val GAME_URL = "$ORIGIN/assets/index.html"
        const val MAX_BACKUP_BYTES = 1_048_576
    }
    lateinit var webView: WebView
        private set
    lateinit var ads: AdCoordinator
        private set
    var foreground = false
        private set
    var nativeBusy = false
        private set
    private val handler = Handler(Looper.getMainLooper())
    private var preparedRequest: String? = null
    private var preparedCallback: ((Boolean) -> Unit)? = null
    private var exportPayload: String? = null
    private var restoredDocument = false

    private val export = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val payload = exportPayload
        exportPayload = null
        if (uri != null && payload != null) runCatching {
            contentResolver.openOutputStream(uri, "wt")!!.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        }.onFailure { message("Impossibile esportare il salvataggio.") }
        nativeBusy = false
    }
    private val import = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        nativeBusy = false
        if (uri != null) restoreDocument(uri)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        exportPayload = savedInstanceState?.getString("pendingExport")
        // Native dialogs are not restored with this activity; never retain a stale UI lock.
        nativeBusy = false
        val container = FrameLayout(this).apply { setBackgroundColor(Color.rgb(0, 128, 128)) }
        setContentView(container)
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        webView = WebView(this)
        container.addView(webView, FrameLayout.LayoutParams(-1, -1))
        webView.setBackgroundColor(Color.rgb(0, 128, 128))
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(false)
            builtInZoomControls = true
            displayZoomControls = false
            textZoom = 100
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val response = loader.shouldInterceptRequest(request.url)
                if (response != null) {
                    if (request.url.path?.endsWith(".wasm") == true) response.mimeType = "application/wasm"
                    return response
                }
                return WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(byteArrayOf()))
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.url.toString() != GAME_URL
            override fun onPageFinished(view: WebView, url: String) {
                restoredDocument = true
            }
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Telemetry.diagnostic(this@MainActivity, "renderer_terminated")
                container.removeView(view)
                view.destroy()
                message("Il motore del gioco si è fermato. Riapri Tabboz per riprendere dal salvataggio.")
                return true
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsAlert(view: WebView, url: String, text: String, result: JsResult): Boolean {
                val dialog = AlertDialog.Builder(this@MainActivity).setTitle("Tabboz").setMessage(text)
                    .setPositiveButton("OK") { _, _ -> result.confirm() }.setOnCancelListener { result.cancel() }.create()
                dialog.show()
                return true
            }
        }
        ads = AdCoordinator(this)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "TabbozNative", setOf(ORIGIN)) { _, message, origin, mainFrame, _ ->
                if (!mainFrame || origin.toString() != ORIGIN) return@addWebMessageListener
                val body = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return@addWebMessageListener
                onBridgeMessage(body)
            }
        } else {
            handler.post { message("Aggiorna Android System WebView o Chrome per avviare Tabboz.") }
            return
        }
        webView.loadUrl(GAME_URL)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (nativeBusy || ads.presenting) return
                webView.evaluateJavascript("""(()=>{const menu=document.querySelector('.active-menu');if(menu){menu.classList.remove('active-menu');menu.querySelector('ul').style.display='none';return true;}const w=[...document.querySelectorAll('#screen > .window')].filter(e=>getComputedStyle(e).display!=='none').pop();if(w&&w.dataset.dialog!=='1'){const c=w.querySelector('.button_cancel,.button_ok');if(c){c.click();return true;}}return false;})()""") { handled ->
                    if (handled != "true") showDialog(AlertDialog.Builder(this@MainActivity).setTitle("Chiudi Tabboz?")
                        .setMessage("I progressi vengono salvati sul dispositivo.").setNegativeButton("Continua", null)
                        .setPositiveButton("Chiudi") { _, _ -> saveGame(); handler.postDelayed({ finish() }, 300) }.create())
                }
            }
        })
    }
    private fun onBridgeMessage(body: JSONObject) {
        when (body.optString("type")) {
            "adHeartbeat" -> ads.heartbeat(body.optString("active") == "true")
            "adCompleted" -> ads.completed(body.optString("token"))
            "adOpportunity" -> ads.opportunity(body.optString("token"))
            "adReward" -> ads.offerReward()
            "adPrivacy" -> ads.privacyOptions()
            "adPrepared" -> if (body.optString("request") == preparedRequest) finishPreparation(body.optString("ready") == "true")
            "privacy" -> showPrivacy()
            "error" -> { Telemetry.diagnostic(this, "engine_error"); message("Impossibile avviare il gioco. Chiudi e riapri Tabboz.") }
            "export" -> if (!nativeBusy && !ads.presenting) {
                val payload = body.optString("payload")
                if (payload.toByteArray().size <= MAX_BACKUP_BYTES) {
                    exportPayload = payload; nativeBusy = true; export.launch("Tabboz.tabboz.json")
                } else message("Il salvataggio è troppo grande.")
            }
            "import" -> if (!nativeBusy && !ads.presenting) { nativeBusy = true; import.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }
            "importError" -> message("Questo file non è un salvataggio Tabboz per mobile valido. I progressi precedenti sono conservati.")
        }
    }
    fun saveGame() {
        if (::webView.isInitialized && restoredDocument) webView.evaluateJavascript("window.TabbozMobile?.save()", null)
    }
    private fun restoreDocument(uri: Uri) {
        runCatching {
            val bytes = contentResolver.openInputStream(uri)!!.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(output.size() + count <= MAX_BACKUP_BYTES)
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            require(bytes.size <= MAX_BACKUP_BYTES)
            val payload = bytes.toString(Charsets.UTF_8)
            webView.evaluateJavascript("window.TabbozAndroid.restore(${JSONObject.quote(payload)})", null)
        }.onFailure { message("Impossibile leggere il salvataggio, oppure il file supera 1 MB.") }
    }
    fun prepareAd(token: String?, callback: (Boolean) -> Unit) {
        if (!foreground || nativeBusy || preparedCallback != null) { callback(false); return }
        nativeBusy = true
        webView.isEnabled = false
        val request = UUID.randomUUID().toString()
        preparedRequest = request; preparedCallback = callback
        webView.evaluateJavascript("window.TabbozAndroid.prepareAd(${token?.let(JSONObject::quote) ?: "null"},${JSONObject.quote(request)})", null)
        handler.postDelayed({ if (preparedRequest == request) finishPreparation(false) }, 5000)
    }
    private fun finishPreparation(ready: Boolean) {
        val callback = preparedCallback ?: return
        preparedCallback = null; preparedRequest = null
        callback(ready && foreground)
    }
    fun resumeAfterAd() {
        webView.isEnabled = true
        nativeBusy = false
        webView.evaluateJavascript("window.TabbozMobile?.endAd()", null)
    }
    fun showDialog(dialog: AlertDialog) {
        if (nativeBusy || !foreground || isFinishing) return
        nativeBusy = true
        dialog.setOnDismissListener { nativeBusy = false }
        dialog.show()
    }
    fun message(text: String) = showDialog(AlertDialog.Builder(this).setTitle("Tabboz").setMessage(text).setPositiveButton("OK", null).create())
    private fun showPrivacy() {
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(28, 12, 28, 12) }
        layout.addView(TextView(this).apply { text = "Analytics e diagnostica sono indipendenti. I nomi dei personaggi e i salvataggi non vengono inviati. Gli annunci rispettano le preferenze di consenso." })
        layout.addView(Switch(this).apply { text = "Statistiche di utilizzo"; isChecked = Telemetry.analytics(this@MainActivity); setOnCheckedChangeListener { _, checked -> Telemetry.set(this@MainActivity, analytics = checked) } })
        layout.addView(Switch(this).apply { text = "Segnalazioni di arresto anomalo"; isChecked = Telemetry.crashes(this@MainActivity); setOnCheckedChangeListener { _, checked -> Telemetry.set(this@MainActivity, crashes = checked) } })
        val dialog = AlertDialog.Builder(this).setTitle("Privacy e diagnostica").setView(layout).setPositiveButton("Fine", null).create()
        fun button(title: String, action: () -> Unit) { layout.addView(Button(this).apply { text = title; setOnClickListener { dialog.dismiss(); action() } }) }
        button("Informativa sulla privacy") { external("https://tabboz-mobile-2026.web.app/privacy") }
        button("Preferenze pubblicitarie") { ads.privacyOptions() }
        button("Segnala una pubblicità") { reportAd() }
        button("Licenze e attribuzioni") { showNotices() }
        showDialog(dialog)
    }
    private fun reportAd() {
        showDialog(AlertDialog.Builder(this).setTitle("Segnala una pubblicità")
            .setMessage("Puoi usare il menu dell'annuncio per segnalarlo a Google. Per assistenza, invia una descrizione dell'annuncio e l'orario a dadocere@hotmail.it. Non inviare salvataggi o dati personali.")
            .setNegativeButton("Chiudi", null).setPositiveButton("Scrivi email") { _, _ ->
                runCatching { startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:dadocere@hotmail.it?subject=Tabboz%20-%20segnalazione%20pubblicita"))) }
            }.create())
    }
    private fun showNotices() {
        val text = assets.open("licenses/ThirdPartyNotices.txt").bufferedReader().use { it.readText() }
        val view = TextView(this).apply { this.text = text; setPadding(24, 16, 24, 16); setTextIsSelectable(true) }
        val scroll = ScrollView(this).apply { addView(view) }
        showDialog(AlertDialog.Builder(this).setTitle("Licenze e attribuzioni").setView(scroll).setPositiveButton("Chiudi", null).create())
    }
    private fun external(url: String) { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
    override fun onResume() {
        super.onResume(); foreground = true
        if (::webView.isInitialized) { webView.onResume(); webView.evaluateJavascript("window.TabbozAndroid?.setActive(true)", null) }
        if (::ads.isInitialized) ads.foreground()
    }
    override fun onPause() {
        if (::webView.isInitialized) { saveGame(); webView.evaluateJavascript("window.TabbozAndroid?.setActive(false)", null); webView.onPause() }
        foreground = false
        if (::ads.isInitialized) ads.background()
        super.onPause()
    }
    override fun onSaveInstanceState(outState: Bundle) {
        saveGame(); outState.putString("pendingExport", exportPayload)
        super.onSaveInstanceState(outState)
    }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (::ads.isInitialized) ads.destroy()
        if (::webView.isInitialized) { (webView.parent as? ViewGroup)?.removeView(webView); webView.destroy() }
        super.onDestroy()
    }
}
