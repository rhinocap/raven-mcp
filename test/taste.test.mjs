import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// index.js reads RAVEN_NO_USAGE_LOG into a module-level const exactly once at
// import time (never re-checked per call), so it must be set BEFORE index.js
// is imported below. Without it, a non-remote buildServer() writes real usage
// entries to ~/.raven/usage.jsonl and can prepend a "☕ Raven daily digest"
// text banner ahead of a tool's JSON payload — polluting the user's real log
// and breaking JSON.parse on the response in the same stroke.
const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
process.env.RAVEN_NO_USAGE_LOG = '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distTaste = path.resolve(__dirname, '../dist/taste.js');
const distTasteStore = path.resolve(__dirname, '../dist/taste-store.js');
const distIndex = path.resolve(__dirname, '../dist/index.js');

let taste;
let tasteStoreMod;
let indexMod;
try {
  taste = await import(distTaste);
  tasteStoreMod = await import(distTasteStore);
  indexMod = await import(distIndex);
} catch (err) {
  const msg = `dist/taste.js not found - run \`npm run build\` first. (${err.message})`;
  test('taste module available', (t) => { t.skip(msg); });
  process.exit(0);
} finally {
  if (previousNoUsageLog === undefined) {
    delete process.env.RAVEN_NO_USAGE_LOG;
  } else {
    process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  }
}

// Calls an MCP tool through the real server (buildServer from dist/index.js)
// over an in-memory transport, backed by the given TasteStore — used only for
// smokes that need the SERVER'S payload shape (e.g. bind_taste_surface's
// build_hints/build_guidance), which the bare taste.ts library functions do
// not construct themselves.
async function callTasteTool(store, name, args) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({ tasteStore: store });
  const client = new Client({ name: 'taste-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
  } finally {
    await client.close();
    await server.close();
  }
}

async function withTasteHome(fn) {
  const previous = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-taste-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    const store = new tasteStoreMod.FsTasteStore();
    await fn(home, store);
  } finally {
    if (previous === undefined) {
      delete process.env.RAVEN_TASTE_HOME;
    } else {
      process.env.RAVEN_TASTE_HOME = previous;
    }
  }
}

function baseRules() {
  return [
    {
      rule_id: 'GRADIENT-BLOCK',
      clause_text: 'Avoid gradient backgrounds.',
      category: 'color',
      severity_default: 'block',
      negative_prompt: 'Do NOT use gradients.',
      owner: 'taste',
      delegate_to: ''
    },
    {
      rule_id: 'BANNED-WARN',
      clause_text: 'Avoid persuasion verbs (proven, shipped, unlock).',
      category: 'content',
      severity_default: 'warn',
      negative_prompt: 'Never use persuasion verbs (proven, shipped, unlock).',
      owner: 'taste',
      delegate_to: ''
    },
    {
      rule_id: 'HUE-NIT',
      clause_text: 'Use one accent, not a second hue.',
      category: 'color',
      severity_default: 'nit',
      negative_prompt: '',
      owner: 'taste',
      delegate_to: ''
    }
  ];
}

function ruleIds(profile) {
  return new Set(profile.rules.map((rule) => rule.rule_id));
}

function assertAllCitationsExist(profile, result) {
  const ids = ruleIds(profile);
  for (const finding of result.findings) assert.ok(ids.has(finding.rule_id), finding.rule_id);
  for (const suppressed of result.suppressed) assert.ok(ids.has(suppressed.rule_id), suppressed.rule_id);
  for (const row of result.not_assessed) assert.ok(ids.has(row.rule_id), row.rule_id);
}

test('profile CRUD roundtrip', async () => {
  await withTasteHome(async (_home, store) => {
    const rules = baseRules().slice(0, 2);
    const profile = await taste.createTasteProfile(store, { name: 'staff-taste', rules });
    const loaded = await taste.getTasteProfile(store, 'staff-taste');
    assert.deepEqual(loaded, profile);

    assert.deepEqual(await taste.listTasteProfiles(store), [
      { name: 'staff-taste', rules: 2, corpus: 0, updated_at: profile.updated_at }
    ]);
  });
});

test('markdown ingestion parses categories, severities, raven owner, negative prompts, and unique ids', async () => {
  await withTasteHome(async (_home, store) => {
    const markdown = `
## Color Systems
- (block) Avoid gradient hero chrome. Do NOT use linear-gradient as decoration.
- (nit) Avoid gradient hero chrome. Do NOT use linear-gradient as decoration.
### Accessibility
- (warn) Tap targets must meet sizing guidance. (raven:audit_page) Do NOT ship small buttons.
`;
    const profile = await taste.createTasteProfile(store, {
      name: 'markdown',
      rules: [{
        rule_id: 'EXPLICIT-RULE',
        clause_text: 'Explicit rule.',
        category: 'explicit',
        severity_default: 'warn',
        negative_prompt: '',
        owner: 'taste',
        delegate_to: ''
      }],
      markdown
    });

    assert.equal(profile.rules.length, 4);
    const generated = profile.rules.slice(1);
    assert.deepEqual(generated.map((rule) => rule.category), ['color', 'color', 'accessibility']);
    assert.deepEqual(generated.map((rule) => rule.severity_default), ['block', 'nit', 'warn']);
    assert.equal(generated[2].owner, 'raven');
    assert.equal(generated[2].delegate_to, 'audit_page');
    assert.equal(generated[0].negative_prompt, 'Do NOT use linear-gradient as decoration.');
    assert.equal(generated[0].clause_text.includes('(block)'), false);
    assert.equal(generated[2].clause_text.includes('(raven:'), false);
    assert.equal(new Set(profile.rules.map((rule) => rule.rule_id)).size, profile.rules.length);
    assert.ok(generated[0].rule_id.startsWith('COLOR-'));
    assert.ok(generated[1].rule_id.endsWith('-2'));
  });
});

test('label_finding append-only growth and rejects invented violated_rule', async () => {
  await withTasteHome(async (home, store) => {
    await taste.createTasteProfile(store, { name: 'labels', rules: [baseRules()[0]] });
    const first = await taste.labelFinding(store, 'labels', {
      artifact: 'hero.html',
      verdict: 'revise',
      violated_rule: 'GRADIENT-BLOCK',
      severity: 'block',
      wrong: 'linear-gradient',
      right: 'flat token'
    });
    const file = path.join(home, 'labels.json');
    const firstRecordBefore = JSON.parse(await readFile(file, 'utf8')).corpus[0];

    const second = await taste.labelFinding(store, 'labels', {
      artifact: 'hero-2.html',
      verdict: 'reject',
      violated_rule: 'GRADIENT-BLOCK',
      severity: 'block',
      wrong: 'radial-gradient',
      right: 'flat token'
    });
    const after = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(first.record.id, 'rec_0001');
    assert.equal(second.record.id, 'rec_0002');
    assert.equal(after.corpus.length, 2);
    assert.deepEqual(after.corpus[0], firstRecordBefore);
    await assert.rejects(() => taste.labelFinding(store, 'labels', {
      artifact: 'bad.html',
      verdict: 'revise',
      violated_rule: 'INVENTED',
      severity: 'warn',
      wrong: 'bad',
      right: 'good'
    }), /violated_rule/);
  });
});

test('verdict escalation excludes nit-only from verdict line', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, { name: 'verdicts', rules: baseRules() });

    const nitOnly = await taste.auditTaste(store, { profile: 'verdicts', html: '<style>.a{color:#ff0000}.b{color:#0066ff}</style>' });
    assert.equal(nitOnly.verdict, 'PASS');
    assert.equal(nitOnly.verdict_line, 'Verdict: PASS (no findings)');
    assert.equal(nitOnly.findings.length, 1);

    const warn = await taste.auditTaste(store, { profile, text: 'This shipped feature will unlock growth. #ff0000 #0066ff' });
    assert.equal(warn.verdict, 'WARN');
    assert.equal(warn.verdict_line, 'Verdict: WARN (0 block, 2 warn)');

    const block = await taste.auditTaste(store, {
      profile: 'verdicts',
      html: '<style>.hero{background:linear-gradient(red, blue);color:#ff0000}.cta{color:#0066ff}</style><p>unlock</p>'
    });
    assert.equal(block.verdict, 'BLOCK');
    assert.equal(block.verdict_line, 'Verdict: BLOCK (1 block, 1 warn)');
  });
});

test('corpus suppression downgrades verdict and moves finding to suppressed', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'suppression', rules: [baseRules()[0]] });
    const first = await taste.auditTaste(store, { profile: 'suppression', html: '<style>.x{background:linear-gradient(red, blue)}</style>' });
    assert.equal(first.verdict, 'BLOCK');
    assert.equal(first.findings.length, 1);

    await taste.labelFinding(store, 'suppression', {
      artifact: 'accepted.html',
      verdict: 'accept',
      violated_rule: 'GRADIENT-BLOCK',
      severity: 'block',
      wrong: 'linear-gradient',
      right: 'accepted exception'
    });
    const second = await taste.auditTaste(store, { profile: 'suppression', html: '<style>.x{background:linear-gradient(red, blue)}</style>' });
    assert.equal(second.findings.length, 0);
    assert.equal(second.suppressed.length, 1);
    assert.equal(second.suppressed[0].corpus_id, 'rec_0001');
    assert.equal(second.verdict, 'PASS');
  });
});

test('rule_id citation invariant across findings, suppressed, and not_assessed', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, {
      name: 'citations',
      rules: [
        ...baseRules().slice(0, 1),
        {
          rule_id: 'FONT-FAUX',
          clause_text: 'Avoid faux synthetic font styling.',
          category: 'type',
          severity_default: 'warn',
          negative_prompt: 'Never use synthetic font styles.',
          owner: 'taste',
          delegate_to: ''
        }
      ]
    });
    await taste.labelFinding(store, 'citations', {
      artifact: 'accepted.html',
      verdict: 'accept',
      violated_rule: 'GRADIENT-BLOCK',
      severity: 'block',
      wrong: 'linear-gradient',
      right: 'accepted exception'
    });
    const result = await taste.auditTaste(store, { profile: 'citations', html: '<style>.x{background:linear-gradient(red, blue)}</style>' });
    assertAllCitationsExist(profile, result);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.not_assessed.length, 1);
  });
});

test('no invented rule_id and no hedging evidence', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, { name: 'invariants', rules: baseRules() });
    const result = await taste.auditTaste(store, {
      profile: 'invariants',
      html: '<style>.hero{background:linear-gradient(red, blue);box-shadow:0 0 24px #00ffcc;color:#ff0000}.alt{color:#0066ff}</style><p>proven</p>'
    });
    const ids = ruleIds(profile);
    for (const finding of result.findings) {
      assert.ok(ids.has(finding.rule_id));
      assert.doesNotMatch(finding.evidence, /might|maybe|possibly|could be|appears to/i);
    }
  });
});

test('RAVEN_TASTE_HOME isolation keeps profiles in env-var home', async () => {
  const previous = process.env.RAVEN_TASTE_HOME;
  const homeA = await mkdtemp(path.join(tmpdir(), 'raven-taste-a-'));
  const homeB = await mkdtemp(path.join(tmpdir(), 'raven-taste-b-'));
  const store = new tasteStoreMod.FsTasteStore();
  try {
    process.env.RAVEN_TASTE_HOME = homeA;
    await taste.createTasteProfile(store, { name: 'isolated', rules: [baseRules()[0]] });
    await stat(path.join(homeA, 'isolated.json'));

    process.env.RAVEN_TASTE_HOME = homeB;
    assert.deepEqual(await taste.listTasteProfiles(store), []);
    await assert.rejects(() => taste.getTasteProfile(store, 'isolated'), /Available profiles: \(none\)/);
    assert.equal(existsSync(path.join(homeB, 'isolated.json')), false);
    assert.equal(existsSync(path.join(homedir(), '.raven', 'taste', 'isolated.json')), false);
  } finally {
    if (previous === undefined) {
      delete process.env.RAVEN_TASTE_HOME;
    } else {
      process.env.RAVEN_TASTE_HOME = previous;
    }
  }
});

