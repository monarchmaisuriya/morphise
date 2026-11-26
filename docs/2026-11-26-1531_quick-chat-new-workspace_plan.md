# Create a project workspace from Quick Chat

- Date: 2026-11-26 15:31
- Status: implementation verified locally; full because workspace creation and durable recovery change.
- Repo: morphise, existing isolated sidebar-information-tabs checkout. Preserve node_modules symlink. No Paseo edits, commits, releases or normal installation writes in this implementation.

## Context and goals

M wants a new workspace within a registered project when handing off a Quick Chat, without requiring an existing destination. M selected both modes: default isolated Git worktree for Git projects, or explicitly shared project folder. Keep original chat/files, context review and readiness safeguards. Success: one confirmed new workspace+agent with reviewed text per operation; guardrail zero creation calls during preparation and zero automatic replays on uncertain results. Validate before handoff on 2026-11-26.

## Current state and evidence

Existing handoff reads eligible open workspace pages, prepares bounded history into a ten-minute memory preview, journals identity before agent creation, then recovers by preallocated agent identity. [verified: server/quick-chat/service.ts:105-191]
Targets RPC has optional source readiness; client searches project/workspace fields and exposes refresh/open-source actions. [verified: shared/quick-chat.ts:38-52; client/quick-chat.tsx:196-215]
Paseo projects.list returns projects with projectId, projectDisplayName, projectRootPath and projectKind. Workspace create accepts explicit wks_16hex ID, idempotency key, source directory or worktree and embedded initial agent. [verified: Paseo packages/client/src/index.ts:216-234,837-856; protocol/src/messages.ts:2963-3007,4648-4662; official https://paseo.sh/docs/sdk/workspaces.md, page version unspecified]

## Options and decision

| Aspect | Combined workspace/agent creation | Separate workspace then agent |
| --- | --- | --- |
| Behavior | One native create request after review | Two writes and intermediate empty workspace |
| Fits | Existing Quick Chat start already uses combined create | Existing destination path creates agent only |
| Cost/risk | One journal extension; recover by allocated identities | More partial states and rollback decisions |
| Failure | Native failure can leave partial resources; recovery reads only | Workspace can succeed while agent fails |
| Completeness | 9/10 with partial-state warning | 6/10 without extra saga |

Use combined create, no automatic deletion/replay. M decided both modes; default worktree for Git, directory otherwise. Base ref defaults HEAD, explicitly shown/editable. Stable generated branch quick-chat/<preview UUID>; show in review. No automatic fetch/checkout of normal project folder. Revalidate project identity/root/kind before creation. Reject worktree for non-Git projects. Projects without open workspaces must appear via projects.list, not deduced from existing destinations. Unknown/newer client fields remain optional for existing handoffs.

## Cost and scope

Estimate 1-2 hours (unverified), bounded implementation and tests. Files shared/quick-chat.ts, client/quick-chat.tsx, server/quick-chat/{register,service}.ts, their tests, README and this plan. No dependency/framework rewrite. Biggest risk uncertain combined creation; preserve original chat and never blindly resend. Defer release/normal install. Undo local source or use existing destination mode; never auto-delete created workspaces/worktrees.

## Design

- Add optional projects array to targets output (registry-derived id/name/root/kind), maintain existing workspace targets. New prepare destination uses existing workspaceId OR typed newWorkspace {projectId,mode,baseRef?}, reject both/neither. RPC fields additive for old request compatibility.
- Preparation resolves project from registry, validates mode, allocates workspace ID/agent ID/operation UUID, reads same bounded history, and returns newWorkspace review metadata with exact project root, mode, base ref and branch. Worktree directory is explicitly pending native allocation, never mislabeled as known.
- Persist optional newWorkspace identity on operation record, validate it when reading durable journal. Existing version1 operations still load. Before create re-list project, compare root/kind and source fingerprint, save creating journal, recheck source. Combined create uses explicit background:false, selected projectId/root, idempotency key, explicit initial agent ID and operation/source metadata. Workspace and first agent carry operation identity. Reject mismatched returned IDs.
- Recovery stays read-only, uses preallocated workspace/agent IDs, checks ownership metadata and project identity. If workspace exists but no agent, report possible partial workspace and identity, no replay/delete. Existing completed journal recovery unchanged. Lost response after actual combined success resolves on refresh, including after process restart.
- UI: registered-project cards above existing destinations; project selection opens mode and base-ref controls, Prepare new workspace context (no writes), Review clearly distinguishes shared files vs worktree/branch, then explicit Create workspace with this context. Project search uses existing normalizer. Existing workspace choice stays intact. Hide new mode if old host omits project list. Disabled/readiness/busy/generation protections retained. Use existing theme fields, focusable buttons/selects, compact wrapping; no new DOM styling.
- Safety: no arbitrary project path accepted from client, registry resolves IDs; no source safety bypass; no new outbound calls or credentials; only reviewed text transmitted on final confirm. Invalid IDs/modes/base empty/oversize rejected. Project deletion/root change aborts. Concurrent same operation rejected. Expired unused preview makes no writes; retry after uncertain attempt is recovery only. Workspace setup hooks follow native behavior and may run in temporary tests only.
- Quality targets: existing handoff/service/browser suite unchanged; new typed paths and recovery tests; unit tests check schema compatibility/ambiguous inputs. Accessibility target AA on changed controls, no full certification; native React Native components, existing UI primitives. Design refs: orchestrator references/design/ADAPTATIONS.md and craft-floor.md previously read in session. Reliability service targets/metrics/experiments n/a for local feature; observe operation result/recovery identity, not silent fallback. Missing access: isolated daemon test needs synthetic project and fake provider, never real model turn.

## Risks and mitigation

| Risk | Mitigation and detection |
| --- | --- |
| Duplicate after response loss | Allocated IDs, native key, journal before request; recovery only |
| Project root changes | Compare fresh registry before confirm |
| Unsafe source changes | Existing source checks/fingerprint before native create |
| Partial workspace without agent | Exact read-only warning, keep IDs, no deletion/replay |
| Unknown SDK behavior | Typecheck installed SDK and isolated synthetic daemon proof before claiming support |

## Acceptance and parts

- [x] Schema/project discovery: projects even with zero workspaces, unknown ID/both destinations rejected, old existing requests valid.
- [x] Service: preparation makes zero creates; both modes use combined request with stable workspace/agent/key/project IDs; nonGit worktree fails; stale source/project fails; uncertain success recovers across restart without replay; partial workspace gives exact warning.
- [x] UI: find project, choose mode/base, review explicit planned directory/branch/shared warning, confirm once, result/recovery flows; canceled preparation creates nothing.
- [x] Verify typecheck/service/shared/browser/full suite and isolated fake-provider daemon where available; document exact gaps. No production writes.

## Rollout and rollback

Source-only, no flag. New capability advertised by projects output. Existing handoffs remain available. Any failing safety test blocks finish. Old journal remains readable; new optional journal fields must never be treated as existing destination on corrupt input. Roll back source only after unfinished new operations reconciled; keep original chat and journal.

## Independent check

Independent plan check: one must-verify (installed SDK/native caller-selected IDs) settled by packaged-daemon proof, one note (negative recovery identities) addressed in service tests. Source test helpers could not load TTLCache; packaged daemon0.17.4 with a synthetic provider used instead. Installed SDK legacy creation rejects explicit IDs before side effects (node_modules/@getpaseo/client/dist/creation/index.js:14-15). No independent final-diff review yet.

## Changes made

Implemented project listing, both modes, reviewed creation, additive contracts and read-only recovery. Typecheck, all five enabled browser suites, full suite1,418passed/29skipped and diff check pass. Full log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/quick-chat-workspace-creation-tests.log.

Packaged native proof: /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/packaged-handoff-proof.mts, bundled with installed esbuild. Output /Users/monarchmaisuriya/.local/share/opencode/shell/ceba80e567d2f298bdb40b03d4b3ab8bfbfb0664/sh_21768e694001cJS7n84duzZMNb.out records PASS_NATIVE directory and worktree with exact IDs/cwd. Asserted both metadata records, project identity and fresh-service recovery. Native proof did not restart daemon or inject response loss; service tests cover simulated lost response and restart via fresh service. Synthetic provider only, no real model turn; native builtins may perform normal provider discovery. Daemon PID96304 stopped explicitly by isolated home, worker exited0. Test resources retained in temporary paths, no normal-daemon writes. Harness failures (TTLCache, cleanup return, module import) were corrected/routed explicitly; no source SDK modifications. No failing-first run for every behavior claimed. No installed-client full visual/accessibility certification.

## Open questions

None in agreed direction. If native worktree/combined contract cannot be verified, stop rather than approximate it.

## Fresh-reader final diff review

Completed independent review: no blocking defect. Initial concern that workspace-only success could omit the agent was disproved by native creation service completion and installed SDK error handling. One must-verify shared-folder UI journey addressed with Git shared-mode and non-Git browser cases, asserting mode, absent base control, warning, preparation zero creates and one explicit confirmation. Note about project-kind snapshot fixed by carrying projectKind in preview/journal and comparing root/kind before creation. Applied, not independently re-reviewed. Final verification after these edits: typecheck,26shared/service tests,all five enabled browser suites,full suite1,418passed/29skipped,diff check pass. Log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/quick-chat-workspace-final-tests.log. No commit/release/install.
