/**
 * Domain-supplied source of "still-referenced" storage keys. Each feature that
 * owns persisted storage keys (avatars, uploads, attachments, …) implements one
 * and registers it under the `MEDIA_REFERENCE_PROVIDERS` multi-token; the
 * generic `MediaCleanupService` unions their results and never deletes a key any
 * provider reports as referenced.
 *
 * Keeping this a port is what keeps the cleanup job generic — the platform layer
 * knows nothing about which tables or columns hold the keys.
 */
export interface MediaReferenceProvider {
  collectReferencedKeys(): Promise<Set<string>>;
}

export const MEDIA_REFERENCE_PROVIDERS = Symbol('MEDIA_REFERENCE_PROVIDERS');
