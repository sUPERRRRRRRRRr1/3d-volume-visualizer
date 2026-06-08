import katex from 'katex'
import { useAppStore } from '../store/useAppStore'
import { fmt, fmtSnap } from '../lib/format'
import { COLORS } from '../lib/colors'
import { NumberField } from './ui/controls'

// Intersection list with an optional manual-edit mode, in case the numerical
// detector misses a point (per the project's Problem 2 requirements).
function IntersectionEditor({ model }) {
  const manual = useAppStore((s) => s.manualIntersections)
  const setManual = useAppStore((s) => s.setManualIntersections)
  const isManual = manual != null
  const points = model.intersections
  const yAt = (x) => (model.f && model.f.ok ? model.f.evaluate(x) : NaN)
  const mkPoint = (x) => ({ x, xDisplay: x, y: yAt(x), kind: 'manual' })

  const startEdit = () => setManual(points.map((p) => ({ ...p })))
  const update = (i, x) => {
    const next = [...manual]
    next[i] = mkPoint(x)
    setManual(next)
  }
  const remove = (i) => setManual(manual.filter((_, j) => j !== i))
  const add = () => setManual([...(manual || []), mkPoint((model.lo + model.hi) / 2)])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">จุดตัดของเส้นโค้ง</h3>
        <button
          type="button"
          onClick={isManual ? () => setManual(null) : startEdit}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          {isManual ? '↺ ใช้อัตโนมัติ' : '✎ ปรับแก้เอง'}
        </button>
      </div>

      {points.length === 0 && !isManual ? (
        <p className="text-sm text-slate-500">ไม่พบจุดตัดในช่วง [a, b] นี้</p>
      ) : (
        <ul className="space-y-1.5">
          {points.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLORS.intersection }}
                />
                {isManual ? (
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-slate-400">x =</span>
                    <div className="w-24">
                      <NumberField value={p.x} onChange={(v) => update(i, v)} step={0.1} />
                    </div>
                  </span>
                ) : (
                  <span className="font-mono text-slate-200">x = {fmtSnap(p.x, 5)}</span>
                )}
              </span>
              {isManual ? (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-slate-500 hover:text-rose-400"
                  aria-label="ลบจุด"
                >
                  ✕
                </button>
              ) : (
                <span className="text-xs text-slate-400">
                  {p.kind === 'tangent' ? 'จุดสัมผัส' : 'จุดตัด'} · y = {fmt(p.y, 3)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isManual && (
        <button
          type="button"
          onClick={add}
          className="mt-2 text-xs text-slate-400 hover:text-slate-200"
        >
          + เพิ่มจุดตัด
        </button>
      )}
    </section>
  )
}

// Render one LaTeX step with KaTeX. throwOnError:false keeps a bad string from
// ever crashing the panel (it renders the offending part in red instead).
function Step({ index, label, latex }) {
  const html = katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    errorColor: '#fb7185',
  })
  return (
    <li className="rounded-md border border-slate-700/70 bg-slate-900/40 p-2.5">
      <div className="mb-1 text-xs text-slate-400">
        {index}. {label}
      </div>
      <div
        className="overflow-x-auto text-slate-100"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </li>
  )
}

function Stat({ label, value, unit, hint, accent }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div
        className="mt-0.5 text-2xl font-semibold"
        style={{ color: accent || '#ffffff' }}
      >
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

// Right panel: 2D area, intersection points, volume, and the convergence of the
// Riemann (slice) approximation toward the true volume.
export function SolutionPanel({ model, sliceData }) {
  const n = useAppStore((s) => s.n)
  const method = useAppStore((s) => s.method)
  const mode = useAppStore((s) => s.mode)
  const crossSection = useAppStore((s) => s.crossSection)
  const { valid, error, area, useSecondCurve, volume, solution } = model
  const isCross = mode === 'crossSection'

  const riemann = sliceData ? sliceData.riemann : null
  const errAbs = volume != null && riemann != null ? Math.abs(riemann - volume) : null
  const errPct = errAbs != null && Math.abs(volume) > 1e-9 ? (errAbs / Math.abs(volume)) * 100 : null
  // The π-multiple hint is only meaningful for revolution (always a π multiple).
  const piMultiple = !isCross && volume != null ? volume / Math.PI : null
  const approxLabel = isCross
    ? `ค่าประมาณ (ภาคตัดขวาง, n = ${n})`
    : `ค่าประมาณแบบ ${method === 'shell' ? 'เปลือก' : 'แผ่นจาน'} (n = ${n})`

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-lg font-bold text-white">ผลลัพธ์ &amp; วิธีทำ</h2>

      {!valid && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error ?? 'กรุณากรอกข้อมูลให้ถูกต้องเพื่อเริ่มคำนวณ'}
        </div>
      )}

      {valid && (
        <>
          {model.crossesAxis && model.axis === 'x' && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              ⚠ เส้นโค้งข้ามแกนหมุนในช่วงนี้ ของแข็งอาจซ้อนทับกัน — ระบบคิดปริมาตรจากค่าสัมบูรณ์ของรัศมี
            </div>
          )}

          <Stat
            label="ปริมาตรของแข็ง (ค่าจริง)"
            value={fmt(volume, 4)}
            unit="ลบ.หน่วย"
            accent={COLORS.areaStroke}
            hint={piMultiple != null ? `≈ ${fmt(piMultiple, 4)}·π` : undefined}
          />

          {/* Riemann approximation + convergence */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">{approxLabel}</span>
              {errPct != null && (
                <span className="text-xs text-slate-500">คลาดเคลื่อน {fmt(errPct, 2)}%</span>
              )}
            </div>
            <div className="mt-0.5 text-2xl font-semibold text-sky-300">{fmt(riemann, 4)}</div>
            {/* convergence bar: closeness of approximation to the true value */}
            {errPct != null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${Math.max(2, 100 - Math.min(100, errPct))}%` }}
                />
              </div>
            )}
            <div className="mt-1.5 text-xs text-slate-500">
              เพิ่มค่า n เพื่อให้แผ่นบางลงและค่าประมาณลู่เข้าสู่ค่าจริง
            </div>
          </div>

          {/* Step-by-step solution (KaTeX) */}
          {solution && (
            <section>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
                วิธีทำ
                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-normal text-slate-300">
                  {solution.tier === 'polynomial' ? 'อินทิเกรตเชิงสัญลักษณ์' : 'คำนวณเชิงตัวเลข'}
                </span>
              </h3>
              {solution.note && (
                <p className="mb-2 text-xs text-amber-300/80">{solution.note}</p>
              )}
              <ol className="space-y-2">
                {solution.steps.map((s, i) => (
                  <Step key={i} index={i + 1} label={s.label} latex={s.latex} />
                ))}
              </ol>
            </section>
          )}

          <Stat
            label={useSecondCurve ? 'พื้นที่ระหว่างเส้นโค้ง' : 'พื้นที่ใต้กราฟ (ภาคตัดขวาง 2 มิติ)'}
            value={fmt(area, 4)}
            unit="ตร.หน่วย"
          />

          {useSecondCurve && <IntersectionEditor model={model} />}
        </>
      )}
    </div>
  )
}
