import { type PluginClientContext, openExternalUrl } from "@getpaseo/plugin/client";
import { type Directory, EMPTY_DIRECTORY, reduceAgents, reduceWorkspaces } from "./client/directory";
import { createProfileEditor } from "./client/editor";
import { connectProfile } from "./client/profile-connection";
import { createProfileStore, createValueStore, profileOf } from "./client/profile-store";
import { type Problem, createReconciler } from "./client/reconciler";
import { type ActionDeps, EDITOR_SCREEN_ID } from "./client/run-action";
import { createSections } from "./client/sections";
import { profileWatch } from "./shared/watch";

interface ListSubscription<Snapshot> {
  subscribe(observer: { snapshot(snapshot: Snapshot): void; update(message: { type: string; payload?: unknown }): void }): () => void;
  release(): Promise<void>;
}

export default function contribute(client: PluginClientContext) {
  const store = createProfileStore();
  const problems = createValueStore<Problem[]>([]);
  let directory: Directory = EMPTY_DIRECTORY;
  let stopped = false;
  const releases: (() => unknown)[] = [];

  const deps: ActionDeps = {
    composers: (selector) => client.composers(selector),
    openSettings: (id) => client.openSettings(id),
    openUrl: openExternalUrl,
  };
  const reconciler = createReconciler(createSections(client, deps), (list) => problems.set(list));
  const apply = () => reconciler.apply({ profile: profileOf(store.get()), directory });
  store.subscribe(apply);

  const profile = connectProfile(
    (onEvent, onClosed) => client.subscribe(profileWatch, {}, onEvent, { onClosed: ({ error }) => onClosed(error) }),
    store,
  );

  releases.push(
    client.addSettingsScreen({
      id: EDITOR_SCREEN_ID,
      title: "Profile",
      icon: "Palette",
      Component: createProfileEditor({ store, problems, reconnect: () => profile.reopen() }),
    }),
  );

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

  watch("Workspace", client.paseo.workspaces.list({ subscribe: {} }), {
    snapshot: (snapshot) => {
      profile.reopen();
      setDirectory({ ...directory, workspaces: reduceWorkspaces(directory.workspaces, { snapshot: snapshot.entries }) });
    },
    update: (message) => {
      const workspaces = reduceWorkspaces(directory.workspaces, { message });
      if (workspaces !== directory.workspaces) setDirectory({ ...directory, workspaces });
    },
  });

  watch("Agent", client.paseo.agents.list({ subscribe: {} }), {
    snapshot: (snapshot) => setDirectory({ ...directory, agents: reduceAgents(directory.agents, { snapshot: snapshot.entries }) }),
    update: (message) => {
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
