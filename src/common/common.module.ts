import { Global, Module } from '@nestjs/common';

/**
 * Global shared module. Physical layout under `common/`:
 * - `config/` – env validation and DB URL helpers
 * - `decorators/` – custom parameter decorators
 * - `filters/` – global exception filters
 * - `guards/` – auth guards
 * - `types/` – shared TypeScript types (add as needed)
 * - `utils/` – helpers (add as needed)
 * - `validators/` – custom class-validator decorators (add as needed)
 */
@Global()
@Module({})
export class CommonModule {}
