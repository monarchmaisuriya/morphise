import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { INDICATORS } from "./profile";
import { reminderSchema } from "./reminders";

// Every task, column, label, saved view and rule in one host settings document, shared live by
// all apps. Apps change it only through the operations in task-ops.ts.

const MAX_TASKS = 2000;

const id = z.string().regex(/^[A-Za-z0-9_-]+$/, "Expected letters, digits, hyphens or underscores").min(1).max(64);
const name = z.string().trim().min(1, "Required").max(60, "At most 60 characters");
const color = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "Expected a hex colour such as #8f8cf2");
const isoTime = z.iso.datetime();

function realDate(text: string): boolean {
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

const dueDate = z.string().refine((text) => /^\d{4}-\d{2}-\d{2}$/.test(text) && realDate(text), { message: "Expected a date such as 2026-11-20" });

const columnSchema = z.strictObject({
  id,
  name,
  color: color.optional(),
  // Null means no limit; a limit is never switched off by 0.
  wipLimit: z.int().min(1).max(99).nullable().default(null),
  done: z.boolean().default(false),
});

const labelSchema = z.strictObject({ id, name, color: color.default("#8b8ca3") });

export const PRIORITIES = [1, 2, 3, 4] as const;

const filterSchema = z
  .strictObject({
    text: z.string().max(200).default(""),
    labels: z.array(id).max(50).default([]),
    priorities: z.array(z.int().min(1).max(4)).max(4).default([]),
    due: z.enum(["any", "overdue", "today", "week", "none"]).default("any"),
    hasReminder: z.boolean().nullable().default(null),
    workspaceId: z.string().nullable().default(null),
  })
  .prefault({});

export const viewSchema = z.strictObject({
  id,
  name,
  filter: filterSchema,
  sort: z.enum(["manual", "priority", "due", "updated"]).default("manual"),
  swimlanes: z.enum(["none", "priority", "label", "workspace"]).default("none"),
  density: z.enum(["detailed", "compact"]).default("detailed"),
});

// Only the pairs Morphise runs: a chat status moves a card; entering Done clears its reminder.
const ruleSchema = z.union([
  z.strictObject({
    id,
    enabled: z.boolean().default(true),
    when: z.strictObject({ kind: z.literal("chat-status"), status: z.enum(["needs_input", "failed", "attention"]) }),
    then: z.strictObject({ kind: z.literal("move"), column: id }),
  }),
  z.strictObject({
    id,
    enabled: z.boolean().default(true),
    when: z.strictObject({ kind: z.literal("enters-done") }),
    then: z.strictObject({ kind: z.literal("clear-reminder") }),
  }),
]);

const checklistItemSchema = z.strictObject({ id, text: z.string().trim().min(1, "Required").max(200), done: z.boolean().default(false) });

const taskSchema = z.strictObject({
  id,
  title: z.string().trim().min(1, "A task needs a title").max(200, "At most 200 characters"),
  description: z.string().max(10_000).default(""),
  column: id,
  order: z.number(),
  priority: z.int().min(1).max(4).nullable().default(null),
  labels: z.array(id).max(20).default([]),
  due: dueDate.nullable().default(null),
  reminder: reminderSchema.nullable().default(null),
  checklist: z.array(checklistItemSchema).max(100).default([]),
  // Open to keys a later version adds (such as the linked workspace's host): this one keeps them as
  // they are instead of refusing the whole document. Versions up to 0.21 reject unknown link keys,
  // so this one writes none.
  links: z
    .object({
      agentId: z.string().min(1).optional(),
      workspaceId: z.string().min(1).optional(),
      url: z.string().max(2048).regex(/^https?:\/\/\S+$/i, "Expected an http or https address").optional(),
    })
    .catchall(z.json())
    .default({}),
  createdAt: isoTime,
  updatedAt: isoTime,
  completedAt: isoTime.nullable().default(null),
  archivedAt: isoTime.nullable().default(null),
});

const DEFAULT_COLUMNS = [
  { id: "backlog", name: "Backlog" },
  { id: "todo", name: "To do" },
  { id: "doing", name: "In progress" },
  { id: "review", name: "Review" },
  { id: "done", name: "Done", done: true },
];

function unique(items: readonly { id: string }[], path: string, context: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) context.addIssue({ code: "custom", path: [path, index, "id"], message: `Duplicate id "${item.id}"` });
    seen.add(item.id);
  });
}

export const taskDocumentSchema = z
  .strictObject({
    columns: z.array(columnSchema).min(1).max(12).prefault(DEFAULT_COLUMNS),
    labels: z.array(labelSchema).max(50).default([]),
    views: z.array(viewSchema).max(20).default([]),
    activeView: id.nullable().default(null),
    rules: z.array(ruleSchema).max(30).default([]),
    archiveDone: z.strictObject({ enabled: z.boolean().default(false), days: z.int().min(1).max(365).default(14) }).prefault({}),
    tasks: z.array(taskSchema).max(MAX_TASKS, `At most ${MAX_TASKS} tasks, archived ones included; delete some you no longer need`).default([]),
  })
  .superRefine((document, context) => {
    unique(document.columns, "columns", context);
    unique(document.labels, "labels", context);
    unique(document.views, "views", context);
    unique(document.rules, "rules", context);
    unique(document.tasks, "tasks", context);
    if (document.columns.filter((column) => column.done).length !== 1) {
      context.addIssue({ code: "custom", path: ["columns"], message: "Exactly one column must be the Done column" });
    }
    const columns = new Set(document.columns.map((column) => column.id));
    const labels = new Set(document.labels.map((label) => label.id));
    document.tasks.forEach((task, index) => {
      if (!columns.has(task.column)) context.addIssue({ code: "custom", path: ["tasks", index, "column"], message: `No column has the id "${task.column}"` });
      const missing = task.labels.find((label) => !labels.has(label));
      if (missing) context.addIssue({ code: "custom", path: ["tasks", index, "labels"], message: `No label has the id "${missing}"` });
    });
    document.rules.forEach((rule, index) => {
      if (rule.then.kind === "move" && !columns.has(rule.then.column)) {
        context.addIssue({ code: "custom", path: ["rules", index, "then", "column"], message: `No column has the id "${rule.then.column}"` });
      }
    });
    if (document.activeView !== null && !document.views.some((view) => view.id === document.activeView)) {
      context.addIssue({ code: "custom", path: ["activeView"], message: `No view has the id "${document.activeView}"` });
    }
  });

export type TaskDocument = z.infer<typeof taskDocumentSchema>;
export type Task = TaskDocument["tasks"][number];
export type Column = TaskDocument["columns"][number];
export type Label = TaskDocument["labels"][number];
export type TaskView = TaskDocument["views"][number];
export type TaskFilter = TaskView["filter"];
export type Rule = TaskDocument["rules"][number];
export type ChecklistItem = Task["checklist"][number];

export const EMPTY_TASKS: TaskDocument = taskDocumentSchema.parse({});
export const DEFAULT_FILTER: TaskFilter = viewSchema.shape.filter.parse({});

export const taskSettings = defineSettings({
  id: "tasks",
  scope: "host",
  version: 1,
  schema: taskDocumentSchema,
});

// The statuses a chat can be in that rules can react to.
export const RULE_STATUSES = INDICATORS.filter((indicator) => indicator === "needs_input" || indicator === "failed" || indicator === "attention");
