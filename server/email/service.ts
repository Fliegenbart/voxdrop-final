import { Resend } from 'resend';

// Initialize Resend client
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:5000';
const FROM_EMAIL = process.env.FROM_EMAIL || 'VoxDrop <noreply@voxdrop.live>';
const EMAIL_LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://voxdrop.live/favicon.svg';

// Check if email service is configured
const isEmailConfigured = (): boolean => {
  return !!RESEND_API_KEY;
};

// Create Resend client only if configured
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Send email verification link to new users
 */
export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - skipping verification email');
    return { success: false, error: 'Email service not configured' };
  }

  const verificationUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Bitte bestätigen Sie Ihre E-Mail-Adresse - VoxDrop',
      html: getVerificationEmailHtml(verificationUrl),
      text: getVerificationEmailText(verificationUrl),
    });

    if (error) {
      console.error('[Email] Failed to send verification email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Verification email sent to ${email}, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending verification email:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * HTML template for verification email
 */
function getVerificationEmailHtml(verificationUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-Mail bestätigen</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <!-- Logo -->
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="VoxDrop Logo" style="display: block; margin: 0 auto; border-radius: 12px;">
        <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #111;">VoxDrop</h1>
      </div>

      <!-- Content -->
      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111; text-align: center;">
        E-Mail-Adresse bestätigen
      </h2>

      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Vielen Dank für Ihre Registrierung bei VoxDrop.
        Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.
      </p>

      <!-- Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verificationUrl}"
           style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">
          E-Mail bestätigen
        </a>
      </div>

      <p style="margin: 24px 0 0; font-size: 14px; color: #999; text-align: center;">
        Dieser Link ist 24 Stunden gültig.
      </p>

      <!-- Divider -->
      <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">

      <!-- Footer -->
      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        Falls Sie sich nicht bei VoxDrop registriert haben, können Sie diese E-Mail ignorieren.
      </p>

      <p style="margin: 16px 0 0; font-size: 12px; color: #999; text-align: center;">
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
        <a href="${verificationUrl}" style="color: #3b82f6; word-break: break-all;">${verificationUrl}</a>
      </p>
    </div>

    <!-- Legal Footer -->
    <p style="margin: 24px 0 0; font-size: 11px; color: #999; text-align: center;">
      VoxDrop - Barrierefreiheits-Tools für Unternehmen<br>
      DSGVO-konform | Deutsche Server | Made in Germany
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Plain text version of verification email
 */
function getVerificationEmailText(verificationUrl: string): string {
  return `
VoxDrop - E-Mail-Adresse bestätigen

Vielen Dank für Ihre Registrierung bei VoxDrop.

Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie den folgenden Link öffnen:

${verificationUrl}

Dieser Link ist 24 Stunden gültig.

Falls Sie sich nicht bei VoxDrop registriert haben, können Sie diese E-Mail ignorieren.

---
VoxDrop - Barrierefreiheits-Tools für Unternehmen
DSGVO-konform | Deutsche Server | Made in Germany
  `.trim();
}

/**
 * Send notification when PPTX conversion is complete
 */
export async function sendConversionCompleteEmail(
  email: string,
  filename: string,
  jobId: string,
  success: boolean,
  pdfuaCompliant: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - skipping conversion notification');
    return { success: false, error: 'Email service not configured' };
  }

  // Deep-link to the documents list so the user can still find the file even
  // after closing the conversion page.
  const downloadUrl = `${APP_URL}/documents#doc-${jobId}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: success
        ? `Konvertierung abgeschlossen: ${filename}`
        : `Konvertierung fehlgeschlagen: ${filename}`,
      html: getConversionEmailHtml(filename, success, pdfuaCompliant, downloadUrl),
      text: getConversionEmailText(filename, success, downloadUrl),
    });

    if (error) {
      console.error('[Email] Failed to send conversion notification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Conversion notification sent to ${email}, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending conversion notification:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * HTML template for conversion notification email
 */
function getConversionEmailHtml(
  filename: string,
  success: boolean,
  pdfuaCompliant: boolean,
  downloadUrl: string
): string {
  const statusColor = success ? '#22c55e' : '#ef4444';
  const statusBg = success ? '#dcfce7' : '#fee2e2';
  const statusText = success
    ? (pdfuaCompliant ? 'PDF/UA konform' : 'Teilweise konform')
    : 'Fehlgeschlagen';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Konvertierung ${success ? 'abgeschlossen' : 'fehlgeschlagen'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <!-- Logo -->
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="VoxDrop Logo" style="display: block; margin: 0 auto; border-radius: 12px;">
        <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #111;">VoxDrop</h1>
      </div>

      <!-- Status Badge -->
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; padding: 8px 16px; background: ${statusBg}; color: ${statusColor}; font-weight: 600; font-size: 14px; border-radius: 9999px;">
          ${statusText}
        </span>
      </div>

      <!-- Content -->
      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111; text-align: center;">
        Konvertierung ${success ? 'abgeschlossen' : 'fehlgeschlagen'}
      </h2>

      <p style="margin: 0 0 8px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        <strong>Datei:</strong> ${filename}
      </p>

      ${success ? `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Ihr barrierefreies PDF ist bereit zum Download.
      </p>

      <!-- Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${downloadUrl}"
           style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316, #ef4444); color: white; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">
          PDF herunterladen
        </a>
      </div>
      ` : `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Bei der Konvertierung ist leider ein Fehler aufgetreten.
        Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
      </p>
      `}

      <!-- Divider -->
      <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">

      <!-- Footer -->
      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        Diese E-Mail wurde automatisch generiert, da Sie die Benachrichtigungsfunktion aktiviert haben.
      </p>
    </div>

    <!-- Legal Footer -->
    <p style="margin: 24px 0 0; font-size: 11px; color: #999; text-align: center;">
      VoxDrop - Barrierefreiheits-Tools für Unternehmen<br>
      DSGVO-konform | Deutsche Server | Made in Germany
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Plain text version of conversion notification email
 */
function getConversionEmailText(filename: string, success: boolean, downloadUrl: string): string {
  return `
VoxDrop - Konvertierung ${success ? 'abgeschlossen' : 'fehlgeschlagen'}

Datei: ${filename}

${success ? `Ihr barrierefreies PDF ist bereit zum Download:

${downloadUrl}
` : `Bei der Konvertierung ist leider ein Fehler aufgetreten.
Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
`}
---
VoxDrop - Barrierefreiheits-Tools für Unternehmen
DSGVO-konform | Deutsche Server | Made in Germany
  `.trim();
}

/**
 * Send notification when transcription is complete
 */
export async function sendTranscriptionCompleteEmail(
  email: string,
  filename: string,
  jobId: string,
  success: boolean,
  duration?: number,
  language?: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - skipping transcription notification');
    return { success: false, error: 'Email service not configured' };
  }

  const downloadUrl = `${APP_URL}/tools/untertitel?job=${jobId}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: success
        ? `Transkription abgeschlossen: ${filename}`
        : `Transkription fehlgeschlagen: ${filename}`,
      html: getTranscriptionEmailHtml(filename, success, duration, language, downloadUrl),
      text: getTranscriptionEmailText(filename, success, duration, downloadUrl),
    });

    if (error) {
      console.error('[Email] Failed to send transcription notification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Transcription notification sent to ${email}, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending transcription notification:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * HTML template for transcription notification email
 */
function getTranscriptionEmailHtml(
  filename: string,
  success: boolean,
  duration?: number,
  language?: string,
  downloadUrl?: string
): string {
  const statusColor = success ? '#22c55e' : '#ef4444';
  const statusBg = success ? '#dcfce7' : '#fee2e2';
  const statusText = success ? 'Abgeschlossen' : 'Fehlgeschlagen';
  const durationText = duration ? `${Math.round(duration)} Sekunden` : 'Unbekannt';
  const languageText = language || 'Automatisch erkannt';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transkription ${success ? 'abgeschlossen' : 'fehlgeschlagen'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <!-- Logo -->
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="VoxDrop Logo" style="display: block; margin: 0 auto; border-radius: 12px;">
        <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #111;">VoxDrop</h1>
      </div>

      <!-- Status Badge -->
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; padding: 8px 16px; background: ${statusBg}; color: ${statusColor}; font-weight: 600; font-size: 14px; border-radius: 9999px;">
          ${statusText}
        </span>
      </div>

      <!-- Content -->
      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111; text-align: center;">
        Transkription ${success ? 'abgeschlossen' : 'fehlgeschlagen'}
      </h2>

      <p style="margin: 0 0 8px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        <strong>Datei:</strong> ${filename}
      </p>

      ${success ? `
      <p style="margin: 0 0 8px; font-size: 14px; color: #888; line-height: 1.6; text-align: center;">
        Dauer: ${durationText} | Sprache: ${languageText}
      </p>

      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Ihre Untertitel sind bereit zum Download.
      </p>

      <!-- Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${downloadUrl}"
           style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">
          Untertitel abrufen
        </a>
      </div>
      ` : `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Bei der Transkription ist leider ein Fehler aufgetreten.
        Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
      </p>
      `}

      <!-- Divider -->
      <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">

      <!-- Footer -->
      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        Diese E-Mail wurde automatisch generiert, da Sie die Benachrichtigungsfunktion aktiviert haben.
      </p>
    </div>

    <!-- Legal Footer -->
    <p style="margin: 24px 0 0; font-size: 11px; color: #999; text-align: center;">
      VoxDrop - Barrierefreiheits-Tools für Unternehmen<br>
      DSGVO-konform | Deutsche Server | Made in Germany
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Plain text version of transcription notification email
 */
function getTranscriptionEmailText(filename: string, success: boolean, duration?: number, downloadUrl?: string): string {
  const durationText = duration ? `${Math.round(duration)} Sekunden` : 'Unbekannt';

  return `
VoxDrop - Transkription ${success ? 'abgeschlossen' : 'fehlgeschlagen'}

Datei: ${filename}
${success ? `Dauer: ${durationText}` : ''}

${success ? `Ihre Untertitel sind bereit zum Download:

${downloadUrl}
` : `Bei der Transkription ist leider ein Fehler aufgetreten.
Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
`}
---
VoxDrop - Barrierefreiheits-Tools für Unternehmen
DSGVO-konform | Deutsche Server | Made in Germany
  `.trim();
}

/**
 * Send notification when podcast generation is complete
 */
export async function sendPodcastCompleteEmail(
  email: string,
  filename: string,
  jobId: string,
  success: boolean,
  duration?: number,
  chapters?: number
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - skipping podcast notification');
    return { success: false, error: 'Email service not configured' };
  }

  const downloadUrl = `${APP_URL}/tools/pptx-podcast?job=${jobId}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: success
        ? `Podcast erstellt: ${filename}`
        : `Podcast-Erstellung fehlgeschlagen: ${filename}`,
      html: getPodcastEmailHtml(filename, success, duration, chapters, downloadUrl),
      text: getPodcastEmailText(filename, success, duration, downloadUrl),
    });

    if (error) {
      console.error('[Email] Failed to send podcast notification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Podcast notification sent to ${email}, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending podcast notification:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * HTML template for podcast notification email
 */
function getPodcastEmailHtml(
  filename: string,
  success: boolean,
  duration?: number,
  chapters?: number,
  downloadUrl?: string
): string {
  const statusColor = success ? '#22c55e' : '#ef4444';
  const statusBg = success ? '#dcfce7' : '#fee2e2';
  const statusText = success ? 'Abgeschlossen' : 'Fehlgeschlagen';
  const durationText = duration ? formatDuration(duration) : 'Unbekannt';
  const chaptersText = chapters ? `${chapters} Kapitel` : '';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Podcast ${success ? 'erstellt' : 'fehlgeschlagen'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <!-- Logo -->
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="VoxDrop Logo" style="display: block; margin: 0 auto; border-radius: 12px;">
        <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #111;">VoxDrop</h1>
      </div>

      <!-- Status Badge -->
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; padding: 8px 16px; background: ${statusBg}; color: ${statusColor}; font-weight: 600; font-size: 14px; border-radius: 9999px;">
          ${statusText}
        </span>
      </div>

      <!-- Content -->
      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111; text-align: center;">
        Podcast ${success ? 'erstellt' : 'fehlgeschlagen'}
      </h2>

      <p style="margin: 0 0 8px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        <strong>Datei:</strong> ${filename}
      </p>

      ${success ? `
      <p style="margin: 0 0 8px; font-size: 14px; color: #888; line-height: 1.6; text-align: center;">
        Dauer: ${durationText}${chaptersText ? ` | ${chaptersText}` : ''}
      </p>

      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Ihr Podcast ist bereit zum Download.
      </p>

      <!-- Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${downloadUrl}"
           style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">
          Podcast herunterladen
        </a>
      </div>
      ` : `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Bei der Podcast-Erstellung ist leider ein Fehler aufgetreten.
        Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
      </p>
      `}

      <!-- Divider -->
      <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">

      <!-- Footer -->
      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        Diese E-Mail wurde automatisch generiert, da Sie die Benachrichtigungsfunktion aktiviert haben.
      </p>
    </div>

    <!-- Legal Footer -->
    <p style="margin: 24px 0 0; font-size: 11px; color: #999; text-align: center;">
      VoxDrop - Barrierefreiheits-Tools für Unternehmen<br>
      DSGVO-konform | Deutsche Server | Made in Germany
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send notification when video conversion is complete
 */
export async function sendVideoCompleteEmail(
  email: string,
  filename: string,
  jobId: string,
  success: boolean,
  outputFormat: string = 'mp4'
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - skipping video notification');
    return { success: false, error: 'Email service not configured' };
  }

  const downloadUrl = `${APP_URL}/api/jobs/${jobId}/result`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: success
        ? `Video bereit: ${filename}`
        : `Video-Konvertierung fehlgeschlagen: ${filename}`,
      html: getVideoEmailHtml(filename, success, downloadUrl, outputFormat),
      text: getVideoEmailText(filename, success, downloadUrl, outputFormat),
    });

    if (error) {
      console.error('[Email] Failed to send video notification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Video notification sent to ${email}, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending video notification:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * Send notification when subtitle embedding is complete
 */
export async function sendSubtitleEmbedCompleteEmail(
  email: string,
  filename: string,
  jobId: string,
  success: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - skipping subtitle embed notification');
    return { success: false, error: 'Email service not configured' };
  }

  const downloadUrl = `${APP_URL}/api/jobs/${jobId}/result`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: success
        ? `Untertitel bereit: ${filename}`
        : `Untertitel-Einbettung fehlgeschlagen: ${filename}`,
      html: getSubtitleEmbedEmailHtml(filename, success, downloadUrl),
      text: getSubtitleEmbedEmailText(filename, success, downloadUrl),
    });

    if (error) {
      console.error('[Email] Failed to send subtitle embed notification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Subtitle embed notification sent to ${email}, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending subtitle embed notification:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

function getSubtitleEmbedEmailHtml(
  filename: string,
  success: boolean,
  downloadUrl: string
): string {
  const statusColor = success ? '#22c55e' : '#ef4444';
  const statusBg = success ? '#dcfce7' : '#fee2e2';
  const statusText = success ? 'Abgeschlossen' : 'Fehlgeschlagen';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Untertitel ${success ? 'bereit' : 'fehlgeschlagen'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="VoxDrop Logo" style="display: block; margin: 0 auto; border-radius: 12px;">
        <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #111;">VoxDrop</h1>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; padding: 8px 16px; background: ${statusBg}; color: ${statusColor}; font-weight: 600; font-size: 14px; border-radius: 9999px;">
          ${statusText}
        </span>
      </div>

      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111; text-align: center;">
        Video mit Untertiteln ${success ? 'bereit' : 'fehlgeschlagen'}
      </h2>

      <p style="margin: 0 0 8px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        <strong>Datei:</strong> ${filename}
      </p>

      ${success ? `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Ihr Video mit eingebetteten Untertiteln ist fertig.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${downloadUrl}"
           style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">
          Video herunterladen
        </a>
      </div>
      ` : `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Bei der Untertitel-Einbettung ist leider ein Fehler aufgetreten.
        Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
      </p>
      `}

      <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">

      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        Hinweis: Der Download-Link erfordert eine Anmeldung bei VoxDrop.
      </p>
    </div>

    <p style="margin: 24px 0 0; font-size: 11px; color: #999; text-align: center;">
      VoxDrop - Barrierefreiheits-Tools für Unternehmen<br>
      DSGVO-konform | Deutsche Server | Made in Germany
    </p>
  </div>
</body>
</html>
  `.trim();
}

function getSubtitleEmbedEmailText(
  filename: string,
  success: boolean,
  downloadUrl: string
): string {
  if (success) {
    return `Ihre Untertitel sind bereit.

Datei: ${filename}
Download: ${downloadUrl}

Hinweis: Der Download-Link erfordert eine Anmeldung bei VoxDrop.`;
  }

  return `Die Untertitel-Einbettung ist fehlgeschlagen.

Datei: ${filename}
Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.`;
}

function getVideoEmailHtml(
  filename: string,
  success: boolean,
  downloadUrl: string,
  outputFormat: string
): string {
  const statusColor = success ? '#22c55e' : '#ef4444';
  const statusBg = success ? '#dcfce7' : '#fee2e2';
  const statusText = success ? 'Abgeschlossen' : 'Fehlgeschlagen';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video ${success ? 'bereit' : 'fehlgeschlagen'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="VoxDrop Logo" style="display: block; margin: 0 auto; border-radius: 12px;">
        <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #111;">VoxDrop</h1>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; padding: 8px 16px; background: ${statusBg}; color: ${statusColor}; font-weight: 600; font-size: 14px; border-radius: 9999px;">
          ${statusText}
        </span>
      </div>

      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111; text-align: center;">
        Video ${success ? 'bereit' : 'fehlgeschlagen'}
      </h2>

      <p style="margin: 0 0 8px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        <strong>Datei:</strong> ${filename}
      </p>

      ${success ? `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Ihr Video ist fertig (${outputFormat.toUpperCase()}).
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${downloadUrl}"
           style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">
          Video herunterladen
        </a>
      </div>
      ` : `
      <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        Bei der Video-Konvertierung ist leider ein Fehler aufgetreten.
        Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
      </p>
      `}

      <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">

      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        Hinweis: Der Download-Link erfordert eine Anmeldung bei VoxDrop.
      </p>
    </div>

    <p style="margin: 24px 0 0; font-size: 11px; color: #999; text-align: center;">
      VoxDrop - Barrierefreiheits-Tools für Unternehmen<br>
      DSGVO-konform | Deutsche Server | Made in Germany
    </p>
  </div>
</body>
</html>
  `.trim();
}

function getVideoEmailText(
  filename: string,
  success: boolean,
  downloadUrl: string,
  outputFormat: string
): string {
  return `
VoxDrop - Video ${success ? 'bereit' : 'fehlgeschlagen'}

Datei: ${filename}

${success ? `Ihr Video ist fertig (${outputFormat.toUpperCase()}).

Download:
${downloadUrl}
` : `Bei der Video-Konvertierung ist leider ein Fehler aufgetreten.
Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
`}
---
VoxDrop - Barrierefreiheits-Tools für Unternehmen
DSGVO-konform | Deutsche Server | Made in Germany
  `.trim();
}

/**
 * Plain text version of podcast notification email
 */
function getPodcastEmailText(filename: string, success: boolean, duration?: number, downloadUrl?: string): string {
  const durationText = duration ? formatDuration(duration) : 'Unbekannt';

  return `
VoxDrop - Podcast ${success ? 'erstellt' : 'fehlgeschlagen'}

Datei: ${filename}
${success ? `Dauer: ${durationText}` : ''}

${success ? `Ihr Podcast ist bereit zum Download:

${downloadUrl}
` : `Bei der Podcast-Erstellung ist leider ein Fehler aufgetreten.
Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
`}
---
VoxDrop - Barrierefreiheits-Tools für Unternehmen
DSGVO-konform | Deutsche Server | Made in Germany
  `.trim();
}

/**
 * Send workspace invite email
 */
export async function sendWorkspaceInviteEmail(
  email: string,
  workspaceName: string,
  inviter: string,
  inviteUrl: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - skipping workspace invite email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Einladung zum Workspace "${workspaceName}" - VoxDrop`,
      html: getWorkspaceInviteEmailHtml(workspaceName, inviter, inviteUrl),
      text: getWorkspaceInviteEmailText(workspaceName, inviter, inviteUrl),
    });

    if (error) {
      console.error('[Email] Failed to send workspace invite email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Workspace invite email sent to ${email}, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending workspace invite email:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

function getWorkspaceInviteEmailHtml(
  workspaceName: string,
  inviter: string,
  inviteUrl: string
): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace-Einladung</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="VoxDrop Logo" style="display: block; margin: 0 auto; border-radius: 12px;">
        <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #111;">VoxDrop</h1>
      </div>

      <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #111; text-align: center;">
        Einladung zum Workspace
      </h2>
      <p style="margin: 0 0 20px; font-size: 16px; color: #666; line-height: 1.6; text-align: center;">
        ${inviter} hat Sie zum Workspace <strong>${workspaceName}</strong> eingeladen.
      </p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Einladung annehmen
        </a>
      </div>

      <p style="margin: 0; font-size: 13px; color: #888; line-height: 1.6; text-align: center;">
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
        <span style="word-break: break-all;">${inviteUrl}</span>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function getWorkspaceInviteEmailText(
  workspaceName: string,
  inviter: string,
  inviteUrl: string
): string {
  return `Einladung zum Workspace "${workspaceName}"

${inviter} hat Sie eingeladen, dem Workspace "${workspaceName}" beizutreten.

Einladung annehmen: ${inviteUrl}
`;
}

/**
 * Format duration in seconds to MM:SS
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export { isEmailConfigured };
