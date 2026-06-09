import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { regionAt, washerRadii } from './volumeCalculator'
import { ruleSamplePoint } from './numeric'

// 3D mesh generation for solids of revolution.
//
// Core idea — revolve a closed 2D cross-section:
//   We describe the solid's cross-section as a CLOSED polygon in a half-plane
//   with coordinates (u = position ALONG the axis of revolution, v = radius ≥ 0).
//   Revolving that polygon a full 2π around the u-axis sweeps out the whole solid
//   AND automatically produces the end caps / inner walls — because every edge of
//   the polygon (including the flat bottom edge at v = 0 or v = rInner, and the
//   vertical end edges) becomes a band of the surface. This single construction
//   covers the disk method, the washer method (a curve→curve band that leaves a
//   hole), and revolution about either the X or the Y axis.
//
//   Mapping (u, v, θ) → world (x, y, z):
//     • axis 'x':  (u,  v·cosθ,  v·sinθ)      — solid lies along world X
//     • axis 'y':  (v·cosθ,  u,  v·sinθ)      — solid lies along world Y
//
// For a partial sweep (the revolution animation, θ ∈ [0, Φ] with Φ < 2π) we also
// triangulate the flat cross-section polygon and place it at θ = 0 and θ = Φ so
// the swept shape reads as a solid being "poured" into existence.

const PROFILE_SAMPLES = 90

const safe = (res, x) => {
  if (!res || !res.ok) return 0
  const y = res.evaluate(x)
  return Number.isFinite(y) ? y : 0
}

/**
 * Build the closed cross-section polygon for the current model.
 * Returns { points: [{u, v}], axis }. The polygon is wound counter-clockwise in
 * (u, v) and its first/last points are distinct (the revolve step closes it).
 */
export function buildCrossSectionPolygon(model) {
  const { lo, hi, axis } = model
  const k = model.axisOffset ?? 0
  const N = PROFILE_SAMPLES
  const points = []
  const xAt = (i) => lo + ((hi - lo) * i) / N

  if (axis === 'x') {
    // u = x, v = distance from the line y = k. Inner/outer radii come from the
    // washer formed by revolving the base region [yLo, yHi] about y = k.
    const radii = (x) => {
      const [yLo, yHi] = regionAt(model, x)
      return washerRadii(yLo, yHi, k)
    }
    // Inner edge lo → hi (v = rInner), then outer edge hi → lo (v = rOuter).
    for (let i = 0; i <= N; i++) points.push({ u: xAt(i), v: radii(xAt(i)).r })
    for (let i = N; i >= 0; i--) points.push({ u: xAt(i), v: radii(xAt(i)).R })
  } else {
    // axis 'y': u = height, v = distance from the line x = k. Region is the band
    // between the lower and upper boundary in height for each x.
    const radius = (x) => Math.abs(x - k)
    for (let i = 0; i <= N; i++) {
      const x = xAt(i)
      points.push({ u: regionAt(model, x)[0], v: radius(x) })
    }
    for (let i = N; i >= 0; i--) {
      const x = xAt(i)
      points.push({ u: regionAt(model, x)[1], v: radius(x) })
    }
  }

  return { points, axis, offset: k }
}

// Map an (u, v) profile point at angle θ to world coordinates for the given axis.
// The revolution is centered on the line y = k (axis 'x') or x = k (axis 'y'),
// so the radial coordinate is offset by k in the corresponding world axis.
function mapPoint(axis, u, v, ang, k = 0) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return axis === 'x' ? [u, k + v * c, v * s] : [k + v * c, u, v * s]
}

/**
 * Revolve a cross-section polygon into a closed BufferGeometry.
 * @param {{points:{u:number,v:number}[], axis:'x'|'y'}} polygon
 * @param {{ angularSegments?:number, sweep?:number }} opts sweep in radians (default 2π)
 */
