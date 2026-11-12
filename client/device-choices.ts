import { defineSettings } from "@getpaseo/plugin";
import type { SettingsState } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { VIEW_LAYOUTS } from "../shared/agents-board";

// On this device: the Workbench rail folded to icons, which of Agents and Tasks was opened last (boardTab, named for the tabs
// they once were), and the Agents and Tasks views as a list or
// lanes. Kept under the Workbench's settings id, so earlier choices carry over.
const workbenchSchema = z.object({
  railFolded: z.boolean().default(false),
  boardTab: z.enum(["tasks", "agents"]).catch("agents").default("agents"),
  agentsLayout: z.enum(VIEW_LAYOUTS).catch("list").default("list"),
  // Tasks keep the board until the user picks the list.
  tasksLayout: z.enum(VIEW_LAYOUTS).catch("board").default("board"),
  // How the Workbench lists its views: tabs along the top (as Paseo's chat tabs) or a list at the side. Phones and
  // narrow windows always use tabs.
  workbenchNav: z.enum(["tabs", "rail"]).catch("tabs").default("tabs"),
});
type WorkbenchValues = z.output<typeof workbenchSchema>;
const WORKBENCH_DEFAULTS: WorkbenchValues = workbenchSchema.parse({});
export const workbenchSettings = defineSettings({ id: "workbench", scope: "device", version: 1, schema: workbenchSchema });

// One of those choices: what the user picked here applies at once and waits to be saved, so a press before
// the settings load is not lost. A save is tried once per stored revision: one refused for an old revision is
// tried again on the new one, one refused otherwise is not retried in a loop. Once stored, the pick is released,
// so a later change from another screen shows here instead of being overwritten.
// The third value is true while the stored choices load, so a view can wait instead of drawing the default first.
export function useDeviceChoice<Key extends keyof WorkbenchValues>(stored: SettingsState<typeof workbenchSchema>, key: Key): [WorkbenchValues[Key], (value: WorkbenchValues[Key]) => void, boolean] {
  const [chosen, choose] = useState<WorkbenchValues[Key] | null>(null);
  const tried = useRef<unknown>(undefined);
  useEffect(() => {
    if (chosen === null || stored.status !== "ready" || stored.saving) return;
    if (stored.values[key] === chosen) return choose(null);
    if (tried.current === stored.revision) return;
    tried.current = stored.revision;
    void stored.save({ ...stored.values, [key]: chosen }, stored.revision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, stored.status, stored.saving, stored.status === "ready" ? stored.revision : null]);
  return [chosen ?? (stored.status === "ready" ? stored.values[key] : WORKBENCH_DEFAULTS[key]), choose, stored.status === "loading"];
}
