import { defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

// Held open by every app so the daemon has a Paseo connection to write reminder rows with.
export const remindersKeeper = defineSubscription({
  name: "reminders.keeper",
  input: z.object({}),
  event: z.object({}),
});

// The row the daemon writes into a chat when a task's reminder comes due. Rows written by 0.2
// carry only the times.
export const reminderRowSchema = z.object({
  taskId: z.string().optional(),
  title: z.string().optional(),
  at: z.string(),
  setAt: z.string(),
  note: z.string().optional(),
});
