# 07 — Deterministic Checks

Status: resolved
Blocked by: 05

## What
Rule-based Checks on Invoices, with no LLM involved. See spec "Checks".

## Scope
- `server/domain/checks`: pure functions over the merged values that return pass, fail or not applicable, with a message and the Fields involved. The Checks:
  - line items sum to the subtotal (within a rounding tolerance)
  - subtotal + tax equals the total (within a rounding tolerance)
  - dates are valid, and the due date is not before the issue date
  - the currency is a valid ISO 4217 code
  - required Fields are present
  - possible duplicate: same User, same vendor and invoice number
- Checks run after each Extraction and after every correction.
- Badges in the Invoice table and on the Review screen. Failures appear next to their Fields. The dashboard queue puts failing Invoices first.

## Acceptance
- Unit tests for each Check, including edge cases (missing line items, mixed currencies, rounding).
