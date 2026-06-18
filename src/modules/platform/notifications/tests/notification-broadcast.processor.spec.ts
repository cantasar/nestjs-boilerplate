import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { NotificationBroadcastProcessor } from '../queue/notification-broadcast.processor';
import { NotificationRepository } from '../inbox/notification.repository';
import { PUSH_SENDER } from '../interfaces/push-sender.interface';
import { NotificationType } from '../../../shared/database/schema/enums/notification-type.enum';
import { PushDeliveryStatus } from '../../../shared/database/schema/enums/notification-type.enum';
import type { BroadcastChunkJob } from '../queue/notification-broadcast.types';
import type { NewNotification } from '../../../shared/database/types/notification-insert.type';

describe('NotificationBroadcastProcessor', () => {
  const repo = {
    bulkInsert: jest.fn<
      Promise<{ id: number; recipientUserId: number }[]>,
      [NewNotification[]]
    >(),
    findExistingByBroadcast: jest.fn(),
    findPendingByBroadcast: jest.fn<
      Promise<{ id: number; recipientUserId: number }[]>,
      [string, number[]]
    >(),
    markPushStatusByIds: jest.fn<
      Promise<void>,
      [number[], PushDeliveryStatus]
    >(),
    markBroadcastPendingFailed: jest.fn<Promise<void>, [string, number[]]>(),
  };
  const push = { sendToExternalIds: jest.fn() };

  let processor: NotificationBroadcastProcessor;

  const job = (data: BroadcastChunkJob) => ({ data }) as Job<BroadcastChunkJob>;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.findExistingByBroadcast.mockResolvedValue([]);
    repo.findPendingByBroadcast.mockResolvedValue([
      { id: 10, recipientUserId: 1 },
      { id: 11, recipientUserId: 2 },
    ]);
    repo.bulkInsert.mockResolvedValue([
      { id: 10, recipientUserId: 1 },
      { id: 11, recipientUserId: 2 },
    ]);
    repo.markPushStatusByIds.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationBroadcastProcessor,
        { provide: NotificationRepository, useValue: repo },
        { provide: PUSH_SENDER, useValue: push },
      ],
    }).compile();
    processor = moduleRef.get(NotificationBroadcastProcessor);
  });

  it('resolves per-recipient locale copy from LocalizedText', async () => {
    push.sendToExternalIds.mockResolvedValue({ delivered: true });
    await processor.process(
      job({
        broadcastId: 'b1',
        type: NotificationType.BROADCAST,
        recipients: [
          { userId: 1, locale: 'de', pushExternalId: 'e1' },
          { userId: 2, locale: 'fr', pushExternalId: 'e2' },
        ],
        title: { default: 'Hello', byLocale: { de: 'Hallo' } },
        body: { default: 'World', byLocale: { fr: 'Monde' } },
      }),
    );
    const inserted = repo.bulkInsert.mock.calls[0]?.[0] ?? [];
    expect(inserted[0]).toMatchObject({ title: 'Hallo', body: 'World' });
    expect(inserted[1]).toMatchObject({ title: 'Hello', body: 'Monde' });
  });

  it('marks SKIPPED and does not push when no recipient is targetable', async () => {
    await processor.process(
      job({
        broadcastId: 'b2',
        type: NotificationType.BROADCAST,
        recipients: [{ userId: 1, locale: 'en', pushExternalId: null }],
        title: { default: 'Hi' },
        body: { default: 'There' },
      }),
    );
    expect(push.sendToExternalIds).not.toHaveBeenCalled();
    expect(repo.markPushStatusByIds).toHaveBeenCalledWith(
      expect.any(Array),
      PushDeliveryStatus.SKIPPED,
    );
  });

  it('throws (for BullMQ retry) when push is not delivered', async () => {
    push.sendToExternalIds.mockResolvedValue({
      delivered: false,
      error: 'down',
    });
    await expect(
      processor.process(
        job({
          broadcastId: 'b3',
          type: NotificationType.BROADCAST,
          recipients: [{ userId: 1, locale: 'en', pushExternalId: 'e1' }],
          title: { default: 'Hi' },
          body: { default: 'There' },
        }),
      ),
    ).rejects.toThrow();
  });
});
