import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  APP_EVENTS,
  type ExampleHappenedEvent,
} from '../../../shared/common/events/app.events';

/**
 * Reference event listener. `@OnEvent` handlers run in-process; emitters use
 * `EventEmitter2.emit(APP_EVENTS.EXAMPLE_HAPPENED, payload)`.
 *
 * With `{ async: true }` the handler is awaited on the emitter's microtask
 * chain, so a slow handler can still back-pressure the emitter. For non-
 * critical side effects detach the work with `queueMicrotask` and swallow
 * errors after logging so they cannot bubble into the emitting request.
 */
@Injectable()
export class ExampleListener {
  private readonly logger = new Logger(ExampleListener.name);

  @OnEvent(APP_EVENTS.EXAMPLE_HAPPENED, { async: true })
  onExampleHappened(event: ExampleHappenedEvent): void {
    queueMicrotask(() => {
      void this.handle(event).catch((err) => {
        this.logger.error(
          `example.happened handler failed for id=${event.id}: ${(err as Error).message}`,
        );
      });
    });
  }

  // void-ok: side-effect handler resolves with nothing.
  private async handle(event: ExampleHappenedEvent): Promise<void> {
    this.logger.debug(`example.happened received: ${event.message}`);
    await Promise.resolve();
  }
}
