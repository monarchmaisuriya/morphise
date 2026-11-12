import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, type TextStyle, View } from "react-native";
import {
  agentsBoardSettings,
  assignLanes,
  type BoardAgent,
  type BoardFilter,
  compareAgents,
  DEFAULT_AGENTS_BOARD,
  effectiveCard,
  filterGroups,
  type FilterGroup,
  indicatorOf,
  type Lane,
  LANES,
  type LaneWidth,
  matchesFilter,
  moveFocus,
  NO_FILTER,
  readBoardAgent,
  SORT_KEYS,
  type SortKey,
} from "../../shared/agents-board";
import { summarizePermission } from "../../shared/inbox";
import { type ValueStore, useValue } from "../profile-store";
import { Dropdown, Icon, IconButton, MenuItem, PopoverHost, type Tokens, useTokens } from "../ui/kit";
import type { WorkspaceList } from "../workspaces";
import { AgentCard, type CardButtons, type CardFacts } from "./card";
import { type CliActions, useAgentEntries, useCardLive, useCliActions } from "./data";
import { AgentDetails } from "./details";
import { observeOnScreen, onBoardKeys } from "./web";

// The Workbench's Agents view: every agent on the host in lanes by status (Waiting, Running, To
// review, Done, Archived), with filters, search, sort, keys on the web, and a details pane. It
// subscribes to Paseo's agent list only while it is open.

export const AGENTS_SETTINGS_TAB = "agents";

const LANE_TITLES: Record<Lane, string> = { waiting: "Waiting", running: "Running", review: "To review", done: "Done", archived: "Archived" };
const LANE_PX: Record<LaneWidth, number> = { narrow: 270, default: 320, wide: 380 };
const SORT_TITLES: Record<SortKey, string> = { updated: "Updated", created: "Created", title: "Title", workspace: "Workspace", project: "Project", branch: "Branch", folder: "Folder", context: "Context", duration: "Duration" };
// A lane draws this many cards, then a button for the next ones.
const PAGE = 50;
// From this width the details sit beside the lanes; below it they take the board's place.
const SIDE_DETAILS_FROM = 1020;
const DETAILS_WIDTH = 380;
const WEB_NO_OUTLINE: unknown = { outlineWidth: 0 };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function FilterMenu({ t, label, icon, groups, picked, onChange }: { t: Tokens; label: string; icon: string; groups: readonly FilterGroup[]; picked: readonly string[]; onChange(next: string[]): void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);
  if (!groups.length && !picked.length) return null;
  const toggle = (value: string) => onChange(picked.includes(value) ? picked.filter((item) => item !== value) : [...picked, value]);
  return (
    <View ref={anchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} filter${picked.length ? `, ${picked.length} picked` : ""}`}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, height: t.control, paddingHorizontal: 10, borderRadius: t.radius.control, borderWidth: 1, borderColor: picked.length ? t.c.accent : t.c.border, backgroundColor: t.c.surface1 }}
      >
        <Icon name={icon} size={13} color={t.c.foregroundMuted} />
        <Text style={{ fontSize: 12, color: t.c.foreground }}>{picked.length ? `${label} · ${picked.length}` : label}</Text>
      </Pressable>
      <Dropdown t={t} open={open} onClose={() => setOpen(false)} anchor={anchor} width={260}>
        {groups.map((group) => (
          <MenuItem key={group.value} t={t} role="checkbox" label={group.label} hint={String(group.count)} checked={picked.includes(group.value)} onPress={() => toggle(group.value)} />
        ))}
      </Dropdown>
    </View>
  );
}

function SortMenu({ t, sort, onChange }: { t: Tokens; sort: SortKey; onChange(sort: SortKey): void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);
  return (
    <View ref={anchor}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${SORT_TITLES[sort]}. Change`} onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: t.control, paddingHorizontal: 10, borderRadius: t.radius.control, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
        <Icon name="ArrowDownWideNarrow" size={13} color={t.c.foregroundMuted} />
        <Text style={{ fontSize: 12, color: t.c.foreground }}>{SORT_TITLES[sort]}</Text>
      </Pressable>
      <Dropdown t={t} open={open} onClose={() => setOpen(false)} anchor={anchor} width={200}>
        {SORT_KEYS.map((key) => (
          <MenuItem key={key} t={t} role="radio" label={SORT_TITLES[key]} checked={key === sort} onPress={() => (setOpen(false), onChange(key))} />
        ))}
      </Dropdown>
    </View>
  );
}