test('raven-rule folding attaches delegated page issues once and marks missing delegation not_assessed', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, {
      name: 'raven',
      rules: [
        {
          rule_id: 'A11Y-TAP',
          clause_text: 'Tap targets must pass accessibility sizing.',
          category: 'a11y',
          severity_default: 'block',
          negative_prompt: 'Do NOT ship small buttons.',
          owner: 'raven',
          delegate_to: 'audit_page'
        },
        {
          rule_id: 'COLOR-CONTRAST',
          clause_text: 'Contrast must pass readable text checks.',
          category: 'a11y',
          severity_default: 'warn',
          negative_prompt: 'Do NOT ship low contrast text.',
          owner: 'raven',
          delegate_to: 'audit_page'
        }
      ]
    });
    const missing = await taste.auditTaste(store, { profile, html: '<button>Buy</button>' });
    assert.equal(missing.not_assessed.length, 2);
    assert.match(missing.not_assessed[0].reason, /delegated to audit_page/);

    const folded = await taste.auditTaste(store, {
      profile,
      html: '<button>Buy</button>',
      page_issues: [
        { rule: 'a11y/tap-target', severity: 'error', message: 'Tap target button is too small', fix: 'Increase to 44px' },
        { rule: 'a11y/contrast', severity: 'warning', message: 'Contrast text ratio is too low', fix: 'Use readable colors' }
      ]
    });
    assert.equal(folded.findings.length, 2);
    assert.deepEqual(folded.findings.map((f) => f.rule_id), ['A11Y-TAP', 'COLOR-CONTRAST']);
    assert.equal(new Set(folded.findings.map((f) => f.evidence)).size, 2);
    assertAllCitationsExist(profile, folded);
  });
});

test('detectors cover gradient, banned words, second hue positive and restrained PASS negative', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, { name: 'detectors', rules: baseRules() });
    const positive = await taste.auditTaste(store, {
      profile,
      html: '<style>.x{background:radial-gradient(circle, red, blue);color:#ff0000}.y{color:#0066ff}</style><main>proven results</main>'
    });
    assert.equal(positive.findings.some((finding) => finding.rule_id === 'GRADIENT-BLOCK'), true);
    assert.equal(positive.findings.some((finding) => finding.rule_id === 'BANNED-WARN'), true);
    assert.equal(positive.findings.some((finding) => finding.rule_id === 'HUE-NIT'), true);

    const restrained = await taste.auditTaste(store, {
      profile,
      html: '<style>.x{background:#ffffff;color:#222222}.y{border-color:#eeeeee}</style><main>Measured results</main>'
    });
    assert.equal(restrained.verdict, 'PASS');
    assert.equal(restrained.findings.length, 0);
    assert.equal(restrained.verdict_line, 'Verdict: PASS (no findings)');
  });
});

test('glow detector flags large-blur colored shadows and passes plain elevation shadows', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, {
      name: 'glow',
      rules: [{
        rule_id: 'GLOW-BLOCK',
        clause_text: 'Flat and precise — no glow or neon effects.',
        category: 'color',
        severity_default: 'block',
        negative_prompt: 'Do NOT use glow or neon effects.',
        owner: 'taste',
        delegate_to: ''
      }]
    });
    const glowing = await taste.auditTaste(store, {
      profile,
      html: '<style>.cta{box-shadow: 0 0 32px #ff00ff}</style><button class="cta">Go</button>'
    });
    assert.equal(glowing.findings.some((finding) => finding.rule_id === 'GLOW-BLOCK'), true);
    assert.equal(glowing.verdict, 'BLOCK');

    const elevated = await taste.auditTaste(store, {
      profile,
      html: '<style>.card{box-shadow: 0 2px 8px rgba(0,0,0,0.2)}</style><div class="card">Card</div>'
    });
    assert.equal(elevated.findings.length, 0);
    assert.equal(elevated.verdict, 'PASS');
  });
});

test('glow detector stays silent on colorless large-blur shadows (currentColor/var cannot be judged statically)', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, {
      name: 'glow-colorless',
      rules: [{
        rule_id: 'GLOW-BLOCK',
        clause_text: 'Flat and precise — no glow or neon effects.',
        category: 'color',
        severity_default: 'block',
        negative_prompt: 'Do NOT use glow or neon effects.',
        owner: 'taste',
        delegate_to: ''
      }]
    });
    const colorless = await taste.auditTaste(store, {
      profile,
      html: '<style>.a{box-shadow: 0 0 24px} .b{box-shadow: 0 8px 40px var(--elev)} .c{box-shadow: inset 0 0 20px currentColor}</style><div class="a">x</div>'
    });
    assert.equal(colorless.findings.length, 0);
    assert.equal(colorless.verdict, 'PASS');

    const named = await taste.auditTaste(store, {
      profile,
      html: '<style>.d{box-shadow: 0 0 24px rebeccapurple}</style><div class="d">x</div>'
    });
    assert.equal(named.findings.some((finding) => finding.rule_id === 'GLOW-BLOCK'), true);
  });
});

test('create_taste_profile accepts minimal seed corpus records and defaults rule owner to taste', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, {
      name: 'seeded',
      rules: [{
        rule_id: 'COLOR-flat',
        clause_text: 'Flat color only — never gradient fills.',
        category: 'color',
        severity_default: 'warn'
        // owner omitted — must default to "taste"
      }],
      corpus: [{
        artifact: 'homepage hero',
        verdict: 'accept',
        violated_rule: 'COLOR-flat',
        wrong: 'linear-gradient(180deg, #111, #222)',
        right: 'flat #111 panel'
        // severity/id/labeled_at omitted — must be filled by the seeder
      }]
    });
    assert.equal(profile.rules[0].owner, 'taste');
    assert.equal(profile.corpus.length, 1);
    assert.equal(profile.corpus[0].id, 'rec_0001');
    assert.equal(profile.corpus[0].severity, '');
    assert.ok(profile.corpus[0].labeled_at.length > 0);

    // Round-trips through storage validation, and the seeded accept suppresses.
    const loaded = await taste.getTasteProfile(store, 'seeded');
    assert.equal(loaded.corpus[0].id, 'rec_0001');
    const audited = await taste.auditTaste(store, {
      profile: 'seeded',
      html: '<style>.hero{background: linear-gradient(180deg, #111, #222)}</style>'
    });
    assert.equal(audited.suppressed.some((s) => s.corpus_id === 'rec_0001'), true);
  });
});

test('accept-suppression is evidence-scoped: a different violation of the same rule on the same page stays flagged', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, {
      name: 'scoped',
      rules: [{
        rule_id: 'COLOR-no-gradient',
        clause_text: 'Never gradient fills.',
        category: 'color',
        severity_default: 'block',
        negative_prompt: 'Do NOT use decorative gradients.',
        owner: 'taste',
        delegate_to: ''
      }]
    });
    // Page contains TWO distinct gradients; the accept covers only the first.
    const html = '<style>.approved{background:linear-gradient(180deg, #111, #222)}.rogue{background:linear-gradient(90deg, red, blue)}</style>';
    await taste.labelFinding(store, 'scoped', {
      artifact: 'page',
      verdict: 'accept',
      violated_rule: 'COLOR-no-gradient',
      severity: 'block',
      wrong: 'linear-gradient(180deg, #111, #222)',
      right: 'intentional brand exception',
    });
    const result = await taste.auditTaste(store, { profile: 'scoped', html });
    assert.equal(result.suppressed.length, 1);
    assert.ok(result.suppressed[0].evidence.includes('180deg'));
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].evidence.includes('90deg, red, blue'));
    assert.equal(result.verdict, 'BLOCK');
  });
});

test('markdown ingestion skips fenced code blocks and stopword-led headings do not become categories', async () => {
  await withTasteHome(async (_home, store) => {
    const markdown = [
      '## The Mythology',
      '- Ravens carry knowledge across realms. (warn)',
      '### Why it works',
      '- Low-poly facets read as tech. (nit)',
      '## Color',
      '```',
      '- this bullet is a code example, not a rule (block)',
      '```',
      '- Flat color only — never gradient fills. (block)',
    ].join('\n');
    const profile = await taste.createTasteProfile(store, { name: 'fenced', markdown });
    // The fenced bullet must not ingest: 3 real bullets only.
    assert.equal(profile.rules.length, 3);
    assert.ok(!profile.rules.some((r) => r.clause_text.includes('code example')));
    // Stopword-led headings pick the first content word, never "the"/"why".
    assert.deepEqual(profile.rules.map((r) => r.category), ['mythology', 'works', 'color']);
    assert.ok(profile.rules.every((r) => r.rule_id !== '' && !/^(THE|WHY)-/.test(r.rule_id)));
  });
});

test('banned-word lists only extract from vocabulary sentences, not descriptive example lists', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, {
      name: 'vocab-gate',
      rules: [
        {
          rule_id: 'VOICE-no-hype',
          clause_text: 'Restrained voice.',
          category: 'voice',
          severity_default: 'warn',
          negative_prompt: 'Do NOT use persuasion verbs (proven, shipped, unlock).',
          owner: 'taste',
          delegate_to: ''
        },
        {
          rule_id: 'FACTS-read-source',
          clause_text: 'Read the canonical source before asserting project facts (counts, descriptions, outcomes).',
          category: 'content',
          severity_default: 'block',
          negative_prompt: 'Do NOT assert project facts (counts, descriptions, outcomes) without reading the source.',
          owner: 'taste',
          delegate_to: ''
        }
      ]
    });
    const text = 'We shipped a proven system. It counts outcomes across descriptions and video.';
    const result = await taste.auditTaste(store, { profile: 'vocab-gate', text });
    const ruleIdsHit = new Set(result.findings.map((f) => f.rule_id));
    // "proven"/"shipped" are real banned vocabulary; "counts"/"descriptions" are examples, not bans.
    assert.ok(ruleIdsHit.has('VOICE-no-hype'));
    assert.ok(!ruleIdsHit.has('FACTS-read-source'));
    // The descriptive-list rule has no detector left, so it lands in not_assessed.
    assert.ok(result.not_assessed.some((row) => row.rule_id === 'FACTS-read-source'));
  });
});

test('mixed fence markers, cross-sentence cue leaks, and abbreviation boundaries are handled', async () => {
  await withTasteHome(async (_home, store) => {
    // 1. A ~~~ inside a ``` fence must NOT close it.
    const markdown = [
      '## Color',
      '```css',
      '- code bullet',
      '~~~',
      '- still inside the backtick fence',
      '```',
      '- Real rule after the fence. (block)',
    ].join('\n');
    const profile = await taste.createTasteProfile(store, { name: 'fence-mix', markdown });
    assert.equal(profile.rules.length, 1);
    assert.ok(profile.rules[0].clause_text.startsWith('Real rule'));

    // 2. A vocabulary cue in a PREVIOUS sentence (ending in "!") must not gate in
    //    a descriptive list from the next sentence.
    await taste.createTasteProfile(store, {
      name: 'cue-leak',
      rules: [{
        rule_id: 'FACTS-leak',
        clause_text: 'Facts need sources.',
        category: 'content',
        severity_default: 'block',
        negative_prompt: 'Never use hype words! Assert project facts (counts, descriptions, outcomes) only from sources.',
        owner: 'taste',
        delegate_to: ''
      }]
    });
    const leak = await taste.auditTaste(store, { profile: 'cue-leak', text: 'It counts outcomes and descriptions.' });
    assert.equal(leak.findings.length, 0);
    assert.ok(leak.not_assessed.some((row) => row.rule_id === 'FACTS-leak'));

    // 3. "e.g." must not break the sentence before a genuine vocabulary list.
    await taste.createTasteProfile(store, {
      name: 'abbrev',
      rules: [{
        rule_id: 'VOICE-abbrev',
        clause_text: 'Restrained voice.',
        category: 'voice',
        severity_default: 'warn',
        negative_prompt: 'Do NOT use hype terms e.g. (proven, shipped, unlock).',
        owner: 'taste',
        delegate_to: ''
      }]
    });
    const abbrev = await taste.auditTaste(store, { profile: 'abbrev', text: 'We shipped a proven system.' });
    assert.ok(abbrev.findings.length >= 1);
    assert.equal(abbrev.findings[0].rule_id, 'VOICE-abbrev');
  });
});

