import { defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";
import { documentSchema } from "./document";
import { bookmarkDocumentSchema } from "./bookmarks";
import { taskDocumentSchema } from "./tasks";
import { statsSettings } from "./stats";

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

export const bookmarksEventSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), revision: z.string(), document: bookmarkDocumentSchema }),
  z.object({ status: z.literal("invalid"), revision: z.string(), error: z.string() }),
]);

export type BookmarksEvent = z.infer<typeof bookmarksEventSchema>;

// The bookmark document, streamed like the profile.
export const bookmarksWatch = defineSubscription({
  name: "bookmarks.watch",
  input: z.object({}),
  event: bookmarksEventSchema,
});

export const statsEventSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), revision: z.string(), document: statsSettings.schema }),
  z.object({ status: z.literal("invalid"), revision: z.string(), error: z.string() }),
]);

export type StatsEvent = z.infer<typeof statsEventSchema>;

// The session stats settings (on or off, the desktop strip), streamed like the profile so every app follows a change.
export const statsWatch = defineSubscription({
  name: "stats.watch",
  input: z.object({}),
  event: statsEventSchema,
});
