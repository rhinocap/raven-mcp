import { test } from 'node:test';
import assert from 'node:assert/strict';

const { mapReferenceToTokens } = await import('../dist/reference-tokens.js');

function token(path, value, kind = 'scalar', ref) {
  const parts = path.split('.');
  return { path, group: parts[0], name: parts.slice(1).join('.'), value, kind, cssVar: '--' + parts.join('-'), ...(ref ? { ref } : {}) };
}

const fixture = [
  token('type.xs', '12px'), token('type.sm', '14px'), token('type.body', '18px'),
  token('type.lead', '22px'), token('type.h3', '28px'), token('type.h2', '36px'),
  token('space.1', '4px'), token('space.2', '8px'), token('space.3', '13px'), token('space.4', '24px'),
  token('color.ink', '#112233'), token('color.brand', '#336699'), token('color.paper', '#ffffff'),
  token('font.sans', '"Inter", Arial, sans-serif'), token('font.editorial', 'Georgia, "Times New Roman", serif'),
  token('color.action', { $ref: 'color.brand' }, 'ref', 'color.brand'),
];

test('exact hits bind all four kinds with zero delta', () => {
  const result = mapReferenceToTokens({ color: 'rgb(17, 34, 51)', 'font-size': '18px', 'font-weight': '500', 'font-family': 'Inter, sans-serif' }, fixture.concat(token('weight.medium', 500)));
  assert.deepEqual(result.bindings.map((binding) => [binding.property, binding.verdict, binding.delta]), [
    ['color', 'exact', 0], ['font-size', 'exact', 0], ['font-weight', 'exact', 0], ['font-family', 'exact', 0],
  ]);
});

test('near misses report the numeric delta for every kind', () => {
  const tokens = fixture.concat(token('weight.variable', 505));
  const result = mapReferenceToTokens({ color: 'rgb(20, 38, 51)', 'font-size': '17px', 'font-weight': '500', 'font-family': 'Times New Roman' }, tokens);
  const byProperty = Object.fromEntries(result.bindings.map((binding) => [binding.property, binding]));
  assert.equal(byProperty.color.verdict, 'near');
  assert.equal(byProperty.color.delta, 5);
  assert.equal(byProperty['font-size'].verdict, 'near');
  assert.equal(byProperty['font-size'].delta, 1);
  assert.equal(byProperty['font-weight'].verdict, 'near');
  assert.equal(byProperty['font-weight'].delta, 0.01);
  assert.equal(byProperty['font-family'].verdict, 'near');
  assert.equal(byProperty['font-family'].delta, 1);
});

test('values beyond thresholds become gaps, never none bindings', () => {
  const result = mapReferenceToTokens({ color: 'rgb(200, 0, 200)', 'font-size': '80px', opacity: '0.5', 'font-family': 'Papyrus' }, fixture.concat(token('opacity.full', 1)));
  assert.equal(result.bindings.length, 0);
  assert.deepEqual(result.gaps.map((gap) => gap.property), ['color', 'font-size', 'opacity', 'font-family']);
});

test('rem uses root 16 while percent and viewport lengths explain their gaps', () => {
  const result = mapReferenceToTokens({ 'font-size': '1.125rem', width: '50%', height: '10vw' }, fixture);
  assert.equal(result.bindings.find((binding) => binding.property === 'font-size').token, 'type.body');
  assert.match(result.gaps.find((gap) => gap.property === 'width').why, /Percent/);
  assert.match(result.gaps.find((gap) => gap.property === 'height').why, /Viewport/);
});

test('references resolve while dangling references and cycles become named gaps', () => {
  const resolved = mapReferenceToTokens({ color: '#336699' }, [
    token('color.brand', '#336699'),
    token('c.a', { $ref: 'color.brand' }, 'ref', 'color.brand'),
  ]);
  const binding = resolved.bindings.find((candidate) => candidate.token === 'c.a');
  assert.equal(binding.token_value, '#336699');

  const dangling = mapReferenceToTokens({ color: '#336699' }, [token('color.broken', { $ref: 'color.missing' }, 'ref', 'color.missing')]);
  assert.match(dangling.gaps[0].why, /color\.broken -> color\.missing/);

  const cyclic = mapReferenceToTokens({ color: '#336699' }, [
    token('color.a', { $ref: 'color.b' }, 'ref', 'color.b'),
    token('color.b', { $ref: 'color.a' }, 'ref', 'color.a'),
  ]);
  assert.equal(cyclic.bindings.length, 0);
  assert.match(cyclic.gaps[0].why, /cycle.*color\.[ab].*color\.[ab]/i);
});

