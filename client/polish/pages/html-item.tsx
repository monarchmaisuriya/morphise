// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (HtmlItem and its helpers)
import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { inlineImages, localImages, openHtml, storedPage } from "../../../shared/polish/html";
import { readImage } from "../../../shared/polish/image";
import { htmlPage } from "../../../shared/polish/page";
import { Icon } from "../../ui/kit";
import { useT } from "../i18n";
import { usePrefs } from "../prefs";
import { limitFrameHeight } from "./frame";
import type { HtmlData } from "./html-rows";
import { HtmlFrame, lastFrameHeight, useEscapeKey, useHovered, useHtmlTheme, usePopoverRef, windowButtonsInset } from "./web/html-frame";

/** A page an agent published with html_render. Native apps can't run its scripts in a frame, so they name it instead. */
export function HtmlItem({ item, theme }: PluginTimelineItemProps<HtmlData>) {
  const t = useT();
  if (Platform.OS === "web") return item.data.stored === undefined ? <HtmlPage {...item.data} theme={theme} /> : <StoredHtmlPage {...item.data} theme={theme} />;
  return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 4 }}>{t("chat.htmlNative", { title: item.data.title })}</Text>;
}

/** A page Paseo cut to fit the timeline, loaded whole from where html_render stored it. */
function StoredHtmlPage({ stored, theme, ...data }: HtmlData & { theme: PluginTheme }) {
  const t = useT();
  const load = useRpc(storedPage);
  const [html, setHtml] = useState<string | null>();
  const limit = usePrefs().pageHeight;
  useEffect(() => {
    if (!stored) return void setHtml(null);
    let alive = true;
    load({ id: stored }).then(
      (page) => alive && setHtml(page.html),
      () => alive && setHtml(null),
    );
    return () => {
      alive = false;
    };
  }, [stored, load]);
  if (html === undefined) return <View style={{ height: limitFrameHeight(lastFrameHeight(data.html, data.heights), limit) }} />;
  if (html === null) {
    return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 4 }}>{t("chat.htmlGone", { title: data.title })}</Text>;
  }
  return <HtmlPage {...data} html={html} theme={theme} />;
}

/** The page with the local images it names inlined, undefined while they're read; an image that can't be read keeps its path. */
function useInlinedImages(html: string) {
  const read = useRpc(readImage);
  const paths = useMemo(() => [...new Set(localImages(html).map((image) => image.path))], [html]);
  const [done, setDone] = useState<{ source: string; html: string }>();
  useEffect(() => {
    if (!paths.length) return;
    let alive = true;
    void Promise.all(paths.map((path) => read({ path, variant: "original" }).then(({ dataUrl }) => [path, dataUrl] as const, () => undefined))).then((entries) => {
      if (alive) setDone({ source: html, html: inlineImages(html, new Map(entries.filter((entry) => entry !== undefined))) });
    });
    return () => {
      alive = false;
    };
  }, [html, paths, read]);
  if (!paths.length) return html;
  return done?.source === html ? done.html : undefined;
}

/** The page in the chat, with full screen, open in browser and copy on hover. Full screen is a second frame, so the page starts over there. */
function HtmlPage({ html, title, heights, theme }: HtmlData & { theme: PluginTheme }) {
  const page = useInlinedImages(html);
  const c = theme.colors;
  const t = useT();
  const css = useHtmlTheme(c);
  const save = useRpc(openHtml);
  const toast = useToast();
  const box = useRef<View>(null);
  const hovered = useHovered(box);
  const [full, setFull] = useState(false);
  const limit = usePrefs().pageHeight;
  useEscapeKey(full, () => setFull(false));
  // A native popover, so Escape here only leaves full screen (Paseo would also interrupt the agent).
  const fullScreen = usePopoverRef();
  const openInBrowser = () =>
    save({ html: htmlPage(page ?? html, css, true) })
      .then(({ url }) => openExternalUrl(url))
      .catch((error: unknown) => {
        console.warn("[morphise] Opening the page in the browser failed", error);
        toast.error(t("chat.toast.openBrowserFailed"));
      });
  const copy = () => copyText(html).then(() => toast.show(t("chat.toast.copiedHtml"), { variant: "success" }), () => toast.error(t("chat.toast.copyHtmlFailed")));
  const button = (icon: string, label: string, onPress: () => void) => (
    <Pressable
      key={icon}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered: on, pressed }: { hovered?: boolean; pressed: boolean }) => ({ width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: on || pressed ? c.surface2 : c.surface1 })}
    >
      <Icon name={icon} size={14} color={c.foregroundMuted} />
    </Pressable>
  );
  const shared = [button("ExternalLink", t("chat.openInBrowser"), () => void openInBrowser()), button("Copy", t("chat.copyHtml"), () => void copy())];
  return (
    <View ref={box}>
      {/* A stand-in at the frame's last size (or the daemon's measured height) while images load, so the chat doesn't move when the page arrives. */}
      {page === undefined ? <View style={{ height: limitFrameHeight(lastFrameHeight(html, heights), limit) }} /> : <HtmlFrame html={page} id={html} title={title} colors={c} heights={heights} />}
      {/* Hidden, not removed, off hover: the buttons stay where the pointer may land, so showing them never moves what is under it. */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 6, right: 6, flexDirection: "row", gap: 4, opacity: hovered ? 1 : 0 }}>
        {[button("Maximize2", t("chat.fullScreen"), () => setFull(true)), ...shared]}
      </View>
      {full ? (
        <Modal transparent visible animationType="fade" onRequestClose={() => setFull(false)}>
          <View ref={fullScreen} style={{ flex: 1, backgroundColor: c.surface0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 48, paddingLeft: windowButtonsInset(), paddingRight: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ flex: 1, color: c.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
                {title}
              </Text>
              {[...shared, button("X", t("chat.closeFullScreen"), () => setFull(false))]}
            </View>
            <View style={{ flex: 1, paddingVertical: 24, paddingHorizontal: 32 }}>
              <HtmlFrame html={page ?? html} title={title} colors={c} fill onEscape={() => setFull(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
