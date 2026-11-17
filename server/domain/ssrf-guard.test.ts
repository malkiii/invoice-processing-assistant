import { describe, expect, it } from 'vitest'
import { checkUrl, isPublicAddress } from './ssrf-guard'

describe('isPublicAddress', () => {
  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '1.1.1.1',
    '2606:4700:4700::1111',
    '2a00:1450:4001:82a::200e',
  ])('allows the public address %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true)
  })

  it.each([
    ['127.0.0.1', 'IPv4 loopback'],
    ['127.255.0.9', 'IPv4 loopback range'],
    ['10.1.2.3', 'RFC 1918'],
    ['172.16.0.1', 'RFC 1918'],
    ['172.31.255.255', 'RFC 1918'],
    ['192.168.1.1', 'RFC 1918'],
    ['169.254.169.254', 'cloud metadata (link-local)'],
    ['100.100.100.200', 'cloud metadata (carrier-grade NAT)'],
    ['0.0.0.0', 'unspecified'],
    ['255.255.255.255', 'broadcast'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique local'],
    ['fd00:ec2::254', 'cloud metadata over IPv6 (unique local)'],
    ['ff02::1', 'IPv6 multicast'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback, hex form'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['::127.0.0.1', 'IPv4-compatible loopback'],
    ['64:ff9b::a00:1', 'NAT64 embedding a private IPv4'],
    ['2002:7f00:1::', '6to4 embedding loopback'],
  ])('blocks %s (%s)', (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })

  it.each([
    ['2130706433', 'decimal'],
    ['0177.0.0.1', 'octal'],
    ['0x7f.0.0.1', 'hex'],
    ['0x7f000001', 'hex integer'],
    ['127.1', 'short form'],
    ['012.0.0.1', 'octal 10.0.0.1'],
  ])('blocks loopback/private written in %s form (%s)', (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })

  it('blocks anything that is not an IP address', () => {
    expect(isPublicAddress('example.com')).toBe(false)
    expect(isPublicAddress('')).toBe(false)
  })
})

describe('checkUrl', () => {
  it('accepts an https URL with a host name', () => {
    const result = checkUrl('https://example.com/invoices/1.pdf')
    expect(result).toEqual({ ok: true, url: new URL('https://example.com/invoices/1.pdf') })
  })

  it('accepts an https URL with a public IP literal', () => {
    expect(checkUrl('https://93.184.216.34/a.pdf').ok).toBe(true)
    expect(checkUrl('https://[2606:4700:4700::1111]/a.pdf').ok).toBe(true)
  })

  it.each(['http://example.com/a.pdf', 'ftp://example.com/a.pdf', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'rejects %s: https only',
    (url) => {
      expect(checkUrl(url)).toEqual({ ok: false, reason: 'Only https:// URLs can be imported.' })
    },
  )

  it('rejects text that is not a URL', () => {
    expect(checkUrl('not a url')).toEqual({ ok: false, reason: 'This is not a valid URL.' })
  })

  it('rejects URLs with embedded credentials', () => {
    expect(checkUrl('https://user:pass@example.com/a.pdf')).toEqual({
      ok: false,
      reason: 'URLs with a user name or password cannot be imported.',
    })
  })

  it.each([
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://0177.0.0.1/',
    'https://0x7f.0.0.1/',
    'https://127.1/',
    'https://10.0.0.5/',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[fe80::1]/',
    'https://[fd00::1]/',
  ])('rejects %s: a non-public IP literal in any notation', (url) => {
    expect(checkUrl(url)).toEqual({
      ok: false,
      reason: 'The address points to a private or reserved network.',
    })
  })

  it.each(['https://localhost/', 'https://LOCALHOST./', 'https://foo.localhost/'])(
    'rejects %s: localhost names never leave the machine',
    (url) => {
      expect(checkUrl(url)).toEqual({
        ok: false,
        reason: 'The address points to a private or reserved network.',
      })
    },
  )
})
