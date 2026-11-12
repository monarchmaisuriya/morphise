import type { PluginButton, PluginClientContext } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import type { Prompt } from "../shared/document";
import type { Profile } from "../shared/profile";
import { buildChatWebCss, buildStyleSheet } from "../shared/style-sheet";
import { createComposerControl, createPresetField } from "./composer-surfaces";
import type { Directory } from "./directory";
import type { Section } from "./reconciler";
import { type ActionDeps, type ActionTarget, runAction } from "./run-action";
import { reminderRowSchema } from "../shared/reminder-contracts";
import { presetTitle, reminderAt } from "../shared/reminders";
import { createWorkspaceTasksPanel } from "./board/board";
import {
  createChatPopover,
  createReminderRow,
  runRemindCommand,
  runTaskCommand,
  type SurfaceDeps,
} from "./task-surfaces";
import { NotesPanel } from "./notes-panel";
import { createPromptPicker } from "./prompt-picker";
import { createChecksPanel } from "./checks-panel";
import { createDispatchScreen, DISPATCH_ICON, DISPATCH_SCREEN_ID } from "./dispatch";
import { createWorkbenchScreen, createWorkbenchSidebarItem, WORKBENCH_SCREEN_ID, LEGACY_SCREENS } from "./workbench";
import { createSidebarView } from "./sidebar-view";
import { RecapRow, recapRowSchema, type RowActions } from "./chat-rows";
import { registerChatRows } from "./polish/rows/register";
import { createDetailsPanel, DETAILS_PANEL_ID, detailsStore } from "./details-panel";
import { readImage, revealFile } from "../shared/files";
import { lastTurnMarkdown, TURN_RECAP_KIND } from "../shared/chat-view";
import { stepsOptions } from "../shared/steps";
import { applyStyleSheet } from "./web";
import { jumpToPrompt } from "./polish/web/prompts";
import { copyText } from "@getpaseo/plugin/client/ui";
import { Platform } from "react-native";
import { POLISH_DEFAULTS, type PolishSettings, type Prefs, polishPrefs } from "../shared/polish/prefs";
import { setPrefs } from "./polish/prefs";
import { setCurrentTheme } from "./polish/theme-registry";


export interface Applied {
  profile: Profile;
  // Every layout's id and name, and which one applies.
  layouts: { active: string; list: readonly { id: string; name: string }[] };
  // Shared by every layout.
  prompts: readonly Prompt[];
  directory: Directory;
  // Saved board views, offered in the Command Center.
  taskViews: readonly { id: string; name: string }[];
}

type Button = Profile["header"]["buttons"][number];
type Row = Profile["sidebar"]["headerRows"][number];

function toButton(button: Button, target: ActionTarget, deps: ActionDeps): PluginButton {
  const behavior: PluginButton["behavior"] =
    "action" in button
      ? { kind: "action", onPress: () => runAction(button.action, target, deps) }
      : {
          kind: "menu",
          items: button.menu.map((entry) => ({
            kind: "item" as const,
            id: entry.id,
            title: entry.title,
            icon: entry.icon,
            behavior: { kind: "action" as const, onPress: () => runAction(entry.action, target, deps) },
          })),
        };
  return { title: button.title, icon: button.icon, label: button.label, behavior };
}

function createRows(rows: readonly Row[], deps: ActionDeps) {
  return function MorphiseRows() {
    const toast = useToast();
    return (
      <>
        {rows.map((row) => (
          <SidebarRow
            key={row.id}
            id={row.id}
            icon={row.icon}
            label={row.label}
            onPress={() =>
              void runAction(row.action, { kind: "focused" }, deps).catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : String(error)),
              )
            }
          />
        ))}
      </>
    );
  };
}

const json = (value: unknown) => JSON.stringify(value);

