# Changelog

This project follows [semantic versioning](https://semver.org).

## 0.51.2 - 2026-11-22

- **Fix native provider icons in Quick Chat:** built-in providers such as Claude, Codex and OpenCode do not need to supply snapshot SVGs. Quick Chat now resolves all nine built-in provider marks using the same pinned artwork as Paseo's native picker, rather than showing generic CPU icons. Custom provider SVGs remain unchanged; unknown providers without artwork retain the fallback. The bundled artwork includes upstream attribution and license. No selected model IDs, settings or chat data change.

## 0.51.1 - 2026-11-22

- **Lean Quick Chat toolbar:** removed the separate Your chats heading and Start with label. Active/Archived counts remain in the tabs, and manual Refresh is right-aligned with the wrapping provider/filter/sort toolbar.
- **Provider icons beside model names:** Quick Chat's picker uses host-supplied provider icons instead of a provider-name prefix and separator. Full provider/model identity stays in accessible names and hover/focus help; duplicate model names show a small provider-identity badge to avoid ambiguous choices. Missing icon metadata uses a neutral CPU icon. Keyboard selection, focus return and outside dismissal are covered without changing other pickers or selected model identifiers.

## 0.51.0 - 2026-11-21

- **Quick Chat archive:** Active and Archived views with native archive and unarchive for owned chats. Archive requires confirmation explaining that agent work/commands stop and saved command-output logs are removed; conversation and scratch files remain. Unarchive restores the same native agent and may initialize the provider, but cannot restore removed logs. No extra prompt or chat copy is created by Morphise.
- **Compact chat rows:** click the title to open; the redundant Open button is removed. File locations use an Info icon, Continue in project uses an icon, and Archive/Unarchive have named icons with hover help. Removed the redundant last-model-ready sentence without changing model memory.
- **Find chats faster:** title search, provider filtering, Updated/Created/Title sorting with deterministic missing-date handling, clear filters and distinct empty states. Older hosts omit unsupported archive actions instead of presenting nonfunctional controls.

## 0.50.2 - 2026-11-21

- **Native Quick Chat titles:** new chats no longer receive an explicit generic agent title, allowing Paseo's normal first-message naming. No extra model call or title writer is introduced; existing and manually chosen titles are not rewritten. The workspace's organizational label can still say Quick Chat.
- **Know where files go:** Files location on each chat row shows its verified daemon-host working folder and where relative `docs/` resolves. New chats receive exact absolute-path instructions and distinguish planned saves from completed writes. Locations are disclosed only after owned-root validation; unavailable folders are reported honestly. A path is not proof that a report exists. Existing chat instructions and files remain unchanged.

## 0.50.1 - 2026-11-21

- **Tidier Quick Chat header:** manual Refresh is right-aligned with the Your chats heading, including when the list is empty. Removed the redundant top-right Settings shortcut; all preferences remain under Plugins → Morphise → Settings → Quick Chat. Refresh, recovery, settings setup access and model memory are unchanged.

## 0.50.0 - 2026-11-21

- **Quick Chat preferences in Settings:** the chat screen's Settings shortcut opens Morphise Settings → Quick Chat. Host availability and storage/privacy details live there alongside device-specific model memory, content width, row density and description visibility. No settings form remains on the chat screen.
- **Ready with your last model:** the exact provider/model from the last successful Quick Chat preloads on this device by default. Manual choices win over delayed settings, unavailable models never silently switch, and failed creation never changes model history. Forget and Remember off are explicit controls; resetting appearance does not erase history. Optional memory saving cannot delay opening a created chat or repeat creation.
- **Cleaner start screen:** a compact model/start toolbar replaces the large start panel; empty lists no longer show an unnecessary search field. All conversation, handoff and recovery features remain available.

## 0.49.0 - 2026-11-21

- **Task-first Quick Chat:** grouped model selection and New Quick Chat, searchable conversation rows, and a focused destination/review/result handoff replace the long settings-heavy page. Settings, storage/privacy details and recovery remain one labelled action away; all existing operations and safeguards are retained.
- **Safer handoff state:** incoming links cannot discard an active draft, standalone recovery cannot overwrite another handoff's result, and unavailable selected models block creation without silent substitution. Responsive home, destination, review and recovery layouts are verified across 360/700/1440px in light and dark themes, including long paths and uncertain creation without resending.

## 0.48.0 - 2026-11-21

- **Quick Chat:** an independently implemented, opt-in place to chat and capture ideas without choosing a project. Select a provider/model, then continue in Paseo's native chat UI. Each workspace has separate scratch storage; tabs inside it share the folder.
- **Reviewed project handoff:** Continue in project previews editable, bounded visible-message context before creating a new project agent with ordinary permission defaults. Originals and files stay put. Partial history is disclosed; reasoning, tool output and attachments are excluded. Interrupted creation offers a recovery-ID lookup without replaying the request. Handoffs are snapshots, not live session moves; recovery covers process restarts, not guaranteed power-loss durability.
- **Owned chat visibility:** Quick Chats appear in Morphise's Agents and attention handling without admitting unrelated background helpers. Includes feature-inspiration credit to Shuvadipta Das (@5h0ov); no reference-plugin code, tests, assets or prompt templates are included. Existing third-party notices are explicitly included in package files.

## 0.47.0 - 2026-11-20

- **Consistent Agents controls:** Filter and Display panels follow Tasks' layout. All filter categories, nine sort options, List/Board and the settings shortcut remain available. Search conversations is a labelled option in Filter, with progress, unavailable-provider, search-limit and error feedback. Failed toggle saves are visible, and old searches cannot populate a new query. Conversation logs remain limited to Claude Code and Codex.
- **Less task-editor clutter:** quick-add syntax appears in the placeholder instead of a help row. Removed the reminder/checklist immediate-save help lines without changing their save behavior or the unsaved-edits warning.

## 0.46.0 - 2026-11-19

- **Consistent report spacing:** generated charts and tables can use shared report layouts with 8px between a heading and its takeaway, 12px before data, 16px before supporting content and 24px between sections. Report legends have more breathing room, and table filters stay grouped with their tables. Chart/table guidance includes the reusable pattern instead of adding a card around every chart. Existing saved pages and custom layouts are not rewritten; typography, colors, table styling and interactions remain unchanged.

## 0.45.1 - 2026-11-19

- **Task pickers close predictably:** clicking outside an open reminder, due date or label picker closes that panel without changing its value or closing the task editor. Opening another property picker closes the previous one. The existing-task reminder keeps its toggle visible and offers an explicit close button; due dates and new reminders also have close controls. Invalid date/time input no longer forces a dismissed panel to remain open; its draft and validation error are preserved.

## 0.45.0 - 2026-11-19

- **Visual color editing on desktop and web:** theme roles, sidebar theme color, chat accent and bold text, task columns and labels, and sidebar decorations have inline color previews and graphical RGB controls with precise hex entry, opacity where supported, Apply and Cancel. Existing presets and the system color picker remain. iOS and Android retain their previous color controls.
- **Clearer task editing:** Properties, Schedule and Connections stay visible; labels open a searchable list, and due dates and new reminders open focused controls. The action footer stays outside the scrolling fields. Invalid links and overlong text have field errors; pending saves prevent duplicate submission, and closing asks before discarding staged changes. Immediate reminder, checklist and label creation behavior is explained.
- **Local layout controls:** switch Agents between List and Board at its toolbar, and Tasks under Display, using the same device preferences as General settings.
- **Save feedback and safer bookmark removal:** settings show save and validation feedback above and below their content; bookmark removal asks for explicit confirmation. Normal-size secondary theme text uses the same contrast warning threshold as primary text.
- **Field-level color saves:** changing a label's color keeps a concurrent rename, and resetting a column color removes only its override.

## 0.44.2 - 2026-11-19

- **Move to group only where it applies:** a project's menu offers "Move to group" only while the sidebar is grouped by Your groups, the one grouping groups arrange; in every other grouping the menu keeps Colour and icon, New workspace, Copy path and Remove project.

## 0.44.1 - 2026-11-19

- **No priority is an outlined bar:** a task with no priority shows the same short bar as the other priorities, outlined in grey instead of filled, so every priority mark has the same height.
- **Activity columns end level:** on wide screens the two columns under the rankings stretch to the taller one, and the shorter column's last card (Insights or Most used) spreads its tiles or rows over the extra height instead of leaving empty space below it.

## 0.44.0 - 2026-11-19

- **Priority marks are short bars:** Urgent, High, Medium and Low show a short bar in their colour (red, amber, yellow, grey) on cards, list rows and the priority picker; a task with no priority keeps its dashed ring.
- **More insights on the Activity tab:** ten more tiles from the logs already counted: peak hour, current streak, prompts per active day, longest session, commands run, files edited, files read, MCP failure rate, tools tried and models used. On wide screens Providers and Insights stack in one column and Projects and Most used in the other, so no card is stretched into an empty box.
- **A project's menu in every grouping:** the ⋯ at the end of a project heading (Move to group, Colour and icon, New workspace, Copy path, Remove project) now shows whatever the sidebar is grouped by, not only with Your groups, and a right-click or long press on the heading opens it too.

## 0.43.1 - 2026-11-19

- **Fix: mermaid diagrams shown as source when a label starts with an @.** A flowchart label such as `[@mention in any workspace]`, `[ops@example.com]` or `-->|@user approves|` made the whole diagram fail, because mermaid 11 (which Paseo ships) reads "word@" as an edge id even inside a label; Pele failed the same way. Morphise now quotes such labels before either renderer draws them, which mermaid draws the same. This is temporary: it comes out once Paseo moves to mermaid 12, which reads them.

## 0.43.0 - 2026-11-18

- **Dashed marks on chat rows:** chat and sub-agent rows under a workspace show a dashed circle in the parent's colour, at the same size; workspace rows keep their filled dot. Settings, Sidebar, Look on this device, "Chat row marks" picks the dashed circle or the dot, per device.
- **All look settings in one place:** bold group names, folder icons and background workspaces moved from the Display menu to Settings, Sidebar, Look on this device; the Display menu now holds only Group by and Sort by.
- **Reachable by keyboard:** buttons that showed only on hover (a sidebar row's Pin, Archive and Actions, group and project heading buttons, a page's Full screen, Save and Copy) also show while you Tab through them. Screen readers now hear what a row or card shows (status line, pull request and checks, due reminder, priority, labels, checklist), which row is open or selected, and whether a group or fold is open.
- **Safer deletes:** deleting an automation rule, a column or a label asks for a second press within four seconds; the task editor's Delete disarms after four seconds; deleting a group with projects asks in a small panel, as removing a project does; removing a layout, prompt, button or command from a settings list is in the opened item, not one tap away.
- **Clearer settings:** loading, unreadable and failed-save states look the same in every section, with Reset or Retry; a broken profile no longer blocks the Agents tab; settings unrelated to chat rows (Let agents open things in Paseo, Session stats) no longer hide when chat rows are off; Move up and down use arrows, and a list item shows whether it is open; the title prompt is a multi-line box; the Agents preview has the Desktop and Phone switch; every Icon field explains what to type.
- **Consistent controls:** the reminder picker under a row has a Close button; "Clear reminder" replaces an ambiguous "Done"; the Activity tab steps through hours with Earlier and Later buttons (the bars are too narrow to tap on a phone); checks show icons, not coloured dots; loading Tasks no longer shows a warning triangle; the Terminals box, the Split chip and the error Copy button use the standard card and buttons; replies in the side chat render as Markdown; Windows and Linux see Ctrl+Enter, not ⌘↵.
- **Fixes:** a row no longer says "Other host" while this host's id is still loading; small text in chat rows, project-tile letters and the commits-ahead arrow are readable on every theme; touch targets on phones are at least 32px (rows and headings 40px); the Activity heatmap no longer splits "Wed" over two lines; Workbench text says "task" throughout.

## 0.42.2 - 2026-11-18

- **A tidier Display menu:** the sidebar's Display menu lists Group by and Sort by as one-line choices (as the Filter menu does), then Show (background workspaces, bold group names, folder icons), with All sidebar settings pinned at the top so it never scrolls away.
- **Look settings moved to Settings:** Text size, Space between groups, Indent, Branch lines and Line corners are in Settings, Sidebar, under "Look on this device"; Rows, Row height and Chats under workspaces were already there. Each is still kept per device.
- **Fix: a sidebar change could undo a setting saved elsewhere.** The sidebar now saves only what it changed, merged into the newest saved values, so a look setting changed in Settings (or another window) is kept.

## 0.42.1 - 2026-11-18

- **Branch lines option:** the sidebar's Display menu has "Branch lines" to turn off the lines that hang chats and sub-agents off their workspace (rows keep their indent), and "Line corners" to make the last line's corner rounded or square. Both default to today's look and are kept per device.
- **Fix: chats larger than their workspace.** Chat and sub-agent rows, and Show more / Show less rows, follow the sidebar's Text size like workspace rows; since 0.42.0 they were fixed at 14px, larger than a compact workspace row.
- **Fix: a chat's title shown twice.** A workspace whose latest chat is listed under it no longer repeats that chat's title on its second line ("Working" stays while it runs).

## 0.42.0 - 2026-11-18

One look everywhere: HTML pages and Morphise's own screens use Paseo's own sizes and styles, so everything in a chat looks like one app.

- **Pages look like Paseo's replies:** tables are drawn as Paseo draws a markdown table (full width, a line round every cell, a bold shaded header, alternating rows), and text, headings, links, lists, quotes, code, cards, stats, chips, buttons, tabs, inputs, charts, tooltips, galleries and the explainer player use Paseo's type and corner scale. Text follows Paseo's compact layout (15px, 14px compact). Pages already in your chats change on their next render.
- **A page's own CSS can arrange, not restyle:** an agent's styles go in a lower CSS layer, so they can still set layout (grids, widths, hiding) but no longer change how the kit's elements look. Status words in tables are plain text; a cell's own background (a heatmap) is kept. New `.chip.good`, `.warn`, `.bad` and `.info` add a coloured dot, and a selected tab or toggle (`aria-selected`, `aria-pressed`) is drawn selected.
- **Checked before it shows:** `html_render` rejects a page that uses `!important`, sets an inline colour, font, border or padding on a table, heading, chip, card, stat, control or anything inside a table cell, or has a style block with unbalanced braces; `force: true` still publishes it, and `html_preview` lists these too. The tool text and `html_guide` tell agents the new rules.
- **Morphise's screens on Paseo's scale:** the Workbench, boards, sidebar rows, settings, stats strip and Morphise's restyle of Paseo's chat use Paseo's text sizes (12, 14 and 15px instead of 11, 11.5, 12.5 and 13) and corner radii, from one shared token file.

## 0.41.1 - 2026-11-18

- **Fix: rows showing "Plugin timeline item unavailable."** Turn recaps (and any of Morphise's chat rows) could show this for good when a chat drew before Morphise's settings arrived, or during a Chat setting change. Paseo remembers that a row had no renderer and does not look again, so Morphise now registers all of its row renderers once, the moment it starts, whatever the settings; settings only decide which rows exist.
- **Fix: raw markdown in folded replies.** A reply folded into merged steps (with Paseo's Collapse turns), a tool row's text and a plan were drawn by Morphise's own partial markdown, so headings showed as "##" and lists as "•". They now use Paseo's own markdown renderer, the same as a reply.
- **Fix: stretched tables in pages.** Tables in HTML pages size to their content instead of always filling the chat's width, so columns stay close to their headings in a wide chat; a table wider than the chat still scrolls in its own box.

## 0.41.0 - 2026-11-18

Animated explainers: when an agent explains how something works over time, it can show a page you play, pause and step through.

- **Morphise.player:** a page kit helper that plays scenes with captions under one row of controls: play and pause, previous and next scene, a scrubber over the whole animation, the scene count and speed (1×, 2×, 0.5×), each with a tooltip, and Space and the arrow keys on the focused player. Scenes can draw on plain elements, an SVG or a canvas.
- **Behaves in a chat:** the page height never changes while it plays; it pauses when scrolled out of view or when the window is hidden and resumes only if it was playing; it starts paused, and never starts on its own for readers who prefer less motion; Cmd/Ctrl+K and Escape still reach the chat. Stepping back, scrubbing and resizing always show the right picture.
- **Agents are told to use it:** "how something works step by step or over time" is now one of the cases where agents draw a page, and `html_guide` has an `explainers` topic with rules and a worked example. The interactive topic points simulations to the player instead of hand-built play buttons.
- **Checked before it shows:** the layout check steps through every scene at 700 and 360px and reports a player whose page height changes between scenes.

## 0.40.0 - 2026-11-18

HTML pages in chats are readable, interactive and fit any width, on pages already in your chats too.

- **Charts you can read:** hover, tap or arrow-key a bar, point or slice for a tooltip with every series' value; the rest dims, and line charts show a guide line. Legend items hide and show a series (each keeps its colour). Labels wrap to two lines instead of being cut at a fixed length, bars stop at 48px wide (28px tall), single-series bars show their values, and charts use a palette checked for colour-blind readers and contrast.
- **The whole page, not just charts:** KPI tiles (`.stat`) are padded tiles with the value under its label; `.num` right-aligns only in table cells. Wide tables scroll sideways in their own box, rows highlight on hover and sortable headers work from the keyboard. Long words and links wrap, lines stay under about 75 characters, pictures and a page's own SVGs shrink to fit, links and collapsible `details` are styled, gallery pictures open larger on click, and any element with `data-tip` gets the same themed hint.
- **The page's buttons:** full screen, save, download, open and copy sit in a strip above the page with its title, so they never cover it, and each has a tooltip, in full screen and Bookmarks too.
- **Agents are told:** `html_guide` and the tool text describe what is now built in; the layout check also reports text crammed against the side of its card or tile.
- **Sidebar:** workspace rows under "Your groups" no longer repeat their project's name (a pinned row listed under Pinned keeps it).

## 0.39.0 - 2026-11-18

- **Most recently used project first in each group:** a new switch in Settings, Sidebar, Your groups (off unless you turn it on). Inside each of your groups, the project whose workspace you used last goes to the top, ranked the same way as "Most recently used group first". Ungrouped keeps following Display. While it is on, dragging a project inside its own group does nothing (no drop line), and dragging it into another group still moves it there. An older Morphise ignores the switch.

## 0.38.9 - 2026-11-17

- **Slimmer chat rows in the sidebar:** chats and sub-agents under a workspace are 8 px shorter than the workspace row (28 px at Compact, 32 at Comfortable, 36 at Spacious; 40 on touch screens), so the open chat's highlight hugs its line. They were meant to be shorter already, but their clickable area kept a full row's height. The tree lines still meet each dot.

## 0.38.8 - 2026-11-17

- **Typed icons take the colour:** text typed as a group's or project's icon (such as "BP") is drawn in the chosen colour, like the built-in icons. Emoji keep their own colours.
- **Taking an icon off:** press the chosen icon again to remove it, or empty the typed text. "No icon" still works too.
- **Search stays minimal when focused:** the sidebar header's search no longer draws a box while you type; its magnifier brightens instead.

## 0.38.7 - 2026-11-17

- **Pages more often:** agents now draw a page without being asked whenever it is clearer than text, like Claude Code's own visuals: options to choose between side by side, numbers as a chart or table, plans and architecture as a diagram, UI changes as a mock-up (before and after), and reviews, reports and test runs as a page with the key facts first. Short answers, facts, code and commands stay text. The guidance is in the page tool's description, which existing chats read too, and in new chats' instructions. Pages cost more tokens than text; turn them off in Settings, Chat, HTML pages.

## 0.38.6 - 2026-11-17

- **Minimal search:** the sidebar header's search has no box until you use it: just the magnifier and "Search", with a light box while you type. The header is back to its 36 px height.
- **Lighter project tag:** the project tag on workspace rows drops its filled background; its folder icon and name take the project's colour instead (the chosen one, or the automatic one).

## 0.38.5 - 2026-11-17

- **Any colour:** "Colour and icon" (and a workspace's "Set colour") has a "+" swatch after the presets: type a hex code such as #2BB3C0 and press Enter, or, on desktop and web, pick from the colour wheel (it saves when the wheel closes). Anything that isn't a six-digit hex code is refused with a note.
- **Project tag follows the project's colour:** the small folder tag on workspace rows is now filled with the project's chosen colour (or its automatic colour when none is chosen), with its text in the normal colour.
- **Colour as background, not text:** project and group names keep the normal text colour; the colour shows on the letter tile, the tag, the icon, or, for a group with a colour but no icon, a small swatch.

## 0.38.4 - 2026-11-17

- **Search-first sidebar header:** the Morphise sidebar view's header now starts with a search box that fills the row (no more Search button to open it), with a clear button while you type. The tools follow in groups split by thin dividers: Dispatch and New group, then Filter and Display, then Next. Every button from before is still there, one click away.

## 0.38.3 - 2026-11-17

- **Lighter branch dots:** in the Morphise sidebar view, the status dots of rows that hang off a tree line (chats under a workspace, sub-agents under a chat) are drawn at 70% of their usual opacity, so they read as lighter than the parent's dot. Colours, the running pulse and the done dimming are unchanged on top of that.

## 0.38.2 - 2026-11-17

- **Sidebar header:** the Morphise sidebar view's header drops its "Workspaces" (or "Chats") title, and its icon buttons (Dispatch, Search, Filter, New group, Display, Next) are spread evenly across the full width, on desktop and on phones. Tooltips, labels and keyboard use are unchanged.

## 0.38.1 - 2026-11-17

- **Tree lines start at the parent:** the line the chats or sub-agents hang on now starts just under the parent row's dot (a workspace's or a chat's), so it reads as coming out of the parent instead of starting at the first child.

## 0.38.0 - 2026-11-17

- **Tree lines reach every dot:** in the sidebar view, every chat under a workspace and every sub-agent under a chat now has a short line into its status dot, not only the last one; the last keeps its rounded corner and the line stays unbroken.
- **Calmer Stats popover:** total tokens and cache hit, one bar of where the tokens went with its two biggest parts named, the pace in two lines (turns, steps, first token, speed; model and tool time), and the three most used skills and MCP tools. The tool-count chips, the time bar and the longer list moved to the Stats panel, one click away with Open panel.
- **Stats panel, Turns:** a bar per turn (its tokens, coloured like the token bar) and a table of the turns, most recent first: when each started, how long it took, steps, tokens, cache hit, model and tool time. Press a bar or a row to see that turn's numbers. The last 200 turns are kept.
- **Stats panel, Sub-agents:** when a chat has sub-agents, each is listed with its tokens, cache hit and turns (they have their own logs, so they are not in the chat's numbers), read every 10 s.
- **Going back to 0.37:** nothing to undo; the panel loses the two new cards.

## 0.37.2 - 2026-11-17

- **One spacing everywhere:** the Activity, Agents, Tasks and Bookmarks tabs, the Stats panel, the Checks and Notes panels and agent details all keep the same gap from their edges (16 px, 12 px on phones), so their content lines up when you switch between them.
- **Stats panel:** a row of number tiles, then where the tokens went and where the time went side by side, then a full-width Tools card with its list in two columns; no more empty space on wide windows.
- **Activity tab:** the number tiles match the Stats panel's; the provider and workspace filters size to their text and line up; "All workspaces" reads as a choice like "All providers".
- **Settings:** the Pages tab's browser row and the Credits rows are padded like every other settings row; the sample table's numbers are right-aligned.

## 0.37.1 - 2026-11-17

- **Fix:** Settings, Pages failed with "Plugin state hooks must run inside a plugin host". The page preview there drew the chat's page row, which since 0.37.0 looked up the chat's workspace with a hook Settings can't run; only the chat's own row looks it up now.
- **Fix:** Settings, Sidebar said "Paseo is still showing its own sidebar" after a Morphise update even with Morphise picked as the sidebar view. The view now remembers on each device that it has been shown, so a plugin reload no longer brings the note back.

## 0.37.0 - 2026-11-17

Claude-style visuals in chats: Morphise's HTML pages are on by default and much more capable.

- **Pages on by default:** agents draw a page when a visual clearly helps, or when you ask. New chats get the tools, and existing Claude, Codex and OpenCode chats when their session reopens (a daemon restart). Turn it off in Settings, Chat, HTML pages. Anyone who never turned pages on gets them now.
- **Built-in helpers in every page:** `Morphise.chart` draws bar, line, area, donut and sparkline charts in your theme's colours, sized to the chat and with labels that never overlap; tables with class "sortable" sort by any column (numbers with $, %, k and M too) and `data-filter` adds a filter box; `.gallery` lays out pictures with captions.
- **`html_guide`:** the detailed rules for charts, tables, diagrams, images, interactive pages and mock-ups, read by the agent only when it draws one, so every chat's instructions stay short.
- **Update in place:** an agent can replace an earlier page; the earlier one shows "Updated below" with full screen.
- **Ask from a page:** a click on a page's button can put a follow-up into your message box (`Morphise.ask`). It never sends; only a click or keypress in that page counts, at most once every 6 seconds, and the same text isn't added twice within a minute.
- **Save and download:** Save puts a page in the Workbench's Bookmarks and keeps it on the daemon while the bookmark lasts (Open shows it full window); Download HTML and Download SVG on each page.
- **Stats popover redesign:** total tokens and cache hit first, a bar of where the tokens went (cache read, cache write, output, new input), turns, steps, first token and speed, model time against tool time, tool counts as chips (failures in red), and skills and MCP tools ranked with bars; 420 wide. The Stats panel puts it in two cards side by side when there is room.
- **Activity tab redesign:** KPI tiles with a 14-day trend and a change pill, a heatmap that fills the width with weekday labels and a Less to More legend, rankings and "Most used" with one colour and each row's share, insights as tiles with icons.
- **Activity workspace filter:** searchable, wider, with each workspace's project, and archived workspaces too.
- **Priority colours:** High is a slightly darker yellow, Medium a light yellow (deeper shades on light themes, so both stay visible).
- **Going back to 0.36:** pages turn off again for profiles that never set them; pages that use the new helpers show blank there; saved-page bookmarks keep only their title.

## 0.36.3 - 2026-11-17

- **Skills and MCP list** in the Stats popover and panel: its rows sit in a card like the tiles above, so names, times and counts line up with the tile text instead of the section's edges.

## 0.36.2 - 2026-11-17

- **Cache-hit bar:** in the Stats popover and panel it is now a short bar at the end of the Usage title, in line with the tiles below, instead of a full-width line under it. Still green from 80%, amber from 50%, red below.

## 0.36.1 - 2026-11-17

- **Most recently used group first** (Settings, Sidebar, Your groups; on by default): under Your groups, the group whose workspace you used last goes to the top, ranked by each workspace's last prompt (else its creation), with Ungrouped last. While it is on, Move up, Move down and dragging groups are off; turn it off to order groups yourself (your saved order is kept). Its own setting, so 0.36.0 ignores it.
- **Background projects stay hidden:** under Your groups, a project whose workspaces are all background ones (such as a workers project) is no longer listed as an empty project, unless Show background is on.
- **Activity is the first Workbench tab.**
- **Stats popover:** the "Session stats" title row and the chat's name are gone; it starts with the chat picker (when the workspace has several chats) and the tiles.

## 0.36.0 - 2026-11-17

The features of the Paseo plugin Activity (koinzhang), rebuilt in Morphise (credit and licence in NOTICE.md). Activity reads Paseo's timelines; Morphise reads each chat's own Claude Code or Codex log instead, so no finished agent is woken.

- **Activity tab** in the Workbench (Settings, General, Activity; on by default): KPI tiles (sessions, prompts, top provider, top model) with the change on the week before, a 52-week heatmap, agents created over 30 days by provider, the last 168 hours, provider and project rankings, eight insights, and the most used skills, MCP tools and models. Filters for provider and workspace. Local days and hours follow your time zone, including half-hour offsets.
- **Terminals** on the Activity tab when a workspace is picked: its open terminals, the last lines of each, and Close, which asks first because it kills the terminal's process.
- **Tools in Session stats:** the Stats popover, the Stats panel and the Agents details pane count the chat's prompts, skill calls, MCP calls (and failures), shell calls, file reads and writes, and tools explored, with a Skills and MCP list. Prompts the user did not type (task notifications, history summaries, Paseo's system notes, interruptions) are not counted.
- **Priority dots:** priorities are now filled dots (Urgent red, High amber, Medium blue), a hollow ring for Low and a dashed ring for none, on cards, list rows and the task editor.
- **Cache-hit bar** in Stats is thinner and coloured by value: green from 80%, amber from 50%, red below.
- **Open buttons** for a workspace use a square arrow instead of the tilted one (task editor, Agents cards and rows, Dispatch).
- **Credits** in Settings, General now list Project Groups, Harness Stats and Activity too.
- **Going back to 0.35:** a Workbench last left on Activity opens on Agents; the Activity setting and its index file are ignored.

## 0.35.1 - 2026-11-17

- **Session stats move to the top bar:** the two pills by the message box become one Stats button in each workspace's top bar, beside Remind me. It shows the open chat's total tokens and cache hit, and its popover holds everything: the chat's name, a picker when the workspace has several chats, the activity and usage readings as tiles, a cache-hit bar, and Open panel. The Stats panel uses the same tiles. The button follows the chat open in Morphise's sidebar view, else the workspace's first open chat.

## 0.35.0 - 2026-11-17

Every feature of the Paseo plugins Project Groups (topar12) and Harness Stats (kogekiplay), and Better Paseo's search inside conversations, rebuilt in Morphise (credits and licences in NOTICE.md).

- **Your groups** (sidebar view, Group by): sort projects into groups you name, shared by every app on the daemon. New group in the header; drag projects into, between and within groups and groups up and down (long press on a phone); a group's menu renames, moves or deletes it (its projects go to Ungrouped); a project's menu moves it, starts a workspace, copies its path or removes it. Projects with no workspace are listed too. In the chat list, each workspace's chats sit under its project's group.
- **Colours and icons:** 11 colours and 36 icons, or any emoji, for groups and projects, and a colour for workspaces, in Morphise's view.
- **Look on this device** (Display menu): text size, space between groups, indent, bold group names, folder icons; and a Spacious row height.
- **Remove project:** runs `paseo project delete` on the daemon after checking that daemon lists the project and after a confirm. It deletes the project and archives its workspaces; worktrees Paseo made go with their ignored files; the folder stays. It cannot be undone.
- **Session stats** for Claude Code and Codex chats, from their own logs: turns, steps, model and tool time, time to first token, speed, tokens and cache hit. Two pills by the message box, a Stats panel, Session in the Agents details pane, and an optional strip under the message box (off by default). On by default; Settings, Chat, Session stats.
- **Search conversations** on the Agents view (off by default, per device): words not in a card's fields are looked for in its chat's log, one message holding them all; matching cards show the excerpt. It never reads Paseo's timeline, so finished agents are not woken.
- **Fix:** in the chat list grouped by Last used, group headings showed a workspace name instead of Today, Yesterday and so on.
- **Going back to 0.34:** set Group by back to something other than Your groups and Row height to Compact or Comfortable first; 0.34 cannot read those two values and would treat the whole profile as invalid. The new groups and stats documents are left untouched and ignored.

## 0.34.3 - 2026-11-17

- **Priority flags:** every priority is now the same flag, told apart by its colour (Urgent red, High amber, Medium blue, Low gray), and a task with no priority shows a struck-out gray flag. They replace the signal bars of 0.34.2, on cards, in list rows and in the task editor, whose Priority label is a flag too.
- **A softer highlight on the open row:** in the sidebar view, the open chat's or workspace's highlight is 70% of the theme's second surface, so it no longer weighs more than the rows around it.

## 0.34.2 - 2026-11-17

- **Priority icons from one family:** every priority is now a set of signal bars, from empty bars for no priority through Low, Medium and High to full red bars for Urgent (which was a circle with "!"; no priority was a dash). Cards, list rows and the task editor all use them.

## 0.34.1 - 2026-11-17

- **A mark for "no priority":** tasks without a priority show a muted dash where the priority icon goes, on cards and in list rows, and "None" in the task editor has the same dash, so every row lines up.
- **Fix: long workspace names in Edit task.** A long name pushed the Workspace field and its open arrow past the dialog's edge; the name is now cut short with "…" and the arrow stays inside.
- Segmented controls are 1 px tighter on each side, so the five priority choices still fit on one line.

## 0.34.0 - 2026-11-17

- **Open a task's workspace from its editor:** an arrow beside the Workspace field in Edit task saves your edits, then opens that workspace. If the save fails (a due date it cannot read, say), the editor stays open with the error. It is hidden in a workspace's own Tasks panel, where that workspace is already open.
- **Cleaner chat lines in the sidebar view:** the line chats and sub-agents hang from now shows through the open chat's highlight instead of being hidden by it, and turns into the last row (or Show more) with a rounded corner.

## 0.33.2 - 2026-11-16

- **Fix: picture thumbnails in Paseo's macOS app.** The app loads only code signed by its own developer, so it refused sharp's native image library and every picture tile was sent as the full image ("sharp unavailable" in the daemon log). Morphise now also installs sharp's WebAssembly build (about 9 MB), which sharp loads on its own when the native one is refused; tiles get small WebP thumbnails again. Other daemons keep the native library.

## 0.33.1 - 2026-11-16

- **Remind me popover: even spacing.** Paseo's popover already pads its content; each part of the reminder popover added its own padding on top, so the header, note box, times and footer started at different edges. They now share one edge and sit evenly apart. The reminder picker in sidebar rows and the card editor looks the same as before.

## 0.33.0 - 2026-11-16

- **Tap a reminder in the sidebar view to open its task.** A row under Reminders opens Workbench, Tasks with that card's editor (on a phone the drawer closes first). A reminder on a chat this app lists also gets a chat button beside snooze and done. A reload, a host switch or going back does not open the editor again, and a card deleted meanwhile says "That task no longer exists". Opening a task this way leaves Tasks as Workbench's last view.
- **Fix: opening the Agents view made finished agents blink into Running.** Reading a card's plan made Paseo start each finished agent on screen again, so it showed as Running for a moment and its session was loaded for nothing. The plan is now read while an agent runs or asks a permission, and once more right after it stops; a finished card shows its plan only if it was seen working since the app loaded. Opening a finished agent's details pane still reads its history, so that agent can still blink once, until a Paseo update stops a history read from starting a closed agent.
- **Remind me popover, tidier:** the note box sits above the times, so a note typed first is saved with the reminder (a note typed after picking a time was lost); "Remind me" shows once; "Custom time…" opens with a chevron instead of a checkbox; the header lines up with the rows.

## 0.32.1 - 2026-11-15

- **Picture tiles show the whole picture.** Thumbnails and image-stack cards used to fill their frame and crop the rest, so a wide contact sheet or a tall screenshot showed only part of itself; they now fit the whole picture, with the frame's colour around it. Click a tile for the full-size viewer, as before.

## 0.32.0 - 2026-11-15

From a review of the whole codebase. Settings move to format version 3: a custom slash command named `task`, `bookmark` or `run` is renamed with `-custom` added, as `remind` already was. An older Morphise can't read version-3 settings, so going back below 0.32.0 breaks them until you update again.

- **Fix: chat reminder rows stopped when one of two open apps closed.** With desktop and phone (or two windows) open, closing one stopped due reminder rows from being written into chats until an app reconnected. They now keep coming while any app is open. A reminder set from a device whose clock runs far ahead no longer spins a timer on the daemon.
- **Pages: pictures only from the agent's own folder.** A page, its preview and its publish check now read local images only inside the working folder of the agent that made it, and refuse pipes and hard-linked files with one message that never says whether an outside path exists. Each agent created while Pages is on gets its own key for the page tools (the daemon keeps only a hash of it). Chats created before 0.32.0 keep working, but their previews skip local images and say so. Going back to 0.31.1 leaves agents created since without the page tools until you update again.
- **Fix: moving an item in a settings list could write another item's text into it.** The open editor now follows its item when you move one past it.
- **Run buttons: the confirm covers exactly what it showed**, ignores a second press within 0.4 s and expires after 5 s. It also asks first for a block with a line over 200 characters, a long run of any kind of space, or more than 40 lines. Paste and multi-character typing into a running command go through one filter with an 8,000-character limit, and a huge paste no longer fails. The run card and panel say "Can't reach the daemon, retrying" after three failed tries. A command run without a terminal now stops the background jobs it left when it exits. Command output sent to an agent can no longer close its own wrapper.
- **Agents board: one-press Allow sends the allow the agent marks as its main choice**, or Paseo's default when it marks none, instead of the first one listed; cards show what the agent waits on, and the buttons name the request.
- **Auto-archive checks each workspace again just before archiving it**, with one fresh read per sweep. Archiving a Paseo worktree deletes files git ignores there (a local `.env`); OVERVIEW now says so.
- **Merged steps:** a group with pictures now says so ("Thought 9 times and showed 2 images").
- **Messages: a reply queued while the agent works is sent only if the turn ends normally.** If it stops for permission, fails or runs too long, you see why it wasn't sent, without losing a reply you are typing.
- **Smaller fixes:** Update installs exactly the version the check showed; Show in Paseo matches terminals and workspaces by host as well as id; deleting a board column or label takes two presses; single-row Archive says when a workspace has local work; picture tiles load a thumbnail instead of the full file (up to 12 MB; BMP is no longer shown); Title settings save your last edit when you leave the tab; page frame sizes are cached within a limit; one owner for "which chat is this element in".

## 0.31.1 - 2026-11-15

- **Fix: pictures inside a merged steps row open again.** With Paseo's Collapse turns on, an image an agent made mid-turn showed inside the "N steps" row only as "Image", which could not be clicked, and the pictures appeared nowhere else. That row now opens like a Thought row to the thumbnails; click one for the full-size viewer.

## 0.31.0 - 2026-11-15

- **Show in Paseo: leave the id out to mean "your own".** An agent can now call `show_in_paseo` without `agentId` to open or draft into its own chat, and without `workspaceId` to open or pin its own workspace, so it no longer has to guess its ids from titles. Every answer after such a call ends with the id used, for example "(your own chat: 6f255b1e…)", and the daemon log shows it. Agents without a workspace (including older ones whose workspace was never recorded) are asked to give a `workspaceId`. Calls that name ids work exactly as before.

## 0.30.0 - 2026-11-15

- **Show in Paseo: agents can open things for you.** A new `show_in_paseo` agent tool brings a chat, terminal, workspace, the Workbench or Dispatch to the front of the Paseo window you used last; puts text in a chat's empty message box for you to read and send (never sent, never a slash command, never text with hidden characters); and pins or unpins a workspace. Only your own chats can use it, not sub-agents or background helpers, at most ten times a minute each, and every call is logged on the daemon. While you are typing in a window (on a phone, while its keyboard is up) it changes nothing there, so your keys never land in another chat, and a draft goes in only once its chat is on screen. On by default; Settings, Chat, "Show in Paseo" turns it off at once. Terminals and workspaces need Morphise's sidebar view selected in Paseo.
- **Commands: the Run button's hidden-character check is wider.** Run now also asks first for invisible tag characters, variation selectors, other format and C1 control characters, blank-looking letters and line separators, using the same rule as agent drafts.

## 0.29.1 - 2026-11-14

- **Run and Copy swap places on shell code blocks:** Run sits in the top-right corner and Paseo's Copy code just left of it. A risky command's "Run anyway?" covers Copy while it asks.

## 0.29.0 - 2026-11-14

- **Theme presets: JetBrains Dark and Cursor Dark**, from JetBrains' New UI Dark theme file and Cursor 3.24's bundled Cursor Dark.
- **Fix: VS Code Dark 2026 now matches VS Code.** Paseo paints its whole window with the theme's background, and the preset used VS Code's near-black editor colour there. It now uses the colour of VS Code's sidebar, chat view and title bar (#191a1b), as do the new presets with their IDE's panel colour. A theme already started from the old preset keeps its colours; pick the preset again to update it.

## 0.28.0 - 2026-11-14

- **Theme preset: VS Code Dark 2026.** Settings, Theme, Start from now offers VS Code's "2026 Dark": its editor, widget, border, blue accent, text and sidebar colours, read from VS Code 1.146. For matching code colours, pick GitHub Dark under Code colours (2026 Dark uses that set).
- **Fix: picking a theme preset updates the colour fields at once.** They kept showing the old colours until the page reloaded, so editing one could overwrite the preset with a stale value.

## 0.27.1 - 2026-11-13

- **Selection bar:** the greyed "Copy" label is gone; Text and Markdown each show the copy icon instead. With icons only, the two keep their own icons.

## 0.27.0 - 2026-11-13

- **Type into a command under its code block:** when a command asks for input (`read -p`, a password, a confirm prompt), click its output in the panel under the block, or the keyboard button, and type; Enter sends Return, Ctrl+C interrupts, Esc stops typing. Typed keys no longer have to go through the chat card, and they never reach the message box. A password the command hides stays hidden. The panel offers typing only while the command runs in a terminal; the daemon's live view now says whether it does. Tab now goes to the command (in the card too) instead of moving the page's focus, words from an input method or a dead key arrive whole, and typing carries on when Paseo redraws the block. Paseo's own shortcuts still come first, so on Windows and Linux keys such as Ctrl+W reach Paseo.

## 0.26.0 - 2026-11-13

- **A code block runs in the shell it names:** Run on a ```bash block uses bash, ```sh uses sh and ```zsh uses zsh, whatever your login shell is, so bash-only commands such as `read -p` no longer fail in zsh. Other blocks and `/run` keep your login shell, and Rerun uses the first run's shell. The daemon looks for the shell only in /opt/homebrew/bin, /usr/local/bin, /bin and /usr/bin (a newer Homebrew bash first), never on PATH, so a tool that ships its own `bash` into a user folder can't receive your commands; when it isn't installed, the card says so. Settings, Messages, Commands, "Shell for code blocks" can switch back to the login shell. Windows keeps PowerShell.

## 0.25.0 - 2026-11-13

- **A minimal output panel under the code block:** a status dot and time, then icon buttons for Stop, Copy, In chat and Close, each naming itself on hover. The chat's one-line card is quieter: a dot, the command, its status and one expand button.
- **New settings (Settings, Messages, Commands):** where Run shows output (under the code block, or only in the chat card), output lines under the block (10, 15, 25 or 40), panel buttons (icons, or icons and labels), and the chat card while the output is under the block (one line, or hidden in that window). Changes apply to panels already open.
- **Overview:** commands run in your login shell, so on most Macs a ```bash block with bash-only syntax (such as `read -p`) fails in zsh.

## 0.24.1 - 2026-11-13

- **A plainer run card:** a small status dot instead of the round badge, the output straight on the card instead of in a second box, a thin border instead of a shadow, and Copy, Rerun and Send as bare icons (their names show on hover). A button that is the next step keeps its words: Stop while running, Send to agent after a failure. The "can't see this" line is gone; "Sent to … at …" still shows once you send.

## 0.24.0 - 2026-11-13

- **Run output under the code block, as in Claude Desktop:** on desktop and web, pressing Run opens the command's live output under that code block, with its status and time, Stop, Copy, In chat (the card, to type into the command, rerun or send it) and Close. Text selected in it copies with its line breaks. The Run button is always shown, not only on hover. The run's card in the chat stays its record (Rerun, Send to agent, typing into it, and phones and other windows), shrunk to one line while the output shows under the block; Show here brings it back.
- **`/run` in a new chat:** Paseo hands a plugin's command no chat until the chat exists, so `/run` as a new chat's first message reaches the agent as a normal message. This is now said in Settings and the overview; use `/run` once the chat has replied, or a Run button.

## 0.23.0 - 2026-11-13

- **Run commands from a chat:** `/run` followed by a command runs it as you, in that chat's folder, on every platform. On desktop and web, a Run button beside Paseo's Copy code does the same for a reply's shell code blocks (on by default; Settings, Messages, Commands). Each run is a card in the chat with live output, Stop and typing into it (2FA codes, passwords), then the exit code, Copy, Rerun and Send to agent. Commands that need administrator rights, delete files, discard changes, force-push, run a script from the internet or contain hidden characters ask first, and the confirm covers only the text it showed. Commands run only when you press Run or send `/run`, always in the chat's own folder; archiving a chat stops its commands and deletes their output (kept a week, at most 100 MB). The runner is ported from Shell Yeah by Steve Castaneda (MIT); Shell Yeah can be installed beside Morphise.
- **Reminders in the sidebar fold and stay short:** the Reminders group lists its first 5 due reminders, then Show more (Settings, Sidebar, Reminders: 3, 5, 10 or 20). Every group heading now shows its fold chevron while open too.
- **Credits:** README, OVERVIEW and a new Credits section in Settings, General name the four MIT-licensed plugins Morphise ports code from (Chat Polish, Shell Yeah, Quote, Better Paseo); NOTICE.md also lists the licences of the packages Morphise installs or uses (pele, sharp with libvips, node-pty, the icon sets).

## 0.22.0 - 2026-11-13

- **Sidebar with several hosts:** another host's workspace rows now show their pull request, checks, services, uncommitted and unpushed work, and Morphise's Done and Unread marks. Filters, sorting and Next see those marks; opening an Unread workspace clears it on its own host. The bulk bar reads each workspace's own host: pinned, labels, Mark done skipping workspaces that need you, and the archive warning, which also counts workspaces whose details have not loaded yet. The label list covers every host. Chats grouped by workspace keep two hosts' workspaces apart, and chat rows name the right workspace. Another host's chat waiting for your permission shows as needing permission, and its parent chat counts its waiting sub-agents. (The Workbench's count and Agents view still cover the host Morphise runs on.)
- **Tasks stay on their host:** a task links a workspace or chat by its id alone, which names one on the host Morphise runs on. So Add task and Remind me are off on other hosts' rows (marked "Other host"), and their reminders are never matched to another host's workspace or chat. Task links now keep keys they do not know, so a later version can add the host to a link without this one refusing the task list. Versions up to 0.21.6 still refuse such links, so this version writes none.

## 0.21.6 - 2026-11-13

- **Row buttons line up with the title:** in two-line sidebar rows, the buttons (a reminder's snooze and done, a workspace's pin, archive and menu on hover) sit on the title line, where the time shows, instead of between the two lines.

## 0.21.5 - 2026-11-13

- **Clearer reminders in the sidebar:** each due reminder takes two lines, as workspace rows do: its title gets the row's width, and when it was due (with the reminder's note, if any) goes under it in amber. The alarm sits in the column of the status dots. Before, the title, the due time and both buttons shared one line, so titles were cut short and the time wrapped.

## 0.21.4 - 2026-11-13

- **Remind me works for chats whose agent stopped:** a workspace's header Remind me button said "no open chat" when the workspace's chat was closed (its agent process stopped, its tab still open). Closed chats now stay in Morphise's chat list, so that button, task titles, a task's linked chat and path shortening find them. Closing a chat still does not count as finishing it for automation rules.
- **Sidebar hover no longer sticks:** when the sidebar re-sorted under a resting pointer (a workspace starting work moves up), the row under it could keep its buttons and its hover card open after the pointer left. The sidebar now works out which row the pointer is over on every pointer move, so a moved row cannot stay hovered.

From a review of the whole codebase:

- **HTML pages:** pages agents draw with `html_render` can no longer fetch or post data, or load remote images, in the chat, in the daemon's page check or in a browser tab (a Content-Security-Policy that comes before anything of the page). Scripts, styles and fonts still load over https, as the tool promises. Morphise's title helper gets neither the HTML tools nor the task-list tools, and runs in its provider's strictest mode. The pages server's token file is readable only by you.
- **Settings:** the Advanced (JSON) tab no longer reverts a newer save made elsewhere; an edit made while a save is on its way no longer overwrites another app's save (it shows a conflict instead). Quick taps on sidebar filters and folds are no longer refused. "Code and diffs" can be set to 30 lines while terminal output shows all, and changing terminal output no longer changes the code limit. A failing Dispatch save no longer retries forever.
- **Sidebar:** with several hosts, row and bulk actions go to the workspace's own host.
- **Tasks:**
  - A double Enter or Enter then Add no longer adds a task twice; a different task typed while the first saves is no longer lost.
  - Cards that reach Done another way (a deleted column, a new Done column, added straight into Done) get the Done rules; changing the Done column keeps completion dates and leaves archived cards alone.
  - Ticking a checklist item, moving a column and snoozing a reminder give the same result when replayed after a save conflict.
  - On phones, a long press without a drag no longer stops the board scrolling. With rows by label, drag and drop lands cards where they are dropped.
  - "mon 5pm" on a Monday morning sets today's 5pm.
- **Workbench and Agents:** with "What needs you", Tasks opens for due reminders, overdue and due-today cards, not reminders later today. The phone lane falls back to a listed one when Archived is hidden. A reconnect no longer brings back an agent removed meanwhile.
- **Chat rows:** steps whose text repeats in another turn or agent are drawn unmerged instead of hiding a run; finished tool calls are no longer held back while another agent works; merged rows no longer go blank when their agent is no longer followed, and on phones a follow loop with four or more chats is gone; overlapping timeline loads no longer drop live steps; long outputs no longer slow each redraw. Turn recaps count every line of large edits and keep long paths apart.
- **Chat polish (web):** diagrams no longer go blank when the plugin unloads; Paseo's Copy code button stays after Redraw; the selection bar no longer fires a copy event on every scroll; quoted inline code with backticks keeps its text; several listeners and styles are released when the plugin stops.
- **Other:** auto-archive no longer treats a workspace of unknown kind as safe to archive; two clicks on Update no longer start two updates; a title job gives up after three minutes.

## 0.21.3 - 2026-11-13

- **The Workbench reopens on the view you used last:** Agents, Tasks or Bookmarks, per device, whether you picked it or a link opened it. Jumping to what needs you (Agents while an agent waits, Tasks when something is due) is now a choice, off by default: Settings, General, Workbench, "Open the Workbench on" (The view used last, or What needs you). "When something is due, open Tasks on" shows with What needs you. Links that ask for a view still open it.
- **No counts on the Workbench's tabs:** Agents, Tasks and Bookmarks show their names only, in tabs and in the side list (folded icons lose their dot too). The sidebar's Workbench item still says what is due and how many agents wait.

## 0.21.2 - 2026-11-13

- **No filter on by default:** Tasks opens on its open cards. When something is due, the Workbench still opens on Tasks, and no longer switches Filter to Today unless you choose so: Settings, General, Workbench, "When something is due, open Tasks on" (Open cards by default, or Today), per device. Links that ask for Today or Archived still show them.

## 0.21.1 - 2026-11-13

- **Full width:** the Workbench's lists use the whole width of the window: Agents and Tasks in list layout, Tasks' Today and Archived, and Bookmarks (they stopped at 820 to 1180 pt before).

## 0.21.0 - 2026-11-13

- **No saved views in Tasks:** the "All tasks" button (save, pick, update and delete named views) and the Command Center "Tasks view" items are gone. Filter and Display choices apply to the screen you are on. Views saved before stay in the task document, unused here, so older versions on other devices still read them.
- **Today and Archived are picked in Filter:** Filter opens with Show: Open cards, Today (with its count) or Archived. The other filters apply to open cards. While Today or Archived shows, a "Showing Today" or "Showing Archived" chip under the toolbar takes you back to the open cards, and the Filter button counts it. This replaces the Today and Archived buttons in the Workbench and the Board / Today / Archived tabs in a workspace's Tasks panel.
- **Display, Cards works in the list:** Compact shows each card as its title alone in a shorter row; Detailed adds its workspace, dates, checklist and labels, as before.

## 0.20.2 - 2026-11-12

- **Today and Archived live in Tasks:** they are no longer Workbench views of their own; Tasks has a Today toggle (reminders due, overdue cards and cards due today, with its count) and an Archived toggle in its toolbar, and pressing the one that is on goes back to the columns. The Workbench lists Agents, Tasks and Bookmarks; Tasks carries the count of what is due (amber while a reminder is due). The Workbench opens on Tasks with Today on when something is due and nothing waits on you, and links to the old Today and Archived views open Tasks with that toggle on.

## 0.20.1 - 2026-11-12

- **Workbench tabs:** the Workbench lists its views (Agents, Tasks, Today, Archived, Bookmarks) as tabs along the top, drawn like Paseo's chat tabs: a filled chip for the chosen one, a lighter fill on hover, the waiting count beside Agents. Settings, General, Workbench, Views switches this device to the list at the side instead; phones and narrow windows always use tabs.
- **Roomier list rows:** rows in the Agents and Tasks lists are a little taller, with more space between their title and details lines.

## 0.20.0 - 2026-11-12

- **Agents and Tasks are views of their own:** the Workbench lists Agents, Tasks, Today, Archived and Bookmarks; Launchpad and its two tabs are gone. The Workbench opens on Agents while something waits on you, else on Today when something is due, else on whichever of Agents and Tasks you opened last. Links to Launchpad, its tabs, the old Waiting view and the Inbox still land on the right view.
- **Waiting is part of Agents:** the Waiting view is gone; Agents lists what waits on you first and now does everything Waiting did:
  - a **Status** filter (Waiting, Running, Failed, To review, Done, with counts), in the list and on the board;
  - **Clear** a finished agent you have read (on its row while you hover, or in its details), or **Clear all** from the To review header: it moves to Done on this device until it finishes again. Agents you cleared in Waiting stay cleared;
  - **Bookmark answer** and a **Reply** box in an agent's details, besides answering a permission, the error and the last reply it already showed.
- **Agents carries the count:** its entry shows how many agents wait on you (amber while a permission waits). "Open Workbench: agents waiting on you" in the Command Center opens it. With "Show the Agents view" off, Agents is still listed while something waits on you, since it is where you answer it.
- **One rule for what waits on you:** the Workbench count and Agents agree. An agent waits on you when it asks permission, failed, or finished and you have not cleared it, in a workspace that is listed; one in a workspace being archived, in the background or internal reads as Done in Agents, as the count leaves it out. With sub-agents hidden, a sub-agent that waits on you still gets its own row, so it can be answered or cleared there (running and done ones fold into their parent as before). A parent that finished unread stays in To review while a sub-agent still works.
- **Clear all** sits on the To review header in both the list and the board, and above the To review lane on phones. A cleared agent reads as Done everywhere (icon, details), and clearing never forgets agents you cleared earlier.
- An agent's details show a plan request as formatted text, "1 of N requests" when several wait, and say so when a failed agent gave no error.
- The Waiting view's Display menu (workspace and request lines) is gone; the card fields in Agents' settings choose what a row shows.
- **List or board, set in Settings:** Settings, General, Workbench picks how Agents and Tasks show their items on this device (list or board); the switches are gone from their toolbars.
- **Agent rows show what cards show:** under each agent's title, the list shows its project (with its tile), workspace, branch and Git status, folder, labels and sub-agents, and the thinking level beside the model, by the same card fields as the board.
- **Drag and drop in the Tasks list:** drag a card's row to another place or another column's section, as on the board (a long press first on phones). A gap shows where it lands; dropping on a folded section adds it at the end.
- **Reminders for new tasks:** the New task editor has a Reminder field: In 1 hour, Tomorrow 9:00, Monday 9:00, or a time you type (45m, 3pm, tomorrow 9am). Existing cards keep their reminder picker.
- **A shorter sidebar Display menu:** Group by, Sort by, Rows and Chats under workspaces as choices you see at once, Show background workspaces, and "All sidebar settings" for the rest (it opens on the layout in use, as an "Edit layout" action now does too) (row height, how many per group, sub-agents, the details rows show, auto-archive), which live in Settings, Sidebar.

## 0.19.10 - 2026-11-12

- **Launchpad:** the Workbench view holding Tasks and Agents is now called Launchpad, with a rocket icon. Links that opened it before still do.
- **Column colours in the list:** an empty column or status keeps its own colour dot or icon in the list; only its name is muted. Before, empty ones turned grey, so the colours set under Customise board seemed lost.

## 0.19.9 - 2026-11-12

- **Lists that read at a glance:** the Agents and Tasks lists share one design. Each status or column is a box with a tinted header (its icon or colour dot, name and a count chip, and + for task columns), rows have hairline dividers, and the list stops at 1180 pt wide and centres, so a row's facts stay near its title on wide windows.
- **One line per row:** the title and its detail sit on one line: what the agent asks, works on or failed on, or a card's workspace, due date, reminder and checklist. The facts at the right are quiet text: plan, context, PR, model and time for agents, labels for cards. Phones keep two lines.
- **Status icons:** waiting on you is a hand (amber), to review a dot in a circle (green), running a spinner circle (Paseo's blue), failed a crossed circle (red), done a check circle (grey); section headers use the same icons.
- **Actions on hover:** Stop, Archive, Open and More float over a row's facts while you hover or move to it with the keyboard, instead of repeating on every row; Allow and Deny always show beside them, and phones show the actions in the row. Right-click and long press still open the menu. A clicked card or row no longer keeps its buttons showing after the pointer leaves.
- **Overview icon:** binoculars.

## 0.19.8 - 2026-11-12

- **Overview, not Board:** the Workbench view that holds Tasks and Agents is now called Overview, with its own icon, since each of its tabs has a List / Board switch of its own. Links that opened Board still open it.
- **Tasks as a list:** the Tasks tab has the same List / Board switch as Agents, remembered on each device (Board until you pick List). The list shows each column as a section with its dot, name, count and an add button, then one row per card: priority, title, labels, workspace, due date, reminder and checklist. A press opens the card; the check moves it to the done column. Filters, order, rows and saved views apply as on the board; empty columns start folded.
- **Every status in the agents list:** Waiting, To review and Running show even when no agent is in them, as folded headers at 0, so the list always reads the same. The setting is now "Show groups with no agents" (on by default); off, empty sections are left out as before.
- **Last updated filter:** the Agents tab can show only agents updated in the last hour, 6, 12 or 24 hours, in the list and on the board. Agents that run or wait now always show, including a parent whose sub-agent is working. When nothing matches, the list says so above its empty sections.
- The Agents settings section for lanes and the list is now called "List and lanes".

## 0.19.7 - 2026-11-12

- **Agents as a list, grouped by status:** the Agents tab now opens as a list, the way agent overviews such as Claude Code's and GitHub's show many agents. Sections run Waiting, To review, Running, Done and Archived, so what needs you is on top; sections with no agents are left out, Archived starts folded, and Done and Archived show 8 rows with "Show more". Each row has a status dot, the title, one line saying what the agent asks, why it failed or the step it is on, then its context, plan, PR, model and time, and its buttons (Allow, Deny, Stop, Archive, Open, More) always visible; on phones the row keeps Allow, Deny and More, so the title has room. J and K scroll the row they move to into view. A List / Board switch at the top keeps the lanes one press away; each device remembers its pick.
- **Readable titles:** when a workspace's title reads as a phrase and the workspace holds only that agent (not a sub-agent), it leads, with the agent's first prompt as a muted line under it; agents that share a workspace keep their own titles, so no two rows read the same. Links in titles show short, as their host and last path part: `acme.slack.com/…/p1794`, with any login in the link left out.
- **Lanes:** Done no longer starts folded, so finished agents show beside Running. A folded lane is a short header with its name and count, not a tall strip; press any lane's header to fold or open it.
- **Cards:** the context share is a "30% context" pill instead of a small ring that could be cut off. Buttons float at the card's top-right corner on hover or keyboard focus (not while its details are open, so they do not cover the title), so cards have no empty band at the bottom; Allow and Deny always show, and phones keep the buttons in a row.
- **Running is blue:** a running agent's dot is Paseo's own running blue (lighter on dark themes, deeper on light ones) everywhere Morphise draws a status, instead of white or grey. Light themes given as `rgb()` get the deeper blue too.
- **A failed agent's reason** skips blank lines at the start of its error, in the list and in Waiting.
- **Workbench choices on this device** (the list of views folded to icons, the Board tab, List or Board) are saved once per change and then follow the stored value, so two open Workbench screens no longer save over each other, and a save that fails is not retried in a loop.

## 0.19.6 - 2026-11-12

- **Plan updates sit where the work happened:** with the steps card in the chat, every plan update gathered in one stack under the turn's merged "Thought 66 times…" row, because the merge passed over them and ran on across the whole turn. Each update now ends the merged run, so the chat reads in order: the work, "Planned · 3 steps", the next work, "Working on · Building alert", and so on, each where it happened. Hidden rows are still passed over as before.

## 0.19.5 - 2026-11-12

- **Plan updates read as progress:** each time the agent updates its plan, the chat shows one row saying what that update did, instead of another identical "Plan 0/4": "Planned · 4 steps", "Working on · Diagnosing the missed store", "Finished · Writing the plan", then "Plan done", each with its count. Every row opens to the plan as it stood then; the newest follows "Start folded".
- **No progress line in the chat:** the long line under the plan row is gone; the count says the same. The sidebar's card keeps its progress bar.

## 0.19.4 - 2026-11-12

- **The plan in the chat looks like the steps around it:** instead of a bordered card, it is one row like "Thought 11 times": a list icon, "Plan" (or "Plan done" with a green check), its count ("1/4"), and a chevron that folds and opens it. The steps hang under a thin rule. Finished steps are quiet with a small check, not struck through; the step in progress is bold with an accent dot; open steps have a hollow circle. A thin progress line shows while the plan runs, when Progress is on. The plan keeps this shape when it finishes, and earlier plan updates are the same row, folded, opening to the plan as it stood then. The sidebar's card is unchanged.

## 0.19.3 - 2026-11-12

- **The steps card in the chat shows the whole plan:** it spans the reply's full width (it stopped at 720 pt), lists every step, finished ones too, without a scroll limit, and keeps its list when all steps are done ("All 4 done" now opens to the four steps). Its header folds and unfolds the list, with a chevron that shows which. The sidebar's card keeps its step limit and "hide finished" choice.

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
  - MCP and other tools are drawn too ("Search code · acme-codebase"), with their input and result.
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
