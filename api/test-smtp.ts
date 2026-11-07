import nodemailer from 'nodemailer';
import { applyCors, requireEnv, requireApiAuth, rateLimit, clampBodySize } from './_security';

function getSmtpAuth(body: any): { user: string; pass: string } | null {
  const envUser = requireEnv('SMTP_SENDER_EMAIL', 'GMAIL_SENDER_EMAIL');
  const envPass = requireEnv('SMTP_APP_PASSWORD', 'GMAIL_APP_PASSWORD');
  if (envUser && envPass) return { user: envUser.trim(), pass: envPass.replace(/\s+/g, '') };
  const senderEmail = typeof body?.senderEmail === 'string' ? body.senderEmail.trim() : '';
  const appPassword = typeof body?.appPassword === 'string' ? body.appPassword : '';
  if (!senderEmail || !appPassword) return null;
  return { user: senderEmail, pass: appPassword.replace(/\s+/g, '') };
}

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    return req.body;
  }
  if (req.readable && !req.complete) {
    return new Promise((resolve) => {
      let data = '';
      const timer = setTimeout(() => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } }, 1000);
      req.on('data', (chunk: any) => { data += chunk; });
      req.on('end', () => { clearTimeout(timer); try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
      req.on('error', () => { clearTimeout(timer); resolve({}); });
    });
  }
  return {};
}

export default async function handler(req: any, res: any) {
  if (!applyCors(req, res, 'POST, OPTIONS', 'Content-Type, Authorization, X-POS-API-Key')) return;
  if (req.method === 'OPTIONS') return res.status(200).json({ success: true });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  if (!rateLimit(req, res, { key: 'test-smtp', limit: 10, windowMs: 60 * 60_000 })) return;
  if (!requireApiAuth(req, res)) return;

  try {
    const body = await parseBody(req);
    if (!clampBodySize(body, 10_000)) {
      return res.status(413).json({ success: false, error: 'Request body too large.' });
    }
    const auth = getSmtpAuth(body);
    if (!auth) {
      return res.status(400).json({ success: false, error: 'SMTP credentials are required (configure server env or provide credentials).' });
    }

    const mailer: any = (nodemailer as any)?.default || nodemailer;
    const createTransport = mailer.createTransport || (nodemailer as any).createTransport;
    const transporter = createTransport({
      service: 'gmail',
      auth,
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });

    await transporter.verify();
    return res.status(200).json({ success: true, message: 'SMTP credentials verified successfully.' });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[API Test SMTP Error]:', msg, err?.stack || '');
    const isAuth = /auth|invalid login|credentials|535|534|username|password/i.test(msg);
    return res.status(isAuth ? 401 : 500).json({
      success: false,
      error: isAuth
        ? 'SMTP authentication failed. Verify Gmail App Password and sender email.'
        : `SMTP test failed: ${msg}`,
    });
  }
}

