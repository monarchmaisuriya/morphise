// A row of icons drawn in a swapped icon set, from the twins the daemon sent (client/polish/web/icons.ts); an icon
// without a twin stays Lucide, as Paseo's own icons do. Web and desktop only.
import type { PluginTheme } from "@getpaseo/plugin";
import { createElement, useSyncExternalStore } from "react";
import { Platform, Text, View } from "react-native";
import type { IconSet } from "../../../../shared/polish/prefs";
import { Icon } from "../../../ui/kit";
import { iconTwins, subscribeIconSets } from "../../../polish/web/icons";

const SIZE = 16;

function TwinRow({ theme, set, names }: { theme: PluginTheme; set: Exclude<IconSet, "lucide">; names: readonly string[] }) {
  const c = theme.colors;
  const twins = useSyncExternalStore(subscribeIconSets, () => iconTwins(set));
  if (!twins) return <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>This set shows here once it has downloaded (pick it with Restyle Paseo on).</Text>;
  return (
    <View style={{ flexDirection: "row", gap: 14 }}>
      {names.map((name) =>
        twins[name] ? (
          <View key={name} accessibilityLabel={name}>
            {createElement("svg", { viewBox: "0 0 24 24", width: SIZE, height: SIZE, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", style: { display: "block", color: c.foreground }, dangerouslySetInnerHTML: { __html: twins[name] } })}
          </View>
        ) : (
          <Icon key={name} name={name} size={SIZE} color={c.foreground} />
        ),
      )}
    </View>
  );
}

export const IconSetRow = Platform.OS === "web" ? TwinRow : null;
