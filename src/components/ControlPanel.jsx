import { useAppStore } from '../store/useAppStore'
import { EquationInput } from './EquationInput'
import { Field, NumberField, Segmented, Slider, Toggle, Button } from './ui/controls'
import { COLORS } from '../lib/colors'
import { fmt } from '../lib/format'
import { CROSS_SECTIONS } from '../lib/crossSectionShapes'
import { EXAMPLES } from '../lib/examples'

// One-click example chips. Loading a preset merges its full config into the store.
function ExamplePicker() {
  const Chip = ({ ex, tint }) => (
    <button
      type="button"
      onClick={() => useAppStore.setState({ ...ex.state, manualIntersections: null })}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${tint}`}
    >
      {ex.label}
    </button>
  )
  const rev = EXAMPLES.filter((e) => e.group === 'revolution')
  const cross = EXAMPLES.filter((e) => e.group === 'cross')
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {rev.map((ex, i) => (
          <Chip
            key={`r${i}`}
            ex={ex}
            tint="border-slate-600 bg-slate-900/60 text-slate-300 hover:border-sky-400 hover:text-white"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cross.map((ex, i) => (
          <Chip
            key={`c${i}`}
            ex={ex}
            tint="border-violet-500/40 bg-violet-500/10 text-violet-200 hover:border-violet-400 hover:text-white"
          />
        ))}
      </div>
    </div>
  )
}

// Live radius + cross-sectional/shell area of the highlighted slice, linked to
// the active method's formula.
function HighlightReadout({ model, method, mode, crossSection, x }) {
  const fv = model.f && model.f.ok ? model.f.evaluate(x) : NaN
  const Row = ({ label, value, color }) => (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono" style={{ color: color || '#e2e8f0' }}>
        {value}
      </span>
    </div>
  )
  if (!Number.isFinite(fv)) {
    return <p className="mt-1 text-xs text-slate-500">x = {fmt(x, 3)} (ไม่นิยาม)</p>
  }
  if (mode === 'crossSection') {
    const gv = model.useSecondCurve && model.g && model.g.ok ? model.g.evaluate(x) : 0
    const s = model.useSecondCurve ? Math.abs(fv - gv) : Math.abs(fv)
    const factor = CROSS_SECTIONS[crossSection]?.factor ?? 1
    return (
      <div className="mt-1.5 space-y-0.5 text-xs">
        <Row label="ตำแหน่ง x" value={fmt(x, 3)} />
        <Row label="ด้าน s = ความสูงฐาน" value={fmt(s, 3)} color="#a78bfa" />
        <Row label="พื้นที่หน้าตัด A" value={fmt(factor * s * s, 3)} color="#34d399" />
      </div>
    )
  }
  if (method === 'disk') {
    const r = Math.abs(fv)
    return (
      <div className="mt-1.5 space-y-0.5 text-xs">
        <Row label="ตำแหน่ง x" value={fmt(x, 3)} />
        <Row label="รัศมี  r = |f(x)|" value={fmt(r, 3)} color="#38bdf8" />
        <Row label="พื้นที่หน้าตัด  πr²" value={fmt(Math.PI * r * r, 3)} color="#34d399" />
      </div>
    )
  }
  const rho = Math.abs(x)
  const h = Math.abs(fv)
  return (
    <div className="mt-1.5 space-y-0.5 text-xs">
      <Row label="ตำแหน่ง x" value={fmt(x, 3)} />
      <Row label="รัศมีเปลือก  |x|" value={fmt(rho, 3)} color="#f472b6" />
      <Row label="สูง  h = |f(x)|" value={fmt(h, 3)} color="#38bdf8" />
      <Row label="พื้นที่ผิว  2πrh" value={fmt(2 * Math.PI * rho * h, 3)} color="#34d399" />
    </div>
  )
}

// Left panel: every input that drives the visualisation.
export function ControlPanel({ model }) {
  const fInput = useAppStore((s) => s.fInput)
  const gInput = useAppStore((s) => s.gInput)
  const useSecondCurve = useAppStore((s) => s.useSecondCurve)
  const a = useAppStore((s) => s.a)
  const b = useAppStore((s) => s.b)
  const axis = useAppStore((s) => s.axis)
  const method = useAppStore((s) => s.method)
  const mode = useAppStore((s) => s.mode)
  const crossSection = useAppStore((s) => s.crossSection)
  const n = useAppStore((s) => s.n)
  const viewMode = useAppStore((s) => s.viewMode)
  const highlightEnabled = useAppStore((s) => s.highlightEnabled)
  const highlightX = useAppStore((s) => s.highlightX)
  const isAnimating = useAppStore((s) => s.isAnimating)

  const setF = useAppStore((s) => s.setF)
  const setG = useAppStore((s) => s.setG)
  const setUseSecondCurve = useAppStore((s) => s.setUseSecondCurve)
  const setA = useAppStore((s) => s.setA)
  const setB = useAppStore((s) => s.setB)
  const setAxis = useAppStore((s) => s.setAxis)
  const setMethod = useAppStore((s) => s.setMethod)
  const setMode = useAppStore((s) => s.setMode)
  const setCrossSection = useAppStore((s) => s.setCrossSection)
  const setN = useAppStore((s) => s.setN)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const setHighlightEnabled = useAppStore((s) => s.setHighlightEnabled)
  const setHighlightX = useAppStore((s) => s.setHighlightX)
  const setAnimating = useAppStore((s) => s.setAnimating)
  const setSweepDeg = useAppStore((s) => s.setSweepDeg)

  const fError = model.f && !model.f.ok ? model.f.error : null
  const gError = useSecondCurve && model.g && !model.g.ok ? model.g.error : null

  const playAnimation = () => {
    if (isAnimating) {
      setAnimating(false)
    } else {
      setViewMode('3d')
      setSweepDeg(0)
      setAnimating(true)
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <header>
        <h1 className="text-lg font-bold text-white">เครื่องมือหาปริมาตร</h1>
        <p className="text-xs text-slate-400">
          ของแข็งจากการหมุน &amp; ปริมาตรจากภาคตัดขวาง
        </p>
      </header>

      {/* Construction mode */}
      <section>
        <Field label="ประเภทของแข็ง">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'revolution', label: 'การหมุน' },
              { value: 'crossSection', label: 'ภาคตัดขวาง' },
            ]}
          />
        </Field>
      </section>

      {/* Example presets */}
      <section>
        <Field label="ตัวอย่าง (กดเพื่อโหลดทั้งโจทย์)">
          <ExamplePicker />
        </Field>
      </section>

      {/* Equations */}
      <section className="space-y-3">
        <EquationInput
          label="ฟังก์ชันหลัก"
          value={fInput}
          onChange={setF}
          error={fError}
          color={COLORS.curveF}
        />

        <Toggle
          checked={useSecondCurve}
          onChange={setUseSecondCurve}
          label="เพิ่มเส้นที่สอง (หาพื้นที่ระหว่างเส้น)"
        />

        {useSecondCurve && (
          <EquationInput
            label="ฟังก์ชันที่สอง"
            value={gInput}
            onChange={setG}
            error={gError}
            color={COLORS.curveG}
          />
        )}
      </section>

      {/* Bounds */}
      <section>
        <Field label="ช่วงอินทิเกรต [a, b]">
          <div className="grid grid-cols-2 gap-2">
            <NumberField value={a} onChange={setA} />
            <NumberField value={b} onChange={setB} />
          </div>
        </Field>
      </section>

      {/* Revolution: axis + method */}
      {mode === 'revolution' && (
        <>
          <section>
            <Field label="แกนหมุน">
              <Segmented
                value={axis}
                onChange={setAxis}
                options={[
                  { value: 'x', label: 'แกน X' },
                  { value: 'y', label: 'แกน Y' },
                ]}
              />
            </Field>
          </section>

          <section>
            <Field label="วิธีคำนวณปริมาตร">
              <Segmented
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'disk', label: 'แผ่นจาน (Disk)' },
                  { value: 'shell', label: 'เปลือก (Shell)' },
                ]}
              />
            </Field>
          </section>
        </>
      )}

      {/* Cross-section: shape picker */}
      {mode === 'crossSection' && (
        <section>
          <Field label="รูปภาคตัดขวาง (ตั้งฉากแกน X)">
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(CROSS_SECTIONS).map(([key, sh]) => {
                const active = key === crossSection
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCrossSection(key)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                        : 'border-slate-600 bg-slate-900/60 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {sh.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              ฐาน = บริเวณใต้กราฟ/ระหว่างเส้น · V = ∫A(x)dx
            </p>
          </Field>
        </section>
      )}

      {/* View mode */}
      <section>
        <Field label="มุมมอง">
          <Segmented
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: '2d', label: '2 มิติ' },
              { value: '3d', label: '3 มิติ' },
            ]}
          />
        </Field>
      </section>

      {/* Slice count n */}
      <section>
        <Field label="จำนวนแผ่น (n)" hint={`${n} แผ่น`}>
          <Slider value={n} onChange={setN} min={1} max={120} step={1} />
          <p className="mt-1 text-xs text-slate-500">
            n น้อย = แผ่นหนา เห็นชัด (ค่าประมาณหยาบ) · n มาก = ค่าลู่เข้าค่าจริง
          </p>
        </Field>
      </section>

      {/* Revolution animation (revolution mode only) */}
      {mode === 'revolution' && (
        <section>
          <Button variant="amber" onClick={playAnimation} className="w-full">
            {isAnimating ? '■ หยุด' : '▶ หมุนสร้างของแข็ง 360°'}
          </Button>
        </section>
      )}

      {/* Interactive highlight */}
      <section className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <Toggle
          checked={highlightEnabled}
          onChange={(v) => {
            setHighlightEnabled(v)
            if (v && highlightX == null) setHighlightX((model.lo + model.hi) / 2)
          }}
          label="ไฮไลต์ชิ้นที่ตำแหน่ง x"
        />
        {highlightEnabled && (
          <div className="mt-2">
            <Slider
              value={highlightX ?? (model.lo + model.hi) / 2}
              onChange={setHighlightX}
              min={model.lo}
              max={model.hi}
              step={(model.hi - model.lo) / 200 || 0.01}
            />
            <HighlightReadout
              model={model}
              method={method}
              mode={mode}
              crossSection={crossSection}
              x={highlightX ?? (model.lo + model.hi) / 2}
            />
          </div>
        )}
      </section>
    </div>
  )
}
