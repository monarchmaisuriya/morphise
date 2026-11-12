import { type ReactNode, type Ref, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { cannotHover } from "../web";
import { Icon, type Tokens } from "./kit";

// The grouped list the Agents and Tasks lists share (the shape of GitHub's boxed lists and Linear's grouped
// list): each group a bordered box with a tinted header, rows with hairline dividers, one line per row on
// desktop, quiet facts at the right, and secondary actions over the row's end on hover or keyboard focus.

// The list stops growing here and centres, so a row's facts stay near its title on wide windows.
const LIST_MAX_WIDTH = 1180;

// Markers for the stylesheet that shows a row's actions while focus is inside it (web only; see plugin-views.ts).
const ROW_MARK = { dataSet: { mxCard: "" } } as object;
const ACTIONS_MARK = { dataSet: { mxCardActions: "" } } as object;

export function GroupList({ t, children }: { t: Tokens; children: ReactNode }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: t.compact ? 12 : 16, paddingTop: 4, paddingBottom: 24 }}>
      <View style={{ width: "100%", maxWidth: LIST_MAX_WIDTH, alignSelf: "center", gap: 12 }}>{children}</View>
    </ScrollView>
  );
}

/** A small rounded count, as in a group's header. */
function CountChip({ t, count, tone }: { t: Tokens; count: number | string; tone?: string }) {
  return (
    <View style={{ minWidth: 20, height: 18, paddingHorizontal: 6, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: t.c.surface2 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: tone ?? t.c.foregroundMuted, fontVariant: ["tabular-nums"] }}>{count}</Text>
    </View>
  );
}

/** A quiet fact at a row's right or after its title: an icon and short text in the muted colour (or a tone). */
export function Fact({ t, icon, text, tone }: { t: Tokens; icon?: string; text?: string; tone?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 }}>
      {icon ? <Icon name={icon} size={12} color={tone ?? t.c.foregroundMuted} /> : null}
      {text ? (
        <Text style={{ fontSize: 12, color: tone ?? t.c.foregroundMuted, flexShrink: 1, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One group: a box whose header (chevron, icon or dot, name, count) folds and opens it. A group with no rows to show
 * (`empty`) has a muted name but keeps its own colour, whatever its count says (a column's cards may all be hidden by filters). `trailing` sits
 * at the header's right, outside its press area (for example an add button).
 */
export function GroupBox({ t, title, count, countTone, empty, icon, dot, tone, open, onToggle, trailing, children, label }: { t: Tokens; title: string; count: number | string; countTone?: string; empty: boolean; icon?: string; dot?: string; tone?: string; open: boolean; onToggle(): void; trailing?: ReactNode; children?: ReactNode; label?: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.card, overflow: "hidden", backgroundColor: t.c.surface0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: t.c.surface1, paddingRight: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={label ?? `${title}, ${count}. ${open ? "Fold" : "Open"} the group`}
          onPress={onToggle}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: t.compact ? 44 : 38, paddingHorizontal: 12, opacity: hovered ? 0.85 : 1 })}
        >
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={t.c.foregroundMuted} />
          {icon ? <Icon name={icon} size={14} color={tone ?? t.c.foregroundMuted} /> : dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
          <Text style={{ fontSize: 13, fontWeight: "600", color: empty ? t.c.foregroundMuted : t.c.foreground, flexShrink: 1 }} numberOfLines={1}>
            {title}
          </Text>
          <CountChip t={t} count={count} tone={countTone} />
        </Pressable>
        {trailing}
      </View>
      {open ? children : null}
    </View>
  );
}

/** A box's last row: "Show 44 more", or a note such as "No agents". */
export function GroupFooter({ t, text, onPress }: { t: Tokens; text: string; onPress?(): void }) {
  const body = <Text style={[t.text.meta, { fontSize: 12 }]}>{text}</Text>;
  const style = { height: 36, justifyContent: "center" as const, paddingHorizontal: 38, borderTopWidth: 1, borderTopColor: t.c.border };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ ...style, backgroundColor: hovered ? t.c.surface1 : "transparent" })}>
      {body}
    </Pressable>
  );
}

interface GroupRowProps {
  t: Tokens;
  nodeRef?: Ref<View>;
  // The status or priority icon, 16 pt wide.
  leading: ReactNode;
  title: string;
  // What follows the title on desktop, or sits under it on phones: muted text or a row of facts.
  detail?: ReactNode;
  struck?: boolean;
  // Quiet facts at the right (desktop only).
  facts?: ReactNode;
  // Buttons that always show, such as Allow and Deny.
  pinned?: ReactNode;
  // Buttons that show over the facts on hover or keyboard focus (never over the pinned buttons), and in the row on touch.
  actions?: ReactNode;
  selected?: boolean;
  focused?: boolean;
  dim?: boolean;
  label: string;
  onPress(): void;
  onLongPress?(): void;
}

export function GroupRow({ t, nodeRef, leading, title, detail, struck, facts, pinned, actions, selected, focused, dim, label, onPress, onLongPress }: GroupRowProps) {
  const [hovered, setHovered] = useState(false);
  const touch = cannotHover();
  const [pressed, setPressed] = useState(false);
  const background = selected ? t.c.surface2 : hovered || pressed ? t.c.surface1 : t.c.surface0;
  // On desktop the title keeps up to 60% of the line when detail follows it, else all of it.
  const titleNode = (
    <Text style={{ fontSize: 13, fontWeight: "500", lineHeight: 18, color: t.c.foreground, flexShrink: t.compact || !detail ? 1 : 0, maxWidth: t.compact || !detail ? undefined : "60%", textDecorationLine: struck ? "line-through" : "none" }} numberOfLines={1}>
      {title}
    </Text>
  );
  const showActions = hovered || !!focused;
  return (
    <Pressable
      ref={nodeRef}
      {...ROW_MARK}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: t.compact ? 56 : 42, paddingVertical: t.compact ? 8 : 6, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: t.c.border, backgroundColor: background, opacity: dim ? 0.7 : 1 }}
    >
      {focused ? <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, backgroundColor: t.c.accent }} /> : null}
      <View style={{ width: 16, alignItems: "center" }}>{leading}</View>
      {t.compact ? (
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          {titleNode}
          {detail}
        </View>
      ) : (
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, overflow: "hidden" }}>
          {titleNode}
          {detail}
        </View>
      )}
      {/* The facts and, over their right end, the hover actions: anchored here so they never cover the pinned buttons. */}
      <View style={{ position: "relative", flexDirection: "row", alignItems: "center", gap: 14, flexShrink: 0, alignSelf: "stretch" }}>
        {t.compact ? null : facts}
        {actions && touch ? <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>{actions}</View> : null}
        {actions && !touch ? (
          <View
            {...ACTIONS_MARK}
            pointerEvents={showActions ? "auto" : "none"}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 12, backgroundColor: background, opacity: showActions ? 1 : 0 }}
          >
            {actions}
          </View>
        ) : null}
      </View>
      {pinned ? <View style={{ flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 }}>{pinned}</View> : null}
    </Pressable>
  );
}
