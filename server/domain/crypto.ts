/**
 * Encryption at rest for Provider Connection secrets (ADR 0003).
 * AES-256-GCM with a random 12-byte IV; the sealed form is `v1:<iv>:<tag>:<ciphertext>` (base64 parts).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function assertKey(key: Buffer) {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes')
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  assertKey(key)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':')
}

/** Throws if the key is wrong or the sealed value was tampered with. */
export function decryptSecret(sealed: string, key: Buffer): string {
  assertKey(key)
  const [version, iv, tag, data] = sealed.split(':')
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error('Unrecognised encrypted secret format')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

/** The only form of a secret ever shown to a User: its last four characters. */
export function maskSecret(secret: string): string {
  return secret.length > 8 ? `••••${secret.slice(-4)}` : '••••'
}
