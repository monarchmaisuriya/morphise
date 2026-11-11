import type { PluginButton, PluginClientContext, PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import type { Prompt } from "../shared/document";
import type { Profile } from "../shared/profile";
import { buildStyleSheet } from "../shared/style-sheet";
import { createComposerControl, createPresetField } from "./composer-surfaces";
import type { Directory } from "./directory";
import type { Section } from "./reconciler";
import { type ActionDeps, type ActionTarget, runAction } from "./run-action";
import { reminderLabel } from "../shared/board";
import { reminderRowSchema } from "../shared/reminder-contracts";
import { presetTitle, reminderAt } from "../shared/reminders";
import { createTasksScreen, createWorkspaceTasksPanel } from "./board/board";
import { TASKS_SCREEN_ID } from "./board/deps";
import {
  chatReminder,
  createChatPopover,
  createReminderRow,
  createTasksSidebarItem,
  runRemindCommand,
  runTaskCommand,
  type SurfaceDeps,
} from "./task-surfaces";
import { NotesPanel } from "./notes-panel";
import { createPromptPicker } from "./prompt-picker";
import { createDispatchScreen, DISPATCH_SCREEN_ID, DispatchSidebarItem } from "./dispatch";
import { createSidebarView } from "./sidebar-view";
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
  // A chat's pill and a workspace's header button show its reminder, kept current as tasks
  // change and as time passes.
  const ChatPopover = createChatPopover(tasks);
  function remindButton(agentId: string | null): PluginButton {
    const reminder = agentId ? chatReminder(tasks, agentId) : null;
    return { title: "Remind me", icon: "AlarmClock", label: reminderLabel(reminder, new Date()), behavior: { kind: "popover", Content: ChatPopover } };
  }
  function keepLabelsCurrent(update: () => void) {
    const stop = tasks.tasks.subscribe(update);
    const timer = setInterval(update, 60_000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }
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
      name: "tasks.surfaces",
      key: () => "always",
      register(_input, track) {
        track(client.addScreen({ id: TASKS_SCREEN_ID, title: "Tasks", Component: createTasksScreen(tasks) }));
        track(client.addWorkspacePanel({ id: "tasks", title: "Tasks", icon: "ListTodo", context: "workspace", Component: createWorkspaceTasksPanel(tasks) }));
        track(client.addSidebarHeaderItem({ id: "tasks", title: "Tasks", Component: createTasksSidebarItem(tasks) }));
        track(client.addScreen({ id: DISPATCH_SCREEN_ID, title: "Dispatch", Component: createDispatchScreen(tasks) }));
        track(client.addSidebarHeaderItem({ id: "dispatch", title: "Dispatch", Component: DispatchSidebarItem }));
        track(
          client.addCommandCenterItem({
            id: "morphise-dispatch",
            title: "Dispatch prompts to new workspaces",
            icon: "Send",
            keywords: ["dispatch", "batch", "parallel", "agents", "prompts", "new workspace"],
            context: "global",
            onSelect: ({ openScreen }) => openScreen({ screenId: DISPATCH_SCREEN_ID }),
          }),
        );
        track(client.addTimelineRenderer({ kind: "reminder", version: 1, schema: reminderRowSchema, Component: createReminderRow(tasks) }));
        const global = [
          { id: "morphise-tasks", title: "Open tasks", tab: "board" },
          { id: "morphise-tasks-today", title: "Open today's tasks and reminders", tab: "today" },
        ];
        for (const item of global) {
          track(
            client.addCommandCenterItem({
              id: item.id,
              title: item.title,
              icon: "ListTodo",
              keywords: ["tasks", "board", "kanban", "todo", "reminders"],
              context: "global",
              onSelect: ({ openScreen }) => openScreen({ screenId: TASKS_SCREEN_ID, params: { tab: item.tab } }),
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
                openScreen({ screenId: TASKS_SCREEN_ID, params: { tab: "board" } });
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
      name: "reminders.pills",
      key: ({ directory }) => json(directory.agents),
      register({ directory }, track) {
        const pills: { agentId: string; registration: ReturnType<typeof client.addComposerPill> }[] = [];
        // Tracked one by one, so pills added before a failing one are still removed.
        for (const agent of directory.agents) {
          const registration = client.addComposerPill({ id: "morphise-remind", workspaceId: agent.workspaceId, agentId: agent.id, button: remindButton(agent.id) });
          track(() => registration.remove());
          pills.push({ agentId: agent.id, registration });
        }
        track(keepLabelsCurrent(() => pills.forEach(({ agentId, registration }) => registration.update({ label: remindButton(agentId).label }))));
      },
    },
    {
      name: "reminders.headerButtons",
      key: ({ directory }) => json(directory.workspaces),
      register({ directory }, track) {
        for (const workspaceId of directory.workspaces) {
          const registration = client.addHeaderButton({ id: "morphise-remind", workspaceId, button: { ...remindButton(null), label: undefined } });
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
