import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatChain,
  formatStatus,
  formatTokenAmount,
  shortenAddress
} from '../src/format.js';

test('shortenAddress shortens a valid address', () => {
  const result = shortenAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(result, '0xf39F...2266');
});

test('shortenAddress returns invalid input unchanged', () => {
  assert.equal(shortenAddress('hello'), 'hello');
});

test('formatTokenAmount formats wei to human-readable', () => {
  const result = formatTokenAmount('1000000', {
    decimals: 6,
    symbol: 'USDC'
  });
  assert.equal(result, '1 USDC');
});

test('formatTokenAmount returns n/a for undefined amount', () => {
  assert.equal(
    formatTokenAmount(undefined, { decimals: 18, symbol: 'ETH' }),
    'n/a'
  );
});

test('formatTokenAmount returns n/a for undefined currency', () => {
  assert.equal(formatTokenAmount('100', undefined), 'n/a');
});

test('formatChain includes display name and id', () => {
  const result = formatChain({
    id: 42161,
    name: 'arbitrum',
    displayName: 'Arbitrum',
    httpRpcUrl: 'https://example.invalid',
    vmType: 'evm'
  });
  assert.ok(result.includes('Arbitrum'));
  assert.ok(result.includes('42161'));
});

test('formatStatus includes state', () => {
  const lines = formatStatus({ status: 'success' });
  assert.ok(lines.some((line) => line.includes('success')));
});

test('formatStatus includes tx hashes when present', () => {
  const lines = formatStatus({
    status: 'success',
    txHashes: ['0xabc'],
    inTxHashes: ['0xdef']
  });
  assert.ok(lines.some((line) => line.includes('0xabc')));
  assert.ok(lines.some((line) => line.includes('0xdef')));
});
