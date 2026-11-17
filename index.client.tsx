import { settingsRpc } from "@getpaseo/plugin";
import type { z } from "zod";
import { type PluginClientContext, openExternalUrl } from "@getpaseo/plugin/client";
import { createArchiveSweep, listEveryWorkspace } from "./client/auto-archive-sweep";
import { type Directory, EMPTY_DIRECTORY, reduceAgents, reduceWorkspaces } from "./client/directory";
import { createProfileEditor } from "./client/editor";
import { connectStream } from "./client/profile-connection";
import { changeSavedProfile } from "./client/profile-writer";
import { onSaved, type ProjectGroups, projectGroupsSettings } from "./shared/project-groups";
import { removeProject as removeProjectRpc } from "./shared/project-actions";
import { createProfileStore, createValueStore, layoutsOf, profileOf, promptsOf } from "./client/profile-store";
import { type Problem, createReconciler } from "./client/reconciler";
import { createDraftStore } from "./client/draft";
import { createFormScreen } from "./client/forms/fields";
import { ButtonsTab, ChatTab, CommandsTab, GeneralTab, LayoutsTab, LookTab, PromptsTab, SidebarTab } from "./client/forms/tabs";
import { MessagesTab, PagesTab } from "./client/forms/polish-tabs";
import { AgentsBoardTab } from "./client/forms/agents-tab";
import { AGENTS_SETTINGS_TAB } from "./client/agents-board/board";
import { type ActionDeps, EDITOR_SCREEN_ID, JSON_SCREEN_ID } from "./client/run-action";
import { createRowActions, createSections } from "./client/sections";
import type { PolishContext } from "./client/polish/context";
import { followLocale } from "./client/polish/i18n";
import { registerMedia } from "./client/polish/media.register";
import { registerPages } from "./client/polish/pages.register";
import { registerSelection } from "./client/polish/selection.register";
import { registerWeb } from "./client/polish/web.register";
import { registerRun } from "./client/run/register";
import { chimeWav } from "./client/chime";
import { type AttentionList, reduceAttention } from "./client/attention";
import { ANSWER_TAIL, bookmarkLastAnswer, bookmarkPage, bookmarkPassage, createBookmarkStore, createBookmarkWriter } from "./client/bookmark-store";
import { type Chats, reduceChats } from "./client/chats";
import { reduceWorkspaceInfo, type WorkspaceList } from "./client/workspaces";
import { type AlertEntry, remindersOf, startReminderAlerts } from "./client/reminder-alerts";
import { legacyReminders } from "./client/reminders";
import { createTaskStore, createTaskWriter, tasksOf } from "./client/task-store";
import type { Announcement, SurfaceDeps } from "./client/task-surfaces";
import { nextLinkToken, taskLinkParams } from "./client/task-link";
import { WORKBENCH_SCREEN_ID } from "./client/workbench";
import { isWindowVisible, showNotification } from "./client/web";
import { type ProfileDocument, profileSettings } from "./shared/document";
import type { Profile } from "./shared/profile";
import { remindersKeeper } from "./shared/reminder-contracts";
import { startShow } from "./client/show";
import { REMINDER_KEY } from "./shared/reminders";
import { archiveOldDone, rulesForTransitions } from "./shared/rules";
import type { TaskOperation } from "./shared/task-ops";
import { bookmarkSettings } from "./shared/bookmarks";
import { taskSettings } from "./shared/tasks";
import { bookmarksWatch, profileWatch, type StatsEvent, statsWatch, tasksWatch } from "./shared/watch";

// The profile's stored values as the settings RPCs carry them: any JSON, checked by the host.
type SavedValues = z.core.util.JSONType;

interface ListSubscription<Snapshot> {
  subscribe(observer: { snapshot(snapshot: Snapshot): void; update(message: { type: string; payload?: unknown }): void }): () => void;
  release(): Promise<void>;
}

