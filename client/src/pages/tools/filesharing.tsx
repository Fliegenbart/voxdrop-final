import { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { useAgencyMode } from "@/lib/agency-mode";
import { StorageTargetPicker } from "@/components/StorageTargetPicker";
import { useStorageTarget } from "@/hooks/use-storage-target";
import {
  Upload, Copy, QrCode, Trash2, Loader2,
  CheckCircle2, Lock, Clock, FileIcon, Image, File,
  AlertCircle, X, Share2, Crown
} from "lucide-react";
import { Link } from "wouter";

interface SharedFile {
  id: string;
  token: string;
  originalName: string;
  fileSize: number;
  fileSizeFormatted: string;
  mimeType: string;
  altText: string | null;
  hasPassword: boolean;
  downloads: number;
  maxDownloads: number | null;
  createdAt: string;
  expiresAt: string;
  downloadUrl: string;
}

interface UploadResult {
  token: string;
  originalName: string;
  fileSizeFormatted: string;
  downloadUrl: string;
  directDownloadUrl: string;
  expiresAt: string;
  hasPassword: boolean;
}

export default function FileSharing() {
  const MAX_FILES = 10;
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const { isAgencyMode } = useAgencyMode();
  const { target: storageTarget, setTarget: setStorageTarget } = useStorageTarget("filesharing");

  // Check if user has premium access
  const isPremium = user?.subscription === 'premium' || user?.subscription === 'team';

  // Upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [expiresIn, setExpiresIn] = useState<24 | 48 | 72>(24);
  const [password, setPassword] = useState("");
  const [classification, setClassification] = useState<"public" | "internal" | "confidential">("public");
  const [maxDownloads, setMaxDownloads] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadFailures, setUploadFailures] = useState<Array<{ name: string; error: string }>>([]);
  const [uploadQueue, setUploadQueue] = useState<{ current: number; total: number; currentName: string } | null>(null);

  // Files list state (for logged in users)
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // QR Code state
  const [activeQrToken, setActiveQrToken] = useState<string | null>(null);

  // Status announcement for screen readers
  const [statusMessage, setStatusMessage] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);

  const passwordRequired = isAgencyMode && classification !== "public";
  const maxSizeText = isAuthenticated ? "250 MB" : "50 MB";

  useEffect(() => {
    if (isAgencyMode) {
      setExpiresIn(24);
      setMaxDownloads((current) => current ?? 1);
    }
  }, [isAgencyMode]);

  // Load user's files on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadFiles();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, storageTarget]);

  const loadFiles = async () => {
    try {
      const params = new URLSearchParams();
      params.set("scope", storageTarget.scope);
      if (storageTarget.workspaceId) {
        params.set("workspaceId", storageTarget.workspaceId);
      }
      if (storageTarget.projectId) {
        params.set("projectId", storageTarget.projectId);
      }
      const response = await fetch(`/api/files?${params.toString()}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files);
      }
    } catch (error) {
      console.error("Failed to load files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Announce status for screen readers
  const announce = (message: string) => {
    setStatusMessage(message);
  };

  // Dropzone configuration
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    if (fileRejections.length > 0) {
      const tooMany = fileRejections.some((rejection) =>
        rejection.errors.some((error) => error.code === "too-many-files")
      );
      const tooLarge = fileRejections.some((rejection) =>
        rejection.errors.some((error) => error.code === "file-too-large")
      );
      if (tooMany) {
        toast({
          title: "Zu viele Dateien",
          description: `Maximal ${MAX_FILES} Dateien gleichzeitig.`,
          variant: "destructive",
        });
      } else if (tooLarge) {
        toast({
          title: "Datei zu groß",
          description: `Maximal ${maxSizeText} pro Datei.`,
          variant: "destructive",
        });
      }
    }

    if (acceptedFiles.length === 0) return;

    setUploadResults([]);
    setUploadFailures([]);
    setActiveQrToken(null);

    setSelectedFiles((prev) => {
      const merged = [...prev, ...acceptedFiles];
      if (merged.length > MAX_FILES) {
        toast({
          title: "Zu viele Dateien",
          description: `Es werden nur die ersten ${MAX_FILES} Dateien übernommen.`,
        });
      }
      return merged.slice(0, MAX_FILES);
    });

    const totalSelected = Math.min(selectedFiles.length + acceptedFiles.length, MAX_FILES);
    announce(`${totalSelected} Datei${totalSelected === 1 ? "" : "en"} ausgewählt.`);
  }, [MAX_FILES, announce, maxSizeText, selectedFiles.length, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxFiles: MAX_FILES,
    maxSize: isAuthenticated ? 250 * 1024 * 1024 : 50 * 1024 * 1024
  });

  // Upload file
  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (passwordRequired && !password.trim()) {
      toast({
        title: "Passwort erforderlich",
        description: "Im Behörden-Modus ist bei internen/vertraulichen Dateien ein Passwort Pflicht.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadResults([]);
    setUploadFailures([]);
    setActiveQrToken(null);
    setUploadQueue({
      current: 1,
      total: selectedFiles.length,
      currentName: selectedFiles[0]?.name || "Datei"
    });
    announce(`Upload wird gestartet (${selectedFiles.length} Dateien)...`);

    const results: UploadResult[] = [];
    const failures: Array<{ name: string; error: string }> = [];

    try {
      const headers: Record<string, string> = {};
      const total = selectedFiles.length;

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        setUploadQueue({
          current: index + 1,
          total,
          currentName: file.name,
        });
        setUploadProgress(Math.round((index / total) * 100));

        const formData = new FormData();
        formData.append("file", file);
        formData.append("expiresIn", expiresIn.toString());
        formData.append("storageScope", storageTarget.scope);
        if (storageTarget.scope === "workspace") {
          if (storageTarget.workspaceId) {
            formData.append("workspaceId", storageTarget.workspaceId);
          }
          if (storageTarget.projectId) {
            formData.append("projectId", storageTarget.projectId);
          }
        }
        if (password) {
          formData.append("password", password);
        }
        if (typeof maxDownloads === "number") {
          formData.append("maxDownloads", maxDownloads.toString());
        }

        try {
          const response = await fetch("/api/files/upload", {
            method: "POST",
            headers,
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Upload fehlgeschlagen");
          }

          const data = await response.json();

          results.push({
            token: data.file.token,
            originalName: data.file.originalName,
            fileSizeFormatted: data.file.fileSizeFormatted,
            downloadUrl: data.file.downloadUrl,
            directDownloadUrl: data.file.directDownloadUrl,
            expiresAt: data.file.expiresAt,
            hasPassword: data.file.hasPassword,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload fehlgeschlagen";
          failures.push({ name: file.name, error: message });
        }
      }

      setUploadProgress(100);
      setUploadResults(results);
      setUploadFailures(failures);

      if (results.length > 0 && isAuthenticated) {
        loadFiles();
      }

      // Reset form
      setSelectedFiles([]);
      setPassword("");
      setUploadQueue(null);

      if (results.length > 0) {
        announce(`${results.length} Datei${results.length === 1 ? "" : "en"} erfolgreich hochgeladen.`);
        toast({
          title: "Upload abgeschlossen",
          description: `${results.length} Datei${results.length === 1 ? "" : "en"} erfolgreich hochgeladen.`,
        });
      }

      if (failures.length > 0) {
        const failedCount = failures.length;
        announce(`${failedCount} Datei${failedCount === 1 ? "" : "en"} konnten nicht hochgeladen werden.`);
        toast({
          title: "Upload teilweise fehlgeschlagen",
          description: `${failedCount} Datei${failedCount === 1 ? "" : "en"} konnten nicht hochgeladen werden.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload fehlgeschlagen";
      announce(`Fehler: ${message}`);
      toast({
        title: "Fehler",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadQueue(null);
    }
  };

  // Copy link to clipboard
  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      announce("Link in Zwischenablage kopiert");
      toast({
        title: "Kopiert",
        description: "Link wurde in die Zwischenablage kopiert.",
      });
    } catch {
      toast({
        title: "Fehler",
        description: "Link konnte nicht kopiert werden.",
        variant: "destructive",
      });
    }
  };

  // Delete file
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Datei "${name}" wirklich löschen?`)) return;

    try {
      const params = new URLSearchParams();
      params.set("scope", storageTarget.scope);
      if (storageTarget.workspaceId) {
        params.set("workspaceId", storageTarget.workspaceId);
      }
      if (storageTarget.projectId) {
        params.set("projectId", storageTarget.projectId);
      }
      const response = await fetch(`/api/files/${id}?${params.toString()}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        announce(`Datei ${name} wurde gelöscht`);
        toast({
          title: "Gelöscht",
          description: "Datei wurde gelöscht.",
        });
      }
    } catch {
      toast({
        title: "Fehler",
        description: "Datei konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  // Format date for display
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

  // Get file icon based on MIME type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return Image;
    return File;
  };

  return (
    <PageLayout>
      <SEO
        title="Barrierefreies Filesharing"
        description="Dateien sicher teilen. Barrierefrei, DSGVO-konform, mit automatischer Löschung."
      />

      <main className="flex-1">
        {/* Hero Section */}
        <header className="pt-12 pb-8 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Share2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
              Dateien teilen
            </h1>
            <p className="text-lg text-slate-600 font-light max-w-2xl mx-auto">
              Laden Sie eine Datei hoch und teilen Sie den barrierefreien Link.
              {!isAuthenticated && " Mit Login erhalten Sie mehr Speicherplatz."}
            </p>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          {/* Screen reader status announcements */}
          <div
            ref={statusRef}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {statusMessage}
          </div>

          {isAgencyMode && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-emerald-900">Behörden-Modus aktiv</h2>
                  <p className="text-sm text-emerald-800 mt-1">
                    Wir schlagen strengere, barrierefreie Standardeinstellungen vor (Ablauf, Passwort, Download-Limits).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Premium Gate */}
          {!isPremium && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Premium-Funktion</h2>
              <p className="text-slate-600 mb-6 max-w-md mx-auto">
                Das barrierefreie Filesharing ist exklusiv für Premium-Nutzer verfügbar.
                Upgraden Sie jetzt für unbegrenzten Zugang zu allen Tools.
              </p>
              <Link href="/preise">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Crown className="w-4 h-4 mr-2" />
                  Jetzt freischalten
                </Button>
              </Link>
            </div>
          )}

          {/* Upload Section - Only for Premium */}
          {isPremium && (
          <>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-900">Dateien hochladen</h2>
            <StorageTargetPicker
              value={storageTarget}
              onChange={setStorageTarget}
              helperText="Wähle, ob die Datei privat bleibt oder im Workspace verfügbar ist."
            />

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                isDragActive
                  ? "border-emerald-500 bg-emerald-50"
                  : selectedFiles.length > 0
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
              }`}
              role="button"
              tabIndex={0}
              aria-label={`Dateien auswählen oder hierher ziehen. Maximal ${MAX_FILES} Dateien, ${maxSizeText} pro Datei.`}
            >
              <input {...getInputProps()} aria-label="Dateien auswählen" />

              {selectedFiles.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <FileIcon className="w-10 h-10 text-emerald-600" />
                    <div className="text-left">
                      <p className="font-medium text-slate-900">
                        {selectedFiles.length} Datei{selectedFiles.length === 1 ? "" : "en"} ausgewählt
                      </p>
                      <p className="text-sm text-slate-500">
                        Maximal {MAX_FILES} Dateien gleichzeitig
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-left">
                    {selectedFiles.map((file) => (
                      <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                          <p className="text-xs text-slate-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFiles((prev) => prev.filter((item) => item !== file));
                            announce(`Datei entfernt: ${file.name}`);
                          }}
                          className="text-xs text-red-600 hover:text-red-700 underline"
                        >
                          Entfernen
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFiles([]);
                      announce("Alle Dateien entfernt");
                    }}
                    className="text-sm text-red-600 hover:text-red-700 underline"
                  >
                    Alle entfernen
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto" />
                  <p className="font-medium text-slate-700">
                    {isDragActive ? "Dateien hier ablegen" : "Dateien auswählen oder hierher ziehen"}
                  </p>
                  <p className="text-sm text-slate-500">
                    Maximal {MAX_FILES} Dateien · {maxSizeText} pro Datei
                  </p>
                </div>
              )}
            </div>

            {/* Options */}
            {selectedFiles.length > 0 && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Diese Einstellungen gelten für alle ausgewählten Dateien.
                </p>
                {isAgencyMode && (
                  <fieldset>
                    <legend className="text-sm font-medium text-slate-700 mb-2">
                      Schutzbedarf (Behördenmodus)
                    </legend>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Schutzbedarf">
                      {([
                        { key: "public", label: "Öffentlich" },
                        { key: "internal", label: "Intern" },
                        { key: "confidential", label: "Vertraulich" },
                      ] as const).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setClassification(item.key)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            classification === item.key
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                          role="radio"
                          aria-checked={classification === item.key}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Für interne/vertrauliche Dateien ist ein Passwort erforderlich.
                    </p>
                  </fieldset>
                )}

                {/* Expiration */}
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700 mb-2">
                    Wie lange soll die Datei verfügbar sein?
                  </legend>
                  <div className="flex gap-2" role="radiogroup" aria-label="Speicherdauer">
                    {([24, 48, 72] as const).map((hours) => (
                      <button
                        key={hours}
                        type="button"
                        onClick={() => setExpiresIn(hours)}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                          expiresIn === hours
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                        role="radio"
                        aria-checked={expiresIn === hours}
                      >
                        {hours} Stunden
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    <Lock className="w-4 h-4 inline mr-1" />
                    Passwortschutz {passwordRequired ? "(erforderlich)" : "(optional)"}
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Passwort eingeben"
                    className="max-w-xs"
                    aria-describedby="password-hint"
                    required={passwordRequired}
                  />
                  <p id="password-hint" className="text-xs text-slate-500 mt-1">
                    {passwordRequired
                      ? "Für interne/vertrauliche Dateien ist ein Passwort Pflicht."
                      : "Wenn gesetzt, muss das Passwort zum Download eingegeben werden."}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Download-Limit (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 3, 5, 10].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMaxDownloads(value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                          maxDownloads === value
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                        aria-pressed={maxDownloads === value}
                      >
                        {value}x
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMaxDownloads(null)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        maxDownloads === null
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                      aria-pressed={maxDownloads === null}
                    >
                      Unbegrenzt
                    </button>
                  </div>
                </div>

                {/* Upload Button */}
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  size="lg"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Wird hochgeladen...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Hochladen
                    </>
                  )}
                </Button>

                {/* Progress */}
                {isUploading && (
                  <div className="space-y-2">
                    <div
                      role="progressbar"
                      aria-valuenow={uploadProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Upload: ${uploadProgress} Prozent`}
                      className="w-full bg-slate-200 rounded-full h-2"
                    >
                      <div
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    {uploadQueue && (
                      <p className="text-xs text-slate-500">
                        Datei {uploadQueue.current} von {uploadQueue.total}: {uploadQueue.currentName}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upload Result */}
          {(uploadResults.length > 0 || uploadFailures.length > 0) && (
            <div className="space-y-4">
              {uploadResults.length > 0 && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-emerald-800">
                        {uploadResults.length} Datei{uploadResults.length === 1 ? "" : "en"} erfolgreich hochgeladen
                      </h3>
                      <p className="text-sm text-emerald-700">
                        Sie können die Links jetzt teilen.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {uploadResults.map((result) => {
                      const isQrOpen = activeQrToken === result.token;
                      return (
                        <div key={result.token} className="bg-white rounded-xl border border-emerald-100 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-emerald-900">
                                {result.originalName}
                              </p>
                              <p className="text-xs text-emerald-700">
                                {result.fileSizeFormatted}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-emerald-800">
                              Download-Link:
                            </label>
                            <div className="flex gap-2">
                              <Input
                                readOnly
                                value={result.downloadUrl}
                                className="bg-white"
                                aria-label="Download-Link"
                              />
                              <Button
                                onClick={() => copyToClipboard(result.downloadUrl)}
                                variant="outline"
                                className="flex-shrink-0"
                                aria-label="Link kopieren"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button
                                onClick={() => setActiveQrToken(isQrOpen ? null : result.token)}
                                variant="outline"
                                className="flex-shrink-0"
                                aria-label="QR-Code anzeigen"
                                aria-expanded={isQrOpen}
                              >
                                <QrCode className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {isQrOpen && (
                            <div className="flex justify-center p-4 bg-white rounded-lg border border-emerald-100">
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.downloadUrl)}`}
                                alt={`QR-Code für Download-Link: ${result.downloadUrl}`}
                                className="w-48 h-48"
                              />
                            </div>
                          )}

                          <div className="flex flex-wrap gap-4 text-sm text-emerald-700">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              Gueltig bis: {formatDate(result.expiresAt)}
                            </span>
                            {result.hasPassword && (
                              <span className="flex items-center gap-1">
                                <Lock className="w-4 h-4" />
                                Passwortgeschützt
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {uploadFailures.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-red-800">
                        {uploadFailures.length} Datei{uploadFailures.length === 1 ? "" : "en"} konnten nicht hochgeladen werden
                      </h3>
                      <p className="text-sm text-red-700">Bitte erneut versuchen.</p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-red-700">
                    {uploadFailures.map((failure) => (
                      <li key={`${failure.name}-${failure.error}`} className="flex items-start gap-2">
                        <X className="w-4 h-4 mt-0.5" />
                        <span>
                          <strong>{failure.name}</strong>: {failure.error}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          </>
          )}

          {/* My Files (Logged in users) */}
          {isPremium && isAuthenticated && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Meine Dateien
              </h2>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : files.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Noch keine Dateien hochgeladen.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100" role="list">
                  {files.map((file) => {
                    const FileIconComponent = getFileIcon(file.mimeType);
                    const isExpired = new Date(file.expiresAt) < new Date();

                    return (
                      <li
                        key={file.id}
                        className={`py-4 ${isExpired ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start gap-4">
                          <FileIconComponent className="w-10 h-10 text-slate-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {file.originalName}
                            </p>
                            <p className="text-sm text-slate-500">
                              {file.fileSizeFormatted} · {file.downloads} Downloads
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {isExpired ? "Abgelaufen" : `Bis ${formatDate(file.expiresAt)}`}
                              </span>
                              {file.hasPassword && (
                                <span className="flex items-center gap-1 text-amber-600">
                                  <Lock className="w-3 h-3" />
                                  Geschützt
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(`${window.location.origin}/f/${file.token}`)}
                              aria-label={`Link für ${file.originalName} kopieren`}
                              disabled={isExpired}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(file.id, file.originalName)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              aria-label={`${file.originalName} löschen`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Hinweise Box */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
            <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Hinweise
            </h3>
            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
              <li>Dateien werden nach Ablauf automatisch gelöscht (DSGVO-konform)</li>
              <li>Maximale Dateigröße: {isAuthenticated ? "250 MB (eingeloggt)" : "50 MB (ohne Login)"}</li>
              <li>Bilder erhalten automatisch eine Beschreibung für Screenreader</li>
              {!isAuthenticated && (
                <li>
                  <a href="/auth" className="underline hover:no-underline">
                    Mit Login
                  </a>
                  {" "}erhalten Sie größere Uploads und eine Übersicht Ihrer Dateien
                </li>
              )}
            </ul>
          </div>

          {/* Im Behördenalltag */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-4 text-lg">Im Behördenalltag</h3>
            <div className="prose prose-gray max-w-none text-slate-600">
              <p className="mb-4">
                Behörden müssen regelmäßig Dokumente mit Bürgern oder anderen Stellen teilen. Klassische
                E-Mail-Anhänge stoßen bei großen Dateien an Grenzen, und externe Dienste wie WeTransfer
                oder Dropbox erfüllen oft nicht die DSGVO-Anforderungen.
              </p>
              <p className="mb-4">
                <strong>Barrierefreie Download-URLs:</strong> Die generierten Download-Links verwenden
                aussprechbare deutsche Wörter statt kryptischer Zeichen. So kann eine blinde Person den
                Link problemlos vorlesen oder am Telefon diktieren (z.B. "voxdrop.live/f/apfel-birne"
                statt "wetransfer.com/t/x7Kj9mNp2").
              </p>
              <p>
                Die automatische Löschung nach Ablauf der Frist sorgt für DSGVO-Konformität ohne manuellen
                Aufwand. Mit optionalem Passwortschutz können auch sensible Dokumente sicher geteilt werden.
              </p>
            </div>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
