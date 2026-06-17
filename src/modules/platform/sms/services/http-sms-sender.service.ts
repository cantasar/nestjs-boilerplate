import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsSender } from '../interfaces/sms-sender.interface';

/**
 * Generic HTTP SMS sender for the common "code-prefixed body" provider style
 * (the gateway authenticates via query params and returns a status-code-prefixed
 * text body where a configured prefix means success). Every provider detail —
 * endpoint, credentials, query-param names, originator header and the success
 * prefix — comes from config, so no single vendor is baked in.
 *
 * Throws on transport failure or a non-success body so the SMS queue worker
 * retries with backoff rather than silently dropping the message.
 */
@Injectable()
export class HttpSmsSender implements SmsSender {
  private readonly logger = new Logger(HttpSmsSender.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, message: string): Promise<void> {
    // void-ok: resolves once the gateway accepts the message.
    const apiUrl = this.config.get<string>('SMS_API_URL');
    if (!apiUrl) {
      this.logger.warn('SMS not configured (SMS_API_URL). Message not sent.');
      return;
    }

    const url = this.buildUrl(apiUrl, to, message);
    const successPrefix = this.config.get<string>('SMS_SUCCESS_PREFIX') ?? '00';
    const timeoutMs = this.config.get<number>('SMS_TIMEOUT_MS') ?? 10_000;

    let res: Response;
    let body: string;
    try {
      // Bound the request so a hung gateway can't pin the worker slot forever.
      res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      body = await res.text();
    } catch (error) {
      this.logger.error(
        'SMS gateway request failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('SMS gateway request failed');
    }

    // The gateway body can echo back credentials/PII, so it is never put in the
    // thrown message (which propagates to logs and, via the filter, responses).
    if (!res.ok || !body.startsWith(successPrefix)) {
      this.logger.error(
        `SMS gateway rejected message (status ${res.status}): ${body}`,
      );
      throw new Error('SMS gateway rejected message');
    }
  }

  private buildUrl(apiUrl: string, to: string, message: string): string {
    const params = new URLSearchParams();
    const user = this.config.get<string>('SMS_USER');
    const pass = this.config.get<string>('SMS_PASS');
    const header = this.config.get<string>('SMS_SENDER_HEADER');
    const userParam = this.config.get<string>('SMS_USER_PARAM') ?? 'usercode';
    const passParam = this.config.get<string>('SMS_PASS_PARAM') ?? 'password';
    const toParam = this.config.get<string>('SMS_TO_PARAM') ?? 'gsmno';
    const messageParam =
      this.config.get<string>('SMS_MESSAGE_PARAM') ?? 'message';
    const headerParam =
      this.config.get<string>('SMS_HEADER_PARAM') ?? 'msgheader';

    if (user) params.set(userParam, user);
    if (pass) params.set(passParam, pass);
    if (header) params.set(headerParam, header);
    params.set(toParam, to);
    params.set(messageParam, message);

    return `${apiUrl}?${params.toString()}`;
  }
}
