# Gameplay verification

The complete bundled C/WebAssembly game was exercised through its real HTML controls, with a separate native XCTest pass through WKWebView and the iOS Files pickers. Tests use the original dialogs, prices, inventory and save representation; assertions inspect the resulting saved game rather than only checking that a window appeared.

## Coverage

`Scripts/test-gameplay.cjs` contains 37 scenarios:

| System | Verified behavior |
| --- | --- |
| Fresh character | Original Tizio Caio and 10,000 lire; an unaffordable jacket is rejected; a 6,000-lire cigarette purchase leaves 4,000 lire, adds cigarettes and advances time |
| Clothing | Actual selections and charges in all five shops; jacket, trousers and shoes equipped; cancellation preserves cash and inventory; female variants |
| School and family | Selected subject improves; paid/refused bribes; Saturday allowance at half/full/double rates according to grades; extra-money and social guards |
| Gym, tanning, discos | Subscription, insufficient money, duplicate subscription and expiry; tanning changes appearance; entry prices, closing day, dress code and transport restrictions |
| Scooter | Dealers and multiple brands; purchase, park/use, fuel, four tuning categories, damage repair, race, cancelled/confirmed sale and persisted ownership |
| Phone | Handset purchase/sale; SIM subscription; matching top-up; wrong-provider/no-SIM rejection; credit consumption before cash |
| Relationships | Search, rejection, call, date, breakup, male/female branches, existing-partner replacement choices and parked-scooter restrictions |
| Work | All nine reachable interview layouts (200–208), incomplete-answer rejection, real checkbox-group validation and successful hiring; all eight company information screens; work, monthly salary and resignation |
| Calendar | Month boundary, leap day, year rollover, report cards and gym expiry |
| Configuration and windows | Currency display, reset to a playable female character, minimize/restore, close, quit cancellation and desktop relaunch |
| Shop hub and Help | Every nested shop returns without charging when cancelled; About, usage notice and startup logo return to gameplay |
| Random events | All six fight dialogs (100–105) and both scooter accident dialogs (106–107), including their reputation/condition effects; naturally occurring events during progression |
| Audio | All 28 supplied WAVs decode; the three missing upstream sound references are treated as optional |
| Extended play | 400 consecutive activity days across calendar boundaries, followed by save/reload |
| Mixed play | 100 rounds with a job, scooter, phone and partner; repeated real actions, random events and save/reload; live runtime handle count checked for growth |

The browser suite creates isolated contexts. Advanced scenarios load saved-game fixtures with enough money/equipment to reach later systems. Randomness is seeded; successful relationship searches and specific random-event branches use explicit valid random draws for repeatability. These fixtures do not modify personal or simulator saves. The fresh-character scenarios separately exercise the actual starting balance and progression.

The interview tests answer the original validation rules through real checkboxes. They do not replace game callbacks or bypass hiring. Gameplay decisions and state transitions run in the original C code.

## Native and supporting verification

The native suite has five server/resource unit tests and three UI tests:

- A fresh iPhone character buys cigarettes, studies Agraria, selects an unaffordable shoe using touch and restores the resulting balance after relaunch.
- Native Files export creates a real JSON backup, handles replacement, imports the file and returns to a hittable game screen.
- Six activities, portrait/landscape bounds, iOS keyboard editing, background saving and profile persistence are checked in WKWebView.

The fresh-game UI test skips when a character has already progressed. Verification uses a dedicated fresh simulator so this check runs without erasing an existing player's save. Tests run serially because simulators share the host loopback port.

`Scripts/test-browser.cjs` separately checks delayed resource initialization, small-phone/portrait/landscape bounds, touch dialogs, saving and JavaScript errors. `Scripts/test-engine.cjs` checks startup, all 17 top-level commands, registry persistence and valid/invalid backup round trips using a lightweight non-rendering adapter. `Scripts/validate-assets.py` checks the compiled engine against its build manifest, original dialog/artwork fidelity and every resource inside the built app.

## Bugs discovered and corrected

1. Decorative Borland group frames intercepted touches over shop radio controls. They now ignore pointer events; actual purchases and insufficient-money paths are tested.
2. The compatibility runtime compared a resource pointer with a numeric parent window handle when closing dialogs. Controls leaked until the handle table filled and gameplay stopped. Child handles are released correctly, reused slots are cleared, addresses remain stable and dialog return values survive cleanup. A live-handle diagnostic makes this regression measurable.
3. The compatibility `random(n)` macro did not parenthesize its argument. Expressions such as `random(100 + Fortuna * 2)` changed the original probabilities and could exclude fights entirely at some luck settings. The corrected macro preserves the original Windows function's semantics; all eight fight/accident screens are now exercised.
4. Missing optional upstream sounds caused unhandled playback rejections. The audio manifest preserves all supplied clips and handles absent sounds without interrupting play.
5. The Help dropdown could extend outside the scaled window. It now opens inward.
6. Saving during modal loops and WebKit automatic text-field zoom could interfere with interaction. Saving is requested from the main loop; editing temporarily constrains viewport zoom.

Earlier startup checks also fixed the asynchronous resource-loading race and splash viewport inflation. Original game C, artwork and dialog templates remain unchanged. See [source provenance](UPSTREAM.md) for each compatibility change and rebuild instructions.

## Results and reproduction

On 2026-11-09, all **37 browser gameplay scenarios** and all **8 native tests** passed with zero failures or native skips. Browser coverage observed 78 dialog types, all nine interview layouts and 28 decoded audio clips. Extended progression completed 400 days plus 100 mixed rounds; the mixed-run handle count stayed at **31 initial / 31 peak / 31 final**. There were no JavaScript errors or failed game-resource requests. Both progression saves restored successfully.

See [verification results](VERIFICATION.md), the [gameplay summary](TestResults/gameplay-summary.json), and the [native result summary](TestResults/gameplay-iPhone-summary.json). The summary records the exact engine artifact hashes used for the run. Screenshots are retained under [Gameplay](Screenshots/Gameplay).

From the project directory:

```sh
npm install --prefix /tmp/tabboz-browser playwright
PLAYWRIGHT_MODULE=/tmp/tabboz-browser/node_modules/playwright node Scripts/test-gameplay.cjs
node Scripts/test-engine.cjs
PLAYWRIGHT_MODULE=/tmp/tabboz-browser/node_modules/playwright node Scripts/test-browser.cjs
python3 Scripts/validate-assets.py
```

The browser tests use installed Google Chrome on macOS. Elsewhere install Playwright Chromium or set `CHROME_PATH`. Use `TABBOZ_TEST_OUTPUT` for a different report directory and `TABBOZ_TEST_MATCH` to select scenario names. Native commands are in the README.

These checks cover the major gameplay systems and selected random branches, not every possible random combination. Physical hardware, listening to speaker/headphone output, actual memory/storage pressure and all supported iOS versions still require device testing. The upstream browser port's omitted network mode and minimized-window timer remain documented platform differences.
