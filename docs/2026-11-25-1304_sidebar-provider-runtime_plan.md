# Workspace provider and recorded-runtime strip

- Date: 2026-11-25 13:04 IST
- Status: done locally; approved direction by M's feature request and runtime choice A; full because new per-workspace history view
- Base: fa6fdf1754a72069df3d3ca8e13678abce56a23c; existing isolated worktree; source clean at start

## Context and goals

M wants visibly identical center dots, a single settings menu instead of separate Filter, quieter tab counts, latest agent provider icon beneath state and a24hour runtime line beneath time. Runtime (not message frequency) explicitly chosen. Reference screenshot supplies layout. Earlier no-provider-icon direction superseded by this request. No commit/release/install. Success local2026-11-25: same6pxcenter opacity across states; no Filter button; provider source matches latest top-level chat;24hour strip reflects real observations. Guardrails no writes/titles changes or inferred human work; no cross-host leak/unknown-as-zero.

## Current state

Dot before CSS6px every state but Done opacity.6; native fallback same.6. [verified: client/polish/web/sidebar-status.ts:24; client/sidebar-status-mark.tsx:18]
Header has separate Filter and Display; filters stored device state, menu comp uses same dropdown. [verified: client/sidebar-view.tsx:1540-1573,2227-2228]
Workspace latest chat already from host-qualified agents sorted lastActivityAt desc. Existing providerIconSvg supports bundled providers and optional custom SVG; use generic Cpu if missing, accessible provider label. [verified: client/sidebar-view.tsx:857-865; client/provider-icons.ts:16-18]
Calendar RPC is installation scoped; records contain workspaceId only. deps.taskHost identifies owning installation. Existing useRpc hook and workbench read use same installation, no remote fallback. [verified: shared/work-calendar.ts:5-25; client/sidebar-view.tsx:869-875; index.client.tsx:418-421]

## Options

| Aspect | One shared Calendar snapshot (chosen) | Per-row timeline reads |
| --- | --- | --- |
| Measures | recorded agent runtime, hourly summed duration | message frequency, not chosen |
| Fit | Existing read/uncertainty/totals | New definition/query load |
| Cost | one read/minute mounted sidebar, grouped once | N reads |
| Gives up | Remote history unavailable from this installation; disclose | Doesn't meet runtime request |
| Completeness | 9/10 local view, gaps explicit | 3/10 |

RECOMMENDATION: shared Calendar snapshot, pure workspace binning.

## Decision/design

Center dot opacity1 all states; state colors stay theme-owned including muted Done. Ring geometry/animation untouched. Tab counts9px reduced emphasis, positive only; retain accessible count and filled equal-width tabs. Merge FilterMenu into existing Display/Settings menu below grouping/sort; same state/clear filters and tags; migrate obsolete transient menu=filter to same combined content. Icon tooltip Settings: grouping, sorting and filters; active-filter count included. No separate Filter button.

Workspace leading column has state20pxslot then provider12pxicon; top-level latest agent chosen regardless tab/nested visibility. Single-line configured rows preserve one-line layout and show no below-row additions. Unknown provider generic Cpu plus provider accessible text; no agent -> no invented icon. Use bundled provider helper; no new provider fetch. Provider identity matches same latest ref as message preview.

Trailing column keeps compact elapsed time then 64x16 line for24rolling hourly bins, newest right. One parent useRpc(calendarRead) at mount and each shared minute clock change, keyed taskHost and cutoff; no per-row reads; cleanup excludes stale responses. Only local host rows receive data; remote/no host shows unavailable label, never local same-ID. State loading/error explicit and source errors available in tooltip/detail. Window is preceding24hours clipped at response snapshot request end (no future credit), uncertain excluded. Per workspace per bin sum confirmed agent intervals, overlaps count separately (same Calendar agentMs). Pure sweep distributes each interval across at most24bins; group by workspace once, not repeated per row. recordingSince after window start/pruned>0/uncertain -> partial coverage tooltip; flat zero only when snapshot loaded, source counts known; tooltip always observation gaps possible. Missing observation cannot be deduced as no actual work. No persistence or server contract changes. Line normalized to per-workspace maximum, tooltip actual total/peak; does not compare absolute activity across workspace heights. Unknown/error drawn as small dash + accessible text, not a flat zero line. Per-row title includes24h, summed agent runtime, total, snapshot/coverage. Parent minute refresh, no new per-row timer. Use native View line segments not new graphics dependency. Transparent overlay supports mouse tooltip and accessible label; no click required.

