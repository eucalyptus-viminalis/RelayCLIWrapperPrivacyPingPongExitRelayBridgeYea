# Relay CLI

A privacy-first TypeScript CLI for [Relay](https://docs.relay.link/references/api/overview).

Every outbound HTTP request from the CLI is routed through an explicit proxy. That includes Relay API calls and onchain JSON-RPC calls used to sign and submit EVM transactions.

## What it does

- Makes common EVM bridge flows simple with a single `bridge` command
- Exposes the full Relay API surface through a spec-driven `api` command
- Keeps private keys out of config files by storing only the environment variable name that should be used

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

## Private key setup

The CLI never stores a raw private key. It only stores the env var name to read from.

```bash
export RELAY_PRIVATE_KEY=0xyour_private_key
pnpm relay -- config show
```

To point the CLI at a different env var:

```bash
pnpm relay -- config set-private-key-env WALLET_PK
export WALLET_PK=0xyour_private_key
```

To reset back to the default env var name:

```bash
pnpm relay -- config unset-private-key-env
```

## Proxy setup

To store a default proxy URL in your per-user config:

```bash
pnpm relay -- config set-proxy socks5h://127.0.0.1:9150
```

To remove the stored proxy and fall back to env vars or the default:

```bash
pnpm relay -- config unset-proxy
pnpm relay -- config show
```

## Examples

Preview a bridge quote:

```bash
pnpm relay -- bridge --from base --to optimism --token usdc --amount 25 --quote-only
```

Preview a quote with a specific wallet context, without needing a configured private key:

```bash
pnpm relay -- bridge --from arbitrum --to ethereum --token weth --amount 0.01 --quote-only --wallet 0xYourWalletAddress
```

Bridge and execute the steps with your configured private key:

```bash
pnpm relay -- bridge --from ethereum --to base --token eth --amount 0.05
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

Call any Relay endpoint:

```bash
pnpm relay -- api call GET /chains
pnpm relay -- api call POST /quote/v2 --body '{"user":"0x...","originChainId":8453,"destinationChainId":10,"originCurrency":"0x0000000000000000000000000000000000000000","destinationCurrency":"0x0000000000000000000000000000000000000000","amount":"100000000000000000","tradeType":"EXACT_INPUT"}'
```

## Security notes

- The CLI fails closed: if the configured proxy is unavailable, requests fail instead of falling back to a direct connection.
- The `config` command never stores a private key. It can store a proxy URL, and CLI output redacts embedded proxy credentials.
- `bridge --quote-only` does not require a private key. If you omit `--wallet`, the CLI uses a placeholder wallet context for the quote.
- `proxy check` helps distinguish between “the proxy is down” and “Relay is rejecting the current proxy exit”.
- Use `https` endpoints and a dedicated wallet for automation.