// A card on the board: reads its usage and plan while it is on screen, and owns its menu.
function BoardCard({ t, client, facts, card, now, selected, focused, buttons, onPress, onOpen }: { t: Tokens; client: PluginClientContext; facts: CardFacts; card: ReturnType<typeof effectiveCard>; now: Date; selected: boolean; focused: boolean; buttons: CardButtons; onPress(): void; onOpen: (() => void) | null }) {
  const toast = useToast();
  const { agent, indicator } = facts;
  const [onScreen, setOnScreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const anchor = useRef<View>(null);
  const watch = useRef<() => void>(() => {});
  useEffect(() => () => watch.current(), []);
  const onScreenRef = useCallback((node: unknown) => {
    watch.current();
    watch.current = observeOnScreen(node, setOnScreen);
  }, []);
  const live = useCardLive(client, { id: agent.id, updatedAt: agent.updatedAt, running: indicator === "running", archived: !!agent.archivedAt }, { onScreen, usage: card.context, plan: card.plan });
  const copy = (what: string, value: string) => {
    setMenuOpen(false);
    void copyText(value).then(() => toast.show(`Copied the ${what}`), (error: unknown) => toast.error(message(error)));
  };
  const openMenu = useCallback(() => setMenuOpen(true), []);
  return (
    <View ref={anchor}>
      <AgentCard t={t} facts={facts} card={card} now={now} live={live} selected={selected} focused={focused} buttons={buttons} onPress={onPress} onMenu={openMenu} onScreenRef={onScreenRef} />
      <Dropdown t={t} open={menuOpen} onClose={() => setMenuOpen(false)} anchor={anchor} width={240}>
        {onOpen ? <MenuItem t={t} icon="MessageSquare" label="Open chat" onPress={() => (setMenuOpen(false), onOpen())} /> : null}
        {agent.sessionId ? <MenuItem t={t} icon="Fingerprint" label="Copy session ID" onPress={() => copy("session ID", agent.sessionId as string)} /> : null}
        <MenuItem t={t} icon="Type" label="Copy title" onPress={() => copy("title", agent.title)} />
        {agent.workspace ? <MenuItem t={t} icon="LayoutGrid" label="Copy workspace" onPress={() => copy("workspace", agent.workspace as string)} /> : null}
        {agent.project ? <MenuItem t={t} icon="FolderGit2" label="Copy project" onPress={() => copy("project", agent.project as string)} /> : null}
      </Dropdown>
    </View>
  );
}

export function AgentsBoardView({ client, workspaces, theme, compact, navigation }: { client: PluginClientContext; workspaces: ValueStore<WorkspaceList>; theme: PluginTheme; compact: boolean; navigation: PluginScreenProps["navigation"] }) {
  const t = useTokens(theme, compact);
  const toast = useToast();
  const stored = useSettings(agentsBoardSettings);
  const settings = stored.status === "ready" ? stored.values : DEFAULT_AGENTS_BOARD;
  const card = effectiveCard(settings, compact);
  const list = useAgentEntries(client);
  const workspaceList = useValue(workspaces);
  const cli: CliActions = useCliActions(client);
  const now = useNow(30_000);
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER);
  const [sort, setSort] = useState<SortKey>("updated");
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [phoneLane, setPhoneLane] = useState<Lane>("waiting");
  const [shown, setShown] = useState<Partial<Record<Lane, number>>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [width, setWidth] = useState(0);
  const root = useRef<View>(null);
  const search = useRef<TextInput>(null);

  const agents = useMemo(() => {
    if (list.status !== "ready") return [];
    const workspaceOf = (id: string) => {
      const info = workspaceList.get(id);
      return info ? { name: info.name, project: info.project, labels: info.labels } : undefined;
    };
    return [...list.entries.values()].flatMap((entry) => readBoardAgent(entry, workspaceOf) ?? []);
  }, [list, workspaceList]);
  const byId = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, BoardAgent[]>();
    for (const agent of agents) if (agent.parentId && !agent.archivedAt) map.set(agent.parentId, [...(map.get(agent.parentId) ?? []), agent]);
    return map;
  }, [agents]);
  const allLanes = useMemo(() => assignLanes(agents, { now: now.getTime(), doneWindow: settings.board.doneWindow, showArchived: settings.board.showArchived, showSubtasks: settings.board.showSubtasks }), [agents, now, settings.board]);
  const onBoard = useMemo(() => LANES.flatMap((lane) => allLanes[lane]), [allLanes]);
  const laneById = useMemo(() => new Map(LANES.flatMap((lane) => allLanes[lane].map((agent) => [agent.id, lane] as const))), [allLanes]);
  const lanes = useMemo(() => {
    const order = compareAgents(sort, now.getTime());
    return Object.fromEntries(LANES.map((lane) => [lane, allLanes[lane].filter((agent) => matchesFilter(agent, filter)).sort(order)])) as Record<Lane, BoardAgent[]>;
  }, [allLanes, filter, sort, now]);
  const laneList = LANES.filter((lane) => lane !== "archived" || settings.board.showArchived);
  const groups = useMemo(() => {
    const open = [...workspaceList.values()].filter((workspace) => workspace.open);
    const known = { labels: [...new Set(open.flatMap((workspace) => workspace.labels))], projects: [...new Set(open.map((workspace) => workspace.project).filter(Boolean))], workspaces: open.map((workspace) => ({ id: workspace.id, name: workspace.name })) };
    return filterGroups(onBoard, known, settings.board.showEmptyGroups);
  }, [onBoard, workspaceList, settings.board.showEmptyGroups]);

  const sideDetails = !compact && width >= SIDE_DETAILS_FROM;
  const visibleLanes = compact ? [phoneLane] : laneList;
  const openChat = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : null;

  const run = (agentId: string, what: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy((current) => new Set(current).add(agentId));
    void action()
      .then((result) => !result.ok && toast.error(`Could not ${what}: ${result.error}`))
      .finally(() =>
        setBusy((current) => {
          const next = new Set(current);
          next.delete(agentId);
          return next;
        }),
      );
  };
  const archive = (agent: BoardAgent) =>
    run(agent.id, `archive ${agent.title}`, () =>
      client.paseo.agents
        .ref(agent.id)
        .archive()
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error: message(error) }),
        ),
    );
  const stop = (agent: BoardAgent) => run(agent.id, `stop ${agent.title}`, () => cli.stop(agent.id));
  const answer = (agent: BoardAgent, behavior: "allow" | "deny") => {
    const request = summarizePermission(agent.pendingPermissions[agent.pendingPermissions.length - 1]);
    if (!request) return;
    const choice = request.choices.find((item) => item.behavior === behavior);
    run(agent.id, `answer ${agent.title}`, () =>
      client.paseo.agents
        .ref(agent.id)
        .respondToPermission({ requestId: request.id, response: { behavior, selectedActionId: choice?.id } })
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error: message(error) }),
        ),
    );
  };

  const factsOf = (agent: BoardAgent): CardFacts => {
    const workspace = agent.workspaceId ? workspaceList.get(agent.workspaceId) : undefined;
    const children = childrenOf.get(agent.id) ?? [];
    const indicators = children.map(indicatorOf);
    return {
      agent,
      indicator: indicatorOf(agent),
      git: workspace ? { dirty: workspace.dirty, ahead: workspace.ahead, behind: workspace.behind } : null,
      pullRequest: workspace?.pullRequest ? { number: workspace.pullRequest.number, state: workspace.pullRequest.state } : null,
      subtasks: children.length ? { total: children.length, running: indicators.filter((item) => item === "running").length, waiting: indicators.filter((item) => item === "needs_input").length, failed: indicators.filter((item) => item === "failed").length } : null,
      parent: agent.parentId ? byId.get(agent.parentId)?.title ?? null : null,
    };
  };
  const canStop = (agent: BoardAgent) => cli.available && !agent.archivedAt && ["running", "needs_input"].includes(indicatorOf(agent));
  const canArchive = (agent: BoardAgent) => {
    const lane = laneById.get(agent.id);
    return !agent.archivedAt && (lane === "review" || lane === "done");
  };
  const buttonsOf = (agent: BoardAgent): CardButtons => {
    const request = indicatorOf(agent) === "needs_input" ? summarizePermission(agent.pendingPermissions[agent.pendingPermissions.length - 1]) : null;
    const answerable = request !== null && !request.answerInChat;
    return {
      busy: busy.has(agent.id),
      open: openChat ? () => openChat(agent.id) : undefined,
      allow: answerable ? () => answer(agent, "allow") : undefined,
      deny: answerable ? () => answer(agent, "deny") : undefined,
      stop: canStop(agent) ? () => stop(agent) : undefined,
      archive: canArchive(agent) ? () => archive(agent) : undefined,
    };
  };

  // A chosen card that leaves the board closes its details.
  const current = selected ? byId.get(selected) ?? null : null;
  useEffect(() => {
    if (selected && !current) setSelected(null);
  }, [selected, current]);

  // The keys read the board as last drawn: the cards each shown lane lists, and the focus.
  const keyState = useRef<{ lanes: string[][]; focused: string | null; selected: string | null }>({ lanes: [], focused: null, selected: null });
  keyState.current = { lanes: visibleLanes.map((lane) => lanes[lane].slice(0, shown[lane] ?? PAGE).map((agent) => agent.id)), focused, selected };
  const openRef = useRef(openChat);
  openRef.current = openChat;
  useEffect(
    () =>
      onBoardKeys(
        () => root.current,
        (key) => {
          const state = keyState.current;
          if (key === "search") return search.current?.focus(), true;
          if (key === "back") {
            if (search.current?.isFocused()) return search.current.blur(), true;
            if (state.selected) return setSelected(null), true;
            if (state.focused) return setFocused(null), true;
            return false;
          }
          if (key === "open") {
            if (!state.focused) return false;
            if (openRef.current) openRef.current(state.focused);
            else setSelected(state.focused);
            return true;
          }
          const next = moveFocus(state.lanes, state.focused, key);
          if (next === null) return false;
          setFocused(next);
          if (state.selected) setSelected(next);
          return true;
        },
      ),
    [],
  );

  const toolbar = (
    <View style={{ gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: t.control, paddingHorizontal: 10, borderRadius: t.radius.control, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
          <Icon name="Search" size={14} color={t.c.foregroundMuted} />
          <TextInput
            ref={search}
            value={filter.search}
            onChangeText={(text) => setFilter({ ...filter, search: text })}
            placeholder={Platform.OS === "web" ? "Search titles, projects, workspaces, branches  /" : "Search agents"}
            placeholderTextColor={t.c.foregroundMuted}
            accessibilityLabel="Search agents"
            autoCapitalize="none"
            autoCorrect={false}
            style={[{ flex: 1, minWidth: 0, color: t.c.foreground, fontSize: t.compact ? 15 : 13, height: t.control - 2 }, Platform.OS === "web" ? (WEB_NO_OUTLINE as TextStyle) : null]}
          />
        </View>
        <IconButton t={t} icon="Settings2" label="Agents view settings" onPress={() => client.openSettings(AGENTS_SETTINGS_TAB)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
        <FilterMenu t={t} label="Agent" icon="Bot" groups={groups.providers} picked={filter.providers} onChange={(providers) => setFilter({ ...filter, providers })} />
        <FilterMenu t={t} label="Label" icon="Tag" groups={groups.labels} picked={filter.labels} onChange={(labels) => setFilter({ ...filter, labels })} />
        <FilterMenu t={t} label="Project" icon="FolderGit2" groups={groups.projects} picked={filter.projects} onChange={(projects) => setFilter({ ...filter, projects })} />
        <FilterMenu t={t} label="Workspace" icon="LayoutGrid" groups={groups.workspaces} picked={filter.workspaces} onChange={(picked) => setFilter({ ...filter, workspaces: picked })} />
        <SortMenu t={t} sort={sort} onChange={setSort} />
        {JSON.stringify(filter) !== JSON.stringify(NO_FILTER) ? <IconButton t={t} icon="FilterX" label="Clear the search and filters" onPress={() => setFilter(NO_FILTER)} /> : null}
      </ScrollView>
      {compact ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} accessibilityRole="tablist">
          {laneList.map((lane) => (
            <Pressable key={lane} accessibilityRole="tab" accessibilityState={{ selected: lane === phoneLane }} accessibilityLabel={`${LANE_TITLES[lane]}, ${lanes[lane].length}`} onPress={() => setPhoneLane(lane)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: t.control, paddingHorizontal: 10, borderRadius: t.radius.control, backgroundColor: lane === phoneLane ? t.c.surface2 : "transparent" }}>
              <Text style={{ fontSize: 13, color: lane === phoneLane ? t.c.foreground : t.c.foregroundMuted, fontWeight: lane === phoneLane ? "600" : "400" }}>{LANE_TITLES[lane]}</Text>
              <Text style={t.text.small}>{lanes[lane].length}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const laneView = (lane: Lane) => {
    const cards = lanes[lane];
    const limit = shown[lane] ?? PAGE;
    return (
      <View key={lane} style={{ width: compact ? undefined : LANE_PX[settings.board.laneWidth], flex: compact ? 1 : undefined, gap: 8 }}>
        {compact ? null : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
            <Text style={t.text.heading}>{LANE_TITLES[lane]}</Text>
            <Text style={t.text.meta}>{cards.length}</Text>
          </View>
        )}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
          {cards.length ? null : <Text style={[t.text.meta, { paddingHorizontal: 4 }]}>No agents</Text>}
          {cards.slice(0, limit).map((agent) => (
            <BoardCard
              key={agent.id}
              t={t}
              client={client}
              facts={factsOf(agent)}
              card={card}
              now={now}
              selected={agent.id === selected}
              focused={agent.id === focused}
              buttons={buttonsOf(agent)}
              onPress={() => {
                setFocused(agent.id);
                setSelected(agent.id);
              }}
              onOpen={openChat ? () => openChat(agent.id) : null}
            />
          ))}
          {cards.length > limit ? <Pressable accessibilityRole="button" onPress={() => setShown({ ...shown, [lane]: limit + PAGE })} style={{ padding: 8, alignItems: "center" }}><Text style={t.text.meta}>Show {Math.min(PAGE, cards.length - limit)} more</Text></Pressable> : null}
        </ScrollView>
      </View>
    );
  };

  const board =
    list.status === "loading" ? (
      <Text style={[t.text.meta, { padding: 16 }]}>Loading agents</Text>
    ) : list.status === "error" ? (
      <Text style={[t.text.danger, { padding: 16 }]}>Could not list the agents: {list.error}</Text>
    ) : compact ? (
      <View style={{ flex: 1, paddingHorizontal: 12 }}>{laneView(phoneLane)}</View>
    ) : (
      <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 12, paddingBottom: 8 }}>
        {laneList.map(laneView)}
      </ScrollView>
    );

  const details = current ? (
    <AgentDetails
      key={current.id}
      t={t}
      client={client}
      facts={factsOf(current)}
      subAgents={(childrenOf.get(current.id) ?? []).map((agent) => ({ agent, indicator: indicatorOf(agent) }))}
      parent={current.parentId ? byId.get(current.parentId) ?? null : null}
      cli={cli}
      now={now}
      onBack={sideDetails ? null : () => setSelected(null)}
      onOpen={openChat}
      onSelect={(agentId) => {
        setFocused(agentId);
        setSelected(agentId);
      }}
      onArchive={canArchive(current) ? () => archive(current) : null}
      onStop={canStop(current) ? () => stop(current) : null}
    />
  ) : null;

  return (
    <PopoverHost>
      <View ref={root} style={{ flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {details && !sideDetails ? (
          <View style={{ flex: 1 }}>{details}</View>
        ) : (
          <>
            <View style={{ flex: 1, minWidth: 0 }}>
              {toolbar}
              {board}
            </View>
            {details ? <View style={{ width: DETAILS_WIDTH, borderLeftWidth: 1, borderLeftColor: t.c.border }}>{details}</View> : null}
          </>
        )}
      </View>
    </PopoverHost>
  );
}
