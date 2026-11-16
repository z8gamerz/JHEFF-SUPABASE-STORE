import { applyApiGuards, parseJsonBody, requireEnv } from './_security.js';

function isAllowedFirebaseUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.firebasedatabase.app') || parsed.hostname.endsWith('.firebaseio.com'))
    );
  } catch {
    return false;
  }
}

export const SECURE_PRODUCTION_RULES = {
  rules: {
    store_info: {
      '.read': true,
      '.write': "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
    },
    branches: {
      '.read': true,
      '.write': "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
    },
    users: {
      '.read': true,
      $uid: {
        '.write': "auth != null && (auth.uid == $uid || root.child('users').child(auth.uid).child('role').val() == 'admin')",
      },
    },
    products: {
      '.read': true,
      $productId: {
        '.write': "auth != null && newData.hasChildren(['name', 'price']) && newData.child('price').isNumber() && newData.child('price').val() >= 0 && (!newData.hasChild('stock') || newData.child('stock').isNumber()) && (!newData.hasChild('isWeightBased') || newData.child('isWeightBased').isBoolean()) && (!newData.hasChild('unit') || newData.child('unit').isString())",
      },
    },
    transactions: {
      '.read': true,
      $txnId: {
        '.write': "auth != null && !data.exists() && newData.hasChildren(['ticketNumber', 'total', 'branchId', 'timestamp'])",
      },
    },
    customers: {
      '.read': true,
      $customerId: {
        '.write': "auth != null && newData.hasChildren(['name', 'updatedAt'])",
      },
    },
    credit_log: {
      '.read': true,
      $logId: {
        '.write': "auth != null && !data.exists() && newData.hasChildren(['customerId', 'amount', 'type', 'timestamp'])",
      },
    },
    expenses: {
      '.read': true,
      $expenseId: {
        '.write': "auth != null && newData.hasChildren(['description', 'amount', 'branchId'])",
      },
    },
    suppliers: {
      '.read': true,
      '.write': "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
    },
    restock_transactions: {
      '.read': true,
      $restockId: {
        '.write': 'auth != null && !data.exists()',
      },
    },
    ewallet_transactions: {
      '.read': true,
      $ewalletId: {
        '.write': 'auth != null && !data.exists()',
      },
    },
    audit_logs: {
      '.read': "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
      $auditId: {
        '.write': "auth != null && !data.exists() && newData.hasChildren(['action', 'timestamp'])",
      },
    },
    categories: {
      '.read': true,
      '.write': "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
    },
    metadata: {
      '.read': true,
      '.write': "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
    },
  },
};

export default async function handler(req: any, res: any) {
  if (
    !applyApiGuards(req, res, {
      methods: 'GET, POST, OPTIONS',
      rateKey: 'update-firebase-rules',
      rateLimitMax: 10,
      maxBodyBytes: 64 * 1024,
      requireAuth: true,
    })
  ) {
    return;
  }

  const configuredUrl = requireEnv('VITE_FIREBASE_RTDB_URL', 'FIREBASE_RTDB_URL').replace(/\/$/, '');

  if (req.method === 'GET') {
    const parsedReqUrl = new URL(req.url || '/api/update-firebase-rules', 'http://localhost');
    const queryUrl = (parsedReqUrl.searchParams.get('databaseUrl') || '').trim().replace(/\/$/, '');
    const baseUrl = queryUrl || configuredUrl;

    if (!baseUrl) {
      return res.status(200).json({
        success: false,
        configured: false,
        error: 'Firebase RTDB URL is not configured (set VITE_FIREBASE_RTDB_URL).',
      });
    }

    if (!isAllowedFirebaseUrl(baseUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid database URL. Only official Google Firebase Realtime Database URLs (*.firebasedatabase.app) are allowed.',
      });
    }

    try {
      const secret = requireEnv('FIREBASE_DATABASE_SECRET', 'VITE_FIREBASE_AUTH_TOKEN');

      const readProbe = await fetch(`${baseUrl}/users.json?shallow=true`, { headers: { 'Cache-Control': 'no-cache' } });
      const canRead = readProbe.ok;

      const probeKey = `_sec_scan_${Date.now()}`;
      const writeProbe = await fetch(`${baseUrl}/_security_probe/${probeKey}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: Date.now(), test: true }),
      });
      const canWriteUnauthenticated = writeProbe.ok;

      if (canWriteUnauthenticated) {
        await fetch(`${baseUrl}/_security_probe/${probeKey}.json`, { method: 'DELETE' }).catch(() => {});
      }

      let currentRules: any = null;
      if (secret) {
        try {
          const rulesRes = await fetch(`${baseUrl}/.settings/rules.json?auth=${encodeURIComponent(secret)}`);
          if (rulesRes.ok) {
            currentRules = await rulesRes.json();
          }
        } catch {}
      }

      const isOpen = canWriteUnauthenticated;
      const isLocked = !canRead && !canWriteUnauthenticated;
      const isSecured = canRead && !canWriteUnauthenticated;

      return res.status(200).json({
        success: true,
        configured: true,
        scan: {
          canRead,
          canWriteUnauthenticated,
          isOpen,
          isLocked,
          isSecured,
          hasSecret: Boolean(secret),
          currentRules,
          databaseUrl: baseUrl,
          timestamp: Date.now(),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Failed to scan database rules.' });
    }
  }

  if (req.method === 'POST') {
    const parsed = await parseJsonBody(req, 64 * 1024);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ success: false, error: parsed.error });
    }

    try {
      const body = parsed.body;
      const secret = (body?.secret || requireEnv('FIREBASE_DATABASE_SECRET', 'VITE_FIREBASE_AUTH_TOKEN')).trim();
      const inputUrl = (body?.databaseUrl || configuredUrl).trim().replace(/\/$/, '');

      if (!inputUrl) {
        return res.status(503).json({
          success: false,
          configured: false,
          error: 'Firebase RTDB URL is not configured (set VITE_FIREBASE_RTDB_URL or supply databaseUrl).',
        });
      }

      if (!isAllowedFirebaseUrl(inputUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid database URL. Only official Google Firebase Realtime Database URLs (*.firebasedatabase.app) are allowed.',
        });
      }

      if (!secret) {
        return res.status(400).json({
          success: false,
          requiresSecret: true,
          error: 'Firebase Database Secret is required to programmatically update rules via REST API.',
        });
      }

      const rulesToApply = body?.rules || SECURE_PRODUCTION_RULES;
      const rulesUrl = `${inputUrl}/.settings/rules.json?auth=${encodeURIComponent(secret)}`;
      const updateRes = await fetch(rulesUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulesToApply),
      });

      const responseText = await updateRes.text();
      let responseData: any = null;
      try {
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch {}

      if (!updateRes.ok) {
        const errorMsg = responseData?.error || `Firebase rejected update (${updateRes.status}). Verify your Database Secret.`;
        return res.status(updateRes.status).json({ success: false, error: errorMsg });
      }

      return res.status(200).json({
        success: true,
        message: 'Firebase Realtime Database rules successfully updated to Secure Production Defaults!',
        rules: rulesToApply,
        appliedAt: Date.now(),
      });
    } catch (err: any) {
      console.error('[Update Firebase Rules Error]:', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to update Firebase rules.' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
