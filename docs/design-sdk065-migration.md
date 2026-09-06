# sn-plugin-lib 0.1.65 migration: openFile/jumpToPage, lifecycle, page elements

**Jira: SNDEV-70 (T-008).** Scoped 2026-08-24 from the published 0.1.65 source (npm),
the dev-community changelog, and our intent-era code. Related tickets: SNDEV-59 (B-031),
SNDEV-64 (F-040), SNDEV-68 (F-044), SNDEV-7 (SuperHub epic).

## 1. openFile + jumpToPage vs the native-intent machinery

### Verified signatures (from 0.1.65 source, `src/sdk/`)

```ts
PluginFileAPI.openFile(filePath: string, page: number)  // page >= 0 jumps; -1 = last-viewed
PluginCommAPI.jumpToPage(page: number)                  // "Page index, starting from 0"
```

Both return `APIResponse<boolean>`; both run VerifyUtils validation (`page` integer,
`min: -1` / `min: 0`; non-empty path). **Pages are 0-based** — only element
`numInPage` indices went 1-based in this release. The intent-era `api_page + 1`
conversion dies with the intents; registry 0-based pages pass straight through.
This is an off-by-one trap in BOTH directions during migration: every call site
that currently does `+ 1` must lose it when switched to the native APIs.

### Capability matrix

| Capability | Intent machinery (`noteOpener.js` + `NoteOpener` native module) | 0.1.65 native | Verdict |
|---|---|---|---|
| Open .note at page | `NoteInsidePagesActivity`, 1-based `page` extra | `openFile(path, page0)` | **Replace** |
| Open note, keep last page | `page=0` extra (behavior fuzzy) | `openFile(path, -1)` — explicit contract | **Replace** |
| Same-note page jump | Same intent re-targeting the running editor — the F-026 "This Note" case that never verified | `jumpToPage(page0)` — purpose-built | **Replace (finally testable)** |
| Open PDF at page | Document `MainActivity`; page extra "may be ignored" | `openFile` supports `pdf, epub, cbz, xps, fb2, note` | **Replace, better** (more formats; page contract explicit) |
| Open FOLDER in file manager | `FileManagerMainActivity`, `folder_path`, `source_type=2` | **Not covered** — openFile is file-only | **Intent survives** |
| Existence pre-flight | Ours (`RNFS.exists`) before firing intent | Unknown whether openFile fails cleanly on missing path | **Keep ours** (feeds the B-005 heal-retry and in-plugin error banner) |
| Close plugin view after nav | Ours (150ms delay + `closePluginView`) | Unknown whether openFile auto-dismisses the plugin view | **Device question #1** |

### Migration design (SuperTask `noteOpener.js`)

Keep the module as the single seam — its public API (`openNote(path, page1)`,
`openFolder`, `openDocument`) stays; internals switch:

1. `openNote`: try `PluginFileAPI.openFile(path, page1 - 1)` (our wrapper keeps its
   historical 1-based contract with `0 = last-used` → translate to native `-1`).
   On failure or when the API is absent (old firmware), **fall back to the intent
   path**, log which path ran. Config-gated kill switch (`useNativeOpenFile`,
   default on) for the first build so a device regression is a settings toggle,
   not a rebuild.
2. TaskHome same-note jumps (`sameNote === true`): use `jumpToPage` instead of any
   file open — no activity churn, and it makes the "This Note" p.N jump finally
   verifiable.
3. Pre-flight `exists()` and the heal-retry stay in front of both paths.
4. `openFolder`: unchanged — intents remain the only mechanism. Document this as
   the surviving use case for the native module (per Alex: keep the former
   approach noted; supplemental libraries still cover gaps).
5. After one release of clean device confirmations, demote the intent path to
   fallback-only and mark `design-native-intents.md` as superseded-for-files.

**Device questions to answer in the first migration build:**
1. Does `openFile` dismiss the plugin view itself, or do we keep the 150ms
   `closePluginView` dance?
