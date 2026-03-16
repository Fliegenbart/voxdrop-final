import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Crown,
  Check,
  Zap,
  Shield,
  ArrowRight,
  Coins,
  Star,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SEO, FAQSchema } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";
import { useAuth } from "@/lib/auth";
import {
  BILLING_FALLBACK,
  type BillingPlansResponse,
  type PublicPlanConfig,
} from "@/lib/billing";

const formatEuro = (value: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat("de-DE").format(value);

export default function Pricing() {
  const { user } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  const { data } = useQuery<BillingPlansResponse>({
    queryKey: ["billingPlans"],
    initialData: BILLING_FALLBACK,
    // Mark as stale so we refetch the authoritative config immediately after mount,
    // without ever blanking the UI.
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const response = await fetch("/api/billing/plans");
      if (!response.ok) {
        throw new Error("Failed to load pricing");
      }
      return response.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const subscriptionCheckout = useMutation({
    mutationFn: async (planId: string) => {
      const response = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId }),
      });
      if (!response.ok) {
        throw new Error("Checkout fehlgeschlagen");
      }
      return response.json();
    },
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onSettled: () => setLoadingPlan(null),
  });

  const creditPackCheckout = useMutation({
    mutationFn: async (packId: string) => {
      const response = await fetch("/api/checkout/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ packId }),
      });
      if (!response.ok) {
        throw new Error("Checkout fehlgeschlagen");
      }
      return response.json();
    },
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onSettled: () => setLoadingPack(null),
  });

  const handleSubscriptionCheckout = (planId: string) => {
    if (!user) {
      window.location.href = "/registrieren";
      return;
    }
    setLoadingPlan(planId);
    subscriptionCheckout.mutate(planId);
  };

  const handleCreditPackCheckout = (packId: string) => {
    if (!user) {
      window.location.href = "/anmelden";
      return;
    }
    setLoadingPack(packId);
    creditPackCheckout.mutate(packId);
  };

  const plans = data?.plans || [];
  const creditPacks = data?.creditPacks || [];

  const planOrder = ["free", "pro", "premium"];

  const plansById = useMemo(() => {
    return planOrder
      .map((id) => plans.find((plan) => plan.id === id))
      .filter(Boolean) as PublicPlanConfig[];
  }, [plans]);

  return (
    <PageLayout>
      <SEO
        title="Preise"
        description="VoxDrop Preise für barrierefreie Dokumente, Video und Web. Passende Pakete für Prüfung, laufende Accessibility-Arbeit und größere Organisationen."
        canonical="/preise"
      />
      <FAQSchema
        items={[
          {
            question: "Was sind Credits?",
            answer:
              "Credits sind das Nutzungsbudget Ihres Pakets. Sie werden für barrierefreie Exporte und KI-gestützte Verarbeitung verwendet und lassen sich bei Mehrbedarf ergänzen.",
          },
          {
            question: "Verfallen Credits?",
            answer:
              "Das enthaltene Monatsbudget wird monatlich erneuert. Zusatzbudget bleibt unbegrenzt gültig.",
          },
          {
            question: "Kann ich jederzeit kündigen?",
            answer: "Ja, alle Abos sind monatlich kündbar. Keine Mindestlaufzeit.",
          },
          {
            question: "Gibt es Verträge für Behörden?",
            answer:
              "Ja. AVV, TOMs, Löschkonzept und Audit-Logs sind verfügbar. Kontaktieren Sie uns für Beschaffungsunterlagen.",
          },
        ]}
      />

      <header className="pt-16 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-sm font-medium mb-6">
            <Crown className="w-4 h-4" />
            Preise für Teams, Fachstellen und Organisationen
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
            Das passende Paket für Ihre Accessibility-Arbeit
          </h1>
          <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
            Wählen Sie zwischen Einstieg, laufender Fachstellen-Arbeit und Organisationstarif. Für Beschaffung,
            On-Prem und größere Volumen unterstützen wir Sie persönlich.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-5xl mx-auto px-6 pb-24" tabIndex={-1}>
        <section className="grid md:grid-cols-3 gap-6 mb-16">
          {plansById.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-600">
              Preise werden geladen…
            </div>
          ) : (
            plansById.map((plan) => {
              const isFree = plan.id === "free";
              const isPro = plan.id === "pro";
              const isPremium = plan.id === "premium";

              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border overflow-hidden shadow-sm relative ${
                    isPremium
                      ? "bg-gradient-to-br from-purple-600 to-indigo-700 text-white border-transparent ring-2 ring-purple-300"
                      : isPro
                        ? "bg-white border-violet-200"
                        : "bg-white border-slate-200"
                  }`}
                >
                  {isPremium && (
                    <div className="absolute top-4 right-4">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
                        <Star className="w-3 h-3" />
                        Beliebt
                      </span>
                    </div>
                  )}

                  <div className={`p-8 ${isPremium ? "text-white" : "text-slate-900"}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          isPremium
                            ? "bg-white/20"
                            : isPro
                              ? "bg-violet-100"
                              : "bg-slate-100"
                        }`}
                      >
                        {isPremium ? (
                          <Crown className="w-6 h-6 text-white" />
                        ) : isPro ? (
                          <Zap className="w-6 h-6 text-violet-600" />
                        ) : (
                          <Zap className="w-6 h-6 text-slate-600" />
                        )}
                      </div>
                      <div>
                        <h2 className={`text-xl font-semibold ${isPremium ? "text-white" : "text-slate-900"}`}>
                          {plan.name}
                        </h2>
                      </div>
                    </div>

                    <div className="mb-2">
                      <span className={`text-4xl font-bold ${isPremium ? "text-white" : "text-slate-900"}`}>
                        {plan.monthlyPriceEur === 0 ? "0 €" : formatEuro(plan.monthlyPriceEur)}
                      </span>
                      <span className={`text-sm ${isPremium ? "text-white/70" : "text-slate-600"}`}> / Monat</span>
                    </div>

                    {plan.annualPriceEur ? (
                      <p className={`text-xs mb-4 ${isPremium ? "text-white/75" : "text-slate-500"}`}>
                        Jahrespreis: {formatEuro(plan.annualPriceEur)} auf Rechnung
                      </p>
                    ) : null}

                    <p className={`text-sm mb-6 ${isPremium ? "text-white/80" : "text-slate-600"}`}>
                      {plan.description}
                    </p>

                    <div className={`flex items-center gap-2 text-sm mb-6 p-3 rounded-lg ${
                      isPremium ? "bg-white/10" : "bg-slate-50"
                    }`}>
                      <Coins className={`w-4 h-4 ${isPremium ? "text-white" : "text-amber-600"}`} />
                      <div>
                        <p className={`font-medium ${isPremium ? "text-white" : "text-slate-700"}`}>
                          {formatNumber(plan.includedCreditsPerMonth)} Credits
                        </p>
                        <p className={`text-xs ${isPremium ? "text-white/75" : "text-slate-500"}`}>
                          Monatliches Nutzungsbudget
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 mb-8">
                      {plan.featureFlags.map((feature) => (
                        <div key={feature} className="flex items-start gap-3">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0 ${
                              isPremium ? "bg-white/20" : "bg-green-100"
                            }`}
                          >
                            <Check className={`w-3 h-3 ${isPremium ? "text-white" : "text-green-600"}`} />
                          </div>
                          <p className={`text-sm ${isPremium ? "text-white/90" : "text-slate-700"}`}>{feature}</p>
                        </div>
                      ))}
                    </div>

                    {plan.examples?.length ? (
                      <div className={`mb-8 rounded-xl p-4 ${isPremium ? "bg-white/10" : "bg-violet-50 border border-violet-100"}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${isPremium ? "text-white/80" : "text-violet-700"}`}>
                          Geeignet für
                        </p>
                        <div className="space-y-2">
                          {plan.examples.map((example) => (
                            <p key={example} className={`text-sm ${isPremium ? "text-white/90" : "text-slate-700"}`}>
                              {example}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {isFree ? (
                      <Link href="/registrieren">
                        <Button variant="outline" className="w-full h-12 rounded-xl border-slate-300">
                          Kostenlos starten
                        </Button>
                      </Link>
                    ) : isPro ? (
                      <Button
                        className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                        onClick={() => handleSubscriptionCheckout("pro")}
                        disabled={loadingPlan === "pro"}
                      >
                        {loadingPlan === "pro" ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        {user ? "Fachstelle abonnieren" : "Fachstelle starten"}
                      </Button>
                    ) : (
                      <Button
                        className="w-full h-12 rounded-xl bg-white text-purple-700 hover:bg-slate-100 font-semibold"
                        onClick={() => handleSubscriptionCheckout("premium")}
                        disabled={loadingPlan === "premium"}
                      >
                        {loadingPlan === "premium" ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        {user ? "Organisation abonnieren" : "Organisation starten"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="mb-16">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-5 text-center">Kurz erklärt</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-900 mb-2">Budget ist enthalten</p>
                <p className="text-sm text-slate-600">
                  Jedes Paket enthält ein monatliches Nutzungsbudget für Exporte, KI-gestützte Verarbeitung
                  und laufende Accessibility-Arbeit.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-900 mb-2">Mehrbedarf ist flexibel</p>
                <p className="text-sm text-slate-600">
                  Wenn ein Projekt mehr Budget braucht, können Sie Zusatzbudget jederzeit nachkaufen.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-900 mb-2">Volumen auf Anfrage</p>
                <p className="text-sm text-slate-600">
                  Für größere Programme, Beschaffung oder planbare Volumen erstellen wir ein passendes Angebot.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-16">
          <div className="p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6 text-center">Was ist in den Paketen enthalten?</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-4 pr-4 font-medium text-slate-600">Feature</th>
                    <th className="text-center py-4 px-4 font-medium text-slate-600">Prüfen</th>
                    <th className="text-center py-4 px-4 font-medium text-violet-600">Fachstelle</th>
                    <th className="text-center py-4 px-4 font-medium text-purple-600">Organisation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">Basis-Prüfungen (Kontrast, ARIA, Formulare)</td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">PDF/UA-Produktion</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">Untertitel, Audioausgabe und Audiodeskription</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">Priorisierte Verarbeitung</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">Insights-Dashboard</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">Dossiers und Governance-Reports</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">API und bevorzugter Support</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4 text-slate-400">—</td>
                    <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">Max. Dateigröße</td>
                    <td className="text-center py-4 px-4 text-slate-600">50 MB</td>
                    <td className="text-center py-4 px-4 text-slate-600">1 GB</td>
                    <td className="text-center py-4 px-4 text-slate-600">2 GB</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700">Nutzungsbudget / Monat</td>
                    <td className="text-center py-4 px-4 text-slate-600">0</td>
                    <td className="text-center py-4 px-4 text-slate-600">1.500</td>
                    <td className="text-center py-4 px-4 text-slate-600">5.000</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">Zusatzbudget für Projekte mit Mehrbedarf</h2>
            <p className="text-slate-600">Zusatzbudget bleibt gültig und hilft bei Spitzen, Zusatzlast oder größeren Vorhaben.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {creditPacks.map((pack, index) => (
              <div key={pack.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-amber-300 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Coins className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="font-semibold text-slate-900">{formatNumber(pack.credits)} Credits</p>
                </div>
                <p className="text-3xl font-bold text-slate-900 mb-1">{formatEuro(pack.priceEur)}</p>
                <p className="text-sm text-slate-500 mb-4">
                  {index === 0
                    ? "Für einzelne Projekte oder kurzfristigen Mehrbedarf"
                    : index === 1
                      ? "Für wiederkehrende Zusatzlast im laufenden Betrieb"
                      : "Für größere Vorhaben oder mehrere parallele Workstreams"}
                </p>
                <Button
                  variant="outline"
                  className="w-full h-10 rounded-lg border-slate-300 text-slate-700"
                  onClick={() => handleCreditPackCheckout(pack.id)}
                  disabled={loadingPack === pack.id}
                >
                  {loadingPack === pack.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Zusatzbudget kaufen
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-16">
          <div className="p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Shield className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Enterprise & On-Prem</h2>
                    <p className="text-sm text-slate-600">Für öffentliche Auftraggeber, sensible Umgebungen und größere Organisationen</p>
                  </div>
                </div>
                <p className="text-slate-600 mb-4">
                  Wenn Standardpakete nicht ausreichen, unterstützen wir Sie mit Beschaffung, On-Premise,
                  SSO, Datenresidenz, SLAs und planbaren Volumen für den laufenden Betrieb.
                </p>
                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-full">
                    <Check className="w-3 h-3 text-green-600" />
                    AVV, TOMs & Unterlagen
                  </span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-full">
                    <Check className="w-3 h-3 text-green-600" />
                    On-Premise & SSO
                  </span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-full">
                    <Check className="w-3 h-3 text-green-600" />
                    Individuelle SLAs & Volumen
                  </span>
                </div>
              </div>
              <div>
                <Button
                  variant="outline"
                  className="h-12 px-6 rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50"
                  onClick={() => {
                    window.location.href = "mailto:mail@wegener-gmbh.com?subject=VoxDrop Enterprise Anfrage";
                  }}
                >
                  Kontakt aufnehmen
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <p className="text-center text-sm text-slate-500">
          Alle Preise zzgl. MwSt. Monatlich kündbar. Fragen? <a href="mailto:mail@wegener-gmbh.com" className="text-violet-600 hover:underline">Schreib uns</a>
        </p>
      </main>
    </PageLayout>
  );
}
