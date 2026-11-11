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
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { activeProfile, EMPTY_DOCUMENT, profileSettings } from "../shared/document";
import { formatDocument, parseDocumentText } from "../shared/document-text";
import { STARTER_DOCUMENT } from "../shared/starter-profile";
import type { DraftStore, Saved } from "./draft";
import type { Problem } from "./reconciler";
import { type ProfileStore, type ValueStore, useValue } from "./profile-store";

const MONOSPACE = Platform.select({ ios: "Menlo", default: "monospace" });

interface EditorDeps {
  store: ProfileStore;
  problems: ValueStore<Problem[]>;
  drafts: DraftStore;
  reconnect(): void;
}

// The Advanced tab: the whole settings document as JSON, editing the same draft as the forms.
export function createProfileEditor({ store, problems, drafts, reconnect }: EditorDeps) {
  return function ProfileEditor({ theme, layout }: PluginSurfaceProps) {
    const settings = useSettings(profileSettings);
    const registrationProblems = useValue(problems);
    const connectionError = useValue(store).connectionError;
    const draftState = useValue(drafts);
    const toast = useToast();
    // What is typed, kept while it is being edited so the text is not reformatted mid-typing.
    const [typed, setTyped] = useState<string | null>(null);
    // The draft document this editor last wrote; any other draft came from another tab.
    const written = useRef<unknown>(null);
    useEffect(() => setTyped(null), [draftState.generation]);
    useEffect(() => {
      if (draftState.draft && draftState.draft.document !== written.current) setTyped(null);
    }, [draftState.draft]);

    const saved: Saved | null = settings.status === "ready" ? { document: settings.values, revision: settings.revision } : null;
    const text = typed ?? formatDocument(saved ? drafts.working(saved) : EMPTY_DOCUMENT);
    const parsed = useMemo(() => parseDocumentText(text), [text]);

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

    // Typing valid JSON updates the shared draft; invalid text stays here with its errors.
    function change(next: string) {
      setTyped(next);
      const result = parseDocumentText(next);
      if (result.ok && saved) {
        drafts.replace(saved, result.document);
        written.current = drafts.get().draft?.document ?? null;
      }
    }
    const load = change;

    async function save() {
      const draft = drafts.get().draft;
      if (settings.status === "ready" && draft && parsed.ok) {
        if (await settings.save(draft.document, draft.revision)) {
          drafts.saved();
          setTyped(null);
          toast.show("Profile saved and applied", { variant: "success" });
        }
        return;
      }
      // A stored document that no longer validates can only be replaced as a whole.
      if (settings.status === "invalid" && parsed.ok && (await settings.save(parsed.document, settings.revision))) {
        setTyped(null);
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

    const dirty = draftState.draft !== null || (settings.status === "invalid" && typed !== null);
    const profile = parsed.ok ? activeProfile(parsed.document) : null;
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

        <SettingsSection title="Profile" info="Every layout and prompt as one JSON document; the other tabs edit the same changes.">
          <TextInput
            accessibilityLabel="Profile JSON"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            value={text}
            onChangeText={change}
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
          </View>
        </SettingsSection>

        <SettingsSection title="Actions">
          <SettingsCard>
            <SettingsAction
              label="Save profile"
              hint={!dirty ? "No unsaved changes" : parsed.ok ? "Applies on every connected app" : "Fix the errors above first"}
              actionLabel={settings.saving ? "Saving" : "Save"}
              disabled={!dirty || !parsed.ok || settings.saving}
              onPress={() => void save()}
            />
            <SettingsAction
              label="Discard unsaved changes"
              actionLabel="Discard"
              disabled={!dirty}
              onPress={() => {
                drafts.discard();
                setTyped(null);
              }}
            />
            <SettingsAction
              label="Load the starter profile"
              hint="An example of every section, with two prompts; review it, then save"
              actionLabel="Load"
              onPress={() => load(formatDocument(STARTER_DOCUMENT))}
            />
            <SettingsAction
              label="Clear every customisation"
              hint="Loads an empty profile; save to apply"
              actionLabel="Clear"
              onPress={() => load(formatDocument(EMPTY_DOCUMENT))}
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
