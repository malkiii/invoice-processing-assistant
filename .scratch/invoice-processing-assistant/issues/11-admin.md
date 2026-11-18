# 11 — Admin area

Status: resolved
Blocked by: 01

## What
Instance administration without access to invoice data. See spec "Users and access".

## Scope
- `/admin` (Admin only, enforced on the server):
  - list Users, invite by email link, disable, delete (deletion cascades to all of the User's data and files)
  - sign-up policy
  - Document limits (MB, pages)
  - per-User concurrency
  - system health (database, storage, queue depth)
- Admin APIs must never return Documents, Invoices or Provider Connection data. Add a test that asserts this.

## Acceptance
- A non-admin gets 403 on every admin route. Deleting a User removes their objects from storage.
