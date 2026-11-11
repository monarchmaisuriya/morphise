Morphise reshapes Paseo's interface from one profile. You describe what you want in a JSON document under Settings, Plugins, Morphise, save it, and every connected Paseo app updates within a moment, without a reload.

## What a profile can change

- **Theme:** a light or dark palette from eight colours, listed under Settings, Appearance.
- **Sidebar rows:** your own rows in the sidebar header and footer. Reorder or hide them in Settings, Sidebar.
- **Sidebar view:** a replacement for the workspace list, grouped by project, label or status, sorted by activity or name, with optional agents under each workspace. Pick "Morphise" in Settings, Sidebar, Sidebar view.
- **Workspace header buttons:** a button or a menu on every workspace.
- **Composer:** pills above the message box of every agent, and toolbar controls (an action, a metadata toggle, or a model, mode or thinking picker).
- **Slash commands and Command Center items.**
- **New workspace presets:** a picker that sets isolation and workspace metadata.
- **Timeline:** hide built-in row types, such as thinking or todo lists.
- **Style layer (unsupported, off by default):** hide built-in parts by their test id and add your own CSS. Desktop and browser only; any Paseo update can rename the ids it relies on.

Rows, buttons, pills, commands and controls run one of a small set of actions: open a link, insert or replace text in the message box, set the model, mode or thinking level, or open the profile editor. Morphise has no action that runs commands or writes files.

## Setup and limits

Requires Paseo 0.16.0-beta.1 or later, below 0.17, on both the daemon and the app.

- The profile is stored on the daemon, so every app connected to that host shares it. It is plain JSON, not a secret store.
- Actions from header buttons, sidebar rows and the Command Center act on the focused agent's message box. A draft for a new agent can only be changed by Morphise's own composer controls.
- If Paseo rejects part of a profile, such as an unknown icon name, that part is skipped, the rest still applies, and the editor lists what was not applied and why.
- CSS in the style layer can load remote resources like any stylesheet.
