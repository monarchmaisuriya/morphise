import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type ValueStore, useValue } from "../profile-store";
import { Dropdown, Field, Icon, MenuItem, type Tokens } from "../ui/kit";
import { workspaceChoices, type WorkspaceList } from "../workspaces";

// A workspace's name from the plugin's own list, so it works in modals as well as screens.
export function useWorkspaceName(workspaces: ValueStore<WorkspaceList>, workspaceId: string | null | undefined): string | null {
  const list = useValue(workspaces);
  return workspaceId ? list.get(workspaceId)?.name ?? null : null;
}

// Picks a workspace, or none: a value button that opens a searchable list of workspaces, most recently used first,
// each with its project. For a task: open workspaces, and one another task holds (`holder` gives that task's title)
// shows it and cannot be picked. `none` names the no-workspace choice ("All workspaces" for a filter);
// `includeClosed` lists archived workspaces too. `none.choice`: the no-workspace option is a real choice (a filter's "All"),
// drawn like a picked value.
export function WorkspacePicker({ t, workspaces, value, onChange, holder = () => null, none = { label: "No workspace", icon: "CircleSlash" }, includeClosed = false, width = 360 }: { t: Tokens; workspaces: ValueStore<WorkspaceList>; value: string | null; onChange(workspaceId: string | null): void; holder?(workspaceId: string): string | null; none?: { label: string; icon: string; choice?: boolean }; includeClosed?: boolean; width?: number }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const anchor = useRef<View>(null);
  const list = useValue(workspaces);
  const choices = workspaceChoices(list, search, includeClosed);
  const close = () => {
    setOpen(false);
    setSearch("");
  };
  const pick = (workspaceId: string | null) => {
    close();
    onChange(workspaceId);
  };
  const label = value ? list.get(value)?.name ?? "A closed workspace" : none.label;
  return (
    <View style={{ alignSelf: "stretch" }}>
      <Pressable
        ref={anchor}
        accessibilityRole="button"
        accessibilityLabel={`Workspace: ${label}. Change`}
        accessibilityState={{ expanded: open }}
        onPress={() => (open ? close() : setOpen(true))}
        style={{ alignSelf: "flex-start", maxWidth: "100%", height: t.control, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: t.radius.control, borderWidth: 1, borderColor: open ? t.c.accent : t.c.border, backgroundColor: t.c.surface1 }}
      >
        {/* Drawn as Select's trigger draws: a muted icon, and the label in the text colour once it names a choice (a workspace,
            or a none that is a real choice such as "All workspaces"). */}
        <Icon name="FolderGit2" size={14} color={t.c.foregroundMuted} />
        <Text style={{ color: value || none.choice ? t.c.foreground : t.c.foregroundMuted, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={t.c.foregroundMuted} />
      </Pressable>
      <Dropdown t={t} open={open} onClose={close} anchor={anchor} width={width} header={<Field t={t} plain autoFocus icon="Search" value={search} onChangeText={setSearch} placeholder="Find a workspace" accessibilityLabel="Find a workspace" />}>
        <MenuItem t={t} role="radio" icon={none.icon} label={none.label} checked={value === null} onPress={() => pick(null)} />
        {choices.map((workspace) => (
          <MenuItem key={workspace.id} t={t} role="radio" icon="FolderGit2" label={workspace.name} hint={holder(workspace.id) ? `On "${holder(workspace.id)}"` : workspace.open ? workspace.project : `${workspace.project} · archived`} disabled={holder(workspace.id) !== null} checked={workspace.id === value} onPress={() => pick(workspace.id)} />
        ))}
        {choices.length === 0 ? <Text style={[t.text.small, { padding: 8 }]}>No workspace matches</Text> : null}
      </Dropdown>
    </View>
  );
}
