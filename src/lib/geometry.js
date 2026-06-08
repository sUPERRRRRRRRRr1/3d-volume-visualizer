import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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
  const { f, g, lo, hi, axis, useSecondCurve } = model
  const N = PROFILE_SAMPLES
  const points = []
  const xAt = (i) => lo + ((hi - lo) * i) / N

  if (axis === 'x') {
    // u = x, v = radius = |f| (and |g| for the inner wall of a washer).
    const outer = (x) => {
      const a = Math.abs(safe(f, x))
      if (useSecondCurve && g && g.ok) return Math.max(a, Math.abs(safe(g, x)))
      return a
    }
    const inner = (x) =>
      useSecondCurve && g && g.ok
        ? Math.min(Math.abs(safe(f, x)), Math.abs(safe(g, x)))
        : 0
    // Inner edge lo → hi (v = rInner), then outer edge hi → lo (v = rOuter).
    for (let i = 0; i <= N; i++) points.push({ u: xAt(i), v: inner(xAt(i)) })
    for (let i = N; i >= 0; i--) points.push({ u: xAt(i), v: outer(xAt(i)) })
  } else {
    // axis 'y': u = height, v = radius = |x|. Region is the band between the
    // lower and upper boundary in height for each radius x.
    const radius = (x) => Math.abs(x)
    const lower = (x) =>
      useSecondCurve && g && g.ok
        ? Math.min(safe(f, x), safe(g, x))
        : Math.min(0, safe(f, x))
    const upper = (x) =>
      useSecondCurve && g && g.ok
        ? Math.max(safe(f, x), safe(g, x))
        : Math.max(0, safe(f, x))
    // Lower edge lo → hi, then upper edge hi → lo.
    for (let i = 0; i <= N; i++) points.push({ u: lower(xAt(i)), v: radius(xAt(i)) })
    for (let i = N; i >= 0; i--) points.push({ u: upper(xAt(i)), v: radius(xAt(i)) })
  }

  return { points, axis }
}

// Map an (u, v) profile point at angle θ to world coordinates for the given axis.
function mapPoint(axis, u, v, ang) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return axis === 'x' ? [u, v * c, v * s] : [v * c, u, v * s]
}

/**
 * Revolve a cross-section polygon into a closed BufferGeometry.
 * @param {{points:{u:number,v:number}[], axis:'x'|'y'}} polygon
 * @param {{ angularSegments?:number, sweep?:number }} opts sweep in radians (default 2π)
 */
