# SuperTask: Changelog

> Archive of completed features and resolved bugs. Items move here from `tracker.md` when done.
>
> **Related docs:**
> - Tracker: `docs/tracker.md` -- active features and bugs
> - Design docs: `docs/design-*.md` -- deep dives on specific features
> - Session state: `PROGRESS.md` -- current session handoff notes

## 2026-07-25 (session 35)

### B-029: F-026 note jump from TaskHome unreliable -- RESOLVED (confirmed on-device)
**Resolution:** Root cause was neither the intent mechanism nor the two leading hypotheses (same-note activity reuse; spaces in filenames). Log round 1 showed cross-note jumps working perfectly (page extra honored, `×` in directory fine) while `July 23 More testing.note` failed with the editor's "note not found" -- because that task was captured one day before F-024 fixed `addTask` dropping `notePath`, so the jump fired at an unverified same-directory GUESS that happened to be wrong. Fix chain: (1) `openNote()` pre-flights `RNFS.exists(path)` and fails inside the plugin (TaskHome banner / TaskDetail status) instead of stranding the user; (2) F-033's heal-pass backfill recovers real full paths for legacy entries from the Todoist description back-reference. Confirmed on-device 2026-07-25: previously-failing notes now open, spaces in filenames included -- the editor handles them fine when the path is real.

### B-030: Log screen unreachable from TaskHome -- RESOLVED (confirmed on-device)
**Resolution:** F-024 removed Log/Diag from the TaskHome header claiming they "live in Settings > Debugging," but only Diagnostics got a Settings row -- the debug screen existed in App.tsx with no reachable entry point from the home flow. Fixed both ends: TaskHome header shows a Log button when `debugMode` is on (honoring the Settings hint "Show Log buttons in screens"), and Settings > Debugging gained a "Debug log" row. Confirmed working in log 2026-07-25 18-11 ("LOG pressed" -> debug screen -> successful upload).

### T-002: Undocumented SDK native module audit -- DONE
**Resolution:** Full read of sn-plugin-lib's shipped Java/Kotlin sources (background agent, session 34). Findings in `../../docs/sdk-native-audit.md`. Headlines: no URL-scheme/link-tap interception exists anywhere in the SDK (confirms ratta-feedback item 7 and validates F-027 as the ceiling); no background execution primitives; DexUtils can dynamically load arbitrary dex/.so (policy: do not use); LinkTrail parcelable carries destFileId/destPageId fields stripped from JS; FileSelector accepts hidden folder-picker params (future "link note to task" UI); `getPageRotationType` is TS-exposed but natively dead; `modifyButtonRes` + keep-awake toggles worth on-device probes. F-004 design note: dashboard rows should be linkType 1 file-links for native-tap navigation.

### F-019: Quick page creation with date headers -- MOVED to SuperHub (F-001)
**Resolution:** Filesystem-flavored feature; belongs in the file-manager plugin (Alex, 2026-07-24). Full spec carried over to `plugins/SuperHub/docs/tracker.md` F-001. Remains the training-ground prerequisite for SuperTask's F-004 dashboard (shared element-authoring primitives).

### F-018: Native writeFile / RNFS removal -- DROPPED
**Resolution:** Dropped by decision (Alex). The ~2MB build saving was the entire argument, and the calculus changed in session 34: all RNFS writes now flow through three hardened chokepoints (atomic config writes, serialized registry, debug session log). Swapping proven file I/O for hand-rolled Java carries regression risk with no user-visible benefit.

### T-003: Architecture doc / user README / Ratta feedback bundle -- DROPPED
**Resolution:** Dropped as a tracked task (Alex). The Ratta feedback deliverable exists and is actively maintained (`ratta-feedback.md`, 9 items). The user README should be refreshed as part of cutting the next release (alongside attaching dev-server.js per the F-022 distribution plan) rather than as standing work; the architecture doc had no consumer.

## 2026-07-05 (session 31)

### Gesture lifecycle: removed manual `_enabled` toggle
**Resolution:** The `setGestureEnabled(true/false)` mechanism for managing gesture state across plugin view open/close was fundamentally fragile. Multiple code paths could dismiss the plugin view (toolbar close, noteOpener intent navigation, error recovery) and each had to remember to re-enable gestures. Missing one (e.g., `noteOpener.js` calling `closePluginView()` directly) left gestures permanently disabled. Root cause of B-012's "unreliable gestures after using the plugin." Fix: removed `_enabled` and `setGestureEnabled()` entirely. The SDK's motion listener naturally stops receiving events when the RN plugin view is visible (touch interception by the full-screen React Native view). Only `_configOff` (user settings toggle) remains. Removed `setGestureEnabled` calls from: App.tsx (6 calls), closePlugin.js, noteOpener.js, gestureDetector.js openPluginView/error handler.

