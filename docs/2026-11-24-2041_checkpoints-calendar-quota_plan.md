# Workspace checkpoints, Workbench calendar and Dispatch quota warnings

- Date: 2026-11-24 20:41 IST
- Status: implemented locally, reviewed/fixed, verified; approved scope/direction by M's “use your best judgement and finish all” after recommended boundaries; full because new stored plugin records and launch preflight
- Repository: Morphise; branch workspace-checkpoints-calendar-quota; base current origin/main (includes v0.54.1), existing isolated checkout reused
- Subagents: independent plan and code review; implementation stays parent-owned

## Context and problem

M selected Workspace checkpoint cards, Agent work calendar and Quota-aware Dispatch warnings from the Orca/bb research, explicitly locating Calendar in Workbench. M delegated remaining scope choices and completion after manual+agent updates/conflict protection, future recording/coverage disclosure and advisory quota warnings were proposed. No competitor code is copied. [verified: M chat 2026-11-24]

## Goals / Non-goals

Success checked 2026-11-24: checkpoint fields survive reload with author/time and stale-write rejection; Calendar Day/Week lists true recorded start/end intervals and distinct summed-agent versus elapsed coverage durations; quota warning precedes every Dispatch launch/retry path. Guardrails: zero historical/manual title edits, zero credential/log-content reads for quota, no automatic account/model switching, no resumed finished agents for calendar/checkpoints. No whole-history backfill, calendar billing/productivity claims, provider-specific credential integration, orchestration engine, release/install/registry/main merge.

## What is true today

- Dispatch creates workspace+first agent in one call sequentially; start(which) is shared by buttons, retries and keyboard; runningRef guards duplicate presses. [verified: client/dispatch.tsx:181-215]
- Installed @getpaseo/client0.16.0-beta.1 exposes providers.listUsage with providerId/windows usedPct/remainingPct/reset/fetchedAt, not guaranteed selected account identity. Client implementation checks providerUsageList capability. [verified: node_modules/@getpaseo/client/dist/index.d.ts:426-466; ../paseo/packages/client/src/index.ts:1268-1277; ../paseo/packages/protocol/src/messages.ts:6821-6877]
- Stats turns are limited200/provider claude/codex; current Activity aggregates counts, not complete work intervals. We cannot label those complete history. [verified: shared/stats.ts:16,42-64; shared/activity.ts:12-38]
- Installed plugin SDK supports agent.turn.before/after and archive/close hooks with turnId possibly null; server hooks can run without an app but payload timeline isn't guaranteed history. No history fetch needed here. [verified: node_modules/@getpaseo/plugin/dist/server/lifecycle.d.ts:98-132; server/stats/register.ts:18]
- Plugin server settings registration offers read/subscribe only; no server write/CAS API. Workspace metadata replaces a top-level key and lacks compare-and-swap. A dedicated plugin file store therefore owns revisioned checkpoint/calendar writes. [verified: node_modules/@getpaseo/plugin/dist/server/contracts.d.ts:31-36; node_modules/@getpaseo/client/dist/index.d.ts:126-127]
- Workbench is agents/board/bookmarks/activity with device boardTab enum, rail/tab navigation; adding calendar requires both route and device preference. Panels register in client/sections.tsx. [verified: client/workbench.tsx:35-36,85-91,194-240; client/device-choices.ts:10-13; client/sections.tsx:266-268]

## Options considered

| Aspect | Dedicated bounded plugin store (chosen) | Workspace metadata + existing Stats |
| --- | --- | --- |
| How | Atomic JSON file, serialized operations, checkpoint revisions and observed calendar events | Replace metadata object; calendar latest200 turns |
| Fit | Owns concurrency and restart uncertainty explicitly | Existing API shortcuts |
| Gives up | Needs persistence/recovery tests; no cross-process writer support | CAS and reliable history coverage |
| Cost/risk | Moderate additive modules/panels | Smaller but lost edits/misleading history |
| Failure | Disk error loud; uncertain run explicit | Last writer wins without noticing; history silently absent |
| Evidence | SDK constraints above | Stats cap and metadata replace semantics |
| Completeness | 9/10 single daemon plugin process; retained-record limits disclosed | 4/10 fails chosen invariants |

