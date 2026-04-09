#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

import { Command } from 'commander';
import pc from 'picocolors';
import { isAddress } from 'viem';

import {
  getConfiguredProxyUrl,
  getPrivateKeyEnvVarName,
  readConfig,
  resolveConfiguredPrivateKey,
  setConfiguredProxyUrl,
  tryResolveConfiguredPrivateKey,
  setPrivateKeyEnvVar,
  unsetConfiguredProxyUrl,
  unsetPrivateKeyEnvVar
} from './config.js';
import {
  dim,
  errorText,
  formatStatus,
  heading,
  label,
  success
} from './format.js';
import { getOperations, findOperation, parseKeyValueEntries, searchOperations } from './openapi.js';
import {
  getProxyKind,
  redactProxyUrl,
  resolveProxySettings,
  validateProxyUrl
} from './proxy.js';
import { RelayClient } from './relay-client.js';
import { runBridge } from './bridge.js';
import { runProxyCheck } from './proxy-check.js';

const program = new Command();

program
  .name('relay')
  .description(
    'A privacy-first CLI for Relay: bridge simply, call any API endpoint, and route all network traffic through an explicit proxy.'
  )
  .showHelpAfterError()
  .option('--json', 'Print raw JSON for command output where supported');

program
  .command('bridge')
  .description('Quote and execute an EVM bridge flow through Relay.')
  .option('--from <chain>', 'Origin chain name or chain id')
  .option('--to <chain>', 'Destination chain name or chain id')
  .option('--token <token>', 'Token symbol or address for both sides')
  .option('--from-token <token>', 'Origin token symbol or address')
  .option('--to-token <token>', 'Destination token symbol or address')
  .option('--amount <amount>', 'Human-readable token amount')
  .option('--wallet <address>', 'Wallet address to use for quote context')
  .option('--recipient <address>', 'Destination recipient address')
  .option(
    '--trade-type <tradeType>',
    'Relay trade type: EXACT_INPUT, EXACT_OUTPUT, EXPECTED_OUTPUT',
    'EXACT_INPUT'
  )
  .option('--quote-only', 'Fetch and display a quote without executing it')
  .option('-y, --yes', 'Skip the confirmation prompt before execution')
  .option('--use-permit', 'Ask Relay for a permit-based path when available')
  .option('--use-external-liquidity', 'Enable Relay external liquidity routes')
  .option('--topup-gas', 'Request a destination gas top-up when supported')
  .option('--topup-gas-amount <usdDecimal>', 'Destination gas top-up amount in USD decimals')
  .option('--refund-to <address>', 'Refund recipient if execution fails')
  .option('--refund-type <type>', 'Refund chain: origin or destination')
  .option('--slippage-tolerance <bps>', 'Slippage tolerance in basis points')
  .action(async (options) => {
    validateBridgeCliOptions(options);
    const relay = new RelayClient();
    const globalOptions = program.opts<{ json?: boolean }>();
    const privateKey = options.quoteOnly
      ? (await tryResolveConfiguredPrivateKey())?.privateKey
      : (await resolveConfiguredPrivateKey()).privateKey;

    await runBridge(
      relay,
      {
        ...options,
        json: globalOptions.json
      },
      privateKey,
      Boolean(globalOptions.json)
    );
  });

const proxyCommand = program
  .command('proxy')
  .alias('tor')
  .description('Proxy diagnostics and helpers. `tor` is kept as a compatibility alias.');

proxyCommand
  .command('check')
  .description('Check proxy reachability, exit IP, and Relay connectivity through the current proxy')
  .option('--wallet <address>', 'Wallet address for the quote probe')
  .option('--from <chainId>', 'Origin chain id for the quote probe', '42161')
  .option('--to <chainId>', 'Destination chain id for the quote probe', '1')
  .option(
    '--amount <wei>',
    'Probe quote amount in smallest unit',
    '1000000000000000'
  )
  .action(async (options) => {
    if (options.wallet) {
      validateAddressOption(options.wallet, 'wallet');
    }

    await runProxyCheck(options);
  });

proxyCommand
  .command('show')
  .description('Show the resolved proxy URL and kind')
  .action(() => {
    const settings = resolveProxySettings();

    console.log(heading('Proxy'));
    console.log(`${label('Proxy:')} ${redactProxyUrl(settings.url)}`);
    console.log(`${label('Kind:')} ${getProxyKind(settings.url)}`);
    console.log(`${label('Source:')} ${settings.source.replace('_', ' ')}`);
  });

