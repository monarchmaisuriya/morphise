import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile";
import { chatTree, effectiveIndicator, owningRowKey, readMark, rowShows, rowTitle, statusLine, visibleChats } from "./row-meta";

const view = (patch: Record<string, unknown> = {}) => profileSchema.parse({ sidebar: { view: patch } }).sidebar.view;

describe("rowShows", () => {
  it("follows Paseo's defaults when nothing is chosen", () => {
    expect(rowShows(view())).toEqual({ branch: false, project: false, diff: false, host: true, pullRequest: true, checks: true, services: true, labels: true, lastActivity: true });
  });

  it("keeps the user's choices", () => {
    const shows = rowShows(view({ details: { branch: true, diff: true }, show: { host: false, lastActivity: false } }));
    expect(shows).toMatchObject({ branch: true, diff: true, host: false, lastActivity: false, pullRequest: true });
  });
});

describe("rowTitle", () => {
  it("names the row by title, else name, or by branch when chosen", () => {
    expect(rowTitle(view(), { name: "api1", title: "Fix login", branch: "fix/login" })).toBe("Fix login");
    expect(rowTitle(view(), { name: "api1", title: null, branch: "fix/login" })).toBe("api1");
    expect(rowTitle(view({ titleSource: "branch" }), { name: "api1", title: "Fix login", branch: "fix/login" })).toBe("fix/login");
    expect(rowTitle(view({ titleSource: "branch" }), { name: "api1", title: "Fix login", branch: null })).toBe("Fix login");
  });
});

describe("statusLine", () => {
  it("leads with what needs the user, then what is running, then the latest chat", () => {
    expect(statusLine("needs_input", "Chat", "Row")).toEqual({ text: "Waiting for your permission", tone: "warning" });
    expect(statusLine("failed", "Chat", "Row")).toEqual({ text: "Failed", tone: "danger" });
    expect(statusLine("running", "Scan logs", "Row")).toEqual({ text: "Working · Scan logs", tone: "muted" });
    expect(statusLine("running", "Row", "Row")).toEqual({ text: "Working", tone: "muted" });
    expect(statusLine("done", "Scan logs", "Row")).toEqual({ text: "Scan logs", tone: "muted" });
    expect(statusLine("done", "Row", "Row")).toBeNull();
    expect(statusLine("attention", null, "Row")).toBeNull();
  });
});

describe("owningRowKey", () => {
  const tree = {
    top: [
      { key: "h:a", id: "a" },
      { key: "h:b", id: "b" },
    ],
    children: new Map([["a", [{ key: "h:s" }]]]),
  };

  it("is the open chat, or the chat an open sub-agent sits under when sub-agents show", () => {
    expect(owningRowKey(tree, "h:b", true)).toBe("h:b");
    expect(owningRowKey(tree, "h:s", true)).toBe("h:a");
  });

  it("is nothing when the open agent is not shown here, so the workspace keeps the highlight", () => {
    expect(owningRowKey(tree, "h:s", false)).toBeNull();
    expect(owningRowKey(tree, "h:z", true)).toBeNull();
    expect(owningRowKey(tree, null, true)).toBeNull();
  });
});

describe("visibleChats", () => {
  const refs = ["a", "b", "c", "d", "e", "f", "g"].map((key) => ({ key }));

  it("lists the latest few and counts the rest", () => {
    expect(visibleChats(refs, 5, false, null)).toEqual({ rows: refs.slice(0, 5), hidden: 2 });
    expect(visibleChats(refs, 5, true, null)).toEqual({ rows: refs, hidden: 0 });
    expect(visibleChats(refs.slice(0, 3), 5, false, null)).toEqual({ rows: refs.slice(0, 3), hidden: 0 });
  });

  it("keeps the open chat listed even past the limit", () => {
    expect(visibleChats(refs, 5, false, "g")).toEqual({ rows: [...refs.slice(0, 5), { key: "g" }], hidden: 1 });
    expect(visibleChats(refs, 5, false, "b").rows).toEqual(refs.slice(0, 5));
  });
});

describe("chatTree", () => {
  const ref = (id: string) => ({ key: `h:${id}`, id });
  const parents = new Map<string, string | null>([
    ["a", null],
    ["s1", "a"],
    ["s2", "s1"],
    ["o", "gone"],
    ["b", null],
  ]);

  it("nests sub-agents, deeper ones too, under their top-level chat, in list order", () => {
    const { top, children } = chatTree([ref("s2"), ref("a"), ref("o"), ref("s1"), ref("b")], parents);
    expect(top.map((item) => item.id)).toEqual(["a", "o", "b"]);
    expect(children.get("a")?.map((item) => item.id)).toEqual(["s2", "s1"]);
  });

  it("puts a sub-agent whose parent is not listed at the top level", () => {
    expect(chatTree([ref("o")], parents).top.map((item) => item.id)).toEqual(["o"]);
  });

  it("stops on a parent loop and still lists each chat once", () => {
    const loop = new Map<string, string | null>([["x", "y"], ["y", "x"]]);
    const { top, children } = chatTree([ref("x"), ref("y")], loop);
    expect(top.length + [...children.values()].flat().length).toBe(2);
  });
});

describe("marks", () => {
  const entered = "2026-11-12T09:00:00Z";

  it("reads only well-formed marks", () => {
    expect(readMark({ kind: "done", at: "2026-11-12T10:00:00Z", since: entered })).toEqual({ kind: "done", at: "2026-11-12T10:00:00Z", since: entered });
    expect(readMark({ kind: "done", at: "2026-11-12T10:00:00Z", since: null })).toEqual({ kind: "done", at: "2026-11-12T10:00:00Z", since: null });
    expect(readMark({ kind: "other", at: "2026-11-12T10:00:00Z", since: entered })).toBeNull();
    expect(readMark({ kind: "done", at: "soon", since: entered })).toBeNull();
    expect(readMark({ kind: "done", at: "2026-11-12T10:00:00Z", since: 5 })).toBeNull();
    expect(readMark(null)).toBeNull();
  });

  it("shows the mark while the status it was made against has not changed", () => {
    const done = { kind: "done" as const, at: "2026-11-12T10:00:00Z", since: entered };
    expect(effectiveIndicator("attention", entered, done)).toBe("done");
    expect(effectiveIndicator("running", "2026-11-12T11:00:00Z", done)).toBe("running");
    expect(effectiveIndicator("done", entered, { kind: "unread", at: "2026-11-12T10:00:00Z", since: entered })).toBe("attention");
    expect(effectiveIndicator("done", entered, null)).toBe("done");
  });

  it("never hides a permission request or a failure", () => {
    const done = { kind: "done" as const, at: "2026-11-12T10:00:00Z", since: entered };
    expect(effectiveIndicator("needs_input", entered, done)).toBe("needs_input");
    expect(effectiveIndicator("failed", entered, done)).toBe("failed");
  });
});
