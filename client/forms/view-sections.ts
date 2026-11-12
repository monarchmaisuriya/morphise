import type { Profile } from "../../shared/profile";

type ViewKey = keyof Profile["sidebar"]["view"];

// Which settings section each sidebar view setting sits in; every setting in exactly one.
export const VIEW_SECTIONS = {
  general: ["enabled", "list", "groupBy", "orderBy", "thenBy", "statusOrder", "pinnedFirst", "counts", "rowLimit", "density", "details", "rowActions", "filterBar"],
  rows: ["rowStyle", "titleSource", "show"],
  chats: ["showAgents", "agentsFor", "singleChat", "chatRows", "showSubAgents", "subAgentRows"],
  steps: ["stepsCard", "steps"],
  archive: ["autoArchive"],
} as const satisfies Record<string, readonly ViewKey[]>;
