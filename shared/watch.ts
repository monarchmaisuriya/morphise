import { defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";
import { documentSchema } from "./document";
import { taskDocumentSchema } from "./tasks";

export const profileEventSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), revision: z.string(), document: documentSchema }),
  z.object({ status: z.literal("invalid"), revision: z.string(), error: z.string() }),
]);

export type ProfileEvent = z.infer<typeof profileEventSchema>;

// Sends the stored document first, then every saved change, for as long as the client listens.
export const profileWatch = defineSubscription({
  name: "profile.watch",
  input: z.object({}),
  event: profileEventSchema,
});

export const tasksEventSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), revision: z.string(), document: taskDocumentSchema }),
  z.object({ status: z.literal("invalid"), revision: z.string(), error: z.string() }),
]);

export type TasksEvent = z.infer<typeof tasksEventSchema>;

// The task document, streamed like the profile.
export const tasksWatch = defineSubscription({
  name: "tasks.watch",
  input: z.object({}),
  event: tasksEventSchema,
});
