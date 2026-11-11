import type { PluginComposer, PluginComposerSelector } from "@getpaseo/plugin/client";
import type { Action } from "../shared/actions";

export const EDITOR_SCREEN_ID = "profile";

// Which message box (composer) a composer action changes.
export type ActionTarget =
  | { kind: "focused" }
  | { kind: "agent"; agentId: string }
  | { kind: "composer"; composer: PluginComposer };

export interface ActionDeps {
  composers(selector: PluginComposerSelector): readonly PluginComposer[];
  openSettings(id: string): void;
  openUrl(url: string): Promise<void>;
}

function composerFor(target: ActionTarget, deps: ActionDeps): PluginComposer {
  if (target.kind === "composer") return target.composer;
  const [composer] = deps.composers(target.kind === "agent" ? { agentId: target.agentId } : { focused: true });
  if (composer) return composer;
  throw new Error(
    target.kind === "agent"
      ? "This agent's message box is unavailable; the agent may be archived"
      : "Open an agent first: this action changes the focused agent's message box",
  );
}

// The one place every configured action runs. Failures reject; Paseo's buttons and commands
// show a rejected promise as an error toast.
export async function runAction(action: Action, target: ActionTarget, deps: ActionDeps): Promise<void> {
  switch (action.kind) {
    case "open-url":
      return deps.openUrl(action.url);
    case "open-editor":
      return deps.openSettings(EDITOR_SCREEN_ID);
    case "insert-text": {
      const composer = composerFor(target, deps);
      composer.insertText(action.text);
      return composer.focus();
    }
    case "set-prompt": {
      const composer = composerFor(target, deps);
      composer.setPrompt(action.text);
      return composer.focus();
    }
    case "set-model":
      return composerFor(target, deps).setModel(action.model);
    case "set-mode":
      return composerFor(target, deps).setMode(action.mode);
    case "set-thinking":
      return composerFor(target, deps).setThinking(action.thinking);
  }
}
