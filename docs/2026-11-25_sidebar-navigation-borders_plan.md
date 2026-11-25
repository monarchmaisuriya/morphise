# Outlined upper sidebar navigation

- Status: done locally; approved by M "do it then" and border reference; full visible desktop/web styling change
- Scope: Morphise only, existing isolated worktree; no Paseo writes or release/install

## Goal and verified owners

Add toolbar-consistent borders to every upper navigation row including built-ins and plugin rows; remove only navigation-bottom divider. Preserve controls/actions/window chrome/footer/list borders. Current source has builtin testIDs sidebar-search/global-new-workspace/schedules/sessions, header plugin-sidebar-* IDs (footer IDs excluded); SidebarHeaderRow pressable is inside row with trailing sibling. Navigation group owns desktop border-bottom. [verified: Paseo sidebar-nav-rows.tsx:50-77,121,161,182; plugins/sidebar-items/index.tsx:209-212; sidebar-header-row.tsx:70-110; left-sidebar.tsx:936-941]

## Decision

Reuse Morphise web restyle install lifecycle independently of theme restyle, like status marks. Tag nearest common ancestor of at least two verified upper nav rows as group; row frames are button parent. No label/class/nth-child guessing. Fail closed if fewer than two anchors or candidate includes footer/workspace-list entities. Each row gets1px theme border/8pxradius, transparent resting fill, hover/focus-within/selected fill. Preserve host padding/height and trailing click areas. Group border-bottom0, small4pxrow gaps. Mobile web adjacent unlabelled empty separator removed only if confirmed empty immediate sibling of sidebar-nav-scroll. Native no-op. Dynamic nav reorder/plugin rows recognized on settled DOM; remove all owned tags and stylesheet on cleanup. No handlers/DOM content changes or persistent settings.

## Options/cost/risk

Chosen local DOM tags + CSS; broad CSS div/button rules rejected due footer/window blast radius. SDK cannot edit built-in nav; Paseo edits prohibited. One focused pass estimate, undo via cleanup/source. Selectors host-internal and version-sensitive; regression fixture mirrors verified wrappers, documents unsupported native clients. Primary risk border on wrong group or cleanup loop; require safe anchors, refuse footer/list candidates, idempotent tags, observe relevant additions. No new dependency/auth/network/data/model changes. Unknown host layout unchanged, not guessed. No animations, tokens for all colors, border doesn't shrink target. No ATcertification claimed.

## Acceptance and parts

- [x] Border only upper builtin/plugin row frames, no footer/window/list buttons; transparent resting, hover/focus/selected fill, trailing count preserved.
- [x] Bottom group divider absent, unrelated dividers unchanged; dynamic plugin rows and cleanup restore original layout.
- [x] typecheck/unit/browser/full suite/diff checks; docs and rendered fixture.

Files new client/polish/web/sidebar-navigation.ts + test/browser; client/polish/web.register.ts; README. Existing node_modules symlink excluded. No release/install.

## Independent check

Independent focused check found ambiguous plugin-only group ownership. Fixed by builtin-seeded discovery requiring at least two builtin anchors, refusing excluded boundaries, handling instances independently, and removing stale tags during reconciliation. Single/zero builtin layouts safely unchanged; mobile divider hidden via owned tag not DOM removal. Applied not independently rechecked.

## Changes made

Implemented dedicated navigation installer and scoped CSS, wired cleanup with existing web lifecycle. Typecheck/all5enabled browser suites/full suite/diff PASS. Browser tests row borders, theme states, divider removal, trailing controls, dynamic plugin rows, plugin-only safe refusal/stale cleanup and unload. Fixture render inspected. Full log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/upper-navigation-border-tests.log. Installed-host/native/full accessibility not certified. No commit/release/install/Paseo source writes.
