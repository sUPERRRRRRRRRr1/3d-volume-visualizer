import { create } from 'zustand'

// Single source of truth for all user inputs and UI state. Derived values
// (compiled functions, intersections, volume, solution steps) are NOT stored
// here — they are computed from these inputs in the useMathModel hook so they
// can never go stale.
export const useAppStore = create((set) => ({
  // --- Curve inputs (raw strings as typed) ---
  fInput: 'x^2',
  gInput: 'x',
  useSecondCurve: false, // when true, compute area BETWEEN f and g

  // --- Integration bounds [a, b] ---
  a: 0,
  b: 2,

  // --- Construction mode ---
  mode: 'revolution', // 'revolution' | 'crossSection'

  // --- Revolution + volume method ---
  axis: 'x', // 'x' | 'y'
  method: 'disk', // 'disk' (disk/washer) | 'shell'

  // --- Known cross-section shape (perpendicular to the X axis) ---
  crossSection: 'square', // 'square' | 'semicircle' | 'eqTriangle' | 'rightTriangle'

  // --- Slices / Riemann approximation ---
  n: 12,

  // --- Center viewport mode ---
  viewMode: '2d', // '2d' | '3d'

  // --- Interactive slice highlight ---
  highlightEnabled: false,
  highlightX: null, // world x position of the highlighted slice

  // --- Revolution animation ---
  sweepDeg: 360, // current sweep angle 0..360 (degrees)
  isAnimating: false,

  // --- Manual intersection override (null => use auto-detected) ---
  manualIntersections: null,

  // --- Display toggles ---
  showSlices: true,
  showSolid: true,

  // ---------- setters ----------
  setF: (v) => set({ fInput: v }),
  setG: (v) => set({ gInput: v }),
  setUseSecondCurve: (on) =>
    set((s) => ({ useSecondCurve: on ?? !s.useSecondCurve })),
  setA: (v) => set({ a: v }),
  setB: (v) => set({ b: v }),
  setBounds: (a, b) => set({ a, b }),
  setMode: (v) => set({ mode: v }),
  setAxis: (v) => set({ axis: v }),
  setMethod: (v) => set({ method: v }),
  setCrossSection: (v) => set({ crossSection: v }),
  setN: (v) => set({ n: v }),
  setViewMode: (v) => set({ viewMode: v }),
  setHighlightEnabled: (v) => set({ highlightEnabled: v }),
  setHighlightX: (v) => set({ highlightX: v }),
  setSweepDeg: (v) => set({ sweepDeg: v }),
  setAnimating: (v) => set({ isAnimating: v }),
  setManualIntersections: (v) => set({ manualIntersections: v }),
  toggleSlices: () => set((s) => ({ showSlices: !s.showSlices })),
  toggleSolid: () => set((s) => ({ showSolid: !s.showSolid })),
}))

// Dev-only handle for quick inspection/automation in the browser console.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__appStore = useAppStore
}