### F-014: Bezel swipe replaced with three-finger double tap
**Resolution:** Bezel swipe was unreliable due to two compounding issues: (1) digitizer is least accurate at the physical bezel edge (misreported coordinates, phantom pointers), (2) the `_enabled` flag leak (see above) made it seem even worse. Replaced with three-finger double tap anywhere on canvas, twice within 800ms. No edge zone, no displacement/direction calculation. Opens task home with user's default tab. Removed: bezel edge detection, page height caching (`fetchPageHeight`), `_bezelSwipe` state, late bezel recovery path, bezel swipe config settings (target, project picker). Bezel swipe can be reconsidered now that the lifecycle fix makes all gestures reliable.

### B-012: Resolved -- root cause was `_enabled` flag leak
**Resolution:** Phantom pointer events (digitizer noise after sleep) were real but were a red herring for the primary gesture unreliability. The actual cause was the manual `_enabled` toggle getting stuck at `false` when the plugin view was dismissed via `noteOpener.js` (which called `closePluginView()` without re-enabling gestures). See gesture lifecycle entry above.

### B-016: Resolved -- moot (bezel removed)
**Resolution:** Bezel edge zone width concern is moot after replacing bezel swipe with three-finger double tap.

### Changelog: session 21 gesture lifecycle entry superseded
The session 21 "Gesture lifecycle (enable/disable)" entry documented the creation of `closePlugin()` and `setGestureEnabled()`. This session's fix supersedes that approach entirely -- the manual toggle was the root cause of persistent gesture failures.

## 2026-06-06 (session 27)

### F-014: Bezel swipe configurable target
**Resolution:** Bezel swipe target is now configurable in Settings > Preferences. Options: Default tab, Today, Upcoming, Projects, or Specific project (overlay picker). Gesture detector reads config on each swipe and sets the appropriate deep link. Both first-mount (getInitialScreen) and re-show (__superTaskNavigate) paths handle `view-project` action. Confirmed on A5X and Nomad.

### SDK optimization: Convert-to-text (9 calls -> 4)
**Resolution:** Replaced hybrid pattern (`insertText` + `lassoElements` + `setLassoStrokeLink` + 3x `saveCurrentNote` + `reloadFile`) with `insertTextLink` (atomic text+link in one SDK call) + single `saveCurrentNote`. Reduced from 9 sequential native bridge round-trips to 4. On-device improvement from ~3 seconds to ~1 second. Trade-off: breaking link removes text (atomic), but task persists in Todoist. See `design-sdk-optimization.md` for principles.

### B-004 (partial): Projects tab honors enabledProjectIds
**Resolution:** Projects tab now shows all projects including empty ones (e.g., Inbox). When `enabledProjectIds` is set in Settings, only selected projects appear. Previously the tab filtered to projects with active tasks only, hiding configured projects and making the setting feel broken. Today/Upcoming filtering still open.

## 2026-05-25 (session 23)

### F-015: Lasso-add gate for linked content
**Resolution:** Lasso-add gesture now checks pre-scan result before proceeding. If the finger DOWN point is on content that already has a supertask:// link, the lasso-add is aborted (`LASSO-ADD ABORTED` in logs). Two-tier gate: sync fast-path in `onFingerMove` blocks lasso mode entry if pre-scan already resolved; async fallback in `handleLassoAdd` awaits the pre-scan (already settled by finger UP). Zero additional SDK calls -- reuses the pre-scan that runs on every finger DOWN.

### Structural: `_actionInProgress` leak fixed
**Resolution:** Both `handleLongPress` and `handleLassoAdd` restructured with a single `try/finally` wrapping the entire function body after `_actionInProgress = true`. Previously, early returns (gate abort, "no link found", etc.) could exit without hitting the `finally` block, permanently setting `_actionInProgress = true` and killing the entire gesture listener. Any code path now guarantees cleanup.

### Pre-scan `.then()` race condition fixed
**Resolution:** The `.then()` callback that caches pre-scan results in `_preScanResult` now captures the generation counter at creation time and only writes if it matches the current `_scanGeneration`. Prevents stale pre-scans (from cancelled native lasso/pen operations) from overwriting a current gesture's scan result.

### B-007 confirmed fixed
**Resolution:** Long press on empty space correctly ignored. Confirmed on-device -- pre-scan hit-tests against link bounds and only fires on direct hits.

## 2026-05-17 (session 22)

