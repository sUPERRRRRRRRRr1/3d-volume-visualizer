// Problem 4: Step-by-step solution, in two tiers.
//
//   • POLYNOMIAL integrand → real symbolic integration with the power rule
//     (∫xⁿ dx = xⁿ⁺¹/(n+1)) using EXACT rational arithmetic, so the answer comes
//     out as π·(fraction), e.g. 32/5·π. Every step is shown.
//   • NON-POLYNOMIAL integrand → show the correct formula + bounds, then state
//     the value computed numerically (Simpson's rule), clearly noted as such.
//
// The integrand depends on the method/axis (all reduce to a polynomial in x when
// f and g are polynomials):
//   disk  (about X): π ∫ (f² − g²) dx      (g = 0 for a single curve)
//   shell (about Y): 2π ∫ x (f − g) dx     (g = 0 for a single curve)

import { rationalize, fraction } from 'mathjs'
import { CROSS_SECTIONS } from './crossSectionShapes'

const F = (n) => fraction(n)

// --- exact polynomial arithmetic on arrays of fractions (ascending powers) ---
const pAdd = (a, b) => {
  const o = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) o[i] = (a[i] || F(0)).add(b[i] || F(0))
  return o
}
const pSub = (a, b) => {
  const o = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) o[i] = (a[i] || F(0)).sub(b[i] || F(0))
  return o
}
const pMul = (a, b) => {
  const o = Array(a.length + b.length - 1).fill(0).map(() => F(0))
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) o[i + j] = o[i + j].add(a[i].mul(b[j]))
  return o
}
const pShift = (a) => [F(0), ...a] // multiply by x
const pIntegrate = (a) => {
  const o = [F(0)]
  for (let k = 0; k < a.length; k++) o[k + 1] = a[k].div(k + 1)
  return o
}
const pEval = (a, t) => {
  let s = F(0)
  for (let k = 0; k < a.length; k++) s = s.add(a[k].mul(t.pow(k)))
  return s
}
const isZeroPoly = (a) => a.every((c) => c.valueOf() === 0)

/**
 * Exact polynomial coefficients (ascending powers) of `node` as fractions, or
 * null if it is not a single-variable polynomial in x. Verified by re-sampling
 * so rational functions / detection slips are rejected.
 */
function polyCoeffs(node, evaluate) {
  let r
  try {
    r = rationalize(node, {}, true)
  } catch {
    return null
  }
  if (!r || !r.coefficients) return null
  if (r.variables && r.variables.some((v) => v !== 'x')) return null
  const coeffs = r.coefficients
  const polyEval = (x) => coeffs.reduce((s, c, k) => s + c * Math.pow(x, k), 0)
  for (const x of [0.3, 1.1, 2.7, -1.3]) {
    const a = evaluate(x)
    if (!Number.isFinite(a)) continue
    if (Math.abs(a - polyEval(x)) > 1e-6 * (1 + Math.abs(a))) return null
  }
  try {
    return coeffs.map((c) => F(c))
  } catch {
    return null
  }
}

// --- LaTeX helpers ---
const fracTex = (fr) => {
  const str = fr.toFraction() // "3", "-1/2", ...
  if (!str.includes('/')) return str
  const neg = str.startsWith('-')
  const [n, d] = str.replace('-', '').split('/')
  return `${neg ? '-' : ''}\\frac{${n}}{${d}}`
}

function polyToLatex(coeffs) {
  const terms = []
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const c = coeffs[k]
    if (c.valueOf() === 0) continue
    const absStr = fracTex(c.abs())
    const xPart = k === 0 ? '' : k === 1 ? 'x' : `x^{${k}}`
    const coefPart = k !== 0 && absStr === '1' ? '' : absStr
    terms.push({ neg: c.s < 0, body: coefPart + xPart })
  }
  if (terms.length === 0) return '0'
  let out = (terms[0].neg ? '-' : '') + terms[0].body
  for (let i = 1; i < terms.length; i++) out += ` ${terms[i].neg ? '-' : '+'} ${terms[i].body}`
  return out
}

// Coefficient-of-π as LaTeX, e.g. "\frac{32}{5}\pi" or "4\pi" or "\pi".
function piTex(fr) {
  const s = fr.toFraction()
  if (s === '1') return '\\pi'
  if (s === '-1') return '-\\pi'
  if (!s.includes('/')) return `${s}\\pi`
  return `${fracTex(fr)}\\pi`
}