// Chat Polish's Command Center switches: [id, title, icon, chat.polish key, value to set].
// `rows`: Morphise draws tool calls (merging steps does nothing otherwise).
function polishToggles(prefs: Prefs, rows: boolean): [string, string, string, keyof PolishSettings, PolishSettings[keyof PolishSettings]][] {
  return [
    ...(rows ? [["merge", prefs.merge === "on" ? "Chat: show each step on its own row" : "Chat: merge steps between replies into one row", "Layers", "merge", prefs.merge !== "on"] as [string, string, string, keyof PolishSettings, PolishSettings[keyof PolishSettings]]] : []),
    ["selection", prefs.selection === "on" ? "Chat: hide the bar over selected text" : "Chat: show the bar over selected text", "TextSelect", "selection", prefs.selection !== "on"],
    ["restyle", prefs.nativeStyle === "design" ? "Chat: leave Paseo's items as Paseo draws them" : "Chat: restyle Paseo's items", "Paintbrush", "restyle", prefs.nativeStyle !== "design"],
    ["diagrams", prefs.diagrams === "pele" ? "Chat: draw diagrams with Paseo's mermaid" : "Chat: draw diagrams with Pele", "Workflow", "diagrams", prefs.diagrams === "pele" ? "mermaid" : "pele"],
    ["html", prefs.html === "on" ? "Chat: stop giving new agents HTML pages" : "Chat: give new agents HTML pages", "AppWindow", "html", prefs.html !== "on"],
  ];
}

// Sets one `chat.polish` key on a chat being changed; a value that is the default is removed.
function setPolish(chat: Record<string, unknown>, key: keyof PolishSettings, value: unknown) {
  const polish = { ...((chat.polish ?? {}) as Record<string, unknown>) };
  if (value === POLISH_DEFAULTS[key]) delete polish[key];
  else polish[key] = value;
  chat.polish = Object.keys(polish).length ? polish : undefined;
}

// What Morphise's chat rows can do: read pictures and reveal files on the daemon, show details in
// the Details tab of the chat's workspace, and shorten paths to that workspace's folder.
export function createRowActions(client: PluginClientContext, tasks: Pick<SurfaceDeps, "chats" | "workspaces">): RowActions {
  const workspaceOf = async (agentId: string): Promise<string | null> => {
    const known = tasks.chats.get().get(agentId)?.workspaceId;
    if (known) return known;
    // Sub-agents are not in the chat list; ask Paseo for the agent's workspace.
    const handle = client.paseo.agents.ref(agentId);
    await handle.refresh().catch(() => null);
    return handle.workspaceId;
  };
  return {
    readImage: (path) => client.rpc(readImage, { path }),
    reveal: (path) => client.rpc(revealFile, { path }),
    async openDetails(agentId, details) {
      const workspaceId = await workspaceOf(agentId);
      if (!workspaceId) return { ok: false, reason: "this chat's workspace was not found" };
      detailsStore.set({ workspaceId, ...details });
      client.openPanel(DETAILS_PANEL_ID, { workspaceId, agentId });
      return { ok: true };
    },
    workspaceFolder(agentId) {
      const workspaceId = tasks.chats.get().get(agentId)?.workspaceId;
      return workspaceId ? tasks.workspaces.get().get(workspaceId)?.directory ?? null : null;
    },
  };
}

