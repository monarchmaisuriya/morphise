// Ported from Quote (keefeere/paseo-quote, MIT, see NOTICE.md): client/side-chat-panel.tsx
// A side chat in the right-hand panel: its turns, a follow-up box, and Open as tab.
import { type PluginAgentPanelProps, useAgent, usePaseo } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type NativeSyntheticEvent, Platform, Text, type TextInputKeyPressEventData, View } from "react-native";
import { Button, useTokens } from "../../ui/kit";
import { useLanguage } from "../i18n";
import { Prose } from "../rows/prose";
import { readTurns } from "./actions";
import { type ChatTurn, splitBlocks } from "./format";
import { say } from "./strings";
import { fontSize } from "../../../shared/design/tokens";

const MONO = Platform.select({ web: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", ios: "Menlo", default: "monospace" });
/** How often the turns are refetched while the side agent streams. */
const REFETCH_MS = 250;

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export function SideChatPanel({ theme, layout, params, navigation }: PluginAgentPanelProps) {
  // Keyed by chat, so a draft can never move to another side chat.
  return <SideChatBody key={params.agentId} agentId={params.agentId} theme={theme} compact={layout.compact} navigation={navigation} />;
}

function SideChatBody({ agentId, theme, compact, navigation }: { agentId: string; theme: PluginAgentPanelProps["theme"]; compact: boolean; navigation: PluginAgentPanelProps["navigation"] }) {
  useLanguage();
  const paseo = usePaseo();
  const t = useTokens(theme, compact);
  const agent = useAgent(agentId, (snapshot) => ({ status: snapshot.status, title: snapshot.title }));
  const [turns, setTurns] = useState<ChatTurn[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // History, then a refetch at most every REFETCH_MS while the side agent streams. The projected
  // timeline arrives with streamed chunks already merged.
  useEffect(() => {
    const handle = paseo.agents.ref(agentId);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      timer = null;
      readTurns(handle, 200).then(
        (next) => {
          if (!cancelled) setTurns(next);
        },
        (cause: unknown) => {
          if (!cancelled) setError(message(cause));
        },
      );
    };
    load();
    const unsubscribe = handle.timeline.subscribe(() => {
      if (timer === null) timer = setTimeout(load, REFETCH_MS);
    });
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [paseo, agentId]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await paseo.agents.ref(agentId).send(text);
      setDraft("");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSending(false);
    }
  }, [agentId, draft, paseo, sending]);

  // Enter asks, Shift+Enter is a new line (web and desktop; phones keep the keyboard's return).
  const onKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (Platform.OS !== "web") return;
      const native = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean };
      if (native.key !== "Enter" || native.shiftKey || native.isComposing) return;
      event.preventDefault();
      void send();
    },
    [send],
  );

  const styles = useMemo(() => {
    const { c } = t;
    const pad = compact ? t.space.md : 14;
    return {
      screen: { flex: 1, backgroundColor: c.surface0 },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: t.space.sm, paddingHorizontal: pad, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
      title: { ...t.text.heading, flex: 1, fontSize: fontSize.base },
      listContent: { padding: pad, gap: 14 },
      userTurn: { alignSelf: "flex-end" as const, maxWidth: "92%" as const, padding: 10, borderRadius: t.radius.card, gap: 6, backgroundColor: c.surface2 },
      assistantTurn: { gap: t.space.sm },
      text: { color: c.foreground, fontSize: fontSize.base, lineHeight: 19 },
      quote: { color: c.foregroundMuted, fontSize: fontSize.base, lineHeight: 19, paddingLeft: 9, borderLeftWidth: 2, borderLeftColor: c.border },
      code: { color: c.foreground, fontFamily: MONO, fontSize: fontSize.sm, lineHeight: 17, padding: t.space.sm, borderRadius: t.radius.control, backgroundColor: c.surface1 },
      error: { ...t.text.danger, paddingHorizontal: pad },
      composer: { flexDirection: "row" as const, alignItems: "flex-end" as const, gap: t.space.sm, padding: pad, borderTopWidth: 1, borderTopColor: c.border },
      // Drawn as kit Field draws a field (its radius, height and focus border); Field has no way to pass Enter through to send.
      input: { flex: 1, minHeight: t.control, maxHeight: 160, paddingHorizontal: 10, paddingVertical: t.space.sm, borderWidth: 1, borderRadius: t.radius.control, borderColor: c.border, backgroundColor: c.surface1, color: c.foreground, fontSize: fontSize.base },
    };
  }, [t, compact]);

  // A side chat that fails (for one, a model its provider rejects) says why here; Paseo keeps the reason on the agent.
  const failed = agent?.status === "error";
  useEffect(() => {
    if (!failed) return;
    let alive = true;
    paseo.agents
      .ref(agentId)
      .refresh()
      .then(
        (result) => {
          if (alive) setError(result?.agent.lastError || say("sideFailed"));
        },
        (cause: unknown) => {
          if (alive) setError(message(cause));
        },
      );
    return () => {
      alive = false;
    };
  }, [failed, paseo, agentId]);

  const running = agent?.status === "running" || agent?.status === "initializing";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {agent?.title ?? say("side")}
        </Text>
        {running ? <Text style={t.text.meta}>{say("thinking")}</Text> : null}
        {navigation ? <Button t={t} variant="ghost" label={say("openAsTab")} accessibilityLabel={say("openAsTabLabel")} onPress={() => navigation.openAgent({ agentId })} /> : null}
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.listContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {turns === null ? <Text style={t.text.meta}>{say("loading")}</Text> : null}
        {turns?.map((turn, index) => (
          <View key={index} style={turn.role === "user" ? styles.userTurn : styles.assistantTurn}>
            {/* Replies are Markdown, drawn as they are in the chat; the reader's own words stay as typed. */}
            {turn.role === "user" ? (
              splitBlocks(turn.text).map((block, blockIndex) => (
                <Text key={blockIndex} selectable style={block.kind === "code" ? styles.code : block.kind === "quote" ? styles.quote : styles.text}>
                  {block.text}
                </Text>
              ))
            ) : (
              <Prose text={turn.text} />
            )}
          </View>
        ))}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onKeyPress={onKeyPress}
          placeholder={say("followUp")}
          placeholderTextColor={t.c.foregroundMuted}
          accessibilityLabel={say("followUp")}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          editable={!sending}
          // The border shows focus; on the web the input's own outline would draw a second ring inside it.
          style={[styles.input, focused ? { borderColor: t.c.accent } : null, Platform.OS === "web" ? { outlineWidth: 0 } : null]}
        />
        <Button t={t} variant="primary" label={say("send")} accessibilityLabel={say("sendFollowUp")} disabled={!draft.trim() || sending} onPress={() => void send()} />
      </View>
    </View>
  );
}
