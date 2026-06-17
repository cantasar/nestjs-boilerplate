import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../../shared/database/database.tokens';
import type { DrizzleDB } from '../../shared/database/database.types';
import { mediaAssets } from '../../shared/database/schema/media-asset.schema';
import type { MediaAsset, NewMediaAsset } from '../../shared/database/types';

/**
 * Drizzle reference persistence for media assets. Pure data access — URL
 * signing and storage IO live in the service above it.
 */
@Injectable()
export class MediaAssetRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async create(data: NewMediaAsset): Promise<MediaAsset> {
    const [row] = await this.db.insert(mediaAssets).values(data).returning();
    if (!row) throw new Error('Failed to insert media asset row');
    return row;
  }

  async findById(id: number): Promise<MediaAsset | undefined> {
    const [row] = await this.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id))
      .limit(1);
    return row;
  }

  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<MediaAsset[]> {
    return this.db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.entityType, entityType),
          eq(mediaAssets.entityId, entityId),
        ),
      )
      .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id));
  }

  async update(
    id: number,
    patch: Partial<NewMediaAsset>,
  ): Promise<MediaAsset | undefined> {
    const [row] = await this.db
      .update(mediaAssets)
      .set(patch)
      .where(eq(mediaAssets.id, id))
      .returning();
    return row;
  }
}
