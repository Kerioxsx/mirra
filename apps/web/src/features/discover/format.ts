import type { Money } from "@mirra/shared-types";

/** "¥239.00", "US$33.09" — decimal strings from the API are formatted, never re-computed. */
export function formatMoney(m: Money | null | undefined, opts: { approx?: boolean } = {}): string {
  if (!m) return "—";
  const n = typeof m.amount === "number" ? m.amount : Number(m.amount);
  let text: string;
  try {
    text = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: m.currency,
      currencyDisplay: "narrowSymbol",
    }).format(n);
  } catch {
    text = `${n.toFixed(2)} ${m.currency}`;
  }
  return opts.approx ? `≈ ${text}` : text;
}

export function amountString(m: Money): string {
  const n = typeof m.amount === "number" ? m.amount : Number(m.amount);
  return n.toFixed(2);
}
