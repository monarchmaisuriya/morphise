# Unified "what needs me" view and multi-agent dispatch: prior art

Research date: 2026-11-12. Time box: about 20 minutes of web searching.
Scope: naming and layout for one screen that combines agent items waiting on the user with the user's own tasks, and the launch flow for several coding agents at once.

## How to read this file

- Every claim carries a link at the point of the claim.
- **Fetched** means the page was opened and read in this session.
- **Search snippet** means the claim came from a search-engine summary of that page, and the page itself was not opened. Treat these as weaker evidence.
- **Unverified** means no source in this session confirmed it.

### Sites that could not be reached

| Site | What happened |
| --- | --- |
| orca.build/docs/* | Connection refused (ECONNREFUSED) on 3 tries. The same docs were read from the mirror at onorca.dev/docs. |
| docs.helmor.ai | DNS lookup failed (ENOTFOUND). Only the Helmor GitHub README was read. |
| openai.com/index/introducing-codex | HTTP 403. |
| docs.devin.ai/work-with-devin/devin-expert | HTTP 404, although search results still list it. The "Start Batch Sessions" feature may have been removed or moved. |
| support.atlassian.com "Your work" page | HTTP 404. Atlassian now documents a "For you" page instead. |
| help.asana.com inbox article | Page body did not render (only navigation came back). |
| developers.openai.com/codex/* | Redirects to learn.chatgpt.com/docs/*. Some old paths no longer have the same content. |

---

## Question 1: a combined "what needs me" view

### Top findings

1. **"Inbox" is the dominant name for machine-raised items, and it is usually kept separate from the user's task list.** Linear puts My Issues "under Inbox" in the sidebar as a sibling, not a merge ([Linear My Issues](https://linear.app/docs/my-issues), fetched). Asana describes My tasks as "Organize all the tasks assigned to you, in one place" while Inbox holds updates you can act on inline ([Asana Inbox feature page](https://asana.com/features/project-management/inbox.md), fetched). Notion keeps Inbox for notifications and Home for "pages and tasks needing attention" ([Notion help, search snippet](https://www.notion.com/help/home-and-my-tasks)).
2. **The strongest recent precedent for mixing machine-raised and self-made items in one list is Slack "To-dos" (October 2026).** It replaces "Later", and holds both to-dos made from a message or file and "custom to-dos" added directly ([Slack: Later is now To-dos](https://slack.com/help/articles/55757634348435-Later-is-now-To-dos), fetched).
3. **Agent tools converge on a status-grouped attention feed, not a task board.**
   - OpenAI Codex desktop has an **Activity** view: a sidebar bell listing chats that are "unread, running, or waiting for your response", with filters and `Cmd+Option+U` for "Mark all as read" ([Codex notifications](https://learn.chatgpt.com/docs/notifications), fetched).
   - Orca has an **Agents** feed grouped by status, with running agents "pinned at the top" ([Orca Agents feed](https://www.onorca.dev/docs/activity), fetched).
4. **Common building blocks:**
   - Snooze or remind: Linear `H` ([Linear Inbox](https://linear.app/docs/inbox)); Superhuman `H` ([Superhuman Remind Me, search snippet](https://help.superhuman.com/hc/en-us/articles/43822934607251-Remind-Me)).
   - A Saved or Bookmarks shelf: GitHub Saved ([GitHub docs, search snippet](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox)); Asana Bookmarks ([Asana Inbox](https://asana.com/features/project-management/inbox.md)).
   - A Done or Archive bin: GitHub Done; Things Logbook ([Things lists](https://culturedcode.com/things/support/articles/4001304/)).
   - A priority split shown by default: Linear "Priority tab ... selected by default" ([Linear Inbox](https://linear.app/docs/inbox)).

### Comparison table: established products

| Product | Name(s) used | What the view contains | Navigation pattern | Default view / rules | Counts, badges | Keyboard | How agent or machine items are kept apart from human tasks | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Linear | Inbox; My Issues; Triage | Inbox: notifications on subscribed issues. My Issues: tabs Assigned, Created, Subscribed, Activity. Triage: team intake from integrations and other teams | Left sidebar; My Issues sits "under Inbox" | Inbox "Priority tab" selected by default; "Show unread first" option; max 2,000 open notifications | Badge count configurable for Priority tab | `G I` open Inbox; `J/K` move; `U` read/unread; `H` snooze; `Backspace` delete. Triage: `1` accept, `2` decline, `3` duplicate, `H` snooze; `G T` | Agents appear in the assignee menu next to humans, and a "Delegate" field can filter views; My issues still shows issues delegated to agents | [Inbox](https://linear.app/docs/inbox), [My Issues](https://linear.app/docs/my-issues), [Triage](https://linear.app/docs/triage), [Agents](https://linear.app/docs/agents-in-linear) (all fetched) |
| GitHub | Notifications inbox: Inbox, Saved, Done | Notifications; triage by Done (removes from inbox) or Save (kept indefinitely) | Sidebar entries (Done reachable from sidebar or `is:done`) | Unsaved notifications kept 5 months | Not verified | Shortcuts exist on a separate page; not verified | Not applicable | [Managing notifications, search snippet](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox) |
| Things 3 | Inbox, Today (with "This Evening"), Upcoming, Anytime, Someday, Logbook | Inbox: unprocessed items. Today: start date, deadline, or repeat matches today; calendar events on top. Logbook: completed and cancelled | Left sidebar of lists | Items leave Inbox once given a list or date | Not on this page | Not on this page | Not applicable | [Things lists](https://culturedcode.com/things/support/articles/4001304/) (fetched) |
| Todoist | Inbox, Today, Upcoming | Inbox: tasks without a project. Today: scheduled for today across projects, plus overdue. Upcoming: overdue at top with Reschedule | Left sidebar | Built-in views cannot be edited by filter queries | Not verified | Not verified | Not applicable | [Todoist filters, search snippet](https://todoist.com/en/help/articles/introduction-to-filters), [Customize views, search snippet](https://todoist.com/help/articles/4407240443282) |
| Superhuman | Split Inbox, Done, Reminders | Splits are sections at the top of the inbox; returned reminders get their own split | Splits as tabs across top of inbox | Suggests at most 7 splits | Per-split count, hidden at zero or over 999 | `E` done; `H` remind; `G E` go to Done; `Cmd+K` command | Not applicable | [Split Inbox Basics, search snippet](https://help.superhuman.com/hc/en-us/articles/38449611367187-Split-Inbox-Basics), [Remind Me, search snippet](https://help.superhuman.com/hc/en-us/articles/43822934607251-Remind-Me) |
| Height | (n/a) | Product shut down 24 Sept 2025 | n/a | n/a | n/a | n/a | n/a | [AlternativeTo news, search snippet](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025) |
| Asana | Home; Inbox (Activity, Bookmarks, Archive); My tasks | Inbox: updates; reply to comments and act on tasks inline; one-click follow-up task; bookmark; archive. My tasks: assigned tasks | Sidebar entries; Inbox has tabs | Newest first | Not verified | Not verified | Inbox ("need to know") vs My tasks ("need to do"), per search snippet only | [Inbox feature page](https://asana.com/features/project-management/inbox.md) (fetched); [help article, search snippet](https://help.asana.com/s/article/stay-informed-with-your-asana-inbox) |
| Notion | Inbox; Home (with My tasks widget) | Inbox: mentions, comments, updates. Home: pages and tasks needing attention; My tasks widget lists tasks from Task databases | Inbox fixed in top-right of sidebar; Home is a sidebar tab | Inbox cannot be hidden or moved | Not verified | Not verified | Inbox = notifications; My tasks = assigned work | [Home and My tasks, search snippet](https://www.notion.com/help/home-and-my-tasks), [Inbox & notifications, search snippet](https://www.notion.com/help/updates-and-notifications) |
| Slack | Activity; To-dos (replaced Later, Oct 2026); Saved | To-dos: message or file to-dos plus custom to-dos; reminders optional; filters Overdue / upcoming / no reminder; sort by due date or created | Sidebar tab; mobile tabs "Added by you" and "Completed" | Items with reminders sit at top by default | Not verified | Not verified | Message-derived vs custom to-dos; mobile "Added by you" tab is the only documented separation | [Later is now To-dos](https://slack.com/help/articles/55757634348435-Later-is-now-To-dos) (fetched) |
| Basecamp | Hey! menu | Unified notifications (Pings later split out again); "Don't Forget" pinned section; "Mark all read" | Top-nav menu | n/a | Orange badge on new updates | Not verified | Not applicable | [Signal v. Noise redesign post, search snippet](https://signalvnoise.com/svn3/basecamp-3-redesign-phase-1-new-nav-and-a-unified-hey-inbox/), [Pings menu is back, search snippet](https://signalvnoise.com/svn3/the-pings-menu-is-back/) |
| Jira | Your work, now "For you" | Tabs: Assigned to me (not done), Worked on, Viewed, Starred | Sidebar entry with tabs | n/a | n/a | n/a | n/a | [What is the For you page, search snippet](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/) |

### Comparison table: AI agent tools

| Product | Name(s) used | What it contains | Navigation pattern | Counts, badges | Keyboard | Agent vs human tasks | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI Codex (desktop and web) | Activity view; Scheduled ("acts as your inbox") | Activity: chats unread, running, or waiting for your response; filters Work, Chat, Pinned, Scheduled. Scheduled: automation runs with findings, archive runs | Sidebar bell | Unread indicator when a run needs attention | `Cmd+Option+U` mark all as read | Floating "pet" shows Running, Needs input, Ready, Blocked | [Notifications](https://learn.chatgpt.com/docs/notifications), [Automations](https://learn.chatgpt.com/docs/automations) (fetched) |
| Orca | Notifications (header bell); Agents feed; sidebar "Tasks" section | Bell: unread agent-finished notifications across worktrees. Feed: finished turns, blocked-on-question, new worktrees, short preview of latest response | Header bell plus a feed view; feed grouped by status | Dock badge with unread count; chip on worktree | `Cmd+F` focuses feed filter; Cmd-click multi-select then one action for all | Status grouping; running pinned to top | [Notifications](https://www.onorca.dev/docs/notifications), [Agents feed](https://www.onorca.dev/docs/activity), [onorca.dev](https://onorca.dev) (fetched) |
| Conductor | Workspaces page; sidebar Sections; "mark workspaces as unread" | Workspaces page: history of all workspaces, filter by repo, branch, PR, un-archive | Sidebar with user-defined Sections | Unread mark exists; behavior not documented | `J/K` in chat; `[` `]` toggle sidebars | Not documented | [0.28.0](https://www.conductor.build/changelog/0.28.0-workspaces-page-claude-s-context-interactive-planning-keyboard-nav-and-more), [0.85.0](https://www.conductor.build/changelog/0.85.0-sections-routines-and-a-new-model-picker), [0.25.11](https://www.conductor.build/changelog/0.25.11-fetch-comments-from-github-mark-workspaces-as-unread) (fetched) |
| Claude Code desktop | Session sidebar (no named inbox) | Active and recent sessions, grouped by folder by default; filter by status, project, environment; Archived tab under "View all" | Left sidebar list | OS notification when a session finishes and you are not viewing it; sidebar attention badges not documented | `Cmd+N` new; `Ctrl+Tab` switch; `Cmd+Shift+]`/`[` next/previous | Not applicable | [Desktop docs](https://code.claude.com/docs/en/desktop), [Redesign blog, 14 Apr 2026](https://claude.com/blog/claude-code-desktop-redesign) (fetched) |
| bb | Thread list (no inbox) | Threads; reviewers nested under the agent that started them; a reviewer "waiting on a question or permission" is answered in its thread | Left sidebar | Not documented | Not documented | Not applicable | [Orchestrate coding agents](https://getbb.app/guides/orchestrate-coding-agents) (fetched) |
| Devin | Coordinator session | Coordinator is notified when a child "finishes or needs input" | Inside the parent session | Not documented | Not documented | Not applicable | [Advanced capabilities](https://docs.devin.ai/work-with-devin/advanced-capabilities) (fetched) |
| Jules | Browser notifications | Notifies when a task "completes or needs your input" | n/a | n/a | n/a | n/a | [Jules docs](https://jules.google/docs) (fetched) |
| T3 Code, Helmor, Cursor, Copilot | No inbox view found | Not documented on the pages read | n/a | n/a | n/a | n/a | Unverified: [T3 Code](https://t3.codes), [Helmor README](https://github.com/dohooo/helmor), [Cursor Cloud Agents](https://cursor.com/docs/background-agent), [Copilot kick off a task](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task) |

### Patterns that recur

- **Two nouns, one umbrella.** Products that have both machine-raised items and owned tasks keep two lists under one sidebar area:
  - Linear: Inbox plus My Issues ([Linear](https://linear.app/docs/my-issues)).
  - Asana: Inbox plus My tasks, under Home ([Asana](https://asana.com/features/project-management/inbox.md)).
  - Notion: Inbox plus Home's My tasks ([Notion, search snippet](https://www.notion.com/help/home-and-my-tasks)).
  - Slack is the exception: it merges message-derived and self-made items into To-dos ([Slack](https://slack.com/help/articles/55757634348435-Later-is-now-To-dos)).
- **Left rail of views wins.** Linear, Things, Todoist, GitHub, Notion, Slack, Codex and Claude Code all use a sidebar. Tabs are used inside one view (Asana Inbox tabs, Linear My Issues tabs, Jira tabs).
- **The default view is "what needs me first":**
  - Linear defaults to the Priority tab ([Linear Inbox](https://linear.app/docs/inbox)).
  - Orca pins running agents to the top ([Orca feed](https://www.onorca.dev/docs/activity)).
  - Codex's bell covers unread, running, and waiting ([Codex](https://learn.chatgpt.com/docs/notifications)).
- **Three exits for each item:**
  - Done or archive: GitHub Done; Asana Archive; Things Logbook.
  - Snooze or remind: Linear `H`; Superhuman `H`.
  - Save or bookmark: GitHub Saved; Asana Bookmarks; Slack Saved.
- **Keyboard grammar is shared across products:**
  - `J/K` to move and `H` to snooze (Linear, Superhuman).
  - `U` for unread (Linear).
  - `G` + letter to jump between views (Linear `G I`, Superhuman `G E`).
- **Agent vs human separation is usually by state, not by list.** Codex labels states Running / Needs input / Ready / Blocked ([Codex](https://learn.chatgpt.com/docs/notifications)). Linear marks agent work with a "Delegate" field rather than a separate list ([Linear agents](https://linear.app/docs/agents-in-linear)).

### Empty states

No source read in this session documents an empty-state design for these views. Superhuman hides the split count at zero ([search snippet](https://help.superhuman.com/hc/en-us/articles/38449611367187-Split-Inbox-Basics)), which is the closest evidence. Unverified for all other products.

### Candidate names (ranked)

| Rank | Name | Why it fits | Risk | Evidence |
| --- | --- | --- | --- | --- |
| 1 | **Home** (umbrella), with sub-views Inbox, Today, Board, Bookmarks, Archive | Asana and Notion both use Home as the umbrella over notifications and owned tasks. It does not claim either side, so it holds agent items and user tasks without implying "these are all notifications" | Generic; may collide with an existing Paseo "home" screen (unverified: check the Paseo app nav) | [Asana, search snippet](https://help.asana.com/s/article/stay-informed-with-your-asana-inbox), [Notion, search snippet](https://www.notion.com/help/home-and-my-tasks) |
| 2 | **Inbox** (umbrella) | The most recognized name for "things waiting on me" (Linear, GitHub, Asana, Things, Todoist, Notion, Orca, Codex "acts as your inbox") | In Asana, Notion and Linear, Inbox means notifications, not owned tasks, so a kanban board inside "Inbox" breaks that expectation | [Linear](https://linear.app/docs/inbox), [Codex](https://learn.chatgpt.com/docs/automations) |
| 3 | **To-dos** | The only verified precedent that merges machine-raised items (from a message) and self-made items in one list | Reads as human tasks only; permission requests and failures are not "to-dos" in most people's model | [Slack](https://slack.com/help/articles/55757634348435-Later-is-now-To-dos) |
| 4 | **For you** | Jira's current name for "your work" across sources; neutral about who raised the item | Feels like a recommendation feed; weak fit for a kanban board | [Jira, search snippet](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/) |
| 5 | **Activity** | Codex and Slack use it for "things that changed and may need you" | Implies a passive log; poor fit for owned tasks; best used only for the agent sub-feed | [Codex](https://learn.chatgpt.com/docs/notifications) |

### Recommended pattern for the combined screen

```
Home  (left rail of views, badge = items waiting on M)
 |- Inbox      agent chats needing M: permission > failed > unread answer
 |             inline Allow / Deny / Reply; H snooze; E done; U unread
 |- Today      user tasks due today + overdue (Things / Todoist rule)
 |- Board      Backlog | To do | In progress | Review | Done
 |- Bookmarks  saved agent answers (GitHub Saved / Asana Bookmarks)
 '- Archive    done agent items + archived tasks (Things Logbook)
```

- Open on **Inbox** when it has items, and on **Today** otherwise. This mirrors Linear's "Priority tab selected by default" ([Linear](https://linear.app/docs/inbox)). The fallback to Today is a design choice, not observed in any product.
- Sort agent items by state, as Codex does (Needs input before Ready) ([Codex](https://learn.chatgpt.com/docs/notifications)). Separate agent items from tasks by an item-kind label, not by burying them in different screens. Linear's Delegate field is the closest precedent ([Linear](https://linear.app/docs/agents-in-linear)).
- Badges: one count on the rail entry for Inbox items only. Superhuman shows per-split counts and hides them at zero ([search snippet](https://help.superhuman.com/hc/en-us/articles/38449611367187-Split-Inbox-Basics)). Counting tasks too would make the badge never reach zero.

---

## Question 2: launching several coding agents at once ("dispatch")

### Top findings

1. **Every current tool uses a composer, not a form.** Pickers sit in a row next to or under the prompt box:
   - Claude Code desktop: Environment, Project folder, Worktree toggle, Permission mode, Model, all "in the row under the prompt box" ([Claude Code desktop](https://code.claude.com/docs/en/desktop)).
   - GitHub Copilot: repository dropdown "in the prompt field", plus base branch, agent and model ([Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task)).
   - Codex: project, environment, approval and model selectors around a "Do anything" prompt ([Codex cloud](https://learn.chatgpt.com/docs/cloud)).
   - Orca: model selector "in the prompt area" ([onorca.dev](https://onorca.dev)).
2. **No tool verified in this session has a "paste a list, launch N different prompts" form.** The closest patterns:
   - T3 Code: `mod+Enter` in a new thread "sends and opens a fresh new-thread composer", leaving the thread running in the background. This is serial dispatch ([T3 keybindings](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md)).
   - Devin: child sessions each with "its own prompt, skill, tags, and ACU limit". Turning off "Auto-approve child sessions" lets you review each batch before launch ([Devin](https://docs.devin.ai/work-with-devin/advanced-capabilities)).
   - bb: you ask your agent in plain language to spawn workers. "Workflows" can start "one Codex worker per top-level folder" ([bb guide](https://getbb.app/guides/orchestrate-coding-agents)).
3. **"Same prompt, N copies" is a separate, established mode:**
   - Codex cloud attempts are limited to 1 to 4 (CLI `--attempts`). Sources: a third-party source mirror and blogs, not official docs ([source mirror, search snippet](https://forge.lthn.ai/core/core-agent-ide/src/commit/30ca89424cc7170fa595cea022fa0e4d9a73b7a0/codex-rs/cloud-tasks/src/cli.rs); [blog, search snippet](https://codex.danielvaughan.com/2026/04/01/codex-cloud-exec-best-of-n-attempts/)).
   - Orca's recipe races three agents on the same prompt in three worktrees ([Orca recipe](https://www.onorca.dev/docs/recipes/parallel-agents)).
4. **Worktree vs local is a per-launch choice:**
   - Claude Code: worktree toggle "By default... off" ([Claude Code](https://code.claude.com/docs/en/desktop)).
   - Codex app: Local / Worktree / Cloud ([Codex app features, search snippet](https://developers.openai.com/codex/app/features)).
   - bb: "choose Worktree" ([bb](https://getbb.app/guides/orchestrate-coding-agents)).
   - Conductor, Helmor and Orca always create a worktree ([Conductor](https://www.conductor.build/docs/concepts/workspaces-and-branches); [Helmor](https://github.com/dohooo/helmor); [Orca](https://www.onorca.dev/docs/first-session)).
5. **Remembered defaults:**
   - Orca: default agent preselected, set in Settings → Agents ([Orca](https://www.onorca.dev/docs/first-session)).
   - T3 Code: each setting resolves in the order project override → environment → `t3.json` → built-in default ([T3 project settings](https://github.com/pingdotgg/t3code/blob/main/docs/user/project-settings.md)).
   - Conductor: favourite models, with `Ctrl+Cmd+1-5` to switch ([Conductor 0.85.0](https://www.conductor.build/changelog/0.85.0-sections-routines-and-a-new-model-picker)).
   - Jules: the default branch is preselected ([Jules](https://jules.google/docs)).

### Comparison table

| Product | Entry point (label, shortcut) | Layout | Fields | Several at once | Per-prompt overrides | Defaults remembered | Submit key | Attach files / issues | After launch | Icon evidence | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Conductor | "New workspace" button; `Cmd+N`; "Create from..." `Cmd+I` for Linear or GitHub issues | Workspace, then chat | Repo base branch (fetches origin first); model picker with favourites | One workspace per issue; no batch form documented | Per workspace | Favourite models; effort `Cmd+Shift+/` | Not documented | Linear and GitHub issues via `Cmd+I` | Each workspace has own branch, diff, review; archive losers | Not documented | [Parallel agents](https://www.conductor.build/docs/concepts/parallel-agents), [Workspaces](https://www.conductor.build/docs/concepts/workspaces-and-branches), [0.66.0](https://www.conductor.build/changelog/0.66.0-create-workspace-from-issue), [0.85.0](https://www.conductor.build/changelog/0.85.0-sections-routines-and-a-new-model-picker) |
| T3 Code | `chat.newWithoutProject` `mod+alt+n`; workspace menu `mod+shift+x` (includes new worktree); `mod+shift+l` reuse previous worktree | Composer | Project, workspace (worktree), model | Serial: `mod+Enter` sends and opens a fresh composer | Per thread | Inheritance chain project → environment → `t3.json` → default | Configurable: Enter, or `mod+Enter` | Not documented | Thread keeps running in background; `mod+1..9` jump to threads | Not documented | [Keybindings](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md), [Project settings](https://github.com/pingdotgg/t3code/blob/main/docs/user/project-settings.md) |
| Helmor | Quick panel `Shift+Option+Space` "start a workspace and chat from anywhere"; CLI `helmor workspace new` | Floating panel + chat | Repo; agent | "Runs many agents at once"; no batch form documented | Not documented | Not documented | Not documented | Not documented | Not documented | Not documented | [Helmor README](https://github.com/dohooo/helmor) |
| Orca | "+" next to repo name; CLI `orca worktree create --name --agent --prompt` | Small dialog then workspace launcher | Name (blank = generated), start-from ref, agent; prompt pasted after launch | Recipe: create 3 worktrees from same ref, paste same prompt | Different agent per worktree | Default agent; repo base ref | Not documented | Linear and Jira "items drawers" exist (not read) | Split panes; Agents feed; bell | "+" (verified as label only) | [First session](https://www.onorca.dev/docs/first-session), [Race agents](https://www.onorca.dev/docs/recipes/parallel-agents), [onorca.dev](https://onorca.dev) |
| bb | "New thread" button | Composer | Agent, project, Worktree | Ask your agent in plain language; Workflows (Settings flag) fan out | Per agent named in the request | Not documented | Not documented | Not documented | Threads in sidebar, reviewers nested; workflow card above message box with stop | Not documented | [Orchestrate guide](https://getbb.app/guides/orchestrate-coding-agents), [getbb.app](https://getbb.app) |
| OpenAI Codex | "Work in > Cloud" in a chat; Local / Worktree / Cloud modes | Composer: "Start a new task" | Project, environment, prompt, approval ("Approve for me"), model | Attempts 1 to 4 via CLI `--attempts` (third-party sources) | Not documented | Not documented | Not documented | Not documented | Task keeps running while computer sleeps; Activity bell | Not documented | [Codex cloud](https://learn.chatgpt.com/docs/cloud), [Notifications](https://learn.chatgpt.com/docs/notifications) |
| Cursor | "Cloud" in the dropdown under the agent input; also cursor.com/agents, Slack, Linear, GitHub `@cursor`, API | Composer | Repo connection; "curated selection of models"; spend limit on first use | "As many agents as you want in parallel" | Not documented | Not documented | Not documented | Via Linear / GitHub mention entry points | Cloud Agents dashboard | Not documented | [Cloud Agents](https://cursor.com/docs/background-agent) |
| Devin | Any session; prompt templates on "Explore Advanced Capabilities" | Chat to a coordinator | Per child: prompt, skill, tags, ACU limit | Yes, via child sessions | Yes, per child | "Auto-approve child sessions" setting | Not documented | Skills via `@skills:` | Coordinator notified when a child finishes or needs input | Not documented | [Advanced capabilities](https://docs.devin.ai/work-with-devin/advanced-capabilities); "Start Batch Sessions" tab is search-snippet only, page 404 |
| Jules | jules.google.com prompt box | Composer | Repo selector, branch (default preselected), prompt, optional setup script | Not documented | n/a | Default branch | Button "Give me a plan" | Not documented | Plan to approve before code changes; notification on done or needs input | Not documented | [Jules docs](https://jules.google/docs) |
| GitHub Copilot coding agent | "Agents" button in header (panel on every page); repo Agents tab; github.com/copilot | Composer | Repository (in prompt field), environment (Cloud default), base branch, custom agent (Copilot icon), model and reasoning level | Each submit starts a new session | Per session | Not documented | `Enter` or "Start task" | Images (PNG, JPEG, GIF, WebP); assigning issues | Sessions listed below the prompt box; session logs | **Paper-airplane** on "Start task" | [Kick off a task](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task), [Agents panel changelog, search snippet](https://github.blog/changelog/2025-08-19-agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github-com) |
| Claude Code desktop | "+ New" in sidebar; `Cmd+N` | Composer with control row under prompt | Environment (Local, Cloud, SSH, WSL), project folder, Worktree toggle (default off), permission mode, model | One session per send | Per session; `Cmd+Shift+I` model menu, `Cmd+Shift+M` permission | Not documented | `Enter` | Not documented | Sidebar; OS notification on finish | **"+"** on "+ New" | [Desktop docs](https://code.claude.com/docs/en/desktop) |

### Lucide icons checked

All names below exist in `lucide-static@1.72.0` (`tags.json` read via unpkg in this session). The Paseo plugin SDK accepts "a Lucide icon name, or inline SVG" (`node_modules/@getpaseo/plugin/dist/icons.d.ts`). Morphise already uses `Send`, `ListPlus`, `Inbox`, `ListTodo`, `Bookmark` and `Sun` (grep of `client/`).

| Lucide name | Lucide's own tags (first few) | Fit for "dispatch" |
| --- | --- | --- |
| `Rocket` | release, boost, launch, space, version, deploy | Says "launch"; tag "deploy" may read as shipping to production |
| `Send` | email, message, mail, paper airplane, submit | Matches Copilot's "Start task" paper-airplane; already used in Morphise |
| `CopyPlus` | clone, duplicate, multiple, plus, add, new | Says "several new"; can read as "duplicate this" |
| `SquarePlus` / `Plus` | plus, add, new, create | Matches Claude Code "+ New" and Orca "+"; does not say "several" |
| `Zap` | flash, lightning, energy, power | No launch meaning |
| `Bot`, `Sparkles` | robot, ai, assistant / magic, ai | Signals "AI", not "start" |
| `ListPlus`, `LayersPlus` | plus, add, new / stack, copies | Fits "add another prompt row" |

### Recommended dispatch layout

```
[Rocket] Dispatch                                   (entry: rail button or Cmd+Shift+N)
+------------------------------------------------------------------+
| Defaults row:  [Project v] [Model v] [Worktree | Local] [Mode v]  |  <- remembered per project
+------------------------------------------------------------------+
| 1  prompt text ................................  [x2] [chips v]   |  <- per-row overrides
| 2  prompt text ................................        [chips v]   |
| [ListPlus] Add prompt        (paste of a multi-line list -> rows) |
+------------------------------------------------------------------+
| 3 agents will start                         [Send] Launch  Cmd+Enter |
+------------------------------------------------------------------+
After launch: each row becomes a live status row (Starting / Running / Needs you / Failed)
with a link to its chat; a failed row stays editable with Retry; other rows proceed.
```

- **Composer, not a form.** The defaults row goes under the prompt, as in Claude Code and Copilot ([Claude Code](https://code.claude.com/docs/en/desktop), [Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task)).
- **Per-row overrides as chips that start from the defaults.** T3 Code's inheritance chain is the model ([T3](https://github.com/pingdotgg/t3code/blob/main/docs/user/project-settings.md)).
- **`Cmd+Enter` launches all; `Enter` is a newline inside a prompt.** T3 Code lets users choose between Enter and `mod+Enter`, and uses `mod+Enter` for send-and-new ([T3](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md)).
- **Splitting a pasted list into rows is a design proposal with no verified precedent.** Show the split rows before launch, as Devin does when auto-approve is off ([Devin](https://docs.devin.ai/work-with-devin/advanced-capabilities)).
- **Use a "xN copies" control for the same-prompt race.** Cap it at 4, as Codex attempts are ([search snippet](https://codex.danielvaughan.com/2026/04/01/codex-cloud-exec-best-of-n-attempts/)).
- **Sessions appear below the composer after launch.** This is the Copilot pattern ([Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task)).
- **Icons.** Recommended: `Rocket` for the Dispatch entry point, to set it apart from the single-chat "+", and `Send` on the Launch button, matching Copilot's paper-airplane. Alternative: `CopyPlus` for the entry point if "deploy" connotations matter.
  - Entry-point shortcut: `Cmd+Shift+N` is only a suggestion. Conductor removed its `Cmd+Shift+N` dialog in 0.66.0 ([Conductor](https://www.conductor.build/changelog/0.66.0-create-workspace-from-issue)), and Paseo's existing shortcuts were not checked (unverified).

---

## Unverified or conflicting

- **Conductor docs conflict with the changelog.** The workspaces page still says "Command + Shift + N" ([docs](https://www.conductor.build/docs/concepts/workspaces-and-branches)), while 0.66.0 says the `Cmd+Shift+N` dialog "has been removed" in favour of `Cmd+I` ([changelog](https://www.conductor.build/changelog/0.66.0-create-workspace-from-issue)). The changelog is newer.
- **Codex best-of-N UI** (a "versions" picker in the web composer) was not confirmed in any official page. Only CLI `--attempts` evidence, from third-party sources.
- **Devin "Start Batch Sessions"** tab: search snippet only. The page returns 404.
- **Asana "need to do vs need to know"** wording: search snippet only.
- **Icons used by Conductor, T3 Code, Helmor, Orca, bb, Codex, Cursor, Devin and Jules** for "new agent": not documented on pages read. Only Copilot (paper-airplane) and Claude Code / Orca ("+") are verified.
- **Empty-state designs:** not documented for any product read.
- **GitHub notification shortcuts and badge rules:** not read.
- **Agent sidebar status badges** in Claude Code desktop: the docs do not describe them.
- **Orca docs** were read from the onorca.dev mirror because orca.build refused connections. The mirror is assumed to match.

## Sources

Fetched in this session:

- https://linear.app/docs/inbox
- https://linear.app/docs/my-issues
- https://linear.app/docs/triage
- https://linear.app/docs/agents-in-linear
- https://culturedcode.com/things/support/articles/4001304/
- https://slack.com/help/articles/55757634348435-Later-is-now-To-dos
- https://asana.com/features/project-management/inbox.md
- https://www.conductor.build/docs/
- https://www.conductor.build/docs/concepts/parallel-agents
- https://www.conductor.build/docs/concepts/workspaces-and-branches
- https://www.conductor.build/changelog.md
- https://www.conductor.build/changelog/0.85.0-sections-routines-and-a-new-model-picker
- https://www.conductor.build/changelog/0.66.0-create-workspace-from-issue
- https://www.conductor.build/changelog/0.28.0-workspaces-page-claude-s-context-interactive-planning-keyboard-nav-and-more
- https://www.conductor.build/changelog/0.25.11-fetch-comments-from-github-mark-workspaces-as-unread
- https://t3.codes
- https://github.com/pingdotgg/t3code
- https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md
- https://github.com/pingdotgg/t3code/blob/main/docs/user/project-settings.md
- https://helmor.ai
- https://github.com/dohooo/helmor
- https://onorca.dev
- https://www.onorca.dev/docs
- https://www.onorca.dev/docs/notifications
- https://www.onorca.dev/docs/activity
- https://www.onorca.dev/docs/first-session
- https://www.onorca.dev/docs/recipes/parallel-agents
- https://getbb.app
- https://getbb.app/guides/orchestrate-coding-agents
- https://learn.chatgpt.com/docs/cloud
- https://learn.chatgpt.com/docs/notifications
- https://learn.chatgpt.com/docs/automations
- https://learn.chatgpt.com/docs/features.md
- https://cursor.com/docs/background-agent
- https://docs.devin.ai/work-with-devin/advanced-capabilities
- https://jules.google/docs
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-a-pr
- https://code.claude.com/docs/en/desktop
- https://claude.com/blog/claude-code-desktop-redesign
- https://unpkg.com/lucide-static@1.72.0/tags.json

Search snippets only (page not opened):

- https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox
- https://help.asana.com/s/article/stay-informed-with-your-asana-inbox
- https://www.notion.com/help/home-and-my-tasks
- https://www.notion.com/help/updates-and-notifications
- https://todoist.com/en/help/articles/introduction-to-filters
- https://todoist.com/help/articles/4407240443282
- https://help.superhuman.com/hc/en-us/articles/38449611367187-Split-Inbox-Basics
- https://help.superhuman.com/hc/en-us/articles/43822934607251-Remind-Me
- https://signalvnoise.com/svn3/basecamp-3-redesign-phase-1-new-nav-and-a-unified-hey-inbox/
- https://signalvnoise.com/svn3/the-pings-menu-is-back/
- https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/
- https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025
- https://github.blog/changelog/2025-08-19-agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github-com
- https://developers.openai.com/codex/app/features
- https://codex.danielvaughan.com/2026/04/01/codex-cloud-exec-best-of-n-attempts/
- https://forge.lthn.ai/core/core-agent-ide/src/commit/30ca89424cc7170fa595cea022fa0e4d9a73b7a0/codex-rs/cloud-tasks/src/cli.rs
- https://docs.devin.ai/work-with-devin/devin-expert (returned 404 when fetched)

Local files read:

- package.json
- node_modules/@getpaseo/plugin/dist/icons.d.ts
- grep of `icon:` values under client