test('raven-rule folding rejects unrelated issues and caps advisory severity (clean page stays clean)', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, {
      name: 'fold-guard',
      rules: [
        {
          rule_id: 'TOKEN-no-bare-literals',
          clause_text: 'Every visual value uses var(--token, fallback) — no bare hex, px, or font literals in component CSS.',
          category: 'tokens',
          severity_default: 'block',
          // Verbatim from the real catalog rule: "sizing" here is the exact single-token
          // overlap that let responsive/clamp attach under the pre-fix score>=1 logic.
          negative_prompt: 'Do NOT author bare hex colors, raw px sizing, or font-family literals in component CSS. Every value must use var(--token, fallback).',
          owner: 'raven',
          delegate_to: 'audit_page'
        },
        {
          rule_id: 'LAYOUT-no-bare-modals',
          clause_text: 'No bare modals, no cramped layouts, no floating buttons without context.',
          category: 'layout',
          severity_default: 'block',
          negative_prompt: 'Do NOT ship unstyled bare modals.',
          owner: 'raven',
          delegate_to: 'evaluate_design'
        }
      ]
    });

    // An unrelated advisory issue must NOT attach to either rule: its rule name shares
    // no vocabulary with them ("responsive/clamp" vs tokens/modals).
    const unrelated = await taste.auditTaste(store, {
      profile,
      html: '<style>body{color:var(--fg)}</style><main>clean</main>',
      page_issues: [
        { rule: 'responsive/clamp', severity: 'warning', message: 'No clamp() detected for fluid sizing', fix: 'Use clamp()' }
      ]
    });
    assert.equal(unrelated.findings.length, 0);
    assert.equal(unrelated.verdict, 'PASS');

    // A rule-name token alone ("bare" in tokens/no-bare-hex vs LAYOUT-no-bare-modals)
    // is not enough — total overlap must clear the threshold, so the issue lands only
    // under the genuinely-matching TOKEN rule.
    const genuine = await taste.auditTaste(store, {
      profile,
      html: '<style>body{color:#333}</style><main>x</main>',
      page_issues: [
        { rule: 'tokens/no-bare-hex', severity: 'error', message: '3 bare hex color values found outside custom property definitions', fix: 'Move to tokens' }
      ]
    });
    assert.deepEqual(genuine.findings.map((f) => f.rule_id), ['TOKEN-no-bare-literals']);
    assert.equal(genuine.findings[0].severity, 'block');

    // A non-"error" issue folding into a block-severity rule caps at warn — advisory
    // "warning" and unrecognized severity strings alike can never produce a BLOCK.
    for (const sev of ['warning', 'advisory']) {
      const advisory = await taste.auditTaste(store, {
        profile,
        html: '<style>body{color:#333}</style><main>x</main>',
        page_issues: [
          { rule: 'tokens/no-bare-hex', severity: sev, message: '1 bare hex color value found outside custom property definitions', fix: 'Move to tokens' }
        ]
      });
      assert.equal(advisory.findings.length, 1);
      assert.equal(advisory.findings[0].severity, 'warn');
      assert.match(advisory.verdict, /^WARN/);
    }
  });
});

test('delegate-domain match folds a terse real-shape contrast issue that overlap scoring alone would drop', async () => {
  await withTasteHome(async (_home, store) => {
    const profile = await taste.createTasteProfile(store, {
      name: 'delegate-domain',
      rules: [
        {
          rule_id: 'COLOR-aa-floor',
          clause_text: 'Dim foreground text must still clear the AA floor.',
          category: 'color',
          severity_default: 'block',
          negative_prompt: 'Do NOT ship fg/bg pairs below 4.5:1.',
          owner: 'raven',
          delegate_to: 'audit_contrast'
        }
      ]
    });
    // Real url-mode message shape: selector + quoted snippet + ratios. Its only shared
    // vocabulary with the rule is "contrast" via the issue rule name — the delegate_to
    // domain ("audit_contrast" <- "contrast/aa") is what licenses the fold.
    const folded = await taste.auditTaste(store, {
      profile,
      html: '<p class="muted">dim</p>',
      page_issues: [
        { rule: 'contrast/aa', severity: 'error', message: '.muted "dim" 3.1:1 below 4.5:1 (#777777 on #ffffff)', fix: 'Darken to #595959.' }
      ]
    });
    assert.deepEqual(folded.findings.map((f) => f.rule_id), ['COLOR-aa-floor']);
    assert.equal(folded.findings[0].severity, 'block');
  });
});

test('per-surface scoping: scoped rule blocks on matching surface, skips on mismatch, warns without surface', async () => {
  await withTasteHome(async (_home, store) => {
    const scopedRule = {
      rule_id: 'GRADIENT-SCOPED',
      clause_text: 'Avoid gradient backgrounds on the portfolio.',
      category: 'color',
      severity_default: 'block',
      negative_prompt: 'Do NOT use gradients.',
      owner: 'taste',
      delegate_to: '',
      scope: 'portfolio-monochrome'
    };
    await taste.createTasteProfile(store, { name: 'scoped', rules: [scopedRule, baseRules()[1]] });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';

    const onPortfolio = await taste.auditTaste(store, { profile: 'scoped', html, surface: 'portfolio' });
    assert.equal(onPortfolio.verdict, 'BLOCK');
    assert.equal(onPortfolio.findings[0].rule_id, 'GRADIENT-SCOPED');
    assert.equal(onPortfolio.findings[0].severity, 'block');
    assert.equal(onPortfolio.skipped_out_of_scope.length, 0);

    const onProduct = await taste.auditTaste(store, { profile: 'scoped', html, surface: 'product-site' });
    assert.equal(onProduct.findings.filter((f) => f.rule_id === 'GRADIENT-SCOPED').length, 0);
    assert.deepEqual(onProduct.skipped_out_of_scope, [{ rule_id: 'GRADIENT-SCOPED', scope: 'portfolio-monochrome' }]);
    assert.equal(onProduct.verdict, 'PASS');

    const noSurface = await taste.auditTaste(store, { profile: 'scoped', html });
    const capped = noSurface.findings.find((f) => f.rule_id === 'GRADIENT-SCOPED');
    assert.equal(capped.severity, 'warn');
    assert.equal(noSurface.verdict, 'WARN');
    assert.equal(noSurface.skipped_out_of_scope.length, 0);
  });
});

test('scope global and unscoped rules ignore surface; scope survives disk round-trip and (scope:) markdown annotation', async () => {
  await withTasteHome(async (home, store) => {
    const globalScoped = Object.assign({}, baseRules()[0], { scope: 'global' });
    await taste.createTasteProfile(store, { name: 'globals', rules: [globalScoped, baseRules()[1]] });
    const r = await taste.auditTaste(store, {
      profile: 'globals',
      html: '<style>.x{background:linear-gradient(red, blue)}</style>',
      surface: 'anything-else'
    });
    assert.equal(r.verdict, 'BLOCK');
    assert.equal(r.skipped_out_of_scope.length, 0);

    await taste.createTasteProfile(store, {
      name: 'roundtrip',
      rules: [Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' })]
    });
    const onDisk = JSON.parse(await readFile(path.join(home, 'roundtrip.json'), 'utf8'));
    assert.equal(onDisk.rules[0].scope, 'portfolio-monochrome');
    const reloaded = await taste.getTasteProfile(store, 'roundtrip');
    assert.equal(reloaded.rules[0].scope, 'portfolio-monochrome');

    const md = '## Color\n- Do NOT use gradients. (block) (scope:portfolio)\n- Avoid bare hex.';
    const profile = await taste.createTasteProfile(store, { name: 'mdscope', markdown: md });
    const scoped = profile.rules.find((rule) => rule.negative_prompt.includes('gradients'));
    assert.equal(scoped.scope, 'portfolio');
    assert.equal(scoped.clause_text.includes('(scope:'), false);
    const unscoped = profile.rules.find((rule) => rule.clause_text.includes('bare hex'));
    assert.equal(unscoped.scope, '');
  });
});

test('short scope tokens ("ui") match by exact raw word — never substring — instead of being unmatchable', async () => {
  await withTasteHome(async (_home, store) => {
    const shortScoped = Object.assign({}, baseRules()[0], { rule_id: 'GRADIENT-UI', scope: 'ui' });
    await taste.createTasteProfile(store, { name: 'shortscope', rules: [shortScoped] });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';

    const onUi = await taste.auditTaste(store, { profile: 'shortscope', html, surface: 'ui' });
    assert.equal(onUi.verdict, 'BLOCK');
    assert.equal(onUi.skipped_out_of_scope.length, 0);

    const onAppUi = await taste.auditTaste(store, { profile: 'shortscope', html, surface: 'app-ui' });
    assert.equal(onAppUi.verdict, 'BLOCK');
    assert.equal(onAppUi.skipped_out_of_scope.length, 0);

    // substring containment must NOT match: "ui" ⊄ words of "guidelines"/"build-system"
    for (const surface of ['guidelines', 'build-system', 'docs']) {
      const r = await taste.auditTaste(store, { profile: 'shortscope', html, surface });
      assert.equal(r.verdict, 'PASS', surface);
      assert.deepEqual(r.skipped_out_of_scope, [{ rule_id: 'GRADIENT-UI', scope: 'ui' }], surface);
    }
  });
});

test('ruleInScope: exported helper used by url-mode delegate filtering', async () => {
  const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
  assert.equal(taste.ruleInScope(scoped, 'portfolio'), true);
  assert.equal(taste.ruleInScope(scoped, 'product-site'), false);
  assert.equal(taste.ruleInScope(scoped, undefined), true);
  assert.equal(taste.ruleInScope(scoped, '  '), true);
  assert.equal(taste.ruleInScope(Object.assign({}, baseRules()[0], { scope: 'global' }), 'anything'), true);
  assert.equal(taste.ruleInScope(Object.assign({}, baseRules()[0], { scope: '' }), 'anything'), true);
  assert.equal(taste.ruleInScope(Object.assign({}, baseRules()[0], { scope: 'use' }), 'user-research'), false);
});

test('surface calibration interview is built from the profile’s own scopes and voice rules', async () => {
  await withTasteHome(async (_home, store) => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    const voice = Object.assign({}, baseRules()[1], { category: 'voice' });
    await taste.createTasteProfile(store, { name: 'cal', rules: [scoped, voice, baseRules()[2]] });

    const interview = await taste.getTasteInterview(store, 'cal', 'raven-mcp');
    assert.equal(interview.tool, 'get_taste_interview');
    assert.equal(interview.project, 'raven-mcp');
    assert.equal(interview.existing_binding, null);
    assert.deepEqual(interview.scopes.map((s) => s.scope), ['portfolio-monochrome']);
    assert.deepEqual(interview.scopes[0].rules.map((r) => r.rule_id), ['GRADIENT-BLOCK']);
    assert.deepEqual(interview.voice_rules.map((r) => r.rule_id), ['BANNED-WARN']);
    assert.deepEqual(interview.rule_ids, ['GRADIENT-BLOCK', 'BANNED-WARN', 'HUE-NIT']);
    const ids = interview.questions.map((q) => q.id);
    // No scope-membership question is emitted even though the profile carries a
    // non-global scope — every kickoff starts fresh (does not presume the
    // profile's pre-existing scopes apply). The scopes array is still returned.
    assert.deepEqual(ids, [
      'identity', 'references',
      'design:typography', 'design:spacing', 'design:color', 'design:layout', 'design:motion', 'design:imagery',
      'design:entrance', 'design:loading', 'design:navigation', 'design:aesthetic', 'design:libraries',
      'voice', 'exceptions', 'matchers', 'special',
    ]);
    assert.equal(ids.filter((id) => id.startsWith('scope:')).length, 0);
    assert.ok(interview.then.includes('bind_taste_surface'));
    // Dimension questions are grounded in the profile's own rules where they
    // exist (GRADIENT-BLOCK is category color) and say so where they don't.
    const colorQ = interview.questions.find((q) => q.id === 'design:color');
    assert.ok(colorQ.question.includes('GRADIENT-BLOCK'));
    const typeQ = interview.questions.find((q) => q.id === 'design:typography');
    assert.ok(typeQ.question.includes('no typography rules yet'));
    assert.ok(typeQ.question.includes('design_notes.typography'));

    // No voice rules and no scopes -> generic + design-dimension questions,
    // and the voice question still appears (asked even with zero voice rules).
    await taste.createTasteProfile(store, { name: 'plain', rules: [baseRules()[2]] });
    const bare = await taste.getTasteInterview(store, 'plain');
    assert.deepEqual(bare.questions.map((q) => q.id), [
      'identity', 'references',
      'design:typography', 'design:spacing', 'design:color', 'design:layout', 'design:motion', 'design:imagery',
      'design:entrance', 'design:loading', 'design:navigation', 'design:aesthetic', 'design:libraries',
      'voice', 'exceptions', 'matchers', 'special',
    ]);
    const bareVoiceQ = bare.questions.find((q) => q.id === 'voice');
    assert.ok(bareVoiceQ);
    assert.ok(bareVoiceQ.question.includes('no voice/tone rules yet'));

    // After binding, the interview surfaces the existing calibration.
    await taste.bindTasteSurface(store, 'cal', { project: 'raven-mcp', surface: 'product-site', design_notes: { color: 'monochrome, one warm accent' } });
    const again = await taste.getTasteInterview(store, 'cal', 'raven-mcp');
    assert.equal(again.existing_binding.surface, 'product-site');
  });
});

