# Changelog

This project follows [semantic versioning](https://semver.org).

## 0.19.2 - 2026-11-12

- **Board holds tasks and agents:** the Workbench's Board has two small tabs at its top, Tasks and Agents, in place of a separate Agents view. It remembers the last tab on each device. Board is listed first, and the Workbench list has no group headings: Board, Waiting, Today, Archived, Bookmarks.
- **Agent lanes fit the window:** open lanes share the width (240 pt up to the Lane width setting, now a maximum of 300, 420 or 520 pt), so the board scrolls sideways only when they cannot fit. An empty lane, and Done and Archived until you open them, fold to a narrow strip with the lane's name and count; when nothing else is open, Done opens by itself.
- **Quieter agent cards:** the title comes first, with one line under it for the project, workspace, model and time. The model is said once and short ("Opus 5.5 high", not "claude · claude-opus-5-5 · high"). The folder shows only when it differs from the project and workspace (and is off in the Standard preset). The context ring shows only while the agent works, as "44%", with a tooltip. A dot marks only a waiting permission or a failure. A card's buttons show on hover on desktop, and always on phones and tablets.
- **No green ring after a click in the Workbench:** its buttons show a quiet outline for the keyboard instead of Paseo's focus ring; text fields keep Paseo's.

## 0.19.1 - 2026-11-12

- **Switch hints no longer read like the switch's state:** "Show the Agents view" said "Off, the Workbench lists no Agents view…" even while on. Seven settings hints now say what the switch does, with "When this is off, …" for the other case (Agents view, sub-agents, minimal phone cards, Morphise's chat rows, wrapping in rows and previews, failed calls).

## 0.19.0 - 2026-11-12

Better Paseo's options and board, rebuilt in Morphise (credit in NOTICE.md). Everything Morphise already drew looks the same until you change a setting, and Paseo still draws prompts and replies with their Fork and Copy.

- **Agents view in the Workbench:** every agent on this host in lanes (Waiting, Running, To review, Done, Archived).
  - Cards show the fields you pick: provider, model, thinking, project, workspace, branch, Git status, folder, path, labels, PR, timer, context ring, plan and sub-agents, with Minimal, Standard and Full presets and a label limit.
  - Actions: Open, Archive, Allow and Deny, and Stop and Rename through Paseo's command line (Paseo's plugin SDK has neither). Unarchive and Mark as read are not offered: Paseo gives plugins no way to do them.
  - Filters by agent, label, project and workspace, search, nine sort orders, keys (J/K, H/L, Enter, /, Esc), a details pane, a done window, lane width, sub-agents, the Archived lane and minimal phone cards. Settings: Settings → Agents.
- **Generate a title:** in an agent's details, a short background agent reads the chat's start and writes a title, then the agent is renamed. Choose its provider, model and instructions under Settings → Agents. It uses tokens and runs only when you ask.
- **Turn details:** an opened recap shows the model, thinking level, time, tokens in (and cached), tokens out and cost, as Paseo reported them when the turn ended.
- **More look options:** exact text sizes (9–20 px) and code sizes (10–22 px) for Morphise's rows; accent presets Zinc, Midnight, Claude, Ghostty and Black; the system font for prompts and replies; a reading style for replies (Document, Compact, Terminal), made with CSS only.
- **Hover previews** (desktop and web, off by default): rest on a folded tool or thought row to read its content in a floating preview; delay, wrap, line numbers and shading are yours to set. Escape, scrolling or moving away closes it.
- **Tables** (desktop and web, off by default): a copy button copies a table as Markdown; double-click a cell or drag across cells (Cmd or Ctrl adds more), then Copy or Add to chat.
- **Phone-width previews:** a Desktop / Phone switch above every settings preview.
- **Safer settings:** a Chat Polish option this version cannot read (from a newer or older Morphise, or a hand edit) now falls back to its default on its own, and options it does not know are kept, so the rest of your settings still apply.
- **Not possible:** inline code colour on phones. Paseo draws replies there and plugins cannot restyle them.

