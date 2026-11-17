import { GenericContainer, Wait } from 'testcontainers'
import { createS3Storage, type ObjectStorage, type StorageConfig } from '../../../server/domain/storage'

export interface TestStorage {
  config: StorageConfig
  storage: ObjectStorage
  stop: () => Promise<void>
}

// Same image as docker-compose.yml (upstream MinIO images are no longer published).
const MINIO_IMAGE = 'pgsty/minio:RELEASE.2026-08-04T00-00-00Z'

/** Starts a throwaway MinIO with an empty Documents bucket. */
export async function startTestStorage(): Promise<TestStorage> {
  const container = await new GenericContainer(MINIO_IMAGE)
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: 'minioadmin' })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
    .start()
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`
  const config: StorageConfig = {
    endpoint,
    publicEndpoint: endpoint,
    region: 'us-east-1',
    bucket: 'documents',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    forcePathStyle: true,
  }
  const storage = createS3Storage(config)
  await storage.ensureBucket()
  return { config, storage, stop: async () => void (await container.stop()) }
}