export default function contribute(client: PluginClientContext) {
  const store = createProfileStore();
  const problems = createValueStore<Problem[]>([]);
  // The session stats settings; on (and the strip off) until the daemon says otherwise.
  const statsStore = createValueStore<{ event: StatsEvent | null; connectionError: string | null }>({ event: null, connectionError: null });
  const statsOf = (event: StatsEvent | null) => (event?.status === "ready" ? event.document : { enabled: true, desktopStrip: false });
  const taskStore = createTaskStore();
  const chats = createValueStore<Chats>(new Map());
  const attention = createValueStore<AttentionList>(new Map());
  // False until the first agent snapshot (or the watch failing), so no one reads "nothing waits" from an empty list.
  const attentionReady = createValueStore(false);
  const changeAttention = (change: Parameters<typeof reduceAttention>[1]) => {
    const next = reduceAttention(attention.get(), change);
    if (next !== attention.get()) attention.set(next);
  };
  const workspaceList = createValueStore<WorkspaceList>(new Map());
  const workspacesReady = createValueStore(false);
  // This plugin's own host: the task document lives there, so its task links name that host's
  // workspaces and chats. Until it is known, nothing offers to link a task to a workspace or chat.
  const taskHost = createValueStore<string | null>(null);
  const changeWorkspaceList = (change: Parameters<typeof reduceWorkspaceInfo>[1]) => {
    const next = reduceWorkspaceInfo(workspaceList.get(), change);
    if (next !== workspaceList.get()) workspaceList.set(next);
  };
  const profileRpc = settingsRpc(profileSettings.id);
  const taskRpc = settingsRpc(taskSettings.id);
  const bookmarkRpc = settingsRpc(bookmarkSettings.id);
  const bookmarkStore = createBookmarkStore();
  const applyBookmark = createBookmarkWriter({
    read: () => client.rpc(bookmarkRpc.read, {}),
    write: (input) => client.rpc(bookmarkRpc.write, input),
  });
  const bookmarkCapture = {
    isRunning: (agentId: string) => chats.get().get(agentId)?.indicator === "running",
    readTail: (agentId: string) => client.paseo.agents.ref(agentId).timeline.refetch({ direction: "tail" as const, limit: ANSWER_TAIL }),
    chatTitle: (agentId: string) => chats.get().get(agentId)?.title ?? "Chat",
    apply: applyBookmark,
  };

  // Switching layout is one save of `activeLayout`, against the revision this app last received.
  async function switchLayout(id: string) {
    const lastReceived = {
      read: async () => {
        const event = store.get().event;
        if (event?.status !== "ready") throw new Error("Morphise has not received its profile yet; try again in a moment");
        return { status: "ready" as const, revision: event.revision, values: event.document };
      },
      write: (input: { revision: string; values: ProfileDocument }) => client.rpc(profileRpc.write, input),
    };
    await changeSavedProfile(lastReceived, (document) => (document.activeLayout === id ? null : { ...document, activeLayout: id }), 1);
  }
  const savedProfile = {
    read: () => client.rpc(profileRpc.read, {}),
    write: (input: { revision: string; values: SavedValues }) => client.rpc(profileRpc.write, input),
  };
  // The sidebar view's own options menu changes the active layout's view settings, the same
  // document the settings screen edits. It reads the newest saved document and applies the change
  // to it, again when another app saved first, so quick taps and other apps' saves both survive.
  // Only the given keys are written; everything else stays as stored.
  // The Command Center's chat toggles change the active layout's chat settings the same way:
  // on the newest saved document, again when another app saved first. A key set to undefined is
  // removed, so defaults are never written (older versions reject keys they do not know).
  async function updateChat(change: (chat: Record<string, unknown>) => void) {
    await changeSavedProfile(savedProfile, (values) => {
      const document = values as { activeLayout?: string; layouts?: { id: string; profile?: Record<string, unknown> }[] };
      const layouts = (document.layouts ?? []).map((layout) => {
        if (layout.id !== document.activeLayout) return layout;
        const profile = { ...(layout.profile ?? {}) };
        const chat = { ...((profile.chat ?? {}) as Record<string, unknown>) };
        change(chat);
        for (const key of Object.keys(chat)) if (chat[key] === undefined) delete chat[key];
        if (Object.keys(chat).length) profile.chat = chat;
        else delete profile.chat;
        return { ...layout, profile };
      });
      return { ...document, layouts } as SavedValues;
    }, 3);
  }
  // "Your groups": every change is applied to the newest saved groups, again when another app saved first.
  const groupsRpc = settingsRpc(projectGroupsSettings.id);
  const savedGroups = {
    read: () => client.rpc(groupsRpc.read, {}),
    write: (input: { revision: string; values: unknown }) => client.rpc(groupsRpc.write, input as never),
  };
  async function changeGroups(operation: (doc: ProjectGroups) => ProjectGroups) {
    await changeSavedProfile<unknown>(savedGroups, onSaved(operation), 3, "project groups");
  }
  async function updateView(patch: Partial<Profile["sidebar"]["view"]>) {
    await changeSavedProfile(savedProfile, (values) => {
      const document = values as { activeLayout?: string; layouts?: { id: string; profile?: Record<string, unknown> }[] };
      const layouts = (document.layouts ?? []).map((layout) => {
        if (layout.id !== document.activeLayout) return layout;
        const profile = layout.profile ?? {};
        const sidebar = (profile.sidebar ?? {}) as Record<string, unknown>;
        const view = (sidebar.view ?? {}) as Record<string, unknown>;
        return { ...layout, profile: { ...profile, sidebar: { ...sidebar, view: { ...view, ...patch } } } };
      });
      return { ...document, layouts } as SavedValues;
    }, 3);
  }
  const announcements = createValueStore<Announcement>({ seq: 0, entries: [] });
  let directory: Directory = EMPTY_DIRECTORY;
  let stopped = false;
  const releases: (() => unknown)[] = [];

  // The settings tabs' shared draft (see the tabs below); made first, as opening the Sidebar tab sets which layout it edits.
  const drafts = createDraftStore();
  // The Sidebar tab edits the layout being edited, which can differ from the one shown; every way into it (the sidebar's
  // "All sidebar settings", an "Edit layout" action) is about the one shown, so it goes back to editing that.
  const openSettings = (id: string) => {
    if (id === EDITOR_SCREEN_ID) drafts.editActiveLayout();
    client.openSettings(id);
  };
  const deps: ActionDeps = {
    composers: (selector) => client.composers(selector),
    openSettings,
    openUrl: openExternalUrl,
  };
  // Every task change goes through this: operations re-applied on the newest saved list.
  const applyTasks = createTaskWriter({
    read: () => client.rpc(taskRpc.read, {}),
    write: (input) => client.rpc(taskRpc.write, input),
  });
  const surfaces: SurfaceDeps = {
    client,
    tasks: taskStore,
    apply: applyTasks,
    chats,
    workspaces: workspaceList,
    workspacesReady,
    taskHost,
    attention,
    attentionReady,
    bookmarks: bookmarkStore,
    applyBookmark,
    bookmarkLastAnswer: (agentId, workspaceId, note) => bookmarkLastAnswer(bookmarkCapture, agentId, workspaceId, note),
    announcements,
    updateView,
    changeGroups,
    removeProject: (projectId) => client.rpc(removeProjectRpc, { projectId }),
    updateChat,
    openSidebarSettings: () => openSettings(EDITOR_SCREEN_ID),
    openTask: (taskId) => client.openScreen({ screenId: WORKBENCH_SCREEN_ID, params: taskLinkParams(taskId, nextLinkToken()) }),
    reminderSettings: () => profileOf(store.get()).reminders,
  };
  const reconciler = createReconciler(createSections(client, deps, surfaces, switchLayout), (list) => problems.set(list));
  // The parts ported from Chat Polish and Quote (see NOTICE.md); each follows the profile's chat
  // settings through client/polish/prefs.ts, fed by the "chat.polish" section.
  const polish: PolishContext = {
    client,
    updateChat,
    bookmarkPassage: (input) => bookmarkPassage(bookmarkCapture, input),
    bookmarkPage: (input) => bookmarkPage(bookmarkCapture, input),
    rowActions: createRowActions(client, surfaces),
  };
  // Ported strings (chat rows, page restyle) follow Paseo's language: Chinese for zh-*, else English.
  const unfollowLocale = followLocale(client.i18n, () => {});
  const stopPolish = [registerSelection, registerWeb, registerMedia, registerPages].map((register) => register(polish));
  // /run and the run cards, ported from Shell Yeah (see NOTICE.md).
  const stopRun = registerRun(client);
  const apply = () =>
    reconciler.apply({
      profile: profileOf(store.get()),
      prompts: promptsOf(store.get()),
      layouts: layoutsOf(store.get()),
      directory,
      stats: statsOf(statsStore.get().event),
    });
  store.subscribe(apply);
  taskStore.subscribe(apply);
  statsStore.subscribe(apply);

  const profile = connectStream(
    (onEvent, onClosed) => client.subscribe(profileWatch, {}, onEvent, { onClosed: ({ error }) => onClosed(error) }),
    store,
  );
  const taskStream = connectStream(
    (onEvent, onClosed) => client.subscribe(tasksWatch, {}, onEvent, { onClosed: ({ error }) => onClosed(error) }),
    taskStore,
  );
  const bookmarkStream = connectStream(
    (onEvent, onClosed) => client.subscribe(bookmarksWatch, {}, onEvent, { onClosed: ({ error }) => onClosed(error) }),
    bookmarkStore,
  );
  const statsStream = connectStream(
    (onEvent, onClosed) => client.subscribe(statsWatch, {}, onEvent, { onClosed: ({ error }) => onClosed(error) }),
    statsStore,
  );

  // Automatic changes (rules, archiving, the 0.2 migration) are logged, not toasted: no one
  // pressed anything. Each is safe to repeat, so several open apps agree.
  const applyAutomatically = (what: string, operations: TaskOperation[]) => {
    if (operations.length === 0 || stopped) return Promise.resolve(true);
    return applyTasks(...operations).then(
      () => true,
      (error: unknown) => {
        console.error(`[morphise] Could not ${what}`, error);
        return false;
      },
    );
  };
  // Auto-archive, when the view's rule is on (client/auto-archive-sweep.ts).
  const sweep = createArchiveSweep({
    workspaces: () => workspaceList.get().values(),
    fetchWorkspaces: () => listEveryWorkspace((options) => client.paseo.workspaces.list(options)),
    archive: (id) => client.paseo.workspaces.archive(id),
    log: console,
  });
  const sweepWorkspaces = () => {
    const rule = profileOf(store.get()).sidebar.view.autoArchive;
    if (stopped || !rule || !workspacesReady.get()) return;
    void sweep(rule, new Date());
  };
  const sweepTimer = setInterval(sweepWorkspaces, 10 * 60_000);
  releases.push(() => clearInterval(sweepTimer));
  // Turning the rule on takes effect at once.
  releases.push(store.subscribe(sweepWorkspaces));
  let archiving = false;
  releases.push(
    taskStore.subscribe(() => {
      if (archiving || taskStore.get().event?.status !== "ready") return;
      const operations = archiveOldDone(tasksOf(taskStore.get()), new Date());
      if (operations.length === 0) return;
      archiving = true;
      void applyAutomatically("archive old Done cards", operations).finally(() => (archiving = false));
    }),
  );

  // Morphise 0.2 kept chat reminders on the chats; each becomes a follow-up task, then the old
  // value is cleared. Waits for the task list so the first save has a revision to write against.
  const migrated = new Set<string>();
  function migrateLegacy(entries: readonly { agent: unknown }[]) {
    if (taskStore.get().event?.status !== "ready") return;
    for (const legacy of legacyReminders(entries)) {
      if (migrated.has(legacy.agentId)) continue;
      migrated.add(legacy.agentId);
      void applyAutomatically("move a 0.2 reminder onto the board", [{ kind: "migrateChatReminder", ...legacy }]).then((moved) => {
        // A failed move is tried again with the next task change or reconnect.
        if (!moved) return void migrated.delete(legacy.agentId);
        return client.paseo.agents
          .ref(legacy.agentId)
          .setMetadata({ [REMINDER_KEY]: null })
          .catch((error: unknown) => console.error("[morphise] Could not clear a 0.2 reminder after moving it", error));
      });
    }
  }
  let lastAgentEntries: readonly { agent: unknown }[] = [];
  releases.push(taskStore.subscribe(() => migrateLegacy(lastAgentEntries)));

  // One tab per settings screen, in this order; every tab edits one shared draft.
  const tabs = [
    { id: "layouts", title: "Layouts", icon: "Layers", Component: createFormScreen(drafts, LayoutsTab, { editsProfile: false }) },
    { id: "general", title: "General", icon: "SlidersHorizontal", Component: createFormScreen(drafts, GeneralTab, { editsProfile: true }) },
    { id: EDITOR_SCREEN_ID, title: "Sidebar", icon: "PanelLeft", Component: createFormScreen(drafts, SidebarTab, { editsProfile: true }) },
    { id: AGENTS_SETTINGS_TAB, title: "Agents", icon: "SquareKanban", Component: createFormScreen(drafts, AgentsBoardTab, { editsProfile: false }) },
    { id: "chat", title: "Chat", icon: "MessageSquare", Component: createFormScreen(drafts, ChatTab, { editsProfile: true }) },
    { id: "messages", title: "Messages", icon: "TextQuote", Component: createFormScreen(drafts, MessagesTab, { editsProfile: true }) },
    { id: "pages", title: "Pages", icon: "AppWindow", Component: createFormScreen(drafts, PagesTab, { editsProfile: true }) },
    { id: "look", title: "Look", icon: "Palette", Component: createFormScreen(drafts, LookTab, { editsProfile: true }) },
    { id: "buttons", title: "Buttons", icon: "MousePointerClick", Component: createFormScreen(drafts, ButtonsTab, { editsProfile: true }) },
    { id: "commands", title: "Commands", icon: "Command", Component: createFormScreen(drafts, CommandsTab, { editsProfile: true }) },
    { id: "prompts", title: "Prompts", icon: "Library", Component: createFormScreen(drafts, PromptsTab, { editsProfile: false }) },
    {
      id: JSON_SCREEN_ID,
      title: "Advanced",
      icon: "Braces",
      Component: createProfileEditor({ store, problems, drafts, reconnect: () => profile.reopen() }),
    },
  ];
  for (const tab of tabs) releases.push(client.addSettingsScreen(tab));

  // Owned list subscriptions send a snapshot when they start and again after every reconnect.
  function watch<Snapshot>(
    name: string,
    list: Promise<{ subscription: ListSubscription<Snapshot> }>,
    observer: { snapshot(snapshot: Snapshot): void; update(message: { type: string; payload?: unknown }): void },
    onFailed?: () => void,
  ) {
    list
      .then(({ subscription }) => {
        // Subscribing delivers the cached snapshot at once, so a stopped plugin must not subscribe.
        if (stopped) return void subscription.release();
        const stopObserving = subscription.subscribe(observer);
        const release = () => {
          stopObserving();
          void subscription.release();
        };
        releases.push(release);
      })
      .catch((error: unknown) => {
        if (stopped) return;
        console.error(`[morphise] ${name} watch failed; buttons and live updates may be missing`, error);
        onFailed?.();
      });
  }

  const setDirectory = (next: Directory) => {
    if (next === directory) return;
    directory = next;
    apply();
  };

  const changeChats = (change: Parameters<typeof reduceChats>[1]) => {
    const { chats: next, transitions } = reduceChats(chats.get(), change);
    if (next !== chats.get()) chats.set(next);
    if (transitions.length) void applyAutomatically("run a task rule", rulesForTransitions(tasksOf(taskStore.get()), transitions));
  };

  // Gives the daemon a connection for writing reminder rows into chats. Reopened on each workspace
  // snapshot like the profile stream: Paseo re-subscribes after a reconnect, but not a stream the
  // daemon closed or whose re-subscribe failed (client/profile-connection.ts).
  let releaseKeeper: (() => void) | null = null;
  const openKeeper = () => {
    releaseKeeper?.();
    const handle = client.subscribe(remindersKeeper, {}, () => {}, {
      onClosed: ({ error }) => {
        if (error && !stopped) console.error("[morphise] Reminder keeper closed; chat rows wait for the next reconnect", error);
      },
    });
    handle.ready.catch(() => {});
    releaseKeeper = handle;
  };
  releases.push(() => releaseKeeper?.());
  // "Show in Paseo": this window runs the requests agents send it (client/show.ts); reopened with the keeper.
  const show = startShow(client);
  releases.push(() => show.stop());

  const alertSource = {
    get: (): AlertEntry[] => remindersOf(tasksOf(taskStore.get())),
    subscribe: (listener: () => void) => taskStore.subscribe(listener),
  };
  releases.push(
    startReminderAlerts(alertSource, {
      chime() {
        if (!profileOf(store.get()).reminders.sound || !isWindowVisible()) return;
        client.playAudio({ base64: chimeWav(), mimeType: "audio/wav" }).catch((error: unknown) => console.error("[morphise] Could not play the reminder chime", error));
      },
      notify(entry) {
        if (!profileOf(store.get()).reminders.desktopNotification) return;
        showNotification(`Reminder: ${entry.title}`, entry.reminder.note ?? "You asked to come back to this", `${entry.taskId}:${entry.reminder.setAt}`);
      },
      announce(entries) {
        announcements.set({ seq: announcements.get().seq + 1, entries });
      },
    }),
  );

  // Read with the first workspace snapshot, and again after a reconnect until it succeeds.
  const readTaskHost = () => {
    if (taskHost.get() !== null) return;
    client.paseo.hosts.list().then(
      (directory) => {
        if (!stopped) taskHost.set(directory.self.serverId);
      },
      (error: unknown) => console.error("[morphise] Could not read this host's id; Add task and Remind me stay off for workspaces and chats", error),
    );
  };
  // If the list cannot load, Paseo's own rows are all the view has, so it stops showing placeholders.
  const workspacesFailed = () => workspacesReady.set(true);
  watch("Workspace", client.paseo.workspaces.list({ subscribe: {} }), {
    snapshot: (snapshot) => {
      profile.reopen();
      taskStream.reopen();
      bookmarkStream.reopen();
      statsStream.reopen();
      openKeeper();
      show.reopen();
      readTaskHost();
      changeWorkspaceList({ snapshot: snapshot.entries });
      workspacesReady.set(true);
      sweepWorkspaces();
      setDirectory({ ...directory, workspaces: reduceWorkspaces(directory.workspaces, { snapshot: snapshot.entries }) });
    },
    update: (message) => {
      changeWorkspaceList({ message });
      const workspaces = reduceWorkspaces(directory.workspaces, { message });
      if (workspaces !== directory.workspaces) setDirectory({ ...directory, workspaces });
    },
  }, workspacesFailed);

  watch("Agent", client.paseo.agents.list({ subscribe: {} }), {
    snapshot: (snapshot) => {
      lastAgentEntries = snapshot.entries;
      migrateLegacy(snapshot.entries);
      changeChats({ snapshot: snapshot.entries });
      changeAttention({ snapshot: snapshot.entries });
      attentionReady.set(true);
      setDirectory({ ...directory, agents: reduceAgents(directory.agents, { snapshot: snapshot.entries }) });
    },
    update: (message) => {
      changeChats({ message });
      changeAttention({ message });
      const agents = reduceAgents(directory.agents, { message });
      if (agents !== directory.agents) setDirectory({ ...directory, agents });
    },
  }, () => attentionReady.set(true));

  return () => {
    stopped = true;
    releases.forEach((release) => release());
    profile.stop();
    taskStream.stop();
    bookmarkStream.stop();
    statsStream.stop();
    reconciler.dispose();
    stopPolish.forEach((stop) => stop());
    stopRun();
    unfollowLocale();
  };
}
