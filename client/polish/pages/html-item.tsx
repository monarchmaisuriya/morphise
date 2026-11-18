// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (HtmlItem and its helpers)
import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, type PluginClientContext, useAgent, useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Text, View } from "react-native";
import { inlineImages, keepPage, localImages, openHtml, storedPage } from "../../../shared/polish/html";
import { readPageImage } from "../../../shared/polish/image";
import { htmlPage } from "../../../shared/polish/page";
import { Icon, IconButton, type Tokens, useTokens } from "../../ui/kit";
import { cannotHover, downloadFile } from "../../web";
import type { PolishContext } from "../context";
import { appendToComposer } from "../selection/actions";
import { useReplaced } from "./replaced";
import { useT } from "../i18n";
import { usePrefs } from "../prefs";
import { limitFrameHeight } from "./frame";
import type { HtmlData } from "./html-rows";
import { HtmlFrame, lastFrameHeight, type SvgExporter, useEscapeKey, useHovered, useHtmlTheme, usePopoverRef, windowButtonsInset } from "./web/html-frame";
import { fontSize } from "../../../shared/design/tokens";

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
export function HtmlItem({ item, theme, layout, agentId, actions = null }: PluginTimelineItemProps<HtmlData> & { actions?: ChatPageActions | null }) {
  const t = useT();
  const compact = layout?.compact ?? false;
  if (Platform.OS === "web") return item.data.stored === undefined ? <HtmlPage {...item.data} agentId={agentId} theme={theme} compact={compact} actions={actions} /> : <StoredHtmlPage {...item.data} agentId={agentId} theme={theme} compact={compact} actions={actions} />;
  return <Text style={{ color: theme.colors.foregroundMuted, fontSize: fontSize.base, paddingVertical: 4 }}>{t("chat.htmlNative", { title: item.data.title })}</Text>;
}

/** A page Paseo cut to fit the timeline, loaded whole from where html_render stored it. */
function StoredHtmlPage({ stored, theme, compact, actions, ...data }: HtmlData & { agentId: string; theme: PluginTheme; compact: boolean; actions: ChatPageActions | null }) {
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
    return <Text style={{ color: theme.colors.foregroundMuted, fontSize: fontSize.base, paddingVertical: 4 }}>{t("chat.htmlGone", { title: data.title })}</Text>;
  }
  return <HtmlPage {...data} html={html} theme={theme} compact={compact} actions={actions} />;
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

/**
 * The page in the chat, under a strip with its title and its buttons (full screen, save, download, open in browser, copy), each with a tooltip.
 * The strip is always there and the buttons only fade in on hover, so they never cover the page or move it. Full screen is a second frame, so
 * the page starts over there.
 */
function HtmlPage({ html, title, heights, agentId, theme, compact, id, actions }: HtmlData & { agentId: string; theme: PluginTheme; compact: boolean; actions: ChatPageActions | null }) {
  const page = useInlinedImages(html, agentId);
  const c = theme.colors;
  const tk = useTokens(theme, compact);
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
  const button = (icon: string, label: string, onPress: () => void) => <IconButton key={icon} t={tk} icon={icon} label={label} onPress={onPress} size="sm" />;
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
        <Text style={{ flex: 1, color: c.foregroundMuted, fontSize: fontSize.base }} numberOfLines={1}>
          {title} · {t("chat.updatedBelow")}
        </Text>
        {button("Maximize2", t("chat.fullScreen"), () => setFull(true))}
      </View>
    );
  }
  return (
    <View ref={box}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: compact ? 36 : 28 }}>
        <Icon name="AppWindow" size={13} color={c.foregroundMuted} />
        <Text style={{ flex: 1, minWidth: 0, color: c.foregroundMuted, fontSize: fontSize.sm }} numberOfLines={1}>
          {title}
        </Text>
        {/* Hidden, not removed, off hover: the buttons keep their place, so showing them never moves what is under the pointer. */}
        <View style={{ flexDirection: "row", gap: 2, opacity: hovered || cannotHover() ? 1 : 0 }}>{[button("Maximize2", t("chat.fullScreen"), () => setFull(true)), ...shared]}</View>
      </View>
      {/* A stand-in at the frame's last size (or the daemon's measured height) while images load, so the chat doesn't move when the page arrives. */}
      {page === undefined ? <View style={{ height: limitFrameHeight(lastFrameHeight(html, heights), limit) }} /> : <HtmlFrame html={page} id={html} title={title} colors={c} compact={compact} heights={heights} onAsk={onAsk} exporter={exporter} />}
      {full ? (
        <Modal transparent visible animationType="fade" onRequestClose={() => setFull(false)}>
          <View ref={fullScreen} style={{ flex: 1, backgroundColor: c.surface0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 48, paddingLeft: windowButtonsInset(), paddingRight: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ flex: 1, color: c.foreground, fontSize: fontSize.base, fontWeight: "500" }} numberOfLines={1}>
                {title}
              </Text>
              {[...shared, button("X", t("chat.closeFullScreen"), () => setFull(false))]}
            </View>
            <View style={{ flex: 1, paddingVertical: 24, paddingHorizontal: 32 }}>
              <HtmlFrame html={page ?? html} title={title} colors={c} compact={compact} fill onEscape={() => setFull(false)} onAsk={onAsk} exporter={replaced ? exporter : undefined} />
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
export function SavedPageViewer({ id, title, t: tk, onClose }: { id: string; title: string; t: Tokens; onClose(): void }) {
  const colors = tk.c;
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
          <Text style={{ flex: 1, color: colors.foreground, fontSize: fontSize.base, fontWeight: "500" }} numberOfLines={1}>
            {title}
          </Text>
          <IconButton t={tk} icon="X" label={t("chat.closeFullScreen")} onPress={onClose} size="sm" />
        </View>
        <View style={{ flex: 1, paddingVertical: 24, paddingHorizontal: 32 }}>
          {html === undefined ? null : html === null ? (
            <Text style={{ color: colors.foregroundMuted, fontSize: fontSize.base }}>{t("chat.htmlGone", { title })}</Text>
          ) : Platform.OS === "web" ? (
            <HtmlFrame html={html} title={title} colors={colors} compact={tk.compact} fill onEscape={onClose} />
          ) : (
            <Text style={{ color: colors.foregroundMuted, fontSize: fontSize.base }}>{t("chat.htmlNative", { title })}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
