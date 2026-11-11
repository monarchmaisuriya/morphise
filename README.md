# morphise

<img src="morphise.png" alt="Morphise logo" width="96">

A [Paseo](https://paseo.sh) plugin that reshapes the app from settings forms: named layouts, a status-sorted and filterable sidebar view, a kanban task board with reminders, chat notes, a prompt library, theme, sidebar rows, workspace header buttons, composer pills and controls, slash commands, Command Center items, New workspace presets, hidden timeline rows, and an opt-in desktop style layer. Change it under Settings, Plugins, Morphise; every connected app updates live.

![Morphise in a workspace](assets/workspace.jpg)

What each section does and its limits: [OVERVIEW.md](OVERVIEW.md).

## Install

Requires Paseo 0.16.0-beta.1 or later.

```bash
paseo plugin install github:monarchmaisuriya/morphise --ref v0.6.0
```

To update from an earlier version, keeping your settings:

```bash
paseo plugin update morphise --ref v0.6.0
```

## Develop

```bash
npm install
npm run typecheck
npm test
```

Versions follow [semantic versioning](https://semver.org): `package.json` holds the version, each release is tagged `vX.Y.Z`, and [CHANGELOG.md](CHANGELOG.md) lists the changes.
