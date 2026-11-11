# Tabboz Simulator for iOS

An offline iPhone and iPad port of the original Tabboz Simulator, using the actual upstream C game compiled to WebAssembly. The original Italian dialogue, lire, character artwork, Borland button graphics, Windows-style menus, shops and activities are bundled with the app.

## Run

1. Open `Tabboz.xcodeproj` in Xcode 16 or newer.
2. Select the **Tabboz** scheme and an iPhone or iPad simulator.
3. Press Run. Signing is pinned to Istituti De Amicis team FC4758TVE2; use that organization for physical-device and store builds.

Deployment target: iOS 16.0. No accounts, external servers or downloads are needed to play. The checked-in Xcode project is ready to open; XcodeGen is only needed when changing the project definition.

## Play

The original startup logo appears first; tap it or its confirmation button. The initial character is **Tizio Caio**, with **10,000 lire**. Use **Special → Personal Information** to change the character's name and address. Use **Special → Configuration** to reset the game, select a male/female/random character, or change original preferences.

The main window and menus expose the original activities: scooter, disco, school, work, friends, family and relationships. The original clothing shops, tobacconist, gym and phone shop are included. Activities change money, reputation, school progress, appearance and relationships through the original game code. All original dialogue and adult satirical content are retained.

Dialogs scale proportionally to fit portrait, landscape and iPad windows. Drag a dialog by its title bar with a finger. Original control positions, fonts, images and menu labels are retained. The desktop icon remains available after **File → Chiudi**.

## Saves

The original registry implementation stores progress in persistent WebKit local storage. The host requests a save every 15 seconds, after closing dialogs and when the app becomes inactive. Saves use the original `WM_ENDSESSION → FineProgramma → SalvaTutto` path.

**Important:** the original engine defers main-window messages while a modal dialog is open. Close activity dialogs before leaving the app when you want to ensure recent actions have been saved. Deleting the app deletes its local progress.

The original **File → Salva con nome...** and **File → Apri...** commands use the iOS Files picker for portable `.tabboz.json` backups. Import validates the format before replacing progress, then restarts the game. These mobile backups are not Windows `.tbs` files.

## Structure

| Path | Purpose |
| --- | --- |
| `Tabboz/App` | SwiftUI entry point, WKWebView host, native file pickers |
| `Tabboz/Engine` | HTTP server bound exclusively to `127.0.0.1:18798` |
| `Tabboz/Web` | Bundled original engine and resources, mobile adaptation |
| `Upstream` | Unmodified upstream repository snapshot, including C sources and original build files |
| `Compatibility/Novantotto` | Vendored Windows compatibility runtime with resource cleanup fixes |
| `Compatibility/EngineBuild.json` | Compiler version, source hashes and shipped engine hashes |
| `Tests` | XCTest coverage for bundled resources, content types and path traversal |
| `UITests` | Native simulator tests for touch, rotation, profile persistence and Files backups |
| `Scripts/test-engine.cjs` | Actual WebAssembly gameplay/save smoke tests with a headless UI adapter |
| `Scripts/test-browser.cjs` | Delayed-startup and viewport regression checks with Playwright |
| `Scripts/test-gameplay.cjs` | Transactions, progression, interviews, calendar and extended-play checks |
| `Scripts/validate-assets.py` | Checks engine/source hashes and all static artwork references |
| `project.yml` | XcodeGen project definition |

The fixed loopback origin keeps save storage stable across launches. The server serves only bundled files and never binds to Wi-Fi or cellular interfaces. WebKit navigation is restricted to this origin. Game code is never downloaded at runtime.

## Verify

The signed builds and Italian App Store Connect draft are recorded in [App Store release notes](AppStore/README.md). Signing is pinned to ISTITUTI EDMONDO DE AMICIS SRL (`FC4758TVE2`).

From this directory:

```sh
node Scripts/test-engine.cjs
python3 Scripts/validate-assets.py
xcodebuild -project Tabboz.xcodeproj -scheme Tabboz \
  -sdk iphonesimulator -derivedDataPath /tmp/tabboz-build \
  CODE_SIGNING_ALLOWED=NO build-for-testing
```

