// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): the image parts of client/views.tsx
// (Thumbnail, Lightbox, ImageStack, ImagesItem, StackViewerHost). Morphise keeps Chat Polish's own viewer and never
// loads Paseo's internal lightbox.
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { readImage } from "../../../shared/polish/image";
import { Icon } from "../../ui/kit";
import { useT } from "../i18n";
import { usePrefs } from "../prefs";
import { usePopoverRef } from "../pages/web/html-frame";
import type { ImagesRow } from "./image-rows";
import { loadImage } from "./images";
import { closeStackViewer, setStackViewerIndex, useStackViewer, useStackViewerHost } from "./stack-viewer";

type Images = Array<{ alt: string; url: string }>;

function useImage(url: string, variant: "thumbnail" | "original" = "original") {
  const read = useRpc(readImage);
  const key = `${variant}:${url}`;
  const [state, setState] = useState<{ key?: string; uri?: string; failed?: boolean }>({});
  useEffect(() => {
    let alive = true;
    loadImage(url, variant, read).then(
      (uri) => alive && setState({ key, uri }),
      () => alive && setState({ key, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [url, variant, key, read]);
  return state.key === key ? state : {};
}

// A thumbnail opens full size; web only (cursor isn't a native style).
const ZOOM_CURSOR = (Platform.OS === "web" ? { cursor: "zoom-in" } : {}) as object;
const THUMB = { small: { width: 200, height: 128 }, large: { width: 320, height: 200 }, xlarge: { width: 480, height: 300 } };
/** The thumbnail size for the Images choice (Inline uses Small where the plugin still draws one). */
const thumbSize = (images: string) => THUMB[images === "large" || images === "xlarge" ? images : "small"];

function Thumbnail({ alt, label, url, theme, onOpen, edge, focusable = true }: { alt: string; label?: string; url: string; theme: PluginTheme; onOpen(): void; edge?: string; focusable?: boolean }) {
  const c = theme.colors;
  const t = useT();
  const { uri, failed } = useImage(url, "thumbnail");
  const size = thumbSize(usePrefs().images);
  const frame = [size, { borderRadius: 8, borderWidth: edge ? 1 : StyleSheet.hairlineWidth, borderColor: edge ?? c.border, backgroundColor: c.surface1, overflow: "hidden" as const }, ZOOM_CURSOR];
  if (!uri) {
    return (
      <View style={[frame, { alignItems: "center", justifyContent: "center", gap: 6 }]}>
        <Icon name={failed ? "ImageOff" : "Image"} size={16} color={c.foregroundMuted} />
        <Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 17 }}>{failed ? t("chat.imageUnavailable") : t("chat.loadingImage")}</Text>
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={label ?? t("chat.openImage", { alt })} onPress={onOpen} focusable={focusable} style={frame}>
      <Image source={{ uri }} style={size} resizeMode="cover" />
    </Pressable>
  );
}

/**
 * The viewer's image at index without a blank frame between images: the last image stays (stale) until the next is
 * ready, and the neighbours load ahead so ← → usually swap at once.
 */
function useSteadyImage(images: Images, index: number) {
  const n = images.length;
  const current = useImage(images[index]!.url);
  const next = useImage(images[(index + 1) % n]!.url).uri;
  const prev = useImage(images[(index + n - 1) % n]!.url).uri;
  useEffect(() => {
    // Best effort: a neighbour that fails to load reports it when it's shown.
    for (const uri of [next, prev]) if (uri) void Image.prefetch(uri).catch(() => {});
  }, [next, prev]);
  const last = useRef<{ uri?: string; failed?: boolean }>({});
  if (current.uri || current.failed) last.current = current;
  return { ...last.current, stale: !current.uri && !current.failed };
}

type KeyTarget = { addEventListener(type: "keydown", l: (e: { key: string; preventDefault(): void }) => void): void; removeEventListener(type: "keydown", l: (e: { key: string; preventDefault(): void }) => void): void };

/** A round control on the lightbox's dark chrome, the same in every theme. */
function LightboxButton({ icon, label, onPress, size = 32 }: { icon: string; label: string; onPress(): void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({ width: size, height: size, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: `rgba(255,255,255,${pressed ? 0.2 : hovered ? 0.14 : 0.08})` })}
    >
      <Icon name={icon} size={size > 32 ? 18 : 16} color="#ffffff" />
    </Pressable>
  );
}

/**
 * Full-window viewer for a reply's images: fitted to the window, click (or Z) for actual size with scrolling, arrows between
 * images, Esc or a click on the backdrop to close.
 */
function Lightbox({ images, index, onIndex, onClose }: { images: Images; index: number; onIndex(i: number): void; onClose(): void }) {
  const image = images[index]!;
  const t = useT();
  const { uri, failed, stale } = useSteadyImage(images, index);
  const win = useWindowDimensions();
  const [natural, setNatural] = useState<{ w: number; h: number }>();
  const [zoomed, setZoomed] = useState(false);
  const many = images.length > 1;
  const go = useCallback((step: number) => (setZoomed(false), onIndex((index + step + images.length) % images.length)), [index, images.length, onIndex]);
  // The previous size stays until the next image is measured, so the frame doesn't collapse between images.
  useEffect(() => {
    if (uri) Image.getSize(uri, (w, h) => setNatural({ w, h }), () => setNatural(undefined));
  }, [uri]);
  useEffect(() => {
    const target = Platform.OS === "web" ? (globalThis as unknown as KeyTarget) : undefined;
    if (!target) return;
    const onKey = (e: { key: string; preventDefault(): void }) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) go(1);
      else if (e.key === "ArrowLeft" && many) go(-1);
      else if (e.key === "z" || e.key === "Z") setZoomed((z) => !z);
      else return;
      e.preventDefault();
    };
    target.addEventListener("keydown", onKey);
    return () => target.removeEventListener("keydown", onKey);
  }, [go, many, onClose]);
  // Fitted: the largest size that leaves room for the chrome, never above actual size except that a tiny image grows to 320pt.
  // Zoomed: actual size, or twice the fitted size for an image already shown whole, so a click always magnifies.
  const room = { w: win.width - (many ? 160 : 64), h: win.height - 136 };
  const fit = natural ? Math.min(Math.max(1, 320 / Math.max(natural.w, natural.h)), room.w / natural.w, room.h / natural.h) : 1;
  const scale = zoomed ? Math.max(1, fit * 2) : fit;
  const shown = natural ? { width: Math.round(natural.w * scale), height: Math.round(natural.h * scale) } : { width: Math.min(room.w, 640), height: Math.min(room.h, 400) };
  const chrome = { color: "#ffffff", fontSize: 13 } as const;
  // A native popover, so Escape here only closes the viewer (Paseo would also interrupt the agent).
  const viewer = usePopoverRef();
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View ref={viewer} style={[{ flex: 1, backgroundColor: "rgba(8,9,11,0.92)" }, Platform.OS === "web" ? ({ backdropFilter: "blur(12px)" } as object) : null]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("chat.close")} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View pointerEvents="box-none" style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 56, paddingHorizontal: 16 }}>
          <View pointerEvents="none" style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <Text style={[chrome, { fontWeight: "500", flexShrink: 1 }]} numberOfLines={1}>
              {image.alt || t("chat.image")}
            </Text>
            {natural ? <Text style={[chrome, { fontSize: 12, opacity: 0.55, fontVariant: ["tabular-nums"] }]}>{`${natural.w} × ${natural.h}`}</Text> : null}
            {many ? <Text style={[chrome, { fontSize: 12, opacity: 0.55, fontVariant: ["tabular-nums"] }]}>{`${index + 1} / ${images.length}`}</Text> : null}
          </View>
          {natural && fit < 1 ? <Text style={[chrome, { fontSize: 12, opacity: 0.55, fontVariant: ["tabular-nums"] }]}>{`${Math.round(scale * 100)}%`}</Text> : null}
          <LightboxButton icon={zoomed ? "ZoomOut" : "ZoomIn"} label={zoomed ? t("chat.fitToWindow") : t("chat.zoomIn")} onPress={() => setZoomed((z) => !z)} />
          <LightboxButton icon="X" label={t("chat.close")} onPress={onClose} />
        </View>
        <ScrollView style={{ flex: 1 }} horizontal={false} contentContainerStyle={{ flexGrow: 1 }}>
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
            {/* The scroll area covers the backdrop, so it closes on a press itself; the image's own press zooms instead. */}
            <Pressable
              accessibilityLabel={t("chat.close")}
              onPress={onClose}
              style={{ flexGrow: 1, minWidth: win.width, minHeight: win.height - 56, alignItems: "center", justifyContent: "center", paddingHorizontal: many ? 80 : 32, paddingBottom: 56, cursor: "default" } as object}
            >
              {uri ? (
                <Pressable accessibilityRole="imagebutton" accessibilityLabel={zoomed ? t("chat.fitToWindow") : t("chat.zoomIn")} onPress={() => setZoomed((z) => !z)} style={{ cursor: zoomed ? "zoom-out" : "zoom-in" } as object}>
                  {/* Dimmed while it's still the previous image and the next one loads. */}
                  <Image source={{ uri }} style={[shown, { borderRadius: 6, opacity: stale ? 0.45 : 1 }]} resizeMode="contain" />
                </Pressable>
              ) : (
                <View pointerEvents="none" style={[shown, { alignItems: "center", justifyContent: "center", gap: 8 }]}>
                  <Icon name={failed ? "ImageOff" : "Image"} size={20} color="rgba(255,255,255,0.5)" />
                  <Text style={[chrome, { opacity: 0.5 }]}>{failed ? t("chat.imageUnavailable") : t("chat.loadingImage")}</Text>
                </View>
              )}
            </Pressable>
          </ScrollView>
        </ScrollView>
        {many ? (
          <>
            <View pointerEvents="box-none" style={{ position: "absolute", left: 20, top: 0, bottom: 0, justifyContent: "center" }}>
              <LightboxButton icon="ChevronLeft" label={t("chat.previousImage")} onPress={() => go(-1)} size={40} />
            </View>
            <View pointerEvents="box-none" style={{ position: "absolute", right: 20, top: 0, bottom: 0, justifyContent: "center" }}>
              <LightboxButton icon="ChevronRight" label={t("chat.nextImage")} onPress={() => go(1)} size={40} />
            </View>
          </>
        ) : null}
        <Text pointerEvents="none" style={[chrome, { position: "absolute", bottom: 14, alignSelf: "center", fontSize: 12, color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(8,9,11,0.7)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" }]}>
          {Platform.OS === "web"
            ? t("chat.lightboxHint", { action: t(zoomed ? "chat.lightboxFit" : "chat.lightboxZoom"), browse: many ? t("chat.lightboxBrowse") : "" })
            : t("chat.lightboxHintTap")}
        </Text>
      </View>
    </Modal>
  );
}

// Where each card behind a closed stack's face sits: right, up, and turned (cards from the fourth on share the third's
// spot, hidden).
const FAN = { x: 9, y: -6.5, deg: 2.5 };
const STACK_GAP = 8;
// Room above the cards for the fan (the third card rises 13pt), and below for the row's scrollbar.
const STACK_TOP = 16;
const STACK_BOTTOM = 12;
// Hover intent: a pointer crossing a stack while scrolling doesn't spread it.
const STACK_HOVER_MS = 150;
const STACK_FOLD_MS = 110;
// Web styles for these (web/stack-cards.ts): the deal, fold and fan animations, the lift transition and the thin scrollbar.
const STACK_LIFT = { dataSet: { cpStackLift: "" } } as object;
const STACK_SCROLL = { dataSet: { cpStackScroll: "" } } as object;
type UpTarget = { addEventListener(type: "pointerup", listener: () => void, options: { once: true }): void };

/** A count over a card, in the theme's colors. */
function StackBadge({ text, theme }: { text: string; theme: PluginTheme }) {
  const c = theme.colors;
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface2 }}>
      <Text style={{ color: c.foreground, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{text}</Text>
    </View>
  );
}

