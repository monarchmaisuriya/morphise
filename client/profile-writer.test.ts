import { describe, expect, it } from "vitest";
import { changeSavedProfile, type ProfileCalls } from "./profile-writer";

type Values = { activeLayout: string; count: number };

// A fake host: a stored document with a revision, and a hook to simulate another app saving.
function fakeHost(initial: Values = { activeLayout: "a", count: 0 }) {
  let stored = { revision: "r1", values: initial };
  let beforeWrite: (() => void) | null = null;
  let writes = 0;
  const calls: ProfileCalls<Values> = {
    read: async () => ({ status: "ready", ...stored }),
    write: async ({ revision, values }) => {
      writes++;
      beforeWrite?.();
      if (revision !== stored.revision) return { status: "conflict", error: "Revision conflict" };
      stored = { revision: `${stored.revision}+`, values };
      return { status: "saved" };
    },
  };
  return {
    calls,
    stored: () => stored.values,
    writes: () => writes,
    otherAppSaves(change: (values: Values) => Values, times = 1) {
      let left = times;
      beforeWrite = () => {
        if (left-- <= 0) return;
        stored = { revision: `${stored.revision}*`, values: change(stored.values) };
      };
    },
  };
}

const addOne = (values: Values) => ({ ...values, count: values.count + 1 });

describe("changeSavedProfile", () => {
  it("applies the change to the saved profile and writes it", async () => {
    const host = fakeHost();
    await changeSavedProfile(host.calls, addOne, 3);
    expect(host.stored()).toEqual({ activeLayout: "a", count: 1 });
  });

  it("applies the change again on the newer profile when another app saved first, so both survive", async () => {
    const host = fakeHost();
    host.otherAppSaves((values) => ({ ...values, activeLayout: "theirs" }));
    await changeSavedProfile(host.calls, addOne, 3);
    expect(host.stored()).toEqual({ activeLayout: "theirs", count: 1 });
    expect(host.writes()).toBe(2);
  });

  it("gives up with a clear message after as many conflicts as it has attempts", async () => {
    const host = fakeHost();
    host.otherAppSaves((values) => values, 10);
    await expect(changeSavedProfile(host.calls, addOne, 3)).rejects.toThrow("Another app saved the profile at the same moment; try again");
    expect(host.writes()).toBe(3);
  });

  it("tries once when given one attempt, as switching layout does", async () => {
    const host = fakeHost();
    host.otherAppSaves((values) => values);
    await expect(changeSavedProfile(host.calls, (values) => ({ ...values, activeLayout: "b" }), 1)).rejects.toThrow("Another app saved the profile at the same moment; try again");
    expect(host.writes()).toBe(1);
  });

  it("writes nothing when the change has nothing to do", async () => {
    const host = fakeHost();
    await changeSavedProfile(host.calls, () => null, 3);
    expect(host.writes()).toBe(0);
  });

  it("reports an invalid saved profile and a write the host refuses", async () => {
    await expect(changeSavedProfile<Values>({ read: async () => ({ status: "invalid", error: "bad json" }), write: async () => ({ status: "saved" }) }, addOne, 3)).rejects.toThrow("The saved profile is invalid: bad json");
    const host = fakeHost();
    await expect(changeSavedProfile({ ...host.calls, write: async () => ({ status: "invalid", error: "No layout has the id \"b\"" }) }, addOne, 3)).rejects.toThrow('No layout has the id "b"');
  });
});
