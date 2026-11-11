import { settingsRpc } from "@getpaseo/plugin";
import { type PluginClientContext, openExternalUrl } from "@getpaseo/plugin/client";
import { type Directory, EMPTY_DIRECTORY, reduceAgents, reduceWorkspaces } from "./client/directory";
import { createProfileEditor } from "./client/editor";
import { connectProfile } from "./client/profile-connection";
import { createProfileStore, createValueStore, layoutsOf, profileOf, promptsOf } from "./client/profile-store";
import { type Problem, createReconciler } from "./client/reconciler";
import { createDraftStore } from "./client/draft";
import { createFormScreen } from "./client/forms/fields";
import { ButtonsTab, CommandsTab, LayoutsTab, LookTab, PromptsTab, SidebarTab } from "./client/forms/tabs";
import { type ActionDeps, EDITOR_SCREEN_ID, JSON_SCREEN_ID } from "./client/run-action";
import { createSections } from "./client/sections";
import { chimeWav } from "./client/chime";
import { reminderBody, startReminderAlerts } from "./client/reminder-alerts";
import type { Announcement } from "./client/reminder-surfaces";
import { reduceReminders, type Reminders } from "./client/reminders";
import { isWindowVisible, showNotification } from "./client/web";
import { profileSettings } from "./shared/document";
import { remindersKeeper } from "./shared/reminder-contracts";
import { profileWatch } from "./shared/watch";

interface ListSubscription<Snapshot> {
  subscribe(observer: { snapshot(snapshot: Snapshot): void; update(message: { type: string; payload?: unknown }): void }): () => void;
  release(): Promise<void>;
}

export default function contribute(client: PluginClientContext) {
  const store = createProfileStore();
  const problems = createValueStore<Problem[]>([]);
  const reminders = createValueStore<Reminders>(new Map());
  const profileRpc = settingsRpc(profileSettings.id);

  // Switching layout is one save of `activeLayout`, against the revision this app last received.
  async function switchLayout(id: string) {
    const event = store.get().event;
    if (event?.status !== "ready") throw new Error("Morphise has not received its profile yet; try again in a moment");
    if (event.document.activeLayout === id) return;
    const result = await client.rpc(profileRpc.write, { revision: event.revision, values: { ...event.document, activeLayout: id } });
    if (result.status === "conflict") throw new Error("Another app saved the profile at the same moment; try again");
    if (result.status === "invalid") throw new Error(result.error);
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
  const reconciler = createReconciler(createSections(client, deps, { client, reminders, announcements }, switchLayout), (list) => problems.set(list));
  const apply = () => reconciler.apply({ profile: profileOf(store.get()), prompts: promptsOf(store.get()), layouts: layoutsOf(store.get()), directory });
  store.subscribe(apply);

  const profile = connectProfile(
    (onEvent, onClosed) => client.subscribe(profileWatch, {}, onEvent, { onClosed: ({ error }) => onClosed(error) }),
    store,
  );

  // One tab per settings screen, in this order; every tab edits one shared draft.
  const drafts = createDraftStore();
  const tabs = [
    { id: "layouts", title: "Layouts", icon: "Layers", Component: createFormScreen(drafts, LayoutsTab, { editsProfile: false }) },
    { id: EDITOR_SCREEN_ID, title: "Sidebar", icon: "PanelLeft", Component: createFormScreen(drafts, SidebarTab, { editsProfile: true }) },
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
        if (!stopped) console.error(`[morphise] ${name} watch failed; buttons and live updates may be missing`, error);
      });
  }

  const setDirectory = (next: Directory) => {
    if (next === directory) return;
    directory = next;
    apply();
  };

  const setReminders = (next: Reminders) => {
    if (next !== reminders.get()) reminders.set(next);
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

  releases.push(
    startReminderAlerts(reminders, {
      chime() {
        if (!profileOf(store.get()).reminders.sound || !isWindowVisible()) return;
        client.playAudio({ base64: chimeWav(), mimeType: "audio/wav" }).catch((error: unknown) => console.error("[morphise] Could not play the reminder chime", error));
      },
      notify(entry) {
        if (!profileOf(store.get()).reminders.desktopNotification) return;
        const minutesAgo = Math.round((Date.parse(entry.reminder.at) - Date.parse(entry.reminder.setAt)) / 60_000);
        showNotification("Reminder", reminderBody(entry, minutesAgo), `${entry.agentId}:${entry.reminder.setAt}`);
      },
      announce(entries) {
        announcements.set({ seq: announcements.get().seq + 1, entries });
      },
    }),
  );

  watch("Workspace", client.paseo.workspaces.list({ subscribe: {} }), {
    snapshot: (snapshot) => {
      profile.reopen();
      openKeeper();
      setDirectory({ ...directory, workspaces: reduceWorkspaces(directory.workspaces, { snapshot: snapshot.entries }) });
    },
    update: (message) => {
      const workspaces = reduceWorkspaces(directory.workspaces, { message });
      if (workspaces !== directory.workspaces) setDirectory({ ...directory, workspaces });
    },
  });

  watch("Agent", client.paseo.agents.list({ subscribe: {} }), {
    snapshot: (snapshot) => {
      setReminders(reduceReminders(reminders.get(), { snapshot: snapshot.entries }));
      setDirectory({ ...directory, agents: reduceAgents(directory.agents, { snapshot: snapshot.entries }) });
    },
    update: (message) => {
      setReminders(reduceReminders(reminders.get(), { message }));
      const agents = reduceAgents(directory.agents, { message });
      if (agents !== directory.agents) setDirectory({ ...directory, agents });
    },
  });

  return () => {
    stopped = true;
    releases.forEach((release) => release());
    profile.stop();
    reconciler.dispose();
  };
}