### Pen lasso mode removed
**Resolution:** Pen-hold-to-lasso gesture removed entirely. Was the root cause of B-008 (border stroke deletion killing content via reloadFile), B-009 (finger drift not tracked in pen mode), B-010 (race conditions from concurrent async handlers), B-011 (replaceElements requires reloadFile for display update). Gesture detector simplified to finger-only. `deleteBorderStroke`, `_lassoToolType`, `PluginNoteAPI` import all removed.

### B-006, B-008, B-009, B-010, B-011 resolved
**Resolution:** All pen-lasso-specific bugs resolved by removing pen lasso mode. No longer applicable.

### Pre-scan queue clog fixed
**Resolution:** Added `_scanGeneration` counter. Each finger DOWN increments it. `preScanLinks` checks generation after each `await` and bails if stale. Prevents cancelled/rapid-fire scans from piling up on the native AIDL bridge, which was causing multi-second delays on long press (5+ queued `getElements` calls blocking the current scan).

### Motion listener silent when UI open
**Resolution:** Early return for `!_enabled` moved before all logging and event processing. When plugin view is open, the motion listener does nothing -- no event logs, no pre-scans, no hit-testing.

### Config simplified to Off/Finger lasso
**Resolution:** Removed 'pen' option. Section renamed to "Gestures". Two options: Off, Finger lasso. Existing 'pen' config values auto-migrate to 'finger' on load.

## 2026-05-16 (session 21)

