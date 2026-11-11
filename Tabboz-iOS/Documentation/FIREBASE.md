# Firebase integration — build 2 onward

Firebase Analytics and Crashlytics are integrated into the native iOS host. The original game engine, artwork and dialog templates are unchanged. Build 1 remains the previously uploaded version without Firebase; these changes are for version 1.0.0, build 2.

## Cloud resources and accounts

| Item | Verified value |
| --- | --- |
| Firebase account | dadocere@gmail.com |
| Firebase project | tabboz-mobile-2026 |
| Project number | 371128262274 |
| Firebase iOS app | 1:371128262274:ios:998698847dd1d7c7269e9b |
| Apple bundle ID | it.tabboz.simulator |
| App Store app ID | 6832685698 |
| Apple signing organization/team | ISTITUTI EDMONDO DE AMICIS SRL / FC4758TVE2 |
| Analytics account/property/stream | 150706991 / 563423848 / 16306487212 |
| Billing | Not enabled; Spark plan |
| Public support contact | dadocere@hotmail.it |

Firebase MCP was used to verify the account, create the dedicated project/app, retrieve the iOS config and deploy Hosting. A redundant Hosting initialization returned an already-existing-site conflict because project creation had already provisioned the default site. `firebase.json` then explicitly selected that existing site. The Google Analytics account was linked through Firebase Console because the MCP tools do not expose account linking; the Management API subsequently confirmed the exact property and stream mapping.

