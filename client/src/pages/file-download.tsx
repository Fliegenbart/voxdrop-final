import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import {
  Download, Loader2, Lock, Clock, FileIcon, Image, File,
  AlertCircle, CheckCircle2, XCircle
} from "lucide-react";

interface FileInfo {
  originalName: string;
  fileSize: number;
  fileSizeFormatted: string;
  mimeType: string;
  altText: string | null;
  hasPassword: boolean;
  downloads: number;
  maxDownloads: number | null;
  expiresAt: string;
}

type PageState = "loading" | "ready" | "password" | "downloading" | "success" | "error" | "expired" | "not_found";

export default function FileDownload() {
  const { token } = useParams<{ token: string }>();

  const [state, setState] = useState<PageState>("loading");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const statusRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Announce status for screen readers
  const announce = (message: string) => {
    setStatusMessage(message);
  };

  // Load file info
  useEffect(() => {
    const loadFileInfo = async () => {
      try {
        const response = await fetch(`/f/${token}/info`);

        if (response.status === 404) {
          setState("not_found");
          announce("Datei nicht gefunden");
          return;
        }

        if (response.status === 410) {
          setState("expired");
          announce("Datei abgelaufen");
          return;
        }

        if (!response.ok) {
          throw new Error("Fehler beim Laden der Datei-Informationen");
        }

        const data = await response.json();
        setFileInfo(data);

        if (data.hasPassword) {
          setState("password");
          announce(`Datei ${data.originalName} ist passwortgeschützt. Bitte Passwort eingeben.`);
          // Focus password input after state change
          setTimeout(() => passwordInputRef.current?.focus(), 100);
        } else {
          setState("ready");
          announce(`Datei ${data.originalName} bereit zum Download. ${data.fileSizeFormatted}`);
        }
      } catch (err) {
        console.error("Failed to load file info:", err);
        setState("error");
        setError("Die Datei-Informationen konnten nicht geladen werden.");
        announce("Fehler beim Laden der Datei");
      }
    };

    if (token) {
      loadFileInfo();
    }
  }, [token]);

  // Handle download
  const handleDownload = async () => {
    if (!fileInfo) return;

    setState("downloading");
    announce("Download wird gestartet...");

    try {
      let url = `/f/${token}/download`;
      if (fileInfo.hasPassword && password) {
        url += `?password=${encodeURIComponent(password)}`;
      }

      const response = await fetch(url);

      if (response.status === 401) {
        const data = await response.json();
        if (data.requiresPassword) {
          setState("password");
          setError("Bitte geben Sie das Passwort ein.");
          announce("Passwort erforderlich");
          setTimeout(() => passwordInputRef.current?.focus(), 100);
          return;
        }
        setError(data.error || "Falsches Passwort");
        setState("password");
        announce("Falsches Passwort");
        return;
      }

      if (response.status === 410) {
        setState("expired");
        announce("Datei abgelaufen");
        return;
      }

      if (response.status === 403) {
        setState("error");
        setError("Das Download-Limit für diese Datei wurde erreicht.");
        announce("Download-Limit erreicht");
        return;
      }

      if (!response.ok) {
        throw new Error("Download fehlgeschlagen");
      }

      // Get blob and trigger download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileInfo.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setState("success");
      announce(`Download von ${fileInfo.originalName} erfolgreich`);
    } catch (err) {
      console.error("Download failed:", err);
      setState("error");
      setError("Der Download ist fehlgeschlagen. Bitte versuchen Sie es erneut.");
      announce("Download fehlgeschlagen");
    }
  };

  // Handle password form submit
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      handleDownload();
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get file icon
  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith("image/")) return Image;
    return File;
  };

  const FileIconComponent = fileInfo ? getFileIcon(fileInfo.mimeType) : FileIcon;

  return (
    <PageLayout>
      <SEO
        title={fileInfo ? `Download: ${fileInfo.originalName}` : "Datei herunterladen"}
        description="Laden Sie die freigegebene Datei herunter."
        noIndex={true}
      />

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        {/* Screen reader status */}
        <div
          ref={statusRef}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {statusMessage}
        </div>

        <div className="w-full max-w-md">
          {/* Loading State */}
          {state === "loading" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Datei wird geladen...</p>
            </div>
          )}

          {/* Not Found State */}
          {state === "not_found" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center" role="alert">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-slate-900 mb-2">
                Datei nicht gefunden
              </h1>
              <p className="text-slate-600">
                Diese Datei existiert nicht oder wurde bereits gelöscht.
              </p>
            </div>
          )}

          {/* Expired State */}
          {state === "expired" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center" role="alert">
              <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-slate-900 mb-2">
                Datei abgelaufen
              </h1>
              <p className="text-slate-600">
                Diese Datei ist nicht mehr verfügbar.
                Die Speicherzeit ist abgelaufen.
              </p>
            </div>
          )}

          {/* Error State */}
          {state === "error" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center" role="alert">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-slate-900 mb-2">
                Fehler
              </h1>
              <p className="text-slate-600">{error}</p>
              <Button
                onClick={() => window.location.reload()}
                className="mt-4"
                variant="outline"
              >
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Ready / Password / Downloading States */}
          {(state === "ready" || state === "password" || state === "downloading") && fileInfo && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              {/* File Info */}
              <div className="text-center mb-6">
                <FileIconComponent className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
                <h1 className="text-xl font-semibold text-slate-900 mb-1">
                  {fileInfo.originalName}
                </h1>
                <p className="text-slate-500">{fileInfo.fileSizeFormatted}</p>

                {/* Alt text for images */}
                {fileInfo.altText && (
                  <p className="text-sm text-slate-600 mt-2 italic">
                    Bildbeschreibung: {fileInfo.altText}
                  </p>
                )}

                {/* Meta info */}
                <div className="flex justify-center gap-4 mt-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Download className="w-4 h-4" />
                    {fileInfo.downloads} Downloads
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Bis {formatDate(fileInfo.expiresAt)}
                  </span>
                </div>
              </div>

              {/* Password Form */}
              {state === "password" && (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="download-password"
                      className="block text-sm font-medium text-slate-700 mb-2"
                    >
                      <Lock className="w-4 h-4 inline mr-1" />
                      Diese Datei ist passwortgeschützt
                    </label>
                    <Input
                      ref={passwordInputRef}
                      id="download-password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      placeholder="Passwort eingeben"
                      required
                      aria-describedby={error ? "password-error" : undefined}
                      className={error ? "border-red-500" : ""}
                    />
                    {error && (
                      <p id="password-error" className="text-sm text-red-600 mt-1">
                        {error}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    size="lg"
                    disabled={!password.trim()}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Herunterladen
                  </Button>
                </form>
              )}

              {/* Download Button (no password) */}
              {state === "ready" && (
                <Button
                  onClick={handleDownload}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  size="lg"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Herunterladen
                </Button>
              )}

              {/* Downloading State */}
              {state === "downloading" && (
                <Button
                  disabled
                  className="w-full bg-emerald-600"
                  size="lg"
                >
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Download läuft...
                </Button>
              )}
            </div>
          )}

          {/* Success State */}
          {state === "success" && fileInfo && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center" role="alert">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-emerald-800 mb-2">
                Download erfolgreich!
              </h1>
              <p className="text-emerald-700 mb-4">
                {fileInfo.originalName} wurde heruntergeladen.
              </p>
              <Button
                onClick={handleDownload}
                variant="outline"
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-100"
              >
                <Download className="w-4 h-4 mr-2" />
                Erneut herunterladen
              </Button>
            </div>
          )}

          {/* Back to Filesharing Link */}
          {(state === "success" || state === "not_found" || state === "expired") && (
            <div className="text-center mt-6">
              <a
                href="/tools/filesharing"
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Eigene Dateien teilen
              </a>
            </div>
          )}
        </div>
      </main>

    </PageLayout>
  );
}
