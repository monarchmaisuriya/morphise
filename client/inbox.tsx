import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginClientContext, PluginScreenProps, useSettings as UseSettings } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { copyText, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { type Bookmark, lastAnswer } from "../shared/bookmarks";
import { canClear, clearKey, type InboxFilter, type InboxReason, type InboxSettings, inboxSettings, inboxView, isCleared, nextSelection, type PermissionChoice, type PermissionSummary, previewLine, withCleared } from "../shared/inbox";
import { formatElapsed } from "../shared/time-text";
import { type AttentionItem, type AttentionList, attentionOrder } from "./attention";
import { ANSWER_TAIL, type ApplyBookmark, type BookmarkStore, bookmarksOf } from "./bookmark-store";
import { type ValueStore, useValue } from "./profile-store";
import { statusColor } from "./ui/hues";
import { Button, Field, Icon, IconButton, Segmented, type Tokens, useTokens } from "./ui/kit";
import { usePulse } from "./ui/pulse";
import type { WorkspaceList } from "./workspaces";

// The Workbench's "Waiting" and "Bookmarks" views: every chat and sub-agent waiting on the user,
// across workspaces, from Paseo's own attention state. Each one can be answered where it is listed:
// a permission allowed or denied, a finished or failed chat read and replied to, or a finished one
// cleared from the list.

export interface InboxDeps {
  client: PluginClientContext;
  attention: ValueStore<AttentionList>;
  workspaces: ValueStore<WorkspaceList>;
  bookmarks: BookmarkStore;
  applyBookmark: ApplyBookmark;
  bookmarkLastAnswer(agentId: string, workspaceId: string | null, note: string): Promise<void>;
}

type Entry = AttentionItem & { workspace: string };
type Settings = ReturnType<typeof UseSettings<typeof inboxSettings.schema>>;

// Two panes from this width; below it the list, and the detail opens over it.
const WIDE = 760;
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });
const DEFAULT_SETTINGS: InboxSettings = { group: "reason", cleared: [] };

const HEADINGS: Record<InboxReason, string> = { permission: "Waiting for permission", failed: "Failed", finished: "Finished, not seen yet" };
const LABELS: Record<InboxReason, string> = { permission: "Needs permission", failed: "Failed", finished: "Finished" };
const STATUS: Record<InboxReason, "needs_input" | "failed" | "attention"> = { permission: "needs_input", failed: "failed", finished: "attention" };

const reasonColor = (t: Tokens, reason: InboxReason) => statusColor(t.c, STATUS[reason]);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function whereOf(entry: Entry, list: AttentionList, withWorkspace: boolean): string {
  const parent = entry.parentAgentId ? list.get(entry.parentAgentId)?.title ?? "a chat" : null;
  return [parent ? `sub-agent of ${parent}` : null, withWorkspace ? entry.workspace : null].filter(Boolean).join(" · ");
}

// ---------- List ----------

