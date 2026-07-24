# Settings Redesign v2 — Design System & Mockups

> Replaces the accreted settings page with a five-primitive component vocabulary,
> honest grouping, apply-on-change persistence, and drawn (non-ASCII) controls.
> Supersedes `design-settings.md` (session-era layout). Tracked as F-023.
>
> **Related:** `tracker.md` F-023, T-005 (dead `defaultScreen` setting), user feedback
> that the page is "all over the place."

## 1. What's wrong today (grounded in Config.tsx as of session 34)

1. **Four controls for "pick one of N"**: pill toggles (Default tab), ASCII radios
   `(*)` (post-create, open-to, quick-add gesture), button grid (default project),
   size chips (font size). Same decision type, four visual languages.
2. **`[X]` means two things**: multi-select (projects) and boolean (bezel, three-finger,
   debug). Booleans reuse the `radioRow` style — the code mirrors the confusion.
3. **ASCII glyphs jitter**: `(*)`/`( )` and `[X]`/`[  ]` are text with different widths;
   toggling reflows the row. This is the "jumps around" complaint.
4. **Info affordances random**: `?` (token), `i` (gestures), `?` (server); modals vs
   inline hints vs nothing; hint indentation via leading spaces.
5. **Grouping lies**: task-home opener gestures live under "Handwriting"; debugging is
   split across both tabs (server in Connections, mode in Advanced).
