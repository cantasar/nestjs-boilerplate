import { Module } from '@nestjs/common';
import { ExampleListener } from './listeners/example.listener';

/**
 * Hosts in-process event listeners. The EventEmitter itself is configured once
 * via `EventEmitterModule.forRoot()` in AppModule; this module only registers
 * the listener providers so their `@OnEvent` handlers are discovered.
 */
@Module({
  providers: [ExampleListener],
})
export class EventsModule {}
