import prompts, { type PromptObject } from 'prompts';
import {
  isAddress,
  parseUnits,
  type Address,
  type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  DEAD_ADDRESS,
  INTERMEDIATE_STATUSES,
  MAJOR_EVM_CHAIN_PREFERENCE,
  NATIVE_TOKEN_ADDRESS,
  NATIVE_TOKEN_ALIASES,
  TERMINAL_FAILURE_STATUSES
} from './constants.js';
import {
  dim,
  formatChain,
  formatQuoteSummary,
  heading,
  label,
  shortenAddress,
  success,
  warn
} from './format.js';
import { RelayClient } from './relay-client.js';
import { createChainClients } from './rpc.js';
import type {
  BridgeOptions,
  RelayChain,
  RelayChainCurrency,
  RelayQuoteResponse,
  RelaySignatureStepData,
  RelayStatusResponse,
  RelayStepCheck,
  RelayStepItem,
  RelayTransactionStepData
} from './types.js';

interface ResolvedBridgeInputs {
  originChain: RelayChain;
  destinationChain: RelayChain;
  originCurrency: RelayChainCurrency;
  destinationCurrency: RelayChainCurrency;
  recipient: Address;
  amountWei: bigint;
  userAddress: Address;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runBridge(
  relay: RelayClient,
  options: BridgeOptions,
  privateKey: Hex | undefined,
  outputJson = false
): Promise<void> {
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  validateBridgeInputsBeforeNetwork(options);
  const { chains } = await relay.getChains();
  const inputs = await resolveBridgeInputs(
    relay,
    chains,
    options,
    account?.address
  );

  const quoteRequest = {
    user: inputs.userAddress,
    recipient: inputs.recipient,
    originChainId: inputs.originChain.id,
    destinationChainId: inputs.destinationChain.id,
    originCurrency: inputs.originCurrency.address,
    destinationCurrency: inputs.destinationCurrency.address,
    amount: inputs.amountWei.toString(),
    tradeType: options.tradeType ?? 'EXACT_INPUT',
    topupGas: options.topupGas,
    topupGasAmount: options.topupGasAmount,
    refundTo: options.refundTo,
    refundType: options.refundType,
    usePermit: options.usePermit,
    useExternalLiquidity: options.useExternalLiquidity,
    slippageTolerance: options.slippageTolerance
  };

  const quote = await relay.quoteV2(stripUndefined(quoteRequest));

  if (outputJson) {
    console.log(JSON.stringify(quote, null, 2));
  } else {
    for (const line of formatQuoteSummary(quote)) {
      console.log(line);
    }

    console.log(
      `${label('Route:')} ${formatChain(inputs.originChain)} -> ${formatChain(
        inputs.destinationChain
      )}`
    );
    console.log(
      `${label('Wallet:')} ${shortenAddress(inputs.userAddress)} via ${dim(
        'proxy'
      )}`
    );
    if (!privateKey) {
      console.log(
        `${label('Mode:')} ${dim(
          inputs.userAddress.toLowerCase() === DEAD_ADDRESS.toLowerCase()
            ? 'quote-only with placeholder wallet context'
            : 'quote-only without signing credentials'
        )}`
      );
    }
  }

  if (options.quoteOnly) {
    return;
  }

  if (!privateKey) {
    throw new Error(
      'Missing private key. Export RELAY_PRIVATE_KEY in your shell before running a signing command.'
    );
  }

  if (!options.yes) {
    const confirmation = await prompts({
      type: 'confirm',
      name: 'accepted',
      message: 'Submit the quote steps now?',
      initial: true
    });

    if (!confirmation.accepted) {
      console.log(warn('Cancelled before execution.'));
      return;
    }
  }

  await executeQuoteSteps(relay, quote, chains, privateKey, outputJson);
}

async function resolveBridgeInputs(
  relay: RelayClient,
  chains: RelayChain[],
  options: BridgeOptions,
  signerAddress?: Address
): Promise<ResolvedBridgeInputs> {
  const promptValues = await promptForMissingOptions(options, signerAddress);

  const originChain = resolveChain(
    chains,
    promptValues.from ?? options.from,
    'origin chain'
  );
  const destinationChain = resolveChain(
    chains,
    promptValues.to ?? options.to,
    'destination chain'
  );

  const tokenInput =
    promptValues.token ?? options.token ?? promptValues.fromToken ?? options.fromToken;
  const destinationTokenInput =
    promptValues.toToken ?? options.toToken ?? tokenInput;

  if (!tokenInput || !destinationTokenInput) {
    throw new Error(
      'Missing token selection. Provide --token or both --from-token and --to-token.'
    );
  }

  const amount = promptValues.amount ?? options.amount;
  if (!amount) {
    throw new Error('Missing bridge amount.');
  }

  const originCurrency = await resolveCurrencyOnChain(relay, originChain, tokenInput);
  const destinationCurrency = await resolveCurrencyOnChain(
    relay,
    destinationChain,
    destinationTokenInput
  );

  const walletInput =
    promptValues.wallet && promptValues.wallet.trim().length > 0
      ? promptValues.wallet
      : options.wallet;
  const explicitWalletAddress = walletInput
    ? normalizeAddress(walletInput, 'wallet')
    : undefined;

  if (
    explicitWalletAddress &&
    signerAddress &&
    explicitWalletAddress.toLowerCase() !== signerAddress.toLowerCase()
  ) {
    throw new Error(
      'The provided --wallet address does not match the configured private key.'
    );
  }

  const userAddress =
    explicitWalletAddress ??
    signerAddress ??
    (options.quoteOnly ? (DEAD_ADDRESS as Address) : undefined);

  if (!userAddress) {
    throw new Error(
      'Missing wallet context. Set a private key or pass --wallet for quote-only requests.'
    );
  }

  const recipientInput =
    promptValues.recipient && promptValues.recipient.trim().length > 0
      ? promptValues.recipient
      : options.recipient ??
        explicitWalletAddress ??
        signerAddress ??
        (DEAD_ADDRESS as Address);
  const recipient = normalizeRecipient(recipientInput);

  return {
    originChain,
    destinationChain,
    originCurrency,
    destinationCurrency,
    recipient,
    amountWei: parseUnits(amount, originCurrency.decimals),
    userAddress
  };
}

async function promptForMissingOptions(
  options: BridgeOptions,
  signerAddress?: Address
): Promise<Partial<BridgeOptions>> {
  const questions: PromptObject[] = [];

  if (!options.from) {
    questions.push({
      type: 'text',
      name: 'from',
      message: 'Origin chain',
      initial: 'base'
    });
  }

  if (!options.to) {
    questions.push({
      type: 'text',
      name: 'to',
      message: 'Destination chain',
      initial: 'optimism'
    });
  }

  if (!options.token && !options.fromToken) {
    questions.push({
      type: 'text',
      name: 'token',
      message: 'Token symbol or address',
      initial: 'usdc'
    });
  }

  if (!options.toToken && !options.token) {
    questions.push({
      type: 'text',
      name: 'toToken',
      message: 'Destination token symbol or address',
      initial: 'usdc'
    });
  }

  if (!options.amount) {
    questions.push({
      type: 'text',
      name: 'amount',
      message: 'Amount',
      initial: '1'
    });
  }

  if (!options.recipient) {
    questions.push({
      type: 'text',
      name: 'recipient',
      message: 'Recipient address (blank = same wallet)'
    });
  }

  if (options.quoteOnly && !options.wallet && !signerAddress) {
    questions.push({
      type: 'text',
      name: 'wallet',
      message: 'Wallet address for quote context (blank = placeholder wallet)'
    });
  }

  if (questions.length === 0 || !process.stdin.isTTY) {
    return {};
  }

  const response = await prompts(questions, {
    onCancel: () => {
      throw new Error('Cancelled.');
    }
  });

  return response as Partial<BridgeOptions>;
}

function resolveChain(
  chains: RelayChain[],
  input: string | undefined,
  labelText: string
): RelayChain {
  if (!input) {
    throw new Error(`Missing ${labelText}.`);
  }

  const evmChains = chains
    .filter((chain) => chain.vmType === 'evm' && !chain.disabled)
    .sort((left, right) => {
      const leftRank = MAJOR_EVM_CHAIN_PREFERENCE.indexOf(left.id);
      const rightRank = MAJOR_EVM_CHAIN_PREFERENCE.indexOf(right.id);
      return normalizeRank(leftRank) - normalizeRank(rightRank);
    });

  const normalized = input.toLowerCase();
  const exactId = Number(input);

  return (
    evmChains.find((chain) => chain.id === exactId) ??
    evmChains.find((chain) =>
      [
        chain.name,
        chain.displayName,
        slugify(chain.name),
        slugify(chain.displayName),
        String(chain.id)
      ].some((candidate) => candidate.toLowerCase() === normalized)
    ) ??
    raise(`Unknown ${labelText}: ${input}.`)
  );
}

function normalizeRank(rank: number): number {
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

async function resolveCurrencyOnChain(
  relay: RelayClient,
  chain: RelayChain,
  tokenInput: string
): Promise<RelayChainCurrency> {
  const normalized = tokenInput.trim();
  const lowercase = normalized.toLowerCase();

  if (
    NATIVE_TOKEN_ALIASES.has(lowercase) ||
    lowercase === chain.currency?.symbol.toLowerCase() ||
    lowercase === NATIVE_TOKEN_ADDRESS.toLowerCase()
  ) {
    return {
      ...(chain.currency ?? {
        symbol: 'ETH',
        name: 'Native Token',
        decimals: 18
      }),
      chainId: chain.id,
      address: NATIVE_TOKEN_ADDRESS
    };
  }

  const currencies = await relay.getCurrenciesV2({
    chainIds: [chain.id],
    limit: 25,
    verified: true,
    ...(normalized.startsWith('0x')
      ? { address: normalized }
      : { term: normalized })
  });

  const typedCurrencies = currencies as unknown as RelayChainCurrency[];
  const matched =
    typedCurrencies.find(
      (currency) =>
        currency.address.toLowerCase() === lowercase ||
        currency.symbol.toLowerCase() === lowercase
    ) ??
    typedCurrencies.find(
      (currency) => slugify(currency.name) === slugify(normalized)
    ) ??
    typedCurrencies[0];

  if (!matched) {
    throw new Error(
      `Could not resolve token "${tokenInput}" on ${chain.displayName}.`
    );
  }

  return matched;
}

async function executeQuoteSteps(
  relay: RelayClient,
  quote: RelayQuoteResponse,
  chains: RelayChain[],
  privateKey: Hex,
  outputJson: boolean
): Promise<void> {
  const chainCache = new Map<number, ReturnType<typeof createChainClients>>();

  for (const step of quote.steps) {
    const items = step.items ?? [];
    if (items.length === 0) {
      continue;
    }

    if (!outputJson) {
      console.log('');
      console.log(heading(`Step: ${step.id}`));
      console.log(`${label('Action:')} ${step.action}`);
      console.log(`${label('Details:')} ${step.description}`);
    }

    for (const item of items) {
      if (step.kind === 'transaction') {
        const txHash = await submitTransactionStep(
          relay,
          chains,
          chainCache,
          privateKey,
          item,
          outputJson
        );

        if (!outputJson) {
          console.log(`${label('Submitted:')} ${txHash}`);
        }
      } else if (step.kind === 'signature') {
        const signature = await submitSignatureStep(relay, privateKey, item);

        if (!outputJson) {
          console.log(`${label('Signed:')} ${signature.slice(0, 14)}...`);
        }
      } else {
        throw new Error(`Unsupported step kind: ${step.kind}`);
      }

      if (item.check) {
        const status = await waitForCompletion(relay, item.check, outputJson);

        if (!outputJson) {
          console.log(`${label('Check:')} ${success(status.status)}`);
        }
      }
    }
  }

  if (!outputJson) {
    console.log('');
    console.log(success('All steps completed.'));
  }
}

async function submitTransactionStep(
  relay: RelayClient,
  chains: RelayChain[],
  chainCache: Map<number, ReturnType<typeof createChainClients>>,
  privateKey: Hex,
  item: RelayStepItem,
  outputJson: boolean
): Promise<string> {
  const transaction = item.data as RelayTransactionStepData | undefined;
  if (!transaction?.to || !transaction.chainId) {
    throw new Error('Relay returned a transaction step without complete data.');
  }

  const chain = chains.find((candidate) => candidate.id === transaction.chainId);
  if (!chain) {
    throw new Error(`Relay chain ${transaction.chainId} is not known.`);
  }

  let clients = chainCache.get(chain.id);
  if (!clients) {
    clients = createChainClients({
      chain,
      privateKey,
      http: relay.http
    });
    chainCache.set(chain.id, clients);
  }

  const request = {
    account: clients.account,
    to: transaction.to as Address,
    data: transaction.data as Hex | undefined,
    value: BigInt(transaction.value ?? '0'),
    ...(transaction.gas ? { gas: BigInt(transaction.gas) } : {}),
    ...(transaction.gasPrice
      ? { gasPrice: BigInt(transaction.gasPrice) }
      : {
          ...(transaction.maxFeePerGas
            ? { maxFeePerGas: BigInt(transaction.maxFeePerGas) }
            : {}),
          ...(transaction.maxPriorityFeePerGas
            ? { maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas) }
            : {})
        })
  };

  const txHash = await clients.walletClient.sendTransaction(request);

  await clients.publicClient.waitForTransactionReceipt({
    hash: txHash
  });

  if (!outputJson) {
    console.log(
      `${dim('  onchain')} ${formatChain(chain)} ${shortenAddress(txHash)}`
    );
  }

  return txHash;
}

async function submitSignatureStep(
  relay: RelayClient,
  privateKey: Hex,
  item: RelayStepItem
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const signatureData = item.data as RelaySignatureStepData | undefined;
  if (!signatureData?.sign) {
    throw new Error('Relay returned a signature step without sign payload.');
  }

  const signature =
    signatureData.sign.signatureKind === 'eip712'
      ? await account.signTypedData({
          domain: signatureData.sign.domain as Record<string, unknown>,
          types: signatureData.sign.types as Record<
            string,
            Array<{ name: string; type: string }>
          >,
          primaryType: signatureData.sign.primaryType as string,
          message: signatureData.sign.value as Record<string, unknown>
        })
      : await account.signMessage({
          message:
            signatureData.sign.message?.startsWith('0x')
              ? { raw: signatureData.sign.message as Hex }
              : signatureData.sign.message ?? ''
        });

  if (signatureData.post) {
    await relay.request({
      method: signatureData.post.method,
      path: signatureData.post.endpoint,
      query: { signature },
      body: signatureData.post.body
    });
  }

  return signature;
}

async function waitForCompletion(
  relay: RelayClient,
  check: RelayStepCheck,
  outputJson: boolean
): Promise<RelayStatusResponse> {
  for (;;) {
    const status = (await relay.request({
      method: check.method,
      path: check.endpoint
    })) as RelayStatusResponse;

    if (status.status === 'success') {
      return status;
    }

    if (TERMINAL_FAILURE_STATUSES.has(status.status)) {
      throw new Error(
        `Relay reported terminal status ${status.status}${status.details ? `: ${status.details}` : ''}.`
      );
    }

    if (!INTERMEDIATE_STATUSES.has(status.status)) {
      return status;
    }

    if (!outputJson) {
      console.log(`${dim('  waiting')} ${status.status}`);
    }

    await sleep(2_500);
  }
}

function normalizeRecipient(value: string): Address {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Recipient cannot be blank once provided.');
  }

  return normalizeAddress(trimmed, 'recipient');
}

function normalizeAddress(value: string, labelText: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`Invalid ${labelText} address: ${value}`);
  }

  return trimmed;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, candidate]) => candidate !== undefined)
  ) as T;
}

function raise(message: string): never {
  throw new Error(message);
}

function validateBridgeInputsBeforeNetwork(options: BridgeOptions): void {
  if (options.wallet) {
    normalizeAddress(options.wallet, 'wallet');
  }

  if (options.recipient) {
    normalizeAddress(options.recipient, 'recipient');
  }

  if (options.refundTo) {
    normalizeAddress(options.refundTo, 'refund');
  }
}