2. Does `openFile` fail with a clean error on a missing path (vs stranding the
   user in the editor's own error)?
3. Does `jumpToPage` repaint cleanly mid-session (relates to B-033 ghosting)?
4. Firmware floor: what do these calls return on a device that hasn't updated?
   (Determines how loud the fallback logging should be.)

## 2. Per-page element APIs (deep-linking implications)

Verified signatures — all take `page` plus an optional **`layer`** (note files;
`null` = terminal default), which the old `replaceElements` flow never exposed:

```ts
modifyPageElements(elements: Element[], page, layer?)       -> number[]
insertPageElements(elements: Element[], page, layer?)       -> boolean
deletePageElements(numsInPage: number[], page, layer?)      -> boolean
batchUpdatePageElements(deleteNumList, elements, page, layer?) -> boolean  // delete-then-insert
getPageDisplaySize()                                        -> {width, height}
```

Consequences for the marker/deep-link roadmap (F-040/F-044):

- **Own the marker, not the URL.** With surgical insert/modify/delete, the bespoke
  marker (F-040 option B) stops being risky: no whole-page `replaceElements`, no
  502/controlTrailNums whole-page hazard. The `supertask://` URL remains our ID
  encoding *inside* elements, but activation stops depending on hijacking native
  link behavior.
- **Completion write-back (F-044)** maps to `modifyPageElements` (restyle in
  place) and the batch-on-open sync pass to `batchUpdatePageElements`.
- **Layer parameter** opens a design option: markers on their own layer, isolated
  from the user's ink (survives user-layer operations; easy bulk maintenance).
  Needs device characterization of how layers interact with lasso/erase.
- **1-indexed `numsInPage`** here, while our stored/matched element numbers came
  from 0.1.43-era APIs — the audit item from SNDEV-70 applies to every call.

## 3. registerPluginLifeListener

Shape (verified): `PluginManager.registerPluginLifeListener(listener)` where the
listener is a generic `{onMsg(msg)}`; events per changelog: init, mount, start,
pause, unmount, destroy, with a 1-second re-delivery window for late registration.

Adoption plan: `viewState.js` subscribes and treats lifecycle events as the
**authoritative** source, keeping the existing manual open/close marks as
cross-checks (log divergences for one release, then delete the manual paths).
Downstream wins: heal-per-view-open becomes exact; gesture pen-cooldown and the
B-031 diagnostics get true view state; the B-033 ghost investigation gets
mount/start timing hooks for a one-shot full repaint if we go that route.

## 4. Permission model — the sleeper risk

`PluginManager.hasPermission` / `requestPermission` exist with named permissions
including **`plugin.permission.INTERNET`** and **`plugin.permission.FILE:DELETE`**
(source JSDoc; status codes 0 = denied, 1 = while-in-use, 2 = always).

If the new firmware enforces INTERNET on plugins, **all Todoist sync and dev-log
upload breaks silently until we request it.** Migration build must:
1. `hasPermission` for INTERNET + relevant FILE permissions at startup,
2. `requestPermission` with a user-facing rationale when missing,
3. surface denied-state in Settings > Account & Sync (not a silent dead sync —
   the visibility principle).

**Update 2026-09-06 (Chauvet 3.29.44 / 2.26.41 — "plugin permission
management"; 3.29.43 / 2.26.40 were pulled for sticker loss).** Ratta's
review guidelines name four permissions — `FILE:READ` ("not granted by
default"), `FILE:WRITE`, `FILE:DELETE`, `INTERNET` — and there is no
build-time declaration (PluginConfig.json has no permission field): grants
happen through the host dialog at first use. `permissions.js` now checks and
requests all four sequentially with plain-language `desc` strings, exports
the same explanations for a Settings > Setup > Permissions row (status chips
+ Allow missing) and info sheet, and `initTaskCache` is sequenced behind the
guard so first-launch's FILE:READ dialog resolves before the first disk read.
Note the SDK JSDoc lists only WRITE/DELETE/INTERNET — FILE:READ is passed
through as a string and its outcome logged; an unknown name is non-fatal.

**Flow redesign (Alex, same day):** four host dialogs in a row on first launch
is a bad experience, and they cannot be merged (one `requestPermission` per
name, no batch API, no manifest). So: (1) `PermissionsIntro` — one explainer
screen of ours, three plain-language rows with "Why?" expanders, Continue;
(2) just-in-time groups in `permissions.js`: `folder` = READ+WRITE at
Continue, `sync` = INTERNET at the first Todoist / log-server call, `cleanup`
= DELETE at token import only; (3) technical names only inside the expanded
why. To make DELETE genuinely import-only, persistence no longer unlinks:
config/registry/cache atomic writes rely on rename-over-existing (rename(2)
on Android), cache invalidation overwrites with `{}`, log rotation is
copy+truncate. Whether the host counts rename-replace as a delete is a device
question — if config saves fail with FILE:DELETE denied, that is the tell.

**Scope discipline (Alex):** the token import used to sweep the top level of
all six sync roots — FILE:READ far beyond the feature's need. It now looks
only in `MyStyle/SuperTask` (the folder the plugin already creates for
`supertask-config.json`), top level, one filename. Every file the plugin
reads/writes/deletes lives in that folder, except two read-only `exists()`
pre-flights on note paths before a jump. That is the story told to users and
to the InkHub review process.

## 5. canHandwrite

Verified JSDoc: "Checks whether the current view supports **EMR** handwriting."
Characterization plan (attach to SNDEV-59): call it from a plugin view, from a
note, from Settings screens; log alongside the B-031 pen-through diagnostics. If
it returns false on plugin views while pen ink still commits to the note
underneath, that's a crisp, evidenced follow-up for ratta-feedback item 9.

## 6. Delivery sequence (per Alex, 2026-08-24)

0. **Now, pre-migration:** exact-pin current versions (`0.1.43` / `0.1.19`) —
   the `^` ranges satisfy 0.1.65 and would jump silently across the 1-indexing
   break on any lockfile regeneration.
1. Ship v0.3.0 on 0.1.43 (two Testing items remain).
2. Branch `sdk-0.1.65`: pin 0.1.65, re-extract SDK source into repo `src/`,
   run the SNDEV-70 index audit, add permission checks.
3. Build 1 (characterization): openFile/jumpToPage behind the config gate with
   intent fallback + lifecycle listener in log-only mode + canHandwrite probes.
   Answer the device questions above.
4. Build 2: flip defaults, demote intents to fallback, adopt lifecycle as
   authoritative.
5. Then F-040 prototype on the new element APIs (marker insert/modify/delete,
   layer experiment), unlocking F-044.

Every step keeps the previous mechanism compiled-in and reachable via config —
"backups first," and the intent library remains documented as the pathway for
what the SDK still can't do (folders; anything on old firmware).
