# UI validation: completed checks and follow-up defects

- Date: 2026-11-19 15:31 IST
- Branch: ui-workflow-refinement; baseline a5c1f9e (Morphise 0.44.2).
- Scope: implementation verification and the diagnosis-only investigations requested by the UI plan. No production actions, commits or releases.
- Plan: /Users/monarchmaisuriya/Experiment/morphise/docs/2026-11-19-1355_plugin-ui-ux_plan.md.
- Current platform decision: new graphical color pickers are desktop/browser-web only; iOS/Android retain previous color controls. [decided: M, chat 2026-11-19]

## Outcome

Available automated checks pass. The two diagnosis investigations reproduced existing state-lifecycle problems; no fixes for them are included. Actual Paseo integration subsequently passed the changed task/layout/theme/color flows on an isolated fake-agent daemon using the installed Paseo web assets. Full runtime coverage of every unchanged feature is not claimed.

### Actual Paseo integration, completed before release

- Created a new temporary daemon home, set PASEO_HOME to that same home, disabled relay, used fake agent clients and an OS-assigned loopback port. Real daemon port 6767 was blocked in the browser. No real agent credentials/state were copied.
- Morphise loaded as a running directory plugin from this worktree. The browser used the isolated daemon's actual server ID.
- Passed: Workbench loading; task create/edit/description/due date/save; Tasks List control; Agents Board/List control; custom column color; custom theme/background picker; autosave and reload persistence. No uncaught page errors.
- The first color check read before asynchronous Apply completed; stored tasks already contained the right color. Replaced the premature read with a web-first value assertion and completion-state check; no application change required.
- Initial host attempt supplied the temporary home only through daemon config, allowing the plugin cache to use a default environment path and collide with an existing HTML port. Stopped only that test host, set PASEO_HOME explicitly, and reran with a fresh home. The corrected host's cache and state are isolated. No claim that the initial attempt was fully isolated.
- Browser script: /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/morphise-host-browser.cjs. Output: morphise-host-results.log. Real UI screenshots: real-host-tasks-list.png, real-host-board-colors.png, real-host-theme-colors.png in morphise-ui-evidence under the same temporary root.

## Verification evidence

| Check | Result | Limits |
| --- | --- | --- |
| `npm run typecheck` | PASS, exit 0 | Static types, not runtime correctness |
| `npm test` | PASS, 1284 passed, 11 skipped | Existing skips remain unverified |
| `git diff --check` | PASS, exit 0 | Whitespace only |
| Rendered task/color fixture | PASS | Actual Morphise components, React Native Web, controlled Paseo boundary adapters, in-memory data; no daemon |
| Bookmark confirmation fixture | PASS | Actual BookmarkCard, controlled removal callback, no retained-page backend operation |
| Five deliberate mutation probes | All detected, files restored byte-for-byte | Targeted test strength, not universal coverage |

Commands and raw evidence:

- Full-suite log: /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/morphise-final-tests.log.
- `RUN_CHECKS=1 OUTPUT_DIR=/private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/morphise-ui-evidence node /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/morphise-ui-fixture.cjs`: PASS for preview/cancel/alpha/apply-once/invalid colors; task label search/date/link validation/dismissal/save; delayed-save lock/failure/retry; 360px overflow; no uncaught page errors.
- `node /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/morphise-diagnosis.cjs`: reproduced findings below and passed bookmark Cancel (zero calls), pending lock, error retention and manual retry. Results: morphise-diagnosis-results.log in the same temporary directory.
- `node /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/morphise-mutation-check.cjs`: five deliberate defects failed assertions, followed by byte-identical restoration and clean typecheck/full-suite run. Cases: duplicate Apply, invalid task URL, incorrect column reset, incorrect concurrent label color, inverted native exclusion. Logs: mutation-*.log in the same directory.
- Wide/narrow screenshots inspected: task-editor-wide.png, task-editor-narrow.png, color-picker-narrow.png in morphise-ui-evidence. They visibly include fixture host/icon adapters; they are not Paseo screenshots.

## Diagnosis: previous-context readings

**Confidence: high for component behavior; actual host visibility not measured.**

**Symptom:** Activity or Stats can expose the previous selection's result while waiting for a new request. [verified: rendered diagnosis fixture, twice through A→B and B→A]

**Mechanism:**

