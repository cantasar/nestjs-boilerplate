import { Module } from '@nestjs/common';
import { ConsentRepository } from './consent.repository';
import { DOCUMENT_STORE } from './interfaces/document-store.interface';

/**
 * Provider-only data module. Binds the `DOCUMENT_STORE` port to the Drizzle
 * `ConsentRepository` and exports it (plus the concrete repo) so any consumer —
 * the public legal-documents controllers, the authenticated consent flow, or a
 * future admin module — can inject the store without re-mounting controllers.
 * Bind a different class to the token to swap the persistence backend.
 */
@Module({
  providers: [
    ConsentRepository,
    { provide: DOCUMENT_STORE, useExisting: ConsentRepository },
  ],
  exports: [DOCUMENT_STORE, ConsentRepository],
})
export class ConsentModule {}
