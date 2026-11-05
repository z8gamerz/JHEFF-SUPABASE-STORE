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

function isAllowedFirebaseUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'https:' && 
      (parsed.hostname.endsWith('.firebasedatabase.app') || parsed.hostname.endsWith('.firebaseio.com'));
  } catch {
    return false;
  }
}

export const SECURE_PRODUCTION_RULES = {
  rules: {
    // 1. Store Global Configuration (TIN, Tax, OR Number) - Admin only writes
    store_info: {
      ".read": true,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'"
    },

    // 2. Branches Management - Admin only writes
    branches: {
      ".read": true,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'"
    },

    // 3. User Accounts - Read-only for authentication; writes restricted to user or admin
    users: {
      ".read": true,
      "$uid": {
        ".write": "auth != null && (auth.uid == $uid || root.child('users').child(auth.uid).child('role').val() == 'admin')"
      }
    },

    // 4. Products & Stock Inventory - Read-only for guests, authenticated-only writes
    products: {
      ".read": true,
      "$productId": {
        ".write": "auth != null && newData.hasChildren(['name', 'price']) && newData.child('price').isNumber() && newData.child('price').val() >= 0"
      }
    },

    // 5. Sales Transactions - Append-only, cannot be deleted or modified
    transactions: {
      ".read": true,
      "$txnId": {
        ".write": "auth != null && !data.exists() && newData.hasChildren(['ticketNumber', 'total', 'branchId', 'timestamp'])"
      }
    },

    // 6. Customers Directory
    customers: {
      ".read": true,
      "$customerId": {
        ".write": "auth != null && newData.hasChildren(['name', 'updatedAt'])"
      }
    },

    // 7. Utang / Customer Credit Ledger - Append-only ledger
    credit_log: {
      ".read": true,
      "$logId": {
        ".write": "auth != null && !data.exists() && newData.hasChildren(['customerId', 'amount', 'type', 'timestamp'])"
      }
    },

    // 8. Operational Expenses
    expenses: {
      ".read": true,
      "$expenseId": {
        ".write": "auth != null && newData.hasChildren(['description', 'amount', 'branchId'])"
      }
    },

    // 9. Suppliers & Restock Transactions
    suppliers: {
      ".read": true,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'"
    },
    restock_transactions: {
      ".read": true,
      "$restockId": {
        ".write": "auth != null && !data.exists()"
      }
    },

    // 10. E-Wallet Transactions
    ewallet_transactions: {
      ".read": true,
      "$ewalletId": {
        ".write": "auth != null && !data.exists()"
      }
    },

    // 11. Security Audit Logs - Append-only, cannot be modified or deleted
    audit_logs: {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
      "$auditId": {
        ".write": "auth != null && !data.exists() && newData.hasChildren(['action', 'timestamp'])"
      }
    },

    // 12. Email SMTP & System Metadata
    metadata: {
      ".read": true,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'"
    }
  }
};

export default async function handler(req: any, res: any) {
  // CORS & Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  const defaultUrl = process.env.VITE_FIREBASE_RTDB_URL || 
    'https://database-for-inventory-88e9f-default-rtdb.asia-southeast1.firebasedatabase.app';

  // GET: Scan / Probe Rules status
  if (req.method === 'GET') {
    try {
      const baseUrl = defaultUrl.replace(/\/$/, '');
      const secret = req.query?.secret || process.env.FIREBASE_DATABASE_SECRET || process.env.VITE_FIREBASE_AUTH_TOKEN;
      
      // Probe 1: Check if public read is active on users
      const readProbe = await fetch(`${baseUrl}/users.json?shallow=true`, { headers: { 'Cache-Control': 'no-cache' } });
      const canRead = readProbe.ok;

      // Probe 2: Check if unauthenticated writes are open (vulnerability probe)
      const probeKey = `_sec_scan_${Date.now()}`;
      const writeProbe = await fetch(`${baseUrl}/_security_probe/${probeKey}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: Date.now(), test: true })
      });
      const canWriteUnauthenticated = writeProbe.ok;

      // If write succeeded, clean it up
      if (canWriteUnauthenticated) {
        await fetch(`${baseUrl}/_security_probe/${probeKey}.json`, { method: 'DELETE' }).catch(() => {});
      }

      // Probe 3: Try to inspect rules directly if secret is provided
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
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to scan database rules.' });
    }
  }

  // POST: Programmatically apply secure production rules
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const secret = (body?.secret || process.env.FIREBASE_DATABASE_SECRET || process.env.VITE_FIREBASE_AUTH_TOKEN || '').trim();
      const inputUrl = (body?.databaseUrl || defaultUrl).trim().replace(/\/$/, '');
      if (!isAllowedFirebaseUrl(inputUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid database URL. Only official Google Firebase Realtime Database URLs (*.firebasedatabase.app) are allowed.'
        });
      }
      const baseUrl = inputUrl;
      const rulesToApply = body?.rules || SECURE_PRODUCTION_RULES;

      if (!secret) {
        return res.status(400).json({
          success: false,
          requiresSecret: true,
          error: 'Firebase Database Secret is required to programmatically update rules via REST API. You can find this in Firebase Console -> Project Settings -> Service accounts -> Database secrets.'
        });
      }

      const rulesUrl = `${baseUrl}/.settings/rules.json?auth=${encodeURIComponent(secret)}`;
      const updateRes = await fetch(rulesUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulesToApply)
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
        appliedAt: Date.now()
      });
    } catch (err: any) {
      console.error('[Update Firebase Rules Error]:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Failed to update Firebase rules.' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
