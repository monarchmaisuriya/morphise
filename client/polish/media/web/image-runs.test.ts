// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/image-runs.test.mjs
import { describe, expect, it } from "vitest";
import { type ImageNode, imageRuns } from "./image-runs";

type Node = ImageNode & { id?: string };
const el = (nodeName: string, ...childNodes: Node[]): Node => ({ nodeType: 1, nodeName, nodeValue: null, childNodes });
const text = (nodeValue: string): Node => ({ nodeType: 3, nodeName: "#text", nodeValue, childNodes: [] });
const img = (id: string): Node => Object.assign(el("IMG"), { id });
const ids = (root: Node) => imageRuns(root).map((run) => run.map((n) => (n as Node).id).join(""));

// ## Login screen / text / img1 img2 / text / img3 / ## Settings / img4 img5
const reply = el("DIV",
  el("H2", text("Login screen")), el("P", text("Here is the new login page:")), el("P", img("1"), img("2")),
  el("P", text("And the error state:")), el("P", img("3")),
  el("H2", text("Settings")), el("P", img("4"), img("5")));

describe("image runs", () => {
  it("any text ends a stack", () => {
    expect(ids(reply)).toEqual(["12", "3", "45"]);
    expect(ids(el("DIV", el("P", img("a"), img("b"), img("c")), el("P", text("t")), el("P", img("d"), img("e"), img("f"))))).toEqual(["abc", "def"]);
  });

  it("line breaks and separate paragraphs don't end a stack; links around images count", () => {
    expect(ids(el("DIV", el("P", img("a"), text("\n"), el("BR"), img("b")), el("P", img("c"))))).toEqual(["abc"]);
    expect(ids(el("DIV", el("P", el("A", img("a")), img("b"))))).toEqual(["ab"]);
  });

  it("the plugin's own stack element (a row of cards and a fold button, no text) doesn't split the run it stands for", () => {
    const stack = el("DIV", el("DIV", el("SPAN"), el("SPAN")), el("BUTTON"));
    expect(ids(el("DIV", el("P", stack, img("a"), img("b")), el("P", img("c"))))).toEqual(["abc"]);
  });

  it("a block ends the run on both sides, but images inside it still stack", () => {
    expect(ids(el("DIV", el("P", img("a"), img("b")), el("HR"), el("P", img("c"), img("d"))))).toEqual(["ab", "cd"]);
    expect(ids(el("DIV", el("UL", el("LI", img("p"), img("q"))), el("P", img("r"))))).toEqual(["pq", "r"]);
  });
});
