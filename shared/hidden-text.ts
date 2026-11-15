// Characters that make text read one way on screen and another when it is sent or run: control
// characters (tab and newline allowed), format characters (zero-width, direction marks, invisible
// tag characters an AI model reads but a person does not see), line or paragraph separators,
// variation selectors (U+FE0F stays: ordinary emoji use it), and letters that draw as blank space.
// One rule for every text Morphise lets through on someone's behalf: drafts (shared/show.ts) and
// commands (shared/run/text.ts).
export const HIDDEN_CHARACTERS = /(?![\t\n])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u{FE00}-\u{FE0E}\u{E0100}-\u{E01EF}\u115F\u1160\u3164\uFFA0\u2800\u034F\u17B4\u17B5\u180B-\u180D]/u;
