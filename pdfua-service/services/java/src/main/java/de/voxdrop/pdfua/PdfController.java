package de.voxdrop.pdfua;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST Controller for PDF/UA conversion.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class PdfController {

    private final PdfUaConverter converter;

    /**
     * Health check endpoint.
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "ok",
            "service", "pdfua-java",
            "converter", "openhtmltopdf"
        ));
    }

    /**
     * Convert HTML to PDF/UA.
     */
    @PostMapping("/convert")
    public ResponseEntity<byte[]> convert(@RequestBody ConvertRequest request) {
        log.info("Converting HTML to PDF/UA: {}", request.filename());

        try {
            byte[] pdfBytes = converter.convertToPdfUa(
                request.html(),
                request.lang() != null ? request.lang() : "de",
                request.title(),
                request.author(),
                request.subject(),
                request.creator()
            );

            String filename = request.filename() != null
                ? request.filename().replace(".pptx", ".pdf")
                : "output.pdf";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", filename);
            headers.setContentLength(pdfBytes.length);

            log.info("PDF generated successfully: {} bytes", pdfBytes.length);

            return ResponseEntity.ok()
                .headers(headers)
                .body(pdfBytes);

        } catch (Exception e) {
            log.error("PDF conversion failed", e);
            return ResponseEntity.internalServerError()
                .body(("Error: " + e.getMessage()).getBytes());
        }
    }

    /**
     * Request body for conversion.
     */
    public record ConvertRequest(
        String html,
        String filename,
        String lang,
        String title,
        String author,
        String subject,
        String creator
    ) {}
}
