import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';

/** No providers needed: `ApiKeyGuard` uses the global `ConfigService`. */
@Module({ controllers: [InternalController] })
export class InternalModule {}
