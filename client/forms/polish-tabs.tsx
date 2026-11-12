import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Text } from "react-native";
import type { ChatSettings } from "../../shared/chat-view";
import { ICON_KINDS, type IconKind, LOADERS, POLISH_DEFAULTS, type PolishSettings, polishPrefs, RICH_TEXT, type RichText, SELECTION_ACTIONS, type SelectionAction } from "../../shared/polish/prefs";
import { applyUpdate, checkUpdate, type UpdateStatus } from "../../shared/polish/update";
import { t, type MessageKey } from "../polish/i18n";
import { BrowserControl } from "../polish/pages/browser-control";
import { PLAIN_SYNTAX, SYNTAX_THEMES } from "../polish/rows/highlight";
import { tokens } from "../ui/kit";
import { ChipRow, type Form, SelectField, SwitchField } from "./fields";

// Settings for the features ported from Chat Polish and Quote (see NOTICE.md). They live in the
// profile's `chat.polish`; a value equal to its default is removed, so older Morphise versions
// can still read an unchanged profile.

function polishEditor(form: Form) {
  const polish = form.profile.chat?.polish ?? {};
  const prefs = polishPrefs(form.profile.chat);
  const change = (apply: (next: PolishSettings) => void) =>
    form.updateProfile((profile) => {
      const chat: ChatSettings = { ...(profile.chat ?? {}) };
      const next: PolishSettings = { ...(chat.polish ?? {}) };
      apply(next);
      for (const key of Object.keys(next) as (keyof PolishSettings)[]) {
        const value = next[key];
        const empty = value === undefined || (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);
        if (empty || JSON.stringify(value) === JSON.stringify(POLISH_DEFAULTS[key])) delete next[key];
      }
      if (Object.keys(next).length) chat.polish = next;
      else delete chat.polish;
      if (Object.keys(chat).length) profile.chat = chat;
      else delete profile.chat;
    });
  const set = <Key extends keyof PolishSettings>(key: Key, value: PolishSettings[Key]) => change((next) => void (next[key] = value));
  return { polish, prefs, change, set };
}

// Chat tab: how the ported rows group and open.
export function PolishRowSettings({ form }: { form: Form }): ReactNode {
  const { prefs, change, set } = polishEditor(form);
  const iconTitles: Record<IconKind, string> = { steps: "Merged steps", tool: "Tool calls", thought: "Thinking" };
  const toggleIcon = (kind: IconKind) =>
    change((next) => {
      const icons = { ...(next.rowIcons ?? {}) };
      if (prefs.rowIcons[kind] === "hide") delete icons[kind];
      else icons[kind] = "hide";
      next.rowIcons = icons;
    });
  return (
    <SettingsSection title="Steps" info="Thoughts and tool calls between two replies, and how rows open.">
      <SettingsCard>
        <SwitchField label={t("prefs.row.merge")} hint={t("prefs.hint.merge")} value={prefs.merge === "on"} onChange={(value) => set("merge", value)} />
        <SwitchField label="Failed calls start open" hint="Off: they follow the folding rules like any other row." value={prefs.failedOpen} onChange={(value) => set("failedOpen", value)} />
        {/* "Each row starts with: A label" (Tool calls) hides every icon; the chips apply otherwise. */}
        {form.profile.chat?.labels === "label" ? null : <ChipRow form={form} label={t("prefs.row.rowIcons")} hint={t("prefs.hint.rowIcons")} chips={ICON_KINDS.map((kind) => ({ key: kind, label: iconTitles[kind], on: prefs.rowIcons[kind] === "show", toggle: () => toggleIcon(kind) }))} />}
      </SettingsCard>
    </SettingsSection>
  );
}

const ACTION_TITLES: Record<SelectionAction, string> = { quote: "Quote", reply: "Reply", side: "Side chat", copy: "Copy", bookmark: "Bookmark" };
const RICH_TITLES: Record<RichText, MessageKey> = { quote: "prefs.rich.quote", table: "prefs.rich.table", code: "prefs.rich.code", inline: "prefs.rich.inline", heading: "prefs.rich.heading", list: "prefs.rich.list", callout: "prefs.rich.callout", rule: "prefs.rich.rule" };
const RICH_OPTION_PREFIX: Record<RichText, string> = { quote: "prefs.richQuote", table: "prefs.richTable", code: "prefs.richCode", inline: "prefs.richInline", heading: "prefs.richHeading", list: "prefs.richList", callout: "prefs.richCallout", rule: "prefs.richRule" };

