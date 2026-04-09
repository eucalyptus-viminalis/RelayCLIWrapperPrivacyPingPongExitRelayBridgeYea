export const DEFAULT_RELAY_BASE_URL = 'https://api.relay.link';
export const DEFAULT_PROXY_URL = 'socks5h://127.0.0.1:9050';
export const PROXY_ENV_VAR = 'RELAY_PROXY_URL';
export const LEGACY_TOR_PROXY_ENV_VAR = 'RELAY_TOR_PROXY_URL';
export const DEFAULT_PRIVATE_KEY_ENV_VAR = 'RELAY_PRIVATE_KEY';
export const DEFAULT_API_KEY_ENV_VAR = 'RELAY_API_KEY';

export const CONFIG_DIRECTORY_NAME = 'relay-cli';
export const CONFIG_FILE_NAME = 'config.json';

export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

export const MAJOR_EVM_CHAIN_PREFERENCE = [
  1,
  8453,
  10,
  42161,
  137,
  43114,
  56,
  324,
  59144,
  81457
];

export const INTERMEDIATE_STATUSES = new Set([
  'pending',
  'waiting',
  'submitted',
  'delayed',
  'depositing'
]);

export const TERMINAL_FAILURE_STATUSES = new Set([
  'failure',
  'refund',
  'refunded'
]);

export const NATIVE_TOKEN_ALIASES = new Set([
  'native',
  'eth',
  'gas',
  'coin'
]);
