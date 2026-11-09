import { Client, Receiver } from '@upstash/qstash';

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  if (req.readable && !req.complete) {
    return new Promise((resolve) => {
      let data = '';
      const timer = setTimeout(() => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      }, 1000);

      req.on('data', (chunk: any) => { data += chunk; });
      req.on('end', () => {
        clearTimeout(timer);
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => {
        clearTimeout(timer);
        resolve({});
      });
    });
  }

  return {};
}

const DEFAULT_BASE_URL = 'https://qstash-us-east-1.upstash.io';
const DEFAULT_TOKEN = 'eyJVc2VySUQiOiI2ZGMyMGRiYi1kMjgyLTRjYmMtOTk2Zi03MGEwYWI1YTc5M2MiLCJQYXNzd29yZCI6ImE2MDI1YjI0ZWU1MzQ4MDA5ZmQ3NzU5MmYwOTAyNWYzIn0=';
const DEFAULT_CURRENT_SIGNING_KEY = 'sig_54hfmTdJdvwmSaDHKJVYucmedEpB';
const DEFAULT_NEXT_SIGNING_KEY = 'sig_5Z6jRweQwkxHT4FpEsXMmBqJ8BSQ';

function cleanVal(val?: string, fallback: string = ''): string {
  if (!val) return fallback;
  return String(val).replace(/^["'\s]+|["'\s]+$/g, '').trim() || fallback;
}

function getQStashConfig() {
  const baseUrl = cleanVal(process.env.QSTASH_URL || process.env.QSTASH_BASE_URL, DEFAULT_BASE_URL);
  const token = cleanVal(process.env.QSTASH_TOKEN, DEFAULT_TOKEN);
  const currentSigningKey = cleanVal(process.env.QSTASH_CURRENT_SIGNING_KEY, DEFAULT_CURRENT_SIGNING_KEY);
  const nextSigningKey = cleanVal(process.env.QSTASH_NEXT_SIGNING_KEY, DEFAULT_NEXT_SIGNING_KEY);

  const client = new Client({ baseUrl, token });
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });

  return {
    client,
    receiver,
    baseUrl,
    maskedToken: token ? `${token.slice(0, 10)}••••••••••••••••${token.slice(-6)}` : 'Not Configured',
    maskedCurrentSigningKey: currentSigningKey ? `${currentSigningKey.slice(0, 6)}••••••••••••••••` : 'Not Configured',
    maskedNextSigningKey: nextSigningKey ? `${nextSigningKey.slice(0, 6)}••••••••••••••••` : 'Not Configured',
    hasToken: Boolean(token),
    hasSigningKeys: Boolean(currentSigningKey && nextSigningKey),
  };
}

export default async function handler(req: any, res: any) {
  // CORS & Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Upstash-Signature');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  const { client, baseUrl, maskedToken, maskedCurrentSigningKey, maskedNextSigningKey, hasToken, hasSigningKeys } = getQStashConfig();

  // GET: Return connection status with automatically masked secrets (protecting tokens)
  if (req.method === 'GET') {
    try {
      return res.status(200).json({
        success: true,
        connected: hasToken,
        baseUrl,
        tokenMasked: maskedToken,
        signingKeys: {
          current: maskedCurrentSigningKey,
          next: maskedNextSigningKey,
          configured: hasSigningKeys,
        },
        status: hasToken ? 'Active & Protected' : 'Token Missing',
        timestamp: Date.now(),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to inspect QStash status' });
    }
  }

  // POST: Publish message / trigger scheduled task
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const action = body?.action || 'publish';

      if (action === 'status') {
        return res.status(200).json({
          success: true,
          connected: hasToken,
          baseUrl,
          tokenMasked: maskedToken,
          status: 'Active & Protected',
        });
      }

      // Publish task / webhook
      const targetUrl = (body?.url || 'https://httpstat.us/200').trim();
      const messageBody = body?.body || body?.data || { event: 'ping', timestamp: Date.now() };
      const delay = body?.delay; // e.g. "10s", "1m"
      const cron = body?.cron; // e.g. "* * * * *"
      const headers = body?.headers;

      const publishParams: any = {
        url: targetUrl,
      };

      if (typeof messageBody === 'object') {
        publishParams.body = JSON.stringify(messageBody);
        publishParams.headers = { 'Content-Type': 'application/json', ...(headers || {}) };
      } else {
        publishParams.body = String(messageBody);
        if (headers) publishParams.headers = headers;
      }

      if (delay) publishParams.delay = delay;
      if (cron) publishParams.cron = cron;

      const result: any = await client.publish(publishParams);

      return res.status(200).json({
        success: true,
        message: 'Message successfully published to Upstash QStash!',
        messageId: result?.messageId || result?.id || (Array.isArray(result) ? result[0]?.messageId : 'msg_published'),
        url: targetUrl,
        publishedAt: Date.now(),
      });
    } catch (err: any) {
      console.error('[API QStash Publish Error]:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to publish to Upstash QStash.',
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
