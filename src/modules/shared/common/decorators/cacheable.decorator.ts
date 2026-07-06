import { SetMetadata } from '@nestjs/common';
import { CacheableOptions } from '../interfaces/cacheable-options.interface';

export const CACHEABLE_METADATA = 'cache:cacheable';

export const Cacheable = (opts: CacheableOptions): MethodDecorator =>
  SetMetadata(CACHEABLE_METADATA, opts);
