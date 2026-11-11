import { settingsRpc } from "@getpaseo/plugin";
import { type PluginClientContext, openExternalUrl } from "@getpaseo/plugin/client";
import { type Directory, EMPTY_DIRECTORY, reduceAgents, reduceWorkspaces } from "./client/directory";
import { createProfileEditor } from "./client/editor";
import { connectStream } from "./client/profile-connection";
import { createProfileStore, createValueStore, layoutsOf, profileOf, promptsOf } from "./client/profile-store";
import { type Problem, createReconciler } from "./client/reconciler";
import { createDraftStore } from "./client/draft";
import { createFormScreen } from "./client/forms/fields";
import { ButtonsTab, ChatTab, CommandsTab, GeneralTab, LayoutsTab, LookTab, PromptsTab, SidebarTab } from "./client/forms/tabs";
import { type ActionDeps, EDITOR_SCREEN_ID, JSON_SCREEN_ID } from "./client/run-action";
import { createSections } from "./client/sections";
import { chimeWav } from "./client/chime";
import { type AttentionList, reduceAttention } from "./client/attention";
import { ANSWER_TAIL, bookmarkLastAnswer, createBookmarkStore, createBookmarkWriter } from "./client/bookmark-store";
import { type Chats, reduceChats } from "./client/chats";
import { reduceWorkspaceInfo, type WorkspaceList } from "./client/workspaces";
import { type AlertEntry, remindersOf, startReminderAlerts } from "./client/reminder-alerts";
import { legacyReminders } from "./client/reminders";
import { createTaskStore, createTaskWriter, tasksOf } from "./client/task-store";
import type { Announcement, SurfaceDeps } from "./client/task-surfaces";
import { isWindowVisible, showNotification } from "./client/web";
import { profileSettings } from "./shared/document";
import type { Profile } from "./shared/profile";
import { remindersKeeper } from "./shared/reminder-contracts";
import { REMINDER_KEY } from "./shared/reminders";
import { dueForArchive } from "./shared/auto-archive";
import { archiveOldDone, rulesForTransitions } from "./shared/rules";
import type { TaskOperation } from "./shared/task-ops";
import { bookmarkSettings } from "./shared/bookmarks";
import { taskSettings } from "./shared/tasks";
import { bookmarksWatch, profileWatch, tasksWatch } from "./shared/watch";

interface ListSubscription<Snapshot> {
  subscribe(observer: { snapshot(snapshot: Snapshot): void; update(message: { type: string; payload?: unknown }): void }): () => void;
  release(): Promise<void>;
}

