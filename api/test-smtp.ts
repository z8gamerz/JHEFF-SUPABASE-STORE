import nodemailer from 'nodemailer';

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

export default async function handler(req: any, res: any) {
  // CORS & Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = await parseBody(req);
    const senderEmail = (body?.senderEmail || process.env.SMTP_SENDER_EMAIL || process.env.GMAIL_USER || '').trim();
    const appPassword = (body?.appPassword || process.env.SMTP_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

    if (!senderEmail || !appPassword) {
      return res.status(400).json({
        success: false,
        error: 'Gmail address and Google App Password are required. Either configure them in Settings -> Email & Reports or set SMTP_SENDER_EMAIL and SMTP_APP_PASSWORD in Vercel environment variables.'
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
      message: 'SMTP credentials verified successfully! Google App Password is authenticated and ready to dispatch reports on Vercel.'
    });
  } catch (err: any) {
    console.error('[API Test SMTP Error]:', err);
    let errorDetail = err?.message || 'Failed to authenticate with Gmail SMTP.';
    if (errorDetail.includes('535') || errorDetail.includes('BadCredentials') || errorDetail.includes('Username and Password not accepted')) {
      errorDetail = 'Hindi tinanggap ng Gmail ang credentials (535 Bad Credentials). Siguraduhing may 2-Step Verification ang Google account at gumamit ng 16-character Google App Password (hindi regular account password).';
    }
    return res.status(400).json({
      success: false,
      error: errorDetail
    });
  }
}

