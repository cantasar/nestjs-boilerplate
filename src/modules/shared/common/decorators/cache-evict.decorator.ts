import { SetMetadata } from '@nestjs/common';
import { CacheEvictOptions } from '../interfaces/cache-evict-options.interface';

export const CACHE_EVICT_METADATA = 'cache:evict';

export const CacheEvict = <TArgs extends readonly unknown[] = unknown[]>(
  opts: CacheEvictOptions<TArgs>,
): MethodDecorator => SetMetadata(CACHE_EVICT_METADATA, opts);
