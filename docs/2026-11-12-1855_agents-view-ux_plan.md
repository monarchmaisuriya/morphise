# Agents view: clearer layout and cards (Morphise 0.19.2)

- Date: 2026-11-12 18:55
- Status: done (0.19.2); approved by M ("build review fix release reinstall"), recommended answers to questions 1-2
- Repos: morphise   Files: client/agents-board/board.tsx, client/agents-board/card.tsx, shared/agents-board.ts (+ tests), client/workbench.tsx, client/polish/web/plugin-views.ts (or the kit's focus style), client/forms/agents-tab.tsx (preview), CHANGELOG.md
- Subagents: none (one area, sequential)

## Update (M, 2026-11-12, during the build)

- Board and Agents become one Workbench view, still called **Board**, with minimal tabs at its top: **Tasks** (the task board) and **Agents** (the agents board). The last tab is remembered on each device, starting on Agents. A link that asked for the old Agents view opens Board on its Agents tab.
- Board is listed first, above Waiting (this replaces "Agents above Waiting").
- The Workbench list has no group headings (no "Agents", "Tasks", "Saved"): one list, Board, Waiting, Today, Archived, Bookmarks.
- Settings → Agents now speaks of the "Agents tab"; turning it off leaves Board with tasks only and no tabs.

## Context and problem

With real agents, the Agents view (0.19.1) is hard to read: it scrolls sideways on a wide window, empty lanes take full columns, the Done and Archived lanes outweigh what needs you, and every card repeats itself. Research: `docs/2026-11-12-1855_agents-view-ux_research.md` (10 problems, each traced to a line).

## Goals / Non-goals

Goals: the lanes fit the window; what needs you (Waiting, Running, To review) leads; a card reads title first with one quiet line of facts; no unexplained numbers or meaningless dots; Agents above Waiting in the Workbench; no green ring on Morphise's buttons after a click.

Non-goals: new features, new data, or a list view.

## What is true today

- Lanes are fixed 320 pt each, five of them, in a horizontal ScrollView [verified: `board.tsx:44, 346, 386-388`].
- Done window 7 days, Archived lane on, by default [verified: `shared/agents-board.ts:45`].
- Card: header line "project › workspace", status dot + title (2 lines), pill row (agent pill "provider · model · thinking", branch, folder, labels, PR, plan, sub-agents), footer time and icon buttons [verified: `card.tsx:84-160`].
- The 0.18.1 focus-ring fix covers only `[data-cp-row]` [verified: `client/polish/web/plugin-views.ts`].

## Options considered

| | A. Fit the lanes, fold empty ones, quieter cards | B. Replace the board with a grouped list (like Waiting) | C. Only change defaults (24 h, Archived off) |
| --- | --- | --- | --- |
| How | Lanes share the width (min 240, max 420 pt); an empty lane folds to a 44 pt strip with its name and count; Done and Archived start folded; cards trimmed | One column, sections per status | Two default changes |
| Fixes | 1–10 | 1–3, not cards | 3 only |
| Cost | Medium, 3 files | High; drops what M asked for (a board) | Tiny |
| Completeness | 9/10 | 6/10 | 3/10 |

RECOMMENDATION: A, because every problem has a cause in the board's own layout and card code, and fixing them there keeps the board M asked for.

## Design

### Layout (`board.tsx`)

- Lanes share the board's width: each open lane gets `max(240, min(420, (width − folded strips − gaps) / open lanes))`; the existing Lane width setting becomes the maximum (narrow 300, default 420, wide 520). Sideways scrolling only when even the minimum does not fit.
- An empty lane folds to a 44 pt strip: its count and its name written downward. A press opens it.
- Done and Archived start folded (showing their count), and open on a press; they stay as you left them while the view is open. To review opens whenever it has agents.
- Order stays Waiting, Running, To review, Done, Archived, so the left edge is always what needs you.

### Cards (`card.tsx`, presets in `shared/agents-board.ts`)

```
┌────────────────────────────────────────┐
│ Add super user website info tool      ⬤│  title, 2 lines, whole words (no header line above)
│ [D] Develop · Opus 5.5 high · 3m ago   │  one muted line: project tile + workspace (when it differs), model, time
│ ⎇ mm-scan-slack…  🏷 bug  ☑ 3/5        │  optional pills: branch, labels, plan, sub-agents, PR
└────────────────────────────────────────┘    actions show on hover (always on touch)
```

- Title first. Paseo's agent title; the "project › workspace" header line is folded into the fact line, and the workspace name is left out when it equals the title's start or the project.
- Model shown short and once: provider shown only when the model id does not already name it (`claude-opus-5-5` → `Opus 5.5`, from the id; unknown ids shown as given).
- Folder pill only when it differs from the project and the workspace.
- Context ring only while the agent runs, with a "%" and the tooltip "Context used".
- Status dot only where it adds something: amber for a waiting permission, red for failed; none in Done and Archived.
- Footer actions appear on hover on desktop and web; always on touch (phones and tablets).
- Standard preset: folder off (fact line covers it); provider merged into model.

### Workbench (`workbench.tsx`) and focus

- Agents first in the view list, then Waiting; icon `Bot`.
- Morphise's own buttons (kit `Button`, `IconButton`, rail rows, cards) get the same focus treatment as chat rows since 0.18.1: no Paseo ring after a click; keyboard focus shows the soft fill. Done in one stylesheet rule on a shared marker, not per component.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation | Noticed by |
| --- | --- | --- | --- | --- |
| Short model names wrong for some ids | medium | Odd label | Only reshape ids of the form `<provider>-<family>-<major>-<minor>`; show others as given; unit tests with M's ids | tests |
| Folded Done hides finished work M wants | low | One more press | Count stays visible on the strip; a press opens it and it stays open | live look |
| Hover-only actions harder to find | low | Discoverability | Always on touch; the card's right-click menu still lists them | live look |
| Focus treatment hides keyboard focus | low | Accessibility | Keyboard focus keeps a visible fill; tested by Tab | live check |

## Acceptance criteria

- Given a 1,500 pt board with 0 waiting, 0 running, 0 to review, 49 done and 6 archived, then nothing scrolls sideways, the three empty lanes and the folded Done and Archived show as strips with counts, and pressing Done opens it.
- Given a card for `claude-opus-5-5` with thinking high, then its fact line reads "Opus 5.5 high", with no second "claude".
- Given a finished agent, then its card shows no context ring and no dot.
- Given the Workbench, then Agents is listed above Waiting, and a click on a rail button leaves no green ring.

## Rollout and rollback

Release 0.19.2; rollback to v0.19.1. No settings change shape (Lane width keeps its three values, now as maximums); the Standard preset change applies only to people still on Standard.

## Parts

### Part 1: Workbench order and focus
- [ ] Agents above Waiting, icon Bot. Done: rail and list show Agents first.
- [ ] Shared focus rule for Morphise controls. Done: click shows no ring; Tab shows the fill.

### Part 2: Lane layout
- [ ] Shared width, folding empty lanes, Done and Archived folded by default. Done: the acceptance check on the test daemon with sample agents in the settings preview, and on M's Paseo after release.

### Part 3: Cards
- [ ] Title first, one fact line, short model, conditional folder, ring and dot rules, hover actions; Standard preset. Done: unit tests for model names and folder rule; settings preview card matches the sketch.

## Standardized review

(Self-review against the plan rubric; small, single-area change.)
- Goal fit: pass (each research problem maps to a part).
- Current-system accuracy: pass (file:line for each claim).
- Failure and rollback: pass (no settings shape change).
- Verification: must-verify — the test daemon has no agents, so the board layout can only be checked with sample data in a preview; M's own Paseo is the real check.
- Bottom line: 0 blocking, 1 must-verify (noted in Parts), 0 notes.

## Changes made

- Part 1: one flat Workbench list, Board first; Board's Tasks and Agents tabs (M's update); focus outline inside the Workbench.
- Part 2: lanes share the width; empty lanes, Done and Archived fold to strips; Done opens by itself when nothing else is open; empty-board line.
- Part 3: title-first cards, one fact line, short model names, folder only when it adds something, ring only while running, dot only for waiting or failed, buttons on hover (laid out always, shown on keyboard focus too).
- Review: 0 blocking, 3 must-verify and 6 notes, all fixed; 599 tests pass.

## Open questions

1. Done and Archived folded by default, or open?
2. Card actions on hover only (desktop), or always shown?
