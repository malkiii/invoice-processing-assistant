# 10 — URL intake

Status: ready-for-agent
Blocked by: 04

## What
Users add Documents by URL. See spec "Intake".

## Scope
- A URL textarea on `/app/intake`, one URL per line. Each submission creates one Batch.
- The worker fetches each URL server-side:
  - https only
  - resolve DNS and block private, loopback, link-local and cloud-metadata IPs, re-checked on every redirect
  - at most 5 redirects
  - size limit enforced while streaming
  - content sniffing
  - an HTML response is stored as an HTML Document
  - links are never crawled
- Per-URL failure reasons are shown on the Batch page.

## Acceptance
- Unit tests for the SSRF guard: IPv4 and IPv6, DNS rebinding via redirect, decimal and octal IP forms.
