import { User } from '@/lib/db/idb';

/**
 * Role-Based Access Control (RBAC) & Row Level Security (RLS) Policy Engine
 * Enforces branch data isolation:
 * - Admin: Full oversight across all branches, operations, and management.
 * - Cashier: Strictly isolated to their assigned branches (assignedBranchIds).
 */

export type AppPermission =
  | 'VIEW_ALL_BRANCHES'
  | 'SWITCH_ANY_BRANCH'
  | 'MANAGE_BRANCHES'
  | 'MANAGE_USERS'
  | 'VIEW_FINANCIAL_REPORTS'
  | 'VIEW_SALES_JOURNAL'
  | 'DELETE_BALANCE'
  | 'CLEAR_DATABASE'
  | 'PERFORM_BACKUP_RESTORE'
  | 'CREATE_TRANSACTIONS'
  | 'MANAGE_INVENTORY'
  | 'MANAGE_UTANG';

const ROLE_PERMISSIONS: Record<'admin' | 'cashier', AppPermission[]> = {
  admin: [
    'VIEW_ALL_BRANCHES',
    'SWITCH_ANY_BRANCH',
    'MANAGE_BRANCHES',
    'MANAGE_USERS',
    'VIEW_FINANCIAL_REPORTS',
    'VIEW_SALES_JOURNAL',
    'DELETE_BALANCE',
    'CLEAR_DATABASE',
    'PERFORM_BACKUP_RESTORE',
    'CREATE_TRANSACTIONS',
    'MANAGE_INVENTORY',
    'MANAGE_UTANG',
  ],
  cashier: [
    'CREATE_TRANSACTIONS',
    'MANAGE_INVENTORY',
    'MANAGE_UTANG',
  ],
};

export function hasPermission(role: 'admin' | 'cashier' | undefined, permission: AppPermission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Row Level Security (RLS) Branch Check:
 * Determines if a user is authorized to read, write, or query data for a target branch.
 */
export function canAccessBranchData(user: Omit<User, 'passwordHash'> | null, targetBranchId: string): boolean {
  if (!user) return false;
  // Admin has global oversight across all branches
  if (user.role === 'admin') return true;
  // Non-admin can only access branches explicitly assigned to their account
  return Array.isArray(user.assignedBranchIds) && user.assignedBranchIds.includes(targetBranchId);
}
