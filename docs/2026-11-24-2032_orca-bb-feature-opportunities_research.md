# Orca and bb features worth adapting to Morphise

- Date: 2026-11-24 20:32 IST
- Status: presented
- Mode: explore options
- Repositories: Morphise, read-only Paseo source reference
- Question: Which publicly documented Orca and bb features add useful, nonduplicate capabilities to Morphise inside Paseo?
- Constraints: research only; no installs, product execution, code/asset copying or production changes. Prefer plugin-owned panels/settings/hooks over DOM modifications or a permanent Paseo fork.
- Answered when: prioritized feature list with sources, overlap, feasible owner, effort/risk estimates and limitations.
- Decision: what M should investigate/build next. Out of scope: benchmark/vendor superiority, complete source audit, shipping plan or implementation.

## Options: extend Morphise's existing work surfaces, not recreate an IDE

**Bottom line:** Start with checkpoints, a persistent attention inbox and structured review/acceptance cards, then supervised Dispatch. Confidence medium: competitor behavior is documented, existing Morphise building blocks are verified, but each proposed integration remains a design inference until its API/permission paths are prototyped.

**Where we are:** current public docs/marketplace surveyed and local owners inspected; no competitor apps executed. Awaiting priority selection, not implementation approval.

**Need from M:** choose a direction after the ranked list; no immediate input required to use this research.

### The problem, framed

- What: transfer useful interaction/workflow ideas into Morphise without duplicating Paseo's platform.
- Why: reduce switching between agent threads, missing questions, review results and worktrees.
- Who: M and Morphise users; maintainer owns plugin state/lifecycle; host owns execution/permissions/native integration.
- When: no shipping deadline given; assess current public pages on 2026-11-24.
- Where: Workbench, Tasks, Dispatch, Checks and agent panels/tools.
- Which: Orca official docs/README and bb core guides plus separately authored marketplace plugins, not a claim that all bb examples are built in.
- How: verify advertised behavior, compare with local code, classify port as plugin extension, API spike, or host-level work.
- How much: estimates below assume one developer familiar with Morphise, scoped first version plus tests/review, not complete feature parity. Small=1-3 dev-days, medium=4-10, large=2-6 weeks. No measured delivery commitment.

### What must be true

- Morphise already has multi-agent launch: Dispatch starts separate workspaces but its per-prompt UI stops at started/failed, not a durable supervised dependency graph. [verified, primary, strong: client/dispatch.tsx:13-15,44-53]
- Existing Tasks, Agents/attention, stats, Notes, prompts, Quick Chat, HTML Pages and Checks are foundations, not new port candidates. Product overview is corroborated by inspected owners below. [verified, primary, strong: OVERVIEW.md:31-46,55-80; shared/tasks.ts:57-85; client/checks-panel.tsx:43-67; server/stats/fold.ts:32-39]
- Paseo exposes screens, agent/workspace panels, timeline renderers, composer items and file panels. Hooks expose turn outcomes and permission events. This supports candidate surfaces, not all execution/permission semantics. [verified, primary, strong: ../paseo/packages/plugin/src/client/contracts.ts:207-238; ../paseo/packages/plugin/src/server/lifecycle.ts:97-124]
- Existing reminder delivery uses a connection supplied by an open app subscription; it is not proof of unattended durable orchestration. [verified, primary, strong: server/task-keeper.ts:5-10,46-54]
- Feasibility labels are inferred from those contracts and inspected owners. No new feature has been compiled or exercised; later SDK/host versions may change requirements. [unverified: per-feature contract spike and local failure/restart tests]

### Ranked feature inventory

All costs below are estimates; all adaptation/absence judgments are scoped inferences, not exhaustive repository-negative proofs. Feature descriptions are author/vendor claims verified as documented, not independently tested product guarantees.