RECOMMENDATION: dedicated serialized store, reuse host snapshots only for validation/navigation, never authoritative provider runtime inference.

## Decision

Build three independent parts behind existing plugin surfaces. Checkpoint panel on workspace: Goal, Last verified result, Blocked by, Next step, revision, author (user or agent ID) and timestamp. Explicit Save preserves local draft on conflict; Reload latest is explicit, not blind overwrite. One shared whole-card revision; any stale update rejected. Agent tool checkpoint read/update has no arbitrary workspaceId and resolves caller.agent.workspaceId at execution, refreshes membership before write; expectedRevision mandatory on update. Refuse subagent/background-helper writes to shared workspace card, allow user-owned top-level agents only. No auto-summary or automatic checkpoint writes. [decided: M delegated after recommended boundaries]

Calendar records hooks from now, no backfill in first version. Store interval agent/workspace/provider/title, turnId, start/end, lastObservedAt, outcome completed/failed/canceled/interrupted/unknown. Duplicate matching start/end idempotent. Distinct real turnId matches strictly; null-ID paths bounded per agent but labelled uncertain if restart/overlap cannot identify turn. On plugin restart, open records close at their last observed instant, flagged interrupted/uncertain, never counted through downtime. Agent close/archive closes active record at observed time with interrupted outcome. Read results include recordingSince, retention/coverage notes and history warning. Plugin unload stops observation; no forced prompt/action. Hidden background helpers excluded when host reports flag/known helper metadata; unsupported flag absence disclosed. Child agents included with separate IDs, so parallel durations sum as agent-time, never human-hours. 90-day retention, cap20000 intervals; pruning noted, empty state explicit.

Calendar UI Workbench Day/Week with previous/next/today, local day boundaries and timezone label; source timestamps UTC. Filter provider and workspace/project label using current workspace map, fallback Unknown/removed. Day sections with time/duration/outcome/open-chat; no rounded artificial billable blocks. Weekly totals sum each agent interval; interval clipping at local day boundaries, overlap not double-counted for elapsed coverage metric. Running intervals use observed now, visibly ongoing; interrupted ones no invented end. Host-scoped data/navigation, no cross-host ID merging. Narrow view agenda is primary, not cramped hourly grid. [decided: M calendar placement; rest delegated]

Quota preflight reads providers.listUsage once per attempt, finite timeout5s, no retries/polling or auth file reads. Provider exact ID only, no broad fallback. Available windows valid percent0..100; remainingPct used only when used missing; inconsistent percentages -> unavailable. Selected provider fetchedAt missing/older than5min/future-invalid (never envelope fallback) -> stale/unavailable, next reset only parsed if valid. At >=80% show warning plus pending prompt count; >=100 cap labels exhausted. Unknown/error/missing host capability shown, never guessed zero, does not block user-triggered launch. Quota state not a guaranteed capacity/cost forecast. Warning confirmation freezes exact provider/model selection, resolved project root/source parameters, mode/where/prompt IDs+texts; confirm checks same snapshot and cancels if changed. Every all/retry/keyboard path runs preflight; double presses guarded while fetch/launch; cancellation starts zero agents. Expired warning refreshes before launch. No automatic reroute, batch resizing or new provider request per row. [decided: M delegated recommended advisory boundaries]

## Cost and scope

Estimate6-12 developer-days for polished first versions (unverified planning estimate, actual scope kept bounded in this task). Main risk persistence/event identity and Dispatch race. Three parts individually tested/reviewable, no dependency install. Blast radius new store/contracts, checkpoint panel/tool, calendar hooks/Workbench tab, Dispatch guard; existing settings/panels/providers unchanged. Cut historical enrichment/visual grid/CSV export before correctness. Source reversible; persistent file kept across rollback and not auto-deleted. Single active plugin-process writer assumed by host plugin lifecycle; no multiprocess file lock claim.

## Design

```text
workspace user/own agent -> checkpoint RPC/tool -> revisioned store -> workspace panel
host turn hooks          -> interval reducer   -> same store       -> Workbench Calendar
Dispatch click/retry/key -> provider usage     -> warning/confirm  -> existing workspace create
```

