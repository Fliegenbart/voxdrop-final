import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { ArrowLeft, Calendar, Clock, Loader2 } from "lucide-react";

type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readingTime: string;
  contentMd: string;
};

export default function DynamicBlogPost({ params }: { params: { slug: string } }) {
  const [, setLocation] = useLocation();
  const slug = String(params?.slug || "").trim();

  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/blog/posts/${encodeURIComponent(slug)}`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setPost(data.post);
      } catch (e: any) {
        setError(e?.message || "Nicht gefunden");
        setPost(null);
      } finally {
        setIsLoading(false);
      }
    };
    if (slug) run();
  }, [slug]);

  if (isLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white/70">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
	          <span>Lädt...</span>
        </div>
      </PageLayout>
    );
  }

  if (!post) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-[#0a0a0a] text-white">
          <SEO title="Artikel nicht gefunden" description="Der Artikel konnte nicht gefunden werden." canonical={`/blog/${slug}`} />
          <div className="max-w-3xl mx-auto px-6 py-16">
            <button
              onClick={() => setLocation("/blog")}
              className="inline-flex items-center gap-2 text-purple-300 hover:text-purple-200 mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
	              Zurück zum Blog
            </button>
            <h1 className="text-3xl font-bold mb-3">Artikel nicht gefunden</h1>
            <p className="text-white/60">{error || "Nicht gefunden."}</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
        <div className="fixed inset-0 bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-pink-500/10 pointer-events-none" />
        <SEO title={post.title} description={post.excerpt} canonical={`/blog/${post.slug}`} />

        <main id="main-content" className="relative max-w-3xl mx-auto px-6 pt-14 pb-24" tabIndex={-1}>
          <Link href="/blog" className="inline-flex items-center gap-2 text-purple-300 hover:text-purple-200 mb-8">
            <ArrowLeft className="w-4 h-4" />
	            Zurück zum Blog
          </Link>

          <header className="mb-10">
            <div className="text-sm text-white/60 mb-3">{post.category}</div>
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-5">{post.title}</h1>
            <p className="text-lg text-white/60">{post.excerpt}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/50 mt-6">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {new Date(post.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {post.readingTime}
              </span>
              <span className="text-white/40">|</span>
              <span className="text-white/60">{post.author}</span>
            </div>
          </header>

          <article className="prose prose-invert prose-purple max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.contentMd || ""}</ReactMarkdown>
          </article>
        </main>
      </div>
    </PageLayout>
  );
}
