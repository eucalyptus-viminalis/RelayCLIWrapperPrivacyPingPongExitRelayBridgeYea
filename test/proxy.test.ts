import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getProxyKind,
  proxyUrlHasCredentials,
  redactProxyUrl,
  validateProxyUrl
} from '../src/proxy.js';

test('validateProxyUrl accepts socks5h', () => {
  const result = validateProxyUrl('socks5h://127.0.0.1:9050');
  assert.equal(result, 'socks5h://127.0.0.1:9050');
});

test('validateProxyUrl accepts http with auth', () => {
  const result = validateProxyUrl('http://user:pass@127.0.0.1:8080');
  assert.equal(result, 'http://user:pass@127.0.0.1:8080/');
});

test('validateProxyUrl rejects unsupported schemes', () => {
  assert.throws(
    () => validateProxyUrl('ftp://127.0.0.1:21'),
    /Unsupported proxy scheme/
  );
});

test('validateProxyUrl rejects garbage input', () => {
  assert.throws(
    () => validateProxyUrl('not-a-url'),
    /Invalid proxy URL/
  );
});

test('getProxyKind extracts protocol', () => {
  assert.equal(getProxyKind('socks5h://127.0.0.1:9050'), 'socks5h');
  assert.equal(getProxyKind('http://127.0.0.1:8080'), 'http');
  assert.equal(getProxyKind('https://proxy.example.com'), 'https');
});

test('getProxyKind returns unknown for garbage', () => {
  assert.equal(getProxyKind('not-a-url'), 'unknown');
});

test('redactProxyUrl masks credentials', () => {
  assert.equal(
    redactProxyUrl('http://admin:secret@127.0.0.1:8080'),
    'http://***:***@127.0.0.1:8080/'
  );
});

test('redactProxyUrl leaves auth-free URLs unchanged', () => {
  assert.equal(
    redactProxyUrl('socks5h://127.0.0.1:9050'),
    'socks5h://127.0.0.1:9050'
  );
});

test('redactProxyUrl returns garbage input unchanged', () => {
  assert.equal(redactProxyUrl('not-a-url'), 'not-a-url');
});

test('proxyUrlHasCredentials detects username', () => {
  assert.equal(proxyUrlHasCredentials('http://user@127.0.0.1:8080'), true);
});

test('proxyUrlHasCredentials returns false for clean URLs', () => {
  assert.equal(proxyUrlHasCredentials('socks5h://127.0.0.1:9050'), false);
});

test('proxyUrlHasCredentials returns false for garbage', () => {
  assert.equal(proxyUrlHasCredentials('not-a-url'), false);
});
