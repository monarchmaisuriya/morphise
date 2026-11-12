// The Pages tab's preview: a sample page drawn by the pages part's own row (HtmlItem and its frame), with the tab's
// choices applied through the preferences it reads. Phones name the page instead, as they do in a chat.
import type { PluginTheme } from "@getpaseo/plugin";
import { Platform, View } from "react-native";
import type { Prefs } from "../../../shared/polish/prefs";
import { HtmlItem } from "../../polish/pages/html-item";
import { HTML_ROW_KIND } from "../../polish/pages/html-rows";
import { PrefsOverride } from "../../polish/prefs";
import { pageHeightNote } from "./helpers";
import { PreviewNote, rowProps } from "./parts";
import { SAMPLE_PAGE } from "./samples";

export function PagesPreview({ theme, prefs, compact = false }: { theme: PluginTheme; prefs: Prefs; compact?: boolean }) {
  const web = Platform.OS === "web";
  return (
    <PrefsOverride.Provider value={prefs}>
      <View style={{ gap: 10 }}>
        {prefs.html === "on" ? null : <PreviewNote theme={theme} text="Pages are off; this is how one would look." />}
        <PreviewNote theme={theme} text={web ? pageHeightNote(prefs.pageHeight) : "Pages preview on desktop and web; phones show the page's name, as below."} />
        <View style={{ padding: compact ? 10 : 16, borderRadius: 12, backgroundColor: theme.colors.surface0, borderWidth: 1, borderColor: theme.colors.border }}>
          <HtmlItem {...rowProps(theme, compact, HTML_ROW_KIND, { title: "API latency, last 24 hours", html: SAMPLE_PAGE })} />
        </View>
      </View>
    </PrefsOverride.Provider>
  );
}
