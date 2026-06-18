import { mediaAssets } from '../schema/media-asset.schema';

export type MediaAsset = typeof mediaAssets.$inferSelect;
