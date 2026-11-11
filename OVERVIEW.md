Morphise reshapes Paseo's interface from settings forms, adds a status-aware sidebar, and helps you come back to the right chat at the right time. Change something under Settings, Plugins, Morphise, save, and every connected Paseo app updates within a moment, without a reload.

## What you can change

Settings are split into tabs: Layouts, Sidebar, Look, Buttons, Commands, Prompts and Advanced (the whole profile as JSON).

- **Layouts:** keep several whole setups and switch between them in settings or from the Command Center ("Morphise layout: …"). Your 0.1 profile becomes the layout "Default".
- **Sidebar view:** a replacement for the workspace list. Pick "Morphise" in Settings, Sidebar, Sidebar view.
  - Sort by status (needs permission, failed, running, finished unread, done; the order is yours), by last prompt or by name, with pinned workspaces first.
  - Group by project, status, label, or not at all, with counts in the headers. Groups you fold stay folded on that device.
  - Search, status chips, a "Needs me" chip, and a Next button that opens the next workspace waiting for you.
  - Shorten long groups with "Show more"; workspaces that need permission or failed always show.
  - Row details: branch, added and removed lines, time in status, project; a pin button.
- **Theme:** a light or dark palette from eight colours, listed under Settings, Appearance.
- **Buttons:** sidebar header and footer rows, workspace header buttons or menus, pills above the message box, and message box controls (a button, an on/off switch saved on the chat, or a model, mode or thinking picker).
- **Commands:** slash commands, Command Center items, New workspace presets, and hidden timeline row types.
- **Style layer (unsupported, off by default):** hide built-in parts by their test id and add your own CSS. Desktop and browser only; any Paseo update can rename the ids it relies on.

Buttons, rows, commands and controls run one of a small set of actions: open a link, insert or replace text in the message box, set the model, mode or thinking level, or open Morphise's settings. Morphise has no action that runs commands or writes files.

## Reminders, notes and prompts

- **Remind me:** from a chat's "Remind me" pill, `/remind 45m` (or `2h`, `1h30m`, `clear`), or the Command Center. The choices default to 15 minutes, 30 minutes, 1 hour and 3 hours, and you can change them on the Sidebar tab. When a reminder is due:
  - the "Reminders" row in the sidebar shows how many are due, and opens a list where you can open the chat or mark it done;
  - the chat is listed under "Reminders" at the top of Morphise's sidebar view;
  - open apps play a short chime and, on desktop and browser, show a notification if you allowed it; a toast shows while the sidebar is shown;
  - a reminder row appears in the chat itself.
- **Chat notes:** a Notes panel beside any chat (or "Open this chat's notes" in the Command Center), saved on the chat.
- **Prompts:** saved prompts shared by every layout; pick one from the Prompts box in any message box to insert it.

## Setup and limits

Requires Paseo 0.16.0-beta.1 or later, on both the daemon and the app.

- Settings are stored on the daemon, so every app connected to that host shares them. They are plain JSON, not a secret store. Which groups are folded and which status chips are on are kept per device.
- Reminders and notes are stored on the chat, so they go when the chat does.
- Paseo gives plugins no notification or "unread" control, so a reminder cannot make Paseo itself ring; Morphise shows it in its own row, list, view, chime and notification. A reminder row in the chat is written by the daemon; if no app is connected at the time, it is written once one connects.
- Sorting, filtering and reminders in the list apply to Morphise's own sidebar view; plugins cannot reorder Paseo's built-in list.
- Actions from header buttons, sidebar rows and the Command Center act on the focused chat's message box.
- If Paseo rejects part of the settings, such as an unknown icon name, that part is skipped, the rest still applies, and the Advanced tab lists what was not applied and why.
- Ids starting with `morphise-` and the `/remind` command are reserved for Morphise's own items.
- CSS in the style layer can load remote resources like any stylesheet.
