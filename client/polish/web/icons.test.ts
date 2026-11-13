import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { addIconSet, iconTwins, nativeIconSet } from "./icons";

afterEach(() => vi.unstubAllGlobals());

it("takes the icon sets the daemon sent, and their style, away when the plugin unloads", () => {
  const styles: Array<{ textContent: string; remove: ReturnType<typeof vi.fn> }> = [];
  const body = { matches: () => false, querySelectorAll: () => [] };
  vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("document", {
    body,
    head: { appendChild: () => {} },
    querySelectorAll: () => [],
    createElement: () => {
      const style = { textContent: "", remove: vi.fn() };
      styles.push(style);
      return style;
    },
  });
  const cleanup = nativeIconSet(() => "lucide");
  addIconSet("phosphor", { Folder: "<path></path>" });
  expect(iconTwins("phosphor")).toBeDefined();
  expect(styles).toHaveLength(1);

  cleanup();
  expect(styles[0]!.remove).toHaveBeenCalled();
  expect(iconTwins("phosphor")).toBeUndefined();
});
