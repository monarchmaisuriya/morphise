// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (StepsItem, MergedSteps)
// An image-only reply inside a run is named, not drawn: the media part owns image rows.
import type { PluginTheme } from "@getpaseo/plugin";
import { useAgent, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { View } from "react-native";
import type { z } from "zod";
import type { AgentTimelineItem } from "../agent-types";
import { useLanguage, useT } from "../i18n";
import { imageOnly, toolData, type stepsSchema, type ToolData } from "./model";
import { alpha, Expand, Prose, Row, useDisclosure, useIndent, useSpacing, useSteady } from "./row";
import { changesOfTodo, noteShownAgent, runOf, runVersion, stepKey, stepSummary, subscribeRun } from "./steps";
import { ThoughtItem } from "./thought-row";
import { changeWords, TodoSteps } from "./todo-row";
import { ToolItem } from "./tool-row";

export type StepEntry = { item: AgentTimelineItem; phase: "streaming" | "complete" };

/** "41s", "2m 14s". */
function duration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** A run of thoughts and tool calls folded into one row (design: Merged steps · A), its steps read from the timelines steps.ts follows. */
export function StepsItem(props: PluginTimelineItemProps<z.output<typeof stepsSchema>>) {
  const { head } = props.item.data;
  const subscribe = useCallback((listener: () => void) => subscribeRun(head, listener), [head]);
  useSyncExternalStore(subscribe, () => runVersion(head));
  const { steps, ms, open: tail } = runOf(head);
  const working = useAgent(props.agentId, (a) => a.status === "running") ?? false;
  useEffect(() => noteShownAgent(props.agentId), [props.agentId]);
  return <MergedSteps {...props} steps={steps} ms={ms} growing={!!tail && working} />;
}

/** A reply Collapse turns folded into a run. */
const ReplyStep = ({ theme, text }: { theme: PluginTheme; text: string }) => (
  <View style={{ paddingVertical: 8 }}>
    <Prose theme={theme} text={text} color={theme.colors.foreground} />
  </View>
);

/** The merged row. Done, it says what the run did and how long it took; working, it names the step in progress; a failed step turns
 * the icon red. Open, it lists the steps as their own rows. A lone step renders as itself. The settings preview draws it from samples. */
export function MergedSteps(props: PluginTimelineItemProps<unknown> & { steps: StepEntry[]; ms?: number; growing: boolean; defaultOpen?: boolean }) {
  const { item, theme, layout, steps, ms, growing, defaultOpen, timestamp } = props;
  const [open, toggle] = useDisclosure(!!defaultOpen);
  const t = useT();
  const lang = useLanguage();
  const icons = !!useIndent("steps");
  const spacing = useSpacing();
  // Inside the open list steps sit flush; a run of one stands in the timeline like any row.
  const step = ({ item: step, phase }: StepEntry, nested = true) => {
    if (step.type === "tool_call") return <ToolItem key={stepKey(step)} {...props} nested={nested} item={{ ...item, data: toolData(step, lang) }} />;
    if (step.type === "reasoning") return <ThoughtItem key={stepKey(step)} {...props} nested={nested} item={{ ...item, data: { text: step.text, phase } }} />;
    if (step.type === "todo") return <TodoSteps key={stepKey(step)} {...props} step={step} />;
    if (step.type !== "assistant_message") return null;
    const images = imageOnly(step.text);
    return images ? (
      <Row key={stepKey(step)} theme={theme} compact={layout.compact} kind="tool" icon="Image" verb={t("chat.image")} target={images.map((i) => i.alt || i.url.split("/").pop()).join(", ")} />
    ) : (
      <ReplyStep key={stepKey(step)} theme={theme} text={step.text} />
    );
  };
  // The step in progress, or between steps of a run the agent is still adding to, the one just done (not the summary, which would flash).
  const live = steps.findLast((s) => s.phase === "streaming" || (s.item.type === "tool_call" && s.item.status === "running")) ?? (growing ? steps.at(-1) : undefined);
  const change = live?.item.type === "todo" ? changesOfTodo(stepKey(live.item)!).at(-1) : undefined;
  const words = change && changeWords(change, t);
  const now: Pick<ToolData, "verb" | "target" | "mono" | "shell"> | undefined =
    live?.item.type === "tool_call" ? toolData(live.item, lang) : words ? { verb: words[0], target: words[1], mono: false } : undefined;
  const fresh =
    live && (live.item.type !== "todo" || now)
      ? { verb: now?.verb ?? (live.phase === "streaming" ? t("chat.thinking") : t("chat.thought")), target: now?.target, mono: now?.mono, shell: now?.shell }
      : { verb: stepSummary(steps.map((s) => s.item), undefined, lang) };
  const holdLabel = !!live && !(live.item.type === "tool_call" && (live.item.status === "failed" || live.item.status === "canceled"));
  const label = useSteady(fresh, `${fresh.verb}\n${fresh.target ?? ""}`, 700, holdLabel);
  if (steps.length < 2) return steps[0] ? step(steps[0], false) : null;
  const c = theme.colors;
  const failed = steps.filter((s) => s.item.type === "tool_call" && s.item.status === "failed").length;
  return (
    <View style={spacing}>
      <Row
        theme={theme}
        compact={layout.compact}
        kind="steps"
        icon="ListTree"
        iconColor={failed ? c.statusDanger : undefined}
        verb={label.verb}
        target={label.target}
        mono={label.mono}
        shell={label.shell}
        meta={failed ? t("chat.failedCount", { n: failed }) : live ? t("chat.steps", { n: steps.length }) : ms ? duration(ms) : undefined}
        metaColor={failed ? c.statusDanger : undefined}
        pulsing={!!live}
        swap
        open={open}
        onToggle={toggle}
        time={timestamp}
      />
      <Expand open={open} style={{ marginLeft: icons ? 9 : 0, paddingLeft: icons ? 15 : 13, paddingTop: 3, paddingBottom: 3, borderLeftWidth: 1, borderLeftColor: alpha(c.border, 0.6) }}>
        {() => steps.map((s) => step(s))}
      </Expand>
    </View>
  );
}
