// Validates timeline documents: JSON Schema shape, the playground panel contract (shared with validate.mjs),
// binding destinations at each control's extremes, and a compile at the defaults, every preset and every
// number control's min and max. Usage: node scripts/validate-timeline.mjs <file.json> [...more] [--no-corpus]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { contractErrors, compare, LIMITS } from './validate.mjs'

const require = createRequire(import.meta.url)
const TL = require('../src/timeline/evaluator.js')
const { outline, readFont } = require('../src/timeline/outline.js')
const { sanitizeFragment, attachFragment } = require('../src/timeline/fragment.js')

const root = new URL('..', import.meta.url).pathname
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: false })
ajv.addSchema(readJson(resolve(root, 'schemas/playground.schema.json')))
const validateShape = ajv.compile(readJson(resolve(root, 'schemas/timeline.schema.json')))

// The panel contract reads a playground document; a timeline carries the same panel fields, in the
// version 2 format (curve controls allowed).
export function asPlayground(doc) {
  return {
    schemaVersion: '2.0', id: doc.id, title: doc.title, concept: doc.concept || doc.title,
    source: { kind: 'prompt' }, motif: 'type', renderer: 'svg+waapi',
    canvas: { width: doc.stage.width, height: doc.stage.height, background: typeof doc.stage.background === 'string' ? doc.stage.background : '#ffffff' },
    interaction: { events: ['load'] }, seed: doc.seed ?? 0,
    groups: doc.groups, params: doc.params, presets: doc.presets, constraints: doc.constraints,
    exports: ['params-json', 'css-keyframes', 'waapi-snippet'],
  }
}

// Every value a control can give: the ends of a number range, every option, every colour, every named curve.
function extremes(p) {
  if (p.type === 'number') return p.widget === 'segmented' && p.stops ? p.stops : [p.min, p.max]
  if (p.type === 'enum') return p.options.map((o) => o.value)
  if (p.type === 'color') return [p.default, ...(p.swatches || [])]
  if (p.type === 'curve') return [p.default, ...(p.stops || []).map((s) => s.value)]
  return [p.default]
}

