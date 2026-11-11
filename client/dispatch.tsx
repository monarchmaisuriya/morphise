import { type PluginScreenProps, type PluginSidebarItemProps, usePaseo } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { Chats } from "./chats";
import { modelsOf, type ProjectInfo, projectsOf, titleFromPrompt } from "./dispatch-options";
import { type ValueStore, useValue } from "./profile-store";
import { Button, Field, IconButton, PopoverHost, Segmented, Select, type Tokens, useTokens } from "./ui/kit";
import type { WorkspaceList } from "./workspaces";

// The Dispatcher: several prompts at once, each started as its own new workspace and agent.

export const DISPATCH_SCREEN_ID = "dispatch";

// Paseo's state hooks do not run in plugin screens (0.16), so the screen reads Morphise's own
// workspace and chat stores.
export interface DispatchDeps {
  workspaces: ValueStore<WorkspaceList>;
  chats: ValueStore<Chats>;
}

type Where = "worktree" | "local";
type Started = { id: string; title: string };

export function createDispatchScreen(deps: DispatchDeps) {
  return function DispatchScreen(props: PluginScreenProps) {
    return <Dispatch {...props} deps={deps} />;
  };
}

function Dispatch({ theme, layout, params, navigation, deps }: PluginScreenProps & { deps: DispatchDeps }) {
  const t = useTokens(theme, layout.compact);
  const projects = projectsOf(useValue(deps.workspaces));
  const models = modelsOf(useValue(deps.chats));
  const [projectId, setProjectId] = useState<string | null>(typeof params.project === "string" ? params.project : null);
  const [model, setModel] = useState<string | null>(null);
  const chosen = projects.find((project) => project.id === projectId) ?? null;
  const agentModel = model ?? models[0] ?? null;
  return (
    <PopoverHost>
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Text style={t.text.title}>Dispatch</Text>
          <Text style={t.text.small}>Each prompt starts its own new workspace and agent.</Text>
        </View>
        <Select t={t} label="Project" placeholder="Choose a project" value={projectId} onChange={setProjectId} options={projects.map((project) => ({ value: project.id, label: project.name, icon: "Folder" }))} />
        <Select t={t} label="Agent" placeholder="No open chat to copy yet" value={agentModel} onChange={setModel} options={models.map((item) => ({ value: item, label: item, icon: "Bot" }))} />
        {chosen ? (
          <DispatchForm t={t} project={chosen} agentModel={agentModel} openWorkspace={navigation ? (id) => navigation.openWorkspace({ workspaceId: id }) : null} danger={theme.colors.statusDanger} />
        ) : (
          <Text style={t.text.small}>Choose a project first.</Text>
        )}
      </ScrollView>
    </PopoverHost>
  );
}

function DispatchForm({ t, project, agentModel, openWorkspace, danger }: { t: Tokens; project: ProjectInfo; agentModel: string | null; openWorkspace: ((workspaceId: string) => void) | null; danger: string }) {
  const paseo = usePaseo();
  const [isolation, setIsolation] = useState<Where>("worktree");
  const [prompts, setPrompts] = useState<string[]>([""]);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [started, setStarted] = useState<Started[]>([]);
  const canWorktree = project.kind === "git";
  const where: Where = canWorktree ? isolation : "local";
  const ready = prompts.map((prompt) => prompt.trim()).filter(Boolean);

  // One at a time, in order. A failure stops the run, says which prompt and why, and keeps the
  // prompts not yet started, so pressing Start again never starts one twice.
  const start = async () => {
    if (!agentModel || ready.length === 0) return;
    setProblem(null);
    setStarted([]);
    const queue = [...ready];
    const made: Started[] = [];
    setRunning({ done: 0, total: queue.length });
    while (queue.length) {
      const prompt = queue[0];
      const title = titleFromPrompt(prompt);
      try {
        // One request makes the workspace and its first agent, so a failing agent leaves no empty
        // workspace behind. The agent's folder is given as the project root; Paseo maps it into
        // the new workspace.
        const workspace = await paseo.workspaces.create({
          source: where === "worktree" ? { kind: "worktree", projectId: project.id, cwd: project.rootPath, action: "branch-off" } : { kind: "directory", path: project.rootPath },
          title,
          agent: { cwd: project.rootPath, config: { provider: agentModel }, prompt },
        });
        made.push({ id: workspace.id, title });
        queue.shift();
        setRunning({ done: made.length, total: ready.length });
      } catch (error) {
        setProblem(`Could not start "${title}": ${error instanceof Error ? error.message : String(error)}. ${made.length} started; the rest are still below.`);
        break;
      }
    }
    setPrompts(queue.length ? queue : [""]);
    setStarted(made);
    setRunning(null);
  };

  const count = ready.length;
  return (
    <View style={{ gap: 12 }}>
      {canWorktree ? (
        <Segmented<Where>
          t={t}
          label="Where each agent works"
          value={isolation}
          onChange={setIsolation}
          options={[
            { value: "worktree", label: "New worktree", icon: "GitBranch" },
            { value: "local", label: "Project folder", icon: "Folder" },
          ]}
        />
      ) : null}
      {prompts.map((prompt, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Field t={t} multiline value={prompt} onChangeText={(text) => !running && setPrompts(prompts.map((item, at) => (at === index ? text : item)))} placeholder={`Prompt ${index + 1}`} accessibilityLabel={`Prompt ${index + 1}`} />
          </View>
          {prompts.length > 1 ? <IconButton t={t} size="sm" icon="X" label={`Remove prompt ${index + 1}`} disabled={!!running} onPress={() => setPrompts(prompts.filter((_, at) => at !== index))} /> : null}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button t={t} icon="Plus" label="Add prompt" disabled={!!running} onPress={() => setPrompts([...prompts, ""])} />
        <Button
          t={t}
          variant="primary"
          icon="Send"
          label={running ? `Starting ${running.done + 1} of ${running.total}...` : count ? `Start ${count} ${count === 1 ? "agent" : "agents"}` : "Start"}
          disabled={!!running || !agentModel || count === 0}
          onPress={() => void start()}
        />
      </View>
      {!agentModel ? <Text style={t.text.small}>Start one chat in Paseo first: the Dispatcher uses the agents your open chats use.</Text> : null}
      {problem ? <Text style={[t.text.small, { color: danger }]}>{problem}</Text> : null}
      {started.length ? (
        <View style={{ gap: 6 }}>
          <Text style={t.text.label}>Started</Text>
          {started.map((item) => (
            <Button key={item.id} t={t} icon="FolderGit2" label={item.title} disabled={!openWorkspace} onPress={() => openWorkspace?.(item.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// The "Dispatch" row in Paseo's sidebar header, next to Tasks.
export function DispatchSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="Send" active={currentScreen?.screenId === DISPATCH_SCREEN_ID} onPress={() => openScreen({ screenId: DISPATCH_SCREEN_ID })} />;
}
