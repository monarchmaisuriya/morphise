import { type PluginSurfaceProps, type SettingsState, useSettings } from "@getpaseo/plugin/client";
import { Loading, SettingsAction, SettingsCard, SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch, TextInput } from "@getpaseo/plugin/client/ui";
import { Icon, Tag, tokens } from "../ui/kit";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ZodType } from "zod";
import type { Action } from "../../shared/actions";
import { type ProfileDocument, profileSettings } from "../../shared/document";
import type { Profile } from "../../shared/profile";
import type { DraftStore, Saved } from "../draft";
import { useValue } from "../profile-store";
import { useAutoSave } from "./autosave";
import { openAfterSwap } from "./list-move";
import { fontSize, lineHeight, radius } from "../../shared/design/tokens";

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
  // An edit that fills fields the user did not type in (a preset): text inputs re-read their value.
  replaceInProfile(change: (profile: Profile) => void): void;
  // The error for a path inside the edited profile, such as "sidebar.view.rowLimit.rows".
  profileError(path: string): string | null;
  documentError(path: string): string | null;
  // How many problems sit under a path; profile paths unless `inDocument`.
  errorCount(path: string, inDocument?: boolean): number;
  // Changes when inputs must re-read their value (discard, reload, another layout, a preset).
  inputKey: string;
}

// What a tab that keeps its own records needs from the screen: how to draw, and when inputs re-read their value.
export type SettingsLook = Pick<Form, "theme" | "compact" | "inputKey">;

// A tab whose settings are their own records, never the profile: drawn without the profile, so a profile that
// cannot be read or is invalid does not hide it.
export function createSeparateScreen(render: (look: SettingsLook) => ReactNode) {
  return function MorphiseSeparateScreen({ theme, layout }: PluginSurfaceProps) {
    return <>{render({ theme, compact: layout.compact, inputKey: "" })}</>;
  };
}

export const ICON_HINT = "A Lucide icon name, such as BookOpen.";

export function TextField({
  form,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
}: {
  form: Pick<Form, "inputKey">;
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
  error,
}: {
  label: string;
  value: Value;
  options: readonly { label: string; value: Value }[];
  onChange(value: Value): void;
  hint?: string;
  error?: string | null;
}) {
  return <SettingsSelect label={label} hint={hint} value={value} options={options} onValueChange={onChange} error={error ?? null} />;
}

// Add, edit, move and remove the items of one list.
export function ListEditor<Item>({
  form,
  title,
  itemName,
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
  // One item, as the Add row names it: "layout", "Command Center item".
  itemName: string;
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
    setOpen(openAfterSwap(open, index, target));
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
                  accessibilityState={{ expanded: open === index }}
                  onPress={() => setOpen(open === index ? null : index)}
                  style={styles.label}
                >
                  <Icon name={open === index ? "ChevronDown" : "ChevronRight"} size={14} color={form.theme.colors.foregroundMuted} />
                  <Text style={styles.text} numberOfLines={1}>
                    {itemLabel(item, index)}
                  </Text>
                  {errors > 0 ? <Text style={styles.error}>{errors === 1 ? "1 problem" : `${errors} problems`}</Text> : null}
                </Pressable>
                <IconButton icon="ArrowUp" label="Move up" onPress={() => move(index, -1)} disabled={index === 0} theme={form.theme} />
                <IconButton icon="ArrowDown" label="Move down" onPress={() => move(index, 1)} disabled={index === items.length - 1} theme={form.theme} />
              </View>
              {open === index ? (
                <View style={styles.body}>
                  {renderItem(item, index, (change) => replace(index, change))}
                  {/* Removing takes the item open, then this press, so one stray tap never deletes a whole layout or prompt. */}
                  <SettingsAction
                    label={`Remove ${itemLabel(item, index)}`}
                    actionLabel="Remove"
                    onPress={() => {
                      onChange(items.filter((_, position) => position !== index));
                      setOpen(null);
                    }}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
        <SettingsAction
          label={items.length ? `Add a ${itemName}` : `No ${title} yet`}
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

// A separately stored setting that could not be read, as the Agents tab shows one: what went wrong, and the way back
// (Reset when its saved value is invalid, Retry when it could not load). Never a switch that resets when flipped.
export function UnreadableSetting({ label, invalid, error, onReset, onRetry }: { label: string; invalid: boolean; error: string; onReset(): void; onRetry(): void }) {
  return invalid ? (
    <SettingsAction label={label} hint="The saved setting is invalid; Reset puts back the default." error={error} actionLabel="Reset" onPress={onReset} />
  ) : (
    <SettingsAction label={label} hint="Could not read this setting." error={error} actionLabel="Retry" onPress={onRetry} />
  );
}

// A separately stored setting's section until its record can be used: Loading while it loads, so the section does
// not pop in later, and what went wrong with the way back when it cannot be read.
export function StoredSettingStatus<Schema extends ZodType>({ title, label, stored }: { title: string; label: string; stored: SettingsState<Schema> }) {
  return (
    <SettingsSection title={title}>
      {stored.status === "error" || stored.status === "invalid" ? (
        <SettingsCard>
          <UnreadableSetting label={label} invalid={stored.status === "invalid"} error={stored.error} onReset={() => void stored.reset()} onRetry={() => void stored.reload()} />
        </SettingsCard>
      ) : (
        <Loading />
      )}
    </SettingsSection>
  );
}

// A multi-line text box, padded and labelled like Paseo's own settings rows, with their text size.
// `parsed` boxes keep their own text (the draft holds a parsed form of it, which would rewrite the
// text while typing); the others show the draft's value directly.
export function multiline(form: SettingsLook, label: string, value: string, onChange: (text: string) => void, error: string | null, minHeight = 96, parsed = false) {
  const { theme } = form;
  const size = form.compact ? fontSize.content : fontSize.base;
  return (
    <View style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 16 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: fontSize.base }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline
        key={parsed ? `${form.inputKey}:${label}` : undefined}
        {...(parsed ? { defaultValue: value } : { value })}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight,
          padding: 8,
          fontSize: size,
          lineHeight: lineHeight(size),
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface1,
          borderColor: error ? theme.colors.statusDanger : theme.colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          textAlignVertical: "top",
        }}
      />
      {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: fontSize.sm }}>{error}</Text> : null}
    </View>
  );
}

