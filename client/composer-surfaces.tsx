import { type PluginNewWorkspace, useComposer, useNewWorkspace } from "@getpaseo/plugin/client";
import { Action, Select, Toggle } from "@getpaseo/plugin/client/ui";
import { useRef, useState } from "react";
import type { Profile } from "../shared/profile";
import { presetChange } from "./preset-change";
import { type ActionDeps, runAction } from "./run-action";

type Control = Profile["composer"]["controls"][number];
type SelectControl = Extract<Control, { kind: "select" }>;
type Preset = Profile["newWorkspace"]["presets"][number];

function SelectControlView({ control }: { control: SelectControl }) {
  const composer = useComposer();
  const current = composer.agent[control.target] ?? "";
  // The picker must show the value in effect even when the profile does not list it.
  const options = control.options.some((option) => option.value === current)
    ? control.options
    : [{ value: current, label: current === "" ? "Default" : current }, ...control.options];
  return (
    <Select
      title={control.title}
      icon={control.icon}
      value={current}
      options={options}
      onValueChange={({ value }) => {
        if (value === "" || value === current) return;
        if (control.target === "model") return composer.setModel(value);
        if (control.target === "mode") return composer.setMode(value);
        return composer.setThinking(value);
      }}
    />
  );
}

export function createComposerControl(control: Control, deps: ActionDeps) {
  return function MorphiseComposerControl() {
    const composer = useComposer();
    if (control.kind === "select") return <SelectControlView control={control} />;
    if (control.kind === "toggle") {
      return (
        <Toggle
          title={control.title}
          icon={control.icon}
          value={composer.agent.metadata[control.metadataKey] === true}
          onValueChange={({ value }) => composer.setMetadata({ [control.metadataKey]: value ? true : null })}
        />
      );
    }
    return (
      <Action
        title={control.title}
        icon={control.icon}
        onPress={() => runAction(control.action, { kind: "composer", composer }, deps)}
      />
    );
  };
}

const NO_PRESET = "";

export function createPresetField(presets: readonly Preset[]) {
  const options = [{ value: NO_PRESET, label: "No preset" }, ...presets.map((preset) => ({ value: preset.id, label: preset.label }))];
  return function MorphisePresetField() {
    const newWorkspace = useNewWorkspace();
    const [chosen, setChosen] = useState(NO_PRESET);
    // The isolation the screen had before any preset; Paseo remounts this item per project.
    const original = useRef(newWorkspace.isolation);
    return (
      <Select
        title="Preset"
        icon="LayoutTemplate"
        value={chosen}
        options={options}
        onValueChange={async ({ value }) => {
          const find = (id: string) => presets.find((item) => item.id === id) ?? null;
          const change = presetChange(find(chosen), find(value), original.current);
          await newWorkspace.setIsolation(change.isolation);
          await newWorkspace.setMetadata(change.metadata as Parameters<PluginNewWorkspace["setMetadata"]>[0]);
          setChosen(value);
        }}
      />
    );
  };
}
