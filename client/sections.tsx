import type { PluginButton, PluginClientContext, PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import type { Prompt } from "../shared/document";
import type { Profile } from "../shared/profile";
import { buildStyleSheet } from "../shared/style-sheet";
import { createComposerControl, createPresetField } from "./composer-surfaces";
import type { Directory } from "./directory";
import type { Section } from "./reconciler";
import { type ActionDeps, type ActionTarget, runAction } from "./run-action";
import { reminderRowSchema, remindersArm } from "../shared/reminder-contracts";
import { presetTitle } from "../shared/reminders";
import {
  changeReminder,
  createReminderRow,
  createRemindersScreen,
  createRemindersSidebarItem,
  REMINDERS_SCREEN_ID,
  type ReminderDeps,
  reminderMenu,
  runRemindCommand,
} from "./reminder-surfaces";
import { NotesPanel } from "./notes-panel";
import { createPromptPicker } from "./prompt-picker";
import { createSidebarView } from "./sidebar-view";
import { applyStyleSheet } from "./web";


export interface Applied {
  profile: Profile;
  // Every layout's id and name, and which one applies.
  layouts: { active: string; list: readonly { id: string; name: string }[] };
  // Shared by every layout.
  prompts: readonly Prompt[];
  directory: Directory;
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

export function createSections(client: PluginClientContext, deps: ActionDeps, reminderDeps: ReminderDeps, switchLayout: (id: string) => Promise<void>): Section<Applied>[] {
  // The reminder settings in effect right now, for surfaces registered once.
  let reminderSettings: Profile["reminders"] | null = null;
  const settingsOf = () => {
    if (!reminderSettings) throw new Error("Morphise has not received its profile yet");
    return reminderSettings;
  };
  const arm = (agentId: string) => client.rpc(remindersArm, { agentId });
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
            Component: createSidebarView(sidebar.view, { reminders: reminderDeps.reminders, arm }),
          }),
        );
      },
    },
    {
      // Kept current for the surfaces below, which are registered once.
      name: "reminders.settings",
      key: ({ profile }) => json(profile.reminders),
      register({ profile }) {
        reminderSettings = profile.reminders;
      },
    },
    {
      name: "reminders.surfaces",
      key: () => "always",
      register(_input, track) {
        track(client.addScreen({ id: REMINDERS_SCREEN_ID, title: "Reminders", Component: createRemindersScreen(reminderDeps, settingsOf) }));
        track(client.addSidebarHeaderItem({ id: "reminders", title: "Reminders", Component: createRemindersSidebarItem(reminderDeps) }));
        track(client.addTimelineRenderer({ kind: "reminder", version: 1, schema: reminderRowSchema, Component: createReminderRow(client, settingsOf) }));
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
      key: ({ profile, directory }) => json([profile.reminders, directory.agents]),
      register({ profile, directory }, track) {
        for (const agent of directory.agents) {
          const registration = client.addComposerPill({
            id: "morphise-remind",
            workspaceId: agent.workspaceId,
            agentId: agent.id,
            button: reminderMenu(client, agent.id, profile.reminders),
          });
          track(() => registration.remove());
        }
      },
    },
    {
      name: "reminders.commands",
      key: ({ profile }) => json(profile.reminders),
      register({ profile }, track) {
        const settings = profile.reminders;
        track(
          client.addSlashCommand({
            name: "remind",
            description: "Remind me about this chat later",
            argumentHint: "45m, 2h or clear",
            context: "agent",
            onSubmit: ({ agent, args }) => runRemindCommand(client, agent.id, args, settings),
          }),
        );
        for (const minutes of settings.presets) {
          track(
            client.addCommandCenterItem({
              id: `morphise-remind-${minutes}`,
              title: `Remind me about this chat in ${presetTitle(minutes)}`,
              icon: "AlarmClock",
              keywords: ["remind", "reminder", "later"],
              context: "agent",
              onSelect: ({ agent }) => changeReminder(client, agent.id, minutes, settings),
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
            onSelect: ({ agent }) => changeReminder(client, agent.id, null, settings),
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