## Cost/risk/compatibility

One focused session estimate, unverified; bound24bins/20000records existing max, computation shared, no transcript/new dependencies. Main risk host alias/leak, ambiguous chart and hidden filter. Existing source rollback on M request; no stored schema. Per-control settings continue to save through existing revision-aware writer. All user/host output rendered text; provider SVG is existing trusted bundled helper, unknown generic. No new auth/outbound third-party call, no data writes. Native/web geometry use same constants; chart accessible label and runtime text in details; keyboard settings reachable. Full AT/installed-host pixel certification not claimed. Budget first cut cosmetic polish, never host isolation/uncertainty labels. No A/B. Empty/error/stale/concurrent/partial source tested.

## Acceptance

1. Same6pxcenter and opacity1 in loading/working/done, rings unchanged (Done absent).
2. No Filter toolbar action; combined Settings menu retains filtering/group/sort/clear and active filter indicator.
3. Latest top-level provider displayed under state in two-line workspace rows; generic fallback and no-agent absent.
4. Shared runtime read maps only same-host workspace IDs;24bins clip midnight/overlap/window, uncertain excluded; error and partial history explicit; no row-specific reads.
5. Narrow rows no overflow; time/strip and provider/state two aligned columns. Hover actions retain information where possible; chart is not replaced by buttons (move runtime alongside row controls if needed).
6. Pure tests/browser/typecheck/full suite/diff pass; rendered evidence inspected.

## Parts/files

- [x] shared/sidebar-runtime.ts+tests(new) binning and duration metadata; client/sidebar-runtime.tsx(new) shared read hook/strip; pure runtime logic tests. Done bins/host/unknown rules proven.
- [x] client/sidebar-view.tsx, client/sidebar-focus.tsx, client/sidebar-status-mark.tsx, client/polish/web/sidebar-status.ts and tests/browser. Done combined menu/provider placement/count/dot parity.
- [x] README/docs/typecheck/full/enabled browsers and captures. Done observed PASS; no release/install.

## Independent check

Independent check:0confirmed blockers,3must-verify and1note. Author addressed: provider+preview deliberately share existing tree.top[0] including promoted orphans; uncertain-only/pre-recording zero uses unavailable, nonzero partial line labelled; shared hook skips overlapping ticks, accepts same-host delayed responses at actual cutoff, ignores old-host/unmounted results. Alternatives table semantic conflation clarified: shared/per-row are placement choices; both could read Calendar, shared wins by one read not N. Applied not independently rechecked.

## Rollout/rollback

Local implementation only, checked plan -> pure regressions -> sidebar wiring -> render/full verify. Revert source only on M request, no saved data migration. Existing worktree retained.

## Changes made

Implemented dot opacity parity, merged settings/filter menu,9pxquiet counts, provider below state and24hour runtime strip below time with shared host-gated Calendar snapshot. Existing runtime/titles/recording unchanged. Source-only work, no release/install.

Verification: typecheck PASS; runtime unit4tests; all4enabled browser regressions PASS before final tooltip wording; full suite1401passed28skipped before final added test (final run below). Browser asserts provider accessible label,30minruntime label, no separate Filter control and merged settings still work. Host unavailable mark visible. Screenshot inspected; SDK Icon boundary adapter returns null so provider/state glyph pixels not certified by this fixture. Indicator browser separately verifies6pxcenter and opacity1 all states. Runtime chart render inspected; CPU/known-provider SVG use existing tested helper. No final independent diff review yet.

Limit: host hook delayed/host-switch behavior statically traced, no dedicated hook timing harness added. Remote unavailable by design. Coverage uncertain/pruned metadata conservative. No installed-host pixel/full AT certification.

## Open questions

None; source limitation remote timeline must be disclosed, no cross-host fallback.
