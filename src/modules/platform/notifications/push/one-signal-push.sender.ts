import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as OneSignal from '@onesignal/node-onesignal';
import type { PushSender } from '../interfaces/push-sender.interface';
import type {
  SendPushParams,
  SendPushResult,
} from '../interfaces/push-sender.interface';
import type { LocalizedText } from '../interfaces/notification.types';
import { isTransientError, sleep } from './push-retry.util';

const INTERNAL_RETRY_ATTEMPTS = 2;
const INTERNAL_RETRY_BACKOFF_MS = 250;

/**
 * OneSignal's multilingual `contents`/`headings` maps require at least the `en`
 * key. This is a OneSignal API requirement, not a generic locale assumption —
 * it lives inside this adapter and is fed from the generic `LocalizedText`
 * default, so other providers are free to map locales however they need.
 */
const ONESIGNAL_REQUIRED_LANG = 'en';

/**
 * OneSignal reference implementation of the `PushSender` port. All provider
 * detail (app id, REST key) comes from config behind the `PUSH_SENDER` token, so
 * swapping providers means binding a different class — callers never change.
 *
 * Feature-flagged by `ONESIGNAL_APP_ID`/`ONESIGNAL_REST_API_KEY`: when unset the
 * sender stays disabled and every send is a no-op `{ skipped: true }` so the
 * inbox still persists and rows are marked SKIPPED rather than retried forever.
 */
@Injectable()
export class OneSignalPushSender implements PushSender, OnModuleInit {
  private readonly logger = new Logger(OneSignalPushSender.name);
  private client?: OneSignal.DefaultApi;
  private appId?: string;
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const appId = this.config.get<string>('ONESIGNAL_APP_ID');
    const restApiKey = this.config.get<string>('ONESIGNAL_REST_API_KEY');
    if (!appId || !restApiKey) {
      this.logger.warn(
        'OneSignal not configured (ONESIGNAL_APP_ID/ONESIGNAL_REST_API_KEY). Push delivery will be skipped.',
      );
      return;
    }
    this.appId = appId;
    const configuration = OneSignal.createConfiguration({ restApiKey });
    this.client = new OneSignal.DefaultApi(configuration);
    this.enabled = true;
    this.logger.log('OneSignal push sender initialized');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendToExternalIds(params: SendPushParams): Promise<SendPushResult> {
    if (!this.enabled || !this.client || !this.appId) {
      return { delivered: false, skipped: true };
    }
    if (params.externalIds.length === 0) {
      return { delivered: false, skipped: true };
    }

    const notification = new OneSignal.Notification();
    notification.app_id = this.appId;
    notification.target_channel = 'push';
    notification.include_aliases = { external_id: params.externalIds };
    notification.contents = this.toLangMap(params.body);
    notification.headings = this.toLangMap(params.title);
    if (params.data) notification.data = params.data;
    if (params.url) notification.url = params.url;
    if (params.iconUrl) {
      notification.large_icon = params.iconUrl;
      notification.chrome_web_icon = params.iconUrl;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= INTERNAL_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = (await this.client.createNotification(
          notification,
        )) as { id?: string; recipients?: number };
        // OneSignal returns HTTP 200 even when every alias is invalid/
        // unsubscribed (recipients=0). Treat that as "nothing delivered" and
        // skip rather than report SENT or retry a permanently-empty target.
        if (
          typeof response.recipients === 'number' &&
          response.recipients === 0
        ) {
          this.logger.warn(
            'OneSignal accepted the request but reached 0 recipients (all aliases invalid/unsubscribed)',
          );
          return { delivered: false, skipped: true };
        }
        return {
          delivered: true,
          providerMessageId: response.id ?? undefined,
          recipients: response.recipients ?? params.externalIds.length,
        };
      } catch (error) {
        lastError = error;
        if (attempt < INTERNAL_RETRY_ATTEMPTS && isTransientError(error)) {
          const delay = INTERNAL_RETRY_BACKOFF_MS * Math.pow(2, attempt);
          this.logger.warn(
            `OneSignal transient error (attempt ${attempt + 1}/${INTERNAL_RETRY_ATTEMPTS + 1}); retrying in ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error(`OneSignal createNotification failed: ${message}`);
    return { delivered: false, error: message };
  }

  /**
   * Maps generic `LocalizedText` onto OneSignal's language→string map. Per-locale
   * overrides pass through as-is; OneSignal's mandatory `en` key is filled from
   * the text default whenever an explicit `en` override is absent.
   */
  private toLangMap(text: LocalizedText): Record<string, string> {
    const result: Record<string, string> = { ...text.byLocale };
    if (!result[ONESIGNAL_REQUIRED_LANG]) {
      result[ONESIGNAL_REQUIRED_LANG] = text.default;
    }
    return result;
  }
}
