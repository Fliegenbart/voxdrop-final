// VPAT (Voluntary Product Accessibility Template) Word Export
// Basierend auf VPAT 2.4 Rev (EU) Format

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  ShadingType,
  convertInchesToTwip,
} from 'docx';

interface Evaluation {
  criterion_id: string;
  support_level: string;
  remarks_de: string | null;
  remarks_en: string | null;
  title_de: string;
  title_en: string;
  wcag_criterion: string | null;
  chapter: number;
  level: string;
}

interface Audit {
  id: string;
  name: string;
  product_name: string;
  product_version: string | null;
  product_type: string;
  organization: string | null;
  audit_date: string;
  auditor_name: string | null;
}

interface VPATExportConfig {
  format: 'word' | 'pdf';
  language: 'de' | 'en' | 'both';
  include_not_applicable: boolean;
  include_testing_guidance: boolean;
  company_name?: string;
}

interface AuditProgress {
  total_criteria: number;
  supports: number;
  partially_supports: number;
  does_not_support: number;
  not_applicable: number;
  compliance_rate: number;
}

const SUPPORT_LABELS_EN: Record<string, string> = {
  supports: 'Supports',
  partially_supports: 'Partially Supports',
  does_not_support: 'Does Not Support',
  not_applicable: 'Not Applicable',
  not_evaluated: 'Not Evaluated',
};

const SUPPORT_LABELS_DE: Record<string, string> = {
  supports: 'Erfüllt',
  partially_supports: 'Teilweise erfüllt',
  does_not_support: 'Nicht erfüllt',
  not_applicable: 'Nicht anwendbar',
  not_evaluated: 'Nicht bewertet',
};

function getSupportLabel(level: string, language: 'de' | 'en'): string {
  return language === 'de'
    ? SUPPORT_LABELS_DE[level] || level
    : SUPPORT_LABELS_EN[level] || level;
}

function createHeaderSection(audit: Audit, config: VPATExportConfig): Paragraph[] {
  const isEnglish = config.language === 'en';

  return [
    new Paragraph({
      text: isEnglish
        ? 'Voluntary Product Accessibility Template (VPAT)'
        : 'Freiwillige Produktzugänglichkeitsvorlage (VPAT)',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: isEnglish ? 'Based on VPAT 2.4 Rev EU' : 'Basierend auf VPAT 2.4 Rev EU',
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Product Name: ' : 'Produktname: ', bold: true }),
        new TextRun({ text: audit.product_name }),
        audit.product_version ? new TextRun({ text: ` (Version ${audit.product_version})` }) : new TextRun({ text: '' }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Vendor: ' : 'Anbieter: ', bold: true }),
        new TextRun({ text: config.company_name || audit.organization || 'N/A' }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Report Date: ' : 'Berichtsdatum: ', bold: true }),
        new TextRun({ text: new Date(audit.audit_date).toLocaleDateString(isEnglish ? 'en-US' : 'de-DE') }),
      ],
    }),
    audit.auditor_name ? new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Evaluator: ' : 'Prüfer: ', bold: true }),
        new TextRun({ text: audit.auditor_name }),
      ],
    }) : new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Contact: ' : 'Kontakt: ', bold: true }),
        new TextRun({ text: config.company_name || audit.organization || 'N/A' }),
      ],
      spacing: { after: 400 },
    }),
  ];
}

