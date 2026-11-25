# Plugin navigation cell width

## Impact and evidence

M's v0.68.0 screenshots show Quick Chat and Workbench collapsing in Split rows and Tiles while builtin rows occupy their assigned widths. Shipped Paseo SidebarRow adds an outer View around SidebarHeaderRow; builtin navigation uses SidebarHeaderRow directly. [verified: current conversation screenshots; /Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web/index-5095081520ad71bb5cba4172ce60e780.js SidebarRow; Paseo packages/app/src/plugins/sidebar-items/kit.tsx:38-49]

## Root cause

The layout owned grid slot dimensions but not the nested plugin wrapper chain. Tests measured outer slots with uniform simplified wrappers, not actual bordered plugin frame width. An intrinsic-width nested wrapper could therefore collapse without failing the geometry checks.

## Structural correction

Tag only the chain between a recognized main row frame and its assigned simple grid slot as data-morphise-nav-stretch. Force full available width, border-box sizing and stretch alignment. Remove duplicate horizontal wrapper inset since grid supplies spacing; internal main-button padding stays unchanged. Existing per-element/attribute reconciliation restores styles on layout changes/off/unload. No cloning, handler replacement or Paseo edits. [verified: client/polish/web/sidebar-navigation.ts]

## Verification

Regression adds nested plugin wrapper with intrinsic sizing and checks bordered frame width, not merely slot width, for Split and Tiles. First run failed `Split plugin button frame must fill full-width slot`; initial stretch preserved nested padding. Removing duplicate horizontal inset made the unchanged width assertions pass. Existing dynamic visibility/order/control/lifecycle assertions remain.

No installed-host computed-style or visual certification. Fixture establishes a reproducible mechanism consistent with screenshots and known shipped wrappers, not exhaustive runtime attribution.

## Delivery

M explicitly requested fix, commit, merge, release and registry PR update in this task. No local installation update requested here; production remains read-only. Target release v0.69.0. Full release verification recorded in chat and release log.

## Prevention

Owner: implementation author. Keep nested plugin wrappers and frame-width assertions in the browser regression; never treat grid-cell width alone as evidence that its interactive child fills it. Recurrence check: the tested intrinsic-width mechanism fails the frame-width assertion without the stretch-chain/inset correction.
