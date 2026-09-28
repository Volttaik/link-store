/**
 * Money handling.
 *
 * Every monetary value in LINK STORE is an INTEGER in the currency's minor
 * unit (kobo, cents, …). Floats are never persisted, so totals always
 * reconcile exactly and no rounding drift can reach a payment provider.
 */

export type CurrencyCode = "NGN" | "USD" | "GBP" | "EUR" | "KES" | "GHS" | "ZAR";

export type CurrencyMeta = {
  code: CurrencyCode;
  label: string;
  symbol: string;
  locale: string;
  /** Subunits per major unit. All Paystack currencies use 100. */
  exponent: number;
};

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  NGN: { code: "NGN", label: "Nigerian Naira", symbol: "₦", locale: "en-NG", exponent: 2 },
  USD: { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US", exponent: 2 },
  GBP: { code: "GBP", label: "Pound Sterling", symbol: "£", locale: "en-GB", exponent: 2 },
  EUR: { code: "EUR", label: "Euro", symbol: "€", locale: "en-IE", exponent: 2 },
  KES: { code: "KES", label: "Kenyan Shilling", symbol: "KSh", locale: "en-KE", exponent: 2 },
  GHS: { code: "GHS", label: "Ghanaian Cedi", symbol: "GH₵", locale: "en-GH", exponent: 2 },
  ZAR: { code: "ZAR", label: "South African Rand", symbol: "R", locale: "en-ZA", exponent: 2 },
};

export const CURRENCY_OPTIONS = Object.values(CURRENCIES).map((c) => ({
  value: c.code,
  label: `${c.code} · ${c.label}`,
}));

export function currencyMeta(code: string | null | undefined): CurrencyMeta {
  const upper = (code ?? "NGN").toUpperCase() as CurrencyCode;
  return CURRENCIES[upper] ?? CURRENCIES.NGN;
}

/** Format an integer minor-unit amount for display. */
export function formatMoney(
  amountMinor: number | bigint | null | undefined,
  currency: string = "NGN",
): string {
  const meta = currencyMeta(currency);
  const value = Number(amountMinor ?? 0) / 10 ** meta.exponent;

  try {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: value % 1 === 0 ? 0 : meta.exponent,
      maximumFractionDigits: meta.exponent,
    }).format(value);
  } catch {
    return `${meta.symbol}${value.toLocaleString()}`;
  }
}

/** Compact display for dashboards: ₦1.2M, ₦84.5k. */
export function formatMoneyCompact(
  amountMinor: number | bigint | null | undefined,
  currency: string = "NGN",
): string {
  const meta = currencyMeta(currency);
  const value = Number(amountMinor ?? 0) / 10 ** meta.exponent;
  const abs = Math.abs(value);

  const scale = (n: number, suffix: string) => {
    const rounded = Math.round(n * 10) / 10;
    return `${meta.symbol}${rounded.toString()}${suffix}`;
  };

  if (abs >= 1_000_000_000) return scale(value / 1_000_000_000, "B");
  if (abs >= 1_000_000) return scale(value / 1_000_000, "M");
  if (abs >= 1_000) return scale(value / 1_000, "k");
  return formatMoney(amountMinor, currency);
}

/**
 * Parse user input ("1,250.50", "₦500", "") into an integer minor amount.
 * Returns null when the input is not a valid non-negative number.
 */
export function parseMoneyToMinor(input: unknown, currency: string = "NGN"): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 10 ** currencyMeta(currency).exponent);
  }

  if (typeof input !== "string") return null;

  const cleaned = input.replace(/[^\d.-]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;

  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 10 ** currencyMeta(currency).exponent);
}

/** Minor amount back to a plain editable string, e.g. 250050 -> "2500.50". */
export function minorToInput(
  amountMinor: number | null | undefined,
  currency: string = "NGN",
): string {
  const meta = currencyMeta(currency);
  const value = Number(amountMinor ?? 0) / 10 ** meta.exponent;
  return value.toFixed(meta.exponent);
}

/** Percentage of an amount, floored to whole minor units. */
export function percentOf(amountMinor: number, percent: number): number {
  return Math.floor((amountMinor * percent) / 100);
}

export function sumMinor(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, v) => total + Math.round(Number(v ?? 0)), 0);
}
