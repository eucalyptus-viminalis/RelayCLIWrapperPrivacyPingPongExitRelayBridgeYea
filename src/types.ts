export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RelayChainCurrency {
  id?: string;
  chainId?: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  supportsBridging?: boolean;
  metadata?: {
    logoURI?: string;
    verified?: boolean;
    isNative?: boolean;
  };
}

export interface RelayChain {
  id: number;
  name: string;
  displayName: string;
  httpRpcUrl: string;
  wsRpcUrl?: string;
  explorerUrl?: string;
  explorerName?: string;
  disabled?: boolean;
  vmType: string;
  currency?: RelayChainCurrency;
}

export interface RelayStepCheck {
  endpoint: string;
  method: HttpMethod;
}

export interface RelayTransactionStepData {
  from?: string;
  to: string;
  data?: string;
  value?: string;
  gas?: string | number;
  chainId: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

export interface RelaySignaturePayload {
  signatureKind: 'eip191' | 'eip712' | string;
  message?: string;
  domain?: Record<string, unknown>;
  types?: Record<string, Array<{ name: string; type: string }>>;
  primaryType?: string;
  value?: Record<string, unknown>;
}

export interface RelaySignaturePost {
  endpoint: string;
  method: HttpMethod;
  body?: Record<string, unknown>;
}

export interface RelaySignatureStepData {
  sign: RelaySignaturePayload;
  post?: RelaySignaturePost;
}

export interface RelayStepItem {
  status: string;
  data?: RelayTransactionStepData | RelaySignatureStepData | Record<string, unknown>;
  check?: RelayStepCheck;
}

export interface RelayStep {
  id: string;
  action: string;
  description: string;
  kind: 'transaction' | 'signature' | string;
  requestId?: string;
  items?: RelayStepItem[];
}

export interface RelayQuoteResponse {
  steps: RelayStep[];
  fees?: Record<string, unknown>;
  breakdown?: Array<Record<string, unknown>> | Record<string, unknown>;
  balances?: Record<string, unknown>;
  details?: {
    operation?: string;
    timeEstimate?: number;
    sender?: string;
    recipient?: string;
    rate?: string;
    totalImpact?: {
      usd?: string;
      percent?: string;
    };
    currencyIn?: {
      currency: RelayChainCurrency;
      amount: string;
      amountFormatted?: string;
    };
    currencyOut?: {
      currency: RelayChainCurrency;
      amount: string;
      amountFormatted?: string;
    };
  };
  protocol?: Record<string, unknown>;
}

export interface RelayStatusResponse {
  status: string;
  details?: string;
  inTxHashes?: string[];
  txHashes?: string[];
  updatedAt?: number;
  originChainId?: number;
  destinationChainId?: number;
}

export interface StoredConfig {
  privateKeyEnvVar?: string;
  mnemonicEnvVar?: string;
  mnemonicAddressIndex?: number;
  proxyUrl?: string;
}

export interface RelayOperationParameter {
  name: string;
  location: 'path' | 'query' | 'header';
  required: boolean;
  description?: string;
  type?: string;
  enumValues?: string[];
}

export interface RelayOperationBodyProperty {
  name: string;
  required: boolean;
  description?: string;
  type?: string;
  enumValues?: string[];
}

export interface RelayOperation {
  method: HttpMethod;
  path: string;
  description?: string;
  deprecated: boolean;
  hidden: boolean;
  parameters: RelayOperationParameter[];
  bodyProperties: RelayOperationBodyProperty[];
}

export interface BridgeOptions {
  from?: string;
  to?: string;
  token?: string;
  fromToken?: string;
  toToken?: string;
  amount?: string;
  max?: boolean;
  wallet?: string;
  recipient?: string;
  tradeType?: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'EXPECTED_OUTPUT';
  quoteOnly?: boolean;
  yes?: boolean;
  usePermit?: boolean;
  strictGasless?: boolean;
  useExternalLiquidity?: boolean;
  topupGas?: boolean;
  topupGasAmount?: string;
  refundTo?: string;
  refundType?: 'origin' | 'destination';
  slippageTolerance?: string;
  json?: boolean;
}
