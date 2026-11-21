# Quick Chat generic provider icons

- Date: 2026-11-22 00:40 IST
- Source release affected: v0.51.1; corrected source intended for v0.51.2

## Bottom line

Quick Chat treated optional snapshot SVG as the only provider-artwork source. Paseo's native picker instead resolves built-in marks by provider ID. The missing resolution rule made built-ins display CPU. The fix adds a single pinned native-artwork resolver before both unchanged rendering consumers. [verified: client/quick-chat-models.ts; client/provider-icons.ts; ../paseo/packages/app/src/components/provider-icon-name.ts:14-24]

## Impact

Providers without snapshot artwork showed generic icons in Quick Chat's trigger and choices. No observed wrong model IDs or chat-data changes. Number of affected installations unknown; M reported the issue through screenshots. [verified: M chat 2026-11-22; client/quick-chat-models.ts preserves choice.value]

## Timeline

- v0.51.1 released with supplied-SVG wiring but no built-in asset resolution.
- M reported generic icons, then supplied native picker screenshot and approved same native marks / “finish all”.
- 2026-11-22 00:38 IST: regression reproduced twice with Claude missing snapshot SVG, then passed after central resolver.
- 00:39 IST: focused 18 tests, typecheck and enabled browser test passed; removing resolver killed 11 assertions, restored exact bytes.
- Full suite: 1329 passed / 25 existing default skips; browser separately enabled and passed.

## Symptom -> mechanism -> root cause

Native provider without snapshot SVG -> mapper forwarded undefined -> trigger/menu selected CPU.

Broken invariant: known built-in providers must be recognizable even without optional custom artwork. The prior design conflated native ID-based assets and optional snapshot assets. It was breakable because no boundary test represented actual built-in metadata.

## Structural fix

`client/provider-icons.ts` owns exact-ID built-in SVG resolution, preserving native built-in-first precedence, custom supplied SVGs and unknown fallback. `client/quick-chat-models.ts` resolves once for both UI consumers. Nine current native marks are pinned to Paseo commit 5afe6bd9aa7e8572eac29bc9105217f17fb4e828 with license and modification notice. No host, state or public contract changes.

Recurrence test: no, the same absence of optional snapshot artwork cannot cause the nine supported built-ins to use generic icons; regression and mutation demonstrate this. Future new native providers require map updates, which is a maintenance limitation, not automatic parity.

## Prevention and detection gap

Previous fixture invented a provider with SVG and checked correct prop flow. It proved transport, not representative metadata coverage. Tests now include actual native IDs without SVG, original geometry for all nine, custom/fallback/precedence and prototype-like IDs. Browser checks native menu path data and selected trigger at six viewport/theme combinations. The adapter renders real SVG markup but is not installed-host renderer certification.

## Follow-ups

- Source maintainer: keep pinned native map/provenance synchronized when native provider IDs/artwork change (normal priority).
- M: run installation update after release; production installation mutation is outside agent permission.
- Source maintainer: registry proposal update after exact-tree v0.51.2 release (in current task).

## In plain terms

The artwork was missing before rendering began. The fix supplies the same built-in marks as Paseo, while preserving custom provider artwork and leaving model selection untouched.
