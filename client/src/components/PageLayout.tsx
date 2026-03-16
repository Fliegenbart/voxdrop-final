import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

interface PageLayoutProps {
  children: React.ReactNode;
  /** Use "white" for the home page, defaults to page-bg token */
  bg?: "page-bg" | "white";
  /** Hide footer on auth pages */
  footer?: boolean;
  /** Hide shared navigation (for pages with custom nav like login/register) */
  nav?: boolean;
}

export function PageLayout({
  children,
  bg = "page-bg",
  footer = true,
  nav = true,
}: PageLayoutProps) {
  const bgClass = bg === "white" ? "bg-white" : "bg-page-bg";

  return (
    <div className={`min-h-screen ${bgClass}`}>
      {nav && <Navigation />}
      {children}
      {footer && <Footer />}
    </div>
  );
}
