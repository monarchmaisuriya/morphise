import { describe, expect, it, vi } from "vitest";
import { createReconciler, type Problem, type Section } from "./reconciler";

function section(name: string, log: string[], fail?: (input: string) => boolean): Section<string> {
  return {
    name,
    key: (input) => `${name}:${input}`,
    register(input, track) {
      log.push(`+${name}:${input}`);
      track(() => log.push(`-${name}:${input}`));
      if (fail?.(input)) throw new Error(`bad ${input}`);
    },
  };
}

describe("createReconciler", () => {
  it("registers every section on the first apply", () => {
    const log: string[] = [];
    createReconciler([section("a", log), section("b", log)], () => {}).apply("1");
    expect(log).toEqual(["+a:1", "+b:1"]);
  });

  it("leaves a section alone while its key is unchanged", () => {
    const log: string[] = [];
    const reconciler = createReconciler([section("a", log)], () => {});
    reconciler.apply("1");
    reconciler.apply("1");
    expect(log).toEqual(["+a:1"]);
  });

  it("removes the old registrations before adding new ones when the key changes", () => {
    const log: string[] = [];
    const reconciler = createReconciler([section("a", log)], () => {});
    reconciler.apply("1");
    reconciler.apply("2");
    expect(log).toEqual(["+a:1", "-a:1", "+a:2"]);
  });

  it("reports a failing section, undoes its partial work, and still applies the others", () => {
    const log: string[] = [];
    const problems: Problem[][] = [];
    const reconciler = createReconciler([section("a", log, (input) => input === "bad"), section("b", log)], (list) =>
      problems.push(list),
    );
    reconciler.apply("bad");
    expect(log).toEqual(["+a:bad", "-a:bad", "+b:bad"]);
    expect(problems.at(-1)).toEqual([{ section: "a", message: "bad bad" }]);
  });

  it("clears a section's problem once it registers cleanly", () => {
    const log: string[] = [];
    const onProblems = vi.fn();
    const reconciler = createReconciler([section("a", log, (input) => input === "bad")], onProblems);
    reconciler.apply("bad");
    reconciler.apply("good");
    expect(onProblems).toHaveBeenLastCalledWith([]);
  });

  it("does not retry a failed section until its key changes", () => {
    const log: string[] = [];
    const reconciler = createReconciler([section("a", log, (input) => input.startsWith("bad"))], () => {});
    reconciler.apply("bad");
    reconciler.apply("bad");
    reconciler.apply("bad-2");
    expect(log).toEqual(["+a:bad", "-a:bad", "+a:bad-2", "-a:bad-2"]);
  });

  it("reports a cleanup that throws as that section's problem and still applies the others", () => {
    const log: string[] = [];
    const problems: Problem[][] = [];
    const broken: Section<string> = {
      name: "broken",
      key: (input) => input,
      register: (_input, track) =>
        track(() => {
          throw new Error("remover failed");
        }),
    };
    const reconciler = createReconciler([broken, section("b", log)], (list) => problems.push(list));
    reconciler.apply("1");
    reconciler.apply("2");
    expect(log).toEqual(["+b:1", "-b:1", "+b:2"]);
    expect(problems.at(-1)).toEqual([{ section: "broken", message: "remover failed" }]);
  });

  it("registers nothing once disposed", () => {
    const log: string[] = [];
    const reconciler = createReconciler([section("a", log)], () => {});
    reconciler.dispose();
    reconciler.apply("1");
    expect(log).toEqual([]);
  });

  it("removes everything on dispose", () => {
    const log: string[] = [];
    const reconciler = createReconciler([section("a", log), section("b", log)], () => {});
    reconciler.apply("1");
    reconciler.dispose();
    expect(log).toEqual(["+a:1", "+b:1", "-a:1", "-b:1"]);
  });
});
