package de.voxdrop.pdfua;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * VoxDrop PDF/UA Java Service
 * Converts HTML to PDF/UA using OpenHTMLtoPDF.
 */
@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
