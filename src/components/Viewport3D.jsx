import { useMemo, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Line, Text, Edges, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import {
  buildCrossSectionPolygon,
  revolveSolid,
  solidExtent,
  buildSlicesGeometry,
  highlightSliceIndex,
  buildRegionMesh,
  buildSurfaceGrid,
} from '../lib/geometry'
import {
  buildCrossSectionGeometry,
  highlightCrossSectionIndex,
  crossSectionExtent,
} from '../lib/crossSection'
import { COLORS3D, HIGHLIGHT } from '../lib/colors'
import { niceTicks } from '../lib/format'

// The revolved solid mesh. Geometry is regenerated only when the math model or
// the sweep angle changes (NOT on every orbit/zoom frame).
// Cool depth gradient (deep indigo -> cyan) applied along the solid's axis, so
// points at different depths read as different shades — a strong 3D cue.
const _rampLo = new THREE.Color('#1e3a8a')
const _rampHi = new THREE.Color('#22d3ee')
const _rampScratch = new THREE.Color()
const depthRamp = (t) => _rampScratch.copy(_rampLo).lerp(_rampHi, t < 0 ? 0 : t > 1 ? 1 : t)

// Smooth revolved solid. Geometry is built once in Viewport3D and passed in so
// the result-highlight overlay can reuse the same mesh. Vertex colors carry the
// depth gradient (the geometry is built with depthRamp).
function RevolutionSolid({ geo, visible, opacity, outline }) {
  if (!geo || !visible) return null
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial
        color="#ffffff"
        vertexColors
        side={THREE.DoubleSide}
        transparent
        opacity={opacity}
        depthWrite={opacity > 0.4}
        metalness={0.15}
        roughness={0.35}
      />
      {/* crisp silhouette of the smooth solid (rims/seams only — the lateral
          surface is near-smooth so few edges show) */}
      {outline && <Edges threshold={30} color="#1e3a8a" />}
    </mesh>
  )
}

// Flat highlight of the 2D area region (the cross-section that gets revolved),
// drawn in the world xy-plane.
function RegionHighlight({ model }) {
  const geo = useMemo(() => buildRegionMesh(model), [model])
  useEffect(() => () => geo && geo.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={HIGHLIGHT.area} side={THREE.DoubleSide} transparent opacity={0.6} depthWrite={false} />
    </mesh>
  )
}

// Highlights the geometric "part" a hovered result card refers to.
//   volume  → the whole solid, glowing and filled
//   surface → the solid's outer skin as a bright wireframe
//   area    → the flat generating region (RegionHighlight)
//   arc     → the generating curve f(x) as a thick line
function ResultHighlight({ model, geo, hovered }) {
  const arcPts = useMemo(() => {
    if (hovered !== 'arc') return null
    const pts = []
    for (const p of model.samples.f) if (Number.isFinite(p.y)) pts.push([p.x, p.y, 0])
    return pts.length >= 2 ? pts : null
  }, [model, hovered])

  if (hovered === 'volume' && geo) {
    return (
      <mesh geometry={geo}>
        <meshStandardMaterial
          color={HIGHLIGHT.volume}
          emissive={HIGHLIGHT.volume}
          emissiveIntensity={0.6}
          side={THREE.DoubleSide}
          transparent
          opacity={0.62}
          depthWrite={false}
          roughness={0.4}
        />
      </mesh>
    )
  }
  if (hovered === 'surface' && geo) {
    return (
      <mesh geometry={geo}>
        <meshBasicMaterial color={HIGHLIGHT.surface} wireframe transparent opacity={0.9} />
      </mesh>
    )
  }
  if (hovered === 'area') return <RegionHighlight model={model} />
  if (hovered === 'arc' && arcPts) return <Line points={arcPts} color={HIGHLIGHT.arc} lineWidth={5} />
  return null
}