| Rank | Feature / source | Morphise adaptation and existing overlap | Route / effort / main risk |
| --- | --- | --- | --- |
| 1 | **Durable work checkpoints** [Orca checkpoints](https://orca.dev/docs/cli/worktree-checkpoints) | Per-workspace Goal / Last verified / Blocked by / Next step, visible on hover and in Info; agent updates only its own entry. Extends Notes and sidebar metadata rather than replacing titles. | Plugin-first; small. Source identity, stale checkpoints and user-written text preservation. |
| 2 | **Persistent Needs-you inbox** [Orca bots](https://orca.dev/docs/bots), [bb Needs Attention](https://getbb.app/marketplace/attention) | Evolve Agents/Needs me into durable, deduplicated requests with reason, age, source chat, snooze and resolved state. Not another status board. | Plugin-first; medium. Distinguish provider permission requests from free-text questions; never treat notification as approval. |
| 3 | **Tracked independent reviewer** [bb Advisor](https://getbb.app/marketplace/advisor) | Review now action; separate reviewer agent/model; findings with evidence, open/fixed/disputed and reviewed source revision. Extend Checks/agent panel. Start manual, not automatic corrective turns. | Plugin-first surface; execution spike required; medium. Extra token usage, permission enforcement and reviewer recursion. Unavailable must not mean approved. |
| 4 | **Acceptance checklist / Try it** [bb Try It](https://getbb.app/marketplace/try-it) | Agent supplies build URL, changed behavior and tests for M to mark Works/Broken with notes; persist results on task/chat, then compose feedback. Extend Tasks/Pages. | Plugin-first; small-medium. A non-localhost URL is not proof the phone can reach it; disclose auth/network limits. No automatic public tunnel. |
| 5 | **Issue → task → isolated workspace** [Orca Linear drawer](https://orca.dev/docs/review/linear) | GitHub-first issue picker, then Linear/Jira adapters. Import source link/context, link a Task, launch Dispatch with explicit repo/base/provider. | Plugin plus connector backend; medium per first source. Authentication, private attachments, duplicate launch and external write confirmation. |
| 6 | **Supervised Dispatch workflows** [Orca orchestration](https://orca.dev/docs/cli/orchestration), [bb orchestration](https://getbb.app/guides/orchestrate-coding-agents) | Extend one-off Dispatch with dependencies, task/attempt IDs, durable run state, bounded concurrency, stop/recover and decision gates. Plan/build/review templates, no auto merge. | Plugin orchestration service + API spike; large. Duplicate starts, crash recovery, stale completion, shared-worktree edits and cost. |
| 7 | **Race/compare agent solutions** [Orca parallel-agent recipe](https://orca.dev/docs/recipes/parallel-agents) | Same task and base commit in several isolated worktrees, comparison of diff/test evidence/duration, choose candidate without auto-deleting losers. Reuses Dispatch. | Plugin-first; medium after durable run tracking. Multiply token/compute spend; agreement does not establish correctness. |
| 8 | **Review findings → existing native batch flow (overlap, do not rebuild)** [Orca Annotate AI Diff](https://orca.dev/docs/review/annotate-ai-diff) | Paseo already persists diff comment drafts and sends batches to a selected agent. Reuse it; only explore attaching Morphise tracked findings/check evidence when a supported bridge exists. | Existing host feature; plugin-to-review bridge API spike, estimate small-medium if exposed. Preserve revision anchors and show stale comments after edits. |
| 9 | **Portfolio pull-request cockpit** [bb PR Dashboard](https://getbb.app/marketplace/bb-github-pr-dashboard) | Extend existing single-workspace Checks to My PRs / Review requests / blockers across repos; route selected failing job/review comment to the linked chat. | Plugin + GitHub API/CLI backend; medium-large. Provider auth/rate limits, source-head freshness, no implicit merge/review writes. |
| 10 | **Agent execution traces** [bb Agent Traces](https://getbb.app/marketplace/agent-traces) | Add timeline/waterfall to current Stats: slowest tools, waiting on user, subagent spans, per-command failures and two-turn comparison. | Plugin-first for available provider logs; medium-large. Current fold retains counters, not raw arguments; provider timing gaps and overlapping time must stay explicit. |
| 11 | **Agent work calendar** [bb Agent Calendar](https://getbb.app/marketplace/agent-calendar) | Day/week agent-turn blocks by project, overlap and CSV export alongside Activity. | Plugin-first; medium. Agent-hours are not human labor hours; separate raw duration from rounded display, timezone and overlap. |
| 12 | **Live agent/dependency graph** [bb Agent Graph](https://getbb.app/marketplace/agent-graph) | Workbench graph of parent/child agents and workflow tasks with active-only filter and jump-to-blocker. Reuses existing Agents data; tool-level graph later. | Plugin-first; medium. Large-tree rendering and partial-history visibility. No assumed missing graph edges. |
| 13 | **Build/test concurrency queue** [bb drmanhattan](https://getbb.app/marketplace/drmanhattan) | Queue heavy opted-in builds/tests by host; show running/waiting/cancel/logs in Workbench and run cards. Start with Morphise-owned jobs. | Plugin service or explicit external tool dependency; medium-large. Cannot transparently enforce on arbitrary provider shell tools; cancellation/process ownership critical. |
| 14 | **Repository/branch/worktree map** [bb Branch Graph](https://getbb.app/marketplace/branch-graph) | Read-only graph/list linking projects, checkouts, branches, chats, PRs and dirty/unpushed work. Extends sidebar/workspace facts. | Plugin + scoped read-only Git; medium. Expensive scans, remote routing; never equate no linked chat with safe to delete. |
| 15 | **Approval and decision journal** [bb Change Gate](https://getbb.app/marketplace/change-gate) | Structured change/target/risk/rollback card and recorded user decision tied to exact request/revision. Extends workflow decision gates. | Plugin-first advisory record; medium. Not security enforcement: cannot block other tools or replace provider permissions; agent must not approve itself. |
| 16 | **Acceptance tracking around existing visual annotations (overlap)** [Orca Design Mode](https://orca.dev/docs/browser/design-mode), [bb Agentation](https://getbb.app/marketplace/agentation) | Paseo already captures browser element HTML/styles/selector/source context and optional screenshot into workspace attachments. Reuse it; add tracked acceptance links/results rather than another picker. | Native picker already present in checked source; plugin-page feedback tracking medium, bridge/API spike for native attachment reuse. Private-page data, cross-origin capture, DOM fragility. |
| 17 | **Reusable manager/bot profiles** [Orca bots](https://orca.dev/docs/bots), [bb orchestration guide](https://getbb.app/guides/orchestrate-coding-agents) | Named recurring job profile with prompt, project, provider, permitted capabilities and reviewed Markdown context; explicit launches before scheduling. | Plugin-first manual profile medium; unattended bots/connectors large. Memory provenance, permission scope, external webhooks and secrets. |
| 18 | **Quota-aware dispatch warnings** [Orca usage](https://orca.dev/docs/agents/usage-tracking), [bb AI Usage](https://getbb.app/marketplace/ai-usage) | Before launching several agents, show host/provider quota headroom and reset if supported. Keep consumption stats separate from provider limits. | API/provider spike; medium. Do not read auth cookies/copy credentials or silently switch accounts/models. Missing usage is unavailable, not zero. |

### What this means for our code

- **Tasks/Workbench first:** existing schema already has checklists and rules; adding dependencies or request history changes a stored contract and needs a compatibility plan, not free-form extra fields. [verified, primary, strong: shared/tasks.ts:57-85]
- **Extend Dispatch rather than a second launcher:** existing implementation owns project/model/mode/worktree selection and started/failed recovery. Durable workflows need a separate run/attempt owner rather than more transient React row state. [verified: client/dispatch.tsx:13-15,44-53; inferred, moderate: proposed durable-state boundary]
- **Checks already composes a fix request:** reads workspace PR state and inserts into the latest chat's composer for user review, without sending. Rich review batches should retain that safety default. [verified, primary, strong: client/checks-panel.tsx:43-67]
- **Stats must not promise full traces from current counters:** SessionFold deliberately retains no content/tool arguments. Detailed traces require separate bounded evidence retention or on-demand source reads, with redaction and deleted/history handling. [verified, primary, strong: server/stats/fold.ts:32-39]
- **Use native plugin surfaces:** screens/panels/tools/metadata before host DOM overrides. The recent sidebar bug demonstrated that a native-slot-only fixture can miss Morphise's actual consumer; this is a concrete reason to avoid broad browser/app instrumentation as the first project. [verified: docs/2026-11-24-1931_sidebar-renderer-rings_rca.md; inferred, moderate: prioritization]

### Roadmap options

| Aspect | A: Workflow essentials (recommended first) | B: Supervised agent factory | C: UI-testing/design tools |
| --- | --- | --- | --- |
| Contents | Checkpoints + Needs-you + manual review/acceptance cards | Durable Dispatch + dependencies + reviewers + races | Page annotations + test checklist + optional browser context |
| Why fits | Extends Notes/Agents/Tasks/Checks | Extends Dispatch/workspaces/lifecycle hooks | Extends Pages and browser navigation |
| Gives up | No autonomous end-to-end execution | Quick wins and low operating risk | Less benefit for non-UI tasks |
| Cost | Estimate 1-3 weeks for a bounded first bundle | Estimate 4-8 weeks plus contract/recovery spikes | Estimate 2-4 weeks plugin-page scope; host work extra |
| Blast radius / undo | New plugin records/panels, togglable | Stateful worker creation/stop across worktrees, harder recovery | Scoped page attachments first; browser capture permissions later |
| Fails when | Requests inferred from prose without user/provider provenance | Lost attempts or permission prompts get mistaken for completion | Assuming browser navigation exposes DOM/screenshot APIs |
| Evidence strength | Strong existing primitives; moderate transfer | Moderate primitives; execution semantics unverified | Strong Pages ownership; native capture unverified |
| Research coverage (not build readiness) | 9/10 scoped manual-first bundle; reviewer execution spike still required | 7/10 until restart/idempotency spike | 8/10 native overlap checked; bridge unverified |

RECOMMENDATION: A, beginning with **checkpoint cards and a Needs-you inbox**, then a **manual independent reviewer**. Choose B next only after run-state ownership and crash recovery are demonstrated. Smallest lower-cost starting point: checkpoints alone (1-3 dev-days estimate).

### Do not rebuild / dropped approaches

- Native diff annotation/batch send and browser element picker: already present in checked Paseo source. Review drafts persist and native feedback supports selected recipients; browser attachment formatter includes DOM/styles/source and optional screenshot capture. Do not duplicate; only investigate plugin bridging/tracked findings. [verified: ../paseo/packages/app/src/review/store.ts:1-23,47-68; review/feedback/surface.tsx:72-74,183; review/feedback/index.test.ts:121-171; desktop/browser/pane/index.electron.tsx:219-260,1057-1088]
- Issue/workspace external-tracker gap remains provisional: bounded app TSX search found attachment labels but no complete dedicated Linear/Jira drawer; plugins/external tools were not exhaustively audited. Branch-map candidate remains a view proposal, not proof host lacks equivalent Git facts.
- New terminal, editor, arbitrary splits, SSH transport, mobile companion and general computer use: these are platform capabilities, not good Morphise ports. Orca documents them; this inventory does not establish parity for every installed Paseo build. Extend host APIs only when a concrete missing behavior is verified. [verified: Orca README/docs; inferred: ownership recommendation]
- Themes, task board, Quick Chat, prompts, inline shell run, HTML/gen-UI: substantial overlap already exists in Morphise. Improve specific gaps rather than install a second implementation. [verified: OVERVIEW.md:5-9,31-49,55-80; current code owners above]
- Auto-update, reconnect/turn recovery, agent hibernation and account hot-swap: host/provider lifecycle ownership, not a CSS/plugin timer fix. [verified: bb 0.50 changelog documents host-scale mechanisms; inferred: appropriate ownership]
- File/diff restoration snapshots: Orca's page called “Worktree checkpoints” is a **free-text work-status field**, not filesystem rollback. Do not infer backup/restore from that name. [verified: Orca checkpoints page]
- Automatic memory rewriting and secret stores: attractive marketplace examples but a separate trust/data-retention project, not an early addition to this already broad plugin. [inferred from external credential/memory-write scope; not a claim of impossibility]

### Confidence and gaps

| Claim | Tag / strength / source tier | What would raise confidence |
| --- | --- | --- |
| Listed competitors advertise these interactions | Verified as documentation / moderate / primary vendor and author pages | Exercise released applications or inspect pinned feature source/tests |
| Existing Morphise overlap and named owners | Verified / strong / primary source | Runtime journey audit for completeness |
| Plugin-first feasibility | Inferred / moderate / API and code inspection | Per-feature API/permissions/restart prototype on installed host |
| Effort estimates | Unverified planning estimates / weak | Scope selected, dependency graph and acceptance tests |
| Cross-provider exact traces/permissions/account routing | Unverified / unsupported as universal promises | Provider-specific capability matrix and test fixtures |
| Advisor marketplace version | Conflicted: marketplace says BB>=0.40/SDK>=0.4.21; author README now says BB>=0.49/SDK>=0.6.132 | Pin selected source release and read its manifest before any port |

Important source limitations: Orca's orchestration docs mark it experimental and say its panel/switch is temporarily unavailable; listed as architecture inspiration, not mature feature parity. bb marketplace includes third-party plugins with their own dependencies/licenses, not core BB guarantees. Vendor screenshots, popularity counts and testimonials are not performance/correctness evidence. No downloaded code was run; no private/paid pages accessed.

### Sources

Official pages fetched 2026-11-24; most are rolling/unversioned. bb changelog explicitly covers v0.50.0 (2026-11-18). Local Morphise at 4fcb972 (v0.54.0 source); Paseo source 5afe6bd9a / plugin SDK0.16.0-beta.1. Public source heads recorded: Orca 55049f5745a7a6c1755e6d9c6641bb02f158fcc5 (manifest1.4.214), bb718e4e738bbb1eff83562715dbe14462012c6c0e (root manifest has no version), Advisor547738992f2868664618b4da4eaf93f0c8463649. Rolling docs can differ from those source revisions; pin chosen feature files before copying.

1. Orca overview: https://orca.dev/ and https://orca.dev/docs
2. Orca repository README: https://github.com/stablyai/orca (parallel worktrees, supported surfaces, MIT claim)
3. Bots: https://orca.dev/docs/bots (memory, needs-you, workers, schedules and computer-online requirement)
4. Orchestration: https://orca.dev/docs/cli/orchestration (Run/Task/Dispatch/gates; experimental limitation)
5. Review: https://orca.dev/docs/review/annotate-ai-diff (line ranges, batch send, persistence)
6. Checkpoints: https://orca.dev/docs/cli/worktree-checkpoints (free-text status snapshot)
7. Issues: https://orca.dev/docs/review/linear (issue-linked workspace launch and opt-in status sync)
8. Design: https://orca.dev/docs/browser/design-mode (DOM/styles/screenshot annotations)
9. Parallel candidates: https://orca.dev/docs/recipes/parallel-agents
10. Notifications/quotas: https://orca.dev/docs/notifications and https://orca.dev/docs/agents/usage-tracking
11. bb core: https://getbb.app/ and https://github.com/get-bb/bb
12. bb orchestration guide: https://getbb.app/guides/orchestrate-coding-agents
13. bb release notes: https://getbb.app/changelog#0-50-0 (distinguishes host lifecycle work from plugin surfaces)
14. Marketplace: https://getbb.app/marketplace (named candidate plugin discovery, not independent verification)
15. Advisor: https://getbb.app/marketplace/advisor and https://github.com/salemsayed/bb-plugin-advisor (persistent findings, unavailable-not-approved, permission caveat; version conflict above)
16. Traces/calendar: https://getbb.app/marketplace/agent-traces and https://getbb.app/marketplace/agent-calendar
17. Graphs: https://getbb.app/marketplace/agent-graph and https://getbb.app/marketplace/branch-graph
18. Heavy job queue: https://getbb.app/marketplace/drmanhattan (external daemon dependency)
19. Decision journal: https://getbb.app/marketplace/change-gate (explicitly an agreement, not a lock)
20. Acceptance testing: https://getbb.app/marketplace/try-it
21. bb license inspected: https://github.com/get-bb/bb/blob/main/LICENSE (MIT; third-party plugins require their own checks). Orca root LICENSE inspected at 55049f5745a7a6c1755e6d9c6641bb02f158fcc5: MIT, Copyright2026 Lovecast Inc.; individual file/asset provenance still required. No code copied here.

## Method

20-minute search budget; stopped after feature inventory and plugin/host boundary were sufficient to rank candidates, not after exhaustive product coverage. Minimum 5 credible sources with one primary; used more than five primary official/author pages, plus unlike evidence from local implementation/API contracts and public repository docs. No independent runtime evaluation or neutral third-party product review was performed, so advertised behavior remains vendor/author evidence, not independently established functionality. Corroboration within vendor README/docs does not count as independent testing.

| Known / unknown | Check |
| --- | --- |
| Existing Morphise features | OVERVIEW first, then Dispatch/Checks/Tasks/stats/reminder implementation |
| Public product feature claims | Homepage -> focused docs/guides -> source README/author docs; exclude testimonials as evidence |
| Plugin capability shape | Paseo client/contracts.ts and server/lifecycle.ts |
| Installed-host feasibility per new feature | Not tested; future scoped spike |

Searches: official navigation and marketplace categories (Tasks & Workflows, Code & Reviews, Memory, Notifications, Utilities); source identifiers addWorkspacePanel/addAgentPanel/addFilePanel/agent.turn.after; existing Dispatch/Checks/Tasks/Stats owners. No benchmark trials or costs measured. Framework/service behavior not proposed as commands to execute. License findings apply only to inspected repository licenses, not every asset/transitive dependency. “Port” means adapt the product idea through Paseo's SDK; BB/Orca code is not a drop-in plugin ABI match.

## Independent check

Independent: present as is after native-overlap must-verify fix and score-meaning note. Direct host source reads confirmed native diff-review batching and browser element annotations; affected rows demoted to reuse/integration, not new ports. Other unproven native gaps marked provisional. Completeness scores relabeled research coverage, not implementation readiness. Applied, not re-checked. No blocking or contested findings open. Rubric: question/method/sources/traceability/evidence/uncertainty/recommendation/reproducibility pass; codebase-fit and score-analysis findings fixed.
