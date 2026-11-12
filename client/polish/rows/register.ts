// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): index.client.tsx (timeline transformers and renderers)
// Which rows Morphise hides or redraws comes from the Chat settings (shared/chat-view.ts); this file
// turns those rules into Paseo transformers and adds Chat Polish's merged steps, which follow the
// timelines of open agents. Prompts and replies are never redrawn (Paseo's Fork and Copy stay):
// only tool calls, thoughts, todo updates, plans, notices, image-only replies, and replies folded
// into a merged run under Paseo's Collapse turns.
import type { PluginTimelineData } from "@getpaseo/plugin";
import type { PluginClientContext, PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { type ChatSettings, type ChatView, chatLook, chatView, rowFate, skippedStep, transformedTypes } from "../../../shared/chat-view";
import type { StepsOptions } from "../../../shared/steps";
import type { RowActions } from "../../chat-rows";
import { CHAT_STEPS_KIND, chatStepsSchema, createChatStepsRow } from "../../steps-card";
import type { AgentTimelineItem } from "../agent-types";
import { currentLanguage } from "../i18n";
import { imageRowData, IMAGES_ROW_KIND } from "../media/image-rows";
import { HTML_ROW_KIND, htmlRowData } from "../pages/html-rows";
import { currentPrefs, subscribePrefs } from "../prefs";
import { openAgentIds, subagentPaneShown, watchDom } from "../web/dom";
import { readHostAppearance } from "../web/host";
import { setRowSetup } from "./look";
import { agentEventData, noticeData, noticeSchema, planSchema, stepsSchema, thoughtSchema, todoData, todoSchema, toolData, toolSchema } from "./model";
import { NoticeItem } from "./notice-row";
import { PlanItem } from "./plan-row";
import { followAgent, onShownAgent, onStaleSteps, onUnplacedStep, placeStep, resetMade, setMergeMin, setReplyFolding, setStepSkip, stepKey, type Phase } from "./steps";
import { StepsItem } from "./steps-row";
import { ThoughtItem } from "./thought-row";
import { TodoItem } from "./todo-row";
import { ToolItem } from "./tool-row";

export const TOOL_ROW_KIND = "polish-tool";
export const THOUGHT_ROW_KIND = "polish-thought";
export const STEPS_ROW_KIND = "polish-steps";
export const PLAN_ROW_KIND = "polish-plan";
export const TODO_ROW_KIND = "polish-todo";
export const NOTICE_ROW_KIND = "polish-notice";

export interface ChatRowsInput {
  chat: ChatSettings | undefined;
  // Row types hidden in every chat (profile.timeline.hide).
  hidden: readonly string[];
  // The steps card drawn in the chat in place of todo updates.
  stepsInChat: boolean;
  steps: () => StepsOptions;
}

// Round-trip through JSON so optional fields left undefined never reach the host as non-JSON.
const one = (kind: string, data: object) => ({
  items: [{ type: "plugin" as const, kind, version: 1, data: JSON.parse(JSON.stringify(data)) as PluginTimelineData }],
});
const NONE = { items: [] };

// Followed timelines outlive one registration: the section registers again whenever a Chat
// setting changes, and refetching every open agent's history then would be wasted.
const followed = new Map<string, () => void>();
const shown: string[] = [];
let registrations = 0;

function stopFollowing() {
  followed.forEach((stop) => stop());
  followed.clear();
  shown.length = 0;
}

export function registerChatRows(client: PluginClientContext, actions: RowActions, input: ChatRowsInput): () => void {
  registrations++;
  const view: ChatView = chatView(input.chat, input.hidden, input.stepsInChat, Platform.OS === "ios" || Platform.OS === "android");
  setRowSetup({ look: { ...chatLook(input.chat), style: view.toolCalls === "compact" ? "compact" : "cards" }, actions });

  // A provider subagent's pane can't be merged (no timeline to read), so while one shows every row stays as it would with merging off.
  // Read on DOM settle, not per transformed item.
  let subagentPane = false;
  const merging = () => view.merge && !subagentPane;
  // With Paseo's Collapse turns the replies before a turn's last join the run too, which leaves Paseo nothing to fold into its summary.
  // Runs shorter than the merge minimum stay as separate rows.
  const splitRules = () => {
    setReplyFolding(merging() && readHostAppearance().chatDisplay === "collapseTurns");
    setMergeMin(currentPrefs().mergeMin);
  };
  const stepRow = (item: AgentTimelineItem, phase: Phase) => {
    if (!merging()) return undefined;
    const placed = placeStep(item, phase);
    // A step of a run too short to merge falls through to the rules for merging off.
    if (!placed || placed.as === "alone") return undefined;
    return placed.as === "none" ? NONE : one(STEPS_ROW_KIND, { head: placed.key });
  };

  // A todo update on its own row. Paseo splits one update that completes a task and starts the next into two rows with the same list;
  // they are transformed one after the other in the same pass, so the second is left out. A later identical update (Paseo rewrites the row
  // in place) comes in another pass and still shows.
  let lastTodo: string | undefined;
  const ownTodo = (item: Extract<AgentTimelineItem, { type: "todo" }>) => {
    const key = stepKey(item);
    if (key === lastTodo) return NONE;
    if (lastTodo === undefined) queueMicrotask(() => (lastTodo = undefined));
    lastTodo = key;
    return one(TODO_ROW_KIND, todoData(item));
  };

  const transform = (itemType: string, item: AgentTimelineItem, phase: Phase) => {
    // A page an agent drew shows like a reply, before any rule about tool calls.
    if (view.pages && item.type === "tool_call") {
      const page = htmlRowData(item);
      if (page) return one(HTML_ROW_KIND, page);
    }
    const fate = rowFate(itemType, item, view);
    switch (fate.kind) {
      case "keep":
        return undefined;
      case "hide":
        return NONE;
      case "steps":
        return one(CHAT_STEPS_KIND, fate.data);
      case "notice":
        return item.type === "error" || item.type === "compaction" || item.type === "notification" ? one(NOTICE_ROW_KIND, noticeData(item, currentLanguage())) : undefined;
      case "plan":
        return item.type === "tool_call" && item.detail.type === "plan" ? one(PLAN_ROW_KIND, { text: item.detail.text, phase }) : undefined;
      case "agent-event": {
        // Paseo folds a turn at an agent's notice only under a native row, so with Collapse turns (and no merging) it stays Paseo's.
        if (item.type !== "tool_call" || (readHostAppearance().chatDisplay === "collapseTurns" && !merging())) return undefined;
        const event = agentEventData(item, currentLanguage());
        return event ? one(TOOL_ROW_KIND, event) : undefined;
      }
      case "todo":
        if (item.type !== "todo" || (merging() && placeStep(item, phase)?.as === "none")) return NONE;
        return ownTodo(item);
      case "step": {
        const merged = stepRow(item, phase);
        if (merged) return merged;
        if (item.type === "assistant_message") {
          const images = view.images ? imageRowData(item.text) : undefined;
          return images ? one(IMAGES_ROW_KIND, images) : undefined;
        }
        if (fate.alone === "tool" && item.type === "tool_call") return one(TOOL_ROW_KIND, toolData(item, currentLanguage()));
        if (fate.alone === "thought" && item.type === "reasoning") return one(THOUGHT_ROW_KIND, { text: item.text, phase });
        return undefined;
      }
    }
  };

  const addTransformers = () => {
    const removers = transformedTypes(view).map((itemType) =>
      client.addTimelineTransformer({
        id: `chat-${itemType.replaceAll("_", "-")}`,
        query: { itemType },
        transform: ({ item, phase }: { item: AgentTimelineItem; phase: Phase }) => transform(itemType, item, phase),
      } as PluginTimelineTransformerContribution),
    );
    return () => removers.forEach((remove) => void remove());
  };

  // Transformers read the host's chat display and the language when they run; Paseo transforms again only when they are registered again.
  splitRules();
  resetMade();
  let removeTransformers = addTransformers();
  const inputs = () => [merging(), readHostAppearance().chatDisplay, currentLanguage(), currentPrefs().images, currentPrefs().mergeMin].join("|");
  let transformedWith = inputs();
  const retransform = (force = false) => {
    if (!force && inputs() === transformedWith) return;
    transformedWith = inputs();
    splitRules();
    removeTransformers();
    resetMade();
    removeTransformers = addTransformers();
  };
  // A step transformed before its run was known renders wrong until Paseo transforms again; batch those.
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  onStaleSteps(() => {
    staleTimer ??= setTimeout(() => {
      staleTimer = undefined;
      retransform(true);
    }, 50);
  });
  setStepSkip((item) => skippedStep(item, view));

  // Follows the timelines of agents with an open tab, plus the last few whose merged rows rendered (native can't read tabs); none when merging is off.
  const follow = () => {
    const open = new Set(view.merge ? [...openAgentIds(), ...shown] : []);
    for (const [id, stop] of followed) if (!open.has(id)) (stop(), followed.delete(id));
    for (const id of open) if (!followed.has(id)) followed.set(id, followAgent(client.paseo, id));
  };
  onShownAgent((id) => {
    if (shown[0] === id) return;
    shown.splice(0, shown.length, id, ...shown.filter((a) => a !== id).slice(0, 2));
    follow();
  });
  // A step from a tab opened since the last DOM settle: start following now, after Paseo's render, rather than up to 250ms later.
  let followQueued = false;
  onUnplacedStep(() => {
    if (followQueued) return;
    followQueued = true;
    queueMicrotask(() => {
      followQueued = false;
      follow();
    });
  });
  follow();
  const unsubscribePrefs = subscribePrefs(() => {
    retransform();
    follow();
  });
  // Paseo doesn't tell plugins when Chat display changes; its settings screen re-renders, so check on DOM changes.
  const unwatchHost = watchDom(
    {
      settled: () => {
        subagentPane = subagentPaneShown();
        retransform();
        follow();
      },
    },
    () => {},
  );

  const renderers = [
    client.addTimelineRenderer({ kind: TOOL_ROW_KIND, version: 1, schema: toolSchema, Component: ToolItem }),
    client.addTimelineRenderer({ kind: THOUGHT_ROW_KIND, version: 1, schema: thoughtSchema, Component: ThoughtItem }),
    client.addTimelineRenderer({ kind: STEPS_ROW_KIND, version: 1, schema: stepsSchema, Component: StepsItem }),
    client.addTimelineRenderer({ kind: PLAN_ROW_KIND, version: 1, schema: planSchema, Component: PlanItem }),
    client.addTimelineRenderer({ kind: TODO_ROW_KIND, version: 1, schema: todoSchema, Component: TodoItem }),
    client.addTimelineRenderer({ kind: NOTICE_ROW_KIND, version: 1, schema: noticeSchema, Component: NoticeItem }),
    ...(view.stepsInChat ? [client.addTimelineRenderer({ kind: CHAT_STEPS_KIND, version: 1, schema: chatStepsSchema, Component: createChatStepsRow(client.paseo, input.steps) })] : []),
  ];

  return () => {
    registrations--;
    clearTimeout(staleTimer);
    unsubscribePrefs();
    unwatchHost();
    removeTransformers();
    renderers.forEach((remove) => void remove());
    onStaleSteps(() => {});
    onUnplacedStep(() => {});
    onShownAgent(() => {});
    // The next registration, when a setting changed, comes right after this cleanup and keeps the followed timelines.
    queueMicrotask(() => {
      if (!registrations) stopFollowing();
    });
  };
}
