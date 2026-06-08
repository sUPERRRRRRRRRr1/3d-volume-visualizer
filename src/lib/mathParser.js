// Problem 1: Equation parsing.
// We accept ONLY explicit expressions of the form f(x): a single variable `x`,
// the constants e / pi, and a whitelist of common math functions. Anything else
// (other variables, `=`, unknown functions) is rejected with a friendly Thai
// message so a typo never crashes the app.

import { parse } from 'mathjs'

// Functions the user is allowed to call.
const ALLOWED_FUNCTIONS = new Set([
  'sqrt', 'cbrt', 'abs', 'exp',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'log', 'log10', 'log2', 'ln',
  'sign', 'floor', 'ceil', 'round', 'pow', 'square',
])

// Free symbols the user is allowed to reference.
const ALLOWED_SYMBOLS = new Set(['x', 'e', 'pi', 'PI', 'E'])

/**
 * Walk the parsed tree and make sure only allowed symbols/functions appear.
 * Returns { ok } or { ok:false, error } with a Thai message.
 */
function validateNode(node) {
  let badSymbol = null
  let badFunction = null
  let hasAssignment = false

  node.traverse((n, path, parent) => {
    if (n.isAssignmentNode || n.isFunctionAssignmentNode) {
      hasAssignment = true
    }
    if (n.isSymbolNode) {
      // The callee of a function call appears at path 'fn' under a FunctionNode.
      const isCallee = parent && parent.isFunctionNode && path === 'fn'
      if (isCallee) {
        if (!ALLOWED_FUNCTIONS.has(n.name)) badFunction = badFunction ?? n.name
      } else if (!ALLOWED_SYMBOLS.has(n.name)) {
        badSymbol = badSymbol ?? n.name
      }
    }
  })

  if (hasAssignment) {
    return {
      ok: false,
      error: 'รองรับเฉพาะรูปแบบ y = f(x) — กรุณาใส่เฉพาะฝั่งขวา เช่น x^2 (ไม่ต้องมี = )',
    }
  }
  if (badFunction) {
    return { ok: false, error: `ไม่รองรับฟังก์ชัน "${badFunction}( )" ในเวอร์ชันนี้` }
  }
  if (badSymbol) {
    return { ok: false, error: `ใช้ได้เฉพาะตัวแปร x เท่านั้น — พบ "${badSymbol}"` }
  }
  return { ok: true }
}

/**
 * Parse and compile a user expression into a fast evaluator.
 * @returns {{ ok:boolean, raw:string, node?, compiled?, evaluate?:(x:number)=>number, error:string|null }}
 * `evaluate(x)` never throws: it returns NaN on any domain error.
 */
export function compileExpression(input) {
  const raw = (input ?? '').toString().trim()
  if (!raw) {
    return { ok: false, raw, error: 'กรุณากรอกสมการ' }
  }

  let node
  try {
    node = parse(raw)
  } catch {
    return {
      ok: false,
      raw,
      error: 'ไม่สามารถอ่านสมการได้ ลองตรวจสอบวงเล็บหรือเครื่องหมาย',
    }
  }

  const validation = validateNode(node)
  if (!validation.ok) return { ok: false, raw, ...validation }

  let compiled
  try {
    compiled = node.compile()
  } catch {
    return { ok: false, raw, error: 'ไม่สามารถแปลสมการได้ ลองตรวจสอบรูปแบบอีกครั้ง' }
  }

  const evaluate = (x) => {
    try {
      const y = compiled.evaluate({ x })
      return typeof y === 'number' && Number.isFinite(y) ? y : NaN
    } catch {
      return NaN
    }
  }

  // Smoke-test the evaluator at a neutral point so obviously broken
  // expressions are caught immediately (without rejecting valid domain gaps).
  const probe = evaluate(0.5)
  if (Number.isNaN(probe) && Number.isNaN(evaluate(1.5)) && Number.isNaN(evaluate(2.5))) {
    // Could be a legitimately restricted domain — we don't hard-fail here,
    // but expose a hint via a non-fatal warning flag.
    return { ok: true, raw, node, compiled, evaluate, error: null, domainWarning: true }
  }

  return { ok: true, raw, node, compiled, evaluate, error: null }
}

export { ALLOWED_FUNCTIONS, ALLOWED_SYMBOLS }