/**
 * Two or more images as a stack: the first with the next two fanned behind it and a "+N" badge. Hovering (web), or a
 * press with Spread on: Click, deals every image into its slot in one row that scrolls sideways; pressing an image there
 * opens the viewer and keeps the row open (no longer folding when the pointer leaves) until the fold button, top right.
 * In hover mode touch has no hover, so a tap opens the viewer at the tapped image (usually the face); in Click mode the
 * fold button shows on any open stack, since touch has no pointer leaving. Only cards in view animate, and only by
 * a few points. The height never changes (the top strip the fan sticks into and room for the scrollbar are reserved).
 */
function ImageStack({ images, theme, onOpen }: { images: Images; theme: PluginTheme; onOpen(i: number): void }) {
  const c = theme.colors;
  const prefs = usePrefs();
  const t = useT();
  const size = thumbSize(prefs.images);
  const byClick = prefs.imageStackOpen === "click";
  const [width, setWidth] = useState(0);
  // closed → open → folding (row cards shrink toward the first, which sits where the pile's face will) → settling (the
  // two cards behind the face fan out from under it) → closed.
  const [phase, setPhase] = useState<"closed" | "open" | "folding" | "settling">("closed");
  const spread = phase === "open" || phase === "folding";
  const [pinned, setPinned] = useState(false);
  const scroll = useRef<{ scrollTo(options: { x: number; animated: boolean }): void } | null>(null);
  // Folded with its button: the pointer is still over the stack, so hover mustn't reopen it until the pointer leaves.
  const held = useRef(false);
  // Whether the pointer is over the stack, for a scrollbar drag that ends outside it.
  const inside = useRef(false);
  // Just opened: the card under the pointer that opened it isn't lit (lighting it dimmed every card as it dealt in); the
  // highlight starts once the pointer moves to another card. -2: no move yet since opening; -1: lighting as usual.
  const quiet = useRef(-1);
  // The card under the pointer in the spread row: raised and ringed, the others dimmed.
  const [active, setActive] = useState<number>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const step = size.width + STACK_GAP;
  const inView = Math.max(1, Math.ceil(width / step));
  const open = () => {
    clearTimeout(timer.current);
    if (phase !== "open") quiet.current = -2;
    setPhase("open");
  };
  const fold = () => {
    if (phase !== "open") return;
    clearTimeout(timer.current);
    setPinned(false);
    // The dimmed cards stay dimmed while they fold away; undimming first made them flash bright before fading out.
    setPhase("folding");
    // A scrolled row glides back to the start while its cards fold, so the face is in place when the pile returns.
    scroll.current?.scrollTo({ x: 0, animated: true });
    timer.current = setTimeout(() => {
      setActive(undefined);
      setPhase("settling");
      timer.current = setTimeout(() => setPhase("closed"), 170);
    }, STACK_FOLD_MS);
  };
  const height = STACK_TOP + size.height + STACK_BOTTOM;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: 11 - 2, height }}>
      <View
        onPointerEnter={() => {
          inside.current = true;
          if (byClick || phase === "open" || held.current) return;
          // Back in while it folds: it opens again at once.
          if (phase === "folding") return open();
          clearTimeout(timer.current);
          timer.current = setTimeout(open, STACK_HOVER_MS);
        }}
        onPointerLeave={(e) => {
          inside.current = false;
          held.current = false;
          // Pinned rows stay (undimmed); in Click mode a touch "leaves" right after the tap that spread it, so there only a
          // mouse moving away folds the stack.
          if (pinned) return setActive(undefined);
          if (byClick && e.nativeEvent.pointerType !== "mouse") return;
          // Dragging the scrollbar out of the box: fold on release, and only if the pointer is still outside.
          if (phase === "open" && e.nativeEvent.buttons && Platform.OS === "web") {
            (globalThis as unknown as UpTarget).addEventListener("pointerup", () => setTimeout(() => inside.current || fold(), 0), { once: true });
            return;
          }
          if (phase === "open") fold();
          else if (phase === "closed") clearTimeout(timer.current);
        }}
        // Closed, only the pile takes hover; open, the whole row does. One cursor over all of it, gaps included, or it
        // flickers between zoom-in and the arrow as the pointer crosses the row.
        style={[{ height, width: spread ? "100%" : size.width + 2 * FAN.x }, ZOOM_CURSOR]}
      >
        <ScrollView
          ref={scroll as never}
          {...STACK_SCROLL}
          horizontal
          scrollEnabled={spread}
          showsHorizontalScrollIndicator={spread}
          // A fixed height with the scrollbar inside the bottom room: a classic scrollbar would otherwise add its height on open.
          style={{ height, overflow: spread ? undefined : "visible" }}
          contentContainerStyle={{ width: spread ? images.length * step - STACK_GAP : size.width + 2 * FAN.x, height: STACK_TOP + size.height }}
        >
          {images.map((img, i) => {
            const depth = Math.min(i, 2);
            const lit = spread && active === i;
            const transform = spread ? [{ translateX: i * step }] : [{ translateX: FAN.x * depth }, { translateY: FAN.y * depth }, { rotate: `${FAN.deg * depth}deg` }];
            // deal: in view as the row opens; still: out of view, placed at once; out: folding toward the face; fan: settling
            // out from under it. The face sits in the same spot closed and open, so it stays put (dealing it made it blink).
            const motion =
              i === 0 ? "rest"
              : phase === "open" ? (i < inView ? "deal" : "still")
              : phase === "folding" ? (i >= inView ? "still" : "out")
              : phase === "settling" && (i === 1 || i === 2) ? "fan"
              : "rest";
            return (
              <View
                key={i}
                {...({ dataSet: { cpStackCard: motion } } as object)}
                pointerEvents={!spread && i > 2 ? "none" : "auto"}
                style={[{ position: "absolute", left: 0, top: STACK_TOP, zIndex: lit ? images.length + 1 : images.length - i, opacity: !spread && i > 2 ? 0 : 1, transform }, Platform.OS === "web" && motion === "deal" ? ({ animationDelay: `${(Math.min(i, 8) - 1) * 22}ms` } as object) : null]}
              >
                <View
                  {...STACK_LIFT}
                  // Move, not enter: the card that ends up under a resting pointer as the row deals out lights up on its first move.
                  onPointerMove={() => {
                    if (!spread || active === i) return;
                    if (quiet.current === -2) return void (quiet.current = i);
                    if (quiet.current === i) return;
                    quiet.current = -1;
                    setActive(i);
                  }}
                  // One even 2px accent edge: the thumbnail's border turns accent with a 1px ring right outside it, on the same
                  // 8pt radius. No scale: it blurred the edges unevenly.
                  style={{
                    borderRadius: 8,
                    // Folding, the face undims at once: the cards fanning back out behind it would show through.
                    opacity: spread && active !== undefined && !lit && !(phase === "folding" && i === 0) ? 0.62 : 1,
                    transform: [{ translateY: lit ? -4 : 0 }],
                    ...(Platform.OS === "web" ? ({ boxShadow: lit ? `0 0 0 1px ${c.accent}, 0 4px 8px rgba(0,0,0,0.28)` : "0 0 0 0 transparent" } as object) : null),
                  }}
                >
                  <Thumbnail
                    alt={img.alt}
                    label={t("chat.openStackImage", { alt: img.alt, index: i + 1, total: images.length })}
                    url={img.url}
                    theme={theme}
                    onOpen={() => {
                      if (byClick && !spread) return open();
                      if (spread) setPinned(true);
                      onOpen(i);
                    }}
                    edge={lit ? c.accent : undefined}
                    // Hidden cards of a closed stack are out of the tab order (invisible stops, with an invisible focus ring).
                    focusable={spread || i < 3}
                  />
                  {!spread && i === 0 ? <StackBadge text={`+${images.length - 1}`} theme={theme} /> : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
        {/* Open, the hover box reaches 14pt past the scrollbar: a pointer that overshoots it on the way there, or while
            dragging it, stays inside instead of folding the stack. */}
        {spread ? <View style={{ position: "absolute", left: 0, right: 0, top: height, height: 14 }} /> : null}
      </View>
      {/* Pinned (an image was opened from the row), or open in Click mode, where touch has no pointer leaving to fold it. */}
      {pinned || (byClick && phase === "open") ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chat.foldStack")}
          onPress={() => {
            held.current = true;
            fold();
          }}
          style={({ hovered }: { hovered?: boolean; pressed: boolean }) => ({ position: "absolute", top: 0, right: 4, zIndex: images.length + 2, width: 24, height: 24, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: hovered ? c.accent : c.border, backgroundColor: c.surface2 })}
        >
          <Icon name="Minimize2" size={13} color={c.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A reply's images: thumbnails in a row, or with Image stacks on and two or more images, a stack (ImageStack). Each opens the viewer, ← → between them. */
export function ImagesItem({ item, theme }: PluginTimelineItemProps<ImagesRow>) {
  const images = item.data.images;
  const stacks = usePrefs().imageStacks === "on";
  const [open, setOpen] = useState<number>();
  const viewer = open === undefined ? null : <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(undefined)} />;
  if (stacks && images.length > 1) {
    return (
      <>
        <ImageStack images={images} theme={theme} onOpen={setOpen} />
        {viewer}
      </>
    );
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 11, paddingBottom: 1 }}>
      {images.map((img, i) => (
        <Thumbnail key={i} alt={img.alt} url={img.url} theme={theme} onOpen={() => setOpen(i)} />
      ))}
      {viewer}
    </View>
  );
}

/**
 * Shows the viewer for a stack of images Paseo drew itself, opened by web/image-stacks.ts from a click. Mount it in a
 * component that stays mounted (and inside the plugin's RPC context, for reading images); while none is mounted,
 * web/image-stacks.ts falls back to Paseo's own viewer for the one image. Extra mounted hosts draw nothing.
 */
export function StackViewerHost() {
  const [token] = useState(() => ({}));
  const drawing = useStackViewerHost(token);
  const shown = useStackViewer();
  if (!drawing || !shown) return null;
  return <Lightbox images={shown.images} index={shown.index} onIndex={setStackViewerIndex} onClose={closeStackViewer} />;
}
