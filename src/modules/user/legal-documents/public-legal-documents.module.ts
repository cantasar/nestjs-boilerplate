import { Module } from '@nestjs/common';
import { ConsentModule } from '../consent/consent.module';
import { LegalDocumentsController } from './legal-documents.controller';

/**
 * Hosts the public, no-auth `GET /api/v1/legal-documents` endpoints. Imports the
 * provider-only `ConsentModule` purely for the `DOCUMENT_STORE` port — it mounts
 * no providers of its own.
 */
@Module({
  imports: [ConsentModule],
  controllers: [LegalDocumentsController],
})
export class PublicLegalDocumentsModule {}