With a simulator available:

```sh
xcodebuild -project Tabboz.xcodeproj -scheme Tabboz \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -parallel-testing-enabled NO -collect-test-diagnostics never test
```

Select an installed simulator name if different. Run tests serially and close other Tabboz simulator instances: iOS simulators share the Mac's loopback ports. The Node engine smoke test uses a non-rendering UI adapter; native UI tests verify actual WebKit rendering and file picker behavior. See [verification notes](Documentation/VERIFICATION.md) and [simulator screenshots](Documentation/Screenshots/iPhone).

The optional browser regression test requires Playwright. It starts and stops its own local test server and checks delayed initialization, viewport bounds, touch dialogs and save/restore:

```sh
npm install --prefix /tmp/tabboz-browser playwright
PLAYWRIGHT_MODULE=/tmp/tabboz-browser/node_modules/playwright node Scripts/test-browser.cjs
PLAYWRIGHT_MODULE=/tmp/tabboz-browser/node_modules/playwright node Scripts/test-gameplay.cjs
```

On macOS it uses an installed Google Chrome; elsewhere install Playwright Chromium or provide `CHROME_PATH`.

The gameplay suite uses isolated browser contexts, seeded randomness and saved-game fixtures for later-game branches. It does not change simulator or personal saves. Reports are written to `/tmp/tabboz-gameplay` by default; override `TABBOZ_TEST_OUTPUT` to keep separate runs. `TABBOZ_TEST_MATCH` filters scenario names. The fresh-game native transaction test should run on a new dedicated simulator; it skips rather than resetting existing progress. See [gameplay coverage and results](Documentation/GAMEPLAY-QA.md).

To rebuild the corrected engine, activate Emscripten 3.1.51 and run `bash Scripts/build-engine.sh`. The recipe compiles unchanged gameplay sources with the vendored compatibility fixes and updates the build manifest.

To regenerate the project after editing `project.yml`, run `xcodegen generate`. To regenerate the app icon from the original pixel artwork, run `swift Scripts/generate-icon.swift`.

## Fidelity and remaining platform differences

This uses the original C gameplay code and dialog templates, hosted by a native iOS app. The engine is rebuilt with a corrected Windows compatibility runtime: repeated activity changes previously leaked resource handles and could block play, and random-number expressions did not preserve the Windows function's argument semantics. Original gameplay sources, artwork and dialog templates remain unchanged. Mobile adaptations and compatibility changes are documented in [provenance](Documentation/UPSTREAM.md).

The upstream web build omits the old network mode and Windows minimized-window timer behavior. This port inherits those differences. Windows executable/DLL files are retained only in `Upstream` for reference and are not bundled into the app. App Store distribution, signing and device validation remain separate release work.

## Credits and license

Original game: **Andrea Bonomi / Obscured Truckware**, with original contributors credited in the game's About dialog. Upstream web conversion and Novantotto compatibility layer: **Andrea Bonomi**. Source: [andreax79/tabboz](https://github.com/andreax79/tabboz); compatibility layer: [andreax79/novantotto](https://github.com/andreax79/novantotto).

The original game and this port are distributed under GPL-3.0-or-later; see [LICENSE](LICENSE) and original source headers. Existing third-party notices, including Novantotto's MPL-2.0 header and the 98.css attribution, are retained. The entire upstream source snapshot accompanies the port.

## Advertising and telemetry

The app is being prepared as a free ads-funded download without purchases. Build 3 introduced AdMob; build 4 corrects rapid-activity counting so ad opportunities can be skipped without losing activity progress. [AdMob implementation and verification](Documentation/ADMOB.md) records caps, optional ad-free rewards, consent, SDK versions and console launch prerequisites. Firebase Analytics and Crashlytics remain independently controllable under Help → Privacy e diagnostica. Gameplay and saves work offline.

The separate `TabbozAdsSmoke` scheme uses Google sample ads and needs network access; its forced-ad test waits through the real five-minute grace period. The ordinary `Tabboz` test scheme excludes these network tests. Browser bridge regression: `PLAYWRIGHT_MODULE=/path/to/playwright node Scripts/test-ads-bridge.cjs`.
