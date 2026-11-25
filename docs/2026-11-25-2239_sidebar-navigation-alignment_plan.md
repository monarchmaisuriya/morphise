# Upper navigation alignment and divider diagnosis

- Date: 2026-11-25 22:39
- Status: source implementation verified; installed acceptance pending; full, because this changes a saved profile setting and visible navigation
- Repos: morphise. No Paseo source or installed-plugin writes.
- Files: shared/polish/prefs.ts, shared/polish/prefs.test.ts, client/forms/polish-tabs.tsx, client/polish/web/sidebar-navigation.ts, client/sidebar-navigation.browser.test.ts, README.md
- Subagents: independent plan check only

## Context and problem

M wants to position each upper sidebar navigation icon and label together: Left, Center or Right, with Left as default and trailing counts/actions fixed. M chose option B (icon and label together) in chat and said continue. The separate divider below Schedules still appears in M's installed v0.66.0 screenshot. Prior fixture success did not prove the installed layout. No further divider fix is authorized by inference alone.

## Goals / Non-goals

- Add Empty / Filled appearance in the same settings section. Empty remains default (transparent at rest); Filled uses existing theme surface fill at rest, preserving visible hover/focus/selected feedback. This preference follows the combined treatment switch, like alignment. [decided: M requested filled/empty, chat; proposed: defaults and theme mapping]
- Divider repair remains required for completion of the overall request. Do not call this task done after alignment/appearance only. If installed evidence is unavailable, report the whole task as partially complete with divider repair blocked.
- Three alignment choices in Look > Sidebar navigation; persist per profile, apply to built-in and plugin upper rows, restore original layout on disabling the existing treatment or unloading.
- Success: all three choices position the icon-label pair inside the main button's available width in a browser test, including after a preference update and dynamic insertion.
- Guardrail: zero movement of trailing controls between alignment choices at the same viewport width; preserve activation and row heights. Test narrow and ordinary sidebar widths.
- Check date: before handoff in this task; installed-host acceptance remains explicitly unverified until measured.
- Non-goals: no release/commit/install, no native clients, no text-only alignment, no per-row choices, no redesign, no speculative divider selector. Divider diagnosis is retained but not declared fixed.

## What is true today

- The profile has optional sidebarNavigation boolean, exposed as on unless false. [verified: shared/polish/prefs.ts:42-45,193]
- The Look form has the combined border/divider switch. It uses polishEditor to update profile keys and removes default/undefined values. [verified: client/forms/polish-tabs.tsx:21-40,201-203]
- installSidebarNavigation subscribes to preferences, discovers groups from at least two built-in anchors, tags row frames, and removes owned styling on disabling/unloading. It is installed outside theme-restyle gating. [verified: client/polish/web/sidebar-navigation.ts:20-59; client/polish/web.register.ts:83-85]
- A main Pressable contains icon and label, with a separate trailing Pressable sibling. Main button is a flex row, label shrinks, and trailing has its own spacing. [verified: /Users/monarchmaisuriya/Experiment/paseo/packages/app/src/components/sidebar/sidebar-header-row.tsx:76-110,156-184]
- The known window gradient producer excludes outlined groups. This did not establish the source of M's remaining visible divider. [verified: client/polish/web/window.ts:177-180; M's post-v0.66.0 screenshot in chat]
- Assumption: installed main button descendants match inspected source. Nothing found that proves installed DOM geometry; browser assertions can prove only the modeled structure. Do not claim installed-host certification.

## Options considered

| Aspect | Main button alignment (recommended) | Replace rows with custom markup |
| --- | --- | --- |
| How | Align contents of verified main button; leave trailing sibling alone | Recreate upper navigation |
| Fits | Existing row already owns icon/label and handlers | Would duplicate host rendering |
| Gives up | Center is within available main-button area, excluding trailing slot | Risks host shortcuts and accessibility |
| Cost/risk | Small scoped CSS/preference change; host-structure sensitivity | Larger unsupported integration |
| Failure | Unsupported markup must remain unchanged | Navigation behavior diverges |
| Evidence | sidebar-header-row.tsx:76-110,156-184 | Same source shows behavior to duplicate |
| Completeness | 9/10 within declared desktop/web scope | 3/10 without rebuilding host behavior |

RECOMMENDATION: align existing main button contents because it preserves native handlers and trailing controls.

## Decision

