# Changelog

This project follows [semantic versioning](https://semver.org).

## 0.8.0 - 2026-11-12

- **Chats no longer vanish.** Chats and sub-agents whose agent process stopped ("closed") stay listed while Paseo still has them. Before, a workspace whose chats had closed showed none, even with their tabs open. Archived ones stay out, as in Paseo.
- **Sub-agents:**
  - Sub-agents always sit under their top-level chat, deeper ones too.
  - One whose parent is not listed shows on its own.
  - New choice in Display, Sub-agents per chat: Hidden, Only the open one, or 3, 5, 10, 20.
- **Status colours:** needs permission amber, failed red, running white (pulsing), finished but unread blue, done a dim grey-green.
- **Git and detail colours:**
  - The branch turns amber with uncommitted changes.
  - ↑ commits to push show in blue, ↓ commits to pull in amber.
  - Merged pull requests show in purple.
  - Labels carry their own colour dot.
- **New in the row menu:**
  - Remind me, for the workspace itself.
  - Mark as done, or Mark as unread. These are Morphise's own marks, shared by every app. A mark lasts until the workspace's status changes, and Unread clears when you open the workspace. Marks are never offered on, and never hide, a workspace waiting for permission or one that failed.
  - Add task.
  - Copy pull request link.
  - Select.
- **Bulk actions:**
  - Choose Select in a row's menu, then tick rows.
  - A bar under the list pins or unpins, marks done, labels, or archives them all.
  - Archive asks twice, and says how many of the worktrees still have uncommitted, unpushed or unknown changes. Archiving deletes a Paseo worktree's folder.
- **Auto-archive marked done** (Display menu, off by default):
  - Archives workspaces marked done 1 to 30 days ago.
  - Like Paseo's own safe archive, it skips a worktree unless its git state is known clean with nothing unpushed. It also skips workspaces that are pinned, running, waiting for permission, or failed.
  - For merged pull requests, turn on Paseo's own "Archive merged PR workspaces" in its host settings.
- **Dispatch** (a new row in Paseo's sidebar header, and in the Command Center):
  - Choose a project, an agent your chats already use, and a new worktree or the project folder. Then write several prompts; each starts its own workspace and agent.
  - If one fails, Dispatch stops, says why, and keeps the prompts not yet started.
- **Smaller fixes:**
  - An empty due date no longer reads like a date.
  - Web text fields draw one focus ring, not two.

Rolling back to 0.7.0: `paseo plugin update morphise --ref v0.7.0`.
- **Settings that 0.7.0 cannot read:**
  - Sub-agents per chat set to "Only the open one".
  - Auto-archive marked done turned on.
  - With either chosen, 0.7.0 reports the profile as invalid and keeps the data. Switch them back first.
- **Marks:** 0.7.0 ignores the Done and Unread marks.

## 0.7.0 - 2026-11-12

The Morphise sidebar view now offers everything Paseo's own sidebar does that a plugin can reach, plus its own extras.

- **Rows like a session list:**
  - Two lines: the title, then a muted line.
  - The muted line says what needs you ("Waiting for your permission" in amber, "Failed" in red), or "Working" with the latest chat. Then the details you chose.
  - "One line" is an option in Display.
- **Running work pulses;** the list shows pulsing placeholder rows while it loads.
- **Paseo's row menu:** ⋮ on hover, or right-click (long press on touch).
  - Copy path, Copy branch name, Rename, Pin to top, Labels (tick or create), Archive.
  - Also Open pull request and open a running service.
- **Hover card:** title, changed lines, host, branch (with ahead and behind), folder, pull request and checks, services, labels.
- **Pull requests, checks and services** on rows, as Paseo shows them.
- **Display menu** in Paseo's shape, one compact row per setting:
  - Grouping, Sort, Title (title or branch name), Rows, Row height, Per group, Chats, Chats per workspace.
  - Show: Branch, Project, Host, Pull request, Checks, Services, Labels, Diff stats, Last activity. Defaults follow Paseo's.
  - Show background (kept per device).
- **Project headings:** the tile turns into the fold chevron on hover; the count shows on hover.
- **Chats under a workspace:**
  - The latest 5 (change it in Display), then Show more.
  - Sub-agents are listed under their parent chat: the latest 5 (change it, or hide them, in Display), then Show more.
  - Only the open chat or sub-agent is highlighted, not its workspace too.
- **Popovers** (Status, Workspace and the sidebar menus):
  - They float over the content and scroll inside a fixed height, instead of growing a dialog.
  - They close when you press anywhere outside them.
- **Not possible for a plugin yet:** Paseo's Mark as unread, Manual (drag) order, Open project settings and Remove project have no plugin API.
- **Hover card position:** a plugin cannot draw beside the sidebar, so the hover card opens under the row.

Rolling back to 0.6.0: `paseo plugin update morphise --ref v0.6.0`.
- **Settings that 0.6.0 cannot read:**
  - Any of the new Display choices: Rows, Title, the new Show items, Chats per workspace, Sub-agents per chat.
  - With one chosen, 0.6.0 reports the profile as invalid and keeps the data.
- **Profiles where none were chosen** stay readable by 0.6.0.

## 0.6.0 - 2026-11-11

Morphise sidebar view, cleaner and with more ways to arrange it. Inspired by the "distill" and "quieter" rules of the Impeccable and Hallmark design skills: say things once, colour only what needs you, and hide complexity until asked.

- **Matches Paseo exactly:** measured against Paseo's own sidebar.
  - Tiles and status dots share one column; text starts at the same place.
  - 36px rows, the same colours, and times on every row (last prompt, or when created).
  - Paseo's newest-first order when times tie.
- **Less clutter:**
  - A row no longer repeats its project's name inside its own project group.
  - Status dots take colour only when a workspace needs you or is running.
  - Chats under workspaces show only under the open workspace, unless you choose every workspace.
  - Headings get more space above than below.
- **A fixed header:** search, Filter, View options and Next. Menus float over the list instead of pushing it down.
- **Filter:**
  - Statuses (with "Needs me").
  - Projects.
  - Hide done.
  - Only workspaces with changed lines.
  - Only pinned.
  - Active filters show as removable tags. Filters are kept per device.
- **View options** (shared with the settings screen and every app):
  - Group by: project, status, last used (Today, Yesterday, This week, This month, Earlier), label, or none.
  - Sort by: last prompt, status, name, newest, latest status change, or most changed lines.
  - Per group: 5, 10, 20 or all.
  - Chats under workspaces.
  - Row height and row details.
- **Next:** it still reaches workspaces that a filter hides.
- **Your view stays put:** the menu, search and "Show more" stay as they were when you change a view option.
- **Per-group limit:** groups show 5 workspaces by default (change it in settings or View options), then "Show more" and "Show less". Workspaces that need permission or failed always show.

Rolling back to 0.5.0: `paseo plugin update morphise --ref v0.5.0`.
- **Settings that 0.5.0 cannot read:**
  - Grouping by "last used", the new sorts, and "Chats under workspaces: Every workspace". With any of these chosen, 0.5.0 reports the profile as invalid and keeps the data. Switch them back first.
  - A profile where none of them were chosen stays readable by 0.5.0.

## 0.5.0 - 2026-11-11

- Tasks and workspaces:
  - Link a task to a workspace from the card editor's new Workspace property (searchable, most recently used first), or attach existing tasks from a workspace's Tasks panel with "Attach tasks".
  - Cards on the main board show their workspace.
  - Changing a task's workspace or web address no longer overwrites a change made to the other in another app at the same time.
- Morphise sidebar view, rebuilt to look and work like Paseo's own sidebar, keeping every Morphise feature:
  - A "Workspaces" (or "Chats") header with search, status filter and Next as icon buttons.
  - A Pinned section; project groups with letter tiles, with "+" opening Paseo's New workspace screen for that project.
  - Quiet rows whose buttons (rename, archive after a second press, pin, remind me) appear on hover. Phones show them always.
- Fixes the card editor crashing the Tasks screen in 0.5 development builds, by reading workspace names from Morphise's own list instead of Paseo hooks that do not work in dialogs.

Rolling back to 0.4.0: `paseo plugin update morphise --ref v0.4.0`. Workspace links on tasks stay saved.

## 0.4.0 - 2026-11-11

A redesign of every Morphise screen to sit naturally beside Paseo's own. No data changes: 0.3 boards, reminders and settings load as they are.

- One set of controls throughout, sized from Paseo's own sidebar and settings: 32px controls (40px on phones), 8px rows, muted section labels, hover states, colours only from the theme.
- Fixes text boxes that collapsed to 16px tall in the card editor and elsewhere.
- Board:
  - Board, Today and Archived as one segmented control with counts.
  - Views, Filter (with a count of active filters) and Display (order, rows, card size) open as panels; active filters stay visible as removable tags.
  - Quick add shows what it understood as tags under the box.
- Columns: borderless, with the count ("3 / 5" against a limit), "hidden by filters" when a filter hides cards, and inline adding (type a title, press Enter, keep going).
- Cards: priority icon, title, labels as dot tags, one line of due date, reminder, checklist and links. Move arrows appear on hover (always on phones). Swimlanes show priority and workspace names.
- Card editor:
  - Large title and description, then a property list: Status menu, Priority control, Labels, Due date with Today, Tomorrow and Next Monday, and Reminder, Link and Chat.
  - A checklist with a progress bar.
- Reminder picker: a list of choices, each with the time it lands on ("In 15 minutes, 22:01"), plus "Next week" and "Custom time…" with a live preview.
- Customise: grouped sections with clear rows for columns, labels, automations and archiving.
- Chat "Remind me" popover (pill and workspace header): a compact header with the chat's name on one line, the new picker, and "Add this chat to your tasks" as a menu row; a clear empty state when a workspace has no chat.
- Reminder row in chats: a small card with the task, its note, "Due now", "Moved to …" or "Done", and Done, +15m, +1h and Move to Done buttons.
- Notes panel: a header with the character count, a roomier text area, and a save status with an icon.
- Settings: the status order is a list with colour dots and up and down buttons.
- Morphise sidebar view:
  - Rows match Paseo's: 36px, 8px radius, 14px titles, dimmer times, Paseo's selected colour, and native-style section labels.
  - The status chip wall is now a filter menu with "Needs me", and active statuses show as removable tags.
  - Pin and alarm buttons appear on hover, when set, or always on phones.

Rolling back to 0.3.0: `paseo plugin update morphise --ref v0.3.0`.

## 0.3.0 - 2026-11-11

- Tasks: a kanban board in the sidebar's "Tasks" row, as a Tasks panel in each workspace, and in the Command Center.
  - Columns you name, colour, reorder and limit (the count turns red over the limit); one of them is Done.
  - Cards with priority, labels, due date, reminder, checklist, a link, and the chat they belong to. Move them with the arrows or in the editor.
  - Quick add: `Fix login p1 @bug #review due:fri tomorrow 9am` sets priority, label, column, due date and reminder in one line, with a preview.
  - Filters (text, priority, labels, due, has reminder), sort, rows by priority, label or workspace, compact cards, and saved views (also in the Command Center).
  - Today tab (reminders due, overdue, due today, later today) and Archived tab; Done cards can archive themselves after a number of days.
  - Automations: when a linked chat needs permission, fails or finishes, move its card; when a card enters Done, clear its reminder.
  - `/task <quick add>` and "Add this chat to your tasks" create a card linked to the chat.
- Reminders are now task reminders. A chat's "Remind me" sets the reminder on that chat's follow-up card.
  - New picker: the current reminder with Done, +15m and +1h; your presets; "This evening" and "Tomorrow morning"; any typed time (`45m`, `17:30`, `5pm`, `tomorrow 9am`, `fri 10:00`) with a preview; and a note.
  - Open it from the chat's pill (which counts down, for example "⏰ 25m"), the workspace header, `/remind`, the Command Center, or the alarm button (or a long press) on chat rows in the Morphise sidebar view.
  - The reminder row in the chat has Done, +15m, +1h and "Move to Done". +15m on a reminder that is not due yet pushes it later rather than sooner.
  - Reminders set in 0.2 move onto the board as follow-up cards the first time 0.3 runs.
- Sidebar view: a "Chats" list with status filters, beside the "Workspaces" list. Settings now say when Paseo is still showing its own sidebar, and where to pick Morphise's.
- The "Reminders" sidebar row and screen are replaced by "Tasks".

Rolling back to 0.2.1: `paseo plugin update morphise --ref v0.2.1`. 0.2.1 does not read the task board (it stays saved and returns if you update again), and reminders already moved onto the board will not show in 0.2.1.

## 0.2.1 - 2026-11-11

- Fixes installing and updating from GitHub: 0.2.0 failed to build ("Could not resolve type dependency") because two files imported types from Paseo packages that are not part of the plugin SDK. Use 0.2.1 instead of 0.2.0.
- A test now fails if plugin code imports any Paseo package other than `@getpaseo/plugin`.

## 0.2.0 - 2026-11-11

For Paseo 0.16.0-beta.1 and later (the 0.17 upper limit is removed).

- Settings forms in tabs (Layouts, Sidebar, Look, Buttons, Commands, Prompts), all editing one draft with errors shown beside each field; the JSON editor stays as the Advanced tab. "Edit layout" opens the Sidebar tab.
- Named layouts: several saved setups, switched in settings or from the Command Center. A 0.1 profile is upgraded automatically into the layout "Default".
- Sidebar view: sort by status with your own status order, then by last prompt or name; pinned first; status groups with counts; folding remembered per device; search, status chips, a "Needs me" chip and a Next button; "Show more" for long groups that never hides workspaces needing permission or failed; optional branch, diff, time in status and project on rows; pin button.
- Chat reminders: "Remind me" pill, `/remind`, and Command Center items, with editable presets (default 15 minutes, 30 minutes, 1 hour, 3 hours). Due reminders show in a Reminders sidebar row and list, at the top of the sidebar view, as a chime, toast and optional desktop notification, and as a row in the chat.
- Chat notes panel, saved on the chat.
- Prompt library shared by every layout, picked from the message box.
- Ids starting with `morphise-` and the `/remind` command are reserved.

Rolling back to 0.1.0: `paseo plugin update morphise --ref v0.1.0`. 0.1 cannot read the 0.2 settings document and shows it as invalid, keeping the data; copy your settings from the Advanced tab before updating so you can paste them back.

## 0.1.0 - 2026-11-11

First release, for Paseo 0.16.0-beta.1 up to 0.17.

- One JSON profile, edited under Settings, Plugins, Morphise, applies live on every connected app.
- Profile sections: theme, sidebar header and footer rows, sidebar view, workspace header buttons and menus, composer pills and toolbar controls, slash commands, Command Center items, New workspace presets, hidden timeline row types, and an opt-in style layer for desktop and browser.
- Parts of a profile that Paseo rejects are skipped and listed in the editor; the rest still applies.
- The last received profile stays applied while the daemon connection is down.
