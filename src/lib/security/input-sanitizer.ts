/**
 * Input Sanitization & Security Helper
 * Prevents Cross-Site Scripting (XSS), script injection, and invalid characters
 * from entering user inputs, customer names, notes, and receipts.
 */

export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '') // Strip HTML tags
    .replace(/javascript:/gi, '') // Strip inline JS protocols
    .replace(/on\w+=/gi, '') // Strip event handler injection (onclick, onerror, etc.)
    .trim();
}

export function sanitizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  return email
    .trim()
    .toLowerCase()
    .replace(/[<>'"\\]/g, '');
}

export function sanitizeNumeric(value: unknown, fallback: number = 0): number {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return num;
}