export default function contribute(client: PluginClientContext) {
  const store = createProfileStore();
  const problems = createValueStore<Problem[]>([]);
  const taskStore = createTaskStore();
  const chats = createValueStore<Chats>(new Map());
  const attention = createValueStore<AttentionList>(new Map());
  const changeAttention = (change: Parameters<typeof reduceAttention>[1]) => {
    const next = reduceAttention(attention.get(), change);
    if (next !== attention.get()) attention.set(next);
  };
  const workspaceList = createValueStore<WorkspaceList>(new Map());
  const workspacesReady = createValueStore(false);
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
    const event = store.get().event;
    if (event?.status !== "ready") throw new Error("Morphise has not received its profile yet; try again in a moment");
    if (event.document.activeLayout === id) return;
    const result = await client.rpc(profileRpc.write, { revision: event.revision, values: { ...event.document, activeLayout: id } });
    if (result.status === "conflict") throw new Error("Another app saved the profile at the same moment; try again");
    if (result.status === "invalid") throw new Error(result.error);
  }
  // The sidebar view's own options menu changes the active layout's view settings, the same
  // document the settings screen edits. It reads the newest saved document and applies the change
  // to it, again when another app saved first, so quick taps and other apps' saves both survive.
  // Only the given keys are written; everything else stays as stored.
  async function updateView(patch: Partial<Profile["sidebar"]["view"]>) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await client.rpc(profileRpc.read, {});
      if (state.status !== "ready") throw new Error(`The saved profile is invalid: ${state.error}`);
      const document = state.values as { activeLayout?: string; layouts?: { id: string; profile?: Record<string, unknown> }[] };
      const layouts = (document.layouts ?? []).map((layout) => {
        if (layout.id !== document.activeLayout) return layout;
        const profile = layout.profile ?? {};
        const sidebar = (profile.sidebar ?? {}) as Record<string, unknown>;
        const view = (sidebar.view ?? {}) as Record<string, unknown>;
        return { ...layout, profile: { ...profile, sidebar: { ...sidebar, view: { ...view, ...patch } } } };
      });
      const result = await client.rpc(profileRpc.write, { revision: state.revision, values: { ...document, layouts } as typeof state.values });
      if (result.status === "saved") return;
      if (result.status === "invalid") throw new Error(result.error);
    }
    throw new Error("Other apps kept saving the profile at the same moment; try again");
  }
  const announcements = createValueStore<Announcement>({ seq: 0, entries: [] });
  let directory: Directory = EMPTY_DIRECTORY;
  let stopped = false;
  const releases: (() => unknown)[] = [];

  const deps: ActionDeps = {
    composers: (selector) => client.composers(selector),
    openSettings: (id) => client.openSettings(id),
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
    attention,
    bookmarks: bookmarkStore,
    applyBookmark,
    bookmarkLastAnswer: (agentId, workspaceId, note) => bookmarkLastAnswer(bookmarkCapture, agentId, workspaceId, note),
    announcements,
    updateView,
    reminderSettings: () => profileOf(store.get()).reminders,
  };
  const reconciler = createReconciler(createSections(client, deps, surfaces, switchLayout), (list) => problems.set(list));
  const apply = () =>
    reconciler.apply({
      profile: profileOf(store.get()),
      prompts: promptsOf(store.get()),
      layouts: layoutsOf(store.get()),
      directory,
      taskViews: tasksOf(taskStore.get()).views.map(({ id, name }) => ({ id, name })),
    });
  store.subscribe(apply);
  taskStore.subscribe(apply);

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
  // Auto-archive, when the view's rule is on: each app tries each due workspace once, and archiving
  // a workspace twice is harmless, so several open apps agree.
  const archiveTried = new Set<string>();
  const sweepWorkspaces = () => {
    const rule = profileOf(store.get()).sidebar.view.autoArchive;
    if (stopped || !rule || !workspacesReady.get()) return;
    const now = new Date();
    for (const workspace of workspaceList.get().values()) {
      if (archiveTried.has(workspace.id) || !dueForArchive(workspace, rule, now)) continue;
      archiveTried.add(workspace.id);
      client.paseo.workspaces.archive(workspace.id).then(
        (result) => {
          if (result.error) console.error(`[morphise] Could not auto-archive ${workspace.name}: ${result.error}`);
          else console.info(`[morphise] Auto-archived ${workspace.name}`);
        },
        (error: unknown) => console.error(`[morphise] Could not auto-archive ${workspace.name}`, error),
      );
    }
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
  const drafts = createDraftStore();
  const tabs = [
    { id: "layouts", title: "Layouts", icon: "Layers", Component: createFormScreen(drafts, LayoutsTab, { editsProfile: false }) },
    { id: "general", title: "General", icon: "SlidersHorizontal", Component: createFormScreen(drafts, GeneralTab, { editsProfile: true }) },
    { id: EDITOR_SCREEN_ID, title: "Sidebar", icon: "PanelLeft", Component: createFormScreen(drafts, SidebarTab, { editsProfile: true }) },
    { id: "chat", title: "Chat", icon: "MessageSquare", Component: createFormScreen(drafts, ChatTab, { editsProfile: true }) },
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

  // Gives the daemon a connection for writing reminder rows into chats. Like the profile stream,
  // Paseo does not reopen it after a daemon restart, so it is reopened on each workspace snapshot.
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

  // If the list cannot load, Paseo's own rows are all the view has, so it stops showing placeholders.
  const workspacesFailed = () => workspacesReady.set(true);
  watch("Workspace", client.paseo.workspaces.list({ subscribe: {} }), {
    snapshot: (snapshot) => {
      profile.reopen();
      taskStream.reopen();
      bookmarkStream.reopen();
      openKeeper();
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
      setDirectory({ ...directory, agents: reduceAgents(directory.agents, { snapshot: snapshot.entries }) });
    },
    update: (message) => {
      changeChats({ message });
      changeAttention({ message });
      const agents = reduceAgents(directory.agents, { message });
      if (agents !== directory.agents) setDirectory({ ...directory, agents });
    },
  });

  return () => {
    stopped = true;
    releases.forEach((release) => release());
    profile.stop();
    taskStream.stop();
    bookmarkStream.stop();
    reconciler.dispose();
  };
}
