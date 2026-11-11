import { Icon, SettingsAction, SettingsCard, SettingsSection, TextInput } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Action } from "../../shared/actions";
import { STATUS_TITLES } from "../../shared/arrange";
import type { Layout, Prompt } from "../../shared/document";
import { EMPTY_PROFILE, type Profile, TIMELINE_ITEM_TYPES } from "../../shared/profile";
import { presetTitle } from "../../shared/reminders";
import { useValue } from "../profile-store";
import { viewPresence } from "../view-presence";
import { ActionFields, type Form, ListEditor, NumberField, SelectField, SwitchField, TextField } from "./fields";
import { parseMetadataText, uniqueId } from "./form-values";

type ViewConfig = Profile["sidebar"]["view"];
type Row = Profile["sidebar"]["headerRows"][number];
type Button = Profile["header"]["buttons"][number];
type MenuEntry = Extract<Button, { menu: unknown }>["menu"][number];
type Control = Profile["composer"]["controls"][number];
type SlashCommand = Profile["slashCommands"][number];
type CommandItem = Profile["commandCenter"][number];
type Preset = Profile["newWorkspace"]["presets"][number];
type Theme = NonNullable<Profile["theme"]>;

const copy = <Value,>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

// A multi-line text box. `parsed` boxes keep their own text (the draft holds a parsed form of it,
// which would rewrite the text while typing); the others show the draft's value directly.
function multiline(form: Form, label: string, value: string, onChange: (text: string) => void, error: string | null, minHeight = 96, parsed = false) {
  const { theme } = form;
  return (
    <View style={{ gap: 4, paddingVertical: 8, paddingRight: 12 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{label}</Text>
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
          fontSize: 12,
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface1,
          borderColor: error ? theme.colors.statusDanger : theme.colors.border,
          borderWidth: 1,
          borderRadius: 6,
          textAlignVertical: "top",
        }}
      />
      {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{error}</Text> : null}
    </View>
  );
}

// ---------- Layouts ----------

export function LayoutsTab(form: Form): ReactNode {
  const { document } = form;
  return (
    <>
      <SettingsSection title="Active layout" info="The layout every connected app shows. Switch here or from the Command Center.">
        <SettingsCard>
          <SelectField
            label="Active layout"
            value={document.activeLayout}
            options={document.layouts.map((layout) => ({ value: layout.id, label: layout.name }))}
            onChange={(id) => form.updateDocument((next) => void (next.activeLayout = id))}
          />
        </SettingsCard>
        {form.documentError("activeLayout") ? <Text style={{ color: form.theme.colors.statusDanger, fontSize: 12 }}>{form.documentError("activeLayout")}</Text> : null}
      </SettingsSection>
      <ListEditor<Layout>
        form={form}
        title="Layouts"
        info="Each layout is a whole set of customisations. Prompts are shared by every layout."
        items={document.layouts}
        path="layouts"
        inDocument
        onChange={(layouts) => form.updateDocument((next) => void (next.layouts = layouts))}
        itemLabel={(layout) => (layout.id === document.activeLayout ? `${layout.name} (active)` : layout.name)}
        create={() => ({ id: uniqueId("layout", document.layouts.map((layout) => layout.id)), name: "New layout", profile: copy(EMPTY_PROFILE) })}
        renderItem={(layout, index, update) => (
          <>
            <TextField form={form} label="Name" value={layout.name} onChange={(name) => update((item) => void (item.name = name))} error={form.documentError(`layouts.${index}.name`)} />
            <TextField form={form} label="Id" hint="Lowercase letters, digits and hyphens" value={layout.id} onChange={(id) => update((item) => void (item.id = id))} error={form.documentError(`layouts.${index}.id`)} />
            <SettingsAction
              label="Copy this layout"
              hint="Adds a copy you can change without touching this one"
              actionLabel="Duplicate"
              onPress={() =>
                form.updateDocument((next) =>
                  void next.layouts.push({ ...copy(layout), id: uniqueId(`${layout.id}-copy`, next.layouts.map((item) => item.id)), name: `${layout.name} copy` }),
                )
              }
            />
          </>
        )}
      />
    </>
  );
}

