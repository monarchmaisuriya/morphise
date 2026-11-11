import type { CheckRun, PullRequestInfo } from "./workspaces";

// What the Checks panel asks the agent to fix: failing or canceled checks, requested changes and
// merge conflicts. The agent fetches the details itself (it has the repository and the gh CLI);
// the plugin only names what Paseo already reports.

export function needsWork(pr: PullRequestInfo): { failing: CheckRun[]; changesRequested: boolean; conflicts: boolean } {
  return {
    failing: pr.checkRuns.filter((run) => run.status === "failure" || run.status === "cancelled"),
    changesRequested: pr.review === "changes_requested",
    conflicts: pr.mergeable === "conflicting",
  };
}

// The message put in the chat's message box; null when nothing needs fixing.
export function fixRequest(pr: PullRequestInfo): string | null {
  const { failing, changesRequested, conflicts } = needsWork(pr);
  if (!failing.length && !changesRequested && !conflicts) return null;
  const name = pr.number ? `#${pr.number}` : "this branch's pull request";
  const lines = [`The pull request ${name} (${pr.url}) needs work:`];
  if (failing.length) lines.push(`- Failing checks: ${failing.map((run) => (run.workflow ? `${run.name} (${run.workflow})` : run.name)).join(", ")}`);
  if (changesRequested) lines.push("- A reviewer requested changes");
  if (conflicts) lines.push("- It has merge conflicts with its base branch");
  const look = pr.number ? ` (for example \`gh pr checks ${pr.number}\` and \`gh pr view ${pr.number} --comments\`)` : "";
  lines.push(`Read the details${look}, fix them, and push.`);
  return lines.join("\n");
}
