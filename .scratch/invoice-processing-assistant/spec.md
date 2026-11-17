# Invoice Processing Assistant: Spec

Vocabulary follows `GLOSSARY.md`. Decisions with lasting consequences are in `docs/adr/` (0001–0007). This spec captures the agreed design from the grilling session on 2026-11-17.

## Goal

A self-hosted, multi-user web app where each User adds invoice files (Documents) from local upload, URLs, Google Drive or Dropbox, and turns them into structured Invoices using LLM providers they configure themselves. Users review, correct and export the results.

## Users and access

- Self-hosted, multi-user. Every Document, Template, Provider Connection and Source Connection belongs to exactly one User.
- The first User to sign up becomes **Admin**. The Admin sets the sign-up policy (`open` | `invite-only`), and lists, invites, disables and deletes Users. Deleting a User cascades to all of their data and files. The Admin **cannot** see any User's Documents or Invoices.
- Auth uses Better Auth with the Drizzle adapter:
  - email and password with email verification
  - Google and GitHub OAuth (optional, enabled when env credentials are present)
  - TOTP 2FA and session management
- SMTP comes from env. If it is absent, email verification is skipped and a warning is logged at startup.
- Signing in with Google is unrelated to a Google Drive Source Connection. They are separate grants.

## Domain model (summary)

```
User 1─* ProviderConnection
User 1─* SourceConnection
User 1─* Template                (plus one built-in default Template, read-only, cloneable)
User 1─* Batch 1─* Document
Document 1─* Extraction          (exactly one is the Current Extraction)
Extraction ── TemplateSnapshot   (frozen copy of the Template's Fields)
Extraction 1─* Invoice
Invoice: Raw Values (immutable) + Corrected Values (overlay) + Check results + Reviewed flag
```

### Statuses
- **Document**: `queued → processing → extracted | failed` (a failure stores a human-readable reason)
- **Invoice**: unreviewed → `reviewed` (an explicit "Mark as reviewed" action, which can be undone). A badge shows Check status: clean, or the list of failed Checks.

### Re-extraction (ADR 0005)
- The **Re-run** action on a Document opens a dialog with a Provider Connection/model picker and a Template picker, both defaulting to the User's global defaults.
- Re-running creates a new Extraction and makes it the Current Extraction.
- If the Current Extraction has any Corrected Values, warn before re-running: the corrections stay with the old Extraction and do not carry over.
- The Document page lists the Extraction history, and the User can switch which Extraction is current.

## Templates

- Fields have a key, a label, a description (sent to the model as an instruction and shown prominently in the editor), a type and a `required` flag.
- Types: `text`, `number`, `money` (amount + ISO currency), `date`, `boolean`, `enum` (choices), `object` (group), `list` (repeating group). The maximum depth is two levels: Invoice → list item → scalars only.
- The built-in default Template has the canonical invoice Fields:
  - vendor (name, address, tax id)
  - buyer (name, address, tax id)
  - invoice number
  - issue date and due date
  - currency
  - line items (description, quantity, unit price, amount, tax rate)
  - subtotal, tax total, total
  - payment terms
- Users clone the default and edit freely. Templates are not versioned. Each Extraction stores a Template Snapshot (ADR 0006), and Invoices render from their snapshot. If the Template has changed since an Extraction, the page shows a hint.
- At runtime, the Template's Fields are compiled into a Zod schema, which is passed to the AI SDK's `generateObject`. The model is always asked for an **array** of Invoices.

## Providers (ADR 0003)

- Presets: OpenAI, Anthropic, Google Gemini, Mistral, OpenRouter, Ollama, and a generic OpenAI-compatible option (base URL + key).
- Keys are encrypted with AES-256-GCM using the `ENCRYPTION_KEY` env var. They are decrypted only server-side at call time, and only a masked suffix is ever shown.
- Models are fetched from the provider's list endpoint where one exists, otherwise typed in.
- **Model Capability** (native PDF / images / text-only) comes from a built-in table, and the User can override it per model.
- A "Test connection" button is available.
- Each User has one global default Provider Connection + model and one default Template. These are used for all intake.
- A 401 from the provider marks the Provider Connection `broken` and pauses that User's queued Extractions until the Provider Connection is fixed.

