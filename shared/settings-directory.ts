export const SETTINGS_DIRECTORY = [
  { id: "layouts", title: "Layouts", scope: "Host: named profiles shared by connected apps", topics: "profile presets switch layouts" },
  { id: "general", title: "General", scope: "Mixed: profile features, host services and this-device Workbench choices", topics: "workbench activity tasks updates startup" },
  { id: "sidebar", title: "Sidebar", scope: "Mixed: profile layout; row appearance and filters on this device", topics: "sidebar groups sort filter nesting status rows branch lines" },
  { id: "agents", title: "Agents", scope: "Host configuration with this-device list/display choices", topics: "agents board cards fields conversation search" },
  { id: "chat", title: "Chat", scope: "Mixed: profile chat presentation and host stats/tools", topics: "steps notes stats folding tools" },
  { id: "messages", title: "Messages", scope: "Profile: shared with apps using this profile", topics: "selection quotes commands run output pictures tables" },
  { id: "pages", title: "Pages", scope: "Profile choices with host browser installation controls", topics: "html pages diagrams browser render" },
  { id: "look", title: "Look", scope: "Profile: shared appearance; native host settings remain separate", topics: "theme colors sidebar status indicators size alignment rotation fonts" },
  { id: "buttons", title: "Buttons", scope: "Profile: shared controls and actions", topics: "header composer footer buttons" },
  { id: "commands", title: "Commands", scope: "Profile: shared slash commands and workspace presets", topics: "slash command center shortcuts presets" },
  { id: "prompts", title: "Prompts", scope: "Host document: saved prompts shared across layouts", topics: "saved prompts templates" },
  { id: "profile", title: "Advanced", scope: "Host document: complete profiles and prompts; excludes device records", topics: "advanced json validation profile errors" },
  { id: "quick-chat", title: "Quick Chat", scope: "Mixed: host availability; model memory and appearance on this device", topics: "quick chat remember model forget scratch privacy" },
] as const;

export function findSettings(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return SETTINGS_DIRECTORY.filter((value) => terms.every((term) => `${value.title} ${value.topics} ${value.scope}`.toLowerCase().includes(term)));
}
