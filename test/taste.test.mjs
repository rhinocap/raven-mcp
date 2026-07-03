import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
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

    // A non-"error" issue folding into a block-severity rule caps at warn — advisory
    // "warning" and unrecognized severity strings alike can never produce a BLOCK.
    for (const sev of ['warning', 'advisory']) {
      const advisory = taste.auditTaste({
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
  await withTasteHome(async () => {
    const profile = taste.createTasteProfile({
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
    const folded = taste.auditTaste({
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
  await withTasteHome(async () => {
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
    taste.createTasteProfile({ name: 'scoped', rules: [scopedRule, baseRules()[1]] });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';

    const onPortfolio = taste.auditTaste({ profile: 'scoped', html, surface: 'portfolio' });
    assert.equal(onPortfolio.verdict, 'BLOCK');
    assert.equal(onPortfolio.findings[0].rule_id, 'GRADIENT-SCOPED');
    assert.equal(onPortfolio.findings[0].severity, 'block');
    assert.equal(onPortfolio.skipped_out_of_scope.length, 0);

    const onProduct = taste.auditTaste({ profile: 'scoped', html, surface: 'product-site' });
    assert.equal(onProduct.findings.filter((f) => f.rule_id === 'GRADIENT-SCOPED').length, 0);
    assert.deepEqual(onProduct.skipped_out_of_scope, [{ rule_id: 'GRADIENT-SCOPED', scope: 'portfolio-monochrome' }]);
    assert.equal(onProduct.verdict, 'PASS');

    const noSurface = taste.auditTaste({ profile: 'scoped', html });
    const capped = noSurface.findings.find((f) => f.rule_id === 'GRADIENT-SCOPED');
    assert.equal(capped.severity, 'warn');
    assert.equal(noSurface.verdict, 'WARN');
    assert.equal(noSurface.skipped_out_of_scope.length, 0);
  });
});

test('scope global and unscoped rules ignore surface; scope survives disk round-trip and (scope:) markdown annotation', async () => {
  await withTasteHome(async (home) => {
    const globalScoped = Object.assign({}, baseRules()[0], { scope: 'global' });
    taste.createTasteProfile({ name: 'globals', rules: [globalScoped, baseRules()[1]] });
    const r = taste.auditTaste({
      profile: 'globals',
      html: '<style>.x{background:linear-gradient(red, blue)}</style>',
      surface: 'anything-else'
    });
    assert.equal(r.verdict, 'BLOCK');
    assert.equal(r.skipped_out_of_scope.length, 0);

    taste.createTasteProfile({
      name: 'roundtrip',
      rules: [Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' })]
    });
    const onDisk = JSON.parse(await readFile(path.join(home, 'roundtrip.json'), 'utf8'));
    assert.equal(onDisk.rules[0].scope, 'portfolio-monochrome');
    const reloaded = taste.getTasteProfile('roundtrip');
    assert.equal(reloaded.rules[0].scope, 'portfolio-monochrome');

    const md = '## Color\n- Do NOT use gradients. (block) (scope:portfolio)\n- Avoid bare hex.';
    const profile = taste.createTasteProfile({ name: 'mdscope', markdown: md });
    const scoped = profile.rules.find((rule) => rule.negative_prompt.includes('gradients'));
    assert.equal(scoped.scope, 'portfolio');
    assert.equal(scoped.clause_text.includes('(scope:'), false);
    const unscoped = profile.rules.find((rule) => rule.clause_text.includes('bare hex'));
    assert.equal(unscoped.scope, '');
  });
});

test('short scope tokens ("ui") match by exact raw word — never substring — instead of being unmatchable', async () => {
  await withTasteHome(async () => {
    const shortScoped = Object.assign({}, baseRules()[0], { rule_id: 'GRADIENT-UI', scope: 'ui' });
    taste.createTasteProfile({ name: 'shortscope', rules: [shortScoped] });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';

    const onUi = taste.auditTaste({ profile: 'shortscope', html, surface: 'ui' });
    assert.equal(onUi.verdict, 'BLOCK');
    assert.equal(onUi.skipped_out_of_scope.length, 0);

    const onAppUi = taste.auditTaste({ profile: 'shortscope', html, surface: 'app-ui' });
    assert.equal(onAppUi.verdict, 'BLOCK');
    assert.equal(onAppUi.skipped_out_of_scope.length, 0);

    // substring containment must NOT match: "ui" ⊄ words of "guidelines"/"build-system"
    for (const surface of ['guidelines', 'build-system', 'docs']) {
      const r = taste.auditTaste({ profile: 'shortscope', html, surface });
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
  await withTasteHome(async () => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    const voice = Object.assign({}, baseRules()[1], { category: 'voice' });
    taste.createTasteProfile({ name: 'cal', rules: [scoped, voice, baseRules()[2]] });

    const interview = taste.getTasteInterview('cal', 'raven-mcp');
    assert.equal(interview.tool, 'get_taste_interview');
    assert.equal(interview.project, 'raven-mcp');
    assert.equal(interview.existing_binding, null);
    assert.deepEqual(interview.scopes.map((s) => s.scope), ['portfolio-monochrome']);
    assert.deepEqual(interview.scopes[0].rules.map((r) => r.rule_id), ['GRADIENT-BLOCK']);
    assert.deepEqual(interview.voice_rules.map((r) => r.rule_id), ['BANNED-WARN']);
    assert.deepEqual(interview.rule_ids, ['GRADIENT-BLOCK', 'BANNED-WARN', 'HUE-NIT']);
    const ids = interview.questions.map((q) => q.id);
    assert.deepEqual(ids, [
      'identity', 'references', 'scope:portfolio-monochrome',
      'design:typography', 'design:spacing', 'design:color', 'design:layout', 'design:motion', 'design:imagery',
      'design:entrance', 'design:loading', 'design:navigation', 'design:aesthetic', 'design:libraries',
      'voice', 'exceptions', 'matchers', 'special',
    ]);
    assert.ok(interview.questions[2].question.includes('GRADIENT-BLOCK'));
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
    taste.createTasteProfile({ name: 'plain', rules: [baseRules()[2]] });
    const bare = taste.getTasteInterview('plain');
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
    taste.bindTasteSurface('cal', { project: 'raven-mcp', surface: 'product-site' });
    const again = taste.getTasteInterview('cal', 'raven-mcp');
    assert.equal(again.existing_binding.surface, 'product-site');
  });
});

test('the five new design dimensions carry non-empty multiple-choice options', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'dims', rules: baseRules() });
    const interview = taste.getTasteInterview('dims', 'some-project');
    for (const key of ['entrance', 'loading', 'navigation', 'aesthetic', 'libraries']) {
      const q = interview.questions.find((question) => question.id === 'design:' + key);
      assert.ok(q, 'missing design:' + key);
      assert.ok(Array.isArray(q.options), key + ' options must be an array');
      assert.ok(q.options.length > 0, key + ' options must be non-empty');
      assert.ok(q.options.every((opt) => typeof opt === 'string' && opt.length > 0));
    }
    // Pre-existing six dimensions carry no options.
    for (const key of ['typography', 'spacing', 'color', 'layout', 'motion', 'imagery']) {
      const q = interview.questions.find((question) => question.id === 'design:' + key);
      assert.equal(q.options, undefined);
    }
  });
});

test('libraries question suggests Next.js as the default build target, and the kickoff contract carries it', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'nextdef', rules: baseRules() });
    const interview = taste.getTasteInterview('nextdef', 'some-project');
    const libQ = interview.questions.find((q) => q.id === 'design:libraries');
    assert.ok(/Next\.js/.test(libQ.question), 'libraries question must name the Next.js default');
    assert.ok(/Next\.js/.test(interview.then), 'kickoff then must carry the Next.js default suggestion');
  });
});

