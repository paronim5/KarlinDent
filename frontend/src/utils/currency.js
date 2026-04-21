/**
 * Currency utility — reads the user's selected currency + conversion rate from
 * localStorage and formats amounts accordingly.
 *
 * All monetary values in the database are stored in CZK (the original currency).
 * The rate stored here converts FROM CZK TO the selected display currency.
 */

export function getCurrencyMeta() {
  const code   = localStorage.getItem("app_currency")        || "CZK";
  const symbol = localStorage.getItem("app_currency_symbol") || "Kč";
  const rate   = parseFloat(localStorage.getItem("app_currency_rate") || "1") || 1;
  return { code, symbol, rate };
}

/**
 * Format a raw CZK amount in the user's selected display currency.
 * @param {number|string|null} value  - amount in CZK
 * @param {object}             opts   - extra Intl.NumberFormat options
 */
export function formatMoney(value, opts = {}) {
  const { code, symbol, rate } = getCurrencyMeta();
  const converted = Number(value || 0) * rate;
  try {
    return converted.toLocaleString(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...opts,
    });
  } catch {
    // Fallback if browser doesn't know the currency code
    return `${converted.toFixed(2)} ${symbol}`;
  }
}

/** Convert raw CZK value to display currency (number only, no formatting). */
export function convertAmount(value) {
  const { rate } = getCurrencyMeta();
  return Number(value || 0) * rate;
}

/** Currently selected currency code (e.g. "USD"). */
export function currencyCode() {
  return localStorage.getItem("app_currency") || "CZK";
}

/** Approximate fallback rates relative to CZK (1 CZK = X units). */
export const FALLBACK_RATES = {
  CZK: 1,
  EUR: 0.04,
  USD: 0.044,
  GBP: 0.034,
  PLN: 0.177,
  CHF: 0.039,
  HUF: 15.8,
  RON: 0.198,
};
