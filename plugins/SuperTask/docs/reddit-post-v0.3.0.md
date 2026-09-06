# Reddit post draft — SuperTask v0.3.0

> **DRAFT. Do not post until the 3.29.44 device pass on SNDEV-70 is green.**
> Target: r/Supernote (main audience), cross-post or link from r/Supernote_dev.
> Attachments to have ready: 3–4 screenshots (lasso → Add Task, the task list
> with This Note panel, Settings > Setup > Permissions, the Done tab), and the
> GitHub release with `SuperTask.snplg` + `dev-server.js` + release notes.
> Replace `<RELEASE_URL>` with the actual release link.

---

**Title options** (pick one):

1. SuperTask v0.3.0 — lasso your handwriting straight into Todoist, now built for the 3.29.44 plugin beta (plain-English rundown of what it asks permission for)
2. [Plugin] SuperTask v0.3.0: handwritten tasks → Todoist, redesigned task list, opt-in gestures, and the new firmware's permission prompts explained
3. SuperTask v0.3.0 is out — capture tasks from your notes without leaving the page (Chauvet 3.29.44 / 2.26.41 beta)

---

**Body:**

Hi all — SuperTask is a community plugin that turns handwriting into Todoist tasks without leaving your note. Lasso a line, tap **Add Task**, fix the recognized text if needed, done. The task lands in Todoist with a link back to the exact note and page, and the handwriting gets a dashed box you can long-press later to open the task. There's also a full task list on-device (Today / Upcoming / Done / On Device) so you can check things off from the Supernote.

v0.3.0 is the biggest update yet. Highlights:

**Setup without a cable.** Save your Todoist API token as `supertask-token.txt`, drop it in the `MyStyle/SuperTask` folder with the Partner app, Cloud, or USB, tap **Import**. The plugin stores it obfuscated and deletes the file. No typing a 40-character token on e-ink.

**Redesigned task list.** Crisp bordered tags for due dates, priorities, projects, and page numbers. A **This Note** panel shows every task you captured in the note you're on, with a **Note >** button that jumps straight to that page. The **On Device** tab groups tasks by note with the folder path. A **Done** tab shows the last 30 days, and completing is now select-then-confirm (tap boxes, then **Complete N** at the top, with **Undo**) so a stray touch can't finish a task.

**Gestures that stay out of your way.** Every quick gesture is now **opt-in**: fresh installs trigger nothing while you write. If you want them, there's a bezel swipe (2+ fingers up from the bottom edge) and a three-finger double tap, both in Settings. A 1.5-second cooldown after any pen contact means your palm can't open the plugin mid-sentence. Long-press on a captured task's box always works.

**Settings that save themselves.** Two pages (General / Setup), every change saves instantly with a "Saved" tick, and every section has a **?** that explains what it does in plain language. Large / Extra Large text sizes across the app.

**Reliability.** Fixes for gestures dying mid-session, freezes on wifi drops, memory leaks in long sessions, settings lost after a crash, and task links breaking when you rename a note (it now heals them automatically).

**About the new firmware and permissions.** Chauvet **3.29.44** (Manta/Nomad) and **2.26.41** (A5X/A6X) beta introduced per-plugin permissions — you decide what each plugin may touch. (If you're on 3.29.43 / 2.26.40, update: Ratta pulled those for a sticker-data bug.) The first time SuperTask starts it asks for four things, one at a time, and you can say no to any of them:

- **Read its own files** — its own folder, `MyStyle/SuperTask`: your settings, the list of tasks captured from notes, and the token file you sync there. It never reads your notes or handwriting through this; handwriting is only read through Supernote's own API when *you* lasso it.
- **Save its own files** — settings, captured-task list, and a troubleshooting log, all in that one folder. Nothing written anywhere else.
- **Tidy up its own files** — deletes only its own files: the token file right after import, the old log when the log rotates. Never notes or documents.
- **Sync with Todoist** — talks to `api.todoist.com`, and nothing else. Nothing is sent to me.

Settings > Setup > Permissions shows what's allowed, with an **Allow missing** button if you change your mind. Source is on GitHub if you'd like to check any of this.

**Install:** copy `SuperTask.snplg` to `MyStyle`, then Settings > Apps > Plugins > Install (uninstall the old version first if upgrading — your token and settings live outside the plugin and carry over). Requires the plugin beta firmware.

**Download + full release notes:** <RELEASE_URL>

Known limits: Todoist only for now; handwriting recognition is Supernote's own, so neat printing works best; PDF text capture is basic. I'd love feedback, especially from A5X/A6X owners and anyone who writes with their palm on the screen — the gesture guards were tuned on real writing sessions, but more hands help.

If something misbehaves, `MyStyle/SuperTask/logs/session.log` is always on the device — attach it to a report and I can usually see exactly what happened.

---

**Short version for r/Supernote_dev** (developer angle, link to the main post):

SuperTask v0.3.0 is up, built against sn-plugin-lib 0.1.65 for the 3.29.44 / 2.26.41 beta. Two things other plugin devs may find useful: (1) a startup permission guard that checks/requests FILE:READ/WRITE/DELETE/INTERNET sequentially with plain-language rationales and surfaces the state in Settings — the SDK JSDoc only lists WRITE/DELETE/INTERNET, so READ is passed through by name and logged; (2) a local-first rotating session log plus a zero-dependency Node log server (`dev-server.js`) for live logs over wifi, since ADB is locked down. Both are in the repo. Also using `openFile` / `jumpToPage` for note navigation with the old intent path as a config-gated fallback. Happy to compare notes on the permission model — I'd like to hear what `hasPermission("plugin.permission.FILE:READ")` returns on your devices.
