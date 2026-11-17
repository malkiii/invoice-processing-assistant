/**
 * Runs the fixture set (tests/fixtures/invoices) through the extraction pipeline.
 *
 * Default (CI): a mocked LLM. It checks that each Document reached the model in the form its
 * Model Capability calls for (and, for text, that the invoice numbers survived conversion), then
 * answers with the expected Invoices, so persistence is verified end to end.
 *
 * EVAL=1: a real provider, configured with EVAL_PROVIDER (a provider kind, e.g. openai),
 * EVAL_MODEL, EVAL_API_KEY and optionally EVAL_BASE_URL. Each case passes when the model finds the
 * right number of Invoices with the right invoice numbers, currencies and totals.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { batch, document, user } from '../../server/db/schema'
import { updateUserPreferences } from '../../server/db/user-preferences'
import { createDocumentLibrary, type DocumentLibrary } from '../../server/domain/document-library'
import { MIME_TYPES } from '../../server/domain/document-inspection'
import { createExtractionRunner, type ExtractionRunner } from '../../server/domain/extraction/runner'
import { createPdftoppmRasterizer } from '../../server/domain/extraction/rasterize'
import type { ModelCapability } from '../../server/domain/model-capability'
import { isProviderKind } from '../../server/domain/provider-presets'
import { listExtractions, listInvoices } from '../../server/domain/extractions'
import { storageKeyFor } from '../../server/domain/storage-keys'
import { createProviderConnections, type ProviderConnections } from '../../server/lib/provider-connections'
import { CASES, type FixtureCase } from '../fixtures/invoices/cases'
import { PNG } from '../fixtures/documents/make'
import { fakeModel, reply } from '../support/fake-llm'
import { startTestDatabase, type TestDatabase } from './support/database'
import { startTestStorage, type TestStorage } from './support/storage'

const EVAL = process.env.EVAL === '1'
const owner = 'user-fixtures'

let testDb: TestDatabase
let testStorage: TestStorage
let library: DocumentLibrary
let providers: ProviderConnections
let connectionId: string
let runner: ExtractionRunner

function hasPdftoppm(): boolean {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

type PromptPart = { type: string; text?: string; mediaType?: string }

function promptParts(prompt: unknown): PromptPart[] {
  return (prompt as { role: string; content: string | PromptPart[] }[]).flatMap((m) =>
    typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content,
  )
}

/** The mocked model for one case: verifies how the Document was presented, then answers correctly. */
function mockFor(c: FixtureCase, capability: ModelCapability) {
  return fakeModel([
    (options) => {
      const parts = promptParts(options.prompt)
      const files = parts.filter((p) => p.type === 'file').map((p) => p.mediaType)
      const text = parts.map((p) => p.text ?? '').join('\n')
      if (c.format === 'pdf' && capability === 'pdf') expect(files).toEqual(['application/pdf'])
      else if (c.format === 'pdf' && capability === 'images') {
        expect(files.length).toBeGreaterThanOrEqual(1)
        expect(new Set(files)).toEqual(new Set(['image/png']))
      } else if (['png', 'jpeg', 'webp'].includes(c.format)) expect(files).toEqual([MIME_TYPES[c.format]])
      else {
        expect(files).toEqual([])
        for (const inv of c.invoices) {
          expect(text).toContain(inv.invoice_number)
          expect(text).toContain(inv.total.toFixed(2))
          expect(text).toContain(inv.vendor.name)
        }
      }
      return reply({ invoices: c.invoices })
    },
  ])
}

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values({ id: owner, name: 'Fixtures', email: 'fixtures@example.com' })
  library = createDocumentLibrary({ db: testDb.db, storage: testStorage.storage })
  providers = createProviderConnections({ db: testDb.db, encryptionKey: Buffer.alloc(32, 3) })

  if (EVAL) {
    const kind = process.env.EVAL_PROVIDER ?? ''
    const model = process.env.EVAL_MODEL
    if (!isProviderKind(kind) || !model) throw new Error('EVAL=1 needs EVAL_PROVIDER (a provider kind) and EVAL_MODEL')
    const connection = await providers.create(owner, {
      kind,
      name: 'Eval',
      apiKey: process.env.EVAL_API_KEY ?? null,
      baseUrl: process.env.EVAL_BASE_URL ?? null,
      defaultModel: model,
    })
    connectionId = connection.id
  } else {
    connectionId = (await providers.create(owner, { kind: 'openai', name: 'Mock', apiKey: 'sk-mock-0000' })).id
    for (const capability of ['pdf', 'images', 'text'] as const) {
      await providers.saveModelSetting(owner, connectionId, `mock-${capability}`, { capabilityOverride: capability })
    }
  }
  await updateUserPreferences(testDb.db, owner, { defaultConnectionId: connectionId })
})

