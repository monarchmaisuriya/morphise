import { describe, expect, it } from "vitest";
import { EMPTY_TASKS, taskDocumentSchema } from "./tasks";

function issues(input: unknown): string[] {
  const result = taskDocumentSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

const task = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Fix login",
  column: "todo",
  order: 0,
  createdAt: "2026-11-11T10:00:00.000Z",
  updatedAt: "2026-11-11T10:00:00.000Z",
  ...overrides,
});

describe("taskDocumentSchema", () => {
  it("starts with five columns, Done marked, and nothing else", () => {
    expect(EMPTY_TASKS.columns.map((column) => [column.name, column.done])).toEqual([
      ["Backlog", false],
      ["To do", false],
      ["In progress", false],
      ["Review", false],
      ["Done", true],
    ]);
    expect(EMPTY_TASKS.tasks).toEqual([]);
    expect(EMPTY_TASKS.archiveDone).toEqual({ enabled: false, days: 14 });
  });

  it("fills a task's optional fields", () => {
    const parsed = taskDocumentSchema.parse({ tasks: [task()] });
    expect(parsed.tasks[0]).toMatchObject({ description: "", priority: null, labels: [], due: null, reminder: null, checklist: [], links: {}, completedAt: null, archivedAt: null });
  });

  // A later version adds a host to links; this one must read and keep it, not refuse the document.
  it("reads and keeps link keys it does not know, while still checking the ones it does", () => {
    const parsed = taskDocumentSchema.parse({ tasks: [task({ links: { workspaceId: "w1", hostId: "srv_two" } })] });
    expect(parsed.tasks[0].links).toEqual({ workspaceId: "w1", hostId: "srv_two" });
    expect(issues({ tasks: [task({ links: { url: "ftp://example.com" } })] })).toEqual(["tasks.0.links.url: Expected an http or https address"]);
  });

  it("refuses references to columns, labels and views that do not exist", () => {
    expect(issues({ tasks: [task({ column: "nowhere" })] })).toEqual(['tasks.0.column: No column has the id "nowhere"']);
    expect(issues({ tasks: [task({ labels: ["bug"] })] })).toEqual(['tasks.0.labels: No label has the id "bug"']);
    expect(issues({ activeView: "urgent" })).toEqual(['activeView: No view has the id "urgent"']);
  });

  it("refuses rule pairs that nothing runs", () => {
    const pair = (when: object, then: object) => taskDocumentSchema.safeParse({ rules: [{ id: "r", when, then }] }).success;
    expect(pair({ kind: "chat-status", status: "failed" }, { kind: "move", column: "review" })).toBe(true);
    expect(pair({ kind: "enters-done" }, { kind: "clear-reminder" })).toBe(true);
    expect(pair({ kind: "chat-status", status: "failed" }, { kind: "clear-reminder" })).toBe(false);
    expect(pair({ kind: "enters-done" }, { kind: "move", column: "review" })).toBe(false);
  });

  it("needs exactly one Done column", () => {
    const columns = [{ id: "a", name: "A", done: false }];
    expect(issues({ columns })).toEqual(["columns: Exactly one column must be the Done column"]);
  });

  it("refuses a WIP limit of zero, so a limit is never 'off' by being 0", () => {
    const columns = [{ id: "a", name: "A", done: true, wipLimit: 0 }];
    expect(issues({ columns }).length).toBe(1);
  });

  it("refuses an invalid due date", () => {
    expect(issues({ tasks: [task({ due: "2026-13-01" })] })).toEqual(["tasks.0.due: Expected a date such as 2026-11-20"]);
  });
});
