import { Platform } from "react-native";
import { renderDiagram } from "../../shared/polish/diagram";
import { getIconSet } from "../../shared/polish/icons";
import { POLISH_DEFAULTS, type Prefs } from "../../shared/polish/prefs";
import { THEME_CATALOG_ID } from "../../shared/polish/theme";
import type { PolishPart } from "./context";
import { languageFor } from "./i18n";
import { currentPrefs, subscribePrefs } from "./prefs";
import { currentTheme, subscribeTheme } from "./theme-registry";
import { setCompactHandler } from "./web/context-card";
import { centerControlText } from "./web/control-font";
import { readHostAppearance } from "./web/host";
import { addIconSet, iconTwins, nativeIconSet } from "./web/icons";
import { redrawDiagrams } from "./web/mermaid";
import { setRailProviders } from "./web/model-picker";
import { stylePluginViews } from "./web/plugin-views";
import { bindPromptKeys } from "./web/prompts";
import { restyleNative } from "./web/restyle";
import { setLanguage, setRichText } from "./web/rich-text";
import { paintSidebar } from "./web/sidebar";
import { watchTables } from "./web/tables";
import { tagWindow } from "./web/window";

// Chat Polish's restyle of Paseo's own page (lthieu96/paseo-chat-polish, MIT, see NOTICE.md), wired
// as its index.client.tsx wired it. Unlike Chat Polish, everything that changes Paseo's own look
// (the restyle, the sidebar colour, the icon set, the control font fix) runs only while `nativeStyle`
// is "design"; the plugin views' transitions and the prompt keys run regardless.

// Prefs that Paseo's own rows follow reach the restyle's CSS as data-cp-rt-* attributes on <html>.
// The image stack attributes are read by the image stacks part (client/polish/media).
export function rootChoices(p: Prefs): Record<string, string> {
  const design = p.nativeStyle === "design";
  // Restyle-only options write nothing at their default, so the restyle keeps 0.16's look (OPTION_VARIABLES in web/restyle-css.ts).
  const restyled = (key: keyof Prefs & keyof typeof POLISH_DEFAULTS) => (design && p[key] !== POLISH_DEFAULTS[key] ? String(p[key]) : "a");
  return {
    width: restyled("replyWidth"),
    "float-radius": restyled("floatingRadius"),
    "float-gap": restyled("floatingGap"),
    "loader-color": restyled("loaderColor"),
    thumbs: restyled("thumbCorners"),
    ...p.richText,
    images: p.images,
    stacks: design ? p.imageStacks : "off",
    stackopen: p.imageStackOpen,
    steps: p.steps,
    density: p.density === "normal" ? "a" : p.density,
    // Unlike Chat Polish, no window tags while the restyle is off: they only feed its stylesheet.
    window: design && p.windowStyle !== "paseo" ? p.windowStyle : "a",
    "icon-steps": p.rowIcons.steps === "hide" ? "hide" : "a",
    "icon-tool": p.rowIcons.tool === "hide" ? "hide" : "a",
    loader: p.loader === "dots" ? "a" : p.loader,
    "loader-size": p.loaderSize === "s" ? "a" : p.loaderSize,
    icons: design && p.iconSet !== "lucide" ? p.iconSet : "a",
  };
}

// "a" removes an attribute, so `clear` leaves <html> as Paseo drew it.
function markRoot(p: Prefs, clear = false) {
  const choices = rootChoices(p);
  setRichText(clear ? Object.fromEntries(Object.keys(choices).map((key) => [key, "a"])) : choices);
  // A window style switch re-tags the window chrome.
  tagWindow([]);
}

// The icon set Paseo's own icons are drawn in: Lucide (Paseo's) unless the restyle is on.
const nativeIcons = () => (currentPrefs().nativeStyle === "design" ? currentPrefs().iconSet : "lucide");

