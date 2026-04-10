# Relay CLI

A privacy-first TypeScript CLI for [Relay](https://docs.relay.link/references/api/overview).

Every outbound HTTP request from the CLI is routed through an explicit proxy. That includes Relay API calls and onchain JSON-RPC calls used to sign and submit EVM transactions.

## What it does

- Makes common EVM bridge flows simple with a single `bridge` command
- Searches Relay-supported tokens by name or symbol with a simple `token search` command
- Exposes the full Relay API surface through a spec-driven `api` command
- Keeps signing secrets out of config files by storing only the environment variable names that should be used

## Requirements

- Node.js 20+
- An explicit proxy
  - Default: `socks5h://127.0.0.1:9050`
  - Preferred override: `RELAY_PROXY_URL`
  - Backwards-compatible alias: `RELAY_TOR_PROXY_URL`
  - Supported schemes depend on the proxy agent and include `socks5h`, `socks5`, `http`, and `https`

## Install

```bash
pnpm install
pnpm build
```

For local development:

```bash
pnpm dev -- --help
```

## Signing setup

The CLI never stores a raw private key or seed phrase. It only stores the env var names to read from.

```bash
export RELAY_PRIVATE_KEY=<your-private-key>
pnpm relay -- config show
```

You can also use a BIP-39 seed phrase. The CLI derives the first standard EVM account locally:

```bash
export RELAY_MNEMONIC="word1 word2 word3 ..."
pnpm relay -- config show
```

To inspect which addresses your mnemonic maps to locally:

```bash
pnpm relay -- wallet derive
pnpm relay -- wallet derive --start-index 0 --count 5
```

To make the CLI use a different derived address index:

```bash
pnpm relay -- config set-mnemonic-index 1
pnpm relay -- config show
```

To point the CLI at a different env var:

```bash
pnpm relay -- config set-private-key-env WALLET_PK
export WALLET_PK=<your-private-key>
```

To point the CLI at a different mnemonic env var:

```bash
pnpm relay -- config set-mnemonic-env WALLET_SEED
export WALLET_SEED="word1 word2 word3 ..."
```

To reset back to the default env var name:

```bash
pnpm relay -- config unset-private-key-env
pnpm relay -- config unset-mnemonic-env
pnpm relay -- config unset-mnemonic-index
```

## Proxy setup

To store a default proxy URL in your per-user config:

```bash
pnpm relay -- config set-proxy socks5h://127.0.0.1:9150
```

For authenticated proxies, prefer an env var instead of storing credentials in config:

```bash
export RELAY_PROXY_URL="http://user:pass@127.0.0.1:8080"
```

To remove the stored proxy and fall back to env vars or the default:

```bash
pnpm relay -- config unset-proxy
pnpm relay -- config show
```

## JSON output

Most commands support `--json` for machine-readable output:

```bash
pnpm relay -- --json bridge --from base --to optimism --token usdc --amount 25 --quote-only
pnpm relay -- --json status 0xrequestid
pnpm relay -- --json wallet derive
pnpm relay -- --json token search usdc
```

## Examples

Preview a bridge quote:

```bash
pnpm relay -- bridge --from base --to optimism --token usdc --amount 25 --quote-only
```

Use your exact origin-token balance instead of typing an amount:

```bash
pnpm relay -- bridge arbitrum:weth ethereum:eth --max --quote-only --wallet 0xYourWalletAddress
pnpm relay -- bridge arbitrum:weth ethereum:eth --max --use-permit
```

The `bridge` command also accepts a compact shorthand:

```bash
pnpm relay -- bridge arbitrum:weth ethereum:eth 0.01 --quote-only
```

Preview a quote with a specific wallet context, without needing a configured private key:

```bash
pnpm relay -- bridge --from arbitrum --to ethereum --token weth --amount 0.01 --quote-only --wallet 0xYourWalletAddress
```

Bridge and execute the steps with your configured signer:

```bash
pnpm relay -- bridge --from ethereum --to base --token eth --amount 0.05
```

When you want Relay's permit-based route for the most gas-efficient ERC-20 path, add:

```bash
pnpm relay -- bridge arbitrum:weth ethereum:eth 0.01 --use-permit
```

When you want the CLI to refuse any route that still needs an onchain wallet transaction, add strict gasless mode:

```bash
pnpm relay -- bridge arbitrum:weth ethereum:eth 0.01 --quote-only --strict-gasless
pnpm relay -- bridge arbitrum:weth ethereum:eth 0.01 --use-permit --strict-gasless
```

Check status:

```bash
pnpm relay -- status 0xrequestid
```

Check whether your configured proxy is reachable and whether Relay is accessible through the current exit:

```bash
pnpm relay -- proxy check
pnpm relay -- proxy check --wallet 0xYourWalletAddress
```

Show which proxy the CLI is currently using:

```bash
pnpm relay -- proxy show
```

Browse the Relay API surface:

```bash
pnpm relay -- api list
pnpm relay -- api describe POST /quote/v2
```

Search tokens by name or symbol:

```bash
pnpm relay -- token search "wrapped ether" --chain arbitrum
pnpm relay -- token search weth --limit 5
```

Call any Relay endpoint:

```bash
pnpm relay -- api call GET /chains
pnpm relay -- api call POST /quote/v2 --body '{"user":"0x...","originChainId":8453,"destinationChainId":10,"originCurrency":"0x0000000000000000000000000000000000000000","destinationCurrency":"0x0000000000000000000000000000000000000000","amount":"100000000000000000","tradeType":"EXACT_INPUT"}'
```

Show a quick summary of the CLI and its privacy model:

```bash
pnpm relay -- about
```

## Security notes

- The CLI fails closed: if the configured proxy is unavailable, requests fail instead of falling back to a direct connection.
- The `config` command never stores a private key or seed phrase. It can store an auth-free proxy URL; use env vars for authenticated proxies.
- `bridge --quote-only` does not require signing credentials. If you omit `--wallet`, the CLI uses a placeholder wallet context for the quote.
- `bridge --max` uses your full ERC-20 balance. For native-token routes it automatically reserves origin-chain gas instead of trying to spend the entire native balance.
- `proxy check` helps distinguish between “the proxy is down” and “Relay is rejecting the current proxy exit”.
- Permit-based execution is now followed end-to-end, including any follow-up steps returned by Relay after you submit a permit signature.
- Relay does not make every ERC-20 fully gasless. Their docs call out USDC as fully gasless, while other ERC-20s can still require a one-time approval transaction or sponsored execution.
- `bridge --strict-gasless` rejects any route that still requires an onchain wallet transaction in the current quote, and it keeps enforcing that after permit submission too.
- Use `https` endpoints and a dedicated wallet for automation.
