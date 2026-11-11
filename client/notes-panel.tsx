import { type PluginAgentPanelProps, useAgent, usePaseo } from "@getpaseo/plugin/client";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { MAX_NOTE_LENGTH, notePatch, readNote } from "../shared/notes";
import { useTokens } from "./ui/kit";

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

  const t = useTokens(theme, compact);
  const statusText =
    status.kind === "saving"
      ? "Saving…"
      : status.kind === "saved"
        ? `Saved ${pad(status.at.getHours())}:${pad(status.at.getMinutes())}`
        : status.kind === "failed"
          ? `Not saved: ${status.message}`
          : "Saved on this chat; every app sees it";
  const statusIcon = status.kind === "saving" ? "LoaderCircle" : status.kind === "failed" ? "TriangleAlert" : "Check";

  return (
    <View style={{ flex: 1, padding: compact ? 12 : 16, gap: 10, backgroundColor: t.c.surface0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="NotebookPen" size={15} color={t.c.foregroundMuted} />
        <Text style={t.text.heading}>Notes</Text>
        <View style={{ flex: 1 }} />
        <Text style={[t.text.small, { opacity: 0.7 }]}>
          {text.length}/{MAX_NOTE_LENGTH}
        </Text>
      </View>
      <TextInput
        accessibilityLabel="Notes for this chat"
        placeholder="To-dos, context, links… saved as you type"
        placeholderTextColor={t.c.foregroundMuted}
        multiline
        maxLength={MAX_NOTE_LENGTH}
        value={text}
        onChangeText={setDraft}
        style={{ flex: 1, minHeight: 200, padding: 12, fontSize: compact ? 15 : 14, lineHeight: compact ? 22 : 20, color: t.c.foreground, backgroundColor: t.c.surface1, borderColor: t.c.border, borderWidth: 1, borderRadius: t.radius.card, textAlignVertical: "top" }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={statusIcon} size={12} color={status.kind === "failed" ? t.c.statusDanger : t.c.foregroundMuted} />
        <Text style={status.kind === "failed" ? t.text.danger : t.text.small}>{statusText}</Text>
      </View>
    </View>
  );
}
