import crypto from 'node:crypto';

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * @param {string | undefined | null} remoteAddress
 */
export function isLoopbackAddress(remoteAddress) {
  return typeof remoteAddress === 'string' && LOOPBACK_ADDRESSES.has(remoteAddress);
}

const COOKIE_NAME = 'cms_token';

/**
 * Read the pairing cookie from a request's Cookie header.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string | null}
 */
function extractCookieToken(req) {
  const raw = req.headers?.cookie;
  if (typeof raw !== 'string' || !raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Extract the pairing token from a request: URL query `?token=` first, then
 * the `x-cms-token` header, then the `cms_token` cookie. The cookie is what
 * lets a browser reach same-origin sub-resources (ES module imports,
 * stylesheets) after the initial `/m?token=` page load sets it — those
 * sub-resource requests carry neither the query param nor the header.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string | null}
 */
function extractToken(req) {
  const url = req.url || '/';
  try {
    const parsed = new URL(url, 'http://localhost');
    const fromQuery = parsed.searchParams.get('token');
    if (fromQuery) return fromQuery;
  } catch {
    // malformed URL — fall through to header/cookie lookup
  }
  const header = req.headers?.['x-cms-token'];
  if (typeof header === 'string' && header) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  return extractCookieToken(req);
}

/**
 * Constant-time string comparison. Mismatched lengths short-circuit to
 * `false` without ever calling crypto.timingSafeEqual (which throws on
 * length mismatch) and without throwing.
 * @param {string} a
 * @param {string} b
 */
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * @param {{ token: string | null }} opts
 */
export function createAuth({ token }) {
  return {
    /**
     * @param {import('node:http').IncomingMessage} req
     * @returns {boolean}
     */
    check(req) {
      const remoteAddress = req.socket?.remoteAddress ?? req.connection?.remoteAddress;
      if (isLoopbackAddress(remoteAddress)) return true;
      if (!token) return false;
      const provided = extractToken(req);
      if (!provided) return false;
      return timingSafeEqualStrings(token, provided);
    },
  };
}
