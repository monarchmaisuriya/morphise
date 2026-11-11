import type { PluginButton, PluginClientContext, PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import type { Prompt } from "../shared/document";
import type { Profile } from "../shared/profile";
import { buildStyleSheet } from "../shared/style-sheet";
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
import { createDispatchScreen, DISPATCH_SCREEN_ID } from "./dispatch";
import { createWorkbenchScreen, createWorkbenchSidebarItem, WORKBENCH_SCREEN_ID, LEGACY_SCREENS } from "./workbench";
import { createSidebarView } from "./sidebar-view";
import { CHAT_STEPS_KIND, chatStepsSchema, createChatStepsRow, toChatSteps } from "./steps-card";
import { stepsOptions } from "../shared/steps";
import { applyStyleSheet } from "./web";


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

export function createSections(client: PluginClientContext, deps: ActionDeps, tasks: SurfaceDeps, switchLayout: (id: string) => Promise<void>): Section<Applied>[] {
  // A workspace's header button opens the reminder picker for its open chat.
  const ChatPopover = createChatPopover(tasks);
  const remindButton: PluginButton = { title: "Remind me", icon: "AlarmClock", behavior: { kind: "popover", Content: ChatPopover } };
  return [
    {
      name: "theme",
      key: ({ profile }) => json(profile.theme),
      register({ profile: { theme } }, track) {
        if (theme) track(client.addTheme({ id: "profile-theme", ...theme }));
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
      // With the steps card "In the chat", each plan update an agent posts is drawn as the card.
      name: "steps.chat",
      key: ({ profile }) => json([profile.sidebar.view.stepsCard, profile.sidebar.view.steps]),
      register({ profile }, track) {
        const options = stepsOptions(profile.sidebar.view.steps);
        if (profile.sidebar.view.stepsCard === false || options.position !== "chat") return;
        track(
          client.addTimelineTransformer({
            id: "steps-card",
            query: { itemType: "todo" },
            transform({ item }) {
              const data = toChatSteps(item);
              return data ? { items: [{ type: "plugin", kind: CHAT_STEPS_KIND, version: 1, data }] } : undefined;
            },
          }),
        );
        track(client.addTimelineRenderer({ kind: CHAT_STEPS_KIND, version: 1, schema: chatStepsSchema, Component: createChatStepsRow(client.paseo, () => options) }));
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
            icon: "Rocket",
            keywords: ["dispatch", "batch", "parallel", "agents", "prompts", "new workspace"],
            context: "global",
            onSelect: ({ openScreen }) => openScreen({ screenId: DISPATCH_SCREEN_ID }),
          }),
        );
        track(client.addTimelineRenderer({ kind: "reminder", version: 1, schema: reminderRowSchema, Component: createReminderRow(tasks) }));
        const global = [
          { id: "morphise-tasks", title: "Open Workbench: task board", tab: "board" },
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
      name: "timeline.hide",
      key: ({ profile }) => json(profile.timeline.hide),
      register({ profile }, track) {
        for (const itemType of profile.timeline.hide) {
          const transformer = {
            id: `hide-${itemType.replaceAll("_", "-")}`,
            query: { itemType },
            transform: () => ({ items: [] }),
          } as PluginTimelineTransformerContribution;
          track(client.addTimelineTransformer(transformer));
        }
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
