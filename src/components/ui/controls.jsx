import { useState, useEffect } from 'react'

// Small, theme-consistent form controls reused across the control panel.

export function Field({ label, hint, children }) {
  return (
    <div className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * Numeric input that keeps a local text buffer so the user can freely type
 * intermediate values ("-", "1.", "") while only committing finite numbers
 * upstream.
 */
export function NumberField({ value, onChange, step = 0.5, className = '' }) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(String(value))
  }, [value])
  return (
    <input
      type="number"
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const v = parseFloat(e.target.value)
        if (Number.isFinite(v)) onChange(v)
      }}
      className={`w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none transition focus:border-sky-400 ${className}`}
    />
  )
}

export function Slider({ value, onChange, min, max, step = 1, className = '' }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full cursor-pointer accent-sky-400 ${className}`}
    />
  )
}

/** Segmented button group for choosing one option from a small set. */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-slate-600 bg-slate-900/60 p-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-sky-500 text-white shadow'
                : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function Button({ children, onClick, variant = 'primary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-sky-500 hover:bg-sky-400 text-white',
    ghost: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
    amber: 'bg-amber-500 hover:bg-amber-400 text-slate-900',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-sky-500' : 'bg-slate-600'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      {label && <span className="text-sm text-slate-300">{label}</span>}
    </button>
  )
}
