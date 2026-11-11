import { describe, expect, it } from "vitest";
import { fixRequest } from "./checks";
import type { PullRequestInfo } from "./workspaces";

const pr = (patch: Partial<PullRequestInfo> = {}): PullRequestInfo => ({ number: 12, url: "https://github.com/a/b/pull/12", title: "Fix", state: "open", checks: "success", review: null, checkRuns: [], mergeable: "mergeable", ...patch });

describe("fixRequest", () => {
  it("names failing checks, requested changes and conflicts", () => {
    const text = fixRequest(
      pr({
        review: "changes_requested",
        mergeable: "conflicting",
        checkRuns: [
          { name: "lint", status: "failure", url: null, workflow: "CI", duration: null },
          { name: "e2e", status: "cancelled", url: null, workflow: null, duration: null },
          { name: "unit", status: "success", url: null, workflow: "CI", duration: null },
        ],
      }),
    );
    expect(text).toContain("The pull request #12 (https://github.com/a/b/pull/12) needs work:");
    expect(text).toContain("- Failing checks: lint (CI), e2e");
    expect(text).toContain("- A reviewer requested changes");
    expect(text).toContain("- It has merge conflicts");
    expect(text).toContain("gh pr checks 12");
    expect(text).not.toContain("unit");
  });

  it("asks nothing when the pull request is fine", () => {
    expect(fixRequest(pr({ checkRuns: [{ name: "unit", status: "success", url: null, workflow: null, duration: null }] }))).toBeNull();
  });
});
