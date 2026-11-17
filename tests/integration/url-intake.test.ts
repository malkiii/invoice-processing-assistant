import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { user } from '../../server/db/schema'
import { updateInstanceSettings } from '../../server/db/instance-settings'
import { createDocumentLibrary, type DocumentLibrary } from '../../server/domain/document-library'
import type { DocumentLimits } from '../../server/domain/document-inspection'
import { createExtractionQueue, EXTRACT_DOCUMENT_QUEUE } from '../../server/domain/extraction-queue'
import type { UrlFetchResult } from '../../server/domain/url-fetch'
import { createUrlFetchQueue, createUrlIntake, FETCH_URL_QUEUE, type UrlIntake } from '../../server/domain/url-intake'
import { registerUrlFetchWorker } from '../../server/worker/url-fetch'
import { makePdf, text } from '../fixtures/documents/make'
import { startTestDatabase, type TestDatabase } from './support/database'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let boss: PgBoss
let intake: UrlIntake
let library: DocumentLibrary

const alice = 'user-alice'

/** The web, as the fetcher would see it after the SSRF guard: a result per URL. */
const web: Record<string, UrlFetchResult> = {}
const fetchedWith: { url: string; limits: DocumentLimits }[] = []

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values({ id: alice, name: 'Alice', email: 'alice@example.com' })
  boss = new PgBoss(testDb.url)
  await boss.start()
  library = createDocumentLibrary({ db: testDb.db, storage: testStorage.storage })
  intake = createUrlIntake({
    db: testDb.db,
    storage: testStorage.storage,
    extractionQueue: await createExtractionQueue(boss),
    fetchQueue: await createUrlFetchQueue(boss),
    fetchUrl: async (url, limits) => {
      fetchedWith.push({ url, limits })
      return web[url] ?? { ok: false, reason: 'The server responded with HTTP 404.' }
    },
  })
})

