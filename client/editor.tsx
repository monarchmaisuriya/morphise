import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsAction,
  SettingsCard,
  SettingsSection,
  TextInput,
  copyText,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import { EMPTY_PROFILE, profileSettings } from "../shared/profile";
import { formatProfile, parseProfileText } from "../shared/profile-text";
import { STARTER_PROFILE } from "../shared/starter-profile";
import type { Problem } from "./reconciler";
import { type ProfileStore, type ValueStore, useValue } from "./profile-store";

const MONOSPACE = Platform.select({ ios: "Menlo", default: "monospace" });

interface EditorDeps {
  store: ProfileStore;
  problems: ValueStore<Problem[]>;
  reconnect(): void;
}

export function createProfileEditor({ store, problems, reconnect }: EditorDeps) {
  return function ProfileEditor({ theme, layout }: PluginSurfaceProps) {
    const settings = useSettings(profileSettings);
    const registrationProblems = useValue(problems);
    const connectionError = useValue(store).connectionError;
    const toast = useToast();
    const [draft, setDraft] = useState<string | null>(null);

    const savedText = settings.status === "ready" ? formatProfile(settings.values) : formatProfile(EMPTY_PROFILE);
    const text = draft ?? savedText;
    const parsed = useMemo(() => parseProfileText(text), [text]);

    const styles = useMemo(
      () => ({
        input: {
          minHeight: layout.compact ? 280 : 420,
          padding: 12,
          fontFamily: MONOSPACE,
          fontSize: 12,
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 8,
          textAlignVertical: "top" as const,
        },
        danger: { color: theme.colors.statusDanger, fontSize: 12 },
        warning: { color: theme.colors.statusWarning, fontSize: 12 },
        muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
        list: { gap: 4 },
      }),
      [theme, layout.compact],
    );

    if (settings.status === "loading") return <Loading />;
    if (settings.status === "error") {
      return (
        <SettingsSection title="Profile">
          <Text style={styles.danger}>Could not read the profile: {settings.error}</Text>
          <SettingsCard>
            <SettingsAction label="Try again" actionLabel="Retry" onPress={() => void settings.reload()} />
          </SettingsCard>
        </SettingsSection>
      );
    }

    async function save() {
      if (!parsed.ok || settings.status === "loading" || settings.status === "error") return;
      if (await settings.save(parsed.profile, settings.revision)) {
        setDraft(null);
        toast.show("Profile saved and applied", { variant: "success" });
      }
    }

    async function copy() {
      try {
        await copyText(text);
        toast.show("Profile copied", { variant: "success" });
      } catch {
        toast.error("Could not copy. Select the text and use Copy.");
      }
    }

    const profile = parsed.ok ? parsed.profile : null;
    return (
      <View style={styles.list}>
        {connectionError ? (
          <SettingsSection title="Live updates paused">
            <Text style={styles.warning}>
              {connectionError}. The last profile this app received stays applied; saved changes reach it after it
              reconnects.
            </Text>
            <SettingsCard>
              <SettingsAction label="Reopen the profile connection" actionLabel="Reconnect" onPress={reconnect} />
            </SettingsCard>
          </SettingsSection>
        ) : null}

        {settings.status === "invalid" ? (
          <SettingsSection title="Stored profile is invalid">
            <Text style={styles.danger}>{settings.error}</Text>
            <Text style={styles.muted}>Nothing is applied until a valid profile is saved.</Text>
          </SettingsSection>
        ) : null}

        <SettingsSection title="Profile" info="One JSON document describes every customisation. Saving applies it on every connected app.">
          <TextInput
            accessibilityLabel="Profile JSON"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            value={text}
            onChangeText={setDraft}
            style={styles.input}
          />
          <View style={styles.list}>
            {parsed.ok ? null : parsed.errors.map((error) => <Text key={error} style={styles.danger}>{error}</Text>)}
            {settings.saveError ? <Text style={styles.danger}>Save failed: {settings.saveError}</Text> : null}
            {profile?.style.enabled ? (
              <Text style={styles.warning}>
                The style layer is unsupported: it works on desktop and browser only, and any Paseo update can
                rename the test ids it hides.
              </Text>
            ) : null}
            {profile?.sidebar.view.enabled ? (
              <Text style={styles.muted}>To show the sidebar view, pick Morphise in Settings, Sidebar, Sidebar view.</Text>
            ) : null}
          </View>
        </SettingsSection>

        <SettingsSection title="Actions">
          <SettingsCard>
            <SettingsAction
              label="Save profile"
              hint={draft === null ? "No unsaved changes" : parsed.ok ? "Applies on every connected app" : "Fix the errors above first"}
              actionLabel={settings.saving ? "Saving" : "Save"}
              disabled={draft === null || !parsed.ok || settings.saving}
              onPress={() => void save()}
            />
            <SettingsAction label="Discard unsaved changes" actionLabel="Discard" disabled={draft === null} onPress={() => setDraft(null)} />
            <SettingsAction
              label="Load the starter profile"
              hint="An example of every section; review it, then save"
              actionLabel="Load"
              onPress={() => setDraft(formatProfile(STARTER_PROFILE))}
            />
            <SettingsAction
              label="Clear every customisation"
              hint="Loads an empty profile; save to apply"
              actionLabel="Clear"
              onPress={() => setDraft(formatProfile(EMPTY_PROFILE))}
            />
            <SettingsAction label="Copy the profile" actionLabel="Copy" onPress={() => void copy()} />
          </SettingsCard>
        </SettingsSection>

        {registrationProblems.length > 0 ? (
          <SettingsSection title="Not applied">
            {registrationProblems.map((problem) => (
              <Text key={problem.section} style={styles.warning}>
                {problem.section}: {problem.message}
              </Text>
            ))}
          </SettingsSection>
        ) : null}
      </View>
    );
  };
}
