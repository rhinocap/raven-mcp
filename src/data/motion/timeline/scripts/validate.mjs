// Validates playground schemas: JSON Schema shape + the contract rules JSON Schema cannot express.
// Usage: node scripts/validate.mjs <file.json> [...more] [--no-corpus]   (exit 1 on any failure)
// Every input is also compared with schemas/examples/ and schemas/playgrounds/ (the corpus), so "different menus"
// is checked on every run, including a single generated playground.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

// Curve values are checked by the evaluator's own rule, so the validator and the playground agree.
const { curveValueOk, curveKey } = createRequire(import.meta.url)('../src/timeline/evaluator.js')

const root = new URL('..', import.meta.url).pathname
const schema = JSON.parse(readFileSync(new URL('../schemas/playground.schema.json', import.meta.url)))
const validateShape = new Ajv2020({ allErrors: true, strict: false }).compile(schema)

const GENERIC_GROUPS = ['dimensions', 'style', 'motion', 'colors', 'colours', 'behavior', 'behaviour', 'settings', 'general', 'options', 'parameters', 'controls']
// Engine and solver vocabulary that does not belong on a designer-facing label.
const ENGINE_WORDS = /\b(noise ?scale|damping|stiffness|lerp|dt|k|octaves?|lacunarity|persistence|gain|zeta|omega|mass|tension|friction|simplex|perlin|cubic-?bezier|bezier|rgba?\(|hsl\(|shader|vec[234]|sin|cos|theta|beta|alpha)\b/i
// Shader uniforms and easing identifiers are recognised by their case, so this half stays
// case-sensitive: under /i, u[A-Z] matches "Upper" and ease[A-Z] matches "Eased". "uniform"
// counts only as a GLSL declaration (any whitespace, an optional precision qualifier, then a GLSL
// type); "Uniform spacing" and "keep spacing uniform" are a designer's words.
const ENGINE_IDENTIFIERS = /\b(u[A-Z]\w*|iTime|ease[A-Z]\w*|uniform\s+((lowp|mediump|highp)\s+)?(float|double|u?int|bool|[biud]?vec[234]|d?mat[234](x[234])?|[iu]?sampler\w*))\b/
const hasEngineWord = (text) => ENGINE_WORDS.test(text) || ENGINE_IDENTIFIERS.test(text)
// snake_case, or a camelCase identifier: two or more lowercase letters, then a hump into a lowercase
// letter (swingFeel, hoverAngle). Product names pass: iPhone, iPad and eBay have one lowercase letter
// before the hump, macOS has none after it, and YouTube starts with a capital.
const CODE_SHAPED = /_|\b[a-z]{2,}[A-Z][a-z]/
// Braces, block comments, and a semicolon that ends the label or touches the next token: source code.
// A semicolon followed by a space is punctuation in a sentence ("Swing; then settle").
const CODE_PUNCT = /[{}]|\/\*|\*\/|;\s*$|;\S/
const TIME_UNITS = ['ms', 's', 'x', 'Hz', 'px/s']
const ROLE_TYPES = {
  duration: (p) => p.type === 'number' && TIME_UNITS.includes(p.unit),
  speed: (p) => p.type === 'number' && TIME_UNITS.includes(p.unit),
  delay: (p) => p.type === 'number' && TIME_UNITS.includes(p.unit),
  stagger: (p) => p.type === 'number' && TIME_UNITS.includes(p.unit),
  loop: (p) => p.type === 'boolean' || p.type === 'enum',
  easing: (p) => p.type === 'enum' || p.type === 'curve',
  color: (p) => p.type === 'color' || p.type === 'enum',
}
const MAX_PER_GROUP = 6
const MAX_STEPS = 2000
const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
const onStep = (p, v) => near(Math.round((v - p.min) / p.step) * p.step + p.min, v)

function valueOk(p, v) {
  if (!p) return false
  if (p.type === 'number') return typeof v === 'number' && Number.isFinite(v) && v >= p.min && v <= p.max && (!(p.step > 0) || p.widget === 'segmented' || onStep(p, v))
  if (p.type === 'boolean') return typeof v === 'boolean'
  if (p.type === 'color') return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
  if (p.type === 'enum') return (p.options || []).some((o) => o.value === v)
  if (p.type === 'curve') return curveValueOk(v, p.kinds)
  return false
}

function check(file) {
  let doc
  try { doc = JSON.parse(readFileSync(file, 'utf8')) } catch (e) { return { file, errs: [`not JSON: ${e.message}`] } }
  const errs = []
  if (!validateShape(doc)) {
    for (const e of validateShape.errors) errs.push(`shape ${e.instancePath || '/'} ${e.message}${e.params?.unevaluatedProperty ? ` (${e.params.unevaluatedProperty})` : ''}`)
  }
  errs.push(...contractErrors(doc))
  return { file, errs, doc }
}

// The contract rules JSON Schema cannot express. Exported so the timeline validator applies the same panel rules.
// opts.small: a timeline built from a site motion recipe may have 3 to 7 controls, all in the default panel.
export function contractErrors(doc, opts) {
  const errs = []
  const params = Array.isArray(doc.params) ? doc.params : []
  const groups = Array.isArray(doc.groups) ? doc.groups : []
  const byId = new Map()
  const groupIds = new Set()
  for (const g of groups) { if (groupIds.has(g.id)) errs.push(`duplicate group id ${g.id}`); groupIds.add(g.id) }
  const advancedGroups = new Set(groups.filter((g) => g.advanced).map((g) => g.id))
  const isAdvanced = (p) => !!(p.advanced || advancedGroups.has(p.group))

  for (const p of params) {
    if (byId.has(p.id)) errs.push(`duplicate param id ${p.id}`)
    byId.set(p.id, p)
    if (!groupIds.has(p.group)) errs.push(`${p.id}: group "${p.group}" not declared`)
    if (!isAdvanced(p)) {
      if (hasEngineWord(p.label)) errs.push(`${p.id}: engine word in a non-advanced label "${p.label}"`)
      if (CODE_SHAPED.test(p.label)) errs.push(`${p.id}: label "${p.label}" is code-shaped (snake_case or camelCase)`)
      if (CODE_PUNCT.test(p.label)) errs.push(`${p.id}: label "${p.label}" contains code punctuation`)
    }
    if (p.role && ROLE_TYPES[p.role] && !ROLE_TYPES[p.role](p)) {
      errs.push(`${p.id}: role "${p.role}" does not fit a ${p.type}${p.unit !== undefined ? ` in "${p.unit}"` : ''}`)
    }
    if (p.type === 'number') {
      if (!(p.min < p.max)) errs.push(`${p.id}: min must be < max`)
      if (p.default < p.min || p.default > p.max) errs.push(`${p.id}: default ${p.default} outside ${p.min}..${p.max}`)
      if (p.step > 0 && (p.max - p.min) / p.step > MAX_STEPS) errs.push(`${p.id}: ${Math.round((p.max - p.min) / p.step)} steps; at most ${MAX_STEPS} are usable by hand`)
      if (p.step > 0 && p.widget !== 'segmented' && !onStep(p, p.default)) errs.push(`${p.id}: default ${p.default} is not on a step of ${p.step} from ${p.min}`)
      if (p.scale === 'log' && !(p.min > 0)) errs.push(`${p.id}: log scale needs min > 0`)
      const sMin = p.safeMin ?? p.min, sMax = p.safeMax ?? p.max
      if (!(p.min <= sMin && sMin <= sMax && sMax <= p.max)) errs.push(`${p.id}: need min <= safeMin <= safeMax <= max`)
      if (p.widget === 'segmented') {
        if (!Array.isArray(p.stops) || p.stops.length < 2) errs.push(`${p.id}: segmented number needs stops`)
        else {
          if (!p.stops.includes(p.default)) errs.push(`${p.id}: default not one of stops`)
          for (const s of p.stops) if (s < p.min || s > p.max) errs.push(`${p.id}: stop ${s} outside ${p.min}..${p.max}`)
          if (new Set(p.stops).size !== p.stops.length) errs.push(`${p.id}: duplicate stops`)
        }
      }
    }
    if (p.type === 'curve') {
      if (doc.schemaVersion !== '2.0') errs.push(`${p.id}: a curve control needs schemaVersion "2.0"`)
      if (!curveValueOk(p.default, p.kinds)) errs.push(`${p.id}: default is not a ${(p.kinds || []).join(' or ')} curve this control offers`)
      const stops = p.stops || []
      for (const s of stops) {
        if (!curveValueOk(s.value, p.kinds)) errs.push(`${p.id}: stop "${s.label}" is not a curve this control offers`)
        if (!isAdvanced(p) && (hasEngineWord(s.label) || CODE_SHAPED.test(s.label) || CODE_PUNCT.test(s.label))) errs.push(`${p.id}: stop label "${s.label}" is not designer language`)
      }
      if (new Set(stops.map((s) => s.label)).size !== stops.length) errs.push(`${p.id}: duplicate stop labels`)
      const keys = stops.filter((s) => curveValueOk(s.value)).map((s) => curveKey(s.value))
      if (new Set(keys).size !== keys.length) errs.push(`${p.id}: two stops hold the same curve`)
    }
    if (p.type === 'enum' && Array.isArray(p.options)) {
      if (!p.options.some((o) => o.value === p.default)) errs.push(`${p.id}: default "${p.default}" not in options`)
      if (new Set(p.options.map((o) => o.value)).size !== p.options.length) errs.push(`${p.id}: duplicate option values`)
      if ((p.widget ?? 'segmented') === 'segmented' && p.options.length > 4) errs.push(`${p.id}: segmented enum has ${p.options.length} options; use select above 4`)
    }
  }

  // Grouping: a count cap alone allows a 16-slider wall in one group.
  for (const g of groups) {
    // A group heading sits in the same panel as its controls, so the same vocabulary rule applies.
    if (!g.advanced && typeof g.label === 'string') {
      if (hasEngineWord(g.label)) errs.push(`group ${g.id}: engine word in a non-advanced label "${g.label}"`)
      if (CODE_SHAPED.test(g.label)) errs.push(`group ${g.id}: label "${g.label}" is code-shaped (snake_case or camelCase)`)
      if (CODE_PUNCT.test(g.label)) errs.push(`group ${g.id}: label "${g.label}" contains code punctuation`)
    }
    const n = params.filter((p) => p.group === g.id).length
    if (!n) errs.push(`group ${g.id} is empty`)
    if (n > MAX_PER_GROUP) errs.push(`group ${g.id} has ${n} params; at most ${MAX_PER_GROUP}`)
  }
  if (params.length > 8 && groups.length < 2) errs.push(`${params.length} params in one group; split into at least 2`)
  const genericCount = groups.filter((g) => GENERIC_GROUPS.includes(String(g.label).toLowerCase())).length
  if (genericCount > 1 || (groups.length && genericCount === groups.length)) errs.push(`${genericCount} generic settings-sheet group label(s); name groups for the motif`)
  const adv = params.filter(isAdvanced).length
  const small = opts && opts.small && params.length < 8
  const visibleToClient = params.filter((p) => p.type !== 'action' && !isAdvanced(p) && p.clientSafe !== false).length
  if (small) {
    if (params.length < 3) errs.push(`${params.length} params; a small timeline needs at least 3`)
    if (adv) errs.push(`${adv} advanced params in a timeline with ${params.length} controls; with fewer than 8, every control is in the default panel`)
    if (visibleToClient < 3) errs.push(`${visibleToClient} client-safe controls; a small timeline needs at least 3`)
  } else {
    if (params.length - adv < 6) errs.push(`only ${params.length - adv} non-advanced params; the default panel needs at least 6`)
    if (adv * 3 > params.length) errs.push(`${adv} of ${params.length} params are advanced; at most one third`)
    if (visibleToClient < 5 || visibleToClient > 12) errs.push(`${visibleToClient} client-safe controls; review mode needs 5-12 (set clientSafe:false on structure and size controls)`)
  }

  // Motion minimum (brief): duration/speed, easing or exit style, loop when looping, stagger/delay where several things move.
  const has = (role) => params.some((p) => p.role === role && (!ROLE_TYPES[role] || ROLE_TYPES[role](p)))
  if (!has('duration') && !has('speed')) errs.push('motion minimum: no duration or speed number with a time unit')
  if (!has('easing')) errs.push('motion minimum: no easing/exit-style enum (role "easing")')
  const events = doc.interaction?.events || []
  if (events.includes('loop') && !has('loop')) errs.push('motion minimum: events include loop but no loop control')
  const hinges = doc.interaction?.hinges || []
  if ((doc.motif === 'pattern' || hinges.length > 1) && !has('stagger') && !has('delay')) errs.push('motion minimum: several elements move but there is no stagger or delay control')

  const hingeTargets = new Set()
  for (const h of hinges) {
    if (hingeTargets.has(h.target)) errs.push(`hinge ${h.target} declared twice`)
    hingeTargets.add(h.target)
  }
  for (const h of hinges) {
    if (h.parent && !hingeTargets.has(h.parent)) errs.push(`hinge ${h.target}: parent ${h.parent} not declared`)
    if (h.parent === h.target) errs.push(`hinge ${h.target}: is its own parent`)
  }

  const presetIds = new Set()
  for (const pr of doc.presets || []) {
    if (presetIds.has(pr.id)) errs.push(`duplicate preset id ${pr.id}`)
    presetIds.add(pr.id)
    for (const [k, v] of Object.entries(pr.values || {})) {
      if (!byId.has(k)) errs.push(`preset ${pr.id}: unknown param ${k}`)
      else if (!valueOk(byId.get(k), v)) errs.push(`preset ${pr.id}: ${JSON.stringify(v)} is not a valid value for ${k}`)
    }
  }

  for (const c of doc.constraints || []) {
    const a = byId.get(c.a), b = byId.get(c.b)
    if (!a || !b) { errs.push(`constraint ${c.a} ${c.op} ${c.b}: unknown param`); continue }
    // No equality is defined between curves, so a curve control cannot take part in a constraint.
    if (a.type === 'curve' || b.type === 'curve') { errs.push(`constraint ${c.a} ${c.op} ${c.b}: a curve control cannot be in a constraint`); continue }
    if (c.op !== 'neq' && (a.type !== 'number' || b.type !== 'number')) { errs.push(`constraint ${c.a} ${c.op} ${c.b}: lte/gte need numbers`); continue }
    const f = c.factor ?? 1
    const ok = c.op === 'neq' ? a.default !== b.default : c.op === 'lte' ? a.default <= f * b.default : a.default >= f * b.default
    if (!ok) errs.push(`constraint ${c.a} ${c.op} ${f}*${c.b}: defaults violate it`)
  }

  // Exports a renderer or event model cannot honour.
  const exp = doc.exports || []
  if (exp.includes('svg-frame') && ['canvas2d', 'webgl'].includes(doc.renderer)) errs.push(`svg-frame export on a ${doc.renderer} renderer`)
  if (exp.includes('css-keyframes') && (events.includes('click') || events.includes('drag'))) errs.push('css-keyframes export cannot encode click or drag impulses')

  return errs
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, '').trim()
const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b)
  const inter = [...A].filter((x) => B.has(x)).length
  return A.size + B.size ? inter / (A.size + B.size - inter) : 0
}
// Multiset Jaccard: counts repeated tuples, so 12 identical slider shapes are not one item.
const mjaccard = (a, b) => {
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map())
  const A = count(a), B = count(b)
  let inter = 0, uni = 0
  for (const k of new Set([...A.keys(), ...B.keys()])) { inter += Math.min(A.get(k) || 0, B.get(k) || 0); uni += Math.max(A.get(k) || 0, B.get(k) || 0) }
  return uni ? inter / uni : 0
}
// Structural signature: what a control is, independent of what it is called.
const shape = (p) => [p.type, p.role || '', p.unit ?? '', p.type === 'number' ? Math.round(Math.log10(Math.max(1e-9, p.max - p.min))) : ''].join('|')

