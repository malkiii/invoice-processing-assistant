# 12 — Google Drive and Dropbox Source Connections (v1.1)

Status: ready-for-human
Blocked by: 04

## What
Pull Documents from Google Drive and Dropbox. See spec "Intake".

## Why human
This needs a Google Cloud project (OAuth consent screen, Picker API key, `drive.file` scope) and a Dropbox app, both registered by the owner, with their credentials added to env. Once those exist, the code can be handed to an agent.

## Scope
- Source Connections on `/app/settings/sources`, separate from Better Auth login accounts. Tokens are encrypted the same way as Provider Connection keys. Includes token refresh and disconnect.
- A Drive tab on `/app/intake` using the Google Picker (`drive.file`), and a Dropbox tab using the Chooser.
- The worker downloads the selected files into storage. They become a Batch and go through the same validation as uploads.

## Acceptance
- Picking 3 files from each provider creates one Batch per provider, processed normally.
