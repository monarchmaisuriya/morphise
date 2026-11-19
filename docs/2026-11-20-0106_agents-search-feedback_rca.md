# Agents conversation search: silent unavailable and failed outcomes

- Date: 2026-11-20 01:06 IST
- Scope: visible outcomes and stale-query ownership, not new provider support

## Root cause and reproduction

The Agents conversation toggle saved a device setting but supplied no save-failure feedback. Its hook returned only a map of matches, discarded unavailable reasons, and sent RPC failures only to console.warn. Empty results could therefore mean no match, unsupported provider or an actual error, without a visible distinction. [verified: pre-change client/agents-board/board.tsx:435-441; conversation-hits.ts:15-51 at 9996dd7]

Mounted actual hook twice with synthetic RPC returning an unavailable provider reason. Both runs returned empty hits and no feedback. Daemon reader deliberately supports Claude/Codex and avoids timeline reads that resume finished agents. No source evidence justified adding another provider reader in this UI task. [verified: temporary agents-search-repro.cjs runs; server/stats/sessions.ts:113-118; server/stats/register.ts:18-45]

## Structural fix

The hook now owns pending work, problems and hits under a query/target identity. It returns no old state when that identity changes; cleanup suppresses late completions. Unavailable reasons, errors and scan-limit exhaustion become visible outcomes. Caller shows progress/problems and a clear conversation mode; save failure is handled and duplicate toggle writes locked. No retries, fabricated matches or unsupported-provider fallback.

Recurrence test: no for silent outcomes in this path and stale completion from a prior query, proven with actual hook and rendered UI fixtures. This does not claim all causes of M's original search symptom were reproduced. OpenCode remains unsupported and says why.

## Verification and prevention

- Actual-hook regression seen failing before implementation on absent pending state; now passes unavailable/error/progress/hit/stale query/disabled/empty/overlong cases with controlled debounce and deferred RPCs.
- Rendered actual Agents component proves conversation-only hit, visible unavailable/error, failed setting save, all filter categories/nine sorts, settings navigation and 360px width.
- Task fixture proves syntax placeholder, removed help rows and unchanged quick-add/reminder/checklist writes.
- Typecheck, 61 focused tests, full 1288-test suite and diff check pass; exact commands and skip accounting in sibling plan.
- Detection gap: no hook lifecycle test previously covered unavailable and rejected RPC outcomes. New optional actual-hook regression provides that check with MORPHISE_REACT_RUNTIME pointing at an existing React/test-renderer installation.
- Follow-up: adding another provider requires separate reader support and fixtures, owned by future explicitly scoped work; no unassigned production action.
