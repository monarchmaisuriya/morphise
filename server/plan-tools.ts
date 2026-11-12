import { activeProfile, type ProfileDocument } from "../shared/document";
import type { SettingsState } from "./settings-watch";

// The steps card draws an agent's plan, which Paseo builds from Claude Code's task-list tools
// (TodoWrite, TaskCreate, TaskUpdate). Claude Code gives those tools only to older models (Opus
// 4.7, Sonnet 4.6, Haiku 4.5 and earlier) unless CLAUDE_CODE_ENABLE_TODO_TOOLS=1 is set
// (code.claude.com/docs/en/tools-reference.md#task-tool-availability), so on newer models the
// card never had a plan to show. While the card is on, every Claude agent is launched with it.
// Claude Code also defers those tools (the model sees only their names until it loads them with
// ToolSearch), and agents never load them unasked, so each new Claude agent is also asked to keep
// a task list. Paseo appends that to Claude Code's own instructions; it does not replace them.

export const TODO_TOOLS_ENV = "CLAUDE_CODE_ENABLE_TODO_TOOLS";
export const TASK_LIST_INSTRUCTION =
  "When a task takes several steps, keep a task list: load TaskCreate and TaskUpdate with ToolSearch, add the steps, and mark each one in progress and then completed as you go. Paseo shows this list to the user as the chat's steps.";

interface ProfileReader {
  read(): Promise<SettingsState<ProfileDocument>>;
}

interface OpenRequest {
  provider: string;
  env?: Record<string, string>;
}

const isClaude = (provider: string) => provider === "claude" || provider.startsWith("claude/");

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
  return async <Request extends OpenRequest>({ request }: { request: Request }): Promise<Request | undefined> => {
    if (!isClaude(request.provider)) return undefined;
    // A value the user set for this launch wins.
    if (request.env && TODO_TOOLS_ENV in request.env) return undefined;
    if (!(await stepsCardOn(profile, "give the agent its task-list tools"))) return undefined;
    return { ...request, env: { ...request.env, [TODO_TOOLS_ENV]: "1" } };
  };
}

interface CreateRequest {
  config: { provider: string; systemPrompt?: string };
}

/** For `agent.create.before`: a new Claude agent's instructions end with TASK_LIST_INSTRUCTION while the steps card is on. */
export function createPlanInstruction(profile: ProfileReader) {
  return async <Request extends CreateRequest>({ request }: { request: Request }): Promise<Request | undefined> => {
    const { config } = request;
    if (!isClaude(config.provider) || config.systemPrompt?.includes(TASK_LIST_INSTRUCTION)) return undefined;
    if (!(await stepsCardOn(profile, "ask the agent to keep a task list"))) return undefined;
    return { ...request, config: { ...config, systemPrompt: config.systemPrompt ? `${config.systemPrompt}\n\n${TASK_LIST_INSTRUCTION}` : TASK_LIST_INSTRUCTION } };
  };
}
