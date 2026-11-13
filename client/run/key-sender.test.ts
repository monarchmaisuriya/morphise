import { describe, expect, it, vi } from "vitest";
import { createKeySender } from "./key-sender";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createKeySender", () => {
  it("sends keys in the order they were pressed, joining what was typed while a send was out", async () => {
    const sent: string[] = [];
    let release: () => void = () => {};
    const send = vi.fn((keys: string) => {
      sent.push(keys);
      return sent.length === 1 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
    });
    const type = createKeySender(send, { chunkChars: 100, onError: () => {} });
    type("a");
    type("b");
    type("c");
    expect(sent).toEqual(["a"]);
    release();
    await flush();
    await flush();
    expect(sent).toEqual(["a", "bc"]);
  });

  it("sends a long paste in pieces no longer than the limit", async () => {
    const sent: string[] = [];
    const type = createKeySender(async (keys) => void sent.push(keys), { chunkChars: 4, onError: () => {} });
    type("abcdefghij");
    await flush();
    await flush();
    expect(sent).toEqual(["abcd", "efgh", "ij"]);
  });

  it("drops what is waiting after a failed send and reports the error once", async () => {
    const onError = vi.fn();
    const send = vi.fn().mockRejectedValueOnce(new Error("no terminal")).mockResolvedValue(undefined);
    const type = createKeySender(send, { chunkChars: 1, onError });
    type("ab");
    await flush();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    type("c");
    await flush();
    expect(send).toHaveBeenLastCalledWith("c");
  });
});
