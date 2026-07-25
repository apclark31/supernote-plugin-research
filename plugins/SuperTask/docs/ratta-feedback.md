# Supernote Plugin SDK: Developer Feedback

> Observations, API gaps, and suggestions from building plugins on sn-plugin-lib. Structured as general SDK feedback for Ratta -- not specific to any single plugin, though SuperTask is referenced where it motivated the discovery.

## Bugs / Unexpected Behavior

### 1. recognizeElements fails in lower page region on A5X (EMR mismatch)

**What we noticed:** `recognizeElements` returns error 117 for strokes in the bottom third of A5X pages (pixel y > ~1400). Upper-page content recognizes fine. Native "Convert to Text" works on the same strokes.

**Root cause:** `getDeviceType()` returns 3 (A5X) and `getPageSize()` reports 1404x1872, but element `maxX`/`maxY` values reach 20967/15725 -- exceeding the documented A5X EMR range (15819/11864). These values fall within Manta range (21632/16224). The `recognizeElements` API uses the `size` parameter to infer EMR-to-pixel ratios, so passing 1404x1872 clips strokes with out-of-range EMR coordinates.

**Why it matters:** Any plugin doing handwriting recognition on A5X will hit this. OCR-based workflows (text extraction, translation, search) silently fail on lower-page content with no indication of why.

**Potential use cases affected:** Handwriting-to-text export, task capture from handwriting, note search/indexing, translation plugins.

**Our workaround:** Detect actual EMR range from element `maxX`/`maxY`. When values exceed 15819/11864, pass Manta page size (1920x2560) to `recognizeElements`. This works but requires every plugin to implement the same detection logic.

**Suggestion:** `recognizeElements` could handle EMR range detection internally -- it already has access to the elements and their coordinate data.

**Questions:**
- Is the A5X EMR range documented incorrectly, or has hardware been revised?
- Should plugins always derive recognition size from element EMR values rather than `getPageSize()`?

### 2. openFilePath opens file manager, not note editor

**What we noticed:** `FileUtils.openFilePath(path)` with a `.note` file returns `true` but opens the file manager at that directory, not the note editor. The native `RTNFileModule` dispatches `ACTION_VIEW` with an `only_open_file` extra.

**Why it matters:** Plugins can't navigate between notes programmatically. Any workflow that links content across notes (cross-references, task back-links, related notes, dashboards) has no way to open the target note for the user.

**Potential use cases affected:** Note-to-note navigation, task management with source links, spaced repetition (jumping between review cards in different notes), daily digest plugins that reference yesterday's notes, project dashboards linking to scattered notes.

**Our workaround (SuperTask):** Insert a temporary link element on the current page pointing to the target note. The user taps the native link to navigate. The plugin cleans up temp links on next open. This works but adds visual clutter and an extra tap.

