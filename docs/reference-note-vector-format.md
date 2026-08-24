# .note vector format — external research (philips/supernote-typescript)

**Source:** https://github.com/philips/supernote-typescript/blob/main/plans/vector-format-spec.md
(reviewed 2026-08-24, flagged by Alex from the dev community). The spec reverse-engineers
the `.note` binary: the `TOTALPATH` stroke store, `TITLE_`/`KEYWORD_` footer metadata, and
the `RECOGNFILE` MyScript archive — validated against Ratta's own PDF exports and the
Partner app's `flutter_note_lib.dll` field names. This file condenses what matters for
OUR plugins; read the source spec for byte-level detail.

## Format in one paragraph

`TOTALPATH` is `u32 strokeCount` then length-prefixed stroke records (~700+ bytes each):
a 208-byte `StrokeConfig` (pen id, color, thickness/100 = px width, 1-indexed page num,
layer, `stroke_kind` string, bounding box, per-stroke EMR scale), then point/pressure/tilt
arrays, a 52-byte section whose real names are known from Ratta's binary
(`m_trailStatus`, `m_copy`, `m_trailNumInPage`, shift rects), and closed polygon
**contour rings in final page-pixel space** (the rendered outline — fillable as-is).
Footer `TITLE_`/`KEYWORD_` blocks carry heading rects/styles and the **recognized keyword
text stored directly in the file**. `RECOGNFILE` is a ZIP with MyScript data; its
`ink.bink` (strokes + recognition tree + style classes) is fully decoded.

## What this explains about behavior we've already fought

1. **`numInPage` is `m_trailNumInPage`, a per-page stroke UID — and the binary's
   `page_num` is 1-indexed.** The 0.1.65 SDK change to 1-indexed element indices is the
   SDK aligning with the file format. Our element matching by `numInPage` sits directly
   on this field.
2. **Erased strokes stay in the file.** Deletion is `m_trailStatus` (0 = visible,
   -99 whole-erase, -16 lasso-delete, -4 partial, -3 moved). Eraser gestures and lasso
   paths are themselves stroke records (`record_class` -1/-2/-4/-5, `color=255` for
   erasers). This likely explains element counts that don't match visible ink — including
   the F-027 cache's "same count, different content" stale edge — and why "elements are
   atomic" from the SDK's point of view.
3. **Link/heading boxes are 2-point rect records** (`stroke_kind: "0001"`) whose
   pen/color/thickness fields are meaningless; their visual style lives in footer
   `TITLESTYLE` (`1BBBFFF` = background grey + text grey). This is the on-disk shape of
   what `setLassoTitle({style})` writes — the style values we discovered map to BBB/FFF.
4. **Coordinate transform confirmed:** `pixelX = -rawX/scale + pageWidth`,
   `pixelY = rawY/scale`, scale = per-stroke `screen_height / pageHeight`. Matches our
   EMR gesture findings (axes rotated, mirrored). The per-stroke scale field is
   authoritative — old A5X firmware uses 11.20 units/px vs current 8.45, worth
   remembering for the external user's device (B-015 diversity).

## New capabilities this unlocks (with `fetch('file://')` read access)

We can already READ arbitrary on-device files. With this spec, `.note` files become
parseable data, no SDK call needed and no note context required:

- **Keyword/heading index without recognition APIs:** footer `KEYWORD_` blocks contain
  the recognized text verbatim (`<KEYWORD:...>`), `TITLE_` blocks the heading rects.
  A background scan can build the backlinks/keyword index from `future-ideas.md`
  ("linked knowledge base") by parsing footers only — cheap, no `getElements`, works on
  closed notes.
- **Recognition text offline:** `RECOGNFILE`'s `ink.bink` is decoded (stroke geometry in
  mm + recognition tree WORD/CHAR nodes). A future OCR path that doesn't call
  `recognizeElements` per page.
- **Stroke-accurate rendering/export:** contour rings reproduce device rendering
  exactly (pressure-varying widths recovered from ring area). Pairs with 0.1.65's
  `generateCurrentDocImage` for DOC pages; for NOTE pages we could render previews
  ourselves (task cards with ink snippets, dashboards).
- **Marker forensics for F-040/F-044:** understanding rect records + `m_trailStatus`
  lets a reconcile pass detect what happened to a bespoke marker (moved via `-3` +
  shift rects, erased via `-16`/`-99`) by reading the note file — the "move/erase
  desync" open problem in SNDEV-64 gets a ground-truth answer path.
- **canHandwrite context:** the format shows ink is a flat stroke log with tool ids —
  nothing view-specific. Whatever `canHandwrite` reports, committed pen-through ink
  (B-031) would land as ordinary `pen=16` records; a diagnostic could detect exactly
  the strokes written while a plugin view was up (timestamp/UID window) and, with the
  page APIs, offer an undo.

## Cautions

- Everything here is **read-path knowledge**. Writing `.note` binaries directly stays
  off the table — the SDK element APIs are the sanctioned write path; a malformed
  TOTALPATH risks the user's notes.
- Firmware version changes record tails (the spec handles it via `strokeLen` skipping);
  any parser we write must do the same and treat unknown fields as opaque.
- The spec's open questions (page.bdom grammar, index.bdom purpose) don't block any of
  the uses above.

## Cross-references

- SNDEV-70 (T-008, 0.1.65 migration) — `docs/design-sdk065-migration.md`
- SNDEV-64 (F-040 bespoke markers), SNDEV-68 (F-044 completion-in-ink)
- SNDEV-59 (B-031 pen write-through) — detection idea above
- `future-ideas.md` — backlinks index / wiki-links (keyword parsing makes these cheap)
- `official-docs-extracted.md` — EMR coordinate documentation this spec validates