test('empty token sets make every property an explicit absent-token gap', () => {
  const result = mapReferenceToTokens({ color: '#fff', display: 'grid' }, []);
  assert.equal(result.coverage.ratio, 0);
  assert.equal(result.gaps.length, 2);
  assert.ok(result.gaps.every((gap) => /no tokens/i.test(gap.why)));
});

test('equal-distance ties use shortest then lexicographic path regardless of input order', () => {
  const longer = token('spacing.long-name', '15px');
  const winner = token('space.a', '15px');
  const lexicalLoser = token('space.b', '15px');
  const ordered = [longer, lexicalLoser, winner];
  for (const tokens of [ordered, ordered.slice().reverse()]) {
    assert.equal(mapReferenceToTokens({ gap: '16px' }, tokens).bindings[0].token, 'space.a');
  }
});

test('no-match properties are gaps excluded from the coverage denominator', () => {
  const result = mapReferenceToTokens({ color: '#112233', 'font-size': '18px', 'box-shadow': '0 1px 4px #000' }, fixture);
  assert.equal(result.coverage.total, 2);
  assert.equal(result.coverage.bound, 2);
  assert.equal(result.coverage.ratio, 2 / 2);
  assert.match(result.gaps.find((gap) => gap.property === 'box-shadow').why, /not a deterministically matchable property class/);
});

test('the same RGB at a different alpha is a named gap, not a binding', () => {
  // Ranking on RGB alone made an opaque token an exact, distance-0 winner for a
  // 50%-transparent capture, and the agent then wrote the opaque colour. Alpha
  // now counts toward the distance, so this reports the near-miss instead.
  const result = mapReferenceToTokens({ color: 'rgba(51, 102, 153, 0.5)' }, fixture);
  assert.equal(result.bindings.length, 0);
  const gap = result.gaps.find((entry) => entry.property === 'color');
  assert.match(gap.why, /differs in alpha/);
});

test('alpha is ranked, so the candidate with the right opacity wins', () => {
  // Both are black. Ranking on RGB alone made the opaque token an exact match at
  // delta 0 while its alpha was off by 0.9; the token one RGB unit away had
  // essentially the right alpha and lost.
  const tokens = [token('color.wrong-alpha', 'rgba(0, 0, 0, 1)'), token('color.right-alpha', '#0100001a')];
  for (const order of [tokens, tokens.slice().reverse()]) {
    const result = mapReferenceToTokens({ color: 'rgba(0, 0, 0, 0.1)' }, order);
    assert.equal(result.bindings[0].token, 'color.right-alpha');
  }
});

test('an equally-exact match prefers the token whose path matches the property family', () => {
  // Both are exactly 64px. Path-length tie-break alone picks type.size.hero and
  // an agent then writes line-height: var(--type-size-hero) — exact, deterministic,
  // and the wrong token. Measured on a real github.com capture.
  const both = [token('type.size.hero', '64px'), token('type.leading.hero', '64px')];
  for (const tokens of [both, both.slice().reverse()]) {
    assert.equal(mapReferenceToTokens({ 'line-height': '64px' }, tokens).bindings[0].token, 'type.leading.hero');
    assert.equal(mapReferenceToTokens({ 'font-size': '64px' }, tokens).bindings[0].token, 'type.size.hero');
  }
});

test('a nearer token in the wrong family loses to a farther one in the right family', () => {
  // type.size.tiny is exact; space.gap.md is 1px off but is a spacing token.
  // Distance alone made padding-top bind to the type ramp and the agent wrote
  // padding-top: var(--type-size-tiny). A property with a family binds inside it.
  const tokens = [token('type.size.tiny', '10px'), token('space.gap.md', '11px')];
  const result = mapReferenceToTokens({ 'padding-top': '10px' }, tokens);
  assert.equal(result.bindings[0].token, 'space.gap.md');
  assert.equal(result.bindings[0].verdict, 'near');
});

test('an exact match in the wrong family is reported as a gap that names it', () => {
  // The case Sol found: font-size 16px against a 16px spacing token and a 17px
  // type token would bind var(--space-4). With no compatible token at all, the
  // near-miss has to be stated rather than taken.
  const result = mapReferenceToTokens({ 'font-size': '16px' }, [token('space.4', '16px')]);
  assert.equal(result.bindings.length, 0);
  const gap = result.gaps.find((entry) => entry.property === 'font-size');
  assert.match(gap.why, /space\.4/);
  assert.match(gap.why, /different family/);
});

