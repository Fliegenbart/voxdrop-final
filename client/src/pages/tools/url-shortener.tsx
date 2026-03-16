import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import {
  Link2, Copy, QrCode, Eye, Trash2, Loader2, ExternalLink,
  CheckCircle2, Info, BarChart3, Calendar, Lock, Pause, Play,
  Edit2, X, ChevronDown, ChevronUp, AlertCircle, Clock
} from "lucide-react";
import { Link } from "wouter";

interface ShortLink {
  id: number;
  shortCode: string;
  shortUrl: string;
  targetUrl: string;
  title: string | null;
  clicks: number;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  isPaused: boolean;
  isExpired: boolean;
  hasPassword: boolean;
}

interface ClickStat {
  date: string;
  clicks: number;
}

export default function UrlShortener() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Form state
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [codeAvailable, setCodeAvailable] = useState<boolean | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createdLink, setCreatedLink] = useState<ShortLink | null>(null);
  const [showQrCode, setShowQrCode] = useState<string | null>(null);

  // Edit modal state
  const [editingLink, setEditingLink] = useState<ShortLink | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stats modal state
  const [showStatsFor, setShowStatsFor] = useState<number | null>(null);
  const [clickStats, setClickStats] = useState<ClickStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  // Load user's links on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadLinks();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Check custom code availability with debounce
  useEffect(() => {
    if (!customCode || customCode.length < 3) {
      setCodeAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingCode(true);
      try {
        const response = await fetch(`/api/links/check-code/${customCode}`);
        const data = await response.json();
        setCodeAvailable(data.valid && data.available);
      } catch {
        setCodeAvailable(null);
      } finally {
        setCheckingCode(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [customCode]);

  const loadLinks = async () => {
    try {
      const response = await fetch("/api/links");

      if (response.ok) {
        const data = await response.json();
        setLinks(data.links);
      }
    } catch (error) {
      console.error("Failed to load links:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!url.trim()) {
      toast({
        title: "URL erforderlich",
        description: "Bitte geben Sie eine URL ein.",
        variant: "destructive",
      });
      return;
    }

    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an, um Kurzlinks zu erstellen.",
        variant: "destructive",
      });
      return;
    }

    if (password && password !== passwordConfirm) {
      toast({
        title: "Passwort stimmt nicht überein",
        description: "Bitte geben Sie das Passwort erneut ein.",
        variant: "destructive",
      });
      return;
    }

    if (customCode && codeAvailable === false) {
      toast({
        title: "Custom Code nicht verfügbar",
        description: "Bitte wählen Sie einen anderen Code.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    setCreatedLink(null);

    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim() || undefined,
          customCode: customCode.trim() || undefined,
          expiresAt: expiresAt || undefined,
          password: password || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Kurzlink konnte nicht erstellt werden");
      }

      setCreatedLink(data);
      setLinks([data, ...links]);

      // Reset form
      setUrl("");
      setTitle("");
      setCustomCode("");
      setExpiresAt("");
      setPassword("");
      setPasswordConfirm("");
      setCodeAvailable(null);

      toast({
        title: "Kurzlink erstellt",
        description: "Ihr Kurzlink wurde erfolgreich erstellt.",
      });

    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Kopiert",
      description: "Link wurde in die Zwischenablage kopiert.",
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Möchten Sie diesen Kurzlink wirklich löschen?")) {
      return;
    }

    try {
      const response = await fetch(`/api/links/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Löschen fehlgeschlagen");
      }

      setLinks(links.filter(l => l.id !== id));
      if (createdLink?.id === id) {
        setCreatedLink(null);
      }

      toast({
        title: "Gelöscht",
        description: "Der Kurzlink wurde gelöscht.",
      });

    } catch {
      toast({
        title: "Fehler",
        description: "Kurzlink konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  const handleTogglePause = async (id: number) => {
    try {
      const response = await fetch(`/api/links/${id}/toggle`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Status konnte nicht geändert werden");
      }

      setLinks(links.map(l =>
        l.id === id ? { ...l, isPaused: data.isPaused } : l
      ));

      toast({
        title: data.isPaused ? "Link pausiert" : "Link reaktiviert",
        description: data.message,
      });

    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (link: ShortLink) => {
    setEditingLink(link);
    setEditUrl(link.targetUrl);
    setEditTitle(link.title || "");
    setEditExpiresAt(link.expiresAt ? link.expiresAt.split("T")[0] : "");
    setEditPassword("");
    setRemovePassword(false);
  };

  const handleSaveEdit = async () => {
    if (!editingLink) return;

    setIsSaving(true);

    try {
      const updates: Record<string, unknown> = {};

      if (editUrl !== editingLink.targetUrl) {
        updates.targetUrl = editUrl;
      }
      if (editTitle !== (editingLink.title || "")) {
        updates.title = editTitle || null;
      }
      if (editExpiresAt !== (editingLink.expiresAt?.split("T")[0] || "")) {
        updates.expiresAt = editExpiresAt || null;
      }
      if (editPassword) {
        updates.password = editPassword;
      } else if (removePassword && editingLink.hasPassword) {
        updates.password = null;
      }

      const response = await fetch(`/api/links/${editingLink.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }

      setLinks(links.map(l => l.id === editingLink.id ? data : l));
      setEditingLink(null);

      toast({
        title: "Gespeichert",
        description: "Der Kurzlink wurde aktualisiert.",
      });

    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const loadClickStats = async (linkId: number) => {
    setShowStatsFor(linkId);
    setLoadingStats(true);
    setClickStats([]);

    try {
      const response = await fetch(`/api/links/${linkId}/clicks?days=30`);

      if (response.ok) {
        const data = await response.json();
        setClickStats(data.clicks);
      }
    } catch (error) {
      console.error("Failed to load click stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const formatUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname : "");
    } catch {
      return url;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getStatusBadge = (link: ShortLink) => {
    if (link.isExpired) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" />
          Abgelaufen
        </span>
      );
    }
    if (link.isPaused) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
          <Pause className="w-3 h-3" />
          Pausiert
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" />
        Aktiv
      </span>
    );
  };

  const maxClicks = Math.max(...clickStats.map(s => s.clicks), 1);

  return (
    <PageLayout>
      <SEO
        title="URL-Shortener - VoxDrop"
        description="Erstellen Sie barrierefreie Kurzlinks mit verwechslungssicheren URLs, Ablaufdatum, Passwortschutz und QR-Codes."
      />

      {/* Hero Section */}
      <header className="pt-12 pb-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Link2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            URL-Shortener
          </h1>
          <p className="text-lg text-slate-600 font-light max-w-2xl mx-auto">
            Erstellen Sie kurze, verwechslungssichere Links mit Ablaufdatum, Passwortschutz und QR-Codes
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>
        {/* Create Link Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Kurzlink erstellen
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-slate-700 mb-1">
                  Ziel-URL *
                </label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://beispiel.de/sehr/langer/pfad/zum/dokument"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12"
                />
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">
                  Titel (optional)
                </label>
                <Input
                  id="title"
                  type="text"
                  placeholder="z.B. Antrag auf Elterngeld"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-12"
                />
              </div>

              {/* Advanced Options Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Erweiterte Optionen
              </button>

              {/* Advanced Options */}
              {showAdvanced && (
                <div className="space-y-4 p-4 bg-slate-50 rounded-xl">
                  {/* Custom Code */}
                  <div>
                    <label htmlFor="customCode" className="block text-sm font-medium text-slate-700 mb-1">
                      Eigener Kurzcode (optional)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">/s/</span>
                      <Input
                        id="customCode"
                        type="text"
                        placeholder="mein-link"
                        value={customCode}
                        onChange={(e) => setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        className="h-12 pl-10"
                        aria-describedby="customCode-hint customCode-status"
                        aria-invalid={customCode.length > 0 && customCode.length < 3}
                      />
                      {checkingCode && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" aria-hidden="true" />
                      )}
                      {!checkingCode && customCode.length >= 3 && codeAvailable !== null && (
                        codeAvailable ? (
                          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" aria-hidden="true" />
                        ) : (
                          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" aria-hidden="true" />
                        )
                      )}
                    </div>
                    <p id="customCode-hint" className="text-xs text-slate-500 mt-1">
                      3-50 Zeichen, nur Kleinbuchstaben, Zahlen und Bindestriche
                    </p>
                    <span id="customCode-status" className="sr-only" aria-live="polite">
                      {checkingCode && "Prüfe Verfügbarkeit..."}
                      {!checkingCode && customCode.length >= 3 && codeAvailable === true && "Kurzcode ist verfügbar"}
                      {!checkingCode && customCode.length >= 3 && codeAvailable === false && "Kurzcode ist bereits vergeben"}
                    </span>
                  </div>

                  {/* Expiration Date */}
                  <div>
                    <label htmlFor="expiresAt" className="block text-sm font-medium text-slate-700 mb-1">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Ablaufdatum (optional)
                    </label>
                    <Input
                      id="expiresAt"
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="h-12"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Nach diesem Datum ist der Link nicht mehr gültig
                    </p>
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                      <Lock className="w-4 h-4 inline mr-1" />
                      Passwortschutz (optional)
                    </label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Passwort eingeben"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 mb-2"
                    />
                    {password && (
                      <Input
                        id="passwordConfirm"
                        type="password"
                        placeholder="Passwort bestätigen"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className="h-12"
                      />
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      Besucher müssen das Passwort eingeben, um weitergeleitet zu werden
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleCreate}
                disabled={isCreating || !url.trim()}
                className="w-full h-12 text-base font-medium rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Erstelle...
                  </>
                ) : (
                  <>
                    <Link2 className="w-5 h-5 mr-2" />
                    Kurzlink erstellen
                  </>
                )}
              </Button>

              {!isAuthenticated && (
                <p className="text-sm text-slate-600 text-center">
                  <Link href="/login" className="text-teal-600 hover:underline">
                    Anmelden
                  </Link>
                  , um Kurzlinks zu erstellen.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Created Link Result */}
        {createdLink && (
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl border border-teal-200 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center gap-2 text-teal-700 mb-4">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Kurzlink erstellt!</span>
              </div>

              <div className="bg-white rounded-xl p-4 mb-4">
                <p className="text-sm text-slate-600 mb-1">Ihr Kurzlink:</p>
                <p className="text-xl font-semibold text-teal-700 break-all">
                  {createdLink.shortUrl}
                </p>
                {createdLink.expiresAt && (
                  <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Gültig bis: {formatDate(createdLink.expiresAt)}
                  </p>
                )}
                {createdLink.hasPassword && (
                  <p className="text-sm text-indigo-600 mt-1 flex items-center gap-1">
                    <Lock className="w-4 h-4" />
                    Passwortgeschützt
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => handleCopy(createdLink.shortUrl)}
                  variant="outline"
                  className="h-10 rounded-lg bg-white"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Kopieren
                </Button>
                <Button
                  onClick={() => setShowQrCode(createdLink.shortCode)}
                  variant="outline"
                  className="h-10 rounded-lg bg-white"
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  QR-Code
                </Button>
                <a
                  href={`/p/${createdLink.shortCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Vorschau
                </a>
              </div>
            </div>
          </div>
        )}

        {/* QR Code Modal */}
        {showQrCode && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">
                QR-Code
              </h3>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-center mb-4">
                <img
                  src={`/qr/${showQrCode}`}
                  alt="QR-Code für den Kurzlink"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-sm text-slate-600 text-center mb-4">
                Scannen Sie den Code, um den Link zu öffnen.
              </p>
              <Button
                onClick={() => setShowQrCode(null)}
                variant="outline"
                className="w-full h-10 rounded-lg"
              >
                Schliessen
              </Button>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingLink && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Link bearbeiten
                </h3>
                <button
                  onClick={() => setEditingLink(null)}
                  className="p-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Kurzcode (nicht änderbar)
                  </label>
                  <Input
                    value={`/s/${editingLink.shortCode}`}
                    disabled
                    className="h-10 bg-slate-50"
                  />
                </div>

                <div>
                  <label htmlFor="editUrl" className="block text-sm font-medium text-slate-700 mb-1">
                    Ziel-URL
                  </label>
                  <Input
                    id="editUrl"
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div>
                  <label htmlFor="editTitle" className="block text-sm font-medium text-slate-700 mb-1">
                    Titel
                  </label>
                  <Input
                    id="editTitle"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div>
                  <label htmlFor="editExpiresAt" className="block text-sm font-medium text-slate-700 mb-1">
                    Ablaufdatum
                  </label>
                  <Input
                    id="editExpiresAt"
                    type="date"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                    className="h-10"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Leer lassen, um kein Ablaufdatum zu setzen
                  </p>
                </div>

                <div>
                  <label htmlFor="editPassword" className="block text-sm font-medium text-slate-700 mb-1">
                    Neues Passwort
                  </label>
                  <Input
                    id="editPassword"
                    type="password"
                    placeholder="Neues Passwort setzen..."
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="h-10"
                  />
                  {editingLink.hasPassword && !editPassword && (
                    <label className="flex items-center gap-2 mt-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={removePassword}
                        onChange={(e) => setRemovePassword(e.target.checked)}
                        className="rounded"
                      />
                      Passwortschutz entfernen
                    </label>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => setEditingLink(null)}
                    variant="outline"
                    className="flex-1 h-10"
                    disabled={isSaving}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="flex-1 h-10 bg-teal-600 hover:bg-teal-700"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Speichern"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Modal */}
        {showStatsFor !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Klick-Statistik (30 Tage)
                </h3>
                <button
                  onClick={() => setShowStatsFor(null)}
                  className="p-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingStats ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                </div>
              ) : clickStats.length === 0 ? (
                <p className="text-center text-slate-600 py-8">
                  Noch keine Klicks in den letzten 30 Tagen.
                </p>
              ) : (
                <div className="space-y-2">
                  {clickStats.map((stat) => (
                    <div key={stat.date} className="flex items-center gap-3">
                      <span className="text-sm text-slate-500 w-20">
                        {formatDate(stat.date)}
                      </span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all"
                          style={{ width: `${(stat.clicks / maxClicks) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-700 w-8 text-right">
                        {stat.clicks}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={() => setShowStatsFor(null)}
                variant="outline"
                className="w-full h-10 rounded-lg mt-4"
              >
                Schliessen
              </Button>
            </div>
          </div>
        )}

        {/* Links List */}
        {isAuthenticated && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Meine Kurzlinks
                </h2>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                </div>
              ) : links.length === 0 ? (
                <div className="text-center py-12 text-slate-600">
                  <Link2 className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p>Sie haben noch keine Kurzlinks erstellt.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {links.map((link) => (
                    <div
                      key={link.id}
                      className={`p-4 rounded-xl border transition-colors ${
                        link.isExpired || link.isPaused
                          ? "bg-slate-50 border-slate-200"
                          : "bg-white border-slate-200 hover:border-teal-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <code className="text-teal-700 font-semibold">
                              /s/{link.shortCode}
                            </code>
                            {getStatusBadge(link)}
                            {link.hasPassword && (
                              <span title="Passwortgeschützt">
                                <Lock className="w-3.5 h-3.5 text-indigo-500" />
                              </span>
                            )}
                            <button
                              onClick={() => handleCopy(link.shortUrl)}
                              className="text-slate-400 hover:text-teal-600 transition-colors"
                              aria-label="Link kopieren"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-sm text-slate-600 truncate">
                            {link.title || formatUrl(link.targetUrl)}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                            <span>{link.clicks} Klicks</span>
                            <span>{formatDate(link.createdAt)}</span>
                            {link.expiresAt && (
                              <span className={link.isExpired ? "text-amber-600" : ""}>
                                Gültig bis: {formatDate(link.expiresAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => loadClickStats(link.id)}
                            className="p-2 text-slate-400 hover:text-teal-600 transition-colors"
                            aria-label="Statistiken anzeigen"
                            title="Statistiken"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(link)}
                            className="p-2 text-slate-400 hover:text-teal-600 transition-colors"
                            aria-label="Link bearbeiten"
                            title="Bearbeiten"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleTogglePause(link.id)}
                            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                            aria-label={link.isPaused ? "Link reaktivieren" : "Link pausieren"}
                            title={link.isPaused ? "Reaktivieren" : "Pausieren"}
                          >
                            {link.isPaused ? (
                              <Play className="w-4 h-4" />
                            ) : (
                              <Pause className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setShowQrCode(link.shortCode)}
                            className="p-2 text-slate-400 hover:text-teal-600 transition-colors"
                            aria-label="QR-Code anzeigen"
                            title="QR-Code"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <a
                            href={`/p/${link.shortCode}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-slate-400 hover:text-teal-600 transition-colors"
                            aria-label="Vorschau öffnen"
                            title="Vorschau"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleDelete(link.id)}
                            className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                            aria-label="Link löschen"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Funktionen Section - wenn keine Links */}
        {!createdLink && links.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-teal-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Funktionen</h3>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500" />
                Deutsche Wörter statt kryptischer Codes (z.B. sonne-berg)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500" />
                Eigene Kurzcodes möglich (z.B. /s/elterngeld-2024)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500" />
                Ablaufdatum für zeitlich begrenzte Links
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500" />
                Passwortschutz für sensible Dokumente
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500" />
                QR-Codes mit hohem Kontrast (WCAG AA)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500" />
                DSGVO-konform - keine Tracking-Cookies
              </li>
            </ul>
          </div>
        )}

        {/* Im Behördenalltag */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 mt-6">
          <h3 className="font-semibold text-slate-900 mb-4 text-lg">Im Behördenalltag</h3>
          <div className="prose prose-gray max-w-none text-slate-600">
            <p className="mb-4">
              Behörden kommunizieren häufig über URLs zu Formularen, Anträgen oder Informationsseiten.
              Lange, kryptische URLs sind schwer zu merken, schwer vorzulesen und für Menschen mit
              Sehbehinderung besonders problematisch beim Abtippen.
            </p>
            <p className="mb-4">
              VoxDrop-Kurzlinks verwenden deutsche Wörter statt zufälliger Zeichen. So wird aus
              einer unleserlichen URL wie "stadt.de/formulare/2024/v3/antrag?ref=ext" ein
              einprägsamer Link wie "voxdrop.live/s/bauantrag-2024".
            </p>
            <p>
              Mit Ablaufdatum und Passwortschutz eignen sich die Links auch für temporäre Dokumente
              und sensible Informationen. Die Klick-Statistik zeigt, wie oft Links aufgerufen werden.
            </p>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
