# Tabboz Simulator — mobile

Source repository: [dadocere/tabboz-mobile](https://github.com/dadocere/tabboz-mobile). The `ios-v1.0.0-build4` tag identifies the source snapshot for the uploaded iOS build 4.

The iOS game lives in [Tabboz-iOS](Tabboz-iOS/README.md).

Development and commercial distribution are separate milestones. Current license and platform status is recorded in [distribution notes](DISTRIBUTION.md).

Open `Tabboz-iOS/Tabboz.xcodeproj` in Xcode, choose the **Tabboz** scheme and an iPhone or iPad simulator, and press Run. Signing is pinned to Istituti De Amicis team FC4758TVE2.

This is an offline iOS host for the original game's C/WebAssembly engine, dialogs and artwork from [andreax79/tabboz](https://github.com/andreax79/tabboz). The upstream source and license are retained inside the iOS directory. Android is reserved for a later port; the bundled game can be reused there.

## Firebase and store draft

Build 2 introduced Firebase Analytics and Crashlytics with independent controls under Help → Privacy e diagnostica. Build 4 adds the corrected AdMob integration for a free ads-funded app. See [store status](Tabboz-iOS/AppStore/README.md), [AdMob setup](Tabboz-iOS/Documentation/ADMOB.md), [privacy policy](https://tabboz-mobile-2026.web.app/privacy) and [support](https://tabboz-mobile-2026.web.app/support).

The current monetization implementation is a free ads-funded model without purchases. See [AdMob configuration, verification and remaining console steps](Tabboz-iOS/Documentation/ADMOB.md). The previous build 2 Firebase-only verification is retained as history.
