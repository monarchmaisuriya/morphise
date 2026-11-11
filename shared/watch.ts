import { defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";
import { profileSchema } from "./profile";

export const profileEventSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), revision: z.string(), profile: profileSchema }),
  z.object({ status: z.literal("invalid"), revision: z.string(), error: z.string() }),
]);

export type ProfileEvent = z.infer<typeof profileEventSchema>;

// Sends the stored profile first, then every saved change, for as long as the client listens.
export const profileWatch = defineSubscription({
  name: "profile.watch",
  input: z.object({}),
  event: profileEventSchema,
});
