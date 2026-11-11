import type { TaskDocument } from "./tasks";
import { parseDueDate, parseWhen } from "./when";

// Todoist-style quick add: "Fix login p1 @bug #review due:fri tomorrow 9am".
// p1-p4 priority, @label (created if new), #column, due:date, and a reminder time at the end.

export interface QuickAdd {
  title: string;
  priority: number | null;
  labelNames: string[];
  column: string | null;
  due: string | null;
  reminderAt: Date | null;
  // Parts that were not understood, in plain words; nothing is guessed.
  problems: string[];
}

// Words that can be part of a time; a phrase must also contain one that is not a bare number.
const TIME_WORD = /^(?:in|today|tomorrow|mon(?:day)?|tues?(?:day)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{1,2}(?::\d{2})?(?:am|pm)?|\d+h(?:\d+m)?|\d+m(?:in)?)$/i;

function trailingReminder(words: string[], now: Date): { at: Date; used: number } | null {
  for (let size = Math.min(3, words.length); size >= 1; size--) {
    const tail = words.slice(words.length - size);
    if (!tail.every((word) => TIME_WORD.test(word)) || tail.every((word) => /^\d+$/.test(word))) continue;
    const parsed = parseWhen(tail.join(" "), now);
    if (parsed.ok) return { at: parsed.at, used: size };
  }
  return null;
}

const sameName = (left: string, right: string) => left.toLowerCase().replace(/[-_]/g, " ") === right.toLowerCase().replace(/[-_]/g, " ");

export function parseQuickAdd(text: string, document: TaskDocument, now: Date): QuickAdd {
  let words = text.trim().split(/\s+/).filter(Boolean);
  const result: QuickAdd = { title: "", priority: null, labelNames: [], column: null, due: null, reminderAt: null, problems: [] };
  const reminder = trailingReminder(words, now);
  if (reminder) {
    result.reminderAt = reminder.at;
    words = words.slice(0, words.length - reminder.used);
  }
  const title: string[] = [];
  for (const word of words) {
    const priority = /^p([1-4])$/i.exec(word);
    if (priority) {
      result.priority = Number(priority[1]);
    } else if (word.startsWith("@") && word.length > 1) {
      result.labelNames.push(word.slice(1));
    } else if (word.startsWith("#") && word.length > 1) {
      const wanted = word.slice(1);
      const column = document.columns.find((item) => item.id === wanted || sameName(item.name, wanted));
      if (column) result.column = column.id;
      else result.problems.push(`No column named "${wanted}"`);
    } else if (/^due:/i.test(word)) {
      const value = word.slice(4);
      const due = parseDueDate(value, now);
      if (due) result.due = due;
      else result.problems.push(`Could not read the due date "${value}"`);
    } else {
      title.push(word);
    }
  }
  result.title = title.join(" ");
  if (!result.title) result.problems.push("A task needs a title");
  return result;
}
