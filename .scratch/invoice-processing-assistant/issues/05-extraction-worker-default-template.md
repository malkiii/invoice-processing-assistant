# 05 — Extraction worker with the default Template

Status: ready-for-agent
Blocked by: 03, 04

## What
The core pipeline: the worker turns a queued Document into an Extraction with Invoices. See spec "Extraction pipeline" and "Templates", and ADRs 0001, 0004 and 0006.

## Scope
- The Template Field model, plus a seed for the built-in default Template (the canonical invoice Fields, with strong descriptions).
- `server/domain/template`: compile a Field tree into a Zod schema (an array of Invoices), with a maximum depth of 2. Unit tests.
- Input preparation based on Model Capability:
  - native PDF and images for capable models
  - DOCX → markdown (mammoth)
  - HTML → markdown (readability + turndown)
  - PDF → page images or text for models that can't take PDFs
- The `generateObject` call, with retries:
  - 429 or 5xx: 3 attempts with backoff
  - schema mismatch: one repair retry
  - 401: mark the Provider Connection `broken` and pause the User's queue
- A per-User concurrency limit (default 3).
- Persist the Extraction (model, Provider Connection, Template Snapshot, tokens, duration, estimated cost) and its Invoices with Raw Values. Set the Current Extraction, and mark the Document `extracted` or `failed`.
- Live status via SSE (from issue 04). The Document page shows the Extraction history.
- A fixture set of about 15 invoices across all formats. CI runs it against a mocked LLM; `EVAL=1` runs it against a real provider.

## Acceptance
- Uploading a fixture PDF produces Invoices with Raw Values. A fixture with several invoices yields that many Invoices.
- A simulated 401 pauses the queue and flags the Provider Connection.