afterAll(async () => {
  await boss?.stop({ graceful: false })
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

const serve = (bytes: Uint8Array, finalUrl: string): UrlFetchResult => ({ ok: true, bytes, finalUrl })
const extractJobs = (documentId: string) => boss.findJobs(EXTRACT_DOCUMENT_QUEUE, { data: { documentId } })
const fetchJobs = (documentId: string) => boss.findJobs(FETCH_URL_QUEUE, { data: { documentId } })

describe('starting a URL Batch', () => {
  it('creates one url Batch: fetchable URLs wait for the worker, invalid lines fail at once', async () => {
    const started = await intake.startUrlBatch(alice, [
      'https://example.com/a.pdf',
      '  https://example.com/b.pdf  ',
      '',
      'http://example.com/plain.pdf',
      'https://169.254.169.254/latest/meta-data/',
      'not a url',
    ])

    const found = (await library.getBatch(alice, started.batchId))!
    expect(found.source).toBe('url')
    const outcome = Object.fromEntries(
      found.documents.map((d) => [d.name, d.status === 'failed' ? d.failureReason : d.status]),
    )
    expect(outcome).toEqual({
      'https://example.com/a.pdf': 'fetching',
      'https://example.com/b.pdf': 'fetching',
      'http://example.com/plain.pdf': 'Only https:// URLs can be imported.',
      'https://169.254.169.254/latest/meta-data/': 'The address points to a private or reserved network.',
      'not a url': 'This is not a valid URL.',
    })
    expect(found.documents.every((d) => d.source === 'url')).toBe(true)

    for (const doc of found.documents) {
      expect(await fetchJobs(doc.id)).toHaveLength(doc.status === 'fetching' ? 1 : 0)
    }
  })

  it('refuses an empty submission', async () => {
    await expect(intake.startUrlBatch(alice, ['', '  '])).rejects.toThrow(RangeError)
  })
})

describe('fetching a URL Document (worker)', () => {
  async function startOne(url: string) {
    const started = await intake.startUrlBatch(alice, [url])
    return started.documents[0]!
  }

  it('stores a downloaded PDF, queues the Document and hands it to extraction', async () => {
    const pdf = await makePdf(2)
    web['https://example.com/invoice.pdf'] = serve(pdf, 'https://cdn.example.com/invoice.pdf')
    const doc = await startOne('https://example.com/invoice.pdf')

    const fetched = await intake.fetchDocument(doc.id)

    expect(fetched).toMatchObject({
      id: doc.id,
      status: 'queued',
      format: 'pdf',
      mimeType: 'application/pdf',
      pageCount: 2,
      sizeBytes: pdf.length,
      failureReason: null,
    })
    expect(await testStorage.storage.read(fetched.storageKey!)).toEqual(pdf)
    expect(await extractJobs(doc.id)).toHaveLength(1)
    expect(fetchedWith.at(-1)!.limits).toMatchObject({ maxDocumentBytes: 25 * 1024 * 1024, maxDocumentPages: 30 })
  })

  it('keeps an HTML page as an HTML Document', async () => {
    web['https://example.com/receipt'] = serve(
      text('<!doctype html><html><body><a href="/other">Total 12.00</a></body></html>'),
      'https://example.com/receipt',
    )
    const doc = await startOne('https://example.com/receipt')
    expect(await intake.fetchDocument(doc.id)).toMatchObject({ status: 'queued', format: 'html', mimeType: 'text/html' })
    // Links are never crawled: only the submitted URL was fetched.
    expect(fetchedWith.filter((f) => f.url.includes('/other'))).toEqual([])
  })

  it('fails the Document with the fetch failure reason', async () => {
    web['https://example.com/rebind'] = { ok: false, reason: 'The address points to a private or reserved network.' }
    const doc = await startOne('https://example.com/rebind')
    expect(await intake.fetchDocument(doc.id)).toMatchObject({
      status: 'failed',
      failureReason: 'The address points to a private or reserved network.',
    })
    expect(await extractJobs(doc.id)).toHaveLength(0)
  })

  it('fails content that is not a supported Document, and PDFs over the page limit', async () => {
    await updateInstanceSettings(testDb.db, { maxDocumentPages: 3 })
    try {
      web['https://example.com/notes.txt'] = serve(text('just text'), 'https://example.com/notes.txt')
      web['https://example.com/long.pdf'] = serve(await makePdf(4), 'https://example.com/long.pdf')
      const notes = await startOne('https://example.com/notes.txt')
      const long = await startOne('https://example.com/long.pdf')
      expect(await intake.fetchDocument(notes.id)).toMatchObject({
        status: 'failed',
        failureReason: 'Unsupported file type. Accepted formats: PDF, DOCX, PNG, JPEG, WEBP, HTML.',
      })
      expect(await intake.fetchDocument(long.id)).toMatchObject({
        status: 'failed',
        failureReason: 'Document has 4 pages; the limit is 3 pages.',
      })
    } finally {
      await updateInstanceSettings(testDb.db, { maxDocumentPages: 30 })
    }
  })

  it('does nothing for a Document that is no longer fetching (a retried job)', async () => {
    web['https://example.com/twice.pdf'] = serve(await makePdf(1), 'https://example.com/twice.pdf')
    const doc = await startOne('https://example.com/twice.pdf')
    await intake.fetchDocument(doc.id)
    const calls = fetchedWith.length
    expect(await intake.fetchDocument(doc.id)).toMatchObject({ status: 'queued' })
    expect(fetchedWith).toHaveLength(calls)
    expect(await extractJobs(doc.id)).toHaveLength(1)
  })
})

describe('the worker', () => {
  it('picks up fetch jobs from the queue', async () => {
    web['https://example.com/via-worker.pdf'] = serve(await makePdf(1), 'https://example.com/via-worker.pdf')
    await registerUrlFetchWorker(boss, intake)
    const started = await intake.startUrlBatch(alice, ['https://example.com/via-worker.pdf'])
    const id = started.documents[0]!.id

    await expect
      .poll(async () => (await library.getDocument(alice, id))?.status, { timeout: 30_000, interval: 250 })
      .toBe('queued')
  })
})