function InboxRow({ entry, t, list, selected, withWorkspace, onPress }: { entry: Entry; t: Tokens; list: AttentionList; selected: boolean; withWorkspace: boolean; onPress(): void }) {
  const where = whereOf(entry, list, withWorkspace);
  const elapsed = entry.at ? formatElapsed(entry.at, new Date()) : null;
  const preview = previewLine(entry);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${entry.title}, ${LABELS[entry.reason]}, ${preview}${where ? `, ${where}` : ""}`}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: "row",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: t.radius.row,
        backgroundColor: selected ? t.c.surface2 : pressed || hovered ? t.c.surface1 : "transparent",
      })}
    >
      <View style={{ width: 8, height: 18, justifyContent: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: reasonColor(t, entry.reason) }} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: t.c.foreground, fontSize: 14, fontWeight: selected ? "600" : "500" }} numberOfLines={1}>
            {entry.title}
          </Text>
          {entry.permissionCount > 1 ? <Text style={{ fontSize: 11, color: reasonColor(t, entry.reason) }}>{entry.permissionCount}</Text> : null}
          {elapsed ? <Text style={t.text.meta}>{elapsed}</Text> : null}
        </View>
        <Text style={{ fontSize: 12, color: entry.reason === "failed" ? t.c.statusDanger : t.c.foregroundMuted, fontFamily: entry.reason === "permission" && entry.permission?.subject ? MONO : undefined }} numberOfLines={1}>
          {preview}
        </Text>
        {where ? (
          <Text style={t.text.small} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function GroupHeading({ t, title, count, color }: { t: Tokens; title: string; count: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 }}>
      {color ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /> : null}
      <Text style={t.text.label} numberOfLines={1}>
        {title} · {count}
      </Text>
    </View>
  );
}

function EmptyState({ t, icon, title, hint }: { t: Tokens; icon: string; title: string; hint: string }) {
  return (
    <View style={{ alignItems: "center", gap: 6, paddingVertical: 48, paddingHorizontal: 24 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: t.c.surface1 }}>
        <Icon name={icon} size={20} color={t.c.foregroundMuted} />
      </View>
      <Text style={t.text.heading}>{title}</Text>
      <Text style={[t.text.meta, { textAlign: "center" }]}>{hint}</Text>
    </View>
  );
}

// ---------- Detail ----------

function Block({ t, children, mono, tone, maxHeight }: { t: Tokens; children: string; mono?: boolean; tone?: string; maxHeight?: number }) {
  return (
    <ScrollView style={{ maxHeight: maxHeight ?? 320, borderRadius: t.radius.row, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }} contentContainerStyle={{ padding: 10 }}>
      <Text selectable style={{ color: tone ?? t.c.foreground, fontSize: 12, lineHeight: 18, fontFamily: mono ? MONO : undefined }}>
        {children}
      </Text>
    </ScrollView>
  );
}

// The chat's newest answer, read from its recent history when it is shown.
function useLastAnswer(client: PluginClientContext, agentId: string, at: string) {
  const [state, setState] = useState<{ key: string; status: "loading" | "ready" | "none" | "error"; text: string }>({ key: "", status: "loading", text: "" });
  const key = `${agentId}@${at}`;
  useEffect(() => {
    let alive = true;
    setState({ key, status: "loading", text: "" });
    client.paseo.agents
      .ref(agentId)
      .timeline.refetch({ direction: "tail", limit: ANSWER_TAIL })
      .then(
        (page) => {
          const answer = lastAnswer(page.entries);
          if (alive) setState({ key, status: answer ? "ready" : "none", text: answer ?? "" });
        },
        (error: unknown) => alive && setState({ key, status: "error", text: errorText(error) }),
      );
    return () => {
      alive = false;
    };
  }, [client, agentId, key]);
  return state.key === key ? state : { key, status: "loading" as const, text: "" };
}

function LastAnswer({ t, client, entry }: { t: Tokens; client: PluginClientContext; entry: Entry }) {
  const answer = useLastAnswer(client, entry.id, entry.at);
  const pulse = usePulse(answer.status === "loading");
  return (
    <View style={{ gap: 6 }}>
      <Text style={t.text.label}>Last answer</Text>
      {answer.status === "loading" ? (
        <Animated.View style={{ gap: 6, opacity: pulse }}>
          {[0.9, 0.75, 0.5].map((width) => (
            <View key={width} style={{ height: 10, width: `${width * 100}%`, borderRadius: 5, backgroundColor: t.c.surface2 }} />
          ))}
        </Animated.View>
      ) : answer.status === "ready" ? (
        <View style={{ padding: 12, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
          <Markdown>{answer.text}</Markdown>
        </View>
      ) : answer.status === "none" ? (
        <Text style={t.text.meta}>No answer in this chat's recent history.</Text>
      ) : (
        <Text style={t.text.danger}>Could not read the chat: {answer.text}</Text>
      )}
    </View>
  );
}

function PermissionCard({ t, entry, request, onAnswer, onOpen, busy }: { t: Tokens; entry: Entry; request: PermissionSummary | null; onAnswer(choice: { behavior: "allow" | "deny"; id?: string }): void; onOpen: (() => void) | null; busy: boolean }) {
  if (!request) {
    return <Text style={t.text.meta}>Paseo did not send this request's details. Open the chat to answer it.</Text>;
  }
  const choices: PermissionChoice[] = request.choices.length
    ? request.choices
    : [
        { id: "", label: "Allow", behavior: "allow", variant: "primary" },
        { id: "", label: "Deny", behavior: "deny", variant: "secondary" },
      ];
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={request.answerInChat ? "MessageCircleQuestion" : request.kind === "plan" ? "ListChecks" : "ShieldAlert"} size={15} color={reasonColor(t, "permission")} />
        <Text style={t.text.heading}>{request.answerInChat ? "Asks you a question" : request.kind === "plan" ? "Wants to start on a plan" : `Wants to use ${request.tool || "a tool"}`}</Text>
        {entry.permissionCount > 1 ? <Text style={t.text.meta}>1 of {entry.permissionCount} requests</Text> : null}
      </View>
      {request.title ? <Text style={[t.text.body, { fontWeight: "500" }]}>{request.title}</Text> : null}
      {request.description && request.description !== request.title ? <Text style={t.text.body}>{request.description}</Text> : null}
      {request.subject ? <Block t={t} mono maxHeight={140}>{request.subject}</Block> : null}
      {request.body ? request.kind === "plan" ? (
        <View style={{ padding: 12, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
          <Markdown>{request.body}</Markdown>
        </View>
      ) : (
        <Block t={t} mono>{request.body}</Block>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {request.answerInChat ? (
          onOpen ? <Button t={t} variant="primary" icon="MessageSquare" label="Answer in the chat" onPress={onOpen} /> : <Text style={t.text.meta}>Answer it in the chat.</Text>
        ) : (
          choices.map((choice) => (
            <Button
              key={`${choice.behavior}:${choice.id}:${choice.label}`}
              t={t}
              variant={choice.variant}
              icon={choice.behavior === "allow" ? "Check" : "X"}
              label={choice.label}
              disabled={busy}
              accessibilityLabel={`${choice.label}: ${request.tool || "request"} in ${entry.title}`}
              onPress={() => onAnswer({ behavior: choice.behavior, id: choice.id || undefined })}
            />
          ))
        )}
      </View>
    </View>
  );
}

function Reply({ t, entry, client, onSent }: { t: Tokens; entry: Entry; client: PluginClientContext; onSent(): void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => {
    setText("");
    setState({ busy: false, error: null });
  }, [entry.id]);
  const send = () => {
    const message = text.trim();
    if (!message || state.busy) return;
    setState({ busy: true, error: null });
    client.paseo.agents
      .ref(entry.id)
      .send(message)
      .then(
        () => {
          setText("");
          setState({ busy: false, error: null });
          onSent();
        },
        (error: unknown) => setState({ busy: false, error: `Could not send: ${errorText(error)}` }),
      );
  };
  return (
    <View style={{ gap: 6 }}>
      <Field t={t} value={text} onChangeText={setText} placeholder={`Reply to ${entry.title}`} accessibilityLabel={`Reply to ${entry.title}`} multiline onSubmit={send} error={state.error} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        <Text style={[t.text.small, { flex: 1 }]}>The chat starts working on it right away.</Text>
        <Button t={t} variant="primary" icon="SendHorizontal" label={state.busy ? "Sending" : "Send"} disabled={!text.trim() || state.busy} onPress={send} />
      </View>
    </View>
  );
}

function Detail({ t, deps, entry, list, onBack, onOpen, onClear, saving }: { t: Tokens; deps: InboxDeps; entry: Entry; list: AttentionList; onBack: (() => void) | null; onOpen: (() => void) | null; onClear(): void; saving: boolean }) {
  const toast = useToast();
  // Paseo sends an answer without waiting for the agent, so once sent the buttons stay off until
  // this request is replaced or leaves the list; a second answer to the same request is never sent.
  const [answering, setAnswering] = useState<{ busy: boolean; sent: boolean; error: string | null }>({ busy: false, sent: false, error: null });
  useEffect(() => setAnswering({ busy: false, sent: false, error: null }), [entry.id, entry.permission?.id]);
  const where = whereOf(entry, list, true);
  const answer = (choice: { behavior: "allow" | "deny"; id?: string }) => {
    const request = entry.permission;
    if (!request) return;
    if (answering.busy) return;
    setAnswering({ busy: true, sent: false, error: null });
    deps.client.paseo.agents
      .ref(entry.id)
      .respondToPermission({ requestId: request.id, response: choice.behavior === "allow" ? { behavior: "allow", selectedActionId: choice.id } : { behavior: "deny", selectedActionId: choice.id } })
      .then(
        () => setAnswering({ busy: true, sent: true, error: null }),
        (error: unknown) => setAnswering({ busy: false, sent: false, error: `Could not answer: ${errorText(error)}` }),
      );
  };
  const bookmark = () =>
    void deps.bookmarkLastAnswer(entry.id, entry.workspaceId || null, "").then(
      () => toast.show("Bookmarked the last answer"),
      (error: unknown) => toast.error(errorText(error)),
    );
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.compact ? 12 : 20, gap: 16 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {onBack ? <IconButton t={t} icon="ArrowLeft" label="Back to the list" onPress={onBack} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: t.c.surface1 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: reasonColor(t, entry.reason) }} />
            <Text style={{ fontSize: 11, color: t.c.foreground }}>{LABELS[entry.reason]}</Text>
          </View>
          {entry.at ? <Text style={t.text.meta}>{formatElapsed(entry.at, new Date())}</Text> : null}
        </View>
        <Text style={t.text.title} numberOfLines={3}>
          {entry.title}
        </Text>
        {where ? <Text style={t.text.meta}>{where}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {onOpen ? <Button t={t} icon="MessageSquare" label="Open chat" onPress={onOpen} /> : null}
          {entry.reason !== "permission" ? <Button t={t} variant="ghost" icon="Bookmark" label="Bookmark answer" onPress={bookmark} /> : null}
          {canClear(entry) ? <Button t={t} variant="ghost" icon="CheckCheck" label="Clear" accessibilityLabel={`Clear ${entry.title} from the Inbox`} disabled={saving} onPress={onClear} /> : null}
        </View>
      </View>
      {entry.reason === "permission" ? (
        <View style={{ gap: 6 }}>
          <PermissionCard t={t} entry={entry} request={entry.permission} busy={answering.busy} onAnswer={answer} onOpen={onOpen} />
          {answering.sent ? <Text style={t.text.meta}>Answer sent. Waiting for the chat to continue.</Text> : null}
          {answering.error ? <Text style={t.text.danger}>{answering.error}</Text> : null}
        </View>
      ) : null}
      {entry.reason === "failed" ? (
        <View style={{ gap: 6 }}>
          <Text style={t.text.label}>Error</Text>
          {entry.error ? <Block t={t} mono tone={t.c.statusDanger}>{entry.error}</Block> : <Text style={t.text.meta}>Paseo gave no error message.</Text>}
        </View>
      ) : null}
      {entry.reason !== "permission" ? <LastAnswer t={t} client={deps.client} entry={entry} /> : null}
      {entry.reason !== "permission" ? <Reply t={t} entry={entry} client={deps.client} onSent={() => toast.show(`Sent to ${entry.title}`)} /> : null}
    </ScrollView>
  );
}

// ---------- Bookmarks ----------

function BookmarkCard({ bookmark, t, workspaces, open, remove }: { bookmark: Bookmark; t: Tokens; workspaces: WorkspaceList; open: ((agentId: string) => void) | null; remove(): void }) {
  const toast = useToast();
  const workspace = bookmark.workspaceId ? workspaces.get(bookmark.workspaceId)?.name ?? null : null;
  const meta = [bookmark.chat, workspace, formatElapsed(bookmark.at, new Date())].filter(Boolean).join(" · ");
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="Bookmark" size={13} color={t.c.foregroundMuted} />
        <Text style={[t.text.meta, { flex: 1 }]} numberOfLines={1}>
          {meta}
        </Text>
        <IconButton t={t} size="sm" icon="Copy" label={`Copy the bookmark from ${bookmark.chat}`} onPress={() => void copyText(bookmark.excerpt).then(() => toast.show("Copied"), (error: unknown) => toast.error(errorText(error)))} />
        {open ? <IconButton t={t} size="sm" icon="MessageSquare" label={`Open ${bookmark.chat}`} onPress={() => open(bookmark.agentId)} /> : null}
        <IconButton t={t} size="sm" icon="Trash2" label={`Remove the bookmark from ${bookmark.chat}`} onPress={remove} />
      </View>
      {bookmark.note ? <Text style={t.text.heading}>{bookmark.note}</Text> : null}
      <Markdown>{bookmark.excerpt}</Markdown>
    </View>
  );
}

export function Bookmarks({ t, deps, workspaces, open }: { t: Tokens; deps: InboxDeps; workspaces: WorkspaceList; open: ((agentId: string) => void) | null }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const all = bookmarksOf(useValue(deps.bookmarks)).bookmarks;
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((bookmark) => words.every((word) => `${bookmark.note} ${bookmark.chat} ${bookmark.excerpt}`.toLowerCase().includes(word)));
  const remove = (bookmark: Bookmark) =>
    void deps.applyBookmark({ kind: "remove", id: bookmark.id }).then(
      () => toast.show("Bookmark removed"),
      (error: unknown) => toast.error(`Could not remove the bookmark: ${errorText(error)}`),
    );
  if (!all.length) return <EmptyState t={t} icon="Bookmark" title="No bookmarks yet" hint="Type /bookmark in a chat, or use Bookmark answer here, to keep an answer." />;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.compact ? 12 : 20, gap: 10, maxWidth: 820, width: "100%", alignSelf: "center" }}>
      <Field t={t} value={search} onChangeText={setSearch} placeholder="Search bookmarks" icon="Search" plain accessibilityLabel="Search bookmarks" />
      {shown.length ? shown.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} t={t} workspaces={workspaces} open={open} remove={() => remove(bookmark)} />) : <Text style={t.text.meta}>No bookmark matches.</Text>}
    </ScrollView>
  );
}

// ---------- Screen ----------

function saveSettings(settings: Settings, next: Partial<InboxSettings>, onFail: () => void) {
  if (settings.status !== "ready") return onFail();
  void settings.save({ ...settings.values, ...next }, settings.revision).then((saved) => {
    if (!saved) onFail();
  });
}

// Items waiting on the user that the Inbox lists and counts: in open workspaces, not cleared.
export function waitingItems(list: AttentionList, workspaces: WorkspaceList, cleared: ReadonlySet<string>): AttentionItem[] {
  return [...list.values()].filter((item) => workspaces.get(item.workspaceId)?.open !== false && !isCleared(item, cleared));
}

// Chats and sub-agents waiting on the user: filter, search, group, and act on the selected one.
export function WaitingView({ deps, theme, compact, navigation }: { deps: InboxDeps; theme: PluginTheme; compact: boolean; navigation: PluginScreenProps["navigation"] }) {
  {
    const layout = { compact };
    const t = useTokens(theme, layout.compact);
    const toast = useToast();
    const [filter, setFilter] = useState<InboxFilter>("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<string | null>(null);
    const [width, setWidth] = useState(0);
    const list = useValue(deps.attention);
    const workspaces = useValue(deps.workspaces);
    const settings = useSettings(inboxSettings);
    const stored = settings.status === "ready" ? settings.values : DEFAULT_SETTINGS;
    const cleared = useMemo(() => new Set(stored.cleared), [stored.cleared]);
    // Chats in archived, internal or background workspaces stay out, as their workspaces do.
    const entries: Entry[] = attentionOrder(list)
      .filter((item) => workspaces.get(item.workspaceId)?.open !== false)
      .map((item) => ({ ...item, workspace: workspaces.get(item.workspaceId)?.name ?? "" }));
    const { shown, counts } = inboxView(entries, { filter, search, cleared });
    const wide = !layout.compact && width >= WIDE;
    const open = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : null;

    // When the selected item leaves (answered, replied to, cleared), select the one in its place.
    const previous = useRef<readonly { id: string }[]>(shown);
    // Whether the selection is one the user picked. Wide screens select on their own; a narrow
    // screen opens the detail only for an item the user picked.
    const picked = useRef(false);
    const pick = (id: string) => {
      picked.current = true;
      setSelected(id);
    };
    const shownKey = shown.map((entry) => entry.id).join("|");
    useEffect(() => {
      const before = previous.current;
      previous.current = shown;
      if (wide) {
        const next = nextSelection(before, shown, selected);
        if (next !== selected) {
          picked.current = false;
          setSelected(next);
        }
        return;
      }
      // Narrow: an item that leaves closes its detail, and a selection the user did not pick (made
      // while the screen was wide) does not open over the list.
      if (selected && (!picked.current || !shown.some((entry) => entry.id === selected))) {
        picked.current = false;
        setSelected(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shownKey, wide]);
    const current = shown.find((entry) => entry.id === selected) ?? null;

    const clear = (targets: readonly Entry[]) => {
      // Every finished item still waiting, in open workspaces or not, so a workspace that reopens
      // keeps its cleared items cleared.
      const live = new Set([...list.values()].filter(canClear).map(clearKey));
      saveSettings(settings, { cleared: withCleared(stored.cleared, targets.map(clearKey), live) }, () => toast.error("Could not remember the cleared items on this device"));
    };
    const finishedShown = shown.filter(canClear);
    const group = stored.group;

    const sections: ReactNode[] = [];
    if (group === "reason") {
      for (const reason of ["permission", "failed", "finished"] as const) {
        const items = shown.filter((entry) => entry.reason === reason);
        if (!items.length) continue;
        sections.push(
          <View key={reason}>
            {filter === "all" ? <GroupHeading t={t} title={HEADINGS[reason]} count={items.length} color={reasonColor(t, reason)} /> : null}
            {items.map((entry) => (
              <InboxRow key={entry.id} entry={entry} t={t} list={list} selected={entry.id === selected} withWorkspace onPress={() => pick(entry.id)} />
            ))}
          </View>,
        );
      }
    } else {
      const byWorkspace = new Map<string, Entry[]>();
      for (const entry of shown) byWorkspace.set(entry.workspace || "Other", [...(byWorkspace.get(entry.workspace || "Other") ?? []), entry]);
      for (const [name, items] of byWorkspace) {
        sections.push(
          <View key={name}>
            <GroupHeading t={t} title={name} count={items.length} />
            {items.map((entry) => (
              <InboxRow key={entry.id} entry={entry} t={t} list={list} selected={entry.id === selected} withWorkspace={false} onPress={() => pick(entry.id)} />
            ))}
          </View>,
        );
      }
    }

    const toolbar = (
      <View style={{ gap: 8, paddingHorizontal: 10 }}>
        <Segmented<InboxFilter>
          t={t}
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${counts.all}` },
            { value: "permission", label: `Permission ${counts.permission}`, icon: "ShieldAlert", tone: counts.permission ? reasonColor(t, "permission") : undefined },
            { value: "failed", label: `Failed ${counts.failed}`, icon: "CircleX", tone: counts.failed ? reasonColor(t, "failed") : undefined },
            { value: "finished", label: `Finished ${counts.finished}`, icon: "CircleCheck", tone: counts.finished ? reasonColor(t, "finished") : undefined },
          ]}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Field t={t} value={search} onChangeText={setSearch} placeholder="Search chats and workspaces" icon="Search" plain accessibilityLabel="Search the Inbox" />
          </View>
          <IconButton t={t} icon={group === "reason" ? "FolderTree" : "Layers"} label={group === "reason" ? "Group by workspace" : "Group by status"} disabled={settings.saving} onPress={() => saveSettings(settings, { group: group === "reason" ? "workspace" : "reason" }, () => toast.error("Could not remember the grouping on this device"))} />
          {finishedShown.length ? <IconButton t={t} icon="CheckCheck" label={`Clear ${finishedShown.length} finished from the Inbox`} disabled={settings.saving} onPress={() => clear(finishedShown)} /> : null}
        </View>
      </View>
    );

    const listPane = (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 16 }}>
        {sections.length ? (
          sections
        ) : entries.length ? (
          <EmptyState t={t} icon="Search" title="Nothing matches" hint={search ? "Try other words, or show every status." : "Nothing with this status is waiting."} />
        ) : (
          <EmptyState t={t} icon="Inbox" title="All caught up" hint="Chats waiting for permission, failed chats and finished answers you have not seen show up here." />
        )}
      </ScrollView>
    );

    const detail = current ? (
      <Detail
        key={current.id}
        t={t}
        deps={deps}
        entry={current}
        list={list}
        onBack={wide ? null : () => setSelected(null)}
        onOpen={open ? () => open(current.id) : null}
        onClear={() => clear([current])}
        saving={settings.saving}
      />
    ) : null;

    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {!wide && detail ? (
          detail
        ) : (
          <>
            {wide ? (
              <View style={{ flex: 1, flexDirection: "row" }}>
                <View style={{ width: Math.min(420, Math.max(320, width * 0.38)), borderRightWidth: 1, borderRightColor: t.c.border, paddingTop: 10 }}>
                  {toolbar}
                  {listPane}
                </View>
                <View style={{ flex: 1 }}>{detail ?? <EmptyState t={t} icon="MousePointerClick" title={shown.length ? "Pick an item" : "Nothing selected"} hint="Its request, error or last answer shows here." />}</View>
              </View>
            ) : (
              <View style={{ flex: 1, gap: 4, paddingTop: 10 }}>
                {toolbar}
                {listPane}
              </View>
            )}
          </>
        )}
      </View>
    );
  }
}
