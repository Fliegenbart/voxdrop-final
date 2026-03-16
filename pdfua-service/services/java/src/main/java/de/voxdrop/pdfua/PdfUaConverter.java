package de.voxdrop.pdfua;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.common.PDPageLabelRange;
import org.apache.pdfbox.pdmodel.common.PDPageLabels;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDMarkInfo;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitDestination;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.PDFTextStripperByArea;
import org.jsoup.Jsoup;
import org.jsoup.helper.W3CDom;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

import java.awt.geom.Rectangle2D;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.lang.reflect.Method;

/**
 * Converts HTML to accessible PDF using OpenHTMLtoPDF.
 */
@Slf4j
@Service
public class PdfUaConverter {

    private static final String DEFAULT_AUTHOR = "VoxDrop";
    private static final String DEFAULT_SUBJECT = "Barrierefreie Präsentationszusammenfassung";
    private static final String DEFAULT_CREATOR = "VoxDrop PDF/UA Service";

    /**
     * Convert HTML string to accessible PDF.
     *
     * @param html HTML content to convert
     * @param lang Document language (e.g., "de", "en")
     * @return PDF bytes
     */
    public byte[] convertToPdfUa(String html, String lang, String requestTitle, String requestAuthor, String requestSubject, String requestCreator) throws Exception {
        String normalizedLang = normalizeLang(lang);
        log.info("Starting PDF conversion, language: {}", normalizedLang);

        // Parse HTML with JSoup for cleanup
        org.jsoup.nodes.Document jsoupDoc = Jsoup.parse(html);

        // Ensure html element has lang attribute for accessibility
        jsoupDoc.select("html").attr("lang", normalizedLang);

        // Add PDF/UA metadata
        jsoupDoc.head().appendElement("meta")
            .attr("name", "pdf.accessible")
            .attr("content", "true");

        // Convert to W3C DOM
        W3CDom w3cDom = new W3CDom();
        Document w3cDoc = w3cDom.fromJsoup(jsoupDoc);

        // Generate PDF
        String title = requestTitle;
        if (title == null || title.isBlank()) {
            title = jsoupDoc.title();
        }
        if (title == null || title.isBlank()) {
            title = "Dokument";
        }

        String author = requestAuthor != null && !requestAuthor.isBlank() ? requestAuthor : DEFAULT_AUTHOR;
        String subject = requestSubject != null && !requestSubject.isBlank() ? requestSubject : DEFAULT_SUBJECT;
        String creator = requestCreator != null && !requestCreator.isBlank() ? requestCreator : DEFAULT_CREATOR;

        // Collect nested bookmark structure: each slide has a title (L1) and child headings (L2)
        List<Map<String, Object>> bookmarkStructure = new ArrayList<>();
        Elements slideArticles = jsoupDoc.select("article.slide");
        for (Element article : slideArticles) {
            Element titleEl = article.selectFirst("h1.slide-title");
            if (titleEl == null) continue;
            String slideTitle = titleEl.text();
            if (slideTitle == null || slideTitle.isBlank()) continue;

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("title", slideTitle.trim());

            List<String> children = new ArrayList<>();
            Elements childHeadings = article.select("h2.bookmark-l2");
            for (Element h2 : childHeadings) {
                String h2Text = h2.text();
                if (h2Text != null && !h2Text.isBlank()) {
                    children.add(h2Text.trim());
                }
            }
            entry.put("children", children);
            bookmarkStructure.add(entry);
        }

        try (ByteArrayOutputStream os = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();

            // Set document
            builder.withW3cDocument(w3cDoc, "/");

            // Enable PDF/UA tagging if supported by the library
            enablePdfUaIfSupported(builder);

            // Use system fonts
            File dejaVuSans = new File("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
            File dejaVuSansBold = new File("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf");

            if (dejaVuSans.exists()) {
                builder.useFont(dejaVuSans, "DejaVu Sans");
            }
            if (dejaVuSansBold.exists()) {
                builder.useFont(dejaVuSansBold, "DejaVu Sans Bold");
            }

            builder.toStream(os);
            builder.run();

            byte[] result = os.toByteArray();
            result = applyPdfUaMetadata(result, normalizedLang, title, author, subject, creator, bookmarkStructure);
            log.info("PDF generated: {} bytes", result.length);

            return result;
        }
    }

    private String normalizeLang(String lang) {
        if (lang == null || lang.isBlank()) {
            return "de-DE";
        }
        String value = lang.replace("_", "-").trim();
        if (value.isBlank()) {
            return "de-DE";
        }
        String lower = value.toLowerCase();
        if (!value.contains("-")) {
            if ("de".equals(lower)) {
                return "de-DE";
            }
            if ("en".equals(lower)) {
                return "en-US";
            }
        }
        return value;
    }

    private byte[] applyPdfUaMetadata(byte[] pdfBytes, String lang, String title, String author, String subject, String creator, List<Map<String, Object>> bookmarkStructure) throws Exception {
        try (PDDocument document = PDDocument.load(pdfBytes);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {

            PDDocumentCatalog catalog = document.getDocumentCatalog();

            // PDF/UA-1 is based on ISO 32000-1 (PDF 1.7).
            // Ensure the header declares at least 1.7 (validators flag lower versions).
            try {
                document.setVersion(1.7f);
            } catch (Exception e) {
                // ignore; some PDFs may be locked to a version by producer
            }

            // Marked PDF
            PDMarkInfo markInfo = catalog.getMarkInfo();
            if (markInfo == null) {
                markInfo = new PDMarkInfo();
                catalog.setMarkInfo(markInfo);
            }
            markInfo.setMarked(true);

            // Language
            if (lang != null && !lang.isBlank()) {
                catalog.setLanguage(lang);
            }

            // Viewer preferences
            PDViewerPreferences prefs = catalog.getViewerPreferences();
            if (prefs == null) {
                prefs = new PDViewerPreferences(new COSDictionary());
                catalog.setViewerPreferences(prefs);
            }
            prefs.setDisplayDocTitle(true);

            // Tab order based on structure
            COSName tabsKey = COSName.getPDFName("Tabs");
            for (PDPage page : document.getPages()) {
                page.getCOSObject().setItem(tabsKey, COSName.S);
            }

            // Helpful navigation: assign PageLabels (1..N)
            try {
                PDPageLabels labels = new PDPageLabels(document);
                PDPageLabelRange range = new PDPageLabelRange();
                range.setStyle(PDPageLabelRange.STYLE_DECIMAL);
                range.setStart(1);
                labels.setLabelItem(0, range);
                catalog.setPageLabels(labels);
            } catch (Exception e) {
                log.warn("PageLabels could not be set", e);
            }

            // Document info
            PDDocumentInformation info = document.getDocumentInformation();
            Calendar now = Calendar.getInstance();
            info.setTitle(title);
            info.setAuthor(author);
            info.setSubject(subject);
            info.setCreator(creator);
            info.setProducer(creator);
            info.setCreationDate(now);
            info.setModificationDate(now);

            String xmpPacket = buildXmpPacket(
                title,
                author,
                subject,
                creator,
                lang,
                Instant.now().toString()
            );
            PDMetadata metadata = new PDMetadata(document);
            metadata.importXMPMetadata(xmpPacket.getBytes(StandardCharsets.UTF_8));
            catalog.setMetadata(metadata);

            // OutputIntent (sRGB). Not strictly required for PDF/UA-1, but helps future PDF/A-2a alignment.
            try {
                ensureSrgbOutputIntent(document);
            } catch (Exception e) {
                log.warn("OutputIntent could not be set", e);
            }

            // Decorative figures: keep the tag but empty alt text so screen readers don't announce noise.
            // Also clean up empty structure elements that confuse validators.
            try {
                PDStructureTreeRoot root = catalog.getStructureTreeRoot();
                if (root != null) {
                    int modified = normalizeStructureTree(root);
                    if (modified > 0) {
                        log.info("StructureTree normalized ({} modifications)", modified);
                    }
                }
            } catch (Exception e) {
                log.warn("StructureTree normalization failed", e);
            }

            // PDF/UA requires link annotations to have an accessible description.
            // Many converters omit /Contents on the annotation dictionary; fill it from the link's visible text.
            try {
                int populated = populateLinkAnnotationContents(document);
                if (populated > 0) {
                    log.info("Populated /Contents for {} link annotations", populated);
                }
            } catch (Exception e) {
                log.warn("Link annotation /Contents population failed", e);
            }

            if (bookmarkStructure != null && !bookmarkStructure.isEmpty()) {
                addBookmarks(document, bookmarkStructure);
            }

            document.save(output);
            return output.toByteArray();
        }
    }

    private void ensureSrgbOutputIntent(PDDocument document) throws Exception {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog.getOutputIntents() != null && !catalog.getOutputIntents().isEmpty()) {
            return;
        }

        // Provided by the runtime image via icc-profiles-free.
        String[] candidates = new String[] {
            "/usr/share/color/icc/sRGB.icc",
            "/usr/share/color/icc/colord/sRGB.icc",
            "/usr/share/color/icc/OpenICC/sRGB.icc",
            "/usr/share/color/icc/colord/srgb.icc",
        };

        File profileFile = null;
        for (String path : candidates) {
            File f = new File(path);
            if (f.exists() && f.isFile()) {
                profileFile = f;
                break;
            }
        }
        if (profileFile == null) {
            throw new IllegalStateException("sRGB ICC profile not found in container");
        }

        try (InputStream is = new FileInputStream(profileFile)) {
            PDOutputIntent oi = new PDOutputIntent(document, is);
            oi.setInfo("sRGB IEC61966-2.1");
            oi.setOutputCondition("sRGB IEC61966-2.1");
            oi.setOutputConditionIdentifier("sRGB IEC61966-2.1");
            oi.setRegistryName("http://www.color.org");
            catalog.addOutputIntent(oi);
        }
    }

    private int normalizeStructureTree(PDStructureTreeRoot root) {
        int[] modified = new int[] {0};
        // Root can contain a mix of COSDictionary and PDStructureElement kids.
        List<Object> kids = root.getKids();
        if (kids != null) {
            List<Object> cleaned = new ArrayList<>();
            for (Object kid : kids) {
                if (kid instanceof PDStructureElement el) {
                    if (normalizeStructureNode(el, modified)) {
                        cleaned.add(el);
                    }
                } else if (kid != null) {
                    cleaned.add(kid);
                }
            }
            root.setKids(cleaned);
        }
        return modified[0];
    }

    private boolean normalizeStructureNode(PDStructureNode node, int[] modified) {
        if (node == null) {
            return false;
        }

        if (node instanceof PDStructureElement el) {
            String type = el.getStructureType();
            String alt = null;
            try {
                alt = el.getCOSObject().getString(COSName.ALT);
            } catch (Exception ignored) {
            }
            if ("Figure".equals(type) && alt != null && alt.strip().equalsIgnoreCase("Dekoratives Icon")) {
                el.getCOSObject().setString(COSName.ALT, "");
                modified[0] += 1;
            }
        }

        List<Object> kids = node.getKids();
        if (kids == null || kids.isEmpty()) {
            modified[0] += 1;
            return false;
        }

        List<Object> cleaned = new ArrayList<>();
        for (Object kid : kids) {
            if (kid instanceof PDStructureElement child) {
                if (normalizeStructureNode(child, modified)) {
                    cleaned.add(child);
                }
            } else if (kid != null) {
                cleaned.add(kid);
            }
        }

        if (cleaned.size() != kids.size()) {
            node.setKids(cleaned);
        }

        if (cleaned.isEmpty()) {
            modified[0] += 1;
            return false;
        }
        return true;
    }

    private int populateLinkAnnotationContents(PDDocument document) throws Exception {
        int modified = 0;
        int pageIndex = 0;

        for (PDPage page : document.getPages()) {
            pageIndex += 1;

            List<PDAnnotation> annots;
            try {
                annots = page.getAnnotations();
            } catch (Exception e) {
                continue;
            }
            if (annots == null || annots.isEmpty()) {
                continue;
            }

            // Collect all link annotations that are missing /Contents and read their visible text.
            class LinkRegion {
                final PDAnnotationLink link;
                final String regionName;

                LinkRegion(PDAnnotationLink link, String regionName) {
                    this.link = link;
                    this.regionName = regionName;
                }
            }

            List<LinkRegion> regions = new ArrayList<>();
            PDFTextStripperByArea stripper = new PDFTextStripperByArea();
            stripper.setSortByPosition(true);

            int regionIdx = 0;
            for (PDAnnotation annot : annots) {
                if (!(annot instanceof PDAnnotationLink link)) {
                    continue;
                }
                String contents = link.getContents();
                if (contents != null && !contents.isBlank()) {
                    continue;
                }
                PDRectangle rect = link.getRectangle();
                if (rect == null) {
                    continue;
                }
                float w = rect.getWidth();
                float h = rect.getHeight();
                if (w <= 0.0f || h <= 0.0f) {
                    continue;
                }

                String regionName = "link-" + pageIndex + "-" + (++regionIdx);
                Rectangle2D.Float r = new Rectangle2D.Float(
                    rect.getLowerLeftX(),
                    rect.getLowerLeftY(),
                    w,
                    h
                );
                stripper.addRegion(regionName, r);
                regions.add(new LinkRegion(link, regionName));
            }

            if (regions.isEmpty()) {
                continue;
            }

            stripper.extractRegions(page);
            for (LinkRegion region : regions) {
                String text = "";
                try {
                    text = stripper.getTextForRegion(region.regionName);
                } catch (Exception ignored) {
                }
                text = normalizeLinkContents(text);
                if (text.isBlank()) {
                    text = "Link";
                }
                region.link.setContents(text);
                modified += 1;
            }
        }

        return modified;
    }

    private String normalizeLinkContents(String value) {
        if (value == null) {
            return "";
        }
        String cleaned = value
            .replace("\u0000", "")
            .replace("\r", " ")
            .replace("\n", " ")
            .replaceAll("\\s+", " ")
            .trim();
        if (cleaned.length() > 200) {
            cleaned = cleaned.substring(0, 199).trim() + "...";
        }
        return cleaned;
    }

    private void addBookmarks(PDDocument document, List<Map<String, Object>> bookmarkStructure) {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        PDDocumentOutline outline = new PDDocumentOutline();
        catalog.setDocumentOutline(outline);

        PDPageTree pages = document.getPages();
        int totalPages = pages.getCount();
        int lastPageIndex = 0;

        for (Map<String, Object> entry : bookmarkStructure) {
            String slideTitle = (String) entry.get("title");
            if (slideTitle == null || slideTitle.isBlank()) {
                continue;
            }
            slideTitle = slideTitle.trim();

            // Find the page for this slide title (Level 1)
            int targetPage = findPageForTitle(document, slideTitle, lastPageIndex, totalPages);
            if (targetPage < 0) {
                continue;
            }
            lastPageIndex = Math.max(lastPageIndex, targetPage);

            PDPageFitDestination dest = new PDPageFitDestination();
            dest.setPage(pages.get(targetPage));

            PDOutlineItem parentItem = new PDOutlineItem();
            parentItem.setTitle(slideTitle);
            parentItem.setDestination(dest);
            outline.addLast(parentItem);

            // Add child bookmarks (Level 2)
            @SuppressWarnings("unchecked")
            List<String> children = (List<String>) entry.get("children");
            if (children != null) {
                for (String childTitle : children) {
                    if (childTitle == null || childTitle.isBlank()) {
                        continue;
                    }
                    childTitle = childTitle.trim();

                    // Child bookmarks point to the same slide page (their text appears on the same page as the slide title)
                    int childPage = findPageForTitle(document, childTitle, targetPage, totalPages);
                    if (childPage < 0) {
                        // Fall back to the parent slide page
                        childPage = targetPage;
                    }

                    PDPageFitDestination childDest = new PDPageFitDestination();
                    childDest.setPage(pages.get(childPage));

                    PDOutlineItem childItem = new PDOutlineItem();
                    childItem.setTitle(childTitle);
                    childItem.setDestination(childDest);
                    parentItem.addLast(childItem);
                }
            }

            // Open parent node so children are visible
            parentItem.openNode();
        }

        outline.openNode();
    }

    private int findPageForTitle(PDDocument document, String title, int startPage, int totalPages) {
        String needle = normalizeSearch(title);
        if (needle.isBlank()) {
            return -1;
        }
        for (int pageIndex = startPage; pageIndex < totalPages; pageIndex++) {
            try {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setStartPage(pageIndex + 1);
                stripper.setEndPage(pageIndex + 1);
                String pageText = stripper.getText(document);
                if (pageText == null) {
                    continue;
                }
                String haystack = normalizeSearch(pageText);
                if (haystack.contains(needle)) {
                    return pageIndex;
                }
            } catch (Exception e) {
                log.warn("Bookmark text search failed on page {}", pageIndex + 1, e);
            }
        }
        return -1;
    }

    private String normalizeSearch(String text) {
        if (text == null) {
            return "";
        }
        return text
            .toLowerCase()
            .replaceAll("[^a-z0-9äöüß]", "");
    }

    private void enablePdfUaIfSupported(PdfRendererBuilder builder) {
        if (invokeBooleanMethod(builder, "usePdfUaAccessibility")) {
            return;
        }
        if (invokeBooleanMethod(builder, "usePdfUaAccessbility")) {
            return;
        }
        log.warn("PDF/UA tagging not supported by current OpenHTMLtoPDF version.");
    }

    private boolean invokeBooleanMethod(PdfRendererBuilder builder, String methodName) {
        try {
            Method method = builder.getClass().getMethod(methodName, boolean.class);
            method.invoke(builder, true);
            return true;
        } catch (ReflectiveOperationException ignored) {
            return false;
        }
    }

    private String buildXmpPacket(
        String title,
        String author,
        String subject,
        String creator,
        String lang,
        String isoTimestamp
    ) {
        String safeTitle = escapeXml(title);
        String safeAuthor = escapeXml(author);
        String description = subject;
        if (description == null || description.isBlank()) {
            description = "Generiert von VoxDrop PDF/UA Service";
        } else if (!description.toLowerCase().contains("voxdrop")) {
            description = description + " – Generiert von VoxDrop PDF/UA Service";
        }
        String safeSubject = escapeXml(description);
        String safeCreator = escapeXml(creator);
        String safeTime = escapeXml(isoTimestamp);
        String safeLang = escapeXml(lang != null ? lang : "de-DE");
        StringBuilder sb = new StringBuilder();
        sb.append("<?xpacket begin=\"\uFEFF\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");
        sb.append("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n");
        sb.append("  <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");
        sb.append("    <rdf:Description rdf:about=\"\"")
            .append(" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"")
            .append(" xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\"")
            .append(" xmlns:pdf=\"http://ns.adobe.com/pdf/1.3/\"")
            .append(" xmlns:pdfuaid=\"http://www.aiim.org/pdfua/ns/id/\">\n");
        sb.append("      <dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">")
            .append(safeTitle)
            .append("</rdf:li></rdf:Alt></dc:title>\n");
        sb.append("      <dc:creator><rdf:Seq><rdf:li>")
            .append(safeAuthor)
            .append("</rdf:li></rdf:Seq></dc:creator>\n");
        sb.append("      <dc:description><rdf:Alt><rdf:li xml:lang=\"x-default\">")
            .append(safeSubject)
            .append("</rdf:li></rdf:Alt></dc:description>\n");
        sb.append("      <xmp:CreatorTool>")
            .append(safeCreator)
            .append("</xmp:CreatorTool>\n");
        sb.append("      <pdf:Producer>")
            .append(safeCreator)
            .append("</pdf:Producer>\n");
        sb.append("      <xmp:CreateDate>")
            .append(safeTime)
            .append("</xmp:CreateDate>\n");
        sb.append("      <xmp:ModifyDate>")
            .append(safeTime)
            .append("</xmp:ModifyDate>\n");
        sb.append("      <dc:language><rdf:Bag><rdf:li>")
            .append(safeLang)
            .append("</rdf:li></rdf:Bag></dc:language>\n");
        sb.append("      <pdfuaid:part>1</pdfuaid:part>\n");
        sb.append("    </rdf:Description>\n");
        sb.append("  </rdf:RDF>\n");
        sb.append("</x:xmpmeta>\n");
        sb.append("<?xpacket end=\"w\"?>");
        return sb.toString();
    }

    private String escapeXml(String value) {
        if (value == null) {
            return "";
        }
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&apos;");
    }
}
