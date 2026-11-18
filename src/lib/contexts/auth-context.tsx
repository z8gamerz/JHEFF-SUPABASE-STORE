'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/lib/db/idb';
import { useRouter, usePathname } from 'next/navigation';
import { userService } from '@/lib/services/user-service';
import { auditService } from '@/lib/services/audit-service';
import { authRateLimiter } from '@/lib/security/rate-limiter';
import { sanitizeEmail } from '@/lib/security/input-sanitizer';

export type UserRole = 'admin' | 'cashier';

export interface AuthRateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  lockoutSeconds: number;
}

interface AuthContextType {
  user: Omit<User, 'passwordHash'> | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isCashier: boolean;
  loading: boolean;
  rateLimitStatus: AuthRateLimitStatus;
  refreshRateLimitStatus: () => void;
  resetRateLimit: () => void;
}

import { hashPassword, verifyPassword } from '@/lib/security/auth-crypto';
import { pullStore, pullSync } from '@/lib/db/sync-queue';
import { STORES } from '@/lib/db/idb';
import { realtimeSync } from '@/lib/db/realtime-sync';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'passwordHash'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateLimitStatus, setRateLimitStatus] = useState<AuthRateLimitStatus>(() => authRateLimiter.isAllowed());
  const router = useRouter();
  const pathname = usePathname();

  const refreshRateLimitStatus = () => {
    setRateLimitStatus(authRateLimiter.isAllowed());
  };

  useEffect(() => {
    const initAuth = async () => {
      // Pull latest users and store info in background from Firebase RTDB
      if (typeof window !== 'undefined' && window.navigator.onLine) {
        pullStore(STORES.USERS).catch(() => {});
        pullStore(STORES.STORE_INFO).catch(() => {});
      }

      const savedUserId = localStorage.getItem('pos-user-id');
      if (savedUserId) {
        try {
          let userData = await userService.getById(savedUserId);
          if (!userData && typeof window !== 'undefined' && window.navigator.onLine) {
            await pullStore(STORES.USERS);
            userData = await userService.getById(savedUserId);
          }
          if (userData) {
            const { passwordHash, ...userWithoutPassword } = userData;
            setUser(userWithoutPassword);
          } else {
            localStorage.removeItem('pos-user-id');
          }
        } catch (error) {
          console.error('Failed to load user:', error);
        }
      }
      setLoading(false);
    };
    
    initAuth();
  }, []);

  const login = async (emailInput: string, password: string) => {
    const email = sanitizeEmail(emailInput);
    
    // Check Rate Limiting
    const limitCheck = authRateLimiter.isAllowed();
    if (!limitCheck.allowed) {
      setRateLimitStatus(limitCheck);
      throw new Error(`Too many failed login attempts. Account temporarily locked for security. Try again in ${limitCheck.lockoutSeconds} seconds.`);
    }

    let users = await userService.getAll();
    let foundUser = users.find(u => u.email.toLowerCase() === email);
    
    // If not found locally in IndexedDB, immediately pull fresh users from Firebase RTDB (cross-device instant sync!)
    if (!foundUser && typeof window !== 'undefined' && window.navigator.onLine) {
      try {
        await pullStore(STORES.USERS);
        users = await userService.getAll();
        foundUser = users.find(u => u.email.toLowerCase() === email);
      } catch (err) {
        console.warn('[AuthContext] Cloud user lookup failed:', err);
      }
    }

    // Check if cloud sync failed due to database rules/RLS (Unauthorized 401/403)
    const isFirebaseUnauthorized = typeof window !== 'undefined' && localStorage.getItem('firebase_sync_error') === 'Unauthorized';
    const isSupabaseUnauthorized = typeof window !== 'undefined' && localStorage.getItem('supabase_sync_error') === 'Unauthorized';

    if (!foundUser) {
      if (isFirebaseUnauthorized) {
        throw new Error(
          'Firebase Database Restricted (Permission Denied). Naka-lock mode ang database sa Firebase Console kaya hindi ma-download ang user account sa bagong device na ito. Paki-publish ang rules sa Firebase Console upang makapasok.'
        );
      }
      if (isSupabaseUnauthorized) {
        throw new Error(
          'Supabase Database Restricted (RLS Permission Denied). Pakisuri ang Supabase Auth session o Server Proxy configuration upang ma-download ang user account.'
        );
      }

      const failed = authRateLimiter.recordFailure();
      setRateLimitStatus(failed);
      await auditService.log('AUTH_FAILED', `Failed login attempt for unknown email: ${email}`, email);
      if (!failed.allowed) {
        throw new Error(`Too many failed attempts. Locked out for ${failed.lockoutSeconds} seconds.`);
      }
      throw new Error(`Invalid email or password. (${failed.remainingAttempts} attempts remaining)`);
    }

    const { isMatch, shouldUpgrade, upgradedHash } = await verifyPassword(password, foundUser.passwordHash, foundUser.email);

    if (!isMatch) {
      const failed = authRateLimiter.recordFailure();
      setRateLimitStatus(failed);
      await auditService.log('AUTH_FAILED', `Failed password attempt for user: ${email}`, email);
      if (!failed.allowed) {
        throw new Error(`Too many failed attempts. Locked out for ${failed.lockoutSeconds} seconds.`);
      }
      throw new Error(`Invalid email or password. (${failed.remainingAttempts} attempts remaining)`);
    }

    // If logged in via legacy or un-upgraded hash, upgrade to email-salted hash automatically
    if (shouldUpgrade && upgradedHash) {
      await userService.update({
        ...foundUser,
        passwordHash: upgradedHash,
      });
    }

    // Reset rate limiter on successful authentication
    authRateLimiter.reset();
    setRateLimitStatus(authRateLimiter.isAllowed());

    const { passwordHash, ...userWithoutPassword } = foundUser;
    setUser(userWithoutPassword);
    localStorage.setItem('pos-user-id', foundUser.id);
    await auditService.log('USER_LOGIN', `User ${email} logged in successfully`, email);

    // Cross-device sync: Await store_info, branches, products, customers & expenses from cloud
    if (typeof window !== 'undefined' && window.navigator.onLine) {
      try {
        await Promise.all([
          pullStore(STORES.STORE_INFO),
          pullStore(STORES.BRANCHES),
          pullStore(STORES.PRODUCTS),
          pullStore(STORES.CUSTOMERS),
          pullStore(STORES.EXPENSES),
          pullStore(STORES.CREDIT_LOG),
        ]);
      } catch (syncErr) {
        console.warn('[AuthContext] Quick store pull on login failed:', syncErr);
      }
    }

    // Trigger background sync for remaining collections & start realtime webhook stream
    pullSync().catch(() => {});
    realtimeSync.start();

    router.push('/');
  };

  const signup = async (name: string, emailInput: string, password: string, role: UserRole) => {
    const email = sanitizeEmail(emailInput);
    const users = await userService.getAll();
    
    // Check if any user exists
    if (users.length > 0) {
      if (user?.role !== 'admin') {
        throw new Error('Only administrators can create new accounts.');
      }
    } else {
      // First user MUST be an admin
      if (role !== 'admin') {
        throw new Error('The first user must be an administrator.');
      }
    }

    if (users.some(u => u.email.toLowerCase() === email)) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await hashPassword(password, email);
    const businessId = 'main_config'; // Default business ID for local simulation
    const newUser: User = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashedPassword,
      role,
      businessId,
      assignedBranchIds: [], // Admins have access to all, cashiers need assignment
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await userService.create(newUser);
    await auditService.log('USER_SIGNUP', `User ${email} signed up as ${role}`, email);
    
    // Auto login after signup if it's the first user
    if (users.length === 0) {
      const { passwordHash, ...userWithoutPassword } = newUser;
      setUser(userWithoutPassword);
      localStorage.setItem('pos-user-id', newUser.id);
      router.push('/');
    }
  };

  const logout = () => {
    if (user) {
      auditService.log('USER_LOGOUT', `User ${user.email} logged out`, user.email);
    }
    setUser(null);
    localStorage.removeItem('pos-user-id');
    router.push('/login');
  };

  const resetRateLimit = () => {
    authRateLimiter.reset();
    setRateLimitStatus(authRateLimiter.isAllowed());
  };

  const value: AuthContextType = {
    user,
    login,
    signup,
    logout,
    isAdmin: user?.role === 'admin',
    isCashier: user?.role === 'cashier',
    loading,
    rateLimitStatus,
    refreshRateLimitStatus,
    resetRateLimit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
