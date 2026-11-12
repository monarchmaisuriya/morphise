// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/dashboard/prefs-editor.tsx (HtmlSwitch's browser row)
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { browserStatus, installBrowser, removeBrowser, type BrowserStatus } from "../../../shared/polish/html";
import { Button, type Tokens } from "../../ui/kit";
import { useT } from "../i18n";

const mb = (bytes: number) => Math.round(bytes / 1e6);
// The download runs on the daemon as a background job (every RPC has a 30 s deadline); this is how
// often its progress is read while it runs.
const POLL_MS = 500;

/**
 * The optional headless browser HTML pages are checked in before they show: what it is and where it
 * stands, with Download (or Retry), its progress while it downloads, and Remove. Without it pages
 * show unchecked and agents get no html_preview.
 */
export function BrowserControl({ t }: { t: Tokens }) {
  const tr = useT();
  const read = useRpc(browserStatus);
  const install = useRpc(installBrowser);
  const remove = useRpc(removeBrowser);
  const [status, setStatus] = useState<BrowserStatus>();
  const [error, setError] = useState<string>();
  // Shown, with Refresh, until a call succeeds; a failed poll stops polling rather than retrying behind the user's back.
  const failed = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const done = (next: BrowserStatus) => {
    setError(undefined);
    setStatus(next);
  };
  useEffect(() => void read({}).then(done, failed), [read]);
  useEffect(() => {
    if (status?.state !== "downloading" || error) return;
    const timer = setTimeout(() => read({}).then(done, failed), POLL_MS);
    return () => clearTimeout(timer);
  }, [status, error, read]);
  const hint = error
    ? error
    : !status
      ? tr("prefs.browser.checking")
      : {
          installed: tr("prefs.browser.installed", { version: status.version }),
          downloading:
            status.total && status.received === status.total
              ? tr("prefs.browser.unpacking")
              : tr("prefs.browser.downloading", {
                  received: mb(status.received ?? 0),
                  total: status.total ? tr("prefs.browser.downloadingTotal", { total: mb(status.total) }) : "",
                }),
          missing: tr("prefs.browser.missing"),
          failed: tr("prefs.browser.failed", { error: status.error ?? "" }),
          unsupported: tr("prefs.browser.unsupported"),
        }[status.state];
  const percent = status?.total ? Math.floor(((status.received ?? 0) / status.total) * 100) : undefined;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
      <Text style={[t.text.meta, { flex: 1, color: error || status?.state === "failed" ? t.c.statusDanger : t.c.foregroundMuted }]}>{hint}</Text>
      {error ? (
        <Button t={t} icon="RotateCw" label={tr("prefs.button.refresh")} onPress={() => void read({}).then(done, failed)} />
      ) : status?.state === "downloading" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityRole="progressbar" accessibilityValue={percent === undefined ? undefined : { min: 0, max: 100, now: percent }}>
          <ActivityIndicator size="small" color={t.c.accent} />
          {percent !== undefined ? <Text style={[t.text.meta, { fontVariant: ["tabular-nums"] }]}>{`${percent}%`}</Text> : null}
        </View>
      ) : status?.state === "installed" ? (
        <Button t={t} icon="Trash2" label={tr("prefs.button.remove")} onPress={() => void remove({}).then(done, failed)} />
      ) : status?.state === "missing" || status?.state === "failed" ? (
        <Button
          t={t}
          icon={status.state === "failed" ? "RotateCw" : "ArrowDownToLine"}
          label={status.state === "failed" ? tr("prefs.button.retry") : tr("prefs.button.download")}
          onPress={() => void install({}).then(done, failed)}
        />
      ) : null}
    </View>
  );
}
