# Contributing

## Getting started

```bash
pnpm install
pnpm build
pnpm test
```

## Secret handling

- Never commit private keys, seed phrases, API keys, or `.env` files.
- The CLI stores only environment variable **names**, never their values.
- Proxy URLs with embedded credentials must not be stored in config; use env vars instead.
- Test files may use the well-known Hardhat test mnemonic (`test test test ... junk`). Do not use real keys in tests.

## Pull requests

- Run `pnpm check` and `pnpm test` before submitting.
- Keep PRs focused on a single change.
- Add tests for new functionality, especially anything that touches signing or transaction flows.

## OpenAPI spec

`relay-openapi.json` is a snapshot of the Relay API spec fetched from the [Relay API docs](https://docs.relay.link/references/api/overview). To update it, download the latest spec and replace the file.