test('voice question always carries exactly 3 distinct-register examples', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'voiceex', rules: baseRules() });
    const interview = taste.getTasteInterview('voiceex', 'some-project');
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
  await withTasteHome(async () => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    taste.createTasteProfile({ name: 'flags', rules: [scoped, baseRules()[1], baseRules()[2]] });
    const interview = taste.getTasteInterview('flags', 'some-project');
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
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'norefine', rules: baseRules() });
    assert.throws(
      () => taste.getTasteInterview('norefine', 'unbound-project', 'refine'),
      /kickoff/
    );
  });
});

test('mode:"refine" builds a re-interview from the stored binding: complaint first, revise:<key> quoting the stored note, and revise:voice', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'refineme', rules: baseRules() });
    taste.bindTasteSurface('refineme', {
      project: 'some-project',
      surface: 'product-site',
      voice_note: 'Plainer than the portfolio register.',
      design_notes: { color: 'dark ground, cyan accent' },
    });

    const refine = taste.getTasteInterview('refineme', 'some-project', 'refine');
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
  await withTasteHome(async (home) => {
    taste.createTasteProfile({ name: 'bindings', rules: baseRules() });

    assert.throws(() => taste.bindTasteSurface('bindings', { project: 'x', surface: '' }), /surface is required/);
    assert.throws(() => taste.bindTasteSurface('bindings', { project: '/etc', surface: 's' }), /project must match/);
    assert.throws(
      () => taste.bindTasteSurface('bindings', { project: 'x', surface: 's', overrides: [{ rule_id: 'NOPE', severity: 'off' }] }),
      /does not exist in profile.rules/
    );
    assert.throws(
      () => taste.bindTasteSurface('bindings', { project: 'x', surface: 's', overrides: [{ rule_id: 'HUE-NIT', severity: 'loud' }] }),
      /severity must be block, warn, nit, or off/
    );

    assert.throws(
      () => taste.bindTasteSurface('bindings', { project: 'x', surface: 's', design_notes: { typography: '' } }),
      /design_notes.typography must be a non-empty string/
    );
    assert.throws(
      () => taste.bindTasteSurface('bindings', { project: 'x', surface: 's', design_notes: { 'not a key!': 'x' } }),
      /keys must be short dimension names/
    );
    assert.throws(
      () => taste.bindTasteSurface('bindings', { project: 'x', surface: 's', design_notes: { Typography: 'A', typography: 'B' } }),
      /two keys that normalize to the same dimension: typography/
    );

    const bound = taste.bindTasteSurface('bindings', {
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
    assert.deepEqual(taste.listSurfaceBindings('bindings')[0].design_notes, bound.design_notes);

    const onDisk = JSON.parse(await readFile(path.join(home, 'bindings.surfaces.json'), 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.bindings.length, 1);

    // Pre-design_notes bindings on disk (field absent) stay valid -> {}.
    const legacy = JSON.parse(await readFile(path.join(home, 'bindings.surfaces.json'), 'utf8'));
    delete legacy.bindings[0].design_notes;
    await writeFile(path.join(home, 'bindings.surfaces.json'), JSON.stringify(legacy), 'utf8');
    assert.deepEqual(taste.listSurfaceBindings('bindings')[0].design_notes, {});

    // Upsert: same project replaces, different project adds.
    taste.bindTasteSurface('bindings', { project: 'raven-mcp', surface: 'developer docs' });
    taste.bindTasteSurface('bindings', { project: 'portfolio', surface: 'monochrome portfolio' });
    const all = taste.listSurfaceBindings('bindings');
    assert.deepEqual(all.map((b) => [b.project, b.surface]), [
      ['portfolio', 'monochrome portfolio'],
      ['raven-mcp', 'developer docs']
    ]);
  });
});

test('resolveSurfaceBinding: explicit project beats url host; hosts match subdomains; unknown resolves null', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'res', rules: baseRules() });
    assert.equal(taste.resolveSurfaceBinding('res', { project: 'anything' }), null);

    taste.bindTasteSurface('res', { project: 'raven-mcp', surface: 'product-site', hosts: ['ravenmcp.ai'] });
    taste.bindTasteSurface('res', { project: 'portfolio', surface: 'monochrome portfolio', hosts: ['andrew.design'] });

    assert.equal(taste.resolveSurfaceBinding('res', { project: 'Portfolio' }).project, 'portfolio');
    assert.equal(taste.resolveSurfaceBinding('res', { url: 'https://ravenmcp.ai/changelog' }).project, 'raven-mcp');
    assert.equal(taste.resolveSurfaceBinding('res', { url: 'https://www.ravenmcp.ai/' }).project, 'raven-mcp');
    // Explicit project wins even when the url points at another binding's host.
    assert.equal(taste.resolveSurfaceBinding('res', { project: 'portfolio', url: 'https://ravenmcp.ai/' }).project, 'portfolio');
    // Suffix matching is domain-boundary safe: notravenmcp.ai is a different host.
    assert.equal(taste.resolveSurfaceBinding('res', { url: 'https://notravenmcp.ai/' }), null);
    assert.equal(taste.resolveSurfaceBinding('res', { url: 'not a url' }), null);
    assert.equal(taste.resolveSurfaceBinding('res', {}), null);
  });
});

