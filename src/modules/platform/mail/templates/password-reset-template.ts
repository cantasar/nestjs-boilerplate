import type { PasswordResetTemplateParams } from './password-reset-template-params';
import { getBrandName, renderCodeBox, renderMailLayout } from './mail-branding';

/** Self-service password reset: shows the OTP the user enters to set a new password. */
export function getPasswordResetTemplate({
  code,
}: PasswordResetTemplateParams): string {
  const brand = getBrandName();
  return renderMailLayout({
    title: `${brand} — Reset your password`,
    heading: 'Reset your password',
    intro:
      'Enter the code below to confirm it is you, then choose a new password.',
    bodyHtml: `${renderCodeBox(code)}
                <p class="m-text-muted" style="margin:24px 0 0 0;font-size:13px;line-height:1.5;color:#4b5563;text-align:center;">
                  This code expires in <strong class="m-text" style="color:#111827;font-weight:600;">15 minutes</strong>.
                </p>`,
    footerNote: `If you didn't request a password reset, you can safely ignore this email. Your password stays unchanged.`,
  });
}
