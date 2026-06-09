// Arc length of a curve and surface area of its revolution — both "applications
// of integration" alongside volume. Each needs f'(x); we derive it symbolically
// via mathjs and fall back to a central difference when that fails (e.g. abs,
// floor). The integrals carry a √ so they are evaluated numerically (Simpson).

import { derivative } from 'mathjs'
import { simpson } from './numeric'

/**
 * Build a numeric derivative f'(x) for a compiled expression result.
 * Tries symbolic differentiation first, then a central difference (also used to
 * fill any NaN the symbolic form returns). Never throws — NaN where undefined.
 */
export function makeDerivative(fRes) {
  if (!fRes || !fRes.ok) return () => NaN

  const central = (x) => {
    const h = 1e-5 * (1 + Math.abs(x))
    const a = fRes.evaluate(x + h)
    const b = fRes.evaluate(x - h)
    return Number.isFinite(a) && Number.isFinite(b) ? (a - b) / (2 * h) : NaN
  }

  let symbolic = null
  try {
    const compiled = derivative(fRes.node, 'x').compile()
    symbolic = (x) => {
      try {
        const y = compiled.evaluate({ x })
        return typeof y === 'number' && Number.isFinite(y) ? y : NaN
      } catch {
        return NaN
      }
    }
  } catch {
    symbolic = null
  }

  if (!symbolic) return central
  return (x) => {
    const d = symbolic(x)
    return Number.isFinite(d) ? d : central(x)
  }
}

/** Arc length  L = ∫_lo^hi √(1 + f'(x)²) dx. */
export function arcLength(fRes, lo, hi) {
  if (!fRes || !fRes.ok || hi <= lo) return null
  const fp = makeDerivative(fRes)
  return simpson(
    (x) => {
      const d = fp(x)
      return Math.sqrt(1 + (Number.isFinite(d) ? d * d : 0))
    },
    lo,
    hi,
    2000,
  )
}

/**
 * Surface area of the surface swept by revolving y = f(x) about the line of
 * revolution (offset k):
 *   axis 'x' (line y = k):  S = 2π ∫ |f − k|·√(1 + f'²) dx
 *   axis 'y' (line x = k):  S = 2π ∫ |x − k|·√(1 + f'²) dx
 */
export function surfaceArea(fRes, lo, hi, axis, k = 0) {
  if (!fRes || !fRes.ok || hi <= lo) return null
  const fp = makeDerivative(fRes)
  return (
    2 *
    Math.PI *
    simpson(
      (x) => {
        const d = fp(x)
        const ds = Math.sqrt(1 + (Number.isFinite(d) ? d * d : 0))
        const fx = fRes.evaluate(x)
        const dist =
          axis === 'x' ? Math.abs((Number.isFinite(fx) ? fx : 0) - k) : Math.abs(x - k)
        return dist * ds
      },
      lo,
      hi,
      2000,
    )
  )
}
