import { Client, Receiver } from '@upstash/qstash';
import { applyApiGuards, parseJsonBody, requireEnv } from './_security.js';

function isValidHttpsUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getQStashConfig() {
  const baseUrl = requireEnv('QSTASH_URL', 'QSTASH_BASE_URL') || 'https://qstash.upstash.io';
  const token = requireEnv('QSTASH_TOKEN');
  const currentSigningKey = requireEnv('QSTASH_CURRENT_SIGNING_KEY');
  const nextSigningKey = requireEnv('QSTASH_NEXT_SIGNING_KEY');

  const hasToken = Boolean(token);
  const hasSigningKeys = Boolean(currentSigningKey && nextSigningKey);

  const client = hasToken ? new Client({ baseUrl, token }) : null;
  const receiver = hasSigningKeys ? new Receiver({ currentSigningKey, nextSigningKey }) : null;

  return {
    client,
    receiver,
    baseUrl: hasToken ? baseUrl : null,
    maskedToken: token ? `${token.slice(0, 6)}••••••••••••••••${token.slice(-4)}` : 'Not Configured',
    maskedCurrentSigningKey: currentSigningKey ? `${currentSigningKey.slice(0, 6)}••••••••••••••••` : 'Not Configured',
    maskedNextSigningKey: nextSigningKey ? `${nextSigningKey.slice(0, 6)}••••••••••••••••` : 'Not Configured',
    hasToken,
    hasSigningKeys,
  };
}

export default async function handler(req: any, res: any) {
  if (
    !applyApiGuards(req, res, {
      methods: 'GET, POST, OPTIONS',
      rateKey: 'qstash',
      rateLimitMax: 30,
      maxBodyBytes: 128 * 1024,
      requireAuth: true,
    })
  ) {
    return;
  }

  const {
    client,
    baseUrl,
    maskedToken,
    maskedCurrentSigningKey,
    maskedNextSigningKey,
    hasToken,
    hasSigningKeys,
  } = getQStashConfig();

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      configured: hasToken,
      connected: hasToken,
      baseUrl,
      tokenMasked: maskedToken,
      signingKeys: {
        current: maskedCurrentSigningKey,
        next: maskedNextSigningKey,
        configured: hasSigningKeys,
      },
      status: hasToken ? 'Active & Protected' : 'Not Configured',
      timestamp: Date.now(),
    });
  }

  if (req.method === 'POST') {
    const parsed = await parseJsonBody(req, 128 * 1024);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ success: false, error: parsed.error });
    }
    const body = parsed.body;
    const action = body?.action || 'publish';

    if (action === 'status') {
      return res.status(200).json({
        success: true,
        configured: hasToken,
        connected: hasToken,
        baseUrl,
        tokenMasked: maskedToken,
        status: hasToken ? 'Active & Protected' : 'Not Configured',
      });
    }

    if (!hasToken || !client) {
      return res.status(503).json({
        success: false,
        configured: false,
        error: 'QStash is not configured (set QSTASH_TOKEN).',
      });
    }

    const targetUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!targetUrl || !isValidHttpsUrl(targetUrl)) {
      return res.status(400).json({
        success: false,
        error: 'A valid HTTPS target URL is required.',
      });
    }

    try {
      const messageBody = body?.body || body?.data || { event: 'ping', timestamp: Date.now() };
      const delay = body?.delay;
      const cron = body?.cron;
      const headers = body?.headers;

      const publishParams: any = { url: targetUrl };

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
      console.error('[API QStash Publish Error]:', err?.message || err);
      return res.status(500).json({
        success: false,
        error: 'Failed to publish message to Upstash QStash.',
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
