# Configurable sidebar status indicators

- Date: 2026-11-24 18:57 IST
- Status: done locally, verified; full because additive saved preferences and user-facing sidebar rendering
- Repository: Morphise, branch sidebar-status-settings, base origin/main eb0fdbc; existing isolated checkout reused, dependency link untracked
- Scope: plugin only; no Paseo host code, execution, merge, release or installation changes
- Subagents: independent plan check; final fresh-reader offered after implementation

## Context and problem

M wants a standalone dot-and-ring icon for every sidebar chat state, not a provider logo. No pulsing, rotation only with state-specific speeds/colors. M then requested customizable controls specifically on the plugin settings page and approved: Plugins → Morphise → Settings → Look → Sidebar status indicators, Style (Dot and ring / Paseo default), per-state color/speed, preview and reset. [verified: M chat 2026-11-24]

## Goals / Non-goals

Success 2026-11-24: all six states (starting, working, input, failed, attention, idle) use the same shape in ring mode; edits persist through existing profile save path; preview matches renderer; no pulses; reduced motion stops rotation. Guardrails: zero changed agent states, sidebar grouping/order/click targets or server calls; no leakage outside sidebar status slots, no overflow at 360/700/1440. Preserve host-default choice. Exclude provider artwork, project aggregate badges, tab/composer indicators, Run-button diagnosis and pending Paseo main merge, native-phone host customization, release/install work.

## What is true today

Profile chat.polish fields are optional, tolerate invalid/new values, and defaults are removed on save. Runtime prefs are derived by polishPrefs and published through subscribePrefs. Look settings reuse polishEditor and ColorSetting. [verified: shared/polish/prefs.ts:30-41,115-117,180-238; client/forms/polish-tabs.tsx:20-39,189-229; client/forms/color-field.tsx:7-9; client/polish/prefs.ts:8-18]

Plugin web registration installs independent behaviors regardless of nativeStyle, with cleanup. Host workspace status slots have explicit state test IDs (loading/running/needs_input/failed/attention/done). They contain their own glyphs; the slot also affects title tagging, so preserve its dimensions/testID/position. [verified: client/polish/web.register.ts:69-81; ../paseo/packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx:201-271; client/polish/web/window.ts:22]

The shared StatusRing is running-only and has no color prop, while M wants colors for every state. Host does not expose these as plugin settings. Nothing found guaranteeing future host markup stability; scope compatibility explicitly to named status slots and fail visibly by preserving host defaults when selectors do not match. [verified: ../paseo/packages/app/src/components/status-ring/frame.tsx:15-31]

## Options considered

| Aspect | Plugin-scoped CSS presentation (chosen) | Extend host StatusRing and host settings |
| --- | --- | --- |
| How | Style existing state slots and preview using one generated stylesheet | New host component contract plus plugin bridge |
| Fit | Existing web registration/prefs and host data-testid slots | Native cross-platform source ownership |
| Gives up | Native phone host support; dependency on stable slots | Plugin-only adoption |
| Cost/risk | Small module/tests; selector compatibility risk | Cross-repo API/deploy risk |
| Failure | Unknown slot remains untouched | Old host ignores options |
| Evidence | web.register/dom selectors and settings patterns | running-only host ring contract |
| Completeness | 9/10 declared desktop/web scope | 6/10 installed hosts lack bridge |

RECOMMENDATION: plugin-scoped presentation, no DOM replacement or state inference from labels/colors.

## Decision

One optional chat.polish.sidebarStatus object owns style (ring default / paseo) and per-state overrides. Six exact keys loading/running/needs_input/failed/attention/done; strict override objects, validated optional #RRGGBB color and speed enum stopped/slow/medium/fast. Blank color means semantic theme default. Missing values resolve centrally. Invalid saved object follows existing tolerant schema fallback; no CSS interpolation from unvalidated raw text. No migration, preserve other profile keys. [decided: M, approved plugin settings proposal 2026-11-24]

