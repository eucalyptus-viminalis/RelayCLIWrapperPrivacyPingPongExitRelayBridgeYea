import {
  DEFAULT_API_KEY_ENV_VAR,
  NATIVE_TOKEN_ADDRESS
} from './constants.js';
import { findOperation, interpolatePath } from './openapi.js';
import { ProxyHttpClient } from './proxy.js';
import type {
  HttpMethod,
  RelayChain,
  RelayOperation,
  RelayQuoteResponse,
  RelayStatusResponse
} from './types.js';

export class RelayClient {
  readonly http: ProxyHttpClient;

  constructor(options?: { baseUrl?: string; proxyUrl?: string }) {
    this.http = new ProxyHttpClient(options);
  }

  async request<T>(options: {
    method: HttpMethod;
    path: string;
    pathParams?: Record<string, string>;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<T> {
    const path = options.pathParams
      ? interpolatePath(options.path, options.pathParams)
      : options.path;

    return this.http.request<T>({
      method: options.method,
      pathOrUrl: path,
      query: options.query,
      headers: options.headers,
      body: options.body
    });
  }

  async getChains(): Promise<{ chains: RelayChain[] }> {
    return this.request({ method: 'GET', path: '/chains' });
  }

  async getCurrenciesV2(body: Record<string, unknown>) {
    return this.request<Array<Record<string, unknown>>>({
      method: 'POST',
      path: '/currencies/v2',
      body
    });
  }

  async quoteV2(body: Record<string, unknown>): Promise<RelayQuoteResponse> {
    return this.request({
      method: 'POST',
      path: '/quote/v2',
      body
    });
  }

  async getIntentStatusV3(
    requestId: string
  ): Promise<RelayStatusResponse> {
    return this.request({
      method: 'GET',
      path: '/intents/status/v3',
      query: { requestId }
    });
  }

  async genericCall(options: {
    method: string;
    path: string;
    pathParams?: Record<string, string>;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<unknown> {
    const operation = findOperation(options.method, options.path);

    if (!operation) {
      throw new Error(
        `Unknown Relay operation ${options.method.toUpperCase()} ${options.path}.`
      );
    }

    const headers = { ...(options.headers ?? {}) };
    applyRequiredHeaders(operation, headers);

    return this.request({
      method: operation.method,
      path: operation.path,
      pathParams: options.pathParams,
      query: options.query,
      headers,
      body: options.body
    });
  }
}

function applyRequiredHeaders(
  operation: RelayOperation,
  headers: Record<string, string>
): void {
  for (const parameter of operation.parameters) {
    if (parameter.location !== 'header' || !parameter.required) {
      continue;
    }

    if (headers[parameter.name]) {
      continue;
    }

    if (parameter.name.toLowerCase() === 'x-api-key') {
      const apiKey = process.env[DEFAULT_API_KEY_ENV_VAR];
      if (!apiKey) {
        throw new Error(
          `This operation requires the ${DEFAULT_API_KEY_ENV_VAR} env var or an explicit x-api-key header.`
        );
      }

      headers[parameter.name] = apiKey;
      continue;
    }

    throw new Error(`Missing required header: ${parameter.name}`);
  }
}

export function isNativeTokenCandidate(token: string): boolean {
  return token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}
