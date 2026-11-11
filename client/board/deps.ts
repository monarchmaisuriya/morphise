import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { Chats } from "../chats";
import type { WorkspaceList } from "../workspaces";
import type { ValueStore } from "../profile-store";
import type { PickerDeps } from "../reminder-picker";

// What the board, its dialogs and the task surfaces need from plugin scope. Passed as props, not
// read through plugin hooks, so dialogs and popovers work wherever Paseo draws them.
export interface BoardDeps extends PickerDeps {
  client: PluginClientContext;
  chats: ValueStore<Chats>;
  // Names for workspaces, readable in modals and popovers, where Paseo's workspace hooks cannot run.
  workspaces: ValueStore<WorkspaceList>;
}

export const TASKS_SCREEN_ID = "tasks";
