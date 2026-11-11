# App Store Connect — Tabboz

[Tabboz in App Store Connect](https://appstoreconnect.apple.com/apps/6832685698)

- Organization: **ISTITUTI EDMONDO DE AMICIS SRL**, team **FC4758TVE2**, pinned in `project.yml` and verified in the exported distribution profile.
- Bundle: `it.tabboz.simulator`; primary language Italian (`it`).
- Version **1.0.0**, corrected build **4**, **VALID** and attached to the draft version.
- Build/delivery ID: `e6c4facd-ff1f-4b96-bcfc-4cfe327ea085`.
- **Free download**, Italy only; ads without purchases or subscriptions. The previous €4.99 draft price has been replaced by zero and read back from Apple.
- **PREPARE_FOR_SUBMISSION**, manual release. No App Review submission or public app publication.
- Simulation / Role Playing, age override **18+**. Four iPhone and four iPad screenshots uploaded. Mac and Vision Pro availability remain disabled.

## Monetization and privacy

AdMob account **dadocere@gmail.com**, dedicated Tabboz iOS app and two production units created. Google Mobile Ads **13.12.0**, UMP **3.1.0**, Firebase Remote Config **13.1.1**. The app uses non-personalized ads without requesting ATT. Google's ads SDK links AdSupport; build 2's no-AdSupport statement is historical.

First forced ad requires five minutes of gameplay and five completed activities. Subsequent forced ads require four minutes and five activities; caps are three per rolling 30 minutes and twelve per rolling day. An optional video from Help grants ten minutes of foreground gameplay without forced ads, up to three rewards per rolling day. Counters and unused rewards persist. No ad load blocks gameplay. Tabboz's high-engagement ad setting is disabled.

The corrected build separates completed-activity counting from delayed ad presentation, so rapid navigation preserves counts while invalidating stale ad opportunities. A skipped opportunity preserves the cooldown. The original engine artifacts, art and dialogs are unchanged.

[Privacy policy](https://tabboz-mobile-2026.web.app/privacy), [support](https://tabboz-mobile-2026.web.app/support) and [authorized seller file](https://tabboz-mobile-2026.web.app/app-ads.txt) are live. Support email: **dadocere@hotmail.it**. The privacy/support URLs, Italian listing and reviewer notes are saved in App Store Connect. All seven privacy categories are published: coarse location, device ID, product interaction, advertising data, crash data, performance data and other diagnostics, with advertising purposes disclosed and no tracking declared for this configuration.

Firebase Analytics and Crashlytics remain independently controllable under Help → Privacy e diagnostica; enabled initially. Ad-related events obey the Analytics preference. Help → Preferenze pubblicitarie exposes UMP choices. The Tabboz-only European consent message was published and read back on 11 November 2026, with Italian default, English fallback, configured privacy URL and a first-layer deny option for all regions. The AdMob-to-Firebase link was verified in both consoles for project `tabboz-mobile-2026` and iOS bundle `it.tabboz.simulator` on 11 November 2026. Custom revenue callbacks are implemented separately; production revenue-event receipt is not yet claimed.

## Verification and artifacts

- [Final build 4 native suite](admob-native-tests.json): **20 passed, 0 failed, 0 skipped** on iPhone 17 Pro Max / iOS 26.5.
- [Real five-minute forced-ad SDK flow](admob-forced-sdk-tests.json): **1 passed**; real activities, original grace period, display and return to gameplay.
- [iPhone rewarded SDK flow](admob-sdk-smoke-tests.json) and [iPad rewarded SDK flow](admob-ipad-sdk-tests.json): **1 passed each**, including earned reward, dismissal, resume and persistence after relaunch.
- Browser regression passed six rapid actual-engine outings, cancellation, safe preparation, paused gameplay heartbeat, held-pointer protection and stale-token rejection. Engine smoke tests, original-source/artifact checks, artwork checks and plist validation passed.
- Apple validation/upload succeeded. Release dSYM upload to Crashlytics succeeded. No production ad revenue or dashboard event receipt is claimed from sample-ad QA.

Signed IPA: `../Builds/1.0.0-4/Tabboz.ipa` (Git ignored). Archive: `/tmp/tabboz-release/Tabboz-1.0.0-4-final.xcarchive`. `release.json` records current hashes, identifiers and remaining items; earlier build snapshots preserve history. Build 3 is superseded because of its rapid-activity counting issue. Credentials remain outside the workspace.

See [AdMob implementation](../Documentation/ADMOB.md), [Firebase history](../Documentation/FIREBASE.md), [source hashes](../Documentation/AdMob/build4-source-sha256.json) and [monetization strategy](MONETIZATION.md).

## Before public release

Complete the applicable AdMob readiness/store-link verification. AdMob currently requires review; hosting app-ads.txt alone does not establish approval. The modified source is published at [dadocere/tabboz-mobile](https://github.com/dadocere/tabboz-mobile) (tag `ios-v1.0.0-build4`); complete the remaining licensing/branding and distribution assessment. Apple accepting the app name is not trademark clearance; no original-author outreach has occurred.

Banking, tax forms, DSA and DAC7 were verified active in the Istituti De Amicis business account. Membership fee remains waived. An ads-only free app has no Paid Apps Agreement or in-app-purchase requirement; the membership has not been changed.
