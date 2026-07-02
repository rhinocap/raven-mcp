import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distTaste = path.resolve(__dirname, '../dist/taste.js');

let taste;
try {
  taste = await import(distTaste);
} catch (err) {
  const msg = `dist/taste.js not found - run \`npm run build\` first. (${err.message})`;
  test('taste module available', (t) => { t.skip(msg); });
  process.exit(0);
}

async function withTasteHome(fn) {
  const previous = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-taste-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    await fn(home);
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
  await withTasteHome(async () => {
    const rules = baseRules().slice(0, 2);
    const profile = taste.createTasteProfile({ name: 'staff-taste', rules });
    const loaded = taste.getTasteProfile('staff-taste');
    assert.deepEqual(loaded, profile);

    assert.deepEqual(taste.listTasteProfiles(), [
      { name: 'staff-taste', rules: 2, corpus: 0, updated_at: profile.updated_at }
    ]);
  });
});

test('markdown ingestion parses categories, severities, raven owner, negative prompts, and unique ids', async () => {
  await withTasteHome(async () => {
    const markdown = `
## Color Systems
- (block) Avoid gradient hero chrome. Do NOT use linear-gradient as decoration.
- (nit) Avoid gradient hero chrome. Do NOT use linear-gradient as decoration.
### Accessibility
- (warn) Tap targets must meet sizing guidance. (raven:audit_page) Do NOT ship small buttons.
`;
    const profile = taste.createTasteProfile({
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
  await withTasteHome(async (home) => {
    taste.createTasteProfile({ name: 'labels', rules: [baseRules()[0]] });
    const first = taste.labelFinding('labels', {
      artifact: 'hero.html',
      verdict: 'revise',
      violated_rule: 'GRADIENT-BLOCK',
      severity: 'block',
      wrong: 'linear-gradient',
      right: 'flat token'
    });
    const file = path.join(home, 'labels.json');
    const firstRecordBefore = JSON.parse(await readFile(file, 'utf8')).corpus[0];

    const second = taste.labelFinding('labels', {
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
    assert.throws(() => taste.labelFinding('labels', {
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
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({ name: 'verdicts', rules: baseRules() });

    const nitOnly = taste.auditTaste({ profile: 'verdicts', html: '<style>.a{color:#ff0000}.b{color:#0066ff}</style>' });
    assert.equal(nitOnly.verdict, 'PASS');
    assert.equal(nitOnly.verdict_line, 'Verdict: PASS (no findings)');
    assert.equal(nitOnly.findings.length, 1);

    const warn = taste.auditTaste({ profile, text: 'This shipped feature will unlock growth. #ff0000 #0066ff' });
    assert.equal(warn.verdict, 'WARN');
    assert.equal(warn.verdict_line, 'Verdict: WARN (0 block, 2 warn)');

    const block = taste.auditTaste({
      profile: 'verdicts',
      html: '<style>.hero{background:linear-gradient(red, blue);color:#ff0000}.cta{color:#0066ff}</style><p>unlock</p>'
    });
    assert.equal(block.verdict, 'BLOCK');
    assert.equal(block.verdict_line, 'Verdict: BLOCK (1 block, 1 warn)');
  });
});

test('corpus suppression downgrades verdict and moves finding to suppressed', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'suppression', rules: [baseRules()[0]] });
    const first = taste.auditTaste({ profile: 'suppression', html: '<style>.x{background:linear-gradient(red, blue)}</style>' });
    assert.equal(first.verdict, 'BLOCK');
    assert.equal(first.findings.length, 1);

    taste.labelFinding('suppression', {
      artifact: 'accepted.html',
      verdict: 'accept',
      violated_rule: 'GRADIENT-BLOCK',
      severity: 'block',
      wrong: 'linear-gradient',
      right: 'accepted exception'
    });
    const second = taste.auditTaste({ profile: 'suppression', html: '<style>.x{background:linear-gradient(red, blue)}</style>' });
    assert.equal(second.findings.length, 0);
    assert.equal(second.suppressed.length, 1);
    assert.equal(second.suppressed[0].corpus_id, 'rec_0001');
    assert.equal(second.verdict, 'PASS');
  });
});

test('rule_id citation invariant across findings, suppressed, and not_assessed', async () => {
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({
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
    taste.labelFinding('citations', {
      artifact: 'accepted.html',
      verdict: 'accept',
      violated_rule: 'GRADIENT-BLOCK',
      severity: 'block',
      wrong: 'linear-gradient',
      right: 'accepted exception'
    });
    const result = taste.auditTaste({ profile: 'citations', html: '<style>.x{background:linear-gradient(red, blue)}</style>' });
    assertAllCitationsExist(profile, result);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.not_assessed.length, 1);
  });
});

test('no invented rule_id and no hedging evidence', async () => {
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({ name: 'invariants', rules: baseRules() });
    const result = taste.auditTaste({
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
  try {
    process.env.RAVEN_TASTE_HOME = homeA;
    taste.createTasteProfile({ name: 'isolated', rules: [baseRules()[0]] });
    await stat(path.join(homeA, 'isolated.json'));

    process.env.RAVEN_TASTE_HOME = homeB;
    assert.deepEqual(taste.listTasteProfiles(), []);
    assert.throws(() => taste.getTasteProfile('isolated'), /Available profiles: \(none\)/);
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
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({
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
    const missing = taste.auditTaste({ profile, html: '<button>Buy</button>' });
    assert.equal(missing.not_assessed.length, 2);
    assert.match(missing.not_assessed[0].reason, /delegated to audit_page/);

    const folded = taste.auditTaste({
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
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({ name: 'detectors', rules: baseRules() });
    const positive = taste.auditTaste({
      profile,
      html: '<style>.x{background:radial-gradient(circle, red, blue);color:#ff0000}.y{color:#0066ff}</style><main>proven results</main>'
    });
    assert.equal(positive.findings.some((finding) => finding.rule_id === 'GRADIENT-BLOCK'), true);
    assert.equal(positive.findings.some((finding) => finding.rule_id === 'BANNED-WARN'), true);
    assert.equal(positive.findings.some((finding) => finding.rule_id === 'HUE-NIT'), true);

    const restrained = taste.auditTaste({
      profile,
      html: '<style>.x{background:#ffffff;color:#222222}.y{border-color:#eeeeee}</style><main>Measured results</main>'
    });
    assert.equal(restrained.verdict, 'PASS');
    assert.equal(restrained.findings.length, 0);
    assert.equal(restrained.verdict_line, 'Verdict: PASS (no findings)');
  });
});

test('glow detector flags large-blur colored shadows and passes plain elevation shadows', async () => {
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({
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
    const glowing = taste.auditTaste({
      profile,
      html: '<style>.cta{box-shadow: 0 0 32px #ff00ff}</style><button class="cta">Go</button>'
    });
    assert.equal(glowing.findings.some((finding) => finding.rule_id === 'GLOW-BLOCK'), true);
    assert.equal(glowing.verdict, 'BLOCK');

    const elevated = taste.auditTaste({
      profile,
      html: '<style>.card{box-shadow: 0 2px 8px rgba(0,0,0,0.2)}</style><div class="card">Card</div>'
    });
    assert.equal(elevated.findings.length, 0);
    assert.equal(elevated.verdict, 'PASS');
  });
});

test('glow detector stays silent on colorless large-blur shadows (currentColor/var cannot be judged statically)', async () => {
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({
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
    const colorless = taste.auditTaste({
      profile,
      html: '<style>.a{box-shadow: 0 0 24px} .b{box-shadow: 0 8px 40px var(--elev)} .c{box-shadow: inset 0 0 20px currentColor}</style><div class="a">x</div>'
    });
    assert.equal(colorless.findings.length, 0);
    assert.equal(colorless.verdict, 'PASS');

    const named = taste.auditTaste({
      profile,
      html: '<style>.d{box-shadow: 0 0 24px rebeccapurple}</style><div class="d">x</div>'
    });
    assert.equal(named.findings.some((finding) => finding.rule_id === 'GLOW-BLOCK'), true);
  });
});

test('create_taste_profile accepts minimal seed corpus records and defaults rule owner to taste', async () => {
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({
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
    const loaded = taste.getTasteProfile('seeded');
    assert.equal(loaded.corpus[0].id, 'rec_0001');
    const audited = taste.auditTaste({
      profile: 'seeded',
      html: '<style>.hero{background: linear-gradient(180deg, #111, #222)}</style>'
    });
    assert.equal(audited.suppressed.some((s) => s.corpus_id === 'rec_0001'), true);
  });
});

test('accept-suppression is evidence-scoped: a different violation of the same rule on the same page stays flagged', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({
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
    taste.labelFinding('scoped', {
      artifact: 'page',
      verdict: 'accept',
      violated_rule: 'COLOR-no-gradient',
      severity: 'block',
      wrong: 'linear-gradient(180deg, #111, #222)',
      right: 'intentional brand exception',
    });
    const result = taste.auditTaste({ profile: 'scoped', html });
    assert.equal(result.suppressed.length, 1);
    assert.ok(result.suppressed[0].evidence.includes('180deg'));
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].evidence.includes('90deg, red, blue'));
    assert.equal(result.verdict, 'BLOCK');
  });
});

test('markdown ingestion skips fenced code blocks and stopword-led headings do not become categories', async () => {
  await withTasteHome(async () => {
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
    const profile = taste.createTasteProfile({ name: 'fenced', markdown });
    // The fenced bullet must not ingest: 3 real bullets only.
    assert.equal(profile.rules.length, 3);
    assert.ok(!profile.rules.some((r) => r.clause_text.includes('code example')));
    // Stopword-led headings pick the first content word, never "the"/"why".
    assert.deepEqual(profile.rules.map((r) => r.category), ['mythology', 'works', 'color']);
    assert.ok(profile.rules.every((r) => r.rule_id !== '' && !/^(THE|WHY)-/.test(r.rule_id)));
  });
});

test('banned-word lists only extract from vocabulary sentences, not descriptive example lists', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({
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
    const result = taste.auditTaste({ profile: 'vocab-gate', text });
    const ruleIdsHit = new Set(result.findings.map((f) => f.rule_id));
    // "proven"/"shipped" are real banned vocabulary; "counts"/"descriptions" are examples, not bans.
    assert.ok(ruleIdsHit.has('VOICE-no-hype'));
    assert.ok(!ruleIdsHit.has('FACTS-read-source'));
    // The descriptive-list rule has no detector left, so it lands in not_assessed.
    assert.ok(result.not_assessed.some((row) => row.rule_id === 'FACTS-read-source'));
  });
});

test('mixed fence markers, cross-sentence cue leaks, and abbreviation boundaries are handled', async () => {
  await withTasteHome(async () => {
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
    const profile = taste.createTasteProfile({ name: 'fence-mix', markdown });
    assert.equal(profile.rules.length, 1);
    assert.ok(profile.rules[0].clause_text.startsWith('Real rule'));

    // 2. A vocabulary cue in a PREVIOUS sentence (ending in "!") must not gate in
    //    a descriptive list from the next sentence.
    taste.createTasteProfile({
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
    const leak = taste.auditTaste({ profile: 'cue-leak', text: 'It counts outcomes and descriptions.' });
    assert.equal(leak.findings.length, 0);
    assert.ok(leak.not_assessed.some((row) => row.rule_id === 'FACTS-leak'));

    // 3. "e.g." must not break the sentence before a genuine vocabulary list.
    taste.createTasteProfile({
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
    const abbrev = taste.auditTaste({ profile: 'abbrev', text: 'We shipped a proven system.' });
    assert.ok(abbrev.findings.length >= 1);
    assert.equal(abbrev.findings[0].rule_id, 'VOICE-abbrev');
  });
});

test('raven-rule folding rejects unrelated issues and caps advisory severity (clean page stays clean)', async () => {
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({
      name: 'fold-guard',
      rules: [
        {
          rule_id: 'TOKEN-no-bare-literals',
          clause_text: 'Every visual value uses var(--token, fallback) — no bare hex, px, or font literals in component CSS.',
          category: 'tokens',
          severity_default: 'block',
          negative_prompt: 'Do NOT author bare literal values.',
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
    const unrelated = taste.auditTaste({
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
    const genuine = taste.auditTaste({
      profile,
      html: '<style>body{color:#333}</style><main>x</main>',
      page_issues: [
        { rule: 'tokens/no-bare-hex', severity: 'error', message: '3 bare hex color values found outside custom property definitions', fix: 'Move to tokens' }
      ]
    });
    assert.deepEqual(genuine.findings.map((f) => f.rule_id), ['TOKEN-no-bare-literals']);
    assert.equal(genuine.findings[0].severity, 'block');

    // An advisory ("warning") issue folding into a block-severity rule caps at warn —
    // a suggestion can never produce a BLOCK verdict on its own.
    const advisory = taste.auditTaste({
      profile,
      html: '<style>body{color:#333}</style><main>x</main>',
      page_issues: [
        { rule: 'tokens/no-bare-hex', severity: 'warning', message: '1 bare hex color value found outside custom property definitions', fix: 'Move to tokens' }
      ]
    });
    assert.equal(advisory.findings.length, 1);
    assert.equal(advisory.findings[0].severity, 'warn');
    assert.match(advisory.verdict, /^WARN/);
  });
});
