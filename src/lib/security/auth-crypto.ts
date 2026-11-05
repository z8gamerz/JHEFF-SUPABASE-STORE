/**
 * Cryptographic helpers for authentication and password verification.
 * Standardizes salted SHA-256 password hashing across the POS application.
 */

const DEFAULT_SALT = 'sari_pos_salt_v1';

/**
 * Produces a salted SHA-256 hash using the user's normalized email or a system salt.
 */
export async function hashPassword(password: string, salt: string = DEFAULT_SALT): Promise<string> {
  const encoder = new TextEncoder();
  const normalizedSalt = (salt || DEFAULT_SALT).trim().toLowerCase();
  const data = encoder.encode(`${normalizedSalt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Legacy unsalted SHA-256 hash helper for backwards compatibility with earlier records.
 */
export async function hashPasswordLegacy(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates a plaintext candidate password against stored hashes.
 * Tests salted-with-email, salted-with-default, legacy unsalted, and upgrades older hashes.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  userEmail?: string
): Promise<{ isMatch: boolean; shouldUpgrade: boolean; upgradedHash?: string }> {
  if (!password || !storedHash) {
    return { isMatch: false, shouldUpgrade: false };
  }

  const emailSalt = userEmail ? userEmail.trim().toLowerCase() : DEFAULT_SALT;
  const canonicalHash = await hashPassword(password, emailSalt);

  // 1. Check current canonical format (salted with email)
  if (storedHash === canonicalHash) {
    return { isMatch: true, shouldUpgrade: false };
  }

  // 2. Check default system salt
  const defaultSaltHash = await hashPassword(password, DEFAULT_SALT);
  if (storedHash === defaultSaltHash) {
    return { isMatch: true, shouldUpgrade: true, upgradedHash: canonicalHash };
  }

  // 3. Check legacy unsalted SHA-256
  const legacyHash = await hashPasswordLegacy(password);
  if (storedHash === legacyHash) {
    return { isMatch: true, shouldUpgrade: true, upgradedHash: canonicalHash };
  }

  // 4. Backwards compatibility for seed accounts with unhashed password
  if (storedHash === password) {
    return { isMatch: true, shouldUpgrade: true, upgradedHash: canonicalHash };
  }

  return { isMatch: false, shouldUpgrade: false };
}
