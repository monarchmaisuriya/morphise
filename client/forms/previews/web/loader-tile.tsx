// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/dashboard/prefs-editor.tsx (LoaderTile)
// One working indicator running for real: the restyle's loader CSS (client/polish/web/restyle-css.ts, LOADERS) scoped to
// this tile by data-cp-tile, so it shows the unsaved choice. It animates only while the restyle stylesheet is on the page.
import { createElement } from "react";
import { Platform } from "react-native";
import type { Loader, Prefs } from "../../../../shared/polish/prefs";

// The restyle scales Paseo's 14px indicator box by these (restyle-css.ts, data-cp-rt-loader-size).
const SCALE: Record<Prefs["loaderSize"], number> = { s: 1, m: 1.15, l: 1.3 };

function Tile({ loader, size, tint }: { loader: Loader; size: Prefs["loaderSize"]; tint: string }) {
  // The loaders draw in --cp-loader-color (which the page's saved choice also sets on <html>), else
  // --cp-fg, and sparkle and orb in --cp-accent; all take the colour being picked here.
  const box = { position: "relative", width: 14, height: 14, flexShrink: 0, transform: `scale(${SCALE[size]})`, "--cp-loader-color": tint, "--cp-fg": tint, "--cp-accent": tint, "--cp-mono": "ui-monospace, Menlo, monospace" };
  if (loader === "dots") {
    const dot = 10 / 3;
    return createElement(
      "div",
      { "data-cp-dots": "", style: { ...box, display: "flex", alignItems: "center", justifyContent: "center" } },
      createElement(
        "div",
        { style: { position: "relative", width: dot * 2 + 2, height: 14 } },
        [0, 1, 2, 3, 4, 5].map((i) => createElement("div", { key: i, style: { position: "absolute", left: (i % 2) * (dot + 2), top: Math.floor(i / 2) * (dot + 2), width: dot, height: dot, borderRadius: "50%", background: tint, opacity: 0.6 } })),
      ),
    );
  }
  return createElement("div", { style: box }, createElement("div", { "data-cp-loader": "", "data-cp-tile": loader }, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => createElement("i", { key: i }))));
}

export const LoaderTile = Platform.OS === "web" ? Tile : null;
