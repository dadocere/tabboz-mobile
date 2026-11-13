package it.tabboz.simulator

import android.content.Intent
import android.util.Log
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

/** Explicit network test: official Google test units, actual five-minute gameplay grace. */
class AdsSdkSmokeTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private lateinit var activity: MainActivity
    private fun js(script: String): String {
        val latch = CountDownLatch(1); var result = "null"
        instrumentation.runOnMainSync { activity.webView.evaluateJavascript(script) { result = it ?: "null"; latch.countDown() } }
        check(latch.await(10, TimeUnit.SECONDS)); return result
    }
    private fun text(script: String) = JSONTokener(js(script)).nextValue().toString()
    private fun waitFor(label: String, timeout: Long = 30000, check: () -> Boolean) {
        val end = System.currentTimeMillis() + timeout
        while (System.currentTimeMillis() < end) { if (runCatching(check).getOrDefault(false)) return; Thread.sleep(300) }
        fail("SDK flow timed out: $label")
    }
    private fun status(): String { var value = ""; instrumentation.runOnMainSync { value = activity.ads.sdkStatus }; return value }
    private fun isPresenting(): Boolean { var value = false; instrumentation.runOnMainSync { value = activity.ads.presenting }; return value }
    private fun played(): Double { var value = 0.0; instrumentation.runOnMainSync { value = activity.ads.policy.state.played }; return value }
    private fun openGame() {
        waitFor("game ready") {
            js("document.querySelector('[aria-label=\"Avvia Tabboz Simulator\"]')?.click();!!document.querySelector('[data-dialog=\"1\"]')") == "true"
        }
    }
    private fun outing() {
        js("document.querySelector('[data-dialog=\"1\"] .control134').click();true")
        waitFor("companions") { text("document.querySelector('#screen').innerText").contains("Esci con la compagnia") }
        js("[...document.querySelectorAll('.dlg_item')].find(e=>e.textContent.trim()==='Esci con la compagnia').click();true")
        waitFor("return to main") {
            js("(()=>{let m=document.querySelector('[data-dialog=\"1\"]');if(m&&window._activeWindowHwnd===Number(m.id.slice(3)))return true;let w=[...document.querySelectorAll('#screen > .window')].filter(e=>getComputedStyle(e).display!=='none').pop();(w?.querySelector('.button_ok,.button_cancel')||[...w.querySelectorAll('button')].find(e=>/^(OK|Ci rinuncio|Annulla|No)/i.test(e.textContent.trim())))?.click();return false})()") == "true"
        }
    }
    private fun closeAd() {
        // Google test creatives may have a second end-card close button.
        val end = System.currentTimeMillis() + 90000
        while (System.currentTimeMillis() < end) {
            if (!isPresenting()) return
            device.findObject(By.text(Pattern.compile("Got it", Pattern.CASE_INSENSITIVE)))?.let { it.click(); Thread.sleep(500) }
            val regex = Pattern.compile(".*(close|chiudi|dismiss).*", Pattern.CASE_INSENSITIVE)
            val button = device.findObject(By.desc(regex).enabled(true)) ?: device.findObject(By.text(regex).enabled(true))
            if (button != null && isPresenting()) { button.click(); Thread.sleep(1000) } else Thread.sleep(500)
        }
        fail("No working SDK close control; status=" + status())
    }
    @Test fun realGraceInterstitialAndRewardedReturnToGame() {
        Telemetry.set(context, analytics = false, crashes = false)
        context.getSharedPreferences("tabboz.ads.v1", 0).edit().clear().commit()
        var scenario = ActivityScenario.launch<MainActivity>(Intent(context, MainActivity::class.java).putExtra("qa_ad_sdk", true))
        try {
            scenario.onActivity { activity = it }; openGame()
            waitFor("sample rewarded ad preload", 90000) { status() == "reward_ready" }
            repeat(5) { outing() }
            waitFor("five recorded completed activities") {
                var count = 0
                instrumentation.runOnMainSync { count = activity.ads.policy.state.totalActivities }
                count == 5
            }
            var completed = 0
            instrumentation.runOnMainSync { completed = activity.ads.policy.state.totalActivities }
            assertEquals("Completed activity counter", 5, completed)
            assertTrue("Must still be inside original grace", played() < 300)
            val deadline = System.currentTimeMillis() + 330000
            var loggedMinute = -1
            while (played() < 301 && System.currentTimeMillis() < deadline) {
                Thread.sleep(1000)
                val minute = played().toInt() / 60
                if (minute != loggedMinute) { loggedMinute = minute; Log.i("TabbozSDKTest", "Real foreground gameplay: ${played().toInt()} seconds") }
            }
            assertTrue("Five-minute real gameplay grace reached", played() >= 300)
            instrumentation.runOnMainSync { assertTrue(activity.ads.policy.state.forced.isEmpty()) }
            outing()
            waitFor("interstitial presented") { status() == "interstitial_shown" }
            closeAd(); openGame()
            instrumentation.runOnMainSync { assertEquals(1, activity.ads.policy.state.forced.size) }
            waitFor("rewarded preload", 90000) { status() == "reward_ready" || status() == "dismissed" }
            js("window.webkit.messageHandlers.tabboz.postMessage({type:'adReward'});true")
            assertTrue(device.wait(Until.hasObject(By.text("10 minuti senza pubblicità")), 5000))
            device.findObject(By.text(Pattern.compile("Guarda video", Pattern.CASE_INSENSITIVE))).click()
            waitFor("rewarded presented") { status() == "rewarded_shown" || status() == "reward_earned" }
            // Official rewarded test creatives assign the reward when their completion condition is met.
            waitFor("SDK reward callback", 90000) { status() == "reward_earned" }
            closeAd(); openGame()
            var remaining = 0.0
            instrumentation.runOnMainSync { remaining = activity.ads.policy.state.rewardRemaining }
            assertTrue("Earned 10-minute reward", remaining > 590)
            scenario.close()
            scenario = ActivityScenario.launch(Intent(context, MainActivity::class.java).putExtra("qa_no_ads", true))
            scenario.onActivity { activity = it }; openGame()
            instrumentation.runOnMainSync {
                assertTrue(activity.ads.policy.state.rewardRemaining > 580)
                assertEquals(1, activity.ads.policy.state.forced.size)
            }
            Log.i("TabbozSDKTest", "PASS: actual grace, forced test ad, reward callback, close/resume and persisted policy")
        } finally { scenario.close() }
    }
    @Test fun rewardedSdkWithRestrictedIdentifierPermissions() {
        Telemetry.set(context, analytics = false, crashes = false)
        context.getSharedPreferences("tabboz.ads.v1", 0).edit().clear().commit()
        val scenario = ActivityScenario.launch<MainActivity>(Intent(context, MainActivity::class.java).putExtra("qa_ad_sdk", true))
        try {
            scenario.onActivity { activity = it }; openGame()
            waitFor("sample rewarded preload", 90000) { status() == "reward_ready" }
            js("window.webkit.messageHandlers.tabboz.postMessage({type:'adReward'});true")
            assertTrue(device.wait(Until.hasObject(By.text("10 minuti senza pubblicità")), 5000))
            device.findObject(By.text(Pattern.compile("Guarda video", Pattern.CASE_INSENSITIVE))).click()
            waitFor("reward callback", 90000) { status() == "reward_earned" }
            closeAd(); openGame()
            instrumentation.runOnMainSync { assertTrue(activity.ads.policy.state.rewardRemaining > 590) }
            assertEquals("true", js("!!document.querySelector('[data-dialog=\"1\"]')"))
        } finally { scenario.close() }
    }
}
