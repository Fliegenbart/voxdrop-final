// BITV 2.0 Barrierefreiheitserklärung HTML Export

interface Evaluation {
  criterion_id: string;
  support_level: string;
  remarks_de: string | null;
  title_de: string;
  wcag_criterion: string | null;
}

interface Audit {
  id: string;
  name: string;
  product_name: string;
  product_version: string | null;
  product_type: string;
  organization: string | null;
  audit_date: string;
}

interface BITVExportConfig {
  declaration_date: string;
  contact_email: string;
  contact_phone?: string;
  feedback_url?: string;
  enforcement_url?: string;
  include_methodology: boolean;
  custom_css?: string;
}

interface AuditProgress {
  total_criteria: number;
  evaluated: number;
  supports: number;
  partially_supports: number;
  does_not_support: number;
  not_applicable: number;
  compliance_rate: number;
}

function getConformanceStatus(progress: AuditProgress): 'vollständig' | 'teilweise' | 'nicht' {
  if (progress.does_not_support === 0 && progress.partially_supports === 0) {
    return 'vollständig';
  }
  if (progress.compliance_rate >= 50) {
    return 'teilweise';
  }
  return 'nicht';
}

function getConformanceText(status: 'vollständig' | 'teilweise' | 'nicht'): string {
  switch (status) {
    case 'vollständig':
      return 'Diese Webseite/Anwendung ist vollständig mit der EU-Richtlinie 2016/2102 und den Anforderungen der BITV 2.0 vereinbar.';
    case 'teilweise':
      return 'Diese Webseite/Anwendung ist teilweise mit der EU-Richtlinie 2016/2102 und den Anforderungen der BITV 2.0 vereinbar. Die nicht barrierefreien Inhalte sind nachfolgend aufgeführt.';
    case 'nicht':
      return 'Diese Webseite/Anwendung ist nicht mit der EU-Richtlinie 2016/2102 und den Anforderungen der BITV 2.0 vereinbar. Die nicht barrierefreien Inhalte sind nachfolgend aufgeführt.';
  }
}

function getDefaultStyles(): string {
  return `
    :root {
      --color-primary: #1e3a5f;
      --color-text: #1f2937;
      --color-bg: #ffffff;
      --color-border: #e5e7eb;
      --color-success: #059669;
      --color-warning: #d97706;
      --color-error: #dc2626;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: var(--color-text);
      background-color: var(--color-bg);
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }

    h1 {
      color: var(--color-primary);
      border-bottom: 3px solid var(--color-primary);
      padding-bottom: 0.5rem;
      font-size: 1.75rem;
    }

    h2 {
      color: var(--color-primary);
      font-size: 1.25rem;
      margin-top: 2rem;
    }

    a {
      color: var(--color-primary);
    }

    a:focus {
      outline: 3px solid var(--color-primary);
      outline-offset: 2px;
    }

    ul {
      padding-left: 1.5rem;
    }

    li {
      margin-bottom: 0.5rem;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .status-vollständig {
      background-color: #d1fae5;
      color: var(--color-success);
    }

    .status-teilweise {
      background-color: #fef3c7;
      color: var(--color-warning);
    }

    .status-nicht {
      background-color: #fee2e2;
      color: var(--color-error);
    }

    .issue-list {
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin: 1rem 0;
    }

    .issue-list h3 {
      color: var(--color-error);
      margin-top: 0;
      font-size: 1rem;
    }

    .contact-info {
      background-color: #f3f4f6;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin: 1rem 0;
    }

    .methodology {
      background-color: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin: 1rem 0;
    }

    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-border);
      font-size: 0.875rem;
      color: #6b7280;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #111827;
        --color-text: #f3f4f6;
        --color-border: #374151;
      }
    }

    @media print {
      body {
        max-width: none;
        padding: 1cm;
      }
    }
  `;
}