const num = (x) => Number(x.toFixed(4)).toString()

/**
 * Build the step-by-step solution for the current model.
 * @returns {{ tier:'polynomial'|'numerical', steps:{label:string,latex:string}[], resultLatex:string, resultValue:number, note?:string } | null}
 */
export function buildSolution(model) {
  if (!model || !model.valid) return null
  const { f, g, lo, hi, axis, method, useSecondCurve, volume, mode, crossSection } = model
  const two = useSecondCurve && g && g.ok
  const fTex = f.node.toTex()
  const gTex = two ? g.node.toTex() : null
  const aTex = num(lo) // bounds shown plainly
  const bTex = num(hi)

  if (mode === 'crossSection') {
    return crossSectionSolution({ f, g, lo, hi, two, fTex, gTex, aTex, bTex, crossSection, volume })
  }

  const isShell = axis === 'y' // we pair: about-Y → shell formula, about-X → disk
  const factorTex = isShell ? '2\\pi' : '\\pi'
  const formulaInner = isShell
    ? two
      ? `x\\left(${fTex} - ${gTex}\\right)`
      : `x\\left(${fTex}\\right)`
    : two
      ? `\\left(${fTex}\\right)^2 - \\left(${gTex}\\right)^2`
      : `\\left(${fTex}\\right)^2`
  const setupLatex = `V = ${factorTex}\\int_{${aTex}}^{${bTex}} ${formulaInner}\\, dx`

  // Try the exact polynomial route.
  const fc = polyCoeffs(f.node, f.evaluate)
  const gc = two ? polyCoeffs(g.node, g.evaluate) : [F(0)]

  if (fc && gc) {
    // Build the polynomial integrand (without the π / 2π factor).
    let integrand
    if (isShell) {
      integrand = pShift(two ? pSub(fc, gc) : fc) // x·(f−g)
    } else {
      integrand = two ? pSub(pMul(fc, fc), pMul(gc, gc)) : pMul(fc, fc) // f²−g²
    }

    const anti = pIntegrate(integrand)
    const Fhi = pEval(anti, F(hi))
    const Flo = pEval(anti, F(lo))
    let diff = Fhi.sub(Flo)
    // Volume must be non-negative; if the assumed outer/upper ordering was
    // reversed, flip the sign (and the visualisation already uses |·|).
    if (diff.valueOf() < 0) diff = diff.neg()
    const piCoef = isShell ? diff.mul(2) : diff
    const resultValue = Math.PI * piCoef.valueOf()

    const steps = [
      { label: 'ตั้งสูตรปริมาตร', latex: setupLatex },
      {
        label: 'กระจาย/จัดรูปอินทิแกรนด์ให้เป็นพหุนาม',
        latex: `V = ${factorTex}\\int_{${aTex}}^{${bTex}} \\left(${polyToLatex(integrand)}\\right) dx`,
      },
      {
        label: 'อินทิเกรตด้วยกฎยกกำลัง  ∫xⁿdx = xⁿ⁺¹/(n+1)',
        latex: `V = ${factorTex}\\left[\\, ${polyToLatex(anti)} \\,\\right]_{${aTex}}^{${bTex}}`,
      },
      {
        label: 'แทนขอบเขตบนและล่าง',
        latex: `V = ${factorTex}\\left( ${fracTex(Fhi)} - \\left(${fracTex(Flo)}\\right) \\right)`,
      },
      {
        label: 'ลดรูปเป็นผลลัพธ์แบบสัญลักษณ์',
        latex: `V = ${piTex(piCoef)} \\approx ${num(resultValue)}`,
      },
    ]

    return {
      tier: 'polynomial',
      steps,
      resultLatex: `V = ${piTex(piCoef)} \\approx ${num(resultValue)}`,
      resultValue,
    }
  }

  // --- Non-polynomial: correct formula + numerical value (Simpson) ---
  const resultValue = volume
  const steps = [
    { label: 'ตั้งสูตรปริมาตร', latex: setupLatex },
    {
      label: 'แทนขอบเขต (อินทิแกรนด์ไม่ใช่พหุนาม)',
      latex: `V = ${factorTex}\\int_{${aTex}}^{${bTex}} ${formulaInner}\\, dx`,
    },
    {
      label: 'คำนวณค่าปริพันธ์เชิงตัวเลข (กฎซิมป์สัน)',
      latex: `V \\approx ${num(resultValue ?? 0)}`,
    },
  ]
  return {
    tier: 'numerical',
    steps,
    resultLatex: `V \\approx ${num(resultValue ?? 0)}`,
    resultValue: resultValue ?? 0,
    note: 'อินทิแกรนด์ไม่ใช่พหุนาม จึงคำนวณปริมาตรด้วยวิธีเชิงตัวเลข',
  }
}