// Disk/washer or shell slices. The slice nearest the highlight is drawn in amber.
function Slices({ model, sliceData }) {
  const showSlices = useAppStore((s) => s.showSlices)
  const method = useAppStore((s) => s.method)
  const highlightEnabled = useAppStore((s) => s.highlightEnabled)
  const highlightX = useAppStore((s) => s.highlightX)

  const hlIndex = useMemo(
    () => (highlightEnabled ? highlightSliceIndex(model, sliceData.slices, method, highlightX) : -1),
    [model, sliceData, method, highlightX, highlightEnabled],
  )
  const { geometry, highlight } = useMemo(
    () => buildSlicesGeometry(sliceData.slices, model.axis, model.axisOffset ?? 0, hlIndex),
    [sliceData, model.axis, model.axisOffset, hlIndex],
  )
  useEffect(
    () => () => {
      geometry && geometry.dispose()
      highlight && highlight.dispose()
    },
    [geometry, highlight],
  )
  if (!showSlices) return null
  const color = method === 'shell' ? COLORS3D.shellSlice : COLORS3D.diskSlice
  return (
    <group>
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.82} metalness={0.1} roughness={0.5} />
        </mesh>
      )}
      {highlight && (
        <mesh geometry={highlight}>
          <meshStandardMaterial color={COLORS3D.highlightSlice} side={THREE.DoubleSide} metalness={0.2} roughness={0.35} emissive={COLORS3D.highlightSlice} emissiveIntensity={0.25} />
        </mesh>
      )}
    </group>
  )
}

// Known-cross-section slabs (prisms standing on the base region).
//   glow      → orange emissive when volume card is hovered
//   dim       → very transparent when another card is hovered
//   showEdges → whether slab borders are visible (false = "smooth solid" look)
//   colorRamp → depth gradient function (t 0→1) for vertex colors
function CrossSectionPrisms({ model, sliceData, glow, dim, showEdges = true, colorRamp }) {
  const showSlices = useAppStore((s) => s.showSlices)
  const highlightEnabled = useAppStore((s) => s.highlightEnabled)
  const highlightX = useAppStore((s) => s.highlightX)
  const isAnimating = useAppStore((s) => s.isAnimating)
  const buildPct = useAppStore((s) => s.buildPct)

  const hlIndex = useMemo(
    () => (highlightEnabled && !isAnimating ? highlightCrossSectionIndex(sliceData.slices, highlightX) : -1),
    [sliceData, highlightEnabled, highlightX, isAnimating],
  )

  // During build animation, only show the first N slabs.
  const visibleSlices = useMemo(() => {
    if (!isAnimating || buildPct >= 1) return sliceData.slices
    const n = Math.max(1, Math.ceil(buildPct * sliceData.slices.length))
    return sliceData.slices.slice(0, n)
  }, [sliceData.slices, isAnimating, buildPct])

  const { geometry, highlight } = useMemo(
    () =>
      buildCrossSectionGeometry(visibleSlices, model.crossSection, hlIndex, {
        colorRamp,
        lo: model.lo,
        hi: model.hi,
      }),
    [visibleSlices, model.crossSection, hlIndex, colorRamp, model.lo, model.hi],
  )
  useEffect(
    () => () => {
      geometry && geometry.dispose()
      highlight && highlight.dispose()
    },
    [geometry, highlight],
  )
  if (!showSlices) return null
  const useVertexColors = !glow && colorRamp != null
  return (
    <group>
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial
            color={glow ? HIGHLIGHT.volume : '#ffffff'}
            vertexColors={useVertexColors}
            side={THREE.DoubleSide}
            transparent
            opacity={dim ? 0.12 : 0.85}
            metalness={0.1}
            roughness={0.5}
            emissive={glow ? HIGHLIGHT.volume : '#000000'}
            emissiveIntensity={glow ? 0.6 : 0}
            flatShading
          />
          {showEdges && <Edges threshold={18} color="#4c1d95" />}
        </mesh>
      )}
      {highlight && (
        <mesh geometry={highlight}>
          <meshStandardMaterial color={COLORS3D.highlightSlice} side={THREE.DoubleSide} metalness={0.2} roughness={0.35} emissive={COLORS3D.highlightSlice} emissiveIntensity={0.25} flatShading />
        </mesh>
      )}
    </group>
  )
}

