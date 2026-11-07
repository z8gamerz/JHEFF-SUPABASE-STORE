import { timingSafeEqual } from 'crypto';

const rateState = new Map<string, { count: number; resetAt: number }>();

function parseAllowedOrigins(): string[] {
  const raw =
    process.env.ALLOWED_ORIGINS ||
    process.env.APP_ORIGIN ||
    process.env.VITE_APP_ORIGIN ||
    '';
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function getCorsOrigin(req: any): string | null {
  const allowed = parseAllowedOrigins();
  const origin = typeof req?.headers?.origin === 'string' ? req.headers.origin.replace(/\/$/, '') : '';
  if (allowed.length === 0) {
    // No allowlist configured: only reflect same-origin requests; never use '*' for credential-bearing APIs.
    return origin || null;
  }
  if (origin && allowed.includes(origin)) return origin;
  return null;
}

export function applyCors(req: any, res: any, methods: string, headers: string = 'Content-Type, Authorization, X-POS-API-Key'): boolean {
  const origin = getCorsOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
  res.setHeader('Content-Type', 'application/json');
  if (origin) res.setHeader('Access-Control-Allow-Credentials', 'true');

  const allowed = parseAllowedOrigins();
  const requestOrigin = typeof req?.headers?.origin === 'string' ? req.headers.origin : '';
  if (allowed.length > 0 && requestOrigin && !origin) {
    res.status(403).json({ success: false, error: 'Origin not allowed.' });
    return false;
  }
  return true;
}

export function requireEnv(name: string, ...alts: string[]): string {
  for (const key of [name, ...alts]) {
    const v = process.env[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Protects API routes when POS_API_SECRET is configured on the server.
 * Client must send `X-POS-API-Key` or `Authorization: Bearer <secret>`.
 * If no secret is configured, requests are rejected with 503 (fail-closed for sensitive routes).
 */
export function requireApiAuth(req: any, res: any): boolean {
  const expected = requireEnv('POS_API_SECRET');
  if (!expected) {
    res.status(503).json({ success: false, error: 'Server API auth is not configured (set POS_API_SECRET).' });
    return false;
  }
  const key = typeof req?.headers?.['x-pos-api-key'] === 'string' ? req.headers['x-pos-api-key'].trim() : '';
  const auth = typeof req?.headers?.authorization === 'string' ? req.headers.authorization : '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = key || bearer;
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return false;
  }
  return true;
}

export function rateLimit(req: any, res: any, opts: { key: string; limit: number; windowMs: number }): boolean {
  const ip =
    (typeof req?.headers?.['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0] : '') ||
    req?.socket?.remoteAddress ||
    'unknown';
  const k = `${opts.key}:${String(ip).trim()}`;
  const now = Date.now();
  const cur = rateState.get(k);
  if (!cur || cur.resetAt <= now) {
    rateState.set(k, { count: 1, resetAt: now + opts.windowMs });
    return true;
  }
  cur.count += 1;
  if (cur.count > opts.limit) {
    res.status(429).json({ success: false, error: 'Too many requests. Try again later.' });
    return false;
  }
  return true;
}

export function clampBodySize(body: any, maxBytes: number): boolean {
  try {
    const s = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    return Buffer.byteLength(s, 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}
