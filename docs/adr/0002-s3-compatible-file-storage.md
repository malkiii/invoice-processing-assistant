# S3-compatible object storage for Documents

Document bytes are stored behind the S3 API, never on local disk: MinIO in Docker Compose, Cloudflare R2 (or any S3-compatible store) in hosted deployments. Local disk was rejected because the app and worker containers must both read files and may scale independently; browsers upload and preview via presigned URLs.
