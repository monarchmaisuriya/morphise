import { createElement, useEffect, useId, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, Text, View } from "react-native";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { channelAt, colorHex, colorProblem, colorValue, type ColorValue } from "../../shared/color-value";
import { changeColorChannel, createColorCommit } from "./color-edit";
import { Button, Field, Icon, IconButton, type Tokens } from "./kit";
import { createValueStore, useValue } from "../profile-store";

const expandedColor = createValueStore<string | null>(null);

function ChannelInput({ t, label, value, opacity, onChange, disabled }: { t: Tokens; label: string; value: number; opacity: boolean; onChange(value: number): void; disabled: boolean }) {
  const shown = opacity ? Math.round(value / 255 * 100) : value;
  const [text, setText] = useState(String(shown));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(shown)); }, [shown, focused]);
  const maximum = opacity ? 100 : 255;
  const valid = /^\d{1,3}$/.test(text) && Number(text) <= maximum;
  return <View style={{ gap: 2 }}><TextInput editable={!disabled} accessibilityLabel={`${label}, 0 to ${maximum}${opacity ? " percent" : ""}`} value={text} keyboardType="number-pad" onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setText(String(shown)); }} onChangeText={(next) => {
    setText(next);
    if (/^\d{1,3}$/.test(next) && Number(next) <= maximum) onChange(opacity ? Math.round(Number(next) / 100 * 255) : Number(next));
  }} style={{ color: t.c.foreground, backgroundColor: t.c.surface1, borderColor: focused && !valid ? t.c.statusDanger : t.c.border, borderWidth: 1, borderRadius: t.radius.control, width: 56, minHeight: t.compact ? 44 : 32, textAlign: "center" }} />{focused && !valid ? <Text style={t.text.danger}>0–{maximum}</Text> : null}</View>;
}

