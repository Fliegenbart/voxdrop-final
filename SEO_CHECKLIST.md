# SEO Checklist (Operations)

This checklist documents the ongoing SEO steps for VoxDrop.

## 1) Google Search Console (manual)
- Verify property for https://voxdrop.live
- Submit sitemap: https://voxdrop.live/sitemap.xml
- Use URL Inspection to request indexing for key pages
- Monitor Coverage + Page Indexing reports weekly
- Fix any crawl errors (4xx, 5xx, soft 404)

## 2) Robots and Sitemap
- Keep robots.txt up to date
- Ensure sitemap lists all public marketing and tool pages
- Exclude private or tokenized routes (login, settings, /f/*)

## 3) Meta and Structured Data
- Ensure each public page has title + meta description
- Check JSON-LD validity (SoftwareApplication for tools)
- Verify canonical URLs are correct

## 4) Performance (Core Web Vitals)
- Monitor LCP, INP, CLS in Search Console
- Keep bundles small and use code-splitting for heavy routes

## 5) Content Hygiene
- Avoid duplicate pages (use 301 redirects for legacy URLs)
- Update content when tools change
- Keep blog posts current

## 6) Periodic Checks
- Monthly: spot-check key pages in live HTML
- Quarterly: resubmit sitemap and re-check indexing
- After major releases: run a crawl (Screaming Frog or similar)
