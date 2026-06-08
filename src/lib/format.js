// Display formatting helpers. The rule throughout the app: keep the TRUE value
// for calculation, and only round when showing it to the user.

/** Format a number for display with a fixed number of decimals (no trailing zeros). */
export function fmt(x, digits = 4) {
  if (x == null || !Number.isFinite(x)) return '—'
  const v = Object.is(Number(x), -0) ? 0 : Number(x)
  return Number(v.toFixed(digits)).toString()
}

/** Snap values extremely close to an integer to that integer (display only). */
export function snapInteger(x, eps = 1e-6) {
  if (!Number.isFinite(x)) return x
  const r = Math.round(x)
  return Math.abs(x - r) < eps ? r : x
}

/** Pretty-print a value, snapping near-integers first (display only). */
export function fmtSnap(x, digits = 4) {
  return fmt(snapInteger(x), digits)
}

/** Produce "nice" tick values covering [min, max] at 1/2/5×10^k spacing. */
export function niceTicks(min, max, targetCount = 8) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min]
  }
  const range = max - min
  const rawStep = range / targetCount
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  let step
  if (norm < 1.5) step = 1
  else if (norm < 3) step = 2
  else if (norm < 7) step = 5
  else step = 10
  step *= mag
  const start = Math.ceil(min / step) * step
  const ticks = []
  for (let v = start; v <= max + step * 0.5; v += step) {
    // Clean up floating point noise like 0.30000000000000004
    ticks.push(Number(v.toFixed(10)))
  }
  return ticks
}
