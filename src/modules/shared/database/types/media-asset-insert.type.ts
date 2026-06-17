import { mediaAssets } from '../schema/media-asset.schema';

export type NewMediaAsset = typeof mediaAssets.$inferInsert;
