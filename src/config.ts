import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { isAddress, type Hex } from 'viem';
import {
  mnemonicToAccount,
  privateKeyToAccount,
  type LocalAccount
} from 'viem/accounts';

import {
  CONFIG_DIRECTORY_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_MNEMONIC_ADDRESS_INDEX,
  DEFAULT_MNEMONIC_ENV_VAR,
  DEFAULT_PRIVATE_KEY_ENV_VAR,
  MNEMONIC_ADDRESS_INDEX_ENV_VAR
} from './constants.js';
import { proxyUrlHasCredentials } from './proxy.js';
import type { StoredConfig } from './types.js';

const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/i;
const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;
const MNEMONIC_PATTERN = /^([^\s]+\s+){11,23}[^\s]+$/;

function getConfigDirectory(): string {
  const configHome =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');

  return path.join(configHome, CONFIG_DIRECTORY_NAME);
}

export function getConfigPath(): string {
  return path.join(getConfigDirectory(), CONFIG_FILE_NAME);
}

export async function readConfig(): Promise<StoredConfig> {
  try {
    const contents = await readFile(getConfigPath(), 'utf8');
    const parsed = JSON.parse(contents) as StoredConfig;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

export function readConfigSync(): StoredConfig {
  try {
    const contents = readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(contents) as StoredConfig;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function writeConfig(config: StoredConfig): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
}

export async function setPrivateKeyEnvVar(envVarName: string): Promise<void> {
  if (!ENV_VAR_NAME_PATTERN.test(envVarName)) {
    throw new Error(
      `Invalid env var name "${envVarName}". Use a shell-safe variable name like RELAY_PRIVATE_KEY.`
    );
  }

  const config = await readConfig();
  config.privateKeyEnvVar = envVarName;
  await writeConfig(config);
}

export async function unsetPrivateKeyEnvVar(): Promise<void> {
  const config = await readConfig();
  delete config.privateKeyEnvVar;
  await writeConfig(config);
}

export async function setMnemonicEnvVar(envVarName: string): Promise<void> {
  if (!ENV_VAR_NAME_PATTERN.test(envVarName)) {
    throw new Error(
      `Invalid env var name "${envVarName}". Use a shell-safe variable name like RELAY_MNEMONIC.`
    );
  }

  const config = await readConfig();
  config.mnemonicEnvVar = envVarName;
  await writeConfig(config);
}

export async function unsetMnemonicEnvVar(): Promise<void> {
  const config = await readConfig();
  delete config.mnemonicEnvVar;
  await writeConfig(config);
}

export async function setMnemonicAddressIndex(index: number): Promise<void> {
  validateMnemonicAddressIndex(index);
  const config = await readConfig();
  config.mnemonicAddressIndex = index;
  await writeConfig(config);
}

export async function unsetMnemonicAddressIndex(): Promise<void> {
  const config = await readConfig();
  delete config.mnemonicAddressIndex;
  await writeConfig(config);
}

export async function setConfiguredProxyUrl(proxyUrl: string): Promise<void> {
  if (proxyUrlHasCredentials(proxyUrl)) {
    throw new Error(
      'Refusing to store proxy credentials in config. Use RELAY_PROXY_URL or RELAY_TOR_PROXY_URL in your shell for authenticated proxies.'
    );
  }

  const config = await readConfig();
  config.proxyUrl = proxyUrl;
  await writeConfig(config);
}

export async function unsetConfiguredProxyUrl(): Promise<void> {
  const config = await readConfig();
  delete config.proxyUrl;
  await writeConfig(config);
}

export async function getConfiguredProxyUrl(): Promise<string | undefined> {
  return (await readConfig()).proxyUrl;
}

export function getConfiguredProxyUrlSync(): string | undefined {
  return readConfigSync().proxyUrl;
}

export async function getPrivateKeyEnvVarName(): Promise<string> {
  const config = await readConfig();
  return config.privateKeyEnvVar ?? DEFAULT_PRIVATE_KEY_ENV_VAR;
}

export async function getMnemonicEnvVarName(): Promise<string> {
  const config = await readConfig();
  return config.mnemonicEnvVar ?? DEFAULT_MNEMONIC_ENV_VAR;
}

export async function getMnemonicAddressIndex(): Promise<number> {
  const value = process.env[MNEMONIC_ADDRESS_INDEX_ENV_VAR];
  if (value !== undefined) {
    return parseMnemonicAddressIndex(value, MNEMONIC_ADDRESS_INDEX_ENV_VAR);
  }

  const config = await readConfig();
  return config.mnemonicAddressIndex ?? DEFAULT_MNEMONIC_ADDRESS_INDEX;
}

function validateMnemonicAddressIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Mnemonic address index must be a non-negative integer.');
  }
}

function parseMnemonicAddressIndex(
  value: string,
  sourceLabel: string
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `The value in ${sourceLabel} must be a non-negative integer.`
    );
  }

  return parsed;
}