export function revolveSolid(polygon, opts = {}) {
  const { points, axis } = polygon
  const offset = polygon.offset ?? 0
  const angularSegments = opts.angularSegments ?? 72
  const sweep = opts.sweep ?? Math.PI * 2
  const full = sweep >= Math.PI * 2 - 1e-6
  const P = points.length

  const positions = []
  const indices = []

  // --- Lateral surface: grid of (angularSegments+1) rings × P polygon points ---
  for (let a = 0; a <= angularSegments; a++) {
    const ang = (sweep * a) / angularSegments
    for (let p = 0; p < P; p++) {
      const [x, y, z] = mapPoint(axis, points[p].u, points[p].v, ang, offset)
      positions.push(x, y, z)
    }
  }
  const vid = (a, k) => a * P + k
  for (let a = 0; a < angularSegments; a++) {
    for (let k = 0; k < P; k++) {
      const k2 = (k + 1) % P // wrap to close the polygon around its own boundary
      const v00 = vid(a, k)
      const v01 = vid(a, k2)
      const v10 = vid(a + 1, k)
      const v11 = vid(a + 1, k2)
      indices.push(v00, v10, v11, v00, v11, v01)
    }
  }

  // --- Flat end caps at θ = 0 and θ = sweep (only needed for a partial sweep) ---
  if (!full) {
    const contour = points.map((p) => new THREE.Vector2(p.u, p.v))
    const tris = THREE.ShapeUtils.triangulateShape(contour, [])
    for (const ang of [0, sweep]) {
      const base = positions.length / 3
      for (const p of points) {
        const [x, y, z] = mapPoint(axis, p.u, p.v, ang, offset)
        positions.push(x, y, z)
      }
      for (const t of tris) indices.push(base + t[0], base + t[1], base + t[2])
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/**
 * Flat mesh of the 2D area region (between f and the baseline g / y = 0) lying
 * in the world xy-plane at z = 0 — i.e. the cross-section that gets revolved.
 * Built as a triangle strip across the precomputed samples so it is robust to
 * the curves crossing. Returns a BufferGeometry, or null if nothing to draw.
 */
export function buildRegionMesh(model) {
  const fS = (model.samples && model.samples.f) || []
  const two = model.useSecondCurve && model.g && model.g.ok
  const gS = two ? (model.samples && model.samples.g) || [] : null
  const positions = []
  const indices = []
  let prev = null // vertex index of the previous column's bottom vertex
  let count = 0
  for (let i = 0; i < fS.length; i++) {
    const top = fS[i].y
    const bot = two ? (gS[i] ? gS[i].y : NaN) : 0
    if (!Number.isFinite(top) || !Number.isFinite(bot)) {
      prev = null
      continue
    }
    const x = fS[i].x
    const base = count
    positions.push(x, bot, 0, x, top, 0) // bottom then top
    count += 2
    if (prev != null) {
      indices.push(prev, prev + 1, base + 1, prev, base + 1, base) // two triangles
    }
    prev = base
  }
  if (positions.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Approximate extent of the solid, used to frame the camera and size helpers.
 * Returns { axialMin, axialMax, maxRadius }.
 */
export function solidExtent(model) {
  const { lo, hi, axis } = model
  const k = model.axisOffset ?? 0
  const N = 120
  let maxRadius = 0
  let axialMin = Infinity
  let axialMax = -Infinity
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N
    const [yLo, yHi] = regionAt(model, x)
    if (axis === 'x') {
      maxRadius = Math.max(maxRadius, washerRadii(yLo, yHi, k).R)
      axialMin = Math.min(axialMin, x)
      axialMax = Math.max(axialMax, x)
    } else {
      maxRadius = Math.max(maxRadius, Math.abs(x - k))
      axialMin = Math.min(axialMin, yLo, yHi)
      axialMax = Math.max(axialMax, yLo, yHi)
    }
  }
  if (!Number.isFinite(axialMin)) {
    axialMin = lo
    axialMax = hi
  }
  return { axialMin, axialMax, maxRadius: maxRadius || 1 }
}

// ------------------------------------------------------------------------
// Disk / Shell slices (Phase 4)
// ------------------------------------------------------------------------
//
// Each approximating slice is described by a rectangle in the cross-section
// (axial u ∈ [uLo, uHi], radial v ∈ [vIn, vOut]). Revolving that rectangle is a
// short tube/washer (disk) or a thin ring (shell). The Riemann sum of the slice
// volumes is what converges to the true volume as n grows.

const SCAN = 240 // samples used when scanning the profile for cross-method extents

// Profile accessors describing the solid's cross-section, branchful per axis.
// Radii are distances from the line of revolution (y = k for 'x', x = k for 'y').
function profileFns(model) {
  const { lo, hi, axis } = model
  const k = model.axisOffset ?? 0
  if (axis === 'x') {
    return {
      kind: 'x',
      lo,
      hi,
      vOut: (x) => {
        const [a, b] = regionAt(model, x)
        return washerRadii(a, b, k).R
      },
      vIn: (x) => {
        const [a, b] = regionAt(model, x)
        return washerRadii(a, b, k).r
      },
    }
  }
  return {
    kind: 'y',
    lo,
    hi,
    radius: (x) => Math.abs(x - k),
    lower: (x) => regionAt(model, x)[0],
    upper: (x) => regionAt(model, x)[1],
  }
}

// For axis 'y' disk slabs: the [min,max] height spanned by the solid.
function heightRangeY(prof) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i <= SCAN; i++) {
    const x = prof.lo + ((prof.hi - prof.lo) * i) / SCAN
    min = Math.min(min, prof.lower(x))
    max = Math.max(max, prof.upper(x))
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 }
  if (min === max) max = min + 1
  return { min, max }
}

// For axis 'y' disk slabs: radial extent [vIn,vOut] of the solid at height y.
function radialExtentAtHeight(prof, y) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i <= SCAN; i++) {
    const x = prof.lo + ((prof.hi - prof.lo) * i) / SCAN
    if (prof.lower(x) <= y && y <= prof.upper(x)) {
      const r = prof.radius(x)
      lo = Math.min(lo, r)
      hi = Math.max(hi, r)
    }
  }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0]
}

