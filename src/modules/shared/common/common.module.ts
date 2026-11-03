import { Global, Module } from '@nestjs/common';

/** Global home for shared config, decorators, errors, filters, guards and utils. */
@Global()
@Module({})
export class CommonModule {}
