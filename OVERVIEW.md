Morphise reshapes Paseo's interface from settings forms, adds a status-aware sidebar, and gives you a kanban task board with reminders that bring you back to the right chat at the right time. Change something under Settings, Plugins, Morphise and it saves on its own; every connected Paseo app updates within a moment, without a reload.

## What you can change

Settings are split into tabs: Layouts, General, Sidebar, Chat, Messages, Pages, Look, Buttons, Commands, Prompts and Advanced (the whole profile as JSON).

- **Layouts:** keep several whole setups and switch between them in settings or from the Command Center ("Morphise layout: …"). Your 0.1 profile becomes the layout "Default".
- **Sidebar view:** a replacement for the workspace list. Pick "Morphise" in Paseo's Settings, Sidebar, Sidebar view (Morphise's settings remind you while Paseo still shows its own). It lists workspaces or chats.
  - Sort by status (the order is yours), last prompt, name, newest, latest status change or most changed lines, with pinned workspaces first.
  - Group by project, status, last used (Today, Yesterday, This week…), label, or not at all, with counts in the headers. Groups you fold stay folded on that device.
  - Each group shows 5 workspaces by default, then "Show more"; change the number in settings or in the Display menu.
  - Filter by status, project, hide done, only changed, or only pinned, from the Filter menu; active filters show as tags.
  - It looks like Paseo's own sidebar: a "Workspaces" header with search, a status filter menu (with "Needs me") and a Next button that opens the next workspace waiting for you; a Pinned section; project groups with letter tiles and a "+" for a new workspace in that project.
  - Two-line rows: the title, then a muted line with what needs you ("Waiting for your permission", "Failed"), "Working" and the latest chat, and the details you chose. Running work pulses, on the chat row itself when it is listed. "One line" is an option.
  - Everything Paseo's own rows offer that a plugin can reach: on hover Pin and Archive (press twice) and a ⋮ menu, also on right-click or long press, with Copy path, Copy branch name, Rename, Labels, Remind me, Add task, Open pull request and open a service; a hover card with changes, host, branch, folder, pull request, checks, services and labels.
  - The Display menu follows Paseo's: Grouping, Sort, Title (title or branch name), Rows, Per group, Chats, and Show (Branch, Project, Host, Pull request, Checks, Services, Labels, Diff stats, Last activity), plus Show background per device.
  - Chats under a workspace: the latest 5 (changeable), then "Show more"; each chat's sub-agents under it, also the latest 5 (changeable or hidden); only the open chat or sub-agent is highlighted.
  - Shorten long groups with "Show more"; workspaces that need permission or failed always show.
  - Colours say what each row needs: needs permission amber, failed red, running white (pulsing), finished but unread green, done gray; uncommitted branches amber, unpushed commits blue, merged pull requests purple.
  - Mark a workspace done or unread yourself, set a reminder on it, add it to tasks, or select several for bulk actions (pin, mark done, label, archive).
  - Auto-archive (off by default) archives workspaces marked done some days ago, never a worktree with uncommitted, unpushed or unknown changes. Merged pull requests use Paseo's own "Archive merged PR workspaces" setting.
