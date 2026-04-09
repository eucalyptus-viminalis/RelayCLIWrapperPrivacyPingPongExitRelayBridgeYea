import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { isAddress, type Hex } from 'viem';

import {
  CONFIG_DIRECTORY_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_PRIVATE_KEY_ENV_VAR
} from './constants.js';
import type { StoredConfig } from './types.js';

const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/i;
const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;

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

export async function setConfiguredProxyUrl(proxyUrl: string): Promise<void> {
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

  if (!PRIVATE_KEY_PATTERN.test(value)) {
    throw new Error(
      `The value in ${envVarName} is not a valid 32-byte hex private key.`
    );
  }

  const normalized = (value.startsWith('0x') ? value : `0x${value}`) as Hex;
  return { envVarName, privateKey: normalized };
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

  if (!PRIVATE_KEY_PATTERN.test(value)) {
    throw new Error(
      `The value in ${envVarName} is not a valid 32-byte hex private key.`
    );
  }

  const normalized = (value.startsWith('0x') ? value : `0x${value}`) as Hex;
  return { envVarName, privateKey: normalized };
}

export function maskAddress(address: string): string {
  if (!isAddress(address)) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
