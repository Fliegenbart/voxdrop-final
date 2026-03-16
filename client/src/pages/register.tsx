import { useState } from "react";
import { Sparkles, Mail, Lock, Eye, EyeOff, AlertCircle, Building2, Check, X, CheckCircle2, RefreshCw } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { SEO } from "@/components/SEO";

export default function Register() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();

  const CONSENT_VERSION = "1.0";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [organization, setOrganization] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  // Password strength indicators
  const hasMinLength = password.length >= 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const passwordsMatch = password === passwordConfirm && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setErrorDetails([]);

    // Client-side validation
    if (password !== passwordConfirm) {
      setError("Passwörter stimmen nicht überein");
      return;
    }

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      setError("Passwort erfüllt nicht alle Anforderungen");
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(
        email,
        password,
        organization || undefined,
        consentGiven,
        CONSENT_VERSION
      );

      if (result.success) {
        // Check if verification is required
        if (result.requiresVerification) {
          setVerificationSent(true);
        } else {
          setLocation("/");
        }
      } else {
        setError(result.error || "Registrierung fehlgeschlagen");
        if (result.details) {
          setErrorDetails(result.details);
        }
      }
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Fehler beim Senden der E-Mail");
      }
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
    } finally {
      setIsResending(false);
    }
  };

  const PasswordCheck = ({ valid, label }: { valid: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {valid ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <X className="w-4 h-4 text-slate-300" />
      )}
      <span className={valid ? "text-green-700" : "text-slate-600"}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <SEO
        title="Registrieren"
        description="Erstellen Sie ein VoxDrop-Konto."
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
            <span className="text-sm text-slate-600">Bereits registriert?</span>
            <Link
              href="/login"
              className="text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
            >
              Anmelden
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Verification Sent State */}
          {verificationSent ? (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
                  E-Mail bestätigen
                </h1>
                <p className="text-slate-600">
                  Wir haben Ihnen eine E-Mail an <strong>{email}</strong> gesendet.
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <div className="text-center">
                  <Mail className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                  <p className="text-slate-700 mb-6">
                    Bitte klicken Sie auf den Bestätigungslink in der E-Mail, um Ihr Konto zu aktivieren.
                  </p>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 mb-4">
                      <p className="text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleResendVerification}
                    disabled={isResending}
                    className="flex items-center justify-center gap-2 w-full py-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {isResending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Wird gesendet...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        E-Mail erneut senden
                      </>
                    )}
                  </button>

                  <p className="text-sm text-slate-500 mt-4">
                    Keine E-Mail erhalten? Prüfen Sie Ihren Spam-Ordner.
                  </p>
                </div>
              </div>

              <div className="mt-8 text-center">
                <Link href="/login" className="text-violet-600 hover:underline text-sm">
                  Zurück zur Anmeldung
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
                  Konto erstellen
                </h1>
                <p className="text-slate-600">
                  Starten Sie kostenlos mit VoxDrop
                </p>
              </div>

              {/* Register Form */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                  {errorDetails.length > 0 && (
                    <ul className="mt-2 ml-8 list-disc text-sm">
                      {errorDetails.map((detail, i) => (
                        <li key={i}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

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

              {/* Organization (optional) */}
              <div>
                <label htmlFor="organization" className="block text-sm font-medium text-slate-700 mb-2">
                  Organisation <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    id="organization"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all outline-none"
                    placeholder="Ihr Unternehmen"
                    autoComplete="organization"
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
                    placeholder="Sicheres Passwort"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {/* Password Requirements */}
                {password.length > 0 && (
	                  <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-1">
	                    <PasswordCheck valid={hasMinLength} label="Mindestens 12 Zeichen" />
	                    <PasswordCheck valid={hasUppercase} label="Großbuchstabe (A-Z)" />
	                    <PasswordCheck valid={hasLowercase} label="Kleinbuchstabe (a-z)" />
	                    <PasswordCheck valid={hasNumber} label="Zahl (0-9)" />
	                    <PasswordCheck valid={hasSpecial} label="Sonderzeichen (!@#$%...)" />
	                  </div>
	                )}
              </div>

              {/* Password Confirm */}
	              <div>
	                <label htmlFor="passwordConfirm" className="block text-sm font-medium text-slate-700 mb-2">
	                  Passwort bestätigen
	                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    id="passwordConfirm"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className={`w-full pl-12 pr-12 py-3 border rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all outline-none ${
                      passwordConfirm.length > 0
                        ? passwordsMatch
                          ? "border-green-300 bg-green-50"
                          : "border-red-300 bg-red-50"
                        : "border-slate-200"
                    }`}
                    placeholder="Passwort wiederholen"
                    required
                    autoComplete="new-password"
                  />
                  {passwordConfirm.length > 0 && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      {passwordsMatch ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <X className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* DSGVO Consent Checkbox */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-1 w-4 h-4 text-violet-600 border-slate-300 rounded focus:ring-violet-500"
                  required
                />
                <label htmlFor="consent" className="text-sm text-slate-600">
                  Ich habe die{" "}
                  <Link href="/datenschutz" className="text-violet-600 hover:underline" target="_blank">
                    Datenschutzerklärung
                  </Link>{" "}
                  gelesen und stimme der Verarbeitung meiner Daten zu.
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !passwordsMatch || !hasMinLength || !hasUppercase || !hasLowercase || !hasNumber || !hasSpecial || !consentGiven}
                className="w-full py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Wird erstellt...
                  </span>
                ) : (
                  "Konto erstellen"
                )}
              </button>
            </form>
          </div>

              {/* Footer Links */}
              <div className="mt-8 text-center">
                <p className="text-sm text-slate-600">
                  Bei Fragen wenden Sie sich an unseren{" "}
                  <Link href="/impressum" className="text-violet-600 hover:underline">
                    Datenschutzbeauftragten
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
