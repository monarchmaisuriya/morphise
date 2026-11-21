# Quick Chat native provider marks

- Date: 2026-11-22 00:37 IST
- Status: approved direction by M's “finish all” after diagnosis; full because released user-facing defect
- Repo: morphise; branch quick-chat-native-provider-icons; base c07f4d101e81020a33efbce5af329a06b0af8b79
- Subagents: independent scoped plan/code checks

## Context and problem

M wants the same provider marks shown in Paseo's native picker screenshot, not CPU glyphs. v0.51.1 shipped only snapshot SVG support. M approved completing the diagnosed scoped fix, checks, review and delivery in chat on 2026-11-22. Running installation remains read-only; registry proposal may be updated, not upstream merged without authority.

## Goals / Non-goals

Success: all nine native built-in IDs get the same artwork as Paseo even when no snapshot SVG exists. Custom supplied SVG survives. Unknown providers without artwork alone retain CPU. Guardrail: zero changed selected provider/model identifiers or data writes. Verify 2026-11-22. No picker/layout/state redesign, new dependency, host modification, arbitrary catalog asset expansion or running installation mutation.

## What is true today

Quick Chat mapper forwards optional entry.iconSvg only; both trigger and rows use it or Cpu. [verified: client/quick-chat-models.ts:8-18; client/quick-chat.tsx:23,34]

Paseo resolves built-ins by provider ID before supplied SVG, then known catalog icons, then Bot. Its built-in table has nine IDs. Plugin SDK installed version 0.16.0-beta.1 exposes Lucide names or SVG/component, not provider-ID resolution. [verified: ../paseo/packages/app/src/components/provider-icon-name.ts:14-24; ../paseo/packages/app/src/components/provider-icons.ts:29-39; node_modules/@getpaseo/plugin/package.json:3; dist/client/ui.d.ts:33-41]

False assumption: snapshots always contain native built-in artwork; nothing found making this true. Rendering and mapping are separate contracts. Existing tests provided invented Fake SVG and therefore did not exercise this omission. [verified: client/quick-chat.browser.test.ts:18; client/quick-chat-models.test.ts:4-9]

## Options considered

| Aspect | Ship native SVG artwork locally | Change host SDK/server |
| --- | --- | --- |
| How | Adapt nine existing native marks to serializable SVG, resolve ID centrally | Expose provider-icon resolver upstream |
| Fit | Current SDK supports inline SVG | Requires unrelated host deployment |
| Gives up | Automatic future native artwork updates | Standalone Morphise fix |
| Cost/risk | Small source/assets/notices; pinned artwork can drift | Larger cross-repository public contract |
| Failure | Asset drift caught through provenance/parity tests | Installed host stays unsupported |
| Evidence | SDK icon union, native icon sources | SDK lacks resolver |
| Completeness | 9/10 current nine plus custom; catalog extension excluded | 6/10 until host deployed |

RECOMMENDATION: use pinned native artwork through supported inline SVG API.

## Decision

One pure resolver owns built-in ID -> SVG, then custom snapshot SVG -> undefined. Both UI locations already consume mapper iconSvg and need no edits. Preserve native precedence for built-ins. Copy artwork only, normalize JSX SVG attributes to XML/currentColor and omit runtime dimensions; preserve paths/viewBoxes/transforms/opacity. Cover all nine entries in native map, not just three screenshot entries. Include upstream LICENSE in third-party folder and source/commit/modification notice. [decided: M, chat 2026-11-22, “finish all” approves previously proposed same-artwork scoped fix]

## Cost and scope

Estimated 20-40 minutes (assumption from preceding small toolbar fix). Main risk artwork drift; mitigate pinned provenance and path checks. Blast radius Quick Chat model mapper only, not shared Select or Dispatch. Undo source release on request; no data migration. Preserve existing isolated checkout and create dedicated branch; node_modules link stays untracked.

## Design

Snapshot -> existing stable model mapper -> provider artwork resolver (changed) -> unchanged trigger/menu Icon.

Existing Icon 16px bounds, tint, accessible names, collision labels and keyboard behavior unchanged. Built-in ID match exact, not human labels. Empty/unknown -> existing fallback; no retries, networking, clocks, writes or concurrency involved. No config/auth/schema migration. Reuse prior toolbar's design tokens. Design references: orchestrator design.md, ADAPTATIONS.md, impeccable craft-floor.md. Data/privacy/security/scale/operations unchanged; compatibility is additive bundled artwork. No new executable dependency. Native assets licensed through upstream LICENSE; preserve source notices and do not claim third-party trademark rights.

