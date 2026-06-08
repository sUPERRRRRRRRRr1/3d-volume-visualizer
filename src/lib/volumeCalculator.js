import { simpson } from './numeric'
import { CROSS_SECTIONS } from './crossSectionShapes'

// The TRUE volume of the solid. It depends only on the axis of revolution —
// the disk and shell methods are just two ways to compute/approximate this same
// number, which is exactly the point of the Disk↔Shell toggle.
//
//   • Revolve about X:  washer formula   V = π ∫ (R(x)² − r(x)²) dx
//     (R = outer radius = max(|f|,|g|), r = inner radius = min(|f|,|g|); r = 0
//      for a single curve → plain disk)
//   • Revolve about Y:  shell formula    V = 2π ∫ |x| · h(x) dx
//     (h = height of the region at x = |f − g|, or |f| for a single curve)
//
// Computed numerically at high resolution so it serves as the "true value" the
// Riemann approximation converges toward.
export function computeVolume(model) {
  if (!model || !model.valid) return null
  const { f, g, lo, hi, axis, useSecondCurve, mode, crossSection } = model
  const two = useSecondCurve && g && g.ok
  const F = (x) => {
    const y = f.evaluate(x)
    return Number.isFinite(y) ? y : 0
  }
  const G = (x) => {
    if (!two) return 0
    const y = g.evaluate(x)
    return Number.isFinite(y) ? y : 0
  }

  // Known cross-sections: V = factor · ∫ s(x)² dx, s = |f − g| (or |f|).
  if (mode === 'crossSection') {
    const factor = CROSS_SECTIONS[crossSection]?.factor ?? 1
    const integrand = two
      ? (x) => {
          const d = F(x) - G(x)
          return d * d
        }
      : (x) => {
          const v = F(x)
          return v * v
        }
    return factor * simpson(integrand, lo, hi, 2000)
  }

  if (axis === 'x') {
    const integrand = two
      ? (x) => {
          const a = Math.abs(F(x))
          const b = Math.abs(G(x))
          const R = Math.max(a, b)
          const r = Math.min(a, b)
          return R * R - r * r
        }
      : (x) => {
          const a = Math.abs(F(x))
          return a * a
        }
    return Math.PI * simpson(integrand, lo, hi, 2000)
  }

  // axis === 'y'
  const integrand = two
    ? (x) => Math.abs(x) * Math.abs(F(x) - G(x))
    : (x) => Math.abs(x) * Math.abs(F(x))
  return 2 * Math.PI * simpson(integrand, lo, hi, 2000)
}
