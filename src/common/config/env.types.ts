import type { z } from 'zod';
import { envSchema } from './env.schema';

/** Validated environment shape after `validateEnv`. */
export type Env = z.infer<typeof envSchema>;
