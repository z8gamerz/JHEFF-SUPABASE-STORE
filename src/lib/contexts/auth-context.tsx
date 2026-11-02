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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Salted SHA-256 hash function with fallback for legacy hashes
async function hashPassword(password: string, salt: string = 'sari_pos_salt_v1'): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Legacy unsalted hash helper for backwards compatibility
async function hashPasswordLegacy(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

import { pullStore, pullSync } from '@/lib/db/sync-queue';
import { STORES } from '@/lib/db/idb';
import { realtimeSync } from '@/lib/db/realtime-sync';

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
          const userData = await userService.getById(savedUserId);
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

    if (!foundUser) {
      const failed = authRateLimiter.recordFailure();
      setRateLimitStatus(failed);
      await auditService.log('AUTH_FAILED', `Failed login attempt for unknown email: ${email}`, email);
      if (!failed.allowed) {
        throw new Error(`Too many failed attempts. Locked out for ${failed.lockoutSeconds} seconds.`);
      }
      throw new Error(`Invalid email or password. (${failed.remainingAttempts} attempts remaining)`);
    }

    // Check with salted hash first, then fallback to legacy unsalted hash
    const saltedHash = await hashPassword(password, foundUser.email);
    const legacyHash = await hashPasswordLegacy(password);

    const isMatch = foundUser.passwordHash === saltedHash || foundUser.passwordHash === legacyHash;

    if (!isMatch) {
      const failed = authRateLimiter.recordFailure();
      setRateLimitStatus(failed);
      await auditService.log('AUTH_FAILED', `Failed password attempt for user: ${email}`, email);
      if (!failed.allowed) {
        throw new Error(`Too many failed attempts. Locked out for ${failed.lockoutSeconds} seconds.`);
      }
      throw new Error(`Invalid email or password. (${failed.remainingAttempts} attempts remaining)`);
    }

    // If logged in via legacy hash, upgrade to salted hash automatically
    if (foundUser.passwordHash === legacyHash) {
      await userService.update({
        ...foundUser,
        passwordHash: saltedHash,
      });
    }

    // Reset rate limiter on successful authentication
    authRateLimiter.reset();
    setRateLimitStatus(authRateLimiter.isAllowed());

    const { passwordHash, ...userWithoutPassword } = foundUser;
    setUser(userWithoutPassword);
    localStorage.setItem('pos-user-id', foundUser.id);
    await auditService.log('USER_LOGIN', `User ${email} logged in successfully`, email);

    // Trigger instant background sync & start realtime webhook stream for new session
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
