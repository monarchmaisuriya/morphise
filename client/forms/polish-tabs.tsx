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
import { LookPreview, MessagesPreview, PagesPreview, PreviewWidth } from "./previews";
import { ChipRow, type Form, SelectField, SwitchField, TextField } from "./fields";

// Settings for the features ported from Chat Polish and Quote (see NOTICE.md). They live in the
// profile's `chat.polish`; a value equal to its default is removed, so older Morphise versions
// can still read an unchanged profile.

export function polishEditor(form: Form) {
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
        {prefs.merge === "on" ? <SelectField label="Merge only runs of at least" hint="Shorter runs stay as separate rows." value={String(prefs.mergeMin)} options={[2, 3, 5].map((count) => ({ value: String(count), label: `${count} steps` }))} onChange={(value) => set("mergeMin", Number(value) as 2 | 3 | 5)} /> : null}
        <SwitchField label="Failed calls start open" hint="When this is off, failed calls follow the folding rules like any other row." value={prefs.failedOpen} onChange={(value) => set("failedOpen", value)} />
        <SwitchField label="Line numbers in diffs" value={prefs.diffLineNumbers} onChange={(value) => set("diffLineNumbers", value)} />
        <SwitchField label="A folded thought shows its first line" value={prefs.thoughtFirstLine} onChange={(value) => set("thoughtFirstLine", value)} />
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
      <SettingsSection title="Preview" info="A sample chat drawn with the choices below, before they save.">
        <SettingsCard>
          <PreviewWidth theme={form.theme} compact={form.compact}>{(compact) => <MessagesPreview theme={form.theme} prefs={prefs} chat={form.profile.chat} compact={compact} />}</PreviewWidth>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Selection bar" info="Select text in a chat (desktop and web) to quote it into the message box, reply to it, ask a side chat about it, copy it, or bookmark it.">
        <SettingsCard>
          <SwitchField label="Show a bar over selected text" value={prefs.selection === "on"} onChange={(value) => set("selection", value)} />
          {prefs.selection === "on" ? (
            <>
              <ChipRow form={form} label="Buttons" hint="Reply: Enter sends, Ctrl or Cmd+Enter adds to the message box. Side chat: a separate agent beside the chat." chips={SELECTION_ACTIONS.map((action) => ({ key: action, label: ACTION_TITLES[action], on: prefs.selectionActions.includes(action), toggle: () => toggleAction(action) }))} />
              <SelectField label="Buttons show" value={prefs.barButtons} options={[{ value: "both", label: "Icons and labels" }, { value: "icons", label: "Icons only" }]} onChange={(value) => set("barButtons", value)} />
              <SelectField label="Bar position" hint="It moves to the other side when there is no room." value={prefs.barPosition} options={[{ value: "above", label: "Above the selection" }, { value: "below", label: "Below the selection" }]} onChange={(value) => set("barPosition", value)} />
              {prefs.selectionActions.includes("side") ? <TextField form={form} label="Side chat model" hint="Empty: the chat's own model. Otherwise a model id on the chat's provider." placeholder="The chat's own" value={prefs.sideModel} onChange={(value) => set("sideModel", value.trim() || undefined)} error={form.profileError("chat.polish.sideModel")} /> : null}
            </>
          ) : null}
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
          {prefs.images !== "native" || prefs.imageStacks === "on" ? <SelectField label="Thumbnail corners" value={prefs.thumbCorners} options={[{ value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }]} onChange={(value) => set("thumbCorners", value)} /> : null}
          {prefs.imageStacks === "on" ? <SelectField label={t("prefs.row.spreadOn")} hint={t("prefs.hint.spreadOn")} value={prefs.imageStackOpen} options={[{ value: "hover", label: t("prefs.option.hover") }, { value: "click", label: t("prefs.option.click") }]} onChange={(value) => set("imageStackOpen", value)} /> : null}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Hover previews" info="Desktop and web: rest the pointer on a folded tool or thought row to read its content in a floating preview. It closes when the pointer leaves, on scroll, or with Escape.">
        <SettingsCard>
          <SwitchField label="Preview folded rows on hover" value={prefs.hoverPreviews} onChange={(value) => set("hoverPreviews", value)} />
          {prefs.hoverPreviews ? (
            <>
              <SelectField label="Delay" value={String(prefs.hoverDelay)} options={[0, 0.3, 0.5, 1, 1.5, 2, 3, 5, 10].map((seconds) => ({ value: String(seconds), label: seconds === 0 ? "None" : `${seconds} s` }))} onChange={(value) => set("hoverDelay", Number(value))} />
              <SwitchField label="Wrap long lines" hint="Long lines wrap. When this is off, they scroll sideways." value={prefs.previewWrap} onChange={(value) => set("previewWrap", value)} />
              <SwitchField label="Line numbers" value={prefs.previewLineNumbers} onChange={(value) => set("previewLineNumbers", value)} />
              <SwitchField label="Shade every other line" value={prefs.previewStripes} onChange={(value) => set("previewStripes", value)} />
            </>
          ) : null}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Tables" info="Desktop and web: copy Paseo's tables as Markdown, and pick cells to copy or add to the message box. Tables look as Paseo draws them.">
        <SettingsCard>
          <SwitchField label="Copy and cell selection on tables" hint="A copy button at a table's top-left corner. Double-click a cell, or drag across cells (Cmd or Ctrl adds more), then Copy or Add to chat." value={prefs.tableCopy} onChange={(value) => set("tableCopy", value)} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Commands" info="Desktop and web: run a shell command from a reply, as you, in that chat's folder, with live output in the chat. /run followed by a command works everywhere, phones included, in a chat that has replied at least once. The runner is ported from Shell Yeah by Steve Castaneda (MIT).">
        <SettingsCard>
          <SwitchField label="Run buttons on shell code blocks" hint="A Run button beside Copy code on bash, sh and zsh blocks; the output opens under the block. Commands that need administrator rights, delete files, discard changes, force-push or run a script from the internet ask first." value={prefs.runButtons} onChange={(value) => set("runButtons", value)} />
          {prefs.runButtons ? (
            <>
              <SelectField label="Where Run shows output" hint="Under the code block, as in Claude Desktop, or only in the run's card at the end of the chat. Phones always use the card." value={prefs.runOutput} options={[{ value: "block", label: "Under the code block" }, { value: "card", label: "In the chat card" }]} onChange={(value) => set("runOutput", value)} />
              {prefs.runOutput === "block" ? (
                <>
                  <SelectField label="Output lines under the block" hint="More lines scroll inside the panel." value={String(prefs.runLines)} options={[10, 15, 25, 40].map((lines) => ({ value: String(lines), label: `${lines} lines` }))} onChange={(value) => set("runLines", Number(value) as 10 | 15 | 25 | 40)} />
                  <SelectField label="Panel buttons" hint="Icons name themselves when you rest the pointer on them." value={prefs.runPanelButtons} options={[{ value: "icons", label: "Icons" }, { value: "both", label: "Icons and labels" }]} onChange={(value) => set("runPanelButtons", value)} />
                  <SelectField label="Card in the chat while the output is under the block" hint="Hidden in this window only; phones and other windows still show the card. Closing the panel brings the card back." value={prefs.runCard} options={[{ value: "line", label: "One line" }, { value: "hidden", label: "Hidden" }]} onChange={(value) => set("runCard", value)} />
                </>
              ) : null}
            </>
          ) : null}
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
      <SettingsSection title="Look preview" info="A sample window in your theme, window style, loader, icons and code colours, before they save.">
        <SettingsCard>
          <PreviewWidth theme={form.theme} compact={form.compact}>{(compact) => <LookPreview theme={form.theme} prefs={prefs} profileTheme={form.profile.theme} compact={compact} />}</PreviewWidth>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Restyle Paseo (experimental)" info="Chat Polish's design for Paseo's own message box, cards, menus, tool groups and replies, on desktop and web. It works through Paseo's page structure, so a Paseo update can break parts of it.">
        <SettingsCard>
          <SwitchField label="Restyle Paseo's items" value={restyled} onChange={(value) => set("restyle", value)} />
          {restyled ? (
            <>
              <SelectField label="Window" value={prefs.windowStyle} options={[{ value: "paseo", label: "As Paseo draws it" }, { value: "flat", label: t("nav.restyle.window.flat") }, { value: "floating", label: t("nav.restyle.window.floating") }]} onChange={(value) => set("window", value)} />
              {prefs.windowStyle === "floating" ? (
                <>
                  <SelectField label="Corner radius" value={String(prefs.floatingRadius)} options={[8, 10, 16].map((radius) => ({ value: String(radius), label: `${radius} px` }))} onChange={(value) => set("floatingRadius", Number(value) as 8 | 10 | 16)} />
                  <SelectField label="Gap around the chat" value={String(prefs.floatingGap)} options={[4, 8, 12].map((gap) => ({ value: String(gap), label: `${gap} px` }))} onChange={(value) => set("floatingGap", Number(value) as 4 | 8 | 12)} />
                </>
              ) : null}
              <SelectField label="Reply width" hint="How wide the chat column is. Any choice but Paseo's overrides Paseo's own content width (Settings, Appearance)." value={prefs.replyWidth} options={[{ value: "paseo", label: "As Paseo draws it" }, { value: "narrow", label: "Narrow" }, { value: "wide", label: "Wide" }, { value: "full", label: "Full width" }]} onChange={(value) => set("replyWidth", value)} />
              <SelectField label={t("prefs.row.loader")} hint={t("prefs.hint.loader")} value={prefs.loader} options={LOADERS.map((loader) => ({ value: loader, label: t(`prefs.loader.${loader}` as MessageKey) }))} onChange={(value) => set("loader", value)} />
              <SelectField label="Loader colour" value={prefs.loaderColor} options={[{ value: "paseo", label: "As Paseo draws it" }, { value: "accent", label: "Accent" }, { value: "text", label: "Text" }, { value: "muted", label: "Muted" }]} onChange={(value) => set("loaderColor", value)} />
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
    <>
      <SettingsSection title="Preview" info="A sample page as the chat draws it, at the height below.">
        <SettingsCard>
          <PreviewWidth theme={form.theme} compact={form.compact}>{(compact) => <PagesPreview theme={form.theme} prefs={prefs} compact={compact} />}</PreviewWidth>
        </SettingsCard>
      </SettingsSection>
    <SettingsSection title="HTML pages (experimental)" info="Ask an agent to chart, visualise or mock up something, and it draws an interactive page in the chat. Pages show on desktop and web; phones show the page's name.">
      <SettingsCard>
        <SwitchField label={t("prefs.row.htmlPages")} hint={`${t("prefs.hint.htmlPages")} Morphise runs a local page server on 127.0.0.1 for them.`} value={prefs.html === "on"} onChange={(value) => set("html", value)} />
        <SelectField label="Page height" hint="Taller pages scroll inside their frame." value={String(prefs.pageHeight)} options={[{ value: "0", label: "No limit" }, { value: "800", label: "Up to 800 px" }, { value: "500", label: "Up to 500 px" }]} onChange={(value) => set("pageHeight", Number(value) as 500 | 800 | 0)} />
        {prefs.html === "on" ? <BrowserControl t={kit} /> : null}
      </SettingsCard>
    </SettingsSection>
    </>
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
