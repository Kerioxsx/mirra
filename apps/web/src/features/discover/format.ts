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

const MARKETPLACE_NAMES: Record<string, string> = {
  taobao: "Taobao",
  ebay: "eBay",
  etsy: "Etsy",
  amazon: "Amazon",
  asos: "ASOS",
  nike: "Nike",
  adidas: "adidas",
  depop: "Depop",
  grailed: "Grailed",
  demo: "Sample catalog (demo)",
};

export function marketplaceName(id: string): string {
  return MARKETPLACE_NAMES[id] ?? id;
}

export const isUuid = (v: string | undefined | null): v is string =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
