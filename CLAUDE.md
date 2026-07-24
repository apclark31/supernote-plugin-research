# Supernote Plugin Research & Development

## What this repo is

A monorepo for Supernote plugin SDK research and plugin development. Contains:
- **SDK source** (`src/`, `lib/`, `android/`) -- extracted sn-plugin-lib internals for reference
- **Official docs** (`official-docs-extracted.md`) -- full extraction of Ratta's plugin documentation
- **Design docs** (`docs/`) -- architecture analysis and plugin design documents
- **Plugins** (`plugins/`) -- each plugin is a standalone React Native project

### Per-plugin documentation structure
Each plugin under `plugins/<Name>/` follows this doc architecture:
- **`PROGRESS.md`** -- session handoff state (what happened, what's next, current build)
- **`docs/tracker.md`** -- active features and bugs with unique IDs (F-001, B-001)
- **`docs/changelog.md`** -- archive of completed/resolved items (moved from tracker)
- **`docs/design-*.md`** -- deep dives on specific features or subsystems

When a tracked item is completed, move it from `tracker.md` to `changelog.md` with the date and outcome. Design docs cross-reference each other and the tracker via their headers.

## Plugin development practices

### Creating a new plugin
- Always scaffold from `template/`, never copy another plugin. Each plugin is its own standalone RN project with its own dependencies.
- Rename all `HelloWorld`/`helloworld` references to the new plugin name in: app.json, package.json, android package dirs + kotlin files, ios dirs + swift/xcodeproj, build.gradle namespace.
- Each plugin gets its own directory under `plugins/` with its own `PROGRESS.md` for session continuity.

### Plugin architecture
- **React Native 0.79.2 + React 19.0.0** -- locked versions, do not upgrade
- **sn-plugin-lib ^0.1.19** -- Supernote SDK bridge, the only way to talk to the device
- **Build output** -- `buildPlugin.sh` produces a `.snplg` file (zip of Hermes bytecode + assets + PluginConfig.json)
- **No native modules needed for pure JS plugins** -- build skips Gradle entirely, runs in under a minute
- **Install on device** -- copy `.snplg` to MyStyle/, then Settings > Apps > Plugins > Install

### Problem-solving protocol: check the SDK source first
When stuck on how to accomplish something on-device (inserting elements, marking strokes, navigating, etc.), **read the SDK TypeScript source** in `src/` before guessing or trying undocumented approaches. The SDK source has JSDoc comments with parameter docs, enum values, style constants, and validation logic that aren't in the official docs. Examples of wins from this:
- `PluginNoteAPI.setLassoTitle({style: 1})` -- discovered by reading `src/sdk/PluginNoteAPI.ts`, not documented elsewhere
- `setLassoStrokeLink` params and link style/type enums -- all in the source
- `insertText` full parameter list including `textFrameStyle`, `textFrameWidth` -- from VerifyUtils schema
- Element type constants and their sub-object schemas -- from `src/model/Element.ts` and `src/sdk/utils/VerifyUtils.ts`

Key SDK source files to check:
- `src/sdk/PluginNoteAPI.ts` -- note-level operations (insertText, setLassoTitle, setLassoStrokeLink, save)
- `src/sdk/PluginFileAPI.ts` -- file-level operations (insertElements, getElements, getPageSize)
- `src/sdk/PluginCommAPI.ts` -- comm operations (getLassoElements, recognizeElements, getCurrentFilePath)
- `src/sdk/utils/VerifyUtils.ts` -- parameter validation schemas for all element types
- `src/model/Element.ts` -- element type constants, data models, ElementDataAccessor

### Key SDK patterns
- `PluginManager.init()` must be called at startup
- `registerButton(type, appTypes, config)` -- type 1 = toolbar, type 2 = lasso bar, type 3 = selection bar
- `showType: 0` = headless/background, `showType: 1` = full-screen React Native UI
- All SDK API calls are async (return Promises)
- `saveCurrentNote()` is mandatory before `replaceElements()` to avoid stale state
- **File vs in-memory state**: `PluginNoteAPI` methods work on in-memory state; `PluginFileAPI` methods work on the .note file. After `replaceElements()`, call `reloadFile()` to sync the display.
- **Lasso context is ephemeral**: expires after navigation (e.g., Capture -> TaskAdd). `deleteLassoElements()` returns error 904 outside lasso context. Use `getElements()` + filter + `replaceElements()` instead.
- **Element matching**: `getLassoElements()` and `getElements()` return different UUIDs. Match by `numInPage` instead.
- **Link element cross-references**: Link elements (type 600) have `link.controlTrailNums` containing `numInPage` values of referenced strokes. Must remove associated links when removing strokes or `replaceElements` fails with error 502.
- **Hybrid text+link pattern**: `insertText()` + `lassoElements(rect)` + `setLassoStrokeLink()` gives editable text with dashed border. Breaking link leaves text intact (unlike `insertTextLink` which is atomic).
- Plugin directory via `getPluginDirPath()` for persistent local storage (JSON, config)
- `fetch()` works for HTTP/HTTPS calls -- confirmed on-device (Todoist API, dev log server)

### SDK method locations (which class has which method)
- **PluginCommAPI**: `getCurrentFilePath()`, `getCurrentPageNum()`, `getNoteSystemTemplates()`, `recognizeElements()`, `deleteLassoElements()`, `lassoElements(rect)`, `reloadFile()`, `setLassoBoxState(state)`
- **PluginNoteAPI**: `insertText()` (current note only), `insertTextLink()`, `saveCurrentNote()`, `getLastElement()`, `setLassoStrokeLink()` (supports strokes, geometries, AND TextBox elements)
- **PluginFileAPI**: `insertElements(notePath, page, elements)`, `createNote()`, `getElements()`, `replaceElements()`, `getNotePageTemplate()`, `getNoteTotalPageNum()`
- **FileUtils**: `getExportPath()`, `exists()`, `makeDir()`, `copyFile()`, `deleteFile()`, `listFiles()` -- **NO `writeFile()` method exists**
- **PluginManager**: `getPluginDirPath()`, `closePluginView()`, `registerButton()`, `getDeviceType()`

### File I/O (confirmed on-device)
- **`FileUtils.writeFile()` does not exist** -- not in the TurboModule interface at all
- **`fetch('file:///...')` WORKS for reading** -- returns HTTP status 0 (not 200), so `response.ok` is false. Must ignore status and call `response.json()` or `response.text()` directly. Reference: sn-keyworder plugin uses this for sideloaded JSON config.
- **Write workaround: .note file as storage** -- create a `.note` file via `createNote` with a system template (from `getNoteSystemTemplates`, use `Template.name`), stash JSON as a text element via `insertElements(type 500)`, read back via `getElements`. Full round-trip persistence without writeFile. **`template: 'none'` does NOT work** -- returns error 802.
- **`FileUtils.exists()` + `makeDir()`** -- can check and create directories (e.g., `/MyStyle/SuperTask/`)
- **`PluginFileAPI.createNote()` fails with error 802** when template path doesn't resolve to a file. Must use a real template: call `getNoteSystemTemplates()` and pass `Template.name`. `template: 'none'` is NOT valid.
- **`PluginFileAPI` write APIs (createNote, insertElements, etc.)** require a note context -- they return error 102 when called from the config/settings screen (no active note). Access settings from within a note (toolbar button) to use these APIs.
- **Ratta's official sticker demo** uses `@react-native-async-storage/async-storage` for persistent config storage (native module). There is no built-in pure-JS file write mechanism in the SDK.
- **ADB is locked down** -- `adb devices` sees the Supernote, but `shell`, `logcat`, `push`, `pull` all return "error: not support command"

### Native intent navigation (from AgP42/supernote-dashboard, MIT)
- **Opening a note at a specific page**: Target `com.ratta.supernote.note.view.NoteInsidePagesActivity` with `Intent.ACTION_VIEW`, extras `file_path` (String) and `page` (int, 1-based). Use `reactApplicationContext.startActivity()`, NOT `HostContext.getInstance()`. Flag: `FLAG_ACTIVITY_NEW_TASK` only. No URI data, no FileProvider needed.
- **Why SuperTask's previous attempt failed**: Used wrong activity (`NoteMainActivity`), wrong extra (`only_open_file`), and `HostContext` (SDK interception layer). All strategies opened file manager, not editor.
- **After launching intent**: Wait ~150ms, then `PluginManager.closePluginView()` so the target note is visible (not covered by plugin).
- **Opening a folder**: Target `com.ratta.supernote.inbox/com.ratta.supernote.explorer.FileManagerMainActivity` with `folder_path` extra, `source_type = 2`.
- **Opening a PDF**: Target `com.supernote.document/com.supernote.document.MainActivity` with `file_path` extra. `page` extra may be ignored by viewer.
- **Page numbering**: SDK APIs return 0-based pages. Intent `page` extra is 1-based. Convert: `intent_page = api_page + 1`.
- **Native writeFile workaround**: `java.io.FileWriter` in a native module (5 lines). Dashboard plugin uses this for config persistence. Could replace RNFS dependency.
- **Design doc**: `plugins/SuperTask/docs/design-native-intents.md`

### Learnings from SmartGestures development
- `event_pen_up` payload elements can't be read directly; must call `getLastElement()`
- Stroke points are in EMR coordinates (digitizer space, axes rotated vs screen)
- Inherent 1-2 second delay after `deleteElements()` due to SDK refresh -- unavoidable
- Elements are atomic (can't partially delete a stroke)
- Promise chain pattern (`chain = chain.then(...)`) prevents race conditions on rapid events
- Cache page context (size, path, page number) to avoid redundant API round-trips

### Gesture design principles (learned from SuperTask B-028, session 34)
- **Any gesture that incidental contact can trigger MUST be opt-in (config-gated, default off).** Never ship an always-on gesture unless it has a geometric target that incidental contact cannot satisfy (e.g., long press on a link's bounds). The three-finger double tap shipped always-on with a "works anywhere" design and fired from palm re-plants during normal writing -- the exact failure mode that got the plugin uninstalled once before.
- **Prefer constrained gestures over "anywhere" gestures.** Constraints (edge zones, hit tests, continuity of motion) are what make a gesture robust; each gate should map to a physical property of the deliberate gesture that incidental contact lacks.
- **Palm contacts DO reach the motion listener during pen writing** (hand-edge registers as 1-3 finger contacts; disproved the earlier "firmware palm rejection is perfect" finding, which came from single-device, non-writing tests). Treat pen contact as proof of writing: poison concurrent multi-touch interpretation AND apply a ~1.5s cooldown after any pen event (palm re-plants between strokes are pen-free).
- **Multi-contact MOVE streams jump between contact points** -- displacement computed across contacts is meaningless. Filter single-event jumps (>120px) before trusting travel distance.
- **Never trust a "cannot false-positive" claim that wasn't validated during real writing sessions.** Isolated gesture tests miss the palm interplay entirely.

### E-ink UI guidelines
- Black text on white background, no grayscale gradients
- Large tap targets (e-ink touch is less precise than phone screens)
- No animations -- e-ink can't render them
- Use typography (bold, size) and borders for visual hierarchy, not color
- Minimize full-screen refreshes

### Debugging on-device
- No dev console on Supernote. ADB logcat is also blocked.
- **Local-first logging (SuperTask pattern, session 34 -- copy for new plugins).** Every log entry ALWAYS appends to a rotating on-device file (`MyStyle/<Plugin>/logs/session.log`, event-driven batches -- JS timers suspend while the plugin view is closed, so never flush on a timer). Network upload is an opportunistic layer, never the only copy.
- **HTTP dev log server.** Plugin POSTs logs via `fetch()` to a local Node server on same wifi.
  - Server: `node dev-server.js` in the plugin directory (zero dependencies; generic copy in `template/dev-server.js`). `GET /ping` returns `{ok, service}` for reachability checks.
  - URL is runtime-configurable: saved config overrides the bundled `config.local.js` fallback (SuperTask: Settings > Connections > Debug Log Server, with a Test/ping button and Mac/Windows setup popup; or USB-edit the plugin's JSON config). IP changes need no rebuild. **Use the LAN IP -- Android cannot resolve `.local` hostnames.**
  - Logs print to terminal in real-time and save to `logs/` directory
  - Button: "Upload Log" in the debug screen (10s abort timeout; on failure writes a timestamped export file on-device)
- **Fallback: in-app log viewer.** `src/utils/debug.js` collects `[timestamp] tag: message` entries (2000-entry ring buffer), screens subscribe via `setListener()`.
- **Fallback: insertText.** If dev server is unreachable, logs are inserted as a text box on the current note page.
- Log at every boundary: config load, API request/response, SDK calls, screen transitions.

### API token management
- Typing tokens on the e-ink keyboard is impractical.
- Use a `config.local.js` file at plugin root (gitignored) that gets bundled into the Hermes build.
- Config loader: `require('../../config.local')` with fallback for missing file and `.default` vs direct export.

### External APIs
- **Todoist API v1** (not v2). Base URL: `https://api.todoist.com/api/v1`. The REST v2 endpoint (`/rest/v2`) returns 410 Gone as of April 2026.
- **Response format is paginated:** `{results: [...], next_cursor: "..."}` -- NOT a bare array. Always unwrap before using.

### Build & test cycle
1. Start dev log server: `cd plugins/<Name> && node dev-server.js`
2. Edit code
3. Run `bash buildPlugin.sh` from the plugin directory
4. Copy `build/outputs/<PluginName>.snplg` to Supernote via USB (MyStyle/ directory)
5. Settings > Apps > Plugins > Install (or reinstall)
6. Open a note, tap plugin button to test
7. Tap Log > Upload Log to send debug logs to your terminal

### Git practices
- Commit frequently -- previous sessions have lost work from uncommitted state
- No co-authored-by lines in commits
- Each plugin is in `plugins/<Name>/` with its own PROGRESS.md
- Design docs live in `docs/`
