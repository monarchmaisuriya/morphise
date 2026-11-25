# Quick Chat live non-idle count

- Status: done locally; approved by M "go ahead", "finish all"; full user-facing change, existing isolated worktree
- Goal: Quick Chat sidebar entry shows2when one owned chat runs and another needs attention; hide0. No release/install.
- Current: registerQuickChatClient registers static SidebarRow; useAgents gives live agent references, chatIndicator maps starting/running/permission/error/unread/done; owned Quick Chat metadata key already shared. [verified: client/quick-chat.tsx:219-240; shared/chat-status.ts:17-22; shared/quick-chat.ts:4,39-49]
- Decision: use SDK useAgents on entry's own host with pure matching predicate; metadata QuickChat true, workspace present, strict parentless, not internal/archived, chatIndicator !=done. Background-owned chats included. One agent counts once even when running+permission. No transcript read, new polling/RPC/storage/config. Use existing SidebarRow trailing text style, accessible label includes count;0hidden. Row click/selection unchanged. SDK excludes archived by contract; predicate also accepts archivedAt for raw fixture safety.
- Alternative counting via existing15spoll rejected as delayed and list contract lacks state. No schema change/dependency/auth/network addition. Same host filter prevents cross-host count. Reversible source, estimated one short pass; test mixed/zero/seen-error/subagent/archived/host mismatch, live UI update. Guardrail no changes to chat state. Local verification before handoff; full suite and browser runtime adapters.
- Files: shared/quick-chat.ts/test; client/quick-chat.tsx; client/quick-chat.browser.test.ts; README.
- [x] Predicate tests, live entry hook, browser count update, type/full checks and docs.
- Rollback source only on M request. No title data writes/Paseo changes/install.
## Independent check
No independent plan check run; bounded implementation directly verified by unit/browser integration. No final independent diff check; offered in handoff.
## Changes made
Implemented pure countedQuickChat predicate and host-scoped useAgents sidebar entry with positive trailing count. Unit mixed-state/starting/permission/error/seen-error/archived/subagent/nonowned/host cases pass. Enabled Quick Chat browser mounts real entry with SDK-boundary snapshots and verifies2for running+unread then hidden0. Typecheck/all4enabled browser/full suite/diff PASS. Full log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/quick-chat-state-count-tests.log. No release/install/Paseo source writes.

## List-row state steering

M requested live chat state in Quick Chat list rows. Added client/quick-chat-state.tsx scoped by host/id using useAgents/useAgent and shared chatIndicator/SidebarStatusMark. State label always shown independently of optional descriptions; archived explicit, missing unavailable. Browser verifies Running→Needs permission→Idle/Done. Final typecheck/all4enabled browsers/full suite/diff PASS; log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/quick-chat-state-display-tests.log. No release/install.
