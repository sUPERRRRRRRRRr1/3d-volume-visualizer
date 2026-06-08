// Pure cross-section shape constants (no three.js) so the math layer can use the
// area factors without pulling in the 3D geometry code.
//
//   factor : A(s) = factor · s²   (s = side/height of the base region at x)
export const CROSS_SECTIONS = {
  square: { label: 'สี่เหลี่ยมจัตุรัส', factor: 1, areaTex: 's^2' },
  semicircle: { label: 'ครึ่งวงกลม', factor: Math.PI / 8, areaTex: '\\tfrac{\\pi}{8}s^2' },
  eqTriangle: { label: 'สามเหลี่ยมด้านเท่า', factor: Math.sqrt(3) / 4, areaTex: '\\tfrac{\\sqrt{3}}{4}s^2' },
  rightTriangle: { label: 'สามเหลี่ยมมุมฉาก', factor: 0.5, areaTex: '\\tfrac{1}{2}s^2' },
}
