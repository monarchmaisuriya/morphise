import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { contributionId, label, type Profile, profileSchema, RESERVED_COMMAND_PREFIX, RESERVED_SLASH_COMMAND, uniqueBy } from "./profile";

const MAX_LAYOUTS = 10;
const MAX_PROMPTS = 200;

const layoutSchema = z.strictObject({ id: contributionId, name: label, profile: profileSchema.prefault({}) });

const promptSchema = z.strictObject({
  id: contributionId,
  title: label,
  text: z.string().min(1, "Write the prompt text").max(10_000, "At most 10,000 characters"),
  starred: z.boolean().default(false),
});

// The one stored settings document: every named layout, which one applies, and the prompts that
// all layouts share.
export const documentSchema = z
  .strictObject({
    activeLayout: contributionId.default("default"),
    layouts: z
      .array(layoutSchema)
      .min(1)
      .max(MAX_LAYOUTS)
      .superRefine(uniqueBy("id", "id"))
      .prefault([{ id: "default", name: "Default" }]),
    prompts: z.array(promptSchema).max(MAX_PROMPTS).superRefine(uniqueBy("id", "id")).default([]),
  })
  .superRefine((document, context) => {
    if (!document.layouts.some((layout) => layout.id === document.activeLayout)) {
      context.addIssue({ code: "custom", path: ["activeLayout"], message: `No layout has the id "${document.activeLayout}"` });
    }
  });

export type ProfileDocument = z.infer<typeof documentSchema>;
export type Layout = ProfileDocument["layouts"][number];
export type Prompt = ProfileDocument["prompts"][number];

export const EMPTY_DOCUMENT: ProfileDocument = documentSchema.parse({});

// The schema guarantees the active layout exists, so a miss here is a programming error.
export function activeProfile(document: ProfileDocument): Profile {
  const layout = document.layouts.find((item) => item.id === document.activeLayout);
  if (!layout) throw new Error(`Morphise document has no layout "${document.activeLayout}"`);
  return layout.profile;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// Version 1 showed the branch on every row of a comfortable view; version 2 has a switch for it.
function keepBranchDetail(profile: unknown): unknown {
  const sidebar = record(record(profile)?.sidebar);
  const view = record(sidebar?.view);
  if (view?.density !== "comfortable") return profile;
  return { ...record(profile), sidebar: { ...sidebar, view: { ...view, details: { branch: true } } } };
}

// Version 2 reserves names that version 1 allowed. Items using them are renamed, not dropped,
// so the upgrade keeps them.
function freeReservedNames(profile: unknown): unknown {
  const root = record(profile);
  if (!root) return profile;
  const renameIds = (items: unknown) =>
    Array.isArray(items)
      ? items.map((item) => {
          const entry = record(item);
          return typeof entry?.id === "string" && entry.id.startsWith(RESERVED_COMMAND_PREFIX) ? { ...entry, id: `custom-${entry.id}` } : item;
        })
      : items;
  const next: Record<string, unknown> = { ...root };
  if (Array.isArray(root.commandCenter)) next.commandCenter = renameIds(root.commandCenter);
  const header = record(root.header);
  if (header) next.header = { ...header, buttons: renameIds(header.buttons) };
  const composer = record(root.composer);
  if (composer) next.composer = { ...composer, pills: renameIds(composer.pills), controls: renameIds(composer.controls) };
  if (Array.isArray(root.slashCommands)) {
    const names = root.slashCommands.map((command) => record(command)?.name);
    next.slashCommands = root.slashCommands.map((command) => {
      const entry = record(command);
      if (entry?.name !== RESERVED_SLASH_COMMAND) return command;
      let name = `${RESERVED_SLASH_COMMAND}-custom`;
      for (let index = 2; names.includes(name); index++) name = `${RESERVED_SLASH_COMMAND}-custom-${index}`;
      names.push(name);
      return { ...entry, name };
    });
  }
  return next;
}

// Version 1 stored the profile itself. It becomes the only layout, unchanged; the version 2
// schema then fills the new fields with their defaults.
export function migrateDocument(values: unknown, fromVersion: number): unknown {
  if (fromVersion !== 1) throw new Error(`Morphise cannot upgrade a profile saved as settings version ${fromVersion}`);
  return { activeLayout: "default", layouts: [{ id: "default", name: "Default", profile: freeReservedNames(keepBranchDetail(values)) }], prompts: [] };
}

export const profileSettings = defineSettings({
  id: "profile",
  scope: "host",
  version: 2,
  schema: documentSchema,
  migrate: migrateDocument,
});
