# Cut-off titles and limited chat information

- Date: 2026-11-22 13:15 IST

## Bottom line

Two distinct limits affected titles: Paseo discarded prompt text after 60 UTF-16 code units, possibly inside a word; Morphise visually clamped stored titles to two lines. Fixes belong to their separate owners. M approved future naming changes, full wrapping and metadata, with no bulk existing-title rewrites.

## Mechanism and scope

Paseo `packages/server/src/server/agent/create-agent-title.ts` owns provisional generation. It now reserves one unit for ellipsis, ends on the last fitting space, and uses a surrogate-safe prefix when no complete token fits. Existing explicit-title precedence and `session.ts` first-message guards remain unchanged. Shared import/MCP/schedule/workspace callers also use this rule for newly derived fallback names; no scan or migration is added. Full stored title strings remain authoritative.

Morphise `client/quick-chat.tsx` removes the title line clamp and gives titles full width above actions on compact screens. The inline Info disclosure uses `client/quick-chat-info.ts` to display existing list metadata. Undefined archive state and missing/invalid/ambiguous timestamps display Unavailable, rather than inventing Active or UTC. Date-only strings follow ISO UTC midnight semantics. Paths retain the existing existence/privacy warning.

## Evidence and prevention

- Naming regression reproduced exact reported suffix “list the bigge”; fixed expected output ends “list the…”. Explicit/manual-title tests unchanged or added.
- 13 naming tests and 19 storage tests pass; Paseo server typecheck passes. Full server unit suite launched separately; outcome recorded in plan/delivery, not assumed.
- Info regression failed without metadata; six formatting tests now cover full/missing/invalid/archive/timezone-less/impossible-calendar cases.
- Browser checks long and unbroken stored titles, lack of clamp, compact title width >=280px at 360 viewport, Info fields and action bounds across 360/700/1440 dark/light; existing flows retained. Reintroducing clamp killed expected assertion; exact source restored.
- Inspected narrow capture; moved compact actions below title after discovering narrow text column. No hidden truncation or fabricated suffix.

## Recurrence and adoption

Recurrence test: no for whitespace-delimited future provisional names under this rule and UI line-clamp cause. Overlong unbroken tokens still require bounded prefix, explicitly marked by ellipsis. Grapheme/linguistic segmentation is not claimed. Previously discarded suffixes cannot be recovered by wrapping.

Morphise plugin release fixes display/Info only. Paseo daemon adoption is required for future naming. Neither running installation is changed by this work. Source maintainer owns delivery/testing; M owns installation adoption. No existing/manual title rewrite, new schema, transcript read or persistence.

## In plain terms

Future automatic titles stop cleanly where possible and show omission. Quick Chat displays every character actually stored and makes available metadata visible. Existing clipped names stay unchanged rather than being guessed or replaced.
