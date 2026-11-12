// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (TodoItem, TodoSteps)
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import type { z } from "zod";
import type { Translator } from "../../../shared/polish/i18n";
import { Icon } from "../../ui/kit";
import type { AgentTimelineItem } from "../agent-types";
import { useT } from "../i18n";
import { useRowSetup } from "./look";
import { todoData, type todoSchema } from "./model";
import { FadeIn, INDENT, PMONO, Row, useDisclosure, useIndent, usePulse, useStyles, useTween } from "./row";
import { changesOfTodo, stepKey, type TaskChange } from "./steps";

const CHANGE_KEYS = { added: "chat.change.added", started: "chat.change.started", completed: "chat.change.completed" } as const;

export const changeWords = (c: TaskChange, t: Translator): [string, string | undefined] =>
  c.type === "created" ? [t(c.count === 1 ? "chat.createdOneTask" : "chat.createdTasks", { n: c.count }), undefined] : [t(CHANGE_KEYS[c.type]), c.text];

type TodoStep = Extract<AgentTimelineItem, { type: "todo" }>;

/** A todo update inside a merged run: one row per change ("Completed Inspect its source"); open, a row shows the list at that point. */
export function TodoSteps(props: PluginTimelineItemProps<unknown> & { step: TodoStep }) {
  const changes = changesOfTodo(stepKey(props.step)!);
  return <>{changes.map((change, i) => <TaskChangeRow key={i} {...props} change={change} />)}</>;
}

function TaskChangeRow({ theme, layout, step, change }: PluginTimelineItemProps<unknown> & { step: TodoStep; change: TaskChange }) {
  const [open, toggle] = useDisclosure();
  const indent = useIndent("tool");
  const t = useT();
  const [verb, target] = changeWords(change, t);
  const { items } = todoData(step);
  const done = items.filter((t) => t.status === "completed").length;
  return (
    <View>
      <Row theme={theme} compact={layout.compact} kind="tool" icon="ListChecks" verb={verb} target={target} meta={`${done}/${items.length}`} open={open} onToggle={toggle} />
      {open ? (
        <FadeIn style={{ paddingLeft: indent, paddingTop: 2, paddingBottom: 8 }}>
          <TodoList theme={theme} items={items} />
        </FadeIn>
      ) : null}
    </View>
  );
}

function TodoLine({ theme, status, text }: { theme: PluginTheme; status: "pending" | "in_progress" | "completed"; text: string }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const { look } = useRowSetup();
  const pulse = usePulse(status === "in_progress");
  const [icon, color] =
    status === "completed" ? ["CircleCheck", c.statusSuccess] : status === "in_progress" ? ["CircleDot", look.accent ?? c.accent] : ["Circle", c.foregroundMuted];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Icon name={icon} size={14} color={color} />
      <Animated.Text
        style={[
          s.target,
          { opacity: pulse, color: status === "completed" ? c.foregroundMuted : c.foreground },
          status === "completed" && { textDecorationLine: "line-through" },
        ]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

function TodoList({ theme, items }: { theme: PluginTheme; items: z.output<typeof todoSchema>["items"] }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <TodoLine key={i} theme={theme} status={t.status} text={t.text} />
      ))}
    </View>
  );
}

/** A todo update on its own row (merging off, or no steps around it): "Tasks 1 / 3", progress and the task in progress; open, the list. */
export function TodoItem({ item, theme }: PluginTimelineItemProps<z.output<typeof todoSchema>>) {
  const s = useStyles(theme);
  const c = theme.colors;
  const t = useT();
  const { look } = useRowSetup();
  const [open, toggle] = useDisclosure();
  const [hovered, setHovered] = useState(false);
  const { items, active } = item.data;
  const done = items.filter((t) => t.status === "completed").length;
  const progress = useTween(items.length ? done / items.length : 0, 300);
  const rotation = useTween(open ? 1 : 0, 100);
  return (
    <View>
      <Pressable
        onPress={toggle}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[s.row, { gap: 10, borderRadius: 6 }]}
      >
        <View style={s.slot}>
          <Icon name="ListChecks" size={15} color={look.accent ?? c.foregroundMuted} />
        </View>
        <Text style={s.verb}>{t("chat.tasks")}</Text>
        <Text {...PMONO} style={[s.code, { color: c.foregroundMuted }]}>
          {done} / {items.length}
        </Text>
        <View style={{ width: 56, height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: c.surface2 }}>
          <Animated.View style={{ width: 56, height: 3, borderRadius: 2, backgroundColor: look.accent ?? c.accent, transformOrigin: "left center", transform: [{ scaleX: progress }] }} />
        </View>
        {active ? (
          <Text numberOfLines={1} style={[s.target, hovered && { color: c.foreground }]}>
            {active}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Animated.View style={{ opacity: hovered || open ? 0.7 : 0, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}>
          <Icon name="ChevronRight" size={12} color={c.foregroundMuted} />
        </Animated.View>
      </Pressable>
      {open ? (
        <FadeIn style={{ paddingLeft: INDENT, paddingTop: 2, paddingBottom: 6 }}>
          <TodoList theme={theme} items={items} />
        </FadeIn>
      ) : null}
    </View>
  );
}
