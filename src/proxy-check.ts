import { DEAD_ADDRESS, NATIVE_TOKEN_ADDRESS } from './constants.js';
import { dim, errorText, heading, label, success } from './format.js';
import { RelayClient } from './relay-client.js';
import {
  getProxyKind,
  ProxyHttpClient,
  redactProxyUrl,
  RelayApiError
} from './proxy.js';

interface ProxyCheckOptions {
  wallet?: string;
  from?: string;
  to?: string;
  amount?: string;
}

export async function runProxyCheck(
  options: ProxyCheckOptions
): Promise<void> {
  const relay = new RelayClient();
  const proxyHttp = relay.http;

  console.log(heading('Proxy Check'));
  console.log(`${label('Proxy:')} ${redactProxyUrl(proxyHttp.proxyUrl)}`);
  console.log(`${label('Kind:')} ${getProxyKind(proxyHttp.proxyUrl)}`);
  console.log(`${label('Relay:')} ${proxyHttp.baseUrl}`);

  const ipResult = await checkExitIp(proxyHttp);
  printResult('Proxy reachability', ipResult.ok, ipResult.detail);

  if (!ipResult.ok) {
    return;
  }

  const chainsResult = await checkRelayChains(relay);
  printResult('Relay /chains', chainsResult.ok, chainsResult.detail);

  const quoteResult = await checkRelayQuote(relay, options);
  printResult('Relay /quote/v2', quoteResult.ok, quoteResult.detail);

  if (!quoteResult.ok && quoteResult.statusCode === 403) {
    console.log(
      dim(
        'A 403 here usually means Relay or an upstream edge is rejecting the current proxy exit IP rather than a wallet or signing issue.'
      )
    );
  }
}

async function checkExitIp(http: ProxyHttpClient): Promise<CheckResult> {
  try {
    const response = await http.request<{ ip?: string }>({
      method: 'GET',
      pathOrUrl: 'https://api.ipify.org',
      query: { format: 'json' },
      baseUrl: 'https://api.ipify.org'
    });

    return {
      ok: true,
      detail: response.ip ? `reachable, exit IP ${response.ip}` : 'reachable'
    };
  } catch (error) {
    return toCheckResult(error);
  }
}

async function checkRelayChains(relay: RelayClient): Promise<CheckResult> {
  try {
    const response = await relay.getChains();
    return {
      ok: true,
      detail: `ok, ${response.chains.length} chains returned`
    };
  } catch (error) {
    return toCheckResult(error);
  }
}

async function checkRelayQuote(
  relay: RelayClient,
  options: ProxyCheckOptions
): Promise<CheckResult> {
  const wallet = options.wallet ?? DEAD_ADDRESS;

  try {
    const response = await relay.quoteV2({
      user: wallet,
      recipient: wallet,
      originChainId: Number(options.from ?? 42161),
      destinationChainId: Number(options.to ?? 1),
      originCurrency: NATIVE_TOKEN_ADDRESS,
      destinationCurrency: NATIVE_TOKEN_ADDRESS,
      amount: options.amount ?? '1000000000000000',
      tradeType: 'EXACT_INPUT'
    });

    return {
      ok: true,
      detail: `ok, ${response.steps.length} steps returned`
    };
  } catch (error) {
    return toCheckResult(error);
  }
}

function printResult(name: string, ok: boolean, detail: string): void {
  const status = ok ? success('ok') : errorText('fail');
  console.log(`${label(name + ':')} ${status} ${detail}`);
}

function toCheckResult(error: unknown): CheckResult {
  if (error instanceof RelayApiError) {
    return {
      ok: false,
      detail: error.message,
      statusCode: error.statusCode
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      detail: error.message
    };
  }

  return {
    ok: false,
    detail: String(error)
  };
}

interface CheckResult {
  ok: boolean;
  detail: string;
  statusCode?: number;
}