export function createSections(client: PluginClientContext, deps: ActionDeps, tasks: SurfaceDeps, switchLayout: (id: string) => Promise<void>): Section<Applied>[] {
  const rowActions = createRowActions(client, tasks);
  // A workspace's header button opens the reminder picker for its open chat.
  const ChatPopover = createChatPopover(tasks);
  const remindButton: PluginButton = { title: "Remind me", icon: "AlarmClock", behavior: { kind: "popover", Content: ChatPopover } };
  return [
    {
      name: "theme",
      key: ({ profile }) => json(profile.theme),
      register({ profile: { theme } }, track) {
        // Paseo takes a theme's name, appearance and colours; the sidebar colour is Morphise's own.
        if (theme) track(client.addTheme({ id: "profile-theme", name: theme.name, appearance: theme.appearance, colors: theme.colors }));
      },
    },
    {
      name: "sidebar.headerRows",
      key: ({ profile }) => json(profile.sidebar.headerRows),
      register({ profile }, track) {
        const rows = profile.sidebar.headerRows;
        if (rows.length) track(client.addSidebarHeaderItem({ id: "header-rows", title: "Morphise rows", Component: createRows(rows, deps) }));
      },
    },
    {
      name: "sidebar.footerRows",
      key: ({ profile }) => json(profile.sidebar.footerRows),
      register({ profile }, track) {
        const rows = profile.sidebar.footerRows;
        if (rows.length) track(client.addSidebarFooterItem({ id: "footer-rows", title: "Morphise rows", Component: createRows(rows, deps) }));
      },
    },
    {
      name: "sidebar.view",
      key: ({ profile }) => json(profile.sidebar.view),
      register({ profile }, track) {
        const { sidebar } = profile;
        if (!sidebar.view.enabled) return;
        track(
          client.addSidebarView({
            id: "profile-view",
            title: "Morphise",
            description: "Workspaces laid out by your Morphise profile",
            Component: createSidebarView(sidebar.view, tasks),
          }),
        );
      },
    },
    {
      // Chat Polish's ported code reads its preferences and theme from these stores (one owner:
      // the profile); each part follows them through subscribePrefs / subscribeTheme.
      name: "chat.polish",
      key: ({ profile }) => json([profile.chat ?? null, profile.theme]),
      register({ profile }) {
        const prefs = polishPrefs(profile.chat);
        setPrefs(prefs);
        setCurrentTheme(profile.theme, prefs.syntax);
      },
    },
    {
      // Every chat row Morphise hides or redraws, from one owner: the Chat settings (hidden row
      // types, Chat Polish's rows for tool calls, thoughts, merged steps, plans, todo updates and
      // notices) and the steps card "In the chat". One transformer per row type, so two rules
      // never compete for the same row. Prompts and replies are never redrawn, so Paseo's Fork
      // and Copy on them always stay.
      name: "chat.timeline",
      key: ({ profile }) => json([profile.chat, profile.timeline.hide, profile.sidebar.view.stepsCard, profile.sidebar.view.steps]),
      register({ profile }, track) {
        const steps = stepsOptions(profile.sidebar.view.steps);
        const stepsInChat = profile.sidebar.view.stepsCard !== false && steps.position === "chat";
        track(registerChatRows(client, rowActions, { chat: profile.chat, hidden: profile.timeline.hide, stepsInChat, steps: () => steps }));
      },
    },
    {
      // Settings, Chat, "Experimental (web)": Paseo's own prompts and replies styled, not redrawn.
      name: "chat.web",
      key: ({ profile }) => json(profile.chat?.enabled === false ? null : [profile.chat?.web ?? null, profile.chat?.polish?.uiFont ?? null, profile.chat?.polish?.markdownStyle ?? null]),
      register({ profile }, track) {
        if (profile.chat?.enabled !== false) track(applyStyleSheet(buildChatWebCss(profile.chat?.web, polishPrefs(profile.chat))));
      },
    },
    {
      name: "chat.commands",
      key: ({ profile }) => json(profile.chat ?? null),
      register({ profile }, track) {
        const chat = profile.chat ?? {};
        const style = chat.toolCalls ?? "paseo";
        const next = style === "paseo" ? "compact" : style === "compact" ? "cards" : "paseo";
        const nextTitle = { paseo: "Paseo's own rows", compact: "lines", cards: "cards" }[next];
        const folded = chat.reasoning === "fold" || chat.reasoning === "expand";
        const items = [
          { id: "morphise-chat-tools", title: `Chat: show tool calls as ${nextTitle}`, icon: "Rows3", keywords: ["chat", "tool", "calls", "cards", "lines", "compact"], run: () => tasks.updateChat((value) => void (value.toolCalls = next === "paseo" ? undefined : next)) },
          { id: "morphise-chat-thinking", title: folded ? "Chat: show thinking as Paseo does" : "Chat: fold thinking into a row", icon: "Brain", keywords: ["chat", "thinking", "reasoning", "fold"], run: () => tasks.updateChat((value) => void (value.reasoning = folded ? undefined : "fold")) },
          { id: "morphise-chat-switch", title: chat.enabled === false ? "Chat: let Morphise draw chat rows" : "Chat: show every row as Paseo draws it", icon: "MessageSquare", keywords: ["chat", "rows", "off", "on", "paseo"], run: () => tasks.updateChat((value) => void (value.enabled = chat.enabled === false ? undefined : false)) },
          // Chat Polish's switches (see NOTICE.md), each naming what selecting it does.
          ...polishToggles(polishPrefs(chat), style !== "paseo").map(([id, title, icon, key, value]) => ({ id: `morphise-polish-${id}`, title, icon, keywords: ["chat", "polish", "toggle"], run: () => tasks.updateChat((next) => setPolish(next, key, value)) })),
        ];
        for (const item of items) track(client.addCommandCenterItem({ id: item.id, title: item.title, icon: item.icon, keywords: item.keywords, context: "global", onSelect: item.run }));
        // Web only: Paseo's page holds the prompts, so these move through it.
        if (Platform.OS === "web") {
          for (const direction of ["previous", "next"] as const) {
            track(
              client.addCommandCenterItem({
                id: `morphise-prompt-${direction}`,
                title: direction === "previous" ? "Chat: go to the previous prompt" : "Chat: go to the next prompt",
                icon: direction === "previous" ? "ArrowUp" : "ArrowDown",
                keywords: ["chat", "prompt", "jump", "scroll", direction],
                context: "agent",
                // Also pages through prompts Paseo's list has not drawn yet (⌥⌘↑ and ⌥⌘↓ do the same).
                onSelect: () => jumpToPrompt(direction === "previous" ? -1 : 1),
              }),
            );
          }
        }
      },
    },
    {
      // Registered once and never again: recaps already in a chat keep drawing whatever the Chat
      // settings do (turned off, changed, or a section above failing).
      name: "chat.recap",
      key: () => "always",
      register(_input, track) {
        track(client.addTimelineRenderer({ kind: TURN_RECAP_KIND, version: 1, schema: recapRowSchema, Component: RecapRow }));
      },
    },
    {
      name: "tasks.surfaces",
      key: () => "always",
      register(_input, track) {
        track(client.addScreen({ id: WORKBENCH_SCREEN_ID, title: "Workbench", Component: createWorkbenchScreen(tasks) }));
        // Earlier versions' Tasks and Inbox screens, so links and open tabs from them still work.
        for (const [id, view] of Object.entries(LEGACY_SCREENS)) track(client.addScreen({ id, title: "Workbench", Component: createWorkbenchScreen(tasks, view) }));
        track(client.addWorkspacePanel({ id: "tasks", title: "Tasks", icon: "ListTodo", context: "workspace", Component: createWorkspaceTasksPanel(tasks) }));
        track(client.addWorkspacePanel({ id: DETAILS_PANEL_ID, title: "Details", icon: "PanelRight", context: "workspace", Component: createDetailsPanel(client) }));
        track(client.addWorkspacePanel({ id: "checks", title: "Checks", icon: "GitPullRequest", context: "workspace", Component: createChecksPanel(tasks) }));
        track(
          client.addCommandCenterItem({
            id: "morphise-checks",
            title: "Open this workspace's pull request checks",
            icon: "GitPullRequest",
            keywords: ["checks", "ci", "pull request", "pr", "review", "fix"],
            context: "workspace",
            onSelect: ({ openPanel }) => openPanel("checks"),
          }),
        );
        track(client.addSidebarHeaderItem({ id: "workbench", title: "Workbench", Component: createWorkbenchSidebarItem(tasks) }));
        track(
          client.addCommandCenterItem({
            id: "morphise-inbox",
            title: "Open Workbench: chats waiting on you",
            icon: "Inbox",
            keywords: ["workbench", "inbox", "waiting", "permission", "failed", "finished", "attention"],
            context: "global",
            onSelect: ({ openScreen }) => openScreen({ screenId: WORKBENCH_SCREEN_ID, params: { view: "waiting" } }),
          }),
        );
        track(client.addScreen({ id: DISPATCH_SCREEN_ID, title: "Dispatch", Component: createDispatchScreen(tasks) }));
        track(
          client.addCommandCenterItem({
            id: "morphise-dispatch",
            title: "Dispatch: start several agents in new workspaces",
            icon: DISPATCH_ICON,
            keywords: ["dispatch", "batch", "parallel", "agents", "prompts", "new workspace"],
            context: "global",
            onSelect: ({ openScreen }) => openScreen({ screenId: DISPATCH_SCREEN_ID }),
          }),
        );
        track(client.addTimelineRenderer({ kind: "reminder", version: 1, schema: reminderRowSchema, Component: createReminderRow(tasks) }));
        const global = [
          { id: "morphise-tasks", title: "Open Workbench: tasks", tab: "board" },
          { id: "morphise-tasks-today", title: "Open Workbench: today's tasks and reminders", tab: "today" },
        ];
        for (const item of global) {
          track(
            client.addCommandCenterItem({
              id: item.id,
              title: item.title,
              icon: "ListTodo",
              keywords: ["workbench", "tasks", "board", "kanban", "todo", "reminders"],
              context: "global",
              onSelect: ({ openScreen }) => openScreen({ screenId: WORKBENCH_SCREEN_ID, params: { view: item.tab } }),
            }),
          );
        }
        track(
          client.addCommandCenterItem({
            id: "morphise-tasks-workspace",
            title: "Open this workspace's tasks",
            icon: "ListTodo",
            keywords: ["tasks", "board", "kanban"],
            context: "workspace",
            onSelect: ({ openPanel }) => openPanel("tasks"),
          }),
        );
        track(
          client.addCommandCenterItem({
            id: "morphise-task-from-chat",
            title: "Add this chat to your tasks",
            icon: "ListPlus",
            keywords: ["task", "todo", "kanban", "follow up"],
            context: "agent",
            onSelect: ({ agent, workspace }) => runTaskCommand(tasks, agent.id, workspace.id, ""),
          }),
        );
      },
    },
    {
      name: "tasks.views",
      key: ({ taskViews }) => json(taskViews),
      register({ taskViews }, track) {
        for (const view of taskViews) {
          track(
            client.addCommandCenterItem({
              id: `morphise-task-view-${view.id}`,
              title: `Tasks view: ${view.name}`,
              icon: "ListFilter",
              keywords: ["tasks", "view", "board"],
              context: "global",
              onSelect: async ({ openScreen }) => {
                await tasks.apply({ kind: "setActiveView", id: view.id });
                openScreen({ screenId: WORKBENCH_SCREEN_ID, params: { view: "board" } });
              },
            }),
          );
        }
      },
    },
    {
      name: "prompts",
      key: ({ prompts }) => json(prompts),
      register({ prompts }, track) {
        if (prompts.length) track(client.addComposerItem({ id: "morphise-prompts", Component: createPromptPicker(prompts) }));
      },
    },
    {
      name: "layouts.commands",
      key: ({ layouts }) => json(layouts),
      register({ layouts }, track) {
        if (layouts.list.length < 2) return;
        for (const layout of layouts.list) {
          track(
            client.addCommandCenterItem({
              id: `morphise-layout-${layout.id}`,
              title: `Morphise layout: ${layout.name}${layout.id === layouts.active ? " (active)" : ""}`,
              icon: "Layers",
              keywords: ["layout", "morphise", "switch"],
              context: "global",
              onSelect: () => switchLayout(layout.id),
            }),
          );
        }
      },
    },
    {
      name: "notes",
      key: () => "always",
      register(_input, track) {
        track(client.addAgentPanel({ id: "notes", title: "Notes", icon: "NotebookPen", Component: NotesPanel }));
        track(
          client.addCommandCenterItem({
            id: "morphise-notes",
            title: "Open this chat's notes",
            icon: "NotebookPen",
            keywords: ["notes", "todo", "scratch"],
            context: "agent",
            onSelect: ({ openPanel }) => openPanel("notes"),
          }),
        );
      },
    },
    {
      name: "reminders.headerButtons",
      key: ({ directory }) => json(directory.workspaces),
      register({ directory }, track) {
        for (const workspaceId of directory.workspaces) {
          const registration = client.addHeaderButton({ id: "morphise-remind", workspaceId, button: remindButton });
          track(() => registration.remove());
        }
      },
    },
    {
      name: "reminders.commands",
      key: ({ profile }) => json(profile.reminders.presets),
      register({ profile }, track) {
        track(
          client.addSlashCommand({
            name: "remind",
            description: "Remind me about this chat later",
            argumentHint: "45m, 17:30, tomorrow 9am or clear",
            context: "agent",
            onSubmit: ({ agent, workspace, args }) => runRemindCommand(tasks, agent.id, workspace.id, args),
          }),
        );
        track(
          client.addSlashCommand({
            name: "bookmark",
            description: "Bookmark this chat's last answer",
            argumentHint: "an optional note",
            context: "agent",
            onSubmit: ({ agent, workspace, args }) => tasks.bookmarkLastAnswer(agent.id, workspace.id, args),
          }),
        );
        track(
          client.addCommandCenterItem({
            id: "morphise-bookmark",
            title: "Bookmark this chat's last answer",
            icon: "Bookmark",
            keywords: ["bookmark", "save", "answer", "keep"],
            context: "agent",
            onSelect: ({ agent, workspace }) => tasks.bookmarkLastAnswer(agent.id, workspace.id, ""),
          }),
        );
        track(
          client.addCommandCenterItem({
            id: "morphise-copy-turn",
            title: "Copy this chat's last turn as Markdown",
            icon: "ClipboardCopy",
            keywords: ["copy", "turn", "markdown", "share", "answer"],
            context: "agent",
            // The prompt, the replies and one line per tool call, from the chat's recent history.
            onSelect: async ({ agent, paseo }) => {
              const page = await paseo.agents.ref(agent.id).timeline.refetch({ direction: "tail", limit: 400 });
              const markdown = lastTurnMarkdown(page.entries);
              if (!markdown) throw new Error("This chat has no prompt in its recent history to copy");
              await copyText(markdown);
            },
          }),
        );
        track(
          client.addCommandCenterItem({
            id: "morphise-bookmarks",
            title: "Open bookmarks",
            icon: "Bookmark",
            keywords: ["bookmarks", "saved", "answers"],
            context: "global",
            onSelect: ({ openScreen }) => openScreen({ screenId: WORKBENCH_SCREEN_ID, params: { view: "bookmarks" } }),
          }),
        );
        track(
          client.addSlashCommand({
            name: "task",
            description: "Add a task linked to this chat",
            argumentHint: "Fix login p1 @bug #review due:fri tomorrow 9am",
            context: "agent",
            onSubmit: ({ agent, workspace, args }) => runTaskCommand(tasks, agent.id, workspace.id, args),
          }),
        );
        for (const minutes of profile.reminders.presets) {
          track(
            client.addCommandCenterItem({
              id: `morphise-remind-${minutes}`,
              title: `Remind me about this chat in ${presetTitle(minutes)}`,
              icon: "AlarmClock",
              keywords: ["remind", "reminder", "later"],
              context: "agent",
              onSelect: ({ agent, workspace }) =>
                tasks.apply({ kind: "remindChat", agentId: agent.id, workspaceId: workspace.id, title: agent.title ?? "Chat", reminder: reminderAt(new Date(Date.now() + minutes * 60_000), new Date()) }).then(() => {}),
            }),
          );
        }
        track(
          client.addCommandCenterItem({
            id: "morphise-remind-clear",
            title: "Clear this chat's reminder",
            icon: "BellOff",
            keywords: ["remind", "reminder", "done"],
            context: "agent",
            onSelect: ({ agent, workspace }) => runRemindCommand(tasks, agent.id, workspace.id, "clear"),
          }),
        );
      },
    },
    {
      name: "header.buttons",
      key: ({ profile, directory }) => json([profile.header.buttons, directory.workspaces]),
      register({ profile, directory }, track) {
        for (const workspaceId of directory.workspaces) {
          for (const button of profile.header.buttons) {
            const registration = client.addHeaderButton({ id: button.id, workspaceId, button: toButton(button, { kind: "focused" }, deps) });
            track(() => registration.remove());
          }
        }
      },
    },
    {
      name: "composer.pills",
      key: ({ profile, directory }) => json([profile.composer.pills, directory.agents]),
      register({ profile, directory }, track) {
        for (const agent of directory.agents) {
          for (const pill of profile.composer.pills) {
            const registration = client.addComposerPill({
              id: pill.id,
              workspaceId: agent.workspaceId,
              agentId: agent.id,
              button: toButton(pill, { kind: "agent", agentId: agent.id }, deps),
            });
            track(() => registration.remove());
          }
        }
      },
    },
    {
      name: "composer.controls",
      key: ({ profile }) => json(profile.composer.controls),
      register({ profile }, track) {
        for (const control of profile.composer.controls) {
          track(client.addComposerItem({ id: control.id, Component: createComposerControl(control, deps) }));
        }
      },
    },
    {
      name: "slashCommands",
      key: ({ profile }) => json(profile.slashCommands),
      register({ profile }, track) {
        for (const command of profile.slashCommands) {
          track(
            client.addSlashCommand({
              name: command.name,
              description: command.description,
              argumentHint: command.argumentHint,
              context: "agent",
              onSubmit: ({ agent }) => runAction(command.action, { kind: "agent", agentId: agent.id }, deps),
            }),
          );
        }
      },
    },
    {
      name: "commandCenter",
      key: ({ profile }) => json(profile.commandCenter),
      register({ profile }, track) {
        for (const item of profile.commandCenter) {
          track(
            client.addCommandCenterItem({
              id: item.id,
              title: item.title,
              icon: item.icon,
              keywords: item.keywords,
              context: "global",
              onSelect: () => runAction(item.action, { kind: "focused" }, deps),
            }),
          );
        }
      },
    },
    {
      name: "newWorkspace.presets",
      key: ({ profile }) => json(profile.newWorkspace.presets),
      register({ profile }, track) {
        const presets = profile.newWorkspace.presets;
        if (presets.length) track(client.addNewWorkspaceItem({ id: "presets", Component: createPresetField(presets) }));
      },
    },
    {
      name: "style",
      key: ({ profile }) => json(profile.style),
      register({ profile }, track) {
        track(applyStyleSheet(buildStyleSheet(profile.style)));
      },
    },
  ];
}
