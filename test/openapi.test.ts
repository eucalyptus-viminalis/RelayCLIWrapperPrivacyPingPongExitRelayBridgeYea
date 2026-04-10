import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findStrictGaslessBlocker,
  reduceNativeMaxAmount
} from '../src/bridge.js';
import { deriveAccountFromMnemonic } from '../src/config.js';
import { findOperation, parseKeyValueEntries } from '../src/openapi.js';
import {
  proxyUrlHasCredentials,
  redactProxyUrl,
  validateProxyUrl
} from '../src/proxy.js';

test('findOperation resolves known endpoints', () => {
  const operation = findOperation('post', '/quote/v2');
  assert.ok(operation);
  assert.equal(operation?.method, 'POST');
  assert.equal(operation?.path, '/quote/v2');
});

test('parseKeyValueEntries coerces simple JSON-like values', () => {
  const values = parseKeyValueEntries([
    'limit=10',
    'verified=true',
    'name=usdc',
    'chains=[1,10]'
  ]);

  assert.deepEqual(values, {
    limit: 10,
    verified: true,
    name: 'usdc',
    chains: [1, 10]
  });
});

test('proxy helpers validate supported proxy URLs and redact credentials', () => {
  const validated = validateProxyUrl('http://user:secret@127.0.0.1:8080');
  assert.equal(validated, 'http://user:secret@127.0.0.1:8080/');
  assert.equal(
    redactProxyUrl(validated),
    'http://***:***@127.0.0.1:8080/'
  );
  assert.equal(proxyUrlHasCredentials(validated), true);
  assert.equal(proxyUrlHasCredentials('socks5h://127.0.0.1:9050'), false);
});

test('mnemonic derivation supports account indices', () => {
  const mnemonic =
    'test test test test test test test test test test test junk';

  const first = deriveAccountFromMnemonic(mnemonic, 'RELAY_MNEMONIC', 0);
  const second = deriveAccountFromMnemonic(mnemonic, 'RELAY_MNEMONIC', 1);

  assert.equal(first.address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(second.address, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
});

test('strict gasless blocker identifies onchain wallet transaction steps', () => {
  const blocker = findStrictGaslessBlocker(
    [
      {
        id: 'approve',
        action: 'Approve token',
        description: 'Grant token allowance',
        kind: 'transaction',
        items: [
          {
            status: 'incomplete',
            data: {
              to: '0x0000000000000000000000000000000000000001',
              chainId: 42161,
              value: '0',
              gas: '21000',
              maxFeePerGas: '1'
            }
          }
        ]
      }
    ],
    [
      {
        id: 42161,
        name: 'arbitrum',
        displayName: 'Arbitrum',
        httpRpcUrl: 'https://example.invalid',
        vmType: 'evm',
        currency: {
          address: '0x0000000000000000000000000000000000000000',
          symbol: 'ETH',
          name: 'Ether',
          decimals: 18
        }
      }
    ]
  );

  assert.ok(blocker);
  assert.equal(blocker?.step.id, 'approve');
  assert.equal(blocker?.chain?.displayName, 'Arbitrum');
});

test('native max reduction leaves a safety buffer', () => {
  assert.equal(reduceNativeMaxAmount(1000n, 100n), 894n);
  assert.equal(reduceNativeMaxAmount(50n, 100n), 0n);
});