test('a property with a family still prefers the closer token inside that family', () => {
  const tokens = [token('space.gap.sm', '8px'), token('space.gap.md', '16px')];
  const result = mapReferenceToTokens({ 'padding-top': '16px' }, tokens);
  assert.equal(result.bindings[0].token, 'space.gap.md');
  assert.equal(result.bindings[0].verdict, 'exact');
});

test('a property with no affinity family still tie-breaks deterministically', () => {
  const tokens = [token('a.bbbbbbbb', '#112233'), token('b.c', '#112233')];
  for (const order of [tokens, tokens.slice().reverse()]) {
    assert.equal(mapReferenceToTokens({ color: '#112233' }, order).bindings[0].token, 'b.c');
  }
});

test('named and hsl token values resolve instead of reading as unmatchable', () => {
  // The contrast parser covers hex and comma-form rgb only. A DESIGN.md that
  // says `red` or `hsl(0 100% 50%)` is ordinary, and reporting "no token within
  // the threshold" against an exact match is the worst kind of false gap.
  for (const value of ['red', 'hsl(0, 100%, 50%)', 'hsl(0 100% 50%)', 'rgb(255 0 0)']) {
    const result = mapReferenceToTokens({ color: 'rgb(255, 0, 0)' }, [token('color.brand', value)]);
    assert.equal(result.bindings[0]?.token, 'color.brand', value);
    assert.equal(result.bindings[0].verdict, 'exact', value);
  }
});

test('a colour syntax Raven cannot parse says so instead of blaming the palette', () => {
  const result = mapReferenceToTokens({ color: 'oklch(0.7 0.1 200)' }, [token('color.brand', '#ff0000')]);
  assert.match(result.gaps[0].why, /oklch/);
});

test('a broken token chain is reported even when another token matches', () => {
  // Collecting broken refs only inside the no-winner branch meant one valid
  // winner elsewhere silently swallowed a real design-system defect.
  const tokens = [token('color.good', '#ffffff'), token('color.broken', { $ref: 'color.missing' }, 'ref', 'color.missing')];
  const result = mapReferenceToTokens({ color: '#ffffff' }, tokens);
  assert.equal(result.bindings[0].token, 'color.good');
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0], /color\.broken/);
});

// Sol round 2, defect #5 — the family filter regressed the thing it protects.
// It matched a family name as a substring of the whole dotted path, which is
// wrong in both directions and neither direction announces itself: a correct
// token silently becomes a gap, and a wrong token silently becomes an exact
// binding. Each of these is a real naming convention, not a contrived path.
test('a radius scale named radii binds, instead of reading as another family', () => {
  // `radii` is what Chakra, Tamagui and styled-system all ship, and /radius/
  // never matched it — so the most common radius naming in the ecosystem
  // reported every border-radius as a gap.
  const result = mapReferenceToTokens({ 'border-radius': '4px' }, [token('radii.sm', '4px')]);
  assert.equal(result.gaps.length, 0);
  assert.equal(result.bindings[0].token, 'radii.sm');
  assert.equal(result.bindings[0].verdict, 'exact');
});

test('a type scale under typography binds font-size', () => {
  const result = mapReferenceToTokens({ 'font-size': '16px' }, [token('typography.body.md', '16px')]);
  assert.equal(result.gaps.length, 0);
  assert.equal(result.bindings[0].token, 'typography.body.md');
});

test('a letter-spacing token never binds padding, however the path reads', () => {
  // `type.letter-spacing.none` contains the substring "spacing", so padding-top
  // took it as an exact match — a tracking token written as a padding value.
  // This is precisely the wrong-ramp binding the family filter exists to stop,
  // produced by the filter itself.
  const result = mapReferenceToTokens({ 'padding-top': '0px' }, [token('type.letter-spacing.none', '0px')]);
  assert.equal(result.bindings.length, 0);
  const gap = result.gaps.find((entry) => entry.property === 'padding-top');
  assert.match(gap.why, /letter-spacing/);
  assert.match(gap.why, /different family/);
});

test('an unconventional path still binds when it names no family at all', () => {
  // The segment vocabulary must not turn into a wall of gaps for projects that
  // do not use it. A path declaring no family falls back to the loose read.
  const result = mapReferenceToTokens({ 'border-radius': '4px' }, [token('brand.cornerRadius', '4px')]);
  assert.equal(result.bindings[0].token, 'brand.cornerRadius');
});