test('a resolved binding supplies the surface, applies overrides at full trust, and echoes the voice note', async () => {
  await withTasteHome(async () => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    taste.createTasteProfile({ name: 'proj', rules: [scoped, baseRules()[1]] });
    taste.bindTasteSurface('proj', {
      project: 'raven-mcp',
      surface: 'product-site',
      overrides: [{ rule_id: 'BANNED-WARN', severity: 'nit' }],
      voice_note: 'Product register: plain benefits OK, still no hype verbs.',
      design_notes: { typography: 'Grotesque, restrained scale.' }
    });
    taste.bindTasteSurface('proj', { project: 'portfolio', surface: 'monochrome portfolio' });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style><p>We have proven results.</p>';

    // On raven-mcp: monochrome rule skipped, voice rule re-tuned to nit, note echoed.
    const onRaven = taste.auditTaste({ profile: 'proj', html, project: 'raven-mcp' });
    assert.equal(onRaven.binding, 'raven-mcp');
    assert.equal(onRaven.surface_applied, 'product-site');
    assert.deepEqual(onRaven.skipped_out_of_scope, [{ rule_id: 'GRADIENT-BLOCK', scope: 'portfolio-monochrome' }]);
    assert.equal(onRaven.findings.find((f) => f.rule_id === 'BANNED-WARN').severity, 'nit');
    assert.equal(onRaven.voice_note, 'Product register: plain benefits OK, still no hype verbs.');
    assert.deepEqual(onRaven.design_notes, { typography: 'Grotesque, restrained scale.' });
    assert.equal(onRaven.calibration_hint, undefined);
    assert.equal(onRaven.verdict, 'PASS');

    // No design_notes on the portfolio binding -> field absent, not {}.
    assert.equal(taste.auditTaste({ profile: 'proj', html, project: 'portfolio' }).design_notes, undefined);

    // On the portfolio: scoped rule runs at FULL block (binding surface counts as provided).
    const onPortfolio = taste.auditTaste({ profile: 'proj', html, project: 'portfolio' });
    assert.equal(onPortfolio.binding, 'portfolio');
    assert.equal(onPortfolio.findings.find((f) => f.rule_id === 'GRADIENT-BLOCK').severity, 'block');
    assert.equal(onPortfolio.verdict, 'BLOCK');

    // Explicit surface beats the binding's surface; overrides still apply.
    const explicit = taste.auditTaste({ profile: 'proj', html, project: 'raven-mcp', surface: 'portfolio' });
    assert.equal(explicit.surface_applied, 'portfolio');
    assert.equal(explicit.findings.find((f) => f.rule_id === 'GRADIENT-BLOCK').severity, 'block');
    assert.equal(explicit.findings.find((f) => f.rule_id === 'BANNED-WARN').severity, 'nit');
  });
});

