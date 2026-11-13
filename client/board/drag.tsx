// Drag and drop for board cards, and for the rows of the Tasks list (sections stacked down instead of columns side by side). A card lifts after the mouse moves a few pixels on the web, or after a long press on a
// phone; a copy follows the pointer above the board, a gap opens where it will land, and releasing moves it. Where it
// lands is worked out by drop-places.ts (boardDropTarget) from the cards' places measured when it was lifted.
import { createContext, type ReactNode, type RefObject, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, type GestureResponderHandlers, type NativeScrollEvent, type NativeSyntheticEvent, PanResponder, Platform, type ScrollView, View, type ViewProps } from "react-native";
import type { BoardColumn, DropTarget, Frame } from "../../shared/board";
import { boardDropTarget, copyKey, type CopyTarget } from "./drop-places";

// Within this distance of the board's sides (or a column's top and bottom), a held card scrolls it.
const EDGE = 56;
const STEP = 12;
// The space between two cards in a column (the board's layout uses the same).
export const CARD_GAP = 8;

export interface DragState {
  taskId: string;
  // The card's place when it was lifted, relative to the board; null until measured.
  origin: Frame | null;
  target: CopyTarget | null;
}

interface Scroller {
  view: ScrollView | null;
  horizontal: boolean;
  offset: number;
  content: number;
  size: number;
}

interface DragApi {
  state: DragState | null;
  // Phones: the card a long press picked up, which the next finger movement drags.
  armed: string | null;
  offset: Animated.ValueXY;
  arm(taskId: string | null): void;
  isArmed(taskId: string): boolean;
  start(laneKey: string, taskId: string): void;
  move(x: number, y: number, dx: number, dy: number): void;
  end(drop: boolean): void;
  column(id: string): (view: View | null) => void;
  // One drawn copy of a card: a task in two lanes (rows by label) is drawn, and measured, twice.
  card(laneKey: string, taskId: string): (view: View | null) => void;
  scroller(key: string, horizontal: boolean): ScrollerProps;
}

interface ScrollerProps {
  ref(view: ScrollView | null): void;
  onScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void;
  onContentSizeChange(width: number, height: number): void;
  onLayout(event: { nativeEvent: { layout: { width: number; height: number } } }): void;
  scrollEventThrottle: number;
  scrollEnabled: boolean;
}

const DragContext = createContext<DragApi | null>(null);

function measure(view: View | null | undefined): Promise<Frame | null> {
  return new Promise((resolve) => (view ? view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height })) : resolve(null)));
}

/**
 * Holds one drag for a board. `columns` is the board as shown (columns in order, shown cards in order); `drop` runs when a card
 * is released over a target. `closes`: the lifted card's slot closes while it is dragged (manual order), so the cards below
 * it move up. `stack`: columns side by side in a sideways scroller ("horizontal", the board), or sections one under another in
 * a scroller that scrolls down ("vertical", the list); the outer scroller is registered as "board" either way. Wrap the
 * board in `DragProvider` with `value` and give `root` to its outer view.
 */