Defaults: loading blue medium 1.6s, running blue fast 0.8s, needs_input warning slow 3.2s, failed danger stopped, attention success/attention tone slow 3.2s, done muted stopped. Starting/working reuse Morphise BLUE (#4c8dff, client/ui/hues.ts:24); other colors follow semantic theme variables. Same 14px visible shape, center dot and quarter ring; static track; stopped means arc remains visible at a fixed angle. Reduced motion via CSS prefers-reduced-motion, overrides animation even custom speeds. Defaults removed from profile when equal; reset only removes sidebarStatus, preserving unrelated settings. Dot and ring is the requested default; Paseo default removes all live overrides while keeping configured per-state choices available when switching back.

## Cost and scope

Estimate 45-90 minutes (assumption based on earlier settings/browser changes), main risk CSS selectors and accidental settings overwrite. Blast radius Look form, optional prefs, web registration and stylesheet only. Undo by selecting Paseo default or unloading plugin; original host children never removed. Cut cosmetic extras first, not validation/accessibility/reduced-motion/reset checks.

## Design

```text
profile settings -> validated sidebar options (new) -> shared style rules (new)
                                                  -> settings preview
                                                  -> host sidebar slots
```

Reuse SettingsSection/Card/Select/ColorSetting/Action and tokens. Section independent of Restyle Paseo. Per-state compact preview with readable state label; color picker with default/reset; speed menu labels include seconds/revolution, Stopped explicit. Native settings explain sidebar override desktop/web only; no motion claim on native preview. Color defaults semantic theme colors, users choose custom colors with preview; no claim of guaranteed arbitrary-color contrast. State labels remain accessible from host, custom shape decorative and noninteractive. No flashing, pulsing, opacity animation or moving center dot. Preserve slot bounds; CSS only rotates arc. Preview shows all states in ring mode; host mode explains restored host appearance rather than fake host certification.

Empty config -> ring defaults; malformed config -> established tolerant fallback; raw empty color unset; invalid typed value stays local with an error and cannot enter preferences or stylesheet. Native web absent -> no stylesheet installation. Live theme variables update without rescan. Preferences change replaces one stylesheet; no global DOM scan, mutation observer or per-row timers. No auth/privacy/network/retention/capacity change. Partial host mismatch remains visible host content. Design refs: orchestrator design.md, ADAPTATIONS.md, impeccable craft-floor.md. No external assets/dependency/licenses added.

## Risks and mitigations

| Risk | Likelihood / impact | Mitigation / detection |
| --- | --- | --- |
| Host selector changes | Medium / native indicators remain | Exact selector-only rules; no hide outside matched slots; explicit compatibility browser fixture |
| Settings custom value invalid | Medium / bad style or lost draft | Zod validation, defensive resolver accepts only enum/hex; tests invalid/unknown input |
| Restoring host loses choices | Low / frustration | style separate from per-state overrides; reset explicit and scoped |
| Large list animation cost | Medium / CPU | CSS-only arc animation, no JS per-row loops/timers, reduced-motion media query |
| Color-only state indistinguishable | Medium / accessibility | Retain host labels, state tooltips and preview labels; motion is supplementary |

## Acceptance criteria

1. Given no preferences, six states resolve intended colors/speeds; configured state changes only itself.
2. Given ring style, known slots show same dot/ring, no provider logo/pulse; unknown slots and non-sidebar components unchanged.
3. Given Paseo style/unload, all original host appearance remains without injected children or persistent DOM changes.
4. Given reduced-motion, every arc is static; preference/theme changes update both existing/new rows and preview without rescanning.
5. Given settings edits, color/speed/style persist on remount through existing save path; reset restores recommended defaults and preserves unrelated settings; invalid values rejected/fall back safely.
6. Unit/typecheck/full/browser/render checks pass, six width/theme samples no horizontal overflow; inactive Restyle does not disable feature.

## Rollout and rollback

Check plan -> tests red -> settings/resolver -> scoped stylesheet/preview -> browser save/reset/state/motion checks -> full checks -> report. No commit/push/release inferred from this request. Undo setting Paseo default, reset recommended ring, or plugin unload; no database migration/agent mutation. Abort on scope mismatch/unexpected failure. Keep branch/plan until M chooses cleanup.

## Parts

| Path | Action | Purpose |
| --- | --- | --- |
| shared/polish/sidebar-status.ts + test | create | Schema/defaults/validated resolver |
| shared/polish/prefs.ts + tests | change | Optional profile field and runtime prefs |
| client/polish/web/sidebar-status.ts + test | create | Shared CSS/installer/cleanup |
| client/polish/web.register.ts | change | Install independent feature and cleanup |
| client/forms/sidebar-status.tsx | create | Per-state settings/preview/reset |
| client/forms/polish-tabs.tsx | change | Mount section in Look |
| client/sidebar-status.browser.test.ts | create | Settings and state CSS browser regression |
| README.md, this plan | change/create | User instructions and evidence |

- [x] Preference schema/defaults/reset tests fail then pass, no unrelated field loss.
- [x] Settings/preview and live scoped CSS implemented with browser state/theme/reduced-motion/persistence coverage.
- [x] Full typecheck/unit/browser/capture evidence, final report; no release/install changes.

## Independent check

Independent: one blocking invalid-draft boundary upheld/fixed by local strict input state; partial hex never calls settings writer, visible error, remount restores valid saved value. One host-animation must-verify clarified: existing host clocks are retained invisibly for reversible plugin-only presentation, not claimed stopped. Browser checks visible pseudo animation and restoration. Other criteria pass. Applied, not re-checked.

## Changes made

Source inspection only; isolated branch based on latest origin/main includes newer 0.52.0 title-helper work, untouched.

## Open questions

None for approved design. Worktree reuse follows prior isolated-checkout practice; no new installation or merge authorized.

## Verification and scope clarifications

- Shared resolver/profile test red: runtime sidebarStatus undefined; now profile choices load. Focused validation tests cover hostile CSS strings, short hex, invalid speed/style, defaults and per-state isolation.
- Preview/local input uses strict six-digit validation before profile writer. Invalid partial text shows error without changing saved settings. Reset remount key clears invalid local text, scoped writer preserves runButtons/unrelated settings.
- CSS uses exact existing sidebar row/status-slot selectors; preview target separate, so unsaved preview cannot recolor live sidebar. No observers or per-row timers. Native settings render controls but native host override/preview motion not provided.
- Host children are hidden, never removed or mutated; their own animation clocks can continue hidden. This is a declared performance limitation of the plugin-only reversible design, not a claim of host clock cancellation.
- Browser test exercises real form/polishEditor/prefs/CSS with SDK settings widgets stubbed at boundary. It proves saved style/color/speed, invalid draft/remount, reset scope, six states, reduced motion, outside slot unaffected, unload and widths. Not installed-host pixel certification.

## Final implementation evidence

2026-11-24: implemented settings under Look, optional validated profile key, shared CSS for six states, separate preview scope, local strict color draft, speed choices, default serialization and reset; registration independent of nativeStyle. Native no-op installer; no added assets/dependencies, server calls or installation changes.

Fresh code review: no blockers; preview reduced-motion scope leak and explicit-default serialization notes fixed, applied not re-checked. Must-verify expanded synthetic coverage now tests in-place state transition, new slots, semantic theme variable changes, both themes, three widths and invalid-draft-then-reset. Real installed-host pixels/control chrome remain unverified, not certified. Original host animation clocks remain invisibly running by documented design; no per-row plugin clocks added. Existing absent idle slots remain absent.

VERIFY: npm run typecheck PASS.
VERIFY: npm test -- shared/polish/sidebar-status.test.ts client/polish/web/sidebar-status.test.ts PASS (9 tests).
VERIFY: enabled client/sidebar-status.browser.test.ts PASS; uses real settings component/editor/preference runtime with SDK widgets stubbed.
VERIFY: npm test PASS (1346 passed, 26 skips including opt-in browser; new browser separately enabled).
VERIFY: git diff --check PASS.
Mutation: disabling reduced-motion override killed browser assertion; exact source bytes restored. Narrow 360px capture inspected; no horizontal overflow at 360/700/1440 dark/light.

No commit, push, release, registry or running-installation action. Existing pending Run-button and Paseo-main work untouched. Plan retained; cleanup only on M request.