afterAll(async () => {
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

async function queue(c: FixtureCase): Promise<string> {
  const bytes = new Uint8Array(readFileSync(join(import.meta.dirname, '../fixtures/invoices', c.file)))
  const [b] = await testDb.db.insert(batch).values({ userId: owner, source: 'upload' }).returning()
  const [doc] = await testDb.db
    .insert(document)
    .values({
      userId: owner,
      batchId: b!.id,
      source: 'upload',
      name: c.file,
      status: 'queued',
      format: c.format,
      mimeType: MIME_TYPES[c.format],
      sizeBytes: bytes.length,
    })
    .returning()
  const key = storageKeyFor(owner, doc!.id)
  await testStorage.storage.write(key, bytes, MIME_TYPES[c.format])
  await testDb.db.update(document).set({ storageKey: key }).where(eq(document.id, doc!.id))
  return doc!.id
}

async function extract(c: FixtureCase, capability?: ModelCapability) {
  const run = createExtractionRunner({
    db: testDb.db,
    storage: testStorage.storage,
    providers: EVAL ? providers : { ...providers, languageModel: async () => mockFor(c, capability!) },
    rasterizePdf: hasPdftoppm() ? createPdftoppmRasterizer({ dpi: EVAL ? 150 : 40 }) : async () => [PNG],
  })
  runner = run
  const documentId = await queue(c)
  await runner.process({ documentId, ...(capability && { modelId: `mock-${capability}` }) })
  const doc = await library.getDocument(owner, documentId)
  const [current] = await listExtractions(testDb.db, owner, documentId)
  const invoices = current ? await listInvoices(testDb.db, owner, current.id) : []
  return { doc: doc!, invoices }
}

function capabilitiesFor(c: FixtureCase): ModelCapability[] {
  if (c.format === 'pdf') return ['pdf', 'images', 'text']
  if (c.format === 'docx' || c.format === 'html') return ['pdf', 'text']
  return ['pdf', 'images']
}

describe.skipIf(EVAL)('fixture set, mocked LLM', () => {
  it('covers about 15 invoices across every accepted format', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15)
    expect(new Set(CASES.map((c) => c.format))).toEqual(new Set(['pdf', 'docx', 'png', 'jpeg', 'webp', 'html']))
  })

  const runs = CASES.flatMap((c) => capabilitiesFor(c).map((capability) => ({ c, capability })))
  it.each(runs)('$c.file for a $capability model', async ({ c, capability }) => {
    const { doc, invoices } = await extract(c, capability)
    if (c.scanned && capability === 'text') {
      expect(doc).toMatchObject({ status: 'failed', failureReason: expect.stringMatching(/no text layer/i) })
      return
    }
    expect(doc.failureReason).toBeNull()
    expect(doc.status).toBe('extracted')
    expect(invoices.map((i) => i.rawValues)).toEqual(c.invoices)
  })
})

describe.runIf(EVAL)('fixture set, real provider (EVAL=1)', () => {
  it.each(CASES)('$file', { timeout: 300_000 }, async (c) => {
    const { doc, invoices } = await extract(c)
    expect(doc.failureReason).toBeNull()
    const summary = invoices.map((i) => ({
      invoice_number: i.rawValues.invoice_number,
      currency: i.rawValues.currency,
      total: Math.round(Number(i.rawValues.total) * 100) / 100,
    }))
    expect(summary).toEqual(c.invoices.map((inv) => ({ invoice_number: inv.invoice_number, currency: inv.currency, total: inv.total })))
  })
})