// Step-by-step solution for a known-cross-section solid:  V = factor · ∫ s² dx.
function crossSectionSolution({ f, g, lo, hi, two, fTex, gTex, aTex, bTex, crossSection, volume }) {
  const shape = CROSS_SECTIONS[crossSection] || CROSS_SECTIONS.square
  const sExpr = two ? `${fTex} - ${gTex}` : fTex
  const sTex = `\\left(${sExpr}\\right)`
  // LaTeX of the constant in front of the integral (empty for a square).
  const factorTex =
    crossSection === 'square'
      ? ''
      : crossSection === 'semicircle'
        ? '\\tfrac{\\pi}{8}'
        : crossSection === 'eqTriangle'
          ? '\\tfrac{\\sqrt{3}}{4}'
          : '\\tfrac{1}{2}'
  const pre = factorTex ? `${factorTex}\\,` : ''
  const setupLatex = `V = \\int_{${aTex}}^{${bTex}} A\\, dx,\\quad A = ${shape.areaTex},\\ \\ s = ${sExpr}`

  const fc = polyCoeffs(f.node, f.evaluate)
  const gc = two ? polyCoeffs(g.node, g.evaluate) : [F(0)]

  if (fc && gc) {
    const sPoly = two ? pSub(fc, gc) : fc
    const integrand = pMul(sPoly, sPoly) // s²
    const anti = pIntegrate(integrand)
    let base = pEval(anti, F(hi)).sub(pEval(anti, F(lo)))
    if (base.valueOf() < 0) base = base.neg()

    let resultTex
    let resultValue
    if (crossSection === 'square') {
      resultTex = fracTex(base)
      resultValue = base.valueOf()
    } else if (crossSection === 'rightTriangle') {
      const r = base.div(2)
      resultTex = fracTex(r)
      resultValue = r.valueOf()
    } else if (crossSection === 'semicircle') {
      const piCoef = base.div(8)
      resultTex = piTex(piCoef)
      resultValue = Math.PI * piCoef.valueOf()
    } else {
      const r = base.div(4)
      resultTex = `\\sqrt{3}\\cdot ${fracTex(r)}`
      resultValue = Math.sqrt(3) * r.valueOf()
    }

    const steps = [
      { label: 'ตั้งสูตรปริมาตรจากภาคตัดขวาง', latex: setupLatex },
      { label: 'แทน s แล้วเขียนพื้นที่หน้าตัด', latex: `V = ${pre}\\int_{${aTex}}^{${bTex}} ${sTex}^2\\, dx` },
      { label: 'กระจายให้เป็นพหุนาม', latex: `V = ${pre}\\int_{${aTex}}^{${bTex}} \\left(${polyToLatex(integrand)}\\right) dx` },
      { label: 'อินทิเกรตด้วยกฎยกกำลัง', latex: `V = ${pre}\\left[\\, ${polyToLatex(anti)} \\,\\right]_{${aTex}}^{${bTex}}` },
      { label: 'แทนขอบเขตและลดรูป', latex: `V = ${resultTex} \\approx ${num(resultValue)}` },
    ]
    return { tier: 'polynomial', steps, resultLatex: `V = ${resultTex} \\approx ${num(resultValue)}`, resultValue }
  }

  const resultValue = volume
  const steps = [
    { label: 'ตั้งสูตรปริมาตรจากภาคตัดขวาง', latex: setupLatex },
    { label: 'แทนขอบเขต (อินทิแกรนด์ไม่ใช่พหุนาม)', latex: `V = ${pre}\\int_{${aTex}}^{${bTex}} ${sTex}^2\\, dx` },
    { label: 'คำนวณค่าปริพันธ์เชิงตัวเลข (กฎซิมป์สัน)', latex: `V \\approx ${num(resultValue ?? 0)}` },
  ]
  return {
    tier: 'numerical',
    steps,
    resultLatex: `V \\approx ${num(resultValue ?? 0)}`,
    resultValue: resultValue ?? 0,
    note: 'อินทิแกรนด์ไม่ใช่พหุนาม จึงคำนวณปริมาตรด้วยวิธีเชิงตัวเลข',
  }
}
