import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import { Loading, SettingsAction, SettingsCard, SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Icon, tokens } from "../ui/kit";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Action } from "../../shared/actions";
import { type ProfileDocument, profileSettings } from "../../shared/document";
import type { Profile } from "../../shared/profile";
import type { DraftStore, Saved } from "../draft";
import { useValue } from "../profile-store";
import { useAutoSave } from "./autosave";

type Theme = PluginSurfaceProps["theme"];

// Everything a form needs: the document being edited, how to change it, and its errors.
export interface Form {
  theme: Theme;
  compact: boolean;
  document: ProfileDocument;
  // The layout the profile tabs edit.
  layoutIndex: number;
  profile: Profile;
  updateDocument(change: (document: ProfileDocument) => void): void;
  updateProfile(change: (profile: Profile) => void): void;
  // The error for a path inside the edited profile, such as "sidebar.view.rowLimit.rows".
  profileError(path: string): string | null;
  documentError(path: string): string | null;
  // How many problems sit under a path; profile paths unless `inDocument`.
  errorCount(path: string, inDocument?: boolean): number;
  // Changes when inputs must re-read their value (discard, reload, another layout).
  inputKey: string;
}

export function TextField({
  form,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
}: {
  form: Form;
  label: string;
  value: string;
  onChange(text: string): void;
  error: string | null;
  hint?: string;
  placeholder?: string;
}) {
  return <SettingsInput key={`${form.inputKey}:${label}`} label={label} hint={hint} initialValue={value} onChangeText={onChange} error={error} placeholder={placeholder} />;
}

export function NumberField({ form, label, value, onChange, error, hint }: { form: Form; label: string; value: number; onChange(value: number): void; error: string | null; hint?: string }) {
  return (
    <TextField
      form={form}
      label={label}
      value={String(value)}
      // A non-number becomes NaN, which the schema reports beside the field.
      onChange={(text) => onChange(text.trim() === "" ? Number.NaN : Number(text))}
      error={error}
      hint={hint}
    />
  );
}

export function SwitchField({ label, value, onChange, hint, error }: { label: string; value: boolean; onChange(value: boolean): void; hint?: string; error?: string | null }) {
  return <SettingsSwitch label={label} hint={hint} value={value} onValueChange={onChange} error={error ?? null} />;
}

export function SelectField<Value extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: Value;
  options: readonly { label: string; value: Value }[];
  onChange(value: Value): void;
  hint?: string;
}) {
  return <SettingsSelect label={label} hint={hint} value={value} options={options} onValueChange={onChange} />;
}

