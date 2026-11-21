import { expect, it, vi } from "vitest";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { quickChatArchive } from "../../shared/quick-chat";
import { registerQuickChat } from "./register";
import { QuickChatService } from "./service";

it("blocks archive while disabled but allows restoring an owned chat", async () => {
  const handlers = new Map<string, (input: unknown, context: unknown) => Promise<unknown>>();
  const lifecycle = vi.spyOn(QuickChatService.prototype, "setArchived").mockResolvedValue({ ok: true });
  try {
    registerQuickChat({ registerSettings: () => ({ read: async () => ({ status: "ready", values: { enabled: false } }) }), handle: (contract: { name: string }, handler: (input: unknown, context: unknown) => Promise<unknown>) => handlers.set(contract.name, handler) } as unknown as PluginServerContext);
    const action = handlers.get(quickChatArchive.name)!;
    await expect(action({ agentId: "owned", archived: true }, { paseo: {} })).rejects.toThrow("Enable Quick Chat");
    expect(lifecycle).not.toHaveBeenCalled();
    await expect(action({ agentId: "owned", archived: false }, { paseo: {} })).resolves.toEqual({ ok: true });
    expect(lifecycle).toHaveBeenCalledWith({}, "owned", false);
  } finally { lifecycle.mockRestore(); }
});
