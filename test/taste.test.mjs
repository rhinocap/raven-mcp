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
