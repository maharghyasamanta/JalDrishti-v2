// Client IP resolution helper with optional TRUST_PROXY support.

function stripIpv6Prefix(ip) {
  const s = String(ip || '').trim();
  return s.toLowerCase().startsWith('::ffff:') ? s.slice(7) : s;
}

/**
 * Extract the client IP address from an incoming HTTP request.
 * Only trusts X-Forwarded-For when process.env.TRUST_PROXY === 'true'.
 * @param {import('node:http').IncomingMessage | { headers?: Record<string, any>, socket?: { remoteAddress?: string } }} req
 * @returns {string}
 */
export function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const rawXff = req?.headers?.['x-forwarded-for'];
    const headerVal = Array.isArray(rawXff) ? rawXff[0] : rawXff;
    if (typeof headerVal === 'string' && headerVal.trim()) {
      const first = headerVal.split(',')[0].trim();
      if (first) return stripIpv6Prefix(first);
    }
  }
  return stripIpv6Prefix(req?.socket?.remoteAddress || '');
}