6. **Dead control**: "Open plugin to: Last Used" saves but is never read (T-005 #2).
7. **Save-button trap**: all controls mutate local state; Back without Save silently
   discards. Meanwhile Test buttons act immediately. Two mental models, silent loss.

## 2. Current layout (abbreviated)

```
[ Settings ]                          [Save] [Back]
[Connections] [Preferences]
--------------------------------------------------
CONNECTIONS                 PREFERENCES
 Todoist API Token (?)       General
  [___________][Paste][Show]  Default tab  (Today|Upcoming|Projects)   <- pills
 Test Connection              After creating a task
 ------------                  (*) Ask (Add/Done)  ( ) Go back         <- ASCII radio
 Debug Log Server (?)         Open plugin to
  [___________][Test]          (*) Task Home  ( ) Last Used            <- DEAD SETTING
 ------------                 Projects
 Config Source                 [X] Inbox  [  ] Work  [X] Home          <- ASCII multi
  (Device file)                Default project:  (None)(Work)(Home)    <- grid buttons
                              Handwriting
                               Quick Add Gesture (i)
                                (*) Off (*) Finger ( ) Pen             <- ASCII radio
                               [X] Bezel swipe: 2+ fingers...          <- ASCII bool
                               [  ] Three-finger double tap...         <- opener, not
                               Mark as text font size                     handwriting!
                                Size: (24)(28)(32)(36)(40)             <- chips
                              Advanced
                               [X] Debug mode
```

## 3. Component vocabulary (five primitives, one file: `src/components/settings/`)

All controls are **drawn Views, not text glyphs** — fixed geometry, so state changes
never reflow. Pure black on white, 2px borders, no animation, no grayscale.

### 3.1 `Section`
Group header: bold 18px title, hairline rule above. Nothing else may create
separators or group titles.

### 3.2 `SettingRow`
Layout shell for every setting: `label` (left), optional `hint` (below label, gray),
optional `onInfo` (renders THE `?` chip — `i` is retired), `children` = the control,
and a right-aligned `savedTick` slot (see §5).

### 3.3 `Segmented` — the ONLY single-select control
Replaces radios, grids, and chips. Equal-height cells, selected cell inverts
(black bg / white text). Wraps to multiple lines for long option sets (projects).

```
Default tab       +--------+----------+----------+
                  | TODAY  | Upcoming | Projects |     selected = inverted
                  +--------+----------+----------+
```

### 3.4 `Check` — the ONLY boolean control
28x28 drawn box, 2px border. Checked = 14x14 solid black inner square.
(Inner-fill beats a checkmark: no font dependency, reads at e-ink contrast,
identical bounding box in both states.)

```
unchecked   checked
+------+   +------+
|      |   | #### |
|      |   | #### |
+------+   +------+
```

Also used (smaller, 24px) for multi-select lists like Projects — multi-select is
just N booleans; it does not get its own idiom.

### 3.5 `InfoSheet`
One modal template (title, intro, N labeled sections, Close). The token, gesture,
and server popups all become data fed into it.

**Why not RN `Switch` / native Supernote toggles:** the native Settings pills are
Ratta-internal Android UI — unreachable from the plugin's RN tree. RN `Switch`
animates (e-ink can't render it), has OS-controlled styling, and shades in gray.
Drawn Views are deterministic monochrome with zero layout shift.

## 4. Proposed layout — one scroll, five honest groups, no tabs

Tabs hid settings behind an arbitrary split. One scroll with strong section rules
is easier to scan on e-ink (and matches how users hunt: by task, not by taxonomy).

```
[ Settings ]                      Saved 11:42 ✓  [Close]
---------------------------------------------------------
ACCOUNT & SYNC
 Todoist API token (?)     [____________][Paste][Show][Save]
 Test connection           [ Test ]   "Connected: 5 projects"
 Config source             Device file - MyStyle/SuperTask/...

---------------------------------------------------------
OPENING SUPERTASK
 Default tab               | TODAY | Upcoming | Projects |
 Bezel swipe          [#]  2+ fingers up from bottom edge
 Three-finger tap     [ ]  Double tap anywhere on the page
                           (hint: long press on a linked task
                            always opens it)
---------------------------------------------------------
CAPTURING TASKS
 Quick Add gesture (?)     | OFF | Finger lasso | Pen lasso |
 After creating a task     | ASK | Go back |
 Mark-as-text size         | 24 | 28 | 32 | 36 | 40 |

---------------------------------------------------------
PROJECTS
 Show projects             [#] Inbox   [ ] Work   [#] Home
 Default for new tasks     | NONE | Inbox | Work | Home |

---------------------------------------------------------
DEBUGGING
 Debug mode           [ ]  Show Log buttons in screens
 Log server (?)            [____________________][Test]
                           "Server reachable ✓"
 Diagnostics               [ Open ]              (debug only)
```

Changes of record:
- **"Open plugin to" is deleted** until a last-used feature exists (T-005 #2).
- Opener gestures move out of "Handwriting" into **Opening SuperTask**.
- Debugging is reunited (mode + server + diagnostics) in one group.
- Token block keeps its explicit Save (paired with Test Connection); everything
  else is apply-on-change (§5).

## 5. Interaction model: apply-on-change + visible confirmation

- Every control persists immediately on tap: `saveConfig({key})` (already
  serialized + atomic after B-025) followed by `reloadGestureConfig()` where
  relevant. The global Save button is removed.
- **Per-row confirmation**: the changed row shows a right-aligned `Saved ✓` chip,
  static (no animation), cleared after ~2s or on next interaction. Timers run
  while the settings view is open, so the clear is safe.
- **Header status**: persistent "Saved 11:42 ✓" after the last successful write;
  on write failure it shows `Session only — device write failed` in bold so
  silent-loss is impossible.
- Failure of the config write never blocks the in-memory change (current behavior
  preserved: `_runtimeConfig` updates regardless).

## 6. Implementation plan

1. **Phase A — primitives** (`src/components/settings/`: Section, SettingRow,
   Segmented, Check, InfoSheet + a `useSetting(key)` hook that wraps
   loadConfig/saveConfig + the saved-tick state). No screen changes yet.
2. **Phase B — rebuild Config.tsx** on the primitives with the §4 grouping;
   delete `defaultScreen`; migrate the three popups into InfoSheet data.
3. **Phase C — polish pass on-device**: tap-target sizes (min 44px rows),
   section rhythm, refresh behavior (state changes must not trigger full-screen
   e-ink refreshes — keep updates row-local).

Sequencing: after the session-34 gesture/stability test round concludes, so test
results stay attributable to the current build.

## 7. Reusability

The primitives are plugin-agnostic (no SuperTask imports except the config hook).
When stable, copy `src/components/settings/` to `template/` alongside
dev-server.js so future plugins (SuperHub, etc.) start with the same vocabulary —
same rationale as the logging port: consistency by construction.