test('the six new design dimensions carry non-empty multiple-choice options', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'dims', rules: baseRules() });
    const interview = await taste.getTasteInterview(store, 'dims', 'some-project');
    for (const key of ['imagery', 'entrance', 'loading', 'navigation', 'aesthetic', 'libraries']) {
      const q = interview.questions.find((question) => question.id === 'design:' + key);
      assert.ok(q, 'missing design:' + key);
      assert.ok(Array.isArray(q.options), key + ' options must be an array');
      assert.ok(q.options.length > 0, key + ' options must be non-empty');
      assert.ok(q.options.every((opt) => typeof opt === 'string' && opt.length > 0));
    }
    // Pre-existing five dimensions carry no options.
    for (const key of ['typography', 'spacing', 'color', 'layout', 'motion']) {
      const q = interview.questions.find((question) => question.id === 'design:' + key);
      assert.equal(q.options, undefined);
    }
  });
});

test('the AI-cinematic-video / scroll-scrub interview options are present, and the imagery question is otherwise unchanged', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'aivideo-opts', rules: baseRules() });
    const interview = await taste.getTasteInterview(store, 'aivideo-opts', 'some-project');

    const imageryQ = interview.questions.find((q) => q.id === 'design:imagery');
    assert.ok(imageryQ.question.includes(
      "Photography, illustration, product screenshots, abstract shapes, or none? Icon style (stroke vs filled) and any treatments (duotone, borders, shadows)."
    ), 'the imagery question wording is unchanged (options are additive)');
    const aiVideoOption = imageryQ.options.find((opt) => opt.includes('ai-cinematic-video'));
    assert.ok(aiVideoOption, 'imagery options must include the ai-cinematic-video option');
    assert.ok(aiVideoOption.includes('paid'), 'the ai-cinematic-video option must disclose it is paid');
    assert.ok(aiVideoOption.includes('credits'), 'the ai-cinematic-video option must disclose credits');

    const aestheticQ = interview.questions.find((q) => q.id === 'design:aesthetic');
    assert.ok(aestheticQ.options.some((opt) => opt.includes('cinematic-noir')), 'aesthetic options must include cinematic-noir');

    const entranceQ = interview.questions.find((q) => q.id === 'design:entrance');
    assert.ok(entranceQ.options.some((opt) => opt.includes('video-first')), 'entrance options must include video-first');

    const librariesQ = interview.questions.find((q) => q.id === 'design:libraries');
    assert.ok(librariesQ.options.some((opt) => opt.includes('scroll-scrub')), 'libraries options must include scroll-scrub');

    // The dimension/question count is unaffected by adding options to existing questions.
    assert.deepEqual(interview.questions.map((q) => q.id), [
      'identity', 'references',
      'design:typography', 'design:spacing', 'design:color', 'design:layout', 'design:motion', 'design:imagery',
      'design:entrance', 'design:loading', 'design:navigation', 'design:aesthetic', 'design:libraries',
      'voice', 'exceptions', 'matchers', 'special',
    ]);
  });
});

test('libraries question suggests Next.js as the default build target, and the kickoff contract carries it', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'nextdef', rules: baseRules() });
    const interview = await taste.getTasteInterview(store, 'nextdef', 'some-project');
    const libQ = interview.questions.find((q) => q.id === 'design:libraries');
    assert.ok(/Next\.js/.test(libQ.question), 'libraries question must name the Next.js default');
    assert.ok(/Next\.js/.test(interview.then), 'kickoff then must carry the Next.js default suggestion');
  });
});

test('voice question always carries exactly 3 distinct-register examples', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'voiceex', rules: baseRules() });
    const interview = await taste.getTasteInterview(store, 'voiceex', 'some-project');
    const voiceQ = interview.questions.find((q) => q.id === 'voice');
    assert.ok(voiceQ);
    assert.equal(voiceQ.examples.length, 3);
    const registers = new Set(voiceQ.examples.map((e) => e.register));
    assert.equal(registers.size, 3);
    for (const example of voiceQ.examples) {
      assert.equal(typeof example.sample, 'string');
      assert.ok(example.sample.length > 0);
    }
  });
});

test('every question carries skippable + priority; identity is required', async () => {
  await withTasteHome(async (_home, store) => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    await taste.createTasteProfile(store, { name: 'flags', rules: [scoped, baseRules()[1], baseRules()[2]] });
    const interview = await taste.getTasteInterview(store, 'flags', 'some-project');
    for (const q of interview.questions) {
      assert.equal(typeof q.skippable, 'boolean', q.id + ' must have boolean skippable');
      assert.ok(q.priority === 'core' || q.priority === 'extended', q.id + ' must have core|extended priority');
    }
    const identityQ = interview.questions.find((q) => q.id === 'identity');
    assert.equal(identityQ.skippable, false);
    assert.equal(identityQ.priority, 'core');
    for (const key of ['typography', 'spacing', 'color', 'layout', 'motion', 'imagery', 'entrance', 'loading', 'navigation', 'aesthetic']) {
      const q = interview.questions.find((question) => question.id === 'design:' + key);
      assert.equal(q.skippable, true);
      assert.equal(q.priority, 'extended');
    }
    assert.ok(interview.then.includes('uncalibrated'));
  });
});

test('mode:"refine" requires an existing binding and errors naming kickoff', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'norefine', rules: baseRules() });
    await assert.rejects(
      () => taste.getTasteInterview(store, 'norefine', 'unbound-project', 'refine'),
      /kickoff/
    );
  });
});

test('mode:"refine" builds a re-interview from the stored binding: complaint first, revise:<key> quoting the stored note, and revise:voice', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'refineme', rules: baseRules() });
    await taste.bindTasteSurface(store, 'refineme', {
      project: 'some-project',
      surface: 'product-site',
      voice_note: 'Plainer than the portfolio register.',
      design_notes: { color: 'dark ground, cyan accent' },
    });

    const refine = await taste.getTasteInterview(store, 'refineme', 'some-project', 'refine');
    assert.equal(refine.tool, 'get_taste_interview');
    assert.equal(refine.existing_binding.surface, 'product-site');
    const ids = refine.questions.map((q) => q.id);
    assert.equal(ids[0], 'complaint');
    assert.ok(ids.includes('revise:color'));
    assert.ok(ids.includes('revise:voice'));
    assert.ok(ids.includes('precedent'));

    const complaintQ = refine.questions[0];
    assert.equal(complaintQ.skippable, false);

    const reviseColorQ = refine.questions.find((q) => q.id === 'revise:color');
    assert.ok(reviseColorQ.question.includes('dark ground, cyan accent'));

    const reviseVoiceQ = refine.questions.find((q) => q.id === 'revise:voice');
    assert.ok(reviseVoiceQ.question.includes('Plainer than the portfolio register.'));
    assert.equal(reviseVoiceQ.examples.length, 3);

    assert.ok(refine.then.includes('bind_taste_surface'));
    assert.ok(refine.then.includes('label_finding'));
  });
});

test('bind_taste_surface validates, normalizes hosts, upserts by project, and round-trips from disk', async () => {
  await withTasteHome(async (home, store) => {
    await taste.createTasteProfile(store, { name: 'bindings', rules: baseRules() });

    await assert.rejects(() => taste.bindTasteSurface(store, 'bindings', { project: 'x', surface: '' }), /surface is required/);
    await assert.rejects(() => taste.bindTasteSurface(store, 'bindings', { project: '/etc', surface: 's' }), /project must match/);
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'bindings', { project: 'x', surface: 's', overrides: [{ rule_id: 'NOPE', severity: 'off' }] }),
      /does not exist in profile.rules/
    );
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'bindings', { project: 'x', surface: 's', overrides: [{ rule_id: 'HUE-NIT', severity: 'loud' }] }),
      /severity must be block, warn, nit, or off/
    );

    await assert.rejects(
      () => taste.bindTasteSurface(store, 'bindings', { project: 'x', surface: 's', design_notes: { typography: '' } }),
      /design_notes.typography must be a non-empty string/
    );
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'bindings', { project: 'x', surface: 's', design_notes: { 'not a key!': 'x' } }),
      /keys must be short dimension names/
    );
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'bindings', { project: 'x', surface: 's', design_notes: { Typography: 'A', typography: 'B' } }),
      /two keys that normalize to the same dimension: typography/
    );

    const bound = await taste.bindTasteSurface(store, 'bindings', {
      project: 'raven-mcp',
      surface: 'product-site',
      hosts: ['https://RavenMCP.ai/some/path', 'www.example.com:8080'],
      overrides: [{ rule_id: 'BANNED-WARN', severity: 'nit' }],
      voice_note: 'Product register.',
      design_notes: { Typography: '  Grotesque, restrained scale.  ', spacing: 'Airy, 8px grid.' }
    });
    assert.deepEqual(bound.hosts, ['ravenmcp.ai', 'www.example.com']);
    // Keys lowercase, values trimmed; round-trips through disk validation.
    assert.deepEqual(bound.design_notes, { typography: 'Grotesque, restrained scale.', spacing: 'Airy, 8px grid.' });
    assert.deepEqual((await taste.listSurfaceBindings(store, 'bindings'))[0].design_notes, bound.design_notes);

    const onDisk = JSON.parse(await readFile(path.join(home, 'bindings.surfaces.json'), 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.bindings.length, 1);

    // Pre-design_notes bindings on disk (field absent) stay valid -> {}.
    const legacy = JSON.parse(await readFile(path.join(home, 'bindings.surfaces.json'), 'utf8'));
    delete legacy.bindings[0].design_notes;
    await writeFile(path.join(home, 'bindings.surfaces.json'), JSON.stringify(legacy), 'utf8');
    assert.deepEqual((await taste.listSurfaceBindings(store, 'bindings'))[0].design_notes, {});

    // Upsert: same project replaces, different project adds.
    await taste.bindTasteSurface(store, 'bindings', { project: 'raven-mcp', surface: 'developer docs', uncalibrated_ack: 'test fixture' });
    await taste.bindTasteSurface(store, 'bindings', { project: 'portfolio', surface: 'monochrome portfolio', uncalibrated_ack: 'test fixture' });
    const all = await taste.listSurfaceBindings(store, 'bindings');
    assert.deepEqual(all.map((b) => [b.project, b.surface]), [
      ['portfolio', 'monochrome portfolio'],
      ['raven-mcp', 'developer docs']
    ]);
  });
});

