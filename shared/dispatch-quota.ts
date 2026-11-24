import { z } from "zod";

const percent = z.number().finite().min(0).max(100);
const windowSchema = z.object({ label: z.string(), usedPct: percent.nullish(), remainingPct: percent.nullish(), resetsAt: z.string().nullish() });
const reportSchema = z.object({ fetchedAt: z.string(), providers: z.array(z.object({ providerId: z.string(), displayName: z.string(), status: z.string(), fetchedAt: z.string().nullish(), windows: z.array(windowSchema), error: z.string().nullish() })) });
export type DispatchQuota = { kind: "available"; provider: string; used: number; fetchedAt: number; windows: { label: string; used: number; resetsAt: string | null }[] } | { kind: "unavailable"; reason: string };
export function dispatchQuota(input: unknown, provider: string, now: number): DispatchQuota {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { kind: "unavailable", reason: "The host returned an unsupported or invalid usage report." };
  const matches = parsed.data.providers.filter((value) => value.providerId === provider);
  if (matches.length !== 1) return { kind: "unavailable", reason: "No unambiguous usage report for this provider." };
  const report = matches[0]!;
  if (report.status !== "available") return { kind: "unavailable", reason: report.error || "This provider does not report quota." };
  const fetchedAt = Date.parse(report.fetchedAt ?? "");
  if (!Number.isFinite(fetchedAt) || fetchedAt > now + 30000 || now - fetchedAt > 300000) return { kind: "unavailable", reason: "Provider quota is stale or has no valid timestamp." };
  if (report.windows.some((value) => value.usedPct != null && value.remainingPct != null && Math.abs(value.usedPct + value.remainingPct - 100) > 1)) return { kind: "unavailable", reason: "Provider quota percentages disagree." };
  const windows = report.windows.flatMap((value) => {
    const used = value.usedPct ?? (value.remainingPct == null ? null : 100 - value.remainingPct);
    return used == null ? [] : [{ label: value.label, used, resetsAt: value.resetsAt && Number.isFinite(Date.parse(value.resetsAt)) ? value.resetsAt : null }];
  });
  if (!windows.length) return { kind: "unavailable", reason: "No percentage-based quota windows for this provider." };
  return { kind: "available", provider, fetchedAt, used: Math.max(...windows.map((value) => value.used)), windows };
}
