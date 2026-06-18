import { Module } from '@nestjs/common';
import { ConsentModule } from './consent.module';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/**
 * Hosts the authenticated consent endpoints (`/api/v1/consent/*`). Split from
 * the provider-only `ConsentModule` (which only exports the `DOCUMENT_STORE`
 * port) so the data layer can be consumed without mounting these controllers.
 * In an app with a profile feature, this controller would live there instead.
 */
@Module({
  imports: [ConsentModule],
  controllers: [ConsentController],
  providers: [ConsentService],
})
export class AuthenticatedConsentModule {}
