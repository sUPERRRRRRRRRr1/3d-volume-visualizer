// Low-level numerical methods shared by intersection finding, area, and volume.
// Kept dependency-free and pure so they are easy to reason about and test.

/** Generate n+1 evenly spaced points from a to b inclusive. */
export function linspace(a, b, n) {
  const out = new Array(n + 1)
  for (let i = 0; i <= n; i++) out[i] = a + ((b - a) * i) / n
  return out
}

/**
 * Composite Simpson's rule for the definite integral ∫_a^b fn(x) dx.
 * `n` is forced even (Simpson requires an even number of subintervals).
 * If fn returns a non-finite value at any node (domain gap, e.g. sqrt of a
 * negative number) we fall back to the trapezoidal rule, which we make robust
 * by treating non-finite samples as 0 — this keeps the app from ever surfacing
 * a silent NaN.
 */
export function simpson(fn, a, b, n = 1000) {
  if (a === b) return 0
  if (n % 2 === 1) n += 1
  const h = (b - a) / n
  let sum = 0
  let usable = true
  for (let i = 0; i <= n; i++) {
    const x = a + i * h
    let y = fn(x)
    if (!Number.isFinite(y)) {
      usable = false
      break
    }
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2
    sum += w * y
  }
  if (usable) return (h / 3) * sum
  return trapezoid(fn, a, b, n)
}

/** Composite trapezoidal rule; treats non-finite samples as 0. */
export function trapezoid(fn, a, b, n = 1000) {
  if (a === b) return 0
  const h = (b - a) / n
  let sum = 0
  for (let i = 0; i <= n; i++) {
    const x = a + i * h
    let y = fn(x)
    if (!Number.isFinite(y)) y = 0
    sum += (i === 0 || i === n ? 0.5 : 1) * y
  }
  return h * sum
}

/**
 * Bisection root finder for fn on [lo, hi].
 * Returns the refined root, or null when there is no usable sign change on the
 * interval (so the caller can decide whether a tangent/no-root case applies).
 */
export function bisection(fn, lo, hi, tol = 1e-7, maxIter = 100) {
  let flo = fn(lo)
  let fhi = fn(hi)
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return null
  if (flo === 0) return lo
  if (fhi === 0) return hi
  if (flo * fhi > 0) return null // same sign on both ends → no guaranteed root
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi)
    const fmid = fn(mid)
    if (!Number.isFinite(fmid)) return null
    if (Math.abs(fmid) < tol || (hi - lo) / 2 < tol) return mid
    if (flo * fmid < 0) {
      hi = mid
      fhi = fmid
    } else {
      lo = mid
      flo = fmid
    }
  }
  return 0.5 * (lo + hi)
}

/** Clamp a number into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}
