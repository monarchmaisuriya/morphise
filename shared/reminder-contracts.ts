import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

// Held open by every app so the daemon has a Paseo connection to write reminder rows with.
export const remindersKeeper = defineSubscription({
  name: "reminders.keeper",
  input: z.object({}),
  event: z.object({}),
});

// Sent by an app right after it sets or clears a chat's reminder, so the daemon re-arms.
export const remindersArm = defineRpc({
  name: "reminders.arm",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({}),
});

// The chat row the daemon writes when a reminder comes due.
export const reminderRowSchema = z.object({ at: z.string(), setAt: z.string() });
