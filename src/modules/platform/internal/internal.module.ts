import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';

/**
 * Groups server-to-server routes guarded by `ApiKeyGuard` (`@ApiKeyAuth()`).
 * The guard resolves `ConfigService` from the global ConfigModule, so no extra
 * providers are needed here.
 */
@Module({ controllers: [InternalController] })
export class InternalModule {}
