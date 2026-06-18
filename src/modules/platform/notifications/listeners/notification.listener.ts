import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  APP_EVENTS,
  type ExampleHappenedEvent,
} from '../../../shared/common/events/app.events';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../interfaces/notification-port.interface';
import { NotificationType } from '../../../shared/database/schema/enums/notification-type.enum';

/**
 * Reference listener: maps a generic in-process event onto a per-user
 * notification. Real apps copy this shape — resolve the recipient (e.g. via a
 * repository) and call `notifications.notifyUser` with the user's push alias.
 * Side-effect work is detached with `queueMicrotask` and errors are swallowed
 * after logging so a slow/failed notification cannot bubble back into the
 * emitting request. This handler is a placeholder and ships dormant until an app
 * wires a real event + recipient lookup.
 */
@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notifications: NotificationPort,
  ) {}

  @OnEvent(APP_EVENTS.EXAMPLE_HAPPENED)
  onExampleHappened(event: ExampleHappenedEvent): void {
    // Detach with queueMicrotask (NOT `{ async: true }`, which would re-couple
    // the handler promise to the emitter) so a slow/failed notification never
    // bubbles back into the emitting request; errors are logged here.
    queueMicrotask(() => {
      void this.deliver(event).catch((err) => {
        this.logger.error(
          `notification for example.happened id=${event.id} failed: ${(err as Error).message}`,
        );
      });
    });
  }

  // void-ok: side-effect handler resolves with nothing.
  private async deliver(event: ExampleHappenedEvent): Promise<void> {
    // Placeholder: a real app resolves the recipient + push alias here. The
    // example event carries no user, so this only demonstrates the call shape.
    await this.notifications.notifyUser({
      recipientUserId: event.id,
      type: NotificationType.TRANSACTIONAL,
      title: 'Example event',
      body: event.message,
      pushExternalId: null,
    });
  }
}