function IconButton({ icon, label, onPress, disabled, theme }: { icon: string; label: string; onPress(): void; disabled?: boolean; theme: Theme }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={{ padding: 8, opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function listStyles(theme: Theme) {
  return {
    row: { flexDirection: "row" as const, alignItems: "center" as const, paddingLeft: 12, minHeight: 40 },
    label: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 8, paddingVertical: 8 },
    text: { color: theme.colors.foreground, fontSize: fontSize.base, flexShrink: 1 },
    error: { color: theme.colors.statusDanger, fontSize: fontSize.sm },
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
        return <TextField form={form} label="Model id" value={action.model} onChange={(model) => onChange({ ...action, model })} error={errorAt("model")} hint="As your provider names it." />;
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
        muted: { color: theme.colors.foregroundMuted, fontSize: fontSize.sm },
        danger: { color: theme.colors.statusDanger, fontSize: fontSize.sm },
        warning: { color: theme.colors.statusWarning, fontSize: fontSize.sm },
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
      replaceInProfile: (change) => drafts.edit(saved, (next) => change(next.layouts[layoutIndex].profile), { rewritesInputs: true }),
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
    const saveError = settings.saveError ?? draftState.conflict;
    const status = issues.size
      ? `${issues.size === 1 ? "1 problem" : `${issues.size} problems`} to fix before this saves; each is shown beside its field.`
      : saveError
        ? `Save failed: ${saveError}. Your changes are kept; discard them to load what was saved.`
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
        <Text accessibilityLiveRegion="polite" style={issues.size || saveError ? styles.danger : styles.muted}>{status}</Text>
        {issues.size ? <View style={{ gap: 4 }}>{[...issues].map(([path, message]) => <Text key={path} style={styles.danger}>{path.replace(profilePrefix, "").split(".").join(" › ")}: {message}</Text>)}</View> : null}
        {render(form)}
        <Text style={issues.size || saveError ? styles.danger : styles.muted}>{status}</Text>
        {dirty && (issues.size > 0 || saveError) ? (
          <SettingsCard>
            <SettingsAction label="Discard the changes that did not save" actionLabel="Discard" onPress={() => drafts.discard()} />
          </SettingsCard>
        ) : null}
      </View>
    );
  };
}

// A settings row holding a set of on/off chips: one line instead of a switch per choice.
export function ChipRow({ form, label, hint, chips }: { form: Pick<Form, "theme" | "compact">; label: string; hint?: string; chips: { key: string; label: string; on: boolean; toggle(): void }[] }) {
  const t = tokens(form.theme, form.compact);
  return (
    <View style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.c.foreground, fontSize: fontSize.base }}>{label}</Text>
        {hint ? <Text style={t.text.small}>{hint}</Text> : null}
      </View>
      {/* The kit's toggle chip, as the Tasks board's filters draw it, so every on/off chip in Morphise looks the same. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {chips.map((chip) => (
          <Tag key={chip.key} t={t} label={chip.label} on={chip.on} onPress={chip.toggle} />
        ))}
      </View>
    </View>
  );
}
