# Readable workspace Info

- Status: done locally; approved requested cleanup; existing isolated Morphise worktree; no release/install
- Request: always show agents and models, remove their toggle, preserve every existing fact while reducing visual clutter. Keep compact row runtime minutes-only with prefix ~ and no trailing asterisk.

## Current owners and decision

WorkspaceUsage contains sentence summaries, a disclosure for agents/models and prose token counters. RuntimeDetails and WorkspaceCard mix similar labels with varying padding. [verified: client/workspace-usage.tsx; client/sidebar-runtime.tsx; client/sidebar-view.tsx]

Use a single compact label/value presentation with wrapping/selectable values. Agents/models always visible on explicit Info; preserve one-shot latest-only stats and same-host/settings gates. Separate counts, agent identity, latest-chat lifetime usage, activity accounting and workspace facts with consistent section padding. Retain full title, state, timestamp provenance, runtime window/coverage/explanation, host/path/Git/review/services/labels, and populated checkpoint fields/attribution. No new data reads, calculation changes or stored data changes. Existing activity disclosure retains all uncommon calculation details. Token input already includes cache, so show cache subset separately with explicit note. Error/loading/unavailable are text, not zero.

## Acceptance and verification

- No Show/Hide agents and models control; all listed agents/providers/models/statuses present immediately in explicit Info.
- Counts and token counters have clear labels, scope and values; full names/wrapping retained.
- Compact runtime retains ~minutes /24h, details retain exact recorded seconds.
- Existing source gates and token math remain unchanged; typecheck/focused/full/enabled browser checks and screenshot inspection.

## Parts

- [x] Shared display-only label/value component; usage/activity/workspace layout updates.
- [x] Browser assertions for default agent visibility, preserved usage facts and no toggle.
- [x] Render, docs and verification; no commit/release/install.

## Risk and rollback

One focused pass estimate; no dependency/API/schema/auth changes. New presentation wrapper must wrap long paths/models, not truncate. Rollback source only on M request. Preserve uncommitted runtime compact-format changes. No full installed-host/accessibility certification claim.

## Independent check

Independent partial check:0blockers,1must-verify and1note. Duration clarified: preserve existing detailed precision (seconds below1hour), compact row floors minutes/hours with~partial. Preservation browser checks updated to labelled counters and always-visible agent row; no toggle. Long folder/branch/review/service/label values wrap. No final independent diff review.

## Changes made

Implemented DetailFact display primitive; usage/activity/workspace labelled rows; always-visible agents/models on explicit Info. M additionally requested limited hover: summary-only branch now excludes tokens/agents/checkpoint/calculation, with fixed full Info on click. Browser verifies hover has no full sections/token reads; explicit Info exposes counters/model rows and no toggle. Typecheck/all4enabled browser/full suite/diff pass; screenshot inspected500pxfixture. Full log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/readable-workspace-info-tests.log. No installed-host/full ATcertification. No commit/release/install.
