import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Crown, Folder, LayoutDashboard, LogOut, Pencil, Settings, Sparkles, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getPlanDisplayName } from "@/lib/billing";
import { CreditBalance } from "@/components/CreditBalance";

const MARKETING_LINKS = [
  { label: "Produkt", href: "/features" },
  { label: "Einsatzbereiche", href: "/#einsatzbereiche" },
  { label: "Sicherheit", href: "/#sicherheit-betrieb" },
];

export function Navigation() {
  const [location, setLocation] = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();

  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);
  const userMenuItemsRef = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);

  const navId = useId();
  const userMenuId = `${navId}-user-menu`;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && userMenuOpen) {
        setUserMenuOpen(false);
        userMenuButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [userMenuOpen]);

  useEffect(() => {
    if (userMenuOpen && userMenuItemsRef.current[0]) {
      userMenuItemsRef.current[0].focus();
    }
  }, [userMenuOpen]);

  const isBlogArea = location === "/blog" || location.startsWith("/blog/");
  const isBlogPostPage = location.startsWith("/blog/") && location !== "/blog";
  const blogSlug = isBlogPostPage ? location.slice("/blog/".length).split("/")[0] : null;
  const adminBlogHref = blogSlug ? `/admin/blog?slug=${encodeURIComponent(blogSlug)}` : "/admin/blog";
  const adminBlogLabel = blogSlug ? "Bearbeiten" : "Blog bearbeiten";
  const isAdmin = (user?.role || "").toLowerCase() === "admin";
  const isSubscribed = user?.subscription !== "free";
  const isMarketingHome = location === "/";
  const showMarketingDemoCta = !isMarketingHome;

  const isMarketingLinkActive = (href: string) => {
    if (href === "/features") {
      return location === "/features";
    }

    if (href === "/behoerden") {
      return location === "/behoerden";
    }

    if (href.startsWith("/#")) {
      return isMarketingHome;
    }

    return location === href;
  };

  const handleUserMenuKeyDown = (event: React.KeyboardEvent, index: number) => {
    const items = userMenuItemsRef.current.filter(Boolean);
    const itemCount = items.length;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        items[(index + 1) % itemCount]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        items[(index - 1 + itemCount) % itemCount]?.focus();
        break;
      case "Home":
        event.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        items[itemCount - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        setUserMenuOpen(false);
        userMenuButtonRef.current?.focus();
        break;
      case "Tab":
        setUserMenuOpen(false);
        break;
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl" role="navigation" aria-label="Hauptnavigation">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
      >
        Zum Hauptinhalt springen
      </a>

      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="VoxDrop Startseite">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-700" aria-hidden="true">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">VoxDrop</div>
            <div className="hidden text-xs text-slate-500 md:block">Lokale Accessibility-Workflows für Behörden</div>
          </div>
        </Link>

        <div className="hidden items-center gap-5 md:flex">
          {MARKETING_LINKS.map((item) => {
            const isActive = isMarketingLinkActive(item.href);

            return (
              <a
                key={item.label}
                href={item.href}
                className={`text-sm transition-colors ${isActive ? "font-medium text-violet-700" : "text-slate-600 hover:text-violet-700"}`}
              >
                {item.label}
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && isAdmin && isBlogArea && (
            <Link
              href={adminBlogHref}
              onClick={() => setUserMenuOpen(false)}
              className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-200 lg:inline-flex"
              title={blogSlug ? "Diesen Blog-Artikel bearbeiten" : "Blog-Artikel hinzufügen, bearbeiten und löschen"}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {adminBlogLabel}
            </Link>
          )}

          {isAuthenticated && user ? (
            <>
              <div className="hidden lg:block">
                <CreditBalance />
              </div>
              <div className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 px-3 py-1.5 lg:flex">
                <Crown className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                  {isSubscribed ? getPlanDisplayName(user.subscription) : "Prüfen"}
                </span>
              </div>

              <div className="relative" ref={userMenuRef}>
                <button
                  ref={userMenuButtonRef}
                  onClick={() => setUserMenuOpen((open) => !open)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  aria-controls={userMenuId}
                  aria-label={`Benutzermenü für ${user.email}`}
                  className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-700" aria-hidden="true">
                    <span className="text-xs font-medium text-white">
                      {user.email.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-600 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>

                {userMenuOpen && (
                  <div
                    id={userMenuId}
                    role="menu"
                    aria-label="Benutzermenü"
                    className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                  >
                    <div className="border-b border-slate-100 p-3" role="none">
                      <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
                      <p className="text-xs text-slate-600">{getPlanDisplayName(user.subscription)}</p>
                    </div>
                    <div className="p-2" role="none">
                      <Link
                        href="/settings#insights"
                        onClick={() => setUserMenuOpen(false)}
                        ref={(el) => {
                          userMenuItemsRef.current[0] = el;
                        }}
                        role="menuitem"
                        tabIndex={0}
                        onKeyDown={(event) => handleUserMenuKeyDown(event, 0)}
                        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-inset"
                      >
                        <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50">
                          <LayoutDashboard className="h-4 w-4 text-slate-600" aria-hidden="true" />
                          <span className="text-sm text-slate-700">Dashboard</span>
                        </div>
                      </Link>
                      <Link
                        href="/documents"
                        onClick={() => setUserMenuOpen(false)}
                        ref={(el) => {
                          userMenuItemsRef.current[1] = el;
                        }}
                        role="menuitem"
                        tabIndex={0}
                        onKeyDown={(event) => handleUserMenuKeyDown(event, 1)}
                        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-inset"
                      >
                        <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50">
                          <Folder className="h-4 w-4 text-slate-600" aria-hidden="true" />
                          <span className="text-sm text-slate-700">Dokumente</span>
                        </div>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        ref={(el) => {
                          userMenuItemsRef.current[2] = el;
                        }}
                        role="menuitem"
                        tabIndex={0}
                        onKeyDown={(event) => handleUserMenuKeyDown(event, 2)}
                        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-inset"
                      >
                        <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50">
                          <Settings className="h-4 w-4 text-slate-600" aria-hidden="true" />
                          <span className="text-sm text-slate-700">Einstellungen</span>
                        </div>
                      </Link>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          logout().then(() => setLocation("/"));
                        }}
                        ref={(el) => {
                          userMenuItemsRef.current[3] = el;
                        }}
                        role="menuitem"
                        tabIndex={0}
                        onKeyDown={(event) => handleUserMenuKeyDown(event, 3)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-inset"
                      >
                        <LogOut className="h-4 w-4 text-slate-600" aria-hidden="true" />
                        <span className="text-sm text-slate-700">Abmelden</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm text-slate-600 transition-colors hover:text-slate-900 sm:inline">
                Anmelden
              </Link>
              {showMarketingDemoCta && (
                <a
                  href="mailto:anfrage@voxdrop.live?subject=Beh%C3%B6rdendemo%20VoxDrop"
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
                >
                  Behördendemo anfragen
                </a>
              )}
            </>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200/70 px-6 py-3 md:hidden">
        <div className="mx-auto flex max-w-6xl gap-3 overflow-x-auto whitespace-nowrap">
          {MARKETING_LINKS.map((item) => {
            const isActive = isMarketingLinkActive(item.href);

            return (
              <a
                key={item.label}
                href={item.href}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
