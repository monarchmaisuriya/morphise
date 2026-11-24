import { Text, View } from "react-native";
import { dispatchQuota, type DispatchQuota } from "../shared/dispatch-quota";
import { Button, type Tokens } from "./ui/kit";

export async function readDispatchQuota(providers: { listUsage?: () => Promise<unknown> }, provider: string): Promise<DispatchQuota> {
  if (typeof providers.listUsage !== "function") return { kind: "unavailable", reason: "Update the host to expose provider quota." };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([providers.listUsage(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Provider quota did not respond within 5 seconds.")), 5000); })]);
    return dispatchQuota(value, provider, Date.now());
  } catch (error) { return { kind: "unavailable", reason: error instanceof Error ? error.message : String(error) }; }
  finally { clearTimeout(timer); }
}

export function DispatchQuotaNotice({ t, quota, count, onContinue, onCancel }: { t: Tokens; quota: DispatchQuota; count?: number; onContinue?(): void; onCancel?(): void }) {
  return <View style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: quota.kind === "available" && quota.used >= 80 ? t.c.statusWarning : t.c.border, borderRadius: t.radius.row }}>
    <Text style={t.text.heading}>Provider-reported quota</Text>
    {quota.kind === "unavailable" ? <Text style={t.text.meta}>Unavailable: {quota.reason} This does not block your launch.</Text> : <>
      {quota.windows.map((window) => <Text key={window.label} style={t.text.body}>{window.label}: {window.used.toFixed(0)}% used{window.resetsAt ? ` · resets ${new Date(window.resetsAt).toLocaleString()}` : " · reset unavailable"}</Text>)}
      <Text style={t.text.meta}>Read {new Date(quota.fetchedAt).toLocaleString()}. Provider-level report, not a guarantee of account selection or enough capacity for this batch.</Text>
      {quota.used >= 80 ? <Text style={t.text.body}>{quota.used >= 100 ? "Reported quota exhausted." : "Reported quota is at least 80% used."} {count ?? 0} prompts are waiting. No model or account will be switched.</Text> : null}
    </>}
    {onContinue ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Button t={t} label="Continue anyway" onPress={onContinue} /><Button t={t} variant="ghost" label="Cancel launch" onPress={onCancel!} /></View> : null}
  </View>;
}
