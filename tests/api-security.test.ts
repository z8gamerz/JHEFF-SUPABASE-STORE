import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCors,
  clampBodySize,
  clearRateLimitState,
  rateLimit,
  requireApiAuth,
} from '../api/_security.ts';
import qstashHandler from '../api/qstash.ts';
import utangWebhookHandler from '../api/utang-webhook.ts';

function createMockRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    headers,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    end(chunk?: any) {
      if (chunk !== undefined) this.body = chunk;
      return this;
    },
  };
  return res;
}

const ENV_BACKUP = { ...process.env };

beforeEach(() => {
  clearRateLimitState();
  process.env = { ...ENV_BACKUP };
});

afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

test('applyCors rejects disallowed origin with 403 and allows configured origin without wildcard', () => {
  process.env.ALLOWED_ORIGINS = 'https://pos.example.com';

  const blockedRes = createMockRes();
  const blockedOk = applyCors(
    { headers: { origin: 'https://evil.example.net' } },
    blockedRes,
    'POST, OPTIONS'
  );
  assert.equal(blockedOk, false);
  assert.equal(blockedRes.statusCode, 403);
  assert.equal(blockedRes.body?.success, false);

  const allowedRes = createMockRes();
  const allowedOk = applyCors(
    { headers: { origin: 'https://pos.example.com' } },
    allowedRes,
    'POST, OPTIONS'
  );
  assert.equal(allowedOk, true);
  assert.equal(allowedRes.headers['access-control-allow-origin'], 'https://pos.example.com');
  assert.notEqual(allowedRes.headers['access-control-allow-origin'], '*');
});

test('clampBodySize enforces byte limit', () => {
  assert.equal(clampBodySize({ ok: true }, 64), true);
  assert.equal(clampBodySize({ data: 'x'.repeat(200) }, 64), false);
});

test('rateLimit blocks requests exceeding threshold with 429', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.5' } };
  const res1 = createMockRes();
  const res2 = createMockRes();
  const res3 = createMockRes();

  assert.equal(rateLimit(req, res1, { key: 'test-rl', limit: 2, windowMs: 60_000 }), true);
  assert.equal(res1.headers['x-ratelimit-limit'], '2');
  assert.equal(res1.headers['x-ratelimit-remaining'], '1');
  assert.equal(rateLimit(req, res2, { key: 'test-rl', limit: 2, windowMs: 60_000 }), true);
  assert.equal(res2.headers['x-ratelimit-remaining'], '0');
  assert.equal(rateLimit(req, res3, { key: 'test-rl', limit: 2, windowMs: 60_000 }), false);
  assert.equal(res3.statusCode, 429);
  assert.ok(Number(res3.headers['retry-after']) >= 1);
});

test('requireApiAuth fails closed with 503 when POS_API_SECRET is missing and 401 when mismatched', () => {
  delete process.env.POS_API_SECRET;
  const unconfRes = createMockRes();
  assert.equal(requireApiAuth({ headers: {} }, unconfRes), false);
  assert.equal(unconfRes.statusCode, 503);

  process.env.POS_API_SECRET = 'super-secret-pos-key';
  const badRes = createMockRes();
  assert.equal(requireApiAuth({ headers: { 'x-pos-api-key': 'wrong' } }, badRes), false);
  assert.equal(badRes.statusCode, 401);

  const goodRes = createMockRes();
  assert.equal(requireApiAuth({ headers: { authorization: 'Bearer super-secret-pos-key' } }, goodRes), true);
});

test('api/qstash fails closed without auth and reports unconfigured without hardcoded tokens', async () => {
  delete process.env.QSTASH_TOKEN;
  delete process.env.QSTASH_CURRENT_SIGNING_KEY;
  delete process.env.QSTASH_NEXT_SIGNING_KEY;
  process.env.POS_API_SECRET = 'pos-test-secret';

  const unauthRes = createMockRes();
  await qstashHandler({ method: 'GET', headers: {} }, unauthRes);
  assert.equal(unauthRes.statusCode, 401);

  const statusRes = createMockRes();
  await qstashHandler(
    { method: 'GET', headers: { 'x-pos-api-key': 'pos-test-secret' } },
    statusRes
  );
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.body?.configured, false);
  assert.equal(statusRes.body?.connected, false);
  assert.equal(statusRes.body?.status, 'Not Configured');
  assert.equal(statusRes.body?.tokenMasked, 'Not Configured');

  const postRes = createMockRes();
  await qstashHandler(
    {
      method: 'POST',
      headers: { 'x-pos-api-key': 'pos-test-secret' },
      body: { url: 'https://example.com/webhook', body: { ok: true } },
    },
    postRes
  );
  assert.equal(postRes.statusCode, 503);
  assert.equal(postRes.body?.configured, false);
});

test('api/utang-webhook fails closed without auth and reports not_configured when Redis env missing', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.VITE_UPSTASH_REDIS_REST_URL;
  delete process.env.VITE_UPSTASH_REDIS_REST_TOKEN;
  process.env.POS_API_SECRET = 'pos-test-secret';

  const unauthRes = createMockRes();
  await utangWebhookHandler({ method: 'GET', url: '/api/utang-webhook?action=health', headers: {} }, unauthRes);
  assert.equal(unauthRes.statusCode, 401);

  const healthRes = createMockRes();
  await utangWebhookHandler(
    {
      method: 'GET',
      url: '/api/utang-webhook?action=health',
      headers: { 'x-pos-api-key': 'pos-test-secret' },
    },
    healthRes
  );
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.body?.configured, false);
  assert.equal(healthRes.body?.status, 'not_configured');

  const postRes = createMockRes();
  await utangWebhookHandler(
    {
      method: 'POST',
      url: '/api/utang-webhook',
      headers: { 'x-pos-api-key': 'pos-test-secret' },
      body: { action: 'push_record', entry: { id: 'e1' } },
    },
    postRes
  );
  assert.equal(postRes.statusCode, 503);
});
