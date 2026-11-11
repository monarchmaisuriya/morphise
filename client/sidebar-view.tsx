import {
  type AgentRef,
  type PluginSidebarViewProps,
  type WorkspaceRef,
  useAgent,
  useAgents,
  useWorkspace,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Profile } from "../shared/profile";

type ViewConfig = Profile["sidebar"]["view"];
type Theme = PluginSidebarViewProps["theme"];

const INDICATOR_TOKEN = {
  needs_input: "statusWarning",
  attention: "statusWarning",
  failed: "statusDanger",
  running: "accent",
  done: "statusSuccess",
} as const;

function workspaceName(workspace: PluginWorkspaceSnapshot): string {
  return workspace.title ?? workspace.name;
}

function byActivity(left: PluginWorkspaceSnapshot, right: PluginWorkspaceSnapshot): number {
  // Newest prompt first; never-prompted workspaces last.
  return (right.lastPromptAt ?? "").localeCompare(left.lastPromptAt ?? "");
}

function byName(left: PluginWorkspaceSnapshot, right: PluginWorkspaceSnapshot): number {
  return workspaceName(left).localeCompare(workspaceName(right));
}

function groupKeys(groupBy: ViewConfig["groupBy"], workspace: PluginWorkspaceSnapshot) {
  if (groupBy === "project") return { key: workspace.project.key, title: workspace.projectDisplayName };
  if (groupBy === "status") return { key: workspace.indicator, title: workspace.indicatorLabel ?? workspace.indicator };
  // A workspace without labels would be in no group, and so hidden; give it one.
  return workspace.labels.length > 0 ? workspace.labels : [{ key: "unlabelled", title: "Unlabelled" }];
}

function rowStyles(theme: Theme, config: ViewConfig) {
  const height = config.density === "compact" ? 28 : 36;
  return {
    scroll: { flex: 1 },
    heading: { color: theme.colors.foregroundMuted, fontSize: 11, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
    row: { minHeight: height, paddingHorizontal: 12, flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    agentRow: { minHeight: height - 4, paddingLeft: 30, paddingRight: 12, flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    selected: { backgroundColor: theme.colors.surface2 },
    label: { color: theme.colors.foreground, fontSize: 12, lineHeight: 16, flexShrink: 1 },
    secondary: { color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    empty: { color: theme.colors.foregroundMuted, fontSize: 12, padding: 12 },
  };
}

type Styles = ReturnType<typeof rowStyles>;

function AgentRow({ reference, props, styles }: { reference: AgentRef; props: PluginSidebarViewProps; styles: Styles }) {
  const agent = useAgent(reference, (item) => ({ title: item.title, provider: item.provider }));
  if (!agent) return null;
  const selected = props.active.agent?.key === reference.key;
  const label = agent.title ?? agent.provider;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open agent ${label}`}
      onPress={() => props.navigation.openAgent(reference)}
      style={[styles.agentRow, selected ? styles.selected : null]}
    >
      <Icon name="Bot" size={12} color={props.theme.colors.foregroundMuted} />
      <Text style={styles.secondary} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function WorkspaceAgents({ reference, props, styles }: { reference: WorkspaceRef; props: PluginSidebarViewProps; styles: Styles }) {
  const agents = useAgents({
    hosts: [reference.hostId],
    where: (agent) => agent.workspace.key === reference.key,
    orderBy: ["lastActivityAt", "desc"],
  });
  return (
    <>
      {agents.map((agent) => (
        <AgentRow key={agent.key} reference={agent} props={props} styles={styles} />
      ))}
    </>
  );
}

function WorkspaceRow({
  reference,
  props,
  styles,
  config,
}: {
  reference: WorkspaceRef;
  props: PluginSidebarViewProps;
  styles: Styles;
  config: ViewConfig;
}) {
  const workspace = useWorkspace(reference, (item) => ({ name: workspaceName(item), indicator: item.indicator, branch: item.branch }));
  if (!workspace) return null;
  const selected = props.active.workspace?.key === reference.key;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open workspace ${workspace.name}`}
        onPress={() => props.navigation.openWorkspace(reference)}
        style={[styles.row, selected ? styles.selected : null]}
      >
        <View style={[styles.dot, { backgroundColor: props.theme.colors[INDICATOR_TOKEN[workspace.indicator]] }]} />
        <Text style={styles.label} numberOfLines={1}>
          {workspace.name}
        </Text>
        {config.density === "comfortable" && workspace.branch ? (
          <Text style={styles.secondary} numberOfLines={1}>
            {workspace.branch}
          </Text>
        ) : null}
      </Pressable>
      {config.showAgents ? <WorkspaceAgents reference={reference} props={props} styles={styles} /> : null}
    </View>
  );
}

export function createSidebarView(config: ViewConfig) {
  const visible = (workspace: PluginWorkspaceSnapshot) => workspace.archivingAt === null && !workspace.background;
  const orderBy = config.orderBy === "name" ? byName : byActivity;
  // Chosen once per profile, so each view instance always calls the same hooks.
  const useSections =
    config.groupBy === "none"
      ? () => [{ key: "all", title: null, items: useWorkspaces({ where: visible, orderBy }) }]
      : () => useWorkspaces({ where: visible, orderBy, groupBy: (workspace) => groupKeys(config.groupBy, workspace) });
  return function MorphiseSidebarView(props: PluginSidebarViewProps) {
    const styles = useMemo(() => rowStyles(props.theme, config), [props.theme]);
    const sections = useSections();
    if (sections.every((section) => section.items.length === 0)) {
      return <Text style={styles.empty}>No workspaces yet</Text>;
    }
    return (
      <ScrollView style={styles.scroll}>
        {sections.map((section) => (
          <View key={section.key}>
            {section.title ? <Text style={styles.heading}>{section.title}</Text> : null}
            {section.items.map((reference) => (
              <WorkspaceRow key={reference.key} reference={reference} props={props} styles={styles} config={config} />
            ))}
          </View>
        ))}
      </ScrollView>
    );
  };
}