function normalizePrivateKey(value: string, envVarName: string): Hex {
  if (!PRIVATE_KEY_PATTERN.test(value)) {
    throw new Error(
      `The value in ${envVarName} is not a valid 32-byte hex private key.`
    );
  }

  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

export function deriveAccountFromMnemonic(
  mnemonic: string,
  envVarName: string,
  addressIndex = DEFAULT_MNEMONIC_ADDRESS_INDEX
) {
  const normalized = mnemonic.trim().replace(/\s+/g, ' ');
  if (!MNEMONIC_PATTERN.test(normalized)) {
    throw new Error(
      `The value in ${envVarName} does not look like a valid BIP-39 seed phrase.`
    );
  }

  try {
    validateMnemonicAddressIndex(addressIndex);
    return mnemonicToAccount(normalized, { addressIndex });
  } catch {
    throw new Error(
      `The value in ${envVarName} could not be parsed as a valid BIP-39 seed phrase.`
    );
  }
}

export interface ResolvedSigner {
  envVarName: string;
  kind: 'private_key' | 'mnemonic';
  account: LocalAccount;
  addressIndex?: number;
}

export async function resolveConfiguredSigner(): Promise<ResolvedSigner> {
  const privateKeyEnvVarName = await getPrivateKeyEnvVarName();
  const privateKeyValue = process.env[privateKeyEnvVarName];

  if (privateKeyValue) {
    const privateKey = normalizePrivateKey(privateKeyValue, privateKeyEnvVarName);
    return {
      envVarName: privateKeyEnvVarName,
      kind: 'private_key',
      account: privateKeyToAccount(privateKey)
    };
  }

  const mnemonicEnvVarName = await getMnemonicEnvVarName();
  const mnemonicValue = process.env[mnemonicEnvVarName];
  if (mnemonicValue) {
    const addressIndex = await getMnemonicAddressIndex();
    return {
      envVarName: mnemonicEnvVarName,
      kind: 'mnemonic',
      account: deriveAccountFromMnemonic(
        mnemonicValue,
        mnemonicEnvVarName,
        addressIndex
      ),
      addressIndex
    };
  }

  throw new Error(
    `Missing signing credentials. Export ${privateKeyEnvVarName} for a raw private key or ${mnemonicEnvVarName} for a BIP-39 seed phrase before running a signing command.`
  );
}

export async function resolveConfiguredPrivateKey(): Promise<{
  envVarName: string;
  privateKey: Hex;
}> {
  const envVarName = await getPrivateKeyEnvVarName();
  const value = process.env[envVarName];

  if (!value) {
    throw new Error(
      `Missing private key. Export ${envVarName} in your shell before running a signing command.`
    );
  }

  return { envVarName, privateKey: normalizePrivateKey(value, envVarName) };
}

export async function tryResolveConfiguredSigner(): Promise<
  ResolvedSigner | undefined
> {
  const privateKeyEnvVarName = await getPrivateKeyEnvVarName();
  const privateKeyValue = process.env[privateKeyEnvVarName];

  if (privateKeyValue) {
    return {
      envVarName: privateKeyEnvVarName,
      kind: 'private_key',
      account: privateKeyToAccount(
        normalizePrivateKey(privateKeyValue, privateKeyEnvVarName)
      )
    };
  }

  const mnemonicEnvVarName = await getMnemonicEnvVarName();
  const mnemonicValue = process.env[mnemonicEnvVarName];

  if (mnemonicValue) {
    const addressIndex = await getMnemonicAddressIndex();
    return {
      envVarName: mnemonicEnvVarName,
      kind: 'mnemonic',
      account: deriveAccountFromMnemonic(
        mnemonicValue,
        mnemonicEnvVarName,
        addressIndex
      ),
      addressIndex
    };
  }

  return undefined;
}

export async function tryResolveConfiguredPrivateKey(): Promise<
  | {
      envVarName: string;
      privateKey: Hex;
    }
  | undefined
> {
  const envVarName = await getPrivateKeyEnvVarName();
  const value = process.env[envVarName];

  if (!value) {
    return undefined;
  }

  return { envVarName, privateKey: normalizePrivateKey(value, envVarName) };
}

export function maskAddress(address: string): string {
  if (!isAddress(address)) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
