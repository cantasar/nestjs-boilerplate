export interface PresignUploadParams {
  key: string;
  contentType: string;
  expiresIn?: number;
  cacheControl?: string;
}

export interface PresignReadParams {
  key: string;
  expiresIn?: number;
}

export interface StorageObjectInfo {
  name: string;
  timeCreated: number;
}

/**
 * Provider-agnostic object-storage port. The default reference implementation
 * is GCS, but any backend (S3, Azure Blob, MinIO) can satisfy this contract —
 * consumers inject the `STORAGE_SERVICE` token, never a concrete class.
 */
export interface StorageService {
  presignUpload(params: PresignUploadParams): Promise<string>;
  presignRead(params: PresignReadParams): Promise<string>;
  presignReadMany(
    keys: string[],
    expiresIn?: number,
  ): Promise<Map<string, string>>;
  objectExists(key: string): Promise<boolean>;
  listObjects(prefix: string): Promise<StorageObjectInfo[]>;
  deleteObject(key: string): Promise<void>; // void-ok
  copyObject(srcKey: string, destKey: string): Promise<void>; // void-ok
  downloadObject(key: string): Promise<Buffer>;
  uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
    cacheControl?: string,
  ): Promise<void>; // void-ok
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