function SystemColor({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) {
  return createElement("input", { type: "color", disabled, value: colorHex(colorValue(value) ?? { red: 128, green: 128, blue: 128, alpha: 255 }).toLowerCase(), "aria-label": "System color picker", onInput: (event: { currentTarget: { value: string } }) => {
    const next = colorValue(event.currentTarget.value);
    const previous = colorValue(value);
    if (next) onChange(colorHex({ ...next, alpha: previous?.alpha ?? 255 }, value.trim().length === 9));
  }, style: { width: 32, height: 32, padding: 0, border: "none", background: "transparent" } });
}

export function ColorSwatch({ t, value }: { t: Tokens; value: string }) {
  const parsed = colorValue(value);
  return (
    <View accessibilityLabel={parsed ? `Color ${value}` : value ? "Invalid color" : "Default color"} style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: t.c.foregroundMuted, overflow: "hidden", backgroundColor: t.c.surface2 }}>
      {parsed ? <>
        <View style={{ position: "absolute", top: 0, left: 0, width: 8, height: 8, backgroundColor: t.c.foreground }} />
        <View style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, backgroundColor: t.c.foreground }} />
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(${parsed.red},${parsed.green},${parsed.blue},${parsed.alpha / 255})` }} />
      </> : <Icon name="Slash" size={14} color={value ? t.c.statusDanger : t.c.foregroundMuted} />}
    </View>
  );
}

function ChannelTrack({ t, channel, value, onChange, disabled }: { t: Tokens; channel: keyof ColorValue; value: ColorValue; onChange(value: number): void; disabled: boolean }) {
  const track = useRef<View>(null);
  const frame = useRef({ x: 0, width: 0 });
  const latest = useRef(onChange);
  latest.current = onChange;
  const locked = useRef(disabled);
  locked.current = disabled;
  const update = (pageX: number) => {
    const next = channelAt(pageX - frame.current.x, frame.current.width);
    if (next !== null && !locked.current) latest.current(next);
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !locked.current && frame.current.width > 0,
    onMoveShouldSetPanResponder: () => !locked.current && frame.current.width > 0,
    onPanResponderGrant: (event) => { const pageX = event.nativeEvent.pageX; track.current?.measureInWindow((x, _y, width) => { frame.current = { x, width }; update(pageX); }); },
    onPanResponderMove: (event) => update(event.nativeEvent.pageX),
    onPanResponderTerminationRequest: () => true,
  })).current;
  const label = { red: "Red", green: "Green", blue: "Blue", alpha: "Opacity" }[channel];
  const current = value[channel];
  const adjust = (delta: number) => { if (!disabled) onChange(Math.max(0, Math.min(255, current + delta))); };
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[t.text.label, { flex: 1 }]}>{label}</Text>
        <IconButton t={t} icon="Minus" label={`Decrease ${label}`} disabled={disabled} onPress={() => adjust(-1)} />
        <ChannelInput t={t} label={label} value={current} opacity={channel === "alpha"} onChange={onChange} disabled={disabled} />
        <IconButton t={t} icon="Plus" label={`Increase ${label}`} disabled={disabled} onPress={() => adjust(1)} />
      </View>
      <View ref={track} {...responder.panHandlers} onLayout={() => track.current?.measureInWindow((x, _y, width) => { frame.current = { x, width }; })} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 255, now: current }} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === "increment" ? 1 : -1)} style={{ height: 44, justifyContent: "center" }}>
        <View pointerEvents="none" style={{ height: 16, flexDirection: "row", borderRadius: 6, overflow: "hidden" }}>
          {Array.from({ length: 32 }, (_, index) => <View key={index} style={{ flex: 1, backgroundColor: colorHex({ ...value, [channel]: Math.round(index / 31 * 255) }, channel === "alpha") }} />)}
        </View>
        <View pointerEvents="none" style={{ position: "absolute", left: `${current / 255 * 100}%`, marginLeft: -6, width: 12, height: 24, borderRadius: 6, borderWidth: 2, borderColor: t.c.foreground, backgroundColor: t.c.surface0 }} />
      </View>
    </View>
  );
}

export function ColorField({ t, label, value, onApply, onTextChange, lengths = [6], resetLabel, onReset, error }: { t: Tokens; label: string; value: string; onApply(value: string): void | Promise<void>; onTextChange?(value: string): void; lengths?: readonly number[]; resetLabel?: string; onReset?(): void | Promise<void>; error?: string | null }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const original = useRef(value);
  const id = useId();
  const expanded = useValue(expandedColor);
  useEffect(() => { if (expanded !== id) setOpen(false); }, [expanded, id]);
  const commit = useRef(createColorCommit()).current;
  useEffect(() => { setText(value); }, [value]);
  const stale = open && value !== original.current;
  const allowAlpha = lengths.includes(8);
  const validation = colorProblem(open ? draft : text, lengths, !!onReset);
  const apply = (next: string, reset = false) => {
    if (busy || (open && stale)) return;
    if (!reset && colorProblem(next, lengths, !!onReset)) return setProblem(colorProblem(next, lengths, !!onReset));
    setBusy(true);
    setProblem(null);
    const clearing = reset || (!next.trim() && !!onReset);
    void commit(() => clearing ? onReset?.() : next === value ? undefined : onApply(next)).then((done) => { if (done) { setOpen(false); setText(clearing ? "" : next); } }, (caught: unknown) => setProblem(caught instanceof Error ? caught.message : String(caught))).finally(() => setBusy(false));
  };
  const preview = open ? draft : text;
  const channels = colorValue(draft) ?? { red: 128, green: 128, blue: 128, alpha: 255 };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label} color`} accessibilityState={{ expanded: open, disabled: busy }} disabled={busy} onPress={() => { if (open) { setOpen(false); return; } original.current = value; setDraft(text); setProblem(null); expandedColor.set(id); setOpen(true); }} style={{ minWidth: t.compact ? 44 : 32, minHeight: t.compact ? 44 : 32, alignItems: "center", justifyContent: "center" }}><ColorSwatch t={t} value={preview} /></Pressable>
        <View style={{ flex: 1, minWidth: 120 }}><Field t={t} plain disabled={busy || open} value={text} accessibilityLabel={`${label} hex color`} placeholder={onReset ? resetLabel ?? "Default" : "#8E4EC6"} onChangeText={(next) => { setText(next); setProblem(null); onTextChange?.(next); }} onSubmit={() => apply(text.trim())} /></View>
        {!onTextChange && text !== value ? <Button t={t} label="Apply" disabled={busy || !!validation} onPress={() => apply(text.trim())} /> : null}
        {onReset && value ? <IconButton t={t} icon="RotateCcw" label={resetLabel ?? `Reset ${label}`} disabled={busy} onPress={() => apply("", true)} /> : null}
      </View>
      {open ? <View pointerEvents={busy ? "none" : "auto"} accessibilityState={{ busy }} style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.card, backgroundColor: t.c.surface1 }}>
        <Text style={t.text.heading}>{label}</Text>
        {Platform.OS === "web" ? <SystemColor value={draft} onChange={setDraft} disabled={busy || stale} /> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><ColorSwatch t={t} value={draft} /><View style={{ flex: 1 }}><Field t={t} plain disabled={busy} accessibilityLabel={`${label} picker hex color`} value={draft} onChangeText={setDraft} placeholder="#8E4EC6" /></View></View>
        {(["red", "green", "blue", ...(allowAlpha ? ["alpha"] : [])] as (keyof ColorValue)[]).map((channel) => <ChannelTrack key={channel} t={t} channel={channel} value={channels} disabled={busy || stale} onChange={(next) => setDraft((current) => changeColorChannel(current, channel, next, allowAlpha))} />)}
        {stale ? <Text style={t.text.danger}>This color changed elsewhere. Close and reopen to edit the latest value.</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}><Button t={t} label="Cancel" disabled={busy} onPress={() => { setOpen(false); setProblem(null); }} /><Button t={t} label={busy ? "Saving…" : "Apply color"} variant="primary" disabled={busy || stale || !!validation} onPress={() => apply(draft.trim())} /></View>
      </View> : null}
      {problem || error || (preview && validation) ? <Text style={t.text.danger}>{problem ?? error ?? validation}</Text> : null}
    </View>
  );
}
