import { z } from "zod";
import { actionSchema } from "./actions";
import { TOOL_KINDS } from "./chat-view";

const MAX_ITEMS = 50;

// Paseo rejects contribution ids outside this pattern, so the profile rejects them first.
export const contributionId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Expected lowercase letters, digits and hyphens, starting with a letter")
  .max(64);
const icon = z.string().min(1, "Required: a Lucide icon name such as BookOpen").max(64, "At most 64 characters");
export const label = z.string().min(1, "Required").max(80, "At most 80 characters");
const hexColour = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, "Expected a hex colour such as #1e1e2e");

export function uniqueBy<Item>(key: keyof Item & string, noun: string) {
  return (items: Item[], context: z.RefinementCtx) => {
    const seen = new Set<unknown>();
    items.forEach((item, index) => {
      const value = item[key];
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index, key],
          message: `Duplicate ${noun} "${String(value)}"; ${noun}s must be unique in this list`,
        });
      }
      seen.add(value);
    });
  };
}

function list<Schema extends z.ZodType<{ id: string }>>(item: Schema) {
  return z.array(item).max(MAX_ITEMS).superRefine(uniqueBy<z.infer<Schema>>("id", "id")).default([]);
}

// Morphise registers its own reminder and layout commands under this prefix.
export const RESERVED_COMMAND_PREFIX = "morphise-";

// Ids Morphise uses for its own pills and Command Center items.
const ownId = contributionId.refine((id) => !id.startsWith(RESERVED_COMMAND_PREFIX), {
  message: `Ids starting with "${RESERVED_COMMAND_PREFIX}" are reserved for Morphise's own items`,
});

// Morphise's own slash command.
export const RESERVED_SLASH_COMMAND = "remind";

const rowSchema = z.strictObject({ id: contributionId, label, icon, action: actionSchema });

const menuEntrySchema = z.strictObject({ id: contributionId, title: label, icon: icon.optional(), action: actionSchema });

const buttonBase = { id: ownId, title: label, icon, label: label.optional() };
const buttonSchema = z.union([
  z.strictObject({ ...buttonBase, action: actionSchema }),
  z.strictObject({
    ...buttonBase,
    menu: z.array(menuEntrySchema).min(1).max(MAX_ITEMS).superRefine(uniqueBy("id", "id")),
  }),
]);

const controlSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("action"), id: ownId, title: label, icon, action: actionSchema }),
  z.strictObject({
    kind: z.literal("toggle"),
    id: ownId,
    title: label,
    icon,
    metadataKey: z.string().min(1).max(200),
  }),
  z.strictObject({
    kind: z.literal("select"),
    id: ownId,
    title: label,
    icon,
    target: z.enum(["model", "mode", "thinking"]),
    options: z
      .array(z.strictObject({ label, value: z.string().min(1).max(200) }))
      .min(1)
      .max(MAX_ITEMS),
  }),
]);

const themeSchema = z.strictObject({
  name: label,
  appearance: z.enum(["light", "dark"]),
  colors: z.strictObject({
    background: hexColour,
    foreground: hexColour,
    raised: hexColour,
    control: hexColour,
    border: hexColour,
    accent: hexColour.optional(),
    mutedForeground: hexColour,
    ring: hexColour,
  }),
});

const slashCommandSchema = z.strictObject({
  name: contributionId.refine((name) => name !== RESERVED_SLASH_COMMAND, { message: `"/${RESERVED_SLASH_COMMAND}" is Morphise's own reminder command` }),
  description: label,
  argumentHint: z.string().max(80),
  action: actionSchema,
});

const commandCenterSchema = z.strictObject({
  id: ownId,
  title: label,
  icon,
  keywords: z.array(z.string().min(1).max(40)).max(20).optional(),
  action: actionSchema,
});

const presetSchema = z.strictObject({
  id: contributionId,
  label,
  isolation: z.enum(["local", "worktree"]).optional(),
  metadata: z.record(z.string(), z.json()).optional(),
});

