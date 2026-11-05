import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  // CORS & Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON request body.' });
      }
    } else if (!body) {
      const raw = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: any) => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = raw ? JSON.parse(raw) : {};
    }

    const { senderEmail, appPassword } = body || {};

    if (!senderEmail || !appPassword) {
      return res.status(400).json({
        success: false,
        error: 'Gmail address and Google App Password are required.'
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail.trim(),
        pass: appPassword.replace(/\s+/g, ''),
      },
    });

    await transporter.verify();
    return res.status(200).json({
      success: true,
      message: 'SMTP credentials verified successfully! Google App Password is ready.'
    });
  } catch (err: any) {
    console.error('[API Test SMTP Error]:', err);
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to authenticate with Gmail SMTP. Please check your App Password.'
    });
  }
}