- **Workbench** (one row in Paseo's sidebar header): everything that needs you in one screen, with a list of views on the left that folds to icons.
  - **Waiting:** every chat and sub-agent waiting on you (permission, failed, finished unread), answered where it is listed: allow or deny a permission after reading the request, read a failed or finished chat's error and last answer and reply to it, or clear a finished one. Filter, search and group by status or workspace.
  - **Today, Board, Archived:** your tasks and reminders.
  - **Bookmarks:** answers you kept with /bookmark.
- **Steps card:** a chat's plan as a card, in the chat where the agent posts it (or in the sidebar), that shows while it works and settles when it is done. Choose when it shows, how long "All done" stays, top or bottom, the open chat or every chat in the workspace, how many steps, hiding finished steps, starting folded and the progress bar, under Settings, Sidebar, Steps card.
- **Checks panel:** a workspace tab with the pull request's checks, review and conflicts, and "Ask the agent to fix".
- **Dispatch** (the two-cards button in the Workspaces bar, or the Command Center): start several agents at once, each in a new workspace. Pick the project, any model your providers offer, the mode, and worktree or project folder (remembered on each device), write or paste the prompts (a pasted list splits into one prompt per item), and start them all with ⌘↵. Each prompt then shows Starting, Started (with Open) or Failed (with Retry).
- **Chat** (rows from Chat Polish, see NOTICE.md): tool calls (MCP tools and plans included) as single rows with a verb, the command or file and a short detail, opening to the diff, output or input; the thoughts and calls between two replies merged into one row ("Edited 1 file and ran 2 commands"); code colours for commands, diffs and JSON; program icons, word-level diffs, folded long output, pictures, Copy, a Details tab, Show in Finder; folding rules by kind; errors and notices as rows; an opt-in recap after a turn that changed files or had a command fail (the files with their + and − lines, and the failed commands); a master switch and Command Center toggles. Prompts and replies stay Paseo's own, with Fork and Copy.
- **Messages:** a bar over text you select in a chat (desktop and web, from Quote): Quote it into the message box, Reply to it in place, ask a Side chat beside the chat, Copy it as text or Markdown, or Bookmark it to the Workbench. Thumbnails for replies that are only images, image stacks that spread into a row, diagrams by Paseo's mermaid or Pele, and styles for quotes, tables, code, headings, lists and callouts.
- **Restyle Paseo (experimental, off by default):** Chat Polish's design for Paseo's own message box, cards, menus, tool groups and replies; a flat or floating window; seven working indicators; Untitled UI or Hugeicons icons; a provider rail in the model picker and a clearer context card; ⌥⌘↑ and ⌥⌘↓ to jump between your prompts.
- **Pages (experimental, off by default):** agents created while it is on get an html_render tool and draw interactive pages (charts, mock-ups) in the chat; an optional headless browser checks each page's layout first.
- **Theme:** a light or dark palette from eight colours (or one of eight ready-made ones), with contrast warnings and an optional sidebar colour, listed under Settings, Appearance.
- **Buttons:** sidebar header and footer rows, workspace header buttons or menus, your own pills above the message box, and message box controls (a button, an on/off switch saved on the chat, or a model, mode or thinking picker).
- **Commands:** slash commands, Command Center items and New workspace presets.
- **Style layer (unsupported, off by default):** hide built-in parts by their test id and add your own CSS. Desktop and browser only; any Paseo update can rename the ids it relies on.

Buttons, rows, commands and controls run one of a small set of actions: open a link, insert or replace text in the message box, set the model, mode or thinking level, or open Morphise's settings. Morphise has no action that runs commands or writes files.

## Tasks and reminders

- **Board:** open "Tasks" in the sidebar, the Tasks panel in a workspace (only that workspace's cards), or "Open tasks" in the Command Center.
  - Columns: name, colour, order, a work in progress limit, and which one is Done, under Customise.
  - Cards: title, description, priority P1 to P4, labels, due date, reminder, checklist, link, workspace, and the chat they belong to ("Insert into chat" puts the card in its message box). Drag a card to move it, to another column or to a new place in its own (with the mouse on a computer, after a long press on a phone); the board scrolls when a card is held near its edge. Screen readers move a card a column at a time from its actions.
  - Workspaces: pick a card's workspace in its editor, or use "Attach tasks" in a workspace's Tasks panel to bring existing tasks in. The main board shows each card's workspace.
  - Quick add: `Fix login p1 @bug #review due:fri tomorrow 9am`. The preview under the box shows what each part became.
  - Filter, and Display (order, rows by priority, label or workspace, card size), can be saved as views, which also appear in the Command Center. Active filters show as removable tags, and a column says how many cards a filter hides.
  - Add a card straight into a column with its plus button: type a title, press Enter, keep going.
  - Today lists reminders due, overdue cards, cards due today and reminders later today. Archived lists archived cards; Customise can archive Done cards after some days.
  - Automations: when a linked chat needs permission, fails or finishes, move its card to a column; when a card enters Done, clear its reminder. They run while any Paseo app is open.
- **Remind me:** every reminder belongs to a card. "Remind me" on a chat sets the reminder on that chat's follow-up card, creating it in the first column if needed.
  - Open the picker from the workspace header, the alarm button or a long press on a chat row in Morphise's sidebar view, or a card.
  - Choose a preset (yours, on the Sidebar tab), "This evening", "Tomorrow morning" or "Next week"; each shows the time it lands on. Or pick "Custom time…" and type `45m`, `17:30`, `5pm`, `tomorrow 9am` or `fri 10:00`. Add a note for when you come back. Reminders can be 1 minute to 7 days ahead.
  - `/remind <time>` and `/remind clear` in a chat; `/task <quick add>` adds a card linked to the chat; the Command Center has the presets and "Clear this chat's reminder".
  - When a reminder is due: "Tasks" in the sidebar shows how many are due; the card is listed under Reminders at the top of the sidebar view; open apps chime, show a toast and, if you allowed it, a desktop notification; a row appears in the linked chat with Done, +15m, +1h and Move to Done.
  - +15m and +1h on a reminder that is not due yet push it later. Reminders on Done or archived cards are paused.

## Notes and prompts

- **Chat notes:** a Notes panel beside any chat (or "Open this chat's notes" in the Command Center), saved on the chat.
- **Prompts:** saved prompts shared by every layout; pick one from the Prompts box in any message box to insert it.

## Setup and limits

Requires Paseo 0.16.0-beta.1 or later, on both the daemon and the app.

- Settings are stored on the daemon, so every app connected to that host shares them. They are plain JSON, not a secret store. Which groups are folded and which statuses are filtered are kept per device.
- The task board is one settings document on the daemon, shared by every app; changes from several apps at once are merged. Notes are stored on the chat, so they go when the chat does.
- Paseo gives plugins no notification or "unread" control, so a reminder cannot make Paseo itself ring; Morphise shows it in its own row, list, view, chime and notification. A reminder row in the chat is written by the daemon; if no app is connected at the time, it is written once one connects.
- Sorting, filtering and reminders in the list apply to Morphise's own sidebar view; plugins cannot reorder Paseo's built-in list or add items to its right-click menus, so "Remind me" sits in the workspace header, /remind, and Morphise's own rows.
- Paseo's Mark as unread, Manual (drag) order, Open project settings and Remove project have no plugin API, so Morphise's view cannot offer them. Its hover card opens under the row, because a plugin cannot draw beside the sidebar.
- With an order other than Manual (Display), dragging a card changes only its column: its place in the column follows the order.
- Actions from header buttons, sidebar rows and the Command Center act on the focused chat's message box.
- If Paseo rejects part of the settings, such as an unknown icon name, that part is skipped, the rest still applies, and the Advanced tab lists what was not applied and why.
- Ids starting with `morphise-` and the `/remind` and `/task` commands are reserved for Morphise's own items.
- CSS in the style layer can load remote resources like any stylesheet.
- The daemon needs npm: Morphise installs two packages there, `pele` (diagrams) and `sharp` (thumbnails), each loaded only when its option is used.
- Network, only for options you turn on: an icon set is downloaded from npm (and checked against a pinned hash) the first time you pick it, and the headless browser (about 100 MB) when you press Download. HTML pages run a local page server on 127.0.0.1, and agents created while the option is on keep that tool in their settings.
- While the steps card is on, Claude agents start with Claude Code's task-list tools (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`), which use some of their context.
- The selection bar, restyle and image stacks work through Paseo's page structure on desktop and web; a Paseo update can break parts of them. Turn off the separate Quote or Chat Polish plugins if you have them, or you get two bars and two sets of rows.