export function useBoardDrag(columns: BoardColumn[], drop: (taskId: string, target: DropTarget) => void, closes: boolean, stack: "horizontal" | "vertical" = "horizontal", gap = CARD_GAP) {
  const [state, setState] = useState<DragState | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  // `gap`: the space between two cards (rows in a list have none), which a closed slot also gives back.
  const live = useRef({ columns, drop, state, closes, stack, gap });
  live.current = { columns, drop, state, closes, stack, gap };
  const root = useRef<View | null>(null);
  const views = useRef({ columns: new Map<string, View>(), cards: new Map<string, View>() });
  // Places on screen when the card was lifted (cards by copyKey), and every scroller's offset then.
  const frames = useRef({ root: null as Frame | null, outer: null as Frame | null, columns: new Map<string, Frame>(), cards: new Map<string, Frame>(), scrolled: new Map<string, number>() });
  const scrollers = useRef(new Map<string, Scroller>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const offset = useRef(new Animated.ValueXY()).current;

  const api = useMemo(() => {
    // How far a scroller has moved since the card was lifted.
    const scrolledBy = (key: string) => (scrollers.current.get(key)?.offset ?? 0) - (frames.current.scrolled.get(key) ?? 0);
    // A place measured at the lift, moved by the outer scroller's scrolling since: sideways on a board, down in a list.
    const shifted = (frame: Frame): Frame => {
      const by = scrolledBy("board");
      return live.current.stack === "horizontal" ? { ...frame, x: frame.x - by } : { ...frame, y: frame.y - by };
    };
    const targetNow = (taskId: string): CopyTarget | null => {
      if (!pointer.current) return null;
      const { columns, closes, gap, stack } = live.current;
      return boardDropTarget(columns, frames.current, taskId, pointer.current, { closes, gap, stack, outer: shifted, down: scrolledBy });
    };
    const retarget = () => {
      const current = live.current.state;
      if (!current) return;
      const target = targetNow(current.taskId);
      setState((previous) => (previous && (previous.target?.column !== target?.column || previous.target?.before !== target?.before || previous.target?.lane !== target?.lane) ? { ...previous, target } : previous));
    };
    const measureAll = async () => {
      const scrolled = new Map([...scrollers.current].map(([key, scroller]) => [key, scroller.offset] as const));
      const [rootFrame, outerFrame, columnFrames, cardFrames] = await Promise.all([
        measure(root.current),
        measure(scrollers.current.get("board")?.view as View | null | undefined),
        Promise.all([...views.current.columns].map(async ([id, view]) => [id, await measure(view)] as const)),
        Promise.all([...views.current.cards].map(async ([id, view]) => [id, await measure(view)] as const)),
      ]);
      frames.current = {
        root: rootFrame,
        outer: outerFrame,
        columns: new Map(columnFrames.flatMap(([id, frame]) => (frame ? [[id, frame]] : []))),
        cards: new Map(cardFrames.flatMap(([id, frame]) => (frame ? [[id, frame]] : []))),
        scrolled,
      };
      retarget();
    };
    const stopScrolling = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
    // The board scrolls sideways near its left and right edges (a list, down near its top and bottom); a column under the
    // pointer near its top and bottom.
    const edgeScroll = () => {
      const at = pointer.current;
      if (!at) return stopScrolling();
      const steps: [Scroller, number][] = [];
      const board = scrollers.current.get("board");
      // The outer scroller's own edges (a list's top is below the toolbar), else the board's.
      const rootFrame = frames.current.outer ?? frames.current.root;
      if (board && rootFrame) {
        const direction = board.horizontal
          ? at.x < rootFrame.x + EDGE ? -1 : at.x > rootFrame.x + rootFrame.width - EDGE ? 1 : 0
          : at.y < rootFrame.y + EDGE ? -1 : at.y > rootFrame.y + rootFrame.height - EDGE ? 1 : 0;
        if (direction) steps.push([board, direction]);
      }
      for (const [id, measured] of frames.current.columns) {
        const frame = shifted(measured);
        if (at.x < frame.x || at.x > frame.x + frame.width) continue;
        const column = scrollers.current.get(id);
        const direction = at.y < frame.y + EDGE ? -1 : at.y > frame.y + frame.height - EDGE ? 1 : 0;
        if (column && direction) steps.push([column, direction]);
      }
      const moving = steps.filter(([scroller, direction]) => (direction < 0 ? scroller.offset > 0 : scroller.offset < scroller.content - scroller.size));
      if (!moving.length) return stopScrolling();
      if (timer.current) return;
      timer.current = setInterval(() => {
        for (const [scroller, direction] of moving) {
          const next = Math.max(0, Math.min(scroller.offset + direction * STEP, scroller.content - scroller.size));
          scroller.view?.scrollTo(scroller.horizontal ? { x: next, animated: false } : { y: next, animated: false });
          // Scroll events do not always follow a scroll made from code (the web skips them), so the offset is kept here.
          scroller.offset = next;
        }
        retarget();
      }, 16);
    };
    // One ref callback per id for the board's life, so React calls it only on mount and unmount.
    const refs = { columns: new Map<string, (view: View | null) => void>(), cards: new Map<string, (view: View | null) => void>() };
    const register = (map: "columns" | "cards", id: string) => {
      let callback = refs[map].get(id);
      if (!callback) {
        callback = (view: View | null) => {
          if (view) views.current[map].set(id, view);
          else views.current[map].delete(id);
        };
        refs[map].set(id, callback);
      }
      return callback;
    };
    const scrollerProps = new Map<string, ScrollerProps>();
    return {
      arm: (taskId: string | null) => setArmed(taskId),
      start(laneKey: string, taskId: string) {
        offset.setValue({ x: 0, y: 0 });
        setState({ taskId, origin: null, target: null });
        live.current.state = { taskId, origin: null, target: null };
        void measureAll().then(() => {
          const card = frames.current.cards.get(copyKey(laneKey, taskId));
          const board = frames.current.root;
          if (card && board) setState((previous) => (previous?.taskId === taskId ? { ...previous, origin: { ...card, x: card.x - board.x, y: card.y - board.y } } : previous));
        });
      },
      move(x: number, y: number, dx: number, dy: number) {
        pointer.current = { x, y };
        offset.setValue({ x: dx, y: dy });
        retarget();
        edgeScroll();
      },
      end(dropped: boolean) {
        stopScrolling();
        const current = live.current.state;
        const target = current && dropped ? targetNow(current.taskId) : null;
        pointer.current = null;
        live.current.state = null;
        setState(null);
        setArmed(null);
        if (current && target) live.current.drop(current.taskId, target);
      },
      column: (id: string) => register("columns", id),
      card: (laneKey: string, taskId: string) => register("cards", copyKey(laneKey, taskId)),
      scroller(key: string, horizontal: boolean): ScrollerProps {
        // Cached per direction too: the Tasks view can switch between its board (sideways) and its list (down) while
        // mounted, and each scroller's handlers must read their own axis.
        const cacheKey = `${key}:${horizontal ? "x" : "y"}`;
        const cached = scrollerProps.get(cacheKey);
        if (cached) return cached;
        const entry = () => {
          let found = scrollers.current.get(key);
          if (!found) scrollers.current.set(key, (found = { view: null, horizontal, offset: 0, content: 0, size: 0 }));
          found.horizontal = horizontal;
          return found;
        };
        const props: ScrollerProps = {
          ref: (view) => {
            if (view) entry().view = view;
            else scrollers.current.delete(key);
          },
          onScroll: (event) => {
            entry().offset = horizontal ? event.nativeEvent.contentOffset.x : event.nativeEvent.contentOffset.y;
            if (live.current.state) retarget();
          },
          onContentSizeChange: (width, height) => void (entry().content = horizontal ? width : height),
          onLayout: (event) => void (entry().size = horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height),
          scrollEventThrottle: 16,
          // On a phone a scroll would fight the finger that drags; on the web the mouse wheel still scrolls.
          scrollEnabled: true,
        };
        scrollerProps.set(cacheKey, props);
        return props;
      },
    };
  }, [offset]);
  // A board closed mid-drag stops its edge scrolling.
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    },
    [],
  );

  const value: DragApi = {
    ...api,
    state,
    armed,
    offset,
    isArmed: (taskId) => armed === taskId,
    scroller: (key, horizontal) => ({ ...api.scroller(key, horizontal), scrollEnabled: Platform.OS === "web" || (state === null && armed === null) }),
  };
  return { root: root as RefObject<View | null>, value };
}

