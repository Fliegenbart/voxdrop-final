import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

type InviteState = "idle" | "accepting" | "accepted" | "error";

export default function WorkspaceInvite() {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const [state, setState] = useState<InviteState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const token = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token")
    : null;

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let cancelled = false;
    const acceptInvite = async () => {
      setState("accepting");
      setMessage(null);
      try {
        const response = await fetch("/api/workspaces/invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Einladung konnte nicht angenommen werden.");
        }
        if (cancelled) return;
        setState("accepted");
        setMessage("Einladung angenommen. Sie haben jetzt Zugriff auf den Workspace.");
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : "Einladung konnte nicht angenommen werden.");
      }
    };

    acceptInvite();
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, location]);

  return (
    <PageLayout>
      <SEO title="Workspace-Einladung | VoxDrop" description="Workspace-Einladung annehmen." />

      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Workspace-Einladung</h1>

          {!token && (
            <p className="mt-4 text-slate-600">
              Dieser Einladungslink ist ungültig. Bitte prüfen Sie die URL.
            </p>
          )}

          {token && !isAuthenticated && (
            <>
              <p className="mt-4 text-slate-600">
                Bitte anmelden, um die Einladung anzunehmen.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Link href="/login">
                  <Button>Jetzt anmelden</Button>
                </Link>
                <Link href="/register">
                  <Button variant="outline">Registrieren</Button>
                </Link>
              </div>
            </>
          )}

          {token && isAuthenticated && (
            <>
              {state === "accepting" && (
                <p className="mt-4 text-slate-600">Einladung wird angenommen...</p>
              )}
              {(state === "accepted" || state === "error") && (
                <p className={`mt-4 ${state === "accepted" ? "text-emerald-700" : "text-red-600"}`}>
                  {message}
                </p>
              )}
              {state === "accepted" && (
                <div className="mt-6">
                  <Link href="/documents">
                    <Button>Zu den Dokumenten</Button>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </PageLayout>
  );
}