// ---------- Sidebar ----------

function StatusOrder({ form }: { form: Form }) {
  const order = form.profile.sidebar.view.statusOrder;
  const move = (index: number, by: number) =>
    form.updateProfile((profile) => {
      const next = profile.sidebar.view.statusOrder;
      [next[index], next[index + by]] = [next[index + by], next[index]];
    });
  const { theme } = form;
  return (
    <View style={{ paddingVertical: 8, paddingHorizontal: 12, gap: 4 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>Status order</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>Used to sort by status and to order status groups.</Text>
      {order.map((indicator, index) => (
        <View key={indicator} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 12, flex: 1 }}>
            {index + 1}. {STATUS_TITLES[indicator]}
          </Text>
          {[
            { label: "Up", by: -1, disabled: index === 0 },
            { label: "Down", by: 1, disabled: index === order.length - 1 },
          ].map((button) => (
            <Pressable
              key={button.label}
              accessibilityRole="button"
              accessibilityLabel={`Move ${STATUS_TITLES[indicator]} ${button.label.toLowerCase()}`}
              disabled={button.disabled}
              onPress={() => move(index, button.by)}
              style={{ paddingHorizontal: 8, paddingVertical: 4, opacity: button.disabled ? 0.35 : 1 }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 12 }}>{button.label}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

// One entry per view setting; the type makes a new setting fail to compile until it has a field.
function viewFields(form: Form): { [Key in keyof ViewConfig]: ReactNode } {
  const view = form.profile.sidebar.view;
  const set = <Key extends keyof ViewConfig>(key: Key, value: ViewConfig[Key]) => form.updateProfile((profile) => void (profile.sidebar.view[key] = value));
  return {
    enabled: (
      <SwitchField
        label="Use the Morphise sidebar view"
        hint="Then pick Morphise in Paseo's Settings, Sidebar, Sidebar view"
        value={view.enabled}
        onChange={(value) => set("enabled", value)}
      />
    ),
    list: (
      <SelectField
        label="List"
        hint="Chats shows every chat as its own row, with the same filters"
        value={view.list}
        options={[
          { value: "workspaces", label: "Workspaces" },
          { value: "chats", label: "Chats" },
        ]}
        onChange={(value) => set("list", value)}
      />
    ),
    groupBy: (
      <SelectField
        label="Group by"
        value={view.groupBy}
        options={[
          { value: "project", label: "Project" },
          { value: "status", label: "Status" },
          { value: "label", label: "Label" },
          { value: "none", label: "No groups" },
        ]}
        onChange={(value) => set("groupBy", value)}
      />
    ),
    orderBy: (
      <SelectField
        label="Sort by"
        value={view.orderBy}
        options={[
          { value: "status", label: "Status" },
          { value: "activity", label: "Last prompt" },
          { value: "name", label: "Name" },
        ]}
        onChange={(value) => set("orderBy", value)}
      />
    ),
    thenBy: (
      <SelectField
        label="Then by"
        value={view.thenBy}
        options={[
          { value: "activity", label: "Last prompt" },
          { value: "name", label: "Name" },
        ]}
        onChange={(value) => set("thenBy", value)}
      />
    ),
    statusOrder: <StatusOrder form={form} />,
    pinnedFirst: <SwitchField label="Pinned workspaces first" value={view.pinnedFirst} onChange={(value) => set("pinnedFirst", value)} />,
    counts: <SwitchField label="Show counts in group headers" value={view.counts} onChange={(value) => set("counts", value)} />,
    rowLimit: (
      <>
        <SwitchField
          label="Shorten long groups"
          hint="Workspaces that need permission or failed always show"
          value={view.rowLimit.enabled}
          onChange={(value) => form.updateProfile((profile) => void (profile.sidebar.view.rowLimit.enabled = value))}
        />
        {view.rowLimit.enabled ? (
          <NumberField
            form={form}
            label="Rows before Show more"
            value={view.rowLimit.rows}
            onChange={(rows) => form.updateProfile((profile) => void (profile.sidebar.view.rowLimit.rows = rows))}
            error={form.profileError("sidebar.view.rowLimit.rows")}
            hint="3 to 100"
          />
        ) : null}
      </>
    ),
    density: (
      <SelectField
        label="Row height"
        value={view.density}
        options={[
          { value: "compact", label: "Compact" },
          { value: "comfortable", label: "Comfortable" },
        ]}
        onChange={(value) => set("density", value)}
      />
    ),
    details: detailFields(form),
    rowActions: (
      <SwitchField label="Pin button on rows" value={view.rowActions.includes("pin")} onChange={(value) => set("rowActions", value ? ["pin"] : [])} />
    ),
    filterBar: (
      <SwitchField label="Search, status chips and Next button" value={view.filterBar} onChange={(value) => set("filterBar", value)} />
    ),
    showAgents: <SwitchField label="Show each workspace's chats" value={view.showAgents} onChange={(value) => set("showAgents", value)} />,
  };
}

function detailFields(form: Form): ReactNode {
  type Details = ViewConfig["details"];
  const details = form.profile.sidebar.view.details;
  const labels: { [Key in keyof Details]: string } = {
    branch: "Show the branch",
    diff: "Show added and removed lines",
    timeInStatus: "Show time in current status",
    project: "Show the project",
  };
  return (Object.keys(labels) as (keyof Details)[]).map((key) => (
    <SwitchField key={key} label={labels[key]} value={details[key]} onChange={(value) => form.updateProfile((profile) => void (profile.sidebar.view.details[key] = value))} />
  ));
}

function reminderFields(form: Form): { [Key in keyof Profile["reminders"]]: ReactNode } {
  const reminders = form.profile.reminders;
  return {
    presets: (
      <ListEditor<number>
        form={form}
        title="Remind me choices"
        info="Offered by the Remind me button and the Command Center. 1 minute to 7 days."
        items={reminders.presets}
        path="reminders.presets"
        onChange={(presets) => form.updateProfile((profile) => void (profile.reminders.presets = presets))}
        itemLabel={(minutes) => (Number.isFinite(minutes) && minutes > 0 ? presetTitle(minutes) : "Invalid time")}
        create={() => [45, 90, 120, 240, 480, 1440].find((minutes) => !reminders.presets.includes(minutes)) ?? 10}
        renderItem={(minutes, index, update) => (
          <NumberField
            form={form}
            label="Minutes"
            value={minutes}
            onChange={(value) =>
              form.updateProfile((profile) => {
                profile.reminders.presets[index] = value;
              })
            }
            error={form.profileError(`reminders.presets.${index}`) ?? form.profileError("reminders.presets")}
          />
        )}
      />
    ),
    sound: <SwitchField label="Play a chime when a reminder is due" value={reminders.sound} onChange={(value) => form.updateProfile((profile) => void (profile.reminders.sound = value))} />,
    desktopNotification: (
      <SwitchField
        label="Desktop notification when a reminder is due"
        hint="Desktop and browser apps; Paseo asks once"
        value={reminders.desktopNotification}
        onChange={(value) => form.updateProfile((profile) => void (profile.reminders.desktopNotification = value))}
      />
    ),
  };
}

// Paseo shows one sidebar view at a time and plugins cannot pick it, so say plainly when the
// Morphise view is on but not the one Paseo is showing.
function ViewCallout({ form }: { form: Form }) {
  const shown = useValue(viewPresence);
  if (!form.profile.sidebar.view.enabled || shown) return null;
  const { theme } = form;
  return (
    <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.statusWarning, backgroundColor: theme.colors.surface1 }}>
      <Icon name="TriangleAlert" size={16} color={theme.colors.statusWarning} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>Paseo is still showing its own sidebar</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          These settings change the Morphise sidebar view. To see it, open Paseo's Settings, then Sidebar, then Sidebar view, and pick
          Morphise. This note goes away once the view is showing in this window.
        </Text>
      </View>
    </View>
  );
}

export function SidebarTab(form: Form): ReactNode {
  const view = viewFields(form);
  const reminders = reminderFields(form);
  return (
    <>
      <ViewCallout form={form} />
      <SettingsSection title="Morphise sidebar view" info="These settings apply inside the Morphise sidebar view only.">
        <SettingsCard>{Object.values(view)}</SettingsCard>
      </SettingsSection>
      <SettingsSection title="Reminders">
        <SettingsCard>
          {reminders.sound}
          {reminders.desktopNotification}
        </SettingsCard>
      </SettingsSection>
      {reminders.presets}
    </>
  );
}

// ---------- Look ----------

const DEFAULT_THEME: Theme = {
  name: "My theme",
  appearance: "dark",
  colors: {
    background: "#16161e",
    foreground: "#d5d6e0",
    raised: "#20202b",
    control: "#2a2a38",
    border: "#33334a",
    accent: "#8f8cf2",
    mutedForeground: "#8b8ca3",
    ring: "#55557a",
  },
};

function colorFields(form: Form, theme: Theme): ReactNode {
  type Colors = Theme["colors"];
  const labels: { [Key in keyof Colors]-?: string } = {
    background: "Background",
    foreground: "Text",
    raised: "Raised surfaces",
    control: "Controls",
    border: "Borders",
    accent: "Accent (optional)",
    mutedForeground: "Muted text",
    ring: "Focus ring",
  };
  return (Object.keys(labels) as (keyof Colors)[]).map((key) => (
    <TextField
      key={key}
      form={form}
      label={labels[key]}
      placeholder="#1e1e2e"
      value={theme.colors[key] ?? ""}
      onChange={(text) =>
        form.updateProfile((profile) => {
          if (!profile.theme) return;
          if (key === "accent" && text.trim() === "") delete profile.theme.colors.accent;
          else profile.theme.colors[key] = text.trim();
        })
      }
      error={form.profileError(`theme.colors.${key}`)}
    />
  ));
}

export function LookTab(form: Form): ReactNode {
  const { theme, style } = form.profile;
  return (
    <>
      <SettingsSection title="Theme" info="Adds a theme under Paseo's Settings, Appearance.">
        <SettingsCard>
          <SwitchField label="Add a custom theme" value={theme !== null} onChange={(value) => form.updateProfile((profile) => void (profile.theme = value ? copy(DEFAULT_THEME) : null))} />
          {theme ? (
            <>
              <TextField form={form} label="Name" value={theme.name} onChange={(name) => form.updateProfile((profile) => void (profile.theme && (profile.theme.name = name)))} error={form.profileError("theme.name")} />
              <SelectField
                label="Light or dark"
                value={theme.appearance}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                ]}
                onChange={(value) => form.updateProfile((profile) => void (profile.theme && (profile.theme.appearance = value)))}
              />
              {colorFields(form, theme)}
            </>
          ) : null}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Style layer" info="Unsupported: desktop and browser only, and a Paseo update can rename what it hides.">
        <SettingsCard>
          <SwitchField label="Use the style layer" value={style.enabled} onChange={(value) => form.updateProfile((profile) => void (profile.style.enabled = value))} />
          {multiline(form, "Extra CSS", style.css, (css) => form.updateProfile((profile) => void (profile.style.css = css)), form.profileError("style.css"))}
        </SettingsCard>
      </SettingsSection>
      <ListEditor<string>
        form={form}
        title="Hidden parts"
        info="Paseo test ids to hide, such as sidebar-help"
        items={style.hideTestIds}
        path="style.hideTestIds"
        onChange={(ids) => form.updateProfile((profile) => void (profile.style.hideTestIds = ids))}
        itemLabel={(id) => id || "(empty)"}
        create={() => ""}
        renderItem={(id, index, update) => (
          <TextField form={form} label="Test id" value={id} onChange={(text) => form.updateProfile((profile) => void (profile.style.hideTestIds[index] = text.trim()))} error={form.profileError(`style.hideTestIds.${index}`)} />
        )}
      />
    </>
  );
}

// ---------- Buttons ----------

const newAction = (): Action => ({ kind: "insert-text", text: "" });

function rowEditor(form: Form, title: string, which: "headerRows" | "footerRows"): ReactNode {
  const rows = form.profile.sidebar[which];
  const path = `sidebar.${which}`;
  return (
    <ListEditor<Row>
      form={form}
      title={title}
      items={rows}
      path={path}
      onChange={(items) => form.updateProfile((profile) => void (profile.sidebar[which] = items))}
      itemLabel={(row) => row.label || "(no label)"}
      create={() => ({ id: uniqueId("row", rows.map((row) => row.id)), label: "New row", icon: "Star", action: newAction() })}
      renderItem={(row, index, update) => (
        <>
          <TextField form={form} label="Label" value={row.label} onChange={(label) => update((item) => void (item.label = label))} error={form.profileError(`${path}.${index}.label`)} />
          <TextField form={form} label="Icon" hint="A Lucide icon name, such as BookOpen" value={row.icon} onChange={(icon) => update((item) => void (item.icon = icon.trim()))} error={form.profileError(`${path}.${index}.icon`)} />
          <TextField form={form} label="Id" value={row.id} onChange={(id) => update((item) => void (item.id = id.trim()))} error={form.profileError(`${path}.${index}.id`)} />
          <ActionFields form={form} action={row.action} onChange={(action) => update((item) => void (item.action = action))} errorAt={(field) => form.profileError(`${path}.${index}.action.${field}`)} />
        </>
      )}
    />
  );
}

function buttonEditor(form: Form, title: string, info: string, items: readonly Button[], path: string, write: (profile: Profile, items: Button[]) => void): ReactNode {
  return (
    <ListEditor<Button>
      form={form}
      title={title}
      info={info}
      items={items}
      path={path}
      onChange={(next) => form.updateProfile((profile) => write(profile, next))}
      itemLabel={(button) => button.title || "(no title)"}
      create={() => ({ id: uniqueId("button", items.map((button) => button.id)), title: "New button", icon: "Star", action: newAction() })}
      renderItem={(button, index, update) => {
        const at = (field: string) => form.profileError(`${path}.${index}.${field}`);
        return (
          <>
            <TextField form={form} label="Title" value={button.title} onChange={(text) => update((item) => void (item.title = text))} error={at("title")} />
            <TextField form={form} label="Short label (optional)" value={button.label ?? ""} onChange={(text) => update((item) => (text.trim() ? void (item.label = text) : void delete item.label))} error={at("label")} />
            <TextField form={form} label="Icon" value={button.icon} onChange={(icon) => update((item) => void (item.icon = icon.trim()))} error={at("icon")} />
            <TextField form={form} label="Id" value={button.id} onChange={(id) => update((item) => void (item.id = id.trim()))} error={at("id")} />
            <SelectField
              label="Pressing it"
              value={"menu" in button ? "menu" : "action"}
              options={[
                { value: "action", label: "Does one thing" },
                { value: "menu", label: "Opens a menu" },
              ]}
              onChange={(value) =>
                update((item) => {
                  const target = item as Record<string, unknown>;
                  if (value === "menu" && !("menu" in item)) {
                    delete target.action;
                    target.menu = [{ id: "first", title: "First choice", action: newAction() }];
                  } else if (value === "action" && "menu" in item) {
                    delete target.menu;
                    target.action = newAction();
                  }
                })
              }
            />
            {"menu" in button ? (
              <ListEditor<MenuEntry>
                form={form}
                title="Menu choices"
                items={button.menu}
                path={`${path}.${index}.menu`}
                onChange={(menu) => update((item) => void ((item as { menu: MenuEntry[] }).menu = menu))}
                itemLabel={(entry) => entry.title || "(no title)"}
                create={() => ({ id: uniqueId("choice", button.menu.map((entry) => entry.id)), title: "New choice", action: newAction() })}
                renderItem={(entry, entryIndex, updateEntry) => (
                  <>
                    <TextField form={form} label="Title" value={entry.title} onChange={(text) => updateEntry((item) => void (item.title = text))} error={at(`menu.${entryIndex}.title`)} />
                    <TextField form={form} label="Id" value={entry.id} onChange={(id) => updateEntry((item) => void (item.id = id.trim()))} error={at(`menu.${entryIndex}.id`)} />
                    <ActionFields form={form} action={entry.action} onChange={(action) => updateEntry((item) => void (item.action = action))} errorAt={(field) => at(`menu.${entryIndex}.action.${field}`)} />
                  </>
                )}
              />
            ) : (
              <ActionFields form={form} action={button.action} onChange={(action) => update((item) => void ((item as { action: Action }).action = action))} errorAt={(field) => at(`action.${field}`)} />
            )}
          </>
        );
      }}
    />
  );
}

function controlEditor(form: Form): ReactNode {
  const controls = form.profile.composer.controls;
  const path = "composer.controls";
  return (
    <ListEditor<Control>
      form={form}
      title="Message box controls"
      info="Buttons, switches and pickers in every message box"
      items={controls}
      path={path}
      onChange={(items) => form.updateProfile((profile) => void (profile.composer.controls = items))}
      itemLabel={(control) => control.title || "(no title)"}
      create={() => ({ kind: "action", id: uniqueId("control", controls.map((control) => control.id)), title: "New control", icon: "Star", action: newAction() })}
      renderItem={(control, index, update) => {
        const at = (field: string) => form.profileError(`${path}.${index}.${field}`);
        const base = { id: control.id, title: control.title, icon: control.icon };
        return (
          <>
            <SelectField
              label="Kind"
              value={control.kind}
              options={[
                { value: "action", label: "Button" },
                { value: "toggle", label: "On/off switch saved on the chat" },
                { value: "select", label: "Picker for model, mode or thinking" },
              ]}
              onChange={(kind) =>
                kind !== control.kind &&
                form.updateProfile((profile) => {
                  profile.composer.controls[index] =
                    kind === "action"
                      ? { kind, ...base, action: newAction() }
                      : kind === "toggle"
                        ? { kind, ...base, metadataKey: "morphise.flag" }
                        : { kind, ...base, target: "model", options: [{ label: "Default", value: "default" }] };
                })
              }
            />
            <TextField form={form} label="Title" value={control.title} onChange={(text) => update((item) => void (item.title = text))} error={at("title")} />
            <TextField form={form} label="Icon" value={control.icon} onChange={(icon) => update((item) => void (item.icon = icon.trim()))} error={at("icon")} />
            <TextField form={form} label="Id" value={control.id} onChange={(id) => update((item) => void (item.id = id.trim()))} error={at("id")} />
            {control.kind === "action" ? (
              <ActionFields form={form} action={control.action} onChange={(action) => update((item) => void ((item as { action: Action }).action = action))} errorAt={(field) => at(`action.${field}`)} />
            ) : null}
            {control.kind === "toggle" ? (
              <TextField form={form} label="Saved as chat metadata key" value={control.metadataKey} onChange={(key) => update((item) => void ((item as { metadataKey: string }).metadataKey = key.trim()))} error={at("metadataKey")} />
            ) : null}
            {control.kind === "select" ? (
              <>
                <SelectField
                  label="Changes"
                  value={control.target}
                  options={[
                    { value: "model", label: "Model" },
                    { value: "mode", label: "Mode" },
                    { value: "thinking", label: "Thinking level" },
                  ]}
                  onChange={(target) => update((item) => void ((item as { target: typeof target }).target = target))}
                />
                <ListEditor<{ label: string; value: string }>
                  form={form}
                  title="Choices"
                  items={control.options}
                  path={`${path}.${index}.options`}
                  onChange={(options) => update((item) => void ((item as { options: typeof options }).options = options))}
                  itemLabel={(option) => option.label || "(no label)"}
                  create={() => ({ label: "New choice", value: "" })}
                  renderItem={(option, optionIndex, updateOption) => (
                    <>
                      <TextField form={form} label="Label" value={option.label} onChange={(text) => updateOption((item) => void (item.label = text))} error={at(`options.${optionIndex}.label`)} />
                      <TextField form={form} label="Value" value={option.value} onChange={(text) => updateOption((item) => void (item.value = text.trim()))} error={at(`options.${optionIndex}.value`)} />
                    </>
                  )}
                />
              </>
            ) : null}
          </>
        );
      }}
    />
  );
}

export function ButtonsTab(form: Form): ReactNode {
  return (
    <>
      {rowEditor(form, "Sidebar header rows", "headerRows")}
      {rowEditor(form, "Sidebar footer rows", "footerRows")}
      {buttonEditor(form, "Workspace header buttons", "Shown in every workspace's header", form.profile.header.buttons, "header.buttons", (profile, items) => void (profile.header.buttons = items))}
      {buttonEditor(form, "Message box pills", "Shown above every chat's message box", form.profile.composer.pills, "composer.pills", (profile, items) => void (profile.composer.pills = items))}
      {controlEditor(form)}
    </>
  );
}

// ---------- Commands ----------

function metadataText(metadata: Preset["metadata"]): string {
  return Object.entries(metadata ?? {})
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

export function CommandsTab(form: Form): ReactNode {
  const { slashCommands, commandCenter, newWorkspace, timeline } = form.profile;
  return (
    <>
      <ListEditor<SlashCommand>
        form={form}
        title="Slash commands"
        info="Typed as /name in a chat's message box"
        items={slashCommands}
        path="slashCommands"
        onChange={(items) => form.updateProfile((profile) => void (profile.slashCommands = items))}
        itemLabel={(command) => `/${command.name}`}
        create={() => ({ name: uniqueId("command", slashCommands.map((command) => command.name)), description: "New command", argumentHint: "", action: newAction() })}
        renderItem={(command, index, update) => {
          const at = (field: string) => form.profileError(`slashCommands.${index}.${field}`);
          return (
            <>
              <TextField form={form} label="Name" value={command.name} onChange={(name) => update((item) => void (item.name = name.trim()))} error={at("name")} />
              <TextField form={form} label="Description" value={command.description} onChange={(text) => update((item) => void (item.description = text))} error={at("description")} />
              <TextField form={form} label="Argument hint" value={command.argumentHint} onChange={(text) => update((item) => void (item.argumentHint = text))} error={at("argumentHint")} />
              <ActionFields form={form} action={command.action} onChange={(action) => update((item) => void (item.action = action))} errorAt={(field) => at(`action.${field}`)} />
            </>
          );
        }}
      />
      <ListEditor<CommandItem>
        form={form}
        title="Command Center items"
        items={commandCenter}
        path="commandCenter"
        onChange={(items) => form.updateProfile((profile) => void (profile.commandCenter = items))}
        itemLabel={(item) => item.title || "(no title)"}
        create={() => ({ id: uniqueId("item", commandCenter.map((item) => item.id)), title: "New item", icon: "Star", action: newAction() })}
        renderItem={(item, index, update) => {
          const at = (field: string) => form.profileError(`commandCenter.${index}.${field}`);
          return (
            <>
              <TextField form={form} label="Title" value={item.title} onChange={(text) => update((next) => void (next.title = text))} error={at("title")} />
              <TextField form={form} label="Icon" value={item.icon} onChange={(icon) => update((next) => void (next.icon = icon.trim()))} error={at("icon")} />
              <TextField form={form} label="Id" value={item.id} onChange={(id) => update((next) => void (next.id = id.trim()))} error={at("id")} />
              <TextField
                form={form}
                label="Search words (comma-separated)"
                value={(item.keywords ?? []).join(", ")}
                onChange={(text) =>
                  update((next) => {
                    const words = text.split(",").map((word) => word.trim()).filter(Boolean);
                    if (words.length) next.keywords = words;
                    else delete next.keywords;
                  })
                }
                error={at("keywords")}
              />
              <ActionFields form={form} action={item.action} onChange={(action) => update((next) => void (next.action = action))} errorAt={(field) => at(`action.${field}`)} />
            </>
          );
        }}
      />
      <ListEditor<Preset>
        form={form}
        title="New workspace presets"
        items={newWorkspace.presets}
        path="newWorkspace.presets"
        onChange={(items) => form.updateProfile((profile) => void (profile.newWorkspace.presets = items))}
        itemLabel={(preset) => preset.label || "(no label)"}
        create={() => ({ id: uniqueId("preset", newWorkspace.presets.map((preset) => preset.id)), label: "New preset" })}
        renderItem={(preset, index, update) => {
          const at = (field: string) => form.profileError(`newWorkspace.presets.${index}.${field}`);
          return (
            <>
              <TextField form={form} label="Label" value={preset.label} onChange={(text) => update((item) => void (item.label = text))} error={at("label")} />
              <TextField form={form} label="Id" value={preset.id} onChange={(id) => update((item) => void (item.id = id.trim()))} error={at("id")} />
              <SelectField
                label="Isolation"
                value={preset.isolation ?? "unchanged"}
                options={[
                  { value: "unchanged", label: "Leave as chosen" },
                  { value: "local", label: "Local" },
                  { value: "worktree", label: "Worktree" },
                ]}
                onChange={(value) => update((item) => (value === "unchanged" ? void delete item.isolation : void (item.isolation = value)))}
              />
              {multiline(
                form,
                "Workspace metadata (key=value per line)",
                metadataText(preset.metadata),
                (text) =>
                  update((item) => {
                    const metadata = parseMetadataText(text);
                    if (metadata) item.metadata = metadata as Preset["metadata"];
                    else delete item.metadata;
                  }),
                at("metadata"),
                64,
                true,
              )}
            </>
          );
        }}
      />
      <SettingsSection title="Hidden timeline rows" info="Hide whole kinds of rows in every chat">
        <SettingsCard>
          {TIMELINE_ITEM_TYPES.map((type) => (
            <SwitchField
              key={type}
              label={`Hide ${type.replaceAll("_", " ")} rows`}
              value={timeline.hide.includes(type)}
              onChange={(hide) =>
                form.updateProfile((profile) => {
                  profile.timeline.hide = hide ? [...profile.timeline.hide, type] : profile.timeline.hide.filter((item) => item !== type);
                })
              }
            />
          ))}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

// ---------- Prompts ----------

export function PromptsTab(form: Form): ReactNode {
  const { prompts } = form.document;
  return (
    <ListEditor<Prompt>
      form={form}
      title="Prompts"
      info="Shared by every layout; pick one from the Prompts box in any chat's message box"
      items={prompts}
      path="prompts"
      inDocument
      onChange={(items) => form.updateDocument((document) => void (document.prompts = items))}
      itemLabel={(prompt) => `${prompt.starred ? "★ " : ""}${prompt.title || "(no title)"}`}
      create={() => ({ id: uniqueId("prompt", prompts.map((prompt) => prompt.id)), title: "New prompt", text: "", starred: false })}
      renderItem={(prompt, index, update) => {
        const at = (field: string) => form.documentError(`prompts.${index}.${field}`);
        return (
          <>
            <TextField form={form} label="Title" value={prompt.title} onChange={(text) => update((item) => void (item.title = text))} error={at("title")} />
            {multiline(form, "Text", prompt.text, (text) => update((item) => void (item.text = text)), at("text"))}
            <SwitchField label="Starred (listed first)" value={prompt.starred} onChange={(starred) => update((item) => void (item.starred = starred))} />
            <TextField form={form} label="Id" value={prompt.id} onChange={(id) => update((item) => void (item.id = id.trim()))} error={at("id")} />
          </>
        );
      }}
    />
  );
}
