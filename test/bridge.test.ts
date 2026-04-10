import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findStrictGaslessBlocker,
  reduceNativeMaxAmount
} from '../src/bridge.js';
import type { RelayChain, RelayStep } from '../src/types.js';

const ARBITRUM_CHAIN: RelayChain = {
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
};

test('reduceNativeMaxAmount subtracts overshoot plus safety buffer', () => {
  assert.equal(reduceNativeMaxAmount(1000n, 100n), 894n);
});

test('reduceNativeMaxAmount returns 0 when overshoot exceeds amount', () => {
  assert.equal(reduceNativeMaxAmount(50n, 100n), 0n);
});

test('reduceNativeMaxAmount returns 0 for equal values', () => {
  assert.equal(reduceNativeMaxAmount(100n, 100n), 0n);
});

test('reduceNativeMaxAmount handles tiny amounts', () => {
  assert.equal(reduceNativeMaxAmount(2n, 1n), 0n);
});

test('findStrictGaslessBlocker returns undefined for signature-only steps', () => {
  const steps: RelayStep[] = [
    {
      id: 'permit',
      action: 'Sign permit',
      description: 'Sign a gasless permit',
      kind: 'signature',
      items: [
        {
          status: 'incomplete',
          data: {
            sign: { signatureKind: 'eip712' }
          }
        }
      ]
    }
  ];

  assert.equal(findStrictGaslessBlocker(steps, [ARBITRUM_CHAIN]), undefined);
});

test('findStrictGaslessBlocker detects transaction steps', () => {
  const steps: RelayStep[] = [
    {
      id: 'deposit',
      action: 'Deposit tokens',
      description: 'Submit a deposit transaction',
      kind: 'transaction',
      items: [
        {
          status: 'incomplete',
          data: {
            to: '0x0000000000000000000000000000000000000001',
            chainId: 42161,
            value: '0'
          }
        }
      ]
    }
  ];

  const blocker = findStrictGaslessBlocker(steps, [ARBITRUM_CHAIN]);
  assert.ok(blocker);
  assert.equal(blocker?.step.id, 'deposit');
});

test('findStrictGaslessBlocker skips completed items', () => {
  const steps: RelayStep[] = [
    {
      id: 'approve',
      action: 'Approve',
      description: 'Approve token',
      kind: 'transaction',
      items: [
        {
          status: 'complete',
          data: {
            to: '0x0000000000000000000000000000000000000001',
            chainId: 42161,
            value: '0'
          }
        }
      ]
    }
  ];

  assert.equal(findStrictGaslessBlocker(steps, [ARBITRUM_CHAIN]), undefined);
});

test('findStrictGaslessBlocker returns undefined for empty steps', () => {
  assert.equal(findStrictGaslessBlocker([], [ARBITRUM_CHAIN]), undefined);
});
