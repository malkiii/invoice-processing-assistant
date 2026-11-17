# 03 — Provider Connections (bring your own key) and global defaults

Status: ready-for-agent
Blocked by: 01

## What
Users add LLM Provider Connections and choose a global default model and Template. See spec "Providers" and ADR 0003.

## Scope
- `server/domain/crypto`: AES-256-GCM encrypt and decrypt using `ENCRYPTION_KEY`, with unit tests.
- Presets via Vercel AI SDK providers: OpenAI, Anthropic, Gemini, Mistral, OpenRouter, Ollama, and OpenAI-compatible (base URL + key).
- Fetch the model list where the provider supports it, otherwise accept free text. A built-in Model Capability table (native PDF / images / text-only) that the User can override per model.
- "Test connection" makes a tiny call. Only a masked key is displayed; the key is never sent to the browser.
- A `broken` state on a Provider Connection (set later by the worker on a 401), with a banner prompting the User to fix it.
- An editable per-model price table (input and output price per 1M tokens) for cost estimates.
- User preferences: default Provider Connection + model, and default Template (a placeholder until issue 05 seeds the default Template).
- Pages: `/app/settings/providers` and `/app/settings/preferences` (theme, defaults, auto-delete after N days).

## Acceptance
- Add, edit, delete and test each preset type, with HTTP mocked in tests. The database never contains a plaintext key.
