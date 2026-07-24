# SuperTask: Comprehensive Technical Handoff

> Self-contained reference for anyone picking up SuperTask development. Covers the Supernote SDK API, gesture detection architecture, native intent navigation, on-device learnings, the gesture death bug (B-019), and open stability issues.
>
> **Why this exists:** The plugin was uninstalled from the device due to conflicts with regular note-taking gestures and device stability. A deep investigation is needed to determine root causes and fix them before the plugin can be reinstalled.
>
> **Related docs:** `tracker.md` (active items), `changelog.md` (resolved items), `PROGRESS.md` (session state), `design-*.md` (feature deep dives)
>
> **STATUS UPDATE (2026-07-23, session 34):** The stability fixes were implemented (awaiting on-device test). Sections 3.3 (pre-scan on every DOWN) and 4 (pre-scan flow, guard layers 0/1/10) describe the OLD architecture. Current architecture: `onMsg` is SDK-free; link scanning runs post-classification only; gesture death is prevented by an event-driven watchdog (not just `withTimeout`); lasso-add defaults to off. See section 5's update block, tracker B-019/B-020/B-021, and `PROGRESS.md` Session 34.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [The Problem](#2-the-problem)
3. [Architecture](#3-architecture)
4. [Gesture Detection System](#4-gesture-detection-system)
5. [The Gesture Death Bug (B-019)](#5-the-gesture-death-bug-b-019)
6. [Native Intent Navigation](#6-native-intent-navigation)
7. [Supernote SDK API Reference](#7-supernote-sdk-api-reference)
8. [On-Device Learnings](#8-on-device-learnings)
9. [Open Issues](#9-open-issues)
10. [Recommended Investigation Path](#10-recommended-investigation-path)
11. [File Map](#11-file-map)

---

## 1. Project Overview

SuperTask is a Supernote e-ink device plugin that captures handwritten notes as Todoist tasks. Built with React Native 0.79.2 + sn-plugin-lib SDK.

### Core capabilities
- **Lasso capture**: select handwriting with native lasso or finger gesture, OCR it, create a Todoist task
- **Task browsing**: view Today/Upcoming/Projects tabs, drill into task details
- **Bidirectional linking**: supertask:// link elements on note pages link back to tasks; Todoist descriptions link forward to note+page
- **Cross-note navigation**: open any .note file at a specific page via Android intents
- **Gesture shortcuts**: three-finger double tap (open task home), long press on link (view task), hold+drag (lasso-add), hold finger+pen lasso (pen-lasso-assist)

### Entry points
| Button ID | Location | Action |
|-----------|----------|--------|
| 100 | Toolbar (NOTE) | Open task home |
| 200 | Lasso bar (NOTE) | Capture lassoed handwriting as task |
| 300 | Toolbar (DOC) | Capture selected PDF text |
| Config | Settings gear | API token + preferences |
| Gesture | Motion listener | Three-finger double tap / long press / lasso-add |

### Build pipeline
`buildPlugin.sh` produces a `.snplg` file (zip of Hermes bytecode + assets + PluginConfig.json). Native module compilation uses Gradle (required for NoteOpenerModule). Install: copy to `MyStyle/`, Settings > Apps > Plugins > Install.

---

## 2. The Problem

### Symptoms observed
1. **Gesture detection permanently dies** during a session. After a certain point, three-finger double tap, long press, and lasso-add all stop responding. The only way to use the plugin is via toolbar buttons.
2. **Device-level conflicts** with regular note-taking. The plugin's motion listener may interfere with normal Supernote gestures (page turns, native lasso, scrolling), making the device feel unreliable.
3. The plugin was **uninstalled** because these conflicts made the Supernote harder to use for its primary purpose.

### Root cause (identified but unconfirmed on-device)
**B-019: SDK calls hang indefinitely, locking `_actionInProgress` forever.**

The gesture detector uses a re-entry guard (`_actionInProgress`) to prevent concurrent gesture handling. When an SDK call hangs (e.g., `getCurrentFilePath()` during a system dialog or while the plugin view is showing), the async handler never reaches its `finally` block. `_actionInProgress` stays `true`. The `onMsg` handler checks `if (_actionInProgress) return;` at the top, silently dropping ALL future motion events. Gestures never recover.

A `withTimeout()` fix was coded in session 33 but **never confirmed on-device** -- and session 34 analysis found it could not have worked on its own (JS timers are suspended while the plugin view is closed; see the update in section 5). Session 34 replaced it with an event-driven watchdog plus an architectural refactor that removes SDK calls from the touch hot path entirely.

### Broader concern
Even if B-019 is fixed, there may be a deeper question: **does the motion listener itself interfere with the Supernote's native touch handling?** The listener is registered at plugin startup (`index.js`) and stays active permanently. Every finger touch on the canvas fires through it. If the listener's processing (pre-scan SDK calls, etc.) introduces latency or side effects in the native touch pipeline, it could degrade the note-taking experience even when gestures aren't triggered.

---

## 3. Architecture

### Plugin lifecycle

```
Device boot
  -> Plugin process starts
  -> index.js runs:
     1. AppRegistry.registerComponent('SuperTask', App)
     2. PluginManager.init()
     3. initGestureDetector()  -- registers motion listener (permanent)
     4. registerButton(100, 200, 300) -- toolbar/lasso buttons
     5. registerButtonListener + registerConfigButtonListener

User taps button or gesture fires:
  -> showPluginView() -- full-screen React Native UI appears
  -> App.tsx mounts, reads global.__superTaskDeepLink or global.__superTaskButtonId
  -> Navigates to appropriate screen (TaskHome, QuickAdd, TaskDetail, etc.)

User closes plugin:
  -> closePluginView() -- RN view dismissed
  -> Motion listener resumes receiving events (touch no longer intercepted by RN view)
  -> App stays mounted in background (global.__superTaskNavigate persists)
```

### Key architectural decisions

1. **Motion listener is permanent.** Registered once at startup, never removed. This is necessary for gesture detection to work when the plugin UI is closed. The trade-off is that every touch event on the canvas runs through our `onMsg` callback.

2. **No manual enable/disable toggle.** Session 31 discovered that the `setGestureEnabled(true/false)` mechanism was the root cause of gesture unreliability (multiple code paths forgot to re-enable). The fix: removed the toggle entirely. The SDK's RN view naturally intercepts touches when visible, so the motion listener receives no events while the UI is open.

3. **Pre-scan on every finger DOWN.** When a finger touches the canvas, `preScanLinks()` immediately calls `getCurrentFilePath()`, `getCurrentPageNum()`, and `getElements()` to check for supertask:// links at the touch point. This overlaps with the hold time so results are ready by finger UP. The downside: three SDK calls fire on every single finger touch, even normal taps and scrolls.

4. **Deep links via globals.** The gesture detector sets `global.__superTaskDeepLink` before calling `showPluginView()`. If the App is already mounted, `global.__superTaskNavigate` routes directly. If not, `getInitialScreen()` reads the global on mount.

### State machine overview

```
onMsg (every touch event)
  |
  +-- _configOff? -> discard
  +-- _actionInProgress? -> discard  <-- THIS IS THE DEATH POINT
  +-- toolType != FINGER? -> track pen-lasso-assist or cancel
  |
  +-- Multi-tap tracking active?
  |     +-- PTR_DOWN -> update maxPointers
  |     +-- UP/CANCEL -> onMultiTapEnd()
  |           +-- maxPointers >= 3?
  |                 +-- second tap within 800ms? -> THREE-FINGER DOUBLE TAP
  |                 +-- first tap -> record, wait for second
  |
  +-- Standard gesture path:
        +-- DOWN -> onFingerDown() -> start preScanLinks()
        +-- MOVE -> onFingerMove() -> track drift, enter lasso mode if held 400ms+
        +-- UP -> onFingerUp() -> evaluate:
        |     +-- lasso mode + valid bbox? -> LASSO-ADD
        |     +-- mixed input + pen events? -> PEN-LASSO-ASSIST
        |     +-- held 800ms+, no drift? -> LONG PRESS
        +-- PTR_DOWN -> cancel standard gesture, enter multi-tap tracking
        +-- CANCEL -> reset
```

### File structure (key files only)

```
plugins/SuperTask/
  index.js                     -- entry point, button registration, gesture init
  App.tsx                      -- root component, stack navigation, deep link routing
  src/
    utils/
      gestureDetector.js       -- motion listener, gesture state machine (675 lines)
      noteOpener.js            -- native intent navigation (openNote/openFolder/openDocument)
      closePlugin.js           -- close plugin view helper
      config.js                -- config persistence via RNFS (MyStyle/SuperTask/)
      debug.js                 -- log collection + HTTP export to dev server
      taskRegistry.js          -- local task<->note mapping (JSON in MyStyle/SuperTask/)
      ocr.js                   -- recognizeElements wrapper with EMR detection
    cache/
      taskCache.js             -- stale-while-revalidate cache with fetch dedup
    api/
      todoist.js               -- Todoist API v1 client
    screens/
      TaskHome.tsx             -- Today/Upcoming/Projects tabs
      TaskDetail.tsx           -- single task view with complete/delete/view-note
      TaskAdd.tsx              -- full task creation form
      QuickAdd.tsx             -- fast lasso-to-task flow
      Capture.tsx              -- lasso capture + OCR
      Config.tsx               -- settings (connections, preferences)
      ProjectView.tsx          -- tasks filtered by project
      Diagnostics.tsx          -- touch event viewer, SDK probes
  android/app/src/main/java/com/supertask/
    NoteOpenerModule.kt        -- native Android intent launcher (112 lines)
    NoteOpenerPackage.kt       -- RN package registration
```

---

## 4. Gesture Detection System

### Overview

The gesture detector (`gestureDetector.js`, 675 lines) handles all touch-based shortcuts via a single `registerMotionListener(1, {onMsg})` callback. It detects three gesture types from the same event stream:

### Gesture 1: Three-finger double tap

**Purpose:** Open TaskHome with the user's default tab.

**Detection:**
1. Finger DOWN fires, then PTR_DOWN (additional pointer) is detected
2. Standard gesture is cancelled, enters multi-tap tracking
3. PTR_DOWN events increment `maxPointers`
4. On final UP (all fingers released), if `maxPointers >= 3`:
   - First tap: record timestamp, wait for second
   - Second tap within 800ms: FIRE
5. `handleThreeFingerDoubleTap()`: load config, prefetch task data (fire-and-forget), set deep link, open plugin view

**On-device confirmed:** 258ms, 496ms, 515ms between taps in logs. Reliable on A5X.

### Gesture 2: Long press on supertask link

**Purpose:** Open TaskDetail for a specific task by pressing on its link element.

**Detection:**
1. Finger DOWN at (x,y) starts `preScanLinks()` (overlaps with hold time)
2. Pre-scan calls `getCurrentFilePath()`, `getCurrentPageNum()`, `getElements(page, path)`
3. Filters for type 600 elements with `destPath.startsWith('supertask://task/')`
4. Hit-tests touch point against link bounds (30px padding)
5. On finger UP: if held >= 800ms, no drift, no mixed input -> LONG PRESS
6. `handleLongPress()`: awaits pre-scan result, sets deep link with taskId, opens plugin view

**Key risk:** Pre-scan makes 3 SDK calls on every finger DOWN, even for normal touches.

### Gesture 3: Hold-then-drag lasso-add

**Purpose:** Select handwriting with a finger-drawn rectangle and open QuickAdd.

**Detection:**
1. Finger DOWN, then hold >= 400ms
2. Movement starts AFTER the hold threshold (drift > 20px after 400ms)
3. Enters lasso mode, tracks bounding box from all MOVE events
4. On finger UP: if bbox >= 50x50px, calls `lassoElements(rect)` to programmatically select
5. If selection succeeds, opens QuickAdd

**Gate:** If pre-scan found a supertask link at the DOWN point, lasso mode is blocked (content already captured).

### Gesture 4: Pen-lasso-assist

**Purpose:** Intercept native pen lasso (hold finger + draw with pen) and open QuickAdd.

**Detection:**
1. Finger is held, pen events arrive (tracked as `_penAssistEvents`)
2. On finger UP: calls `getLassoRect()` to check if native lasso is active
3. If active (has rect), opens QuickAdd. If error 904 (no lasso), user was just writing -- ignored.

**Config:** Controlled by `lassoGestureInput` setting ('off', 'finger', 'pen-lasso').

### Guard layers (preventing false activations)

| Layer | Guard | Purpose |
|-------|-------|---------|
| 0 | `_configOff` | User disabled gestures in settings |
| 1 | `_actionInProgress` | Async handler running (re-entry prevention) |
| 2 | `toolType !== 1` | Ignore non-finger events (pen, unknown) |
| 3 | Mixed input detection | Pen during finger hold cancels gesture |
| 4 | Mixed cooldown (500ms) | Suppress DOWN after mixed-input cancel |
| 5 | Drift threshold (20px) | Small jitter during hold is not movement |
| 6 | Hold duration (400ms) | Early movement = normal touch, not gesture |
| 7 | Min bbox (50x50px) | Tiny accidental drags are not lasso-add |
| 8 | Long press duration (800ms) | Must hold long enough for intentional press |
| 9 | Hit test (30px padding) | Touch must be near a link's bounds |
| 10 | `scanGeneration` counter | Stale pre-scans from previous DOWN events bail out |

### Native gesture conflicts (confirmed safe)

| Native gesture | Conflict? | Why |
|----------------|-----------|-----|
| Page turn (bezel swipe) | No | Bezel and canvas are separate input surfaces |
| System menu (top swipe) | No | System intercepts before motion listener |
| Native lasso (2-finger+pen) | Partial | Both system and listener receive events; mixed-input detection handles it |
| Scroll/swipe | No | Movement before 400ms is ignored (drift threshold) |
| Palm rejection | No | Firmware filters palm before events reach listener |
| Sidebar taps | No | Sidebar is outside canvas coordinate space |

---

## 5. The Gesture Death Bug (B-019)

### The mechanism

```
1. Finger touches canvas
2. onFingerDown() calls preScanLinks()
3. preScanLinks() awaits getCurrentFilePath() + getCurrentPageNum()
4. SDK calls HANG (plugin view showing, system dialog, or unknown reason)
5. preScanLinks() never resolves
6. User holds finger >= 800ms, lifts -> handleLongPress() fires
7. handleLongPress() sets _actionInProgress = true
8. handleLongPress() awaits _linkScanPromise (the hung pre-scan)
9. Promise never resolves -> handleLongPress() never reaches finally{}
10. _actionInProgress stays true FOREVER
11. onMsg() checks "if (_actionInProgress) return;" on every event
12. ALL future touch events are silently dropped
13. Gestures are permanently dead for the rest of the session
```

### On-device evidence (July 7, 2026 log)

```
[9:10:55 PM] #75 DOWN FINGER (259,109) p=1.00 ptrs=1
[9:10:57 PM] DOWN at (259,109) tool=FINGER
             -- NOTE: No "Pre-scan: page..." log appears (SDK calls hung)
[9:10:58 PM] #76 UP FINGER (259,109) p=1.00 ptrs=1
[9:10:58 PM] UP at (259,109) after 1461ms drift=false mixed=false
[9:10:58 PM] LONG PRESS DETECTED at (259,109) held 1461ms
             -- handleLongPress sets _actionInProgress = true
             -- awaits the hung scanPromise... forever

-- From this point forward, ZERO gesture events for 17+ minutes
-- All subsequent opens are via toolbar BUTTON:

[9:11:18 PM] App: BUTTON pressed raw=100 id=100 (listener)
[9:19:21 PM] App: BUTTON pressed raw=100 id=100 (listener)
[9:19:35 PM] App: BUTTON pressed raw=100 id=100 (listener)
[9:20:54 PM] App: BUTTON pressed raw=100 id=100 (listener)
[9:28:16 PM] App: BUTTON pressed raw=100 id=100 (listener)
```

### The session 33 fix (SUPERSEDED -- see update below)

> **UPDATE (2026-07-23, session 34): the `withTimeout` approach below is flawed and was never viable on its own.** Section 8 of this very doc records that JS timers are suspended while the plugin view is closed -- and gestures only run while the view is closed. So in the exact scenario where an SDK call hangs mid-gesture, the `setTimeout` inside `withTimeout` is also suspended and may never fire. The safety net was made of the same suspended machinery it was protecting against.
>
> **Session 34 replacement: event-driven watchdog.** The one stream guaranteed to keep flowing while the view is closed is the motion event stream itself. `onMsg` now checks: if `_actionInProgress` has been held longer than `WATCHDOG_MS` (8s), the next motion event force-clears it. An action token (`_actionId` via `beginAction()`/`endAction(id)`) ensures a hung handler's late `finally{}` cannot clobber a newer action's guard. Worst case is one dropped gesture, never a dead session. `withTimeout` is retained as a first line of defense for when timers do run.
>
> Session 34 also fixed two related issues: a native element leak when `getElements` timed out (late-resolving results were never `recycle()`d -- B-020), and the pre-scan architecture itself (B-021, see below). Still awaiting on-device confirmation.

`withTimeout(promise, 5000)` wrapper that races any promise against a 5-second timeout:

```javascript
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}
```

Applied at 7 call sites:
1. `preScanLinks`: `getCurrentFilePath()` + `getCurrentPageNum()` (Promise.all)
2. `preScanLinks`: `getElements()`
3. `handleLongPress`: `scanPromise` await
4. `handleLassoAdd`: `scanPromise` await
5. `handleLassoAdd`: `lassoElements()`
6. `handlePenLassoAssist`: `getLassoRect()`

All async handlers have `finally { _actionInProgress = false; }` blocks. The timeout ensures they always resolve, so `_actionInProgress` always gets reset.

### What this does NOT address

1. **Why do SDK calls hang?** The timeout/watchdog is a safety net, not a root cause fix. SDK calls may hang when:
   - The plugin view is showing (touch interception changes SDK state?)
   - A system dialog is active (wifi settings, etc.)
   - Unknown firmware-level conditions

2. ~~**Is the motion listener itself causing device issues?**~~ **Addressed in session 34 (B-021).** `onMsg` is now SDK-free: pure JS coordinate/timing tracking, zero bridge calls on normal touches. The link scan (`scanLinksAt`) runs only after a gesture is classified on finger UP.

3. ~~**Do the pre-scan SDK calls interfere with native touch processing?**~~ **Addressed by the same refactor.** `getElements()` no longer runs on every touch -- only on actual long-press/lasso-add gestures, a handful of times per session.

Session 34 also changed the lasso-add default to 'off' (`lassoGestureInput` in config): hold-400ms-then-drag is indistinguishable from a paused scroll, making it a false-positive machine during normal note-taking. 'off' now disables only the quick-add gesture; long press and three-finger double tap stay active (matching the Settings UI hint, which the old `_configOff` behavior contradicted).

---

## 6. Native Intent Navigation

### Discovery source
[AgP42/supernote-dashboard](https://github.com/AgP42/supernote-dashboard) (MIT license). A community plugin that implements intent-based navigation, floating overlays, and native file I/O.

### Opening a .note file at a specific page

```kotlin
val intent = Intent()
intent.component = ComponentName(
    "com.ratta.supernote.note",
    "com.ratta.supernote.note.view.NoteInsidePagesActivity"
)
intent.putExtra("file_path", path)     // full path string
if (page > 0) intent.putExtra("page", page)  // 1-based int
intent.action = Intent.ACTION_VIEW
intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
reactApplicationContext.startActivity(intent)
```

**Critical details:**
- Activity is `NoteInsidePagesActivity` (in `.view` subpackage), NOT `NoteMainActivity` (the launcher/shell)
- Path extra key is `file_path`, NOT `only_open_file` (that's for the file manager)
- Page is **1-based** (SDK APIs return 0-based; convert: `intent_page = api_page + 1`)
- No URI, no FileProvider, no extra flags beyond `NEW_TASK`
- Must use `reactApplicationContext.startActivity()`, NOT `HostContext.getInstance()` (SDK interception layer modifies/intercepts intents)

### Why SuperTask's earlier attempt failed (session 15)

| Factor | Failed approach | Working approach |
|--------|----------------|-----------------|
| Activity class | `NoteMainActivity` | `NoteInsidePagesActivity` |
| Path extra key | `only_open_file` | `file_path` |
| Context | `HostContext.getInstance()` | `reactApplicationContext` |
| URI handling | `Uri.fromFile()` + FileProvider | No URI at all (plain string extra) |
| Flags | `CLEAR_TOP`, `SINGLE_TOP` | Only `NEW_TASK` |

### Other intent targets

**Open a folder in file manager:**
```kotlin
ComponentName("com.ratta.supernote.inbox",
              "com.ratta.supernote.explorer.FileManagerMainActivity")
// extras: "folder_path" (String), "source_type" = 2
```

**Open a PDF:**
```kotlin
ComponentName("com.supernote.document",
              "com.supernote.document.MainActivity")
// extras: "file_path" (String), "page" (int, may be ignored by viewer)
```

### Plugin view lifecycle with intents

After launching an intent, the plugin's fullscreen view covers the target activity. Pattern:

```javascript
await NoteOpener.openNote(path, page);
setTimeout(() => PluginManager.closePluginView(), 150);
```

Wait ~150ms for the target activity to start, then close the plugin overlay so the note is visible.

### Native writeFile (potential RNFS replacement)

The dashboard plugin also implements a trivial `writeFile` via `java.io.FileWriter` (5 lines). SuperTask currently uses `react-native-fs` (~2MB) for the same capability. Adding `writeFile` to `NoteOpenerModule.kt` could eliminate the RNFS dependency. Tracked as F-018.

### Discoverable activities

`PackageManager.getInstalledPackages(GET_ACTIVITIES)` returns 237 total activities under `com.ratta*`, 58 exported. This is a rich surface for future features.

---

## 7. Supernote SDK API Reference

### Common response format

All async SDK methods return `APIResponse<T>`:
```
{
  success: boolean,
  result: T | null,       // present when success=true
  error: {
    code: number,
    message: string
  } | null                // present when success=false
}
```

### Known error codes

| Code | Meaning | Context |
|------|---------|---------|
| 102 | No note context | PluginFileAPI write calls from config/settings screen |
| 117 | Region mismatch | `recognizeElements` with wrong page size for EMR range |
| 203 | Layer violation | Text/link/title elements not on layer 0 |
| 502 | Element integrity | `replaceElements` when removing strokes still referenced by links' `controlTrailNums` |
| 802 | Invalid template | `createNote` with `template: 'none'` or non-existent template |
| 904 | No lasso context | `deleteLassoElements` / `getLassoRect` outside active lasso |

### PluginManager

| Method | Returns | Notes |
|--------|---------|-------|
| `init()` | `Promise<void>` | Must be called at startup. Idempotent. |
| `registerMotionListener(1, {onMsg})` | Subscription | `onMsg(msg)` receives MotionEvent. Events only fire when plugin UI is dismissed. |
| `registerButton(type, appTypes, button)` | `Promise<boolean>` | type: 1=sidebar, 2=lasso, 3=selection. appTypes: ['NOTE'], ['DOC'] |
| `registerButtonListener({onButtonPress})` | Subscription | `event.id` = button ID (100/200/300) |
| `registerConfigButtonListener({onClick})` | Subscription | Config gear button press |
| `showPluginView()` | `Promise<boolean>` | Shows the full-screen RN view. ~2s latency on cold start. |
| `closePluginView()` | `Promise<boolean>` | Dismisses the RN view. Motion listener resumes. |
| `getPluginDirPath()` | `Promise<string>` | Plugin's local storage directory |
| `getDeviceType()` | `Promise<number>` | 0=A5, 1=A6, 2=A6X, 3=A5X, 4=Nomad, 5=Manta |

**MotionEvent fields:**
- `action`: raw Android MotionEvent (decode: `action & 0xff` for base, `(action >> 8) & 0xff` for pointer index)
- `toolType`: 1=FINGER, 2=PEN
- `x`, `y`: pixel coordinates (canvas-relative)
- `pressure`: pen 0-3274, finger always 1.00
- `pointerCount`: simultaneous touch points

**Action codes:** 0=DOWN, 1=UP, 2=MOVE, 3=CANCEL, 5=PTR_DOWN, 6=PTR_UP

### PluginCommAPI (communication / current state)

| Method | Returns | Notes |
|--------|---------|-------|
| `getCurrentFilePath()` | `APIResponse<string>` | Current note file path. **Can hang when plugin view is showing.** |
| `getCurrentPageNum()` | `APIResponse<number>` | Current page (0-based). **Can hang when plugin view is showing.** |
| `getLassoElements()` | `APIResponse<Element[]>` | Elements in current lasso selection. Different UUIDs than `getElements()` -- match by `numInPage`. |
| `getLassoRect()` | `APIResponse<{left,top,right,bottom}>` | Active lasso box rectangle. Error 904 if no lasso. |
| `getLassoElementTypeCounts()` | `APIResponse<LassoElementTypeNum>` | Counts per element type in lasso selection. |
| `deleteLassoElements()` | `APIResponse<boolean>` | Delete lasso selection. Error 904 outside lasso context. |
| `lassoElements(rect)` | `APIResponse<boolean>` | Programmatically select elements in a rect. `{success:true, result:false}` = nothing selected. |
| `setLassoBoxState(state)` | `APIResponse<boolean>` | 0=show, 1=hide, 2=remove completely |
| `updateLassoRect(rect)` | `APIResponse<boolean>` | Move/resize the lasso box |
| `recognizeElements(elements)` | `APIResponse<string>` | OCR. Requires correct page size or returns error 117. |
| `reloadFile()` | `APIResponse<boolean>` | Refresh display after `replaceElements()`. |
| `getNoteSystemTemplates()` | `Template[]` | Built-in templates. Use `Template.name` for `createNote`/`insertNotePage`. |
| `setSystemDormancyState(enable)` | void | true=prevent sleep. Synchronous. |
| `setSlideBarStatus(status)` | `Promise<boolean>` | true=slidable |
| `setStatusBarAndSlideBarState(isLock)` | void | true=locked. Synchronous. |

### PluginNoteAPI (current note, in-memory state)

| Method | Returns | Notes |
|--------|---------|-------|
| `insertText(textBox)` | `APIResponse` | Insert text on current page. Key params: `textContentFull`, `textRect: {left,top,right,bottom}`, `fontSize`, `textFrameStyle` (0=no border, 3=stroke), `textEditable` (0=editable, 1=not). |
| `insertTextLink(textLink)` | `APIResponse` | Atomic text+link. Params: `destPath`, `style`, `linkType`, `rect`, `fontSize`, `fullText`, `showText`, `isItalic` (0/1). |
| `saveCurrentNote()` | `APIResponse<boolean>` | **Must call before `replaceElements()`** on the current file. |
| `setLassoStrokeLink(params)` | `APIResponse<number>` | Set lasso strokes as link. `destPath`, `style` (0=underline, 1=solid border, 2=dashed border), `linkType` (0=page, 1=file, 4=URL). Works on strokes, geometries, AND TextBox elements. |
| `setLassoTitle(params)` | `APIResponse<boolean>` | `style`: 0=remove, 1=black, 2=light gray, 3=dark gray, 4=shadow. |
| `insertImage(pngPath)` | `APIResponse` | Insert PNG on current page. |
| `getLassoLinks()` | `APIResponse<LassoLink[]>` | Links from current lasso selection. |
| `getLassoText()` | `APIResponse<TextBox[]>` | Text boxes from lasso selection. |
| `modifyLassoLink(params)` | `APIResponse` | Modify existing lasso link. |
| `modifyLassoText(textBox)` | `APIResponse<boolean>` | Modify lasso text box. |
| `getLastElement()` | `APIResponse<Element>` | Most recently added element on current page. |

### PluginFileAPI (file-level operations)

| Method | Returns | Notes |
|--------|---------|-------|
| `getElements(page, notePath)` | `APIResponse<Element[]>` | All elements on a page. Elements have `recycle()` method -- call when done. |
| `replaceElements(notePath, page, elements)` | `APIResponse<boolean>` | Replace ALL elements on page. **Must `saveCurrentNote()` first. Must `reloadFile()` after.** Error 502 if removing strokes referenced by links' `controlTrailNums`. |
| `insertElements(notePath, page, elements)` | `APIResponse` | Add elements (non-destructive). |
| `modifyElements(notePath, page, elements)` | `APIResponse<number[]>` | Modify existing elements. Returns indices of successes. |
| `createNote(params)` | `APIResponse` | `notePath`, `template` (from `getNoteSystemTemplates().name`), `mode` (0=normal), `isPortrait`. Error 802 with invalid template. Error 102 without note context. |
| `insertNotePage(params)` | `APIResponse` | Insert page. `notePath`, `page` (index), `template`. |
| `removeNotePage(notePath, page)` | `APIResponse` | Remove a page. |
| `getNoteTotalPageNum(notePath)` | `APIResponse<number>` | Total page count. |
| `getPageSize(notePath, page)` | `APIResponse<{width,height}>` | Page dimensions in pixels. |
| `getFileMachineType(notePath)` | `APIResponse<number>` | Device type that created the file. |
| `getNotePageTemplate(notePath, page)` | `APIResponse<{name,md5}>` | Template info for a page. |
| `getTitles(notePath, pageList)` | `APIResponse<Title[]>` | Title data across pages. |
| `getKeyWords(notePath, pageList)` | `APIResponse<KeyWord[]>` | Keywords from pages. |
| `getLayers(notePath, page)` | `APIResponse<Layer[]>` | Layer data. layerId 0-3. |
| `generateNotePng(params)` | `APIResponse` | Render page to PNG. `times`: 1 or 2 (scale). `type`: 0=transparent, 1=white bg. |
| `getElement(notePath, page, num)` | `APIResponse<Element>` | Single element by numInPage. |
| `getElementCounts(notePath, page)` | `APIResponse<number>` | Count of elements. |
| `getElementNumList(notePath, page)` | `APIResponse<number[]>` | numInPage values for all elements. |
| `searchFiveStars(filePath)` | `APIResponse<number[]>` | Pages with five-star marks. |

### PluginDocAPI (document/PDF operations)

| Method | Returns | Notes |
|--------|---------|-------|
| `getSelectedText()` | `APIResponse<string>` | Currently selected text in a document. |
| `getCurrentDocText(page)` | `APIResponse<string>` | Full text of a document page. |
| `getCurrentTotalPages()` | `APIResponse<number>` | Total pages in current document. |

### FileUtils (NativeFileUtils TurboModule)

| Method | Returns | Notes |
|--------|---------|-------|
| `exists(filePath)` | `Promise<boolean>` | Check file existence. |
| `makeDir(dirPath)` | `Promise<boolean>` | Create directory. |
| `copyFile(src, dest)` | `Promise<boolean>` | Copy file. |
| `deleteFile(filePath)` | `Promise<boolean>` | Delete file. |
| `deleteDir(dirPath)` | `Promise<boolean>` | Delete directory. |
| `listFiles(dirPath)` | `Promise<string[]>` | List files in directory. |
| `renameToFile(src, dest)` | `Promise<boolean>` | Rename file. |
| `getFileMD5(filePath)` | `Promise<string>` | File hash. |
| `getExportPath()` | `Promise<string>` | Export directory. |
| `getStorageAvailableSpace()` | `Promise<number>` | Available storage. |
| `openFilePath(path)` | `Promise<boolean>` | Opens file manager (NOT the editor). |
| **`writeFile()`** | **DOES NOT EXIST** | Not in the TurboModule interface. Use RNFS or native module. |

### Element types

| Constant | Value | Description |
|----------|-------|-------------|
| `TYPE_STROKE` | 0 | Handwritten strokes |
| `TYPE_TITLE` | 100 | Title elements |
| `TYPE_TEXT` | 500 | Plain text box |
| `TYPE_TEXT_DIGEST_QUOTE` | 501 | Quote digest text |
| `TYPE_TEXT_DIGEST_CREATE` | 502 | Created digest text |
| `TYPE_LINK` | 600 | Link elements |
| `TYPE_GEO` | 700 | Geometry elements |
| `TYPE_FIVE_STAR` | 800 | Five-pointed star |

### Element data model (key fields)

```
Element {
  uuid: string          -- unique ID (different between getLassoElements and getElements!)
  type: number          -- element type constant
  numInPage: number     -- stable index within page (use for matching across APIs)
  pageNum: number       -- page (0-based)
  layerNum: number      -- layer (0-3; text/link/title MUST be layer 0)
  maxX, maxY: number    -- max coordinate values
  link: Link | null     -- for TYPE_LINK
  textBox: TextBox | null -- for TYPE_TEXT/501/502
  stroke: Stroke | null -- for TYPE_STROKE
  title: Title | null   -- for TYPE_TITLE
  geometry: Geometry | null -- for TYPE_GEO
  recycle(): Promise<void> -- release native cached data
}

Link {
  category: number      -- 0=text link, 1=stroke link
  X, Y, width, height   -- link bounds (pixels)
  style: number         -- 0=solid underline, 1=solid border, 2=dashed border
  linkType: number      -- 0=note page, 1=note file, 2=doc, 3=image, 4=URL, 5=other, 6=digest
  destPath: string      -- target (URL, file path, or custom scheme like supertask://task/ID)
  destPage: number      -- target page (for linkType 0)
  controlTrailNums: number[] -- numInPage values of strokes this link references
  fullText, showText    -- text content
  italic: number        -- 0=no, 1=yes
}
```

### Enums reference

**Link style:** 0=solid underline, 1=solid border, 2=dashed border
**Link type:** 0=note page, 1=note file, 2=document, 3=image, 4=URL/website, 5=other, 6=digest
**Title style:** 0=remove, 1=black bg, 2=light gray, 3=dark gray, 4=shadow
**Pen type:** 1=pressure pen, 10=fineliner, 11=marker
**Pen color:** 0x00=black, 0x9D=dark gray, 0xC9=light gray, 0xFE=white
**Device type:** 0=A5, 1=A6, 2=A6X, 3=A5X, 4=Nomad, 5=Manta
**Lasso box state:** 0=show, 1=hide, 2=remove
**Text align:** 0=left, 1=center, 2=right
**Text frame style:** 0=no border, 3=stroke border
**Text editable:** 0=editable, 1=not editable

---

## 8. On-Device Learnings

These are behaviors confirmed through on-device testing that are not documented in the official SDK docs. Each one was learned the hard way.

### SDK behavior

- **`setTimeout` does NOT fire when the plugin view is closed.** JS timers are suspended. Long press must be detected on the UP event by checking hold duration, not via a timer.
- **`event_pen_up` payload elements can't be read directly.** Must call `getLastElement()` to get the actual element data.
- **Lasso context is ephemeral.** Expires after navigation (e.g., going from Capture to TaskAdd screen). `deleteLassoElements()` returns error 904 outside lasso context.
- **`getLassoElements()` and `getElements()` return different UUIDs** for the same elements. Match by `numInPage` instead.
- **Link elements have `controlTrailNums`** containing `numInPage` values of referenced strokes. Must remove associated links when removing strokes, or `replaceElements` fails with error 502.
- **`saveCurrentNote()` is mandatory before `replaceElements()`** on the currently open file to avoid stale state.
- **`reloadFile()` is needed after `replaceElements()`** to sync the display.
- **`PluginFileAPI` write APIs require note context.** `createNote`, `insertElements`, etc. return error 102 when called from the config screen (no active note).
- **`createNote` requires a real template.** `template: 'none'` returns error 802. Must use a name from `getNoteSystemTemplates()`.
- **`insertTextLink` is atomic** -- deleting the link deletes the text too. The hybrid pattern (`insertText` + `lassoElements` + `setLassoStrokeLink`) gives editable text with a dashed border where breaking the link leaves text intact.

### Coordinates and devices

- **Stroke points are in EMR coordinates** (digitizer space, axes rotated vs screen). Not the same as pixel coordinates from `getPageSize()`.
- **A5X (deviceType=3)** reports pageSize 1404x1872 but stroke EMR values reach maxX=20967, maxY=15725 (A5X2/Manta digitizer range). Passing reported pageSize to `recognizeElements` causes error 117 for strokes below ~y=1400px.
- **EMR range detection:** check element `maxX`/`maxY` against normal A5X range (15819/11864). If exceeded, pass A5X2 page size (1920x2560) to `recognizeElements`. Native "Convert to Text" works on the same content (doesn't use the plugin API size param).
- **Page numbering:** SDK APIs return 0-based pages. Intent `page` extra is 1-based. Convert: `intent_page = api_page + 1`.

### Motion listener behavior

- **Events only fire when plugin UI is dismissed.** The full-screen RN view intercepts all touches.
- **Finger pressure is always 1.00** (binary, no analog on capacitive touch). Pen pressure ranges 0-3274.
- **Palm rejection is handled by firmware.** Zero spurious finger events during pen writing with palm resting.
- **Canvas and bezel are separate input surfaces.** System gestures (refresh from bottom, menu from top) originate from bezel and never enter canvas coordinate space. The motion listener only sees canvas touches.
- **Bezel-to-canvas swipes ARE detected.** DOWN appears at extreme canvas edge (x < ~15 or y > ~1860) as finger enters drawing surface.
- **No hover events.** EMR hover (action 9/10) is not exposed through `registerMotionListener`.
- **Up to 3 simultaneous fingers confirmed** on dev device (A5X). External user's device reported up to 5.
- **Multi-pointer encoding:** `action = 261` means PTR_DOWN for pointer index 1 (5 + 256). `action = 517` = PTR_DOWN for pointer index 2.

### File I/O

- **`FileUtils.writeFile()` does not exist** in the TurboModule interface.
- **`fetch('file:///...')` works for reading** but returns HTTP status 0 (not 200). Must ignore `response.ok` and call `response.json()` / `response.text()` directly.
- **RNFS (`react-native-fs`) works** for read/write but adds ~2MB to build and requires native module compilation.
- **`@react-native-async-storage/async-storage`** is used by Ratta's official sticker demo for config persistence. Another native module option.

### Performance

- **Inherent 1-2 second delay after `deleteElements()`** due to SDK refresh. Unavoidable.
- **`showPluginView()` has ~2s cold start latency** (SDK overhead, not our code).
- **React mount adds ~2s** on cold start. Warm opens (App already mounted) skip this.
- **Task cache + prefetch pattern:** fire `fetchTaskData()` in gesture handler BEFORE `showPluginView()`. API calls run during React mount. Warm opens show cached data instantly; background refresh updates if stale.

### Debugging

- **No dev console on Supernote.** ADB is locked down (`shell`, `logcat`, `push`, `pull` all return "error: not support command").
- **Primary debug method:** HTTP POST to local dev server (`node dev-server.js`). Plugin sends logs via `fetch()` to a configurable URL. Real-time terminal output + saved to `logs/` directory.
- **`fetch()` works for HTTP/HTTPS** from the device (confirmed with Todoist API and dev log server).
- **Log at every boundary:** config load, API request/response, SDK calls, screen transitions, gesture events.

### External API

- **Todoist API v1** (not v2). Base URL: `https://api.todoist.com/api/v1`. The REST v2 endpoint (`/rest/v2`) returns 410 Gone.
- **Response format is paginated:** `{results: [...], next_cursor: "..."}`, NOT a bare array.

---

## 9. Open Issues

### Bugs

| ID | Title | Impact |
|----|-------|--------|
| B-019 | Gesture death from hung SDK calls | **Critical.** Session 34: event-driven watchdog + action token (withTimeout alone was flawed -- timers suspended while view closed). Awaiting on-device test. |
| B-020 | Native element leak on `getElements` timeout | Session 34: late-resolving results now recycled. Awaiting on-device test. |
| B-021 | Pre-scan on every finger DOWN (device interference suspect) | Session 34: `onMsg` now SDK-free; link scan runs post-classification only. Awaiting on-device test. |
| B-015 | `getElements` fails on every pre-scan for external user | Long-press-to-view completely broken for at least one user. Unknown root cause. Post-B-021, the per-touch call spam is gone; whether the rare post-classification scan works on their device is untested. |
| B-014 | Hardcoded A5X page size may break Nomad | OCR and gesture detection use A5X dimensions as defaults. Nomad (deviceType=4) has unknown dimensions. |
| B-005 | Renaming a note breaks task back-references | Registry and Todoist description store bare filename. Rename = broken links. |
| B-004 | Project filter not honored in Today/Upcoming | `enabledProjectIds` works in Projects tab but not other tabs. |

### Features (relevant to stability)

| ID | Title | Relevance |
|----|-------|-----------|
| F-021 | Bezel swipe reintroduction | Optional gesture alongside three-finger double tap. Feasible now that `_enabled` bug is fixed. |
| F-018 | Native writeFile (RNFS replacement) | Could reduce build size ~2MB and simplify native module surface. |
| F-010 | Background processing with showPluginView | Dismiss UI during API calls, reopen with results. New in sn-plugin-lib 0.1.43. |

### Tasks

| ID | Title | Relevance |
|----|-------|-----------|
| T-002 | Audit undocumented SDK native modules | RTNFileModule.java, NativePluginAPI, NativePluginManager may have hidden capabilities. |
| T-004 | SDK call optimization pass | Reduce bridge calls in remaining hot paths. |

---

## 10. Recommended Investigation Path

> **UPDATE (2026-07-23, session 34):** Phases 1-3 below are largely overtaken by the session 34 changes. The current investigation path is the on-device test list in `PROGRESS.md` (Session 34): watchdog recovery, long-press latency, lasso-add gate, and device feel during extended normal writing. Phase 2's Hypotheses A and B are answered by construction (`onMsg` is now SDK-free and near-zero-work); Hypothesis C only applies to the rare post-classification scan. Phase 4 (external user) still stands.

### Phase 1: Confirm the B-019 fix works (SUPERSEDED -- do not use the July 12 build)

1. Start dev server: `cd plugins/SuperTask && node dev-server.js`
2. Verify dev server IP matches `config.local.js` (`192.168.68.58`)
3. Build fresh (`bash buildPlugin.sh`) -- the July 12 build has the flawed timer-only fix
4. Install on device
5. Test scenario: open debug screen, touch canvas while plugin view is showing, close, verify gestures still work; if a handler hangs, verify recovery after ~8s + one touch
6. Check dev server logs for `WATCHDOG: _actionInProgress stuck` (recovery) and `Link scan:` messages (post-classification scanning)

### Phase 2: Investigate motion listener impact on device (ADDRESSED BY CONSTRUCTION in session 34)

The deeper question: is the permanent motion listener + pre-scan-on-every-DOWN causing device-level issues?

**Hypothesis A: Pre-scan SDK calls congest the native bridge.** RESOLVED: pre-scan removed (B-021). Normal touches cost zero SDK calls.

**Hypothesis B: The motion listener callback itself adds latency.** MITIGATED: `onMsg` is now pure JS tracking (a few comparisons and assignments per event). If interference persists with the session 34 build, this hypothesis is back on the table -- test by making `onMsg` a full no-op.

**Hypothesis C: Specific SDK call combinations cause native-side issues.** NARROWED: `getElements()` now runs only after a classified gesture (a handful of times per session), never during active writing mid-stroke. If problems remain, they're confined to these moments.

### Phase 3: Consider architectural alternatives

If the permanent listener + pre-scan is the root cause, alternatives:

1. **Lazy pre-scan.** Only call `preScanLinks()` after the hold threshold (400ms) instead of on every DOWN. Adds ~200ms latency to long-press detection but eliminates SDK calls during normal touches.

2. **Cached page context.** Cache `currentFilePath` and `currentPageNum` (they rarely change -- only on page turn or note switch). Only call the SDK for `getElements()` on demand.

3. **Listener-on-demand.** Instead of a permanent listener, register/unregister the motion listener when the user enters/exits a gesture-enabled mode. Downside: no gestures work without explicit activation.

4. **Lighter listener callback.** Move all SDK calls out of the `onMsg` path. Only track coordinates and timing in the callback; do SDK work in a separate async flow triggered by the UP event after gesture classification.

### Phase 4: Test with external user

B-015 (getElements failing for external user) may be related. Their device reports up to 5 simultaneous pointers (vs 3 on dev device), suggesting a different touch panel. If their firmware handles the motion listener differently, it could explain both their getElements failures and broader device stability issues.

---

## 11. File Map

### Source code
| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | 79 | Entry point, button/gesture registration |
| `App.tsx` | 384 | Root component, navigation, deep link routing |
| `src/utils/gestureDetector.js` | 675 | Motion listener, gesture state machine |
| `src/utils/noteOpener.js` | 78 | Native intent navigation |
| `src/utils/closePlugin.js` | 13 | Close plugin view |
| `src/utils/config.js` | 303 | Config persistence (RNFS + obfuscation) |
| `src/utils/debug.js` | 105 | Log collection + HTTP export |
| `src/cache/taskCache.js` | 88 | Stale-while-revalidate cache |
| `android/.../NoteOpenerModule.kt` | 112 | Android intent launcher |

### Design docs
| File | Topic |
|------|-------|
| `docs/design-native-intents.md` | Intent navigation discovery + implementation plan |
| `docs/design-gesture-guards.md` | Guard map preventing false activations |
| `docs/design-gesture-audit.md` | Bezel swipe audit (led to three-finger double tap) |
| `docs/design-architecture.md` | Build pipeline, native modules, coordinate systems |
| `docs/design-sdk-optimization.md` | Bridge call reduction patterns |
| `docs/design-capture-workflow.md` | Lasso-to-task flow |
| `docs/design-task-linking.md` | Bidirectional linking, dashboard note concept |
| `docs/design-settings.md` | Config persistence, settings UI |
| `docs/design-offline-mode.md` | Offline queue (placeholder) |
| `docs/ratta-feedback.md` | SDK gaps and suggestions for Ratta |

### Research
| File | Topic |
|------|-------|
| `docs/gesture-research.md` | Motion listener testing results (the foundation) |
| `docs/scope-superhub.md` | SuperHub file manager plugin concept |
| `official-docs-extracted.md` | Full Ratta SDK documentation extraction |

### SDK source (reference, not our code)
| File | What to find |
|------|-------------|
| `src/sdk/PluginNoteAPI.ts` | insertText, setLassoStrokeLink, saveCurrentNote params |
| `src/sdk/PluginFileAPI.ts` | getElements, replaceElements, createNote params |
| `src/sdk/PluginCommAPI.ts` | getCurrentFilePath, recognizeElements, lassoElements |
| `src/sdk/utils/VerifyUtils.ts` | Parameter validation schemas for all element types |
| `src/model/Element.ts` | Element type constants, data models, ElementDataAccessor |