- [Privacy policy](https://tabboz-mobile-2026.web.app/privacy)
- [Support](https://tabboz-mobile-2026.web.app/support)
- [Firebase project](https://console.firebase.google.com/project/tabboz-mobile-2026/overview)

Hosting source is `../../FirebaseHosting/public`, with configuration in `../../firebase.json` and `../../.firebaserc`. The hosted pages use no Analytics JavaScript, advertising, forms or third-party embedded assets. The public email was explicitly provided for support; the Gmail login is not published as a contact.

## App configuration

`project.yml` pins Firebase iOS SDK **13.1.1** with Swift Package Manager and links `FirebaseAnalyticsCore` and `FirebaseCrashlytics`. `Package.resolved` records the dependency graph, including GoogleAppMeasurement **13.0.1**. Resolution includes the SDK package's other declared dependencies, but this target selects the Analytics Core product without IDFA capability; merely appearing in the package-resolution graph does not mean a product is linked.

`FirebaseAppDelegate` configures Firebase during SwiftUI app startup. `TelemetrySettings` applies persisted collection preferences, initially enabled for both services as requested. Advertising storage, advertising user data and advertising personalization consent are denied independently of the Analytics preference. IDFV collection and ad-personalization signals are disabled in Info.plist. Automatic UIViewController screen reporting is disabled. The app sets no custom user ID and sends no custom Analytics events, character names, saved-game contents or imported backup contents.

Standard SDK lifecycle/session metrics still apply. Analytics may use a pseudonymous app-instance ID and derive coarse location from network information. Crashlytics collects native crash/session diagnostics. The existing JS error bridge, WebContent process termination and provisional-navigation failure send only fixed nonfatal error domain/code values (1001–1003), respecting the Crashlytics preference. They do not attach JS messages, navigation URLs, error userInfo, filenames or save data. These diagnostics indicate the failure class rather than reproducing a full WebAssembly stack trace.

The official GoogleService-Info.plist retrieved again after Analytics linking still contains the legacy `IS_ANALYTICS_ENABLED=false` value. It was retained exactly as supplied, not manually changed to manufacture an enabled configuration. Actual app collection is explicitly enabled by the supported runtime API and Info.plist collection setting. Native SDK runtime logs verify **Analytics collection enabled** and **IDFA will not be accessible**; the Management API verifies the linked Analytics property/stream.

## User controls and privacy

The original Help dropdown adds **Privacy e diagnostica…**, opening a native sheet with separate Analytics and crash-report switches, the hosted privacy policy and the approved support email. Both choices persist across relaunches. Disabling Analytics also resets local Analytics data. Disabling crash upload deletes unsent reports; already transmitted data is not claimed to be retroactively removed. No account login or advertising prompt was added.

UserDefaults access for these app preferences declares reason **CA92.1** in the app privacy manifest. The SDKs supply their own bundled manifests. App Store privacy disclosures must describe the combined app/SDK behavior; build 1's former Data Not Collected label does not describe build 2. The parent release workflow owns those App Store changes.

Relevant disclosure categories are pseudonymous device/installation identifiers, coarse location and product interaction for Analytics, plus Crash Data and Other Diagnostic Data for Crashlytics/related diagnostics. The app does not intentionally link the diagnostic reports to names or accounts. No tracking/advertising use is enabled. Publisher review of applicable privacy/consent obligations remains part of release preparation; an enabled-by-default setting is not presented as a legal conclusion.

## Symbols and notices

The final device-build post-build phase invokes the official `Crashlytics/run` script with the required dSYM, executable and built GoogleService-Info.plist input paths. All app configurations generate dSYMs. Debug dylib splitting is disabled to keep the symbol inputs predictable. Simulator builds skip the symbol-upload phase. The device archive/export workflow should confirm successful script execution and actual symbol receipt; those are not inferred from a simulator build.

The existing bundled ThirdPartyNotices file now includes exact Firebase, GoogleAppMeasurement and selected linked dependency license/notice texts from the pinned checkouts, including nanopb and libunwind notices. This preserves attribution and license text; it does not certify that the entire combined distribution is GPL/App Store compatible. Existing distribution-rights notes remain applicable.

## Verification

- Debug simulator build-for-testing succeeded; final incremental Debug build succeeded after the sanitized diagnostic and notice changes.
- **6 signed native tests passed, 0 failed, 0 skipped**: five existing server/resource tests plus the new privacy-controls UI test. It verifies initially enabled choices, individual opt-outs, persisted disabled state after relaunch, policy-link availability and return to the game.
- The privacy menu uses a web accessibility MenuItem; the test targets that role. Native Toggle rows expose broad accessibility bounds, so the test touches the actual switch control near the right edge.
- Engine smoke checks, original engine/artwork manifest validation, plist checks and JavaScript syntax checks passed.
- No linked AdSupport framework was found in the simulator executable; runtime confirms unavailable IDFA capability.
- Unsigned simulator builds produced a Firebase Installations Keychain entitlement error. Rebuilding/signing the simulator application ad hoc removed that error. Do not use an unsigned simulator result as proof of successful installation registration.
- Firebase MCP re-verification confirmed the correct account/project and **Billing Enabled: No**. Privacy and support URLs returned HTTP 200 with the approved contact.
- A crash smoke test sent SIGABRT only to the verified Tabboz process on the task-created dedicated QA iPhone simulator. The app relaunched and fetched remote Crashlytics settings allowing report/logged-exception collection. No release crash trigger was added and no physical device or unrelated app was crashed.
- **Analytics event arrival and Crashlytics report arrival in the dashboards have not been independently confirmed.** SDK startup, collection configuration and cloud linkage are verified; dashboard receipt remains a separate check. The crash attempt alone is not evidence of delivery.

Non-secret records are in [Firebase/integration.json](Firebase/integration.json) and [signed native test summary](Firebase/native-tests-summary.json). Raw build and runtime logs remain outside the repository under `/tmp/tabboz-firebase*`. OAuth credentials are kept outside the game repository; avoid printing raw Firebase login JSON because some CLI versions include token fields.

## Official implementation references

- [Analytics data collection controls and Analytics Core without IDFA](https://firebase.google.com/docs/analytics/ios/configure-data-collection)
- [Crashlytics symbol processing and required script inputs](https://firebase.google.com/docs/crashlytics/ios/get-deobfuscated-reports)
- [Firebase project and Analytics account linking](https://firebase.google.com/docs/projects/api/workflow_set-up-and-manage-project)
- [Apple-platform SDK data collection disclosures](https://firebase.google.com/docs/ios/app-store-data-collection)

## Build 3 advertising integration

The original verification above describes build 2. Build 3 adds Google Mobile Ads, UMP and Firebase Remote Config; it links AdSupport through the ads SDK and records consent-gated gameplay/ad metrics in Analytics. See [AdMob implementation](ADMOB.md) for current SDK settings, published privacy disclosures and verification. The independent Analytics/Crashlytics preferences remain supported.

## AdMob product link — 11 November 2026

The AdMob-to-Firebase product link was verified on 11 November 2026 in both consoles: AdMob lists Tabboz iOS as `Collegato`; Firebase project `tabboz-mobile-2026` lists `Tabboz iOS` / `it.tabboz.simulator` as `Collegata`. This confirms the configuration, not receipt of production ad-revenue events. See [AdMob implementation](ADMOB.md) for build 4, the published consent message and the remaining production-readiness steps.
