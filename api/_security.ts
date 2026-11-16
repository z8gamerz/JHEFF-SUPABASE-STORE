import { timingSafeEqual } from 'crypto';

const rateState = new Map<string, { count: number; resetAt: number }>();

export function clearRateLimitState(): void {
  rateState.clear();
}

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
    // Only reflect explicit request origin; never emit '*' for protected routes.
    return origin || null;
  }
  if (origin && allowed.includes(origin)) return origin;
  return null;
}

export function applyCors(
  req: any,
  res: any,
  methods: string,
  headers: string = 'Content-Type, Authorization, X-POS-API-Key, Upstash-Signature'
): boolean {
  const origin = getCorsOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
  res.setHeader('Content-Type', 'application/json');

  const allowed = parseAllowedOrigins();
  const requestOrigin = typeof req?.headers?.origin === 'string' ? req.headers.origin : '';
  if (allowed.length > 0 && requestOrigin && !origin) {
    res.status(403).json({ success: false, error: 'Origin not allowed.', code: 'ORIGIN_FORBIDDEN' });
    return false;
  }
  return true;
}

export function requireEnv(name: string, ...alts: string[]): string {
  for (const key of [name, ...alts]) {
    const v = process.env[key];
    if (typeof v === 'string' && v.trim()) {
      return v.replace(/^["'\s]+|["'\s]+$/g, '').trim();
    }
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
 * Protects API routes via POS_API_SECRET (`X-POS-API-Key` or `Authorization: Bearer <secret>`).
 * Fails closed with 503 when POS_API_SECRET is not configured, and 401 when missing/invalid.
 */
export function requireApiAuth(req: any, res: any): boolean {
  const expected = requireEnv('POS_API_SECRET');
  if (!expected) {
    res.status(503).json({
      success: false,
      error: 'Server API auth is not configured (set POS_API_SECRET).',
      code: 'API_AUTH_NOT_CONFIGURED',
    });
    return false;
  }
  const key = typeof req?.headers?.['x-pos-api-key'] === 'string' ? req.headers['x-pos-api-key'].trim() : '';
  const auth = typeof req?.headers?.authorization === 'string' ? req.headers.authorization : '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = key || bearer;
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ success: false, error: 'Unauthorized.', code: 'UNAUTHORIZED' });
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
    res.status(429).json({
      success: false,
      error: 'Too many requests. Try again later.',
      code: 'RATE_LIMITED',
    });
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

export type ParseJsonBodyResult = {
  ok: boolean;
  body?: any;
  status?: number;
  error?: string;
};

export async function parseJsonBody(req: any, maxBytes: number = 1024 * 1024): Promise<ParseJsonBodyResult> {
  if (req.body !== undefined) {
    if (!clampBodySize(req.body, maxBytes)) {
      return { ok: false, status: 413, error: 'Payload too large.' };
    }
    if (typeof req.body === 'string') {
      try {
        return { ok: true, body: req.body ? JSON.parse(req.body) : {} };
      } catch {
        return { ok: false, status: 400, error: 'Invalid JSON request body.' };
      }
    }
    return { ok: true, body: req.body ?? {} };
  }

  if (req.readable && !req.complete) {
    return new Promise((resolve) => {
      let data = '';
      let size = 0;
      let settled = false;
      const finish = (result: ParseJsonBodyResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        if (!data) return finish({ ok: true, body: {} });
        try {
          finish({ ok: true, body: JSON.parse(data) });
        } catch {
          finish({ ok: false, status: 400, error: 'Invalid JSON request body.' });
        }
      }, 2000);

      req.on('data', (chunk: any) => {
        const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        size += Buffer.byteLength(str, 'utf8');
        if (size > maxBytes) {
          finish({ ok: false, status: 413, error: 'Payload too large.' });
          return;
        }
        data += str;
      });

      req.on('end', () => {
        if (!data) return finish({ ok: true, body: {} });
        try {
          finish({ ok: true, body: JSON.parse(data) });
        } catch {
          finish({ ok: false, status: 400, error: 'Invalid JSON request body.' });
        }
      });

      req.on('error', () => {
        finish({ ok: false, status: 400, error: 'Failed to read request body.' });
      });
    });
  }

  return { ok: true, body: {} };
}

export interface ApiGuardOptions {
  methods: string;
  rateKey: string;
  rateLimitMax?: number;
  rateWindowMs?: number;
  maxBodyBytes?: number;
  requireAuth?: boolean;
}

/**
 * Applies CORS, OPTIONS preflight termination, method validation, rate limiting,
 * and fail-closed API auth consistently across all endpoints.
 * Returns `false` if a response has already been sent.
 */
export function applyApiGuards(req: any, res: any, opts: ApiGuardOptions): boolean {
  if (!applyCors(req, res, opts.methods)) {
    return false;
  }

  if (req.method === 'OPTIONS') {
    res.status(200).json({ success: true });
    return false;
  }

  const allowedMethods = opts.methods.split(',').map((m) => m.trim().toUpperCase());
  if (!allowedMethods.includes(String(req.method || '').toUpperCase())) {
    res.status(405).json({ success: false, error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' });
    return false;
  }

  if (!rateLimit(req, res, {
    key: opts.rateKey,
    limit: opts.rateLimitMax ?? 60,
    windowMs: opts.rateWindowMs ?? 60_000,
  })) {
    return false;
  }

  if (opts.requireAuth !== false) {
    if (!requireApiAuth(req, res)) {
      return false;
    }
  }

  return true;
}
