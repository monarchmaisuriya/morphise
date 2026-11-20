import type { PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { activeProfile, type ProfileDocument } from "../shared/document";
import type { SettingsState } from "./settings-watch";
import { TITLE_HELPER } from "./titles";

// The steps card draws an agent's plan, which Paseo builds from Claude Code's task-list tools
// (TodoWrite, TaskCreate, TaskUpdate). Claude Code gives those tools only to older models (Opus
// 4.7, Sonnet 4.6, Haiku 4.5 and earlier) unless CLAUDE_CODE_ENABLE_TODO_TOOLS=1 is set
// (code.claude.com/docs/en/tools-reference.md#task-tool-availability), so on newer models the
// card never had a plan to show. Derive both the environment and guidance at each open, without
// saving either. The host's resolved adapter selects compatibility, never the execution provider.

export const TODO_TOOLS_ENV = "CLAUDE_CODE_ENABLE_TODO_TOOLS";
export const TASK_LIST_INSTRUCTION =
  "When a task takes several steps, keep a task list: load TaskCreate and TaskUpdate with ToolSearch, add the steps, and mark each one in progress and then completed as you go. Paseo shows this list to the user as the chat's steps.";

interface ProfileReader {
  read(): Promise<SettingsState<ProfileDocument>>;
}

// Morphise's title helper is told to use no tools; it gets neither the task-list tools nor the request to use them.
const isTitleHelper = (metadata: Readonly<Record<string, unknown>> | undefined) => metadata?.[TITLE_HELPER] === true;

// Whether the steps card is on. An unreadable profile counts as off, so the agent starts as Paseo would start it.
async function stepsCardOn(profile: ProfileReader, purpose: string): Promise<boolean> {
  try {
    const state = await profile.read();
    return state.status === "ready" && activeProfile(state.values).sidebar.view.stepsCard !== false;
  } catch (error) {
    console.error(`[morphise] Could not read the profile to ${purpose}`, error);
    return false;
  }
}

export function createPlanTools(profile: ProfileReader) {
  return async ({ request }: { request: PluginSessionOpenRequest }): Promise<PluginSessionOpenRequest | undefined> => {
    const support = request.openSupport;
    if (request.purpose === "history" || support?.adapter.kind !== "builtin" || support.adapter.id !== "claude" || isTitleHelper(request.metadata)) return undefined;
    if (!(await stepsCardOn(profile, "give the agent its task-list tools"))) return undefined;
    const explicit = Object.hasOwn(request.env, TODO_TOOLS_ENV);
    if (explicit && request.env[TODO_TOOLS_ENV] !== "1") return undefined;
    if (!explicit && support.restrictions.processEnvironment !== "mutable") {
      console.info(`[morphise] ${request.agentId} task-list: process environment is not mutable`);
      return undefined;
    }
    const prompt = request.baseConfig?.systemPrompt ?? "";
    const savedTaskSelector = ["task-list-prompt", "task-list-prompt-before-html"].some((id) => {
      const state = request.legacyConfigState?.selectors[id];
      return state !== undefined && state !== "absent";
    });
    const savedGuidance = savedTaskSelector || prompt.includes(TASK_LIST_INSTRUCTION) || prompt.includes("<morphise-task-list>");
    if (savedGuidance) console.info(`[morphise] ${request.agentId} task-list: saved or ambiguous guidance retained; fresh guidance suppressed`);
    const instructions = support.instructions === "supported" && !savedGuidance;
    if (explicit && !instructions) return undefined;
    return {
      ...request,
      ...(!explicit && { env: { ...request.env, [TODO_TOOLS_ENV]: "1" } }),
      ...(instructions && { appendSystemPrompt: [...(request.appendSystemPrompt ?? []), `<morphise-task-list>\n${TASK_LIST_INSTRUCTION}\n</morphise-task-list>`] }),
    };
  };
}
