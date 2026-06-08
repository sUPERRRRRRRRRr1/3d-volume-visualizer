// A single "y = …" equation field with a colour dot (matching its plotted
// curve) and an inline Thai validation error.
export function EquationInput({ label, hint, value, onChange, error, color = '#38bdf8' }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-300">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      <div
        className={`flex items-center rounded-lg border bg-slate-900/60 px-3 py-2 transition focus-within:border-sky-400 ${
          error ? 'border-rose-500/70' : 'border-slate-600'
        }`}
      >
        <span className="mr-2 select-none font-mono text-slate-500">y =</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="เช่น x^2"
          className="w-full bg-transparent font-mono text-slate-100 outline-none placeholder:text-slate-600"
        />
      </div>
      {error && <p className="mt-1 text-xs text-rose-400">⚠ {error}</p>}
    </div>
  )
}
