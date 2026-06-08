// Problem 2: Automatic intersection finding for two curves — purely numerical,
// no symbolic equation solving.
//
// Strategy:
//   1. Sample d(x) = f(x) - g(x) at many points across [a, b].
//   2. Where d changes sign between two consecutive samples, a root is bracketed
//      → refine its location with the bisection method (tolerance 1e-7).
//   3. Tangent points (d touches 0 WITHOUT changing sign) never bracket a sign
//      change, so we additionally scan for local minima of |d| that dip below a
//      small, data-scaled epsilon and report those as 'tangent' intersections.
//
// We keep the TRUE refined value for calculation and expose a separate
// near-integer-snapped value for display only.

import { bisection, linspace } from './numeric'
import { snapInteger } from './format'

const DEFAULT_SAMPLES = 1000
const TOL = 1e-7

/**
 * @param {(x:number)=>number} f
 * @param {(x:number)=>number} g
 * @param {number} a lower bound
 * @param {number} b upper bound
 * @returns {Array<{x:number, xDisplay:number, y:number, kind:'cross'|'tangent'}>}
 */
export function findIntersections(f, g, a, b, samples = DEFAULT_SAMPLES) {
  const d = (x) => f(x) - g(x)
  const xs = linspace(a, b, samples)
  const ds = xs.map((x) => d(x))
  const roots = []
  const seen = []

  const pushRoot = (x, kind) => {
    if (x == null || !Number.isFinite(x)) return
    // De-duplicate roots that land essentially on top of each other.
    if (seen.some((r) => Math.abs(r - x) < 1e-5)) return
    seen.push(x)
    const y = f(x)
    roots.push({ x, xDisplay: snapInteger(x), y: Number.isFinite(y) ? y : NaN, kind })
  }

  // --- (1 + 2) Sign-change brackets, refined by bisection ---
  for (let i = 0; i < xs.length - 1; i++) {
    const y0 = ds[i]
    const y1 = ds[i + 1]
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue
    if (y0 === 0) pushRoot(xs[i], 'cross')
    if (y0 * y1 < 0) pushRoot(bisection(d, xs[i], xs[i + 1], TOL), 'cross')
  }

  // --- (3) Tangent detection: local minima of |d| that nearly touch zero ---
  // Scale epsilon to the data so it works for both tiny and large functions.
  const maxAbs = ds.reduce(
    (m, v) => (Number.isFinite(v) ? Math.max(m, Math.abs(v)) : m),
    0,
  )
  const tangentEps = Math.max(1e-6, maxAbs * 1e-4)
  for (let i = 1; i < xs.length - 1; i++) {
    const a0 = Math.abs(ds[i - 1])
    const a1 = Math.abs(ds[i])
    const a2 = Math.abs(ds[i + 1])
    if (![a0, a1, a2].every(Number.isFinite)) continue
    if (a1 < a0 && a1 < a2 && a1 < tangentEps) pushRoot(xs[i], 'tangent')
  }

  roots.sort((p, q) => p.x - q.x)
  return roots
}