export function generateBITVDeclaration(
  audit: Audit,
  evaluations: Evaluation[],
  progress: AuditProgress,
  config: BITVExportConfig
): string {
  const conformanceStatus = getConformanceStatus(progress);
  const nonConformantItems = evaluations.filter(
    e => e.support_level === 'does_not_support' || e.support_level === 'partially_supports'
  );

  const statusLabels = {
    vollständig: 'Vollständig konform',
    teilweise: 'Teilweise konform',
    nicht: 'Nicht konform',
  };

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erklärung zur Barrierefreiheit - ${escapeHtml(audit.product_name)}</title>
  <style>
    ${config.custom_css || getDefaultStyles()}
  </style>
</head>
<body>
  <main>
    <h1>Erklärung zur Barrierefreiheit</h1>

    <p>
      ${escapeHtml(audit.organization || 'Diese Organisation')} ist bemueht,
      die Webseite/Anwendung <strong>${escapeHtml(audit.product_name)}</strong>${audit.product_version ? ` (Version ${escapeHtml(audit.product_version)})` : ''}
      im Einklang mit der EU-Richtlinie 2016/2102, dem Behindertengleichstellungsgesetz (BGG)
      und der Barrierefreie-Informationstechnik-Verordnung (BITV 2.0) barrierefrei zugänglich zu machen.
    </p>

    <h2>Stand der Vereinbarkeit mit den Anforderungen</h2>
    <p>
      <span class="status-badge status-${conformanceStatus}">${statusLabels[conformanceStatus]}</span>
    </p>
    <p>${getConformanceText(conformanceStatus)}</p>

    ${nonConformantItems.length > 0 ? `
    <div class="issue-list">
      <h3>Nicht barrierefreie Inhalte</h3>
      <p>Die nachfolgend genannten Inhalte sind aus folgenden Gründen nicht barrierefrei:</p>
      <ul>
        ${nonConformantItems.map(item => `
          <li>
            <strong>${escapeHtml(item.criterion_id)}${item.wcag_criterion ? ` (WCAG ${escapeHtml(item.wcag_criterion)})` : ''} - ${escapeHtml(item.title_de)}:</strong>
            ${item.support_level === 'partially_supports' ? '(teilweise erfüllt)' : '(nicht erfüllt)'}
            ${item.remarks_de ? `<br>${escapeHtml(item.remarks_de)}` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    <h2>Feedback und Kontakt</h2>
    <div class="contact-info">
      <p>
        Sollten Ihnen Maengel in Bezug auf die Einhaltung der Barrierefreiheitsanforderungen auffallen,
        können Sie sich an uns wenden:
      </p>
      <ul>
        <li><strong>E-Mail:</strong> <a href="mailto:${escapeHtml(config.contact_email)}">${escapeHtml(config.contact_email)}</a></li>
        ${config.contact_phone ? `<li><strong>Telefon:</strong> ${escapeHtml(config.contact_phone)}</li>` : ''}
        ${config.feedback_url ? `<li><strong>Online-Formular:</strong> <a href="${escapeHtml(config.feedback_url)}">${escapeHtml(config.feedback_url)}</a></li>` : ''}
      </ul>
    </div>

    <h2>Durchsetzungsverfahren</h2>
    <p>
      Sollten Sie auf Ihre Mitteilung oder Anfrage zur Barrierefreiheit innerhalb von sechs Wochen
      keine zufriedenstellende Antwort erhalten haben, können Sie die Schlichtungsstelle nach
      § 16 BGG einschalten.
    </p>
    ${config.enforcement_url ? `
    <p>
      Weitere Informationen zum Durchsetzungsverfahren finden Sie unter:<br>
      <a href="${escapeHtml(config.enforcement_url)}">${escapeHtml(config.enforcement_url)}</a>
    </p>
    ` : `
    <p>
      Kontakt zur Schlichtungsstelle BGG:<br>
      <a href="https://www.schlichtungsstelle-bgg.de">www.schlichtungsstelle-bgg.de</a>
    </p>
    `}

    ${config.include_methodology ? `
    <div class="methodology">
      <h2>Erstellung dieser Erklärung</h2>
      <p>Diese Erklärung wurde am <strong>${escapeHtml(config.declaration_date)}</strong> erstellt.</p>
      <p>
        Die Bewertung basiert auf einer Selbstbewertung nach den Kriterien der
        EN 301 549 V3.2.1 (entspricht WCAG 2.1 Level AA) sowie den zusätzlichen
        Anforderungen der BITV 2.0.
      </p>
      <p>
        <strong>Geprüft wurden ${progress.total_criteria} Kriterien:</strong>
      </p>
      <ul>
        <li>Erfüllt: ${progress.supports}</li>
        <li>Teilweise erfüllt: ${progress.partially_supports}</li>
        <li>Nicht erfüllt: ${progress.does_not_support}</li>
        <li>Nicht anwendbar: ${progress.not_applicable}</li>
      </ul>
      <p><strong>Konformitätsrate: ${progress.compliance_rate}%</strong></p>
    </div>
    ` : `
    <h2>Erstellung dieser Erklärung</h2>
    <p>Diese Erklärung wurde am <strong>${escapeHtml(config.declaration_date)}</strong> erstellt.</p>
    `}

  </main>

  <footer>
    <p>
      Erstellt mit VoxDrop Compliance Tool |
      Basierend auf EN 301 549 V3.2.1 und BITV 2.0
    </p>
  </footer>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

export { BITVExportConfig, Audit, Evaluation, AuditProgress };
