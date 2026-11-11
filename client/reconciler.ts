export interface Section<Input> {
  name: string;
  // Registrations are replaced only when this string changes.
  key(input: Input): string;
  // Registers with Paseo; every remover goes through `track` so the section can be undone.
  register(input: Input, track: (cleanup: () => unknown) => void): void;
}

export interface Problem {
  section: string;
  message: string;
}

interface Applied {
  key: string;
  cleanups: (() => unknown)[];
}

// Paseo removers may return a promise; a rejected removal is logged, never dropped silently.
function runAll(cleanups: readonly (() => unknown)[]) {
  let failure: unknown = null;
  for (const cleanup of cleanups) {
    try {
      const result = cleanup();
      if (result instanceof Promise) {
        result.catch((error: unknown) => console.error("[morphise] A registration could not be removed", error));
      }
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure;
}

// Turns each profile section into Paseo registrations. A section that throws (for example an icon
// name Paseo rejects) is undone completely and reported, and is not tried again until its part of
// the profile changes; the other sections still apply. Nothing registers after dispose.
export function createReconciler<Input>(sections: readonly Section<Input>[], onProblems: (problems: Problem[]) => void) {
  const applied = new Map<string, Applied>();
  const problems = new Map<string, string>();
  let disposed = false;

  return {
    apply(input: Input) {
      if (disposed) return;
      for (const section of sections) {
        const key = section.key(input);
        const previous = applied.get(section.name);
        if (previous?.key === key) continue;
        const current: Applied = { key, cleanups: [] };
        applied.set(section.name, current);
        const added: (() => unknown)[] = [];
        try {
          if (previous) runAll(previous.cleanups);
          section.register(input, (cleanup) => added.push(cleanup));
          current.cleanups = added;
          problems.delete(section.name);
        } catch (error) {
          try {
            runAll(added);
          } catch (cleanupError) {
            console.error(`[morphise] Could not undo the ${section.name} section`, cleanupError);
          }
          problems.set(section.name, error instanceof Error ? error.message : String(error));
          console.error(`[morphise] Could not apply the ${section.name} section`, error);
        }
      }
      onProblems([...problems].map(([section, message]) => ({ section, message })));
    },
    dispose() {
      disposed = true;
      for (const section of sections) {
        try {
          runAll(applied.get(section.name)?.cleanups ?? []);
        } catch (error) {
          console.error(`[morphise] Could not remove the ${section.name} section`, error);
        }
      }
      applied.clear();
    },
  };
}
