import { useEffect, useMemo, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, UploadCloud } from "lucide-react";

type ProxyInfo = {
  status: "ready";
  maxBytes: number;
  info?: string;
};

type ProxyPostResult = {
  ok: boolean;
  id: string;
  received: number;
  expected: number;
  contentType: string;
  contentLength: number | null;
  match: boolean | null;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i >= 2 ? 1 : 0;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export default function ProxyTest() {
  const { toast } = useToast();
  const [info, setInfo] = useState<ProxyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [testMb, setTestMb] = useState(50);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProxyPostResult | null>(null);

  const maxBytes = info?.maxBytes || 0;
  const maxHuman = useMemo(() => formatBytes(maxBytes), [maxBytes]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/proxy-test", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error || "Proxy-Test nicht verfügbar");
        }
        return r.json() as Promise<ProxyInfo>;
      })
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
      })
      .catch((err) => {
        if (cancelled) return;
        toast({ title: err instanceof Error ? err.message : "Proxy-Test nicht verfügbar", variant: "destructive" });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const runTest = async () => {
    const bytes = Math.max(1, Math.round(testMb * 1024 * 1024));
    setRunning(true);
    setProgress(0);
    setResult(null);

    try {
      // Allocate a buffer of the desired size. This is intentionally simple and deterministic.
      setProgress(10);
      const payload = new Uint8Array(bytes);
      // A small non-zero pattern helps avoid rare proxy "all-zero" heuristics.
      for (let i = 0; i < payload.length; i += 1024 * 1024) payload[i] = 7;
      setProgress(30);

      const res = await fetch("/api/proxy-test", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Test-Size": String(bytes),
        },
        body: payload,
      });

      setProgress(70);

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        throw new Error(data?.error || `Proxy-Test fehlgeschlagen (${res.status})`);
      }

      setResult(data as ProxyPostResult);
      setProgress(100);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Proxy-Test fehlgeschlagen", variant: "destructive" });
      setProgress(0);
    } finally {
      setRunning(false);
    }
  };

  return (
    <PageLayout>
      <SEO
        title="Proxy-Test"
        description="Interner Upload-Limit Test für Proxies und Gateways. Zeigt die maximale Upload-Größe und prüft, ob Uploads durchkommen."
        canonical="/tools/proxy-test"
      />

      <main className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium mb-4">
            <ShieldCheck className="w-4 h-4" />
            Proxy-Test (intern)
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-2">Upload-Limit prüfen</h1>
          <p className="text-slate-600">
            Zeigt, wie viel wir über deinen Proxy/Dein Gateway hochladen können. Dieser Test erfordert Login.
          </p>
        </header>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Maximaler Upload (Server-Limit)</div>
              <div className="text-xl font-semibold text-slate-900">
                {loading ? "Lade..." : maxBytes ? maxHuman : "Unbekannt"}
              </div>
            </div>
            <UploadCloud className="w-8 h-8 text-slate-400" />
          </div>

          {info?.info && <p className="text-sm text-slate-600">{info.info}</p>}

          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <label className="text-sm text-slate-700 flex items-center gap-2">
              Testgröße (MB)
              <input
                type="number"
                min={1}
                max={Math.max(1, Math.floor(maxBytes / (1024 * 1024)) || 450)}
                value={testMb}
                onChange={(e) => setTestMb(Number(e.target.value) || 1)}
                className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
                disabled={running}
              />
            </label>
            <Button onClick={runTest} disabled={running || !maxBytes}>
              {running ? "Test läuft..." : "Upload testen"}
            </Button>
          </div>

          {running && (
            <div className="space-y-2">
              <Progress value={progress} />
              <div className="text-xs text-slate-500">Bitte Tab offen lassen. Upload kann je nach Leitung dauern.</div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="font-medium text-slate-900 mb-1">Ergebnis</div>
              <div className="text-slate-700">Expected: {formatBytes(result.expected)}</div>
              <div className="text-slate-700">Received: {formatBytes(result.received)}</div>
              <div className="text-slate-700">Match: {String(result.match)}</div>
              <div className="text-xs text-slate-500 mt-2">Request-ID: {result.id}</div>
            </div>
          )}
        </div>
      </main>

    </PageLayout>
  );
}