test('bind_taste_surface REFUSES a new surface with no calibration content (interview-skip fingerprint), and the escape hatch is recorded', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'gate', rules: baseRules() });

    // The exact failure this guard exists for: an agent binds a brand-new
    // surface identity-only, having skipped the kickoff interview.
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'gate', { project: 'ai-reader-raven', surface: 'product-site' }),
      /Refusing to bind surface .*no calibration content.*get_taste_interview/s
    );
    // Hosts alone are identity/matching, not taste calibration -> still refused.
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'gate', { project: 'ai-reader-raven', surface: 'product-site', hosts: ['aireader.ai'] }),
      /Refusing to bind surface/
    );
    // Whitespace cannot smuggle a bind through: a blank voice_note is trimmed to
    // empty and does NOT count as calibration.
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'gate', { project: 'ai-reader-raven', surface: 'product-site', voice_note: '   ' }),
      /Refusing to bind surface/
    );
    // A whitespace-only uncalibrated_ack is worthless (destroys auditability) ->
    // trimmed to empty, still refused.
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'gate', { project: 'ai-reader-raven', surface: 'product-site', uncalibrated_ack: '   ' }),
      /Refusing to bind surface/
    );
    // Nothing was persisted by the refused calls.
    assert.equal((await taste.listSurfaceBindings(store, 'gate')).length, 0);

    // ANY real calibration signal satisfies the gate: design_notes...
    await taste.bindTasteSurface(store, 'gate', { project: 'with-notes', surface: 'product-site', design_notes: { color: 'monochrome' } });
    // ...voice_note...
    await taste.bindTasteSurface(store, 'gate', { project: 'with-voice', surface: 'product-site', voice_note: 'Plain product register.' });
    // ...an override...
    await taste.bindTasteSurface(store, 'gate', { project: 'with-override', surface: 'product-site', overrides: [{ rule_id: 'HUE-NIT', severity: 'off' }] });
    // ...or a reference.
    await taste.bindTasteSurface(store, 'gate', { project: 'with-ref', surface: 'product-site', references: [{ url: 'https://example.com' }] });
    assert.equal((await taste.listSurfaceBindings(store, 'gate')).length, 4);

    // Escape hatch: an explicit ack (user interviewed, skipped every dimension)
    // is allowed AND recorded on the binding so the skip is auditable.
    const acked = await taste.bindTasteSurface(store, 'gate', { project: 'declined-cal', surface: 'product-site', uncalibrated_ack: 'user interviewed 2026-07-04, declined all dimensions' });
    assert.equal(acked.uncalibrated_ack, 'user interviewed 2026-07-04, declined all dimensions');
    assert.equal((await taste.listSurfaceBindings(store, 'gate')).find((b) => b.project === 'declined-cal').uncalibrated_ack, acked.uncalibrated_ack);

    // A re-bind that KEEPS calibration is fine (update path unbroken): pass the
    // design_notes again while changing the surface string.
    const rebound = await taste.bindTasteSurface(store, 'gate', { project: 'with-notes', surface: 'product-site v2', design_notes: { color: 'monochrome' } });
    assert.equal(rebound.surface, 'product-site v2');
    assert.equal(rebound.uncalibrated_ack, undefined);

    // But an EMPTY re-bind of an already-calibrated project is REFUSED — an
    // upsert replaces all fields, so this would silently erase the calibration
    // (the same-project/new-surface hole). It must not be exempt.
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'gate', { project: 'with-notes', surface: 'product-site v3' }),
      /Refusing to bind surface/
    );
    // The prior calibrated binding is untouched by the refused call.
    assert.deepEqual((await taste.listSurfaceBindings(store, 'gate')).find((b) => b.project === 'with-notes').design_notes, { color: 'monochrome' });
    assert.equal((await taste.listSurfaceBindings(store, 'gate')).find((b) => b.project === 'with-notes').surface, 'product-site v2');
  });
});

test('bind_taste_surface (server tool): an ai-cinematic-video imagery note yields build_hints + build_guidance naming Higgsfield and a fallback', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'aivideo-bind', rules: baseRules() });
    const payload = await callTasteTool(store, 'bind_taste_surface', {
      profile: 'aivideo-bind',
      project: 'ai-hero-site',
      surface: 'product-site',
      design_notes: { imagery: 'ai-cinematic-video: a short AI-generated film clip as the hero' },
    });
    assert.ok(Array.isArray(payload.build_hints), 'build_hints must be present');
    assert.ok(
      payload.build_hints.some((h) => h.technique.startsWith('AI cinematic video')),
      'build_hints must include the AI cinematic video technique'
    );
    assert.ok(typeof payload.build_guidance === 'string');
    assert.ok(payload.build_guidance.includes('Higgsfield'), 'build_guidance must name Higgsfield');
    assert.ok(payload.build_guidance.includes('fallback'), 'build_guidance must mention the fallback requirement');
  });
});

test('bind_taste_surface (server tool): a non-video note (three.js only) gets no Higgsfield guidance', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'novideo-bind', rules: baseRules() });
    const payload = await callTasteTool(store, 'bind_taste_surface', {
      profile: 'novideo-bind',
      project: 'plain-3d-site',
      surface: 'product-site',
      design_notes: { libraries: 'three.js WebGL hero' },
    });
    assert.ok(Array.isArray(payload.build_hints) && payload.build_hints.length > 0, 'three.js still names an expensive technique -> build_hints present');
    assert.ok(typeof payload.build_guidance === 'string', 'build_guidance present for the three.js note');
    assert.ok(!payload.build_guidance.includes('Higgsfield'), 'build_guidance must NOT name Higgsfield for a non-video note');
  });
});

test('resolveSurfaceBinding: explicit project beats url host; hosts match subdomains; unknown resolves null', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'res', rules: baseRules() });
    assert.equal(await taste.resolveSurfaceBinding(store, 'res', { project: 'anything' }), null);

    await taste.bindTasteSurface(store, 'res', { project: 'raven-mcp', surface: 'product-site', hosts: ['ravenmcp.ai'], uncalibrated_ack: 'test fixture' });
    await taste.bindTasteSurface(store, 'res', { project: 'portfolio', surface: 'monochrome portfolio', hosts: ['andrew.design'], uncalibrated_ack: 'test fixture' });

    assert.equal((await taste.resolveSurfaceBinding(store, 'res', { project: 'Portfolio' })).project, 'portfolio');
    assert.equal((await taste.resolveSurfaceBinding(store, 'res', { url: 'https://ravenmcp.ai/changelog' })).project, 'raven-mcp');
    assert.equal((await taste.resolveSurfaceBinding(store, 'res', { url: 'https://www.ravenmcp.ai/' })).project, 'raven-mcp');
    // Explicit project wins even when the url points at another binding's host.
    assert.equal((await taste.resolveSurfaceBinding(store, 'res', { project: 'portfolio', url: 'https://ravenmcp.ai/' })).project, 'portfolio');
    // Suffix matching is domain-boundary safe: notravenmcp.ai is a different host.
    assert.equal(await taste.resolveSurfaceBinding(store, 'res', { url: 'https://notravenmcp.ai/' }), null);
    assert.equal(await taste.resolveSurfaceBinding(store, 'res', { url: 'not a url' }), null);
    assert.equal(await taste.resolveSurfaceBinding(store, 'res', {}), null);
  });
});

test('a resolved binding supplies the surface, applies overrides at full trust, and echoes the voice note', async () => {
  await withTasteHome(async (_home, store) => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    await taste.createTasteProfile(store, { name: 'proj', rules: [scoped, baseRules()[1]] });
    await taste.bindTasteSurface(store, 'proj', {
      project: 'raven-mcp',
      surface: 'product-site',
      overrides: [{ rule_id: 'BANNED-WARN', severity: 'nit' }],
      voice_note: 'Product register: plain benefits OK, still no hype verbs.',
      design_notes: { typography: 'Grotesque, restrained scale.' }
    });
    await taste.bindTasteSurface(store, 'proj', { project: 'portfolio', surface: 'monochrome portfolio', uncalibrated_ack: 'test fixture' });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style><p>We have proven results.</p>';

    // On raven-mcp: monochrome rule skipped, voice rule re-tuned to nit, note echoed.
    const onRaven = await taste.auditTaste(store, { profile: 'proj', html, project: 'raven-mcp' });
    assert.equal(onRaven.binding, 'raven-mcp');
    assert.equal(onRaven.surface_applied, 'product-site');
    assert.deepEqual(onRaven.skipped_out_of_scope, [{ rule_id: 'GRADIENT-BLOCK', scope: 'portfolio-monochrome' }]);
    assert.equal(onRaven.findings.find((f) => f.rule_id === 'BANNED-WARN').severity, 'nit');
    assert.equal(onRaven.voice_note, 'Product register: plain benefits OK, still no hype verbs.');
    assert.deepEqual(onRaven.design_notes, { typography: 'Grotesque, restrained scale.' });
    assert.equal(onRaven.calibration_hint, undefined);
    assert.equal(onRaven.verdict, 'PASS');

    // No design_notes on the portfolio binding -> field absent, not {}.
    assert.equal((await taste.auditTaste(store, { profile: 'proj', html, project: 'portfolio' })).design_notes, undefined);

    // On the portfolio: scoped rule runs at FULL block (binding surface counts as provided).
    const onPortfolio = await taste.auditTaste(store, { profile: 'proj', html, project: 'portfolio' });
    assert.equal(onPortfolio.binding, 'portfolio');
    assert.equal(onPortfolio.findings.find((f) => f.rule_id === 'GRADIENT-BLOCK').severity, 'block');
    assert.equal(onPortfolio.verdict, 'BLOCK');

    // Explicit surface beats the binding's surface; overrides still apply.
    const explicit = await taste.auditTaste(store, { profile: 'proj', html, project: 'raven-mcp', surface: 'portfolio' });
    assert.equal(explicit.surface_applied, 'portfolio');
    assert.equal(explicit.findings.find((f) => f.rule_id === 'GRADIENT-BLOCK').severity, 'block');
    assert.equal(explicit.findings.find((f) => f.rule_id === 'BANNED-WARN').severity, 'nit');
  });
});

test('an off override silences a rule on that surface and is reported under disabled_by_binding', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'silence', rules: baseRules() });
    await taste.bindTasteSurface(store, 'silence', {
      project: 'raven-mcp',
      surface: 'product-site',
      overrides: [{ rule_id: 'GRADIENT-BLOCK', severity: 'off' }]
    });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';
    const r = await taste.auditTaste(store, { profile: 'silence', html, project: 'raven-mcp' });
    assert.deepEqual(r.disabled_by_binding, [{ rule_id: 'GRADIENT-BLOCK', severity: 'off' }]);
    assert.equal(r.findings.filter((f) => f.rule_id === 'GRADIENT-BLOCK').length, 0);
    assert.equal(r.verdict, 'PASS');
  });
});

test('calibration_hint appears only when scoped rules exist and neither surface nor binding was given', async () => {
  await withTasteHome(async (_home, store) => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    await taste.createTasteProfile(store, { name: 'hint', rules: [scoped] });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';

    const bare = await taste.auditTaste(store, { profile: 'hint', html });
    assert.ok(bare.calibration_hint.includes('get_taste_interview'));
    assert.equal(bare.binding, '');
    assert.equal(bare.findings[0].severity, 'warn');

    const withSurface = await taste.auditTaste(store, { profile: 'hint', html, surface: 'portfolio' });
    assert.equal(withSurface.calibration_hint, undefined);

    await taste.createTasteProfile(store, { name: 'nohint', rules: [baseRules()[0]] });
    const unscopedProfile = await taste.auditTaste(store, { profile: 'nohint', html });
    assert.equal(unscopedProfile.calibration_hint, undefined);
  });
});

