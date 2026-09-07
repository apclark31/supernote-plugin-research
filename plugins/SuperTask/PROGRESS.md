# SuperTask

Lasso-to-Todoist plugin for Supernote. Design doc: `docs/plugin-taskharvest-v2.md`

> **Issues are tracked in Jira: [SNDEV](https://alexpnw.atlassian.net/browse/SNDEV), epic `SNDEV-6`.**
> This file remains the session handoff record. Feature and bug STATUS lives in Jira.
> The on-device test checklist below corresponds to the `Testing` column:
> `project = SNDEV AND labels = SuperTask AND status = Testing`.
> Look any item up by its old ID, e.g. `project = SNDEV AND labels = "B-029"`.
> `docs/tracker.md` is frozen as of 2026-07-25 and no longer reflects reality.

## Status

**Session 41 (2026-09-06) -- Chauvet 3.29.44 permission model, compliance record, bug/feature sweep, Reddit draft.** Firmware moved to 3.29.44 / 2.26.41 (.43/.40 pulled for sticker loss); npm confirms 0.1.65 is still the latest lib, pin stands. Build 1b on `sdk-0.1.65` (commits 24f0c49 + a9555ad): four-permission startup guard with plain-language rationales + Settings > Setup > Permissions row/sheet; token import confined to MyStyle/SuperTask; B-032 config-button-first; B-033 one-shot `invalidatePluginView()` after first paint (default on, Display toggle) + coalesced note-context commits; F-036 default project moved to Capturing Tasks with hidden-default warning; F-028 (?) on every settings section; F-037 Edit Task header/status polish (explicit Save kept). New Jira: **SNDEV-71** (T-009, Ratta review compliance, living record). Reddit post drafted at `docs/reddit-post-v0.3.0.md` -- HOLD until the device pass. **Nothing in build 1/1b has been on a device yet**; the 11-step plan on SNDEV-70 plus the Testing column (SNDEV-65, 37, 61, 69, 57, 28, 58) is the whole gate. Current .snplg: 2026-09-06 10:37.

**Session 39 (2026-08-15) -- Testing triage + F-025 v2 select-then-commit completion.** Alex's 2026-08-02 on-device pass closed 21 of the 25 Testing items (device-confirmed passes, plus code-verified+soak closes for the unobservable stability fixes -- rationale on each ticket). The arm-then-confirm double tap was first refined (chip copy/target, 5s window), then **superseded the same session by Alex's design call**: the checkbox reads as *select*, and confirmation belongs above the list, not in the rows. Shipped as **SNDEV-67/F-043**: checkbox taps select (box fills, zero row shift); the TaskHome/ProjectView header band swaps its content to a contextual action bar ("N selected [Complete N] [Clear]" -> "Completed N [Undo] [OK]"); Undo reopens via the Done tab's endpoint; no timers anywhere. New `useTaskSelection` hook + `SelectionBar` component; TaskRow stripped of all arm state. SNDEV-34 closed (Done tab + reopen stays shipped; only the double tap replaced). Current .snplg: 2026-08-15 (~16:00, commit 83f6ea1). **CLOSED same-day after three on-device rounds with log-driven fixes: SNDEV-67 (F-043 selection flow -- incl. undo registry-write race + repaint-fingerprint reset) and SNDEV-49 (B-005 rename healing -- heal now per-data-load not per-process, note-jump joins in-flight heal and auto-retries, heal kicks from cache at mount, prefix-ordered probe).** New working principle from this round (saved to memory): *state changed -> user can see it changed* is an acceptance criterion; every repaint-dedup/cache/background task must wire its refresh path. **Later same day: SNDEV-66 (F-042) and SNDEV-60 (F-038) device-confirmed and closed. F-041 (SNDEV-65) implemented and in Testing (commit 89dcba4): text scale on TaskDetail/TaskAdd/QuickAdd/Capture + the three pickers; Diagnostics deliberately unscaled (11px monospace readouts); TaskList.tsx found to be DEAD CODE (unrouted since the TaskHome rewrite) -- deletion candidate. Testing queue: SNDEV-65 (F-041), SNDEV-37 (F-029 token import -- last item gating T-007/v0.3.0).** New backlog: SNDEV-65 (F-041 text-scale coverage), SNDEV-68 (F-044 completion state in ink -- checkmark write-back on note markers, companion to F-040). T-006/SNDEV-20 half-unblocked: bezel confirmed on dev A5X, external device pending.

## SESSION 41 (2026-09-06) -- 3.29.44 permissions, compliance, sweep, Reddit draft

**RELEASED: v0.3.0-beta** (re-cut on build 1k, .snplg 17:26, commit 4c0f8c1 -- 1j had B-036:
bezel off until reboot on fresh installs; tag on main after fast-forward from `sdk-0.1.65`). Device-confirmed on Manta 3.29.44 across the day: permission explainer +
four ordered prompts, token import, openFile + jumpToPage jumps, edge capture, ghosting,
text scale, default-project warning, section sheets, Edit Task header, selection-bar
height. Hidden for release: three-finger double tap (does not fire on 3.29.44, SNDEV-73).
Open: SNDEV-72 (disk edits need restart), SNDEV-73, SNDEV-71 (living compliance record).
Reddit post draft final at `docs/reddit-post-v0.3.0.md` (Alex edits + posts).

Firmware context: Ratta replaced 3.29.43 / 2.26.40 with **3.29.44 / 2.26.41** ("plugin
permission management"; the old build could lose sticker data on upgrade) and published
a plugin **review process** for InkHub submissions (permissions must match function; no
unauthorized data upload; source optional). `npm view` confirms sn-plugin-lib **0.1.65
is still the latest** (2026-08-24); the .44 changelog's API list is identical to what
session 40 scoped. No re-pin.

1. **Permission guard extended** (`permissions.js`): FILE:READ, FILE:WRITE, FILE:DELETE,
   INTERNET checked and requested sequentially with plain-language `desc` strings; every
   state logged; unknown names non-fatal (SDK JSDoc lists only WRITE/DELETE/INTERNET --
   READ comes from the review doc and is passed through by name). `initTaskCache` now
   runs after the guard. No build-time declaration exists (PluginConfig.json has no
   permission field) -- grants happen through the host dialog at first use, and the
   release notes / Settings say so.
2. **Settings > Setup > Permissions row**: status chip per permission, "Allow missing"
   button, (?) sheet explaining exactly what each is used for and that everything lives
   in MyStyle/SuperTask. Hidden on firmware without the API.
3. **Token import scoped to MyStyle/SuperTask** (Alex): the six-root sweep was more
   FILE:READ than one setup step deserves. One folder, top level, one filename. Copy
   updated in the hint, the token sheet, and the release notes.
4. **SNDEV-71 / T-009 created** -- living compliance record: permission table (Ratta
   definition vs our use), review criteria vs status, open items (denied-state UX,
   FILE:WRITE degradation, InkHub blurb, SuperHub parity, re-review trigger).
5. **B-032**: `registerConfigButton()` first in index.js. **B-033**: the SDK's unwrapped
   `NativePluginManager.invalidatePluginView()` fired once 150ms after TaskHome's first
   content commit (`refreshOnOpen`, default on, Display toggle "Clear ghosting on open")
   + registry read moved ahead of the element scan so noteCtx/registryNoteTasks commit
   together.
6. **F-036**: Default project row -> Capturing Tasks (own guard) + bordered warning when
   the default is unticked under Show projects. **F-028**: `Section` gained `onInfo`;
   sheets for Opening / Capturing / Projects / Debugging. **F-037**: TaskDetail header
   band + "Saved HH:MM" status + 2px inputs + Save above Complete; explicit Save kept.
7. **Reddit draft** `docs/reddit-post-v0.3.0.md` (r/Supernote body, r/Supernote_dev
   short version, title options, screenshot list). Needs `<RELEASE_URL>` and a green
   device pass before posting.
8. Release notes gained Permissions + Firmware sections. tsc: 75 errors before and
   after (all pre-existing SDK `Object` typings). Build clean.
9. **Permission flow redesigned (Alex: four cold dialogs is painful).** The host shows
   one dialog per permission and the SDK cannot batch, so: `PermissionsIntro.tsx` --
   one explainer screen on first launch (three plain-language rows, "Why?" expanders,
   Continue / Not now), shown by App.tsx while the folder group is not granted;
   `permissions.js` now exposes `PERMISSION_GROUPS` (folder = READ+WRITE, sync =
   INTERNET, cleanup = DELETE) and `ensurePermissionGroup(id, {force})`, asked
   just-in-time: folder at Continue, sync inside `todoistFetch` / log upload / Test
   server, cleanup at token import only. Startup only logs states. To make DELETE
   truly import-only, config/registry/cache atomic writes dropped their pre-unlink
   (rename replaces on Android), cache invalidation overwrites `{}`, log rotation is
   copy+truncate. Settings > Setup > Permissions lists the three groups with
   Allowed / Not yet / Partly chips. Technical names appear only in the expanded why.
   Diagnostics' test-file delete (dev surface) left as is. Device question added:
   does the host count rename-over-existing as a delete? (Config saves failing with
   DELETE denied would be the tell.)
10. **First device pass (build 1c) FAILED: explainer showed, Continue gave NO system
    dialog, Settings "device write failed", all groups Not yet; MyStyle/SuperTask did
    not survive the firmware update + restore (token/registry gone).** Root cause from
    docs.supernote.com/en/plugin-base/permission: permissions MUST be declared in
    PluginConfig.json `uses-permissions` or `requestPermission` rejects with 1500,
    dialog-less. **Build 1d** (14:41): declaration added (verified inside the .snplg),
    -1 = closed treated as denied, failures log "FAILED (no dialog shown)", Settings
    header names the missing folder permission instead of "write failed", explainer
    mentions this-time-only expiry + Supernote's own settings page. Fact recorded in
    CLAUDE.md. Re-run SNDEV-70 steps 9-12 on 1d.

**Not done / decisions pending Alex:** which branch cuts the v0.3.0 GitHub release --
the user group is on 3.29.44, so `sdk-0.1.65` is the candidate, but only after its
first device pass; main (0.1.43) stays the fallback for older preview firmware. F-028
TaskHome concepts (no (?) affordance on TaskHome today). SNDEV-18 (external user
getElements) still needs their logs.

## SESSION 40 (2026-08-24) -- sn-plugin-lib 0.1.65: scoping + migration build 1

Ratta shipped SDK 0.1.65 (changelog via dev community). Scoped against the published
source (`docs/design-sdk065-migration.md`), condensed the philips/supernote-typescript
vector-format research (`docs/reference-note-vector-format.md`), exact-pinned all three
package.jsons, then built **build 1 (characterization) on branch `sdk-0.1.65`**
(commit 6819632; main stays 0.1.43 for the v0.3.0 release). Jira: SNDEV-70 (T-008).

- noteOpener: native-first `openFile` (notes + documents) with intents as compiled-in
  fallback behind `useNativeOpenFile` (default on); `openFolder` stays intent-only
  (openFile is file-only). ALL page-base conversion centralized in noteOpener.
  New APIs are 0-based; only element numsInPage went 1-based.
- TaskHome same-note jumps use `jumpToPage` (first testable path for the F-026
  "This Note" jump).
- viewState: lifecycle listener LOG-ONLY + canHandwrite probes on view open/close
  (B-031 characterization).
- permissions.js: startup INTERNET check/request with loud logging (the
  silent-sync-death guard). No-ops on old firmware.
- clampRectToPage wired into both text-mark lasso flows (0.1.65 rejects
  out-of-bounds rects; the 10px pad overflowed at page edges).
- Index audit: PASSED -- no constructed element indices cross the SDK boundary.

**Precondition for device testing: firmware must be the matching update.** Test plan
on SNDEV-70. Still open from v0.3.0 (main): SNDEV-65 (F-041 text scale), SNDEV-37
(F-029 token import).

## SESSION 39 (2026-08-15) -- testing triage, arm-confirm refinement, CTA copy

Processed Alex's 2026-08-02 test comments across the whole Testing column (25 issues):

1. **Closed 21 issues.** Device passes: F-021 bezel (the blessed opener), F-022a logging, F-023 settings v2, F-024 taskhome v2, F-026 note-jump, F-030 show-done, F-031 text scale, F-034 header switcher, F-035 font %, B-004 project filter, B-028 palm gestures (false positives gone; three-finger tap insensitivity is the accepted trade-off, removal decision = T-006/SNDEV-20). Code-verified + soak closes (unobservable fixes; rationale + would-be test on each ticket): B-019/20/21/22/23/24/25/26/27. F-027 link cache closed per Alex (no perceived gain; superseded for markers by F-040/SNDEV-64 option B).
2. **SNDEV-34 / F-025 failed testing** -- "Tap again to complete" didn't say *where* (the confirm target is the checkbox; the chip was indicator-only; row tap opens detail). Fixed this session (commit `3b635cb`): chip copy "Tap box again to complete", chip is now also a confirm target (checkbox OR chip completes), arm window 3s -> 5s. No geometry change (F-023 no-reflow rule holds).
3. **SNDEV-66 / F-042 (new, from F-024 feedback):** TaskDetail deep-link header "All Tasks" -> "View all tasks >" (only label-styled nav link found in the sweep). Same commit/build.
4. **SNDEV-65 / F-041 (new, To Do):** extend text scale to TaskDetail/TaskAdd/QuickAdd/Capture/TaskList/Diagnostics -- coverage map verified in source and documented on the ticket. Chips/shared components already scale; those six screens don't consume `useFontScale`.

**On-device test (build 2026-08-15):** F-025 -- arm then (a) tap box = completes, (b) tap chip = completes, (c) wait 5s = disarms, (d) tap row title = opens detail, no completion. F-042 -- deep-link a task, header shows "View all tasks >", tap lands on TaskHome. Plus the three older untested items: F-029 token import (supertask-token.txt -> Import -> file deleted), B-005 rename healing (rename captured note -> reopen -> `Heal:` log lines + Device tab label), F-038 tab memory (checklist in SNDEV-60 description).

## Previous status (session 37)

**Session 37 (2026-07-26) -- B-031 diagnostic build; issue then reframed. The pen write-through could NOT be reproduced later the same day: pen input on Settings now scrolls the menu correctly (same on SuperHub + sticker plugin), so the incident was one-off, state-dependent pen routing at the platform level. SNDEV-59 downgraded Highest -> High, back to To Do as a watch item, NO LONGER a v0.3.0 blocker. Current .snplg (session 37, 20:35) keeps the diagnostics armed (view-state tracking + pen-through-view logging into the always-on session log) so a recurrence self-documents. Release gated on the session-34 checklist below only.**

## SESSION 38 (2026-07-27) -- workflow feedback: tab memory, settings regression, info sheet

Alex installed the session-37 diagnostic build and fed back four workflow items while testing. New .snplg built 10:47.

1. **F-038 / SNDEV-60 (implemented -> Testing): tab session memory + "Last opened" default.** TaskHome unmounted on every push (view task) and remounted on pop reading config.defaultTab -- jarring snap mid-workflow. Now: `viewState.js` keeps a session tab (set on tab switch, cleared when the plugin view closes); TaskHome restores it on remount, and it OUTRANKS the deep-link focusTab param (nav-stack entries keep their original focusTab across pops, which would otherwise clobber a mid-session switch; fresh deep links are safe because close clears session state). New "Last opened" option (first in Settings > Opening SuperTask > Default tab, now the DEFAULT_CONFIG default) resolves via `resolveDefaultTab()` to the hidden `lastOpenedTab` key persisted on every tab switch. Gesture opens resolve it too. Existing installs keep their saved tab choice.
2. **B-032 / SNDEV-61 (To Do): Settings entry gone from the device plugin menu.** Regression per Alex; Settings must be reachable from both the plugin menu and TaskHome. Code investigation: `registerConfigButton()` in index.js:66 is intact and unchanged since scaffold -- no code diff explains it. Leading hypothesis is the known upgrade-in-place caching (session 26); first test is full uninstall -> reboot -> fresh install. Fallback: session.log init lines, then instrument registerConfigButton.
3. **F-028 / SNDEV-28 (partial): "After creating a task" (?) info sheet** shipped ahead of the batch -- explains Ask (Add Another / View Task / Done) vs Go back with when-to-use guidance.
4. **F-039 / SNDEV-62 (backlog, Low): Todoist comments in TaskDetail** -- view/add comments so task status metadata is available on-device. Sketched in the ticket (v1 comments endpoint, lazy per-task fetch, not in main cache).

**On-device test (this build):** Today -> open task -> back stays on Today; tab choice survives close/reopen with "Last opened"; explicit default still resets on close/reopen; deep links land correctly and survive the switch-tab-then-view-task flow; (?) on After creating a task shows the sheet; B-032: full uninstall/reinstall then check the plugin menu for Settings.

## SESSION 37 (2026-07-26) -- B-031 pen write-through: diagnostic; stopgap built then removed

**Context:** SNDEV-59 / B-031, reported+confirmed session 36: writing with the pen while any plugin screen is open (seen on Settings) commits ink to the note underneath. The full-screen RN view intercepts capacitive touch only; the EMR pen is a separate input plane that never detached from the note. No SDK API exists to block it (PluginManager surface enumerated, 0.1.43).

**Direction set by Alex this session:** the acceptable end state is that pen contact on plugin screens produces NO ink anywhere -- settings pages are for selections, writing is canvas-only. An opt-in "close the plugin when writing is detected" stopgap (SNDEV-59 fix option 3) was implemented, then REMOVED on Alex's direction before any on-device test: ejecting the user from the UI doesn't prevent the write and is itself hostile. Option 3 is dead regardless of what the diagnostic shows. Remaining paths: native interception (option 1), detect-and-undo (option 2, last resort), Ratta platform fix (option 4).

**Shipped in this build (instrumentation only):**

1. **`src/utils/viewState.js` (new)** -- tracks "is the plugin view up right now?" + current screen. Open paths: index.js button/config listeners, App mount, App.tsx re-show listeners, gesture `openPluginView()`. Close paths: `closePlugin()`, noteOpener's three intents, App unmount. No SDK query exists for view visibility, so unknown system dismiss paths would leave the flag stale-open -- the FINGER diagnostic below is the stale-state canary.
2. **B-031 diagnostic in `gestureDetector.onMsg`** -- when `isViewOpen()`, events route to `onEventWhileViewOpen()` (never gesture-classified). PEN DOWN/UP log with screen name + stroke shape (move count, max travel, duration); MOVEs sampled every 25th. This answers the open mechanism question from SNDEV-59: does the motion listener receive pen events while the view is up? FINGER DOWNs in that window also log (architecture claim says they can't arrive -- a line here means stale view-state or touch pass-through). Pen events while view open also refresh `_lastPenTime` so the B-028 cooldown stays honest across a close.
3. **ratta-feedback.md item 9** -- the SDK gap writeup (pen plane never detaches from the note under a plugin view; suggest suspending pen commit while a plugin view shows; notes that app-level mitigations were considered and rejected). Questions renumbered 10/11.
4. Header architecture comment in gestureDetector.js corrected (touch-only interception).

**On-device test plan (characterization -- shapes the prevention work):**
1. Install, enable debug logging. Open Settings, write on it with the pen. Do `B-031: PEN ...` lines appear in the log? (Answers whether the listener sees the pen while the view is up -- relevant to option 2's ability to timestamp incidents, and to how much visibility any JS-side component has.)
2. Which screens reproduce (TaskHome? Capture?); does committed ink land on the page that was open; does it survive page turn/restart.
3. Any `B-031: FINGER DOWN while view believed OPEN` lines (stale view-state canary); `ViewState` open/close lines matching reality (esp. after noteOpener jumps).

**Not done / next:** option 1 feasibility (native EMR interception from PluginHost -- likely impossible from an app-level process since the fast-ink path is firmware-side, but NoteOpenerModule.kt is the place to probe); option 2 sketch (element-set snapshot on open, diff+remove on close) if option 1 dead-ends; file the Ratta item upstream.

## SESSION 35 (2026-07-25)

**On-device test round 1 outcomes (all fixes confirmed by Alex on-device):**
- **B-030 (fixed+confirmed):** Log screen was unreachable from TaskHome -- F-024 moved Log "to Settings > Debugging" but only Diagnostics got a row. Now: debugMode-gated Log button in TaskHome header + "Debug log" row in Settings > Debugging.
- **B-029 (resolved+confirmed):** Note jump failures were legacy registry entries (pre-F-024, no notePath) jumping via an unverified same-directory guess. NOT the intent mechanism (cross-note jumps work, page extra honored, `×` and spaces in paths fine). Fixes: `openNote()` pre-flights `RNFS.exists`, failures surface in a TaskHome banner instead of the editor's toast; heal pass backfills notePath from Todoist description back-refs. Remaining: same-note This Note jump still unverified on-device.
- **F-032 (confirmed):** QoL smoothness -- `getCachedConfig()` sync accessor (TaskHome + Config seed state on first render; no post-mount tab/control snap), fingerprint diff in applyData (background revalidate skips identical repaints), disk task-cache snapshot (cold opens paint instantly; invalidate deletes it), Device-tab registry read parallelized (was serialized behind the ~3s element scan showing a false "no tasks" empty state). Delta sync via sync_token considered, deliberately skipped.
- **F-033 (confirmed):** Full-path note labels ("KEEN / 1×1 / Connor") in This Note band, TaskDetail, Device tab via shared `src/utils/noteLabel.js`; legacy-entry backfill makes them real.

**Carry-forward:** finish the session-34 checklist (esp. gesture/palm items 1-3, Done-tab endpoint, token import, rename heal); verify a same-note This Note jump; then cut the v0.3.0 GitHub release (attach .snplg + dev-server.js).

## SESSION 34 SUMMARY & CONSOLIDATED TEST CHECKLIST

### What shipped (all cumulative in the final .snplg)

**Gesture stability overhaul** -- B-019 event-driven watchdog (withTimeout alone was provably insufficient: timers suspend when the view is closed), B-020 element leak on scan timeout, B-021 SDK-free onMsg (pre-scan-per-touch eliminated -- the prime device-interference suspect), B-028 palm+pen discrimination in two rounds (pen poisoning + 1.5s cooldown + tap crispness + bezel spatial/continuity gates), bezel swipe reintroduced (F-021, opt-in), three-finger tap made opt-in (F-014), lasso-add default off, F-027 per-page link cache for long-press latency.

**Stability pass 2** -- all six audit findings fixed: fetch timeouts + inflight watchdog (B-022), capture-path element recycling (B-023), guard-flag timeouts incl. duplicate-task fix (B-024), atomic/serialized persistence (B-025), obfuscation config-loss (B-026), Diagnostics listener leak (B-027). Plus B-004 project filter (Today/Upcoming/Done), B-005 rename healing, 429 Retry-After.

**Local-first logging (F-022 phase 1)** -- always-on rotating session.log, runtime-configurable server URL (Settings field + Test/ping + setup popup), 10s upload timeout, distribution-neutral instructions, generic template/dev-server.js, /ping endpoint.

**Settings v2 (F-023)** -- five drawn-View primitives, General/Setup pages split by frequency of use, apply-on-change with per-row Saved chips + header status, dead defaultScreen deleted.

**TaskHome v2 (F-024/025/026)** -- chip metadata language, drawn checkboxes, This Note band (whole-note, page chips), filesystem-style Device labels, Note > jump buttons, arm-then-confirm completion, Done tab with reopen, chipless-row centering.

**New features** -- token file import (F-029), show-done footer filter (F-030), accessibility text scale (F-031). New icon + 'SuperTask' sidebar name.

**Research/process** -- T-002 SDK native audit done (`../../docs/sdk-native-audit.md`), gesture design principles in CLAUDE.md + memory, design docs for settings/home/gesture-options, ratta-feedback items 7-8, F-018/T-003 dropped, F-019 -> SuperHub F-001, F-004 redefined (native local-first dashboard).

### CONSOLIDATED ON-DEVICE TEST CHECKLIST (v0.3.0 RC)

*Setup*: fresh install of the RC; `node dev-server.js` running; Settings > Setup > Debug Log Server shows the right IP; Test reports reachable; `session.log` appears in MyStyle/SuperTask/logs/.

1. **Normal writing with gestures enabled** (bezel ON, three-finger ON, quick-add finger ON for the test): extended real note-taking -- expect ZERO false opens; logs should show poisoning/cooldown/band rejections doing the work.
2. **Deliberate gestures**: bezel swipe (2 and 3 fingers), three-finger double tap (wait ~1.5s after writing -- pen cooldown is by design), long press on a link (repeat press on the same page visibly faster -- look for F-027 cache-hit lines), lasso-add, pen-lasso.
3. **B-019 gauntlet**: touch canvas while the plugin view is open, close, verify gestures recover (WATCHDOG lines if anything hung).
4. **Stability**: wifi-drop during TaskHome load (recovers; next open works); 10+ consecutive captures (no sluggishness); complete a task from a deep link (closes to note, no freeze).
5. **Settings v2**: toggles cause no row reflow; change settings and leave WITHOUT saving -- everything sticks on reopen; Saved chips + header status appear; no-token first run lands on Setup.
6. **TaskHome v2**: chips legible; This Note shows other-page tasks with correct p.N and Note > jumps to the right page; Device labels show folders; arm-confirm works (arm, confirm, 3s disarm); Done tab loads (**first on-device use of the completed-tasks endpoint -- verify**); reopen works; Show done surfaces Completed Today; text scale Large/XL wraps chips without truncation; default tab = On Device lands there via gesture/button.
7. **Token import (F-029)**: sync `supertask-token.txt` via Partner app -> Import -> token saved, file deleted, Test Connection green.
8. **Rename heal (B-005)**: rename a captured note, reopen plugin -- `Heal:` log lines, Device label updates, Note > still jumps.
9. **Project filter (B-004)**: enabled projects respected in Today/Upcoming/Done; Device/This Note intentionally unfiltered.

*After the pass*: graduate confirmed tracker items to changelog; decide T-006 (three-finger deprecation) from bezel results on BOTH devices; cut the GitHub release -- attach `SuperTask.snplg` + `dev-server.js` + `release-notes-v0.3.0.md`.

## Session 34 (earlier detail sections follow)

**Session 34 complete through stability pass 2.** Part 1 (gesture overhaul): event-driven watchdog for B-019, scan-timeout leak fix (B-020), SDK-free `onMsg` (B-021), lasso-add default off -- built 2026-07-23, under on-device test as `SuperTask-s34-gestures-only.snplg`. Part 2 (stability pass 2, built 2026-07-24 as `SuperTask.snplg`): all six audit findings fixed (B-022..B-027), three T-005 lows fixed, bezel swipe reintroduced config-gated (F-021), gesture options research written up (`docs/design-gesture-options.md`).

## Session 34 (continued) -- Stability pass 2, bezel swipe, gesture research

### Stability pass 2 (audit fixes)

1. **B-022**: `fetchWithTimeout` (AbortController, 20s) in `todoist.js`; timeouts/network errors are retryable like 5xx. `taskCache.fetchTaskData` abandons in-flight fetches older than 90s via identity-checked slot -- timer-free backstop, so one wedged fetch can never poison the dedup guard for the session. Also `MAX_PAGES=20` pagination cap with truncation log.
2. **B-023**: shared `recycleElements()` exported from `ocr.js`; `QuickAdd.captureLasso` and `Capture.captureLasso` recycle in `finally` on all paths.
3. **B-024**: `withTimeout` on every SDK await in `TaskAdd.handleSubmit`/`handleConvertToText` and `QuickAdd.handleConvertToText`/`handleDone` (5-8s); TaskAdd `submitting` reset moved to `finally`; TaskDetail complete/delete use `leaveAfterMutation` (pop with stack, `closePlugin()` in deep-link mode -- previously stuck with disabled buttons).
4. **B-025**: temp-file+rename atomic writes for config + registry, crash recovery reads the temp file if the main file vanished mid-swap, registry mutations serialized through a promise chain, config load dedup + save chain.
5. **B-026**: `obfuscate()` keeps the plain value if `btoa` throws (non-ASCII); the auto-obfuscation rewrite in `loadFromFile` is isolated so it can never abort the load and drop the config/token.
6. **B-027**: Diagnostics motion listener stopped on screen unmount (captured log survives in module state); UI updates via module-level `_uiNotify` hook -- no setState on dead components. Fixed a latent missing `useEffect` import.
7. **T-005 partial**: `__superTaskButtonId` consumed on read in `getInitialScreen` (item 1); Capture `cancelledRef` blocks navigate-after-close (item 3); pagination cap (item 4). Items 2 (defaultScreen unused), 5 (429 Retry-After), 6 (debug URL staleness) remain.

### F-021: Bezel swipe reintroduced (config-gated, default OFF)

- Parameters from the gesture research: bottom **4%** zone, **>=2** pointers, **150px** upward displacement (**80px** for 3+ fingers), **3500ms** max duration (the old 1200ms limit caused 13/13 failures).
- Zone threshold self-calibrates from observed max y in the event stream (default 1871) -- zero SDK calls, keeps `onMsg` pure per B-021.
- Misreported-DOWN recovery: multi-finger bezel entries whose DOWN lands mid-page fall into multi-tap tracking; `onMultiTapEnd` reclassifies by upward displacement (taps have near-zero travel), so phantom pointers can't false-fire it.
- Bezel-zone DOWNs are excluded from long-press/lasso paths. Three-finger double tap and bezel swipe share `openTaskHome()`.
- Config: `bezelSwipeEnabled` (default false), checkbox in Settings > Handwriting. Enable it during testing via the checkbox; a false-positive-free session of normal writing with it ON is the acceptance test.

### Gesture research (docs/design-gesture-options.md)

New design doc distilling gesture-research.md + design-gesture-audit.md + design-gesture-guards.md: device facts table (pointer-count variance 3 vs 5 across devices, phantom multi-touch, swipe timing), the shipped bezel parameters, ranked candidate gestures (Tier A: two-finger tap, two-finger directional swipes -- both documented-reliable), and a configurability matrix (expose on/off + bindings + hold duration; hardcode disambiguation internals). F-022 added to tracker for the holistic logging architecture (file capture -> self-healing transport -> optional remote relay).

### TS baseline note

`npx tsc --noEmit` has 76 pre-existing errors (build uses Metro/Babel, no type-checking). Pass 2 verified zero NEW errors against the HEAD baseline; one real latent bug found this way (missing `useEffect` import in Diagnostics).

### Pass 3: local-first logging (F-022 phase 1)

Decision: local capture is the source of truth, network is opportunistic, URL is runtime-configurable.

1. **Always-on session file** (`debug.js`): every entry appends to `MyStyle/SuperTask/logs/session.log` in batches of 25 (event-driven -- timers suspend when view closed), rotating at 512KB to `session.log.1`. Survives crashes; retrievable over USB. One-shot kill switch if RNFS fails (never recurses into log()).
2. **Runtime-configurable server URL**: `config.js` pushes `debugServerUrl` into debug.js on every load/save (`withDerived` -> `setDebugServerUrl`, cycle-free direction). New Settings field: Connections > Debug Log Server. USB-editing supertask-config.json also works. Bundled config.local.js is now fallback-only -- IP changes never need a rebuild again (fixes T-005 item 6).
3. **Upload hardening**: exportLog flushes the session file first, POSTs with a 10s abort timeout, and on failure writes a timestamped export file -- the result message always says where the local copy is.
4. **Buffers**: in-memory 500 -> 2000 entries; Diagnostics motion log 200 -> 1000 lines (a 500-entry buffer wrapped in minutes at ~25 events/sec during drags).
5. **dev-server.js**: GET `/ping` identity endpoint (`{ok, service: 'supertask-dev-server'}`) -- manual reachability check from the device browser today, subnet-discovery probe target in F-022 phase 2. Startup message now points at the Settings field instead of config.local.
6. `config.local.js` fallback updated to LAN IP `192.168.68.55` (was an unresolvable `.local` hostname; Mac IP has drifted .68 -> .58 -> .55 across sessions, hence the runtime-config fix).

### Pass 3 additions: server setup UX + identity

1. **Ping tester**: "Test" button next to the Debug Log Server field -- probes `<base>/ping` with a 5s abort timeout (falls back to `GET /` for older dev-server builds), reports reachable/unreachable with actionable hints. Tests the field value pre-save so typos are caught early.
2. **Setup popup**: "?" next to the field opens step-by-step Mac (Terminal) and Windows (PowerShell, firewall prompt) instructions for `node dev-server.js`, plus troubleshooting (same wifi, LAN IP not .local, IP drift needs no reinstall).
3. **Portability for future plugins**: generic `template/dev-server.js` (service id `sn-plugin-dev-server`, neutral filenames), debugging section added to `template/README.md`, CLAUDE.md "Debugging on-device" rewritten around the local-first pattern. The in-plugin pieces to copy for a new plugin: `src/utils/debug.js` (needs react-native-fs for the session file) + the Debug Log Server block in `Config.tsx`.
4. **Plugin identity in sidebar**: toolbar button 100 renamed 'Tasks' -> 'SuperTask' (the sidebar plugins list shows the button name, not PluginConfig name); new 48x48 icon -- bold checkbox with checkmark sweeping out the top-right -- replaces the default-looking puzzle piece (old icon kept as `assets/icon-puzzle-old.png`).

### TaskHome v2 implemented (F-024, same session)

Home screen rebuilt on the settings design language (`design-home-v2.md`):
- `Chip` component: bordered tags for ALL row metadata + counts; overdue inverts. TaskRow uses the shared drawn Check box (glyph checkbox retired), chips wrap under the title.
- TabBar -> inverted segmented cells; SectionHeader white + 2px rule + count chip; header slimmed to [+ New] (primary) / Settings / Close (Log/Diag removed -- Settings > Debugging has them); grays/gray separators -> black hairlines.
- **"This Page" -> "This Note"**: whole-note scope, p.N chip per task, sorted by page (link scan + note-wide description refs with parsed page + registry). Pending-sync tasks labeled with a chip.
- **On Device tab**: p.N now a row chip (outboard column deleted, alignment fixed); note headers filesystem-style ("Connor / 1x1") from notePath -- registry addTask now persists notePath (was silently dropped; TaskAdd now passes it too).
- **Default tab option "On Device" added** (Settings > Opening SuperTask); deep-link focusTab now actually forwarded by App.tsx and wins over the config default (was silently ignored).
- On-device checks: chips legible at 12px, checkbox tap target comfortable, Device rows aligned with other tabs, This Note band shows tasks from other pages with correct p.N, default-tab=On Device lands there via gesture/button open, ProjectView inherited styling looks right.

### Settings v2 implemented (F-023, same session)

Full rebuild of the settings screen per `design-settings-v2.md`:

- **New primitives** in `src/components/settings/index.tsx` (plugin-agnostic, destined for template/ once proven): `Section`, `SettingRow`, `Segmented` (the ONLY single-select -- selected cell inverts), `Check`/`CheckRow`/`CheckItem` (drawn 28px box, solid inner fill when checked -- fixed geometry, no ASCII glyph reflow), `InfoButton` + `InfoSheet` (one `?` affordance, one modal template fed by data).
- **Config.tsx rebuilt**: tabs gone; one scroll, five groups (Account & Sync / Opening SuperTask / Capturing Tasks / Projects / Debugging). Opener gestures moved out of "Handwriting"; debugging reunited (mode + server + diagnostics).
- **Apply-on-change**: every control persists immediately via `applyChange()` (serialized/atomic saves per B-025); changed row shows a static `Saved ✓` chip for 2s; header shows persistent `Saved HH:MM ✓` or bold `Session only -- device write failed`. Gesture keys hot-reload the detector. Global Save button removed. Exceptions with deliberate commit points: API token (explicit Save button next to the field), log server URL (commits on end-editing).
- **Dead setting deleted**: `defaultScreen` removed from UI and DEFAULT_CONFIG (T-005 item 2 resolved by removal).
- Decision recorded: no RN `Switch` (animates, OS-styled, gray) and native Supernote toggle pills are unreachable from the plugin RN tree -- drawn monochrome Views instead.
- On-device checks for this piece: control jitter gone (toggle a checkbox -- row must not reflow), per-row Saved chip appears/clears, settings persist WITHOUT any Save press (toggle bezel, close, reopen -- must stick), token save + test connection flow, project grid wraps sanely with 14 projects (external user count), no full-screen e-ink flashes on toggles.

### On-device finding during testing (2026-07-24): B-028 palm+pen false triggers

First live test caught a real false-positive: task home opened during normal writing. Log evidence (18-22-13): `BEZEL SWIPE (recovered from multi-tap): 2 fingers, 1059px up` and false `Three-finger tap (first)` lines while `PEN during FINGER hold` was active. Root cause: palm/hand-edge contacts DO reach the listener during writing (the old "palm rejection is perfect" research finding doesn't hold under real writing), and with two contacts far apart the MOVE y-coordinates jump between contact points -- phantom 1000px+ "displacement". Fix (same day): pen events cancel bezel tracking + poison multi-tap tracking (`penSeen`, also carried in from `_mixedInput`); the displacement-based bezel recovery path is deleted. Primary bezel path was confirmed working in the same log (539px, 343ms, 3 fingers). Retest checklist: extended writing with bezel ON (no false fires), three-finger double tap still works, deliberate bezel swipe still works.

### Builds

- **`SuperTask-s34-gestures-only.snplg`** (2026-07-23 20:36) -- part 1 only; bisect fallback, not for primary testing
- **`SuperTask.snplg`** (2026-07-24, pass 3 final) -- **install this one**: gesture overhaul + stability pass 2 + bezel swipe + local-first logging + ping tester/setup popup + new icon + 'SuperTask' sidebar name
- First run: check Settings > Connections > Debug Log Server shows the right IP (dev server prints it on startup; use Test button), and verify the sidebar shows the checkmark icon named 'SuperTask'; `session.log` should appear in MyStyle/SuperTask/logs/ after ~25 log entries

### On-device test additions for pass 2

1. Wifi-drop test: open TaskHome, kill wifi mid-load -- list must error/recover within ~65s worst case, and recover fully on next open (B-022)
2. Repeated lasso captures (10+) -- no progressive sluggishness (B-023)
3. Complete a task from a long-press deep link -- screen must close back to the note, not freeze (B-024)
4. Enable bezel swipe in settings, test 2- and 3-finger swipes from bottom edge; then write normally near the bottom for a while -- no false fires
5. Three-finger double tap must still work with bezel swipe enabled (both paths share multi-tap tracking)

## Session 34 -- Gesture stability overhaul (B-019 watchdog, B-020 leak, B-021 SDK-free onMsg)

## Session 34 -- Gesture stability overhaul (B-019 watchdog, B-020 leak, B-021 SDK-free onMsg)

Branch: `main`

### Context

Plugin was uninstalled from the device due to conflicts with regular note-taking and stability concerns (see `docs/handoff-gesture-stability.md`). This session implemented the fixes needed before reinstall.

### What's done

1. **B-019 amendment: the session 33 `withTimeout` fix could not have worked on its own.**
   - Flaw: `withTimeout` races SDK calls against `setTimeout`, but JS timers are suspended while the plugin view is closed (our own documented on-device learning from session 17) -- and gestures ONLY run while the view is closed. The safety net was made of the same suspended machinery it was protecting against.
   - New fix: **event-driven watchdog** in `onMsg`. If `_actionInProgress` has been held > 8s (`WATCHDOG_MS`), the next motion event force-clears it. Motion events are the one stream guaranteed to keep flowing while the view is closed. Worst case: one dropped gesture, never a dead session.
   - **Action token** (`_actionId`, `beginAction()`/`endAction(id)`): if the watchdog force-clears and a hung handler later resumes, its `finally` is a no-op instead of clobbering a newer action's guard.
   - `withTimeout` retained as first line of defense for contexts where timers do run.

2. **B-020: native element leak on scan timeout fixed.**
   - When `withTimeout(getElements(...))` timed out, the still-pending promise's eventual result was never `recycle()`d -- each timeout leaked a page of native-side elements.
   - Fix: on timeout, attach a `.then()` continuation to the original promise that recycles late-arriving elements.

3. **B-021: `onMsg` is now SDK-free (architectural refactor).**
   - Removed `preScanLinks`-on-every-DOWN (3 AIDL calls per finger touch, including during active writing -- leading hypothesis for the device-level interference).
   - `onFingerDown`/`onFingerMove`/`onFingerUp` are pure JS: coordinates, timestamps, drift, pointer counts only.
   - New `scanLinksAt(x, y)` runs only AFTER classification: in `handleLongPress` (link hit-test) and in `handleLassoAdd` (existing-link gate, replacing the sync `_preScanResult` fast-path).
   - Removed: `_linkScanPromise`, `_preScanResult`, `_scanGeneration` (no overlapping scans anymore -- scans run serially inside `_actionInProgress`).
   - Cost: long press does its scan after UP instead of overlapping the hold (~0.5-1s added before view opens; imperceptible next to showPluginView's ~2s). Decided against caching filePath/pageNum: scans are now so rare that a TTL cache would only add wrong-page staleness risk after page turns.
   - Answers handoff doc Phase 2 Hypotheses A & B by construction: normal touches now cost zero SDK calls and near-zero JS work.

4. **Lasso-add default 'off' + config semantics fix.**
   - `lassoGestureInput` default changed 'finger' -> 'off' in `config.js`. Rationale: hold-400ms-then-drag is indistinguishable from a paused scroll; false activations mid-note-taking are the other suspected driver of the "device feels unreliable" complaint.
   - Semantics fix: 'off' previously set `_configOff = true`, killing ALL gestures including long press and three-finger tap -- contradicting the Settings UI hint "Long press on a linked task always works (any mode)". Now 'off' only disables the quick-add gesture (`_gestureMode = 'off'`); `_configOff` removed entirely. Code now matches the UI promise.
   - Note for existing installs: config file persists in MyStyle/SuperTask/ across reinstalls, so a user who previously saved 'finger' keeps 'finger'. Only fresh configs get the new default.

### What needs testing on-device (next session)

1. **Watchdog recovery**: reproduce the B-019 scenario (touch canvas while plugin view showing / during wifi dialog, trigger a long press so a handler hangs), then verify gestures recover after ~8s + one touch. Look for `WATCHDOG: _actionInProgress stuck` in dev logs.
2. **Long press latency**: link long-press now scans after UP -- confirm it still feels acceptable.
3. **Lasso-add gate**: enable 'finger' mode in settings, verify lasso-add still blocked when starting on a linked task (gate moved to `handleLassoAdd`).
4. **Device feel during normal writing**: the whole point of B-021 -- extended normal note-taking session with the plugin installed, no gestures, verify no interference.
5. **Timer suspension check** (nice-to-have): log whether `withTimeout` ever fires while the view is closed -- confirms/refutes the timer-suspension assumption for the record.

### What's NOT done (carried forward)

- On-device testing of everything above (plugin still uninstalled)
- B-015: external user getElements diagnostics (per-touch spam should be gone post-B-021; scan success still unknown)
- B-004: Today/Upcoming tab filtering (enabledProjectIds)
- B-005: Renaming a note breaks task back-references
- B-014: Hardcoded A5X page size
- F-021: bezel swipe reintroduction
- T-004: SDK optimization pass

### Codebase audit (same session, after the gesture work)

Full stability audit of screens + utils/api/native layer. Findings logged as tracker items:
- **B-022 (critical)**: no fetch timeout anywhere + `taskCache._inflightPromise` poisoning -- one hung fetch kills task loading for the life of the process
- **B-023 (critical)**: `getLassoElements()` results never recycled in QuickAdd/Capture/ocr.js -- native memory leak on every capture
- **B-024 (high)**: untimed SDK awaits freeze screens while holding guard flags (TaskAdd duplicate-task risk, QuickAdd un-dismissable overlay, TaskDetail stuck buttons in deep-link mode)
- **B-025 (medium)**: non-atomic RNFS writes + RMW races (config/registry corruption; registry parse failure wipes task index)
- **B-026 (medium)**: `btoa` throw on non-ASCII config value silently discards saved config including API token
- **B-027 (medium)**: Diagnostics motion listener has no unmount cleanup (double-listening + setState after unmount)
- **T-005**: batch of low-severity items (stale `__superTaskButtonId`, unused `defaultScreen`, Capture navigate-while-hidden, pagination cap, 429 handling, debug URL staleness)

Verified clean: pagination unwrapping (`fetchAllPages` follows `next_cursor` correctly), debug.js log buffer (bounded at 500 entries), NoteOpenerModule.kt (all promise paths settle), timer-after-close patterns in screens, config singleton staleness. ocr.js and the rewritten gestureDetector.js noted as exemplary on timeout/recycle discipline.

**Fix order recommendation:** test tonight's build as-is (isolate the gesture overhaul), then a "stability pass 2" for B-022/B-023/B-024 before daily-driver use. B-023 matters most for the original device-degradation complaint; B-022 matters most for perceived reliability.

### Builds

- **Session 34 build: `build/outputs/SuperTask.snplg` (2026-07-23 20:36)** -- gesture overhaul (B-019/B-020/B-021 + lasso-add default off). Audit findings B-022..B-027 are NOT fixed in this build (deliberate -- isolate the gesture changes for testing).
- NOTE: `config.local.js` currently has `debugServerUrl: 'http://Alexs-MacBook-Pro.local:3000/log'` (mDNS hostname). Android often cannot resolve `.local` names -- if no logs arrive during testing, switch to the Mac's LAN IP and rebuild.

### Code changes

- `src/utils/gestureDetector.js` -- rewritten: event-driven watchdog + action token (B-019), timeout-leak recycling (B-020), SDK-free `onMsg` with post-classification `scanLinksAt` (B-021), `_configOff` removed, quick-add-only 'off' semantics
- `src/utils/config.js` -- `lassoGestureInput` default 'finger' -> 'off'
- `src/screens/Config.tsx` -- initial state matches new default
- `index.js` -- comment updated for new architecture
- `docs/tracker.md` -- B-019 amended, B-020/B-021 added, F-015 + B-015 notes updated
- `docs/handoff-gesture-stability.md` -- section 5 updated with the timer-suspension flaw + session 34 fix

## Session 33 -- Gesture death fix (B-019), cache/prefetch confirmed

Branch: `main`

### What's done

1. **B-019: Gesture detector death fix**
   - Root cause: SDK calls in `preScanLinks` (`getCurrentFilePath`, `getCurrentPageNum`) hang indefinitely when the plugin view is showing or during system-level interactions (wifi dialog, etc.). If a long press fires while the pre-scan is stuck, `handleLongPress` awaits the hung promise with `_actionInProgress = true`. The `onMsg` handler's `if (_actionInProgress) return;` check at the top silently drops ALL future motion events. Gestures never recover.
   - Evidence: On-device log showed DOWN at (259,109) with no "Pre-scan: page..." log (SDK calls hung), then LONG PRESS DETECTED, then zero gesture events for the rest of the session (all opens via toolbar BUTTON).
   - Fix: `withTimeout(promise, 5000)` wrapper on all SDK awaits in gesture handlers. Returns null on timeout, existing null-checks handle gracefully, `finally` block resets `_actionInProgress`.
   - 7 call sites wrapped: `preScanLinks` (getCurrentFilePath+getCurrentPageNum, getElements), `handleLongPress` (scanPromise), `handleLassoAdd` (scanPromise, lassoElements), `handlePenLassoAssist` (getLassoRect).

2. **B-017 confirmed on-device** -- log shows "Joining existing in-flight fetch" when TaskHome mounts during prefetch.

3. **B-018 confirmed on-device** -- warm opens show "Cache hit: 13 tasks (age: Xms)" at mount. Warm perceived latency ~1s (showPluginView overhead). Cold start ~5s (2s showPluginView + 2s RN mount, unavoidable SDK overhead).

4. **Dev server IP updated** -- `config.local.js` changed from `192.168.68.68` to `192.168.68.58` (IP changed). Requires rebuild to take effect (bundled into Hermes).

### On-device log analysis (2026-07-06)

Timing breakdown from three-finger double tap to task list visible:
- **Cold start**: gesture T+0 -> showPluginView T+2s -> React mount T+4s -> data T+5s -> registry T+9s
- **Warm start**: gesture T+0 -> cache hit + navigate T+0 -> visible at T+1s (showPluginView)
- Prefetch wins the race: API calls start at T+0 in gesture handler, responses arrive at T+5, React mounts at T+4 and joins in-flight fetch via dedup

### What's NOT done (carried forward)

- B-019: needs on-device testing to confirm timeout prevents gesture death
- B-015: external user getElements diagnostics
- B-004: Today/Upcoming tab filtering (enabledProjectIds)
- B-005: Renaming a note breaks task back-references
- B-014: Hardcoded A5X page size
- F-021: bezel swipe implementation
- T-004: SDK optimization pass

### Next session

- Test B-019 fix on-device: reproduce the scenario (open debug screen, touch screen while plugin view is showing, close, verify gestures still work)
- Rebuild with updated dev server IP to get live logs flowing again
- B-004 (Today/Upcoming filtering) is a quick win

### Builds

- Build 1: SDK timeout fix (B-019), updated dev server IP

### Code changes

- `src/utils/gestureDetector.js` -- `withTimeout()` helper, 7 SDK call sites wrapped with 5s timeout
- `config.local.js` -- dev server IP updated to 192.168.68.58

## Session 32 -- Task cache, prefetch, filesystem plugin concept

Branch: `main`

### What's done

1. **Task data cache + prefetch (B-017, B-018)**
   - New `src/cache/taskCache.js`: module-level cache with fetch deduplication (`_inflightPromise`)
   - Gesture handler (`handleThreeFingerDoubleTap`) now calls `fetchTaskData()` fire-and-forget BEFORE `openPluginView()` -- API calls start during React mount
   - TaskHome reads cache on mount for instant render (stale-while-revalidate), refreshes in background
   - `invalidateCache()` added at all mutation sites: TaskHome complete, TaskDetail complete/delete, TaskAdd create, QuickAdd create
   - B-017: concurrent mounts share one API call via dedup
   - B-018: cached data renders in ~100-300ms on second+ open instead of waiting for network

2. **F-017 complete -- tempLinkNav.js deleted**
   - Dead code since session 30 (native intent navigation replaced it)
   - No remaining imports or references

3. **F-021 added to tracker -- bezel swipe reintroduction**
   - Optional gesture alongside three-finger double tap
   - Wider bezel zone (3-5%), config-gated (default off), simpler trigger
   - Feasible now that the `_enabled` lifecycle bug is fixed

4. **Filesystem enhancement plugin concept**
   - New design doc: `docs/design-filesystem-plugin.md`
   - Separate plugin from SuperTask: note creation with naming conventions, quick page creation with date headers, TOC generation, folder dashboard
   - SDK APIs confirmed: `createNote`, `insertNotePage`, `insertElements`, `getTitles`, `getKeyWords`, `FileUtils.listFiles/makeDir`, native intents

5. **Committed sessions 28-31** (was all uncommitted)

### On-device test results (2026-07-06)

- **Cache + prefetch: PARTIAL.** Improvement visible but still feels a bit slow. Needs further investigation -- possible areas: (1) is the prefetch actually completing before TaskHome mounts? (2) is the cache read path fast enough? (3) is showPluginView itself the bottleneck? Check dev server logs for timing.

### What's NOT done (carried forward)

- B-018: further speed investigation (prefetch timing, showPluginView latency, possible disk cache for cold starts)
- B-017: verify dedup is working via dev server logs (look for "Joining existing in-flight fetch")
- B-015: external user getElements diagnostics
- B-004: Today/Upcoming tab filtering (enabledProjectIds)
- B-005: Renaming a note breaks task back-references
- B-014: Hardcoded A5X page size
- F-021: bezel swipe implementation
- T-004: SDK optimization pass (remaining on-device tests)

### Next session

- Review dev server logs from B-018 testing -- where is the remaining time going?
- Consider: disk cache for cold start, earlier showPluginView call (before config load?), reducing React mount overhead
- B-004 (Today/Upcoming filtering) is a quick win
- Filesystem plugin: scaffold from template if ready to prototype

### Builds

- Build 1: Task cache + prefetch, tempLinkNav deletion

### Code changes

- `src/cache/taskCache.js` -- new module (cache + dedup + invalidation)
- `src/utils/gestureDetector.js` -- prefetch call in handleThreeFingerDoubleTap
- `src/screens/TaskHome.tsx` -- cache-aware mount, applyData/reconcileRegistry helpers, simplified fetchData
- `src/screens/TaskAdd.tsx` -- invalidateCache after createTask
- `src/screens/QuickAdd.tsx` -- invalidateCache after createTask
- `src/screens/TaskDetail.tsx` -- invalidateCache after completeTask/deleteTask
- `src/utils/tempLinkNav.js` -- deleted (F-017 complete)
- `docs/tracker.md` -- F-017 done, F-021 added, B-017/B-018 status updated

## Session 31 -- Three-finger double tap, gesture lifecycle fix

Branch: `main`

### What's done

1. **Three-finger double tap (replaces bezel swipe F-014) -- CONFIRMED ON-DEVICE**
   - Removed bezel swipe: edge zone detection, page height caching, `fetchPageHeight`, `_bezelSwipe` state, late bezel recovery, `onBezelSwipeEnd`, `handleBezelSwipe`
   - Added three-finger double tap: `_multiTapTracking` tracks pointer count during multi-touch, `_threeFingerTap` records first tap timestamp, `onMultiTapEnd` evaluates two 3+ pointer taps within 800ms
   - Opens task home with user's `defaultTab` setting
   - Removed bezel swipe settings from Config.tsx (target selector, project picker overlay) and config.js (3 default keys)
   - First on-device test: 245ms between taps, immediate recognition

2. **Gesture lifecycle fix -- ROOT CAUSE of B-012 found**
   - **Discovery**: after three-finger double tap worked initially, navigating to a task detail and using "View Note" (intent navigation) left gestures permanently disabled. `noteOpener.js` called `closePluginView()` directly without `setGestureEnabled(true)`.
   - **Realization**: this was the same bug that made bezel swipe "unreliable" across multiple sessions. B-012 (phantom pointers) was real data but a red herring for the primary issue.
   - **Architectural fix**: removed `_enabled` flag and `setGestureEnabled()` entirely. The SDK's motion listener naturally stops receiving events when the RN plugin view is visible (full-screen touch interception). Only `_configOff` (user settings) remains.
   - Removed `setGestureEnabled` calls from: App.tsx (6), closePlugin.js (1), noteOpener.js (3), gestureDetector.js (2)
   - `openPluginView()` now calls `cancelGesture()` to clear stale state before showing the view. No re-enable needed -- events resume automatically when the view is dismissed.

3. **Documentation updates**
   - Updated tracker: F-014 (bezel -> three-finger), B-012 (resolved, root cause), B-016 (resolved, moot), B-018 (new: speed), F-020 (backlog: floating bubble)
   - Updated changelog: gesture lifecycle fix, three-finger double tap, B-012/B-016 resolution
   - Superseded session 21 changelog entry (which created the `setGestureEnabled` mechanism)

### On-device test results (2026-07-05)

- **Three-finger double tap: SUCCESS.** 245ms detection. Opens task home immediately.
- **Gesture persistence after intent navigation: SUCCESS.** After "View Note" (noteOpener), three-finger double tap still works on return to note.
- **Speed**: noticeable latency between gesture detection and task home render. Plugin view show + API fetch adds perceived delay. Tracked as B-018 for next session.

### What's NOT done (carried forward)

- B-018: Investigate three-finger double tap perceived speed
- B-015: External user getElements diagnostics
- B-017: TaskHome silent refresh spam
- T-004 remaining: on-device test of SDK optimizations
- B-004: Today/Upcoming tab filtering
- F-017 phase 2 cleanup: delete `tempLinkNav.js`
- Bezel swipe could be reconsidered as an additional gesture now that the lifecycle fix makes all gestures reliable

### Next session

- B-018: speed investigation (can `showPluginView` be called earlier? cached render?)
- Consider re-adding bezel swipe as an option (the lifecycle fix eliminated its primary failure mode)
- B-015: external user diagnostics
- Commit all changes

### Builds

- Build 1: Three-finger double tap (bezel swipe replaced)
- Build 2: + noteOpener gesture re-enable fix (partial, superseded)
- Build 3: + Full gesture lifecycle fix (removed `_enabled` entirely)

### Code changes

- `src/utils/gestureDetector.js` -- replaced bezel swipe with three-finger double tap, removed `_enabled` and `setGestureEnabled`, simplified to `_configOff` only
- `src/utils/config.js` -- removed `bezelSwipeTarget`, `bezelSwipeProjectId`, `bezelSwipeProjectName` defaults
- `src/screens/Config.tsx` -- removed bezel swipe settings section, project picker overlay, related state
- `src/utils/closePlugin.js` -- removed `setGestureEnabled` import and call
- `src/utils/noteOpener.js` -- removed `setGestureEnabled` import and calls (no longer needed)
- `App.tsx` -- removed `setGestureEnabled` import and all 6 call sites
- `docs/tracker.md` -- updated F-014, B-012, B-016, added B-018, F-020
- `docs/changelog.md` -- added session 31 entries

## Session 30 -- Native intent navigation, registry sync, dashboard research

Branch: `main`

### What's done

1. **F-017: Native intent navigation (phases 1-2) -- CONFIRMED ON-DEVICE**
   - Researched [AgP42/supernote-dashboard](https://github.com/AgP42/supernote-dashboard) (MIT) plugin which solved cross-note navigation via Android Intents.
   - Identified why SuperTask's previous attempt (session 15) failed: wrong activity class (`NoteMainActivity` vs `NoteInsidePagesActivity`), wrong extras (`only_open_file` vs `file_path`), `HostContext` interception (vs `reactApplicationContext`), FileProvider crash.
   - Rewrote `NoteOpenerModule.kt` with proven intent pattern. Added `openNote(path, page)`, `openFolder(path)`, `openDocument(path, page)`.
   - Updated `noteOpener.js` with clean API: each method handles `closePluginView()` internally (150ms delay).
   - Replaced `createTempLink` in `TaskDetail.tsx` with `openNote`. Same-note case now also jumps to exact page (was just closing with a hint).
   - Removed all `cleanupTempLink` calls from `App.tsx` (mount, navigate callback, button re-show). No cleanup needed since no artifacts are created.
   - Updated Diagnostics screen: replaced 6 strategy test buttons with single "openNote (p.1)" button.
   - `tempLinkNav.js` retained as dead code for one release cycle (nothing imports it).
   - Design doc: `docs/design-native-intents.md`

2. **Registry sync -- stale task cleanup**
   - Device tab showed 22 registry tasks vs 12 in Todoist (10 stale from deleted/completed tasks).
   - Added reconciliation in `TaskHome.tsx` `fetchData`: after API fetch, compare registry IDs against Todoist response, remove any not found.
   - Logs: `Registry sync: removing N stale tasks (deleted/completed in Todoist)`

3. **Documentation**
   - Created `docs/design-native-intents.md` -- full design doc with failure analysis, working patterns, phased plan.
   - Added F-017, F-018, F-019 to tracker.
   - Updated `docs/ratta-feedback.md` with community workaround for openFilePath.
   - Added native intent reference section to `CLAUDE.md`.

### On-device test results (2026-07-05)

- **openNote intent: SUCCESS.** Navigates directly to target note and page. No artifacts, no user interaction required. Confirmed both same-note and cross-note cases.
- **Registry sync: SUCCESS.** Stale tasks cleaned up on first TaskHome open.
- **Bezel swipe: INTERMITTENT.** Works after fresh install, then becomes unreliable during the same session. Logs show the gesture detector correctly rejects attempts (zero displacement from phantom pointers, insufficient travel), but it makes the gesture feel broken. Successfully fired twice in the log session (2-finger and 3-finger), but required multiple attempts. This is the existing B-012 phantom pointer issue, not a regression.

### Bezel swipe reliability decision needed

The bezel swipe gesture (F-014) has been persistently unreliable across multiple sessions and devices:
- **B-012**: Phantom pointer events after device wake report identical coordinates, causing 0px displacement rejection.
- **Multiple attempts needed**: Users must try 3-4 times before the gesture registers. Works once, then stops for a while.
- **Touch panel inconsistency**: Different devices report different pointer counts (3 on dev, 5 on external user).

**Options for next session:**
1. **Keep debugging** -- Add more diagnostics around the phantom pointer pattern, try ignoring zero-displacement pointers, debounce.
2. **Replace the gesture** -- Switch to something more reliable: toolbar button (guaranteed to work), long-press on a specific screen region, or the floating bubble pattern from the dashboard plugin (always-visible, survives plugin close).
3. **Make it optional with a better default** -- Keep bezel swipe as an option but add a more reliable primary entry point.

### What's NOT done (carried from session 29)

- Deploy diagnostic build to external user for B-015 (getElements errors)
- B-016: Widen bezel zone from 1% to 3-5%
- B-017: TaskHome silent refresh spam
- T-004 remaining: on-device test of SDK optimizations (code changes exist, not built)
- B-004: Today/Upcoming tab filtering

### Next session

- **Decide on bezel swipe**: debug further or replace the gesture
- B-015: external user getElements diagnostics
- Consider committing all outstanding changes (sessions 28-30 have accumulated uncommitted work)
- F-017 phase 2 cleanup: delete `tempLinkNav.js` if intent navigation is stable after another session

### Builds

- Build 1: Native intent navigation (NoteOpenerModule rewrite, tempLink removal)
- Build 2: + Registry sync (stale task cleanup)

### Code changes

- `android/app/src/main/java/com/supertask/NoteOpenerModule.kt` -- complete rewrite: 6 experimental strategies replaced with single proven approach
- `src/utils/noteOpener.js` -- clean API with `openNote`, `openFolder`, `openDocument`
- `src/screens/TaskDetail.tsx` -- `createTempLink` replaced with `openNote` intent
- `App.tsx` -- removed `cleanupTempLink` import and all 3 call sites
- `src/screens/Diagnostics.tsx` -- replaced strategy test buttons with single openNote test
- `src/screens/TaskHome.tsx` -- added registry sync reconciliation in `fetchData`
- `docs/design-native-intents.md` -- new design doc
- `docs/tracker.md` -- added F-017, F-018, F-019
- `docs/ratta-feedback.md` -- added community workaround discovery
- `CLAUDE.md` -- added native intent navigation reference section

## Session 29 -- External user log analysis, getElements diagnostics

Branch: `main`

### What's done

1. **Analyzed external user logs (different device/build)**
   - User running session 27 build (v0.2.0) without session 28 fixes.
   - Confirmed bezel swipe would have worked with 2500ms threshold: one attempt had 2168ms duration, 1435px displacement, 5 pointers -- failed only on the 1200ms limit.

2. **Improved getElements diagnostic logging (B-015)**
   - Pre-scan `getElements` failure now logs error code, error message, page number, success value, and result type.
   - Previous log was just `"Pre-scan: getElements failed"` with no diagnostic detail.
   - File: `src/utils/gestureDetector.js` line 590-592.

### Key findings from external user logs

- **B-015: `getElements` fails on EVERY pre-scan call.** Across multiple notes and pages, every `getElements` call returns a failure. Long-press-to-view-task is completely broken for this user. Root cause unknown -- need the error code from the improved logging. Could be device/firmware specific, note format, or permissions.
- **Touch panel reports up to 5 simultaneous pointers** (PTR_DOWN[4], ptrs=5). Contradicts earlier finding that Supernote caps at 3. Different device model or firmware. Our `maxPointers >= 2` check still works correctly.
- **B-016: Accidental lasso near bezel zone.** User touches at y=1848-1850 are just outside the 1% bezel zone (threshold is y > 1853). These enter the standard gesture path, trigger wasted pre-scans, and occasionally enter lasso mode (12x40px, 35x57px -- too small, correctly rejected). Widening the bezel zone from 1% to 3-5% would prevent this.
- **B-017: TaskHome silent refresh spam.** Three "silent refresh" cycles fired in 3 seconds (5:02:49-5:02:52), each making 2 API calls (tasks + projects). Likely a re-render loop.
- **Gesture mode is `finger`** (not `pen-lasso`) -- user sees "PEN during FINGER hold -- cancelling" which blocks pen interaction during gestures.
- **Event count at #57183+** -- motion listener has been running continuously for a very long session without restart. No apparent issues from this, just notable.
- **User has 14 projects, 26 tasks** -- larger dataset than dev testing (5 projects, 13 tasks). API calls all succeed.
- **Plugin reinstall required** -- Alex confirmed bezel gesture didn't work until full uninstall/reinstall. Supernote may cache stale plugin bytecode during upgrade-in-place.

### What needs testing

- Session 28 build with diagnostic improvement deployed to external user
- External user's getElements error codes (once new build is deployed)
- Session 28 bezel fixes (2500ms threshold + late recovery) on both devices

### Next session

- Deploy session 28 + diagnostic build to external user, collect new logs
- Based on getElements error code, diagnose and fix B-015
- Consider widening bezel zone from 1% to 3-5% (B-016)
- Investigate TaskHome silent refresh spam (B-017)
- T-004 remaining: on-device test of SDK optimizations
- B-004 remaining: Today/Upcoming tab filtering

### Builds

- No new build this session (code change only: diagnostic logging)

## Session 28 -- SDK optimization (T-004), bezel swipe audit

Branch: `main`

### What's done

1. **T-004: SDK call optimization pass (4 locations)**
   - `TaskAdd.tsx` handleConvertToText: replaced 8-call hybrid pattern with `insertTextLink` (5 calls). Removed intermediate `saveCurrentNote`, `reloadFile`, diagnostic `getLassoElements`. Matches QuickAdd's optimized pattern.
   - `tempLinkNav.js`: removed `reloadIfOnPage` function and both call sites. Plugin view covers the note during cleanup, reload is invisible. Saves up to 3 bridge calls per temp link cleanup.
   - `ocr.js` getPageContext: 5 sequential SDK calls batched into 2 parallel groups via `Promise.all`. Batch 1: getCurrentFilePath + getCurrentPageNum + getDeviceType. Batch 2: getPageSize + getFileMachineType. Each has per-call `.catch()` for error handling.
   - `Capture.tsx` runCapture: project fetch (`getProjects`) parallelized with lasso capture via `Promise.all`. Projects load while OCR runs.
   - `TaskAdd.tsx`: fixed pre-existing TS error (removed extra `notePath` param in `registryAddTask` call).

2. **Bezel swipe duration fix: 1200ms -> 2500ms**
   - Session B log revealed 13 consecutive bezel swipe failures, all "too slow". Bezel zone detection was working (y=1868-1871), displacement was strong (280-846px), but natural 3-finger swipe takes 1400-2000ms. The 1200ms limit was too strict.
   - Increased `BEZEL_SWIPE_MAX_MS` from 1200 to 2500.

3. **Bezel late recovery (coordinate misreporting workaround)**
   - Session A log showed the digitizer misreporting initial DOWN at y=884 instead of y~1860 during 3-finger bezel entry. The bezel zone check failed, gesture entered standard path, multi-touch cancelled it, pre-scan bridge calls wasted.
   - PTR_DOWN now retroactively enters bezel tracking instead of cancelling. Recovery mode uses relaxed thresholds: 80px displacement (vs 150px) for 3+ pointers, 3500ms duration.
   - Untested on-device.

4. **Comprehensive gesture audit doc: `docs/design-gesture-audit.md`**
   - Full event flow diagram, all failure modes documented with log evidence, priority-ordered fix list, recommended next steps.

### Key findings

- **Duration was the primary bezel failure** -- not coordinate misreporting or pre-scan conflicts. 13/14 swipes in session B had correct bezel coordinates but exceeded the 1200ms limit.
- **OCR parallelization doesn't help perceptibly** -- page context SDK calls are already fast (~sub-second total). The `recognizeElements` call (2s) dominates OCR time and can't be parallelized.
- **SDK native bridge likely serializes calls** -- `Promise.all` sends calls simultaneously from JS, but the AIDL service may process them sequentially. Parallel batching reduces JS-side overhead but may not reduce wall-clock bridge time.
- **Pre-scan on DOWN creates bridge congestion during failed multi-touch** -- 6 DOWNs in 7 seconds = ~18 wasted bridge calls. The bezel recovery code mitigates this by cancelling the standard gesture on PTR_DOWN.
- **Touch panel caps at 3 simultaneous pointers** -- `maxPointers >= 3` is effectively `== 3` on Supernote hardware.
- **Phantom multi-touch (B-012) occurs without device sleep** -- PTR_DOWN at identical coords to initial DOWN, then instant PTR_UP. Not just a wake-from-sleep issue.

### What needs testing

- Bezel swipe with 2500ms threshold -- should catch most natural 3-finger swipes
- Bezel late recovery -- does it fire correctly when coordinates are misreported?
- TaskAdd convert-to-text via toolbar capture (not QuickAdd) -- the insertTextLink pattern
- Temp link cleanup without reloadFile -- does the deleted link disappear when plugin closes?

### Next session

- Test all uncommitted changes on-device
- Commit once verified
- If bezel swipe works reliably, consider the pre-scan skip for lower page region (reduces bridge waste further)
- B-004 remaining: Today/Upcoming tab filtering
- Update tracker: T-004 status, any new bezel bug entries

### Builds

- `build/outputs/SuperTask.snplg` -- session 28 build (T-004 optimizations + bezel fixes, uncommitted)

## Session 27 -- Bezel swipe config (F-014), SDK optimization, project filter (B-004)

Branch: `main`

### What's done

1. **F-014 DONE: Bezel swipe target config** -- Configurable in Settings > Preferences. Options: Default tab, Today, Upcoming, Projects, or Specific project. Overlay picker for project selection. Deep link navigates directly to project-view or task-home with the chosen tab. Safe fallback to default tab when target is 'project' but no project configured.

2. **Convert-to-text optimization: 9 SDK calls -> 4** -- Replaced the hybrid `insertText` + `lassoElements` + `setLassoStrokeLink` pattern with a single `insertTextLink` call. Removed 2 intermediate `saveCurrentNote` calls and the unnecessary `reloadFile`. Result: ~1 second instead of ~3 seconds on-device. See `docs/design-sdk-optimization.md`.

3. **B-004 partial fix: Projects tab honors enabledProjectIds** -- Projects tab now shows all projects (including empty ones like Inbox). When `enabledProjectIds` is set in Settings, only selected projects appear. Previously, empty projects were hidden and the filter setting was ignored. Today/Upcoming tab filtering still open.

4. **ProjectView back button fix** -- Back from a deep-linked project-view (bezel swipe) now falls back to `resetTo('task-home')` when there's no stack to pop.

5. **Nomad confirmed: same dimensions as A5X** -- Device type 4, page size 1404x1872, EMR range maxX=15819 maxY=11864. All within A5X parameters. B-014 downgraded -- hardcoded values are correct for both devices.

6. **App.tsx deep link support** -- `getInitialScreen()` handles `view-project` action and dynamic `focusTab` for first-mount path.

### Key findings

- **Native bridge round-trips are the bottleneck** -- each SDK `await` crosses the RN native bridge to the Android AIDL service. On e-ink hardware, fewer sequential calls matters more than faster individual calls.
- **`insertTextLink` is dramatically faster** than the hybrid insert+lasso+link approach. Trade-off: breaking the link removes the text (atomic), but the task lives in Todoist regardless.
- **Intermediate saves are unnecessary** -- `deleteLassoElements` and `insertTextLink` both operate on in-memory note state. A single `saveCurrentNote` at the end flushes everything.
- **`reloadFile` is unnecessary under the plugin view** -- the plugin's full-screen RN view covers the note. Display refreshes when the plugin closes.

### Next session

- **T-004: SDK call optimization pass** -- Apply the optimization principles from `docs/design-sdk-optimization.md` to remaining hot paths. See tracker for specific locations and approach.
- **B-004 remaining: Today/Upcoming tab filtering** -- `enabledProjectIds` is honored in Projects tab but not yet applied to Today/Upcoming views.
- **B-014 cleanup** -- Replace hardcoded A5X fallbacks with device-type lookup (low priority, values are correct for both devices).
- **Strip verbose diagnostic logging** -- fetchPageHeight logs, bezel config debug logs.

### Builds

- `build/outputs/SuperTask.snplg` -- v0.2.0 (versionCode 4), bezel swipe config + convert-to-text optimization + project filter

## Session 26 -- Bezel swipe gesture (F-014), Nomad device audit

Branch: `phase3-harmony`

### What's done

1. **F-014 CONFIRMED: Bezel swipe to open task home** -- Multi-finger (2+) swipe up from the bottom 1% of the canvas opens task home. Detection: DOWN in bottom edge zone + PTR_DOWN tracking (not cancelling) + upward displacement > 150px + duration < 1200ms. Page height fetched dynamically via `getPageSize()` (no hardcoded default). Confirmed on-device: 3 fingers, 370-450ms, 470-780px displacement. Repeatable.

2. **Page height caching strategy** -- Init-time `fetchPageHeight()` fails silently (note context not ready at startup). Fix: pre-scan fallback caches page height on first canvas interaction. Real users always interact before swiping, so first-swipe edge case is testing-only.

3. **B-014 documented: Hardcoded A5X page size may break Nomad** -- Found multiple locations defaulting to 1404x1872: `ocr.js:91`, `Capture.tsx:46-59` (EMR constants), `tempLinkNav.js:96-97`. These could cause incorrect lasso bounds and recognition failures on Nomad (deviceType=4). Gesture detector itself is safe (uses runtime page height, fail-closed). Need Nomad device data to confirm.

4. **Build caching discovery** -- Supernote plugin system caches extracted JS bundles aggressively. Version bump (versionCode) alone doesn't force refresh. Reliable deploy requires: bump versionCode + clean `build/generated` + `build/outputs` + device reboot or full uninstall/reinstall cycle.

### Key findings

- **`fetchPageHeight` at init fails** because `getCurrentFilePath()` returns empty before the note is fully loaded. The pre-scan fallback (piggybacks on first gesture's file path fetch) resolves this cleanly.
- **Bezel edge threshold works at 1%** -- y > pageHeight * 0.99. On A5X that's y > ~1853. Touches at y=1868-1871 consistently trigger it.
- **3-finger swipes from bottom edge have zero conflicts** with existing gestures (long press, lasso-add) or system gestures. The bezel zone is too narrow for accidental activation.
- **`getPageSize()` returns `{result: {width, height}}`** on A5X -- confirmed from pre-scan fallback log.

### Builds

- `build/outputs/SuperTask.snplg` -- v0.2.1 (versionCode 3), bezel swipe + diagnostic logging

| Phase | Status | Summary |
|-------|--------|---------|
| 1a: Scaffold | Done | Plugin structure, button registration, screen routing |
| 1b: Config + connection | Done | Todoist API v1 verified on-device (29 tasks) |
| 1c: Dev tooling | Done | HTTP dev log server streaming to Mac |
| 2: Task viewer | Done | Stack nav, tabbed home, project drill-down, detail/add, date picker |
| 3: Post-action + config | Done | Add Another/Done/View Task flow, silent refresh, tabbed config |
| 5: Lasso capture | Done | Handwriting OCR via recognizeElements, pre-fills TaskAdd |
| 5b: Task marking | Done | Replaced with supertask:// linking (see 10a). T badge removed. |
| 5c: This Page | Done | Element scan + registry + description matching. Confirmed on-device. |
| 5d: Mark as Text | Done | Convert to Text applies supertask:// link to typed text box. |
| 5e: Quick-add overlay | Done | Overlay working. Both Done and Convert to Text use supertask:// link. |
| 5f: Settings redesign | Done | Compact horizontal e-ink layout, tabbed Connections/Preferences. markAsTextLink setting removed. |
| 7: Config persistence | Done | RNFS build with XOR obfuscation. |
| Native modules | Done | Gradle build pipeline for native modules. react-native-fs added. ProGuard/R8 configured. |
| Debug mode | Done | Toggle in Config Preferences, hides Log/trace when OFF |
| 10a: Bidirectional linking (data) | Done | supertask:// links in notes, description back-references, task registry, page/device discovery. See Session 16. |
| 10b: Bidirectional linking (interactive) | Done | Long-press on supertask:// link opens task detail. View Note closes plugin (same note) or shows path (cross-note). Cross-note nav blocked by B-002. |
| 10c: Offline mode | Future | Cache last API response in registry. Queue creates/completes locally. Sync on reconnect. |
| 9: Task dashboard | Backlog | All APIs confirmed: createNote, insertTextLink, insertNotePage, replaceElements. |
| 4: Subtasks | Backlog | parent_id support, subtask list in detail view |
| 6: Doc capture | Backlog | PDF text selection, same flow as lasso |
| 8: Polish | Backlog | Loading states, error handling, empty states |

## Session 25 -- Pen lasso quick-add (F-016), docs overhaul, beta release

Branch: `main`

### What's done

1. **F-016 DONE: Pen lasso + finger hold to quick-add** -- Hold finger on screen, draw native lasso with pen (user sees the visible lasso outline), lift finger. On finger UP, gesture detector calls `getLassoRect()` to check if a native lasso selection is active. If yes, opens QuickAdd with the lassoed content. If no lasso (error 904, user was just writing), silently ignored. Key discovery: `getLassoElements()` and `getLassoRect()` return data from a native lasso even when the plugin wasn't opened via the lasso toolbar button. Confirmed on-device.

2. **Config: Quick Add Gesture toggle** -- Three options in Settings > Preferences: Off, Finger lasso (existing hold-drag), Pen lasso (new). Info popup (i) explains how each mode works. Long press to open linked tasks works in all modes.

3. **Repo docs overhaul** -- Renamed `README.md` to `SDK-REFERENCE.md` (full API reference). New repo `README.md` (standard landing page). New `plugins/SuperTask/README.md` (user-facing: install, setup with 3 token entry methods, usage, config, limitations).

4. **Ratta feedback refined** -- Restructured from SuperTask-centric blockers to general SDK feedback: what we noticed, why it matters for any plugin, potential use cases, our workaround, suggestion. 8 items covering EMR mismatch, openFilePath, goToPage, writeFile, element fill, background execution, maxX/maxY semantics, penType 16.

5. **First public beta release** -- v0.1.0-beta on GitHub with `.snplg` attached. Repo made public.

6. **Merged `supertask-ui-redesign` into `main`** -- All development on main going forward, no complex branching.

### Key findings

- **Native lasso interception works.** `getLassoElements()` and `getLassoRect()` are available immediately after a pen-lasso completes, even without the plugin being opened via the lasso bar button. The lasso context persists until consumed or the plugin UI opens.
- **`getLassoRect()` is the lightweight probe.** No elements to recycle, just a rect check. Let QuickAdd handle the full `getLassoElements()` call.
- **Error 904 is the clean signal.** When user was writing (not lassoing), `getLassoRect()` returns 904 "No lasso action." No false positives observed.
- **Lasso context consumed after first read + plugin open.** Delayed probes (t=200ms, t=500ms) returned empty after the plugin UI mounted. Opening QuickAdd immediately on finger UP is the right timing.

### Next session

- **F-014: Triple-finger swipe to open task home** -- Research whether Supernote reserves three-finger gestures. Test detection via motion listener.
- **B-004: Project filter not honored** -- Selected projects in settings aren't filtering today/upcoming/projects views.

### Builds

- `build/outputs/SuperTask.snplg` -- session 25, pen lasso quick-add + gesture config

## Session 24 -- OCR fix (B-013), unified OCR utility, redesign planning

Branch: `supertask-ui-redesign`

### What's done

1. **B-013 FIXED: recognizeElements error 117 on lower page region** -- Root cause: A5X (`getDeviceType()` returns 3) reports `getPageSize()` as 1404x1872 but its digitizer produces EMR values up to maxX=20967/maxY=15725, exceeding the documented A5X range (15819/11864) and falling within Manta range (21632/16224). The `recognizeElements` API uses the passed `size` param for EMR-to-pixel mapping; passing 1404x1872 clipped strokes in the lower page region. Fix: detect actual EMR range from element `maxX`/`maxY`, pass Manta page size (1920x2560) when values exceed A5X range. Confirmed on-device -- recognition now works across entire page.

2. **Unified OCR utility (`src/utils/ocr.js`)** -- Extracted duplicated OCR pipeline from Capture.tsx and QuickAdd.tsx into a shared module. Single export `recognizeLassoElements(elements, logFn)` handles: page context fetch, element diagnostics, type filtering (strokes + text boxes only), EMR range detection, device type logging, and `recognizeElements` call with full response logging. Both screens now call this instead of maintaining parallel implementations.

3. **B-012 updated** -- Gesture hang after sleep confirmed as digitizer wake transients (phantom PEN events and instant PTR_DOWN at identical coords). Not genuine multi-touch. Potential fix: debounce PEN events, ignore same-coord PTR_DOWN within 50ms.

4. **Ratta feedback doc** (local, `docs/ratta-feedback.md`) -- 8 items: EMR mismatch bug, openFilePath behavior, missing goToPage/writeFile/element-fill/background-execution APIs, questions about element maxX/maxY semantics and penType=16.

5. **Task home redesign doc** (local, `docs/design-task-home-v2.md`) -- Todoist feature gap analysis and prioritized plan: labels (P1), inbox workflow (P2), sections (P3), comments (P4), subtasks with multi-line OCR detection (P5), enriched TaskRow metadata (P6).

### Key findings

- **A5X EMR range undocumented**: Official docs list A5X max as 15819x11864, but actual device produces 20967x15725. Likely hardware revision with Manta-class digitizer.
- **EMR-to-recognition mapping**: `recognizeElements` infers EMR range from the `size` param. Wrong size = clipped strokes = error 117 for bottom-of-page content. Top-of-page works because lower EMR values happen to stay within the assumed range.
- **Gesture wake transients**: After device sleep, digitizer emits phantom pen proximity and duplicate-pointer events for a brief period. Current mixed-input guards treat these as real, causing repeated gesture cancellation.

## Session 23 -- lasso-add gate, structural fixes, confirmed on-device

Branch: `phase3-harmony`

### What's done

1. **Lasso-add gate for linked content** -- If finger DOWN is on content that already has a supertask:// link, lasso-add is blocked. Two-tier approach: (a) sync fast-path in `onFingerMove` checks `_preScanResult` before entering lasso mode, (b) async fallback in `handleLassoAdd` awaits the pre-scan promise (already settled by UP). No additional SDK calls -- reuses the pre-scan that fires on every DOWN.

2. **`_actionInProgress` structural fix** -- Both `handleLongPress` and `handleLassoAdd` now wrap their entire body in a single `try/finally` after setting `_actionInProgress = true`. Any early return (gate abort, no link found, no content selected) always hits the `finally`. Previously, early returns in `handleLassoAdd`'s gate check exited without clearing the flag, permanently killing the gesture listener.

3. **Pre-scan `.then()` race condition fixed** -- The callback that caches results in `_preScanResult` now captures the generation counter (`const gen = ++_scanGeneration`) and only writes if `gen === _scanGeneration`. Stale pre-scans from cancelled native lasso/pen operations can no longer overwrite a current gesture's scan result.

4. **B-007 confirmed fixed** -- Long press on empty space correctly ignored on-device.

5. **F-015 confirmed working** -- Lasso-add on fresh content, gate blocking on linked content, long press on links, and no freeze after gate fires -- all verified on-device.

### Known issues

- **B-012: Phantom pen/multi-touch** -- Observed in session 22 testing but NOT in session 23. Single phantom pen event cancels gesture + 500ms cooldown blocks retries. May require sustained pen activity threshold (future fix).
- **recognizeElements error 117** -- OCR fails on some lasso selections (16 strokes, 5 strokes) with code 117 "Recognition failed." Native handwriting conversion works fine on the same content. Reproducible. Key question: what differs between our programmatic `lassoElements(rect)` + `getLassoElements()` + `recognizeElements()` path vs the native OCR? Investigate next session -- compare element data, page size params, stroke filtering.

### Key implementation details

**Gesture detector (finger-only):**
- Long press: DOWN, hold 800ms+, no drift >20px, UP -> pre-scan link hit-test -> task detail
- Lasso-add: DOWN, hold 400ms+, then move >20px, UP -> gate check -> `lassoElements(bbox)` -> QuickAdd
- Gate: `_preScanResult?.taskId` blocks lasso mode entry (sync); `await _linkScanPromise` blocks `handleLassoAdd` (async fallback)
- Neither: movement before 400ms = normal touch, ignored
- Guards: mixed input (pen during finger), multi-touch (PTR_DOWN), config off, UI open, linked content gate

**Pre-scan generation counter + sync cache:**
```
DOWN → gen = ++_scanGeneration
_linkScanPromise = preScanLinks(x, y, gen).then(r => {
  if (gen === _scanGeneration) _preScanResult = r;  // only current gen writes
  return r;
});
```

**`_actionInProgress` lifecycle:**
```
handleLassoAdd / handleLongPress:
  if (_actionInProgress) return;  // re-entry guard
  _actionInProgress = true;
  try {
    ... all logic, including early returns ...
  } finally {
    _actionInProgress = false;  // ALWAYS clears
  }
```

### Builds

- `build/outputs/SuperTask.snplg` -- session 23, lasso gate + structural fixes

## Session 20 -- gesture fixes, lasso-add (F-015)

Branch: `supertask-ui-redesign`

### What's done

1. **Cross-note nav complete** -- Temp link at 3% from top (percentage-based, scales across devices), shows task name in link text. Off-by-one fix (pageNum already 0-indexed). Cleanup via deleteElements confirmed on-device.

2. **Gesture regression fixed** -- `ptrs > 1` mixed-input check was blocking ALL finger long presses because Supernote always reports finger as PTR_DOWN with ptrs=2 (device quirk, not pen hover). Fixed by checking pen `toolType` only; two-finger lasso is caught by drift threshold.

3. **Quick lasso-add gesture (F-015) implemented** -- Hold finger/pen 400ms then drag to draw selection. Programmatic `lassoElements(bbox)` + opens QuickAdd. Configurable input (finger/pen) in Settings > Handwriting. Pre-check removed (element coords are EMR, not pixel).

4. **Config UI** -- Radio button style for lasso input (Finger/Pen), matching existing preference patterns. `reloadGestureConfig()` called on save.

5. **QuickAdd panel** -- Moved to 10% from top (flex-start + paddingTop) to avoid handwriting zone collision.

6. **Tracker/changelog updated** -- B-001, B-002, F-002, F-013 closed. F-014 (edge swipe), F-015 (lasso-add) added. design-offline-mode.md placeholder created.

7. **build.sh** -- Repo-root wrapper script fixes iCloud path space issue for builds.

### Bugs to fix next session (F-015 lasso-add)

**Bug 1: Two-finger lasso triggers pen gesture incorrectly**
When doing native two-finger lasso (fingers anchor + pen draws), our detector picks up the PEN events as a new gesture. Sequence: fingers down → correctly cancelled → but then PEN DOWN starts fresh tracking → enters lasso mode → opens QuickAdd with empty selection. Fix: if multiple pointers (ptrs > 1) are active when PEN DOWN arrives, do NOT start gesture tracking. The lasso-add gesture must only activate with a single input (one finger or pen alone).

**Bug 2: `_mixedInput` not checked in lasso UP path**
Even when "FINGER activity during hold -- cancelling" fires during a pen lasso, the lasso UP code path still proceeds because it only checks `_lassoMode && _lassoBbox && toolType === _lassoToolType`, NOT `_mixedInput`. Fix: add `&& !_mixedInput` to the lasso UP condition in `onFingerUp`.

**Bug 3: `lassoElements` result check is wrong**
`{"result":false,"success":true}` means the API call succeeded but nothing was selected. Current check `if (!result?.success)` passes because `success` is true. Then QuickAdd opens to an empty selection showing "No elements selected." Fix: check `if (!result?.success || !result?.result)` before opening plugin.

**Bug 4: Pen mode captures the lasso-drawing stroke (design issue)**
In pen mode, the pen stroke that DRAWS the lasso selection area is written to the note itself. When `getLassoElements()` runs, it captures these strokes as part of the selection. OCR then fails because these aren't handwriting -- they're the selection border. The user's suggestion: after `lassoElements(rect)` succeeds, delete the pen stroke that formed the selection (the stroke drawn between the initial hold and finger UP). This requires identifying and removing the last-inserted stroke(s) from the lasso result, or doing an undo-like operation. Need to research: can we delete specific elements from an active lasso, or should we filter them out before OCR?

**Bug 5: OCR fails on area with content ("0 strokes of 9 total")**
`getLassoElements` returned 9 elements but `filter(el => el.type === 200)` found 0 strokes. All 9 elements were non-stroke types (links, text boxes). This happened in a region that visually had handwriting -- unclear why strokes weren't captured. Possibly the lasso rect was slightly off from the actual stroke positions. Edge case but worth investigating coordinate accuracy.

### Confirmed on-device

- Cross-note temp link creation + navigation + auto-cleanup: WORKING
- Finger long-press on supertask:// link: WORKING (regression fixed)
- Quick lasso-add gesture detection (finger mode): WORKING (enters lasso mode, bbox computed)
- Quick lasso-add gesture detection (pen mode): PARTIALLY WORKING (detects but has bugs above)
- Settings radio buttons for lasso input: WORKING
- QuickAdd panel positioning at top: WORKING

### Builds

- `build/outputs/SuperTask.snplg` -- session 20, has bugs 1-5 above

## Session 19 -- cross-note navigation (B-002)

Branch: `phase3-harmony`

### What's done

1. **Temp link approach confirmed** -- `insertTextLink` with `linkType:1` + `destPath` (full path to target .note) creates a tappable link that the NOTE app handles internally. No intents, no native modules. Confirmed on-device: link appears, tap navigates to target note.

2. **Full path storage** -- Task description metadata and task registry now store the full note path (`/storage/emulated/0/Note/Plugin Dev/file.note`) instead of just the filename. Fixes the "destination file does not exist" error when notes are in subdirectories. `parseNoteContext` in TaskDetail supports both legacy (filename-only) and new (full path) formats.

3. **Cleanup infrastructure** -- `tempLinkNav.js` utility with `createTempLink()` and `cleanupTempLink()`. Cleanup triggers on: first mount, button re-show, and gesture re-show. Uses `deleteElements` or `removeNotePage` depending on approach. Pending state persisted to `/MyStyle/SuperTask/pending-temp-link.json`.

4. **NoteOpener native module reverted** -- FileProvider in AndroidManifest was crashing plugin registration. Intent-based strategies confirmed dead end (all open file manager, not editor). Native module code reverted to committed state.

5. **New SDK API noted** -- `PluginFileAPI.deleteElements(notePath, page, numsInPage[])` available in sn-plugin-lib 0.1.43+. Simpler than getElements+filter+replaceElements.

### What's confirmed on-device

- `insertTextLink` with cross-note destPath: SUCCESS (link renders, tap navigates)
- `deleteElements` for cleanup: NOT YET TESTED (cleanup didn't trigger in test due to re-show vs mount issue, now fixed)
- `removeNotePage` for temp page cleanup: NOT YET TESTED
- `createElement(600)` + `insertElements` for link on new page: NOT YET TESTED

### What's next -- UX placement decision

The link works. The question is where to put it so it's visible without disrupting the user's note content.

**Option A: Current page, prominent overlay-style**
- Pros: No extra steps, link is immediately tappable after plugin closes
- Cons: Overlaps existing handwriting/content on busy pages. No background/fill capability in SDK to blank out area behind it. `textFrameFillColor` exists in native model but is not exposed to JS.
- Implementation: Large centered `insertTextLink` + `insertText` for explanation. Cleanup via `deleteElements`.

**Option B: New page after current**
- Pros: Clean blank canvas, no content overlap, prominent centered link with explanatory text
- Cons: User must swipe to next page manually. No `goToPage` API exists. Message says "Swipe to next page" but adds friction.
- Implementation: `insertNotePage` + `createElement(600)` + `insertElements` on new page. Cleanup via `removeNotePage`.

**Option C: Wait for Ratta to add a direct navigation API**
- Likely coming given `destFileId`/`destPageId` fields exist in native Link model (commented out in serialization). For now, temp link is the workaround.

**SDK constraints confirmed:**
- No `goToPage` / page navigation API
- No fill/background on elements (geometry has pen color only, textFrameFillColor not exposed)
- `insertImage(pngPath)` exists but doesn't accept positioning coordinates
- `insertTextLink` / `insertText` only work on current in-memory page (PluginNoteAPI)
- `insertElements` (PluginFileAPI) can target any page but requires manually constructed Element objects

### Current code state

- `src/utils/tempLinkNav.js` -- currently implements Option B (new page). Has both approaches coded; can switch to Option A by reverting to the earlier version in git.
- `App.tsx` -- imports `cleanupTempLink`, runs on mount + button re-show + gesture re-show
- `TaskDetail.tsx` -- `handleViewNote` calls `createTempLink` for cross-note, uses full path from `noteContext.notePath`
- `src/screens/QuickAdd.tsx` + `TaskAdd.tsx` -- store full path in description + registry

### Builds

- `build/outputs/SuperTask.snplg` -- session 19, Option B (new page) build. createElement(600) approach untested on device.

## Session 18 -- deep link routing and gesture hardening

Branch: `supertask-ui-redesign` (continued from session 17)

### What's done

1. **Deep link routing fixed** -- `getInitialScreen()` only runs on first mount. For re-show (showPluginView on already-mounted App), gesture detector calls `global.__superTaskNavigate` directly. For first-mount, `getInitialScreen()` reads the deep link global as before.

2. **Gesture detector moved to index.js** -- `initGestureDetector()` now runs at plugin init, so long-press works on fresh note views without ever opening the plugin UI first. App.tsx still calls it as a guard.

3. **False trigger prevention** -- pen activity (toolType 2) or multi-pointer (ptrs > 1) during a finger hold sets `_mixedInput` flag, rejecting the long press on UP. Catches gesture erase (pen + finger) and two-finger lasso.

4. **Pre-scan on finger DOWN** -- link element scan starts immediately on finger DOWN, running in parallel with the hold time. By finger UP (~800ms+ later), the scan is already resolved. If no supertask link at the touch point, the long press is silently ignored. Eliminates ~1s post-UP scan delay.

5. **Single task API fetch** -- added `getTask(taskId)` to todoist.js. DeepLinkLoader fetches one task by ID + projects in parallel via `Promise.allSettled`, instead of fetching all tasks sequentially. ~5x faster (1s vs 6s from finger lift to TaskDetail).

6. **TaskDetail deep-link entry point** -- when entered via deep link (`!nav.canGoBack`): "< Note" closes plugin, "All Tasks" (underlined, tappable) navigates to task-home. Normal entry unchanged.

7. **Motion listener confirmed working from init** -- `registerMotionListener` works from both `index.js` and `App.tsx` useEffect on sn-plugin-lib 0.1.43. B-003 resolved.

### Confirmed on-device

- Long press on supertask:// link -> task detail (fresh note + re-show)
- Gesture erase (pen + finger) correctly rejected
- Two-finger lasso correctly rejected
- Long press off-link silently ignored
- "< Note" closes plugin, "All Tasks" opens task-home
- Single task API fetch working (`GET /tasks/{id}`)

### What's next

- **Cross-note navigation (B-002)** -- `openFilePath()` opens file manager, not editor. Need to find a way to open a .note file in the note editor from the plugin. This is the main remaining gap in bidirectional linking.
- Consider removing diagnostic RAW event logging once gesture detection is stable.

### Builds

- `build/outputs/SuperTask.snplg` -- session 18 final build with all fixes

## Session 17 -- interactive bidirectional navigation

Branch: `supertask-ui-redesign` (continued from session 16)
Plan: `~/.claude/plans/groovy-percolating-pelican.md`

### What's done

1. **View Note button in TaskDetail** -- inside the "Captured from" dashed-border section. Same-note case works: closes plugin with "Go to page N" hint. Different-note case tries `openFilePath()` then shows path as fallback.

2. **Gesture detector module** -- `src/utils/gestureDetector.js`. Registers motion listener, detects finger long-press (>800ms, <20px drift), scans page elements for supertask:// links, hit-tests touch point against link bounds, sets deep link global, calls `showPluginView()`.

3. **Deep link wiring in App.tsx** -- `getInitialScreen()` reads `global.__superTaskDeepLink`. `DeepLinkLoader` screen fetches task from API/registry, navigates to TaskDetail.

4. **Navigation diagnostics** -- four test buttons in Diagnostics screen for `openFilePath`, `Linking.openURL`, `showRattaDialog`, and link element bounds.

### Confirmed on-device

- **Link element bounds are populated** -- stroke links (cat=1) have real X, Y, width, height in page coordinates. Example: `X=450 Y=468 w=338 h=99`. Hit-testing will work.
- **`openFilePath()` with .note path** -- returns `true` but opens the **file manager** at the note location, not the note editor. Not useful for cross-note navigation.
- **`Linking.openURL('file://...')`** -- dead. Android blocks file:// URIs in intents ("exposed beyond app through Intent.getData()").
- **`showRattaDialog()`** -- native dialog works. Shows message + two buttons, returns which was tapped. Useful for user prompts but not navigation.
- **View Note (same note)** -- `closePluginView()` returns user to the note. Works.

### Resolved: motion listener and long-press detection

Session 17's "events never fire" was a red herring -- events WERE flowing, but:
1. `log()` from debug.js doesn't POST to dev server (only collects in-memory). Previous tests couldn't see events.
2. `setTimeout` does NOT fire when plugin view is closed (JS timers suspended in background). The 800ms long-press timer never executed.
3. Long press on Supernote produces ZERO MOVE events (confirmed in `docs/gesture-research.md`). MOVE-based elapsed time checks also fail.

**Fix:** Detect long press on the UP event by checking `Date.now() - downTime >= 800ms` and no drift exceeded. Works on-device -- confirmed 2048ms hold, 3 supertask links found, correct link hit-tested and matched.

**Registration:** Works from both `index.js` (post-init) and `App.tsx` useEffect. Currently in App.tsx.

**Finger events:** Always PTR_DOWN/PTR_UP (action 5/6), never ACTION_DOWN/UP (0/1), because EMR pen is primary pointer. Gesture detector handles both.

### Current bug: deep link routing

Long press correctly detects the link, sets `global.__superTaskDeepLink = {taskId, action: 'view-task'}`, and calls `showPluginView()`. But the plugin opens to task-home instead of task detail. Likely cause: `getInitialScreen()` runs in `useState` initializer (only on first mount), so it doesn't re-read the deep link global on subsequent `showPluginView()` calls.

### Builds

- `build/outputs/SuperTask.snplg` -- session 18 build with working long-press detection

## Session 16 -- bidirectional note-task linking

Branch: `supertask-ui-redesign` (continued from session 15)
Plan: `.claude/plans/federated-fluttering-brooks.md`

### What changed

1. **linkType 4 with `supertask://` URI** -- tested on-device. linkType 5 doesn't exist (native returns error 506, valid range 0-4). linkType 4 with custom protocol works: dashed border appears, link stores the task ID. Native tap opens dead browser page (acceptable since real interaction is long-press gesture).

2. **Replaced all marking with supertask:// link** -- T badge removed. `markAsTextLink` config toggle removed. Both workflows (mark handwriting on Done, convert to text) always apply `setLassoStrokeLink({destPath: 'supertask://task/{id}', style: 2, linkType: 4})`. No config gate.

3. **Note context in Todoist description** -- `[SuperTask] Captured from: {file}.note p.{N}` appended to every lasso-captured task description. Human-readable in Todoist web/mobile. Machine-parseable by SuperTask via regex.

4. **Task registry** -- `src/utils/taskRegistry.js`, RNFS-persisted at `/MyStyle/SuperTask/task-registry.json`. Written on task creation from both TaskAdd and QuickAdd. Supports lookup by page, note, or ID.

5. **Page-aware discovery** -- TaskHome scans page elements via `getElements()` on mount, filters for `type === 600` with `supertask://task/` destPath. Cross-references with registry and Todoist API response. Three matching layers: link element IDs > description text > registry-only.

6. **Device tab** -- New tab in TaskHome showing all registry tasks grouped by note file, with page numbers. Works independently of Todoist API.

7. **TaskDetail back-reference** -- Parses `[SuperTask] Captured from` from description, shows dashed-border "Captured from" section with note name and page. Metadata preserved on save. `noteContext` stabilized via `useState` initializer so it doesn't flicker during editing.

### Key findings

- **linkType range is 0-4.** JS SDK `setLassoStrokeLink` has no range check, but native C/C++ layer rejects values > 4 with error 506. `modifyLassoLink` JS validation does check `linkType > 4`.
- **`supertask://` protocol has no handler** -- native tap on linkType 4 link opens browser with dead URL. This is the known trade-off. Interactive linking will use long-press finger gesture (motion listener) instead of native link taps.
- **Element scan returns link destPaths** -- `getElements()` reliably returns link elements with `link.destPath` field. Confirmed 2 and 3 supertask links found on page via scan.
- **Registry persists across sessions** -- task created in one plugin open was found in registry on next open.

### What's next (session 17)

**Interactive bidirectional navigation:**
- **Long-press gesture** -- register motion listener (headless, finger toolType 1). Detect long press (>1s, no movement). Read elements at (x,y), find supertask:// link, open TaskDetail. Key unknown: how to programmatically show plugin UI from headless context (`showPluginView()`).
- **"View Note" button** -- in TaskDetail "Captured from" section, navigate to the source note page. If on same note, could close plugin and let user navigate. If different note, show the path.
- **Offline data caching** -- registry should cache essential Todoist fields (priority, due, project) from last API response so SuperTask works without connectivity.

### Builds

- `build/outputs/SuperTask.snplg` -- session 16 build with all linking changes (6.82MB, RNFS)

## Session 15 -- config persistence investigation

Branch: `phase3-harmony`

### Problem
crypto-js AES encryption broke config save on-device. Error: "Native crypto module could not be used to get secure random number." Hermes doesn't implement the Web Crypto API (`crypto.getRandomValues()`), which crypto-js needs for AES salt/IV generation.

### What changed
1. **Replaced crypto-js with XOR obfuscation** -- `btoa`/`atob` + XOR key. Not real encryption, just scrambles tokens so they're not plain text in the JSON file. Acceptable for Todoist API key threat model.
2. **Attempted .note file storage to eliminate RNFS** -- goal was pure JS build (279KB vs 6.8MB). Modeled on [sn-keyworder](https://github.com/taoist22/sn-keyworder) `src/storage.ts` which stores JSON as type-500 text elements in a .note file.
3. **Settings button added to TaskHome header** -- navigates to Config screen from within a note context (SDK file APIs require active note context; config button from Settings returns error 102).
4. **Config screen Back button** -- shows "Back" when pushed from TaskHome, "Close" when opened from Settings.

### .note storage status (untested on-device)
Current build uses the sn-keyworder pattern:
- `getNoteTotalPageNum()` to check file existence
- `createNote({template: 'none'})` with system template fallback
- `clearLayerElements()` + `insertElements()` with plain objects (no `createElement`)
- Path: `/MyStyle/SuperTask/supertask-config.note`

Previous attempt failed with error 802 (`template: 'none'`) and error 102 (config screen has no note context). The keyworder proves `template: 'none'` works in a note context, so the current build may work. Untested.

### Key findings
- **`crypto.getRandomValues()` not in Hermes** -- Web Crypto API, not ECMAScript. Could polyfill with `react-native-get-random-values` (native module) but defeats the point.
- **`template: 'none'` validity** -- sn-keyworder uses it successfully. Our error 802 was from the config screen (no note context). Official Ratta docs say use `Template.name` from `getNoteSystemTemplates()`.
- **PluginFileAPI needs note context** -- `createNote`, `insertElements` etc. return error 102 from the Settings config button. Must launch from within a note (toolbar button).
- **Ratta's sticker demo uses AsyncStorage** (native module) for config. Community plugins use RNFS. Native modules are standard, not an anti-pattern.
- **Build sizes**: pure JS = 279KB, with RNFS native module = 6.8MB, installed on-device ~40MB.

### Decision for next session
The .note storage workaround is research-grade, not production-ready. Options:
1. **Test current .note build on-device** -- if it works, keep it (279KB, pure JS)
2. **Revert to RNFS** -- proven, standard pattern, 6.8MB build, `SuperTask-rnfs.snplg` backup ready
3. **Try AsyncStorage** -- Ratta's official pattern, another native module but potentially lighter than RNFS

### Builds available
- `build/outputs/SuperTask.snplg` -- pure JS .note storage build (279KB, untested)
- `build/outputs/SuperTask-rnfs.snplg` -- RNFS build with XOR obfuscation (6.8MB, save was broken by crypto-js but XOR fix not yet tested in RNFS build)

## Session 12 -- current state

Latest build: `1fa8b3f` (on `supertask-ui-redesign` branch)

### What changed from Session 11

**Abandoned `replaceElements` for Convert to Text.** The file-level `getElements` -> filter -> `replaceElements` -> `reloadFile` pipeline had fatal problems:
- Error 502/602: native cross-reference validation (`controlTrailNums` in link/title elements) fails unpredictably. Removing all type 600/100 elements didn't reliably fix it -- sometimes `getElements` returns link elements with type 600 that we can filter, sometimes it doesn't.
- Position shifts: `replaceElements` causes other strokes on the page to visually move, ruining adjacent handwriting.

**New approach: `lassoElements(bounds)` + `deleteLassoElements()`.**
Since the lasso expires during auto-mark (insertText/saveCurrentNote kills it), we programmatically re-create the lasso via `lassoElements(handwritingBounds)` and then `deleteLassoElements()`. This lets the native layer handle element deletion and cross-reference cleanup.

### Convert to Text flow (current build `1fa8b3f`)

```
1. lassoElements(handwritingBounds)   -- re-select the handwriting
2. getLassoElements()                  -- DIAGNOSTIC: log what was captured
3. deleteLassoElements()               -- delete (native handles cross-refs)
4. saveCurrentNote()                   -- persist deletion
5. reloadFile()                        -- force display refresh
6. insertText(typed text)              -- editable text at handwriting position
7. insertText(T badge)                 -- re-insert (delete may have caught it)
8. saveCurrentNote()                   -- persist inserts
9. lassoElements(textRect)             -- select text for repositioning
10. setLassoStrokeLink() (config ON)   -- dashed border + Todoist link
```

### Auto-mark flow (unchanged, runs on task submit)

```
1. setLassoStrokeLink() (config ON)    -- dashed border on original lasso
2. insertText(T badge)                 -- 26x26 bordered "T" to the left
3. saveCurrentNote()                   -- persist
```

### What's been tested (Session 12, build `1fa8b3f`)

| Test | Config | Action | Result | Notes |
|------|--------|--------|--------|-------|
| Auto-mark, config OFF | OFF | Submit only | T badge appears | T badge position slightly off (too close to handwriting, appears above) |
| Auto-mark, config ON | ON | Submit only | T badge + dashed border + link | Looks good |
| Convert, config ON | ON | Submit + Convert | Handwriting removed, typed text + dashed border | Works! T badge lost (caught by re-lasso) |
| Convert, config OFF | OFF | Submit + Convert | Handwriting NOT removed, typed text overlaid | `deleteLassoElements` returns success but strokes remain visible |

### Open issues being investigated

1. **Config OFF Convert to Text: strokes not removed.** `deleteLassoElements` returns `{result: true, success: true}` but handwriting remains visible. Two hypotheses:
   - Display not refreshing: strokes deleted from data but e-ink not updated. Build `1fa8b3f` adds `reloadFile()` after delete to test this.
   - Re-lasso capturing wrong elements: `lassoElements(bounds)` might select non-stroke elements (T badge) instead of the handwriting. Build `1fa8b3f` adds `getLassoElements()` diagnostic to log exactly what was captured.

2. **Config ON Convert to Text: T badge lost.** The re-lasso catches the T badge (only 4px gap). Fixed in `1fa8b3f`: gap increased to 16px, and T badge is re-inserted after delete.

3. **OCR null results on dirty pages.** `recognizeElements` returns `{success: true, result: null}` on pages with mixed element types (text boxes, links from previous tests). Fixed in `1fa8b3f`: filter to stroke-only elements (type 200) before passing to recognizer.

### Parameter corrections made

- **`textEditable: 0` = editable, `1` = not editable** (counterintuitive). Convert to Text was using `1` (not editable), now uses `0`.
- **`textFrameWidthType: 1` = auto-width** (system sizes to fit). Was using `0` (fixed width with manual char-count estimate).
- **T badge gap**: `bounds.left - badgeW - 16` (was `-4`, too close, caught by re-lasso).

### Key SDK discovery: lasso lifecycle

The original user lasso **expires** after `insertText()` + `saveCurrentNote()` during auto-mark. `deleteLassoElements()` without re-lasso returns error 904. But `lassoElements(rect)` can programmatically re-create a lasso context that `deleteLassoElements()` accepts.

Config ON vs OFF difference during Convert to Text:
- Config ON: `setLassoStrokeLink` was called during auto-mark, converting strokes to linked strokes. When re-lasso'd, `deleteLassoElements` removes both strokes and their link elements.
- Config OFF: strokes are plain. `deleteLassoElements` returns success but strokes remain (needs investigation -- may be display refresh or lasso capturing wrong elements).

### Dev tooling

- **Log buffer increased to 500** (was 50). Previous buffer was too small for multi-test sessions.
- **Inkling skill installed** at `.claude/skills/inkling/`. Provides Supernote plugin API reference, patterns, and type definitions. Complements CLAUDE.md with PluginDocAPI, native floating windows, sticker APIs, coordinate conversion utilities.

## Backlog

1. **Dashboard v1** -- all APIs confirmed. Build single-page dashboard with bidirectional links using createNote + insertTextLink + insertNotePage.
2. **Config redesign** -- settings screen is getting bloated. Needs reorganization as features accumulate.
3. **Test Convert to Text with dense handwriting** -- verify on pages with lots of handwriting.

## Architecture

### Entry points (index.js)

| Button ID | Type | App | Action |
|-----------|------|-----|--------|
| 100 | Toolbar | NOTE | "Tasks" -- opens TaskHome |
| 200 | Lasso bar | NOTE | "Add Task" -- Capture (OCR) then TaskAdd |
| 300 | Toolbar | DOC | "Add Task" -- Capture (doc text) then TaskAdd |
| Config | Config button | -- | Opens Config screen |

### Screen flow

```
TaskHome (Today/Upcoming/Projects tabs, "This Page" section)
  -> ProjectView (single project drill-down)
  -> TaskDetail (edit/complete/delete)
  -> TaskAdd (create, with Add Another/View Task/Done)
     -> View Task replaces TaskAdd (Back goes to TaskHome)

Capture (lasso OCR or doc text) -> TaskAdd (pre-filled, marks note on submit)

Config (Connections tab / Preferences tab)
```

### File structure

```
plugins/SuperTask/
  index.js                 -- entry point, button registration, global routing
  App.tsx                  -- root component, stack navigation, debug viewer
  config.local.js          -- API token + debugServerUrl (gitignored, bundled at build)
  dev-server.js            -- zero-dep Node server for debug logs over wifi
  PluginConfig.json        -- plugin metadata (supertask001, v0.1.0)
  src/
    api/todoist.js         -- Todoist API v1 client, pagination, response unwrapping
    utils/
      config.js            -- config loader (bundled token, in-memory runtime config)
      debug.js             -- debug logger with HTTP export
    components/
      TaskRow.tsx           -- task row (checkbox + content + priority + due)
      TabBar.tsx            -- horizontal tab strip
      SectionHeader.tsx     -- group divider with title + count
      PriorityPicker.tsx    -- P1-P4 toggle buttons
      ProjectPicker.tsx     -- project toggle buttons (flexWrap, not ScrollView)
      DatePicker.tsx        -- month-grid calendar for e-ink
    screens/
      TaskHome.tsx          -- tabbed home (Today / Upcoming / Projects)
      ProjectView.tsx       -- single project, sections: Overdue/Today/Upcoming/No Date
      TaskDetail.tsx        -- edit/complete/delete, floating status overlay
      TaskAdd.tsx           -- create task, date picker, add-another flow
      Capture.tsx           -- lasso OCR or doc text capture, navigates to TaskAdd
      Config.tsx            -- settings UI (token, project toggles, defaults)
```

### Dev workflow

```bash
cd plugins/SuperTask && node dev-server.js   # 1. Start log server
bash buildPlugin.sh                          # 2. Build
# 3. Copy build/outputs/SuperTask.snplg to Supernote via USB (MyStyle/)
# 4. Settings > Apps > Plugins > Install
# 5. Open note, tap plugin button, test
# 6. Log > Upload Log to send debug output to terminal
```

---

## Known issues

**E-ink refresh on data reload** -- tapping Refresh loads data (confirmed via logs) but display doesn't visibly update until a tab switch forces redraw. Partially fixed with silent refresh (skip spinner, just swap data). May need further work.

**Config persistence partially implemented** -- MyStyle JSON read + .note storage write coded. Save currently returning false on-device (showing "session only"). Detailed logging added to diagnose. See Session 13 notes.

---

## SDK learnings

### Lasso OCR
- `PluginCommAPI.recognizeElements(elements, {width, height})` -- size param is note page size in pixels, **required**
- Without size param the call hangs forever (no error, no timeout)
- `PluginFileAPI.getPageSize(notePath, page)` returns page dimensions
- `PluginCommAPI.getLassoElements()` returns element array from lasso toolbar context
- Full lasso -> OCR -> TaskAdd flow takes ~2-5 seconds on device

### Config button routing
- `PluginManager.registerConfigButtonListener({onClick: ...})` -- callback is `onClick`, not `onConfigButtonPress`
- Config button fires BEFORE React mounts -- must capture via global in index.js
- Listeners in useEffect catch subsequent presses but miss the initial one

### Todoist API v1
- Paginated: `{results: [...], next_cursor: "..."}` not a bare array
- Base URL: `https://api.todoist.com/api/v1`
- REST v2 (`/rest/v2`) returns 410 Gone as of April 2026
- Subtasks via `parent_id` field (not yet implemented)

### SDK method locations
- **PluginCommAPI**: `getCurrentFilePath()`, `getCurrentPageNum()`, `getNoteSystemTemplates()`, `recognizeElements()`
- **PluginNoteAPI**: `insertText()` (current note only), `saveCurrentNote()`, `getLastElement()`
- **PluginFileAPI**: `insertElements(notePath, page, elements)`, `createNote()`, `getElements()`, `getPageSize()`
- **FileUtils**: `getExportPath()`, `exists()`, `makeDir()`, `copyFile()`, `deleteFile()`, `listFiles()` -- **no `writeFile()`**

### File I/O status
- `FileUtils.writeFile()` -- not in the TurboModule interface
- `fetch('file:///...')` -- WORKS on Android. Returns status 0 (not 200), must ignore `response.ok` and parse directly. Used for MyStyle JSON config reading.
- `.note` file as storage -- `createNote({template: 'none'})` + text element for write, `getElements` for read. Needs on-device testing (createNote may fail with error 802).
- `PluginFileAPI.createNote()` with system templates -- error 802 (template path not found)
- ADB is locked down (`shell`, `logcat`, `push`, `pull` all fail)

### E-ink UI patterns
- Horizontal ScrollView swallows taps -- use flexWrap View instead
- Side effects in render body cause infinite loops (log() -> listener -> setState -> re-render)
- `keyboardShouldPersistTaps="handled"` needed on ScrollViews with TextInputs
- Position-absolute overlays work well for status messages (no layout shift)

### Element coordinates (Sessions 5-6)
- Lasso element `maxX`/`maxY` are **page-level constants, NOT stroke positions**
  - All elements return identical values (e.g., maxX=20967, maxY=15725 for all 6-25 elements)
  - These are the EMR digitizer boundary, not individual stroke extents
- **Actual stroke positions** are in `element.stroke.points` (an `ElementDataAccessor`)
  - Async lazy loader: `await element.stroke.points.get(index)` returns `{x, y}` in EMR coords
  - `element.stroke.points._size` gives point count
  - Read first/last point of each stroke to compute bounding box
  - Confirmed working on-device: returns real EMR coordinates that vary by stroke position
- EMR-to-pixel conversion (axis mapping):
  - EMR X axis -> Android Y (direct scale: `pixelY = emrX / scaleX`)
  - EMR Y axis -> Android X (mirrored: `pixelX = pageWidth - 1 - emrY / scaleY`)
  - `scaleX = realMaxX / (pageHeight - 1)`, `scaleY = realMaxY / (pageWidth - 1)`
- **Device EMR range detection**: page size alone is NOT reliable for determining EMR maximums
  - Nomad reports page size 1404x1872 but uses A5X2-range EMR values (max 21632/16224)
  - Detect from actual element data: if any EMR value > 15819, use A5X2 range
  - Normal range: maxX=15819, maxY=11864 (for 1404x1872)
  - A5X2 range: maxX=21632, maxY=16224 (for 1920x2560)
- Element keys from lasso: `stroke, angles, contoursSrc, status, numInPage, recognizeResult, maxY, thickness, pageNum, maxX, layerNum, type, uuid`
- Stroke keys: `recognPoints, markPenDirection, penColor, eraseLineTrailNums, pressures, penType, flagDraw, points`

### OCR sensitivity (Session 5)
- `recognizeElements` returns `success: false` when lasso captures strokes from adjacent lines
- Even reasonable visual distance between lines can cause failure if stroke elements overlap
- Works fine with isolated handwriting (13 elements, clear separation)

### Inserting elements on note pages (Sessions 5-7)

**`PluginNoteAPI.insertText()` -- WORKS (confirmed on-device)**
- Inserts on CURRENT note page (no filePath/page params needed)
- Uses pixel coordinates: `textRect: {left, top, right, bottom}`
- Required: `textContentFull` (non-empty string), `textRect`
- Optional: `fontSize`, `textBold`, `textAlign`, `textFrameStyle` (3=stroke border), `textEditable`, `textItalics`, `textFrameWidthType`
- Works even while plugin UI is showing (note is underneath)

**`PluginNoteAPI.setLassoTitle({style})` -- WORKS but pollutes TOC**
- Applies title styling to lasso-selected strokes while lasso context is active
- Styles: 0=remove, 1=black background, 2=light gray, 3=dark gray, 4=shadow
- Confirmed on-device: `{result: true, success: true}` with style 1
- **Problem**: Title elements show up in Supernote's Table of Contents. Not viable for task marking.

**`PluginNoteAPI.setLassoStrokeLink({destPath, destPage, style, linkType})` -- WORKS (confirmed Session 8)**
- Makes lasso-selected strokes into a tappable link with visible dashed border + link icon
- Styles: 0=solid underline, 1=solid border, 2=dashed border
- Link types: 0=note page, 1=note file, 2=document, 3=image, 4=URL
- Does NOT affect TOC (unlike setLassoTitle)
- Must be called while lasso context is active (same timing as setLassoTitle)
- Link is functional -- tapping opens browser/target

**`PluginNoteAPI.insertTextLink()` -- WORKS (confirmed Session 8)**
- Inserts a tappable text link element on current note page
- Params: destPath, destPage, style, linkType, rect, fontSize, fullText, showText, isItalic
- Returns `{result: 0, success: true}` on success
- **Requires active note context** -- fails with error 102 if no note is open

**`PluginFileAPI.insertElements()` -- FAILS with error 106**
- JS-side schema validation passes, but native layer rejects with code 106: "Invalid API parameters"
- Tested with Link (600), Text (500), AND Title (100) element types -- ALL fail
- Error 107 (JS validation) fires for negative coordinates; 106 is native-side rejection

**Element type schemas (from SDK VerifyUtils.ts):**
- **Link (600)**: category (required), X/Y/width/height (required, min:0), style (required), linkType (required), destPath, fullText, showText
- **Text (500)**: textContentFull (required, nonEmpty), textRect (required, non-zero-area), fontSize (min:1), textBold, textAlign, textFrameStyle, textEditable
- **Title (100)**: X/Y/width/height (min:0), style, controlTrailNums -- NO required fields in title sub-object
- **Geometry (700)**: validated via GeometrySchema
- All elements need `layerNum: 0` for the main drawing layer

### Overlay UI pattern (Session 7)
- Full-screen takeover is NOT required. Community plugins (sn-calc) achieve pop-up overlays with same `showType: 1`
- Technique: root component `flex: 1, backgroundColor: 'transparent'`, content in a fixed-width centered panel
- Outer Pressable with `onPress={closePluginView}` for tap-outside-to-dismiss
- Inner panel `stopPropagation()` to prevent dismiss on panel taps
- Supernote renders plugin RN view with transparent background, note page visible underneath

### Config persistence (Session 13 -- implemented, testing)

| Approach | Result |
|----------|--------|
| `FileUtils.writeFile()` | Method doesn't exist |
| `FileUtils.saveTextToFile()` | Exists in Java but not exposed to JS (confirmed on-device Session 5) |
| `fetch('file:///...')` | **WORKS** -- reads MyStyle JSON config. Status 0 on Android, ignore `response.ok`. |
| `createNote({template: 'none'})` + `insertElements()` | Implemented for .note storage. Needs on-device testing. |
| `clearLayerElements()` + `insertElements()` | Used to overwrite existing config in .note storage. |
| `adb push` | ADB locked down |

**Current implementation:** Load priority: MyStyle JSON > .note storage > bundled config.local.js > defaults. Save writes to .note storage. MyStyle JSON is read-only (user edits via USB). Detailed logging in `saveToStorage()` for debugging.

---

## Session log

### Session 1 -- 2026-04-25: Scaffold, first device tests

- Initialized repo, created GitHub remote (apclark31/supernote-plugin-research, private)
- Scaffolded SuperTask from template with 4 entry points
- Build 1: Todoist API 410 Gone (REST v2 deprecated), confirmed fetch() works
- Build 2: "undefined is not a function" from filesystem APIs
- Build 3: Stripped to bundled config only, added debug logging

### Session 2 -- 2026-04-25: API fix, task list working

- Fixed Todoist API v1 pagination (unwrap `{results: [...]}`)
- Task list loads 29 tasks successfully
- Dev log server confirmed working on-device

### Session 3 -- 2026-04-26: UI redesign (Phase 2)

- Stack-based navigation, tabbed home, project drill-down, detail/add screens
- 5 shared components: TaskRow, TabBar, SectionHeader, PriorityPicker, ProjectPicker
- DatePicker: month-grid calendar for e-ink
- On-device: 30 tasks, 6 projects load. Editing + saving works.
- Fixed: infinite loop from log() in render, ScrollView tap swallowing, detail screen pop-back after save

### Session 4 -- 2026-04-26: Phase 3 + 5 complete

- Add Another/Done overlay after task creation
- Silent refresh (skip spinner on manual refresh)
- Expanded Config screen with all settings visible
- Fixed config button routing (onClick callback + global capture for race condition)
- Lasso OCR working: recognizeElements needs page size param, was hanging without it
- Capture.tsx: on-screen trace log, SDK call timeouts, navigates to TaskAdd with OCR text

### Session 5 -- 2026-05-02: UX polish, task marking, config redesign

**On-device testing of Session 4 work:**
- Add Another/Done flow works. View Task button added (navigates to created task's detail)
- Silent refresh works, but replaced ActivityIndicator with static text (animated spinner shows as frozen artifact on e-ink)
- Config button routing works, expanded settings work
- Clipboard.getString() works -- added Paste button for API token input
- `FileUtils.saveTextToFile()` confirmed not available from JS (exists in Java but not exposed)

**UX improvements:**
- TaskAdd overlay: centered modal over form content (was bottom-anchored, blocked by handwriting input)
- View Task uses `nav.replace()` so Back goes to TaskHome, not empty add form
- Config screen: split into Connections and Preferences tabs via TabBar. Defaults to Connections if no token, Preferences if token exists.
- Config layout tightened throughout

**Task marking on notes (built, needs coord fix):**
- After lasso capture + task creation, inserts dashed border (Link element) + T badge (Text element) on note page
- Stores Todoist task URL in the link element's destPath
- Problem: element maxX/maxY are in EMR coordinates (20967, 15725), not pixel coords (1404, 1872). Marks placed off-page.
- Next: convert via PointUtils.emrPoint2Android() or manual ratio conversion

**"This Page" section (built, untested):**
- TaskHome detects current note/page via getCurrentFilePath/getCurrentPageNum
- Filters tasks with matching `From: {noteName} p.{pageNum}` in description
- Shows "THIS PAGE" section above tab content, only when matches exist

**OCR finding:**
- recognizeElements fails (success=false) when lasso grabs strokes from adjacent lines
- Works fine with isolated handwriting

**PROGRESS.md restructured:** dashboard at top for quick scanning, detailed reference below

### Session 6 -- 2026-05-02/03: Coord fix, debug toggle, task marking iteration

**Debug mode toggle:**
- `debugMode: false` default in config
- Toggle in Config > Preferences tab (checkbox at bottom)
- When OFF: hides Log buttons in TaskHome, TaskAdd, Capture; hides capture trace (shows "Processing..." instead)
- When ON: everything works as before
- Logs still collect in memory regardless of mode (available for error diagnostics)
- Bug fix: `exportLog()` was gated on `_debugMode` flag which was only set at app mount. Toggling debug mode in Config mid-session didn't update the flag. Fixed by always allowing explicit Upload Log.

**EMR coordinate investigation (5 on-device test builds):**
1. Initial: element maxX/maxY assumed to be stroke positions. Computed pixel bounds with negative values (left=-457). `insertElements` error 107: "link.X must be >= 0"
2. Discovered device (Nomad) uses A5X2 EMR range despite 1404x1872 page size. Fixed by detecting range from actual EMR values instead of page size. Bounds now positive but `insertElements` error 106: "Invalid API parameters" from native layer.
3. Switched from `insertElements` (Link+Text) to `insertText` (proven working from debug log export). API returns success=true, but "T" badge placed at bottom of page (y=1753) while handwriting was elsewhere.
4. Key discovery: **element maxX/maxY are page-level constants, identical across all elements** (20967/15725 for all 6-25 elements). They're the EMR page boundary, not stroke positions.
5. Read actual stroke point data via `ElementDataAccessor`: `await el.stroke.points.get(0)` returns real EMR {x,y} coordinates. Bounding box now computed from real stroke positions -- positioning confirmed correct.
6. "T" badge now appears at correct position but is too small (26x26px). User wants header-style marking (Title element with black background). Current build tries `insertElements` with Title (type 100, style 1), falls back to larger text banner.

**"This Page" section -- confirmed working on-device:**
- TaskHome shows tasks with matching `From: {noteName} p.{pageNum}` in description
- Even shows tasks from deleted notes (description matching still works)

**Dev log server issues:**
- Stale node process can hold port 3000 without accepting connections. Kill by PID before restarting.
- Must use full path: `node "/Users/alex/Library/Mobile Documents/com~apple~CloudDocs/Work/supernote-plugin-research/plugins/SuperTask/dev-server.js"`
- `debugServerUrl` in config.local.js is baked into build at bundle time

### Session 7 -- 2026-05-03/12: Task marking confirmed, design docs, API research

**On-device testing results:**
- `setLassoTitle({style: 1})` confirmed working -- black header applied to lasso'd strokes, `{result: true, success: true}`
- `insertElements` with Title (type 100) confirmed failing -- error 106, same as Link and Text types. All insertElements paths are dead ends.
- T badge via `insertText` confirmed working -- 32x32 bordered "T" placed to the left of handwriting
- Todoist API 502/503 errors observed -- added retry logic (up to 2 retries with 1.5s/3s delays)
- OCR misread: "Testing again" recognized as "i /i" (15 stroke elements). OCR accuracy is an SDK limitation, not a plugin bug.

**Design decision: Title pollutes TOC**
- `setLassoTitle` creates Title elements that appear in Supernote's Table of Contents
- Every task-marked handwriting would show as a TOC heading -- not viable
- Switching to `setLassoStrokeLink` (dashed border, no TOC impact) for task marking

**SDK API research (from source code):**
- Discovered `setLassoStrokeLink` -- applies visible border to strokes + makes them tappable links
- Discovered `insertTextLink` -- inserts tappable text link element (key for dashboard)
- Discovered `insertNotePage` -- adds pages to existing notes
- Discovered `openFilePath` -- may open .note files from plugin
- All untested on-device -- queued for next build

**Design docs created:**
- `docs/design-task-linking.md` -- dashboard concept, inter-note linking, bidirectional navigation. Option B chosen (stroke link to dashboard note + T badge matching mockup SVG).
- `docs/design-capture-workflow.md` -- streamlined post-action flow. "Mark as Text" replaces handwriting with typed text at same position, left lasso'd for user editing. No font size computation, fixed 20px default.

**Overlay UI research:**
- Analyzed sn-calc community plugin (github.com/taoist22/sn-calc v2.1.0-beta)
- Pop-up overlay is purely CSS/layout, same `showType: 1`. Transparent root + centered fixed-width panel.
- Planned: lasso capture uses compact overlay, toolbar button keeps full-screen TaskHome

**Code changes this session:**
- `todoist.js`: Added retry logic for 5xx errors (502, 503) with up to 2 retries
- `Capture.tsx`: Added `setLassoTitle({style: 1})` call after OCR (to be replaced with `setLassoStrokeLink`)
- `TaskAdd.tsx`: Removed dead `insertElements` Title code, added `titleApplied` flag to skip redundant marking, improved insertText fallback (fontSize 20, wider box), added T badge insertion
- `CLAUDE.md`: Added "check SDK source first" protocol for problem-solving

### Session 8 -- 2026-05-12: setLassoStrokeLink confirmed, all dashboard APIs pass

**setLassoStrokeLink -- confirmed working on-device:**
- Replaced `setLassoTitle({style: 1})` with `setLassoStrokeLink({destPath: 'https://todoist.com', destPage: 0, style: 2, linkType: 4})`
- Dashed border appears around lasso'd strokes with a link icon
- Link is tappable -- opens device browser to todoist.com (placeholder URL for testing)
- Does NOT pollute Table of Contents (unlike setLassoTitle)
- T badge via insertText still works alongside the stroke link

**Dashboard API diagnostics -- all 7 tests pass:**
- Built Diagnostics screen to probe APIs needed for dashboard
- Key finding: all APIs require active note context. Tests fail with error 102 ("not allowed") when run from Config screen (no note context). All pass when run from TaskHome with note open.
- `getNoteSystemTemplates()` -- 28 templates, objects with `{name, hUri, vUri}` fields
- `createNote({notePath, template: 'style_white', mode: 0, isPortrait: true})` -- works with `Template.name` and full absolute path (`/storage/emulated/0/Note/...`)
- `insertTextLink({destPath, destPage, style, linkType, rect, fontSize, fullText, showText, isItalic})` -- works, `{result: 0, success: true}`
- `insertNotePage({notePath, page, template: 'style_white'})` -- works, appends page
- `replaceElements(notePath, page, elements)` -- works (roundtrip read/write)
- `openFilePath(path)` -- works but ejects from note to file manager (not useful for dashboard)
- Error 102 is NOT a permission restriction -- it means "no active note context available"

**Code changes:**
- `Capture.tsx`: Replaced setLassoTitle with setLassoStrokeLink (style 2 = dashed border, linkType 4 = URL)
- `TaskAdd.tsx`: Renamed `titleApplied` to `strokeLinkApplied` throughout
- `Diagnostics.tsx`: New screen -- tests dashboard APIs with timeouts, proper absolute paths, per-attempt error logging
- `App.tsx`: Added Diagnostics screen routing
- `Config.tsx`: Added API Diagnostics button (debug mode only)
- `TaskHome.tsx`: Added Diag button in header (debug mode only)

### Session 9 -- 2026-05-13: Mark as Text post-action complete

**Mark as Text -- confirmed working on-device (10+ test builds):**
- Post-create overlay shows "Mark as Text" button for lasso captures with noteContext
- Replaces handwriting strokes with editable typed text at same position
- Dashed border + link icon via setLassoStrokeLink on TextBox element
- Re-lassoed via lassoElements(rect) for immediate adjustment
- Font size 32 default, configurable (24/28/32/36/40) in Config Preferences
- Todoist link optional (toggle in Config), defaults to self-referencing note link

**Key SDK discoveries:**

*Element matching between APIs:*
- `getLassoElements()` and `getElements()` return different UUIDs for the same elements
- Match by `numInPage` instead -- stable identifier across both APIs
- Lasso elements have key `numInPage` that corresponds to page element `numInPage`

*Link element structure:*
- Link elements (type 600) have `link.controlTrailNums` array containing the `numInPage` values of referenced strokes
- Use `controlTrailNums` overlap to surgically identify which links reference specific strokes
- Removing strokes without their associated link elements causes error 502 ("Invalid element index for the link")

*File vs in-memory state:*
- `PluginNoteAPI` methods (insertText, saveCurrentNote) operate on in-memory note state
- `PluginFileAPI` methods (getElements, replaceElements) operate on the .note file directly
- After `replaceElements`, the display still shows stale in-memory state
- `PluginCommAPI.reloadFile()` forces the display to sync from file -- required after replaceElements
- `insertText` must run BEFORE `replaceElements` since replaceElements can sever the note binding (error 105)

*Lasso context lifetime:*
- Lasso context expires after navigating away from Capture.tsx to TaskAdd
- `deleteLassoElements()` returns error 904 ("No lasso action has been performed") from TaskAdd
- Solution: use getElements -> filter by numInPage -> replaceElements instead

*New APIs confirmed on-device:*
- `PluginCommAPI.lassoElements(rect)` -- programmatically creates lasso selection in pixel coordinates. Works on-device despite not being in TypeScript source.
- `PluginCommAPI.reloadFile()` -- forces display refresh from file state
- `PluginNoteAPI.setLassoStrokeLink` supports TextBox elements (type 500), not just strokes -- confirmed via docs and on-device

*insertText vs insertTextLink:*
- `insertTextLink` creates an atomic link element (type 600) -- breaking the link removes the text entirely
- `insertText` creates an editable text box (type 500) -- text survives link removal
- Hybrid approach: insertText + lassoElements + setLassoStrokeLink gives editable text with dashed border + link
- `textEditable: 0` = editable (not 1, which means NOT editable)
- `textFrameStyle: 0` = no border (native), `3` = stroke border
- `textFrameWidthType: 1` = auto width (system sizes to fit content)

*Dashed border behavior:*
- Dashed border is the link's visual style (style 2 from setLassoStrokeLink)
- Breaking/removing the link also removes the dashed border -- they are one and the same
- No known way to have a persistent dashed border without a link via this API
- Edge case for future investigation: textFrameStyle values beyond 0 and 3

**Code changes:**
- `TaskAdd.tsx`: Added Mark as Text handler with full pipeline (insertText -> getElements -> filter by numInPage -> replaceElements -> reloadFile -> lassoElements -> setLassoStrokeLink). Configurable font size and Todoist link toggle.
- `Capture.tsx`: Collects lasso element IDs (uuid, numInPage, type) for later matching in TaskAdd
- `Config.tsx`: Added "Mark as Text Font Size" picker (24-40) and "Link to Todoist Task" toggle in Preferences

### Session 10 -- 2026-05-13/14: Quick-add overlay, workflow redesign

**Quick-add overlay -- confirmed working on-device:**
- New `QuickAdd.tsx` screen: combines OCR capture + compact add form in a centered panel over the note page
- Transparent root background lets the note show through, tap outside to dismiss
- Lasso button (200) routes to QuickAdd overlay, toolbar button (100) keeps full-screen TaskHome
- Form: task title (pre-filled from OCR, editable), priority, project, description
- "Tasks" link in header to jump to TaskHome, "View Tasks" button in success phase

**Pre-confirmation marking removed from all screens:**
- `setLassoStrokeLink` was firing DURING capture (before task creation) in Capture.tsx and QuickAdd.tsx -- removed
- `insertTaskMark` (auto T badge) was firing on submit in TaskAdd.tsx -- removed along with the function
- `strokeLinkApplied` field removed from NoteContext type across all files
- All note marking is now strictly post-confirmation and user-initiated

**Stale screen state bug found and fixed:**
- Symptom: second lasso capture showed stale "Task added!" success screen from previous capture, no OCR ran
- Root cause: `resetTo('capture-lasso')` when current screen is already `capture-lasso` -- React reuses the component instance, `useEffect([], [])` doesn't re-fire
- Fix: `ScreenEntry` now carries a unique `id` counter (incremented on push/replace/resetTo), all screen components use `key={current.id}` to force fresh React instances

**Workflow redesign approved (not yet implemented):**
- See `docs/workflow-lasso-capture.svg` for the full approved workflow diagram
- Key changes: auto-mark on submit (dashed border on handwriting immediately after task creation), "Mark as Text" renamed to "Convert to Text" (optional, replaces handwriting with typed text), standalone "Mark" button removed
- Link destination respects "Link to Todoist Task" config toggle for both auto-mark and Convert to Text
- Lasso selection stays active after both operations for repositioning
- See "Session 10 remaining work" section above for detailed implementation instructions

**Code changes this session:**
- `QuickAdd.tsx`: New file -- overlay capture + compact add form, OCR, mark handlers, applyStrokeLink helper
- `App.tsx`: Added QuickAdd import/route, transparent container for overlay, `navIdCounter` + `key={current.id}` on all screens
- `Capture.tsx`: Removed setLassoStrokeLink block, removed unused PluginNoteAPI import
- `TaskAdd.tsx`: Removed insertTaskMark function + call, removed strokeLinkApplied from NoteContext, added handleMark + applyStrokeLink (to be refactored per workflow)
- `docs/workflow-lasso-capture.svg`: New approved workflow diagram

### Session 11 -- 2026-05-14: Workflow implementation (auto-mark + Convert to Text rework)

- Implemented approved workflow: auto-mark on submit, Convert to Text as optional post-action
- Replaced replaceElements pipeline with deleteLassoElements approach
- Multiple on-device test builds iterating on the lasso lifecycle

### Session 12 -- 2026-05-14: deleteLassoElements debugging

- Diagnosed Config OFF Convert to Text: deleteLassoElements returns success but strokes remain visible
- Added reloadFile() after delete, OCR stroke filter (type 200 only), diagnostic logging
- Build `1fa8b3f` deployed for further testing

### Session 13 -- 2026-05-14: Convert to Text fixed, settings redesign, config persistence

**Convert to Text -- fully working (all 4 test cases pass):**
- Root cause of previous failures: `insertText` (T badge) + `saveCurrentNote` during auto-mark killed the original lasso context before Convert to Text could use it
- Fix: deferred ALL marking until user picks Done or Convert to Text. Original lasso stays alive through the success phase.
- `getLassoRect()` replaces ~60 lines of EMR-to-pixel coordinate math. Returns exact pixel bounds.
- Race condition guard: `marking` state prevents handleDone from re-applying marks during Convert to Text
- Re-lasso at end of both Done and Convert to Text paths so user can reposition content
- T badge gap increased from 8px to 20px to prevent overlap with 10px lasso padding

**Settings screen redesigned (T-001):**
- Compact horizontal e-ink layout matching wireframe mockup
- Built-in tab bar (Connections / Preferences)
- Preferences grouped: General, Projects, Handwriting, Advanced
- Inline radio buttons, horizontal toggle rows, 2-column checkbox grids, wrapping button grids
- Config source chip showing where settings were loaded from (MyStyle / storage / build config / defaults)

**Config persistence implemented (F-007) -- needs on-device testing:**
- Load priority: MyStyle JSON > .note storage > bundled config.local.js > defaults
- MyStyle JSON reading via `fetch('file:///...')` with status 0 handling (from sn-keyworder pattern)
- .note file storage: `createNote({template: 'none'})` + `insertElements(type 500 text element)` for writing, `getElements` for reading
- `clearLayerElements` before writing to prevent stale data
- Save currently showing "Saved (session only)" -- `saveToStorage()` returning false. Detailed step-by-step logging added to diagnose where `createNote`/`insertElements` fails on-device.

**Documentation architecture established:**
- `plugins/SuperTask/docs/tracker.md` -- Features (F-001 to F-007), Tasks (T-001), Bugs (B-001 to B-003) with status tracking
- `plugins/SuperTask/docs/changelog.md` -- resolved items with dates
- `plugins/SuperTask/docs/design-settings.md` -- settings redesign + MyStyle JSON persistence design
- `plugins/SuperTask/docs/design-task-markers.md` -- inline T/ST marker exploration (F-001)
- All docs gitignored (`docs/`, `**/docs/`, `**/PROGRESS.md`) -- not visible to GitHub users
- Each doc has header with cross-references to related docs

**Key SDK discoveries:**
- `getLassoRect()` -- returns exact pixel bounds of active lasso selection. Eliminates need for EMR-to-pixel coordinate computation.
- `fetch('file:///...')` WORKS on Android -- returns HTTP status 0 (not 200), so `response.ok` is false. Must ignore status and call `response.json()` directly. Pattern from sn-keyworder.
- `.note` file as key-value storage -- `createNote({template: 'none'})` + text element with JSON payload. Full round-trip persistence without `writeFile`.
- `clearLayerElements(path, page, layer)` -- clears all elements on a layer. Used before writing new config.

**Commits (8):**
- `7216170` Defer auto-mark to Done/Convert decision
- `6561b76` Use getLassoRect() for exact bounds
- `ed82d30` Fix lasso persistence, T badge overlap, race condition
- `12ebac3` Add plugin doc architecture
- `581c906` Add T-001 settings redesign
- `6368c7c` Exclude internal docs from repo
- `b566159` Redesign settings screen, persistent config storage
- `931dd2c` Remove header border, group preferences, config save logging

**Awaiting on-device feedback:**
1. Config persistence -- is `createNote({template: 'none'})` succeeding? Check logs from saveToStorage step-by-step output.
2. Settings UI -- grouped preferences layout, toggle button spacing
3. Config source chip -- does it correctly show "MyStyle" when supertask-config.json exists?

### Session 14 -- 2026-05-14: RNFS native module, config persistence confirmed, crypto-js

**react-native-fs added -- config persistence confirmed on-device:**
- Added `react-native-fs` as first native module (direct filesystem read/write)
- Replaced .note file storage hack (which failed with error 102 from Config screen -- no note context)
- Config now saves as plain JSON to `/storage/emulated/0/MyStyle/SuperTask/supertask-config.json`
- Works from ANY screen (no note context needed). Confirmed on-device: directory created, file written, 357 chars.
- Config survives reinstalls, editable via USB

**Gradle build pipeline established:**
- Build script auto-detects native modules in `node_modules/`, runs Gradle, bundles APK as `app.npk`
- `android/local.properties` created with SDK path
- `PluginConfig.json` gets `reactPackages` and `nativeCodePackage` automatically
- Debug build: ~6.9MB .snplg, installs in ~5 seconds, ~25MB on device

**crypto-js added for token encryption (F-008):**
- Pure JS (no native module), AES-256 encryption for sensitive config fields
- `apiToken` and `debugServerUrl` encrypted before writing to disk
- Encrypted values start with `U2FsdGVkX1` (CryptoJS AES signature)
- Plain text values accepted on load (USB-seeded configs), encrypted on next Save
- Needs on-device verification -- confirm token encrypts on save and decrypts on load

**R8 release build -- DO NOT USE (caused device freeze + factory reset):**
- Attempted R8/ProGuard minification to reduce APK from 6.7MB to 2.7MB
- ProGuard rules added for sn-plugin-lib and RNFS keep rules
- Build succeeded but **froze the Supernote on install**, required factory reset
- Root cause unknown -- R8 may strip classes PluginHost needs at runtime
- Compounding bug: build script `find` grabbed cached release APK even after reverting to debug. Fixed by deleting release APK artifacts.
- **INVESTIGATE NEXT SESSION:** Why does R8 release build freeze PluginHost? What classes are being stripped? Could be React Native internals needed by PluginHost's class loader. Need to diff debug vs release APK class lists.

**Architecture doc created:**
- `docs/design-architecture.md` -- complete technical reference: build pipeline, native modules, config, API, SDK usage, file layout, debugging

**Code changes:**
- `src/utils/config.js` -- complete rewrite: RNFS read/write, crypto-js encryption/decryption
- `src/screens/Config.tsx` -- updated source labels for RNFS
- `buildPlugin.sh` -- reverted to debug build (was release, caused freeze)
- `android/app/build.gradle` -- `enableProguardInReleaseBuilds = true` (for future use, not active in debug)
- `android/app/proguard-rules.pro` -- keep rules for sn-plugin-lib, RNFS, plugincommon
- `android/local.properties` -- SDK path
- `package.json` -- added react-native-fs, crypto-js dependencies
- `docs/design-architecture.md` -- new technical architecture reference
- `docs/tracker.md` -- F-007 done, F-008 added, T-001 done
- `docs/changelog.md` -- F-007, T-001, native module pipeline archived

**Next session priorities:**
1. Verify crypto-js encryption on-device (save config, pull file via USB, check encrypted values)
2. Investigate R8 freeze -- diff debug/release APK class lists, identify what PluginHost needs
3. Consider build size optimization that doesn't use R8 (strip unused resources, template assets)
4. Continue feature work (F-001 inline markers, F-003 subtasks, dashboard)
