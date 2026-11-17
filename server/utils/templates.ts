import { TemplateInputError } from '../domain/templates'

/** Runs a Templates handler body, turning the domain's input errors into 400s. */
export async function withTemplateErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof TemplateInputError) throw createError({ statusCode: 400, statusMessage: error.message })
    throw error
  }
}

export function templateNotFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Template not found' })
}
