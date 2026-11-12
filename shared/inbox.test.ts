import { describe, expect, it } from "vitest";
import { inboxSettings, previewLine, summarizePermission, waitsOnUser, withCleared } from "./inbox";

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

describe("withCleared", () => {
  it("adds keys and forgets those no longer waiting", () => {
    expect(withCleared(["x@1", "gone@1"], ["y@2"], new Set(["x@1", "y@2"]))).toEqual(["x@1", "y@2"]);
  });
});

describe("inboxSettings", () => {
  it("reads settings saved before the card lines existed with both lines shown, at the same version", () => {
    expect(inboxSettings.version).toBe(1);
    expect(inboxSettings.schema.parse({ group: "workspace", cleared: ["a@1"] })).toEqual({ group: "workspace", cleared: ["a@1"], cardWorkspace: true, cardPreview: true });
    expect(inboxSettings.schema.parse({})).toEqual({ group: "reason", cleared: [], cardWorkspace: true, cardPreview: true });
  });

  it("keeps the card lines turned off, and refuses a value that is not on or off", () => {
    expect(inboxSettings.schema.parse({ cardWorkspace: false, cardPreview: false })).toMatchObject({ cardWorkspace: false, cardPreview: false });
    expect(inboxSettings.schema.safeParse({ cardPreview: "no" }).success).toBe(false);
  });
});

describe("waitsOnUser", () => {
  const finished = { id: "a", reason: "finished" as const, attentionAt: "2026-11-12T10:00:00Z" };
  it("is true for a permission, failure or unread finish in a listed workspace, not cleared", () => {
    expect(waitsOnUser(finished, true, new Set())).toBe(true);
    expect(waitsOnUser({ ...finished, reason: "permission" }, true, new Set(["a@2026-11-12T10:00:00Z"]))).toBe(true);
    expect(waitsOnUser(finished, true, new Set(["a@2026-11-12T10:00:00Z"]))).toBe(false);
    expect(waitsOnUser(finished, false, new Set())).toBe(false);
    expect(waitsOnUser({ ...finished, reason: null }, true, new Set())).toBe(false);
  });
});