export const DragProvider = DragContext.Provider;

export function useDrag(): DragApi {
  const api = useContext(DragContext);
  if (!api) throw new Error("useDrag needs a board drag provider");
  return api;
}

/** The pan handlers that drag one drawn copy of a card; spread them on a view around the card. */
export function useCardDragHandlers(laneKey: string, taskId: string): GestureResponderHandlers & Pick<ViewProps, "onTouchEnd" | "onTouchCancel"> {
  const api = useDrag();
  const latest = useRef({ api, laneKey, taskId });
  latest.current = { api, laneKey, taskId };
  const responder = useRef(
    PanResponder.create({
      // The web lifts a card once the mouse has moved; a phone only after a long press picked it up, so a swipe still scrolls.
      onMoveShouldSetPanResponderCapture: (_event, gesture) => (Platform.OS === "web" ? Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6 : latest.current.api.isArmed(latest.current.taskId)),
      onPanResponderGrant: () => latest.current.api.start(latest.current.laneKey, latest.current.taskId),
      onPanResponderMove: (_event, gesture) => latest.current.api.move(gesture.moveX, gesture.moveY, gesture.dx, gesture.dy),
      onPanResponderRelease: () => latest.current.api.end(true),
      onPanResponderTerminate: () => latest.current.api.end(false),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  // A long press arms the card, but the pan responder (and its end) only runs once the finger moves; lifting it without
  // a drag must disarm it, or the armed card keeps the board from scrolling. Touch ends bubble up from the card.
  const disarm = useRef({ onTouchEnd: () => latest.current.api.arm(null), onTouchCancel: () => latest.current.api.arm(null) }).current;
  return { ...responder.panHandlers, ...disarm };
}

/** The lifted copy of the dragged card, drawn above the board and following the pointer. */
export function DragGhost({ children }: { children: (taskId: string) => ReactNode }) {
  const { state, offset } = useDrag();
  if (!state?.origin) return null;
  const { x, y, width } = state.origin;
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: x, top: y, width, transform: offset.getTranslateTransform(), shadowColor: "#000000", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
      <View style={{ transform: [{ rotate: "1.5deg" }] }}>{children(state.taskId)}</View>
    </Animated.View>
  );
}
