# Sidebar rings disappear after profile loading

- Date: 2026-11-24 19:31 IST
- Affected source release: v0.53.0

## Bottom line

The first implementation styled native Paseo status slots but did not change Morphise's replacement sidebar. Its own StatusMark still drew a pulsing 7px dot. Source-backed rendering reproduced this twice. Native-first/replacement-later timing is consistent with the report but was not directly observed in the installed application. [verified: client/sections.tsx:175-188; old client/sidebar-view.tsx StatusMark; local source-backed probes]

## Impact and trigger

Users with Morphise's replacement sidebar active did not get the configured ring after that view mounted. Existing settings previews and native-host fixture remained green because they did not render the actual replacement component. No agent state, execution, title or stored chat data was altered.

M reported a brief ring on reload followed by dots, then requested removing Chat row marks and sharing state colors/speeds on smaller, slightly dimmer nested rows.

## Structural fix

`client/sidebar-status-mark.tsx` owns the replacement visual and subscribes to real profile preferences through usePrefs. `client/sidebar-view.tsx` StatusMark delegates to it at all existing main/chat/subagent call sites. The generated CSS recognizes both native slots and replacement markers. No timing retries or DOM repair observer is introduced.

Main marks remain 14px/full opacity; nested marks scale the same 14px visual to 12px and use 0.8 wrapper opacity. All state colors and speeds remain shared. Ring mode has no pulse or parent-descendant suppression. Reduced-motion targets both paths. Host-default choice restores original native rendering; Morphise default is a plain dot. Native mobile fallback remains static dot, explicitly not claimed as ring support.

The old Chat row marks UI/hook/renderer branch is removed. Its device schema remains readable; no stored value migration or deletion.

## Verification and prevention

- Real StatusMark browser regression failed on released renderer with “Replacement sidebar must use the configured status renderer: 0 !== 1”.
- Fixed browser imports actual StatusMark from sidebar-view.tsx, verifies all five agent states at main/nested depths, shared color/speed, exact 14/12 size and 1/0.8 opacity.
- Checks settings unmount, late preference hydration, profile style toggle and reduced-motion for both depths. Existing native-slot/settings persistence/reset checks remain.
- Typecheck, full suite and separately enabled browser pass; final counts recorded in delivery.

Recurrence test: no for the missing replacement-renderer cause. Future sidebar consumers must use the shared component/stylesheet contract. Installed-host pixel certification remains separate from real-component fixture evidence.

## Follow-up ownership

- Source maintainer: preserve actual consumer coverage when sidebar registration/rendering changes.
- M: installation/adoption after release; running installation remains read-only for this task.

## In plain terms

There were two sidebar renderers, and only one was changed. Both now honor the same indicator settings. Nested chats and subagents use a smaller, slightly dimmer version rather than a separate mark style.
