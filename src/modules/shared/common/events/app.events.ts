/**
 * Central registry of in-process domain event names emitted via
 * `@nestjs/event-emitter`. Keep names dot-namespaced and collision-free; pair
 * each with a typed payload interface so listeners stay type-safe.
 */
export const APP_EVENTS = {
  EXAMPLE_HAPPENED: 'example.happened',
} as const;

/** Payload for the reference `example.happened` event. */
export interface ExampleHappenedEvent {
  id: number;
  message: string;
}