test('an off override silences a rule on that surface and is reported under disabled_by_binding', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'silence', rules: baseRules() });
    taste.bindTasteSurface('silence', {
      project: 'raven-mcp',
      surface: 'product-site',
      overrides: [{ rule_id: 'GRADIENT-BLOCK', severity: 'off' }]
    });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';
    const r = taste.auditTaste({ profile: 'silence', html, project: 'raven-mcp' });
    assert.deepEqual(r.disabled_by_binding, [{ rule_id: 'GRADIENT-BLOCK', severity: 'off' }]);
    assert.equal(r.findings.filter((f) => f.rule_id === 'GRADIENT-BLOCK').length, 0);
    assert.equal(r.verdict, 'PASS');
  });
});

test('calibration_hint appears only when scoped rules exist and neither surface nor binding was given', async () => {
  await withTasteHome(async () => {
    const scoped = Object.assign({}, baseRules()[0], { scope: 'portfolio-monochrome' });
    taste.createTasteProfile({ name: 'hint', rules: [scoped] });
    const html = '<style>.x{background:linear-gradient(red, blue)}</style>';

    const bare = taste.auditTaste({ profile: 'hint', html });
    assert.ok(bare.calibration_hint.includes('get_taste_interview'));
    assert.equal(bare.binding, '');
    assert.equal(bare.findings[0].severity, 'warn');

    const withSurface = taste.auditTaste({ profile: 'hint', html, surface: 'portfolio' });
    assert.equal(withSurface.calibration_hint, undefined);

    taste.createTasteProfile({ name: 'nohint', rules: [baseRules()[0]] });
    const unscopedProfile = taste.auditTaste({ profile: 'nohint', html });
    assert.equal(unscopedProfile.calibration_hint, undefined);
  });
});

