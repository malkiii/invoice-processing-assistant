# 04 — Upload intake (file, folder, drag-and-drop) and object storage

Status: ready-for-agent
Blocked by: 01

## What
Users add Documents from their computer, and each intake action creates a Batch. See spec "Intake" and ADRs 0002 and 0007.

## Scope
- `server/domain/storage` on top of `@aws-sdk/client-s3` (MinIO in Compose): presigned PUT URLs for upload, presigned GET URLs for preview.
- `/app/intake`: a drop zone (files and folders), a file picker, a folder picker (`webkitdirectory`), and per-file progress.
- The server confirms each upload:
  - content sniffing for PDF, DOCX, PNG, JPEG, WEBP and HTML
  - size and page limits from instance settings (default 25 MB / 30 pages)
  - a failed check rejects the file with a clear reason, and the Document is marked `failed`
- Create the Batch and its Documents (`queued`), and enqueue one pg-boss job per Document. The job consumer arrives in issue 05.
- Pages: `/app/batches`, `/app/batches/[id]`, `/app/documents`, `/app/documents/[id]` (file viewer only, for now). Deleting a Document also deletes its file.
- An SSE endpoint for Document status changes, consumed by the Batch page.

## Acceptance
- Dropping a folder of mixed files creates one Batch. Valid files are `queued`; oversized or unsupported files are `failed` with a reason.
- Integration test against real MinIO and Postgres.
