import type { StorageConfig } from '../domain/storage'

type Env = Record<string, string | undefined>

const value = (env: Env, name: string) => env[name]?.trim() || undefined

/**
 * Reads the S3-compatible storage settings (ADR 0002). Defaults target the Compose MinIO service
 * as reached from the host, so `pnpm dev` works against `docker compose up minio`.
 */
export function readStorageConfig(env: Env = process.env): StorageConfig {
  const endpoint = value(env, 'S3_ENDPOINT') ?? 'http://localhost:9000'
  return {
    endpoint,
    publicEndpoint: value(env, 'S3_PUBLIC_ENDPOINT') ?? endpoint,
    region: value(env, 'S3_REGION') ?? 'us-east-1',
    bucket: value(env, 'S3_BUCKET') ?? 'documents',
    accessKeyId: value(env, 'S3_ACCESS_KEY_ID') ?? value(env, 'MINIO_ROOT_USER') ?? 'minioadmin',
    secretAccessKey:
      value(env, 'S3_SECRET_ACCESS_KEY') ?? value(env, 'MINIO_ROOT_PASSWORD') ?? 'minioadmin',
    forcePathStyle: (value(env, 'S3_FORCE_PATH_STYLE') ?? 'true') === 'true',
  }
}
