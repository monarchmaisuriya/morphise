import { describe, expect, it } from "vitest";
import { start } from "./rpc";

describe("start", () => {
  it("takes a shell name from the fixed list and refuses anything else, paths included", () => {
    const base = { agentId: "a1", command: "ls" };
    expect(start.input.parse({ ...base, shell: "bash" }).shell).toBe("bash");
    expect(start.input.parse(base).shell).toBeUndefined();
    expect(start.input.safeParse({ ...base, shell: "/bin/bash" }).success).toBe(false);
    expect(start.input.safeParse({ ...base, shell: "fish" }).success).toBe(false);
  });

  it("drops a field it doesn't know, as an older daemon would drop `shell`", () => {
    expect(start.input.parse({ agentId: "a1", command: "ls", later: 1 })).not.toHaveProperty("later");
  });
});
