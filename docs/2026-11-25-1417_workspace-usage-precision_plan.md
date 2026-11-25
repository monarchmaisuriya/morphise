# Workspace agents, latest-chat usage and runtime precision

- Date:2026-11-25 14:17 IST
- Status: done locally; approved feature direction; M chose latest-chat tokens; full because read-only usage detail added
- Scope: Morphise only, existing isolated checkout; preserve uncommitted52pxrow-spacing fix

## Context and verified facts

M requests agent/provider/model, chat/subagent and project workspace counts, latest-chat lifetime tokens and more accurate runtime. Existing statsRead supports ready/partial/unavailable/error, input includes cache, total=input+output. SDK agent fields provider/model/parent available. [verified: shared/stats.ts:16-76; SDKcontracts.d.ts:54-76]
Read-only records investigation found594.374confirmed seconds (9m54s),8intervals in matching workspace, no uncertainty or pruning. Current compact label floors minutes; recordingSince2026-11-24 21:33:51 is within rolling24hwindow, so partial flag is appropriate. No proof of missing interval arithmetic. Cannot reconstruct pre-observation time from last activity. [verified: local Python aggregation in session; shared/sidebar-runtime.ts; server/work-store.ts:67-87]

## Goals and decisions

Show seconds for subhour recorded totals, say recorded not estimated; use explicit partial suffix and explanatory tooltip. Do not fabricate gap duration/change confirmed totals. Runtime summary remains same-source. Agents section summary visible; expandable provider/model groups and titles to avoid clutter. Distinguish strict parentless chats from subagents (orphan parent label still subagent); latest tokens use same tree-selected reference as provider/preview with source name. Project count same host/project unarchived workspace hooks, independent of sidebar search/tabs/caps, including background (label so). Tokens mounted only when explicit Info open, one read per open/target, no2spoll or bulk reads. Host must match installation taskHost; remote unavailable, no same-IDfallback. Honor host stats enabled setting; no read when disabled. Display lifetime input/output/cache/turns, cache subset not added to input twice; partial/error/unavailable explicit. Full raw precise values available in expansion with compact token labels. No transcript or title writes.

## Options and cost

Chosen reuse existing statsRead for latest chat, not new workspace-wide aggregate: fewer reads and no false incomplete sums. Alternative all-chat scan rejected by M's latest-chat choice. One session estimate, source rollback, no data/schema/dependency/server changes. First cut cosmetic changes not host/disabled gates. No release/install. No A/B. Same RPC auth remains. Existing logs reader only reads its own discovered session file; no caller paths. UI text-only; keyboard disclosure and counts labels.

## Acceptance and parts

- [x] Runtime formatter shows9m54s from594374ms, tiny/zero/partial cases; unchanged aggregation.
- [x] Scope-aware chats/subagents/provider/model/project counts; expandable agent details.
- [x] Lifetime stats latest only on explicit open; host/disabled gating, ready/partial/error states and correct token math.
- [x] Preserve row height52pxand hover invariants; typecheck/focused/browser/full tests/docs.

Files: new client/workspace-usage.tsx, shared/sidebar-runtime.ts/test, client/sidebar-runtime.tsx, sidebar-view.tsx, browser fixture, README. Units pure small; browser SDK boundary adapters synthetic. No installed-host/complete ATclaim. Success local2026-11-25: all named details findable, zero unscoped/bulk token reads; guardrail no runtime/title mutations.

## Independent check

Independent partial check:0blockers; notes about one-shot lifecycle, partial logs, sample reproducibility and parent scope addressed. Source trace strict parentless counts, display latest tokens same ref as preview. Browser verifies one read only on explicit Info, lifetime/input/output/cache math and remote exclusion; disabled/host gates inspected, not full lifecycle permutation harness. Sample local records at ~/.paseo/plugin-data/morphise/work/records.json; read-only aggregation all stored intervals grouped workspace SHA256prefixbdc0b1a9:8confirmed intervals594.374seconds, no uncertain/pruned. No title/message content logged. No independent implementation review.

## Changes made

Implemented seconds-precision recorded total with explicit partial marker, Agents & usage disclosure, latest-chat one-shot stats gate, same-host project/chat/subagent counts. Preserved52pxrow-padding fix. Typecheck/all4enabled browser suites/full suite/diff check PASS, full log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/workspace-usage-precision-tests.log. No commits/releases/install/Paseo edits. Known limitation recorded subset may undercount unobserved work; cannot prove completeness from current file.

## Open questions

None; latest-chat scope selected by M.
