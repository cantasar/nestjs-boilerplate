import { Test } from '@nestjs/testing';
import { NotificationService } from '../inbox/notification.service';
import { NotificationRepository } from '../inbox/notification.repository';
import { PUSH_SENDER } from '../interfaces/push-sender.interface';
import { NotificationType } from '../../../shared/database/schema/enums/notification-type.enum';
import { PushDeliveryStatus } from '../../../shared/database/schema/enums/notification-type.enum';
import type { Notification } from '../../../shared/database/types/notification-select.type';

const baseRow: Notification = {
  id: 1,
  recipientUserId: 42,
  type: NotificationType.TRANSACTIONAL,
  title: 't',
  body: 'b',
  deepLink: null,
  iconUrl: null,
  payload: {},
  broadcastId: null,
  pushDeliveryStatus: PushDeliveryStatus.PENDING,
  pushSentAt: null,
  readAt: null,
  deletedAt: null,
  createdAt: new Date(),
};

describe('NotificationService', () => {
  const repo = {
    create: jest.fn<Promise<Notification>, [unknown]>(),
    markPushStatusByIds: jest.fn<
      Promise<void>,
      [number[], PushDeliveryStatus]
    >(),
    markRead: jest.fn<Promise<boolean>, [number, number]>(),
    existsForUser: jest.fn<Promise<boolean>, [number, number]>(),
    countUnread: jest.fn<Promise<number>, [number]>(),
  };
  const push = {
    isEnabled: jest.fn<boolean, []>(),
    sendToExternalIds: jest.fn(),
  };

  let service: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.create.mockResolvedValue(baseRow);
    repo.markPushStatusByIds.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: NotificationRepository, useValue: repo },
        { provide: PUSH_SENDER, useValue: push },
      ],
    }).compile();
    service = moduleRef.get(NotificationService);
  });

  describe('notifyUser', () => {
    it('persists then marks SKIPPED when no push alias is provided', async () => {
      await service.notifyUser({
        recipientUserId: 42,
        type: NotificationType.TRANSACTIONAL,
        title: 'Hi',
        body: 'There',
        pushExternalId: null,
      });
      expect(repo.create).toHaveBeenCalled();
      expect(push.sendToExternalIds).not.toHaveBeenCalled();
      expect(repo.markPushStatusByIds).toHaveBeenCalledWith(
        [1],
        PushDeliveryStatus.SKIPPED,
      );
    });

    it('pushes single-locale copy and marks SENT on delivery', async () => {
      push.sendToExternalIds.mockResolvedValue({ delivered: true });
      await service.notifyUser({
        recipientUserId: 42,
        type: NotificationType.TRANSACTIONAL,
        title: 'Hi',
        body: 'There',
        pushExternalId: 'ext-1',
      });
      expect(push.sendToExternalIds).toHaveBeenCalledWith(
        expect.objectContaining({
          externalIds: ['ext-1'],
          title: { default: 'Hi' },
          body: { default: 'There' },
        }),
      );
      expect(repo.markPushStatusByIds).toHaveBeenCalledWith(
        [1],
        PushDeliveryStatus.SENT,
      );
    });

    it('records FAILED without throwing when push fails', async () => {
      push.sendToExternalIds.mockResolvedValue({
        delivered: false,
        error: 'boom',
      });
      await expect(
        service.notifyUser({
          recipientUserId: 42,
          type: NotificationType.TRANSACTIONAL,
          title: 'Hi',
          body: 'There',
          pushExternalId: 'ext-1',
        }),
      ).resolves.toBeDefined();
      expect(repo.markPushStatusByIds).toHaveBeenCalledWith(
        [1],
        PushDeliveryStatus.FAILED,
      );
    });
  });

  describe('markRead', () => {
    it('returns true when the row was updated', async () => {
      repo.markRead.mockResolvedValue(true);
      expect(await service.markRead(1, 42)).toBe(true);
      expect(repo.existsForUser).not.toHaveBeenCalled();
    });

    it('is idempotent: returns true when already read but owned', async () => {
      repo.markRead.mockResolvedValue(false);
      repo.existsForUser.mockResolvedValue(true);
      expect(await service.markRead(1, 42)).toBe(true);
    });

    it('returns false when the row is not owned', async () => {
      repo.markRead.mockResolvedValue(false);
      repo.existsForUser.mockResolvedValue(false);
      expect(await service.markRead(1, 42)).toBe(false);
    });
  });

  describe('unreadCount', () => {
    it('delegates to the repository', async () => {
      repo.countUnread.mockResolvedValue(7);
      expect(await service.unreadCount(42)).toBe(7);
      expect(repo.countUnread).toHaveBeenCalledWith(42);
    });
  });
});
