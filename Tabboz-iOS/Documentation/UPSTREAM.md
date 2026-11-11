# Upstream provenance

- Repository: https://github.com/andreax79/tabboz
- Snapshot: `main` archive downloaded on 2026-11-08 from `https://codeload.github.com/andreax79/tabboz/tar.gz/refs/heads/main`.
- Exact unmodified downloaded contents: `../Upstream/`.
- The source repository's LICENSE and copyright notices are preserved.
- The original provided binaries remain in `Upstream`. The shipped engine is rebuilt from the unchanged Tabboz C sources plus the corrected compatibility layer described below. `Compatibility/EngineBuild.json` records all 37 source/header hashes, compiler version and shipped artifact hashes; validation checks these.
- All `resources` files are identical to upstream except `resources/js/novantotto.js`.

Changes to `novantotto.js`:

1. Export the existing `getCheck` implementation, required by the compiled engine's checkbox/radio import.
2. Divide click coordinates by the mobile display scale so original image hit targets remain correct.

The original index page is replaced by a local-only entry point without the external GitHub ribbon. `mobile.css` fits original fixed-size dialogs to the mobile viewport. `mobile.js` supplies initial launch, viewport fitting, touch dragging, save requests and portable backup support. Original File menu labels are preserved while native document pickers replace Windows file dialogs.

Runtime verification fixes in the mobile layer:

- Automatic launch waits for the original engine's final UI initialization hook. Emscripten's `postRun` alone runs too early when asynchronous text loading is still in progress.
- Dialog fitting uses the document's layout viewport dimensions so oversized startup content cannot inflate the mobile viewport calculation and clip the splash.
- Original bitmap OK/Cancel buttons, the startup image and profile fields receive accessibility names. The underlying artwork and dialog templates remain unchanged.
- Decorative Borland frames ignore pointer events; some original HTML templates place these frames over radio controls, blocking purchases.
- The audio manifest lists all 28 supplied WAV clips. Missing upstream references (401, 601 and 1400) are ignored like optional Win32 sounds instead of producing unhandled playback errors. All supplied audio bytes remain unchanged.
- Saves are posted only when the main window owns the message loop, avoiding queued main-window messages inside modal activity dialogs.
- During text editing, the viewport prevents WebKit automatic zoom from shifting field hit targets. Normal pinch zoom returns after editing ends.
- The rightmost Help dropdown opens inward so its commands remain touchable inside the scaled window.

Compatibility runtime source is vendored in `Compatibility/Novantotto` from [andreax79/novantotto](https://github.com/andreax79/novantotto), downloaded on 2026-11-08. Its original MPL-2.0 license and notices are retained. The runtime fixes are:

1. Release child resources by comparing their numeric parent HWND with the window HWND. The original compared a RESOURCE pointer with a HWND, leaking controls when activities closed and exhausting the handle table.
2. Clear released/reused resource slots so stale class/property pointers cannot be reused.
3. Preallocate 1,024 stable handle slots for nested dialogs, retaining stable RESOURCE addresses.
4. Preserve the dialog return value before clearing its resource slot.
5. Export a read-only live-handle count for the repeated-activity regression test. This does not change game decisions or state.
6. Parenthesize the argument of the Borland `random(n)` compatibility macro. Without this, expressions such as `random(100 + Fortuna * 2)` were evaluated as `randomFraction * 100 + Fortuna * 2`, suppressing some original events and changing probabilities. The corrected macro matches the original Windows function's argument semantics; gameplay C remains unchanged.

The original build recipe remains in `Upstream/Makefile`. The shipped version uses `Scripts/build-engine.sh` with Emscripten 3.1.51 and the vendored corrected runtime. It compiles the original gameplay C files directly from `Upstream`, then records artifact/source hashes. Rebuilding is not required to run the Xcode project; the corrected compiled engine is checked in.

Gameplay reference consulted: https://www.punto-informatico.it/download/tabboz-simulator/ . It describes the original money/reputation/appearance loop and activities. No review text or third-party prose was copied into the game. The authoritative game behavior and text come from the GPL source itself.
