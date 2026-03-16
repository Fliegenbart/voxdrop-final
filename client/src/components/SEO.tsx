import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  noIndex?: boolean;
}

const BASE_URL = "https://voxdrop.live";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;
const SITE_NAME = "VoxDrop";

export function SEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  noIndex = false,
}: SEOProps) {
  useEffect(() => {
    // Update title
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    const resolvedCanonical = canonical || (typeof window !== "undefined" ? window.location.pathname : undefined);

    // Helper to set or create meta tag
    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? "property" : "name";
      let meta = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    // Helper to set link tag
    const setLink = (rel: string, href: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", rel);
        document.head.appendChild(link);
      }
      link.setAttribute("href", href);
    };

    // Basic meta tags
    setMeta("description", description);

    // Robots
    if (noIndex) {
      setMeta("robots", "noindex, nofollow");
    } else {
      setMeta("robots", "index, follow");
    }

    // Canonical URL
    if (resolvedCanonical) {
      setLink("canonical", `${BASE_URL}${resolvedCanonical}`);
    }

    // Open Graph tags
    setMeta("og:title", fullTitle, true);
    setMeta("og:description", description, true);
    setMeta("og:type", ogType, true);
    setMeta("og:image", ogImage, true);
    setMeta("og:url", resolvedCanonical ? `${BASE_URL}${resolvedCanonical}` : BASE_URL, true);
    setMeta("og:site_name", SITE_NAME, true);
    setMeta("og:locale", "de_DE", true);

    // Twitter Card tags
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", description);
    setMeta("twitter:image", ogImage);

    const schemaId = "schema-softwareapplication";
    const existingSchema = document.getElementById(schemaId);
    if (existingSchema) existingSchema.remove();

    if (resolvedCanonical?.startsWith("/tools/") && !noIndex) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = schemaId;
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: title,
        description: description,
        url: `${BASE_URL}${resolvedCanonical}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        provider: {
          "@type": "Organization",
          name: SITE_NAME,
          url: BASE_URL,
        },
      });
      document.head.appendChild(script);
    }

    // Cleanup function - reset to defaults when component unmounts
    return () => {
      document.title = `${SITE_NAME} - Barrierefreie digitale Inhalte für Behörden`;
      const schema = document.getElementById(schemaId);
      if (schema) schema.remove();
    };
  }, [title, description, canonical, ogImage, ogType, noIndex]);

  return null;
}

// JSON-LD Schema component
interface SchemaProps {
  type: "Organization" | "WebSite" | "Product" | "FAQPage" | "BreadcrumbList" | "Article";
  data: Record<string, any>;
}

export function Schema({ type, data }: SchemaProps) {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = `schema-${type}`;

    const schema = {
      "@context": "https://schema.org",
      "@type": type,
      ...data,
    };

    script.textContent = JSON.stringify(schema);

    // Remove existing schema of same type
    const existing = document.getElementById(`schema-${type}`);
    if (existing) {
      existing.remove();
    }

    document.head.appendChild(script);

    return () => {
      const el = document.getElementById(`schema-${type}`);
      if (el) el.remove();
    };
  }, [type, data]);

  return null;
}

// Predefined schemas for common use
export function OrganizationSchema() {
  return (
    <Schema
      type="Organization"
      data={{
        name: "VoxDrop",
        url: BASE_URL,
        logo: `${BASE_URL}/logo.png`,
        description: "Barrierefreie digitale Inhalte, lokale Workflows und nachvollziehbare Exporte für Behörden und regulierte Organisationen.",
        address: {
          "@type": "PostalAddress",
          addressCountry: "DE",
        },
        sameAs: [],
      }}
    />
  );
}

export function WebSiteSchema() {
  return (
    <Schema
      type="WebSite"
      data={{
        name: "VoxDrop",
        url: BASE_URL,
        description: "Lokale Accessibility- und Produktionssuite für Behörden, öffentliche Stellen und regulierte Organisationen.",
        inLanguage: "de-DE",
        potentialAction: {
          "@type": "SearchAction",
          target: `${BASE_URL}/tools?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      }}
    />
  );
}

interface ArticleSchemaProps {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
}

export function ArticleSchema({ title, description, url, datePublished, dateModified, author = "VoxDrop Team" }: ArticleSchemaProps) {
  return (
    <Schema
      type="Article"
      data={{
        headline: title,
        description: description,
        url: `${BASE_URL}${url}`,
        datePublished: datePublished,
        dateModified: dateModified || datePublished,
        author: {
          "@type": "Organization",
          name: author,
        },
        publisher: {
          "@type": "Organization",
          name: "VoxDrop",
          logo: {
            "@type": "ImageObject",
            url: `${BASE_URL}/logo.png`,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${BASE_URL}${url}`,
        },
        inLanguage: "de-DE",
      }}
    />
  );
}

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSchemaProps {
  items: FAQItem[];
}

export function FAQSchema({ items }: FAQSchemaProps) {
  return (
    <Schema
      type="FAQPage"
      data={{
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }}
    />
  );
}
