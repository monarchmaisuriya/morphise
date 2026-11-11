import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile";
import { owningChatKey, rowShows, rowTitle, statusLine, visibleChats } from "./row-meta";

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

describe("owningChatKey", () => {
  const chats = [
    { key: "h:a", id: "a" },
    { key: "h:b", id: "b" },
  ];

  it("is the open chat, or the parent of an open sub-agent when sub-agents are listed", () => {
    expect(owningChatKey(chats, { key: "h:b", parentId: null, closed: false }, true)).toBe("h:b");
    expect(owningChatKey(chats, { key: "h:s", parentId: "a", closed: false }, true)).toBe("h:a");
  });

  it("is nothing when the open agent is not listed here, so the workspace keeps the highlight", () => {
    expect(owningChatKey(chats, { key: "h:s", parentId: "a", closed: false }, false)).toBeNull();
    expect(owningChatKey(chats, { key: "h:z", parentId: null, closed: false }, true)).toBeNull();
    expect(owningChatKey(chats, { key: "h:s", parentId: "z", closed: false }, true)).toBeNull();
    expect(owningChatKey(chats, null, true)).toBeNull();
  });

  it("is nothing for a closed open agent, which no row lists", () => {
    expect(owningChatKey(chats, { key: "h:s", parentId: "a", closed: true }, true)).toBeNull();
    expect(owningChatKey(chats, { key: "h:b", parentId: null, closed: true }, true)).toBeNull();
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
