import { Icon } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type ValueStore, useValue } from "../profile-store";
import { Field, MenuItem, type Tokens } from "../ui/kit";
import { workspaceChoices, type WorkspaceList } from "../workspaces";

// A workspace's name from the plugin's own list, so it works in modals as well as screens.
export function useWorkspaceName(workspaces: ValueStore<WorkspaceList>, workspaceId: string | null | undefined): string | null {
  const list = useValue(workspaces);
  return workspaceId ? list.get(workspaceId)?.name ?? null : null;
}

// Picks the workspace a task belongs to, or none: a value button that opens a searchable list of
// open workspaces, most recently used first.
export function WorkspacePicker({ t, workspaces, value, onChange }: { t: Tokens; workspaces: ValueStore<WorkspaceList>; value: string | null; onChange(workspaceId: string | null): void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const list = useValue(workspaces);
  const choices = workspaceChoices(list, search);
  const pick = (workspaceId: string | null) => {
    setOpen(false);
    setSearch("");
    onChange(workspaceId);
  };
  const label = value ? list.get(value)?.name ?? "A closed workspace" : "No workspace";
  return (
    <View style={{ gap: 4, alignSelf: "stretch" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Workspace: ${label}. Change`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ alignSelf: "flex-start", maxWidth: "100%", height: t.control, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: t.radius.control, borderWidth: 1, borderColor: open ? t.c.accent : t.c.border, backgroundColor: t.c.surface1 }}
      >
        <Icon name="FolderGit2" size={14} color={value ? t.c.foreground : t.c.foregroundMuted} />
        <Text style={{ color: value ? t.c.foreground : t.c.foregroundMuted, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={t.c.foregroundMuted} />
      </Pressable>
      {open ? (
        <View style={{ maxWidth: 380, padding: 4, gap: 4, borderRadius: t.radius.row, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
          <Field t={t} plain autoFocus icon="Search" value={search} onChangeText={setSearch} placeholder="Find a workspace" accessibilityLabel="Find a workspace" />
          <View>
            <MenuItem t={t} role="radio" icon="CircleSlash" label="No workspace" checked={value === null} onPress={() => pick(null)} />
            {choices.slice(0, 30).map((workspace) => (
              <MenuItem key={workspace.id} t={t} role="radio" icon="FolderGit2" label={workspace.name} hint={workspace.project} checked={workspace.id === value} onPress={() => pick(workspace.id)} />
            ))}
            {choices.length === 0 ? <Text style={[t.text.small, { padding: 8 }]}>No workspace matches</Text> : null}
            {choices.length > 30 ? <Text style={[t.text.small, { padding: 8 }]}>Type to find more</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
