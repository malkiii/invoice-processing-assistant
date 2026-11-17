import { describe, expect, it } from 'vitest'
import { builtInModelCapability, resolveModelCapability } from './model-capability'

describe('builtInModelCapability', () => {
  it.each([
    ['anthropic', 'claude-sonnet-4-5', 'pdf'],
    ['anthropic', 'claude-3-haiku-20240307', 'images'],
    ['google', 'gemini-2.5-flash', 'pdf'],
    ['openai', 'gpt-4o-mini', 'pdf'],
    ['openai', 'gpt-5', 'pdf'],
    ['openai', 'gpt-3.5-turbo', 'text'],
    ['mistral', 'pixtral-large-latest', 'images'],
    ['mistral', 'open-mistral-nemo', 'text'],
    ['openrouter', 'anthropic/claude-sonnet-4.5', 'pdf'],
    ['openrouter', 'meta-llama/llama-3.1-8b-instruct', 'text'],
    ['ollama', 'llava:13b', 'images'],
    ['ollama', 'qwen2.5vl:7b', 'images'],
    ['ollama', 'llama3.1:8b', 'text'],
    ['openai-compatible', 'my-local-model', 'text'],
  ] as const)('%s %s → %s', (kind, model, expected) => {
    expect(builtInModelCapability(kind, model)).toBe(expected)
  })
})

describe('resolveModelCapability', () => {
  it('uses the built-in table when the User has no override', () => {
    expect(resolveModelCapability('ollama', 'llama3.1:8b', null)).toBe('text')
  })

  it("lets the User's override win", () => {
    expect(resolveModelCapability('ollama', 'llama3.1:8b', 'images')).toBe('images')
  })
})