## 0.18.2 - 2026-11-12

- **The steps card gets a plan to show:** Claude Code lists its task-list tools only by name (the model has to load them first), and agents never loaded them unasked, so no chat ever had a plan. While the steps card is on, each new Claude chat is now asked to keep a task list with them; Paseo adds this to Claude Code's own instructions, it does not replace them. It applies to chats started after the update; turn the steps card off to start chats without it.

## 0.18.1 - 2026-11-12

- **The turn recap says what happened:** "Changed 7 files +466 −24 · 1 command failed", opening to an Edited row per file and a Ran row per failed command, drawn like the merged steps above it. It no longer repeats the turn's duration (Paseo's footer shows "Worked for …") or counts calls. A turn that changed no file and had no failed command gets no recap, and recaps like that already in a chat draw nothing, so there is no row left that cannot open.
- **No green box around a clicked row:** Paseo's desktop app rings a focused button after a click, which boxed in the whole recap or step row. Morphise's rows show their soft hover fill when focused instead.

## 0.18.0 - 2026-11-12

- **Drag and drop on the board:** drag a card to another column, or to a new place in its own column. A lifted copy follows the pointer, a gap opens where the card will land, and the board (or a long column) scrolls when the card is held near its edge. On a phone, a long press picks the card up. The arrow buttons on cards are gone; screen readers still move a card a column at a time. With an order other than Manual, a drop changes only the card's column.
- **One toolbar row on the board:** the add field and the All tasks, Filter, Display and Customise buttons share one row in one bordered style. Enter (Return on a phone) adds the card, so there is no greyed-out Add button; the line under the field says what Enter will add. Cards with no details no longer keep an empty line at the bottom.
- **The turn recap lines up with the rows around it:** it is drawn with the same row as merged steps (icon column, text size, hover, chevron, spacing), so "Worked 38m 34s" sits in line with "Thought 2 times" and Paseo's own rows instead of smaller and offset.

## 0.17.2 - 2026-11-12