- Left / Center / Right, icon and label together, Left default; trailing counts/actions fixed. [decided: M, chat, current task]
- Alignment is subordinate to the existing combined treatment switch, so off restores all original styling; saved selection retained while off. [proposed: agent]
- Use one optional enum sidebarNavigationAlignment in chat.polish, values left/center/right. Omit left when saved, expose left as default. [proposed: agent]
- Keep divider diagnosis separate. Before any additional fix, obtain actual boundary DOM/computed styles and reproduce the responsible drawing mechanism locally. No guessed ancestor or broad separator hiding. [proposed: agent]

## Cost and scope

One focused implementation pass plus browser and full-suite verification, estimated 30-45 minutes (unverified estimate, not a promise). Prior navigation work required a correction because its fixture omitted the gradient producer; therefore installed behavior is not inferred from fixtures. If evidence gathering exceeds the budget, stop divider work with the exact missing observation; do not reduce alignment coverage. Blast radius: profile parsing, Look form and upper desktop/web navigation only. Undo by setting Left or disabling treatment; code changes are reversible without data migration.

## Design

1. Safe defaults: optional enum; absent, null, empty, numeric, or invalid input resolves to Left via existing tolerant profile boundary. No arbitrary value is inserted into CSS.
2. Contract: compatible additive profile field; no migration or RPC change. Existing catchall preserves unknown JSON keys for older versions. [verified: shared/polish/prefs.ts:34-41]
3. Quality: after live preference update, three alignments produce expected icon-label placement, unchanged trailing x-coordinate and unchanged row height; no reload, no new observer or dependency.
4. Reliability: no new service. Preserve existing profile persistence/recovery behavior. Failed verification blocks handoff. No new reliability percentage is asserted for a local styling change.
5. Threat model: enum is validated at existing profile boundary; no new network, secrets, permissions, executable input or trust boundary. DOM mutations stay limited to owned attributes/styles.
6. Views: settings -> validated profile enum -> existing preference subscription -> scoped upper-row styling. Only existing components change.
7. Operational checks: visible selected choice and measured icon/label/trailing bounds. One changed trailing-control coordinate or unrelated row styling blocks delivery; M observes actual installation separately.
8. Accessibility: reuse SelectField's established label/selection and keyboard behavior. Preserve tab order, accessible names and press areas. Empty uses transparent rest and surface-sidebar-hover interaction fill; Filled uses surface-sidebar-hover at rest and a 12% foreground theme mix for interactions. Selection gets an inset mark; keyboard focus gets a foreground outline. Preserve distinguishable feedback, not identical colors. Target WCAG 2.2 AA for changed control only; no full certification claim. Design sources: references/design/ADAPTATIONS.md and references/design/impeccable/reference/craft-floor.md.
9. Experiments: no A/B experiment.
10. Missing: actual installed divider element/computed styles, supplied by M's DevTools output or an authorized read-only inspection route. Not needed to implement alignment; required before another divider fix.
11. Edge cases: narrow width and long labels shrink within main button, never overwrite trailing slot; missing counts and dynamic plugin rows covered. Empty navigation preserves safe refusal. Repeated selection is idempotent. No timeout/retry/concurrent service introduced; last profile state drives existing synchronous subscriber.
12. Scenarios: Search, New workspace, Quick Chat with count, Workbench selected, Schedules, dynamically inserted plugin row, treatment disabled, unload.
13. Margins: no new capacity/time limits. Test at 240px and 320px sidebar widths.
14. Growth: no generic layout framework. Add per-row customization only on a future explicit request.

The existing tag map stores one attribute per element. Do not add a second attribute to the same tracked row/group without updating reconciliation and cleanup to own both. Preferred: put alignment value in a CSS custom property scoped to the marked group and update/remove it through explicit ownership, or encode the alignment in the existing group attribute and teach mark to update changed values. Choose the latter: group tag value left/center/right; existing presence selectors remain valid; reconciliation desired entries carry attribute plus value, mark updates values only when changed. Row/separator tags retain empty values. No extra DOM nodes or inline host-style overwrites.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation / detection |
| --- | --- | --- | --- |
| Installed markup differs | Known uncertainty | Alignment may not apply | Restrict to recognized main button; fixture mirrors source; installed claim withheld |
| Broad selector moves trailing | Plausible | Count/action shifts | Direct child main-button selector; assert trailing bounds |
| Updated enum leaves stale tag | Plausible | Wrong alignment after change | Reconcile attribute value, test left-center-right-left and toggle |
| Guessing divider repeats failure | Already occurred | Another false fix claim | Require actual DOM/computed evidence, block divider implementation |

