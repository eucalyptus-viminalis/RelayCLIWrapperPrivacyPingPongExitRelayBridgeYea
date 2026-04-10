import http from 'node:http';
import https from 'node:https';

import { ProxyAgent } from 'proxy-agent/dist/index.js';

import {
  DEFAULT_PROXY_URL,
  DEFAULT_RELAY_BASE_URL,
  LEGACY_TOR_PROXY_ENV_VAR,
  PROXY_ENV_VAR
} from './constants.js';
import { getConfiguredProxyUrlSync } from './config.js';
import type { HttpMethod } from './types.js';

export class RelayApiError extends Error {
  readonly statusCode: number;
  readonly payload: unknown;

  constructor(message: string, statusCode: number, payload: unknown) {
    super(message);
    this.name = 'RelayApiError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export class ProxyHttpClient {
  readonly baseUrl: string;
  readonly proxyUrl: string;
  private readonly agent: ProxyAgent;

  constructor(options?: { baseUrl?: string; proxyUrl?: string }) {
    this.baseUrl =
      options?.baseUrl ?? process.env.RELAY_BASE_URL ?? DEFAULT_RELAY_BASE_URL;
    this.proxyUrl = resolveProxySettings(options?.proxyUrl).url;
    this.agent = new ProxyAgent({
      getProxyForUrl: () => this.proxyUrl
    });
  }

  buildUrl(pathOrUrl: string, baseUrl = this.baseUrl): string {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }

    return new URL(pathOrUrl, baseUrl).toString();
  }

  async request<T>(options: {
    method: HttpMethod;
    pathOrUrl: string;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: unknown;
    baseUrl?: string;
  }): Promise<T> {
    const url = new URL(this.buildUrl(options.pathOrUrl, options.baseUrl));
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const entry of value) {
            url.searchParams.append(key, stringifyQueryValue(entry));
          }
        } else {
          url.searchParams.set(key, stringifyQueryValue(value));
        }
      }
    }

    const body =
      options.body !== undefined ? JSON.stringify(options.body) : undefined;

    const response = await makeRequest({
      url,
      proxyAgent: this.agent,
      method: options.method,
      headers: {
        accept: 'application/json',
        ...(body
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(body).toString()
            }
          : {}),
        ...(options.headers ?? {})
      },
      body
    }).catch((error: unknown) => {
      const candidate = error as { code?: string; message?: string };
      if (
        candidate.code === 'ECONNREFUSED' ||
        candidate.code === 'EPERM' ||
        candidate.code === 'EHOSTUNREACH' ||
        candidate.code === 'ENOTFOUND' ||
        candidate.message?.includes('connect EPERM') ||
        candidate.message?.includes('connect ECONNREFUSED')
      ) {
        throw new Error(
          `Could not reach the configured proxy at ${this.proxyUrl}. Start your proxy or set ${PROXY_ENV_VAR} to a working proxy URL. ${LEGACY_TOR_PROXY_ENV_VAR} is also supported for backwards compatibility.`
        );
      }

      throw error;
    });

    if (response.statusCode >= 400) {
      const payload =
        typeof response.body === 'object' && response.body !== null
          ? (response.body as {
              message?: string;
              errorCode?: string;
              errorData?: string;
            })
          : undefined;

      const detail =
        [
          payload?.message,
          payload?.errorCode ? `code: ${payload.errorCode}` : undefined,
          payload?.errorData ? `details: ${payload.errorData}` : undefined
        ]
          .filter(Boolean)
          .join(' || ') ||
        (response.statusCode === 403
          ? 'Request failed with status 403. Relay or an upstream edge may be rejecting this proxy exit IP.'
          : `Request failed with status ${response.statusCode}`);

      throw new RelayApiError(detail, response.statusCode, response.body);
    }

    return response.body as T;
  }
}

export function resolveProxyUrl(override?: string): string {
  return resolveProxySettings(override).url;
}

export function resolveProxySettings(override?: string): {
  url: string;
  source: 'override' | 'config' | 'env' | 'legacy_env' | 'default';
} {
  if (override) {
    return { url: override, source: 'override' };
  }

  const configuredProxyUrl = getConfiguredProxyUrlSync();
  if (configuredProxyUrl) {
    return { url: configuredProxyUrl, source: 'config' };
  }

  if (process.env[PROXY_ENV_VAR]) {
    return { url: process.env[PROXY_ENV_VAR], source: 'env' };
  }

  if (process.env[LEGACY_TOR_PROXY_ENV_VAR]) {
    return {
      url: process.env[LEGACY_TOR_PROXY_ENV_VAR],
      source: 'legacy_env'
    };
  }

  return { url: DEFAULT_PROXY_URL, source: 'default' };
}

export function getProxyKind(proxyUrl: string): string {
  try {
    const protocol = new URL(proxyUrl).protocol.replace(/:$/, '');
    return protocol || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function validateProxyUrl(proxyUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error(`Invalid proxy URL: ${proxyUrl}`);
  }

  const allowedProtocols = new Set([
    'http:',
    'https:',
    'socks:',
    'socks5:',
    'socks5h:'
  ]);

  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(
      `Unsupported proxy scheme "${parsed.protocol}". Use http, https, socks, socks5, or socks5h.`
    );
  }

  if (!parsed.hostname) {
    throw new Error(`Invalid proxy URL: ${proxyUrl}`);
  }

  return parsed.toString();
}

export function redactProxyUrl(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? '***' : '';
      parsed.password = parsed.password ? '***' : '';
    }

    return parsed.toString();
  } catch {
    return proxyUrl;
  }
}

export function proxyUrlHasCredentials(proxyUrl: string): boolean {
  try {
    const parsed = new URL(proxyUrl);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return false;
  }
}

function stringifyQueryValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

async function makeRequest(options: {
  url: URL;
  proxyAgent: ProxyAgent;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
}): Promise<{ statusCode: number; body: unknown }> {
  const client = options.url.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.request(
      options.url,
      {
        method: options.method,
        headers: options.headers,
        agent: options.proxyAgent,
        timeout: 45_000
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: response.statusCode ?? 0,
            body: parseResponseBody(rawBody)
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Request timed out.'));
    });

    request.on('error', reject);

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

function parseResponseBody(body: string): unknown {
  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
