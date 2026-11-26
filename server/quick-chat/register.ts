import type { PluginServerContext } from "@getpaseo/plugin/server";
import { quickChatArchive, quickChatContinue, quickChatList, quickChatPrepare, quickChatRecover, quickChatSettings, quickChatStart, quickChatTargets } from "../../shared/quick-chat";
import { QuickChatService } from "./service";

export function registerQuickChat(server: PluginServerContext) {
  const settings = server.registerSettings(quickChatSettings);
  const service = new QuickChatService();
  const enabled = async () => {
    const state = await settings.read();
    return state.status === "ready" && state.values.enabled;
  };
  const requireEnabled = async () => { if (!(await enabled())) throw new Error("Enable Quick Chat in Morphise settings first."); };
  server.handle(quickChatList, async ({ includeArchived }, { paseo }) => ({ enabled: await enabled(), directory: service.root, archiveSupported: true, chats: await service.list(paseo, includeArchived) }));
  server.handle(quickChatArchive, async ({ agentId, archived }, { paseo }) => { if (archived) await requireEnabled(); return service.setArchived(paseo, agentId, archived); });
  server.handle(quickChatStart, async ({ operationId, provider }, { paseo }) => { await requireEnabled(); return service.start(paseo, operationId, provider); });
  server.handle(quickChatTargets, async ({ agentId }, { paseo }) => { await requireEnabled(); return { targets: await service.targets(paseo), ...(agentId ? { blockedReason: await service.readiness(paseo, agentId) } : {}) }; });
  server.handle(quickChatPrepare, async ({ agentId, workspaceId }, { paseo }) => { await requireEnabled(); return service.prepare(paseo, agentId, workspaceId); });
  server.handle(quickChatContinue, async ({ previewId, text }, { paseo }) => { await requireEnabled(); return service.continue(paseo, previewId, text); });
  server.handle(quickChatRecover, async ({ operationId }, { paseo }) => service.recover(paseo, operationId));
  return () => {};
}
