import type { z } from 'zod';
import { envSchema } from './env.schema';

export type Env = z.infer<typeof envSchema>;