### F-015: Quick lasso-add gesture -- bugs 1-4 fixed
**Resolution:** All four gesture bugs from session 20 fixed: (1) PTR_DOWN now cancels gesture instead of restarting -- prevents two-finger lasso false trigger. (2) `_mixedInput` checked in lasso UP path. (3) `lassoElements` result checked for `result === false`. (4) `deleteBorderStroke()` removes pen-drawn border before `lassoElements()` in pen mode. Additionally fixed multi-pointer false activation and mixed input detection for pen mode (was comparing configured cancel tool, now compares against active gesture's tool type). Awaiting on-device verification.

### Gesture lifecycle (enable/disable)
**Resolution:** Gestures now disabled while plugin UI is visible, re-enabled on close. Created `closePlugin()` utility (`src/utils/closePlugin.js`) that calls `setGestureEnabled(true)` before `closePluginView()`. Replaced all direct `closePluginView()` calls across 8 screens. Needed because `closePluginView()` doesn't unmount the React component tree (useEffect cleanup never fires).

### Three-way gesture config (Off/Finger/Pen)
**Resolution:** Replaced separate boolean + tool select with single `lassoGestureInput` setting ('off', 'finger', 'pen'). `_configOff` flag ensures App mount/unmount lifecycle can't override the disabled state. Config screen uses radio buttons. Takes effect immediately via `applyGestureConfig()`, no restart required.

### Gesture guard documentation
**Resolution:** Created `docs/design-gesture-guards.md` (6-layer guard architecture: config kill switch, event filtering, DOWN gates, MOVE gates, UP gates, action validation) and `docs/gesture-guards-diagram.svg` (visual pipeline diagram with timing sequences and native gesture protection table).

## 2026-05-16 (session 19-20)

### F-013: Cross-note navigation
**Resolution:** Temp `insertTextLink` with `linkType:1` + `destPath` placed at top-center of current page (3% from top, horizontally centered). Shows task name in link text. Auto-cleanup via `deleteElements` on next plugin open, keyed by `numInPage`. Pending state persisted to `/MyStyle/SuperTask/pending-temp-link.json`. Full note path stored in Todoist description + task registry. Off-by-one fix: `pageNum` is 0-indexed, was incorrectly subtracting 1.

### F-002: Text editability on convert
**Resolution:** Not a plugin issue. Supernote's built-in text editing gestures (pen long-press, finger double-tap) work on converted text boxes. No plugin-side change needed.

### B-001: OCR sometimes reads "1" as "I"
**Resolution:** Closed as won't-fix. This is inherent to `recognizeElements` OCR accuracy based on handwriting. User reviews recognized text before submitting.

### B-002: Cross-note navigation
**Resolution:** Solved via temp link approach (see F-013). `openFilePath()` and Intent-based strategies were dead ends (all open file manager, not editor). `insertTextLink` with cross-note `destPath` is the working workaround. Gesture regression fixed: `ptrs > 1` mixed-input check was blocking all finger long presses because Supernote reports finger as `PTR_DOWN` with `ptrs=2` (device quirk). Fixed by checking pen `toolType` only; two-finger lasso caught by drift threshold.

### B-003: Motion listener doesn't fire from init/mount
**Resolution:** Moved to changelog (was already resolved in session 18).

## 2026-05-15 (session 18)

### F-012: Long-press gesture to open task from note
**Resolution:** Full deep link chain working on-device. Gesture detector registers at init (index.js) so it works on fresh note views. Pre-scans links on finger DOWN (overlaps with hold time). Rejects false triggers from pen activity or multi-pointer (gesture erase, two-finger lasso). Navigates via `global.__superTaskNavigate` for re-show or `getInitialScreen()` for first mount. Single task API fetch + parallel projects. ~1s from finger lift to TaskDetail (was ~6s).

### F-009: Motion listener gesture capture
**Resolution:** Long-press finger detection on supertask:// links via `registerMotionListener`. Pre-scan on DOWN, mixed-input rejection, hit-test against link bounds with 30px padding. Single-link fallback when bounds are zero.

### B-003: Motion listener doesn't fire from init/mount
**Resolution:** Was a red herring -- events were firing but `log()` from debug.js only collects in-memory (doesn't POST to dev server). Confirmed working from both index.js and App.tsx useEffect on sn-plugin-lib 0.1.43.

## 2026-05-15 (session 16-17)

### F-008: Token obfuscation + auto-generation
**Resolution:** Replaced crypto-js (broke on Hermes -- no `crypto.getRandomValues()`) with XOR+base64 obfuscation. Config template auto-generated on first launch with `YOUR_TOKEN_HERE` placeholder. Plain text tokens auto-obfuscated on next load. Info popup (?) on Settings screen guides users through USB sideload, Bluetooth keyboard, and on-screen keyboard entry methods.

### Config reverted to RNFS from .note storage
**Resolution:** The .note file storage workaround (sn-keyworder pattern) failed on-device: error 802 (`template: 'none'` invalid), error 1204 (system template fallback failed), error 102 (no note context from config screen). Reverted to RNFS (`react-native-fs`) which works reliably. Removed crypto-js dependency, keeping build at 6.8MB.

### SDK upgraded to sn-plugin-lib 0.1.43
**Resolution:** Updated from 0.1.34. New APIs: `registerMotionListener` (pen/finger touch events), `generateLassoPreview`, `generateLayerPreviewImage`, `showPluginView`, `getCacheElement`. New `setLassoBoxState(3)` hides lasso UI while preserving selection. Java-side API names aligned with JS/TS (requires recompile). Bug fixes: image move no longer clears userData, element coordinates update after move, page number -1 fix.

### API token removed from build
**Resolution:** With RNFS persistence confirmed working, removed bundled API token from `config.local.js`. Token entered once via Settings persists in the on-device JSON file across reinstalls.

## 2026-05-14

### B-002: Convert to Text fails to delete strokes
**Resolution:** Root cause was that `insertText` (T badge) + `saveCurrentNote` during auto-mark killed the original lasso context. The re-lasso attempt using EMR-computed bounds failed (`result: false`, 0 elements). Fixed by deferring all marking until the user chooses Done or Convert to Text, so `deleteLassoElements` operates on the still-active original lasso.

### B-003: T badge position inconsistent
**Resolution:** Replaced EMR-to-pixel coordinate math (~60 lines of stroke point sampling) with `getLassoRect()`, which returns exact pixel bounds of the active lasso selection. T badge now consistently positioned relative to the lasso rect.

### Lasso persistence after Done/Convert
**Resolution:** Added `lassoElements(bounds)` re-lasso at the end of both Done and Convert to Text paths. For configON Convert, the link is applied first (which dismisses the lasso), then a second `lassoElements` call re-selects the text. Selection persists after plugin closes so user can reposition.

### Race condition: Done pressed during Convert
**Resolution:** Added `marking` state guard to `handleDone` and disabled Done button during conversion. Prevents duplicate T badges and double link application.

### T-001: Settings page redesign
**Resolution:** Compact horizontal e-ink layout with built-in tab bar (Connections/Preferences). Preferences grouped into General, Projects, Handwriting, Advanced. Inline radio buttons, horizontal toggle rows, 2-column checkbox grids. Config source chip shows where settings loaded from.

### F-007: Config persistence via RNFS
**Resolution:** Added `react-native-fs` as first native module. Config saved as JSON to `/storage/emulated/0/MyStyle/SuperTask/supertask-config.json` via `RNFS.writeFile`. Works from any screen (no note context required). Replaced failed .note file storage approach (which needed note context for `createNote`). Build switched to release with R8 minification -- .snplg dropped from 6.8MB to 2.9MB.

### Native module build pipeline
**Resolution:** Established Gradle build pipeline for native modules. Build script auto-detects native code in `node_modules/`, runs Gradle, bundles APK as `app.npk` in `.snplg`. ProGuard rules configured for sn-plugin-lib and RNFS. Any future native module is just `npm install` + add keep rule + rebuild.
