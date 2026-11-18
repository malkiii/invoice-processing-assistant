import type { H3Event } from 'h3'
import type { SourceKind } from '../domain/source-providers'

/**
 * URL slugs for Source Connection routes. They match the OAuth redirect URIs registered with each
 * provider (`/api/sources/google/callback`, `/api/sources/dropbox/callback`).
 */
export const SOURCE_SLUGS: Record<SourceKind, string> = { 'google-drive': 'google', dropbox: 'dropbox' }

const SLUG_TO_KIND = Object.fromEntries(
  Object.entries(SOURCE_SLUGS).map(([kind, slug]) => [slug, kind as SourceKind]),
) as Record<string, SourceKind | undefined>

/** The Source kind named by the `slug` route param; 404 when unknown or not enabled on this instance. */
export function sourceKindParam(event: H3Event): SourceKind {
  const kind = SLUG_TO_KIND[getRouterParam(event, 'slug') ?? '']
  if (!kind || !useServerConfig().sources[kind]) {
    throw createError({ statusCode: 404, statusMessage: 'This source is not enabled.' })
  }
  return kind
}

/** Cookie carrying the OAuth `state` between the connect redirect and the callback. */
export const SOURCE_STATE_COOKIE = 'source_oauth_state'