// Add, edit, move and remove the items of one list.
export function ListEditor<Item>({
  form,
  title,
  info,
  items,
  onChange,
  itemLabel,
  create,
  renderItem,
  path,
  inDocument,
}: {
  form: Form;
  title: string;
  info?: string;
  items: readonly Item[];
  onChange(items: Item[]): void;
  itemLabel(item: Item, index: number): string;
  create(): Item;
  renderItem(item: Item, index: number, update: (change: (item: Item) => void) => void): ReactNode;
  // The list's path, for the problem count on each item.
  path: string;
  inDocument?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const styles = listStyles(form.theme);
  const replace = (index: number, change: (item: Item) => void) =>
    onChange(
      items.map((item, position) => {
        if (position !== index) return item;
        const next = JSON.parse(JSON.stringify(item)) as Item;
        change(next);
        return next;
      }),
    );
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setOpen(open === index ? target : open);
  };
  return (
    <SettingsSection title={title} info={info}>
      <SettingsCard>
        {items.map((item, index) => {
          const errors = form.errorCount(`${path}.${index}`, inDocument);
          return (
            <View key={index}>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${open === index ? "Close" : "Edit"} ${itemLabel(item, index)}`}
                  onPress={() => setOpen(open === index ? null : index)}
                  style={styles.label}
                >
                  <Text style={styles.text} numberOfLines={1}>
                    {itemLabel(item, index)}
                  </Text>
                  {errors > 0 ? <Text style={styles.error}>{errors === 1 ? "1 problem" : `${errors} problems`}</Text> : null}
                </Pressable>
                <IconButton icon="ChevronUp" label="Move up" onPress={() => move(index, -1)} disabled={index === 0} theme={form.theme} />
                <IconButton icon="ChevronDown" label="Move down" onPress={() => move(index, 1)} disabled={index === items.length - 1} theme={form.theme} />
                <IconButton icon="Trash2" label={`Remove ${itemLabel(item, index)}`} onPress={() => { onChange(items.filter((_, position) => position !== index)); setOpen(null); }} theme={form.theme} />
              </View>
              {open === index ? <View style={styles.body}>{renderItem(item, index, (change) => replace(index, change))}</View> : null}
            </View>
          );
        })}
        <SettingsAction
          label={items.length ? `Add to ${title.toLowerCase()}` : `No ${title.toLowerCase()} yet`}
          actionLabel="Add"
          onPress={() => {
            onChange([...items, create()]);
            setOpen(items.length);
          }}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function IconButton({ icon, label, onPress, disabled, theme }: { icon: string; label: string; onPress(): void; disabled?: boolean; theme: Theme }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={{ padding: 8, opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function listStyles(theme: Theme) {
  return {
    row: { flexDirection: "row" as const, alignItems: "center" as const, paddingLeft: 12, minHeight: 40 },
    label: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 8, paddingVertical: 8 },
    text: { color: theme.colors.foreground, fontSize: 13, flexShrink: 1 },
    error: { color: theme.colors.statusDanger, fontSize: 11 },
    body: { paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: theme.colors.border, marginLeft: 12, marginBottom: 8 },
  };
}

const ACTION_KINDS = [
  { value: "insert-text", label: "Insert text into the message" },
  { value: "set-prompt", label: "Replace the message" },
  { value: "open-url", label: "Open a web page" },
  { value: "set-model", label: "Switch model" },
  { value: "set-mode", label: "Switch mode" },
  { value: "set-thinking", label: "Switch thinking level" },
  { value: "open-editor", label: "Open Morphise settings" },
] as const;

function blankAction(kind: Action["kind"]): Action {
  switch (kind) {
    case "insert-text":
    case "set-prompt":
      return { kind, text: "" };
    case "open-url":
      return { kind, url: "https://" };
    case "set-model":
      return { kind, model: "" };
    case "set-mode":
      return { kind, mode: "" };
    case "set-thinking":
      return { kind, thinking: "" };
    case "open-editor":
      return { kind };
  }
}

// What a row, button, command or item does when pressed.
export function ActionFields({ form, action, onChange, errorAt }: { form: Form; action: Action; onChange(action: Action): void; errorAt(field: string): string | null }) {
  const kind = (
    <SelectField label="When pressed" value={action.kind} options={ACTION_KINDS} onChange={(next) => next !== action.kind && onChange(blankAction(next))} />
  );
  const field = (() => {
    switch (action.kind) {
      case "insert-text":
      case "set-prompt":
        return <TextField form={form} label="Text" value={action.text} onChange={(text) => onChange({ ...action, text })} error={errorAt("text")} />;
      case "open-url":
        return <TextField form={form} label="Web address" value={action.url} onChange={(url) => onChange({ ...action, url })} error={errorAt("url")} />;
      case "set-model":
        return <TextField form={form} label="Model id" value={action.model} onChange={(model) => onChange({ ...action, model })} error={errorAt("model")} hint="As your provider names it" />;
      case "set-mode":
        return <TextField form={form} label="Mode id" value={action.mode} onChange={(mode) => onChange({ ...action, mode })} error={errorAt("mode")} />;
      case "set-thinking":
        return <TextField form={form} label="Thinking level id" value={action.thinking} onChange={(thinking) => onChange({ ...action, thinking })} error={errorAt("thinking")} />;
      case "open-editor":
        return null;
    }
  })();
  return (
    <>
      {kind}
      {field}
    </>
  );
}

// Every settings tab: loads the document, keeps the shared draft, and saves it as it changes.
export function createFormScreen(
  drafts: DraftStore,
  render: (form: Form) => ReactNode,
  options: { editsProfile: boolean },
) {
  return function MorphiseFormScreen({ theme, layout }: PluginSurfaceProps) {
    const settings = useSettings(profileSettings);
    const draftState = useValue(drafts);
    const ready = settings.status === "ready";
    const issueCount = ready ? drafts.issues({ document: settings.values, revision: settings.revision }).size : 0;
    useAutoSave(drafts, settings, issueCount === 0);
    const styles = useMemo(
      () => ({
        page: { gap: 12 },
        muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
        danger: { color: theme.colors.statusDanger, fontSize: 12 },
        warning: { color: theme.colors.statusWarning, fontSize: 12 },
      }),
      [theme],
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
    if (settings.status === "invalid") {
      return (
        <SettingsSection title="Stored profile is invalid">
          <Text style={styles.danger}>{settings.error}</Text>
          <Text style={styles.muted}>The forms need a valid profile. Fix it in the Advanced tab, where the stored text can be edited.</Text>
        </SettingsSection>
      );
    }

    const saved: Saved = { document: settings.values, revision: settings.revision };
    const document = drafts.working(saved);
    const layoutIndex = drafts.editingIndex(saved);
    const issues = drafts.issues(saved);
    const profilePrefix = `layouts.${layoutIndex}.profile.`;
    const form: Form = {
      theme,
      compact: layout.compact,
      document,
      layoutIndex,
      profile: document.layouts[layoutIndex].profile,
      updateDocument: (change) => drafts.edit(saved, change),
      updateProfile: (change) => drafts.edit(saved, (next) => change(next.layouts[layoutIndex].profile)),
      profileError: (path) => issues.get(profilePrefix + path) ?? null,
      documentError: (path) => issues.get(path) ?? null,
      errorCount: (path, inDocument) => {
        const prefix = inDocument ? path : profilePrefix + path;
        return [...issues.keys()].filter((key) => key === prefix || key.startsWith(`${prefix}.`)).length;
      },
      // Changes only when the stored settings change elsewhere, a discard, or another layout,
      // so this app's own saves keep every input mounted and focused.
      inputKey: `${drafts.inputVersion(saved)}:${draftState.generation}:${layoutIndex}`,
    };

    const dirty = draftState.draft !== null;
    const status = issues.size
      ? `${issues.size === 1 ? "1 problem" : `${issues.size} problems`} to fix before this saves; each is shown beside its field.`
      : settings.saveError
        ? `Save failed: ${settings.saveError}. Your changes are kept; discard them to load what was saved.`
        : dirty
          ? "Saving"
          : "Changes save on their own and apply on every connected app.";
    return (
      <View style={styles.page}>
        {options.editsProfile && document.layouts.length > 1 ? (
          <SettingsCard>
            <SelectField
              label="Layout being edited"
              value={document.layouts[layoutIndex].id}
              options={document.layouts.map((item) => ({ value: item.id, label: item.id === document.activeLayout ? `${item.name} (active)` : item.name }))}
              onChange={(id) => drafts.chooseLayout(id)}
            />
          </SettingsCard>
        ) : null}
        {render(form)}
        <Text style={issues.size || settings.saveError ? styles.danger : styles.muted}>{status}</Text>
        {dirty && (issues.size > 0 || settings.saveError) ? (
          <SettingsCard>
            <SettingsAction label="Discard the changes that did not save" actionLabel="Discard" onPress={() => drafts.discard()} />
          </SettingsCard>
        ) : null}
      </View>
    );
  };
}

// A settings row holding a set of on/off chips: one line instead of a switch per choice.
export function ChipRow({ form, label, hint, chips }: { form: Form; label: string; hint?: string; chips: { key: string; label: string; on: boolean; toggle(): void }[] }) {
  const t = tokens(form.theme, false);
  return (
    <View style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.c.foreground, fontSize: 14 }}>{label}</Text>
        {hint ? <Text style={t.text.small}>{hint}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {chips.map((chip) => (
          <Pressable
            key={chip.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: chip.on }}
            accessibilityLabel={chip.label}
            onPress={chip.toggle}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: chip.on ? t.c.accent : t.c.border, backgroundColor: chip.on ? t.c.surface2 : pressed || hovered ? t.c.surface1 : "transparent" })}
          >
            {chip.on ? <Icon name="Check" size={12} color={t.c.accent} /> : null}
            <Text style={{ fontSize: 12, color: chip.on ? t.c.foreground : t.c.foregroundMuted }}>{chip.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
