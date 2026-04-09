import pc from 'picocolors';
import { formatUnits, isAddress } from 'viem';

import type {
  RelayChain,
  RelayChainCurrency,
  RelayQuoteResponse,
  RelayStatusResponse
} from './types.js';

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 6
});

export function heading(label: string): string {
  return pc.bold(pc.cyan(label));
}

export function label(labelText: string): string {
  return pc.bold(labelText);
}

export function dim(value: string): string {
  return pc.dim(value);
}

export function success(value: string): string {
  return pc.green(value);
}

export function warn(value: string): string {
  return pc.yellow(value);
}

export function errorText(value: string): string {
  return pc.red(value);
}

export function shortenAddress(address: string): string {
  if (!isAddress(address)) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTokenAmount(
  amount: string | bigint | undefined,
  currency: Pick<RelayChainCurrency, 'decimals' | 'symbol'> | undefined
): string {
  if (amount === undefined || !currency) {
    return 'n/a';
  }

  const decimalValue = formatUnits(BigInt(amount), currency.decimals);
  return `${numberFormatter.format(Number(decimalValue))} ${currency.symbol}`;
}

export function formatChain(chain: RelayChain): string {
  return `${chain.displayName} (${chain.id})`;
}

export function formatQuoteSummary(quote: RelayQuoteResponse): string[] {
  const lines = [heading('Quote')];
  const operation = quote.details?.operation ?? 'bridge';

  lines.push(`${label('Operation:')} ${operation}`);

  if (quote.details?.currencyIn) {
    lines.push(
      `${label('Input:')} ${formatTokenAmount(
        quote.details.currencyIn.amount,
        quote.details.currencyIn.currency
      )}`
    );
  }

  if (quote.details?.currencyOut) {
    lines.push(
      `${label('Output:')} ${formatTokenAmount(
        quote.details.currencyOut.amount,
        quote.details.currencyOut.currency
      )}`
    );
  }

  if (quote.details?.recipient) {
    lines.push(
      `${label('Recipient:')} ${shortenAddress(quote.details.recipient)}`
    );
  }

  if (typeof quote.details?.timeEstimate === 'number') {
    lines.push(`${label('Est. time:')} ~${quote.details.timeEstimate}s`);
  }

  if (quote.details?.rate) {
    lines.push(`${label('Rate:')} ${quote.details.rate}`);
  }

  if (quote.details?.totalImpact?.percent) {
    lines.push(
      `${label('Impact:')} ${quote.details.totalImpact.percent}%`
    );
  }

  if (quote.steps.length > 0) {
    lines.push(
      `${label('Steps:')} ${quote.steps
        .map((step) => `${step.id}:${step.kind}`)
        .join(', ')}`
    );
  }

  return lines;
}

export function formatStatus(status: RelayStatusResponse): string[] {
  const lines = [heading('Status')];
  lines.push(`${label('State:')} ${status.status}`);

  if (status.originChainId && status.destinationChainId) {
    lines.push(
      `${label('Route:')} ${status.originChainId} -> ${status.destinationChainId}`
    );
  }

  if (status.details) {
    lines.push(`${label('Details:')} ${status.details}`);
  }

  if (status.txHashes?.length) {
    lines.push(`${label('Destination txs:')} ${status.txHashes.join(', ')}`);
  }

  if (status.inTxHashes?.length) {
    lines.push(`${label('Origin txs:')} ${status.inTxHashes.join(', ')}`);
  }

  return lines;
}