## Intake

- v1:
  - file picker, folder picker (`webkitdirectory`) and drag-and-drop (files and folders)
  - a URL textarea, one URL per line
- v1.1: Google Drive (Google Picker, `drive.file` scope) and Dropbox (Chooser), each through a Source Connection.
- Each intake action creates one Batch and always uses the global defaults.
- Browsers upload directly to object storage with presigned PUT URLs. The server then confirms each upload and enqueues it.
- Accepted formats: PDF, DOCX, PNG, JPEG, WEBP, HTML. Type is detected by content sniffing, not by extension.
- **Hard limits (ADR 0007)**: 25 MB and 30 pages per Document by default, configurable per instance. Documents over a limit fail with a clear message. They are never chunked.
- URL import:
  - https only
  - resolved IPs must not be private, loopback or link-local, re-checked on every redirect
  - at most 5 redirects
  - the size limit is enforced while streaming
  - an HTML response becomes an HTML Document; links are never followed

## Extraction pipeline (ADR 0001, 0004)

1. The worker (pg-boss) picks up a Document. At most 3 Extractions run at once per User (configurable).
2. Prepare input based on the model's Model Capability:
   - PDF and images go natively to capable models.
   - DOCX → markdown (mammoth).
   - HTML → readable markdown (readability + turndown).
   - PDF for a non-PDF model → rasterised pages (vision models) or extracted text (text-only models).
3. Call `generateObject` with the compiled schema and Field descriptions in the prompt.
4. Retries:
   - 429 or 5xx: 3 attempts with exponential backoff.
   - Schema mismatch: one repair attempt that feeds the validation error back to the model.
   - 401: no retry (see Providers).
5. Persist the Extraction (model, Provider Connection, Template Snapshot, input/output tokens, duration, estimated cost from an editable per-model price table) and its Invoices with Raw Values.
6. Run Checks and set the Document to `extracted`.
7. Status updates stream to the UI over SSE.

## Checks

Checks are deterministic code with no LLM involved. Each returns pass, fail or not applicable, and a failure never changes values. Checks run over the merged values (Raw + Corrected), so they are re-run after every correction.

- the line item amounts add up to the subtotal (within a rounding tolerance)
- subtotal + tax total equals the total
- dates parse, and the due date is not before the issue date
- the currency is a valid ISO 4217 code
- required Fields are present
- possible duplicate: another Invoice for the same User has the same vendor and invoice number

## Review

- `/app/invoices/[invoiceId]` shows the Document viewer (PDF, image or rendered HTML/DOCX) on the left and the Fields on the right, with a Table | JSON toggle.
- Fields can be edited inline. An edit stores a Corrected Value and is visually marked, with an option to revert it to the Raw Value.
- Failed Checks are shown next to the Fields they concern.
- Actions: "Mark as reviewed", keyboard navigation to the next unreviewed Invoice.

## Export

- Formats: CSV, XLSX, JSON. Values are always Raw overlaid with Corrected. Exports can be filtered to Reviewed Invoices only.
- CSV layout, chosen by the User:
  - (default) one row per line item, with the Invoice header Fields repeated on each row
  - or a zip containing `invoices.csv` and `line_items.csv`, linked by `invoice_id`
- XLSX has two sheets (Invoices, Line items). JSON is nested.
- Scope: a single Invoice, a selection, a Batch, or a filter.
- Past Exports appear in a download history drawer. There is no separate Exports page in v1.

## Retention

- Data is kept until the User deletes it. Deleting a Document cascades to its Extractions, its Invoices and the stored file.
- Optional per-User preference: auto-delete source files after N days, which keeps the extracted Invoices. The Document then shows "file removed".

## Pages

