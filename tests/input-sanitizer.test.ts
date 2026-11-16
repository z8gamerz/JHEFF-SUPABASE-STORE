import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEmail, sanitizeNumeric, sanitizeText } from '../src/lib/security/input-sanitizer.ts';
import { hashPassword, hashPasswordLegacy, verifyPassword } from '../src/lib/security/auth-crypto.ts';

test('sanitizeText strips HTML tags, javascript URIs, and inline event handlers', () => {
  assert.equal(sanitizeText('  <script>alert(1)</script>Hello  '), 'scriptalert(1)/scriptHello');
  assert.equal(sanitizeText('javascript:doEvil()'), 'doEvil()');
  assert.equal(sanitizeText('click onclick=steal() now'), 'click steal() now');
  assert.equal(sanitizeText(null), '');
});

test('sanitizeEmail normalizes casing, whitespace, and dangerous quotes', () => {
  assert.equal(sanitizeEmail('  Owner@Store.PH  '), 'owner@store.ph');
  assert.equal(sanitizeEmail(`"bad'\\<user>@test.com`), 'baduser@test.com');
  assert.equal(sanitizeEmail(123), '');
});

test('sanitizeNumeric returns finite numbers or fallback', () => {
  assert.equal(sanitizeNumeric('42.5'), 42.5);
  assert.equal(sanitizeNumeric('not-a-number', 10), 10);
  assert.equal(sanitizeNumeric(Infinity, 5), 5);
});

test('hashPassword and verifyPassword validate canonical salted hashes and flag legacy upgrades', async () => {
  const email = 'cashier@sarisari.ph';
  const password = 'StrongPosPassword!1';
  const canonical = await hashPassword(password, email);

  const ok = await verifyPassword(password, canonical, email);
  assert.equal(ok.isMatch, true);
  assert.equal(ok.shouldUpgrade, false);

  const bad = await verifyPassword('WrongPass', canonical, email);
  assert.equal(bad.isMatch, false);

  const legacy = await hashPasswordLegacy(password);
  const legacyRes = await verifyPassword(password, legacy, email);
  assert.equal(legacyRes.isMatch, true);
  assert.equal(legacyRes.shouldUpgrade, true);
  assert.equal(legacyRes.upgradedHash, canonical);
});
