import type { PluginButton, PluginClientContext, PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import type { Profile } from "../shared/profile";
import { buildStyleSheet } from "../shared/style-sheet";
import { createComposerControl, createPresetField } from "./composer-surfaces";
import type { Directory } from "./directory";
import type { Section } from "./reconciler";
import { type ActionDeps, type ActionTarget, runAction } from "./run-action";
import { createSidebarView } from "./sidebar-view";
import { applyStyleSheet } from "./web";

export interface Applied {
  profile: Profile;
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

export function createSections(client: PluginClientContext, deps: ActionDeps): Section<Applied>[] {
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
      register({ profile: { sidebar } }, track) {
        if (!sidebar.view.enabled) return;
        track(
          client.addSidebarView({
            id: "profile-view",
            title: "Morphise",
            description: "Workspaces laid out by your Morphise profile",
            Component: createSidebarView(sidebar.view),
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
