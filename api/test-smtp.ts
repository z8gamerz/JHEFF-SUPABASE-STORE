import nodemailer from 'nodemailer';
import { applyApiGuards, parseJsonBody, requireEnv } from './_security.js';

export default async function handler(req: any, res: any) {
  if (
    !applyApiGuards(req, res, {
      methods: 'POST, OPTIONS',
      rateKey: 'test-smtp',
      rateLimitMax: 10,
      maxBodyBytes: 32 * 1024,
      requireAuth: true,
    })
  ) {
    return;
  }

  const parsed = await parseJsonBody(req, 32 * 1024);
  if (!parsed.ok) {
    return res.status(parsed.status).json({ success: false, error: parsed.error });
  }

  try {
    const body = parsed.body;
    const senderEmail = (body?.senderEmail || requireEnv('SMTP_SENDER_EMAIL', 'GMAIL_USER')).trim();
    const appPassword = (body?.appPassword || requireEnv('SMTP_APP_PASSWORD', 'GMAIL_APP_PASSWORD')).replace(/\s+/g, '');

    if (!senderEmail || !appPassword) {
      return res.status(400).json({
        success: false,
        error: 'Gmail address and Google App Password are required. Configure them in Settings -> Email & Reports or set SMTP_SENDER_EMAIL and SMTP_APP_PASSWORD.',
      });
    }

    const mailer: any = (nodemailer as any)?.default || nodemailer;
    const createTransport = mailer.createTransport || (nodemailer as any).createTransport;

    const transporter = createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });

    await transporter.verify();
    return res.status(200).json({
      success: true,
      message: 'SMTP credentials verified successfully! Google App Password is authenticated and ready to dispatch reports.',
    });
  } catch (err: any) {
    console.error('[API Test SMTP Error]:', err?.message || err);
    const rawMsg = String(err?.message || '');
    const isAuthFailure =
      rawMsg.includes('535') ||
      rawMsg.includes('BadCredentials') ||
      rawMsg.includes('Username and Password not accepted');

    return res.status(400).json({
      success: false,
      error: isAuthFailure
        ? 'Hindi tinanggap ng Gmail ang credentials (535 Bad Credentials). Siguraduhing may 2-Step Verification ang Google account at gumamit ng 16-character Google App Password.'
        : 'Failed to authenticate with Gmail SMTP. Please verify your network connection and credentials.',
    });
  }
}
