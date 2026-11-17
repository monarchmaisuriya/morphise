// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (HtmlItem and its helpers)
import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, type PluginClientContext, useAgent, useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { inlineImages, keepPage, localImages, openHtml, storedPage } from "../../../shared/polish/html";
import { readPageImage } from "../../../shared/polish/image";
import { htmlPage } from "../../../shared/polish/page";
import { Icon } from "../../ui/kit";
import { downloadFile } from "../../web";
import type { PolishContext } from "../context";
import { appendToComposer } from "../selection/actions";
import { useReplaced } from "./replaced";
import { useT } from "../i18n";
import { usePrefs } from "../prefs";
import { limitFrameHeight } from "./frame";
import type { HtmlData } from "./html-rows";
import { HtmlFrame, lastFrameHeight, type SvgExporter, useEscapeKey, useHovered, useHtmlTheme, usePopoverRef, windowButtonsInset } from "./web/html-frame";

// What a page row can do in a chat beyond showing the page: fill the chat's message box (Morphise.ask) and save the page
// to the Workbench's Bookmarks. Settings' preview has neither.
export interface PageActions {
  composers: PluginClientContext["composers"];
  bookmarkPage: PolishContext["bookmarkPage"];
}

// The actions with the chat's workspace, for Save. Looked up only by the chat's own row (ChatHtmlItem): plugin state hooks
// (useAgent) run only inside a plugin host, and Settings' preview draws the same row outside one.
interface ChatPageActions extends PageActions {
  workspaceId: string | null;
}

// A file name from a page's title.
const fileName = (title: string, extension: string) => `${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page"}.${extension}`;

/** The chat's page row, with what a page can do in a chat (ask, save). */
export function createHtmlItem(actions: PageActions) {
  return function ChatHtmlItem(props: PluginTimelineItemProps<HtmlData>) {
    const workspaceId = useAgent(props.agentId, (agent) => agent.workspaceId ?? null) ?? null;
    return <HtmlItem {...props} actions={{ ...actions, workspaceId }} />;
  };
}

/** A page an agent published with html_render. Native apps can't run its scripts in a frame, so they name it instead. */
export function HtmlItem({ item, theme, agentId, actions = null }: PluginTimelineItemProps<HtmlData> & { actions?: ChatPageActions | null }) {
  const t = useT();
  if (Platform.OS === "web") return item.data.stored === undefined ? <HtmlPage {...item.data} agentId={agentId} theme={theme} actions={actions} /> : <StoredHtmlPage {...item.data} agentId={agentId} theme={theme} actions={actions} />;
  return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 4 }}>{t("chat.htmlNative", { title: item.data.title })}</Text>;
}

/** A page Paseo cut to fit the timeline, loaded whole from where html_render stored it. */
function StoredHtmlPage({ stored, theme, actions, ...data }: HtmlData & { agentId: string; theme: PluginTheme; actions: ChatPageActions | null }) {
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
  return <HtmlPage {...data} html={html} theme={theme} actions={actions} />;
}

/**
 * The page with the local images it names inlined, undefined while they're read; an image that can't be read keeps its path.
 * The daemon serves only images inside the folder of the agent that made the page.
 */
function useInlinedImages(html: string, agentId: string) {
  const read = useRpc(readPageImage);
  const paths = useMemo(() => [...new Set(localImages(html).map((image) => image.path))], [html]);
  const [done, setDone] = useState<{ source: string; html: string }>();
  useEffect(() => {
    if (!paths.length) return;
    let alive = true;
    void Promise.all(paths.map((path) => read({ path, agentId }).then(({ dataUrl }) => [path, dataUrl] as const, () => undefined))).then((entries) => {
      if (alive) setDone({ source: html, html: inlineImages(html, new Map(entries.filter((entry) => entry !== undefined))) });
    });
    return () => {
      alive = false;
    };
  }, [html, paths, read, agentId]);
  if (!paths.length) return html;
  return done?.source === html ? done.html : undefined;
}