test('host binding hardening: single-label hosts rejected, userinfo/ports stripped, corrupt stored files refuse to load', async () => {
  await withTasteHome(async (home) => {
    taste.createTasteProfile({ name: 'hard', rules: baseRules() });

    // A bare TLD would suffix-match every site under it.
    assert.throws(() => taste.bindTasteSurface('hard', { project: 'x', surface: 's', hosts: ['ai'] }), /single label/);
    assert.throws(() => taste.bindTasteSurface('hard', { project: 'x', surface: 's', hosts: ['   '] }), /empty/);

    const bound = taste.bindTasteSurface('hard', {
      project: 'x', surface: 's',
      hosts: ['user:pass@ravenmcp.ai', 'localhost:3000', '127.0.0.1']
    });
    assert.deepEqual(bound.hosts, ['ravenmcp.ai', 'localhost', '127.0.0.1']);

    // Stored files are validated as strictly as bind-time input.
    const { writeFileSync } = await import('node:fs');
    const file = path.join(home, 'hard.surfaces.json');
    const good = JSON.parse(await readFile(file, 'utf8'));

    const badHost = structuredClone(good);
    badHost.bindings[0].hosts = ['AI'];
    writeFileSync(file, JSON.stringify(badHost));
    assert.throws(() => taste.listSurfaceBindings('hard'), /unnormalized|single label/);

    const dupOverride = structuredClone(good);
    dupOverride.bindings[0].overrides = [
      { rule_id: 'HUE-NIT', severity: 'off' },
      { rule_id: 'HUE-NIT', severity: 'warn' }
    ];
    writeFileSync(file, JSON.stringify(dupOverride));
    assert.throws(() => taste.listSurfaceBindings('hard'), /duplicate rule_id/);

    const badProject = structuredClone(good);
    badProject.bindings[0].project = '../escape';
    writeFileSync(file, JSON.stringify(badProject));
    assert.throws(() => taste.listSurfaceBindings('hard'), /project must match/);

    // Unknown override rule_ids stay loadable by design: bindings outlive rule renames.
    const staleRule = structuredClone(good);
    staleRule.bindings[0].overrides = [{ rule_id: 'REMOVED-RULE', severity: 'off' }];
    writeFileSync(file, JSON.stringify(staleRule));
    assert.equal(taste.listSurfaceBindings('hard')[0].overrides[0].rule_id, 'REMOVED-RULE');
  });
});

test('the interview closes with an open-ended special question that learns suggestions from other bindings', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'sig', rules: baseRules() });

    // First surface: no other bindings yet -> open-ended, no suggestions.
    const first = taste.getTasteInterview('sig', 'portfolio');
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
    taste.bindTasteSurface('sig', {
      project: 'portfolio', surface: 'monochrome portfolio',
      design_notes: { special: 'faint grid lines texture behind hero' },
    });
    const second = taste.getTasteInterview('sig', 'raven-mcp');
    const secondSpecial = second.questions[second.questions.length - 1];
    assert.deepEqual(secondSpecial.suggestions, ['faint grid lines texture behind hero']);
    assert.ok(secondSpecial.question.includes('faint grid lines texture behind hero'));

    // Quotes and newlines in a stored note are neutralized in the question text.
    taste.bindTasteSurface('sig', {
      project: 'quoted', surface: 'app-ui',
      design_notes: { special: "it's a\ndotted 'grain' texture" },
    });
    const third = taste.getTasteInterview('sig', 'raven-mcp');
    const thirdSpecial = third.questions[third.questions.length - 1];
    assert.ok(!/it's/.test(thirdSpecial.question), 'raw single quotes must not reach the question text');
    assert.ok(!thirdSpecial.question.includes('\n'), 'newlines must be collapsed in the question text');
    assert.ok(thirdSpecial.suggestions.length === 2, 'raw suggestion values still carried in the suggestions field');

    // Same project is excluded from its own suggestions (only the other binding's note remains).
    const samePrj = taste.getTasteInterview('sig', 'portfolio');
    const sameSpecial = samePrj.questions[samePrj.questions.length - 1];
    assert.deepEqual(sameSpecial.suggestions, ["it's a\ndotted 'grain' texture"]);

    // Refine mode revisits the stored special note like any other dimension.
    const refine = taste.getTasteInterview('sig', 'portfolio', 'refine');
    const revise = refine.questions.find((q) => q.id === 'revise:special');
    assert.ok(revise);
    assert.ok(revise.question.includes('faint grid lines texture behind hero'));
  });
});

