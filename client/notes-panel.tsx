import { type PluginAgentPanelProps, useAgent, usePaseo } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { MAX_NOTE_LENGTH, notePatch, readNote } from "../shared/notes";

const SAVE_DELAY_MS = 1000;

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "failed"; message: string };
type Theme = PluginAgentPanelProps["theme"];

const pad = (value: number) => String(value).padStart(2, "0");

// A notes box beside a chat. Keyed by chat, so a draft can never move to another chat.
export function NotesPanel({ params, theme, layout }: PluginAgentPanelProps) {
  return <NotesBody key={params.agentId} agentId={params.agentId} theme={theme} compact={layout.compact} />;
}

// Saves a second after typing stops and when the panel closes; a failed save keeps the text and
// says why.
function NotesBody({ agentId, theme, compact }: { agentId: string; theme: Theme; compact: boolean }) {
  const paseo = usePaseo();
  const saved = useAgent(agentId, (agent) => readNote(agent.metadata)) ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const latest = useRef({ draft, saved });
  latest.current = { draft, saved };
  const text = draft ?? saved;

  function save(value: string) {
    setStatus({ kind: "saving" });
    let patch: ReturnType<typeof notePatch>;
    try {
      patch = notePatch(value);
    } catch (error) {
      setStatus({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    paseo.agents
      .ref(agentId)
      .setMetadata(patch)
      .then(
        () => setStatus({ kind: "saved", at: new Date() }),
        (error: unknown) => setStatus({ kind: "failed", message: error instanceof Error ? error.message : String(error) }),
      );
  }

  // Stop showing the draft once the chat itself holds the same text, so other apps' later edits
  // come through and nothing reverts while the update is on its way.
  useEffect(() => {
    if (draft !== null && draft === saved) setDraft(null);
  }, [saved]);

  useEffect(() => {
    if (draft === null || draft === saved) return;
    const timer = setTimeout(() => save(draft), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  // Closing the panel saves what was typed and not yet saved.
  useEffect(
    () => () => {
      const { draft: unsaved, saved: stored } = latest.current;
      if (unsaved !== null && unsaved !== stored) save(unsaved);
    },
    [],
  );

  const styles = useMemo(
    () => ({
      panel: { flex: 1, padding: compact ? 12 : 16, gap: 8, backgroundColor: theme.colors.surface0 },
      input: {
        flex: 1,
        minHeight: 160,
        padding: 10,
        fontSize: 13,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 8,
        textAlignVertical: "top" as const,
      },
      status: { color: theme.colors.foregroundMuted, fontSize: 11 },
      failed: { color: theme.colors.statusDanger, fontSize: 11 },
    }),
    [theme, compact],
  );

  const statusText =
    status.kind === "saving"
      ? "Saving"
      : status.kind === "saved"
        ? `Saved ${pad(status.at.getHours())}:${pad(status.at.getMinutes())}`
        : status.kind === "failed"
          ? `Not saved: ${status.message}`
          : "Saved on this chat; every app sees it";

  return (
    <View style={styles.panel}>
      <TextInput
        accessibilityLabel="Notes for this chat"
        placeholder="Notes for this chat: to-dos, context, links"
        placeholderTextColor={theme.colors.foregroundMuted}
        multiline
        maxLength={MAX_NOTE_LENGTH}
        value={text}
        onChangeText={setDraft}
        style={styles.input}
      />
      <Text style={status.kind === "failed" ? styles.failed : styles.status}>
        {statusText} · {text.length}/{MAX_NOTE_LENGTH}
      </Text>
    </View>
  );
}
