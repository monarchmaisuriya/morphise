import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { actionSchema } from "./actions";

const MAX_ITEMS = 50;

// Paseo rejects contribution ids outside this pattern, so the profile rejects them first.
const contributionId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Expected lowercase letters, digits and hyphens, starting with a letter")
  .max(64);
const icon = z.string().min(1).max(64);
const label = z.string().min(1).max(80);
const hexColour = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, "Expected a hex colour such as #1e1e2e");

function uniqueBy<Item>(key: keyof Item & string, noun: string) {
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

const rowSchema = z.strictObject({ id: contributionId, label, icon, action: actionSchema });

const menuEntrySchema = z.strictObject({ id: contributionId, title: label, icon: icon.optional(), action: actionSchema });

const buttonBase = { id: contributionId, title: label, icon, label: label.optional() };
const buttonSchema = z.union([
  z.strictObject({ ...buttonBase, action: actionSchema }),
  z.strictObject({
    ...buttonBase,
    menu: z.array(menuEntrySchema).min(1).max(MAX_ITEMS).superRefine(uniqueBy("id", "id")),
  }),
]);

const controlSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("action"), id: contributionId, title: label, icon, action: actionSchema }),
  z.strictObject({
    kind: z.literal("toggle"),
    id: contributionId,
    title: label,
    icon,
    metadataKey: z.string().min(1).max(200),
  }),
  z.strictObject({
    kind: z.literal("select"),
    id: contributionId,
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
  name: contributionId,
  description: label,
  argumentHint: z.string().max(80),
  action: actionSchema,
});

const commandCenterSchema = z.strictObject({
  id: contributionId,
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

export const profileSchema = z.strictObject({
  theme: themeSchema.nullable().default(null),
  sidebar: z
    .strictObject({
      headerRows: list(rowSchema),
      footerRows: list(rowSchema),
      view: z
        .strictObject({
          enabled: z.boolean().default(false),
          groupBy: z.enum(["project", "label", "status", "none"]).default("project"),
          orderBy: z.enum(["activity", "name"]).default("activity"),
          density: z.enum(["compact", "comfortable"]).default("compact"),
          showAgents: z.boolean().default(false),
        })
        .prefault({}),
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
});

export type Profile = z.infer<typeof profileSchema>;

export const EMPTY_PROFILE: Profile = profileSchema.parse({});

export const profileSettings = defineSettings({
  id: "profile",
  scope: "host",
  version: 1,
  schema: profileSchema,
});
