/**
 * Format a money amount with its currency symbol (en-GB conventions, always
 * two decimals). Patient carts carry a `currency` column, so display code must
 * never hardcode "£". Falls back to GBP on a missing/malformed code rather
 * than throwing — a formatting bug must never take down a pay page.
 */
export function formatMoney(amount: number, currency: string | undefined = 'GBP'): string {
  try {
    return amount.toLocaleString('en-GB', { style: 'currency', currency: currency || 'GBP' });
  } catch {
    return amount.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
  }
}
