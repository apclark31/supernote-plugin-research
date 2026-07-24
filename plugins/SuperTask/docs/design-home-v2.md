# TaskHome Redesign v2 — Chips, Drawn Controls, This Note

> Extends the settings design language (design-settings-v2.md) to the home
> screen: bordered chips for all row metadata, drawn checkboxes, inverted-cell
> tabs, no grays. Tracked as F-024. Reviewed with Alex 2026-07-24.

## 1. What was wrong

1. **Row metadata was floating gray text**: `P1` black / due `#666` / project
   `#999` -- a grayscale hierarchy on a device whose guidelines say borders and
   typography, not shades. Urgency was font-weight 700 vs 900 (invisible at 13px).
2. **Task checkbox was a text glyph** (`○`) -- inconsistent with the drawn-box
   language settings v2 established.
3. **On Device rows misaligned**: the `p.N` label was an outboard 36px column
   bolted around TaskRow, shifting checkbox/indent vs every other tab.
4. **Registry-only (not-yet-synced) tasks were indistinguishable.**
5. **Grays everywhere**: `#f5f5f5`/`#f8f8f8` section tints, `#e0e0e0` separators
   -- dither/ghost on e-ink.
6. **Header had up to five identical buttons** (+ / Settings / Log / Diag /
   Close) -- no hierarchy; Log/Diag redundant since Settings > Debugging.
7. **Three count formats**: `THIS PAGE 3`, `INBOX (3)`, `12 tasks`.
8. **TabBar** (underline + gray inactive) didn't match the settings tab language.
9. **"This Page" was page-scoped**: in a long note, tasks two pages away were
   invisible; no way to know where a task lives before jumping.
10. **Device tab note labels were bare filenames** -- "1x1" with no clue which
    folder/parent it belongs to. (Root cause: registry addTask silently DROPPED
    the notePath field QuickAdd was passing.)

## 2. The design

```
[ SuperTask ]                      [+ NEW] [Settings] [Close]
=============================================================
| TODAY | Upcoming | Projects | On Device |   <- inverted active cell
=============================================================
THIS NOTE [2]  Connor-1x1
 [ ] Call the plumber          [Today] [P1] [p.2]
 [ ] Order filament            [Jul 28] [Home] [p.7]
=============================================================
WORK ──────────────────────────────────────── [3] ── > ──
 [ ] Send quarterly summary    [Overdue Jul 20] [P2]
 [ ] Review PR feedback        [Today]
-------------------------------------------------------------
 12 tasks                                          Refresh
```

- **Chip** (`src/components/Chip.tsx`): the ONE metadata idiom. 1px border,
  12px text, black-on-white; `inverted` (white-on-black) reserved for urgency
  (Overdue). Used for: due date, priority, project, page number, sync state,
  and every count in the app (This Note band, section headers).
- **TaskRow**: drawn `Check` box (shared with settings) as the completion
  target (44px hit area); title; wrap-row of chips. Chip order: due, priority,
  project, page, `pending sync` (registry-only tasks are now labeled).
- **TabBar**: segmented cells, active inverts -- same language as settings tabs.
- **SectionHeader**: white bg, 2px top rule, uppercase title, count Chip,
  chevron when tappable. No gray tint.
- **Header**: `+ New` is the single inverted (primary) button; Settings, Close
  plain. Log/Diag removed -- they live in Settings > Debugging.
- **Separators**: 1px black hairlines, indented to the content edge (66px).

## 3. "This Note" band (was "This Page")

Scoped to the whole CURRENT NOTE, not just the current page, with a page chip
per task -- in a long note the band now answers "what's tracked here and where
would I jump." Pinned between the tab bar and content, visible on every tab
(it answers a different question than the tabs: where you physically are).

Sources, deduped in order:
1. supertask:// links scanned on the current page (page = current)
2. Description back-references matched note-wide; page parsed from
   `<fileName>[.note] p.N`
3. Registry entries for the note (carry pageNum; cover pending-sync tasks)

Sorted by page. Contingency if bands grow tall in practice: cap at 3 rows with
a "+N more" expander (not built preemptively).

## 4. On Device tab

- Page number rides in the row's chip line (`p.4`) -- outboard column deleted,
  alignment restored.
- Note headers are filesystem-style: `/storage/emulated/0/Note/Connor/1x1.note`
  -> **"Connor / 1x1"** (storage root + Note/Document prefix stripped). Falls
  back to bare filename for registry entries that predate notePath storage.
- Registry now persists `notePath` (addTask previously dropped it; TaskAdd now
  passes it too, QuickAdd already did).

## 5. Opening straight to On Device

`Settings > Opening SuperTask > Default tab` now includes **On Device** -- users
who mainly capture on-device can land there. Also fixed while wiring it: the
deep-link `focusTab` param was silently ignored by TaskHome (App.tsx never
forwarded it; TaskHome only read the config default). Now: explicit focusTab
wins, config default applies otherwise, unknown values fall back to Today.

## 6. Knock-on inheritance

ProjectView (and anything else using TaskRow/SectionHeader/TabBar) inherits the
chip language automatically. TaskDetail/QuickAdd/Capture restyle is a separate
pass once this proves out on-device -- same sequencing logic as settings.