const tickText = (v) => Number(v.toFixed(2)).toString()

// A text label that always faces the camera, so axis numbers/letters stay
// readable (never mirrored) when the view is orbited around.
function BillboardText({ position, fontSize, color, children }) {
  return (
    <Billboard position={position}>
      <Text fontSize={fontSize} color={color} anchorX="center" anchorY="middle">
        {children}
      </Text>
    </Billboard>
  )
}

// Numbered length scale along one world axis ('x' | 'y' | 'z'): a short
// perpendicular mark + a numeric label at each "nice" tick over [-L, L]. Ticks
// at 0 and near the far end (where the axis letter sits) are skipped.
function AxisTicks({ L, dir }) {
  const ticks = niceTicks(-L, L, 6).filter((t) => Math.abs(t) > 1e-6 && Math.abs(t) < L * 0.92)
  const d = 0.02 * L // tick mark half-length
  const fs = 0.07 * L // label size
  const lab = 0.06 * L // label offset off the axis
  const color = dir === 'x' ? COLORS3D.axisX : dir === 'y' ? COLORS3D.axisY : COLORS3D.axisZ
  // perpendicular mark endpoints + label offset for a tick value t on this axis
  const place = (t) => {
    if (dir === 'x') return { a: [t, -d, 0], b: [t, d, 0], lp: [t, -lab, 0] }
    if (dir === 'y') return { a: [-d, t, 0], b: [d, t, 0], lp: [-lab, t, 0] }
    return { a: [0, -d, t], b: [0, d, t], lp: [0, -lab, t] } // z
  }
  return (
    <group>
      {ticks.map((t) => {
        const { a, b, lp } = place(t)
        return (
          <group key={`${dir}${t}`}>
            <Line points={[a, b]} color={color} lineWidth={1} />
            <BillboardText position={lp} fontSize={fs} color="#94a3b8">
              {tickText(t)}
            </BillboardText>
          </group>
        )
      })}
    </group>
  )
}

// Coordinate axes (always through the origin) plus the axis of revolution,
// emphasised in amber and offset to the line y = k (axis 'x') / x = k (axis 'y').
// X, Y and Z each carry a numbered length scale.
function Axes({ size, axis, offset = 0 }) {
  const L = size
  return (
    <group>
      <Line points={[[-L, 0, 0], [L, 0, 0]]} color={COLORS3D.axisX} lineWidth={1.5} />
      <Line points={[[0, -L, 0], [0, L, 0]]} color={COLORS3D.axisY} lineWidth={1.5} />
      <Line points={[[0, 0, -L], [0, 0, L]]} color={COLORS3D.axisZ} lineWidth={1.5} />
      <AxisTicks L={L} dir="x" />
      <AxisTicks L={L} dir="y" />
      <AxisTicks L={L} dir="z" />
      {axis === 'x' && (
        <Line points={[[-L, offset, 0], [L, offset, 0]]} color={COLORS3D.revolveAxis} lineWidth={3.5} />
      )}
      {axis === 'y' && (
        <Line points={[[offset, -L, 0], [offset, L, 0]]} color={COLORS3D.revolveAxis} lineWidth={3.5} />
      )}
      <BillboardText position={[L + 0.08 * L, 0, 0]} fontSize={0.14 * L} color={COLORS3D.axisX}>X</BillboardText>
      <BillboardText position={[0, L + 0.08 * L, 0]} fontSize={0.14 * L} color={COLORS3D.axisY}>Y</BillboardText>
      <BillboardText position={[0, 0, L + 0.08 * L]} fontSize={0.14 * L} color={COLORS3D.axisZ}>Z</BillboardText>
    </group>
  )
}