// Messages tab: the selection bar, pictures, diagrams and the look of replies.
export function MessagesTab(form: Form): ReactNode {
  const { prefs, change, set } = polishEditor(form);
  const toggleAction = (action: SelectionAction) =>
    change((next) => {
      const shown = new Set(prefs.selectionActions);
      if (shown.has(action)) shown.delete(action);
      else shown.add(action);
      const list = SELECTION_ACTIONS.filter((item) => shown.has(item));
      next.selectionActions = list.length === SELECTION_ACTIONS.length ? undefined : list;
    });
  const setRich = (kind: RichText, value: string) =>
    change((next) => {
      const rich = { ...(next.richText ?? {}) } as Record<string, string>;
      if (value === "a") delete rich[kind];
      else rich[kind] = value;
      next.richText = rich as PolishSettings["richText"];
    });
  const restyled = prefs.nativeStyle === "design";
  return (
    <>
      <SettingsSection title="Selection bar" info="Select text in a chat (desktop and web) to quote it into the message box, reply to it, ask a side chat about it, copy it, or bookmark it.">
        <SettingsCard>
          <SwitchField label="Show a bar over selected text" value={prefs.selection === "on"} onChange={(value) => set("selection", value)} />
          {prefs.selection === "on" ? <ChipRow form={form} label="Buttons" hint="Reply: Enter sends, Ctrl or Cmd+Enter adds to the message box. Side chat: a separate agent beside the chat." chips={SELECTION_ACTIONS.map((action) => ({ key: action, label: ACTION_TITLES[action], on: prefs.selectionActions.includes(action), toggle: () => toggleAction(action) }))} /> : null}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Pictures" info="Replies that are only images, and images side by side in a reply.">
        <SettingsCard>
          <SelectField
            label={t("prefs.row.imageOnly")}
            hint="Thumbnails are made by this host's daemon."
            value={prefs.images}
            options={[
              { value: "native", label: "As Paseo shows them" },
              { value: "small", label: `${t("prefs.option.small")} thumbnails` },
              { value: "large", label: `${t("prefs.option.large")} thumbnails` },
              { value: "xlarge", label: `${t("prefs.option.xlarge")} thumbnails` },
            ]}
            onChange={(value) => set("images", value)}
          />
          <SwitchField label={t("prefs.row.imageStacks")} hint={t("prefs.hint.imageStacks")} value={prefs.imageStacks === "on"} onChange={(value) => set("imageStacks", value)} />
          {prefs.imageStacks === "on" ? <SelectField label={t("prefs.row.spreadOn")} hint={t("prefs.hint.spreadOn")} value={prefs.imageStackOpen} options={[{ value: "hover", label: t("prefs.option.hover") }, { value: "click", label: t("prefs.option.click") }]} onChange={(value) => set("imageStackOpen", value)} /> : null}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Diagrams" info="Mermaid diagrams in replies, in your theme's colours while Paseo's items are restyled (Look tab).">
        <SettingsCard>
          <SelectField label={t("prefs.row.renderer")} hint={t("prefs.hint.renderer")} value={prefs.diagrams} options={[{ value: "mermaid", label: "Paseo's mermaid" }, { value: "pele", label: "Pele, on this host's daemon" }]} onChange={(value) => set("diagrams", value)} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Rich text" info={restyled ? "How replies draw quotes, tables, code and the rest." : "Applies while Paseo's items are restyled (Look tab, Restyle Paseo)."}>
        <SettingsCard>
          {RICH_TEXT.map((kind) => (
            <SelectField
              key={kind}
              label={t(RICH_TITLES[kind])}
              value={prefs.richText[kind]}
              options={(kind === "table" ? ["a", "b", "c", "d"] : ["a", "b", "c"]).map((value) => ({ value, label: t(`${RICH_OPTION_PREFIX[kind]}.${value}` as MessageKey) }))}
              onChange={(value) => setRich(kind, value)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

// Look tab: Paseo's own items restyled (web and desktop, experimental).
export function PolishLookSettings({ form }: { form: Form }): ReactNode {
  const { prefs, set } = polishEditor(form);
  const restyled = prefs.nativeStyle === "design";
  return (
    <>
      <SettingsSection title="Restyle Paseo (experimental)" info="Chat Polish's design for Paseo's own message box, cards, menus, tool groups and replies, on desktop and web. It works through Paseo's page structure, so a Paseo update can break parts of it.">
        <SettingsCard>
          <SwitchField label="Restyle Paseo's items" value={restyled} onChange={(value) => set("restyle", value)} />
          {restyled ? (
            <>
              <SelectField label="Window" value={prefs.windowStyle} options={[{ value: "paseo", label: "As Paseo draws it" }, { value: "flat", label: t("nav.restyle.window.flat") }, { value: "floating", label: t("nav.restyle.window.floating") }]} onChange={(value) => set("window", value)} />
              <SelectField label={t("prefs.row.loader")} hint={t("prefs.hint.loader")} value={prefs.loader} options={LOADERS.map((loader) => ({ value: loader, label: t(`prefs.loader.${loader}` as MessageKey) }))} onChange={(value) => set("loader", value)} />
              <SelectField label={t("prefs.row.size")} value={prefs.loaderSize} options={[{ value: "s", label: "Small (14)" }, { value: "m", label: "Medium (16)" }, { value: "l", label: "Large (18)" }]} onChange={(value) => set("loaderSize", value)} />
              <SelectField
                label={t("prefs.row.iconSet")}
                hint={`${t("prefs.hint.iconSet")} The first pick downloads the set from npm on this host's daemon.`}
                value={prefs.iconSet}
                options={[{ value: "lucide", label: "Lucide (Paseo's own)" }, { value: "untitled", label: "Untitled UI" }, { value: "hugeicons", label: "Hugeicons" }]}
                onChange={(value) => set("iconSet", value)}
              />
            </>
          ) : null}
          <SelectField label="Code colours" hint="Commands, diffs and JSON in Morphise's chat rows." value={prefs.syntax} options={[...SYNTAX_THEMES.map((theme) => ({ value: theme.id, label: theme.name })), { value: PLAIN_SYNTAX, label: "Plain" }]} onChange={(value) => set("syntax", value)} />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

// Pages tab: agents draw interactive HTML pages in the chat (experimental, off by default).
export function PagesTab(form: Form): ReactNode {
  const { prefs, set } = polishEditor(form);
  const kit = tokens(form.theme, form.compact);
  return (
    <SettingsSection title="HTML pages (experimental)" info="Ask an agent to chart, visualise or mock up something, and it draws an interactive page in the chat. Pages show on desktop and web; phones show the page's name.">
      <SettingsCard>
        <SwitchField label={t("prefs.row.htmlPages")} hint={`${t("prefs.hint.htmlPages")} Morphise runs a local page server on 127.0.0.1 for them.`} value={prefs.html === "on"} onChange={(value) => set("html", value)} />
        {prefs.html === "on" ? <BrowserControl t={kit} /> : null}
      </SettingsCard>
    </SettingsSection>
  );
}

// General tab: whether a newer Morphise is available, and installing it.
export function UpdateSection({ form }: { form: Form }): ReactNode {
  const check = useRpc(checkUpdate);
  const apply = useRpc(applyUpdate);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const run = () => {
    setBusy(true);
    setError(null);
    check({})
      .then(setStatus, (reason: unknown) => setError(String(reason)))
      .finally(() => setBusy(false));
  };
  useEffect(run, []);
  const install = () => {
    setBusy(true);
    apply({})
      // The update runs on the daemon and restarts Morphise when it is done; this screen reloads then.
      .then((result) => (result.error ? (setError(result.error), setBusy(false)) : setStarted(true)), (reason: unknown) => (setError(String(reason)), setBusy(false)));
  };
  const hint = started ? "Updating on this host; Morphise restarts when it is done" : error ?? (status === null ? "Checking" : status.state === "update" ? `${status.current ?? "?"} → ${status.target ?? "?"}` : status.state === "current" ? `Up to date${status.current ? ` (${status.current})` : ""}` : status.state === "local" ? "Installed from a folder: reload it instead" : status.error ?? "Could not check");
  return (
    <SettingsSection title="Updates">
      <SettingsCard>
        {status?.state === "update" ? <SettingsAction label="Update available" hint={hint} actionLabel={started || busy ? "Updating" : "Update"} disabled={started || busy} onPress={install} /> : <SettingsAction label="Morphise" hint={hint} actionLabel={busy ? "Checking" : "Check again"} disabled={busy} onPress={run} />}
        {status?.state === "update" && status.links[0] ? <Text selectable style={{ paddingHorizontal: 16, paddingBottom: 12, fontSize: 12, color: form.theme.colors.foregroundMuted }}>{status.links[0]}</Text> : null}
      </SettingsCard>
    </SettingsSection>
  );
}