/** The page in the chat, with full screen, open in browser and copy on hover. Full screen is a second frame, so the page starts over there. */
function HtmlPage({ html, title, heights, agentId, theme, id, actions }: HtmlData & { agentId: string; theme: PluginTheme; actions: ChatPageActions | null }) {
  const page = useInlinedImages(html, agentId);
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
  const replaced = useReplaced(id);
  const keep = useRpc(keepPage);
  const exporter = useRef<SvgExporter["current"]>(null);
  const downloadHtml = () => {
    if (!downloadFile(fileName(title, "html"), htmlPage(page ?? html, css, true), "text/html")) toast.error(t("chat.toast.downloadFailed"));
  };
  const downloadSvg = () =>
    void (exporter.current?.() ?? Promise.resolve(null)).then((svg) => {
      if (!svg) return toast.show(t("chat.toast.noSvg"));
      if (!downloadFile(fileName(title, "svg"), svg, "image/svg+xml")) toast.error(t("chat.toast.downloadFailed"));
    });
  // Keeps the page on the daemon first, so the bookmark never points at a page the 30-day cleanup removes.
  const savePage = (pageId: string, { bookmarkPage: bookmark, workspaceId }: ChatPageActions) =>
    void keep({ id: pageId, keep: true })
      .then(({ kept }) => {
        if (!kept) throw new Error("the page is no longer stored");
        return bookmark({ agentId, workspaceId, page: { id: pageId, title } });
      })
      .then(
        () => toast.show(t("chat.toast.savedPage"), { variant: "success" }),
        (error: unknown) => toast.error(t("chat.toast.savePageFailed", { error: error instanceof Error ? error.message : String(error) })),
      );
  const onAsk = (text: string) => {
    if (!actions) return toast.show(t("chat.toast.askInChat"));
    void appendToComposer(actions.composers, agentId, text).catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
  };
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
  const shared = [
    ...(actions && id ? [button("BookmarkPlus", t("chat.savePage"), () => savePage(id, actions))] : []),
    button("Download", t("chat.downloadHtml"), downloadHtml),
    button("FileImage", t("chat.downloadSvg"), downloadSvg),
    button("ExternalLink", t("chat.openInBrowser"), () => void openInBrowser()),
    button("Copy", t("chat.copyHtml"), () => void copy()),
  ];
  // A page a later one replaced: one line, with full screen to look back at it.
  if (replaced && !full) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
        <Icon name="AppWindow" size={14} color={c.foregroundMuted} />
        <Text style={{ flex: 1, color: c.foregroundMuted, fontSize: 13 }} numberOfLines={1}>
          {title} · {t("chat.updatedBelow")}
        </Text>
        {button("Maximize2", t("chat.fullScreen"), () => setFull(true))}
      </View>
    );
  }
  return (
    <View ref={box}>
      {/* A stand-in at the frame's last size (or the daemon's measured height) while images load, so the chat doesn't move when the page arrives. */}
      {page === undefined ? <View style={{ height: limitFrameHeight(lastFrameHeight(html, heights), limit) }} /> : <HtmlFrame html={page} id={html} title={title} colors={c} heights={heights} onAsk={onAsk} exporter={exporter} />}
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
              <HtmlFrame html={page ?? html} title={title} colors={c} fill onEscape={() => setFull(false)} onAsk={onAsk} exporter={replaced ? exporter : undefined} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/**
 * A page saved to the Workbench's Bookmarks, full window: loaded from the copy the daemon keeps for the bookmark. Web and desktop only, as
 * pages are in the chat; a page that's gone says so.
 */
export function SavedPageViewer({ id, title, colors, onClose }: { id: string; title: string; colors: PluginTheme["colors"]; onClose(): void }) {
  const t = useT();
  const load = useRpc(storedPage);
  const [html, setHtml] = useState<string | null>();
  const fullScreen = usePopoverRef();
  useEscapeKey(true, onClose);
  useEffect(() => {
    let alive = true;
    load({ id }).then(
      (page) => alive && setHtml(page.html),
      () => alive && setHtml(null),
    );
    return () => {
      alive = false;
    };
  }, [id, load]);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View ref={fullScreen} style={{ flex: 1, backgroundColor: colors.surface0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 48, paddingLeft: windowButtonsInset(), paddingRight: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("chat.closeFullScreen")} onPress={onClose} style={{ width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
            <Icon name="X" size={14} color={colors.foregroundMuted} />
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingVertical: 24, paddingHorizontal: 32 }}>
          {html === undefined ? null : html === null ? (
            <Text style={{ color: colors.foregroundMuted, fontSize: 13 }}>{t("chat.htmlGone", { title })}</Text>
          ) : Platform.OS === "web" ? (
            <HtmlFrame html={html} title={title} colors={colors} fill onEscape={onClose} />
          ) : (
            <Text style={{ color: colors.foregroundMuted, fontSize: 13 }}>{t("chat.htmlNative", { title })}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
