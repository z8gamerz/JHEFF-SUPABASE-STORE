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
    }
  }
};
