import { useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { COLORS } from '../lib/colors'
import { niceTicks } from '../lib/format'
import { clamp, ruleSamplePoint } from '../lib/numeric'

// Internal drawing surface (scaled to fit its container by the SVG viewBox).
const W = 760
const H = 520
const M = { top: 18, right: 18, bottom: 30, left: 40 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

const tickText = (v) => Number(v.toFixed(3)).toString()

// Build a polyline path, breaking the line wherever the curve is undefined (NaN).
function polylinePath(points, sx, sy) {
  let d = ''
  let pen = false
  for (const p of points) {
    if (!Number.isFinite(p.y)) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)} `
    pen = true
  }
  return d
}

// Area between a single curve and the axis baseline (y = 0), drawn per finite run.
function areaUnderPath(points, sx, sy, baseY) {
  let d = ''
  let run = []
  const flush = () => {
    if (run.length >= 2) {
      d += `M${sx(run[0].x).toFixed(2)},${baseY.toFixed(2)} `
      for (const p of run) d += `L${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)} `
      d += `L${sx(run[run.length - 1].x).toFixed(2)},${baseY.toFixed(2)} Z `
    }
    run = []
  }
  for (const p of points) {
    if (!Number.isFinite(p.y)) flush()
    else run.push(p)
  }
  flush()
  return d
}

// Area between two curves f and g (same sample xs), drawn per finite run.
function areaBetweenPath(fpts, gpts, sx, sy) {
  let d = ''
  let run = []
  const flush = () => {
    if (run.length >= 2) {
      d += 'M'
      run.forEach((p, i) => {
        d += `${i ? 'L' : ''}${sx(p.x).toFixed(2)},${sy(p.fy).toFixed(2)} `
      })
      for (let i = run.length - 1; i >= 0; i--) {
        d += `L${sx(run[i].x).toFixed(2)},${sy(run[i].gy).toFixed(2)} `
      }
      d += 'Z '
    }
    run = []
  }
  for (let i = 0; i < fpts.length; i++) {
    const fy = fpts[i].y
    const gy = gpts[i].y
    if (Number.isFinite(fy) && Number.isFinite(gy)) run.push({ x: fpts[i].x, fy, gy })
    else flush()
  }
  flush()
  return d
}

export function Plot2D({ model }) {
  const svgRef = useRef(null)
  const highlightEnabled = useAppStore((s) => s.highlightEnabled)
  const highlightX = useAppStore((s) => s.highlightX)
  const setHighlightX = useAppStore((s) => s.setHighlightX)
  const n = useAppStore((s) => s.n)
  const method = useAppStore((s) => s.method)
  const mode = useAppStore((s) => s.mode)
  const showSlices = useAppStore((s) => s.showSlices)
  const riemannRule = useAppStore((s) => s.riemannRule)

  const { plotBounds, samples, lo, hi, axis, useSecondCurve, f, g } = model
  const k = model.axisOffset ?? 0
  const { xMin, xMax, yMin, yMax } = plotBounds

  // World → pixel scales.
  const sx = (x) => M.left + ((x - xMin) / (xMax - xMin)) * PW
  const sy = (y) => M.top + ((yMax - y) / (yMax - yMin)) * PH

  const xTicks = niceTicks(xMin, xMax, 9)
  const yTicks = niceTicks(yMin, yMax, 7)
  const baseY = clamp(sy(0), M.top, M.top + PH) // pixel y of the line y = 0

  // Convert a pointer event to a world-x for the highlight slider behaviour.
  const pointerToWorldX = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const wx = xMin + ((px - M.left) / PW) * (xMax - xMin)
    return clamp(wx, lo, hi)
  }

  const areaPath =
    useSecondCurve && g && g.ok
      ? areaBetweenPath(samples.f, samples.g, sx, sy)
      : areaUnderPath(samples.f, sx, sy, baseY)

  // Evaluate the highlighted point on f for the marker.
  const hX = highlightEnabled && highlightX != null ? clamp(highlightX, lo, hi) : null
  const hY = hX != null && f.ok ? f.evaluate(hX) : null

  // Riemann slabs over [lo, hi] — the 2D mirror of the 3D slices, so increasing
  // n visibly fills the shaded region. Each slab is a quad: flat-topped for the
  // left/mid/right rules, slant-topped (a true trapezoid) for the trapezoid rule.
  const rectColor =
    mode === 'crossSection' ? '#a78bfa' : method === 'shell' ? COLORS.curveG : COLORS.curveF
  const bot = (x) => (useSecondCurve && g && g.ok ? g.evaluate(x) : 0)
  const riemannQuads = []
  if (showSlices && f.ok && hi > lo) {
    const N = Math.max(1, Math.min(200, Math.round(n)))
    const dx = (hi - lo) / N
    for (let i = 0; i < N; i++) {
      const xL = lo + dx * i
      const xR = xL + dx
      let topL, topR, botL, botR
      if (riemannRule === 'trapezoid') {
        topL = f.evaluate(xL); topR = f.evaluate(xR)
        botL = bot(xL); botR = bot(xR)
      } else {
        const xe = ruleSamplePoint(xL, xR, riemannRule)
        topL = topR = f.evaluate(xe)
        botL = botR = bot(xe)
      }
      if ([topL, topR, botL, botR].every(Number.isFinite)) {
        riemannQuads.push({ xL, xR, topL, topR, botL, botR })
      }
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none"
      onPointerMove={(e) => {
        if (highlightEnabled && e.buttons === 1) setHighlightX(pointerToWorldX(e))
      }}
      onPointerDown={(e) => {
        if (highlightEnabled) setHighlightX(pointerToWorldX(e))
      }}
    >
      {/* grid */}
      {xTicks.map((t) => (
        <line key={`gx${t}`} x1={sx(t)} y1={M.top} x2={sx(t)} y2={M.top + PH} stroke={COLORS.grid} />
      ))}
      {yTicks.map((t) => (
        <line key={`gy${t}`} x1={M.left} y1={sy(t)} x2={M.left + PW} y2={sy(t)} stroke={COLORS.grid} />
      ))}

      {/* shaded region */}
      <path d={areaPath} fill={COLORS.area} stroke={COLORS.areaStroke} strokeWidth={1} strokeOpacity={0.6} />

      {/* Riemann slabs (2D mirror of the slices) */}
      {riemannQuads.map((q, i) => {
        const pts = [
          [sx(q.xL), sy(q.botL)],
          [sx(q.xR), sy(q.botR)],
          [sx(q.xR), sy(q.topR)],
          [sx(q.xL), sy(q.topL)],
        ]
          .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
          .join(' ')
        return (
          <polygon
            key={`rr${i}`}
            points={pts}
            fill={rectColor}
            fillOpacity={0.16}
            stroke={rectColor}
            strokeOpacity={0.55}
            strokeWidth={0.7}
          />
        )
      })}

      {/* coordinate axes */}
      {yMin <= 0 && yMax >= 0 && (
        <line x1={M.left} y1={sy(0)} x2={M.left + PW} y2={sy(0)} stroke={COLORS.axis} strokeWidth={1.5} />
      )}
      {xMin <= 0 && xMax >= 0 && (
        <line x1={sx(0)} y1={M.top} x2={sx(0)} y2={M.top + PH} stroke={COLORS.axis} strokeWidth={1.5} />
      )}

      {/* axis of revolution (amber, dashed): y = k for axis 'x', x = k for axis 'y' */}
      {mode !== 'crossSection' && axis === 'x' && yMin <= k && k <= yMax && (
        <line x1={M.left} y1={sy(k)} x2={M.left + PW} y2={sy(k)} stroke={COLORS.highlight} strokeWidth={2.5} strokeDasharray="8 4" />
      )}
      {mode !== 'crossSection' && axis === 'y' && xMin <= k && k <= xMax && (
        <line x1={sx(k)} y1={M.top} x2={sx(k)} y2={M.top + PH} stroke={COLORS.highlight} strokeWidth={2.5} strokeDasharray="8 4" />
      )}

      {/* integration bound lines a, b */}
      {[lo, hi].map((t, i) => (
        <line
          key={`b${i}`}
          x1={sx(t)}
          y1={M.top}
          x2={sx(t)}
          y2={M.top + PH}
          stroke={COLORS.bound}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      ))}

      {/* curves */}
      <path d={polylinePath(samples.f, sx, sy)} fill="none" stroke={COLORS.curveF} strokeWidth={2.5} />
      {useSecondCurve && g && g.ok && (
        <path d={polylinePath(samples.g, sx, sy)} fill="none" stroke={COLORS.curveG} strokeWidth={2.5} />
      )}

      {/* intersection markers */}
      {model.intersections?.map((p, i) =>
        Number.isFinite(p.y) ? (
          <circle key={`i${i}`} cx={sx(p.x)} cy={sy(p.y)} r={4.5} fill={COLORS.intersection} stroke="#0f172a" strokeWidth={1.5} />
        ) : null,
      )}

      {/* interactive highlight */}
      {hX != null && Number.isFinite(hY) && (
        <g>
          <line x1={sx(hX)} y1={M.top} x2={sx(hX)} y2={M.top + PH} stroke={COLORS.highlight} strokeWidth={1.5} />
          <circle cx={sx(hX)} cy={sy(hY)} r={5} fill={COLORS.highlight} stroke="#0f172a" strokeWidth={1.5} />
        </g>
      )}

      {/* tick labels */}
      {xTicks.map((t) => (
        <text key={`tx${t}`} x={sx(t)} y={M.top + PH + 18} fill="#94a3b8" fontSize={11} textAnchor="middle">
          {tickText(t)}
        </text>
      ))}
      {yTicks.map((t) =>
        Math.abs(t) < 1e-9 ? null : (
          <text key={`ty${t}`} x={M.left - 6} y={sy(t) + 3.5} fill="#94a3b8" fontSize={11} textAnchor="end">
            {tickText(t)}
          </text>
        ),
      )}
    </svg>
  )
}
