// SPDX-License-Identifier: GPL-3.0-or-later
package it.tabboz.simulator

import android.app.AlertDialog
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.ads.mediation.admob.AdMobAdapter
import com.google.android.gms.ads.*
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.ump.*
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings
import java.util.UUID

class AdCoordinator(private val owner: MainActivity) {
    private val handler = Handler(Looper.getMainLooper())
    private val storage = AdPreferences(owner)
    val policy = AdPolicy(storage.load(), storage::save)
    private val consent = UserMessagingPlatform.getConsentInformation(owner)
    private var interstitial: InterstitialAd? = null
    private var rewarded: RewardedAd? = null
    private var interstitialAt = 0L
    private var rewardedAt = 0L
    private var loadingInterstitial = false
    private var loadingRewarded = false
    private var retryInterstitial = 0L
    private var retryRewarded = 0L
    private var started = false
    private var consentRequested = false
    private var consentBusy = false
    private var sdkStarting = false
    private var sdkReady = false
    private var destroyed = false
    private var generation = 0
    private var activeGameplay = false
    private var lastHeartbeat = 0L
    private var lastTick = SystemClock.elapsedRealtime()
    private var tickCount = 0
    private var gameplayMetric = 0.0
    private var latestOpportunity: String? = null
    private var lastDismissed = 0L
    private val completions = LinkedHashSet<String>()
    var presenting = false
        private set
    var sdkStatus = "idle"
        private set
    private val qaNoAds get() = BuildConfig.DEBUG && owner.intent.getBooleanExtra("qa_no_ads", false)
    private val qaSdk get() = BuildConfig.DEBUG && owner.intent.getBooleanExtra("qa_ad_sdk", false)
    private val available get() = !destroyed && BuildConfig.ADS_CONFIGURED && !qaNoAds && policy.enabled
    private val mayRequest get() = available && !consentBusy && (consent.canRequestAds() || qaSdk)

