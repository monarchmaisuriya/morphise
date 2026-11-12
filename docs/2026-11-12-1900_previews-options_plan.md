# Previews on every settings tab, and more options (Morphise 0.17.0)

- Date: 2026-11-12 19:00
- Status: approved (M: "research plan build review fix release reinstall")
- Repos: morphise   Files: shared/polish/prefs.ts, shared/profile.ts, client/forms/polish-tabs.tsx, client/forms/tabs.tsx, client/forms/previews/** (new), client/polish/rows/**, client/polish/selection/**, client/polish/web/**, client/polish/media/**, client/polish/pages/**, client/inbox.tsx
- Subagents: three builders, each owning its own folders; settings schema and tab wiring stay with the integrator

## Research (find out)

- **Today:** only the Chat tab has a preview (`client/forms/tabs.tsx` `ChatPreview`). Messages, Pages, Look, General, Sidebar have none. [verified: grep of client/forms]
- **Reusable from Chat Polish** (MIT, already credited in NOTICE.md), at cp-src commit 6b52cc2 `client/dashboard/`: `preview.tsx` (MockChat: a user bubble as Paseo draws it, the plugin's rows, a reply; `previewTheme` draws a draft theme; `HtmlPreview` a sample page), `rich-preview.tsx` (a reply using every markdown element in the chosen variants, and a diagram), `drawings.tsx` (a small drawing per rich text variant), `prefs-editor.tsx` LoaderTile (a loader running for real, scoped to its tile), `samples.ts` (sample items). [verified: file headers]
- **What a preview can show without Paseo's DOM:** anything Morphise draws itself (rows, steps card, Workbench card, selection bar mock, pages, image rows); Paseo's own items only as mocks styled by the same CSS (rich text, loaders, window).

## Decision

Previews on Messages, Look, Pages and General (steps card), and a fuller Chat preview; each built from the components the feature itself uses, so the preview cannot drift from the real thing. Sidebar keeps none in this release (its rows need live workspace data; noted as a follow-up).

New options (each optional, written only when not default, shown in a preview):

| Tab | Option | Values (default first) |
| --- | --- | --- |
| Chat | Merge only runs of at least | 2, 3, 5 steps |
| Chat | Line numbers in diffs | on, off |
| Chat | A folded thought shows its first line | on, off |
| Messages | Selection bar buttons | icons and labels, icons only |
| Messages | Selection bar position | above the selection, below it |
| Messages | Side chat model | the chat's own, or a model id |
| Messages | Thumbnail corners | rounded, square |
| Look | Reply width (restyle) | Paseo's, narrow, wide, full |
| Look | Floating window corner radius and gap (restyle) | 12/8, 8/4, 16/12 |
| Look | Working indicator colour (restyle) | accent, text, muted |
| Pages | Page height limit | 800, 500, no limit |
| Workbench | Card details | workspace line on, off; preview line on, off |

## Parts

1. Schema keys and defaults (integrator): `chat.polish` keys, POLISH_DEFAULTS, adapter, tests.
2. Previews builder: client/forms/previews/** (Messages preview with mock chat, clamp, rich text, diagram, image row, selection bar mock; Pages sample page; Look theme mock chat, loader tiles, code colours, window mini-drawing; General steps card preview).
3. Rows and Workbench builder: merge minimum, diff line numbers, thought first line, Workbench card details, Chat preview additions (notice, recap rows).
4. Page code builder: selection bar style/position/side chat model, thumbnail corners, reply width, floating radius/gap, loader colour, page height.
5. Integrator: settings controls and preview placement, live check, review, release, reinstall.

## Acceptance criteria

- Given any of Chat, Messages, Look, Pages, General, when an option changes, then the preview on that tab changes before saving completes.
- Given each new option, then a test or the live check shows it applied, and its default leaves 0.16 behaviour unchanged.

## Standardized review

- 0 blocking. must-verify: restyle-dependent previews (loaders, rich text) need the restyle stylesheet on the settings page; they show a note when it is off. note: Sidebar preview deferred.
