/** The LLM providers a User can create a Provider Connection for (spec "Providers"). */
export const PROVIDER_KINDS = [
  'openai',
  'anthropic',
  'google',
  'mistral',
  'openrouter',
  'ollama',
  'openai-compatible',
] as const

export type ProviderKind = (typeof PROVIDER_KINDS)[number]

export interface ProviderPreset {
  kind: ProviderKind
  label: string
  /** Whether an API key is required (Ollama runs without one). */
  requiresApiKey: boolean
  /** Whether the User must supply a base URL. */
  requiresBaseUrl: boolean
  /** Used when the User leaves the base URL empty. */
  defaultBaseUrl: string | null
  /** A model suggested when the User has not picked one yet. */
  suggestedModel: string | null
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  openai: {
    kind: 'openai',
    label: 'OpenAI',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    suggestedModel: 'gpt-4.1-mini',
  },
  anthropic: {
    kind: 'anthropic',
    label: 'Anthropic',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    suggestedModel: 'claude-sonnet-4-5',
  },
  google: {
    kind: 'google',
    label: 'Google Gemini',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    suggestedModel: 'gemini-2.5-flash',
  },
  mistral: {
    kind: 'mistral',
    label: 'Mistral',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    suggestedModel: 'mistral-medium-latest',
  },
  openrouter: {
    kind: 'openrouter',
    label: 'OpenRouter',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    suggestedModel: 'google/gemini-2.5-flash',
  },
  ollama: {
    kind: 'ollama',
    label: 'Ollama',
    requiresApiKey: false,
    requiresBaseUrl: false,
    defaultBaseUrl: 'http://localhost:11434',
    suggestedModel: null,
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI-compatible',
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: null,
    suggestedModel: null,
  },
}

export function isProviderKind(value: unknown): value is ProviderKind {
  return typeof value === 'string' && (PROVIDER_KINDS as readonly string[]).includes(value)
}
