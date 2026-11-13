# Tabboz for Android

The Android port uses the same original C/WebAssembly engine, Italian dialogue, artwork, audio and Windows-style interface as the iOS app. Game files are shared from `../Tabboz-iOS/Tabboz/Web` at build time; there is no second editable copy of the game or a download at runtime. This directory is a complete Android Studio/Gradle project within the same repository.

## Build and run

Requirements: JDK 17, Android SDK platform 36, Android Studio or the included Gradle wrapper. Minimum Android version: **8.0 / API 26**. Install a current Android System WebView/Chrome; the native bridge requires Web Message Listener support.

Open this folder in Android Studio. Set your own SDK path in ignored `local.properties`, for example `sdk.dir=/path/to/Android/sdk`. From this directory:

```sh
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n it.tabboz.simulator/.MainActivity
```

The package is `it.tabboz.simulator`, Android version 1.0.0 / version code 1. Debug builds always use Google's official test AdMob app and ad units. Production SDK identifiers are public values in `gradle.properties`; no signing key, PAT or service-account key belongs in this repository. Release outputs require a separately managed distribution signing key before store delivery.

```sh
./gradlew :app:assembleRelease :app:bundleRelease
```

No Google Play listing or public release has been created by this porting task.

## Game, saves and files

The original game starts automatically; tap the logo if it appears. Android Back dismisses a menu or cancellable game dialog before offering to close the game. Original game text and controls are retained. Phone/tablet viewport fitting, portrait/landscape, touch dragging and keyboard input use the same mobile adaptation as iOS.

AndroidX WebViewAssetLoader serves bundled assets at the virtual origin `https://appassets.androidplatform.net/assets/`. This is local asset serving, not a public website. There is no localhost socket to expose or conflict with another app. The WebView blocks external resource requests, file/content access and foreign navigation. The native bridge accepts messages only from the main frame at the exact local origin.

Progress lives in this app's private WebView storage, with the same original registry representation as iOS. Saving is requested periodically, after dialogs and on lifecycle transitions. As on iOS, the original engine can defer saving while a modal activity is open; close the dialog before leaving for the freshest save. Removing app data or uninstalling deletes local progress. Android automatic app backup is disabled; use the game's portable export.

Original File → Salva con nome / Apri open Android's native document pickers. The JSON backup format is shared with iOS, includes character information, and is validated before replacing any save. Imports are bounded to 1 MB; no broad storage permission is required. These mobile backups are not the original Windows `.tbs` format.

## Firebase, privacy and monetization

Firebase project `tabboz-mobile-2026`, account `dadocere@gmail.com`; separate Android app `1:371128262274:android:5f8c57b8d00b58e6269e9b`. `app/google-services.json` is public client configuration, not an administrative credential. Analytics and Crashlytics default on after the app applies saved privacy choices, with independent persisted opt-outs in Help → Privacy e diagnostica. Runtime error reports use fixed diagnostic codes. Character names, backups and free-form runtime messages are not sent to telemetry. Advertising-purpose Firebase consents remain denied; AD_ID permission is removed. Ads use non-personalized requests with publisher first-party ID disabled.

AdMob Android app: `ca-app-pub-4476338747199979~7432992137`.
Interstitial: `ca-app-pub-4476338747199979/1006204640`.
Rewarded: `ca-app-pub-4476338747199979/7241420440`.

The policy mirrors iOS: first forced ad after **300 cumulative foreground gameplay seconds and five completed activities**; every returning launch/session has **90 foreground seconds** of grace. Following ads require **240 seconds and five new activities**, capped at **3 per rolling 30 minutes / 12 per rolling 24 hours**. Only safe completed-activity boundaries can present ads; loading never causes a late interruption. No fill does not block play. Interstitials and rewards are preloaded, expire after 55 minutes and retry failed loads after a minute.

Optional rewarded video grants **600 foreground gameplay seconds without forced ads**, maximum three rewards per rolling day, awarded only by the SDK callback. Counters and unused reward time persist. No game currency, health or progression is sold. There are no purchases or subscriptions.

