import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, maskSecret } from './crypto'

const key = Buffer.from('11'.repeat(32), 'hex')
const otherKey = Buffer.from('22'.repeat(32), 'hex')

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const sealed = encryptSecret('sk-live-abc123', key)
    expect(decryptSecret(sealed, key)).toBe('sk-live-abc123')
  })

  it('never contains the plaintext', () => {
    const sealed = encryptSecret('sk-live-abc123', key)
    expect(sealed).not.toContain('sk-live-abc123')
    expect(sealed).not.toContain('abc123')
  })

  it('uses a fresh IV, so the same secret encrypts differently each time', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key))
  })

  it('refuses to decrypt with the wrong key', () => {
    const sealed = encryptSecret('sk-live-abc123', key)
    expect(() => decryptSecret(sealed, otherKey)).toThrow()
  })

  it('detects tampering', () => {
    const sealed = encryptSecret('sk-live-abc123', key)
    const [version, iv, tag, data] = sealed.split(':')
    const flipped = Buffer.from(data!, 'base64')
    flipped[0] = flipped[0]! ^ 0xff
    expect(() => decryptSecret([version, iv, tag, flipped.toString('base64')].join(':'), key)).toThrow()
  })

  it('rejects a key that is not 32 bytes', () => {
    expect(() => encryptSecret('x', Buffer.alloc(16))).toThrow(/32 bytes/)
  })
})

describe('maskSecret', () => {
  it('keeps only the last four characters', () => {
    expect(maskSecret('sk-live-abc123')).toBe('••••c123')
  })

  it('reveals nothing of a short secret', () => {
    expect(maskSecret('abc')).toBe('••••')
  })
})