test('the references question invites examples right after identity and the then-contract folds them into notes', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'refs', rules: baseRules() });
    const interview = taste.getTasteInterview('refs', 'demo');
    assert.equal(interview.questions[1].id, 'references');
    assert.equal(interview.questions[1].skippable, true);
    assert.equal(interview.questions[1].priority, 'core');
    assert.ok(/examples/i.test(interview.questions[1].question));
    assert.ok(/what specifically draws you/i.test(interview.questions[1].question));
    assert.ok(interview.then.includes('design_notes.references'));
  });
});

test('record_taste_decision: records, lists, filters, and validates', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'decider', rules: baseRules() });
    const rec = taste.recordTasteDecision('decider', {
      project: 'proj-a', dimension: 'Color ', decision: 'amber-phosphor accent, period-accurate',
      rejected: ['electric blue'], why: 'matches CRT heritage', source: 'user-corrected',
    });
    assert.equal(rec.dimension, 'color', 'dimension normalizes to lowercase/trimmed');
    assert.equal(rec.source, 'user-corrected');
    taste.recordTasteDecision('decider', { project: 'proj-b', dimension: 'color', decision: 'warm off-white ground' });
    const all = taste.listTasteDecisions('decider');
    assert.equal(all.length, 2);
    assert.equal(taste.listTasteDecisions('decider', { project: 'proj-a' }).length, 1);
    assert.equal(taste.listTasteDecisions('decider', { dimension: 'color' }).length, 2);
    assert.equal(all[1].source, 'user-directed', 'source defaults to user-directed');
    assert.throws(() => taste.recordTasteDecision('decider', { project: 'proj-a', dimension: 'Bad Key!', decision: 'x' }), /dimension/);
    assert.throws(() => taste.recordTasteDecision('decider', { project: 'proj-a', dimension: 'color', decision: '  ' }), /decision/);
    assert.throws(() => taste.recordTasteDecision('decider', { project: 'proj-a', dimension: 'color', decision: 'x', source: 'guessed' }), /source/);
  });
});

test('kickoff interview learns from decisions on OTHER projects — suggestions on standard dimensions', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'learner', rules: baseRules() });
    taste.recordTasteDecision('learner', { project: 'proj-a', dimension: 'navigation', decision: 'hamburger at every breakpoint' });
    const interview = taste.getTasteInterview('learner', 'proj-new');
    const navQ = interview.questions.find((q) => q.id === 'design:navigation');
    assert.deepEqual(navQ.suggestions, ['hamburger at every breakpoint']);
    assert.ok(/On past projects you decided/.test(navQ.question), 'question text carries the learned decision');
    const sameProject = taste.getTasteInterview('learner', 'proj-a');
    const sameNavQ = sameProject.questions.find((q) => q.id === 'design:navigation');
    assert.equal(sameNavQ.suggestions, undefined, 'decisions from the SAME project are excluded');
    assert.ok(/record_taste_decision/.test(interview.then), 'kickoff then tells the client to keep recording decisions');
  });
});

test('kickoff interview grows NEW questions from decision categories no standard dimension covers', async () => {
  await withTasteHome(async () => {
    taste.createTasteProfile({ name: 'grower', rules: baseRules() });
    taste.recordTasteDecision('grower', { project: 'proj-a', dimension: 'iconography', decision: 'stroke icons only, 1.5px, no fills' });
    taste.recordTasteDecision('grower', { project: 'proj-a', dimension: 'iconography', decision: 'stroke icons only, 1.5px, no fills' });
    taste.recordTasteDecision('grower', { project: 'proj-b', dimension: 'iconography', decision: 'geometric, currentColor' });
    const interview = taste.getTasteInterview('grower', 'proj-new');
    const iconQ = interview.questions.find((q) => q.id === 'design:iconography');
    assert.ok(iconQ, 'a learned iconography question is spawned');
    assert.equal(iconQ.skippable, true);
    assert.deepEqual(iconQ.suggestions.slice().sort(), ['geometric, currentColor', 'stroke icons only, 1.5px, no fills'], 'distinct decisions become suggestions');
    assert.ok(/design_notes\.iconography/.test(iconQ.question));
    const beforeVoice = interview.questions.findIndex((q) => q.id === 'voice');
    assert.ok(interview.questions.findIndex((q) => q.id === 'design:iconography') < beforeVoice, 'learned questions sit with the design dimensions, before voice');
  });
});