function createSummarySection(progress: AuditProgress, config: VPATExportConfig): Paragraph[] {
  const isEnglish = config.language === 'en';

  return [
    new Paragraph({
      text: isEnglish ? 'Executive Summary' : 'Zusammenfassung',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      text: isEnglish
        ? `This report documents the accessibility conformance of the product against the EN 301 549 standard.`
        : `Dieser Bericht dokumentiert die Barrierefreiheitskonformität des Produkts gemäß EN 301 549.`,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Total Criteria Evaluated: ' : 'Geprüfte Kriterien: ', bold: true }),
        new TextRun({ text: progress.total_criteria.toString() }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Supports: ' : 'Erfüllt: ', bold: true }),
        new TextRun({ text: progress.supports.toString() }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Partially Supports: ' : 'Teilweise erfüllt: ', bold: true }),
        new TextRun({ text: progress.partially_supports.toString() }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Does Not Support: ' : 'Nicht erfüllt: ', bold: true }),
        new TextRun({ text: progress.does_not_support.toString() }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Not Applicable: ' : 'Nicht anwendbar: ', bold: true }),
        new TextRun({ text: progress.not_applicable.toString() }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Compliance Rate: ' : 'Konformitätsrate: ', bold: true }),
        new TextRun({ text: `${progress.compliance_rate}%`, bold: true }),
      ],
      spacing: { after: 400 },
    }),
  ];
}

function createCriteriaTable(
  evaluations: Evaluation[],
  config: VPATExportConfig
): Table {
  const isEnglish = config.language === 'en';

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        children: [new Paragraph({ text: isEnglish ? 'Criteria' : 'Kriterium', alignment: AlignmentType.CENTER })],
        shading: { fill: '1e3a5f', type: ShadingType.SOLID, color: '1e3a5f' },
        width: { size: 20, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({
          text: isEnglish ? 'Conformance Level' : 'Konformitätsstufe',
          alignment: AlignmentType.CENTER,
        })],
        shading: { fill: '1e3a5f', type: ShadingType.SOLID, color: '1e3a5f' },
        width: { size: 20, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({
          text: isEnglish ? 'Remarks and Explanations' : 'Anmerkungen und Erläuterungen',
          alignment: AlignmentType.CENTER,
        })],
        shading: { fill: '1e3a5f', type: ShadingType.SOLID, color: '1e3a5f' },
        width: { size: 60, type: WidthType.PERCENTAGE },
      }),
    ],
  });

  const dataRows = evaluations.map(evaluation => {
    if (!config.include_not_applicable && evaluation.support_level === 'not_applicable') {
      return null;
    }

    const title = isEnglish ? evaluation.title_en : evaluation.title_de;
    const remarks = isEnglish
      ? (evaluation.remarks_en || evaluation.remarks_de || '-')
      : (evaluation.remarks_de || '-');

    return new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: evaluation.criterion_id, bold: true }),
                new TextRun({ text: ` (${evaluation.level})`, italics: true }),
              ],
            }),
            new Paragraph({ text: title, spacing: { before: 100 } }),
          ],
        }),
        new TableCell({
          children: [new Paragraph({
            text: getSupportLabel(evaluation.support_level, isEnglish ? 'en' : 'de'),
            alignment: AlignmentType.CENTER,
          })],
        }),
        new TableCell({
          children: [new Paragraph({ text: remarks })],
        }),
      ],
    });
  }).filter(row => row !== null) as TableRow[];

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

export async function generateVPATDocument(
  audit: Audit,
  evaluations: Evaluation[],
  progress: AuditProgress,
  config: VPATExportConfig
): Promise<Buffer> {
  const isEnglish = config.language === 'en';

  // Gruppiere Evaluations nach Kapitel
  const chapter9 = evaluations.filter(e => e.chapter === 9);
  const chapter10 = evaluations.filter(e => e.chapter === 10);

  const sections: Paragraph[] = [
    ...createHeaderSection(audit, config),
    ...createSummarySection(progress, config),
  ];

  const tables: (Paragraph | Table)[] = [];

  // Kapitel 9 - Web
  if (chapter9.length > 0) {
    tables.push(
      new Paragraph({
        text: isEnglish ? 'Chapter 9: Web' : 'Kapitel 9: Web',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        text: isEnglish
          ? 'Criteria for web pages (WCAG 2.1 Level A and AA)'
          : 'Kriterien für Webseiten (WCAG 2.1 Level A und AA)',
        spacing: { after: 200 },
      }),
      createCriteriaTable(chapter9, config)
    );
  }

  // Kapitel 10 - Dokumente
  if (chapter10.length > 0) {
    tables.push(
      new Paragraph({
        text: isEnglish ? 'Chapter 10: Non-web Documents' : 'Kapitel 10: Nicht-Web-Dokumente',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        text: isEnglish
          ? 'Criteria for non-web documents (PDF, Office documents)'
          : 'Kriterien für Nicht-Web-Dokumente (PDF, Office-Dokumente)',
        spacing: { after: 200 },
      }),
      createCriteriaTable(chapter10, config)
    );
  }

  // Legal Notice
  tables.push(
    new Paragraph({
      text: isEnglish ? 'Legal Disclaimer' : 'Rechtlicher Hinweis',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      text: isEnglish
        ? 'This document is provided for informational purposes only. The information in this document is subject to change without notice. This VPAT does not represent a legally binding statement of product accessibility.'
        : 'Dieses Dokument dient nur zu Informationszwecken. Die Informationen in diesem Dokument können ohne vorherige Ankuendigung geändert werden. Dieser VPAT stellt keine rechtsverbindliche Aussage zur Produktzugänglichkeit dar.',
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: isEnglish ? 'Generated by ' : 'Erstellt mit ', italics: true }),
        new TextRun({ text: 'VoxDrop Compliance Tool', bold: true, italics: true }),
        new TextRun({ text: ` | ${new Date().toLocaleDateString(isEnglish ? 'en-US' : 'de-DE')}`, italics: true }),
      ],
      spacing: { before: 400 },
    })
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      children: [...sections, ...tables],
    }],
  });

  return await Packer.toBuffer(doc);
}

export { VPATExportConfig, Audit, Evaluation, AuditProgress };