// For axis 'x' shells: max outer radius across the profile.
function maxRadiusX(prof) {
  let m = 0
  for (let i = 0; i <= SCAN; i++) {
    const x = prof.lo + ((prof.hi - prof.lo) * i) / SCAN
    m = Math.max(m, prof.vOut(x))
  }
  return m || 1
}

// For axis 'x' shells: axial extent + measured length where radius ρ lies in the
// solid (handles non-monotonic curves via a counting measure for the length).
function axialExtentAtRadius(prof, rho) {
  const dx = (prof.hi - prof.lo) / SCAN
  let lo = Infinity
  let hi = -Infinity
  let count = 0
  for (let i = 0; i <= SCAN; i++) {
    const x = prof.lo + dx * i
    if (prof.vIn(x) <= rho && rho <= prof.vOut(x)) {
      lo = Math.min(lo, x)
      hi = Math.max(hi, x)
      count++
    }
  }
  if (!Number.isFinite(lo)) return { lo: 0, hi: 0, length: 0 }
  return { lo, hi, length: count * dx }
}

// Slab volume for a Riemann `rule` given the cross-sectional area A(p) and the
// partition sub-interval [pLo, pHi] of width `delta`. 'left'/'mid'/'right'
// evaluate A at one point; 'trapezoid' averages the two faces.
function slabVolume(A, pLo, pHi, delta, rule) {
  if (rule === 'trapezoid') return 0.5 * (A(pLo) + A(pHi)) * delta
  return A(ruleSamplePoint(pLo, pHi, rule)) * delta
}

/**
 * Build the approximating slices for the current model.
 * @param {string} rule 'left' | 'mid' | 'right' | 'trapezoid' (sample per slab)
 * @returns {{ slices: Array, riemann: number, method: string, axis: string }}
 * Each slice: { uLo, uHi, vIn, vOut, centerAxial, centerRadius, thickness, vol }
 */
