import { simpson } from './numeric'
import { CROSS_SECTIONS } from './crossSectionShapes'

// The TRUE volume of the solid. It depends on the axis of revolution AND the
// line we revolve about (y = k for axis 'x', x = k for axis 'y'; k = axisOffset).
// The disk and shell methods are just two ways to compute/approximate this same
// number, which is exactly the point of the Disk↔Shell toggle.
//
//   • Revolve about y = k (axis X):  washer   V = π ∫ (R(x)² − r(x)²) dx
//   • Revolve about x = k (axis Y):  shell     V = 2π ∫ |x − k| · h(x) dx
//
// Radii are measured from the line, NOT from the coordinate axis. With k = 0 and
// a single curve this collapses to the plain disk / shell, so the historical
// answers are unchanged. See regionAt + washerRadii below.
//
// Computed numerically at high resolution so it serves as the "true value" the
// Riemann approximation converges toward.

const evalSafe = (res, x) => {
  if (!res || !res.ok) return 0
  const y = res.evaluate(x)
  return Number.isFinite(y) ? y : 0
}

// The base region's vertical extent [yLo, yHi] at x. A single curve is paired
// with the x-axis (y = 0); two curves span between f and g.
export function regionAt(model, x) {
  const { f, g, useSecondCurve } = model
  const fv = evalSafe(f, x)
  if (useSecondCurve && g && g.ok) {
    const gv = evalSafe(g, x)
    return [Math.min(fv, gv), Math.max(fv, gv)]
  }
  return [Math.min(0, fv), Math.max(0, fv)]
}

// Outer/inner radii of the washer formed by revolving the region [yLo, yHi]
// about the line y = k. When k lies strictly inside the region the two halves
// sweep overlapping disks, so the union has inner radius 0 (and the UI warns).
export function washerRadii(yLo, yHi, k) {
  const d1 = Math.abs(yHi - k)
  const d2 = Math.abs(yLo - k)
  const inside = k > yLo + 1e-9 && k < yHi - 1e-9
  return { R: Math.max(d1, d2), r: inside ? 0 : Math.min(d1, d2) }
}

export function computeVolume(model) {
  if (!model || !model.valid) return null
  const { f, g, lo, hi, axis, useSecondCurve, mode, crossSection } = model
  const k = model.axisOffset ?? 0
  const two = useSecondCurve && g && g.ok

  // Known cross-sections: V = factor · ∫ s(x)² dx, s = |f − g| (or |f|).
  if (mode === 'crossSection') {
    const factor = CROSS_SECTIONS[crossSection]?.factor ?? 1
    const integrand = two
      ? (x) => {
          const d = evalSafe(f, x) - evalSafe(g, x)
          return d * d
        }
      : (x) => {
          const v = evalSafe(f, x)
          return v * v
        }
    return factor * simpson(integrand, lo, hi, 2000)
  }

  if (axis === 'x') {
    const integrand = (x) => {
      const [yLo, yHi] = regionAt(model, x)
      const { R, r } = washerRadii(yLo, yHi, k)
      return R * R - r * r
    }
    return Math.PI * simpson(integrand, lo, hi, 2000)
  }

  // axis === 'y' : shells about the line x = k, radius |x − k|, height = region.
  const integrand = (x) => {
    const [yLo, yHi] = regionAt(model, x)
    return Math.abs(x - k) * (yHi - yLo)
  }
  return 2 * Math.PI * simpson(integrand, lo, hi, 2000)
}
