# AdMob implementation — iOS build 4

Tabboz is being changed to a free download funded by ads, with no purchases or subscriptions. The App Store draft price has been changed to zero. No app review submission or public app release is performed by this integration.

## Account and identifiers

AdMob session verified as **dadocere@gmail.com**. Dedicated unpublished iOS app **Tabboz**:

- App ID: `ca-app-pub-4476338747199979~3391207717`.
- Interstitial “Tabboz iOS - Attivita completata”: `ca-app-pub-4476338747199979/2992411606`.
- Rewarded “Tabboz iOS - 10 minuti senza pubblicita”: `ca-app-pub-4476338747199979/2800839912`.
- Publisher: `pub-4476338747199979`.

These are public SDK identifiers, not credentials. Firebase project remains `tabboz-mobile-2026`. No private keys or OAuth credentials are bundled.

Google Mobile Ads **13.12.0**, UMP **3.1.0**, Firebase Remote Config **13.1.1**, pinned via SwiftPM. The Google quick-start's 50 SKAdNetwork identifiers are included. Debug builds always request Google's official sample interstitial/rewarded units; Release reads the dedicated production IDs from Info.plist. Google simulators are test devices. Do not click production ads during QA.

## Ad policy

`AdPolicy.swift` implements persisted local counters. Only foreground gameplay advances timers; full-screen ads, background time, open menus and native sheets do not. The app requires recent JS heartbeats before advancing time. Counters are persisted after activities, impressions/rewards, backgrounding, and every ten timer ticks.

- First installation: 300 seconds of gameplay and five completed activities.
- Returning launch/session: at least 90 seconds of foreground gameplay. A background interval of 30 minutes starts a new session; every new process also starts session grace conservatively.
- Forced ads: at least 240 gameplay seconds and five activities since the last full-screen ad. All eligibility checks are ANDed.
- Forced caps: three per rolling 30 minutes, twelve per rolling 24 hours. Relaunch does not clear history; a backwards wall clock does not discard recent impressions.
- Rewarded: player chooses the Help menu's “10 minuti senza pubblicità...” entry and explicitly accepts a confirmation showing the reward. No forced reward prompt.
- Reward: 600 seconds of foreground gameplay without forced ads, no stacking, maximum three completed rewards per rolling 24 hours. Unused reward time persists across launch. Grant only on the SDK earned-reward callback, with a unique idempotency token.
- No banners, app-open ads, IAP, subscriptions or paid advantages.

In the existing AdMob app settings, **high-engagement ads were disabled** for Tabboz. No third-party mediation adapters or other publishers' app settings were changed. App-side limits are authoritative; no aggressive guessed eCPM floor is introduced.

## Safe game boundaries

`mobile.js` retains the original engine artifacts. An activity candidate starts from a game activity control, and completes only when its dialog chain has closed and the original game summary changed. Cancelled/unchanged dialogs and menu visits do not count. The bridge counts completed activities immediately and separately schedules a presentation opportunity. A new activity can invalidate presentation without discarding the completed-activity count. Tokens carry no character data. A subsequent pointer action invalidates that opportunity.

The native coordinator rechecks eligibility, foreground state, modal state, ad freshness, consent and current token. It disables touch while asking the game to save, pause audio and confirm the main window is safe. If any check fails or the five-second bridge timeout expires, normal play resumes without showing an ad. Audio resumes through its existing playback function without resetting the clip. No ad is presented from a load callback or shown late after a missed boundary. Failed loads back off for sixty seconds; cached ads expire after 55 minutes. No ad failure creates a loading gate.

The bridge accepts messages only from the local game's main frame. The top modal alone is exposed to assistive technology; underlying windows retain their original appearance but are hidden from the accessibility tree while obscured.

## Consent and privacy

UMP refreshes consent information at launch, presents required forms, gates requests on `canRequestAds`, and exposes privacy options through Help → Preferenze pubblicitarie. A changed choice discards preloaded ads, and in-flight loads from the previous consent generation cannot become usable.

Requests explicitly select non-personalized ads; publisher privacy personalization is disabled, publisher first-party ID is disabled, and SDK location-permission collection is disabled. No ATT authorization is requested. Firebase's separate advertising-purpose consents remain denied intentionally. Firebase Analytics and Crashlytics retain their existing independent settings; Ads does not override an Analytics opt-out. Google Mobile Ads itself links AdSupport, so build 2's statement that AdSupport capability is absent does not describe build 3. Do not claim all SDK technical identifiers are disabled.

Published policy: https://tabboz-mobile-2026.web.app/privacy

Support: https://tabboz-mobile-2026.web.app/support

Authorized seller file: https://tabboz-mobile-2026.web.app/app-ads.txt

The App Store disclosures have been updated and published for seven categories: coarse location, device ID, product interaction, advertising data, crash data, performance data, other diagnostics. Advertising purposes are disclosed; no tracking is declared for this non-personalized, no-ATT implementation. The vendor's privacy manifest remains unmodified.

## Controls and measurement

Remote Config template is tracked at `FirebaseHosting/remoteconfig.template.json` and deployed only to `tabboz-mobile-2026`:

