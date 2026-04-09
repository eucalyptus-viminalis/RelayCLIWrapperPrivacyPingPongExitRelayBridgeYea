import test from 'node:test';
import assert from 'node:assert/strict';

import { findOperation, parseKeyValueEntries } from '../src/openapi.js';
import { redactProxyUrl, validateProxyUrl } from '../src/proxy.js';

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
});
