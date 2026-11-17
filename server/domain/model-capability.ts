import type { ProviderKind } from './provider-presets'

/**
 * Model Capability: what a model accepts as input, which decides how a Document is presented to it.
 * `pdf` implies images too.
 */
export const MODEL_CAPABILITIES = ['pdf', 'images', 'text'] as const
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number]

export function isModelCapability(value: unknown): value is ModelCapability {
  return typeof value === 'string' && (MODEL_CAPABILITIES as readonly string[]).includes(value)
}

type Rule = [pattern: RegExp, capability: ModelCapability]

// First match wins. Patterns are matched against the model id without any vendor prefix.
const OPENAI: Rule[] = [
  [/^gpt-3\.5/, 'text'],
  [/^gpt-4-turbo|^gpt-4-vision/, 'images'],
  [/^(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|o1|o3|o4|chatgpt-4o)/, 'pdf'],
]
const ANTHROPIC: Rule[] = [
  [/^claude-3-(opus|sonnet|haiku)-2024/, 'images'],
  [/^claude-/, 'pdf'],
]
const GOOGLE: Rule[] = [
  [/^gemma/, 'text'],
  [/^gemini-/, 'pdf'],
]
const MISTRAL: Rule[] = [[/pixtral|mistral-(small|medium|large)-(latest|2[5-9])|magistral/, 'images']]
// Local and open-weight models: only well-known vision families accept images.
const OPEN_WEIGHT_VISION: Rule[] = [
  [/llava|bakllava|vision|-vl|vl:|vl$|qwen[\d.]*vl|minicpm-v|moondream|gemma3|granite3\.2-vision|pixtral/, 'images'],
]

const OPENROUTER_VENDORS: Record<string, Rule[]> = {
  openai: OPENAI,
  anthropic: ANTHROPIC,
  google: GOOGLE,
  mistralai: MISTRAL,
}

function match(rules: Rule[], modelId: string): ModelCapability | null {
  return rules.find(([pattern]) => pattern.test(modelId))?.[1] ?? null
}

/** The built-in Model Capability table. Unknown models are treated as text-only, the safe choice. */
export function builtInModelCapability(kind: ProviderKind, modelId: string): ModelCapability {
  const id = modelId.trim().toLowerCase()
  switch (kind) {
    case 'openai':
      return match(OPENAI, id) ?? 'text'
    case 'anthropic':
      return match(ANTHROPIC, id) ?? 'text'
    case 'google':
      return match(GOOGLE, id.replace(/^models\//, '')) ?? 'text'
    case 'mistral':
      return match(MISTRAL, id) ?? 'text'
    case 'openrouter': {
      const [vendor, ...rest] = id.split('/')
      const rules = OPENROUTER_VENDORS[vendor!]
      const bare = rest.join('/')
      return (rules && match(rules, bare)) ?? match(OPEN_WEIGHT_VISION, bare) ?? 'text'
    }
    case 'ollama':
    case 'openai-compatible':
      return match(OPEN_WEIGHT_VISION, id) ?? 'text'
  }
}

/** The User's per-model override wins over the built-in table. */
export function resolveModelCapability(
  kind: ProviderKind,
  modelId: string,
  override: ModelCapability | null | undefined,
): ModelCapability {
  return override ?? builtInModelCapability(kind, modelId)
}