## Acceptance criteria

- Given Empty selected, navigation buttons are transparent at rest; given Filled, they use theme fill. Hover, focus and selection remain distinguishable. Changing alignment does not reset appearance and changing appearance does not reset alignment. Both selections survive off/on of the treatment.
- Given unset/invalid enum, parsing exposes Left; explicit Center/Right survives schema roundtrip.
- Given treatment enabled, changing Left/Center/Right moves both icon and label within main button, preserving their gap and trailing geometry.
- Given treatment off, any stored alignment applies no owned layout styles; enabling restores selection.
- Given dynamic rows, recognized new rows inherit alignment; unload removes owned attributes/stylesheet.
- Given narrow width and long label, trailing controls remain reachable, no row-height change attributable to alignment.
- Given divider investigation lacks live evidence, report unresolved; do not mark divider fixed from fixture alone.

## Rollout and rollback

Local source only after approval. Test preference unit coverage, navigation browser fixture, all enabled browser suites, typecheck/full suite/diff. Any regression blocks handoff. Default Left preserves prior layout. Disable treatment or return to Left for rollback; no stored-data rewrite or installation write. Release only on a separate request.

## Parts

| File | Operation | Purpose |
| --- | --- | --- |
| shared/polish/prefs.ts | change | Validated optional enum and resolved default |
| shared/polish/prefs.test.ts | change | Parsing/default/roundtrip tests |
| client/forms/polish-tabs.tsx | change | Alignment SelectField under navigation settings |
| client/polish/web/sidebar-navigation.ts | change | Value-aware group tags and scoped main-button alignment |
| client/sidebar-navigation.browser.test.ts | change | Realistic icon/label/trailing geometry and lifecycle tests |
| README.md | change | Explain alignment, scope, off restoration and divider limit |

### Alignment

- [x] Add validated optional sidebarNavigationFill enum (empty/filled), default empty; expose Empty / Filled SelectField. Encode fill as the existing row attribute value (empty/filled), not a second attribute in the one-attribute map. Clear it with existing reconciliation. Test default/roundtrip/invalid input, live appearance, interaction states and combinations with alignment; update listed schema/form/installer/test/docs files only.
- [x] Add schema and form control; done when tests prove defaults, valid roundtrip and invalid handling.
- [x] Apply group-valued alignment and cleanup; done when browser geometry proves all three directions, trailing stability, off/on, dynamic rows, unload, narrow labels.
- [x] Verify typecheck/full suite/five browser suites and diff; document gaps without release/install.

### Divider investigation

- [x] Inspect shipped divider structure read-only and add its named sidebar-nav-separator immediate-sibling structure to regression. Match only this name next to recognized sidebar-nav-scroll; preserve all unrelated separators. Toggle-off restores it. No installed writes. Static artifact evidence plus local browser regression, not live installed certification.

## Independent check

Independent: present as is, one must-verify open (installed runtime acceptance); two documentation notes fixed: fill ownership reconciled to row attribute value and theme/focus behavior clarified. Applied, not re-checked. Named-separator recognition independently verified against shipped bundle and scoped next-sibling check. No installed rendering certification. M said finish all with automatic hover adaptation.

## Changes made

Implemented additive alignment/fill enums, Look controls, value-aware group/row tagging, adaptive hover/focus/selection, and exact named divider handling. Typecheck and focused preference/browser tests pass (8 tests). Full suite 1,409 passed / 29 skipped; all five enabled browser suites and diff check passed. No failing-before-fix run captured; this is a verification gap, not claimed red/green evidence.

## Open questions

- M approved continuing all settings with automatic hover adaptation. Alignment/fill follow treatment switch.
- Shipped artifact inspected read-only: /Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web/index-5095081520ad71bb5cba4172ce60e780.js contains sidebar-nav-scroll followed by SidebarSeparator testID sidebar-nav-separator. Earlier checkout instead used unlabelled mobile separator and desktop group border. This source mismatch explains why named divider was not matched. Live installed computed-style verification still unavailable.
- Before first source edit, offer whether to keep using the current isolated checkout or create another worktree; node_modules is an untracked dependency symlink and will not be copied automatically.
