/**
 * SSRF guard for URL intake: decides which URLs and resolved IP addresses the worker may
 * fetch from. Pure; the fetch itself (url-fetch.ts) applies it to every hop of a redirect chain.
 */
import ipaddr from 'ipaddr.js'

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

export const BLOCKED_ADDRESS = 'The address points to a private or reserved network.'

/** `::a.b.c.d` (IPv4-compatible, deprecated). ipaddr.js reports these as plain unicast. */
const IPV4_COMPATIBLE = ipaddr.parseCIDR('::/96')

/**
 * True only for globally routable unicast addresses. Private, loopback, link-local (which holds
 * cloud metadata at 169.254.169.254), carrier-grade NAT, unique-local, multicast, reserved and
 * IPv4-embedding IPv6 ranges are all refused. Accepts every IPv4 notation `inet_aton` does
 * (decimal, octal, hex, short forms), since that is how a host may read them.
 */
export function isPublicAddress(ip: string): boolean {
  let address: ipaddr.IPv4 | ipaddr.IPv6
  try {
    address = ipaddr.parse(ip)
  } catch {
    return false
  }
  if (address.kind() === 'ipv6') {
    const v6 = address as ipaddr.IPv6
    if (v6.isIPv4MappedAddress()) address = v6.toIPv4Address()
    else if (v6.match(IPV4_COMPATIBLE)) return false
  }
  return address.range() === 'unicast'
}

function isLocalhostName(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, '')
  return name === 'localhost' || name.endsWith('.localhost')
}

/**
 * Checks a URL before any network access: https only, no credentials, and an IP-literal host
 * must be public. Host names still need their resolved addresses checked at connect time.
 */
export function checkUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'This is not a valid URL.' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Only https:// URLs can be imported.' }
  if (url.username || url.password) {
    return { ok: false, reason: 'URLs with a user name or password cannot be imported.' }
  }
  // The URL parser has already normalised decimal/octal/hex IPv4 hosts to dotted quads.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isLocalhostName(host)) return { ok: false, reason: BLOCKED_ADDRESS }
  if (ipaddr.isValid(host) && !isPublicAddress(host)) return { ok: false, reason: BLOCKED_ADDRESS }
  return { ok: true, url }
}

/** The host to resolve, or null when the URL's host is already an IP literal. */
export function hostToResolve(url: URL): string | null {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  return ipaddr.isValid(host) ? null : host
}