Validate/CAS inside queue, derive isolated candidate, atomic write to temp sibling then rename; only after successful persistence replace in-memory state. Failed write/rename leaves prior state/revision untouched; no secrets or conversation content stored. Store validate version1 on load, unknown/corrupt version produces clear error/no clobber. Serialized queue must survive failed operation without hiding caller error. Retention bounds applied on reads/writes, no silent total-history claim. Checkpoint limits4 fields<=2000 chars each, records<=2000, explicit invalid not truncated. File parent under PASEO_HOME/plugin-data/morphise/work with restrictive mode, avoid broad scans/symlinks/file paths supplied from clients. No file deletion endpoints. Client workspace/agent IDs validated against host refresh, agent tool caller cannot name another workspace. Dates sourced clock/injected test clock, no model inference. UI selection/drafts keyed by host+workspace/request; stale results discarded. Save/error/loading/empty/unavailable states explicit. Native mobile UI uses same ScrollView/fields, no web-only API requirements.

Design refs orchestrator design.md/ADAPTATIONS/craft-floor; existing tokens/kit and panel/card patterns. Privacy: prompts/transcripts/credentials excluded except current short agent title (user visible); metadata may contain user-sensitive checkpoint text, disclose stored on daemon, no secret store. No metrics export/network service. Retries explicit; failure can disable new feature but never existing Dispatch except in-flight preflight state reset. Calendar errors visible not empty success. No production service writes or installs by agent.

## Risks and mitigations

| Risk | Likelihood / impact | Mitigation / detection |
| --- | --- | --- |
| Checkpoint concurrent overwrite | Medium / lost context | Revision check inside serialized owner; two-writer test |
| Duplicate/out-of-order turn hooks | Medium / inflated calendar | Stable turn identity, orphan end not fabricated; explicit coverage warning/tests |
| Restart clock/gaps | Medium / fake hours | lastObserved cutoff, interrupted flag, no downtime credit |
| Plugin storage failure | Medium / loss | Validate/atomic writes, failure propagated, no overwrite corrupt state |
| Quota from wrong account | Medium / misleading warning | Provider-scoped label; no account guarantee; unknown explicit |
| Launch after user edits warning | Medium / wrong workload | Exact pending snapshot binding and expiry; rerun preflight |
| Background/helper counting | Medium / misleading workload | Exclusion known flag/metadata, label scope limits |

## Acceptance criteria

1. Checkpoint user read/save/reload across reopen; conflict rejects second stale writer and preserves draft; field limits/missing workspace errors explicit.
2. Tool update requires same own workspace, caller validated/top-level, expected revision, source attribution. Outsider/spoofed/workspace-less/helper writes rejected.
3. Calendar duplicate same turn no double count, concurrent agents sum separately, real IDs cannot finish other turn, orphan end doesn't invent start, restart/cancel/archive/retention explicit.
4. Day/week clips and midnight/DST boundaries correct; no negative/future duration; empty/no prior history/partial data shown; Workbench links/device choice persist.
5. Usage valid fresh exact provider -> windows; missing/stale/error/capability -> unavailable; >=80 warning confirmation, exhausted clear; low no warning; bad percentages not trusted.
6. Cancel/mutate/expire/double-click/retry/key preflight never launches unconfirmed stale snapshot. No automatic model/account switch. Existing launch state behavior preserved.
7. Unit red-before-green, store integration restart/conflict/failure tests, actual-component browser panel/calendar/Dispatch checks, full typecheck/tests; independent code review/fixes.

## Rollout and rollback

Plan check -> build part1 checkpoints/store -> part2 calendar -> part3 Dispatch -> review/fix -> final checks/report. No commit/push/release/install included. New panels/tab can fail independently; no destructive migration. Old plugin ignores new file. Rollback retains records, no history rewrite. Require explicit request for cleanup/removal. Abort if host contract unavailable: show unavailable rather than invent unsupported functionality.

## Parts

