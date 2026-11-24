import { type AgentRef, getPaseoClient } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { observeMessagePreview, type MessagePreviewState } from "./sidebar-message";

export function useSidebarMessage(target: AgentRef | null) {
  const key = target?.key ?? "";
  const [value, setValue] = useState<{ key: string; state: MessagePreviewState } | null>(null);
  useEffect(() => {
    if (!target) return;
    try {
      const timeline = getPaseoClient(target.hostId).agents.ref(target.id).timeline;
      return observeMessagePreview(timeline, (state) => setValue({ key, state }));
    } catch {
      setValue({ key, state: { status: "failed", text: null } });
    }
  }, [key]);
  return !target ? null : value?.key === key ? value.state : { status: "loading" as const, text: null };
}
