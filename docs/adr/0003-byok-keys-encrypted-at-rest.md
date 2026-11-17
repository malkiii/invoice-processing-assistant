# Provider Connection secrets encrypted with an app-level key

Users bring their own LLM API keys. Keys are encrypted at rest (AES-256-GCM) with a single `ENCRYPTION_KEY` env var, decrypted only in the worker or a server route making the LLM call, and never returned to the browser beyond a masked suffix. A KMS was rejected as too heavy for self-hosting; losing `ENCRYPTION_KEY` means every User must re-enter their keys.
