import Papa from 'papaparse';
import { STORES, StoreName } from '@/lib/db/idb';

export interface SupabaseTableExportSpec {
  order: number;
  tableName: string;
  fileName: string;
  storeName: StoreName;
  columns: readonly string[];
  mapRow: (row: Record<string, any>) => Record<string, string | number | boolean>;
  sortRows?: (rows: Record<string, any>[]) => Record<string, any>[];
}

function toEpochMs(val: unknown, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
}

function toSafeEpochMs(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function toNumber(val: unknown, fallback = 0): number {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function toNullableText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

function toSafeId(val: unknown, prefix = 'row'): string {
  const str = toNullableText(val).trim();
  if (str) return str;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toJsonString(val: unknown, fallback: string): string {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'string') {
    try {
      JSON.parse(val);
      return val;
    } catch {
      return fallback;
    }
  }
  try {
    return JSON.stringify(val);
  } catch {
    return fallback;
  }
}

const VALID_EXPENSE_CATEGORIES = new Set([
  'Utilities',
  'Rent',
  'Salary',
  'Inventory Restock',
  'Snacks / Refreshments',
  'Marketing',
  'Others',
]);

const VALID_EWALLET_METHODS = new Set(['gcash', 'maya', 'bank_transfer', 'gotyme']);

export const SUPABASE_TABLE_EXPORTS: readonly SupabaseTableExportSpec[] = [
  {
    order: 1,
    tableName: 'store_info',
    fileName: '01_store_info.csv',
    storeName: STORES.STORE_INFO,
    columns: [
      'id',
      'name',
      'address',
      'tin',
      'currency',
      'tax_type',
      'vat_rate',
      'last_or_number',
      'last_synced_at',
      'receipt_settings',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'store'),
        name: toNullableText(r.name) || 'My Store',
        address: toNullableText(r.address),
        tin: toNullableText(r.tin),
        currency: toNullableText(r.currency) || 'PHP',
        tax_type: r.taxType === 'VAT' ? 'VAT' : 'NON-VAT',
        vat_rate: Math.max(0, toNumber(r.vatRate, 12)),
        last_or_number: Math.max(0, Math.trunc(toNumber(r.lastORNumber, 0))),
        last_synced_at: toSafeEpochMs(r.lastSyncedAt),
        receipt_settings: toJsonString(r.receiptSettings, '{}'),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 2,
    tableName: 'branches',
    fileName: '02_branches.csv',
    storeName: STORES.BRANCHES,
    columns: [
      'id',
      'name',
      'business_id',
      'address',
      'contact',
      'created_at',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'branch'),
        name: toNullableText(r.name) || 'Main Branch',
        business_id: toNullableText(r.businessId) || 'main_store',
        address: toNullableText(r.address),
        contact: toNullableText(r.contact),
        created_at: toEpochMs(r.createdAt, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 3,
    tableName: 'users',
    fileName: '03_users.csv',
    storeName: STORES.USERS,
    columns: [
      'id',
      'auth_user_id',
      'name',
      'email',
      'password_hash',
      'role',
      'business_id',
      'assigned_branch_ids',
      'created_at',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      const safeId = toSafeId(r.id, 'user');
      return {
        id: safeId,
        auth_user_id: toNullableText(r.authUserId),
        name: toNullableText(r.name) || 'Staff',
        email: toNullableText(r.email) || `${safeId}@local.pos`,
        password_hash: toNullableText(r.passwordHash),
        role: r.role === 'admin' ? 'admin' : 'cashier',
        business_id: toNullableText(r.businessId) || 'main_store',
        assigned_branch_ids: toJsonString(
          Array.isArray(r.assignedBranchIds) ? r.assignedBranchIds : [],
          '[]'
        ),
        created_at: toEpochMs(r.createdAt, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 4,
    tableName: 'categories',
    fileName: '04_categories.csv',
    storeName: STORES.CATEGORIES,
    columns: [
      'id',
      'name',
      'description',
      'color',
      'icon',
      'branch_id',
      'created_at',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'cat'),
        name: toNullableText(r.name) || 'General',
        description: toNullableText(r.description),
        color: toNullableText(r.color),
        icon: toNullableText(r.icon),
        branch_id: toNullableText(r.branchId),
        created_at: toEpochMs(r.createdAt, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 5,
    tableName: 'products',
    fileName: '05_products.csv',
    storeName: STORES.PRODUCTS,
    columns: [
      'id',
      'name',
      'price',
      'cost',
      'stock',
      'min_stock',
      'category',
      'branch_id',
      'barcode',
      'is_weight_based',
      'unit',
      'created_at',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'prod'),
        name: toNullableText(r.name) || 'Unnamed Product',
        price: Math.max(0, toNumber(r.price, 0)),
        cost: Math.max(0, toNumber(r.cost, 0)),
        stock: toNumber(r.stock, 0),
        min_stock: Math.max(0, toNumber(r.minStock, 0)),
        category: toNullableText(r.category) || 'General',
        branch_id: toNullableText(r.branchId) || 'main_branch',
        barcode: toNullableText(r.barcode),
        is_weight_based: Boolean(r.isWeightBased),
        unit: toNullableText(r.unit) || 'pc',
        created_at: toEpochMs(r.createdAt, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 6,
    tableName: 'customers',
    fileName: '06_customers.csv',
    storeName: STORES.CUSTOMERS,
    columns: [
      'id',
      'name',
      'contact',
      'total_utang',
      'branch_id',
      'created_at',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'cust'),
        name: toNullableText(r.name) || 'Customer',
        contact: toNullableText(r.contact),
        total_utang: toNumber(r.totalUtang, 0),
        branch_id: toNullableText(r.branchId) || 'main_branch',
        created_at: toEpochMs(r.createdAt, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 7,
    tableName: 'suppliers',
    fileName: '07_suppliers.csv',
    storeName: STORES.SUPPLIERS,
    columns: [
      'id',
      'name',
      'contact_person',
      'phone',
      'email',
      'address',
      'branch_id',
      'created_at',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'sup'),
        name: toNullableText(r.name) || 'Supplier',
        contact_person: toNullableText(r.contactPerson),
        phone: toNullableText(r.phone),
        email: toNullableText(r.email),
        address: toNullableText(r.address),
        branch_id: toNullableText(r.branchId) || 'main_branch',
        created_at: toEpochMs(r.createdAt, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 8,
    tableName: 'transactions',
    fileName: '08_transactions.csv',
    storeName: STORES.TRANSACTIONS,
    columns: [
      'id',
      'ticket_number',
      'or_number',
      'items',
      'total',
      'vatable_sales',
      'vat_amount',
      'tax_type',
      'timestamp',
      'branch_id',
      'customer_id',
      'customer_name',
      'payment_method',
      'amount_paid',
      'change',
      'payment_details',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'txn'),
        ticket_number: toNullableText(r.ticketNumber),
        or_number: toNullableText(r.orNumber),
        items: toJsonString(Array.isArray(r.items) ? r.items : [], '[]'),
        total: Math.max(0, toNumber(r.total, 0)),
        vatable_sales: toNumber(r.vatableSales, 0),
        vat_amount: toNumber(r.vatAmount, 0),
        tax_type: r.taxType === 'VAT' ? 'VAT' : 'NON-VAT',
        timestamp: toEpochMs(r.timestamp, now),
        branch_id: toNullableText(r.branchId) || 'main_branch',
        customer_id: toNullableText(r.customerId),
        customer_name: toNullableText(r.customerName),
        payment_method: toNullableText(r.paymentMethod) || 'cash',
        amount_paid: toNumber(r.amountPaid, 0),
        change: toNumber(r.change, 0),
        payment_details: toJsonString(r.paymentDetails, '{}'),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 9,
    tableName: 'credit_log',
    fileName: '09_credit_log.csv',
    storeName: STORES.CREDIT_LOG,
    columns: [
      'id',
      'customer_id',
      'branch_id',
      'amount',
      'type',
      'description',
      'timestamp',
      'target_credit_id',
      'updated_at',
      'is_deleted',
    ],
    sortRows: (rows) =>
      [...rows].sort((a, b) => {
        const aTarget = a.targetCreditId ? 1 : 0;
        const bTarget = b.targetCreditId ? 1 : 0;
        if (aTarget !== bTarget) return aTarget - bTarget;
        return toEpochMs(a.timestamp, 0) - toEpochMs(b.timestamp, 0);
      }),
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'cred'),
        customer_id: toNullableText(r.customerId),
        branch_id: toNullableText(r.branchId) || 'main_branch',
        amount: toNumber(r.amount, 0),
        type: r.type === 'payment' ? 'payment' : 'credit',
        description: toNullableText(r.description),
        timestamp: toEpochMs(r.timestamp, now),
        target_credit_id: toNullableText(r.targetCreditId),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 10,
    tableName: 'ewallet_transactions',
    fileName: '10_ewallet_transactions.csv',
    storeName: STORES.EWALLET_TRANSACTIONS,
    columns: [
      'id',
      'or_number',
      'type',
      'amount',
      'method',
      'fee',
      'customer_name',
      'reference_number',
      'branch_id',
      'created_at',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      const method = VALID_EWALLET_METHODS.has(r.method) ? r.method : 'gcash';
      return {
        id: toSafeId(r.id, 'ew'),
        or_number: toNullableText(r.orNumber),
        type: r.type === 'cash_out' ? 'cash_out' : 'cash_in',
        amount: Math.max(0, toNumber(r.amount, 0)),
        method,
        fee: Math.max(0, toNumber(r.fee, 0)),
        customer_name: toNullableText(r.customerName),
        reference_number: toNullableText(r.referenceNumber),
        branch_id: toNullableText(r.branchId) || 'main_branch',
        created_at: toEpochMs(r.createdAt, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 11,
    tableName: 'restock_transactions',
    fileName: '11_restock_transactions.csv',
    storeName: STORES.RESTOCK_TRANSACTIONS,
    columns: [
      'id',
      'supplier_id',
      'items',
      'total_cost',
      'timestamp',
      'branch_id',
      'reference_number',
      'notes',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'restock'),
        supplier_id: toNullableText(r.supplierId),
        items: toJsonString(Array.isArray(r.items) ? r.items : [], '[]'),
        total_cost: Math.max(0, toNumber(r.totalCost, 0)),
        timestamp: toEpochMs(r.timestamp, now),
        branch_id: toNullableText(r.branchId) || 'main_branch',
        reference_number: toNullableText(r.referenceNumber),
        notes: toNullableText(r.notes),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 12,
    tableName: 'expenses',
    fileName: '12_expenses.csv',
    storeName: STORES.EXPENSES,
    columns: [
      'id',
      'description',
      'amount',
      'category',
      'timestamp',
      'branch_id',
      'created_by',
      'reference_number',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      const category = VALID_EXPENSE_CATEGORIES.has(r.category) ? r.category : 'Others';
      return {
        id: toSafeId(r.id, 'exp'),
        description: toNullableText(r.description),
        amount: Math.max(0, toNumber(r.amount, 0)),
        category,
        timestamp: toEpochMs(r.timestamp, now),
        branch_id: toNullableText(r.branchId) || 'main_branch',
        created_by: toNullableText(r.createdBy) || 'system',
        reference_number: toNullableText(r.referenceNumber),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 13,
    tableName: 'audit_logs',
    fileName: '13_audit_logs.csv',
    storeName: STORES.AUDIT_LOGS,
    columns: [
      'id',
      'action',
      'user_name',
      'details',
      'timestamp',
      'updated_at',
      'is_deleted',
    ],
    mapRow: (r) => {
      const now = Date.now();
      return {
        id: toSafeId(r.id, 'audit'),
        action: toNullableText(r.action) || 'EVENT',
        user_name: toNullableText(r.user),
        details: toNullableText(r.details),
        timestamp: toEpochMs(r.timestamp, now),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
  {
    order: 14,
    tableName: 'metadata',
    fileName: '14_metadata.csv',
    storeName: STORES.METADATA,
    columns: ['key', 'value', 'updated_at', 'is_deleted'],
    mapRow: (r) => {
      const now = Date.now();
      return {
        key: toSafeId(r.key, 'meta'),
        value: toNullableText(r.value),
        updated_at: toEpochMs(r.updatedAt, now),
        is_deleted: Boolean(r.isDeleted),
      };
    },
  },
];

export function serializeTableToSupabaseCsv(
  spec: SupabaseTableExportSpec,
  rawRows: Record<string, any>[]
): string {
  const ordered = spec.sortRows ? spec.sortRows(rawRows) : rawRows;
  const rows = ordered
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const mapped = spec.mapRow(row);
      return spec.columns.map((col) => mapped[col] ?? '');
    });

  return Papa.unparse(
    {
      fields: [...spec.columns],
      data: rows,
    },
    {
      newline: '\n',
    }
  );
}

export function buildSupabaseImportReadme(counts: Record<string, number>): string {
  const lines = [
    'Sari-Sari POS -> Supabase CSV Import Guide',
    '=========================================',
    '',
    '1. Make sure you have already run supabase/schema.sql in Supabase SQL Editor.',
    '2. In Supabase Dashboard -> Table Editor, select each table and click:',
    '   "Insert" -> "Import data from CSV".',
    '3. Upload the CSV files in exact numerical order (01 to 14) so foreign keys',
    '   (store_info -> branches -> users/products/customers/suppliers -> transactions)',
    '   resolve cleanly without constraint errors:',
    '',
    ...SUPABASE_TABLE_EXPORTS.map(
      (s) => `   - ${s.fileName} -> table "${s.tableName}" (${counts[s.tableName] ?? 0} rows)`
    ),
    '',
    'Notes:',
    '- JSONB columns (items, payment_details, receipt_settings, assigned_branch_ids) are pre-serialized.',
    '- store_info.firebaseSecret is intentionally omitted for security.',
    '- Empty cells represent SQL NULL values.',
  ];
  return lines.join('\n');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBytes(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirSize = centralChunks.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralDirSize + eocd.length;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of localChunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralChunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  result.set(eocd, pos);
  return result;
}
