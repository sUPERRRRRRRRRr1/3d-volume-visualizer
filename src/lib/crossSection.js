import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CROSS_SECTIONS } from './crossSectionShapes'
import { ruleSamplePoint } from './numeric'

// Volume by KNOWN CROSS-SECTIONS.
//
// The base of the solid is the region between the two curves (or between f and
// the x-axis) over [a, b]. On each thin strip at position x we erect a flat
// shape whose "side" s(x) equals the height of the base region there. Stacking
// those shapes builds the solid, and its volume is
//
//     V = ∫_a^b A(x) dx = factor · ∫_a^b s(x)² dx
//
// where `factor` depends only on the cross-section shape (see crossSectionShapes).

export { CROSS_SECTIONS }

const evalSafe = (res, x) => {
  if (!res || !res.ok) return 0
  const y = res.evaluate(x)
  return Number.isFinite(y) ? y : 0
}

// The base region's [lower, upper] y-bounds at x (segment the cross-section sits on).
function baseAt(model, x) {
  const { f, g, useSecondCurve } = model
  const fv = evalSafe(f, x)
  if (useSecondCurve && g && g.ok) {
    const gv = evalSafe(g, x)
    return [Math.min(fv, gv), Math.max(fv, gv)]
  }
  return [Math.min(0, fv), Math.max(0, fv)]
}

/**
 * 2D cross-section outline in the (y, z) plane, sitting on the base segment
 * [yLo, yHi] at z = 0. Returns an ordered list of {y, z}.
 */
export function crossSectionProfile(shape, yLo, yHi, arcSegments = 20) {
  const s = yHi - yLo
  if (s <= 0) return []
  const cy = (yLo + yHi) / 2
  switch (shape) {
    case 'square':
      return [{ y: yLo, z: 0 }, { y: yHi, z: 0 }, { y: yHi, z: s }, { y: yLo, z: s }]
    case 'rightTriangle': // right angle at yLo, legs = s
      return [{ y: yLo, z: 0 }, { y: yHi, z: 0 }, { y: yLo, z: s }]
    case 'eqTriangle':
      return [{ y: yLo, z: 0 }, { y: yHi, z: 0 }, { y: cy, z: (s * Math.sqrt(3)) / 2 }]
    case 'semicircle': {
      const r = s / 2
      const pts = []
      for (let i = 0; i <= arcSegments; i++) {
        const th = (Math.PI * i) / arcSegments
        pts.push({ y: cy + r * Math.cos(th), z: r * Math.sin(th) })
      }
      return pts
    }
    default:
      return []
  }
}

// Extrude a (y,z) profile along x from x0 to x1 into a closed prism geometry.
function buildPrism(profile, x0, x1) {
  const P = profile.length
  const positions = []
  for (const p of profile) positions.push(x0, p.y, p.z) // ring 0: indices 0..P-1
  for (const p of profile) positions.push(x1, p.y, p.z) // ring 1: indices P..2P-1
  const idx = []
  for (let k = 0; k < P; k++) {
    const k2 = (k + 1) % P
    idx.push(k, k2, P + k2, k, P + k2, P + k) // side wall quad
  }
  const contour = profile.map((p) => new THREE.Vector2(p.y, p.z))
  const tris = THREE.ShapeUtils.triangulateShape(contour, [])
  for (const t of tris) idx.push(t[0], t[2], t[1]) // cap at x0
  for (const t of tris) idx.push(P + t[0], P + t[1], P + t[2]) // cap at x1
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/**
 * Build the cross-section slabs (the Riemann approximation that IS the solid).
 * @returns {{ slices: Array, riemann: number, shape: string, mode: 'crossSection' }}
 */
export function buildCrossSectionSlices(model, n, shape, rule = 'mid') {
  if (!model.valid) return { slices: [], riemann: 0, shape, mode: 'crossSection' }
  const { lo, hi } = model
  const factor = CROSS_SECTIONS[shape]?.factor ?? 1
  const N = Math.max(1, Math.min(200, Math.round(n)))
  const dx = (hi - lo) / N
  const A = (x) => {
    const [a, b] = baseAt(model, x)
    const s = b - a
    return factor * s * s
  }
  const slices = []
  for (let i = 0; i < N; i++) {
    const xL = lo + dx * i
    const xR = xL + dx
    const xe = ruleSamplePoint(xL, xR, rule)
    const [yLo, yHi] = baseAt(model, xe)
    const s = yHi - yLo
    const vol = rule === 'trapezoid' ? 0.5 * (A(xL) + A(xR)) * dx : factor * s * s * dx
    slices.push({
      uLo: xL, uHi: xR, yLo, yHi, s,
      centerAxial: (xL + xR) / 2, thickness: dx, vol,
    })
  }
  return { slices, riemann: slices.reduce((a, b) => a + b.vol, 0), shape, mode: 'crossSection' }
}

/** Merge slab prisms; the highlighted slab is returned separately. */
export function buildCrossSectionGeometry(slices, shape, highlightIndex = -1) {
  const arc = slices.length > 60 ? 14 : 22
  const normal = []
  let highlight = null
  slices.forEach((sl, i) => {
    if (sl.s <= 1e-9) return
    const profile = crossSectionProfile(shape, sl.yLo, sl.yHi, arc)
    if (profile.length < 3) return
    const geo = buildPrism(profile, sl.uLo, sl.uHi)
    if (i === highlightIndex) highlight = geo
    else normal.push(geo)
  })
  const geometry = normal.length ? mergeGeometries(normal, false) : null
  normal.forEach((g) => g !== geometry && g.dispose && g.dispose())
  return { geometry, highlight }
}

/** Bounding box of the cross-section solid, used to frame the camera. */
export function crossSectionExtent(model) {
  const { lo, hi } = model
  let yMin = 0
  let yMax = 0
  let zMax = 0
  const N = 120
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N
    const [a, b] = baseAt(model, x)
    if (Number.isFinite(a)) yMin = Math.min(yMin, a)
    if (Number.isFinite(b)) yMax = Math.max(yMax, b)
    if (Number.isFinite(b - a)) zMax = Math.max(zMax, b - a)
  }
  return { xMin: lo, xMax: hi, yMin, yMax, zMax: zMax || 1 }
}

/** Index of the slab nearest the highlight x-position. */
export function highlightCrossSectionIndex(slices, highlightX) {
  if (highlightX == null || slices.length === 0) return -1
  let best = -1
  let bestD = Infinity
  slices.forEach((s, i) => {
    const d = Math.abs(s.centerAxial - highlightX)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