## Risks and mitigations

| Risk | Likelihood / impact | Mitigation / detection |
| --- | --- | --- |
| Snapshot missing native marks | Confirmed / visible bug | Resolver handles native IDs without snapshot; regression red on released code |
| Artwork differs from native | Possible / wrong marks | Pin source commit, compare path/viewBox data and render inline SVG in actual component fixture |
| Custom mark overwritten | Possible / wrong custom brand | Unknown IDs use supplied SVG unchanged; test custom case |
| Future built-in additions | Possible / generic fallback | Document pinned map and manual sync ownership, test known nine |

## Acceptance criteria

1. Given native claude/codex/opencode without iconSvg, mapper returns corresponding native artwork, never undefined.
2. Given all current nine built-in IDs, resolver returns valid self-contained SVG with original geometry and currentColor; built-in identity wins conflicting snapshot just like native.
3. Given custom supplied SVG, output matches input; unknown/empty IDs with no SVG retain existing fallback.
4. Given real component fixture with native provider and no SVG, trigger/menu render the expected path; selected stable ID unchanged. Existing responsive/keyboard/archive/model-memory/handoff tests pass.
5. Source notices/license and release docs state bundled marks accurately. No production install changes.

## Rollout and rollback

Independent check -> red regression -> implementation -> tests/render/review -> v0.51.2 exact-tree merge/release -> update existing registry proposal tag/two pins. Stop on unexpected failure. No upstream registry merge assumed. Rollback source only on M request, no stored data effect. Running installation update command handed to M.

## Parts

| File | Action | Why |
| --- | --- | --- |
| client/provider-icons.ts | create | Pinned native SVG map/pure resolver |
| client/quick-chat-models.ts | change | Resolve artwork once for both callers |
| client/quick-chat-models.test.ts | change | Missing native SVG regression |
| client/provider-icons.test.ts | create | Nine native IDs, custom/fallback/precedence and SVG validity |
| client/quick-chat.browser.test.ts | change | Native no-SVG trigger/menu path regression |
| NOTICE.md, third-party/paseo/LICENSE | change/create | Attribution and full source license |
| README.md, CHANGELOG.md, package files | change | Correct runtime-only claim and patch metadata |
| this file, RCA | create/update | Diagnosis, evidence, completion |

- [x] Mapper regression fails twice on released behavior, passes with owning resolver.
- [x] All nine assets, custom/fallback/precedence tested; browser native artwork and existing flows pass.
- [ ] Independent review, final checks, authorized release/registry proposal; report exact installation limitation.

## Independent check

Independent: present as is, one license-packaging must-verify fixed. Added third-party/ to package files; npm pack --dry-run confirms third-party/paseo/LICENSE, NOTICE.md and client/provider-icons.ts included. Other rubric criteria pass. Applied, not re-checked.

## Changes made

Diagnosis/source trace only; clean dedicated branch from released main.

## Open questions

None in source scope; production installation remains excluded by standing rule.

## Verification evidence

- Reproduced twice before implementation: missing Claude iconSvg yielded undefined while custom/fallback tests passed.
- Added nine native marks with original geometry and XML normalization; native precedence preserved. New 18 focused tests/typecheck/browser pass.
- Mutation removing built-in resolution killed by 11 assertions; exact resolver bytes restored. Unknown/custom tests stay green.
- Real-component fixture renders SVG markup, checks Claude/Codex/OpenCode native path data without snapshot SVG; Claude trigger checked at 360/700/1440 dark/light. Host Icon is adapter boundary, not installed-host pixel certification.
- Inspected 360 dark capture: Claude mark visibly present; open-menu capture occurred before portal positioning and therefore is not claimed as inspected open-menu evidence. DOM path assertions still establish menu wiring.
- npm pack --dry-run confirms full copied license/notice/module included.

## Review and final verification

Independent code review: no blocking defects, one renderer must-verify and README note. README corrected. Installed SDK findSvgIconProblem accepts every bundled mark (15 resolver tests + 3 mapper tests pass). Native host source validates with that same function then SvgXml; actual installed-host visual inspection remains unperformed, explicitly not certified. Exact paths/viewBoxes/XML parsing and browser adapter provide bounded evidence; this does not claim host pixels. Package file-list inspection confirms source/notice/full license inclusion.

Final source checks: typecheck PASS; focused 18 tests PASS; enabled browser PASS; full suite 1329 passed / 25 skips; diff check PASS. No production writes. Delivery in progress.
