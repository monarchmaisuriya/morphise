# Complete title display and useful chat information

- Date: 2026-11-22 13:09 IST
- Status: approved direction; full because user-facing cross-repository title rule. M chose A without bulk rewriting, then delegated remaining choices and completion (“use your best judgement and finish all”).
- Repositories: Morphise branch quick-chat-title-info at a8e7aee6a5354ae98dfbb4621e7ee7b1fede9f90; Paseo isolated worktree ../paseo-title-word-boundary on fix/automatic-title-word-boundary at 5afe6bd9aa7e8572eac29bc9105217f17fb4e828 (current settings branch base preserved).
- Subagents: independent plan/code check only

## Context and problem

M reports a Quick Chat title ending mid-word and requests more useful Info details. M confirmed fixing future Paseo auto titles at source, improving Morphise wrapping and Info, and not bulk-rewriting existing/manual titles. The running installation remains read-only; no production mutations. [verified: M chat 2026-11-22]

## Goals / Non-goals

Success checked 2026-11-22: future whitespace-delimited auto titles stop on complete words within existing 60 UTF-16-unit cap; omission explicitly marked with ellipsis. A first token exceeding the reserved prefix budget uses bounded surrogate-safe prefix plus ellipsis. Full stored title wraps in Quick Chat with no two-line clamp, and Info exposes available metadata. Guardrail: zero existing/manual title rewrites; zero new transcript/network reads, schemas or dependencies. No AI summaries, full first-prompt disclosure, database migration, generalized app title redesign, upstream release or installation update.

## What is true today

- Paseo deriveInitialAgentTitle normalizes first nonempty prompt line then slices at 60 with no boundary/omission handling. Explicit title bypasses it. [verified: ../paseo/packages/server/src/server/agent/create-agent-title.ts:4-37]
- First-message call is guarded by no stored title and no previous user message. Other shared helper consumers include initial workspace/agent/schedule creation; changing helper affects their provisional names too. Guard unchanged. [verified: ../paseo/packages/server/src/server/session.ts:8916-8926; references from resolveCreateAgentTitles/resolveFirstAgentPromptTitle searches]
- Morphise service forwards stored title unchanged; schema already contains provider, state via archivedAt, createdAt/updatedAt, chat/workspace IDs, directory/docsDirectory. [verified: server/quick-chat/service.ts:69-83; shared/quick-chat.ts:20]
- Chat title Text clamps at two lines. Info renders only paths/warnings. [verified: client/quick-chat.tsx:180-187]

```text
first prompt -> Paseo provisional title cuts at 60 <-- fails here
            -> stored title -> Morphise list -> two-line clamp <-- fails here for long titles
                                            -> Info paths only
```

## Options considered

| Aspect | Source naming + Morphise presentation (chosen) | Morphise-only display |
| --- | --- | --- |
| How | Word-boundary naming plus full wrapping and metadata | Change text clamp and add details |
| Fit | Each owner fixes its own truth | No host dependency |
| Gives up | Host change needed for future naming | Cannot recover already discarded title suffix |
| Effort/risk | Two small isolated patches, shared helper naming effects | Small but incomplete |
| Fails when | Existing truncated names remain intentionally unchanged | Future names still end mid-word |
| Evidence | helper and UI trace above | stored title forwarded unchanged |
| Completeness | 9/10 scoped behavior, explicit long-token limit | 5/10 incomplete generator fix |

RECOMMENDATION: source naming plus presentation. Existing title strings remain authoritative.

## Decision

Keep 60-character cap. If normalized first line exceeds cap, reserve one unit for ellipsis; choose last whitespace boundary at/before remaining prefix. When no complete first token fits within the reserved 59-unit prefix budget, use prefix trimmed of trailing high surrogate and append ellipsis. Words are whitespace-delimited; scripts without whitespace retain bounded prefix, not linguistic segmentation. Never alter explicit names or scan existing agents. Shared helper maintains its contract. [decided: M, A then delegated exact edge behavior, chat 2026-11-22]

Morphise removes title line clamp, constrains text container width and allows unbroken strings to wrap. Info remains inline, toggled by same icon; label becomes Chat info. Show full stored title, provider ID, Active/Archived, created/updated times, archived time if archived, chat ID, workspace ID plus existing locations/privacy warning. Dates display normalized UTC ISO strings to avoid locale/timezone ambiguity; invalid/missing dates say Unavailable. No inferred provider/model or live agent state, file existence or transcript. Text selectable, long IDs/paths safely wrap. [decided: M, delegated judgement]

## Cost and scope

Estimate 30-60 minutes (assumption based on preceding UI fixes), plus bounded Paseo tests. Scope two owning paths and tests/docs only. Main risks shared-title output change and narrow overflow. Reversible source changes; no migration/data effects. Both existing checkouts untouched except existing isolated Morphise working directory now dedicated branch. Paseo untracked plans and dependencies not copied; reuse dependency links without installations. Cut optional visual changes, never naming/manual-title or Info truthfulness tests.

## Design

