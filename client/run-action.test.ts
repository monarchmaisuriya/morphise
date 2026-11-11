import type { PluginComposer } from "@getpaseo/plugin/client";
import { describe, expect, it, vi } from "vitest";
import { runAction, type ActionDeps } from "./run-action";

function fakeComposer() {
  return {
    insertText: vi.fn(),
    setPrompt: vi.fn(),
    focus: vi.fn(async () => {}),
    setModel: vi.fn(async () => {}),
    setMode: vi.fn(async () => {}),
    setThinking: vi.fn(async () => {}),
  } as unknown as PluginComposer & Record<string, ReturnType<typeof vi.fn>>;
}

function deps(composers: Record<string, PluginComposer[]> = {}) {
  const calls = { selectors: [] as unknown[], settings: [] as string[], urls: [] as string[] };
  const value: ActionDeps = {
    composers(selector) {
      calls.selectors.push(selector);
      return "agentId" in selector ? (composers[selector.agentId] ?? []) : (composers.focused ?? []);
    },
    openSettings: (id) => void calls.settings.push(id),
    openUrl: async (url) => void calls.urls.push(url),
  };
  return { value, calls };
}

describe("runAction", () => {
  it("opens a URL", async () => {
    const d = deps();
    await runAction({ kind: "open-url", url: "https://paseo.sh" }, { kind: "focused" }, d.value);
    expect(d.calls.urls).toEqual(["https://paseo.sh"]);
  });

  it("opens the profile editor", async () => {
    const d = deps();
    await runAction({ kind: "open-editor" }, { kind: "focused" }, d.value);
    expect(d.calls.settings).toEqual(["profile"]);
  });

  it("inserts text into the focused composer and puts the cursor there", async () => {
    const composer = fakeComposer();
    const d = deps({ focused: [composer] });
    await runAction({ kind: "insert-text", text: "hi" }, { kind: "focused" }, d.value);
    expect(composer.insertText).toHaveBeenCalledWith("hi");
    expect(composer.focus).toHaveBeenCalled();
  });

  it("targets the named agent's composer", async () => {
    const composer = fakeComposer();
    const d = deps({ a1: [composer] });
    await runAction({ kind: "set-model", model: "haiku" }, { kind: "agent", agentId: "a1" }, d.value);
    expect(d.calls.selectors).toEqual([{ agentId: "a1" }]);
    expect(composer.setModel).toHaveBeenCalledWith("haiku");
  });

  it("uses the composer it was given without looking one up", async () => {
    const composer = fakeComposer();
    const d = deps();
    await runAction({ kind: "set-prompt", text: "" }, { kind: "composer", composer }, d.value);
    expect(composer.setPrompt).toHaveBeenCalledWith("");
    expect(d.calls.selectors).toEqual([]);
  });

  it("sets mode and thinking", async () => {
    const composer = fakeComposer();
    const d = deps({ focused: [composer] });
    await runAction({ kind: "set-mode", mode: "plan" }, { kind: "focused" }, d.value);
    await runAction({ kind: "set-thinking", thinking: "high" }, { kind: "focused" }, d.value);
    expect(composer.setMode).toHaveBeenCalledWith("plan");
    expect(composer.setThinking).toHaveBeenCalledWith("high");
  });

  it("fails with a reason when no agent composer is focused", async () => {
    const d = deps();
    await expect(runAction({ kind: "insert-text", text: "hi" }, { kind: "focused" }, d.value)).rejects.toThrow(
      "Open an agent first: this action changes the focused agent's message box",
    );
  });

  it("passes on the provider's refusal", async () => {
    const composer = fakeComposer();
    vi.mocked(composer.setModel).mockRejectedValue(new Error("Unknown model haiku"));
    const d = deps({ focused: [composer] });
    await expect(runAction({ kind: "set-model", model: "haiku" }, { kind: "focused" }, d.value)).rejects.toThrow("Unknown model haiku");
  });
});