- `ads_enabled`: true, can disable future loads/presentations without a new app build.
- `ads_cooldown_seconds`: 240; the app clamps remote values to 240–1800 seconds. Other caps cannot be bypassed remotely.

The fetch interval is one hour; this is not an instantaneous kill switch on every running device. Bundled defaults permit offline play and never require a configuration fetch to continue.

When Analytics is enabled, fixed events measure completed activities, ad opportunities, load/display/presentation failures, starts, impressions, dismissals, reward offers/completions, actual gameplay seconds excluding ads, and backgrounding within thirty seconds of an ad dismissal. The last event is a retention proxy, not proof of an ad-caused exit. Paid-event callbacks record value, currency, precision and format under `tabboz_ad_value`; reconcile them with AdMob reporting. No character names, save files or arbitrary error payloads are recorded. Gameplay metrics collected while Analytics is off are not retrospectively uploaded.

No A/B experiment has been started before there is an audience. Remote Config supports the proposed four-minute/six-minute comparison later. Mediation, bid-floor experiments and extra networks require measured baseline results and scoped account/SDK setup; they are not preemptively enabled. The AdMob-to-Firebase product link was verified on 11 November 2026 in both consoles: AdMob lists Tabboz iOS as `Collegato`; Firebase project `tabboz-mobile-2026` lists `Tabboz iOS` / `it.tabboz.simulator` as `Collegata`. This confirms the configuration, not receipt of production ad-revenue events.

## Verification

The offline native suite (`Tabboz` scheme) passed 20 tests on a fresh iPhone 17 Pro Max / iOS 26.5 simulator: nine ad-policy tests, five local server/resource tests and six UI tests, including a no-fill reward flow and original gameplay/backup/privacy tests. Summary: `AppStore/admob-native-tests.json`. Raw bundle: `/tmp/tabboz-firebase/AdMob-Build4-Native.xcresult`.

A separate explicit `TabbozAdsSmoke` scheme exercises real Google SDK sample ads and reward persistence. It needs network access and deliberately does not run with the ordinary offline suite. Debug-only `--ad-sdk-smoke` instrumentation and `--reset-ad-policy-for-sdk-test` are excluded from Release. The real-SDK sample-ad flow passed: ad load, display, earned reward, dismissal, game resume and persistence of unused reward after relaunch. Summary: `AppStore/admob-sdk-smoke-tests.json`; raw bundle: `/tmp/tabboz-firebase/AdMob-SDK-Enabled-Close.xcresult`. Do not count these sample ads as revenue or as AdMob production approval.

Early runs exposed UI-test assumptions about native versus HTML close buttons and inaccessible underlying game status while the ad is displayed. Their failures remain in `/tmp` result bundles; only the final passing run should be used as delivery evidence.

## Console and release follow-through

The Tabboz-only European consent message (ID `608c5730ea2b7249`, name `Tabboz iOS - consenso europeo`) was published on 11 November 2026, with Italian default and English fallback. The first layer includes consent, manage options and deny consent, with the deny option enabled for all regions. Its privacy URL is `https://tabboz-mobile-2026.web.app/privacy`. The console list was read back as `Pubblicato` with its published switch enabled. Google advises that changes may take up to one hour to reach apps.

AdMob still reports “Richiede revisione” for this unpublished app. Link the actual public App Store listing and complete AdMob readiness/app-ads.txt verification when the listing is available. Hosting the seller file alone does not prove AdMob has approved/crawled it. No production earnings or production fill is promised.

Existing corresponding-source, game-license/App Store compatibility and asset/branding questions remain public-distribution matters. Ads do not resolve them. The educational membership fee waiver has not been changed; an ads-only free app does not require a Paid Apps Agreement.

## Primary implementation references

- https://developers.google.com/admob/ios/quick-start
- https://developers.google.com/admob/ios/interstitial
- https://developers.google.com/admob/ios/rewarded
- https://developers.google.com/admob/ios/privacy
- https://developers.google.com/admob/ios/privacy/data-disclosure
- https://support.google.com/admob/answer/15525707
- https://firebase.google.com/docs/tutorials/optimize-ad-frequency

## Build 4 regression correction

The real-timing forced-ad test on build 3 found only two recorded activities after six rapidly completed outings. Activity counting had been tied to a delayed presentation opportunity, which was correctly skipped when the player navigated but incorrectly discarded the completion too. Build 4 separates immediate completion messages from delayed presentation opportunities. A cancelled or stale opportunity also preserves the cooldown unless a full-screen ad actually started. The real five-minute/activities SDK test now passes and dismisses back to gameplay. `AppStore/admob-forced-sdk-tests.json` records the passing result. The browser bridge regression (`Scripts/test-ads-bridge.cjs`) passes six rapid real-engine outings, cancellation, safe preparation, paused gameplay heartbeat, held-pointer protection and stale-token rejection.

The iPad real-SDK rewarded/relaunch test also passed; see `AppStore/admob-ipad-sdk-tests.json`. Build 3 remains a historical upload and should be superseded by corrected build 4 for submission.
