import { SettingsInput, SettingsRow } from "@getpaseo/plugin/client/ui";
import { Platform } from "react-native";
import { ColorField } from "../ui/color-field";
import { tokens } from "../ui/kit";
import type { Form } from "./fields";

export function ColorSetting({ form, label, value, onChange, error, hint, lengths = [6], resetLabel }: { form: Form; label: string; value: string; onChange(value: string): void; error: string | null; hint?: string; lengths?: readonly number[]; resetLabel?: string }) {
  if (Platform.OS !== "web") return <SettingsInput key={`${form.inputKey}:${label}`} label={label} hint={hint} initialValue={value} onChangeText={onChange} error={error} placeholder={resetLabel ? "As Paseo shows it" : "#1e1e2e"} />;
  return <SettingsRow label={label} hint={hint} error={error}><ColorField key={`${form.inputKey}:${label}`} t={tokens(form.theme, form.compact)} label={label} value={value} lengths={lengths} onApply={onChange} onTextChange={onChange} onReset={resetLabel ? () => onChange("") : undefined} resetLabel={resetLabel} /></SettingsRow>;
}
