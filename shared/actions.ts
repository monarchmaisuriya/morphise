import { z } from "zod";

// React Native's URL class is incomplete, so the scheme check is a pattern, not `new URL`.
const HTTP_URL = /^https?:\/\/[^\s]+$/i;

export const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("open-url"),
    url: z.string().max(2048).refine((url) => HTTP_URL.test(url), "Expected an http or https URL"),
  }),
  z.strictObject({ kind: z.literal("insert-text"), text: z.string().min(1).max(10_000) }),
  z.strictObject({ kind: z.literal("set-prompt"), text: z.string().max(10_000) }),
  z.strictObject({ kind: z.literal("set-model"), model: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("set-mode"), mode: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("set-thinking"), thinking: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("open-editor") }),
]);

export type Action = z.infer<typeof actionSchema>;