program
  .command('status')
  .description('Fetch intent status by Relay request id.')
  .argument('<requestId>', 'Relay request id')
  .action(async (requestId) => {
    const relay = new RelayClient();
    const status = await relay.getIntentStatusV3(requestId);
    const globalOptions = program.opts<{ json?: boolean }>();

    if (globalOptions.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    for (const line of formatStatus(status)) {
      console.log(line);
    }
  });

const configCommand = program
  .command('config')
  .description('Manage CLI configuration, including private-key env lookup and proxy defaults.');

configCommand
  .command('show')
  .description('Show current config and private-key env resolution.')
  .action(async () => {
    const config = await readConfig();
    const envVarName = await getPrivateKeyEnvVarName();
    const isSet = Boolean(process.env[envVarName]);
    const configuredProxyUrl = await getConfiguredProxyUrl();
    const proxySettings = resolveProxySettings();

    console.log(heading('Config'));
    console.log(`${label('Config file:')} per-user OS config storage`);
    console.log(`${label('Private key env:')} ${envVarName}`);
    console.log(`${label('Env present:')} ${isSet ? success('yes') : pc.yellow('no')}`);
    console.log(
      `${label('Proxy source:')} ${proxySettings.source.replace('_', ' ')}`
    );
    console.log(
      `${label('Resolved proxy:')} ${redactProxyUrl(proxySettings.url)}`
    );
    console.log(
      `${label('Storage:')} ${dim(
        'Private keys are never stored. Proxy URLs may be stored in per-user config, so CLI output redacts embedded credentials.'
      )}`
    );

    if (config.privateKeyEnvVar) {
      console.log(`${label('Custom override:')} ${config.privateKeyEnvVar}`);
    }

    if (configuredProxyUrl) {
      console.log(
        `${label('Configured proxy:')} ${redactProxyUrl(configuredProxyUrl)}`
      );
    }
  });

configCommand
  .command('set-private-key-env')
  .description('Store which env var the CLI should read for the private key.')
  .argument('<envVarName>', 'Shell env var name, for example RELAY_PRIVATE_KEY')
  .action(async (envVarName) => {
    await setPrivateKeyEnvVar(envVarName);
    console.log(success(`Stored private key env var name: ${envVarName}`));
  });

configCommand
  .command('unset-private-key-env')
  .description('Reset private-key lookup to the default RELAY_PRIVATE_KEY env var.')
  .action(async () => {
    await unsetPrivateKeyEnvVar();
    console.log(success('Cleared custom private key env var override.'));
  });

configCommand
  .command('set-proxy')
  .description('Store a default proxy URL so the CLI does not rely on exported proxy env vars.')
  .argument(
    '<proxyUrl>',
    'Proxy URL, for example socks5h://127.0.0.1:9150 or http://127.0.0.1:8080'
  )
  .action(async (proxyUrl) => {
    const normalized = validateProxyUrl(proxyUrl);
    await setConfiguredProxyUrl(normalized);
    console.log(
      success(`Stored proxy URL: ${redactProxyUrl(normalized)}`)
    );
  });

configCommand
  .command('unset-proxy')
  .description('Remove the stored default proxy URL.')
  .action(async () => {
    await unsetConfiguredProxyUrl();
    console.log(success('Cleared stored proxy URL.'));
  });

const apiCommand = program
  .command('api')
  .description('Browse and call the full Relay API surface from the bundled OpenAPI spec.');

apiCommand
  .command('list')
  .description('List Relay operations known to the bundled OpenAPI spec.')
  .option('--search <term>', 'Filter by path or description')
  .action((options) => {
    const operations = searchOperations(options.search);
    for (const operation of operations) {
      const notes = [
        operation.hidden ? 'hidden' : undefined,
        operation.deprecated ? 'deprecated' : undefined
      ].filter(Boolean);

      console.log(
        `${pc.bold(operation.method)} ${operation.path}${
          notes.length ? ` ${dim(`[${notes.join(', ')}]`)}` : ''
        }`
      );
    }
  });

apiCommand
  .command('describe')
  .description('Describe a specific Relay operation.')
  .argument('<method>', 'HTTP method')
  .argument('<path>', 'Operation path, for example /quote/v2')
  .action((method, path) => {
    const operation = findOperation(method, path);
    if (!operation) {
      throw new Error(`Unknown operation ${method.toUpperCase()} ${path}`);
    }

    console.log(heading(`${operation.method} ${operation.path}`));
    if (operation.description) {
      console.log(operation.description);
    }

    if (operation.parameters.length > 0) {
      console.log('');
      console.log(label('Parameters'));
      for (const parameter of operation.parameters) {
        const details = [
          parameter.location,
          parameter.type,
          parameter.required ? 'required' : 'optional'
        ]
          .filter(Boolean)
          .join(', ');
        console.log(`- ${parameter.name} (${details})`);
        if (parameter.description) {
          console.log(`  ${parameter.description}`);
        }
      }
    }

    if (operation.bodyProperties.length > 0) {
      console.log('');
      console.log(label('JSON body'));
      for (const property of operation.bodyProperties) {
        const details = [
          property.type,
          property.required ? 'required' : 'optional'
        ]
          .filter(Boolean)
          .join(', ');
        console.log(`- ${property.name} (${details})`);
        if (property.description) {
          console.log(`  ${property.description}`);
        }
      }
    }
  });

apiCommand
  .command('call')
  .description('Call any Relay API operation through the configured proxy.')
  .argument('<method>', 'HTTP method')
  .argument('<path>', 'Operation path, for example /chains or /quote/v2')
  .option(
    '--path-param <key=value>',
    'Path params for templated paths, for example wallet=0xabc',
    collect,
    []
  )
  .option(
    '--query <key=value>',
    'Query params, repeat for multiple values',
    collect,
    []
  )
  .option(
    '--header <key=value>',
    'Headers, repeat for multiple values',
    collect,
    []
  )
  .option('--body <json>', 'Inline JSON body string')
  .option('--body-file <path>', 'Read JSON body from a file')
  .action(async (method, path, options) => {
    const relay = new RelayClient();
    const pathParams = parseKeyValueEntries(options.pathParam) as Record<string, string>;
    const query = parseKeyValueEntries(options.query);
    const headers = Object.fromEntries(
      Object.entries(parseKeyValueEntries(options.header)).map(([key, value]) => [
        key,
        String(value)
      ])
    );

    let body: unknown;
    if (options.body && options.bodyFile) {
      throw new Error('Use either --body or --body-file, not both.');
    }

    if (options.body) {
      body = JSON.parse(options.body);
    } else if (options.bodyFile) {
      body = JSON.parse(await readFile(options.bodyFile, 'utf8'));
    }

    const response = await relay.genericCall({
      method,
      path,
      pathParams,
      query,
      headers,
      body
    });

    console.log(JSON.stringify(response, null, 2));
  });

program
  .command('about')
  .description('Show quick notes about the CLI and its privacy model.')
  .action(() => {
    console.log(heading('Relay CLI'));
    console.log(
      'Every outbound HTTP request in this CLI is sent through the configured proxy, including Relay API calls and EVM RPC calls.'
    );
    console.log(
      'Private keys are never written to config; only the env var name is stored.'
    );
    console.log(
      `Bundled operations: ${getOperations().length} Relay endpoints from the current OpenAPI snapshot.`
    );
  });

program.parseAsync(normalizeArgv(process.argv)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(errorText(message));
  process.exitCode = 1;
});

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function normalizeArgv(argv: string[]): string[] {
  const prefix = argv.slice(0, 2);
  const rest = argv.slice(2);

  if (rest[0] === '--') {
    return [...prefix, ...rest.slice(1)];
  }

  return argv;
}

function validateBridgeCliOptions(options: {
  wallet?: string;
  recipient?: string;
  refundTo?: string;
}): void {
  if (options.wallet) {
    validateAddressOption(options.wallet, 'wallet');
  }

  if (options.recipient) {
    validateAddressOption(options.recipient, 'recipient');
  }

  if (options.refundTo) {
    validateAddressOption(options.refundTo, 'refund');
  }
}

function validateAddressOption(value: string, labelText: string): void {
  if (!isAddress(value.trim())) {
    throw new Error(`Invalid ${labelText} address: ${value}`);
  }
}
