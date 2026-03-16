import { useState, useEffect } from "react";
import {
  Video,
  FileText,
  Headphones,
  Link2,
  Clock,
  CheckCircle2,
  XCircle,
  Crown,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Zap,
  ArrowRight,
  MousePointerClick,
  Flame,
  Trophy,
  Sparkles,
  Lightbulb,
  PartyPopper,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";

// Types matching the backend API
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'impact' | 'consistency' | 'mastery' | 'explorer';
  unlockedAt?: string;
}

interface ImpactMetrics {
  totalDocuments: number;
  videoMinutesAccessible: number;
  estimatedPeopleReached: number;
  criticalIssuesFixed: number;
  accessibilityScore: number;
  streak: { current: number; longest: number };
}

interface LearningRecommendation {
  id: string;
  title: string;
  description: string;
  type: 'tip' | 'warning' | 'celebration';
  action?: string;
  actionUrl?: string;
}

interface DashboardStats {
  toolUsage: {
    transcriptions: { total: number; thisMonth: number };
    pdfConversions: { total: number; thisMonth: number };
    podcasts: { total: number; thisMonth: number };
    shortLinks: { total: number; totalClicks: number };
  };
  recentActivity: Array<{
    type: string;
    status: string;
    resource: string | null;
    date: string;
  }>;
  usageQuota: {
    transcriptions: { used: number; limit: number };
    videos: { used: number; limit: number };
  };
  topLinks: Array<{
    shortCode: string;
    title: string | null;
    clicks: number;
  }>;
  impact: ImpactMetrics;
  achievements: Achievement[];
  recommendations: LearningRecommendation[];
}

