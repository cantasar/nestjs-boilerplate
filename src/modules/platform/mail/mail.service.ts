import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMailClient } from 'zeptomail';
import { getOtpEmailTemplate } from './templates/otp-template';
import { getVerifyEmailTemplate } from './templates/verify-email-template';
import { getPasswordResetTemplate } from './templates/password-reset-template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: SendMailClient | null;
  private readonly fromAddress: string | null;
  private readonly fromName: string | null;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('ZEPTOMAIL_URL');
    const token = this.configService.get<string>('ZEPTOMAIL_TOKEN');
    this.fromAddress =
      this.configService.get<string>('MAIL_FROM_ADDRESS') ?? null;
    this.fromName = this.configService.get<string>('MAIL_FROM_NAME') ?? null;
    this.client = url && token ? new SendMailClient({ url, token }) : null;
  }

  async sendOtpEmail(to: string, otp: string): Promise<void> {
    // void-ok
    await this.sendHtml(to, 'Your OTP Code', getOtpEmailTemplate({ otp }));
  }

  async sendVerificationEmail(to: string, code: string): Promise<void> {
    // void-ok
    await this.sendHtml(
      to,
      'Verify your email',
      getVerifyEmailTemplate({ code }),
    );
  }

  async sendPasswordResetEmail(to: string, code: string): Promise<void> {
    // void-ok
    await this.sendHtml(
      to,
      'Reset your password',
      getPasswordResetTemplate({ code }),
    );
  }

  /**
   * Single send path for every templated mail. No-ops with a warning when mail
   * is unconfigured; throws on transport failure so the caller (the mail queue
   * worker) can retry with backoff.
   */
  private async sendHtml(
    to: string,
    subject: string,
    htmlbody: string,
  ): Promise<void> {
    // void-ok
    if (!this.client || !this.fromAddress || !this.fromName) {
      this.logger.warn(
        `Mail not configured (ZEPTOMAIL_*, MAIL_FROM_*). "${subject}" not sent.`,
      );
      return;
    }
    try {
      await this.client.sendMail({
        from: { address: this.fromAddress, name: this.fromName },
        to: [{ email_address: { address: to, name: to } }],
        subject,
        htmlbody,
      });
      this.logger.log(`Mail sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send "${subject}" to ${to}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Failed to send email');
    }
  }
}
