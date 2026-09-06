# r/Supernote_dev post draft — SuperTask v0.3.0

> **DRAFT. Do not post until the 3.29.44 device pass on SNDEV-70 is green.**
> Single post to r/Supernote_dev only (Alex, 2026-09-06). Have ready: 2–3 screenshots
> (lasso → Add Task; task list with the This Note panel; Settings > Setup > Permissions),
> and the GitHub release with `SuperTask.snplg` + `dev-server.js` + release notes.
> Replace `<RELEASE_URL>`.

---

**Title:** SuperTask v0.3.0 — handwriting → Todoist tasks, built for the 3.29.44 / 2.26.41 plugin beta, with notes on the new permission model

---

**Body:**

SuperTask is a community plugin that turns handwriting into Todoist tasks without leaving the note: lasso a line, tap **Add Task**, fix the recognized text if needed, done. The task lands in Todoist with a link back to the exact note and page, the handwriting gets a dashed box you can long-press later to open the task, and there's an on-device task list (Today / Upcoming / Done / On Device) so you can check things off from the Supernote.

**v0.3.0** is the biggest update yet:

- **Setup without a cable.** Save your Todoist API token as `supertask-token.txt`, drop it in `MyStyle/SuperTask`, tap Import. Stored obfuscated, file deleted.
- **Redesigned task list.** Bordered tags for due/priority/project/page; a **This Note** panel listing every task captured in the note you're on with a **Note >** jump to that page; an **On Device** tab grouped by note and folder; a **Done** tab with reopen; select-then-confirm completion with Undo.
- **Gestures opt-in.** Fresh installs trigger nothing while you write. Bezel swipe and three-finger double tap are in Settings if you want them; a 1.5 s pen cooldown keeps your palm from opening the plugin mid-sentence.
- **Settings that save themselves**, with a (?) on every section. Large / XL text sizes.
- **Reliability:** gestures dying mid-session, wifi-drop freezes, memory leaks, settings lost after a crash, and task links breaking on note rename (now healed automatically) — all fixed.

**Built for the new firmware.** This build is against sn-plugin-lib 0.1.65 for **Chauvet 3.29.44** (Manta/Nomad) and **2.26.41** (A5X/A6X). If you're still on .43 / .40, update — Ratta pulled those for a sticker-data bug.

**Permission model, in practice.** The host shows one dialog per permission and the SDK has no batch call, so four cold prompts at launch was the default experience. SuperTask instead shows one explainer screen of its own (three plain-language rows, each with a "Why?" expander), then asks just-in-time:

- **Remember your settings and captured tasks** (FILE:READ + FILE:WRITE) — at Continue on the explainer. Its own folder only, `MyStyle/SuperTask`, plus an `exists()` check on a note path before jumping to it. Note content goes through the SDK note APIs, never file access.
- **Sync with Todoist** (INTERNET) — the first time tasks load. `api.todoist.com`, plus an optional LAN log server you run yourself.
- **Clean up after itself** (FILE:DELETE) — only when you import a token file; that is the plugin's single delete. Config, registry, and cache use rename-over-existing; the log rotates by copy-and-truncate.

Settings > Setup > Permissions shows the state of each and re-prompts for anything denied. Two things other devs may find useful, both in the repo:

1. A startup guard that checks/requests the four permissions sequentially with rationales and logs every state — note the SDK JSDoc lists only WRITE/DELETE/INTERNET, so `FILE:READ` is passed through by name. **I'd like to hear what `hasPermission("plugin.permission.FILE:READ")` returns on your device.**
2. A local-first rotating session log plus a zero-dependency Node log server (`dev-server.js`) for live logs over wifi, since ADB is locked down.

Also using `openFile` / `jumpToPage` for note navigation with the old intent path as a config-gated fallback, and `NativePluginManager.invalidatePluginView()` (unwrapped in the lib, but exported) as a one-shot repaint to clear e-ink ghosting on open.

**Install:** copy `SuperTask.snplg` to `MyStyle`, Settings > Apps > Plugins > Install (uninstall the old version first; token and settings live in `MyStyle/SuperTask` and carry over). Source and full release notes: <RELEASE_URL>

Known limits: Todoist only; recognition is Supernote's own, so neat printing works best; PDF text capture is basic. If something misbehaves, `MyStyle/SuperTask/logs/session.log` is always on the device — attach it and I can usually see exactly what happened.