export function revolveSolid(polygon, opts = {}) {
  const { points, axis } = polygon
  const angularSegments = opts.angularSegments ?? 72
  const sweep = opts.sweep ?? Math.PI * 2
  const full = sweep >= Math.PI * 2 - 1e-6
  const P = points.length

  const positions = []
  const indices = []

  // --- Lateral surface: grid of (angularSegments+1) rings × P polygon points ---
  for (let a = 0; a <= angularSegments; a++) {
    const ang = (sweep * a) / angularSegments
    for (let k = 0; k < P; k++) {
      const [x, y, z] = mapPoint(axis, points[k].u, points[k].v, ang)
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
        const [x, y, z] = mapPoint(axis, p.u, p.v, ang)
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
 * Approximate extent of the solid, used to frame the camera and size helpers.
 * Returns { axialMin, axialMax, maxRadius }.
 */
export function solidExtent(model) {
  const { f, g, lo, hi, axis, useSecondCurve } = model
  const N = 120
  let maxRadius = 0
  let axialMin = Infinity
  let axialMax = -Infinity
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N
    const fv = safe(f, x)
    const gv = useSecondCurve && g && g.ok ? safe(g, x) : 0
    if (axis === 'x') {
      maxRadius = Math.max(maxRadius, Math.abs(fv), Math.abs(gv))
      axialMin = Math.min(axialMin, x)
      axialMax = Math.max(axialMax, x)
    } else {
      maxRadius = Math.max(maxRadius, Math.abs(x))
      axialMin = Math.min(axialMin, fv, gv, 0)
      axialMax = Math.max(axialMax, fv, gv, 0)
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
function profileFns(model) {
  const { f, g, lo, hi, axis, useSecondCurve } = model
  const two = useSecondCurve && g && g.ok
  const F = (x) => safe(f, x)
  const G = (x) => (two ? safe(g, x) : 0)
  if (axis === 'x') {
    return {
      kind: 'x',
      lo,
      hi,
      vOut: (x) => (two ? Math.max(Math.abs(F(x)), Math.abs(G(x))) : Math.abs(F(x))),
      vIn: (x) => (two ? Math.min(Math.abs(F(x)), Math.abs(G(x))) : 0),
    }
  }
  return {
    kind: 'y',
    lo,
    hi,
    radius: (x) => Math.abs(x),
    lower: (x) => (two ? Math.min(F(x), G(x)) : Math.min(0, F(x))),
    upper: (x) => (two ? Math.max(F(x), G(x)) : Math.max(0, F(x))),
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

/**
 * Build the approximating slices for the current model.
 * @returns {{ slices: Array, riemann: number, method: string, axis: string }}
 * Each slice: { uLo, uHi, vIn, vOut, centerAxial, centerRadius, thickness, vol }
 */
export function buildSlices(model, n, method) {
  if (!model.valid) return { slices: [], riemann: 0, method, axis: model.axis }
  const { lo, hi, axis } = model
  const prof = profileFns(model)
  const N = Math.max(1, Math.min(200, Math.round(n)))
  const slices = []

  if (method === 'disk' && axis === 'x') {
    const dx = (hi - lo) / N
    for (let i = 0; i < N; i++) {
      const xc = lo + dx * (i + 0.5)
      const vOut = prof.vOut(xc)
      const vIn = prof.vIn(xc)
      slices.push({
        uLo: xc - dx / 2, uHi: xc + dx / 2, vIn, vOut,
        centerAxial: xc, centerRadius: (vIn + vOut) / 2, thickness: dx,
        vol: Math.PI * (vOut * vOut - vIn * vIn) * dx,
      })
    }
  } else if (method === 'disk' && axis === 'y') {
    const { min, max } = heightRangeY(prof)
    const dy = (max - min) / N
    for (let i = 0; i < N; i++) {
      const yc = min + dy * (i + 0.5)
      const [vIn, vOut] = radialExtentAtHeight(prof, yc)
      slices.push({
        uLo: yc - dy / 2, uHi: yc + dy / 2, vIn, vOut,
        centerAxial: yc, centerRadius: (vIn + vOut) / 2, thickness: dy,
        vol: Math.PI * (vOut * vOut - vIn * vIn) * dy,
      })
    }
  } else if (method === 'shell' && axis === 'y') {
    const dx = (hi - lo) / N
    for (let i = 0; i < N; i++) {
      const xc = lo + dx * (i + 0.5)
      const rho = Math.abs(xc)
      const uLo = prof.lower(xc)
      const uHi = prof.upper(xc)
      slices.push({
        uLo, uHi, vIn: Math.max(0, rho - dx / 2), vOut: rho + dx / 2,
        centerAxial: (uLo + uHi) / 2, centerRadius: rho, thickness: dx,
        vol: 2 * Math.PI * rho * Math.abs(uHi - uLo) * dx,
      })
    }
  } else {
    // method === 'shell' && axis === 'x' : nested cylinders coaxial with X
    const Rmax = maxRadiusX(prof)
    const dr = Rmax / N
    for (let i = 0; i < N; i++) {
      const rho = dr * (i + 0.5)
      const { lo: uLo, hi: uHi, length } = axialExtentAtRadius(prof, rho)
      slices.push({
        uLo, uHi, vIn: Math.max(0, rho - dr / 2), vOut: rho + dr / 2,
        centerAxial: (uLo + uHi) / 2, centerRadius: rho, thickness: dr,
        vol: 2 * Math.PI * rho * length * dr,
      })
    }
  }

  const riemann = slices.reduce((s, sl) => s + sl.vol, 0)
  return { slices, riemann, method, axis }
}

// Revolve one slice rectangle into a tube/ring geometry.
function sliceGeometry(slice, axis, segments) {
  const { uLo, uHi, vIn, vOut } = slice
  const rect = [
    { u: uLo, v: vIn },
    { u: uHi, v: vIn },
    { u: uHi, v: vOut },
    { u: uLo, v: vOut },
  ]
  return revolveSolid({ points: rect, axis }, { angularSegments: segments, sweep: Math.PI * 2 })
}

/**
 * Merge all (non-highlighted) slices into a single geometry for efficient
 * rendering. Returns { geometry, highlight } where `highlight` is the separate
 * geometry for the slice nearest the highlighted position (or null).
 */
export function buildSlicesGeometry(slices, axis, highlightIndex = -1) {
  const segments = slices.length > 60 ? 28 : 40
  const normal = []
  let highlight = null
  slices.forEach((slice, i) => {
    if (slice.thickness <= 0 || slice.vOut - slice.vIn <= 1e-9) return
    const geo = sliceGeometry(slice, axis, segments)
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

  // What coordinate is the slice center compared on — and what the slider maps to.
  let target
  let coord
  if (method === 'disk' && model.axis === 'x') {
    target = highlightX // slabs partitioned along x
    coord = (s) => s.centerAxial
  } else if (method === 'shell' && model.axis === 'y') {
    target = Math.abs(highlightX) // shells partitioned by radius = |x|
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