- **Turn recap in the new style:** one quiet line like the rows around it ("Worked 38m 34s · 1 file +40 · 25 calls"), without a filled bar, that opens to the files changed and any failed commands. The Chat tab's preview shows it when the recap is on.
- **"Plugin timeline item unavailable" after a turn:** the recap's renderer was registered with the chat rows, which re-register whenever the Chat settings change, so for a moment (or after a failure there) a recap had nothing to draw it. It is now registered once and follows the settings by itself.
- **Tooltips no longer stay on screen:** a tooltip closes as soon as the pointer is off its button or the button is gone (a card's hover-only Move button left its tooltip behind), and on scroll.

## 0.17.1 - 2026-11-12

- **Settings previews look right:** every preview sits inside its card with the same padding as the Chat tab's, so no note or sample touches the card's edge. The steps card preview has its own Preview section on the General tab and is drawn on a sample chat line, not as a card inside the settings card.

## 0.17.0 - 2026-11-12

- **Previews on every tab that changes a look:** Messages (a sample chat with a long prompt, a reply using every rich-text element and a diagram, an image-only reply and the selection bar), Look (a sample window in your theme with its window style, reply width, working indicator, icons and code colours), Pages (a sample page at your height limit) and General (the steps card with sample steps). Chat's preview now follows "Merge only runs of at least". Each is drawn by the same parts the real feature uses, and changes as you pick.
- **More options:**
  - Chat: merge only runs of at least 2, 3 or 5 steps; line numbers in diffs; a folded thought shows its first line.
  - Messages: selection bar buttons as icons and labels or icons only; the bar above or below the selection; a side chat model of your own (or the chat's); square or rounded thumbnails.
  - Look (with Restyle Paseo on): reply width (Paseo's, narrow, wide, full; overrides Paseo's own content width while chosen); the floating window's corner radius and gap; the working indicator's colour.
  - Pages: a height limit (none by default, 800 or 500 px), past which pages scroll inside their frame.
  - Workbench: a Display menu in Waiting to show or hide each card's workspace line and request or error line.
  Every default keeps 0.16 as it was.
- **Workbench cards keep their size on hover:** Clear and Open sit over the end of the first line instead of replacing the time.
- **Filters pick several at once, visibly:** checkbox items in Morphise's menus (the sidebar's Filter, Display and label menus) show an empty or ticked box. Statuses add up: picking another status after "Needs me" keeps permission and failed and adds it.
- **Tooltips:** every icon-only button (the sidebar header, the Workbench, the board, row buttons) and the folded Workbench rail show what they do on hover, drawn like Paseo's own tooltips (above the button, at once), from the same words screen readers read; each also carries a `data-tooltip` attribute. A tooltip leaves with its button, and touch screens show none.
- **Workbench, Waiting:** no status headings and no grouping button. Cards always group by status, each card's icon says its status, and every card shows its workspace and its request or error the same way in every filter.

## 0.16.0 - 2026-11-12

Every feature of Chat Polish (lthieu96/chat-polish) and Quote (keefeere/quote), ported with their MIT notices (NOTICE.md), except Chat Polish's writes to Paseo's own settings (fonts, sizes, theme picker) and its loading of Paseo's internal image viewer. Prompts and replies stay Paseo's own, with Fork and Copy. Restyling Paseo, downloads, thumbnails, diagrams by Pele and HTML pages are off until you turn them on. On by default: the new chat rows' look once you choose Morphise's rows (Chat, Tool calls), the selection bar (turn it off under Messages), and ⌥⌘↑ / ⌥⌘↓ to jump between prompts.

- **Chat rows in Chat Polish's design.** Tool calls, plans, thinking, to-do updates and notices as single rows with a verb (Running, Ran, Edited), the command or file and a short detail; the steps between two replies merged into one row that opens to each step; code colours for commands, diffs and JSON (pick a palette under Look). Every 0.15 chat option still applies (folding, long output, paths, labels, accent, strength, sizes, MCP cards, Details, Show in Finder, pictures). New: merged steps, icons per row type, and whether failed calls start open (Chat, Steps).
- **Selection bar (Messages tab):** select text in a chat on desktop or web to Quote it into that chat's message box, Reply to it in place (Enter sends, Ctrl or Cmd+Enter adds to the message box, Esc cancels), ask a Side chat (a sub-agent with the same model, in a side panel, that can open as a tab), Copy it as text or Markdown, or Bookmark it to the Workbench.
- **Pictures and diagrams (Messages tab):** thumbnails for replies that are only images (made on the daemon), image stacks that spread into a row with a viewer, mermaid diagrams by Paseo's mermaid or Pele, and three or four styles each for quotes, tables, code, inline code, headings, lists, callouts and rules.
- **Restyle Paseo (Look tab, experimental):** Chat Polish's design for Paseo's own items, a flat or floating window, seven working indicators in three sizes, Untitled UI or Hugeicons icons, a provider rail in the model picker, a context card with a Compact button, hover cards that glide, and the theme's sidebar colour.
- **⌥⌘↑ / ⌥⌘↓** jump to the previous or next prompt in the open chat, also through prompts Paseo has not drawn yet (and the Command Center's prompt items). Not while you type in Paseo's code editor.
- **HTML pages (Pages tab, experimental):** agents created while it is on can draw interactive pages in the chat; an optional headless browser (Download and Remove there) checks each page's layout.
- **Themes:** Chat Polish's Mariana, Ivory, Parchment and Dusk as starting points, contrast warnings, and an optional sidebar colour.
- **Update available:** Settings, General checks for a newer Morphise and installs it.
- **Workbench cards:** a status icon, a lighter title, the request or error on the second line (not "Finished" again under the "Finished" heading), the workspace with its project colour, and Clear and Open on hover.
- **Settings save when you leave too:** a change made just before leaving a settings tab is saved instead of lost.
- **The steps card now shows for Claude chats.** Claude Code gives its task-list tools (the plan the card draws) only to older models, so on Opus 5.5 and Fable agents never made a plan and the card never appeared. While the steps card is on, Morphise launches Claude agents with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. It applies to chats opened or resumed after the update; a value you set yourself wins. The tools take some of the agent's context; turn the steps card off to launch agents without them.
- **A workspace belongs to one task.** Linking a workspace that another task already has (any task not archived, Done ones too) is refused with that task's name; the card editor's workspace list shows which task has each one, the sidebar's "Add task" says "Has a task", and the board's Attach panel names the task. A chat's own task (from `/task` or a chat reminder) keeps its chat and leaves the workspace to the task that has it, and a workspace reminder goes on the workspace's task (reopening it if it was Done, so the reminder can ring). Archiving a task frees its workspace. Tasks that already shared a workspace before this release are left as they are.
- **Board cards:** a long workspace name (or any other detail under the title) is cut to one line with "…" instead of running past the card.
- **Workspace rows:** the Pin button comes before Archive, and the ⋮ menu no longer repeats them (Pin stays in the menu when its row button is turned off in Settings, Sidebar).
- **A chat's only sub-agent** can stay unlisted under its chat (Settings, Sidebar, Chats, or the Display menu); the chat row stands for it, shows its running work, and holds the highlight while it is open. Listed when unset.

Rolling back to 0.15.0: `paseo plugin update morphise --ref v0.15.0`. With any new option set (Chat, Messages, Pages, Look, the sub-agent choice or a theme sidebar colour), 0.15.0 reports the profile as invalid and keeps the data; set them back first. Agents created while HTML pages was on keep its tool in their settings.

## 0.15.0 - 2026-11-12

Every chat feature from four published chat plugins (Beautiful Chat, Refined Chat, Chat Polish, Better Paseo) that Paseo's plugin API supports, rebuilt for Morphise. Prompts and replies are never redrawn, so Paseo's Fork and Copy always stay. The full list, with what was left out and why, is in `docs/2026-11-12-1100_chat-features-all_plan.md`.

- **A new look for chat rows:** one design for every row Morphise draws (an icon, a label, what it acted on, quiet facts on the right), close together instead of boxed and spaced. "Lines" are quiet; "Cards" sit on a soft fill.
- **Tool calls:**
  - MCP and other tools are drawn too ("Search code · brevo-codebase"), with their input and result.
  - An icon per program (git, npm, docker, curl, rg and more) and coloured commands.
  - File paths from the workspace folder, or in full. Icon and label, icon only, or label only.
  - Commands say how many lines they printed, or "no output"; a failed edit says "Not applied".
  - Diffs mark the words that changed. Long lines wrap, or scroll sideways.
  - Separate limits for terminal output and for code and diffs.
  - Pictures the agent reads are shown (read on the daemon, up to 3 MB).
  - Details opens the whole output, or the file, in a Details tab; Open file reads it from disk; Show in Finder (or the folder) on desktop.
- **Folding:** a rule for rows in general, plus kinds that are always folded or always open, and short details kept open.
- **Thinking:** folded or always open, split into its steps, with its heading while it thinks and how long it took.
- **Notices:** errors, Paseo's notices and context compaction as rows.
- **Look:** code size apart from text size, strength until hovered, an accent colour (theme, jade, violet, amber, rose or your own).
- **Turn recap** (opt-in): after each turn, one row with how long it took, files changed and commands that failed. Added by the daemon, so every app sees it.
- **Master switch** to leave every row to Paseo; Command Center items to switch tool call style, thinking and the master switch, and (web) to go to the previous or next prompt.
- **Experimental (web):** reply text size and line spacing, bold colour, dashed links, long prompts cut to a few lines until hovered, chat fonts. These style Paseo's own messages through its page structure and may break with a Paseo update.
- **Theme presets** in Settings, Look: Midnight, Forest, Dusk, Paper.
- **Finished, unread** is green instead of blue (sidebar, filters, settings and the Workbench).
- **Sidebar:** a workspace with a single chat can leave it unlisted (Settings, Sidebar, Chats, or the Display menu); the workspace row stands for it.
- **Settings save on their own:** there is no Save button. A change saves a moment after you stop, once it has no problems, and applies on every connected app; a field you are typing in keeps its focus. If a save fails, the error shows with a Discard button. On the Advanced tab, valid JSON saves the same way, and "Load the starter profile" and "Clear every customisation" ask for a second press.

Rolling back to 0.14.0: `paseo plugin update morphise --ref v0.14.0`. With any new Chat option, the "always open" thinking choice, or the sidebar's single-chat choice set, 0.14.0 reports the profile as invalid and keeps the data; set them back first.

## 0.14.0 - 2026-11-12

- **Tool call cards** (Settings, Chat, Tool calls, "Cards"): each tool call as a card that says what it did and on what.
  - The header carries the facts: lines added and removed for edits, the exit code of a failed command, matches, files and time for searches, the HTTP code and time for fetches.
  - Edits open as a coloured diff with line numbers. Long output shows its first and last lines with "Show all". Every card has Copy.
  - Open while running and folded when done (or always folded, or always open). A failed call always opens; your own open or fold wins.
  - "One line each" draws the same details behind a single line.
  - Plans, sub-agent tasks and unknown tools keep Paseo's rows.
- **Thinking card:** open while the model thinks, folded to its opening line when done, with a word count.
- **Look** of Morphise's rows: text size, spacing, and the time on each card.
- **Phones:** keep the chat as Paseo draws it on iOS and Android, if you prefer.
- **A live preview** at the top of the Chat tab, drawn with your current choices. "Hide when finished" and "Hidden rows" are now one row of chips each.
- **Prompts and replies are never redrawn,** so Paseo's Fork and Copy always stay on them.
- **Copy this chat's last turn as Markdown** from the Command Center: the prompt, the replies, and one line per tool call.
- **Dispatch:** one card like Paseo's message box. The prompts sit inside it, with a toolbar at its foot for project, model, mode, worktree or folder, and Start.

Rolling back to 0.13.0: `paseo plugin update morphise --ref v0.13.0`. With "Cards", or any new Chat option (open or folded, output lines, text size, spacing, time, phones) changed, 0.13.0 reports the profile as invalid and keeps the data; set them back first.

## 0.13.0 - 2026-11-12

- **New Chat settings tab:** how chat rows are drawn, all through Paseo's timeline API, so it works on phones too and survives Paseo updates. Paseo's own rows stay the default.
  - **Tool calls:** Paseo's rows, or one line each (what ran, on what, and whether it worked) that opens to show the output, diff or error.
  - **Hide finished tool calls** by kind: commands, file reads, edits, searches, web fetches, sub-agent tasks, other tools. Running and failed calls always show.
  - **Thinking:** in full, folded to one line that opens on press, or hidden.
  - **Hidden rows** (moved here from Commands): hide whole kinds of rows in every chat.
  - Ideas from four published chat plugins (Beautiful Chat, Better Paseo, Chat Polish, Refined Chat). Morphise rebuilt only the ones Paseo's plugin API supports, not the ones that restyle Paseo's own components through internal test ids.
- **New General settings tab:** the Steps card settings moved here from Sidebar, since the card can sit in the chat or the sidebar.
- **Dispatch:**
  - A new icon (two cards with a plus) in the Workspaces bar and the Command Center.
  - Prompts come first, then one row of choices (project, model, mode, worktree or folder).
  - A bar pinned at the bottom always shows what will start, the ⌘↵ hint and Start; after a run it says how many started and failed, with "Retry N failed".
  - The first prompt has the cursor when Dispatch opens.
- **Steps card hint** in settings says whether the card is in the chat or the sidebar.
- One owner for every chat row Morphise changes, so two rules never compete for the same row.

Rolling back to 0.12.0: `paseo plugin update morphise --ref v0.12.0`. With any Chat tool-call or thinking option changed, 0.12.0 reports the profile as invalid and keeps the data; set them back to the defaults first.

## 0.12.0 - 2026-11-12

- **Steps card in the chat** (now the default): each plan update an agent posts is drawn as Morphise's card, right in the chat. The newest one is live (steps, progress, "All done"); older updates shrink to one line, so the chat is not filled with old cards. The card's other options still apply. Choose "Bottom of the sidebar" or "Top of the sidebar" under Settings, Sidebar, Steps card, Where, to keep it in the sidebar instead.
- **Workbench rail:** slightly narrower, and it folds to icons (the button at its foot); a view with something waiting shows a dot. Folding is remembered on each device.
- **"Waiting"** replaces "Waiting on you".
- **Today** has a calendar-and-clock icon instead of the sun.
- **Project tiles** are always a colour, from 16 hues instead of 8 (the slate gray is gone). Most projects get a new colour once.
- One live plan feed per chat is shared by every card that shows it, so a chat's history is read once.

Rolling back to 0.11.1: `paseo plugin update morphise --ref v0.11.1`. The steps card goes back to the sidebar. If "In the chat" was chosen explicitly, 0.11.1 reports the profile as invalid and keeps the data; choose a sidebar position first.

## 0.11.1 - 2026-11-12

- **Done is gray again**, as it was before 0.8 (the theme's muted colour, drawn faint in the sidebar). 0.11.0 brought back 0.9's faint green instead. The filter menu and the settings Status order list use the same gray.
- **Workbench icon:** a dashboard of panels instead of a hammer.

## 0.11.0 - 2026-11-12

- **Workbench** replaces the separate Tasks and Inbox rows and screens: one row in Paseo's sidebar header, one screen.
  - A list of views on the left (tabs on a phone): Waiting on you, Today, Board, Archived, Bookmarks, each with its count.
  - It opens on what needs you first: waiting chats, then due reminders, then the board.
  - The sidebar row shows how many chats wait on you (amber while one needs permission) and how many reminders are due.
  - Links and Command Center items from earlier versions open the Workbench on the view they used to show.
- **Dispatch, redesigned:**
  - Open it from the rocket in the Workspaces bar (it left Paseo's sidebar header) or the Command Center.
  - One row of choices for every new agent: project, model (every model your providers offer, not only the ones your chats use), mode, and its own worktree or the project folder. They are remembered on each device.
  - Numbered prompts. Paste a list and split it into one prompt per item. ⌘↵ starts them all.
  - Each prompt then shows Starting, Started (with Open) or Failed (with its error and Retry). A failure no longer stops the rest.
- **Steps card options** (Settings, Sidebar, Steps card): when it shows, how long "All done" stays, top or bottom of the sidebar, the open chat or every chat in the open workspace (up to 3), how many steps, hiding finished steps, starting folded, and the progress bar.
- **Settings, Sidebar** now has every sidebar option, in sections: Rows, Chats (including turning chats off), Steps card and Auto-archive. Before, options added since 0.7 were only in the sidebar's Display menu.
- **Running chats:** when a running chat is listed under its workspace, only the chat's dot pulses, not the workspace's. The same goes for a sub-agent under its chat.
- **Icons keep their size:** a long branch name squeezed the branch icon to half its width in some rows. Every icon now keeps its size.
- **Removed the "Remind me" pill** from the message box. Set reminders with the alarm button in the workspace header, /remind, or the sidebar.
- **Done** is the faint grey-green again, as in 0.9.0 (gray from 0.11.1).
- **Settings text boxes** (Extra CSS, preset metadata, prompts) line up with the other rows.

Rolling back to 0.10.0: `paseo plugin update morphise --ref v0.10.0`.
- **Settings that 0.10.0 cannot read:** the Steps card options (when, after the last step, whose plan, where, steps listed, hide finished, start folded, progress bar). With any of them changed, 0.10.0 reports the profile as invalid and keeps the data. Set them back to their defaults first.

## 0.10.0 - 2026-11-12

- **Inbox, redesigned:**
  - Wide screens show the list and the selected item side by side. On a phone, tapping an item opens it, with a back button.
  - Each row shows a one-line preview: the command or file a permission is for, the error, or that it finished.
  - Filter by status (with counts), search chats and workspaces, and group by status or by workspace. Grouping is remembered on each device.
  - **Permissions:** read the request (the command, file, diff or plan) and answer with Allow and Deny, or the agent's own buttons such as "Implement". Questions open the chat, because they need a typed answer.
  - **Failed and finished chats:** the error and the chat's last answer, a reply box that sends straight to the chat, and Bookmark answer.
  - **Clear** a finished item, or all finished items at once. It leaves the Inbox and its count until the chat finishes again. Paseo's own unread dot stays until you open the chat, since plugins cannot clear it.
  - When you answer or clear the selected item, the next one is selected.
- **Bookmarks tab:** search, Copy, and answers drawn as Markdown.
- **Done colour:** a darker green, and one colour rule for every place a status is drawn. The settings Status order list now matches the sidebar (it showed "Finished, unread" amber and "Running" in the accent colour).

Rolling back to 0.9.0: `paseo plugin update morphise --ref v0.9.0`. Nothing new is saved that 0.9.0 cannot read: the Inbox keeps its grouping and cleared items in a separate per-device document that 0.9.0 ignores.

## 0.9.0 - 2026-11-12

- **Steps card:**
  - The open chat's plan (its to-do list) sits at the foot of the sidebar: done, in progress (pulsing), to do, with a progress bar.
  - It appears while the plan has unfinished steps, says "All done" for a moment when it finishes, then hides. × hides it until the plan changes.
  - Turn it off under Display, Show.
- **Inbox** (a new row in Paseo's sidebar header, with a count):
  - Every chat and sub-agent waiting on you, across workspaces: waiting for permission, failed, or finished but not seen yet.
  - Answering or opening one clears it, as Paseo already does. It uses Paseo's own status rule, so every device agrees.
- **Sub-agents:** a parent chat shows how many of its sub-agents are waiting on you. Paseo itself already tells a parent agent when a sub-agent it started finishes, fails or needs permission, so Morphise does not send a second message.
- **Bookmarks:**
  - Type /bookmark (with an optional note), or use the Command Center, to keep a chat's last answer.
  - Find them in the Inbox's Bookmarks tab, with the excerpt, their chat, Open and Remove.
  - They are shared by every app on the host.
- **Checks panel** (a workspace tab): the pull request's state, review, merge conflicts and every check with its link. "Ask the agent to fix" puts a message naming what failed into the open chat's message box, for you to read and send.
- **Not added: batched diff comments.** Paseo already has them. Comment on lines in its Changes view, and they go to the agent as one review.
- **Status fixes (also in 0.8):**
  - A chat or sub-agent waiting for permission now shows as waiting.
  - A failure stops counting as failed once you have seen it, as in Paseo.
  - Sub-agents are recognised by Paseo's parent label, so they no longer appear as top-level chats in the task and reminder lists.
- **Bookmarks during an answer:** a chat that is still answering asks you to wait, so a half-written answer is never saved.

Rolling back to 0.8.0: `paseo plugin update morphise --ref v0.8.0`.
- **Settings that 0.8.0 cannot read:**
  - Turning the steps card off.
  - With it off, 0.8.0 reports the profile as invalid and keeps the data. Turn it back on first.
- **Bookmarks:** they stay stored, unused.

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
