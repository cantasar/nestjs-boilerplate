import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMailClient } from 'zeptomail';
import { getOtpEmailTemplate } from './templates/otp.template';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly client: SendMailClient;
    private readonly fromAddress: string;
    private readonly fromName: string;

    constructor(private configService: ConfigService) {
        const url = this.configService.getOrThrow<string>('ZEPTOMAIL_URL');
        const token = this.configService.getOrThrow<string>('ZEPTOMAIL_TOKEN');
        this.fromAddress = this.configService.getOrThrow<string>('MAIL_FROM_ADDRESS');
        this.fromName = this.configService.getOrThrow<string>('MAIL_FROM_NAME');

        this.client = new SendMailClient({ url, token });
    }

    async sendOtpEmail(to: string, otp: string): Promise<void> {
        try {
            await this.client.sendMail({
                from: {
                    address: this.fromAddress,
                    name: this.fromName,
                },
                to: [
                    {
                        email_address: {
                            address: to,
                            name: to,
                        },
                    },
                ],
                subject: 'Your OTP Code',
                htmlbody: getOtpEmailTemplate({ otp }),
            });

            this.logger.log(`Mail sent successfully to ${to}`);
        } catch (error) {
            this.logger.error(
                `Failed to send OTP email to ${to}`,
                error instanceof Error ? error.stack : undefined,
            );
            throw new Error('Failed to send OTP email');
        }
    }
}
