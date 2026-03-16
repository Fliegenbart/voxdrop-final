import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { blogPosts as staticBlogPosts, formatDate, type BlogPost } from "@/lib/blog-posts";
import {
  BookOpen, Calendar, Clock, ArrowRight, Sparkles,
  Scale, Lightbulb, TrendingUp
} from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";

// Category icons and colors
const categoryConfig: Record<string, { icon: typeof BookOpen; color: string; bg: string }> = {
  "Grundlagen": { icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-500/10" },
  "Recht & Compliance": { icon: Scale, color: "text-blue-500", bg: "bg-violet-500/10" },
  "Best Practices": { icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" },
};

export default function BlogIndex() {
  const [remotePosts, setRemotePosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/blog/posts", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const posts = Array.isArray(data?.posts) ? (data.posts as BlogPost[]) : [];
        setRemotePosts(posts);
      } catch {
        // ignore
      }
    };
    run();
  }, []);

  const allPosts = useMemo(() => {
    const map = new Map<string, BlogPost>();
    for (const p of staticBlogPosts) map.set(p.slug, p);
    for (const p of remotePosts) {
      if (!map.has(p.slug)) {
        map.set(p.slug, p);
      }
    }
    return Array.from(map.values()).sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [remotePosts]);

  const featuredPost = allPosts[0];
  const otherPosts = allPosts.slice(1);

  const getCategoryConfig = (category: string) => {
    return categoryConfig[category] || { icon: BookOpen, color: "text-purple-500", bg: "bg-purple-500/10" };
  };

  return (
    <PageLayout>
      <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-pink-500/10 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <SEO
        title="Blog - VoxDrop"
        description="Neuigkeiten, Tipps und Wissen rund um digitale Barrierefreiheit. Erfahren Sie alles über WCAG, BITV, Leichte Sprache und barrierefreie Dokumente."
        canonical="/blog"
      />

      {/* Hero Section */}
      <header className="relative pt-20 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/80 text-sm mb-6 border border-white/10">
            <Sparkles className="w-4 h-4" />
            Wissen & Insights
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
            VoxDrop <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Blog</span>
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto font-light">
            Praktisches Wissen rund um digitale Barrierefreiheit, WCAG, BFSG und inklusive Gestaltung.
          </p>
        </div>
      </header>

      <main id="main-content" className="relative max-w-5xl mx-auto px-6 pb-24" tabIndex={-1}>

        {/* Featured Post */}
        {featuredPost && (
          <Link href={`/blog/${featuredPost.slug}`}>
            <article className="group mb-12 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden hover:border-purple-500/50 transition-all duration-300">
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-xs font-semibold uppercase tracking-wide">
                    Neu
                  </span>
                  {(() => {
                    const config = getCategoryConfig(featuredPost.category);
                    const IconComponent = config.icon;
                    return (
                      <span className={`flex items-center gap-1.5 px-3 py-1.5 ${config.bg} ${config.color} rounded-full text-xs font-medium`}>
                        <IconComponent className="w-3.5 h-3.5" />
                        {featuredPost.category}
                      </span>
                    );
                  })()}
                </div>

                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 group-hover:text-purple-300 transition-colors leading-tight">
                  {featuredPost.title}
                </h2>

                <p className="text-white/60 text-lg mb-6 line-clamp-2">
                  {featuredPost.excerpt}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-white/50">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formatDate(featuredPost.date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      {featuredPost.readingTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-purple-400 font-medium group-hover:gap-3 transition-all">
                    <span>Artikel lesen</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </article>
          </Link>
        )}

        {/* Other Posts Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {otherPosts.map((post) => {
            const config = getCategoryConfig(post.category);
            const IconComponent = config.icon;

            return (
              <Link key={post.slug} href={`/blog/${post.slug}`}>
                <article className="group h-full bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden hover:bg-white/10 hover:border-white/20 transition-all duration-300">
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`flex items-center gap-1.5 px-3 py-1.5 ${config.bg} ${config.color} rounded-full text-xs font-medium`}>
                        <IconComponent className="w-3.5 h-3.5" />
                        {post.category}
                      </span>
                    </div>

                    <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-purple-300 transition-colors leading-snug">
                      {post.title}
                    </h3>

                    <p className="text-white/50 mb-4 line-clamp-2 text-sm">
                      {post.excerpt}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex items-center gap-3 text-xs text-white/40">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(post.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {post.readingTime}
                        </span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>

        {/* Empty State */}
        {allPosts.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-white/30" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">Noch keine Beiträge</h2>
            <p className="text-white/50">Bald finden Sie hier spannende Artikel zu Barrierefreiheit.</p>
          </div>
        )}

        {/* Newsletter CTA */}
        <div className="mt-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl rounded-3xl border border-purple-500/20 p-8 md:p-10 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Bleiben Sie informiert
          </h2>
          <p className="text-white/60 mb-6 max-w-lg mx-auto">
            Neue Artikel, Gesetzesänderungen und praktische Tipps direkt in Ihr Postfach.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="ihre@email.de"
              className="flex-1 h-12 px-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <button className="h-12 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
              Abonnieren
            </button>
          </div>
        </div>
      </main>
      </div>

    </PageLayout>
  );
}
