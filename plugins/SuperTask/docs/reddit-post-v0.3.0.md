# r/Supernote_dev post draft — SuperTask v0.3.0

> **DRAFT.** Post after the build 1i pass and the v0.3.0-beta GitHub release exist.
> Replace `<RELEASE_URL>` with the release link. Screenshots to attach: Task Home with
> the This Note panel; the permissions explainer; Settings > General.

---

**Title:** SuperTask v0.3.0 — handwriting to Todoist, now with a redesigned task list, consistent gestures, and support for the new plugin firmware

---

**Body:**

Hi all. SuperTask is a community plugin that turns handwriting into Todoist tasks without leaving your note: lasso a line, tap Add Task, done. The task lands in Todoist with a link back to the page it came from, and you get a task list on the device itself.

It has been a while since the last release (v0.2.0 in June), and a lot has changed. The big ones:

**Task Home redesign.** The list is much easier to read at a glance: clean bordered tags for due date, priority, project, and page number. A **This Note** panel shows everything you have captured in the note you are in. An **On Device** tab groups tasks by note and folder. There is a **Done** tab, and completing is now select-then-confirm with an Undo, so a stray touch never finishes a task. It also remembers which tab you were on.

**Gestures rebuilt for consistency.** The quick gestures now behave the same way every time. They are all opt-in, so nothing happens while you write unless you have turned it on: the bezel swipe is there in Settings if you want it. Long press on a captured task's box still opens it directly.

**Settings redesigned.** Both pages, General and Setup, are new. It opens to General, every change saves the moment you make it, and every section has a (?) that explains what it does in plain language. There is also a text size setting if you want things larger.

**Easier setup.** No more typing a 40-character token on e-ink. Save it as a text file, sync it into the SuperTask folder with the Partner app, tap Import, and the file is deleted once the token is stored. Bluetooth keyboard and the on-screen keyboard still work if you prefer.

**Jump to the note.** From any task, tap Note > and you land on the exact note and page it came from, using the new navigation the latest firmware added. Rename a note and the links repair themselves.

**Built for the new plugin firmware.** This release is for Chauvet 3.29.44 (Manta/Nomad) and 2.26.41 (A5X/A6X), which introduced per-plugin permissions. The first time SuperTask opens it shows one screen explaining exactly what each permission it asks for is used for, so you can see what it touches before you accept. Everything it saves lives in one folder, MyStyle/SuperTask, and the only place data goes is your own Todoist account.

Plus a good deal of reliability work underneath: it opens instantly, copes with wifi dropping mid-load, and keeps a log on the device you can attach to a bug report.

**Install:** copy SuperTask.snplg to MyStyle, then Settings > Apps > Plugins > Install. If you are upgrading, uninstall the old version first; your token and settings carry over.

**Download and full release notes:** <RELEASE_URL>

Todoist only for now, and handwriting recognition is Supernote's own, so neat printing works best. Feedback very welcome, especially from A5X and A6X owners.
