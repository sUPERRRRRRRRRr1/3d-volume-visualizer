import { useMemo } from 'react'
import { useAppStore } from './store/useAppStore'
import { useMathModel } from './hooks/useMathModel'
import { buildSlices } from './lib/geometry'
import { buildCrossSectionSlices } from './lib/crossSection'
import { ControlPanel } from './components/ControlPanel'
import { SolutionPanel } from './components/SolutionPanel'
import { Plot2D } from './components/Plot2D'
import { Viewport3D } from './components/Viewport3D'

export default function App() {
  const model = useMathModel()
  const viewMode = useAppStore((s) => s.viewMode)
  const n = useAppStore((s) => s.n)

  // Approximating slices + Riemann sum. Shared by the 3D view (geometry) and the
  // solution panel (convergence display). Recomputes only on model or n changes.
  const sliceData = useMemo(
    () =>
      model.mode === 'crossSection'
        ? buildCrossSectionSlices(model, n, model.crossSection)
        : buildSlices(model, n, model.method),
    [model, n],
  )

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[330px_minmax(0,1fr)_390px] lg:grid-rows-1 lg:overflow-hidden">
      {/* Left — controls */}
      <aside className="border-b border-slate-800 bg-slate-900 lg:h-full lg:overflow-hidden lg:border-b-0 lg:border-r">
        <ControlPanel model={model} />
      </aside>

      {/* Center — viewport */}
      <main className="relative min-h-[60vh] bg-slate-950 p-2 lg:h-full lg:min-h-0">
        {viewMode === '3d' ? (
          <Viewport3D model={model} sliceData={sliceData} />
        ) : (
          <Plot2D model={model} sliceData={sliceData} />
        )}
      </main>

      {/* Right — solution */}
      <aside className="border-t border-slate-800 bg-slate-900 lg:h-full lg:overflow-hidden lg:border-l lg:border-t-0">
        <SolutionPanel model={model} sliceData={sliceData} />
      </aside>
    </div>
  )
}
