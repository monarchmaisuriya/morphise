# morphise

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

Morphise includes code ported from four MIT-licensed Paseo plugins. Each ported file names its source in its first comment, and [NOTICE.md](NOTICE.md) holds each licence in full.

| Plugin | Author | What Morphise uses | Licence |
| --- | --- | --- | --- |
| [Chat Polish](https://github.com/lthieu96/paseo-chat-polish) | Hieu Le | Chat rows, merged steps, pictures, HTML pages, diagrams, the optional restyle of Paseo's own items | MIT |
| [Shell Yeah](https://github.com/stevecastaneda/paseo-plugins/tree/main/shell-yeah) | Steve Castaneda | The command runner behind `/run` and the Run buttons, and its output cards | MIT |
| [Quote](https://github.com/keefeere/paseo-quote) | Chechulin Serhii | The bar over selected text in a chat | MIT |
| [Better Paseo](https://github.com/RoundRedDot/better-paseo) | ABorakati | The Agents view and generated titles (the approach) | MIT |

Packages Morphise installs on the daemon when their option is used: [pele](https://www.npmjs.com/package/pele) (diagrams, MIT) and [sharp](https://sharp.pixelplumbing.com) (thumbnails, Apache-2.0; its prebuilt libvips is LGPL-3.0-or-later). The optional icon sets are downloaded from npm when picked: Hugeicons (MIT) and Untitled UI (its own licence). Commands that run in a terminal use the `node-pty` that Paseo itself ships (MIT); Morphise does not include a copy.

## Develop

```bash
npm install
npm run typecheck
npm test
```

Versions follow [semantic versioning](https://semver.org): `package.json` holds the version, each release is tagged `vX.Y.Z`, and [CHANGELOG.md](CHANGELOG.md) lists the changes.
