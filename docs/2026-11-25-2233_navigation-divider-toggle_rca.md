# Navigation divider and reversible styling

## Outcome

M reported that the line below Schedules and above the Search toolbar remained after v0.65.0, then requested a fix and a single Settings toggle for borders plus divider removal. Source: conversation, 2026-11-25. M subsequently requested commit, merge, release and registry delivery.

## Mechanism and root cause

The navigation installer removed the host group's bottom border, but Morphise's window stylesheet independently painted an inset line using a background gradient. The earlier browser fixture modeled only the host border, so it could not detect the remaining painted line. [verified: client/polish/web/sidebar-navigation.ts; client/polish/web/window.ts:177-180]

The window stylesheet now excludes navigation groups marked as having the outlined treatment. Its footer rule remains unchanged. This corrects the divider producer rather than overriding its output with a stronger selector. Removing the treatment tag restores the original window rule automatically.

## Settings and rollback

Look > Sidebar navigation > Outline navigation and remove divider controls both effects. The optional profile boolean defaults on to preserve v0.65.0 behavior. False removes owned stylesheet/tags; live preference subscription reinstalls them when enabled. Unload unsubscribes and removes owned styling. Native clients and unsupported group layouts remain unchanged. [verified: shared/polish/prefs.ts; client/forms/polish-tabs.tsx; client/polish/web/sidebar-navigation.ts]

## Verification and detection gap

- Real window CSS is loaded after navigation CSS in the browser fixture. Checks cover navigation gradient removal, unchanged footer gradient, toggle-off restoration, toggle-on reapplication, dynamic rows, safe refusal and unload.
- The first real-stylesheet run failed with `Footer divider must remain`, actual `none`. Fixture lacked `--colors-surface-sidebar`, required by the real gradient. Adding that theme value made the unchanged assertions pass.
- Preference tests cover default, explicit false surviving profile parsing, and explicit true.
- Typecheck passed; five enabled browser suites passed; full suite: 1,408 passed / 29 skipped; diff whitespace check passed.
- Log: /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/navigation-divider-toggle-release-tests.log
- Limits: browser fixture, not installed-host or full accessibility certification. No failing-before-fix run against the old painted-divider producer was captured; no such claim is made.

## Prevention and follow-up

Owner: implementation author. Keep the real shared window stylesheet in this regression so independent divider producers cannot be omitted from the fixture again. Recurrence test: the previous gradient rule would violate the explicit enabled-state `backgroundImage === none` assertion.

Local installation writes remain excluded by the standing production-read-only rule until M explicitly overrides it. No Paseo source edits.