```
/                              Landing (dark-only): hero + 6 cursor effects + sticky switcher
/auth/sign-in | sign-up | forgot-password | reset-password | verify-email
/app                           auth-guarded layout (sidebar + topbar + downloads drawer)
  /                            Dashboard: recent Batches, Invoices needing Review, usage/cost
  /intake                      drop zone, folder, URLs  (+ Drive/Dropbox tabs in v1.1)
  /batches, /batches/[id]      Batch list; Batch detail with live status, bulk export
  /documents, /documents/[id]  Document list; viewer + Extraction history + Re-run
  /invoices, /invoices/[id]    Invoice table (search/filter/bulk export); Review screen
  /templates, /templates/new, /templates/[id]
  /settings/profile | security | providers | sources | preferences
/admin                         Admin only: Users, invites, sign-up policy, limits, health
```

## UI

- shadcn-vue on Tailwind v4.
- **Ledger Noir** is the default theme (dark):
  - colours: bg `#0B0D10`, surface `#14171C`, text `#E8E6E1`, accent `#C6F432`, danger `#FF5C5C`
  - fonts: Geist / Inter Tight for UI text, JetBrains Mono for all numbers and amounts
- **Ledger Day** is the light variant, selectable in Settings: paper `#F7F7F5`, ink `#0B0D10`, accent `#5E7D00`.
- Tokens are CSS variables shared by both themes.

### Landing cursor effects (all six, chosen later)
A sticky nav holds buttons: Lens · Receipt · Stamp · Particles · Ruler · Scanner · Off. The selected effect is stored in `?cursor=<name>` and remembered in localStorage. Every effect is disabled under `prefers-reduced-motion` and on coarse pointers.

1. **Lens**: a loupe over a blurred scanned invoice. Under the lens, the scan turns into highlighted JSON key-value pairs.
2. **Receipt**: a thermal receipt prints out behind the cursor, curls, and tears off when the cursor stops.
3. **Stamp**: each click leaves a rotated "PAID ✓" or "EXTRACTED" ink stamp with bleed texture, which fades over a few seconds.
4. **Particles**: digits, `{ }`, `€` and `$` drift around and snap into a table grid near the cursor.
5. **Ruler**: a ledger-ruled crosshair follows the cursor, and hovered hero text shows a field tooltip (for example `total_amount: 1,240.00`).
6. **Scanner**: a light band follows the cursor's Y position over a document mockup. Lines it passes are digitised and turn the accent colour.

## Architecture

- **Nuxt 4** (TypeScript, pnpm):
  - Nitro routes in `server/api`; Better Auth at `/api/auth/**`
  - Drizzle schema and migrations in `server/db`
  - domain logic in `server/domain`, which must not import Nuxt or Nitro
  - the worker entry `server/worker.ts` is bundled separately and runs pg-boss over `server/domain`
- **PostgreSQL 16** (JSONB for Template Snapshots and values) and **pg-boss** (ADR 0001).
- **S3-compatible storage** via `@aws-sdk/client-s3`: MinIO in Compose, R2 or S3 when hosted (ADR 0002).
- **Docker**:
  - a multi-stage Dockerfile on `node:22-alpine`
  - Compose services: `app`, `worker` (same image), `postgres`, `minio`, `minio-init` (creates the bucket), and `ollama` (profile `ollama`)
  - `docker-compose.dev.yml` for hot reload
  - migrations run when the app starts

## Testing

- **Vitest** unit tests:
  - Template → Zod compilation
  - Checks
  - Export flattening
  - URL safety
  - Model Capability input preparation
- **Integration tests** against real Postgres and MinIO (Testcontainers or Compose).
- **Fixture set**: about 15 sample invoices covering every format. CI runs it with a mocked LLM; `EVAL=1` runs it against a real provider.
- **Playwright smoke test**: sign-up → add Provider Connection → upload → review → export.

## Out of scope

- Organizations and teams. They can be added later via the Better Auth organization plugin.
- Chunking large Documents (rejected, ADR 0007).
- Carrying corrections across Extractions (ADR 0005; matching may be added later as an opt-in).
- Per-Batch model or Template choice at intake. Only Re-run has a picker.
- Crawling links from URL imports.
- A pricing page or billing.