test('host binding hardening: single-label hosts rejected, userinfo/ports stripped, corrupt stored files refuse to load', async () => {
  await withTasteHome(async (home, store) => {
    await taste.createTasteProfile(store, { name: 'hard', rules: baseRules() });

    // A bare TLD would suffix-match every site under it.
    await assert.rejects(() => taste.bindTasteSurface(store, 'hard', { project: 'x', surface: 's', hosts: ['ai'] }), /single label/);
    await assert.rejects(() => taste.bindTasteSurface(store, 'hard', { project: 'x', surface: 's', hosts: ['   '] }), /empty/);

    const bound = await taste.bindTasteSurface(store, 'hard', {
      project: 'x', surface: 's',
      hosts: ['user:pass@ravenmcp.ai', 'localhost:3000', '127.0.0.1'],
      uncalibrated_ack: 'test fixture'
    });
    assert.deepEqual(bound.hosts, ['ravenmcp.ai', 'localhost', '127.0.0.1']);

    // Stored files are validated as strictly as bind-time input.
    const { writeFileSync } = await import('node:fs');
    const file = path.join(home, 'hard.surfaces.json');
    const good = JSON.parse(await readFile(file, 'utf8'));

    const badHost = structuredClone(good);
    badHost.bindings[0].hosts = ['AI'];
    writeFileSync(file, JSON.stringify(badHost));
    await assert.rejects(() => taste.listSurfaceBindings(store, 'hard'), /unnormalized|single label/);

    const dupOverride = structuredClone(good);
    dupOverride.bindings[0].overrides = [
      { rule_id: 'HUE-NIT', severity: 'off' },
      { rule_id: 'HUE-NIT', severity: 'warn' }
    ];
    writeFileSync(file, JSON.stringify(dupOverride));
    await assert.rejects(() => taste.listSurfaceBindings(store, 'hard'), /duplicate rule_id/);

    const badProject = structuredClone(good);
    badProject.bindings[0].project = '../escape';
    writeFileSync(file, JSON.stringify(badProject));
    await assert.rejects(() => taste.listSurfaceBindings(store, 'hard'), /project must match/);

    // Unknown override rule_ids stay loadable by design: bindings outlive rule renames.
    const staleRule = structuredClone(good);
    staleRule.bindings[0].overrides = [{ rule_id: 'REMOVED-RULE', severity: 'off' }];
    writeFileSync(file, JSON.stringify(staleRule));
    assert.equal((await taste.listSurfaceBindings(store, 'hard'))[0].overrides[0].rule_id, 'REMOVED-RULE');
  });
});

test('the interview closes with an open-ended special question that learns suggestions from other bindings', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'sig', rules: baseRules() });

    // First surface: no other bindings yet -> open-ended, no suggestions.
    const first = await taste.getTasteInterview(store, 'sig', 'portfolio');
    const firstSpecial = first.questions[first.questions.length - 1];
    assert.equal(firstSpecial.id, 'special');
    assert.equal(firstSpecial.skippable, true);
    assert.equal(firstSpecial.priority, 'extended');
    assert.ok(/open-ended/i.test(firstSpecial.question));
    assert.ok(/texture/i.test(firstSpecial.question));
    assert.equal(firstSpecial.suggestions, undefined);
    assert.ok(first.then.includes('design_notes.special'));

    // Bind a special note on one surface; the NEXT project's interview
    // proposes it back as a learned suggestion.
    await taste.bindTasteSurface(store, 'sig', {
      project: 'portfolio', surface: 'monochrome portfolio',
      design_notes: { special: 'faint grid lines texture behind hero' },
    });
    const second = await taste.getTasteInterview(store, 'sig', 'raven-mcp');
    const secondSpecial = second.questions[second.questions.length - 1];
    assert.deepEqual(secondSpecial.suggestions, ['faint grid lines texture behind hero']);
    assert.ok(secondSpecial.question.includes('faint grid lines texture behind hero'));

    // Quotes and newlines in a stored note are neutralized in the question text.
    await taste.bindTasteSurface(store, 'sig', {
      project: 'quoted', surface: 'app-ui',
      design_notes: { special: "it's a\ndotted 'grain' texture" },
    });
    const third = await taste.getTasteInterview(store, 'sig', 'raven-mcp');
    const thirdSpecial = third.questions[third.questions.length - 1];
    assert.ok(!/it's/.test(thirdSpecial.question), 'raw single quotes must not reach the question text');
    assert.ok(!thirdSpecial.question.includes('\n'), 'newlines must be collapsed in the question text');
    assert.ok(thirdSpecial.suggestions.length === 2, 'raw suggestion values still carried in the suggestions field');

    // Same project is excluded from its own suggestions (only the other binding's note remains).
    const samePrj = await taste.getTasteInterview(store, 'sig', 'portfolio');
    const sameSpecial = samePrj.questions[samePrj.questions.length - 1];
    assert.deepEqual(sameSpecial.suggestions, ["it's a\ndotted 'grain' texture"]);

    // Refine mode revisits the stored special note like any other dimension.
    const refine = await taste.getTasteInterview(store, 'sig', 'portfolio', 'refine');
    const revise = refine.questions.find((q) => q.id === 'revise:special');
    assert.ok(revise);
    assert.ok(revise.question.includes('faint grid lines texture behind hero'));
  });
});

test('the references question invites examples right after identity and the then-contract folds them into notes', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'refs', rules: baseRules() });
    const interview = await taste.getTasteInterview(store, 'refs', 'demo');
    assert.equal(interview.questions[1].id, 'references');
    assert.equal(interview.questions[1].skippable, true);
    assert.equal(interview.questions[1].priority, 'core');
    assert.ok(/examples/i.test(interview.questions[1].question));
    assert.ok(/what specifically draws you/i.test(interview.questions[1].question));
    assert.ok(interview.then.includes('design_notes.references'));
  });
});

test('record_taste_decision: records, lists, filters, and validates', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'decider', rules: baseRules() });
    const rec = await taste.recordTasteDecision(store, 'decider', {
      project: 'proj-a', dimension: 'Color ', decision: 'amber-phosphor accent, period-accurate',
      rejected: ['electric blue'], why: 'matches CRT heritage', source: 'user-corrected',
    });
    assert.equal(rec.dimension, 'color', 'dimension normalizes to lowercase/trimmed');
    assert.equal(rec.source, 'user-corrected');
    await taste.recordTasteDecision(store, 'decider', { project: 'proj-b', dimension: 'color', decision: 'warm off-white ground' });
    const all = await taste.listTasteDecisions(store, 'decider');
    assert.equal(all.length, 2);
    assert.equal((await taste.listTasteDecisions(store, 'decider', { project: 'proj-a' })).length, 1);
    assert.equal((await taste.listTasteDecisions(store, 'decider', { dimension: 'color' })).length, 2);
    assert.equal(all[1].source, 'user-directed', 'source defaults to user-directed');
    await assert.rejects(() => taste.recordTasteDecision(store, 'decider', { project: 'proj-a', dimension: 'Bad Key!', decision: 'x' }), /dimension/);
    await assert.rejects(() => taste.recordTasteDecision(store, 'decider', { project: 'proj-a', dimension: 'color', decision: '  ' }), /decision/);
    await assert.rejects(() => taste.recordTasteDecision(store, 'decider', { project: 'proj-a', dimension: 'color', decision: 'x', source: 'guessed' }), /source/);
  });
});

test('kickoff interview learns from decisions on OTHER projects — suggestions on standard dimensions', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'learner', rules: baseRules() });
    await taste.recordTasteDecision(store, 'learner', { project: 'proj-a', dimension: 'navigation', decision: 'hamburger at every breakpoint' });
    const interview = await taste.getTasteInterview(store, 'learner', 'proj-new');
    const navQ = interview.questions.find((q) => q.id === 'design:navigation');
    assert.deepEqual(navQ.suggestions, ['hamburger at every breakpoint']);
    assert.ok(/On past projects you decided/.test(navQ.question), 'question text carries the learned decision');
    const sameProject = await taste.getTasteInterview(store, 'learner', 'proj-a');
    const sameNavQ = sameProject.questions.find((q) => q.id === 'design:navigation');
    assert.equal(sameNavQ.suggestions, undefined, 'decisions from the SAME project are excluded');
    assert.ok(/record_taste_decision/.test(interview.then), 'kickoff then tells the client to keep recording decisions');
  });
});

test('kickoff interview grows NEW questions from decision categories no standard dimension covers', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'grower', rules: baseRules() });
    await taste.recordTasteDecision(store, 'grower', { project: 'proj-a', dimension: 'iconography', decision: 'stroke icons only, 1.5px, no fills' });
    await taste.recordTasteDecision(store, 'grower', { project: 'proj-a', dimension: 'iconography', decision: 'stroke icons only, 1.5px, no fills' });
    await taste.recordTasteDecision(store, 'grower', { project: 'proj-b', dimension: 'iconography', decision: 'geometric, currentColor' });
    const interview = await taste.getTasteInterview(store, 'grower', 'proj-new');
    const iconQ = interview.questions.find((q) => q.id === 'design:iconography');
    assert.ok(iconQ, 'a learned iconography question is spawned');
    assert.equal(iconQ.skippable, true);
    assert.deepEqual(iconQ.suggestions.slice().sort(), ['geometric, currentColor', 'stroke icons only, 1.5px, no fills'], 'distinct decisions become suggestions');
    assert.ok(/design_notes\.iconography/.test(iconQ.question));
    const beforeVoice = interview.questions.findIndex((q) => q.id === 'voice');
    assert.ok(interview.questions.findIndex((q) => q.id === 'design:iconography') < beforeVoice, 'learned questions sit with the design dimensions, before voice');
  });
});

test('listTasteProfiles skips sidecar surfaces/decisions stores', async () => {
  await withTasteHome(async (home, store) => {
    const profile = await taste.createTasteProfile(store, { name: 'andrew', rules: baseRules().slice(0, 1) });
    await taste.bindTasteSurface(store, 'andrew', { project: 'demo', surface: 'product site', active_scopes: [], overrides: [], voice_note: '', url_hosts: [], uncalibrated_ack: 'test fixture' });
    await taste.recordTasteDecision(store, 'andrew', { project: 'demo', dimension: 'color', decision: 'warm accent', rejected: [], why: 'fits' });
    assert.ok((await readFile(path.join(home, 'andrew.surfaces.json'), 'utf8')).length > 0);
    assert.ok((await readFile(path.join(home, 'andrew.decisions.json'), 'utf8')).length > 0);
    assert.deepEqual(await taste.listTasteProfiles(store), [
      { name: 'andrew', rules: 1, corpus: 0, updated_at: profile.updated_at }
    ]);
  });
});

// ---- LEG B: references first-class + consistency ----

function makeTraits(over) {
  return Object.assign({
    source: 'live', scheme: 'light', bg_luminance: 0.98, text_density: 0.4,
    section_count: 5, image_count: 3, video_count: 0, canvas_count: 0,
    webgl: false, backdrop_filter: false, animation_count: 0, scroll_effects: false,
    font_families: ['Inter'], max_heading_px: 48, gradient_count: 0,
    loader_hint: false, viewport_fill: 0.6
  }, over || {});
}

test('bindTasteSurface persists references (with and without traits) and round-trips from disk', async () => {
  await withTasteHome(async (home, store) => {
    await taste.createTasteProfile(store, { name: 'refs', rules: baseRules() });
    const bound = await taste.bindTasteSurface(store, 'refs', {
      project: 'vision-app', surface: 'product-site',
      design_notes: { color: 'Dark, cinematic palette.' },
      references: [
        { url: 'https://mont-fort.com', liked: '  the type  ', traits: makeTraits({ scheme: 'light', bg_luminance: 0.97 }), captured_at: '2026-07-03T00:00:00.000Z' },
        { url: 'https://igloo.inc' } // no traits (capture failed)
      ]
    });
    assert.equal(bound.references.length, 2);
    assert.equal(bound.references[0].url, 'https://mont-fort.com');
    assert.equal(bound.references[0].liked, 'the type'); // trimmed
    assert.equal(bound.references[0].traits.scheme, 'light');
    assert.equal(bound.references[0].captured_at, '2026-07-03T00:00:00.000Z');
    assert.equal(bound.references[1].url, 'https://igloo.inc');
    assert.equal(bound.references[1].traits, undefined);

    // Persists and reloads through disk validation.
    const reloaded = (await taste.listSurfaceBindings(store, 'refs'))[0];
    assert.deepEqual(reloaded.references, bound.references);
    const onDisk = JSON.parse(await readFile(path.join(home, 'refs.surfaces.json'), 'utf8'));
    assert.equal(onDisk.bindings[0].references.length, 2);
  });
});

