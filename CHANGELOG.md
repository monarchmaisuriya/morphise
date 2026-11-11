# Changelog

This project follows [semantic versioning](https://semver.org).

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
