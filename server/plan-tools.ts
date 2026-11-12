import { activeProfile, type ProfileDocument } from "../shared/document";
import type { SettingsState } from "./settings-watch";

// The steps card draws an agent's plan, which Paseo builds from Claude Code's task-list tools
// (TodoWrite, TaskCreate, TaskUpdate). Claude Code gives those tools only to older models (Opus
// 4.7, Sonnet 4.6, Haiku 4.5 and earlier) unless CLAUDE_CODE_ENABLE_TODO_TOOLS=1 is set
// (code.claude.com/docs/en/tools-reference.md#task-tool-availability), so on newer models the
// card never had a plan to show. While the card is on, every Claude agent is launched with it.

export const TODO_TOOLS_ENV = "CLAUDE_CODE_ENABLE_TODO_TOOLS";

interface ProfileReader {
  read(): Promise<SettingsState<ProfileDocument>>;
}

interface OpenRequest {
  provider: string;
  env?: Record<string, string>;
}

export function createPlanTools(profile: ProfileReader) {
  return async <Request extends OpenRequest>({ request }: { request: Request }): Promise<Request | undefined> => {
    if (request.provider !== "claude" && !request.provider.startsWith("claude/")) return undefined;
    // A value the user set for this launch wins.
    if (request.env && TODO_TOOLS_ENV in request.env) return undefined;
    let state: SettingsState<ProfileDocument>;
    try {
      state = await profile.read();
    } catch (error) {
      // An unreadable profile must never stop an agent from opening; it opens as Paseo would.
      console.error("[morphise] Could not read the profile to give the agent its task-list tools", error);
      return undefined;
    }
    if (state.status !== "ready" || activeProfile(state.values).sidebar.view.stepsCard === false) return undefined;
    return { ...request, env: { ...request.env, [TODO_TOOLS_ENV]: "1" } };
  };
}