    private val ticker = object : Runnable {
        override fun run() {
            if (destroyed) return
            val uptime = SystemClock.elapsedRealtime()
            val delta = (uptime - lastTick) / 1000.0
            lastTick = uptime
            if (owner.foreground && activeGameplay && uptime - lastHeartbeat < 2500 && !presenting && !consentBusy && !owner.nativeBusy) {
                policy.advance(delta)
                if (Telemetry.analytics(owner) && delta > 0 && delta <= 5) gameplayMetric += delta
            }
            if (!Telemetry.analytics(owner)) gameplayMetric = 0.0
            if (gameplayMetric >= 60) flushMetric()
            if (++tickCount % 10 == 0) policy.persist()
            if (owner.foreground && !presenting) preload()
            handler.postDelayed(this, 1000)
        }
    }
    fun foreground() {
        policy.foreground(System.currentTimeMillis())
        lastTick = SystemClock.elapsedRealtime()
        if (!started) {
            started = true
            handler.postDelayed(ticker, 1000)
            val config = FirebaseRemoteConfig.getInstance()
            config.setConfigSettingsAsync(FirebaseRemoteConfigSettings.Builder().setMinimumFetchIntervalInSeconds(3600).build())
            config.setDefaultsAsync(mapOf("ads_enabled" to true, "ads_cooldown_seconds" to 240L))
            config.fetchAndActivate().addOnCompleteListener {
                if (!destroyed) {
                    policy.enabled = config.getBoolean("ads_enabled")
                    policy.cooldown = config.getLong("ads_cooldown_seconds").toDouble().coerceIn(240.0, 1800.0)
                    if (!policy.enabled) discardAds()
                }
            }
        }
        if (!consentRequested && available && !owner.nativeBusy) refreshConsent()
    }
    fun background() {
        activeGameplay = false
        if (lastDismissed != 0L && SystemClock.elapsedRealtime() - lastDismissed < 30_000) event("post_ad_background")
        policy.background(System.currentTimeMillis())
        flushMetric()
    }
    fun heartbeat(active: Boolean) { activeGameplay = active; lastHeartbeat = SystemClock.elapsedRealtime() }
    fun completed(token: String) {
        if (token.isEmpty() || token.length > 100 || !completions.add(token)) return
        while (completions.size > 128) completions.remove(completions.first())
        policy.completedActivity()
        event("activity_completed")
    }
    fun opportunity(token: String) {
        if (token.isEmpty() || token.length > 100) return
        latestOpportunity = token
        if (!mayRequest || !owner.foreground || owner.nativeBusy || presenting || !policy.canShowForced(System.currentTimeMillis())) return
        val ad = interstitial ?: return
        if (SystemClock.elapsedRealtime() - interstitialAt >= 3_300_000) { interstitial = null; return }
        owner.prepareAd(token) { ready ->
            if (!ready || token != latestOpportunity || !owner.foreground || !mayRequest || !policy.canShowForced(System.currentTimeMillis())) {
                owner.resumeAfterAd(); return@prepareAd
            }
            interstitial = null
            presenting = true
            ad.fullScreenContentCallback = fullscreen("interstitial")
            runCatching { ad.show(owner) }.onFailure { finishFullscreen(false) }
        }
    }
    private fun refreshConsent() {
        consentRequested = true; consentBusy = true
        if (qaSdk) { consentBusy = false; initializeSdk(); return }
        val parameters = ConsentRequestParameters.Builder().build()
        consent.requestConsentInfoUpdate(owner, parameters, {
            if (destroyed) return@requestConsentInfoUpdate
            if (!owner.foreground || owner.nativeBusy) { consentBusy = false; consentRequested = false; return@requestConsentInfoUpdate }
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(owner) {
                consentBusy = false
                initializeSdk()
            }
        }, {
            consentBusy = false
            initializeSdk()
        })
        // Cached consent is honored only after UMP's launch refresh has been requested.
    }
    private fun initializeSdk() {
        if (!mayRequest || sdkReady || sdkStarting) return
        sdkStarting = true
        MobileAds.setRequestConfiguration(RequestConfiguration.Builder()
            .setPublisherPrivacyPersonalizationState(RequestConfiguration.PublisherPrivacyPersonalizationState.DISABLED).build())
        Thread {
            MobileAds.initialize(owner.applicationContext) {
                handler.post {
                    sdkStarting = false
                    if (!destroyed) {
                        MobileAds.putPublisherFirstPartyIdEnabled(false)
                        sdkReady = true
                        preload()
                    }
                }
            }
        }.start()
    }
    private fun request() = AdRequest.Builder()
        .addNetworkExtrasBundle(AdMobAdapter::class.java, Bundle().apply { putString("npa", "1") }).build()
    private fun discardAds() { generation++; interstitial = null; rewarded = null }
    private fun preload() {
        if (!mayRequest || !sdkReady) return
        val now = SystemClock.elapsedRealtime()
        if (interstitial != null && now - interstitialAt >= 3_300_000) interstitial = null
        if (rewarded != null && now - rewardedAt >= 3_300_000) rewarded = null
        val requestedGeneration = generation
        if (interstitial == null && !loadingInterstitial && now >= retryInterstitial) {
            loadingInterstitial = true
            InterstitialAd.load(owner, BuildConfig.INTERSTITIAL_ID, request(), object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    loadingInterstitial = false
                    if (requestedGeneration != generation || !mayRequest) return
                    interstitial = ad; interstitialAt = SystemClock.elapsedRealtime()
                    ad.setOnPaidEventListener { paid("interstitial", it) }
                    // Loading never triggers presentation; wait for a new safe activity boundary.
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    loadingInterstitial = false; retryInterstitial = SystemClock.elapsedRealtime() + 60_000
                    event("ad_load_failed", "interstitial")
                }
            })
        }
        if (rewarded == null && !loadingRewarded && now >= retryRewarded) {
            loadingRewarded = true
            RewardedAd.load(owner, BuildConfig.REWARDED_ID, request(), object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    loadingRewarded = false
                    if (requestedGeneration != generation || !mayRequest) return
                    rewarded = ad; rewardedAt = SystemClock.elapsedRealtime(); sdkStatus = "reward_ready"
                    ad.setOnPaidEventListener { paid("rewarded", it) }
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    loadingRewarded = false; retryRewarded = SystemClock.elapsedRealtime() + 60_000
                    sdkStatus = "reward_failed"; event("ad_load_failed", "rewarded")
                }
            })
        }
    }
    fun offerReward() {
        if (presenting || owner.nativeBusy) return
        if (policy.state.rewardRemaining > 0) { owner.message("Hai ancora ${kotlin.math.ceil(policy.state.rewardRemaining / 60).toInt()} minuti di gioco senza pubblicità."); return }
        if (!policy.canOfferReward(System.currentTimeMillis())) { owner.message("Hai utilizzato i tre video premio disponibili nelle ultime 24 ore."); return }
        val ad = rewarded
        if (!mayRequest || ad == null || SystemClock.elapsedRealtime() - rewardedAt >= 3_300_000) {
            owner.message("Nessun video disponibile al momento. Puoi continuare a giocare."); preload(); return
        }
        owner.showDialog(AlertDialog.Builder(owner).setTitle("10 minuti senza pubblicità")
            .setMessage("Vuoi guardare un video per ottenere 10 minuti di gioco senza interruzioni pubblicitarie? Il premio viene assegnato dopo il completamento del video.")
            .setNegativeButton("Annulla", null).setPositiveButton("Guarda video") { _, _ ->
                handler.postDelayed({ showReward(ad) }, 350)
            }.create())
    }
    private fun showReward(ad: RewardedAd) {
        if (!mayRequest || !owner.foreground || presenting || owner.nativeBusy || !policy.canOfferReward(System.currentTimeMillis())) return
        owner.prepareAd(null) { ready ->
            if (!ready || !mayRequest || !owner.foreground) { owner.resumeAfterAd(); return@prepareAd }
            rewarded = null; presenting = true
            val token = UUID.randomUUID().toString()
            ad.fullScreenContentCallback = fullscreen("rewarded")
            runCatching { ad.show(owner) {
                if (policy.earnReward(token, System.currentTimeMillis())) { sdkStatus = "reward_earned"; event("reward_earned", "rewarded") }
            } }.onFailure { finishFullscreen(false) }
        }
    }
    private fun fullscreen(format: String) = object : FullScreenContentCallback() {
        private var didPresent = false
        override fun onAdShowedFullScreenContent() {
            didPresent = true
            policy.fullscreenStarted(format == "interstitial", System.currentTimeMillis())
            event("ad_shown", format); sdkStatus = "${format}_shown"
        }
        override fun onAdDismissedFullScreenContent() {
            event("ad_dismissed", format); sdkStatus = "dismissed"
            finishFullscreen(didPresent)
        }
        override fun onAdFailedToShowFullScreenContent(error: AdError) {
            event("ad_show_failed", format); finishFullscreen(didPresent)
        }
    }
    private fun finishFullscreen(didPresent: Boolean) {
        presenting = false
        policy.fullscreenEnded(didPresent)
        if (didPresent) lastDismissed = SystemClock.elapsedRealtime()
        owner.resumeAfterAd()
        preload()
    }
    fun privacyOptions() {
        if (owner.nativeBusy || presenting || !owner.foreground) return
        if (!BuildConfig.ADS_CONFIGURED) { owner.message("La pubblicità non è ancora configurata per questa versione Android."); return }
        if (consent.privacyOptionsRequirementStatus != ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
            owner.message("Non sono richieste ulteriori opzioni di consenso per questo dispositivo. Le statistiche e la diagnostica hanno controlli separati.")
            return
        }
        consentBusy = true; discardAds()
        UserMessagingPlatform.showPrivacyOptionsForm(owner) {
            consentBusy = false
            discardAds()
            if (mayRequest) { initializeSdk(); preload() }
        }
    }
    private fun event(name: String, format: String? = null) {
        Telemetry.event(owner, name, Bundle().apply { format?.let { putString("ad_format", it) } })
    }
    private fun paid(format: String, value: AdValue) {
        Telemetry.event(owner, "tabboz_ad_value", Bundle().apply {
            putString("ad_format", format); putDouble("value", value.valueMicros / 1_000_000.0)
            putString("currency", value.currencyCode); putLong("precision", value.precisionType.toLong())
        })
    }
    private fun flushMetric() {
        if (gameplayMetric > 0) Telemetry.event(owner, "gameplay_seconds", Bundle().apply { putLong("seconds", gameplayMetric.toLong()) })
        gameplayMetric = 0.0
    }
    fun destroy() { destroyed = true; handler.removeCallbacksAndMessages(null); discardAds(); policy.persist() }
}
