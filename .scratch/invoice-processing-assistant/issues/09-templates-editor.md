# 09 — Templates editor

Status: resolved
Blocked by: 05

## What
Users clone the default Template and build their own. See spec "Templates" and ADR 0006.

## Scope
- Pages: `/app/templates`, `/app/templates/new`, `/app/templates/[id]`.
- Field builder: key, label, description (shown prominently), type (`text`, `number`, `money`, `date`, `boolean`, `enum`, `object`, `list`) and required flag. Fields reorder by dragging. The depth limit of 2 is enforced in both the UI and the server.
- A live JSON preview of the resulting schema. Users can clone the default Template; the default itself is read-only.
- Editing a Template never affects existing Extractions, which hold Template Snapshots.
- A Template can be set as the default from this page.

## Acceptance
- A custom Template used through Re-run produces Invoices with its Fields.
- Old Invoices still render from their snapshot after Fields are renamed or removed.