UMP refreshes consent at launch and gates production requests on `canRequestAds`; Help → Preferenze pubblicitarie reopens available choices. Firebase Remote Config applies `ads_enabled` and `ads_cooldown_seconds` with a one-hour fetch interval and a 240–1800-second client clamp. No A/B test or mediation network has been added. Privacy settings include a reporting/help route for inappropriate ads and the license notices.

Public policy: https://tabboz-mobile-2026.web.app/privacy
Support: https://tabboz-mobile-2026.web.app/support

## Verification

```sh
./gradlew :app:testDebugUnitTest
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=it.tabboz.simulator.GameplayTest
python3 Scripts/verify-assets.py --apk app/build/outputs/apk/debug/app-debug.apk
```

The ordinary instrumentation suite disables ad requests through a debug-only launch flag. It uses a dedicated test emulator and resets that app's test game storage. Do not run it against personal game progress.

The separate explicit network smoke test uses real Google sample creatives, waits through the actual five-minute first-ad grace (no accelerated policy), earns a rewarded-video callback and checks dismissal, return to gameplay and policy persistence:

```sh
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=it.tabboz.simulator.AdsSdkSmokeTest
```

Both QA ad flags are gated by `BuildConfig.DEBUG`; production requests cannot use those consent-test shortcuts. The SDK test never clicks a live advertisement. Test ad playback is not evidence of production approval, fill or earnings. Firebase dashboard receipt is separate from client initialization and is not assumed.

## Provenance

Original game: Andrea Bonomi / Obscured Truckware, GPL-3.0-or-later. The source snapshot, corrected Novantotto runtime, licenses and engine build recipe are retained alongside the iOS project. See `../Tabboz-iOS/Documentation/UPSTREAM.md`, `../Tabboz-iOS/Compatibility/EngineBuild.json`, and `../DISTRIBUTION.md`. Standard Android dependencies are pinned in the Gradle files and linked notices are bundled. Public source and attribution do not establish clearance for every platform, branding or asset use.

## Recorded results — 13 November 2026

- **11 policy unit tests passed**.
- **5 integration tests passed on the Pixel 7/API 35 emulator and 5 on the Pixel Tablet/API 35 emulator**: purchases/study/save restoration, backup validation and Android file pickers, privacy persistence/no-fill, orientation/origin isolation, and actual injected touch coordinates.
- **Real SDK flow passed** with the unmodified five-minute first-ad grace, interstitial dismissal, rewarded completion and persisted reward after relaunch.
- **2 further rewarded SDK tests passed** on phone/tablet with AD_ID, AdServices AD_ID and Topics permissions absent.
- **Lint: zero errors**; dependency-update/localization and other non-blocking warnings remain.
- Debug APK, unsigned release APK and unsigned release AAB built; release Crashlytics mapping upload succeeded. No physical-device testing or production analytics/crash/revenue delivery is claimed.
- All **580 shared game files** match the source in both APK variants (only the Android bootstrap insertion changes the generated index); engine hashes match the recorded iOS engine.
- Fresh WebView gameplay also passed with Wi-Fi and mobile data disabled on the phone. Actual screenshots: [phone](Documentation/Screenshots/phone.png), [tablet](Documentation/Screenshots/tablet.png).

JSON evidence is in `Documentation/`. Local installable test APK: `Builds/1.0.0-1/Tabboz-debug.apk` (ignored by Git). Release artifacts in that directory are unsigned and require distribution signing before Google Play upload.

Android AdMob high-engagement ads are disabled and dedicated units exist. The Android privacy URL was entered and verified on 13 November 2026. Consent message publication is still pending: AdMob returned save/publication errors, then the fresh editor failed to load. The intended configuration is Italian default, English additional language and a first-screen reject choice for all regions. The AdMob–Firebase console product link is not yet verified. Production app readiness/store-link verification remains pending. The native UMP gate prevents production ad requests without the required consent state; the explicit SDK smoke tests bypass that gate only in Debug while using official sample units.
