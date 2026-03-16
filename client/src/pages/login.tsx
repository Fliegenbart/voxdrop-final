import { useState, useEffect } from "react";
import { Sparkles, Mail, Lock, Eye, EyeOff, AlertCircle, Shield, CheckCircle2, RefreshCw } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { SEO } from "@/components/SEO";

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { login } = useAuth();

  const nextPath = (() => {
    const params = new URLSearchParams(search);
    const raw = params.get("next");
    // Only allow relative in-app redirects.
    if (!raw) return "/";
    if (!raw.startsWith("/")) return "/";
    if (raw.startsWith("//")) return "/";
    return raw;
  })();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showVerified, setShowVerified] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [isResending, setIsResending] = useState(false);

  // Parse query params
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("verified") === "true") {
      setShowVerified(true);
    }
    if (params.get("error") === "token_expired") {
      setError("Der Bestätigungslink ist abgelaufen. Bitte fordern Sie einen neuen an.");
    }
    if (params.get("error") === "invalid_token") {
      setError("Ungültiger Bestätigungslink.");
    }
  }, [search]);

  const handleResendVerification = async () => {
    setIsResending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        setEmailNotVerified(false);
        setShowVerified(false);
        setError("");
        // Show a success-like message
        alert("Bestätigungs-E-Mail wurde erneut gesendet.");
      } else {
        setError(data.error || "Fehler beim Senden der E-Mail");
      }
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setShowVerified(false);
    setEmailNotVerified(false);
    setIsLoading(true);

    try {
      const result = await login(email, password, mfaRequired ? mfaCode : undefined);

      if (result.success) {
        setLocation(nextPath || "/");
      } else if (result.mfaRequired) {
        setMfaRequired(true);
      } else if (result.emailNotVerified) {
        setEmailNotVerified(true);
        setUnverifiedEmail(result.email || email);
        setError(result.error || "E-Mail-Adresse nicht bestätigt");
      } else {
        setError(result.error || "Anmeldung fehlgeschlagen");
      }
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <SEO
        title="Login"
        description="Melden Sie sich bei VoxDrop an."
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
            <span className="text-sm text-slate-600">Noch kein Konto?</span>
            <Link
              href="/register"
              className="text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
            >
              Registrieren
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
              Willkommen zurück
            </h1>
            <p className="text-slate-600">
              Melden Sie sich bei Ihrem VoxDrop-Konto an
            </p>
          </div>

          {/* Login Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Verified Success Banner */}
              {showVerified && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl text-green-700">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-medium">E-Mail-Adresse erfolgreich bestätigt! Sie können sich jetzt anmelden.</p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Email Not Verified - Resend Option */}
              {emailNotVerified && (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-sm text-amber-800 mb-3">
                    Ihre E-Mail-Adresse wurde noch nicht bestätigt. Bitte prüfen Sie Ihren Posteingang.
                  </p>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isResending}
                    className="flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-800"
                  >
                    {isResending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Wird gesendet...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Bestätigungs-E-Mail erneut senden
                      </>
                    )}
                  </button>
                </div>
              )}

              {!mfaRequired ? (
                <>
                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                      E-Mail-Adresse
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all outline-none"
                        placeholder="ihre@email.de"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                      Passwort
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-12 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all outline-none"
                        placeholder="Ihr Passwort"
                        required
                        autoComplete="current-password"
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
                </>
              ) : (
                /* MFA Code Input */
                <div>
                  <div className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-100 rounded-xl text-violet-700 mb-6">
                    <Shield className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">
                      Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.
                    </p>
                  </div>
                  <label htmlFor="mfaCode" className="block text-sm font-medium text-slate-700 mb-2">
                    2FA-Code
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      id="mfaCode"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all outline-none text-center text-2xl tracking-widest font-mono"
                      placeholder="000000"
                      maxLength={6}
                      required
                      autoComplete="one-time-code"
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Wird verarbeitet...
                  </span>
                ) : mfaRequired ? (
                  "Code bestätigen"
                ) : (
                  "Anmelden"
                )}
              </button>

              {mfaRequired && (
                <button
                  type="button"
                  onClick={() => {
                    setMfaRequired(false);
                    setMfaCode("");
                    setError("");
                  }}
                  className="w-full py-3 text-slate-600 font-medium hover:text-slate-900 transition-colors"
                >
                  Zurück zur Anmeldung
                </button>
              )}
            </form>
          </div>

          {/* Footer Links */}
          <div className="mt-8 text-center">
            <p className="text-sm text-slate-600">
              Mit der Anmeldung akzeptieren Sie unsere{" "}
              <Link href="/datenschutz" className="text-violet-600 hover:underline">
                Datenschutzerklärung
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
