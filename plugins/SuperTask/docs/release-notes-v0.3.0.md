# SuperTask v0.3.0 — "Stability & Polish"

The biggest update yet: a redesigned interface, safer gestures, much easier
setup, and a long list of reliability fixes. If a previous version made your
Supernote feel unreliable — this release was built to fix exactly that.

## Easier setup — no cable required

- **Import your Todoist token from a synced file.** Save your API token as
  `supertask-token.txt`, sync it to the top level of any Supernote folder with
  the Supernote Partner app or Supernote Cloud, and tap **Import** in
  Settings > Setup. SuperTask stores it securely and deletes the file.
  (USB, Bluetooth keyboard, and on-screen entry still work — tap ? in
  Settings for all options.)

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

## Install / upgrade

1. Copy `SuperTask.snplg` to your Supernote's `MyStyle` folder (USB or sync).
2. Settings > Apps > Plugins > uninstall the old version, then Install.
3. Your token and preferences carry over automatically (they live in
   `MyStyle/SuperTask/`, outside the plugin).

*Note for existing users: quick-add and opener gestures are now opt-in — if
you used the three-finger double tap, re-enable it in Settings > Opening
SuperTask.*
