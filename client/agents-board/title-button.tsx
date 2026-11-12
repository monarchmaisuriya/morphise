// "Generate a title" in an agent's details: starts the daemon's title job and polls it until the
// title is applied or fails. The helper runs on the user's provider login, so the button says so.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { startTitle, titleStatus } from "../../shared/agent-titles";
import { Button, type Tokens } from "../ui/kit";

const POLL_MS = 1500;

export function GenerateTitleButton({ t, client, agentId }: { t: Tokens; client: PluginClientContext; agentId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const latestAgent = useRef(agentId);
  latestAgent.current = agentId;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The job this button is following; replies for any other (an earlier agent's, or after the pane closed) are dropped.
  const following = useRef<string | null>(null);
  useEffect(
    () => () => {
      following.current = null;
      latestAgent.current = "";
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    following.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
  }, [agentId]);
  const poll = (jobId: string) => {
    following.current = jobId;
    timer.current = setTimeout(() => {
      client.rpc(titleStatus, { jobId }).then(
        (job) => {
          if (following.current !== jobId) return;
          if (job.state === "running") return poll(jobId);
          setBusy(false);
          if (job.state === "done") toast.show(`Titled “${job.title}”`);
          else toast.error(`No title: ${job.error}`);
        },
        (error: unknown) => {
          if (following.current !== jobId) return;
          setBusy(false);
          toast.error(`No title: ${error instanceof Error ? error.message : String(error)}`);
        },
      );
    }, POLL_MS);
  };
  const start = () => {
    if (busy) return;
    setBusy(true);
    const forAgent = agentId;
    client.rpc(startTitle, { agentId }).then(
      // The pane may have moved to another agent while the job started; the job still runs on the daemon.
      ({ jobId }) => (forAgent === latestAgent.current ? poll(jobId) : undefined),
      (error: unknown) => {
        setBusy(false);
        toast.error(`No title: ${error instanceof Error ? error.message : String(error)}`);
      },
    );
  };
  return <Button t={t} variant="ghost" icon="Sparkles" label={busy ? "Writing a title…" : "Generate a title"} accessibilityLabel="Generate a title with a short background agent (uses tokens)" disabled={busy} onPress={start} />;
}
