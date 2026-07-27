# SuperHub: Features & Bugs Tracker

> # FROZEN -- 2026-07-25
>
> **Tracking moved to Jira: [SNDEV](https://alexpnw.atlassian.net/browse/SNDEV), epic `SNDEV-7` (SuperHub).**
>
> This file is a historical snapshot as of the import. It is no longer maintained.
> **Do not read status from it and do not update it.**
>
> Note that this tracker only ever held F-001. The rest of SuperHub's backlog lived in
> `PROGRESS.md` (the "Feedback for next session" and "Phase 2" sections) and never made it
> here. All of it is now in Jira under `SNDEV-7`, with new IDs assigned at import:
> `B-001` double-tap launch, `F-002` tappable breadcrumb, `F-003` column layout,
> `T-001` config.local.js, `F-004` template picker, `F-005` naming/routing, `F-006` headless quick page.
>
> Find any of them by label: `project = SNDEV AND labels = "F-002"`.

## Features

| ID | Status | Title | Design doc | Notes |
|----|--------|-------|------------|-------|
| F-001 | Open | Quick page creation with date headers | `../../SuperTask/docs/design-home-v2.md` (context), SuperTask F-019 (origin) | **Moved from SuperTask F-019 (2026-07-24, Alex): filesystem-flavored feature belongs in the file-manager plugin.** One tap on a recurring note ("Weekly Team Meetings", daily log): `insertNotePage` after current, write today's date as a header TextBox via `insertElements` (requires constructing raw type-500 elements + `createElement(500)` native cache -- see VerifyUtils schemas), then intent-jump to the new page (`NoteInsidePagesActivity`, 1-based). Long tail: maintained TOC page with linkType 0 page-links -- needs regeneration on page-index shifts, defer until core proves out. Templates: match via `getNotePageTemplate` + `insertNotePage` template param. This is also the training ground for SuperTask's F-004 dashboard (same element-authoring primitives, additive-only writes). |

## Bugs

| ID | Status | Title | Notes |
|----|--------|-------|-------|
