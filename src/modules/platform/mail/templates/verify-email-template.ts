import type { VerifyEmailTemplateParams } from './verify-email-template-params';
import { getBrandName, renderCodeBox, renderMailLayout } from './mail-branding';

/** Email-verification message: shows the OTP a new user enters to activate. */
export function getVerifyEmailTemplate({
  code,
}: VerifyEmailTemplateParams): string {
  const brand = getBrandName();
  return renderMailLayout({
    title: `${brand} — Verify your email`,
    heading: 'Verify your email',
    intro:
      'Enter the code below to confirm your email address and activate your account.',
    bodyHtml: `${renderCodeBox(code)}
                <p class="m-text-muted" style="margin:24px 0 0 0;font-size:13px;line-height:1.5;color:#4b5563;text-align:center;">
                  This code expires in <strong class="m-text" style="color:#111827;font-weight:600;">15 minutes</strong>.
                </p>`,
    footerNote: `If you didn't create a ${brand} account, you can safely ignore this email. Never share this code with anyone.`,
  });
}