Morphise token colors/font hierarchy and existing inline Info disclosure retained. No new controls/modals/dependencies. Use full title without clamp; actions still wrap, no horizontal overflow at 360/700/1440 dark/light. Info missing fields explicitly Unavailable. Old host compatibility preserved by optional schema fields already present. Loading/errors/empty/archive/permissions unchanged. Pure date/metadata rendering has no retries/timeouts/concurrency. No auth/data/trust boundary changes or network calls. Design sources: orchestrator design.md, ADAPTATIONS.md, impeccable craft-floor.md. Accessibility: exact descriptive button labels; details selectable; no layout obstructs actions.

## Risks and mitigations

| Risk | Likelihood / impact | Mitigation / detection |
| --- | --- | --- |
| Existing/manual names changed | Low / destructive | No migration; explicit helper tests; first-message guard remains |
| Whitespace/emoji/long token boundary | Medium / malformed titles | Literal boundary/empty/Unicode/60-limit tests; no orphan high surrogate |
| Other consumers expect exact clipped suffix | Medium / changed provisional name | Inspect callers; affected naming/session tests |
| Long title or identifiers overflow | Medium / hidden actions | Actual rendered long/multiline/unbroken cases, geometry checks all six layouts |
| Invalid dates look factual | Medium / misleading Info | Strict parse/finite check and Unavailable |
| Existing title already lost characters | Certain / cannot recover suffix | Show stored title as-is; no recovery or full-prompt claim |

## Acceptance criteria

1. Given prompt longer than 60, automatic name ends at complete whitespace-delimited word plus ellipsis, <=60; <=60 names unchanged.
2. Given exact-boundary word, Unicode, whitespace-only, long unbroken token or explicit title, behavior follows documented rule; manual title never rewritten.
3. Given long stored title, all text is visible by wrapping without clamp at desktop/narrow; actions stay reachable. Existing short/truncated names not expanded with invented suffix.
4. Given Info open, available metadata and paths display; missing/invalid values say Unavailable; archive time only when archived. Closing preserves list state.
5. Existing model-memory/icons/archive/filter/sort/handoff/recovery checks pass. No new RPC/schema/data persistence.

## Rollout and rollback

Independent plan check -> failing naming/wrapping/Info tests -> owning-layer fixes -> focused/type/browser/full Morphise and bounded relevant Paseo suites -> independent review -> authorized commits/push. Morphise patch release and registry proposal update after identical-tree merge. Paseo PR targets original settings branch (to exclude unrelated tracked settings work), not upstream/default merge or app release. Report separate adoption requirement. Stop on unexpected failure; do not rewrite data. Rollback only source on request, no database cleanup. Keep worktrees/docs until M chooses cleanup.

## Parts

| File | Action | Purpose |
| --- | --- | --- |
| Paseo packages/server/src/server/agent/create-agent-title.ts | change | Boundary-aware future provisional naming |
| Paseo packages/server/src/server/session.create-agent-title.test.ts | change | Naming edge/explicit preservation regressions |
| Paseo docs/automatic-agent-titles.md | create | Naming behavior, scope and adoption |
| Morphise client/quick-chat.tsx | change | Unclamped wrap and expanded Info |
| Morphise client/quick-chat-info.ts and test | create | Pure metadata/date formatting |
| Morphise client/quick-chat.browser.test.ts | change | Long-title and Info metadata responsive assertions |
| Morphise README/CHANGELOG/package files | change | Accurate feature/version metadata |
| this plan and RCA | create/update | Evidence and delivery limits |

- [ ] Naming tests red then green, explicit preservation/guard inspected, focused Paseo checks pass.
- [x] Info/wrapping tests red then green, six-layout regression and full Morphise checks pass.
- [ ] Independent review/fixes, separate commits/PRs and Morphise release/registry proposal.

## Independent check

Independent: one blocking boundary ambiguity upheld and fixed: fallback applies when no complete first token fits the 59-unit budget, including a 60-unit first token followed by text. Added 59/60/61 token-followed-by-word tests. Applied, not re-checked. Other criteria pass.

## Changes made

Created isolated branches/worktree; no implementation edits yet.

## Open questions

None; M delegated remaining choices. Running installation and upstream Paseo release excluded.

## Review and verification

Fresh review partial: no confirmed naming/UI blockers; reviewer caller-extraction script failed before final callers. Parent completed direct reads of agent-manager.ts:767-779, create-agent/create.ts:415-430 and schedule/service.ts:1108-1117: explicit-title precedence remains. Imported fallback titles also receive new rule when derived; no migration.

Two must-verifies upheld/fixed: missing archivedAt now shows Unavailable (explicit null is Active); timestamp parser rejects timezone-less times/impossible calendar dates and normalizes offset/UTC strings. ISO date-only maps to UTC midnight. Six formatter tests pass. Applied, not re-checked.

Title regression red on old substring, green on helper. 13 naming +19 storage tests pass and server typecheck passes. Broad Paseo unit suite launched in background; final outcome pending.

Morphise browser regression passes at six width/theme cases with full long/unbroken title, Info values, compact width >=280px and actions in bounds. Reintroducing two-line clamp killed expected assertion; exact file restored. Narrow render inspected; compact title now full row with actions below. No new API/shared kit modification.

Final v0.51.3 typecheck/focused formatter/browser/full suite and diff check passed. Delivery pending.
