import { describe, expect, it, vi } from "vitest";
import { showResult } from "../shared/show";
import { startShow } from "./show";

// A phone: no key events reach the plugin, so the on-screen keyboard stands for typing.
const phone = vi.hoisted(() => ({ keyboardUp: false }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Keyboard: { isVisible: () => phone.keyboardUp },
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
}));
vi.mock("./web", () => ({ windowInFront: () => true, watchWindowUse: () => () => {} }));

describe("this window's side on a phone", () => {
  it("changes nothing while the keyboard is up, and acts once it is down", async () => {
    let deliver: (request: unknown) => void = () => {};
    const client = {
      rpc: vi.fn(async (_contract: unknown, _input: unknown) => ({ ok: true })),
      composers: () => [],
      openScreen: vi.fn(),
      subscribe: (_contract: unknown, _input: unknown, onEvent: (request: unknown) => void) => ((deliver = onEvent), Object.assign(() => {}, { ready: Promise.resolve() })),
    };
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const show = startShow(client as never);
    show.reopen();
    phone.keyboardUp = true;
    deliver({ requestId: "r1", input: { action: "screen", screen: "dispatch" } });
    await flush();
    expect(client.openScreen).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith(showResult, { requestId: "r1", ok: false, message: "The user is typing in Paseo right now, so nothing was changed; try again in a few seconds." });
    phone.keyboardUp = false;
    deliver({ requestId: "r2", input: { action: "screen", screen: "dispatch" } });
    await flush();
    expect(client.openScreen).toHaveBeenCalledWith({ screenId: "dispatch", params: undefined });
    show.stop();
  });
});
