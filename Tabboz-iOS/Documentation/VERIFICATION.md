# Verification

Verified in this workspace on 2026-11-09 with the rebuilt engine recorded in `Compatibility/EngineBuild.json`. Detailed coverage, methodology and fixes are in [Gameplay QA](GAMEPLAY-QA.md).

## Current build

- **37 gameplay scenarios passed, 0 failures**, covering 78 observed dialog types, all nine reachable interview layouts, all eight fight/accident scenes and all 28 supplied audio clips. The 400-day progression and 100-round mixed run both restored their saves correctly. Live runtime handles remained at 31 initially, at peak between activities and after reload. No JavaScript errors or failed game-resource requests occurred.

- iPhone SE (3rd generation), iOS 18.6 Simulator: **8 native tests passed, 0 failures, 0 skipped**. This includes five server/resource unit tests and three actual WKWebView UI tests. See the [native result summary](TestResults/gameplay-iPhone-summary.json).
- The native fresh-game test performs real purchases and studying, checks the resulting 4,000-lire balance and 1/100 school score, verifies an unaffordable selected item is rejected and restores progress after relaunch.
- Native Files export, replacement and import use a real JSON backup. The imported game returns to a hittable main screen without error alerts.
- Profile editing through the iOS keyboard persists across backgrounding, termination and relaunch. Activity touch targets and portrait/landscape bounds pass.
- Browser gameplay results are retained in the [gameplay summary](TestResults/gameplay-summary.json), including per-scenario results, reachable dialog coverage, extended-play metrics and engine hashes.
- The separate browser regression suite passes with text-resource loading deliberately delayed: automatic startup, six real touch dialogs, portrait/landscape/320-point bounds, profile persistence and no JavaScript errors.
- The lightweight actual-engine suite passes: original startup/defaults, all 17 top-level commands, profile/registry save, valid backup round trip, invalid/incomplete backup rejection and exit/relaunch restoration.
- Asset validation passes against the built `.app`: the rebuilt engine and 37 source/header inputs match their recorded hashes; all 82 original dialog files and 141 artwork references exist; original resources are unchanged except the documented JavaScript compatibility helper; every bundled web file matches the local source; the compiled asset catalog is present.
- [Current native screenshots](Screenshots/Gameplay) show gameplay after transactions/study, portrait/landscape, restored profile and backup restoration.

The runtime was rebuilt from unchanged gameplay C with corrected child-handle cleanup, stable reusable slots and Borland `random(n)` argument semantics. Mobile fixes cover blocked radio touches, optional missing sounds, Help-menu bounds, safe modal saving and keyboard zoom. See [provenance](UPSTREAM.md) for the complete changes and reproducible build recipe.

## Earlier platform checks

On 2026-11-08, the earlier engine build also passed seven native tests on iPhone 17 / iOS 27.0 and the gameplay/rotation/profile UI test on iPad Pro 11-inch (M5) / iOS 27.0. Those reports and [iPhone](Screenshots/iPhone)/[iPad](Screenshots/iPad) screenshots are preserved for reference: [iPhone result](TestResults/iPhone-summary.json), [iPad result](TestResults/iPad-summary.json). The complete current-engine native suite above ran on iPhone SE / iOS 18.6.

## Remaining device verification

- Physical device installation and actual memory/storage pressure.
- Listening verification of speaker/headphone output; automated checks decode all 28 supplied clips but do not establish perceived audio quality.
- Every supported iOS version and native Files picker behavior on iPad.
- Every possible sequence of random events. The suite checks major systems, deterministic branches and extended progression; it is not an exhaustive proof over all game states.

Full local logs, browser reports and the current Xcode result bundle are under `/tmp/tabboz-gameplay` (`final-37`, `FinalEngineNative.xcresult`). Lightweight results and representative screenshots are retained in this repository.

For a physical-device pass, complete startup, edit the profile, buy an affordable item, study, rotate, background/relaunch and export/import a Files backup. Check restored money and character with networking disabled. All game resources are bundled; no remote game service is required.