export const LIMITS = { label: 0.25, id: 0.25, structure: 0.5 }
export function compare(x, y) {
  return {
    label: jaccard(x.params.map((p) => norm(p.label)), y.params.map((p) => norm(p.label))),
    id: jaccard(x.params.map((p) => p.id), y.params.map((p) => p.id)),
    structure: mjaccard(x.params.map(shape), y.params.map(shape)),
  }
}

export { valueOk, hasEngineWord }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

function main() {
  const args = process.argv.slice(2)
  const useCorpus = !args.includes('--no-corpus')
  const files = args.filter((a) => a !== '--no-corpus')
  if (!files.length) { console.error('usage: node scripts/validate.mjs <file.json> ... [--no-corpus]'); process.exit(2) }
  const results = files.map(check)
  let failed = 0
  for (const r of results) {
    if (r.errs.length) { failed++; console.log(`FAIL ${r.file}`); for (const e of r.errs) console.log(`  - ${e}`) }
    else console.log(`PASS ${r.file} (${r.doc.params.length} params, ${r.doc.groups.length} groups)`)
  }

  // Menu difference: every pair of inputs, and every input against the corpus.
  const ok = results.filter((r) => r.doc && Array.isArray(r.doc.params))
  // Corpus: the examples plus every accepted playground saved to schemas/playgrounds/.
  const corpusDirs = ['schemas/examples', 'schemas/playgrounds'].map((d) => resolve(root, d)).filter((d) => existsSync(d))
  const inputs = new Set(files.map((f) => resolve(f)))
  const corpus = useCorpus
    ? corpusDirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => resolve(d, f)))
        .filter((f) => !inputs.has(f)).map((f) => ({ file: f, doc: JSON.parse(readFileSync(f, 'utf8')) }))
    : []
  const pairs = []
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) pairs.push([ok[i], ok[j]])
    for (const c of corpus) if (c.doc.id !== ok[i].doc.id) pairs.push([ok[i], c])
  }
  if (pairs.length) {
    console.log(`\nmenu overlap (label | id | structure); limits ${LIMITS.label} | ${LIMITS.id} | ${LIMITS.structure}; 1.00 = identical menu`)
    for (const [x, y] of pairs) {
      const m = compare(x.doc, y.doc)
      const over = Object.keys(LIMITS).filter((k) => m[k] > LIMITS[k])
      console.log(`  ${x.doc.id} vs ${y.doc.id}: ${m.label.toFixed(2)} | ${m.id.toFixed(2)} | ${m.structure.toFixed(2)}${over.length ? `  FAIL ${over.join(', ')}` : ''}`)
      if (over.length) failed++
    }
  }
  process.exit(failed ? 1 : 0)
}
