# Latest-chat message previews and compact times

- Date: 2026-11-24 22:42 IST
- Status: approved by M: "yes go ahead, finish all, commit merge, push, release, update installation and paseo pr"; full because sidebar reads message content
- Scope: existing isolated morphise-sidebar-information; base6e44887869d59e4ef8603646c9443a3e3895f5f4; no source changes at start

## Context and problem

M wants the latest user/assistant message from the most recently active top-level chat as workspace second line, not its title. Timestamp must be only34m/7h/2d. Keep other metadata/tabs/calendar unchanged. [decided: M chat]

## Goals / Non-goals

Success: latest chat/message reflected in second line; zero title/status prefixes; zero cross-host fallback or transcript persistence. Verify locally2026-11-24. No summaries, inference, tool/reasoning previews, all-history scans or chat-title writes. Delivery authorized separately by M; running installation still production-read-only absent explicit override.

## What is true today

WorkspaceRow selects top-level tree from agents ordered lastActivityAt desc and reads title. statusLine adds Working/status. sidebarTime generates prefixes. [verified: client/sidebar-view.tsx:857-888,962-973; shared/sidebar-focus.ts:30-41]
Timeline tail refetch/subscribe is available; replacement/restored require refetch. Existing steps reader demonstrates lifecycle; do not copy its wrong-host fallback. [verified: client/steps-card.tsx:46-104; ../paseo/packages/client/src/index.ts:338-369; ../paseo/public-docs/plugins/reference.md:34]
Timeline user/assistant items carry text, entries oldest-first in existing consumers. [verified: shared/bookmarks.ts:56-62; client/agents-board/details.tsx:33-61]

## Options considered

| Aspect | Bounded live tail per shown workspace (chosen) | Poll on lastActivity | All-history index |
| --- | --- | --- | --- |
| Works | Read last100 entries, follow message updates, stop on unmount | Repeat history for activity changes | New stored message index |
| Fit | Existing SDK/subscription pattern | Simpler but misses activity granularity | New server/storage contract |
| Cost | Per-visible-row read/subscription | Repeated RPC during work | High |
| Gives up | Older messages beyond100 item tail | Timeliness/performance | Privacy/scope |
| Failure | stale read vs live; lifecycle test | missed updates | extra persisted content |
| Completeness | 9/10 bounded scope explicit | 6/10 | 3/10 overreach |

RECOMMENDATION: bounded live tail.

## Decision

New pure lastMessagePreview accepts timeline entries/items and returns one-line bounded240character literal plain text of latest nonempty user/assistant message, skipping tool/reasoning. Labels explicitly loading/no recent messages/preview unavailable; no title fallback presented as message. Read100entries one page; no backfill. Per mounted workspace only latest top-level chat, regardless tab or nested listing. Host-target client from getPaseoClient(reference.hostId), no fallback if unavailable. Effect key host+agent; ignore stale result/unmount; subscribe before read, live revision prevents old page replacing newer message, reconnect/replacement resets and refetches. Subscribe error visible, ready rejection handled, dispose on target change/unmount. No persistent store/log message text. Plain render no HTML. Timestamp same valid-source selection returns only formatElapsed. Details/tooltips retain state semantics separately.

## Cost and scope

Estimate one focused session, unverified. Existing dependency link used. Changes shared/sidebar-message.ts+tests(new), client/sidebar-message.ts+tests(new) and hook adapter, sidebar-view.tsx, sidebar-focus.ts/test, browser fixture, README. Main risk reads for many visible rows and race/host routing; bound100per row, stop on collapse/tab/unmount. Reversible source, no schema.

## Design

Preserve existing UI tokens and one-line truncation, full accessibility label. Useful metadata unchanged. Loading/error/empty literal text. No motion. New trust boundary is existing authenticated host API -> text display, no secrets/log/HTML/storage. No new permissions/outbound server fetch/dependency. Safe defaults100entries/240chars. Plain text collapse whitespace only, do not execute markdown.1page may miss last user/assistant when100tool entries follow; explicit no recent message, not "no chat messages". Timeline snapshot state not reused across keys. Metrics:200preview extractions under100ms, no polling. Existing app host auth unchanged. Responsive browser360/700. No stored recovery needed. No A/B. Source rollback only M request. No accessibility certification claim.

## Risks and mitigations

| Risk | Mitigation/check |
| --- | --- |
| Host collision | explicit target host, no fallback; boundary fixture |
| Old fetch overwrites stream | generation/live revision and cancellation tests |
| Removed/closed chat | preview unavailable with no title lie |
| Heavy tails | one100-item page per mounted owner, no timer |
| Transcript exposure | M requested content; memory only, no logs/storage |

## Acceptance criteria

Latest user or assistant text, not title/tool/reasoning; whitespace collapsed and240char bound. Latest top-level chat chosen, old result not shown after target change. Live messages/reconnect work; failure visible; subscription disposed. Prefixless time retains invalid/future fallback. Metadata/other features unchanged. Typecheck/unit/browser/full suite/diff pass.

## Rollout and rollback

Tests/helpers -> reader/hook -> real sidebar/browser -> final verification -> requested commit/push/PR merge/release/registry. Production install blocked pending explicit override. No data migration.

## Parts

- [x] Pure message extraction and compact timestamp, unit tests. Done: red/green or mutant evidence.
- [x] Host-bound live reader/hook + second-line wiring. Done: stale/live/error/dispose tests and browser latest message rather than title.
- [x] Verification/docs/delivery. Done: checks PASS, exact release pins.

## Independent check

Independent partial check:0confirmed blockers,2must-verify. Fixed/readiness explicitly awaited before initial read and pending-readiness disposal tested. Protocol stream seq verified in ../paseo/packages/protocol/src/messages.ts:4544-4553; repeated/newer/older sequence tests added. No cross-host fallback. Reviewer stopped optional guessed path lookup; no full independent implementation review claimed.

## Changes made

Implemented pure extraction, host-bound hook/live reader and sidebar wiring; prefixless times; browser live user-message update. Delivery authorized by M; installation remains blocked by standing production read-only rule.

## Open questions

No design questions; installation override remains separate.
