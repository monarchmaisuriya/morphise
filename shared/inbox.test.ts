import { describe, expect, it } from "vitest";
import { canClear, clearKey, inboxView, nextSelection, previewLine, summarizePermission, withCleared } from "./inbox";

// Shaped like Paseo's AgentPermissionRequest (protocol agent-types).
const shell = { id: "p1", provider: "claude", name: "Bash", kind: "tool", title: "Run tests", detail: { type: "shell", command: "npm test -- auth" } };

describe("summarizePermission", () => {
  it("shows the command a shell request wants to run", () => {
    const request = summarizePermission(shell);
    expect(request).toMatchObject({ id: "p1", tool: "Bash", subject: "npm test -- auth", body: "", answerInChat: false, choices: [] });
    expect(previewLine({ reason: "permission", permission: request, error: "" })).toBe("Bash: npm test -- auth");
  });

  it("keeps the provider's own buttons, in order, and drops malformed ones", () => {
    const request = summarizePermission({
      ...shell,
      kind: "plan",
      detail: { type: "plan", text: "1. Do it" },
      actions: [
        { id: "go", label: "Implement", behavior: "allow", variant: "primary" },
        { id: "bad", label: "Broken", behavior: "maybe" },
        { id: "no", label: "Keep planning", behavior: "deny" },
      ],
    });
    expect(request?.body).toBe("1. Do it");
    expect(request?.choices).toEqual([
      { id: "go", label: "Implement", behavior: "allow", variant: "primary" },
      { id: "no", label: "Keep planning", behavior: "deny", variant: "secondary" },
    ]);
  });

  it("shows the raw input when the request has no detail, cut to a readable size", () => {
    const request = summarizePermission({ id: "p2", name: "mcp__x", kind: "tool", input: { text: "y".repeat(9000) } });
    expect(request?.body.startsWith("{")).toBe(true);
    expect(request?.body.length).toBe(4000);
  });

  it("sends questions to the chat, since Allow and Deny cannot answer them", () => {
    const request = summarizePermission({ id: "q", name: "AskUserQuestion", kind: "question", title: "Which database?" });
    expect(request?.answerInChat).toBe(true);
    expect(previewLine({ reason: "permission", permission: request, error: "" })).toBe("Which database?");
  });

  it("is null for anything that is not a request", () => {
    expect(summarizePermission(null)).toBeNull();
    expect(summarizePermission({ name: "Bash" })).toBeNull();
  });
});

describe("previewLine", () => {
  it("shows the first line of an error", () => {
    expect(previewLine({ reason: "failed", permission: null, error: "Rate limited\nretry later" })).toBe("Rate limited");
  });
});

const entry = (id: string, reason: "permission" | "failed" | "finished", at: string, title = id, workspace = "api") => ({ id, reason, at, attentionAt: at, title, workspace });

describe("inboxView", () => {
  const entries = [entry("a", "finished", "2026-11-12T10:00:00Z"), entry("b", "permission", "2026-11-12T09:00:00Z"), entry("c", "finished", "2026-11-12T11:00:00Z", "Fix login"), entry("d", "failed", "2026-11-12T08:00:00Z", "d", "web")];

  it("orders by urgency, then newest first, and counts every reason", () => {
    const { shown, counts } = inboxView(entries, { filter: "all", search: "", cleared: new Set() });
    expect(shown.map((item) => item.id)).toEqual(["b", "d", "c", "a"]);
    expect(counts).toEqual({ all: 4, permission: 1, failed: 1, finished: 2 });
  });

  it("filters by reason but keeps the other counts for the chips", () => {
    const { shown, counts } = inboxView(entries, { filter: "finished", search: "", cleared: new Set() });
    expect(shown.map((item) => item.id)).toEqual(["c", "a"]);
    expect(counts.permission).toBe(1);
  });

  it("searches titles and workspaces, every word", () => {
    expect(inboxView(entries, { filter: "all", search: "fix api", cleared: new Set() }).shown.map((item) => item.id)).toEqual(["c"]);
    expect(inboxView(entries, { filter: "all", search: "web", cleared: new Set() }).shown.map((item) => item.id)).toEqual(["d"]);
  });

  it("hides a cleared finished item until it finishes again, and never hides a permission", () => {
    const cleared = new Set([clearKey(entries[0]), clearKey(entries[1])]);
    expect(inboxView(entries, { filter: "all", search: "", cleared }).shown.map((item) => item.id)).toEqual(["b", "d", "c"]);
    const again = [{ ...entries[0], at: "2026-11-12T12:00:00Z", attentionAt: "2026-11-12T12:00:00Z" }];
    expect(inboxView(again, { filter: "all", search: "", cleared }).shown).toHaveLength(1);
  });

  it("cannot clear an item Paseo gave no finish time, so it never stays hidden through later finishes", () => {
    const untimed = { ...entries[0], attentionAt: "" };
    expect(canClear(untimed)).toBe(false);
    expect(inboxView([untimed], { filter: "all", search: "", cleared: new Set([clearKey(untimed)]) }).shown).toHaveLength(1);
  });
});

describe("nextSelection", () => {
  const before = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("keeps the selection while it is listed", () => {
    expect(nextSelection(before, before, "b")).toBe("b");
  });
  it("moves to the next item when the selected one leaves, or the previous at the end", () => {
    expect(nextSelection(before, [{ id: "a" }, { id: "c" }], "b")).toBe("c");
    expect(nextSelection(before, [{ id: "a" }, { id: "b" }], "c")).toBe("b");
  });
  it("is null when nothing is left", () => {
    expect(nextSelection(before, [], "a")).toBeNull();
  });
});

describe("withCleared", () => {
  it("adds keys and forgets those no longer waiting", () => {
    expect(withCleared(["x@1", "gone@1"], ["y@2"], new Set(["x@1", "y@2"]))).toEqual(["x@1", "y@2"]);
  });
});
