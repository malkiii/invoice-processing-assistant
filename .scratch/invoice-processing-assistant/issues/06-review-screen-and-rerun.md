# 06 — Review screen, Corrected Values, Reviewed state, Re-run

Status: ready-for-agent
Blocked by: 05

## What
Users check and fix Invoices. See spec "Review" and "Re-extraction", and ADR 0005.

## Scope
- `/app/invoices`: a table with search and filters (Reviewed, Check status, vendor, date). `/app/invoices/[id]`: the Review screen.
- Split view:
  - left: the Document viewer (PDF, image, rendered HTML/DOCX)
  - right: the Fields, with a Table | JSON toggle
  - Fields render from the Extraction's Template Snapshot, with a "Template changed" hint when relevant
- Inline edits store Corrected Values; Raw Values are never mutated. Edited Fields are marked and can be reverted to the Raw Value.
- "Mark as reviewed" (undoable), and a keyboard shortcut for "next unreviewed".
- The Re-run dialog on a Document:
  - Provider Connection/model and Template pickers, defaulting to the global defaults
  - a warning when the Current Extraction has Corrected Values
  - the Current Extraction can be switched from the Extraction history
- Dashboard: "Needs review" queue, recent Batches, usage and cost totals.

## Acceptance
- Correcting a Field changes the displayed and exported value while the Raw Value is preserved.
- A re-run creates a new Current Extraction. The old corrections are visible only in the history.
