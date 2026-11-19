# Task property pickers: missing dismissal ownership

- Date: 2026-11-19 16:10 IST
- Status: fixed and tested locally and on isolated Paseo host; packaged for v0.45.1
- Approval: M confirmed diagnosis, similar-issue scope and fast-forward with “yes finish all,” chat 2026-11-19.

## Root cause

The existing-task reminder was an inline panel, not the shared Dropdown. CardEditor replaced its trigger while open and supplied only onDone, omitting ReminderPicker's existing onCancel. No owner registered an outside-press boundary. The panel therefore had no dismissal path other than selecting a time or leaving the task editor. [verified: pre-fix client/board/card-editor.tsx:274-287 at 2b1f742; client/reminder-picker.tsx:125-133]

Sibling labels, due-date and new-task reminder controls had separate open booleans and no outside dismissal. Invalid date/time conditions also forced panels visible independently of open state, so merely changing a boolean could not close them. [verified: pre-fix CardEditor state/render conditions]

## Reproduction and alternatives

Before editing, an isolated rendered regression fixture opened an existing task's reminder, typed a note and clicked two separate outside headings. The note input remained both times, there was no close button, the parent dialog remained and write count was zero.

| Theory | Prediction | Evidence / disposition |
| --- | --- | --- |
| Missing inline panel dismissal ownership | Panel remains regardless of outside clicks, no close control | confirmed, twice in fixture and in source |
| Shared Dropdown backdrop intercepts clicks | Reminder is rendered through Dropdown | ruled out: direct inline View/ReminderPicker, not Dropdown |

## Structural change

- CardEditor owns one open property ID, so opening another panel replaces the previous one.
- New Dismissible boundary contains both trigger and inline panel, subscribing to the existing onPressOutside mechanism only while open; cleanup removes its listener. Presses inside do not dismiss.
- Existing reminder trigger remains visible/toggleable and supplies onCancel. Due date and new reminder have explicit close controls; labels retains its toggle close.
- Invalid input no longer forces a closed panel open. Its draft and inline error remain, and Save remains invalid until corrected.
- No schema, reminder operation, persistence or global Dropdown behavior changed. No document-level handler was added to ReminderPicker itself, because host popovers already own their dismissal.

Recurrence test: no for the diagnosed task-inline-panel cause, within the tested web interactions. Native outside-press handling is not claimed: onPressOutside intentionally no-ops on native, with explicit close controls available. This task did not change native color-picker scope.

## Verification

- Pre-fix reproduction: outside headings twice leave panel open; zero writes.
- Post-fix rendered fixture: reminder outside/inside/explicit close; reminder→due switch; invalid due dismissal; label search/outside dismissal; parent remains; zero writes.
- New-task fixture: invalid reminder closes outside and explicitly, preserves draft, zero writes.
- Actual Paseo web UI with fake-agent daemon, fresh PASEO_HOME and blocked port 6767: same dismissal cases pass; choosing a 15-minute reminder saves and closes only panel. No uncaught page errors.
- `npm test -- client/ui/dismissible.test.ts`: PASS, 1 test; outside boundary and listener cleanup.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 1285 passed, 11 existing skips, 8.18 seconds.
- `git diff --check`: PASS.

Local proving scripts in approved temporary directory: morphise-dismissal-repro.cjs, morphise-new-reminder-dismissal.cjs, morphise-dismissal-host.cjs. Full-suite log: morphise-dismissal-tests.log. Screenshot: morphise-ui-evidence/reminder-dismissal-real-host.png. Temporary host PID 15057 stopped after verification. Production unchanged.

## Prevention and limits

Any new inline picker must declare its trigger/content boundary, close callback and open-state owner. Test outside clicks without an operation and inside clicks without dismissal. Host popovers and shared Dropdown already have independent dismissal owners and should not gain duplicate handlers.

Full keyboard/Escape overlay behavior remains host-owned; this change promises outside web clicks and explicit controls, not a new Escape routing policy. Delivery follows M's requested commit/push/merge/release workflow; the open registry update proposal is updated to the patch release. No production install is included.
