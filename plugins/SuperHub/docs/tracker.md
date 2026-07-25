# SuperHub: Features & Bugs Tracker

> Active features, tasks, and bugs for the SuperHub plugin. Same conventions as
> SuperTask's tracker: unique IDs, status, design-doc links; completed items move
> to `changelog.md` with date and outcome.

## Features

| ID | Status | Title | Design doc | Notes |
|----|--------|-------|------------|-------|
| F-001 | Open | Quick page creation with date headers | `../../SuperTask/docs/design-home-v2.md` (context), SuperTask F-019 (origin) | **Moved from SuperTask F-019 (2026-07-24, Alex): filesystem-flavored feature belongs in the file-manager plugin.** One tap on a recurring note ("Weekly Team Meetings", daily log): `insertNotePage` after current, write today's date as a header TextBox via `insertElements` (requires constructing raw type-500 elements + `createElement(500)` native cache -- see VerifyUtils schemas), then intent-jump to the new page (`NoteInsidePagesActivity`, 1-based). Long tail: maintained TOC page with linkType 0 page-links -- needs regeneration on page-index shifts, defer until core proves out. Templates: match via `getNotePageTemplate` + `insertNotePage` template param. This is also the training ground for SuperTask's F-004 dashboard (same element-authoring primitives, additive-only writes). |

## Bugs

| ID | Status | Title | Notes |
|----|--------|-------|-------|
