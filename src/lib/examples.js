// One-click example scenarios. Each `state` is merged into the store, loading a
// complete problem (function, bounds, mode, axis/method or cross-section shape)
// so students can explore without typing. Chosen to showcase the full range of
// behaviour: clean polynomials (exact π·fraction), non-polynomials (numerical),
// area-between-curves, axis crossing, both revolution axes, and every
// cross-section shape.
export const EXAMPLES = [
  // --- Revolution ---
  { label: 'x² รอบ X', group: 'revolution', state: { mode: 'revolution', fInput: 'x^2', useSecondCurve: false, a: 0, b: 2, axis: 'x', method: 'disk' } },
  { label: '√x รอบ X', group: 'revolution', state: { mode: 'revolution', fInput: 'sqrt(x)', useSecondCurve: false, a: 0, b: 4, axis: 'x', method: 'disk' } },
  { label: 'sin x รอบ X', group: 'revolution', state: { mode: 'revolution', fInput: 'sin(x)', useSecondCurve: false, a: 0, b: 3.14159265, axis: 'x', method: 'disk' } },
  { label: 'eˣ รอบ X', group: 'revolution', state: { mode: 'revolution', fInput: 'e^x', useSecondCurve: false, a: 0, b: 1, axis: 'x', method: 'disk' } },
  { label: 'x² & x (วงแหวน)', group: 'revolution', state: { mode: 'revolution', fInput: 'x^2', gInput: 'x', useSecondCurve: true, a: 0, b: 1, axis: 'x', method: 'disk' } },
  { label: 'x² รอบ Y (เปลือก)', group: 'revolution', state: { mode: 'revolution', fInput: 'x^2', useSecondCurve: false, a: 0, b: 2, axis: 'y', method: 'shell' } },
  { label: 'x³−2x (ข้ามแกน)', group: 'revolution', state: { mode: 'revolution', fInput: 'x^3 - 2*x', useSecondCurve: false, a: -1.5, b: 1.5, axis: 'x', method: 'disk' } },
  { label: 'x² รอบ y=−1 (วงแหวน)', group: 'revolution', state: { mode: 'revolution', fInput: 'x^2', useSecondCurve: false, a: 0, b: 2, axis: 'x', method: 'disk', axisOffset: -1 } },

  // --- Cross-sections ---
  { label: '■ x² & x', group: 'cross', state: { mode: 'crossSection', crossSection: 'square', fInput: 'x^2', gInput: 'x', useSecondCurve: true, a: 0, b: 1 } },
  { label: '◗ 4−x²', group: 'cross', state: { mode: 'crossSection', crossSection: 'semicircle', fInput: '4 - x^2', useSecondCurve: false, a: -2, b: 2 } },
  { label: '▲ √x', group: 'cross', state: { mode: 'crossSection', crossSection: 'eqTriangle', fInput: 'sqrt(x)', useSecondCurve: false, a: 0, b: 4 } },
  { label: '◣ 1−x²', group: 'cross', state: { mode: 'crossSection', crossSection: 'rightTriangle', fInput: '1 - x^2', useSecondCurve: false, a: -1, b: 1 } },
]
