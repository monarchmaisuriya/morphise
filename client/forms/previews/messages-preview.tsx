// The Messages tab's preview: a chat as Paseo draws it, with the tab's choices applied. Morphise's own parts are drawn by
// their real components (the image row); Paseo's prompt, reply and the selection bar are mocks of what their CSS draws.
import type { PluginTheme } from "@getpaseo/plugin";
import { Image, Platform, View } from "react-native";
import type { ChatSettings } from "../../../shared/chat-view";
import type { Prefs } from "../../../shared/polish/prefs";
import { IMAGES_ROW_KIND } from "../../polish/media/image-rows";
import { ImagesItem } from "../../polish/media/views";
import { PrefsOverride } from "../../polish/prefs";
import { promptClampLines, shownRichText } from "./helpers";
import { MockChat, PromptBubble } from "./mock-chat";
import { PreviewNote, rowProps, PREVIEW_FRAME } from "./parts";
import { RichSample } from "./rich-sample";
import { PREVIEW_IMAGES } from "./samples";
import { SelectionBarMock } from "./selection-bar-mock";
import { DiagramSample } from "./web/diagram-sample";

export function MessagesPreview({ theme, prefs, chat, compact = false }: { theme: PluginTheme; prefs: Prefs; chat: ChatSettings | undefined; compact?: boolean }) {
  const restyled = prefs.nativeStyle === "design";
  // Pele draws only through the restyle; Paseo's mermaid draws either way.
  const diagram = DiagramSample ? <DiagramSample theme={theme} pele={restyled && prefs.diagrams === "pele"} /> : <PreviewNote theme={theme} text="Diagrams preview on desktop and web." />;
  return (
    <PrefsOverride.Provider value={prefs}>
      <View style={{ ...PREVIEW_FRAME, gap: 12 }}>
        {restyled ? null : <PreviewNote theme={theme} text="Rich text styles apply while Restyle Paseo is on (Look tab)." />}
        <MockChat theme={theme} compact={compact}>
          <PromptBubble theme={theme} clamp={promptClampLines(chat)} />
          <RichSample theme={theme} rt={shownRichText(prefs)} diagram={diagram} />
          {prefs.images === "native" ? (
            <Image accessibilityLabel={PREVIEW_IMAGES[0]!.alt} source={{ uri: PREVIEW_IMAGES[0]!.url }} style={{ width: "100%", aspectRatio: 16 / 10, borderRadius: 8 }} resizeMode="cover" />
          ) : (
            <ImagesItem {...rowProps(theme, compact, IMAGES_ROW_KIND, { images: PREVIEW_IMAGES })} />
          )}
          {prefs.selection === "on" ? <SelectionBarMock theme={theme} prefs={prefs} /> : null}
        </MockChat>
        {prefs.selection === "on" && Platform.OS !== "web" ? <PreviewNote theme={theme} text="The selection bar shows on desktop and web." /> : null}
      </View>
    </PrefsOverride.Provider>
  );
}
