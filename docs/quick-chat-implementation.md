# Quick Chat: independent Morphise implementation

- Date: 2026-11-21 21:25 IST
- Status: implemented and locally verified; packaged for v0.48.0, publication authorized by M
- Base: 0fb15660c758a65cca5624d8e6c8be203a060699; worktree morphise-quick-chat, branch quick-chat-independent
- Approval: M selected independent reimplementation named Quick Chat, then instructed “use your best judgement tofinish all” and “DONT STOP NOW ... FINISH ALL”. No publication or installation included.
- Original plan/research retained at /Users/monarchmaisuriya/Experiment/morphise-agents-toolbar/docs/2026-11-21-2050_quick-chat_plan.md and sibling research file.

## Delivered flow

```text
Enable Quick Chat -> choose provider/model -> create owned scratch workspace+agent
 -> open native Paseo chat -> Continue in project
 -> select existing open workspace -> review/edit bounded message snapshot
 -> revalidate source/target -> record attempt -> one create-with-context request
 -> open result or read-only recovery lookup (never resend)
```

Independent code uses Morphise's existing UI/model utilities and supported SDK. No reference-plugin code, tests, templates or assets copied; no dependency on or shared storage with it. README/OVERVIEW give inspiration credit to Shuvadipta Das (@5h0ov). Existing actual third-party notices remain, and NOTICE.md is explicitly included in package files.

## Scope decisions made under delegated judgment

- Explicit provider/model choice in Morphise, then native Paseo agent navigation. This avoids guessing which scratch-created agents are user chats: only the explicit creation path sets ownership metadata.
- Isolation is per workspace. Native tabs may share its folder; they are not automatically claimed/managed as Quick Chats. Helpers/internal/child agents remain excluded by classification.
- Original is always kept. No archive action, no file copy, no folder scan, no private provider-session mutation. Add another folder through Paseo first.
- Visible user/assistant messages only, quoted JSON. No reasoning, tool results, attachments or tool-call summaries in this first version. Incomplete history and truncation disclosed. Final envelope bounded to 40,000 UTF-16 code units with Unicode-safe message truncation. Read budgets: 20 pages, 200 entries/page, 2 MiB observed page total and 15-second wait deadline. One response can exceed byte budget; no claim of a streaming/memory hard cap on the provider response.
- Snapshot semantics, not atomic source lock: validate before and immediately before creation; concurrent changes after final check are not included. UI explicitly describes snapshot limitation. No automatic resend.
- Process-restart journal recovery with versioned records and atomic rename. Not power-loss durability; no fsync guarantee. Record minimal IDs, path/provider/fingerprint and stage, not transcript body. No expiry/cleanup deletes data automatically.
- Preview metadata expires after 10 minutes and is capped at 32 entries. Closing/restarting loses uncommitted preview, not source history. Interrupted attempted handoff can be checked by displayed recovery ID. If result cannot be confirmed, user inspects target; no replay.
- UI navigation requires current supported client navigation. SDK declarations and real isolated current Paseo host tested; not every historical host claiming >=0.16.0-beta.1 is runtime-certified. Unsupported host API errors remain visible, no private fallback or version bump silently made.

## Independent review and responses

Fresh reader inspected implementation without reference plugin source. Findings handled:

1. Blocking helper classification: valid. Removed directory-based creation hook; explicit workspace+agent creation marks user chat, and visibility excludes internal/parent-labelled agents. Shared negative tests cover helpers/children.
2. Blocking snapshot race: valid against earlier atomic-sounding plan. Final refresh added after target lookup/journal; UI/README and this contract explicitly define non-atomic reviewed-snapshot semantics. Test mutates source during awaited target discovery and proves no creation sent.
3. Must-verify host semantics: real isolated fake-provider Paseo daemon passed workspace+agent creation, metadata, background list, timeline, create-with-prompt and recovery. Browser fixture separately verifies native navigation invocation, not actual Electron rendering. Exact historical minimum remains a stated limit, not certified.
4. Must-verify journal: narrowed to process restart, version added, corruption fail-closed test. No machine-crash promise.
5. Must-verify prepare deadline: Promise.race bounds wait and clears timer. Underlying read has no supported cancellation and may finish after timeout, but cannot send context; no new cancel claim.
6. Note expired commit wording: completed/attempted state checked before expiry; absent preview advises recovery, never falsely says no send happened.

No final second reviewer pass claimed. All source/temp test harness failures were reported and corrected; no application failure hidden by a retry/default.

## Verification

- `npm run typecheck`: PASS after last source edits.
- `npm test`: PASS, 1299 passed / 24 skipped, 8.21 seconds. Full log: approved temp folder quick-chat-final-tests.log. Skips predate this feature; no new skipped Quick Chat test.
- `npm test -- server/quick-chat shared/quick-chat.test.ts client/attention.test.ts client/agents-board/data.test.ts`: PASS, 24 tests.
- `node <approved-temp>/quick-chat-ui.cjs`: PASS, enable/provider selection/start/native navigation invocation/preview/edit/confirm once/read-only recovery/360px overflow; synthetic host adapter, not live provider.
- `node <approved-temp>/quick-chat-host.mjs`: PASS_ISOLATED_HOST: native daemon background workspace+agent, metadata, inclusive list, timeline, create-with-context and process-instance recovery. Fresh temporary home, fake providers, no plugins/relay, stopped after test; running daemon unchanged.
- Mutation: allow reasoning/tool results into transcript -> tests KILLED. Remove only first stale check -> survived due final check (not a broken invariant). Remove both stale checks -> KILLED by two tests. Exact files restored before final green suite.
- `npm pack --dry-run --json`: PASS, package file list includes NOTICE.md; dry run, no artifact published.
- `git diff --check`: PASS.
- Desktop/mobile synthetic screenshot inspected; no full native-device test or accessibility certification claimed.

## Remaining delivery

M explicitly requested commit, push and release on 2026-11-21. Packaged as v0.48.0, published from the feature-branch commit; merge, registry update and installation are not included in this request. Worktree retained. Optional full fresh-reader final diff review can be requested separately. Exact historical minimum-version coverage remains unclaimed.
