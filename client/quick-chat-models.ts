import { modelChoices } from "./dispatch-options";

export interface QuickChatModelChoice { value: string; label: string; accessibleLabel: string; iconSvg?: string; disambiguator?: string; }

export function quickChatModelChoices(entries: readonly unknown[]): QuickChatModelChoice[] {
  const choices = modelChoices(entries, []);
  return choices.map((choice) => {
    const entry = entries.find((value) => (value as { provider?: string })?.provider === choice.provider) as { label?: string; iconSvg?: string; models?: { id: string; label?: string }[] } | undefined;
    const id = choice.value.slice(choice.provider.length + 1);
    const model = entry?.models?.find((value) => value.id === id);
    const label = model?.label || id;
    const duplicate = choices.some((other) => {
      if (other.value === choice.value) return false;
      const provider = entries.find((value) => (value as { provider?: string })?.provider === other.provider) as { models?: { id: string; label?: string }[] } | undefined;
      const otherId = other.value.slice(other.provider.length + 1);
      return (provider?.models?.find((value) => value.id === otherId)?.label || otherId) === label;
    });
    return { value: choice.value, label, accessibleLabel: `${entry?.label || choice.provider} · ${label}`, ...(entry?.iconSvg ? { iconSvg: entry.iconSvg } : {}), ...(duplicate ? { disambiguator: choice.provider } : {}) };
  });
}