test('bindTasteSurface validates reference shape and requires http(s) urls', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'refval', rules: baseRules() });
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'refval', { project: 'x', surface: 's', references: 'nope' }),
      /references must be an array/
    );
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'refval', { project: 'x', surface: 's', references: [{ liked: 'no url' }] }),
      /references\[0\]\.url must be a string/
    );
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'refval', { project: 'x', surface: 's', references: [{ url: 'ftp://x.com' }] }),
      /must be an http\(s\) URL/
    );
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'refval', { project: 'x', surface: 's', references: [{ url: 'not a url' }] }),
      /must be a valid http\(s\) URL/
    );
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'refval', { project: 'x', surface: 's', references: [{ url: 'https://x.com', liked: 42 }] }),
      /liked must be a string/
    );
    // Empty binding stores no references key at all (disk format unchanged).
    const plain = await taste.bindTasteSurface(store, 'refval', { project: 'plain', surface: 's', uncalibrated_ack: 'test fixture' });
    assert.equal(plain.references, undefined);
  });
});

test('validateStoredBinding backward compat: old binding JSON without references loads', async () => {
  await withTasteHome(async (home, store) => {
    await taste.createTasteProfile(store, { name: 'compat', rules: baseRules() });
    await taste.bindTasteSurface(store, 'compat', { project: 'legacy', surface: 'product-site', design_notes: { color: 'Bone white.' } });
    const raw = JSON.parse(await readFile(path.join(home, 'compat.surfaces.json'), 'utf8'));
    assert.equal(raw.bindings[0].references, undefined, 'no references key written when none given');
    // Simulate a pre-references store (field absent entirely) — still loads.
    delete raw.bindings[0].references;
    await writeFile(path.join(home, 'compat.surfaces.json'), JSON.stringify(raw), 'utf8');
    const loaded = (await taste.listSurfaceBindings(store, 'compat'))[0];
    assert.equal(loaded.references, undefined);
    assert.equal(loaded.design_notes.color, 'Bone white.');
  });
});

test('checkBindingConsistency flags dark-note/light-refs and stays silent on agreement', async () => {
  // The exact vision-app-raven failure: notes say dark, both refs render light.
  const darkVsLight = taste.checkBindingConsistency(
    { color: 'Dark, cinematic palette.' },
    [
      { url: 'https://mont-fort.com', traits: makeTraits({ scheme: 'light', bg_luminance: 0.97 }) },
      { url: 'https://igloo.inc', traits: makeTraits({ scheme: 'light', bg_luminance: 0.94 }) }
    ]
  );
  assert.equal(darkVsLight.length, 1);
  assert.match(darkVsLight[0], /reads dark/);
  assert.match(darkVsLight[0], /mont-fort\.com/);
  assert.match(darkVsLight[0], /igloo\.inc/);
  assert.match(darkVsLight[0], /luminance=0\.97/);

  // Agreement: dark note + dark refs => silent.
  const agree = taste.checkBindingConsistency(
    { color: 'Dark, cinematic palette.' },
    [{ url: 'https://a.com', traits: makeTraits({ scheme: 'dark', bg_luminance: 0.08 }) }]
  );
  assert.deepEqual(agree, []);

  // No traits on any ref => silent (nothing citable).
  const noTraits = taste.checkBindingConsistency(
    { color: 'Dark palette.' },
    [{ url: 'https://a.com' }]
  );
  assert.deepEqual(noTraits, []);

  // light-words vs all-dark refs.
  const lightVsDark = taste.checkBindingConsistency(
    { color: 'Bone white, airy.' },
    [{ url: 'https://a.com', traits: makeTraits({ scheme: 'dark', bg_luminance: 0.06 }) }]
  );
  assert.equal(lightVsDark.length, 1);
  assert.match(lightVsDark[0], /reads light/);
});

test('checkBindingConsistency flags motion and spacing contradictions with citable numbers', async () => {
  // static note vs animated reference.
  const motionStatic = taste.checkBindingConsistency(
    { motion: 'Minimal, static — no motion.' },
    [{ url: 'https://a.com', traits: makeTraits({ animation_count: 12, scroll_effects: true }) }]
  );
  assert.equal(motionStatic.length, 1);
  assert.match(motionStatic[0], /reads static\/minimal/);
  assert.match(motionStatic[0], /animations=12/);

  // choreography note vs all-still references.
  const motionDynamic = taste.checkBindingConsistency(
    { motion: 'Cinematic scroll choreography.' },
    [{ url: 'https://a.com', traits: makeTraits({ animation_count: 0, scroll_effects: false }) }]
  );
  assert.equal(motionDynamic.length, 1);
  assert.match(motionDynamic[0], /choreography\/scroll motion/);

  // null animation_count => not counted as still => silent for dynamic note.
  const motionNull = taste.checkBindingConsistency(
    { motion: 'Cinematic scroll.' },
    [{ url: 'https://a.com', traits: makeTraits({ animation_count: null }) }]
  );
  assert.deepEqual(motionNull, []);

  // airy note vs text-dense references.
  const airy = taste.checkBindingConsistency(
    { spacing: 'Airy, generous whitespace.' },
    [{ url: 'https://a.com', traits: makeTraits({ text_density: 3.4 }) }]
  );
  assert.equal(airy.length, 1);
  assert.match(airy[0], /reads airy\/sparse/);
  assert.match(airy[0], /text_density=3\.40/);

  // dense note vs sparse references.
  const dense = taste.checkBindingConsistency(
    { spacing: 'Compact, dense grid.' },
    [{ url: 'https://a.com', traits: makeTraits({ text_density: 0.3 }) }]
  );
  assert.equal(dense.length, 1);
  assert.match(dense[0], /reads compact\/dense/);

  // spacing with null density => silent.
  const spacingNull = taste.checkBindingConsistency(
    { spacing: 'Airy.' },
    [{ url: 'https://a.com', traits: makeTraits({ text_density: null }) }]
  );
  assert.deepEqual(spacingNull, []);
});

// ---- LEG C: design_notes presence verification in auditTaste ----

test('auditTaste verifies design_notes against traits: the vision-app-raven failure shape now BLOCKS', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'fidelity', rules: baseRules() });
    await taste.bindTasteSurface(store, 'fidelity', {
      project: 'vision-app-raven',
      surface: 'product-site',
      design_notes: {
        color: 'Dark, cinematic palette.',
        libraries: 'three.js hero + GSAP scroll choreography',
        motion: 'cinematic scroll choreography',
        aesthetic: 'glassmorphic panels',
        imagery: 'story-driven scene sequences'
      }
    });
    // The build that "passed 13/13": light, still, canvas-less, one image.
    const traits = makeTraits({
      scheme: 'light', bg_luminance: 0.97, canvas_count: 0, webgl: false,
      scroll_effects: false, animation_count: 0, backdrop_filter: false,
      image_count: 1, video_count: 0
    });
    const result = await taste.auditTaste(store, {
      profile: 'fidelity',
      html: '<main><p>Raven vision app.</p></main>',
      project: 'vision-app-raven',
      traits
    });

    // Every note assessed; the dropped ones read missing with cited numbers.
    assert.equal(result.note_assessments.length, 5);
    const byKey = Object.fromEntries(result.note_assessments.map((a) => [a.key, a]));
    assert.equal(byKey.color.status, 'missing');
    assert.equal(byKey.libraries.status, 'missing');
    assert.equal(byKey.motion.status, 'missing');
    assert.equal(byKey.aesthetic.status, 'missing');
    assert.equal(byKey.imagery.status, 'partial'); // one image: partial, not invented as missing
    const missing = result.note_assessments.filter((a) => a.status === 'missing');
    assert.ok(missing.length >= 3, 'expected >=3 missing, got ' + missing.length);
    for (const row of missing) assert.match(row.evidence, /[0-9]|false/, row.key + ' must cite trait numbers');

    // Missing notes became findings; a named library wholly absent escalates to block.
    const libFinding = result.fidelity_findings.find((f) => f.rule_id === 'NOTE-libraries');
    assert.equal(libFinding.severity, 'block');
    assert.equal(libFinding.clause_cited, 'three.js hero + GSAP scroll choreography');
    assert.match(libFinding.evidence, /canvas_count=0/);
    assert.equal(result.fidelity_findings.find((f) => f.rule_id === 'NOTE-color').severity, 'warn');
    // Sparse-and-empty page also trips the restraint guard.
    assert.ok(result.fidelity_findings.some((f) => f.rule_id === 'TASTE-restraint-earned'));

    // Fidelity findings COUNT toward the verdict.
    assert.equal(result.verdict, 'BLOCK');
    assert.match(result.verdict_line, /^Verdict: BLOCK \(\d+ block, \d+ warn\)$/);
    // ...but never leak into the profile-rule findings array.
    assert.equal(result.findings.some((f) => f.rule_id.startsWith('NOTE-')), false);
  });
});

test('auditTaste carries build_hints for expensive notes, alongside the missing findings', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'hints', rules: baseRules() });
    await taste.bindTasteSurface(store, 'hints', {
      project: 'vision-app-raven',
      surface: 'product-site',
      design_notes: {
        libraries: 'three.js hero + GSAP scroll choreography',
        aesthetic: 'glassmorphic panels'
      }
    });
    // Dropped-everything build: canvas-less, still, no backdrop-filter.
    const traits = makeTraits({
      scheme: 'light', canvas_count: 0, webgl: false, scroll_effects: false,
      animation_count: 0, backdrop_filter: false, image_count: 1
    });
    const result = await taste.auditTaste(store, { profile: 'hints', html: '<main><p>App.</p></main>', project: 'vision-app-raven', traits });

    // The audit hands the fix ammunition next to the missing finding.
    assert.ok(Array.isArray(result.build_hints), 'build_hints present when a note names an expensive technique');
    const techniques = result.build_hints.map((h) => h.technique);
    assert.ok(techniques.includes('three.js hero scene'));
    assert.ok(techniques.includes('GSAP scroll choreography'));
    assert.ok(techniques.includes('glassmorphism'));
    const three = result.build_hints.find((h) => h.technique === 'three.js hero scene');
    assert.ok(three.examples.some((e) => /threejs\.org/.test(e)), 'recipe names a canonical public source');
    // Still counts the notes as missing — hints do not paper over the failure.
    assert.ok(result.fidelity_findings.some((f) => f.rule_id === 'NOTE-libraries'));
    assert.equal(result.verdict, 'BLOCK');
  });
});

test('auditTaste omits build_hints when no note names an expensive technique', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'nohints', rules: baseRules() });
    await taste.bindTasteSurface(store, 'nohints', {
      project: 'plain-app',
      surface: 'product-site',
      design_notes: { typography: 'restrained grotesque', libraries: 'none — vanilla JS' }
    });
    const result = await taste.auditTaste(store, { profile: 'nohints', html: '<main><p>Hi.</p></main>', project: 'plain-app', traits: makeTraits({}) });
    assert.equal(result.build_hints, undefined, 'no expensive technique -> no build_hints field');
  });
});

test('auditTaste html mode extracts static traits when none are passed', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'staticfid', rules: baseRules() });
    await taste.bindTasteSurface(store, 'staticfid', {
      project: 'static-app',
      surface: 'product-site',
      design_notes: { color: 'Dark, cinematic.', aesthetic: 'glassmorphic', motion: 'cinematic scroll' }
    });
    const html = '<html><body style="background:#ffffff"><main><p>Hello.</p></main></body></html>';
    const result = await taste.auditTaste(store, { profile: 'staticfid', html, project: 'static-app' });
    const byKey = Object.fromEntries(result.note_assessments.map((a) => [a.key, a]));
    // Statically observable: white body -> the dark note is missing; no backdrop-filter -> glass missing.
    assert.equal(byKey.color.status, 'missing');
    assert.equal(byKey.aesthetic.status, 'missing');
    // Live-only: motion is honestly unverifiable from static HTML, never guessed missing.
    assert.equal(byKey.motion.status, 'unverifiable');
    assert.match(byKey.motion.evidence, /static HTML/);
    assert.equal(result.verdict, 'WARN');
  });
});

