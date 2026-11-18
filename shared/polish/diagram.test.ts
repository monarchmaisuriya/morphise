import { describe, expect, it } from "vitest";
import { quoteAtLabels } from "./diagram";

describe("labels with an @ in a flowchart", () => {
  it("are quoted, so mermaid 11 draws a label that starts with @mention or an email", () => {
    const source = "flowchart LR\n  F[@mention in any workspace] --> G[Look up token by workspace - changed]\n  A[ops@example.com] --> B";
    expect(quoteAtLabels(source)).toBe('flowchart LR\n  F["@mention in any workspace"] --> G[Look up token by workspace - changed]\n  A["ops@example.com"] --> B');
  });

  it("are quoted in every node shape and in a piped edge label", () => {
    expect(quoteAtLabels("graph TD\n  A(@x) --> B{@y?}\n  C((@z)) --> D([@w])\n  E[[@v]] --> F[(@u)]\n  G{{@t}} -->|@s ping| H")).toBe(
      'graph TD\n  A("@x") --> B{"@y?"}\n  C(("@z")) --> D(["@w"])\n  E[["@v"]] --> F[("@u")]\n  G{{"@t"}} -->|"@s ping"| H',
    );
  });

  it("keep the arrow before a node", () => {
    expect(quoteAtLabels("flowchart LR\n  A-->B[@x]")).toBe('flowchart LR\n  A-->B["@x"]');
  });

  it("are found after front matter and comments", () => {
    expect(quoteAtLabels("---\ntitle: Install\n---\n%% the flow\nflowchart LR\n  A[@x] --> B")).toBe('---\ntitle: Install\n---\n%% the flow\nflowchart LR\n  A["@x"] --> B');
  });

  it("are left alone when quoted already, without an @, or outside a flowchart", () => {
    for (const source of ['flowchart LR\n  A["@x"] --> B', "flowchart LR\n  A[Start] --> B{Done?}", "sequenceDiagram\n  A->>B: hi @x", "classDiagram\n  class A[@x]"]) {
      expect(quoteAtLabels(source)).toBe(source);
    }
  });

  it("are quoted once, however often the source passes through", () => {
    const once = quoteAtLabels("flowchart LR\n  A[@x] -->|@y| B");
    expect(quoteAtLabels(once)).toBe(once);
  });

  it("run as a copy made from the function's own text, as the diagram frame runs it", () => {
    const copy = new Function(`return (${quoteAtLabels.toString()})`)() as typeof quoteAtLabels;
    expect(copy("flowchart LR\n  A[@x] --> B")).toBe('flowchart LR\n  A["@x"] --> B');
  });
});