function bindingErrors(doc) {
  const errs = []
  const params = new Map((doc.params || []).map((p) => [p.id, p]))
  const binds = TL.walkBindings(doc)
  const used = new Set(binds.map((b) => b.param))
  for (const p of doc.params || []) if (!used.has(p.id)) errs.push(`control "${p.label}" (${p.id}) drives nothing in the timeline`)
  for (const b of binds) {
    const p = params.get(b.param)
    if (!p) { errs.push(`${b.where}: no control "${b.param}"`); continue }
    if (b.dest === 'color') {
      const ok = p.type === 'color' || (p.type === 'enum' && p.options.every((o) => /^#[0-9a-fA-F]{6}$/.test(o.value)))
      if (!ok) errs.push(`${b.where}: control "${p.label}" is not a colour`)
      if (b.bind.times !== undefined || b.bind.plus !== undefined) errs.push(`${b.where}: a colour binding cannot scale or offset`)
      continue
    }
    if (b.dest === 'easing') {
      if (b.bind.times !== undefined || b.bind.plus !== undefined) errs.push(`${b.where}: a curve binding cannot scale or offset`)
      if (p.type === 'curve') {
        for (const [name, v] of [['default', p.default], ...(p.stops || []).map((s) => [`stop "${s.label}"`, s.value])]) {
          try { TL.checkEasing(TL.easingFromValue(v), `${p.label} ${name}`) } catch (e) { errs.push(e.message) }
        }
        continue
      }
      if (p.type !== 'enum') { errs.push(`${b.where}: control "${p.label}" is not a curve choice`); continue }
      for (const o of p.options) {
        try { TL.checkEasing(TL.parseEasingString(o.value), `${p.label} option "${o.label}"`) } catch (e) { errs.push(e.message) }
      }
      continue
    }
    if (p.type !== 'number') { errs.push(`${b.where}: control "${p.label}" is not a number`); continue }
    for (const x of extremes(p)) {
      const v = x * (b.bind.times ?? 1) + (b.bind.plus ?? 0)
      const at = `${b.where} at ${p.label} ${x}${p.unit || ''}`
      if (!Number.isFinite(v)) errs.push(`${at}: not a finite number`)
      else if (b.dest === 'time' && (v < 0 || v > TL.MAX_MS)) errs.push(`${at}: ${v} ms is outside 0 to ${TL.MAX_MS}`)
      else if (b.dest === 'size' && !(v > 0)) errs.push(`${at}: size must be above 0`)
      else if (b.dest === 'spring-duration' && v < 10) errs.push(`${at}: spring duration ${v} ms is under 10`)
      else if (b.dest === 'bounce' && (v < -0.9 || v > 0.9)) errs.push(`${at}: bounce ${v} is outside -0.9 to 0.9`)
      else if (b.dest.startsWith('range:')) {
        const [lo, hi] = b.dest.slice(6).split(':').map(Number)
        if (v < lo || v > hi) errs.push(`${at}: ${v} is outside ${lo} to ${hi}`)
      }
    }
  }
  return errs
}

// Compiles at the defaults, at each preset and at each number control's ends (others at default).
function compileErrors(doc, layout) {
  const errs = []
  const warnings = new Set()
  const cases = [['defaults', {}]]
  for (const pr of doc.presets || []) cases.push([`preset ${pr.label}`, pr.values])
  for (const p of doc.params || []) for (const x of extremes(p)) cases.push([`${p.label} ${typeof x === 'string' ? `"${x}"` : typeof x === 'object' ? TL.curveKey(x) : x}`, { [p.id]: x }])
  for (const [name, values] of cases) {
    try {
      const plan = TL.compile(doc, layout, values)
      for (const w of plan.warnings) warnings.add(w)
      const n = TL.countCheckPoints(plan).n
      if (n > 2e6) errs.push(`${name}: about ${n} check points; at most 2000000`)
    } catch (e) {
      if (e instanceof TL.TimelineError) errs.push(`${name}: ${e.message}`)
      else throw e
    }
  }
  return { errs, warnings: [...warnings] }
}

export function checkTimeline(doc, opts) {
  const errs = []
  if (!validateShape(doc)) {
    for (const e of validateShape.errors) errs.push(`shape ${e.instancePath || '/'} ${e.message}`)
    return { errs, warnings: [] }
  }
  errs.push(...contractErrors(asPlayground(doc), { small: true }))
  errs.push(...bindingErrors(doc))
  // Artwork targets are specified but not built: their boxes need measured SVG geometry at build time.
  const svgT = Object.keys(doc.targets).filter((id) => doc.targets[id].kind === 'svg')
  if (svgT.length) { errs.push(`artwork: "${svgT.join('", "')}" ${svgT.length > 1 ? 'are artwork targets' : 'is an artwork target'}, which this version can't build yet. Put the artwork in the fragment as a PNG image and animate it as an element target.`); return { errs, warnings: [] } }
  let layout
  try { layout = outline(doc, opts) } catch (e) { errs.push(`text: ${e.message}`); return { errs, warnings: [] } }
  try {
    const html = opts && opts.fragmentHtml
    attachFragment(doc, layout, html !== undefined && html !== null ? sanitizeFragment(html) : null, readFont, opts && opts.fontPaths)
  } catch (e) { errs.push(`fragment: ${e.message}`); return { errs, warnings: [] } }
  const c = compileErrors(doc, layout)
  errs.push(...c.errs)
  return { errs, warnings: [...layout.warnings, ...c.warnings], layout }
}

// A timeline's fragment lives beside it as <name>.fragment.html.
export function siblingFragment(file) {
  const p = file.replace(/\.json$/, '.fragment.html')
  return p !== file && existsSync(p) ? readFileSync(p, 'utf8') : undefined
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

function main() {
  const args = process.argv.slice(2)
  const useCorpus = !args.includes('--no-corpus')
  const files = args.filter((a) => a !== '--no-corpus')
  if (!files.length) { console.error('usage: node scripts/validate-timeline.mjs <file.json> ... [--no-corpus]'); process.exit(2) }
  let failed = 0
  const ok = []
  for (const f of files) {
    let doc
    try { doc = readJson(f) } catch (e) { failed++; console.log(`FAIL ${f}\n  - not JSON: ${e.message}`); continue }
    const r = checkTimeline(doc, { fragmentHtml: siblingFragment(f) })
    if (r.errs.length) { failed++; console.log(`FAIL ${f}`); for (const e of r.errs) console.log(`  - ${e}`) }
    else { console.log(`PASS ${f} (${doc.params.length} params, ${doc.tracks.length} tracks)`); ok.push({ file: resolve(f), doc: asPlayground(doc) }) }
    for (const w of r.warnings) console.log(`  note: ${w}`)
  }
  // Menu difference against the playground corpus and the other timelines.
  const inputs = new Set(files.map((f) => resolve(f)))
  const corpus = useCorpus
    ? ['schemas/examples', 'schemas/playgrounds', 'schemas/timelines'].map((d) => resolve(root, d)).filter(existsSync)
        .flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => resolve(d, f)))
        .filter((f) => !inputs.has(f)).map((f) => ({ file: f, doc: readJson(f) }))
    : []
  const pairs = []
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) pairs.push([ok[i], ok[j]])
    for (const c of corpus) if (c.doc.id !== ok[i].doc.id) pairs.push([ok[i], c])
  }
  if (pairs.length) {
    console.log(`\nmenu overlap (label | id | structure); limits ${LIMITS.label} | ${LIMITS.id} | ${LIMITS.structure}`)
    for (const [x, y] of pairs) {
      const m = compare(x.doc, y.doc)
      // A small menu (under 8 controls) is mostly timing, gap, distance and feel, so its structure matches other
      // menus by nature; for it, shared structure is a note and only shared labels or ids fail.
      const small = x.doc.params.length < 8 || y.doc.params.length < 8
      const over = Object.keys(LIMITS).filter((k) => m[k] > LIMITS[k] && !(small && k === 'structure'))
      const note = small && m.structure > LIMITS.structure ? '  note: shared structure, small menu' : ''
      console.log(`  ${x.doc.id} vs ${y.doc.id}: ${m.label.toFixed(2)} | ${m.id.toFixed(2)} | ${m.structure.toFixed(2)}${over.length ? `  FAIL ${over.join(', ')}` : note}`)
      if (over.length) failed++
    }
  }
  process.exit(failed ? 1 : 0)
}
