import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  type Chain
} from 'viem';
import type { LocalAccount } from 'viem/accounts';

import { ProxyHttpClient } from './proxy.js';
import type { RelayChain } from './types.js';

class ProxyEip1193Provider {
  private id = 0;

  constructor(
    private readonly http: ProxyHttpClient,
    private readonly rpcUrl: string
  ) {}

  on(): void {}

  removeListener(): void {}

  async request(args: { method: string; params?: unknown }): Promise<unknown> {
    const payload = {
      jsonrpc: '2.0',
      id: ++this.id,
      method: args.method,
      params: args.params ?? []
    };

    const response = await this.http.request<{
      result?: unknown;
      error?: { message?: string };
    }>({
      method: 'POST',
      pathOrUrl: this.rpcUrl,
      body: payload,
      baseUrl: this.rpcUrl
    });

    if (response.error) {
      throw new Error(response.error.message ?? 'JSON-RPC request failed.');
    }

    return response.result;
  }
}

function relayChainToViemChain(chain: RelayChain): Chain {
  return defineChain({
    id: chain.id,
    name: chain.displayName,
    nativeCurrency: {
      name: chain.currency?.name ?? chain.displayName,
      symbol: chain.currency?.symbol ?? 'ETH',
      decimals: chain.currency?.decimals ?? 18
    },
    rpcUrls: {
      default: { http: [chain.httpRpcUrl] }
    },
    blockExplorers: chain.explorerUrl
      ? {
          default: {
            name: chain.explorerName ?? 'Explorer',
            url: chain.explorerUrl
          }
        }
      : undefined
  });
}

export function createChainClients(options: {
  chain: RelayChain;
  account: LocalAccount;
  http: ProxyHttpClient;
}) {
  const chain = relayChainToViemChain(options.chain);
  const provider = new ProxyEip1193Provider(options.http, options.chain.httpRpcUrl);
  const transport = custom(provider as never);

  const walletClient = createWalletClient({
    account: options.account,
    chain,
    transport
  });

  const publicClient = createPublicClient({
    chain,
    transport
  });

  return {
    account: options.account,
    chain,
    walletClient,
    publicClient
  };
}
