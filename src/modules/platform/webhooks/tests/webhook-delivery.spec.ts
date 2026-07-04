import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { signWebhookBody } from '../lib/webhook-signature.util';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { WebhookDeliveryProcessor } from '../queue/webhook-delivery.processor';
import type { WebhookDeliveryJob } from '../queue/webhook-delivery.types';
import type { WebhookEndpoint } from '../interfaces/webhook-endpoint.interface';

const ENDPOINT: WebhookEndpoint = {
  urlEnvVar: 'TEST_WEBHOOK_URL',
  secretEnvVar: 'TEST_WEBHOOK_SECRET',
};

function configWith(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('signWebhookBody', () => {
  it('produces sha256=<hex HMAC over the exact bytes>', () => {
    const body = '{"a":1}';
    const expected =
      'sha256=' + createHmac('sha256', 'top-secret').update(body).digest('hex');
    expect(signWebhookBody('top-secret', body)).toBe(expected);
  });

  it('changes when the body is tampered', () => {
    expect(signWebhookBody('s', '{"a":1}')).not.toBe(
      signWebhookBody('s', '{"a":2}'),
    );
  });
});

describe('WebhookDeliveryService', () => {
  function makeService(values: Record<string, string | undefined>) {
    const add = jest.fn().mockResolvedValue(undefined);
    const service = new WebhookDeliveryService(
      { add } as unknown as Queue<WebhookDeliveryJob>,
      configWith(values),
    );
    return { service, add };
  }

  it('no-ops when the URL env var is unset', async () => {
    const { service, add } = makeService({});
    await service.deliver(ENDPOINT, [{ id: 1 }]);
    expect(add).not.toHaveBeenCalled();
  });

  it('no-ops on an empty batch', async () => {
    const { service, add } = makeService({ TEST_WEBHOOK_URL: 'https://x' });
    await service.deliver(ENDPOINT, []);
    expect(add).not.toHaveBeenCalled();
  });

  it('fans out one job per chunk with shared meta', async () => {
    const { service, add } = makeService({ TEST_WEBHOOK_URL: 'https://x' });
    const items = Array.from({ length: 1200 }, (_, i) => ({ i }));
    await service.deliver(ENDPOINT, items, { generatedAt: 't0' });
    expect(add).toHaveBeenCalledTimes(3); // 500 + 500 + 200
    const [, firstJob] = add.mock.calls[0] as [string, WebhookDeliveryJob];
    const [, lastJob] = add.mock.calls[2] as [string, WebhookDeliveryJob];
    expect(firstJob.chunkIndex).toBe(0);
    expect(firstJob.chunkCount).toBe(3);
    expect(firstJob.items).toHaveLength(500);
    expect(firstJob.meta).toEqual({ generatedAt: 't0' });
    expect(lastJob.chunkIndex).toBe(2);
    expect(lastJob.items).toHaveLength(200);
  });
});

describe('WebhookDeliveryProcessor', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function job(
    data: Partial<WebhookDeliveryJob> = {},
  ): Job<WebhookDeliveryJob> {
    return {
      data: {
        endpoint: ENDPOINT,
        chunkIndex: 0,
        chunkCount: 1,
        items: [{ id: 1 }],
        meta: { generatedAt: 't0' },
        ...data,
      },
      opts: { attempts: 5 },
      attemptsMade: 1,
    } as unknown as Job<WebhookDeliveryJob>;
  }

  it('drops the chunk when the URL is unset (no retry, no fetch)', async () => {
    const processor = new WebhookDeliveryProcessor(configWith({}));
    await processor.process(job());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('REFUSES to send when the secret is unset (never unsigned)', async () => {
    const processor = new WebhookDeliveryProcessor(
      configWith({ TEST_WEBHOOK_URL: 'https://receiver' }),
    );
    await processor.process(job());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs the exact serialized body and POSTs with the header', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const processor = new WebhookDeliveryProcessor(
      configWith({
        TEST_WEBHOOK_URL: 'https://receiver',
        TEST_WEBHOOK_SECRET: 's3cr3t',
      }),
    );
    await processor.process(job());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://receiver');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toEqual({
      generatedAt: 't0',
      chunkIndex: 0,
      chunkCount: 1,
      items: [{ id: 1 }],
    });
    expect(init.headers['X-Webhook-Signature']).toBe(
      signWebhookBody('s3cr3t', init.body),
    );
  });

  it('throws on a non-2xx response so BullMQ retries', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    });
    const processor = new WebhookDeliveryProcessor(
      configWith({
        TEST_WEBHOOK_URL: 'https://receiver',
        TEST_WEBHOOK_SECRET: 's3cr3t',
      }),
    );
    await expect(processor.process(job())).rejects.toThrow('502');
  });
});