// Impact Hero Card
function ImpactHero({ impact }: { impact: ImpactMetrics }) {
  // Defensive null checks
  const totalDocs = impact?.totalDocuments ?? 0;
  const videoMins = impact?.videoMinutesAccessible ?? 0;
  const peopleReached = impact?.estimatedPeopleReached ?? 0;
  const issuesFixed = impact?.criticalIssuesFixed ?? 0;
  const currentStreak = impact?.streak?.current ?? 0;
  const longestStreak = impact?.streak?.longest ?? 0;

  return (
    <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 rounded-2xl p-6 text-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Ihr Barrierefreiheits-Impact</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-3xl font-bold">{totalDocs}</p>
            <p className="text-sm text-purple-200">Dokumente</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-3xl font-bold">{videoMins}</p>
            <p className="text-sm text-purple-200">Video-Minuten</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-3xl font-bold">{peopleReached.toLocaleString()}</p>
            <p className="text-sm text-purple-200">Menschen erreicht</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-3xl font-bold">{issuesFixed}</p>
            <p className="text-sm text-purple-200">Barrieren behoben</p>
          </div>
        </div>

        {/* Streak display */}
        {currentStreak > 0 && (
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 backdrop-blur-sm w-fit">
            <div className="flex items-center gap-1">
              <Flame className="w-5 h-5 text-orange-400" />
              <span className="font-bold text-lg">{currentStreak}</span>
            </div>
            <span className="text-sm text-purple-200">
              Tage Streak {longestStreak > currentStreak && `(Rekord: ${longestStreak})`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Achievements Section
function AchievementsSection({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements.filter(a => a.unlockedAt);
  const locked = achievements.filter(a => !a.unlockedAt);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-slate-900">Achievements</h3>
        </div>
        <span className="text-sm text-slate-500">{unlocked.length}/{achievements.length} freigeschaltet</span>
      </div>

      {/* Unlocked achievements */}
      {unlocked.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-4">
          {unlocked.map((achievement) => (
            <div
              key={achievement.id}
              className="group relative flex flex-col items-center p-2 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 cursor-pointer hover:scale-105 transition-transform"
              title={`${achievement.name}: ${achievement.description}`}
            >
              <span className="text-2xl">{achievement.icon}</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                <p className="font-semibold">{achievement.name}</p>
                <p className="text-slate-300">{achievement.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Locked achievements preview */}
      {locked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locked.slice(0, 6).map((achievement) => (
            <div
              key={achievement.id}
              className="group relative flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-slate-400 cursor-pointer"
              title={achievement.description}
            >
              <span className="grayscale opacity-50">{achievement.icon}</span>
              <span className="text-sm">{achievement.name}</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                <p className="font-semibold">Noch nicht freigeschaltet</p>
                <p className="text-slate-300">{achievement.description}</p>
              </div>
            </div>
          ))}
          {locked.length > 6 && (
            <span className="px-3 py-1.5 text-sm text-slate-400">
              +{locked.length - 6} weitere
            </span>
          )}
        </div>
      )}

      {unlocked.length === 0 && (
        <div className="text-center py-6 text-slate-500">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>Noch keine Achievements</p>
          <p className="text-sm mt-1">Nutze die Tools, um deine ersten Badges zu verdienen!</p>
        </div>
      )}
    </div>
  );
}

// Learning Recommendations
function RecommendationsSection({ recommendations }: { recommendations: LearningRecommendation[] }) {
  if (recommendations.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'celebration': return <PartyPopper className="w-5 h-5 text-amber-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default: return <Lightbulb className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBg = (type: string) => {
    switch (type) {
      case 'celebration': return 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200';
      case 'warning': return 'bg-orange-50 border-orange-200';
      default: return 'bg-violet-50 border-violet-200';
    }
  };

  return (
    <div className="space-y-3">
      {recommendations.map((rec) => (
        <div
          key={rec.id}
          className={`rounded-xl border p-4 ${getBg(rec.type)}`}
        >
          <div className="flex items-start gap-3">
            {getIcon(rec.type)}
            <div className="flex-1">
              <p className="font-medium text-slate-900">{rec.title}</p>
              <p className="text-sm text-slate-600 mt-0.5">{rec.description}</p>
              {rec.action && rec.actionUrl && (
                <Link
                  href={rec.actionUrl}
                  className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 mt-2 font-medium"
                >
                  {rec.action}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  href,
}: {
  title: string;
  value: number;
  subtitle?: string;
  href?: string;
}) {
  const content = (
    <article className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
      {subtitle && (
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      )}
    </article>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// Quota Progress Component
function QuotaProgress({
  label,
  used,
  limit,
  onUpgrade,
}: {
  label: string;
  used: number;
  limit: number;
  onUpgrade: () => void;
}) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min(100, (used / limit) * 100);
  const remaining = isUnlimited ? Infinity : Math.max(0, limit - used);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-slate-900">{label}</p>
        {isUnlimited ? (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1">
            <Crown className="w-4 h-4" />
            Unbegrenzt
          </span>
        ) : (
          <span className="text-sm text-slate-600">
            {used} / {limit} genutzt
          </span>
        )}
      </div>

      {!isUnlimited && (
        <>
          <div className="w-full bg-slate-100 rounded-full h-2.5 mb-3">
            <div
              className={`h-2.5 rounded-full transition-all ${
                percentage >= 100
                  ? "bg-red-500"
                  : percentage >= 80
                  ? "bg-yellow-500"
                  : "bg-gradient-to-r from-violet-600 to-purple-700"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {remaining === 0 ? (
            <button
              onClick={onUpgrade}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              <Crown className="w-4 h-4" />
              Upgrade für mehr
            </button>
          ) : remaining <= 2 ? (
            <p className="text-sm text-yellow-600 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Nur noch {remaining} uebrig
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// Recent Activity Component
function RecentActivity({
  activities,
}: {
  activities: DashboardStats["recentActivity"];
}) {
  const getActivityInfo = (type: string) => {
    switch (type) {
      case "transcribe":
        return { label: "Transkription", icon: Video, color: "text-violet-600" };
      case "pptx_convert":
        return { label: "PDF-Konvertierung", icon: FileText, color: "text-orange-600" };
      case "podcast_convert":
        return { label: "Podcast erstellt", icon: Headphones, color: "text-amber-600" };
      case "link_create":
        return { label: "Kurzlink erstellt", icon: Link2, color: "text-teal-600" };
      case "simplify_text":
        return { label: "Text vereinfacht", icon: FileText, color: "text-green-600" };
      case "color_analysis":
        return { label: "Farbanalyse", icon: Zap, color: "text-pink-600" };
      default:
        return { label: type, icon: Clock, color: "text-slate-600" };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Gerade eben";
    if (diffMins < 60) return `Vor ${diffMins} Min.`;
    if (diffHours < 24) return `Vor ${diffHours} Std.`;
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    return date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  };

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Letzte Aktivitäten
        </h3>
        <div className="text-center py-8 text-slate-500">
          <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>Noch keine Aktivitäten</p>
          <p className="text-sm mt-1">Nutze eines der Tools, um loszulegen!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Letzte Aktivitäten
      </h3>
      <ul className="space-y-3">
        {activities.map((activity, index) => {
          const info = getActivityInfo(activity.type);
          const Icon = info.icon;
          return (
            <li
              key={`${activity.date}-${index}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-50"
            >
              <div className={`${info.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm">{info.label}</p>
                {activity.resource && (
                  <p className="text-xs text-slate-500 truncate">
                    {activity.resource}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activity.status === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-xs text-slate-500">
                  {formatDate(activity.date)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Top Links Component
function TopLinks({ links }: { links: DashboardStats["topLinks"] }) {
  if (links.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Top Kurzlinks
        </h3>
        <div className="text-center py-8 text-slate-500">
          <Link2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>Noch keine Kurzlinks erstellt</p>
          <Link
            href="/tools/url-shortener"
            className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 mt-2"
          >
            Jetzt erstellen <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Top Kurzlinks</h3>
        <Link
          href="/tools/url-shortener"
          className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1"
        >
          Alle anzeigen <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <ul className="space-y-3">
        {links.map((link) => (
          <li
            key={link.shortCode}
            className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 text-sm truncate">
                {link.title || `voxdrop.de/s/${link.shortCode}`}
              </p>
              <p className="text-xs text-slate-500">
                voxdrop.de/s/{link.shortCode}
              </p>
            </div>
            <div className="flex items-center gap-1 text-purple-600">
              <MousePointerClick className="w-4 h-4" />
              <span className="font-semibold">{link.clicks}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Quick Actions Component
function QuickActions() {
  const tools = [
    { name: "Schnitt & Struktur", href: "/tools/untertitel", icon: Video, color: "from-violet-600 to-purple-700" },
    { name: "PPTX zu PDF/UA", href: "/tools/pptx-to-pdf-smart", icon: FileText, color: "from-orange-500 to-red-500" },
    { name: "Podcast", href: "/tools/pptx-podcast", icon: Headphones, color: "from-amber-500 to-orange-600" },
    { name: "URL-Shortener", href: "/tools/url-shortener", icon: Link2, color: "from-teal-500 to-cyan-600" },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Schnellzugriff</h3>
      <div className="grid grid-cols-2 gap-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <div className={`w-10 h-10 bg-gradient-to-br ${tool.color} rounded-lg flex items-center justify-center`}>
              <tool.icon className="w-5 h-5 text-white" />
            </div>
            <span className="font-medium text-slate-900 text-sm">{tool.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Main Dashboard Component
export function InsightsDashboard({ isPremium = true }: { isPremium?: boolean }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { openUpgradeModal, isAuthenticated } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/dashboard/stats");

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[Dashboard] API error:", response.status, errorText);
          throw new Error("Dashboard-Daten konnten nicht geladen werden");
        }

        const data = await response.json();
        console.log("[Dashboard] Loaded stats:", data);
        setStats(data);
      } catch (err) {
        console.error("[Dashboard] Error:", err);
        setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isAuthenticated]);

  if (!isPremium) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-8 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Crown className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">
          Premium-Feature
        </h3>
        <p className="text-slate-600 mb-6 max-w-md mx-auto">
          Das Dashboard zeigt deine Nutzungsstatistiken, Aktivitäten und
          Kurzlink-Analytics auf einen Blick.
        </p>
        <Link
          href="/preise"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all"
        >
          <Crown className="w-4 h-4" />
          Upgrade auf Pro
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
        <p className="text-yellow-800">{error || "Daten konnten nicht geladen werden."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Impact Hero */}
      {stats.impact && <ImpactHero impact={stats.impact} />}

      {/* Learning Recommendations */}
      {stats.recommendations && stats.recommendations.length > 0 && (
        <RecommendationsSection recommendations={stats.recommendations} />
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Transkriptionen"
          value={stats.toolUsage.transcriptions.total}
          subtitle={stats.toolUsage.transcriptions.thisMonth > 0 ? `${stats.toolUsage.transcriptions.thisMonth} diesen Monat` : undefined}
          href="/tools/untertitel"
        />
        <StatCard
          title="PDF-Konvertierungen"
          value={stats.toolUsage.pdfConversions.total}
          subtitle={stats.toolUsage.pdfConversions.thisMonth > 0 ? `${stats.toolUsage.pdfConversions.thisMonth} diesen Monat` : undefined}
          href="/tools/pptx-to-pdf-smart"
        />
        <StatCard
          title="Podcasts"
          value={stats.toolUsage.podcasts.total}
          subtitle={stats.toolUsage.podcasts.thisMonth > 0 ? `${stats.toolUsage.podcasts.thisMonth} diesen Monat` : undefined}
          href="/tools/pptx-podcast"
        />
        <StatCard
          title="Kurzlinks"
          value={stats.toolUsage.shortLinks.total}
          subtitle={stats.toolUsage.shortLinks.totalClicks > 0 ? `${stats.toolUsage.shortLinks.totalClicks} Klicks gesamt` : undefined}
          href="/tools/url-shortener"
        />
      </div>

      {/* Achievements */}
      {stats.achievements && <AchievementsSection achievements={stats.achievements} />}

      {/* Usage Quota */}
      <div className="grid lg:grid-cols-2 gap-4">
        <QuotaProgress
          label="Transkriptionen"
          used={stats.usageQuota.transcriptions.used}
          limit={stats.usageQuota.transcriptions.limit}
          onUpgrade={() => openUpgradeModal("transcriptions")}
        />
        <QuotaProgress
          label="Video-Einbettungen"
          used={stats.usageQuota.videos.used}
          limit={stats.usageQuota.videos.limit}
          onUpgrade={() => openUpgradeModal("videos")}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        <RecentActivity activities={stats.recentActivity} />
        <TopLinks links={stats.topLinks} />
      </div>

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}

export default InsightsDashboard;
