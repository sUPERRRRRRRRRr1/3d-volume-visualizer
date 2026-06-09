// Shared palette so the 2D plot, the 3D view, and the control dots all agree.
export const COLORS = {
  curveF: '#38bdf8', // sky-400  — primary curve f(x)
  curveG: '#f472b6', // pink-400 — second curve g(x)
  area: 'rgba(129,140,248,0.28)', // indigo-400 translucent — shaded region
  areaStroke: '#818cf8',
  axis: '#64748b', // slate-500
  axisStrong: '#94a3b8', // slate-400 — axis of revolution emphasis
  grid: 'rgba(148,163,184,0.12)',
  highlight: '#fbbf24', // amber-400 — interactive slice highlight
  intersection: '#34d399', // emerald-400 — intersection markers
  bound: 'rgba(251,191,36,0.5)', // dashed bound lines a, b
}

// 3D scene palette.
export const COLORS3D = {
  solid: '#60a5fa', // blue-400 — the solid of revolution
  diskSlice: '#38bdf8', // sky-400 — disk/washer slices
  shellSlice: '#f472b6', // pink-400 — cylindrical shells
  crossSection: '#a78bfa', // violet-400 — known cross-section slabs
  highlightSlice: '#fbbf24', // amber-400 — the highlighted slice
  axisX: '#f87171', // red-400
  axisY: '#4ade80', // green-400
  axisZ: '#818cf8', // indigo-400
  revolveAxis: '#fbbf24', // amber — the axis of revolution
}

// Result-hover highlight palette — warm/bright hues chosen to contrast with the
// blue solid and the dark navy background, so the highlighted part clearly pops.
// (Only one highlight shows at a time; the slabs are hidden while hovering.)
export const HIGHLIGHT = {
  volume: '#fb923c', // orange  — the filled 3D body
  area: '#a3e635', // lime    — the flat 2D region that gets revolved
  arc: '#ffffff', // white   — the generating curve f(x)
  surface: '#e879f9', // fuchsia — the outer skin
}
