import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveAccountFromMnemonic, maskAddress } from '../src/config.js';

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

test('deriveAccountFromMnemonic rejects invalid mnemonic', () => {
  assert.throws(
    () => deriveAccountFromMnemonic('not a mnemonic', 'TEST_VAR'),
    /does not look like a valid BIP-39 seed phrase/
  );
});

test('deriveAccountFromMnemonic rejects negative address index', () => {
  assert.throws(
    () => deriveAccountFromMnemonic(TEST_MNEMONIC, 'TEST_VAR', -1),
    /non-negative integer|could not be parsed/
  );
});

test('deriveAccountFromMnemonic normalizes whitespace', () => {
  const messy = '  test  test  test  test  test  test  test  test  test  test  test  junk  ';
  const account = deriveAccountFromMnemonic(messy, 'TEST_VAR', 0);
  assert.equal(account.address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
});

test('maskAddress masks valid addresses', () => {
  assert.equal(
    maskAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
    '0xf39F...2266'
  );
});

test('maskAddress returns invalid addresses unchanged', () => {
  assert.equal(maskAddress('not-an-address'), 'not-an-address');
});
