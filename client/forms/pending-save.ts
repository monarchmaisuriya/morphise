// A save that waits for a pause in typing. Scheduling replaces the waiting save; flushing runs it
// at once (on leaving the screen), so the last edit is not dropped.
export function createPendingSave(delayMs: number) {
  let waiting: { timer: ReturnType<typeof setTimeout>; run(): void } | null = null;
  const cancel = () => {
    if (waiting) clearTimeout(waiting.timer);
    waiting = null;
  };
  return {
    schedule(run: () => void) {
      cancel();
      waiting = {
        timer: setTimeout(() => {
          waiting = null;
          run();
        }, delayMs),
        run,
      };
    },
    cancel,
    flush() {
      const entry = waiting;
      cancel();
      entry?.run();
    },
  };
}
