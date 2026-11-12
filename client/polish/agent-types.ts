import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";

// Paseo's timeline item types, taken from the plugin SDK's transformer contract. Ported Chat
// Polish code imported them from @getpaseo/protocol, which an installed plugin cannot resolve.
export type AgentTimelineItem = Parameters<PluginTimelineTransformerContribution["transform"]>[0]["item"];
export type ToolCallItem = Extract<AgentTimelineItem, { type: "tool_call" }>;
export type ToolCallDetail = ToolCallItem["detail"];