// Frames the camera on the solid from a clear 3/4 angle. Re-runs only when the
// scene frame changes (new function / bounds / axis / mode) — orbiting and
// slicing leave the camera untouched.
function CameraRig({ frame, controlsRef }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const center = new THREE.Vector3(...frame.center)
    const dist = frame.radius * 2.6 + 1
    const dir = new THREE.Vector3(...frame.view).normalize()
    camera.near = Math.max(0.01, frame.radius * 0.02)
    camera.far = dist * 20 + frame.radius * 10
    camera.position.copy(center.clone().add(dir.multiplyScalar(dist)))
    camera.updateProjectionMatrix()
    camera.lookAt(center)
    if (controlsRef.current) {
      controlsRef.current.target.copy(center)
      controlsRef.current.update()
    }
  }, [frame, camera, controlsRef])
  return null
}

// Advances animation for whichever mode is active:
//   revolution  → sweep 0°→360° at 110 deg/s
//   crossSection → build 0→1 at 0.4/s (full build in ~2.5 s)
function AnimationDriver() {
  const isAnimating = useAppStore((s) => s.isAnimating)
  const mode = useAppStore((s) => s.mode)
  useFrame((_, delta) => {
    if (!isAnimating) return
    if (mode === 'revolution') {
      const { sweepDeg, setSweepDeg, setAnimating } = useAppStore.getState()
      const next = sweepDeg + delta * 110
      if (next >= 360) {
        setSweepDeg(360)
        setAnimating(false)
      } else {
        setSweepDeg(next)
      }
    } else {
      const { buildPct, setBuildPct, setAnimating } = useAppStore.getState()
      const next = buildPct + delta * 0.4
      if (next >= 1) {
        setBuildPct(1)
        setAnimating(false)
      } else {
        setBuildPct(next)
      }
    }
  })
  return null
}

