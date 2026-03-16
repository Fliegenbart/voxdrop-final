import { useState, useEffect } from "react";
import {
  Sparkles, User, Shield, Download, Trash2, AlertCircle, Check,
  Lock, Eye, EyeOff, QrCode, Copy, LogOut, ChevronRight, Building2, Mail, BarChart3, Crown,
  Video, Clock, Loader2, Users, PartyPopper
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { useAgencyMode } from "@/lib/agency-mode";
import { InsightsDashboard } from "@/components/InsightsDashboard";
import { Switch } from "@/components/ui/switch";
import { SEO } from "@/components/SEO";
import { WorkspaceSettings } from "@/components/settings/WorkspaceSettings";

export default function Settings() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { user, usage, isAuthenticated, isLoading: authLoading, logout, refreshUser } = useAuth();

  // Check for checkout success
  const searchParams = new URLSearchParams(searchString);
  const checkoutSuccess = searchParams.get("checkout") === "success";
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);

  useEffect(() => {
    if (checkoutSuccess) {
      setShowCheckoutSuccess(true);
      // Refresh user to get updated subscription
      refreshUser();
      // Clear the URL parameter after showing
      window.history.replaceState({}, "", "/settings");
    }
  }, [checkoutSuccess, refreshUser]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login?next=" + encodeURIComponent("/settings"));
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const [activeSection, setActiveSection] = useState<"profile" | "security" | "recordings" | "workspace" | "insights" | "data" | "delete">("profile");
  const isPremium = user?.subscription !== "free";

  // Handle URL hash for direct navigation (e.g., /settings#insights)
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "insights" || hash === "dashboard") {
      setActiveSection("insights");
    } else if (hash === "security") {
      setActiveSection("security");
    } else if (hash === "recordings" || hash === "aufnahmen") {
      setActiveSection("recordings");
    } else if (hash === "data") {
      setActiveSection("data");
    } else if (hash === "profile") {
      setActiveSection("profile");
    } else if (hash === "workspace" || hash === "team") {
      setActiveSection("workspace");
    }
  }, []);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin w-8 h-8 text-slate-400 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-600">Wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-page-bg">
      <SEO
        title="Einstellungen"
        description="Kontoeinstellungen und Sicherheit."
        noIndex={true}
      />
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-slate-200/50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-700 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-semibold text-slate-900 tracking-tight">VoxDrop</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
              Zurück zur App
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin/blog" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                Blog Editor
              </Link>
            )}
            <button
              onClick={() => logout().then(() => setLocation("/"))}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Abmelden
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Checkout Success Banner */}
        {showCheckoutSuccess && (
          <div className="mb-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <PartyPopper className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-green-800 mb-1">
                  Willkommen bei VoxDrop Premium!
                </h2>
                <p className="text-green-700">
                  Ihr Abo ist jetzt aktiv. Alle Premium-Features stehen Ihnen ab sofort zur Verfügung.
                  Viel Erfolg bei der barrierefreien Gestaltung Ihrer Dokumente!
                </p>
                <button
                  onClick={() => setShowCheckoutSuccess(false)}
                  className="mt-3 text-sm text-green-600 hover:text-green-800 underline"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        )}

        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-8">Einstellungen</h1>

        <div className="grid md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <SidebarButton
                icon={User}
                label="Profil"
                active={activeSection === "profile"}
                onClick={() => setActiveSection("profile")}
              />
              <SidebarButton
                icon={Shield}
                label="Sicherheit"
                active={activeSection === "security"}
                onClick={() => setActiveSection("security")}
              />
              <SidebarButton
                icon={Video}
                label="Aufnahmen"
                active={activeSection === "recordings"}
                onClick={() => setActiveSection("recordings")}
              />
              <SidebarButton
                icon={Users}
                label="Workspace"
                active={activeSection === "workspace"}
                onClick={() => setActiveSection("workspace")}
              />
              <SidebarButton
                icon={BarChart3}
                label="Insights"
                active={activeSection === "insights"}
                onClick={() => setActiveSection("insights")}
                premium={!isPremium}
              />
              <SidebarButton
                icon={Download}
                label="Datenexport"
                active={activeSection === "data"}
                onClick={() => setActiveSection("data")}
              />
              <SidebarButton
                icon={Trash2}
                label="Konto löschen"
                active={activeSection === "delete"}
                onClick={() => setActiveSection("delete")}
                danger
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="md:col-span-3">
            {activeSection === "profile" && (
              <ProfileSection user={user} usage={usage} />
            )}
            {activeSection === "security" && (
              <SecuritySection user={user} onUpdate={refreshUser} />
            )}
            {activeSection === "recordings" && (
              <RecordingsSection />
            )}
            {activeSection === "workspace" && (
              <WorkspaceSettings />
            )}
            {activeSection === "insights" && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-slate-900">Barrierefreiheits-Insights</h2>
                  {isPremium && (
                    <span className="flex items-center gap-1 text-xs bg-gradient-to-r from-violet-600 to-purple-700 text-white px-2 py-1 rounded-full">
                      <Crown className="w-3 h-3" />
                      Pro
                    </span>
                  )}
                </div>
                <InsightsDashboard isPremium={isPremium} />
              </div>
            )}
            {activeSection === "data" && (
              <DataExportSection />
            )}
            {activeSection === "delete" && (
              <DeleteAccountSection onDeleted={() => logout().then(() => setLocation("/"))} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function SidebarButton({
  icon: Icon,
  label,
  active,
  onClick,
  danger,
  premium
}: {
  icon: typeof User;
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
  premium?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        active
          ? danger
            ? "bg-red-50 text-red-700"
            : premium
              ? "bg-purple-50 text-purple-700"
              : "bg-violet-50 text-violet-700"
          : danger
            ? "text-red-600 hover:bg-red-50"
            : premium
              ? "text-purple-600 hover:bg-purple-50"
              : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
      {premium && <Crown className="w-3 h-3 ml-1" />}
      {active && <ChevronRight className="w-4 h-4 ml-auto" />}
    </button>
  );
}

function ProfileSection({ user, usage }: { user: any; usage: any }) {
  const { isAgencyMode, setAgencyMode } = useAgencyMode();
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Profil</h2>

        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-full flex items-center justify-center">
              <span className="text-white text-lg font-semibold">
                {user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-slate-900">{user.email}</p>
              <p className="text-sm text-slate-600">
                Mitglied seit {new Date(user.createdAt).toLocaleDateString("de-DE")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2 text-slate-600 mb-1">
                <Mail className="w-4 h-4" />
                <span className="text-sm">E-Mail</span>
              </div>
              <p className="font-medium text-slate-900">{user.email}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2 text-slate-600 mb-1">
                <Building2 className="w-4 h-4" />
                <span className="text-sm">Organisation</span>
              </div>
              <p className="font-medium text-slate-900">{user.organization || "Nicht angegeben"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Behörden-Modus</h2>
        <p className="text-sm text-slate-600 mb-6">
          Aktiviert strengere, barrierefreie Voreinstellungen und Behörden-Checklisten in den Tools.
        </p>
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="font-medium text-slate-900">Behörden-Profil</p>
            <p className="text-xs text-slate-600">BITV/EN‑301‑549 Fokus, strengere Defaults</p>
          </div>
          <Switch
            checked={isAgencyMode}
            onCheckedChange={setAgencyMode}
            aria-label="Behörden-Modus aktivieren"
          />
        </div>
      </div>

      {/* Usage Stats */}
      {usage && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Nutzung diesen Monat</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-violet-50 rounded-xl">
              <p className="text-sm text-violet-600 mb-1">Transkriptionen</p>
              <p className="text-2xl font-semibold text-slate-900">
                {usage.transcriptions} <span className="text-lg text-slate-400">/ {usage.limits.transcriptions === -1 ? "∞" : usage.limits.transcriptions}</span>
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl">
              <p className="text-sm text-purple-600 mb-1">Videos</p>
              <p className="text-2xl font-semibold text-slate-900">
                {usage.videos} <span className="text-lg text-slate-400">/ {usage.limits.videos === -1 ? "∞" : usage.limits.videos}</span>
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-600">
            Abo: <span className="font-medium text-slate-700">{user.subscription === "free" ? "Kostenlos" : user.subscription}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function SecuritySection({ user, onUpdate }: { user: any; onUpdate: () => void }) {
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaData, setMfaData] = useState<{ qrCode: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const initMfaSetup = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        setMfaData({ qrCode: data.qrCode, secret: data.secret });
        setShowMfaSetup(true);
      } else {
        const data = await response.json();
        setError(data.error || "MFA-Setup fehlgeschlagen");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyMfa = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ code: mfaCode })
      });

      if (response.ok) {
        setSuccess("2FA erfolgreich aktiviert!");
        setShowMfaSetup(false);
        setMfaData(null);
        setMfaCode("");
        onUpdate();
      } else {
        const data = await response.json();
        setError(data.error || "Code ungültig");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsLoading(false);
    }
  };

  const disableMfa = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ password: disablePassword })
      });

      if (response.ok) {
        setSuccess("2FA erfolgreich deaktiviert");
        setDisablePassword("");
        onUpdate();
      } else {
        const data = await response.json();
        setError(data.error || "Deaktivierung fehlgeschlagen");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Zwei-Faktor-Authentifizierung (2FA)</h2>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 mb-4">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl text-green-700 mb-4">
            <Check className="w-5 h-5" />
            <p className="text-sm">{success}</p>
          </div>
        )}

        {!user.mfaEnabled ? (
          !showMfaSetup ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
                <Shield className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">2FA ist nicht aktiviert</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Schuetzen Sie Ihr Konto mit einem zusätzlichen Sicherheitsfaktor.
                  </p>
                </div>
              </div>

              <button
                onClick={initMfaSetup}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                2FA aktivieren
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl">
                <p className="text-sm text-violet-700">
                  Scannen Sie den QR-Code mit Ihrer Authenticator-App (z.B. Google Authenticator, Authy).
                </p>
              </div>

              {mfaData && (
                <div className="flex flex-col items-center gap-4">
                  <img src={mfaData.qrCode} alt="QR Code" className="w-48 h-48 border rounded-xl" />

                  <div className="flex items-center gap-2 p-3 bg-slate-100 rounded-lg">
                    <code className="text-sm font-mono">{mfaData.secret}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(mfaData.secret)}
                      className="text-slate-600 hover:text-slate-700"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="w-full max-w-xs">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Bestätigen Sie mit einem Code
                    </label>
                    <input
                      type="text"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center text-2xl tracking-widest font-mono"
                      placeholder="000000"
                      maxLength={6}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowMfaSetup(false);
                        setMfaData(null);
                        setMfaCode("");
                      }}
                      className="px-4 py-2 text-slate-600 hover:text-slate-900"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={verifyMfa}
                      disabled={isLoading || mfaCode.length !== 6}
                      className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                    >
                      Aktivieren
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-green-50 border border-green-100 rounded-xl">
              <Shield className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">2FA ist aktiviert</p>
                <p className="text-sm text-green-700 mt-1">
                  Ihr Konto ist durch Zwei-Faktor-Authentifizierung geschützt.
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-slate-600 mb-3">
                Um 2FA zu deaktivieren, geben Sie Ihr Passwort ein:
              </p>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg"
                  placeholder="Ihr Passwort"
                />
                <button
                  onClick={disableMfa}
                  disabled={isLoading || !disablePassword}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Deaktivieren
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataExportSection() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/user/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `voxdrop-daten-export-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setPassword("");
      } else {
        const data = await response.json();
        setError(data.error || "Export fehlgeschlagen");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Datenexport</h2>
      <p className="text-slate-600 mb-6">
        Gemäß Art. 20 DSGVO können Sie alle Ihre Daten als JSON-Datei herunterladen.
      </p>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 mb-4">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl mb-6">
        <p className="text-sm text-violet-700">
          <strong>Enthaltene Daten:</strong> Profil, Nutzungsstatistiken, Sessions, Audit-Logs
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Passwort zur Bestätigung
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-12 py-3 border border-slate-200 rounded-xl"
              placeholder="Ihr Passwort"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={isLoading || !password}
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          <Download className="w-5 h-5" />
          {isLoading ? "Wird exportiert..." : "Daten herunterladen"}
        </button>
      </div>
    </div>
  );
}

interface Recording {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  duration: number | null;
  createdAt: string;
  expiresAt: string;
}

function RecordingsSection() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchRecordings = async () => {
    try {
      const response = await fetch("/api/recordings", {
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        setRecordings(data.recordings);
      } else {
        setError("Fehler beim Laden der Aufnahmen");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const handleDownload = (id: string) => {
    window.open(`/api/recordings/${id}/download`, "_blank");
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Aufnahme wirklich löschen? Sie bleibt sonst 24 Stunden gespeichert.");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (response.ok) {
        setRecordings(recordings.filter(r => r.id !== id));
      } else {
        setError("Fehler beim Löschen");
      }
    } catch {
      setError("Verbindungsfehler");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimeRemaining = (expiresAt: string): string => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) return "Abgelaufen";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Meine Aufnahmen</h2>
      <p className="text-slate-600 mb-6">
        Ihre Screen-Recordings werden für 24 Stunden gespeichert und dann automatisch gelöscht.
      </p>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 mb-4">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : recordings.length === 0 ? (
        <div className="text-center py-12">
          <Video className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Keine Aufnahmen vorhanden</p>
          <p className="text-slate-400 text-sm mt-1">
            Aufnahmen erscheinen hier nach der Aufnahme
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recordings.map((recording) => (
            <div
              key={recording.id}
              className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-purple-600" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{recording.originalName}</p>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span>{formatFileSize(recording.size)}</span>
                  <span>•</span>
                  <span>{formatDuration(recording.duration)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {getTimeRemaining(recording.expiresAt)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleDownload(recording.id)}
                  className="p-2 text-slate-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                  title="Herunterladen"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(recording.id)}
                  className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Löschen"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-violet-50 border border-violet-100 rounded-xl">
        <p className="text-sm text-violet-700">
          <strong>Hinweis:</strong> Aufnahmen werden nach 24 Stunden automatisch gelöscht (DSGVO-konform).
          Laden Sie wichtige Aufnahmen rechtzeitig herunter.
        </p>
      </div>
    </div>
  );
}

function DeleteAccountSection({ onDeleted }: { onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/user", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ password, confirmDeletion: "DELETE" })
      });

      if (response.ok) {
        onDeleted();
      } else {
        const data = await response.json();
        setError(data.error || "Löschung fehlgeschlagen");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-xl font-semibold text-red-700 mb-2">Konto löschen</h2>
      <p className="text-slate-600 mb-6">
        Gemäß Art. 17 DSGVO können Sie die Löschung Ihres Kontos und aller Daten verlangen.
      </p>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 mb-4">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="p-4 bg-red-50 border border-red-100 rounded-xl mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Diese Aktion kann nicht rückgaengig gemacht werden!</p>
            <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
              <li>Ihr Konto wird dauerhaft gelöscht</li>
              <li>Alle Nutzungsdaten werden gelöscht</li>
              <li>Sessions werden beendet</li>
              <li>Audit-Logs werden anonymisiert</li>
            </ul>
          </div>
        </div>
      </div>

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
          Konto löschen
        </button>
      ) : (
        <div className="space-y-4 p-4 border border-red-200 rounded-xl bg-red-50">
          <p className="font-medium text-red-800">Bestätigen Sie die Löschung:</p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Passwort
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 border border-slate-200 rounded-xl bg-white"
                placeholder="Ihr Passwort"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tippen Sie <code className="bg-slate-200 px-1 rounded">LOESCHEN</code> zur Bestätigung
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white"
              placeholder="LOESCHEN"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowConfirm(false);
                setPassword("");
                setConfirmText("");
              }}
              className="flex-1 px-4 py-3 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl bg-white"
            >
              Abbrechen
            </button>
            <button
              onClick={handleDelete}
              disabled={isLoading || !password || confirmText !== "LOESCHEN"}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="w-5 h-5" />
              {isLoading ? "Wird gelöscht..." : "Endgueltig löschen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