export const TIMELINE_ITEM_TYPES = [
  "user_message",
  "assistant_message",
  "reasoning",
  "tool_call",
  "todo",
  "notification",
  "error",
  "compaction",
] as const;

// Paseo's own workspace statuses, in the priority order its app uses (needs_input is a pending
// permission request; attention is a finished turn the user has not looked at yet).
export const INDICATORS = ["needs_input", "failed", "running", "attention", "done"] as const;
export type Indicator = (typeof INDICATORS)[number];

const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

const statusOrderSchema = z
  .array(z.enum(INDICATORS))
  .refine((order) => order.length === INDICATORS.length && new Set(order).size === INDICATORS.length, {
    message: "Expected each of the five statuses exactly once",
  })
  .default([...INDICATORS]);

const viewSchema = z
  .strictObject({
    enabled: z.boolean().default(false),
    // What the view lists: workspaces, or every chat on its own row.
    list: z.enum(["workspaces", "chats"]).default("workspaces"),
    // "activity" groups by when a workspace was last used: Today, Yesterday, This week, Earlier.
    groupBy: z.enum(["project", "label", "status", "activity", "none"]).default("project"),
    // "created" newest first; "statusChanged" most recent status change first; "changes" most
    // changed lines first.
    orderBy: z.enum(["status", "activity", "name", "created", "statusChanged", "changes"]).default("activity"),
    // Breaks ties left by orderBy.
    thenBy: z.enum(["activity", "name"]).default("activity"),
    statusOrder: statusOrderSchema,
    pinnedFirst: z.boolean().default(true),
    counts: z.boolean().default(true),
    // Off by `enabled`, never by a zero row count.
    rowLimit: z.strictObject({ enabled: z.boolean().default(true), rows: z.int().min(3).max(100).default(5) }).prefault({}),
    density: z.enum(["compact", "comfortable"]).default("compact"),
    details: z
      .strictObject({
        branch: z.boolean().default(false),
        diff: z.boolean().default(false),
        timeInStatus: z.boolean().default(false),
        project: z.boolean().default(false),
      })
      .prefault({}),
    rowActions: z
      .array(z.enum(["pin"]))
      .refine(distinct, { message: "Expected each row action at most once" })
      .default(["pin"]),
    filterBar: z.boolean().default(true),
    showAgents: z.boolean().default(false),
    // Which workspaces list their chats when showAgents is on: only the open one (when unset), or
    // all. No default, so documents nobody changed stay readable by 0.5, which rejects new keys.
    agentsFor: z.enum(["active", "all"]).optional(),
    // The keys below have no default for the same reason: 0.6 rejects keys it does not know.
    // Rows show a muted second line (status, pull request, services) unless "one-line".
    rowStyle: z.enum(["two-line", "one-line"]).optional(),
    // What names a workspace row, as in Paseo's Display menu: its title, or its branch name.
    titleSource: z.enum(["title", "branch"]).optional(),
    // Paseo's Display "Show" choices that `details` does not already hold; unset ones follow
    // Paseo's defaults (see `rowShows`).
    show: z
      .strictObject({
        host: z.boolean().optional(),
        pullRequest: z.boolean().optional(),
        checks: z.boolean().optional(),
        services: z.boolean().optional(),
        labels: z.boolean().optional(),
        lastActivity: z.boolean().optional(),
      })
      .optional(),
    // How many chats a workspace lists before "Show more" (5 when unset).
    chatRows: z.int().min(1).max(50).optional(),
    // Sub-agents listed under their parent chat: all of them (true, or unset), none (false), or only
    // the open one ("open"); and how many before "Show more" (5 when unset).
    showSubAgents: z.union([z.boolean(), z.literal("open")]).optional(),
    // Archive workspaces marked done `days` ago. Off when unset. Never archives work git could
    // lose. Merged pull requests are Paseo's own "Archive merged PR workspaces" setting.
    autoArchive: z.strictObject({ days: z.int().min(1).max(90) }).optional(),
    // The open chat's steps card at the foot of the view (shown when unset).
    stepsCard: z.boolean().optional(),
    // How the steps card shows (see shared/steps.ts stepsOptions for the defaults of unset keys).
    steps: z
      .strictObject({
        show: z.enum(["unfinished", "always"]).optional(),
        doneSeconds: z.int().min(0).max(60).optional(),
        position: z.enum(["bottom", "top", "chat"]).optional(),
        scope: z.enum(["open", "workspace"]).optional(),
        startFolded: z.boolean().optional(),
        hideCompleted: z.boolean().optional(),
        maxSteps: z.int().min(3).max(50).optional(),
        progress: z.boolean().optional(),
      })
      .optional(),
    subAgentRows: z.int().min(1).max(50).optional(),
  })
  .prefault({});

