# SuperTask v0.3.0 — "Stability & Polish"

The biggest update yet: a redesigned interface, safer gestures, much easier
setup, and a long list of reliability fixes. If a previous version made your
Supernote feel unreliable — this release was built to fix exactly that.

## Easier setup — no cable required

- **Import your Todoist token from a synced file.** Save your API token as
  `supertask-token.txt`, put it in the `MyStyle/SuperTask` folder on your
  Supernote (the folder SuperTask creates on first run) with the Supernote
  Partner app, Supernote Cloud, or USB, and tap **Import** in
  Settings > Setup. SuperTask stores it securely and deletes the file. Only
  that one folder is checked. (USB config editing, Bluetooth keyboard, and
  on-screen entry still work — tap ? in Settings for all options.)

## Permissions — what SuperTask asks for, and why

Supernote firmware **Chauvet 3.29.44** (Manta/Nomad) and **2.26.41**
(A5X/A6X) let you decide, per plugin, what it may touch. The first time
SuperTask starts on that firmware it asks for four permissions, one at a
time. You can decline any of them; the matching feature simply stops
working, and Settings > Setup > Permissions shows what is allowed with an
**Allow missing** button if you change your mind.

| Permission | What SuperTask uses it for |
|---|---|
| Read its own files | Its own folder, `MyStyle/SuperTask`: your settings, the list of tasks captured from notes, a cached task list, and the token file you sync there. Also checks a note still exists before jumping to it. Your notes and handwriting are never read through this permission. |
| Save its own files | Settings, captured-task list, task cache, and a troubleshooting log — all inside `MyStyle/SuperTask`. Nothing is written anywhere else. |
| Tidy up its own files | Deletes only its own files: the token file right after import (so it never sits in plain text), the previous log when the log rotates, its cache. Never notes or documents. |
| Sync with Todoist | Talks to `api.todoist.com` to create, list, edit, and complete your tasks. Optionally streams the troubleshooting log to a computer on your own wifi if you set that up. Nothing is sent to the plugin author. |

Every file SuperTask reads, saves, or deletes lives in one folder. Note
content is read only through Supernote's own plugin API when you lasso it,
and only ever goes to your own Todoist account.

## Redesigned task list

- **Cleaner rows**: due dates, priorities, projects, and page numbers are now
  crisp bordered tags. Overdue tasks stand out in solid black.
- **Done tab**: see everything you completed in the last 30 days, grouped by
  day — and tap a completed task's box to bring it back.
- **Show done** (footer toggle): see today's completed tasks right on the
  Today tab.
- **"This Note" panel**: every task captured anywhere in the note you're on,
  with its page number — and a **Note >** button that jumps you straight to
  that page. The **On Device** tab shows notes with their folder
  ("Work / 1x1") and the same jump buttons.
- **Safer completion**: tap the checkbox once to arm, tap again to complete —
  no more accidentally finishing a task with a stray touch. (And if you do,
  it's one tap in Done to undo.)
- **Text size setting**: Settings > Display offers Large and Extra Large text
  across the app.

## Redesigned Settings

- Two clear pages: **General** (everyday preferences) and **Setup** (account
  and debugging).
- **Changes save instantly** — every change shows a "Saved" confirmation. No
  more lost settings from forgetting to tap Save.
- Real checkboxes and selectors that don't shift around when tapped.
- You can now open SuperTask straight to the **On Device** tab by default.

## Gestures: calmer, opt-in, palm-proof

- **All quick gestures are now opt-in** — fresh installs won't trigger
  anything during normal writing. Long press on a linked task always works.
- **New: bezel swipe** — swipe up from the bottom edge with 2+ fingers to
  open your tasks (enable it in Settings > Opening SuperTask).
- **Three-finger double tap** is now a setting too (off by default).
- Writing with your palm on the screen can no longer trigger anything —
  gestures ignore touches near pen activity entirely.
- **Long press on task links is faster** on repeat presses.

## Reliability

- Fixed the bug where gestures could permanently stop working mid-session.
- Fixed freezes when wifi dropped mid-load — the task list now always
  recovers.
- Fixed several memory leaks affecting long sessions.
- Settings and captured-task records now survive crashes and interruptions.
- **Renaming a note no longer breaks its task links** — SuperTask finds the
  renamed note and repairs everything automatically.
- Rate-limited Todoist responses are retried politely instead of failing.

## For troubleshooting

- Logs are now always saved on-device at `MyStyle/SuperTask/logs/session.log`
  — attach that file to any bug report.
- The optional live log server (`dev-server.js`, included next to the plugin
  download) can be pointed at from Settings > Setup, with a **Test** button
  and step-by-step Mac/Windows instructions.

## Firmware

This build is compiled against sn-plugin-lib 0.1.65 for the current plugin
Beta firmware: **Chauvet 3.29.44** (Manta/Nomad) and **Chauvet 2.26.41**
(A5X/A6X). Ratta pulled the previous 3.29.43 / 2.26.40 builds for a
sticker-data bug — update straight to .44 / .41. Older plugin-preview
firmware needs the previous SuperTask build (0.1.43 library).

## Install / upgrade

1. Copy `SuperTask.snplg` to your Supernote's `MyStyle` folder (USB or sync).
2. Settings > Apps > Plugins > uninstall the old version, then Install.
3. Your token and preferences carry over automatically (they live in
   `MyStyle/SuperTask/`, outside the plugin).

*Note for existing users: quick-add and opener gestures are now opt-in — if
you used the three-finger double tap, re-enable it in Settings > Opening
SuperTask.*