test('font-size prefers the size path over the leading path when both are in family', () => {
  const tokens = [token('type.leading.hero', '64px'), token('type.size.hero', '64px')];
  assert.equal(mapReferenceToTokens({ 'font-size': '64px' }, tokens).bindings[0].token, 'type.size.hero');
  assert.equal(mapReferenceToTokens({ 'line-height': '64px' }, tokens).bindings[0].token, 'type.leading.hero');
});

// Sol round 2, defect #8.
test('two fully transparent colours are the same colour', () => {
  // Nothing is nothing: rgba(255,0,0,0) and rgba(0,0,0,0) paint identically, and
  // an unmultiplied metric put them 255 apart and reported a gap for a token
  // that is exact on screen.
  const result = mapReferenceToTokens({ color: 'rgba(255, 0, 0, 0)' }, [token('color.transparent', 'rgba(0, 0, 0, 0)')]);
  assert.equal(result.bindings[0].verdict, 'exact');
  assert.equal(result.bindings[0].delta, 0);
});

test('a translucent capture still refuses an opaque token of the same hue', () => {
  // The case premultiplying must not undo: alpha still has to separate these.
  const result = mapReferenceToTokens({ color: 'rgba(0, 0, 0, 0.1)' }, [token('color.ink', '#000000')]);
  assert.equal(result.bindings.length, 0);
});

// Sol round 2, defect #9.
test('out-of-range channels are clamped the way the browser paints them', () => {
  // CSS clamps rather than discarding, so rgb(300 0 0) IS red. Returning 300
  // made it a colour no token could be near.
  const result = mapReferenceToTokens({ color: 'rgb(300 0 0)' }, [token('color.red', '#ff0000')]);
  assert.equal(result.bindings[0].verdict, 'exact');
});

test('hue accepts every CSS angle unit, not only degrees', () => {
  // hsl(.5turn 100% 50%) is valid CSS for cyan and was rejected outright.
  const result = mapReferenceToTokens({ color: 'hsl(.5turn 100% 50%)' }, [token('color.cyan', '#00ffff')]);
  assert.equal(result.bindings[0].verdict, 'exact');
});

// Sol round 3, defect #3. The segment vocabulary knew `letterspacing` but not
// the camel-case plural `letterSpacings` that Chakra actually ships, so the path
// declared no family, fell through to the loose tier, and `padding-top: 0px`
// bound to a tracking token at 0.4px — the same cross-family binding the
// segment table was written to stop, arriving through its own fallback.
test('a camel-case plural token path still names its family', () => {
  const gap = mapReferenceToTokens({ 'padding-top': '0px' }, [token('letterSpacings.wide', '0.025em')]);
  assert.deepEqual(gap.bindings, [], 'padding must not take a letter-spacing token');
  assert.equal(gap.gaps.length, 1);

  const bound = mapReferenceToTokens({ 'letter-spacing': '0.025em' }, [token('letterSpacings.wide', '0.025em')]);
  assert.equal(bound.bindings[0].token, 'letterSpacings.wide', 'and the property it DOES belong to must still bind');
});

test('camel-case plurals bind across the families, not just tracking', () => {
  // fontSizes / lineHeights / radii are the shipped spellings in Chakra,
  // Tamagui and styled-system. Each one was a gap before the normalisation.
  assert.equal(mapReferenceToTokens({ 'font-size': '16px' }, [token('fontSizes.md', '16px')]).bindings[0]?.token, 'fontSizes.md');
  assert.equal(mapReferenceToTokens({ 'line-height': '64px' }, [token('lineHeights.hero', '64px')]).bindings[0]?.token, 'lineHeights.hero');
  assert.equal(mapReferenceToTokens({ 'border-radius': '4px' }, [token('radii.sm', '4px')]).bindings[0]?.token, 'radii.sm');
});

test('a loose-tier path that reads as two families is a gap, not a coin flip', () => {
  // `spacing` reads as both tracking and gap. The loose tier is a guess, and a
  // guess that fits two families is not one worth acting on — the designer can
  // see a gap, but cannot see a wrong token.
  const ambiguous = mapReferenceToTokens({ 'padding-top': '4px' }, [token('theme.spacingTrack', '4px')]);
  assert.deepEqual(ambiguous.bindings, []);

  // The unambiguous loose case must survive it: brand.cornerRadius names no
  // family segment but reads as exactly one.
  const unambiguous = mapReferenceToTokens({ 'border-radius': '8px' }, [token('brand.cornerRadius', '8px')]);
  assert.equal(unambiguous.bindings[0].token, 'brand.cornerRadius');
});
