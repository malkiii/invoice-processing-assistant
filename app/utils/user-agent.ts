/**
 * A short, readable name for a session's device from its user-agent string,
 * e.g. "Chrome on Windows". Falls back to the first product token, or "Unknown device".
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent?.trim()
  if (!ua) return 'Unknown device'

  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Version\/[\d.]+.*Safari\//.test(ua) ? 'Safari'
    : null

  const os =
    /Windows NT/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : null

  if (browser && os) return `${browser} on ${os}`
  if (browser || os) return (browser ?? os)!
  return ua.split(/[\s/]/)[0] || 'Unknown device'
}