export const registerWeb: PolishPart = ({ client }) => {
  if (Platform.OS !== "web") return () => {};

  // The few strings the injected CSS words itself follow Paseo's language. The runtime Paseo
  // passes can be subscribed to, though the public type does not say so.
  const i18n = client.i18n as typeof client.i18n & { subscribe?(listener: () => void): () => void };
  const showLanguage = () => setLanguage(languageFor(i18n.locale));
  showLanguage();
  const unfollowLanguage = i18n.subscribe?.(showLanguage) ?? (() => {});
  // Copy and cell selection on Paseo's tables, while "Tables" (Messages) is on.
  const unwatchTables = watchTables(client);

  // Only while the restyle is on and Morphise's theme is Paseo's app theme (Settings, Appearance).
  const unpaintSidebar = paintSidebar(
    () => {
      const theme = currentTheme();
      return theme && currentPrefs().nativeStyle === "design" && readHostAppearance().pluginThemeId === THEME_CATALOG_ID ? { sidebar: theme.sidebar } : undefined;
    },
    (repaint) => {
      const unsubscribeTheme = subscribeTheme(repaint);
      const unsubscribePrefs = subscribePrefs(repaint);
      return () => {
        unsubscribeTheme();
        unsubscribePrefs();
      };
    },
  );

  const unrestyle = restyleNative(
    () => currentPrefs().nativeStyle === "design",
    {
      render: (source) => client.rpc(renderDiagram, { source }),
      on: () => currentPrefs().diagrams === "pele",
    },
    subscribePrefs,
  );
  const unstylePluginViews = stylePluginViews();
  // Lifting button text changes Paseo's own controls, so it runs only with the restyle on
  // (Morphise leaves Paseo's look alone by default).
  let uncenter: (() => void) | null = null;
  const syncCenter = () => {
    const on = currentPrefs().nativeStyle === "design";
    if (on && !uncenter) uncenter = centerControlText();
    if (!on && uncenter) {
      uncenter();
      uncenter = null;
    }
  };
  syncCenter();
  const unicons = nativeIconSet(nativeIcons);
  const unbindPromptKeys = bindPromptKeys();
  const unsetCompact = setCompactHandler((agentId) => client.paseo.agents.ref(agentId).send("/compact").then(() => undefined));

  // The model selector's provider rail lists every provider, which Paseo only renders for new chats.
  const loadProviders = () =>
    client.paseo.providers
      .snapshot()
      .then(({ entries }) =>
        setRailProviders(
          entries
            .filter((entry) => entry.enabled !== false)
            .map((entry) => ({
              id: entry.provider,
              label: entry.label ?? entry.provider,
              status: entry.status,
              iconSvg: entry.iconSvg,
              models: (entry.models ?? []).map((model) => ({
                label: model.label,
                thinking: (model.thinkingOptions ?? []).map((option) => ({ label: option.label, description: option.description, isDefault: option.id === model.defaultThinkingOptionId })),
              })),
            })),
        ),
      )
      .catch((error: unknown) => console.warn("[morphise] Provider list unavailable for the model selector", error));
  void loadProviders();
  const unsubscribeProviders = client.paseo.providers.subscribe(() => void loadProviders());

  // An icon set comes from the daemon once, the first time it is picked; until then Paseo keeps Lucide.
  const requestedIcons = new Set<string>();
  // A set that arrives after the plugin stopped would add a stylesheet nothing removes.
  let stopped = false;
  const loadIcons = () => {
    const set = nativeIcons();
    if (set === "lucide" || iconTwins(set) || requestedIcons.has(set)) return;
    requestedIcons.add(set);
    client
      .rpc(getIconSet, { set })
      .then((twins) => void (stopped || addIconSet(set, twins)))
      .catch((error: unknown) => {
        requestedIcons.delete(set);
        console.warn(`[morphise] Icon set ${set} unavailable, keeping Lucide`, error);
      });
  };

  markRoot(currentPrefs());
  loadIcons();
  let diagrams = currentPrefs().diagrams;
  const unsubscribePrefs = subscribePrefs(() => {
    syncCenter();
    markRoot(currentPrefs());
    loadIcons();
    if (diagrams !== currentPrefs().diagrams) {
      diagrams = currentPrefs().diagrams;
      redrawDiagrams();
    }
  });

  return () => {
    stopped = true;
    unwatchTables();
    unsubscribePrefs();
    unsubscribeProviders();
    unsetCompact();
    unbindPromptKeys();
    unicons();
    uncenter?.();
    unstylePluginViews();
    unrestyle();
    unpaintSidebar();
    unfollowLanguage();
    markRoot(currentPrefs(), true);
  };
};