test('auditTaste folds reference deltas from the binding into fidelity_findings', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'refdelta', rules: baseRules() });
    await taste.bindTasteSurface(store, 'refdelta', {
      project: 'vision-app',
      surface: 'product-site',
      design_notes: { color: 'Dark, cinematic.' },
      references: [
        { url: 'https://mont-fort.com', traits: makeTraits({ scheme: 'light', bg_luminance: 0.97, animation_count: 20, scroll_effects: true }) },
        { url: 'https://igloo.inc', traits: makeTraits({ scheme: 'light', bg_luminance: 0.94 }) }
      ]
    });
    const target = makeTraits({ scheme: 'dark', bg_luminance: 0.05, animation_count: 0, scroll_effects: false });
    const result = await taste.auditTaste(store, { profile: 'refdelta', html: '<main><p>Hi.</p></main>', project: 'vision-app', traits: target });
    const scheme = result.fidelity_findings.filter((f) => f.rule_id === 'REF-scheme-mismatch');
    assert.equal(scheme.length, 1, 'deduped across refs');
    assert.match(scheme[0].evidence, /mont-fort\.com/);
    assert.match(scheme[0].evidence, /igloo\.inc/);
    const motion = result.fidelity_findings.find((f) => f.rule_id === 'REF-motion-missing');
    assert.match(motion.evidence, /mont-fort\.com/);
    // The color note itself agrees with the target (dark on dark) -> no NOTE-color finding.
    assert.equal(result.fidelity_findings.some((f) => f.rule_id === 'NOTE-color'), false);
    assert.equal(result.verdict, 'WARN');
  });
});

test('fidelity backward compat: no design_notes, no traits, or text mode leaves the result shape unchanged', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'fidcompat', rules: baseRules() });
    // Binding without design_notes: nothing to verify even with traits.
    await taste.bindTasteSurface(store, 'fidcompat', { project: 'plain', surface: 'product-site', uncalibrated_ack: 'test fixture' });
    const withTraits = await taste.auditTaste(store, { profile: 'fidcompat', html: '<p>Hi.</p>', project: 'plain', traits: makeTraits({}) });
    assert.equal(withTraits.note_assessments, undefined);
    assert.equal(withTraits.fidelity_findings, undefined);

    // No binding at all.
    const unbound = await taste.auditTaste(store, { profile: 'fidcompat', html: '<p>Hi.</p>' });
    assert.equal(unbound.note_assessments, undefined);
    assert.equal(unbound.fidelity_findings, undefined);

    // design_notes bound, but text mode has no traits and nothing to extract.
    await taste.bindTasteSurface(store, 'fidcompat', { project: 'noted', surface: 'product-site', design_notes: { color: 'dark' } });
    const textMode = await taste.auditTaste(store, { profile: 'fidcompat', text: 'Some copy.', project: 'noted' });
    assert.equal(textMode.note_assessments, undefined);
    assert.equal(textMode.fidelity_findings, undefined);
    assert.equal(textMode.verdict, 'PASS');
  });
});

test('restraint guard alone escalates a clean PASS to WARN with the standard verdict line', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'restraint', rules: baseRules() });
    await taste.bindTasteSurface(store, 'restraint', {
      project: 'sparse-app',
      surface: 'product-site',
      design_notes: { typography: 'Grotesque, restrained.' } // unverifiable note: no NOTE- finding
    });
    const sparseEmpty = makeTraits({
      text_density: 0.3, image_count: 0, video_count: 0, canvas_count: 0,
      animation_count: 0, backdrop_filter: false, font_families: ['Inter'],
      max_heading_px: 40, gradient_count: 0
    });
    const result = await taste.auditTaste(store, { profile: 'restraint', html: '<main><p>Hi.</p></main>', project: 'sparse-app', traits: sparseEmpty });
    assert.deepEqual(result.fidelity_findings.map((f) => f.rule_id), ['TASTE-restraint-earned']);
    assert.equal(result.verdict, 'WARN');
    assert.equal(result.verdict_line, 'Verdict: WARN (0 block, 1 warn)');
    // The unverifiable note is still reported honestly in note_assessments.
    assert.equal(result.note_assessments[0].status, 'unverifiable');

    // Same page with earned sparseness (craft present): guard is silent, PASS.
    const crafted = await taste.auditTaste(store, {
      profile: 'restraint', html: '<main><p>Hi.</p></main>', project: 'sparse-app',
      traits: makeTraits(Object.assign({}, sparseEmpty, { canvas_count: 1, animation_count: 6 }))
    });
    assert.deepEqual(crafted.fidelity_findings, []);
    assert.equal(crafted.verdict, 'PASS');
  });
});

// ═══════════════════════════════════════════════════════════════════
// LEG E — mobile parity: image-path references + the mobile-audit chain
// (bind -> resolveSurfaceBinding -> assessDesignNotesSource -> issues).
// ═══════════════════════════════════════════════════════════════════

const distFidelityMobile = path.resolve(__dirname, '../dist/taste-fidelity.js');
const fidelityMobile = await import(distFidelityMobile);

test('references accept local .png image paths alongside http(s) URLs', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'mobrefs', rules: baseRules() });
    // isPngPathReference is the routing predicate the bind handler uses.
    assert.equal(taste.isPngPathReference('/tmp/screen.png'), true);
    assert.equal(taste.isPngPathReference('shots/Home.PNG'), true);
    assert.equal(taste.isPngPathReference('https://a.com/shot.png'), false, 'http urls stay on the live-capture path');
    assert.equal(taste.isPngPathReference('/tmp/screen.jpg'), false);

    const bound = await taste.bindTasteSurface(store, 'mobrefs', {
      project: 'vision-app-ios', surface: 'mobile app',
      design_notes: { color: 'Dark, cinematic palette.' },
      references: [
        { url: '/tmp/home-screen.png', liked: 'the depth', traits: makeTraits({ source: 'static', scheme: 'dark', bg_luminance: 0.04, webgl: null, animation_count: null, scroll_effects: null, text_density: null, viewport_fill: null, max_heading_px: null }) },
        { url: 'https://mont-fort.com' }
      ]
    });
    assert.equal(bound.references.length, 2);
    assert.equal(bound.references[0].url, '/tmp/home-screen.png');
    assert.equal(bound.references[0].traits.scheme, 'dark');
    // Round-trips through disk validation.
    const reloaded = (await taste.listSurfaceBindings(store, 'mobrefs'))[0];
    assert.equal(reloaded.references[0].url, '/tmp/home-screen.png');
    // Non-png non-url paths are still rejected.
    await assert.rejects(
      () => taste.bindTasteSurface(store, 'mobrefs', { project: 'x', surface: 's', references: [{ url: '/tmp/notes.txt' }] }),
      /must be a valid http\(s\) URL or a \.png image path/
    );
  });
});

test('checkBindingConsistency works on the pixel-trait subset from an image reference', async () => {
  // A dark color note against a LIGHT screenshot reference must contradict —
  // using only the scheme/luminance subset screenTraitsFromImage can supply.
  const imageTraits = makeTraits({
    source: 'static', scheme: 'light', bg_luminance: 0.96,
    webgl: null, animation_count: null, scroll_effects: null,
    text_density: null, viewport_fill: null, max_heading_px: null
  });
  const warnings = taste.checkBindingConsistency(
    { color: 'Dark, cinematic.', motion: 'minimal' },
    [{ url: '/tmp/light-screen.png', traits: imageTraits }]
  );
  assert.equal(warnings.length, 1, 'only the color contradiction fires; null motion traits stay silent');
  assert.match(warnings[0], /renders LIGHT/);
  assert.match(warnings[0], /light-screen\.png/);
});

test('mobile audit integration: bound design_notes verified against source fold into issues; no binding -> unchanged', async () => {
  await withTasteHome(async (_home, store) => {
    // The exact chain audit_swiftui runs when passed project: resolve the
    // binding, assess the notes against the source, fold missing into issues.
    await taste.createTasteProfile(store, { name: 'andrew-mobile', rules: baseRules() });
    await taste.bindTasteSurface(store, 'andrew-mobile', {
      project: 'vision-app-ios', surface: 'mobile app',
      design_notes: { aesthetic: 'glassmorphic frosted panels', motion: 'cinematic choreographed transitions', loading: 'branded loader' }
    });

    const binding = await taste.resolveSurfaceBinding(store, 'andrew-mobile', { project: 'vision-app-ios' });
    assert.ok(binding, 'project hint must resolve the binding');

    const bareSource = 'struct ListView: View { var body: some View { VStack { Text("one") } } }';
    const assessments = fidelityMobile.assessDesignNotesSource(binding.design_notes, bareSource, 'swiftui');
    const issues = fidelityMobile.noteIssuesFromAssessments(binding.design_notes, assessments);
    // All three notes are missing from the bare list; branded loader escalates.
    assert.equal(issues.length, 3);
    const bySeverity = Object.fromEntries(issues.map((i) => [i.rule, i.severity]));
    assert.equal(bySeverity['taste-note/aesthetic'], 'warning');
    assert.equal(bySeverity['taste-note/motion'], 'warning');
    assert.equal(bySeverity['taste-note/loading'], 'error');
    for (const issue of issues) assert.ok(issue.fix.length > 10, issue.rule + ' carries a fix');

    // Backward compat: an unbound project resolves nothing -> no note issues,
    // the audit result is byte-identical to the pre-taste behavior.
    assert.equal(await taste.resolveSurfaceBinding(store, 'andrew-mobile', { project: 'some-other-app' }), null);
  });
});

// ---- devil's-advocate regressions (2026-07-03 Codex DA pass) ----

test('checkBindingConsistency: scroll-driven references (animation_count=0, scroll_effects=true) are NOT flagged still', async () => {
  const warnings = taste.checkBindingConsistency(
    { motion: 'immersive scroll choreography' },
    [
      { url: 'https://mont-fort.com', traits: makeTraits({ animation_count: 0, scroll_effects: true }) },
      { url: 'https://igloo.inc', traits: makeTraits({ animation_count: 0, scroll_effects: true }) }
    ]
  );
  assert.ok(!warnings.some((w) => w.includes('motion note')), 'a reference idling between scroll inputs is motion evidence, not stillness: ' + JSON.stringify(warnings));

  // Genuinely still references DO warn.
  const still = taste.checkBindingConsistency(
    { motion: 'immersive scroll choreography' },
    [{ url: 'https://a.com', traits: makeTraits({ animation_count: 0, scroll_effects: false }) }]
  );
  assert.ok(still.some((w) => w.includes('motion note')));
});

test('stored reference traits are sanitized: corrupt fields degrade to null/unknown, never crash later audits', async () => {
  await withTasteHome(async (_home, store) => {
    await taste.createTasteProfile(store, { name: 'corrupt', rules: baseRules() });
    await taste.bindTasteSurface(store, 'corrupt', {
      project: 'p',
      surface: 'product-site',
      design_notes: { color: 'Dark, cinematic.', spacing: 'airy' },
      references: [{
        url: 'https://x.com',
        traits: { scheme: 'neon', bg_luminance: 'very dark', text_density: '0.5', animation_count: NaN, font_families: ['Inter', 42], section_count: -3 }
      }]
    });
    const loaded = (await taste.listSurfaceBindings(store, 'corrupt'))[0];
    const t = loaded.references[0].traits;
    assert.equal(t.scheme, 'unknown');
    assert.equal(t.bg_luminance, null);
    assert.equal(t.text_density, null);
    assert.equal(t.animation_count, null);
    assert.deepEqual(t.font_families, ['Inter']);
    assert.equal(t.section_count, 0);
    // The consistency check runs over the sanitized traits without throwing.
    const warnings = taste.checkBindingConsistency(loaded.design_notes, loaded.references);
    assert.ok(Array.isArray(warnings));
  });
});
