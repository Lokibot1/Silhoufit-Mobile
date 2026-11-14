/** Philippine pesos with a thousands separator, always two decimals: 1,250.00. Hand-rolled, Hermes' Intl support varies by device. */
export function peso(amount: number): string {
  const [whole, cents] = Math.abs(amount).toFixed(2).split('.')
  return `${amount < 0 ? '-' : ''}₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`
}

/** Zero-padded loader counter: 7 -> "007%". */
export function percentLabel(percent: number): string {
  return `${String(Math.round(percent)).padStart(3, '0')}%`
}
