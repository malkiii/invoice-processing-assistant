/** A User-editable price for one model, in their currency per 1M tokens. */
export interface ModelPrice {
  inputPerMillion: number
  outputPerMillion: number
}

export interface TokenUsage {
  inputTokens: number | undefined
  outputTokens: number | undefined
}

/** Estimated cost of one LLM call, or null when the User has not priced the model. */
export function estimateCost(usage: TokenUsage, price: ModelPrice | null): number | null {
  if (!price) return null
  return (
    ((usage.inputTokens ?? 0) * price.inputPerMillion + (usage.outputTokens ?? 0) * price.outputPerMillion) /
    1_000_000
  )
}
