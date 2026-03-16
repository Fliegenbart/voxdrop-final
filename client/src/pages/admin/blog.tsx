import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { Loader2, Plus, Save, Trash2, ExternalLink, Shield } from "lucide-react";

type BlogStatus = "draft" | "published";

type BlogPostRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  author: string;
  category: string;
  status: BlogStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export default function AdminBlogEditor() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => posts.find((p) => p.id === selectedId) || null, [posts, selectedId]);

  const [draft, setDraft] = useState<{
    title: string;
    slug: string;
    excerpt: string;
    author: string;
    category: string;
    status: BlogStatus;
    contentMd: string;
  }>({
    title: "",
    slug: "",
    excerpt: "",
    author: "",
    category: "",
    status: "draft",
    contentMd: "",
  });

  const requestedSlug = useMemo(() => {
    const params = new URLSearchParams(search);
    const raw = params.get("slug");
    if (!raw) return null;
    const s = raw.trim().toLowerCase();
    return s || null;
  }, [search]);

  // Redirect if not authenticated (preserve query so login can redirect back)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const next = window.location.pathname + window.location.search;
      setLocation("/login?next=" + encodeURIComponent(next));
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Load posts (admin)
  useEffect(() => {
    const run = async () => {
      if (!isAuthenticated) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchJson<{ posts: BlogPostRow[] }>("/api/admin/blog/posts");
        setPosts(data.posts);
        if (requestedSlug) {
          const match = data.posts.find((p) => p.slug === requestedSlug);
          setSelectedId(match?.id ?? data.posts[0]?.id ?? null);
        } else {
          setSelectedId(data.posts[0]?.id ?? null);
        }
      } catch (e: any) {
        setError(e?.message || "Fehler beim Laden");
      } finally {
        setIsLoading(false);
      }
    };
    run();
  }, [isAuthenticated, requestedSlug]);

  // Sync selected -> editor draft
  useEffect(() => {
    if (!selected) return;
    setDraft({
      title: selected.title || "",
      slug: selected.slug || "",
      excerpt: selected.excerpt || "",
      author: selected.author || "",
      category: selected.category || "",
      status: selected.status,
      contentMd: selected.content_md || "",
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = (user?.role || "").toLowerCase() === "admin";

  const onCreate = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const created = await fetchJson<{ post: BlogPostRow }>("/api/admin/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Neuer Beitrag",
          status: "draft",
          excerpt: "",
          contentMd: "",
          author: user?.email || "",
          category: "Blog",
        }),
      });
      setPosts((prev) => [created.post, ...prev]);
      setSelectedId(created.post.id);
    } catch (e: any) {
      setError(e?.message || "Konnte Beitrag nicht erstellen");
    } finally {
      setIsSaving(false);
    }
  };

  const onCreateForSlug = async (slug: string) => {
    setError(null);
    setIsSaving(true);
    try {
      const title = slug.replace(/-/g, " ").slice(0, 140) || "Neuer Beitrag";
      const created = await fetchJson<{ post: BlogPostRow }>("/api/admin/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          status: "draft",
          excerpt: "",
          contentMd: "",
          author: user?.email || "",
          category: "Blog",
        }),
      });
      setPosts((prev) => [created.post, ...prev]);
      setSelectedId(created.post.id);
    } catch (e: any) {
      setError(e?.message || "Konnte Beitrag nicht erstellen");
    } finally {
      setIsSaving(false);
    }
  };

  const onSave = async (opts?: { publish?: boolean; unpublish?: boolean }) => {
    if (!selected) return;
    setError(null);
    setIsSaving(true);
    try {
      const nextStatus: BlogStatus = opts?.publish ? "published" : opts?.unpublish ? "draft" : draft.status;
      const payload: any = {
        title: draft.title,
        slug: draft.slug,
        excerpt: draft.excerpt,
        author: draft.author,
        category: draft.category,
        status: nextStatus,
        contentMd: draft.contentMd,
      };
      if (opts?.unpublish) {
        payload.publishedAt = null;
      }

      const updated = await fetchJson<{ post: BlogPostRow }>(`/api/admin/blog/posts/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setPosts((prev) => prev.map((p) => (p.id === updated.post.id ? updated.post : p)));
      setSelectedId(updated.post.id);
    } catch (e: any) {
      setError(e?.message || "Konnte nicht speichern");
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!confirm(`Beitrag wirklich löschen?\n\n${selected.title}`)) return;
    setError(null);
    setIsSaving(true);
    try {
      await fetch(`/api/admin/blog/posts/${selected.id}`, { method: "DELETE", credentials: "include" });
      setPosts((prev) => {
        const next = prev.filter((p) => p.id !== selected.id);
        setSelectedId(next[0]?.id ?? null);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Konnte nicht löschen");
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white/70">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        <span>Laedt...</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <SEO title="Admin Blog" description="Admin Blog Editor" noIndex={true} />
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white/70" />
            </div>
            <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
          </div>
          <p className="text-white/60 mb-6">Du bist eingeloggt, aber kein Admin.</p>
          <Link href="/settings" className="text-purple-300 hover:text-purple-200">
            Zurück zu den Einstellungen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SEO title="Admin Blog Editor" description="Blog Posts verwalten" noIndex={true} canonical="/admin/blog" />

      <div className="border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-white font-semibold tracking-tight">
              VoxDrop
            </Link>
            <span className="text-white/30">/</span>
            <span className="text-white/70">Blog Editor</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCreate}
              disabled={isSaving}
              className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 flex items-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Neu
            </button>
            <button
              onClick={() => onSave()}
              disabled={!selected || isSaving}
              className="h-9 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Speichern
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-[320px_1fr] gap-6">
        <aside className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-sm text-white/60">Beiträge</div>
          <div className="max-h-[70vh] overflow-auto">
            {posts.length === 0 && <div className="p-4 text-white/50 text-sm">Keine Beiträge.</div>}
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={[
                  "w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/5",
                  p.id === selectedId ? "bg-white/10" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium line-clamp-1">{p.title || "(ohne Titel)"}</div>
                  <span className={["text-xs px-2 py-0.5 rounded-full border", p.status === "published" ? "border-green-500/30 text-green-300 bg-green-500/10" : "border-white/10 text-white/50 bg-white/5"].join(" ")}>
                    {p.status}
                  </span>
                </div>
                <div className="text-xs text-white/40 mt-1 line-clamp-1">/{p.slug}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-6">
          {error && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
              {error}
            </div>
          )}

          {requestedSlug && !posts.some((p) => p.slug === requestedSlug) && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-100 text-sm flex items-center justify-between gap-3">
              <div>
                Kein Beitrag mit Slug <span className="font-mono text-amber-200">/{requestedSlug}</span> gefunden.
              </div>
              <button
                onClick={() => onCreateForSlug(requestedSlug)}
                disabled={isSaving}
                className="h-9 px-3 rounded-lg bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
              >
                Draft anlegen
              </button>
            </div>
          )}

          {!selected && (
            <div className="p-8 rounded-2xl border border-white/10 bg-white/5 text-white/60">
              Wähle links einen Beitrag aus oder erstelle einen neuen.
            </div>
          )}

          {selected && (
            <>
              <section className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-xs text-white/60 mb-1">Titel</div>
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      className="w-full h-10 px-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                      placeholder="Titel"
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs text-white/60 mb-1">Slug</div>
                    <input
                      value={draft.slug}
                      onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                      className="w-full h-10 px-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                      placeholder="mein-artikel-slug"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <div className="text-xs text-white/60 mb-1">Excerpt</div>
                    <textarea
                      value={draft.excerpt}
                      onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                      placeholder="Kurzbeschreibung für die Blog-Liste"
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs text-white/60 mb-1">Autor</div>
                    <input
                      value={draft.author}
                      onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))}
                      className="w-full h-10 px-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                      placeholder="Autor"
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs text-white/60 mb-1">Kategorie</div>
                    <input
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      className="w-full h-10 px-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                      placeholder="Kategorie"
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs text-white/60 mb-1">Status</div>
                    <select
                      value={draft.status}
                      onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as BlogStatus }))}
                      className="w-full h-10 px-3 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                    >
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                    </select>
                  </label>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => onSave({ publish: true })}
                      disabled={isSaving}
                      className="h-10 px-3 rounded-lg bg-green-500/15 border border-green-500/25 text-green-200 hover:bg-green-500/20 disabled:opacity-50"
                    >
                      Publish
                    </button>
                    <button
                      onClick={() => onSave({ unpublish: true })}
                      disabled={isSaving}
                      className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-50"
                    >
                      Unpublish
                    </button>
                    <button
                      onClick={onDelete}
                      disabled={isSaving}
                      className="h-10 px-3 rounded-lg bg-red-500/15 border border-red-500/25 text-red-200 hover:bg-red-500/20 flex items-center gap-2 disabled:opacity-50 ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      Löschen
                    </button>
                  </div>
                </div>

                {selected.slug && (
                  <div className="mt-4 flex items-center justify-between text-xs text-white/50">
                    <div>
                      Updated: <span className="text-white/70">{selected.updated_at}</span>
                      {selected.published_at ? (
                        <>
                          {" "}
                          | Published: <span className="text-white/70">{selected.published_at}</span>
                        </>
                      ) : null}
                    </div>
                    <a
                      href={`/blog/${draft.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-purple-300 hover:text-purple-200"
                    >
                      Public Preview <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </section>

              <section className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="text-sm text-white/70 mb-3">Markdown</div>
                  <textarea
                    value={draft.contentMd}
                    onChange={(e) => setDraft((d) => ({ ...d, contentMd: e.target.value }))}
                    rows={18}
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 font-mono text-sm"
                    placeholder={"# Ueberschrift\\n\\nText..."}
                  />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="text-sm text-white/70 mb-3">Preview</div>
                  <div className="prose prose-invert prose-purple max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.contentMd || ""}</ReactMarkdown>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {isSaving && (
        <div className="fixed bottom-5 right-5 px-4 py-2 rounded-xl bg-black/70 border border-white/10 text-white/80 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Speichere...
        </div>
      )}
    </div>
  );
}
