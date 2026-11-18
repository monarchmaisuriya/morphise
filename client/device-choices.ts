import { defineSettings } from "@getpaseo/plugin";
import type { SettingsState } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { z, type ZodType } from "zod";
import { VIEW_LAYOUTS } from "../shared/agents-board";

// On this device: the Workbench rail folded to icons, which view was open last (boardTab, named for the tabs
// they once were; older versions read "bookmarks" as Agents), and the Agents and Tasks views as a list or
// lanes. Kept under the Workbench's settings id, so earlier choices carry over.
const workbenchSchema = z.object({
  railFolded: z.boolean().default(false),
  boardTab: z.enum(["tasks", "agents", "bookmarks", "activity"]).catch("agents").default("agents"),
  agentsLayout: z.enum(VIEW_LAYOUTS).catch("list").default("list"),
  // Tasks keep the board until the user picks the list.
  tasksLayout: z.enum(VIEW_LAYOUTS).catch("board").default("board"),
  // How the Workbench lists its views: tabs along the top (as Paseo's chat tabs) or a list at the side. Phones and
  // narrow windows always use tabs.
  workbenchNav: z.enum(["tabs", "rail"]).catch("tabs").default("tabs"),
  // What the Workbench opens on: the view open last, or what needs the user (Agents while an agent waits, Tasks when
  // something is due, else the view open last).
  openOn: z.enum(["last", "needs"]).catch("last").default("last"),
  // When the Workbench opens on Tasks because something is due: its open cards (no filter on), or Today's list.
  dueOpensOn: z.enum(["board", "today"]).catch("board").default("board"),
});
type WorkbenchValues = z.output<typeof workbenchSchema>;
const WORKBENCH_DEFAULTS: WorkbenchValues = workbenchSchema.parse({});
export const workbenchSettings = defineSettings({ id: "workbench", scope: "device", version: 1, schema: workbenchSchema });

// One of those choices: what the user picked here applies at once and waits to be saved, so a press before
// the settings load is not lost. A save is tried once per stored revision: one refused for an old revision is
// tried again on the new one, one refused otherwise is not retried in a loop. Once stored, the pick is released,
// so a later change from another screen shows here instead of being overwritten.
// The third value is true while the stored choices load, so a view can wait instead of drawing the default first.
// The fourth is why the last pick was not saved, until it saves or another pick is made.
export function useDeviceChoice<Key extends keyof WorkbenchValues>(stored: SettingsState<typeof workbenchSchema>, key: Key): [WorkbenchValues[Key], (value: WorkbenchValues[Key]) => void, boolean, string | null] {
  return useDeviceValue(stored, key, WORKBENCH_DEFAULTS[key]);
}

// The same for any device settings: `fallback` shows until the stored values load (the Sidebar's look, kept on this device).
// The pick is held as `{ value }`, so a setting whose value can be null (Text size's Auto) can be chosen too.
export function useDeviceValue<Schema extends ZodType, Key extends keyof z.output<Schema>>(stored: SettingsState<Schema>, key: Key, fallback: z.output<Schema>[Key]): [z.output<Schema>[Key], (value: z.output<Schema>[Key]) => void, boolean, string | null] {
  const [chosen, choose] = useState<{ value: z.output<Schema>[Key] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const tried = useRef<unknown>(undefined);
  useEffect(() => {
    if (chosen === null || stored.status !== "ready" || stored.saving) return;
    if (stored.values[key] === chosen.value) {
      setFailed(null);
      return choose(null);
    }
    if (tried.current === stored.revision) return;
    tried.current = stored.revision;
    void stored.save({ ...(stored.values as Record<string, unknown>), [key]: chosen.value } as z.output<Schema>, stored.revision).then((ok) => setFailed(ok ? null : (stored.saveError ?? "Not saved: another app saved these settings at the same moment.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, stored.status, stored.saving, stored.status === "ready" ? stored.revision : null]);
  return [
    chosen ? chosen.value : stored.status === "ready" ? stored.values[key] : fallback,
    (value) => {
      setFailed(null);
      choose({ value });
    },
    stored.status === "loading",
    failed,
  ];
}