**Community workaround discovered:** The [supernote-dashboard](https://github.com/AgP42/supernote-dashboard) plugin (MIT, AgP42) found that targeting `com.ratta.supernote.note.view.NoteInsidePagesActivity` with `Intent.ACTION_VIEW` + `file_path` extra + `page` (1-based int) opens the note editor at a specific page. The `openFilePath` behavior is because it targets `FileManagerMainActivity` with `only_open_file`, not the editor activity. The key discovery: using `reactApplicationContext.startActivity()` (not `HostContext`) with `FLAG_ACTIVITY_NEW_TASK` and no URI data (plain string extra only) avoids FileProvider/StrictMode issues.

**Suggestion:** An API like `openNote(notePath, pageNum?)` that opens a .note file in the editor, optionally at a specific page. The intent-based workaround works but depends on internal activity class names that could change between firmware versions.

## Missing APIs

### 3. No page navigation (goToPage)

**What we noticed:** `getCurrentPageNum()` reads the current page, but nothing writes it. There's no way to navigate to a specific page within the open note.

**Why it matters:** Plugins that reference specific pages (bookmarks, cross-page links, search results, task back-references) can tell the user "go to page N" but can't take them there.

**Potential use cases:** Jump-to-page from search results, bookmark navigation, flashcard review across pages, returning to a captured annotation's source page.

**Suggestion:** `goToPage(pageNum)` or `setCurrentPage(pageNum)`.

### 4. No file write API

**What we noticed:** `FileUtils` provides `exists()`, `makeDir()`, `copyFile()`, `deleteFile()`, `listFiles()` but no `writeFile()`. The TurboModule interface doesn't expose it.

**Why it matters:** Plugins can't persist data (config, caches, indexes, state) without bundling a native module. This is a significant barrier for pure-JS plugins -- the SDK otherwise supports JS-only builds (no Gradle, ~10s build time), but any persistence need forces a native module dependency and a full Android build pipeline.

**Potential use cases:** Plugin configuration storage, local caches/indexes, offline data queues, export to text/markdown/CSV files, generated content (reports, summaries).

**Our workaround (SuperTask):** Bundle `react-native-fs` as a native module. This works but adds ~2MB to the build and requires Gradle/R8 tooling. We also explored storing JSON as text elements inside `.note` files via `insertElements` -- functional but fragile.

**Suggestion:** `FileUtils.writeFile(path, content, encoding?)` to match the existing read-oriented API surface.

### 5. No element background fill or highlight

**What we noticed:** There's no way to set a background color or fill on stroke elements or regions. The pen color constants (black, dark gray, light gray, white) apply to strokes only.

**Why it matters:** Visual status indicators on note content (completed, in-progress, flagged) are limited to adding new elements on top of existing content. There's no way to dim, highlight, or visually differentiate existing strokes or regions.

**Potential use cases:** Task completion indicators (grey out completed items), study highlighting, annotation layers, visual tagging/categorization of handwritten content, focus mode (dim everything except selected region).

**Our workaround (SuperTask):** Dashed-border link elements mark captured content, but there's no visual distinction between "captured" and "completed."

**Suggestion:** A fill or background property on elements, or a region highlight API.

### 6. No background execution

**What we noticed:** JS timers (`setTimeout`, `setInterval`) are suspended when the plugin UI is closed. The motion listener continues running but can't do reliable async work (network calls, file I/O).

**Why it matters:** Plugins can't sync, poll, or process data in the background. Any state that changes externally (cloud task status, incoming messages, calendar updates) can only be fetched when the user manually opens the plugin.

**Potential use cases:** Periodic sync with cloud services, push notification handling, background indexing of note content, scheduled exports, auto-save of plugin state.

**Suggestion:** A background execution mode -- either periodic callbacks or a lightweight service that runs while the plugin is registered, even with UI dismissed. Even a simple "run this function every N minutes" hook would unlock most sync workflows.

### 7. No plugin URL-scheme handling (custom link taps go to a dead browser page)

**What we noticed:** Link elements support arbitrary URL schemes (`linkType 4` with e.g. `supertask://task/123` as `destPath`). When the user natively taps such a link, the NOTE app dispatches ACTION_VIEW with the URI, which falls through to the browser and dies -- no installed component can claim the scheme, because plugins are dex-loaded inside PluginHost and cannot declare manifest intent filters. A companion APK could, but Supernote (correctly) blocks user APK installs.

**Why it matters:** The link infrastructure is 90% of a deep-linking system. Plugins can WRITE links that reference their own content, but the natural interaction -- tapping the link -- goes nowhere. Plugins resort to motion-listener gesture workarounds (long press + full page element scan + hit test) to simulate what a native tap dispatch would give for free, with worse latency and reliability.

**Potential use cases affected:** Task managers linking notes to tasks, spaced-repetition cards linking to sources, wiki-style note graphs, any plugin whose elements should be tappable entry points.

**Our workaround (SuperTask):** A finger long press detected via `registerMotionListener`, followed by `getElements()` + hit-testing link bounds at the touch point, then `showPluginView()`. Works, but costs a full page-element read per activation and requires teaching users a non-native gesture.

**Suggestion:** Let a plugin register one or more URL schemes at button-registration time (e.g. `registerUrlScheme('supertask')`). When a link with that scheme is tapped, open the plugin (as if its toolbar button were pressed) and deliver the URI through the existing event listener channel. All the pieces -- link tap dispatch, plugin launch, event listeners -- already exist; this just connects them.

### 8. getPageRotationType is exposed in TypeScript but not implemented natively

**What we noticed:** `PluginFileAPI.getPageRotationType` exists in the TS API surface, but the native implementation in `CommAPIModule.java` is commented out and absent from the spec. Calling it never resolves normally.

**Suggestion:** Either restore the native implementation or remove the method from the TS surface -- a permanently-pending promise is the worst failure mode for plugin authors (see our B-019 experience with hung SDK calls).

## Questions

### 9. Element maxX/maxY semantics

Every stroke element returned by `getLassoElements()` on our A5X has identical `maxX` (20967) and `maxY` (15725) values. These appear to be page-level digitizer constants, not per-stroke bounding boxes. Is this correct? If they are page-level constants, documenting that would help plugin developers avoid treating them as stroke bounds.

### 10. Pen type 16

Strokes on our A5X show `penType=16`, which isn't in the documented pen type list (0=Ballpoint, 1=Fountain, 10=Marker, 11=Pencil, 14=Brush). What pen type does 16 represent? Is it specific to newer firmware or a hardware revision?
