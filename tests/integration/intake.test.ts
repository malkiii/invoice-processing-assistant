import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { updateInstanceSettings } from '../../server/db/instance-settings'
import { user } from '../../server/db/schema'
import { createExtractionQueue, EXTRACT_DOCUMENT_QUEUE } from '../../server/domain/extraction-queue'
import { createDocumentLibrary, type DocumentLibrary } from '../../server/domain/document-library'
import { createIntake, DocumentNotFoundError, type Intake, type StartedDocument } from '../../server/domain/intake'
import { PNG, makePdf, text } from '../fixtures/documents/make'
import { startTestDatabase, type TestDatabase } from './support/database'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let boss: PgBoss
let intake: Intake
let library: DocumentLibrary

const alice = 'user-alice'
const bob = 'user-bob'

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values([
    { id: alice, name: 'Alice', email: 'alice@example.com' },
    { id: bob, name: 'Bob', email: 'bob@example.com' },
  ])
  boss = new PgBoss(testDb.url)
  await boss.start()
  library = createDocumentLibrary({ db: testDb.db, storage: testStorage.storage })
  intake = createIntake({
    db: testDb.db,
    storage: testStorage.storage,
    queue: await createExtractionQueue(boss),
  })
})

afterAll(async () => {
  await boss?.stop({ graceful: false })
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

/** What the browser does with a presigned upload. */
async function upload(doc: StartedDocument, bytes: Uint8Array) {
  if (!doc.upload) throw new Error(`${doc.name} has no upload URL`)
  const response = await fetch(doc.upload.url, {
    method: doc.upload.method,
    headers: doc.upload.headers,
    body: bytes,
  })
  expect(response.ok, await response.text()).toBe(true)
}

async function jobsFor(documentId: string) {
  return boss.findJobs(EXTRACT_DOCUMENT_QUEUE, { data: { documentId } })
}

describe('upload intake', () => {
  it('queues a valid PDF and enqueues one extraction job for it', async () => {
    const bytes = await makePdf(2)
    const started = await intake.startUploadBatch(alice, [{ name: 'invoice.pdf', size: bytes.length }])
    const [doc] = started.documents
    expect(doc).toMatchObject({ name: 'invoice.pdf', status: 'uploading' })

    await upload(doc!, bytes)
    const confirmed = await intake.confirmUpload(alice, doc!.id)

    expect(confirmed).toMatchObject({
      id: doc!.id,
      batchId: started.batchId,
      status: 'queued',
      format: 'pdf',
      pageCount: 2,
      sizeBytes: bytes.length,
      failureReason: null,
    })
    expect(await jobsFor(doc!.id)).toHaveLength(1)
  })

  it('turns a dropped folder of mixed files into one Batch: valid files queued, the rest failed with a reason', async () => {
    await updateInstanceSettings(testDb.db, { maxDocumentBytes: 64 * 1024, maxDocumentPages: 5 })
    try {
      const files: Record<string, Uint8Array> = {
        'march/invoice-1.pdf': await makePdf(1),
        'march/scan.png': PNG,
        'march/receipt.html': text('<!doctype html><html><body>Total 12.00</body></html>'),
        'march/notes.txt': text('remember to pay'),
        'march/renamed.pdf': PNG, // the extension lies; content decides
        'march/long.pdf': await makePdf(6),
        'march/huge-declared.pdf': new Uint8Array(100 * 1024),
        'march/huge-actual.pdf': new Uint8Array(100 * 1024),
      }
      const declared = Object.entries(files).map(([name, bytes]) => ({
        name,
        size: name === 'march/huge-actual.pdf' ? 1000 : bytes.length, // browser under-reports
      }))

      const started = await intake.startUploadBatch(alice, declared)
      expect(new Set(started.documents.map((d) => d.name))).toEqual(new Set(Object.keys(files)))

      for (const doc of started.documents) {
        if (doc.upload) await upload(doc, files[doc.name]!)
        await intake.confirmUpload(alice, doc.id)
      }

      const batchDocuments = (await library.getBatch(alice, started.batchId))!.documents
      const outcome = Object.fromEntries(
        batchDocuments.map((d) => [d.name, d.status === 'failed' ? d.failureReason : d.status]),
      )
      expect(outcome).toEqual({
        'march/invoice-1.pdf': 'queued',
        'march/scan.png': 'queued',
        'march/receipt.html': 'queued',
        'march/notes.txt': 'Unsupported file type. Accepted formats: PDF, DOCX, PNG, JPEG, WEBP, HTML.',
        'march/renamed.pdf': 'queued',
        'march/long.pdf': 'Document has 6 pages; the limit is 5 pages.',
        'march/huge-declared.pdf': 'File is 100 KB; the limit is 64 KB.',
        'march/huge-actual.pdf': 'File is 100 KB; the limit is 64 KB.',
      })
      expect(started.documents.find((d) => d.name === 'march/huge-declared.pdf')?.upload).toBeUndefined()

      for (const doc of batchDocuments) {
        expect(await jobsFor(doc.id), doc.name).toHaveLength(doc.status === 'queued' ? 1 : 0)
      }
    } finally {
      await updateInstanceSettings(testDb.db, { maxDocumentBytes: 25 * 1024 * 1024, maxDocumentPages: 30 })
    }
  })
})

describe('confirming uploads', () => {
  it('fails a Document whose upload never arrived', async () => {
    const started = await intake.startUploadBatch(alice, [{ name: 'lost.pdf', size: 1000 }])
    const confirmed = await intake.confirmUpload(alice, started.documents[0]!.id)
    expect(confirmed).toMatchObject({ status: 'failed', failureReason: 'The upload did not complete.' })
  })

  it('enqueues a Document only once when it is confirmed twice', async () => {
    const bytes = await makePdf(1)
    const { documents: [doc] } = await intake.startUploadBatch(alice, [{ name: 'twice.pdf', size: bytes.length }])
    await upload(doc!, bytes)
    const [first, second] = await Promise.all([
      intake.confirmUpload(alice, doc!.id),
      intake.confirmUpload(alice, doc!.id),
    ])
    expect([first.status, second.status]).toEqual(['queued', 'queued'])
    expect(await jobsFor(doc!.id)).toHaveLength(1)
  })

  it("does not let one User confirm or see another User's Document", async () => {
    const { batchId, documents: [doc] } = await intake.startUploadBatch(alice, [{ name: 'private.pdf', size: 10 }])
    await expect(intake.confirmUpload(bob, doc!.id)).rejects.toThrow(DocumentNotFoundError)
    expect(await library.getBatch(bob, batchId)).toBeNull()
    expect(await library.getDocument(bob, doc!.id)).toBeNull()
    expect(await library.deleteDocument(bob, doc!.id)).toBe(false)
    expect(await library.getDocument(alice, doc!.id)).not.toBeNull()
  })
})

describe('viewing and deleting Documents', () => {
  it('serves the file inline with its sniffed type, and deleting the Document deletes the file', async () => {
    const { documents: [doc] } = await intake.startUploadBatch(alice, [{ name: 'photo.pdf', size: PNG.length }])
    await upload(doc!, PNG)
    await intake.confirmUpload(alice, doc!.id)

    const url = await library.fileUrl(alice, doc!.id)
    const response = await fetch(url!)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)

    expect(await library.deleteDocument(alice, doc!.id)).toBe(true)
    expect(await library.getDocument(alice, doc!.id)).toBeNull()
    expect((await fetch(url!)).status).toBe(404)
  })
})
