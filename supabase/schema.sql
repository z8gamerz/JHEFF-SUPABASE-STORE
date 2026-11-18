-- ============================================================================
-- Sari-Sari POS & Inventory — Supabase PostgreSQL Schema & RLS Policies
-- ============================================================================
-- How to use:
--   1. Open your Supabase Dashboard -> SQL Editor -> New Query.
--   2. Paste this entire file and click "Run".
--   3. Safe to run on both fresh projects and existing databases.
-- ============================================================================

-- Helper for default epoch ms timestamps
CREATE OR REPLACE FUNCTION public.epoch_ms_now()
RETURNS BIGINT
LANGUAGE sql
VOLATILE
AS $$
  SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
$$;

-- ============================================================================
-- 1. STORE INFO (Business & BIR / Receipt Configuration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.store_info (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name              TEXT NOT NULL DEFAULT 'My Store',
  address           TEXT DEFAULT '',
  tin               TEXT DEFAULT '',
  currency          TEXT NOT NULL DEFAULT 'PHP',
  tax_type          TEXT NOT NULL DEFAULT 'NON-VAT',
  vat_rate          NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
  last_or_number    BIGINT NOT NULL DEFAULT 0,
  last_synced_at    BIGINT DEFAULT 0,
  receipt_settings  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at        BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================================
-- 2. BRANCHES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.branches (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL DEFAULT 'Main Branch',
  business_id TEXT NOT NULL DEFAULT 'main_store',
  address     TEXT DEFAULT '',
  contact     TEXT DEFAULT '',
  created_at  BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at  BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_branches_business ON public.branches(business_id) WHERE NOT is_deleted;

-- ============================================================================
-- 3. USERS (Linked optionally to auth.uid() via auth_user_id or matching id)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  auth_user_id        TEXT DEFAULT '',
  name                TEXT NOT NULL DEFAULT 'Staff',
  email               TEXT NOT NULL,
  password_hash       TEXT DEFAULT '',
  role                TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
  business_id         TEXT NOT NULL DEFAULT 'main_store',
  assigned_branch_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at          BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_users_business ON public.users(business_id);

-- ============================================================================
-- 4. CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL DEFAULT 'General',
  description TEXT DEFAULT '',
  color       TEXT DEFAULT '',
  icon        TEXT DEFAULT '',
  branch_id   TEXT DEFAULT '',
  created_at  BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at  BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_categories_branch ON public.categories(branch_id) WHERE NOT is_deleted;

-- ============================================================================
-- 5. PRODUCTS & INVENTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT NOT NULL,
  price           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock           NUMERIC(12, 3) NOT NULL DEFAULT 0,
  min_stock       NUMERIC(12, 3) DEFAULT 0,
  category        TEXT NOT NULL DEFAULT 'General',
  branch_id       TEXT NOT NULL DEFAULT 'main_branch',
  barcode         TEXT DEFAULT '',
  is_weight_based BOOLEAN NOT NULL DEFAULT FALSE,
  unit            TEXT NOT NULL DEFAULT 'pc',
  created_at      BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at      BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_products_branch ON public.products(branch_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(branch_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '' AND NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products(updated_at);

-- ============================================================================
-- 6. CUSTOMERS (Utang / Suki Directory)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL DEFAULT 'Customer',
  contact     TEXT DEFAULT '',
  total_utang NUMERIC(12, 2) NOT NULL DEFAULT 0,
  branch_id   TEXT DEFAULT 'main_branch',
  created_at  BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at  BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_customers_branch ON public.customers(branch_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON public.customers(updated_at);

-- ============================================================================
-- 7. SALES TRANSACTIONS (POS Receipts & Split Payments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ticket_number   TEXT DEFAULT '',
  or_number       TEXT DEFAULT '',
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  total           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vatable_sales   NUMERIC(12, 2) DEFAULT 0,
  vat_amount      NUMERIC(12, 2) DEFAULT 0,
  tax_type        TEXT DEFAULT 'NON-VAT',
  timestamp       BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  branch_id       TEXT DEFAULT 'main_branch',
  customer_id     TEXT DEFAULT '',
  customer_name   TEXT DEFAULT '',
  payment_method  TEXT DEFAULT 'cash',
  amount_paid     NUMERIC(12, 2) DEFAULT 0,
  change          NUMERIC(12, 2) DEFAULT 0,
  payment_details JSONB DEFAULT '{}'::jsonb,
  updated_at      BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_transactions_branch_ts ON public.transactions(branch_id, timestamp DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_transactions_or ON public.transactions(branch_id, or_number);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON public.transactions(customer_id) WHERE customer_id IS NOT NULL AND customer_id <> '';

-- ============================================================================
-- 8. CREDIT LOG (Utang & Payment Ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.credit_log (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id      TEXT NOT NULL,
  branch_id        TEXT DEFAULT 'main_branch',
  amount           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  type             TEXT NOT NULL DEFAULT 'credit' CHECK (type IN ('credit', 'payment')),
  description      TEXT DEFAULT '',
  timestamp        BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  target_credit_id TEXT DEFAULT '',
  updated_at       BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_credit_log_customer_ts ON public.credit_log(customer_id, timestamp DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_credit_log_branch_ts ON public.credit_log(branch_id, timestamp DESC) WHERE NOT is_deleted;

-- ============================================================================
-- 9. E-WALLET TRANSACTIONS (GCash, Maya, GoTyme, Bank Transfer)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ewallet_transactions (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  or_number        TEXT DEFAULT '',
  type             TEXT NOT NULL DEFAULT 'cash_in' CHECK (type IN ('cash_in', 'cash_out')),
  amount           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  method           TEXT DEFAULT 'gcash',
  fee              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  customer_name    TEXT DEFAULT '',
  reference_number TEXT DEFAULT '',
  branch_id        TEXT DEFAULT 'main_branch',
  created_at       BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at       BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ewallet_branch_created ON public.ewallet_transactions(branch_id, created_at DESC) WHERE NOT is_deleted;

-- ============================================================================
-- 10. SUPPLIERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name           TEXT NOT NULL DEFAULT 'Supplier',
  contact_person TEXT DEFAULT '',
  phone          TEXT DEFAULT '',
  email          TEXT DEFAULT '',
  address        TEXT DEFAULT '',
  branch_id      TEXT DEFAULT 'main_branch',
  created_at     BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at     BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON public.suppliers(branch_id) WHERE NOT is_deleted;

-- ============================================================================
-- 11. RESTOCK TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.restock_transactions (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_id      TEXT DEFAULT '',
  items            JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_cost       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  timestamp        BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  branch_id        TEXT DEFAULT 'main_branch',
  reference_number TEXT DEFAULT '',
  notes            TEXT DEFAULT '',
  updated_at       BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_restock_branch_ts ON public.restock_transactions(branch_id, timestamp DESC) WHERE NOT is_deleted;

-- ============================================================================
-- 12. OPERATIONAL EXPENSES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  description      TEXT DEFAULT '',
  amount           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  category         TEXT DEFAULT 'Others',
  timestamp        BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  branch_id        TEXT DEFAULT 'main_branch',
  created_by       TEXT DEFAULT 'system',
  reference_number TEXT DEFAULT '',
  updated_at       BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_expenses_branch_ts ON public.expenses(branch_id, timestamp DESC) WHERE NOT is_deleted;

-- ============================================================================
-- 13. SECURITY AUDIT LOGS (Append-Only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  action     TEXT NOT NULL DEFAULT 'EVENT',
  user_name  TEXT DEFAULT '',
  details    TEXT DEFAULT '',
  timestamp  BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  updated_at BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON public.audit_logs(timestamp DESC) WHERE NOT is_deleted;

-- ============================================================================
-- 14. METADATA (App Sync / Settings Key-Value Store)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.metadata (
  key        TEXT PRIMARY KEY,
  value      TEXT DEFAULT '',
  updated_at BIGINT NOT NULL DEFAULT public.epoch_ms_now(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================================
-- 15. MIGRATION UPGRADE BLOCK (Safely upgrades tables from earlier schema runs)
-- ============================================================================
DO $$
DECLARE
  pol RECORD;
  fk RECORD;
BEGIN
  -- Dynamically drop all foreign keys on the 14 POS tables so CSV imports never fail with 23503
  FOR fk IN
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN (
        'store_info', 'branches', 'users', 'categories', 'products',
        'customers', 'transactions', 'credit_log', 'ewallet_transactions',
        'suppliers', 'restock_transactions', 'expenses', 'audit_logs', 'metadata'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', fk.table_name, fk.constraint_name);
  END LOOP;

  ALTER TABLE public.users                DROP CONSTRAINT IF EXISTS users_auth_user_id_key;
  ALTER TABLE public.users                DROP CONSTRAINT IF EXISTS users_email_key;

  -- Drop restrictive CHECK constraints
  ALTER TABLE public.store_info           DROP CONSTRAINT IF EXISTS store_info_tax_type_check;
  ALTER TABLE public.transactions         DROP CONSTRAINT IF EXISTS transactions_tax_type_check;
  ALTER TABLE public.ewallet_transactions DROP CONSTRAINT IF EXISTS ewallet_transactions_method_check;
  ALTER TABLE public.expenses             DROP CONSTRAINT IF EXISTS expenses_category_check;

  -- Allow NULL on empty-able text columns when Supabase CSV Importer turns empty cells into NULL
  ALTER TABLE public.customers            ALTER COLUMN contact DROP NOT NULL;
  ALTER TABLE public.transactions         ALTER COLUMN ticket_number DROP NOT NULL;
  ALTER TABLE public.transactions         ALTER COLUMN or_number DROP NOT NULL;
  ALTER TABLE public.credit_log           ALTER COLUMN description DROP NOT NULL;
  ALTER TABLE public.restock_transactions ALTER COLUMN supplier_id DROP NOT NULL;
  ALTER TABLE public.expenses             ALTER COLUMN description DROP NOT NULL;
  ALTER TABLE public.audit_logs           ALTER COLUMN details DROP NOT NULL;
  ALTER TABLE public.metadata             ALTER COLUMN value DROP NOT NULL;

  -- Convert users.auth_user_id from uuid to text safely if created under v1
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'auth_user_id' AND data_type = 'uuid'
  ) THEN
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
    END LOOP;

    DROP INDEX IF EXISTS public.idx_users_auth_uid;
    ALTER TABLE public.users ALTER COLUMN auth_user_id DROP DEFAULT;
    ALTER TABLE public.users ALTER COLUMN auth_user_id TYPE TEXT USING COALESCE(auth_user_id::text, '');
    ALTER TABLE public.users ALTER COLUMN auth_user_id SET DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_auth_uid
  ON public.users(auth_user_id)
  WHERE auth_user_id IS NOT NULL AND auth_user_id <> '';

-- ============================================================================
-- 16. ROW LEVEL SECURITY (RLS) HELPERS & POLICIES
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.role
  FROM public.users u
  WHERE (u.auth_user_id = auth.uid()::text OR u.id = auth.uid()::text)
    AND NOT u.is_deleted
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.has_branch_access(target_branch_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE (u.auth_user_id = auth.uid()::text OR u.id = auth.uid()::text)
      AND NOT u.is_deleted
      AND (
        u.role = 'admin'
        OR jsonb_exists(u.assigned_branch_ids, target_branch_id)
      )
  );
$$;

ALTER TABLE public.store_info           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ewallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata             ENABLE ROW LEVEL SECURITY;

-- store_info
DROP POLICY IF EXISTS store_info_select ON public.store_info;
CREATE POLICY store_info_select ON public.store_info
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS store_info_admin_write ON public.store_info;
CREATE POLICY store_info_admin_write ON public.store_info
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- branches
DROP POLICY IF EXISTS branches_select ON public.branches;
CREATE POLICY branches_select ON public.branches
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS branches_admin_write ON public.branches;
CREATE POLICY branches_admin_write ON public.branches
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- users
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid()::text = auth_user_id OR auth.uid()::text = id OR public.is_admin());
DROP POLICY IF EXISTS users_update ON public.users;
CREATE POLICY users_update ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = auth_user_id OR auth.uid()::text = id OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR ((auth.uid()::text = auth_user_id OR auth.uid()::text = id) AND role = public.current_user_role())
  );
DROP POLICY IF EXISTS users_admin_insert ON public.users;
CREATE POLICY users_admin_insert ON public.users
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS users_admin_delete ON public.users;
CREATE POLICY users_admin_delete ON public.users
  FOR DELETE TO authenticated USING (public.is_admin());

-- categories
DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select ON public.categories
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS categories_admin_write ON public.categories;
CREATE POLICY categories_admin_write ON public.categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- products
DROP POLICY IF EXISTS products_branch_access ON public.products;
CREATE POLICY products_branch_access ON public.products
  FOR ALL TO authenticated
  USING (public.has_branch_access(branch_id))
  WITH CHECK (public.has_branch_access(branch_id));

-- customers
DROP POLICY IF EXISTS customers_branch_access ON public.customers;
CREATE POLICY customers_branch_access ON public.customers
  FOR ALL TO authenticated
  USING (public.has_branch_access(branch_id))
  WITH CHECK (public.has_branch_access(branch_id));

-- transactions
DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS transactions_admin_update ON public.transactions;
CREATE POLICY transactions_admin_update ON public.transactions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- credit_log
DROP POLICY IF EXISTS credit_log_select ON public.credit_log;
CREATE POLICY credit_log_select ON public.credit_log
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS credit_log_insert ON public.credit_log;
CREATE POLICY credit_log_insert ON public.credit_log
  FOR INSERT TO authenticated WITH CHECK (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS credit_log_admin_update ON public.credit_log;
CREATE POLICY credit_log_admin_update ON public.credit_log
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ewallet_transactions
DROP POLICY IF EXISTS ewallet_select ON public.ewallet_transactions;
CREATE POLICY ewallet_select ON public.ewallet_transactions
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS ewallet_insert ON public.ewallet_transactions;
CREATE POLICY ewallet_insert ON public.ewallet_transactions
  FOR INSERT TO authenticated WITH CHECK (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS ewallet_admin_update ON public.ewallet_transactions;
CREATE POLICY ewallet_admin_update ON public.ewallet_transactions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- suppliers
DROP POLICY IF EXISTS suppliers_select ON public.suppliers;
CREATE POLICY suppliers_select ON public.suppliers
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS suppliers_admin_write ON public.suppliers;
CREATE POLICY suppliers_admin_write ON public.suppliers
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- restock_transactions
DROP POLICY IF EXISTS restock_select ON public.restock_transactions;
CREATE POLICY restock_select ON public.restock_transactions
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS restock_insert ON public.restock_transactions;
CREATE POLICY restock_insert ON public.restock_transactions
  FOR INSERT TO authenticated WITH CHECK (public.has_branch_access(branch_id));
DROP POLICY IF EXISTS restock_admin_update ON public.restock_transactions;
CREATE POLICY restock_admin_update ON public.restock_transactions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- expenses
DROP POLICY IF EXISTS expenses_branch_access ON public.expenses;
CREATE POLICY expenses_branch_access ON public.expenses
  FOR ALL TO authenticated
  USING (public.has_branch_access(branch_id))
  WITH CHECK (public.has_branch_access(branch_id));

-- audit_logs
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_admin_select ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (TRUE);

-- metadata
DROP POLICY IF EXISTS metadata_select ON public.metadata;
CREATE POLICY metadata_select ON public.metadata
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS metadata_admin_write ON public.metadata;
CREATE POLICY metadata_admin_write ON public.metadata
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- 17. SUPABASE REALTIME PUBLICATION
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'store_info', 'branches', 'categories', 'products', 'customers',
    'transactions', 'credit_log', 'ewallet_transactions', 'suppliers',
    'restock_transactions', 'expenses', 'metadata'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND NOT puballtables) THEN
    FOREACH tbl IN ARRAY tables LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;
