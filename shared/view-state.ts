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
    // Project keys to show; none means every project.
    projectFilter: z.array(z.string().max(300)).max(200).default([]),
    hideDone: z.boolean().default(false),
    changedOnly: z.boolean().default(false),
    pinnedOnly: z.boolean().default(false),
    // Paseo's "Show background": background workspaces are hidden unless this is on.
    showBackground: z.boolean().default(false),
    // The look on this screen (from Project Groups' appearance settings). No text size means the row height's own.
    textSize: z.int().min(11).max(15).nullable().default(null),
    groupSpacing: z.enum(["none", "small", "medium", "large", "xlarge"]).default("medium"),
    indent: z.enum(["narrow", "normal", "wide"]).default("normal"),
    boldGroupNames: z.boolean().default(false),
    showProjectIcons: z.boolean().default(true),
    // Morphise's sidebar view has been on screen on this device. Paseo tells plugins nothing about which sidebar view it
    // shows, and a plugin reload forgets what this session saw, so Settings' "still showing its own sidebar" note reads this.
    viewShown: z.boolean().default(false),
  }),
});

export type ViewState = z.infer<typeof viewStateSettings.schema>;

const GROUP_GAP = { none: 0, small: 6, medium: 14, large: 20, xlarge: 28 } as const;
const ROW_PAD = { narrow: 4, normal: 8, wide: 16 } as const;

// The sidebar view's sizes from this device's look and the layout's row height ("density"); touch screens keep rows
// tall enough for a finger. The defaults give the sidebar as it was before these settings. `childHeight`: the rows that
// hang off a workspace (chats, sub-agents), 8 shorter than its own row so the tree reads tight; 40 on touch screens.
export function sidebarLook(look: ViewState, density: "compact" | "comfortable" | "spacious", touch: boolean) {
  const height = touch ? 44 : density === "compact" ? 36 : density === "comfortable" ? 40 : 44;
  return {
    height,
    childHeight: touch ? 40 : height - 8,
    textSize: look.textSize ?? (density === "compact" ? 13 : 14),
    groupGap: GROUP_GAP[look.groupSpacing],
    rowPad: ROW_PAD[look.indent],
    boldGroups: look.boldGroupNames,
    projectIcons: look.showProjectIcons,
  };
}
