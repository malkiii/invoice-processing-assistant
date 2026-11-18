import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { user } from '../../server/db/schema'
import { createDocumentLibrary, type DocumentLibrary } from '../../server/domain/document-library'
import type { DocumentLimits } from '../../server/domain/document-inspection'
import { createExtractionQueue, EXTRACT_DOCUMENT_QUEUE } from '../../server/domain/extraction-queue'
import {
  createSourceFetchQueue,
  createSourceIntake,
  FETCH_SOURCE_FILE_QUEUE,
  type SourceIntake,
} from '../../server/domain/source-intake'
import type { SourceDownload, SourceKind } from '../../server/domain/source-providers'
import { registerSourceFetchWorker } from '../../server/worker/source-fetch'
import { makePdf, PNG, text } from '../fixtures/documents/make'
import { startTestDatabase, type TestDatabase } from './support/database'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let boss: PgBoss
let intake: SourceIntake
let library: DocumentLibrary

const alice = 'user-alice'

/** Each User's files in each provider, as Source Connections would download them. */
const stores: Record<string, SourceDownload> = {}
const at = (userId: string, kind: SourceKind, fileId: string) => `${userId}/${kind}/${fileId}`
const downloads: { userId: string; kind: SourceKind; fileId: string; limits: DocumentLimits }[] = []

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values({ id: alice, name: 'Alice', email: 'alice@example.com' })
  boss = new PgBoss(testDb.url)
  await boss.start()
  library = createDocumentLibrary({ db: testDb.db, storage: testStorage.storage })
  intake = createSourceIntake({
    db: testDb.db,
    storage: testStorage.storage,
    extractionQueue: await createExtractionQueue(boss),
    fetchQueue: await createSourceFetchQueue(boss),
    download: async (userId, kind, fileId, limits) => {
      downloads.push({ userId, kind, fileId, limits })
      return stores[at(userId, kind, fileId)] ?? { ok: false, reason: 'The file was not found.' }
    },
  })
})

afterAll(async () => {
  await boss?.stop({ graceful: false })
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

const extractJobs = (documentId: string) => boss.findJobs(EXTRACT_DOCUMENT_QUEUE, { data: { documentId } })
const fetchJobs = (documentId: string) => boss.findJobs(FETCH_SOURCE_FILE_QUEUE, { data: { documentId } })

describe('picking files from Google Drive and Dropbox', () => {
  it('creates one Batch per provider and processes each picked file like an upload', async () => {
    const pdf = await makePdf(2)
    for (const kind of ['google-drive', 'dropbox'] as const) {
      stores[at(alice, kind, `${kind}-1`)] = { ok: true, bytes: pdf }
      stores[at(alice, kind, `${kind}-2`)] = { ok: true, bytes: PNG }
      stores[at(alice, kind, `${kind}-3`)] = { ok: true, bytes: text('<!doctype html><p>Total 9.00</p>') }
    }
    const picked = (kind: SourceKind) => [
      { id: `${kind}-1`, name: 'march.pdf' },
      { id: `${kind}-2`, name: 'receipt.png' },
      { id: `${kind}-3`, name: 'mail.html' },
    ]

    const fromDrive = await intake.startSourceBatch(alice, 'google-drive', picked('google-drive'))
    const fromDropbox = await intake.startSourceBatch(alice, 'dropbox', picked('dropbox'))
    expect(fromDrive.batchId).not.toBe(fromDropbox.batchId)

    for (const [kind, started] of [
      ['google-drive', fromDrive],
      ['dropbox', fromDropbox],
    ] as const) {
      expect(started.documents.map((d) => [d.name, d.status])).toEqual([
        ['march.pdf', 'fetching'],
        ['receipt.png', 'fetching'],
        ['mail.html', 'fetching'],
      ])
      for (const doc of started.documents) expect(await fetchJobs(doc.id)).toHaveLength(1)

      for (const doc of started.documents) await intake.fetchDocument(doc.id)

      const batch = (await library.getBatch(alice, started.batchId))!
      expect(batch.source).toBe(kind)
      expect(
        batch.documents.map((d) => ({ name: d.name, source: d.source, status: d.status, format: d.format })),
      ).toEqual(
        expect.arrayContaining([
          { name: 'march.pdf', source: kind, status: 'queued', format: 'pdf' },
          { name: 'receipt.png', source: kind, status: 'queued', format: 'png' },
          { name: 'mail.html', source: kind, status: 'queued', format: 'html' },
        ]),
      )
      for (const doc of batch.documents) expect(await extractJobs(doc.id)).toHaveLength(1)
    }

    const march = (await library.getBatch(alice, fromDrive.batchId))!.documents.find((d) => d.name === 'march.pdf')!
    expect(await testStorage.storage.read(march.storageKey!)).toEqual(pdf)
    expect(downloads.find((d) => d.fileId === 'google-drive-1')).toMatchObject({
      userId: alice,
      kind: 'google-drive',
      limits: { maxDocumentBytes: 25 * 1024 * 1024, maxDocumentPages: 30 },
    })
  })

  it('refuses an empty pick', async () => {
    await expect(intake.startSourceBatch(alice, 'dropbox', [])).rejects.toThrow(RangeError)
  })
})

describe('a picked file that cannot be imported', () => {
  async function pickOne(kind: SourceKind, id: string, name: string) {
    const started = await intake.startSourceBatch(alice, kind, [{ id, name }])
    return intake.fetchDocument(started.documents[0]!.id)
  }

  it('fails with the download failure reason, such as a disconnected source', async () => {
    stores[at(alice, 'dropbox', 'gone')] = {
      ok: false,
      reason: 'Dropbox is not connected. Connect it in Settings → Sources.',
    }
    const doc = (await pickOne('dropbox', 'gone', 'gone.pdf'))!
    expect(doc).toMatchObject({
      status: 'failed',
      failureReason: 'Dropbox is not connected. Connect it in Settings → Sources.',
    })
    expect(await extractJobs(doc.id)).toHaveLength(0)
  })

  it('fails content that is not a supported Document, whatever its name says', async () => {
    stores[at(alice, 'google-drive', 'notes')] = { ok: true, bytes: text('just text') }
    expect(await pickOne('google-drive', 'notes', 'notes.pdf')).toMatchObject({
      status: 'failed',
      failureReason: 'Unsupported file type. Accepted formats: PDF, DOCX, PNG, JPEG, WEBP, HTML.',
    })
  })
})

describe('the worker', () => {
  it('picks up source fetch jobs from the queue', async () => {
    stores[at(alice, 'google-drive', 'via-worker')] = { ok: true, bytes: await makePdf(1) }
    await registerSourceFetchWorker(boss, intake)
    const started = await intake.startSourceBatch(alice, 'google-drive', [{ id: 'via-worker', name: 'w.pdf' }])
    const id = started.documents[0]!.id

    await expect
      .poll(async () => (await library.getDocument(alice, id))?.status, { timeout: 30_000, interval: 250 })
      .toBe('queued')
  })
})
