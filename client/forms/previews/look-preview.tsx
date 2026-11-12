// The Look tab's preview: a small window (sidebar and chat panel) in the restyle's window style and reply width, the
// working indicator running, a row of icons in the chosen set, and code in the chosen colours; in the profile's theme
// when it has one.
import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Prefs } from "../../../shared/polish/prefs";
import type { Profile } from "../../../shared/profile";
import { t as say, type MessageKey } from "../../polish/i18n";
import { PrefsOverride } from "../../polish/prefs";
import { CodeLine, useStyles } from "../../polish/rows/row";
import { Icon } from "../../ui/kit";
import { loaderTint, mockTheme, replyColumnShare, syntaxShown } from "./helpers";
import { PreviewNote, PREVIEW_FRAME } from "./parts";
import { SAMPLE_CODE } from "./samples";
import { IconSetRow } from "./web/icon-set-row";
import { LoaderTile } from "./web/loader-tile";

const ICONS = ["Folder", "GitBranch", "Terminal", "Search", "Settings", "MessageSquare"] as const;
const SIDEBAR_ROWS = ["Auth middleware", "Billing fix", "Docs pass"];

// A grey bar standing in for a line of text.
function Line({ color, width }: { color: string; width: `${number}%` }) {
  return <View style={{ height: 6, width, borderRadius: 3, backgroundColor: color }} />;
}

function Working({ theme, prefs }: { theme: PluginTheme; prefs: Prefs }) {
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {LoaderTile ? <LoaderTile loader={prefs.loader} size={prefs.loaderSize} tint={loaderTint(prefs.loaderColor, c)} /> : <Icon name="Loader" size={14} color={loaderTint(prefs.loaderColor, c)} />}
      <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{`${say(`prefs.loader.${prefs.loader}` as MessageKey)} · 12s`}</Text>
    </View>
  );
}

function MockWindow({ theme, sidebar, prefs, compact }: { theme: PluginTheme; sidebar: string; prefs: Prefs; compact: boolean }) {
  const c = theme.colors;
  const restyled = prefs.nativeStyle === "design";
  const style = restyled ? prefs.windowStyle : "paseo";
  const floating = style === "floating";
  const gap = floating ? prefs.floatingGap : 0;
  const share = replyColumnShare(restyled ? prefs.replyWidth : "paseo");
  const panel: ReactNode = (
    <View style={{ flex: 1, backgroundColor: c.surface0, ...(floating ? { margin: gap, marginLeft: 0, borderRadius: prefs.floatingRadius, borderWidth: 1, borderColor: c.border, overflow: "hidden" } : null) }}>
      <View style={{ height: 28, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
        <Text style={{ color: c.foreground, fontSize: 11, fontWeight: "500" }}>Auth middleware</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: 10 }}>paseo-api</Text>
      </View>
      <View style={{ flex: 1, paddingVertical: 10, alignItems: "center" }}>
        <View accessibilityLabel="Chat column" style={{ width: `${Math.round(share * 100)}%`, paddingHorizontal: 8, gap: 7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.surface2 }}>
          <View style={{ alignSelf: "flex-end", width: "55%", height: 16, borderRadius: 8, backgroundColor: c.border }} />
          <Line color={c.foregroundMuted} width="92%" />
          <Line color={c.foregroundMuted} width="84%" />
          <Line color={c.foregroundMuted} width="60%" />
          <Working theme={theme} prefs={prefs} />
        </View>
      </View>
    </View>
  );
  return (
    <View style={{ height: compact ? 170 : 190, flexDirection: "row", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: "hidden", backgroundColor: floating ? sidebar : c.surface0 }}>
      <View style={{ width: compact ? 88 : 128, paddingTop: 10, paddingHorizontal: 8, gap: 4, backgroundColor: sidebar, borderRightWidth: style === "paseo" ? 1 : 0, borderRightColor: c.border, ...(floating ? { marginRight: gap } : null) }}>
        {SIDEBAR_ROWS.map((name, index) => (
          <View key={name} style={{ height: 22, justifyContent: "center", paddingHorizontal: 6, borderRadius: 6, backgroundColor: index === 0 ? c.surface1 : "transparent" }}>
            <Text style={{ color: index === 0 ? c.foreground : c.foregroundMuted, fontSize: 11 }} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ))}
      </View>
      {panel}
    </View>
  );
}

function CodeSample({ theme, prefs }: { theme: PluginTheme; prefs: Prefs }) {
  const s = useStyles(theme);
  const shown = syntaxShown(prefs.syntax, theme.colors.surface0);
  return (
    <View style={{ gap: 6 }}>
      <View style={s.block}>
        <View style={s.blockBody}>
          {SAMPLE_CODE.map((line, index) => (
            <CodeLine key={index} text={line} theme={theme} style={s.code} />
          ))}
        </View>
      </View>
      {shown === "other-appearance" ? <PreviewNote theme={theme} text="These colours are made for the other kind of theme (light or dark), so code shows plain here." /> : null}
    </View>
  );
}

export function LookPreview({ theme, prefs, profileTheme, compact = false }: { theme: PluginTheme; prefs: Prefs; profileTheme: Profile["theme"]; compact?: boolean }) {
  const { theme: shown, sidebar } = mockTheme(theme, profileTheme);
  const restyled = prefs.nativeStyle === "design";
  const c = shown.colors;
  const swapped = restyled && prefs.iconSet !== "lucide" ? prefs.iconSet : null;
  return (
    <PrefsOverride.Provider value={prefs}>
      <View style={{ ...PREVIEW_FRAME, gap: 12 }}>
        {profileTheme ? <PreviewNote theme={theme} text={`In ${profileTheme.name}, this profile's theme.`} /> : null}
        {restyled ? null : <PreviewNote theme={theme} text="Window, reply width, working indicator and icon set apply while Restyle Paseo is on." />}
        {restyled && !LoaderTile ? <PreviewNote theme={theme} text="The working indicator runs here on desktop and web." /> : null}
        <MockWindow theme={shown} sidebar={sidebar} prefs={prefs} compact={compact} />
        <View style={{ gap: 12, padding: 12, borderRadius: 10, backgroundColor: c.surface0, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
          {swapped === null ? (
            <View style={{ flexDirection: "row", gap: 14 }}>
              {ICONS.map((name) => (
                <Icon key={name} name={name} size={16} color={c.foreground} />
              ))}
            </View>
          ) : IconSetRow ? (
            <IconSetRow theme={shown} set={swapped} names={ICONS} />
          ) : (
            <PreviewNote theme={shown} text="Icon sets show on desktop and web." />
          )}
          <CodeSample theme={shown} prefs={prefs} />
        </View>
      </View>
    </PrefsOverride.Provider>
  );
}
