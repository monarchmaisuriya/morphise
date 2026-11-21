# Third-party notices

Morphise includes code ported from the following MIT-licensed Paseo plugins. Each ported file says where it came from in its first comment.

## Feature inspiration (not incorporated code)

Morphise's Quick Chat was independently implemented. Its project-free conversation and later project-handoff workflow was inspired by [Quick Chat](https://github.com/5h0ov/paseo-quick-chat) by Shuvadipta Das (@5h0ov). The reference project's source is MIT-licensed, with Copyright (c) 2026 Shuvadipta Das; no code, assets, tests or prompt templates from that plugin are included in Morphise. This credit does not place independently written Morphise code under the reference project's license.

The Quick Chat interface refinements and device preferences reuse Morphise's existing components and Paseo-provided runtime APIs. Its native provider artwork is incorporated as described below; it adds no executable dependency.

## Paseo native provider artwork

`client/provider-icons.ts` adapts the SVG geometry from `packages/app/src/components/icons/{antigravity,claude,codex,copilot,kiro,minimax,omp,opencode,pi}-icon.tsx` in [getpaseo/paseo](https://github.com/getpaseo/paseo/tree/5afe6bd9aa7e8572eac29bc9105217f17fb4e828/packages/app/src/components/icons), pinned at commit `5afe6bd9aa7e8572eac29bc9105217f17fb4e828`.

Copyright (c) 2025-present Mohamed Boudra. Licensed under Apache License 2.0; the full upstream license is included in [third-party/paseo/LICENSE](third-party/paseo/LICENSE). Modified by converting React Native JSX attributes to self-contained SVG XML, using currentColor and leaving output dimensions to the host renderer. Provider marks identify their respective products; no trademark rights or endorsement are claimed. Custom providers continue to use host-supplied artwork.

## Chat Polish

https://github.com/lthieu96/paseo-chat-polish (ported from commit 6b52cc2528426812c78ec8d2b547ffb8d158e542)

MIT License

Copyright (c) 2026 Hieu Le

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The optional icon sets are not part of Morphise: the daemon downloads them from npm the first time one is picked. Hugeicons (`@iconify-json/hugeicons`) is MIT; Untitled UI (`@untitledui/icons`) is under the Untitled UI licence.

## Quote

https://github.com/keefeere/paseo-quote (ported from commit f6484cb4047b7393d12e86b512d897ff548c4f76)

MIT License

Copyright (c) 2026 Chechulin Serhii

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Better Paseo

https://github.com/RoundRedDot/better-paseo (ported from commit d6c90498; conversation search matching from commit d4c85cca)

MIT License

Copyright (c) 2026 ABorakati

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Shell Yeah

https://github.com/stevecastaneda/paseo-plugins/tree/main/shell-yeah (ported from commit a41c885f702a4fa2201f4ffef8fb39a16db99bdc)

MIT License

Copyright (c) 2026 Steve Castaneda

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Project Groups

https://github.com/topar12/paseo-project-groups (ported from commit 8515d90)

MIT License

Copyright (c) 2026 topar12

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Harness Stats

https://github.com/kogekiplay/paseo-harness-stats (ported from commit 4e8fae9)

MIT License

Copyright (c) 2026 kogekiplay

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Activity

https://github.com/koinzhang/paseo-plugins/tree/main/activity (ported from commit 83a1c90878a6f4154cbc23ac860f7ed3437e69a9)

MIT License

Copyright (c) 2026 koinzhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## CC Switch

https://github.com/farion1231/cc-switch (via Harness Stats, which credits it)

Harness Stats' time-to-first-token reading from Codex and Claude Code logs follows CC Switch's log timing (`src-tauri/src/services/session_usage_codex.rs`, `session_usage.rs`), implemented independently in TypeScript; Morphise carries that code.

MIT License

Copyright (c) 2025 Jason Young

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Packages Morphise installs or uses

These are not part of Morphise's code; each keeps its own licence.

- [pele](https://www.npmjs.com/package/pele) 1.7.0 (diagrams), MIT. Installed on the daemon by npm.
- [sharp](https://sharp.pixelplumbing.com) 0.35.5 (thumbnails), Apache-2.0. Installed on the daemon by npm, with its prebuilt [libvips](https://www.libvips.org), LGPL-3.0-or-later, and its WebAssembly build `@img/sharp-wasm32` 0.35.5 (Apache-2.0 AND LGPL-3.0-or-later AND MIT, with `@emnapi/runtime`, MIT), used where the native one cannot load (Paseo's macOS app).
- [node-pty](https://github.com/microsoft/node-pty), MIT. Morphise loads the copy Paseo ships for running commands in a terminal; it includes no copy of its own.
- The optional icon sets, downloaded from npm only when picked: Hugeicons (`@iconify-json/hugeicons`, MIT) and Untitled UI (`@untitledui/icons`, under the Untitled UI licence).
