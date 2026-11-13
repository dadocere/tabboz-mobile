package it.tabboz.simulator

import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

/** Real WebView/engine and native Android dialogs on a dedicated emulator. */
class GameplayTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private lateinit var scenario: ActivityScenario<MainActivity>
    private lateinit var activity: MainActivity

    @Before fun launch() {
        Telemetry.set(context, analytics = false, crashes = false)
        context.getSharedPreferences("tabboz.ads.v1", 0).edit().clear().commit()
        scenario = ActivityScenario.launch(Intent(context, MainActivity::class.java).putExtra("qa_no_ads", true))
        scenario.onActivity { activity = it }
        waitFor("engine startup") { js("!!window.TabbozMobile && !!document.querySelector('#screen > .window')") == "true" }
        // Only this task's emulator is used; invalidate the old save hook before clearing test state.
        js("window._activeWindowHwnd=null;localStorage.clear();location.reload();true")
        Thread.sleep(700)
        openGame()
    }
    @After fun close() { if (::scenario.isInitialized) scenario.close() }
    private fun js(script: String): String {
        val done = CountDownLatch(1)
        var result = "null"
        instrumentation.runOnMainSync {
            activity.webView.evaluateJavascript(script) { value -> result = value ?: "null"; done.countDown() }
        }
        assertTrue("JavaScript callback timed out", done.await(10, TimeUnit.SECONDS))
        return result
    }
    private fun text(script: String) = JSONTokener(js(script)).nextValue().toString()
    private fun waitFor(description: String, timeout: Long = 20000, condition: () -> Boolean) {
        val end = System.currentTimeMillis() + timeout
        while (System.currentTimeMillis() < end) { if (runCatching(condition).getOrDefault(false)) return; Thread.sleep(120) }
        fail("Timed out: $description. " + runCatching { text("document.body.innerText") }.getOrDefault(""))
    }
    private fun click(selector: String) {
        waitFor("control $selector") { js("!!document.querySelector(${JSONObject.quote(selector)})") == "true" }
        js("document.querySelector(${JSONObject.quote(selector)}).click();true")
    }
    private fun tapElement(expression: String) {
        val box = JSONObject(text("JSON.stringify((()=>{let r=($expression).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:innerWidth}})())"))
        var ratio = 1.0; val position = IntArray(2)
        scenario.onActivity { it.webView.getLocationOnScreen(position); ratio = it.webView.width / box.getDouble("width") }
        assertTrue(device.click(position[0] + (box.getDouble("x") * ratio).toInt(), position[1] + (box.getDouble("y") * ratio).toInt()))
    }
    private fun openGame() {
        waitFor("game windows") { js("!!document.querySelector('#screen > .window')") == "true" }
        if (js("!!document.querySelector('[aria-label=\"Avvia Tabboz Simulator\"]')") == "true") click("[aria-label=\"Avvia Tabboz Simulator\"]")
        waitFor("main game") { js("!!document.querySelector('[data-dialog=\"1\"]') && window._activeWindowHwnd===Number(document.querySelector('[data-dialog=\"1\"]').id.slice(3))") == "true" }
    }
    private fun settle() {
        for (i in 0..30) {
            if (js("!!document.querySelector('[data-dialog=\"1\"]') && window._activeWindowHwnd===Number(document.querySelector('[data-dialog=\"1\"]').id.slice(3))") == "true") return
            js("(()=>{let w=[...document.querySelectorAll('#screen > .window')].filter(e=>getComputedStyle(e).display!=='none').pop();let b=w?.querySelector('.button_ok,.button_cancel')||[...w.querySelectorAll('button')].find(e=>/^(OK|Ci rinuncio|Annulla|No)/i.test(e.textContent.trim()));b?.click();return true})()")
            Thread.sleep(180)
        }
        fail("Activity did not return to main: " + text("document.querySelector('#screen').innerText"))
    }
    @Test fun originalEngineTransactionsAndPersistentSave() {
        assertTrue(text("document.querySelector('[data-dialog=\"1\"]').innerText").contains("10000 L."))
        click(".menu141")
        waitFor("tobacconist") { js("!!document.querySelector('[data-dialog=\"88\"]')") == "true" }
        click("[data-dialog=\"88\"] .control400")
        click("[data-dialog=\"88\"] .button_ok")
        Thread.sleep(400); settle()
        waitFor("purchase applied") { text("document.querySelector('[data-dialog=\"1\"]').innerText").contains("4000 L.") }
        click("[data-dialog=\"1\"] .control136")
        // School subject selected through the original dialog control, not engine state injection.
        waitFor("school") { text("document.querySelector('#screen').innerText").contains("Studia Agraria") }
        js("[...document.querySelectorAll('.dlg_item')].find(e=>e.textContent.trim()==='Studia Agraria').click();true")
        Thread.sleep(350); settle()
        waitFor("school score") { text("document.querySelector('[data-dialog=\"1\"]').innerText").contains("1/100") }
        js("window.TabbozMobile.save();true"); Thread.sleep(400)
        scenario.recreate(); scenario.onActivity { activity = it }; openGame()
        val main = text("document.querySelector('[data-dialog=\"1\"]').innerText")
        assertTrue(main.contains("4000 L.")); assertTrue(main.contains("1/100"))
    }
    @Test fun backupsRejectTruncationAndRoundTripAcrossReload() {
        js("window.TabbozMobile.save();true"); Thread.sleep(400)
        val backup = text("JSON.stringify({format:'tabboz-mobile',version:1,registry:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('HKEY_CURRENT_USER')).map(k=>[k,localStorage.getItem(k)]))})")
        assertTrue(JSONObject(backup).getJSONObject("registry").length() > 10)
        val before = text("JSON.stringify(Object.entries(localStorage).sort())")
        assertEquals("true", js("(()=>{try{window.TabbozMobile.restoreSave('{\"format\":\"tabboz-mobile\",\"version\":1,\"registry\":{}}');return false}catch(e){return true}})()"))
        assertEquals(before, text("JSON.stringify(Object.entries(localStorage).sort())"))
        js("window.TabbozAndroid.restore(${JSONObject.quote(backup)});true")
        Thread.sleep(700); openGame()
        assertTrue(text("document.querySelector('[data-dialog=\"1\"]').innerText").contains("10000 L."))
        // Exercise actual Android Storage Access Framework export and import launchers.
        js("window.webkit.messageHandlers.tabboz.postMessage({type:'export',payload:${JSONObject.quote(backup)}});true")
        assertTrue(device.wait(Until.hasObject(By.textContains("Tabboz.tabboz.json")), 10000))
        device.pressBack(); Thread.sleep(500)
        js("window.webkit.messageHandlers.tabboz.postMessage({type:'import'});true")
        assertTrue(device.wait(Until.hasObject(By.pkg("com.google.android.documentsui")), 10000) || device.wait(Until.hasObject(By.pkg("com.android.documentsui")), 1000))
        device.pressBack()
    }
    @Test fun privacyPreferencesAndRewardNoFillAreNonBlocking() {
        js("window.webkit.messageHandlers.tabboz.postMessage({type:'privacy'});true")
        assertTrue(device.wait(Until.hasObject(By.text("Privacy e diagnostica")), 5000))
        assertTrue(device.wait(Until.hasObject(By.text(Pattern.compile("Segnala una pubblicità", Pattern.CASE_INSENSITIVE))), 5000))
        device.findObject(By.text("Statistiche di utilizzo")).click()
        waitFor("analytics preference enabled") { Telemetry.analytics(context) }
        device.findObject(By.text("Segnalazioni di arresto anomalo")).click()
        waitFor("crash preference enabled") { Telemetry.crashes(context) }
        device.findObject(By.text(Pattern.compile("Fine", Pattern.CASE_INSENSITIVE))).click()
        scenario.recreate(); scenario.onActivity { activity = it }; openGame()
        assertTrue(Telemetry.analytics(context)); assertTrue(Telemetry.crashes(context))
        Telemetry.set(context, analytics = false, crashes = false)
        js("window.webkit.messageHandlers.tabboz.postMessage({type:'adReward'});true")
        assertTrue(device.wait(Until.hasObject(By.textContains("Nessun video disponibile")), 5000))
        device.findObject(By.text("OK")).click(); openGame()
    }
    @Test fun orientationBoundsAndOriginRestrictedBridge() {
        assertEquals(MainActivity.GAME_URL, text("location.href"))
        assertEquals("false", js("typeof TabbozNative==='undefined'"))
        for (orientation in listOf(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE, ActivityInfo.SCREEN_ORIENTATION_PORTRAIT)) {
            scenario.onActivity { it.requestedOrientation = orientation }
            Thread.sleep(1000)
            assertEquals("true", js("(()=>{let r=document.querySelector('[data-dialog=\"1\"]').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})()"))
        }
        scenario.onActivity {
            assertFalse(it.webView.settings.allowFileAccess)
            assertFalse(it.webView.settings.allowContentAccess)
        }
        // A navigated foreign origin cannot acquire the native interface.
        scenario.onActivity { it.webView.loadUrl("https://example.com/") }
        Thread.sleep(1200)
        assertEquals("null", js("typeof TabbozNative==='undefined'?null:'unexpected'"))
        scenario.onActivity { it.webView.loadUrl(MainActivity.GAME_URL) }; openGame()
    }
    @Test fun nativeTouchCoordinatesReachOriginalSchoolControls() {
        tapElement("document.querySelector('[data-dialog=\"1\"] .control136')")
        waitFor("school visible") { text("document.querySelector('#screen').innerText").contains("Studia Agraria") }
        tapElement("[...document.querySelectorAll('.dlg_item')].find(e=>e.textContent.trim()==='Studia Agraria')")
        Thread.sleep(350); settle()
        waitFor("native touch study completed") { text("document.querySelector('[data-dialog=\"1\"]').innerText").contains("1/100") }
        val folder = java.io.File(context.getExternalFilesDir(null), "qa").apply { mkdirs() }
        device.takeScreenshot(java.io.File(folder, "android-gameplay.png"))
    }
}