// A reminder can be at most a week away, so none is open-ended.
export const MAX_REMINDER_MINUTES = 7 * 24 * 60;

const remindersSchema = z
  .strictObject({
    // The choices offered by the "Remind me" pill and Command Center items. At least one;
    // zero minutes is not a reminder.
    presets: z
      .array(z.int().min(1).max(MAX_REMINDER_MINUTES))
      .min(1)
      .max(8)
      .refine(distinct, { message: "Expected each preset at most once" })
      .default([15, 30, 60, 180]),
    sound: z.boolean().default(true),
    desktopNotification: z.boolean().default(true),
  })
  .prefault({});

export const profileSchema = z.strictObject({
  theme: themeSchema.nullable().default(null),
  sidebar: z
    .strictObject({
      headerRows: list(rowSchema),
      footerRows: list(rowSchema),
      view: viewSchema,
    })
    .prefault({}),
  header: z.strictObject({ buttons: list(buttonSchema) }).prefault({}),
  composer: z.strictObject({ pills: list(buttonSchema), controls: list(controlSchema) }).prefault({}),
  slashCommands: z
    .array(slashCommandSchema)
    .max(MAX_ITEMS)
    .superRefine(uniqueBy("name", "name"))
    .default([]),
  commandCenter: list(commandCenterSchema),
  newWorkspace: z.strictObject({ presets: list(presetSchema) }).prefault({}),
  timeline: z.strictObject({ hide: z.array(z.enum(TIMELINE_ITEM_TYPES)).max(TIMELINE_ITEM_TYPES.length).default([]) }).prefault({}),
  // How chat rows are drawn (see shared/chat-view.ts). Optional with no default, so a profile
  // nobody changed here stays readable by 0.12, which rejects keys it does not know.
  chat: z
    .strictObject({
      toolCalls: z.enum(["paseo", "cards", "compact"]).optional(),
      hideFinished: z.array(z.enum(TOOL_KINDS)).max(TOOL_KINDS.length).optional(),
      reasoning: z.enum(["show", "fold", "hide"]).optional(),
      fold: z.enum(["finished", "always", "never"]).optional(),
      // Lines of tool output shown before "Show all"; 0 shows everything.
      outputLines: z.int().min(0).max(200).optional(),
      textSize: z.enum(["small", "medium", "large"]).optional(),
      density: z.enum(["compact", "normal", "spacious"]).optional(),
      timestamps: z.boolean().optional(),
      phones: z.enum(["same", "paseo"]).optional(),
    })
    .optional(),
  style: z
    .strictObject({
      enabled: z.boolean().default(false),
      // Each id becomes part of a CSS attribute selector, so only selector-safe characters pass.
      hideTestIds: z
        .array(z.string().regex(/^[A-Za-z0-9_-]+$/, "Expected letters, digits, hyphens or underscores").max(120))
        .max(200)
        .default([]),
      css: z.string().max(64 * 1024).default(""),
    })
    .prefault({}),
  reminders: remindersSchema,
});

export type Profile = z.infer<typeof profileSchema>;

export const EMPTY_PROFILE: Profile = profileSchema.parse({});
