import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { compileExpression } from '../lib/mathParser'
import { simpson, linspace } from '../lib/numeric'
import { findIntersections } from '../lib/intersection'
import { computeVolume } from '../lib/volumeCalculator'
import { buildSolution } from '../lib/symbolicIntegrator'

const PLOT_SAMPLES = 400

/**
 * Central derived-state hook. Reads the raw inputs from the store and computes
 * everything the panels need (compiled functions, plot samples, 2D area,
 * intersections, axis-crossing warning). Heavy work is memoized on the inputs
 * so it only recomputes when something relevant actually changes.
 *
 * Computed ONCE in App and passed down as `model` to keep the 3D canvas from
 * recomputing math on every orbit/zoom frame.
 */
export function useMathModel() {
  const fInput = useAppStore((s) => s.fInput)
  const gInput = useAppStore((s) => s.gInput)
  const useSecondCurve = useAppStore((s) => s.useSecondCurve)
  const a = useAppStore((s) => s.a)
  const b = useAppStore((s) => s.b)
  const axis = useAppStore((s) => s.axis)
  const method = useAppStore((s) => s.method)
  const mode = useAppStore((s) => s.mode)
  const crossSection = useAppStore((s) => s.crossSection)
  const manualIntersections = useAppStore((s) => s.manualIntersections)

  const f = useMemo(() => compileExpression(fInput), [fInput])
  const g = useMemo(
    () => (useSecondCurve ? compileExpression(gInput) : null),
    [gInput, useSecondCurve],
  )

  return useMemo(() => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const fOk = f.ok
    const gOk = !useSecondCurve || (g && g.ok)
    const validBounds = hi > lo
    const valid = fOk && gOk && validBounds

    const error = !fOk
      ? f.error
      : useSecondCurve && g && !g.ok
        ? g.error
        : !validBounds
          ? 'ขอบเขตไม่ถูกต้อง: ค่า a ต้องไม่เท่ากับ b'
          : null

    // --- Sample curves for plotting (NaN where outside domain → line breaks) ---
    const xs = linspace(lo, hi, PLOT_SAMPLES)
    const sampleCurve = (res) =>
      res && res.ok ? xs.map((x) => ({ x, y: res.evaluate(x) })) : []
    const fSamples = sampleCurve(f)
    const gSamples = useSecondCurve ? sampleCurve(g) : null

    // --- Plot y-range from finite samples, always including y = 0 ---
    let yMin = 0
    let yMax = 0
    const consider = (arr) =>
      arr &&
      arr.forEach(({ y }) => {
        if (Number.isFinite(y)) {
          yMin = Math.min(yMin, y)
          yMax = Math.max(yMax, y)
        }
      })
    consider(fSamples)
    consider(gSamples)
    if (yMin === yMax) {
      yMin -= 1
      yMax += 1
    }
    const padY = (yMax - yMin) * 0.12
    const padX = (hi - lo) * 0.08 || 1

    // --- Intersections (only meaningful with two curves) ---
    let intersections = []
    if (valid && useSecondCurve && g && g.ok) {
      intersections =
        manualIntersections ??
        findIntersections(f.evaluate, g.evaluate, lo, hi)
    }

    // --- Geometric 2D area (abs to avoid silent sign cancellation) ---
    let area = null
    if (valid) {
      const integrand =
        useSecondCurve && g && g.ok
          ? (x) => Math.abs(f.evaluate(x) - g.evaluate(x))
          : (x) => Math.abs(f.evaluate(x))
      area = simpson(integrand, lo, hi, 1000)
    }

    // --- Does the curve cross the axis of revolution within [lo, hi]? ---
    // (Relevant for X-axis revolution; we flag it so the UI can warn.)
    // We track the sign of non-zero samples so an exact zero sample (e.g. x^3 at
    // x = 0) doesn't hide a genuine sign change.
    let crossesAxis = false
    if (fOk) {
      let lastSign = 0
      for (const { y } of fSamples) {
        if (!Number.isFinite(y) || y === 0) continue
        const sign = y > 0 ? 1 : -1
        if (lastSign !== 0 && sign !== lastSign) {
          crossesAxis = true
          break
        }
        lastSign = sign
      }
    }

    const model = {
      f,
      g,
      valid,
      error,
      a,
      b,
      lo,
      hi,
      axis,
      method,
      mode,
      crossSection,
      useSecondCurve,
      samples: { f: fSamples, g: gSamples },
      plotBounds: {
        xMin: lo - padX,
        xMax: hi + padX,
        yMin: yMin - padY,
        yMax: yMax + padY,
      },
      area,
      intersections,
      crossesAxis,
    }
    // True volume + step-by-step solution depend only on these same inputs.
    model.volume = computeVolume(model)
    model.solution = buildSolution(model)
    return model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, g, a, b, axis, method, mode, crossSection, useSecondCurve, manualIntersections])
}
