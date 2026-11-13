import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { litRowsRemoved, markLitRows } from "./model-picker";

afterEach(() => vi.unstubAllGlobals());

it("stops watching a picker's rows once the picker leaves the page", () => {
  const observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal(
    "MutationObserver",
    class {
      disconnect = vi.fn();
      observe() {}
      constructor() {
        observers.push(this);
      }
    },
  );
  vi.stubGlobal("getComputedStyle", () => ({ backgroundColor: "rgba(0, 0, 0, 0)" }));
  // An open model picker: a combobox surface with no rows yet.
  const surface = { isConnected: true, matches: () => true, querySelectorAll: () => [] };
  markLitRows([surface as never]);
  expect(observers).toHaveLength(1);

  // Closing it detaches the popover, which never mutates again.
  surface.isConnected = false;
  litRowsRemoved();
  expect(observers[0]!.disconnect).toHaveBeenCalled();

  // A new picker in its place is watched afresh.
  surface.isConnected = true;
  markLitRows([surface as never]);
  expect(observers).toHaveLength(2);
});
