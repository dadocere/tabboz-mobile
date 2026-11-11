import UIKit
import GoogleMobileAds
import UserMessagingPlatform
import FirebaseRemoteConfig
import FirebaseAnalytics

@MainActor final class AdCoordinator: NSObject, FullScreenContentDelegate {
    private weak var owner: GameViewController?
    let policy = AdPolicy()
    private var timer: Timer?
    private var lastTick = ProcessInfo.processInfo.systemUptime
    private var lastHeartbeat: TimeInterval = 0
    private var gameplay = false
    private var started = false
    private var consentBusy = false
    private var sdkStarted = false
    private var presenting = false
    private var didStartFullscreen = false
    private var activeForced = false
    private var interstitial: InterstitialAd?
    private var rewarded: RewardedAd?
    private var interstitialLoaded = Date.distantPast
    private var rewardedLoaded = Date.distantPast
    private var loadingInterstitial = false
    private var loadingRewarded = false
    private var retryInterstitial = Date.distantPast
    private var retryRewarded = Date.distantPast
    private var rewardToken: String?
    private var consentGeneration = 0
    private var ticks = 0
    private var lastActivityToken: String?
    private var measuredGameplay: TimeInterval = 0
    private var lastAdDismissedAt = Date.distantPast
    private var disabledForTests: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("--disable-ads-for-ui-tests")
        #else
        return false
        #endif
    }
    private var interstitialID: String {
        #if DEBUG
        return "ca-app-pub-3940256099942544/4411468910"
        #else
        return Bundle.main.object(forInfoDictionaryKey: "TabbozInterstitialID") as? String ?? ""
        #endif
    }
    private var rewardedID: String {
        #if DEBUG
        return "ca-app-pub-3940256099942544/1712485313"
        #else
        return Bundle.main.object(forInfoDictionaryKey: "TabbozRewardedID") as? String ?? ""
        #endif
    }
    init(owner: GameViewController) {
        self.owner = owner
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification, object: nil)
    }
    deinit { timer?.invalidate(); NotificationCenter.default.removeObserver(self) }
    func start() {
        guard !started else { return }; started = true
        guard !disabledForTests else { return }
        configureRemoteRules()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        refreshConsent()
    }
    @objc private func background() {
        gameplay = false
        flushGameplayMetric()
        if !presenting && Date().timeIntervalSince(lastAdDismissedAt) < 30 { event("post_ad_background") }
        policy.background(now: Date())
    }
    @objc private func foreground() {
        policy.foreground(now: Date()); lastTick = ProcessInfo.processInfo.systemUptime
        if started && !sdkStarted && !disabledForTests { refreshConsent() }
    }
    func heartbeat(active: Bool) {
        gameplay = active
        lastHeartbeat = ProcessInfo.processInfo.systemUptime
    }
    private func tick() {
        let uptime = ProcessInfo.processInfo.systemUptime
        let delta = uptime - lastTick; lastTick = uptime
        if gameplay && uptime - lastHeartbeat < 2.5 && !presenting && !consentBusy &&
            UIApplication.shared.applicationState == .active && owner?.presentedViewController == nil {
            policy.advance(delta)
            if TelemetrySettings.shared.analyticsEnabled && delta > 0 && delta <= 5 { measuredGameplay += delta }
        }
        if !TelemetrySettings.shared.analyticsEnabled { measuredGameplay = 0 }
        if measuredGameplay >= 60 { flushGameplayMetric() }
        ticks += 1
        if ticks % 10 == 0 { policy.persist() }
        if !presenting { preload() }
    }
    private func configureRemoteRules() {
        let config = RemoteConfig.remoteConfig()
        let settings = RemoteConfigSettings(); settings.minimumFetchInterval = 3600
        config.configSettings = settings
        config.setDefaults(["ads_enabled": true as NSNumber, "ads_cooldown_seconds": 240 as NSNumber])
        applyRemoteRules(config)
        config.fetchAndActivate { [weak self] _, _ in
            Task { @MainActor in self?.applyRemoteRules(RemoteConfig.remoteConfig()) }
        }
    }
    private func applyRemoteRules(_ config: RemoteConfig) {
        policy.rules.enabled = config["ads_enabled"].boolValue
        // Remote changes may reduce ad pressure; cannot bypass local safety caps.
        policy.rules.cooldown = max(240, min(1800, config["ads_cooldown_seconds"].numberValue.doubleValue))
        if !policy.rules.enabled { interstitial = nil; rewarded = nil }
    }
    private func refreshConsent() {
        guard !consentBusy, let owner, owner.presentedViewController == nil else { return }
        consentBusy = true
        let parameters = RequestParameters()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ad-sdk-smoke") {
            let debug = DebugSettings(); debug.geography = .EEA
            parameters.debugSettings = debug
        }
        #endif
        ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { [weak self] error in
            Task { @MainActor in
            guard let self else { return }
            if error != nil { self.consentBusy = false; self.startSDKIfAllowed(); return }
            guard owner.presentedViewController == nil, UIApplication.shared.applicationState == .active else {
                self.consentBusy = false; return
            }
            do { try await ConsentForm.loadAndPresentIfRequired(from: owner) } catch { }
            self.consentBusy = false
            #if DEBUG
            print("Tabboz Ads consent: canRequest=\(ConsentInformation.shared.canRequestAds)")
            #endif
            self.startSDKIfAllowed()
            }
        }
    }
    private var mayRequest: Bool {
        !disabledForTests && policy.rules.enabled && !consentBusy && ConsentInformation.shared.canRequestAds
    }
    private func startSDKIfAllowed() {
        guard mayRequest else { return }
        guard !sdkStarted else { preload(); return }
        sdkStarted = true
        let configuration = MobileAds.shared.requestConfiguration
        configuration.publisherPrivacyPersonalizationState = .disabled
        configuration.setPublisherFirstPartyIDEnabled(false)
        configuration.coarseLocationCollectionEnabled = false
        MobileAds.shared.start { [weak self] _ in Task { @MainActor in self?.preload() } }
    }
    private func request() -> Request {
        let request = Request()
        let extras = Extras(); extras.additionalParameters = ["npa": "1"]
        request.register(extras)
        return request
    }
    private func preload() {
        guard sdkStarted, mayRequest, UIApplication.shared.applicationState == .active else { return }
        let now = Date()
        if now.timeIntervalSince(interstitialLoaded) > 3300 { interstitial = nil }
        if now.timeIntervalSince(rewardedLoaded) > 3300 { rewarded = nil }
        let generation = consentGeneration
        if interstitial == nil && !loadingInterstitial && now >= retryInterstitial && !interstitialID.isEmpty {
            loadingInterstitial = true
            InterstitialAd.load(with: interstitialID, request: request()) { [weak self] ad, error in
                Task { @MainActor in
                guard let self else { return }
                self.loadingInterstitial = false
                guard generation == self.consentGeneration, self.mayRequest else { return }
                self.interstitial = ad; self.interstitialLoaded = Date()
                ad?.fullScreenContentDelegate = self
                if ad != nil { self.event("ad_loaded", format: "interstitial") }
                if error != nil { self.retryInterstitial = Date().addingTimeInterval(60); self.event("ad_load_failed", format: "interstitial") }
                }
            }
        }
        if rewarded == nil && !loadingRewarded && now >= retryRewarded && !rewardedID.isEmpty {
            loadingRewarded = true
            RewardedAd.load(with: rewardedID, request: request()) { [weak self] ad, error in
                Task { @MainActor in
                guard let self else { return }
                self.loadingRewarded = false
                guard generation == self.consentGeneration, self.mayRequest else { return }
                self.rewarded = ad; self.rewardedLoaded = Date()
                ad?.fullScreenContentDelegate = self
                if ad != nil { self.event("ad_loaded", format: "rewarded") }
                if error != nil { self.retryRewarded = Date().addingTimeInterval(60); self.event("ad_load_failed", format: "rewarded") }
                }
            }
        }
    }
    func activityCompleted(token: String) {
        guard !disabledForTests, token != lastActivityToken else { return }
        lastActivityToken = token
        policy.completedActivity()
        event("game_activity_complete")
    }
    func activityOpportunity(token: String) {
        guard !disabledForTests else { return }
        guard mayRequest, policy.canShowForced(now: Date()), let ad = interstitial,
              Date().timeIntervalSince(interstitialLoaded) < 3300, let owner,
              owner.presentedViewController == nil, !presenting,
              UIApplication.shared.applicationState == .active else { return }
        event("ad_opportunity", format: "interstitial")
        presenting = true
        didStartFullscreen = false
        owner.prepareForAd(token: token) { [weak self] ready in
            guard let self else { return }
            guard ready, self.mayRequest, owner.presentedViewController == nil,
                  UIApplication.shared.applicationState == .active else { self.finishPresentation(); return }
            do { try ad.canPresent(from: owner) } catch { self.interstitial = nil; self.finishPresentation(); return }
            self.activeForced = true
            self.interstitial = nil
            ad.present(from: owner)
        }
    }
    func showRewardOffer() {
        guard let owner, owner.presentedViewController == nil, !presenting else { return }
        guard policy.rules.enabled else { owner.showAdMessage("Gli annunci sono attualmente disattivati. Puoi continuare a giocare senza interruzioni pubblicitarie."); return }
        let remaining = Int(ceil(policy.state.rewardRemaining / 60))
        if remaining > 0 { owner.showAdMessage("Hai ancora \(remaining) minuti di gioco senza interruzioni pubblicitarie."); return }
        guard policy.canOfferReward(now: Date()) else { owner.showAdMessage("Hai utilizzato i tre video premio disponibili nelle ultime 24 ore."); return }
        guard mayRequest, let ad = rewarded, Date().timeIntervalSince(rewardedLoaded) < 3300 else {
            owner.showAdMessage("Al momento non è disponibile un video. Puoi continuare a giocare normalmente."); return
        }
        let alert = UIAlertController(title: "Una pausa dalla pubblicità", message: "Guarda un video per ottenere 10 minuti di gioco senza interruzioni pubblicitarie. Il premio viene assegnato dopo il completamento richiesto dal video.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Continua a giocare", style: .cancel))
        alert.addAction(UIAlertAction(title: "Guarda il video", style: .default) { [weak self] _ in
            // Wait until the offer dialog has actually dismissed, then revalidate game state.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self?.presentReward(ad) }
        })
        event("reward_offer")
        owner.present(alert, animated: true)
    }
    private func presentReward(_ ad: RewardedAd) {
        guard mayRequest, let owner, !presenting, owner.presentedViewController == nil,
              policy.canOfferReward(now: Date()), UIApplication.shared.applicationState == .active else { return }
        presenting = true
        didStartFullscreen = false
        owner.prepareForAd(token: nil) { [weak self] ready in
            guard let self else { return }
            guard ready, self.mayRequest, owner.presentedViewController == nil,
                  UIApplication.shared.applicationState == .active else { self.finishPresentation(); return }
            do { try ad.canPresent(from: owner) } catch { self.rewarded = nil; self.finishPresentation(); return }
            self.activeForced = false
            self.rewarded = nil
            let token = UUID().uuidString
            self.rewardToken = token
            ad.present(from: owner) { [weak self] in
                guard let self else { return }
                if self.policy.earnReward(token: token, now: Date()) { self.event("reward_earned", format: "rewarded") }
            }
        }
    }
    func privacyOptions() {
        guard let owner, !presenting, !consentBusy, owner.presentedViewController == nil else { return }
        // Drop preloaded ads so none can escape a changed consent choice.
        consentGeneration += 1; interstitial = nil; rewarded = nil
        if ConsentInformation.shared.privacyOptionsRequirementStatus == .required {
            consentBusy = true
            ConsentForm.presentPrivacyOptionsForm(from: owner) { [weak self] error in
                Task { @MainActor in
                self?.consentBusy = false
                if error != nil { owner.showAdMessage("Le preferenze non sono disponibili ora. Riprova quando sei connesso.") }
                self?.startSDKIfAllowed()
                }
            }
        } else if ConsentInformation.shared.privacyOptionsRequirementStatus == .unknown {
            refreshConsent()
        } else {
            owner.showAdMessage("Gli annunci sono richiesti senza personalizzazione. Se nella tua area sono richieste scelte aggiuntive, verranno mostrate dal servizio di consenso.")
        }
    }
    func adWillPresentFullScreenContent(_ ad: FullScreenPresentingAd) {
        didStartFullscreen = true
        policy.fullscreenStarted(forced: activeForced, now: Date())
        event("ad_started", format: activeForced ? "interstitial" : "rewarded")
    }
    func adDidRecordImpression(_ ad: FullScreenPresentingAd) { event("ad_displayed", format: activeForced ? "interstitial" : "rewarded") }
    func ad(_ ad: FullScreenPresentingAd, didRecordPaidEventWith value: AdValue) {
        guard TelemetrySettings.shared.analyticsEnabled else { return }
        Analytics.logEvent("tabboz_ad_value", parameters: ["value": value.value.doubleValue, "currency": value.currencyCode, "precision": value.precision.rawValue, "ad_format": activeForced ? "interstitial" : "rewarded"])
    }
    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        event("ad_present_failed", format: activeForced ? "interstitial" : "rewarded")
        finishPresentation()
    }
    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        lastAdDismissedAt = Date()
        event("ad_dismissed", format: activeForced ? "interstitial" : "rewarded")
        finishPresentation()
    }
    private func finishPresentation() {
        presenting = false; rewardToken = nil
        policy.fullscreenEnded(wasPresented: didStartFullscreen)
        didStartFullscreen = false
        owner?.resumeAfterAd()
        #if DEBUG
        if policy.state.rewardRemaining > 0 { owner?.updateAdSDKTestStatus("reward_active") }
        #endif
        preload()
    }
    private func flushGameplayMetric() {
        defer { measuredGameplay = 0 }
        guard TelemetrySettings.shared.analyticsEnabled, measuredGameplay >= 1 else { return }
        Analytics.logEvent("gameplay_time", parameters: ["seconds": Int(measuredGameplay)])
    }
    private func event(_ name: String, format: String? = nil) {
        #if DEBUG
        print("Tabboz Ads: \(name) \(format ?? "")")
        if name == "ad_loaded" && format == "rewarded" && policy.state.rewardRemaining <= 0 { owner?.updateAdSDKTestStatus("reward_ready") }
        if name == "reward_earned" { owner?.updateAdSDKTestStatus("reward_earned") }
        #endif
        guard TelemetrySettings.shared.analyticsEnabled else { return }
        Analytics.logEvent(name, parameters: format.map { ["ad_format": $0] })
    }
}
