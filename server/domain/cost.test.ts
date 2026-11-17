import { describe, expect, it } from 'vitest'
import { estimateCost } from './cost'

describe('estimateCost', () => {
  it('prices input and output tokens per million', () => {
    // 200k input at $2.50/M = $0.50; 10k output at $10/M = $0.10
    expect(
      estimateCost({ inputTokens: 200_000, outputTokens: 10_000 }, { inputPerMillion: 2.5, outputPerMillion: 10 }),
    ).toBeCloseTo(0.6)
  })

  it('is unknown without a price', () => {
    expect(estimateCost({ inputTokens: 1, outputTokens: 1 }, null)).toBeNull()
  })

  it('treats missing token counts as zero', () => {
    expect(
      estimateCost({ inputTokens: 1_000_000, outputTokens: undefined }, { inputPerMillion: 3, outputPerMillion: 15 }),
    ).toBeCloseTo(3)
  })
})