```text
Selection A resolves → local result A
Selection becomes B → effect requests B
Local result still A, returned without identity check  <-- fails here
B resolves → local result B
```

- Activity's state contains status/summary/stale but not provider/workspace request identity. Changing dependencies starts a new effect without invalidating already-retained state. [verified: client/activity/view.tsx:27-60]
- Stats holds one result; changing agentId retains it until resolution; null agentId returns early from the effect without clearing the result. [verified: client/stats/session-stats.tsx:33-51]
- Effect cleanup does prevent obsolete in-flight completions; this is a different issue from a late response winning. [verified: same source, alive checks]
- Fixture output on A→B: provider B with summary marker A; stats ID B with reason A. On B→A the inverse occurs. Null stats ID retained reason B. [verified: morphise-diagnosis-results.log]

**Broken invariant:** a reading exposed for a selected context must belong to that context or be explicitly labeled as previous data.

**Owning layer:** the two data hooks, not individual tiles or number labels. A likely correction is result identity tied to request context, retaining stale data only on refresh of that same context. This is a proposed follow-up, not an implemented fix.

| Hypothesis | Prediction | Result |
| --- | --- | --- |
| Retained state lacks context identity | Previous result remains before B resolves | confirmed by controlled unresolved B request |
| Old request completes after selection | Need late A completion to reproduce | ruled out as necessary: A completed before selection changed |

**Next:** M approves a focused amendment and regression test for identity transitions, same-context refresh, failed new context, null ID and reordered completions. Do not patch individual display cards.

## Diagnosis: unsent reply and Dispatch text

**Confidence: high for keyed switch/remount behavior; Dispatch actual route-remount behavior remains unverified.**

- Reply's text is local state and resets on agent.id changes. The real details component is keyed by current.id. [verified: client/agents-board/details.tsx:65-87; client/agents-board/board.tsx:590-617]
- The fixture typed an unsent reply for A, switched A→B→A using that keyed structure and observed an empty reply. No Send was invoked. [verified: diagnosis fixture]
- Dispatch rows are local component state. The fixture typed a prompt, unmounted/remounted Dispatch and observed an empty prompt. This proves loss on remount, not that every real Paseo route change remounts it. [verified: client/dispatch.tsx:113-125; diagnosis fixture]
- Zero sends/workspace creations occurred. [verified: fixture side-effect count]

**Root cause:** unsent text ownership is limited to a disposable view while the desired retention may extend beyond that view. Keeping a component mounted invisibly would hide this lifecycle mismatch rather than define a draft owner.

| Hypothesis | Prediction | Result |
| Disposable local draft ownership | State disappears on keyed replacement/remount | confirmed |
| Server clears text or submission succeeds | A send/request must occur | ruled out: zero side effects |

**Next:** before any fix, confirm retention lifetime and scope with M: current client session versus reload persistence; host/agent keying; explicit discard; behavior after a successful send; maximum retained drafts and teardown. Preserve Dispatch execution state separately so restoring text cannot restart work. No new durable text storage is authorized by this finding.

## Feature-preservation inspection

Source inspection confirms no persisted schemas, package dependencies, server registrations, screen IDs, slash commands or command execution paths were removed. Existing column/label/decoration presets remain; native color UI is routed to its old input/preset paths. Existing task properties and actions remain in CardEditor, and local layout switches reuse device settings. [verified: current worktree diff; client/decor-picker.tsx; client/forms/color-field.tsx; client/board/customise.tsx; client/workbench.tsx; shared/task-ops.ts]

This is not a whole-plugin runtime parity certification. Changed task and settings controls were exercised in the actual host. Page-bookmark retention, all keyboard/focus permutations and every unchanged feature were not exhaustively exercised.

## Remaining limits

- The plugin was loaded and settings mutated only on the temporary fake-agent host. Production remains read-only.
- No native-device test is claimed. New graphical pickers are excluded from native, but other UI changes are cross-platform and were not verified natively.
- Some tests were green on first run; five highest-risk paths now have killed mutation evidence, but not every new assertion was mutation-tested.
- Temporary scripts use local absolute dependencies and are not a portable checked-in browser harness. Keep them as local evidence; production code has no sibling dependency.
- No fresh-reader code review has run. It remains available on M's approval.
- Fixture browser/server resources close in finally. No intentional persistent test service remains.