| Paths | Action | Owner |
| --- | --- | --- |
| shared/work-checkpoints.ts, shared/work-calendar.ts, shared/dispatch-quota.ts + tests | new | Validated contracts and pure reducers/math |
| server/work-store.ts + tests, server/work.register.ts | new | Atomic serialized state, RPC/tool/hooks |
| index.server.ts | change | Register/cleanup |
| client/checkpoint-panel.tsx, client/work-calendar.tsx | new | User surfaces |
| client/sections.tsx, client/workbench.tsx, client/device-choices.ts | change | Panel/calendar route and device choice |
| client/dispatch.tsx, client/dispatch-quota.tsx | change/new | Launch preflight/warning binding |
| new feature browser tests | new | Actual UI integration at SDK boundary |
| README/OVERVIEW/plan | change/new | Scope/privacy/coverage/advisory limitations |

- [x] Part1 checkpoint/store contracts, red/green persistence/conflict/boundary tests, panel/tool integration.
- [x] Part2 calendar event recording and Day/Week Workbench integration with explicit history/restart limits.
- [x] Part3 quota parsing/preflight/advisory UI and exact batch confirmation/race tests.
- [x] Independent review/fixes and complete verification.

## Independent check

Independent: one model-binding blocker and three transaction/freshness/calendar must-verifies upheld/fixed in contracts. Exact model/source binding, persist-before-publish, provider timestamp authority, and conservative uncertain interval handling specified below. Applied, not re-checked.

## Changes made

Source/API checks only. Dedicated branch from current main; untracked research and dependency link preserved.

## Open questions

None for scoped implementation; M delegated choices. Cross-provider quota/account fidelity and complete historical backfill explicitly not promised.

## Calendar reducer transition contract

Real start: duplicate agent+turn ID no-op, different concurrent turn closes previous same-agent running record as uncertain/interrupted; late end matches only same real ID in current running record. Null start: unique observation ID, always uncertain; null end may close current null record as uncertain, never real-ID record; uncertainty excluded from duration totals because stale null ends cannot be disambiguated. Terminal duplicate/end without start no-op; no fabricated start. Restart closes every open record at its start (last observed instant) as interrupted/uncertain, excludes it from totals; new epoch does not match previous terminal records. Protect active records from retention; if capacity reached with all active, reject new recording with visible error, never silently evict. Prune only terminal intervals and report count.

## Review and final verification

Independent code review found a blocking cancellation race: an old warning could cancel UI without invalidating a pending quota recheck. Upheld and fixed with monotonic launch-attempt identity checked after usage await and before creation. Regression covers warning -> second delayed Start -> Cancel -> low quota response -> zero launches, plus unmount preflight. Applied, not re-checked. Same-provider model mutation during fetch and prompt mutation during confirmation are tested; exact source/model sent is asserted. Expiry/retry/keyboard share the inspected start path, but exhaustive UI permutations and actual host runtime certification remain unperformed; do not claim universal e2e certification.

Store failure tests verify no phantom revisions, corrupt-file preservation, restart uncertainty, matching real/null IDs, orphan/late ends, duplicate starts and terminal retention. Tool integration checks caller ownership/subagent and history-session exclusion. Calendar pure test proves summed vs union time and local DST23-hour day. Calendar wrapper missing PopoverHost caused render failure and was fixed at surface owner; checkpoint save/conflict/reload and responsive calendar/Dispatch surfaces pass.

VERIFY: npm run typecheck PASS.
VERIFY: npm test -- server/work-store.test.ts server/work.register.test.ts shared/work-calendar.test.ts shared/dispatch-quota.test.ts PASS (16 tests).
VERIFY: enabled client/work-features.browser.test.ts PASS non-skipped using existing React Native Web/Playwright paths; actual plugin UI, SDK boundary fakes.
VERIFY: npm test PASS; counts recorded in final chat.
VERIFY: git diff --check PASS before final documentation update; rerun for final tree.
Mutation: removed checkpoint revision check -> stale-writer test failed; envelope freshness fallback -> undated-provider test failed. Exact bytes restored. Initial probe output-string assertion was wrong, corrected without weakening product assertions.

### Changes made

Added validated contracts, WorkStore and server hook/tool/RPC registration, workspace checkpoint panel, Workbench Calendar route/device persistence and observed interval view, Dispatch provider quota preflight/warning/cancel binding, focused integration/pure/browser tests and user docs. No dependency, daemon mutation, secret access, transcript fetch, historical backfill, commit/push/release/install. Existing research file retained.
