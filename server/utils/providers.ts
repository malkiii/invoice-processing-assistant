import { z } from 'zod'
import { MODEL_CAPABILITIES } from '../domain/model-capability'
import { UserPreferencesInputError } from '../db/user-preferences'
import {
  createProviderConnections,
  ProviderConnectionInputError,
  type ProviderConnections,
} from '../lib/provider-connections'

let providerConnections: ProviderConnections | undefined

export function useProviderConnections(): ProviderConnections {
  return (providerConnections ??= createProviderConnections({
    db: useDb(),
    encryptionKey: useServerConfig().encryptionKey,
  }))
}

/** Runs a handler body, turning input errors from the domain into 400s. */
export async function withInputErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ProviderConnectionInputError || error instanceof UserPreferencesInputError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
}

export function providerNotFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Provider Connection not found' })
}

export const optionalText = z.string().max(2000).nullish()
export const capabilitySchema = z.enum(MODEL_CAPABILITIES)
