/** Named job type within the media-processing queue. */
export const MEDIA_PROCESS_JOB = 'media-process';

/** Payload carried by a media-processing job. */
export interface MediaProcessingJob {
  assetId: number;
}
