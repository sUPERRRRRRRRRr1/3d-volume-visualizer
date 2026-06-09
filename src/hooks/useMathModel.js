import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { compileExpression } from '../lib/mathParser'
import { simpson, linspace } from '../lib/numeric'
import { findIntersections } from '../lib/intersection'
import { computeVolume, regionAt } from '../lib/volumeCalculator'
import { buildSolution } from '../lib/symbolicIntegrator'
import { arcLength, surfaceArea } from '../lib/differential'

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
  const axisOffset = useAppStore((s) => s.axisOffset)
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
    // Keep the line of revolution (y = k for axis 'x') inside the visible range.
    if (axis === 'x') {
      yMin = Math.min(yMin, axisOffset)
      yMax = Math.max(yMax, axisOffset)
    }
    if (yMin === yMax) {
      yMin -= 1
      yMax += 1
    }
    const padY = (yMax - yMin) * 0.12
    const padX = (hi - lo) * 0.08 || 1
    // For axis 'y' the line of revolution is x = k — widen x to include it.
    let xMin = lo - padX
    let xMax = hi + padX
    if (axis === 'y') {
      xMin = Math.min(xMin, axisOffset - padX * 0.5)
      xMax = Math.max(xMax, axisOffset + padX * 0.5)
    }

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

    // --- Does revolving cause the solid to self-overlap within [lo, hi]? ---
    // axis 'x': the base region straddles the line y = k (overlapping washers).
    // axis 'y': the domain straddles x = k (shells sweep from both sides).
    // Flagged so the UI can warn and the symbolic solver can fall back.
    let crossesAxis = false
    if (valid) {
      if (axis === 'x') {
        for (let i = 0; i <= 200; i++) {
          const x = lo + ((hi - lo) * i) / 200
          const [yLo, yHi] = regionAt({ f, g, useSecondCurve }, x)
          if (axisOffset > yLo + 1e-9 && axisOffset < yHi - 1e-9) {
            crossesAxis = true
            break
          }
        }
      } else {
        crossesAxis = axisOffset > lo + 1e-9 && axisOffset < hi - 1e-9
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
      axisOffset,
      useSecondCurve,
      samples: { f: fSamples, g: gSamples },
      plotBounds: {
        xMin,
        xMax,
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
    // Arc length & surface area of revolution — single curve about the line only.
    const singleRev = valid && mode === 'revolution' && !useSecondCurve
    model.arcLength = singleRev ? arcLength(f, lo, hi) : null
    model.surfaceArea = singleRev ? surfaceArea(f, lo, hi, axis, axisOffset) : null
    return model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, g, a, b, axis, method, mode, crossSection, axisOffset, useSecondCurve, manualIntersections])
}
