import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { INDICATORS } from "./profile";

// How the sidebar view looks on this device only: which groups are folded, which statuses the
// filter chips keep. Device settings live in the app, not on the daemon.
export const viewStateSettings = defineSettings({
  id: "view-state",
  scope: "device",
  version: 1,
  schema: z.object({
    collapsed: z.array(z.string().max(300)).max(500).default([]),
    statusFilter: z.array(z.enum(INDICATORS)).max(INDICATORS.length).default([]),
  }),
});

export type ViewState = z.infer<typeof viewStateSettings.schema>;
