import { useMemo, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Line, Text, Edges } from '@react-three/drei'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import {
  buildCrossSectionPolygon,
  revolveSolid,
  solidExtent,
  buildSlicesGeometry,
  highlightSliceIndex,
} from '../lib/geometry'
import {
  buildCrossSectionGeometry,
  highlightCrossSectionIndex,
  crossSectionExtent,
} from '../lib/crossSection'
import { COLORS3D } from '../lib/colors'

// The revolved solid mesh. Geometry is regenerated only when the math model or
// the sweep angle changes (NOT on every orbit/zoom frame).
function RevolutionSolid({ model, sweep, visible, opacity }) {
  const geo = useMemo(() => {
    if (!model.valid) return null
    return revolveSolid(buildCrossSectionPolygon(model), { angularSegments: 72, sweep })
  }, [model, sweep])
  useEffect(() => () => geo && geo.dispose(), [geo])
  if (!geo || !visible) return null
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial
        color={COLORS3D.solid}
        side={THREE.DoubleSide}
        transparent
        opacity={opacity}
        depthWrite={opacity > 0.4}
        metalness={0.1}
        roughness={0.4}
      />
    </mesh>
  )
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
    () => buildSlicesGeometry(sliceData.slices, model.axis, hlIndex),
    [sliceData, model.axis, hlIndex],
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
function CrossSectionPrisms({ model, sliceData }) {
  const showSlices = useAppStore((s) => s.showSlices)
  const highlightEnabled = useAppStore((s) => s.highlightEnabled)
  const highlightX = useAppStore((s) => s.highlightX)

  const hlIndex = useMemo(
    () => (highlightEnabled ? highlightCrossSectionIndex(sliceData.slices, highlightX) : -1),
    [sliceData, highlightEnabled, highlightX],
  )
  const { geometry, highlight } = useMemo(
    () => buildCrossSectionGeometry(sliceData.slices, model.crossSection, hlIndex),
    [sliceData, model.crossSection, hlIndex],
  )
  useEffect(
    () => () => {
      geometry && geometry.dispose()
      highlight && highlight.dispose()
    },
    [geometry, highlight],
  )
  if (!showSlices) return null
  return (
    <group>
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={COLORS3D.crossSection} side={THREE.DoubleSide} transparent opacity={0.85} metalness={0.1} roughness={0.5} flatShading />
          {/* outline each slab so the stacked 3D structure reads clearly */}
          <Edges threshold={18} color="#4c1d95" />
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

// Coordinate axes; the axis of revolution (if any) is thicker and amber.
function Axes({ size, axis }) {
  const L = size
  const isX = axis === 'x'
  const isY = axis === 'y'
  return (
    <group>
      <Line points={[[-L, 0, 0], [L, 0, 0]]} color={isX ? COLORS3D.revolveAxis : COLORS3D.axisX} lineWidth={isX ? 3.5 : 1.5} />
      <Line points={[[0, -L, 0], [0, L, 0]]} color={isY ? COLORS3D.revolveAxis : COLORS3D.axisY} lineWidth={isY ? 3.5 : 1.5} />
      <Line points={[[0, 0, -L], [0, 0, L]]} color={COLORS3D.axisZ} lineWidth={1.5} />
      <Text position={[L + 0.08 * L, 0, 0]} fontSize={0.14 * L} color={COLORS3D.axisX}>X</Text>
      <Text position={[0, L + 0.08 * L, 0]} fontSize={0.14 * L} color={COLORS3D.axisY}>Y</Text>
      <Text position={[0, 0, L + 0.08 * L]} fontSize={0.14 * L} color={COLORS3D.axisZ}>Z</Text>
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

// Advances the revolution sweep angle 0° → 360°, then stops (revolution mode).
function AnimationDriver() {
  const isAnimating = useAppStore((s) => s.isAnimating)
  useFrame((_, delta) => {
    if (!isAnimating) return
    const { sweepDeg, setSweepDeg, setAnimating } = useAppStore.getState()
    const next = sweepDeg + delta * 110
    if (next >= 360) {
      setSweepDeg(360)
      setAnimating(false)
    } else {
      setSweepDeg(next)
    }
  })
  return null
}

export function Viewport3D({ model, sliceData, children }) {
  const sweepDeg = useAppStore((s) => s.sweepDeg)
  const showSolid = useAppStore((s) => s.showSolid)
  const showSlices = useAppStore((s) => s.showSlices)
  const isAnimating = useAppStore((s) => s.isAnimating)
  const sweep = (Math.max(0, Math.min(360, sweepDeg)) * Math.PI) / 180
  const controlsRef = useRef(null)
  const isCross = model.mode === 'crossSection'

  const solidOpacity = isAnimating ? 0.7 : showSlices ? 0.12 : 0.5

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
    const mid = (ext.axialMin + ext.axialMax) / 2
    const axialHalf = (ext.axialMax - ext.axialMin) / 2
    const R = ext.maxRadius
    const radius = Math.sqrt(axialHalf * axialHalf + R * R) || 1
    const axesSize = Math.max(R, Math.abs(ext.axialMax), Math.abs(ext.axialMin), 1) * 1.4
    return {
      frame: {
        center: model.axis === 'x' ? [mid, 0, 0] : [0, mid, 0],
        radius,
        view: model.axis === 'x' ? [0.45, 0.6, 0.95] : [0.95, 0.55, 0.95],
      },
      axesSize,
      gridY: model.axis === 'y' ? ext.axialMin : -R * 1.05,
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
        <ambientLight intensity={0.75} />
        <directionalLight position={[8, 12, 6]} intensity={1.1} />
        <directionalLight position={[-6, -4, -8]} intensity={0.35} />

        <Grid
          position={[0, scene.gridY, 0]}
          args={[scene.gridSize, scene.gridSize]}
          cellColor="#1e293b"
          sectionColor="#334155"
          fadeDistance={scene.gridSize * 1.8}
          infiniteGrid={false}
        />

        <Axes size={scene.axesSize} axis={isCross ? 'none' : model.axis} />

        {isCross ? (
          sliceData && <CrossSectionPrisms model={model} sliceData={sliceData} />
        ) : (
          <>
            <RevolutionSolid model={model} sweep={sweep} visible={showSolid} opacity={solidOpacity} />
            {sliceData && !isAnimating && <Slices model={model} sliceData={sliceData} />}
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
