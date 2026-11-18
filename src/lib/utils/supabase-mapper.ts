import { STORES, StoreName } from '@/lib/db/idb';

/**
 * Ordered list of all 14 cloud-synced stores matching Supabase foreign-key order
 * (parent tables first, child ledgers & targeted credit payments after).
 */
export const SYNCED_STORES_ORDERED: readonly StoreName[] = [
  STORES.STORE_INFO,
  STORES.BRANCHES,
  STORES.USERS,
  STORES.CATEGORIES,
  STORES.PRODUCTS,
  STORES.CUSTOMERS,
  STORES.SUPPLIERS,
  STORES.TRANSACTIONS,
  STORES.CREDIT_LOG,
  STORES.EWALLET_TRANSACTIONS,
  STORES.RESTOCK_TRANSACTIONS,
  STORES.EXPENSES,
  STORES.AUDIT_LOGS,
  STORES.METADATA,
];

const SYNCED_STORE_SET = new Set<string>(SYNCED_STORES_ORDERED);

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

export function isSyncedStore(store: string): store is StoreName {
  return SYNCED_STORE_SET.has(store);
}

export function getSupabasePrimaryKey(store: StoreName): 'id' | 'key' {
  return store === STORES.METADATA ? 'key' : 'id';
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

function toText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

function toSafeId(val: unknown, prefix = 'row'): string {
  const str = toText(val).trim();
  if (str) return str;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toJsonValue<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof val === 'object') {
    return val as T;
  }
  return fallback;
}

/**
 * Converts an IndexedDB / TypeScript camelCase record into a PostgreSQL snake_case row
 * matching `/supabase/schema.sql`. Note: `store_info.firebaseSecret` is never uploaded.
 */
