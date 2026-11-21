# morphise

## Quick Chat

Quick Chat is an opt-in Morphise feature for chatting and capturing ideas without choosing a project. Open it from the sidebar or Command Center, enable it, and choose a model beside New Quick Chat. The picker shows the host-provided provider icon directly beside the model name, with full provider identity in accessibility and hover/focus help. Duplicate model names receive a small provider-identity badge; missing icons use a neutral CPU icon. The new chat opens in Paseo's native UI. Search your existing chats by title, open one, or choose Continue in project. Open Plugins → Morphise → Settings → Quick Chat for enable/disable, start-up, appearance and storage/privacy controls. The Quick Chat header has no redundant Settings shortcut. Active/Archived counts replace a separate chat-list heading. Refresh is right-aligned on the list filter/sort toolbar; it manually reloads the list, which is not live-subscribed. Recover handoff remains a separate chat-screen action. The last successfully used provider/model is remembered on this device by default and preloaded next time, without substituting unavailable models. Device preferences let you turn memory off, forget the saved model, choose Comfortable/Wide content, Compact/Comfortable rows and row descriptions. Reset appearance leaves model history and host availability unchanged. Each Quick Chat workspace has separate scratch storage; native tabs inside that workspace share the folder. Scratch storage is not a security sandbox.

Continue in project prepares an editable preview of visible messages for an already-open project workspace. It shows destination/provider, partial-history warnings and top-level scratch filenames. Confirming creates a new agent with ordinary project permission defaults. It does not move the original session, copy files, include reasoning/tool output/attachments, archive the source or silently switch providers. The handoff is a reviewed snapshot, not an atomic freeze: concurrent changes after the final source check are not included. Context is bounded to 40,000 UTF-16 code units including the envelope, with truncation disclosed; history reading is bounded and may be partial. Reading native history may initialize a stopped provider for history access.

Recovery records cover a completed disk write followed by a plugin/process restart; power-loss durability is not guaranteed. An interrupted creation is never automatically resent. Keep the displayed recovery ID and use Check recovery ID to look up the recorded destination. If the destination cannot be confirmed, inspect Paseo before preparing a new handoff. Disabling Quick Chat preserves chats, scratch files and minimal handoff records. Scratch and recovery data live under `PASEO_HOME/plugin-data/morphise/quick-chat` (default `~/.paseo`). No transcript bodies are stored in recovery records. There is no automatic cleanup or retention expiry; remove data manually only after preserving anything needed.

### Feature inspiration

Quick Chat lists Active and Archived conversations separately. Search titles, filter by provider, and sort by recently updated, newest created or title. Click a chat title to open it. Row icons provide file-location information, Continue in project for active chats, and Archive or Unarchive; each has an accessible name and hover tooltip.

Archive requires confirmation: it closes the agent, stops its work and Morphise commands, and removes saved command-output logs through Morphise's existing archive policy. The conversation and scratch files remain. Unarchive restores the same native agent and may initialize its provider, but does not restore removed logs or send a new prompt from Morphise. It does not archive/delete the workspace. Restore stays available for owned chats when new Quick Chats are disabled. List updates remain manual through Refresh.

New Quick Chats leave their agent title unset so Paseo applies the same first-message automatic title as normal chats. Morphise does not run a separate title model or rename existing chats. Previously created chats explicitly titled Quick Chat are not rewritten; rename those normally if needed. The workspace may retain its Quick Chat organizational label even when its agent tab has a descriptive title.

Use **Files location** on a chat row to see its exact working folder and where a relative `docs/` path resolves on the daemon host. A displayed path is not confirmation that the directory/report exists. New-chat instructions include these absolute paths and ask the agent to distinguish planned saves from completed writes; an agent response is still not a filesystem guarantee. Existing chat instructions are not retroactively changed. Scratch files remain in that folder when you continue in a project.

Morphise's Quick Chat was independently implemented. The project-free chat and later project-handoff workflow was inspired by [Quick Chat by Shuvadipta Das (@5h0ov)](https://github.com/5h0ov/paseo-quick-chat), whose source is MIT-licensed. No code, assets, tests or prompt templates from that plugin are included. Existing Morphise third-party notices remain in `NOTICE.md`.

<img src="morphise.png" alt="Morphise logo" width="96">

A [Paseo](https://paseo.sh) plugin that reshapes the app from settings forms: named layouts, a status-sorted and filterable sidebar view, a kanban task board with reminders, chat notes, a prompt library, theme, sidebar rows, workspace header buttons, composer pills and controls, slash commands, Command Center items, New workspace presets, hidden timeline rows, and an opt-in desktop style layer. Change it under Settings, Plugins, Morphise; every connected app updates live.

![Morphise in a workspace](assets/workspace.jpg)

What each section does and its limits: [OVERVIEW.md](OVERVIEW.md).

## Install

Requires Paseo 0.16.0-beta.1 or later.

```bash
paseo plugin install github:monarchmaisuriya/morphise --ref v0.23.0
```

To update from an earlier version, keeping your settings:

```bash
paseo plugin update morphise --ref v0.23.0
```

## Credits and licences

Morphise includes code ported from seven MIT-licensed Paseo plugins. Each ported file names its source in its first comment, and [NOTICE.md](NOTICE.md) holds each licence in full.

Quick Chat is separately credited above as feature inspiration, not as an eighth code port. Its independent implementation, UI refinements and device preferences add no third-party dependency. See [NOTICE.md](NOTICE.md#feature-inspiration-not-incorporated-code) for that distinction.

| Plugin | Author | What Morphise uses | Licence |
| --- | --- | --- | --- |
| [Chat Polish](https://github.com/lthieu96/paseo-chat-polish) | Hieu Le | Chat rows, merged steps, pictures, HTML pages, diagrams, the optional restyle of Paseo's own items | MIT |
| [Shell Yeah](https://github.com/stevecastaneda/paseo-plugins/tree/main/shell-yeah) | Steve Castaneda | The command runner behind `/run` and the Run buttons, and its output cards | MIT |
| [Quote](https://github.com/keefeere/paseo-quote) | Chechulin Serhii | The bar over selected text in a chat | MIT |
| [Better Paseo](https://github.com/RoundRedDot/better-paseo) | ABorakati | The Agents view, generated titles (the approach) and the matching rules of conversation search | MIT |
| [Project Groups](https://github.com/topar12/paseo-project-groups) | topar12 | "Your groups": the groups model, colours and icons, Remove project | MIT |
| [Harness Stats](https://github.com/kogekiplay/paseo-harness-stats) | kogekiplay | Session stats: the log reader and fold, the pills and the strip (with CC Switch's time-to-first-token approach) | MIT |
| [Activity](https://github.com/koinzhang/paseo-plugins/tree/main/activity) | koinzhang | The Activity tab (metrics, rankings, insights, terminals) and the Tools counts in Stats: the counting rules, read from logs instead of timelines | MIT |

Packages Morphise installs on the daemon when their option is used: [pele](https://www.npmjs.com/package/pele) (diagrams, MIT) and [sharp](https://sharp.pixelplumbing.com) (thumbnails, Apache-2.0; its prebuilt libvips is LGPL-3.0-or-later). The optional icon sets are downloaded from npm when picked: Hugeicons (MIT) and Untitled UI (its own licence). Commands that run in a terminal use the `node-pty` that Paseo itself ships (MIT); Morphise does not include a copy.

## Develop

```bash
npm install
npm run typecheck
npm test
```

Versions follow [semantic versioning](https://semver.org): `package.json` holds the version, each release is tagged `vX.Y.Z`, and [CHANGELOG.md](CHANGELOG.md) lists the changes.