export function Viewport3D({ model, sliceData, children }) {
  const sweepDeg = useAppStore((s) => s.sweepDeg)
  const solidView = useAppStore((s) => s.solidView)
  const isAnimating = useAppStore((s) => s.isAnimating)
  const hoveredResult = useAppStore((s) => s.hoveredResult)
  const sweep = (Math.max(0, Math.min(360, sweepDeg)) * Math.PI) / 180
  const controlsRef = useRef(null)
  const isCross = model.mode === 'crossSection'
  const dimmed = hoveredResult != null && !isAnimating

  // Smooth-solid-only reads as an opaque object; alongside slices it's a faint
  // ghost of the target shape behind the slabs. When a result card is hovered,
  // the base solid drops to a faint ghost so the highlight overlay stands out.
  const solidOpacity = dimmed ? 0.06 : isAnimating ? 0.72 : solidView === 'solid' ? 0.92 : 0.18

  // Revolved solid geometry — built once and shared by the solid and the
  // volume/surface highlight overlay.
  const revoGeo = useMemo(
    () =>
      isCross || !model.valid
        ? null
        : revolveSolid(buildCrossSectionPolygon(model), {
            angularSegments: 72,
            sweep,
            colorRamp: depthRamp,
          }),
    [model, sweep, isCross],
  )
  useEffect(() => () => revoGeo && revoGeo.dispose(), [revoGeo])

  // Surface grid lines (rings + meridians) — a "graph-paper" depth cue, shown in
  // the smooth-solid mode where the single surface most needs depth help.
  const gridGeo = useMemo(
    () => (isCross || !model.valid || solidView !== 'solid' ? null : buildSurfaceGrid(model, sweep)),
    [model, sweep, isCross, solidView],
  )
  useEffect(() => () => gridGeo && gridGeo.dispose(), [gridGeo])

  // Unified camera frame + axes/grid sizing, computed per mode.
  const scene = useMemo(() => {
    if (model.mode === 'crossSection') {
      const e = crossSectionExtent(model)
      const cx = (e.xMin + e.xMax) / 2
      const cy = (e.yMin + e.yMax) / 2
      const cz = e.zMax / 2
      const rx = (e.xMax - e.xMin) / 2 || 0.5
      const ry = (e.yMax - e.yMin) / 2 || 0.5
      const rz = e.zMax / 2 || 0.5
      const radius = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1
      const axesSize = Math.max(Math.abs(e.xMin), Math.abs(e.xMax), Math.abs(e.yMin), Math.abs(e.yMax), e.zMax, 1) * 1.2
      return {
        frame: { center: [cx, cy, cz], radius, view: [1.0, 1.05, 0.95] },
        axesSize,
        gridY: Math.min(e.yMin, 0),
        gridSize: Math.max(e.xMax - e.xMin, e.yMax - e.yMin, e.zMax) * 3 + 2,
      }
    }
    const ext = solidExtent(model)
    const k = model.axisOffset ?? 0
    const mid = (ext.axialMin + ext.axialMax) / 2
    const axialHalf = (ext.axialMax - ext.axialMin) / 2
    const R = ext.maxRadius
    const radius = Math.sqrt(axialHalf * axialHalf + R * R) || 1
    const axesSize = Math.max(R + Math.abs(k), Math.abs(ext.axialMax), Math.abs(ext.axialMin), 1) * 1.4
    return {
      frame: {
        // The solid is centered on the line of revolution (y = k or x = k).
        center: model.axis === 'x' ? [mid, k, 0] : [k, mid, 0],
        radius,
        view: model.axis === 'x' ? [0.45, 0.6, 0.95] : [0.95, 0.55, 0.95],
      },
      axesSize,
      gridY: model.axis === 'y' ? ext.axialMin : k - R * 1.05,
      gridSize: Math.max(R, Math.abs(ext.axialMax - ext.axialMin)) * 4 + 2,
    }
  }, [model])

  // r3f can miss the initial container measurement in some embedding contexts,
  // leaving the canvas at its default 300×150. Nudge it until layout settles.
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event('resize'))
    const raf = requestAnimationFrame(fire)
    const timers = [60, 180, 360].map((d) => setTimeout(fire, d))
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-slate-900">
      <Canvas camera={{ position: [6, 5, 9], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={['#0b1120']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 12, 6]} intensity={1.25} />
        <directionalLight position={[-6, -4, -8]} intensity={0.45} />

        <Grid
          position={[0, scene.gridY, 0]}
          args={[scene.gridSize, scene.gridSize]}
          cellColor="#1e293b"
          sectionColor="#334155"
          fadeDistance={scene.gridSize * 1.8}
          infiniteGrid={false}
        />

        <Axes size={scene.axesSize} axis={isCross ? 'none' : model.axis} offset={model.axisOffset ?? 0} />

        {isCross ? (
          <>
            {sliceData && (
              <CrossSectionPrisms
                model={model}
                sliceData={sliceData}
                glow={hoveredResult === 'volume'}
                dim={dimmed && hoveredResult !== 'volume'}
                showEdges={solidView !== 'solid'}
                colorRamp={depthRamp}
              />
            )}
            {hoveredResult === 'area' && <RegionHighlight model={model} />}
          </>
        ) : (
          <>
            <RevolutionSolid
              geo={revoGeo}
              visible={solidView !== 'slices'}
              opacity={solidOpacity}
              outline={!dimmed && !isAnimating && solidView === 'solid'}
            />
            {gridGeo && !isAnimating && !dimmed && (
              <lineSegments geometry={gridGeo}>
                <lineBasicMaterial color="#bae6fd" transparent opacity={0.32} depthWrite={false} />
              </lineSegments>
            )}
            {sliceData && !isAnimating && !dimmed && solidView !== 'solid' && (
              <Slices model={model} sliceData={sliceData} />
            )}
            {!isAnimating && <ResultHighlight model={model} geo={revoGeo} hovered={hoveredResult} />}
          </>
        )}
        {children}

        <CameraRig frame={scene.frame} controlsRef={controlsRef} />
        <AnimationDriver />
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.12} />
      </Canvas>

      {!model.valid && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-500">
          กรอกฟังก์ชันที่ถูกต้องเพื่อแสดงของแข็ง 3 มิติ
        </div>
      )}
    </div>
  )
}
