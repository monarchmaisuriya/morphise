# Agents view: what makes it hard to use, and how to fix it

- Date: 2026-11-12 18:55
- Status: presented
- Mode: find out (then options for the plan)
- Repos: morphise   Folders: client/agents-board/, shared/agents-board.ts, client/workbench.tsx
- Question / problem: Why does the Agents view (0.19.1) read badly with real data, and what changes would make it clear?

## Research: the Agents view's problems, each traced to its code

- **Bottom line:** Ten problems, all in Morphise's own code. The three that hurt most:
  - five fixed-width lanes force sideways scrolling, and empty lanes take as much room as full ones;
  - the long Done and Archived lanes outweigh what needs you (Waiting and Running);
  - each card repeats itself: provider twice, folder equal to the project, and the prompt as the title, cut mid-word.
  Confidence: high (each traced to a line); medium for the proposed fixes until seen with M's data.
- **Where we are:** feeds `docs/2026-11-12-1855_agents-view-ux_plan.md`. Evidence: M's screenshot of 0.19.1 with real agents (Done 49, Archived 6), and the code at `6138672`.
- **Need from M:** the decisions in the plan's briefing.

### What I found

| # | Problem in M's screenshot | Cause | Evidence |
| --- | --- | --- | --- |
| 1 | The board scrolls sideways even on a wide window; Waiting and Running are off-screen to the left | Every lane is a fixed 320 pt (`LANE_PX.default`), 5 lanes plus gaps ≈ 1,650 pt, wider than the board | [verified: `client/agents-board/board.tsx:44, 346, 386-388`] |
| 2 | An empty lane ("To review 0 · No agents") takes a full 320 pt column | Lanes have one width whatever they hold | [verified: `board.tsx:346, 354`] |
| 3 | Done (49) and Archived (6) dominate; what needs you is pushed aside | Done window defaults to 7 days, the Archived lane is on by default, and every lane is equally wide | [verified: `shared/agents-board.ts` defaults `doneWindow: "7d"`, `showArchived: true`] |
| 4 | Title cut mid-word ("…and add a super use"), and it repeats the prompt | The title is Paseo's agent title, which Paseo sets from the first prompt; the header line above it shows the workspace's title, often the same words | [verified: `client/agents-board/card.tsx:127-136`; inferred from the screenshot] |
| 5 | "claude · claude-opus-5-5 · high": provider said twice | The pill joins provider, model and thinking; model ids already start with the provider | [verified: `card.tsx:92`] |
| 6 | "Develop" folder pill repeats the "Develop ›" project line | Folder is on in Standard and is shown even when it equals the project or workspace name | [verified: `card.tsx:142`; `shared/agents-board.ts` Standard preset `folder: true`] |
| 7 | Unlabelled numbers in circles (12, 44, 51, 19) | The context ring prints a bare percentage with no unit or tooltip, and shows on finished agents too | [verified: `card.tsx:49-58, 137`] |
| 8 | A white dot on every Done and Archived card says nothing | The status dot repeats the lane; done is drawn in the muted grey | [verified: `card.tsx:133`, `client/ui/hues.ts:29-35`] |
| 9 | Agents view icon in the folded Workbench rail is unclear, and it shows Paseo's green ring after a click | Icon `SquareKanban`; Paseo's `:focus-visible` ring (2 px, accent) draws on Morphise's rail buttons in the desktop app, as it did on chat rows before 0.18.1 | [verified: `client/workbench.tsx:69`; ring rule seen in 0.18.1's diagnosis] |
| 10 | Agents sits below Waiting | View order | [verified: `client/workbench.tsx:33, 68-69`] |

### How others handle the same things

- **Better Paseo** (the board this view follows; README "Tasks board"): lanes ease as they collapse and expand; Done shows the last 24 hours by default; on a narrow board the details open as a floating panel; the context ring shows on cards while a turn runs [primary: its README, read at `d6c90498`].
- **Kanban practice (Linear, GitHub Projects):** empty columns fold to a narrow strip with the column's name and count; columns share the width, within a minimum and maximum; the title is the card's first and strongest line, with metadata in one muted line. [unverified: from general product knowledge, not a cited source this session; the plan does not rely on it]

### What this means for our code

- Layout fixes live in `client/agents-board/board.tsx` (lane widths, empty lanes, default scroll).
- Card fixes live in `client/agents-board/card.tsx` and the presets in `shared/agents-board.ts`.
- The focus ring is the same cause as 0.18.1's chat-row ring; that fix was scoped to `[data-cp-row]` only (`client/polish/web/plugin-views.ts`), so Morphise's other buttons still get it.

### Confidence and gaps

| Claim | Tag | What would raise confidence |
| --- | --- | --- |
| Problems 1–10 and their causes | verified (code), inferred (screenshot reading) | none needed |
| The fixes read better with M's data | unverified | M's look after the build; the test daemon has no agents |

## Standardized review

- Question fit, traceability: pass; each problem has a file:line.
- Source quality: Better Paseo's README is primary; kanban practice is tagged unverified and not relied on.
- Bottom line: 0 blocking, 0 must-verify, 1 note (no screenshot of Better Paseo's board was viewed; GitHub is blocked in the browser pane and a download needs M's OK).
