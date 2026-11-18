/**
 * The extraction pipeline (spec "Extraction pipeline", ADR 0001/0004/0006): takes one queued
 * Document, presents it to the User's model, and persists an Extraction with its Invoices.
 * Queue-agnostic: the worker maps the returned outcome onto pg-boss.
 */
import { and, count, eq, gt, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { getInstanceSettings } from '../../db/instance-settings'
import { document, extraction, invoice } from '../../db/schema'
import { getUserPreferences } from '../../db/user-preferences'
import type { ProviderConnections } from '../../lib/provider-connections'
import { estimateCost } from '../cost'
import type { ObjectStorage } from '../storage'
import { compileTemplate, TemplateFieldError } from '../template/compile'
import { snapshotTemplate } from '../template/snapshot'
import { resolveTemplate } from '../templates'
import { ExtractionCallError, generateInvoices, ProviderUnauthorizedError } from './generate'
import { InputPreparationError, prepareInput, type PdfRasterizer } from './input'

/**
 * One extraction job. Only `documentId` is required; intake relies on the User's global
 * defaults. Re-run (issue 06) passes an explicit Provider Connection, model and Template.
 */
export interface ExtractionJob {
  documentId: string
  connectionId?: string
  modelId?: string
  templateId?: string
}

export type JobOutcome =
  | { kind: 'done' }
  /** Not run now; enqueue the same job again after `seconds`. The Document stays `queued`. */
  | { kind: 'deferred'; reason: 'busy' | 'paused'; seconds: number }

/**
 * Runs Checks over a freshly persisted Extraction (issue 07). Called after the Invoices are
 * saved and before the Document is marked `extracted`. A throw is logged, never fails the Document.
 */
export interface ChecksRunner {
  run(input: { userId: string; documentId: string; extractionId: string }): Promise<void>
}

export const noChecks: ChecksRunner = { run: async () => {} }

export type ExtractionProviders = Pick<ProviderConnections, 'get' | 'languageModel' | 'modelSetting' | 'markBroken'>

export interface ExtractionRunnerDeps {
  db: Database
  storage: ObjectStorage
  providers: ExtractionProviders
  rasterizePdf: PdfRasterizer
  checks?: ChecksRunner
  sleep?: (ms: number) => Promise<void>
  log?: Pick<Console, 'error' | 'warn'>
}

export interface ExtractionRunner {
  process(job: ExtractionJob): Promise<JobOutcome>
}

/** Seconds before a job waiting for a free per-User slot is tried again. */
export const BUSY_RETRY_SECONDS = 5
/** Seconds between checks of a paused (broken Provider Connection) queue. */
export const PAUSED_RETRY_SECONDS = 60
/** A `processing` Document not touched for this long is presumed abandoned by a crashed worker. */
export const STALE_PROCESSING_MS = 60 * 60_000

class DocumentFailure extends Error {}

export function createExtractionRunner(deps: ExtractionRunnerDeps): ExtractionRunner {
  const { db, storage, providers, rasterizePdf } = deps
  const checks = deps.checks ?? noChecks
  const log = deps.log ?? console

  async function fail(documentId: string, reason: string) {
    await db
      .update(document)
      .set({ status: 'failed', failureReason: reason.slice(0, 1000) })
      .where(eq(document.id, documentId))
  }

  /**
   * Atomically moves the Document to `processing` if the User has a free slot. Serialised per User
   * with an advisory lock so concurrent workers cannot both take the last slot.
   */
  async function claim(documentId: string, userId: string): Promise<'claimed' | 'busy' | 'gone'> {
    const { maxConcurrentDocumentsPerUser } = await getInstanceSettings(db)
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`extraction:${userId}`}))`)
      const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS)
      const [running] = await tx
        .select({ n: count() })
        .from(document)
        .where(
          and(eq(document.userId, userId), eq(document.status, 'processing'), gt(document.updatedAt, staleBefore)),
        )
      if ((running?.n ?? 0) >= maxConcurrentDocumentsPerUser) return 'busy'
      const claimed = await tx
        .update(document)
        .set({ status: 'processing', failureReason: null })
        .where(
          and(
            eq(document.id, documentId),
            or(
              eq(document.status, 'queued'),
              and(eq(document.status, 'processing'), lte(document.updatedAt, staleBefore)),
            ),
          ),
        )
        .returning({ id: document.id })
      return claimed.length > 0 ? 'claimed' : 'gone'
    })
  }

  async function process(job: ExtractionJob): Promise<JobOutcome> {
    const [doc] = await db.select().from(document).where(eq(document.id, job.documentId))
    if (!doc || (doc.status !== 'queued' && doc.status !== 'processing')) return { kind: 'done' }
    const userId = doc.userId

    // Resolve what to run with: the job's explicit choice, else the User's global defaults.
    const prefs = await getUserPreferences(db, userId)
    const connectionId = job.connectionId ?? prefs.defaultConnectionId
    const connection = connectionId ? await providers.get(userId, connectionId) : null
    if (!connection) {
      await fail(doc.id, 'No Provider Connection to extract with. Add one in Settings → Providers, make it your default, then re-run.')
      return { kind: 'done' }
    }
    // A broken Provider Connection pauses this User's queue until it is fixed (spec "Providers").
    if (connection.status === 'broken') return { kind: 'deferred', reason: 'paused', seconds: PAUSED_RETRY_SECONDS }

    const claimed = await claim(doc.id, userId)
    if (claimed === 'busy') return { kind: 'deferred', reason: 'busy', seconds: BUSY_RETRY_SECONDS }
    if (claimed === 'gone') return { kind: 'done' }

    try {
      const modelId =
        job.modelId ??
        (prefs.defaultConnectionId === connection.id ? prefs.defaultModel : null) ??
        connection.defaultModel
      if (!modelId) throw new DocumentFailure(`Choose a model for the Provider Connection “${connection.name}”.`)

      const template = await resolveTemplate(db, userId, job.templateId ?? prefs.defaultTemplateId)
      if (!template) throw new DocumentFailure('The Template for this Extraction no longer exists.')
      const schema = compileTemplate(template.fields)

      if (!doc.storageKey || !doc.format) throw new DocumentFailure('The Document’s file has been removed.')
      const setting = await providers.modelSetting(userId, connection.id, modelId)
      const capability = setting?.capability ?? 'text'
      const bytes = await storage.read(doc.storageKey)
      const content = await prepareInput({ bytes, format: doc.format }, capability, { rasterizePdf })

      const model = await providers.languageModel(userId, connection.id, modelId)
      if (!model) throw new DocumentFailure('The Provider Connection no longer exists.')

      const started = Date.now()
      const generated = await generateInvoices({ model, schema, fields: template.fields, content, sleep: deps.sleep, log })
      const durationMs = Date.now() - started

      const extractionId = await db.transaction(async (tx) => {
        await tx
          .update(extraction)
          .set({ isCurrent: false })
          .where(and(eq(extraction.documentId, doc.id), eq(extraction.isCurrent, true)))
        const [created] = await tx
          .insert(extraction)
          .values({
            documentId: doc.id,
            userId,
            isCurrent: true,
            connectionId: connection.id,
            providerKind: connection.kind,
            modelId,
            templateId: template.id,
            templateSnapshot: snapshotTemplate(template),
            inputTokens: generated.usage.inputTokens,
            outputTokens: generated.usage.outputTokens,
            durationMs,
            estimatedCost: estimateCost(generated.usage, setting?.price ?? null),
          })
          .returning({ id: extraction.id })
        if (generated.invoices.length > 0) {
          await tx.insert(invoice).values(
            generated.invoices.map((rawValues, position) => ({
              extractionId: created!.id,
              documentId: doc.id,
              userId,
              position,
              rawValues,
            })),
          )
        }
        return created!.id
      })

      try {
        await checks.run({ userId, documentId: doc.id, extractionId })
      } catch (error) {
        log.error('[extraction] Checks failed', error)
      }

      await db.update(document).set({ status: 'extracted', failureReason: null }).where(eq(document.id, doc.id))
      return { kind: 'done' }
    } catch (error) {
      if (error instanceof ProviderUnauthorizedError) {
        await providers.markBroken(connection.id, error.message)
        // Back to the queue: it runs once the User fixes the key.
        await db.update(document).set({ status: 'queued' }).where(eq(document.id, doc.id))
        return { kind: 'deferred', reason: 'paused', seconds: PAUSED_RETRY_SECONDS }
      }
      if (
        error instanceof DocumentFailure ||
        error instanceof InputPreparationError ||
        error instanceof ExtractionCallError ||
        error instanceof TemplateFieldError
      ) {
        await fail(doc.id, error.message)
      } else {
        log.error('[extraction] unexpected failure', error)
        await fail(doc.id, 'The extraction failed unexpectedly. Try re-running it.')
      }
      return { kind: 'done' }
    }
  }

  return { process }
}