export function buildSlices(model, n, method, rule = 'mid') {
  if (!model.valid) return { slices: [], riemann: 0, method, axis: model.axis }
  const { lo, hi, axis } = model
  const prof = profileFns(model)
  const N = Math.max(1, Math.min(200, Math.round(n)))
  const slices = []

  if (method === 'disk' && axis === 'x') {
    const dx = (hi - lo) / N
    const A = (x) => Math.PI * (prof.vOut(x) ** 2 - prof.vIn(x) ** 2)
    for (let i = 0; i < N; i++) {
      const xL = lo + dx * i
      const xR = xL + dx
      const xe = ruleSamplePoint(xL, xR, rule)
      const vOut = prof.vOut(xe)
      const vIn = prof.vIn(xe)
      slices.push({
        uLo: xL, uHi: xR, vIn, vOut,
        centerAxial: (xL + xR) / 2, centerRadius: (vIn + vOut) / 2, thickness: dx,
        vol: slabVolume(A, xL, xR, dx, rule),
      })
    }
  } else if (method === 'disk' && axis === 'y') {
    const { min, max } = heightRangeY(prof)
    const dy = (max - min) / N
    const A = (y) => {
      const [a, b] = radialExtentAtHeight(prof, y)
      return Math.PI * (b * b - a * a)
    }
    for (let i = 0; i < N; i++) {
      const yL = min + dy * i
      const yR = yL + dy
      const [vIn, vOut] = radialExtentAtHeight(prof, ruleSamplePoint(yL, yR, rule))
      slices.push({
        uLo: yL, uHi: yR, vIn, vOut,
        centerAxial: (yL + yR) / 2, centerRadius: (vIn + vOut) / 2, thickness: dy,
        vol: slabVolume(A, yL, yR, dy, rule),
      })
    }
  } else if (method === 'shell' && axis === 'y') {
    const dx = (hi - lo) / N
    const A = (x) => 2 * Math.PI * prof.radius(x) * Math.abs(prof.upper(x) - prof.lower(x))
    for (let i = 0; i < N; i++) {
      const xL = lo + dx * i
      const xR = xL + dx
      const xe = ruleSamplePoint(xL, xR, rule)
      const rho = prof.radius(xe)
      const uLo = prof.lower(xe)
      const uHi = prof.upper(xe)
      slices.push({
        uLo, uHi, vIn: Math.max(0, rho - dx / 2), vOut: rho + dx / 2,
        centerAxial: (uLo + uHi) / 2, centerRadius: rho, thickness: dx,
        vol: slabVolume(A, xL, xR, dx, rule),
      })
    }
  } else {
    // method === 'shell' && axis === 'x' : nested cylinders coaxial with X
    const Rmax = maxRadiusX(prof)
    const dr = Rmax / N
    const A = (r) => 2 * Math.PI * r * axialExtentAtRadius(prof, r).length
    for (let i = 0; i < N; i++) {
      const rL = dr * i
      const rR = rL + dr
      const re = ruleSamplePoint(rL, rR, rule)
      const { lo: uLo, hi: uHi } = axialExtentAtRadius(prof, re)
      slices.push({
        uLo, uHi, vIn: Math.max(0, re - dr / 2), vOut: re + dr / 2,
        centerAxial: (uLo + uHi) / 2, centerRadius: re, thickness: dr,
        vol: slabVolume(A, rL, rR, dr, rule),
      })
    }
  }

  const riemann = slices.reduce((s, sl) => s + sl.vol, 0)
  return { slices, riemann, method, axis }
}

// Revolve one slice rectangle into a tube/ring geometry, centered on the line
// of revolution (offset k).
function sliceGeometry(slice, axis, segments, offset = 0) {
  const { uLo, uHi, vIn, vOut } = slice
  const rect = [
    { u: uLo, v: vIn },
    { u: uHi, v: vIn },
    { u: uHi, v: vOut },
    { u: uLo, v: vOut },
  ]
  return revolveSolid({ points: rect, axis, offset }, { angularSegments: segments, sweep: Math.PI * 2 })
}

/**
 * Merge all (non-highlighted) slices into a single geometry for efficient
 * rendering. Returns { geometry, highlight } where `highlight` is the separate
 * geometry for the slice nearest the highlighted position (or null).
 */
export function buildSlicesGeometry(slices, axis, offset = 0, highlightIndex = -1) {
  const segments = slices.length > 60 ? 28 : 40
  const normal = []
  let highlight = null
  slices.forEach((slice, i) => {
    if (slice.thickness <= 0 || slice.vOut - slice.vIn <= 1e-9) return
    const geo = sliceGeometry(slice, axis, segments, offset)
    if (i === highlightIndex) highlight = geo
    else normal.push(geo)
  })
  const geometry = normal.length ? mergeGeometries(normal, false) : null
  normal.forEach((g) => g !== geometry && g.dispose && g.dispose())
  return { geometry, highlight }
}

/**
 * Map the highlight x-position to a slice index for the current method/axis.
 * The slider is always in x ∈ [lo, hi]; we translate it to whatever variable
 * the slices are partitioned on.
 */
export function highlightSliceIndex(model, slices, method, highlightX) {
  if (highlightX == null || slices.length === 0) return -1
  const prof = profileFns(model)
  const k = model.axisOffset ?? 0

  // What coordinate is the slice center compared on — and what the slider maps to.
  let target
  let coord
  if (method === 'disk' && model.axis === 'x') {
    target = highlightX // slabs partitioned along x
    coord = (s) => s.centerAxial
  } else if (method === 'shell' && model.axis === 'y') {
    target = Math.abs(highlightX - k) // shells partitioned by radius = |x − k|
    coord = (s) => s.centerRadius
  } else if (method === 'disk' && model.axis === 'y') {
    target = safe(model.f, highlightX) // slabs partitioned along height y
    coord = (s) => s.centerAxial
  } else {
    target = prof.vOut(highlightX) // shells partitioned by radius (= radius at x)
    coord = (s) => s.centerRadius
  }

  let best = -1
  let bestD = Infinity
  slices.forEach((s, i) => {
    const d = Math.abs(coord(s) - target)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