export function toSupabaseRow(store: StoreName, r: Record<string, any>): Record<string, any> {
  const now = Date.now();
  const isDeleted = Boolean(r?.isDeleted ?? r?.is_deleted);

  switch (store) {
    case STORES.STORE_INFO:
      return {
        id: toSafeId(r.id, 'store'),
        name: toText(r.name) || 'My Store',
        address: toText(r.address),
        tin: toText(r.tin),
        currency: toText(r.currency) || 'PHP',
        tax_type: (r.taxType ?? r.tax_type) === 'VAT' ? 'VAT' : 'NON-VAT',
        vat_rate: Math.max(0, toNumber(r.vatRate ?? r.vat_rate, 12)),
        last_or_number: Math.max(0, Math.trunc(toNumber(r.lastORNumber ?? r.last_or_number, 0))),
        last_synced_at: toSafeEpochMs(r.lastSyncedAt ?? r.last_synced_at),
        receipt_settings: toJsonValue(r.receiptSettings ?? r.receipt_settings, {}),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.BRANCHES:
      return {
        id: toSafeId(r.id, 'branch'),
        name: toText(r.name) || 'Main Branch',
        business_id: toText(r.businessId ?? r.business_id) || 'main_store',
        address: toText(r.address),
        contact: toText(r.contact),
        created_at: toEpochMs(r.createdAt ?? r.created_at, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.USERS: {
      const safeId = toSafeId(r.id, 'user');
      return {
        id: safeId,
        auth_user_id: toText(r.authUserId ?? r.auth_user_id),
        name: toText(r.name) || 'Staff',
        email: toText(r.email) || `${safeId}@local.pos`,
        password_hash: toText(r.passwordHash ?? r.password_hash),
        role: r.role === 'admin' ? 'admin' : 'cashier',
        business_id: toText(r.businessId ?? r.business_id) || 'main_store',
        assigned_branch_ids: toJsonValue(
          r.assignedBranchIds ?? r.assigned_branch_ids,
          []
        ),
        created_at: toEpochMs(r.createdAt ?? r.created_at, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };
    }

    case STORES.CATEGORIES:
      return {
        id: toSafeId(r.id, 'cat'),
        name: toText(r.name) || 'General',
        description: toText(r.description),
        color: toText(r.color),
        icon: toText(r.icon),
        branch_id: toText(r.branchId ?? r.branch_id),
        created_at: toEpochMs(r.createdAt ?? r.created_at, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.PRODUCTS:
      return {
        id: toSafeId(r.id, 'prod'),
        name: toText(r.name) || 'Unnamed Product',
        price: Math.max(0, toNumber(r.price, 0)),
        cost: Math.max(0, toNumber(r.cost, 0)),
        stock: toNumber(r.stock, 0),
        min_stock: Math.max(0, toNumber(r.minStock ?? r.min_stock, 0)),
        category: toText(r.category) || 'General',
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        barcode: toText(r.barcode),
        is_weight_based: Boolean(r.isWeightBased ?? r.is_weight_based),
        unit: toText(r.unit) || 'pc',
        created_at: toEpochMs(r.createdAt ?? r.created_at, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.CUSTOMERS:
      return {
        id: toSafeId(r.id, 'cust'),
        name: toText(r.name) || 'Customer',
        contact: toText(r.contact),
        total_utang: toNumber(r.totalUtang ?? r.total_utang, 0),
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        created_at: toEpochMs(r.createdAt ?? r.created_at, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.SUPPLIERS:
      return {
        id: toSafeId(r.id, 'sup'),
        name: toText(r.name) || 'Supplier',
        contact_person: toText(r.contactPerson ?? r.contact_person),
        phone: toText(r.phone),
        email: toText(r.email),
        address: toText(r.address),
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        created_at: toEpochMs(r.createdAt ?? r.created_at, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.TRANSACTIONS:
      return {
        id: toSafeId(r.id, 'txn'),
        ticket_number: toText(r.ticketNumber ?? r.ticket_number),
        or_number: toText(r.orNumber ?? r.or_number),
        items: toJsonValue(r.items, []),
        total: Math.max(0, toNumber(r.total, 0)),
        vatable_sales: toNumber(r.vatableSales ?? r.vatable_sales, 0),
        vat_amount: toNumber(r.vatAmount ?? r.vat_amount, 0),
        tax_type: (r.taxType ?? r.tax_type) === 'VAT' ? 'VAT' : 'NON-VAT',
        timestamp: toEpochMs(r.timestamp, now),
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        customer_id: toText(r.customerId ?? r.customer_id),
        customer_name: toText(r.customerName ?? r.customer_name),
        payment_method: toText(r.paymentMethod ?? r.payment_method) || 'cash',
        amount_paid: toNumber(r.amountPaid ?? r.amount_paid, 0),
        change: toNumber(r.change, 0),
        payment_details: toJsonValue(r.paymentDetails ?? r.payment_details, {}),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.CREDIT_LOG:
      return {
        id: toSafeId(r.id, 'cred'),
        customer_id: toText(r.customerId ?? r.customer_id),
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        amount: toNumber(r.amount, 0),
        type: r.type === 'payment' ? 'payment' : 'credit',
        description: toText(r.description),
        timestamp: toEpochMs(r.timestamp, now),
        target_credit_id: toText(r.targetCreditId ?? r.target_credit_id),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.EWALLET_TRANSACTIONS: {
      const method = VALID_EWALLET_METHODS.has(r.method) ? r.method : 'gcash';
      return {
        id: toSafeId(r.id, 'ew'),
        or_number: toText(r.orNumber ?? r.or_number),
        type: r.type === 'cash_out' ? 'cash_out' : 'cash_in',
        amount: Math.max(0, toNumber(r.amount, 0)),
        method,
        fee: Math.max(0, toNumber(r.fee, 0)),
        customer_name: toText(r.customerName ?? r.customer_name),
        reference_number: toText(r.referenceNumber ?? r.reference_number),
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        created_at: toEpochMs(r.createdAt ?? r.created_at, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };
    }

    case STORES.RESTOCK_TRANSACTIONS:
      return {
        id: toSafeId(r.id, 'restock'),
        supplier_id: toText(r.supplierId ?? r.supplier_id),
        items: toJsonValue(r.items, []),
        total_cost: Math.max(0, toNumber(r.totalCost ?? r.total_cost, 0)),
        timestamp: toEpochMs(r.timestamp, now),
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        reference_number: toText(r.referenceNumber ?? r.reference_number),
        notes: toText(r.notes),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.EXPENSES: {
      const category = VALID_EXPENSE_CATEGORIES.has(r.category) ? r.category : 'Others';
      return {
        id: toSafeId(r.id, 'exp'),
        description: toText(r.description),
        amount: Math.max(0, toNumber(r.amount, 0)),
        category,
        timestamp: toEpochMs(r.timestamp, now),
        branch_id: toText(r.branchId ?? r.branch_id) || 'main_branch',
        created_by: toText(r.createdBy ?? r.created_by) || 'system',
        reference_number: toText(r.referenceNumber ?? r.reference_number),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };
    }

    case STORES.AUDIT_LOGS:
      return {
        id: toSafeId(r.id, 'audit'),
        action: toText(r.action) || 'EVENT',
        user_name: toText(r.user ?? r.user_name),
        details: toText(r.details),
        timestamp: toEpochMs(r.timestamp, now),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    case STORES.METADATA:
      return {
        key: toSafeId(r.key, 'meta'),
        value: toText(r.value),
        updated_at: toEpochMs(r.updatedAt ?? r.updated_at, now),
        is_deleted: isDeleted,
      };

    default:
      return r;
  }
}

/**
 * Converts a Supabase PostgreSQL snake_case row back into the IndexedDB / TypeScript camelCase record.
 */
export function fromSupabaseRow(store: StoreName, row: Record<string, any>): Record<string, any> {
  if (!row || typeof row !== 'object') return row;
  const isDeleted = Boolean(row.is_deleted ?? row.isDeleted);
  const updatedAt = toEpochMs(row.updated_at ?? row.updatedAt, Date.now());

  switch (store) {
    case STORES.STORE_INFO: {
      const receiptSettings = toJsonValue<Record<string, any> | undefined>(
        row.receipt_settings ?? row.receiptSettings,
        undefined
      );
      return {
        id: toText(row.id),
        name: toText(row.name) || 'My Store',
        address: toText(row.address),
        tin: toText(row.tin),
        currency: toText(row.currency) || 'PHP',
        taxType: (row.tax_type ?? row.taxType) === 'VAT' ? 'VAT' : 'NON-VAT',
        vatRate: toNumber(row.vat_rate ?? row.vatRate, 12),
        lastORNumber: Math.trunc(toNumber(row.last_or_number ?? row.lastORNumber, 0)),
        lastSyncedAt: toSafeEpochMs(row.last_synced_at ?? row.lastSyncedAt) || undefined,
        ...(receiptSettings && Object.keys(receiptSettings).length > 0
          ? { receiptSettings }
          : {}),
        updatedAt,
        isDeleted,
      };
    }

    case STORES.BRANCHES:
      return {
        id: toText(row.id),
        name: toText(row.name) || 'Main Branch',
        businessId: toText(row.business_id ?? row.businessId) || 'main_store',
        address: toText(row.address),
        contact: toText(row.contact),
        createdAt: toEpochMs(row.created_at ?? row.createdAt, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.USERS:
      return {
        id: toText(row.id),
        ...(toText(row.auth_user_id ?? row.authUserId)
          ? { authUserId: toText(row.auth_user_id ?? row.authUserId) }
          : {}),
        name: toText(row.name) || 'Staff',
        email: toText(row.email),
        passwordHash: toText(row.password_hash ?? row.passwordHash),
        role: row.role === 'admin' ? 'admin' : 'cashier',
        businessId: toText(row.business_id ?? row.businessId) || 'main_store',
        assignedBranchIds: toJsonValue<string[]>(
          row.assigned_branch_ids ?? row.assignedBranchIds,
          []
        ),
        createdAt: toEpochMs(row.created_at ?? row.createdAt, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.CATEGORIES:
      return {
        id: toText(row.id),
        name: toText(row.name) || 'General',
        description: toText(row.description),
        color: toText(row.color),
        icon: toText(row.icon),
        branchId: toText(row.branch_id ?? row.branchId),
        createdAt: toEpochMs(row.created_at ?? row.createdAt, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.PRODUCTS:
      return {
        id: toText(row.id),
        name: toText(row.name),
        price: toNumber(row.price, 0),
        cost: toNumber(row.cost, 0),
        stock: toNumber(row.stock, 0),
        minStock: toNumber(row.min_stock ?? row.minStock, 0),
        category: toText(row.category) || 'General',
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        barcode: toText(row.barcode),
        isWeightBased: Boolean(row.is_weight_based ?? row.isWeightBased),
        unit: toText(row.unit) || 'pc',
        createdAt: toEpochMs(row.created_at ?? row.createdAt, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.CUSTOMERS:
      return {
        id: toText(row.id),
        name: toText(row.name),
        contact: toText(row.contact),
        totalUtang: toNumber(row.total_utang ?? row.totalUtang, 0),
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        createdAt: toEpochMs(row.created_at ?? row.createdAt, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.SUPPLIERS:
      return {
        id: toText(row.id),
        name: toText(row.name),
        contactPerson: toText(row.contact_person ?? row.contactPerson),
        phone: toText(row.phone),
        email: toText(row.email),
        address: toText(row.address),
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        createdAt: toEpochMs(row.created_at ?? row.createdAt, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.TRANSACTIONS: {
      const paymentDetails = toJsonValue<Record<string, any> | undefined>(
        row.payment_details ?? row.paymentDetails,
        undefined
      );
      return {
        id: toText(row.id),
        ticketNumber: toText(row.ticket_number ?? row.ticketNumber),
        orNumber: toText(row.or_number ?? row.orNumber),
        items: toJsonValue<any[]>(row.items, []),
        total: toNumber(row.total, 0),
        vatableSales: toNumber(row.vatable_sales ?? row.vatableSales, 0),
        vatAmount: toNumber(row.vat_amount ?? row.vatAmount, 0),
        taxType: (row.tax_type ?? row.taxType) === 'VAT' ? 'VAT' : 'NON-VAT',
        timestamp: toEpochMs(row.timestamp, updatedAt),
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        customerId: toText(row.customer_id ?? row.customerId) || undefined,
        customerName: toText(row.customer_name ?? row.customerName) || undefined,
        paymentMethod: toText(row.payment_method ?? row.paymentMethod) || 'cash',
        amountPaid: toNumber(row.amount_paid ?? row.amountPaid, 0),
        change: toNumber(row.change, 0),
        ...(paymentDetails && Object.keys(paymentDetails).length > 0
          ? { paymentDetails }
          : {}),
        updatedAt,
        isDeleted,
      };
    }

    case STORES.CREDIT_LOG:
      return {
        id: toText(row.id),
        customerId: toText(row.customer_id ?? row.customerId),
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        amount: toNumber(row.amount, 0),
        type: row.type === 'payment' ? 'payment' : 'credit',
        description: toText(row.description),
        timestamp: toEpochMs(row.timestamp, updatedAt),
        ...(toText(row.target_credit_id ?? row.targetCreditId)
          ? { targetCreditId: toText(row.target_credit_id ?? row.targetCreditId) }
          : {}),
        updatedAt,
        isDeleted,
      };

    case STORES.EWALLET_TRANSACTIONS:
      return {
        id: toText(row.id),
        orNumber: toText(row.or_number ?? row.orNumber) || undefined,
        type: row.type === 'cash_out' ? 'cash_out' : 'cash_in',
        amount: toNumber(row.amount, 0),
        method: VALID_EWALLET_METHODS.has(row.method) ? row.method : 'gcash',
        fee: toNumber(row.fee, 0),
        customerName: toText(row.customer_name ?? row.customerName) || undefined,
        referenceNumber: toText(row.reference_number ?? row.referenceNumber) || undefined,
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        createdAt: toEpochMs(row.created_at ?? row.createdAt, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.RESTOCK_TRANSACTIONS:
      return {
        id: toText(row.id),
        supplierId: toText(row.supplier_id ?? row.supplierId),
        items: toJsonValue<any[]>(row.items, []),
        totalCost: toNumber(row.total_cost ?? row.totalCost, 0),
        timestamp: toEpochMs(row.timestamp, updatedAt),
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        referenceNumber: toText(row.reference_number ?? row.referenceNumber) || undefined,
        notes: toText(row.notes) || undefined,
        updatedAt,
        isDeleted,
      };

    case STORES.EXPENSES:
      return {
        id: toText(row.id),
        description: toText(row.description),
        amount: toNumber(row.amount, 0),
        category: VALID_EXPENSE_CATEGORIES.has(row.category) ? row.category : 'Others',
        timestamp: toEpochMs(row.timestamp, updatedAt),
        branchId: toText(row.branch_id ?? row.branchId) || 'main_branch',
        createdBy: toText(row.created_by ?? row.createdBy) || 'system',
        referenceNumber: toText(row.reference_number ?? row.referenceNumber) || undefined,
        updatedAt,
        isDeleted,
      };

    case STORES.AUDIT_LOGS:
      return {
        id: toText(row.id),
        action: toText(row.action) || 'EVENT',
        user: toText(row.user_name ?? row.user) || undefined,
        details: toText(row.details),
        timestamp: toEpochMs(row.timestamp, updatedAt),
        updatedAt,
        isDeleted,
      };

    case STORES.METADATA:
      return {
        key: toText(row.key),
        value: toText(row.value),
        updatedAt,
        isDeleted,
      };

    default:
      return row;
  }
}
