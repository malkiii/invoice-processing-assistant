# 12 — Google Drive and Dropbox Source Connections (v1.1)

Status: resolved
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

## Comments

**Implemented.** Each source is enabled when all of its env values are set (see `.env.example`); a partly configured source is disabled and logged as a startup warning.

- Settings → Sources (`/app/settings/sources`): connect, reconnect and disconnect. OAuth runs through `/api/sources/{google,dropbox}/connect` and `/callback`, with a random `state` in a short-lived HttpOnly cookie. Disconnecting revokes the grant at the provider (best effort) and deletes the tokens.
- Tokens live in `source_connection`, AES-256-GCM encrypted like Provider Connection keys. Access tokens are refreshed shortly before they expire, and once more when the provider rejects one early. A revoked grant marks the connection broken with a "Reconnect" message.
- Intake: an "Add from cloud storage" card has one tab per enabled source (Google Picker with `drive.file`, Dropbox Chooser). Each pick creates one Batch (`source` = `google-drive` / `dropbox`). The worker's `fetch-source-file` queue downloads each file through the Source Connection, then it goes through the same checks, storage and extraction queue as an upload or URL. That shared step now lives in `server/domain/remote-intake.ts`.
- Google Docs, Sheets and Slides cannot be downloaded as files; they fail with a message asking for a PDF.
- Not covered by automated tests: the real Google and Dropbox APIs and the Picker and Chooser in the browser. Check these manually once the apps are registered.
