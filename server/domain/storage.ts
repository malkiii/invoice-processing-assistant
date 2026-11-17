import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface StorageConfig {
  /** Endpoint the app and worker use. */
  endpoint: string
  /** Endpoint baked into presigned URLs, i.e. the one browsers can reach. */
  publicEndpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

/** A presigned upload: the browser PUTs the file to `url` with exactly these `headers`. */
export interface PresignedUpload {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: Date
}

/** Document bytes behind the S3 API (ADR 0002). Keys are opaque; callers choose them. */
export interface ObjectStorage {
  presignUpload(key: string): Promise<PresignedUpload>
  /** A short-lived URL a browser can open to view the file inline, or save it with `attachment`. */
  presignDownload(
    key: string,
    options: { contentType: string; fileName: string; disposition?: 'inline' | 'attachment' },
  ): Promise<string>
  /** The stored size in bytes, or null when no object exists at `key`. */
  size(key: string): Promise<number | null>
  read(key: string): Promise<Uint8Array>
  write(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** Deletes the object; deleting a missing object is not an error. */
  delete(key: string): Promise<void>
  /** Deletes every object whose key starts with `prefix`. Idempotent. */
  deletePrefix(prefix: string): Promise<void>
  /** Resolves when the bucket is reachable with these credentials; rejects otherwise. */
  check(): Promise<void>
  /** Creates the bucket if it does not exist yet. */
  ensureBucket(): Promise<void>
}

const UPLOAD_CONTENT_TYPE = 'application/octet-stream'
const UPLOAD_TTL_SECONDS = 15 * 60
const DOWNLOAD_TTL_SECONDS = 5 * 60

function client(config: StorageConfig, endpoint: string) {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Default CRC32 checksums break browser PUTs to presigned URLs and some S3-compatible stores.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFound ||
    (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
  )
}

/** RFC 6266 disposition that survives non-ASCII file names. */
function contentDisposition(fileName: string, type: 'inline' | 'attachment' = 'inline'): string {
  const base = fileName.split('/').pop() || 'document'
  const ascii = base.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`
}

export function createS3Storage(config: StorageConfig): ObjectStorage {
  const s3 = client(config, config.endpoint)
  const signer = config.publicEndpoint === config.endpoint ? s3 : client(config, config.publicEndpoint)
  const Bucket = config.bucket

  return {
    async presignUpload(key) {
      // The browser's Content-Type is not trusted: the format is sniffed after upload.
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: UPLOAD_CONTENT_TYPE })
      const url = await getSignedUrl(signer, command, { expiresIn: UPLOAD_TTL_SECONDS })
      return {
        url,
        method: 'PUT',
        headers: { 'Content-Type': UPLOAD_CONTENT_TYPE },
        expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000),
      }
    },

    presignDownload(key, { contentType, fileName, disposition }) {
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: contentDisposition(fileName, disposition),
      })
      return getSignedUrl(signer, command, { expiresIn: DOWNLOAD_TTL_SECONDS })
    },

    async size(key) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }))
        return head.ContentLength ?? 0
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    async read(key) {
      const object = await s3.send(new GetObjectCommand({ Bucket, Key: key }))
      if (!object.Body) return new Uint8Array()
      return object.Body.transformToByteArray()
    },

    async write(key, bytes, contentType) {
      await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }))
    },

    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },

    async deletePrefix(prefix) {
      if (!prefix) throw new RangeError('Refusing to delete with an empty prefix.')
      let ContinuationToken: string | undefined
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }))
        const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
        if (keys.length > 0) {
          const result = await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }))
          if (result.Errors?.length) {
            throw new Error(`Could not delete ${result.Errors.length} object(s) under ${prefix}: ${result.Errors[0]!.Message}`)
          }
        }
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (ContinuationToken)
    },

    async check() {
      await s3.send(new HeadBucketCommand({ Bucket }))
    },

    async ensureBucket() {
      try {
        await s3.send(new HeadBucketCommand({ Bucket }))
      } catch (error) {
        if (!isNotFound(error)) throw error
        await s3.send(new CreateBucketCommand({ Bucket }))
      }
    },
  }
}
