/**
 * Shared, generic branding + layout for transactional emails.
 *
 * Templates stay plain functions (no DI) so they can be unit-tested without a
 * Nest container. Brand values are read from `process.env` with neutral
 * fallbacks — set `MAIL_FROM_NAME`, `APP_PUBLIC_URL`, and optionally
 * `MAIL_LOGO_URL` to brand outgoing mail without touching template code.
 */

const FALLBACK_BRAND_NAME = 'App';

/** Display name used in copy and the brand header. Prefers `MAIL_FROM_NAME`. */
export function getBrandName(): string {
  return process.env.MAIL_FROM_NAME ?? FALLBACK_BRAND_NAME;
}

/**
 * Public URL of the email logo. Prefers `MAIL_LOGO_URL`, else derives it from
 * `APP_PUBLIC_URL`. Returns `null` when neither is set so the header can fall
 * back to a text wordmark (no broken image).
 */
export function getMailLogoUrl(): string | null {
  const explicit = process.env.MAIL_LOGO_URL;
  if (explicit) return explicit;
  const base = process.env.APP_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/logo.png`;
}

/** Escapes user-supplied values before they are interpolated into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Brand header used at the top of every transactional email: an optional logo
 * image above the app-name wordmark. The wordmark doubles as the `<img>` alt
 * text so the brand still reads if the image is blocked or unset.
 */
function mailBrandHeader(): string {
  const name = escapeHtml(getBrandName());
  const logoUrl = getMailLogoUrl();
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="${name}" style="display:block;border:0;outline:none;text-decoration:none;width:48px;height:48px;margin:0 auto 10px auto;" />`
    : '';
  return `${logo}<span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#111827;">${name}</span>`;
}

export interface MailLayoutParams {
  /** `<title>` text and accessible document title. */
  title: string;
  /** Large heading inside the card. */
  heading: string;
  /** Lead paragraph under the heading (plain text, escaped by the layout). */
  intro: string;
  /** Pre-rendered, trusted HTML for the card body (e.g. an OTP box). */
  bodyHtml: string;
  /** Small muted note rendered below the card (plain text, escaped). */
  footerNote: string;
}

/**
 * Renders a complete, email-client-safe HTML document around `bodyHtml`. Inline
 * styles keep it self-contained; the `m-*` classes only add dark-mode polish
 * where clients honour `<style>`. Generic neutral palette — no domain branding.
 */
export function renderMailLayout({
  title,
  heading,
  intro,
  bodyHtml,
  footerNote,
}: MailLayoutParams): string {
  const safeTitle = escapeHtml(title);
  const safeHeading = escapeHtml(heading);
  const safeIntro = escapeHtml(intro);
  const safeFooter = escapeHtml(footerNote);
  const year = new Date().getFullYear();
  const brand = escapeHtml(getBrandName());
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light only;
        supported-color-schemes: light;
      }
      @media (prefers-color-scheme: dark) {
        .m-bg { background-color: #f3f4f6 !important; }
        .m-card { background-color: #ffffff !important; }
        .m-otp-box { background-color: #f3f4f6 !important; border-color: #6366f1 !important; }
        .m-text { color: #111827 !important; }
        .m-text-muted { color: #4b5563 !important; }
        .m-text-faint { color: #9ca3af !important; }
      }
      [data-ogsc] .m-bg { background-color: #f3f4f6 !important; }
      [data-ogsc] .m-card { background-color: #ffffff !important; }
      [data-ogsc] .m-otp-box { background-color: #f3f4f6 !important; border-color: #6366f1 !important; }
      [data-ogsc] .m-text { color: #111827 !important; }
      [data-ogsc] .m-text-muted { color: #4b5563 !important; }
      [data-ogsc] .m-text-faint { color: #9ca3af !important; }
      u + .body .m-bg { background-color: #f3f4f6 !important; }
    </style>
  </head>
  <body class="body" style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;-webkit-font-smoothing:antialiased;">
    <table role="presentation" class="m-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
            <tr>
              <td align="center" style="padding:8px 0 24px 0;">
                ${mailBrandHeader()}
              </td>
            </tr>
            <tr>
              <td class="m-card" bgcolor="#ffffff" style="background-color:#ffffff;border-radius:16px;padding:40px 32px;">
                <h1 class="m-text" style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;line-height:1.25;letter-spacing:-0.01em;color:#111827;text-align:center;">
                  ${safeHeading}
                </h1>
                <p class="m-text-muted" style="margin:0 0 28px 0;font-size:15px;line-height:1.5;color:#4b5563;text-align:center;">
                  ${safeIntro}
                </p>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 8px 8px 8px;">
                <p class="m-text-faint" style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">
                  ${safeFooter}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 8px 0 8px;">
                <p class="m-text-faint" style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;text-align:center;">
                  &copy; ${year} ${brand} — All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Renders the boxed monospace code block reused by OTP-bearing templates. The
 * code is escaped before interpolation.
 */
export function renderCodeBox(code: string): string {
  const safeCode = escapeHtml(code);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" class="m-otp-box" bgcolor="#f3f4f6" style="background-color:#f3f4f6;border:1px solid #6366f1;border-radius:12px;padding:24px;">
                      <div class="m-text" style="font-family:'SF Mono','Roboto Mono',Menlo,Consolas,monospace;font-size:36px;font-weight:600;letter-spacing:0.4em;color:#111827;line-height:1;">
                        ${safeCode}
                      </div>
                    </td>
                  </tr>
                </table>`;
}
