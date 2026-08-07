// Handler-level tests for the three pattern-library tools. The module-level
// tests in reference-store/reference-tokens cover the logic; these cover the
// seam that logic tests cannot see — whether the shapes the tools ACCEPT are the
// shapes the rest of the loop actually produces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.RAVEN_NO_USAGE_LOG = '1';
const indexMod = await import(path.resolve(__dirname, '../dist/index.js'));

async function withClient(fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({ remote: false });
  const client = new Client({ name: 'pattern-library-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const previous = process.env.RAVEN_REFERENCE_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-patternlib-'));
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    return await fn(client, home);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
    await client.close();
    await server.close();
  }
}

const call = async (client, name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);

test('capture_reference accepts the state-style shape get_grabbed_elements actually returns', async () => {
  // Grab returns { hover: { declarations: [{ property, value }] } }. The tool told
  // callers to pass the drained selection straight through while declaring
  // record<record<string>>, so a real selection was rejected — the loop's two
  // halves did not connect at exactly the seam the feature exists to close.
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'h1.hero',
      styles: { 'font-size': '64px' },
      owner: 'third-party',
      tags: ['hero'],
      state_styles: {
        hover: { declarations: [{ property: 'color', value: 'rgb(255, 255, 255)' }, { property: 'opacity', value: '0.9' }] }
      }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'rgb(255, 255, 255)', opacity: '0.9' } });
  });
});

test('capture_reference still accepts a plain per-state style map', async () => {
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'h1.hero',
      styles: { 'font-size': '64px' },
      owner: 'third-party',
      tags: ['hero'],
      state_styles: { hover: { color: 'rgb(255, 255, 255)' } }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'rgb(255, 255, 255)' } });
  });
});

test('the three tools compose into one capture -> search -> map loop', async () => {
  await withClient(async (client, home) => {
    const designPath = path.join(home, 'DESIGN.md');
    await writeFile(designPath, '---\ntype:\n  size:\n    hero: "64px"\n  leading:\n    hero: "64px"\ncolor:\n  text:\n    primary: "#f7f8f8"\n---\n\n# Fixture\n', 'utf8');

    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      app: 'Linear',
      selector: 'h1.hero',
      styles: { 'font-size': '64px', 'line-height': '64px', color: 'rgb(247, 248, 248)' },
      owner: 'third-party',
      tags: ['hero', 'typography'],
      note: 'The hero headline weight is the detail worth keeping.'
    });

    const found = await call(client, 'search_references', { query: 'hero headline' });
    assert.equal(found.total, 1);
    assert.equal(found.results[0].reference.ref_id, saved.ref_id);

    const mapped = await call(client, 'map_reference_to_tokens', { ref_id: saved.ref_id, design_file_path: designPath });
    const bound = Object.fromEntries(mapped.bindings.map((binding) => [binding.property, binding.token]));
    assert.equal(bound['font-size'], 'type.size.hero');
    assert.equal(bound['line-height'], 'type.leading.hero');
    assert.equal(bound.color, 'color.text.primary');
    assert.deepEqual(mapped.diagnostics, []);
  });
});

test('map_reference_to_tokens says which input is missing rather than failing opaquely', async () => {
  await withClient(async (client) => {
    const noSource = await client.callTool({ name: 'map_reference_to_tokens', arguments: { tokens: [] } });
    assert.equal(noSource.isError, true);
    assert.match(noSource.content[0].text, /ref_id or captured/);

    const noVocabulary = await client.callTool({ name: 'map_reference_to_tokens', arguments: { captured: { color: '#fff' } } });
    assert.equal(noVocabulary.isError, true);
    assert.match(noVocabulary.content[0].text, /design_file_path or tokens/);
  });
});

// Sol round 2, round-1 defect #3 re-opened. The previous fix accepted Grab's
// `{declarations:[...]}` VALUE shape but kept the snake_case FIELD name, and the
// tool's own description told the agent to pass the selection's `stateStyles`.
// An MCP schema strips unknown keys before the handler runs, so the documented
// call did not error — it just silently stored a reference with no states at all,
// which is the failure mode you find weeks later in a wrong hover colour.
test('capture_reference accepts stateStyles, the field name get_grabbed_elements returns', async () => {
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing',
      selector: '.cta',
      owner: 'third-party',
      tags: ['cta'],
      styles: { color: 'rgb(255, 255, 255)' },
      stateStyles: { hover: { declarations: [{ property: 'color', value: 'rgb(0, 0, 0)' }] } }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'rgb(0, 0, 0)' } });
  });
});

test('the snake_case field still wins when both are supplied', async () => {
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing',
      selector: '.cta',
      owner: 'third-party',
      tags: ['cta'],
      styles: { color: 'rgb(255, 255, 255)' },
      state_styles: { hover: { color: 'red' } },
      stateStyles: { hover: { color: 'blue' } }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'red' } });
  });
});

// Attribution is a payload SHAPE question, not a string question, which is why
// it is pinned here at the tool seam and not in reference-attribution.test.mjs.
// The corpus holds other people's work; the defensible way to show it is to show
// where it came from, and the only version of that rule an engine can hold is
// structural — the image path lives underneath the credit, so a caller reaching
// for the picture carries the source out with it.
test('every search result carries its credit, with the image path nested underneath it', async () => {
  await withClient(async (client) => {
    await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing',
      app: 'Linear',
      selector: '.PricingCard',
      styles: { 'border-radius': '12px' },
      owner: 'third-party',
      tags: ['pricing'],
      note: 'the pricing card corner treatment'
    });

    const found = await call(client, 'search_references', { query: 'pricing card' });
    assert.equal(found.total, 1);
    const result = found.results[0];

    assert.ok(result.display, 'a result arrived with no display object');
    assert.ok(result.display.credit.includes('https://linear.app/pricing'),
      'the credit does not carry the source URL: ' + result.display.credit);
    assert.equal(result.display.source_url, 'https://linear.app/pricing');
    // Nested, not a sibling. A sibling image_path lets the credit be dropped by
    // omission, which is exactly how it would be dropped.
    assert.ok('image_path' in result.display, 'image_path is not inside display');
    assert.equal(result.image_path, undefined,
      'image_path is also a sibling of display, which defeats the nesting entirely');
    // This capture passed no html, so there is no picture — the field is present
    // and null rather than absent, so a consumer can tell "no image" from
    // "this build does not do images".
    assert.equal(result.display.image_path, null);

    assert.equal(found.notice, result.display.notice);
    assert.ok(found.notice, 'a third-party result produced no ownership notice');
  });
});

test('a search over the user\'s own patterns carries no third-party disclaimer', async () => {
  // Both directions. Dropping the notice and attaching it to everything are
  // equally wrong, and a test that only covered the third-party case passes on
  // the second — a notice attached to everything is a notice nobody reads.
  await withClient(async (client) => {
    await call(client, 'capture_reference', {
      url: 'https://myapp.example/dashboard',
      selector: '.Card',
      styles: { 'border-radius': '8px' },
      owner: 'self',
      tags: ['card'],
      note: 'my own dashboard card'
    });

    const found = await call(client, 'search_references', { query: 'dashboard card' });
    assert.equal(found.total, 1);
    assert.equal(found.notice, undefined, 'the user\'s own pattern was given a third-party disclaimer');
    assert.equal(found.results[0].display.notice, undefined);
    assert.ok(found.results[0].display.credit.includes('myapp.example'),
      'a self-owned pattern still needs its source shown: ' + found.results[0].display.credit);
  });
});

// SHOW vs COPY. Browsing a corpus of other people's design work should not hand
// back their markup as a side effect of looking at it — the picture and the
// computed styles are what a browse needs, and the whole
// show-it-then-translate-it path runs without the markup ever leaving the
// server. Asking for it is a separate, named decision.
test('a browse does not hand back the other site the markup it authored', async () => {
  await withClient(async (client) => {
    const markup = '<h1 class="hero">Ship faster<span class="cue">scroll</span></h1>';
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'h1.hero',
      html: markup,
      styles: { 'font-size': '64px' },
      owner: 'third-party',
      tags: ['hero']
    });

    const browsed = await call(client, 'search_references', { query: 'hero' });
    const shown = browsed.results[0];

    // Not merely absent from `reference` — absent from the whole response. A
    // caller reads the serialized text, so markup surviving anywhere in it is
    // markup that changed hands.
    assert.equal(shown.reference.html, undefined);
    assert.equal(JSON.stringify(browsed).includes('Ship faster'), false);
    assert.equal(shown.html_available, true, 'a caller cannot ask for markup it does not know is there');
    assert.equal(browsed.markup_notice, undefined, 'nothing was handed over, so nothing to notice');

    // Everything a browse is FOR is still here: the picture, the credit, and the
    // measurements the token mapper reads.
    assert.equal(shown.reference.selector, 'h1.hero');
    assert.deepEqual(shown.reference.styles, { 'font-size': '64px' });
    assert.ok(shown.display.credit.includes('linear.app'));

    // And the mapping half runs from the ref_id alone, which is what makes the
    // omission cost nothing: the markup never had to leave to get here.
    const designPath = path.join(process.env.RAVEN_REFERENCE_HOME, 'DESIGN.md');
    await writeFile(designPath, '---\ntype:\n  size:\n    hero: "64px"\n---\n\n# Fixture\n', 'utf8');
    const mapped = await call(client, 'map_reference_to_tokens', { ref_id: saved.ref_id, design_file_path: designPath });
    assert.equal(mapped.bindings[0].token, 'type.size.hero');

    const asked = await call(client, 'search_references', { query: 'hero', include_html: true });
    assert.equal(asked.results[0].reference.html, markup);
    assert.match(asked.markup_notice, /linear\.app/);
    assert.match(asked.markup_notice, /write your own implementation/);
  });
});

test('the truncation flag travels with the markup it describes, not on its own', async () => {
  // `html_truncated: true` sitting beside no html is a flag about a field that
  // is not there. It is reported at the result level either way, where it means
  // "there is more of this than was kept" rather than describing an absent key.
  await withClient(async (client) => {
    await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'section.pricing',
      html: '<section>' + 'x'.repeat(9000) + '</section>',
      styles: { gap: '24px' },
      owner: 'third-party',
      tags: ['pricing']
    });

    const browsed = await call(client, 'search_references', { query: 'pricing' });
    assert.equal(browsed.results[0].reference.html_truncated, undefined);
    assert.equal(browsed.results[0].html_truncated, true);
    assert.equal(browsed.results[0].html_available, true);

    const asked = await call(client, 'search_references', { query: 'pricing', include_html: true });
    assert.equal(asked.results[0].reference.html_truncated, true);
    assert.ok(asked.results[0].reference.html.length > 0);
  });
});

test('a record captured without markup reports that, rather than looking withheld', async () => {
  // html_available distinguishes "there is markup and you did not ask" from
  // "there is no markup". Collapsing them would send a caller asking for
  // something that does not exist, and — worse — would make a corpus of
  // style-only captures look like it was holding something back.
  await withClient(async (client) => {
    await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'nav.top',
      styles: { gap: '12px' },
      owner: 'third-party',
      tags: ['nav']
    });
    const browsed = await call(client, 'search_references', { query: 'nav' });
    assert.equal(browsed.results[0].html_available, false);
    assert.equal(browsed.results[0].html_truncated, false);

    const asked = await call(client, 'search_references', { query: 'nav', include_html: true });
    assert.equal(asked.results[0].reference.html, undefined);
    assert.equal(asked.markup_notice, undefined, 'nothing was handed over');
  });
});

test('the markup notice fires on third-party markup only, and names whose', async () => {
  await withClient(async (client) => {
    await call(client, 'capture_reference', {
      url: 'https://myapp.example/dashboard',
      selector: '.card',
      html: '<div class="card">mine</div>',
      styles: { gap: '8px' },
      owner: 'self',
      tags: ['card']
    });
    const own = await call(client, 'search_references', { query: 'card', include_html: true });
    assert.equal(own.results[0].reference.html, '<div class="card">mine</div>');
    assert.equal(own.markup_notice, undefined, "the user's own markup is not third-party");

    await call(client, 'capture_reference', {
      url: 'https://stripe.com/pricing',
      selector: '.card',
      html: '<div class="card">theirs</div>',
      styles: { gap: '8px' },
      owner: 'third-party',
      tags: ['card']
    });
    const both = await call(client, 'search_references', { query: 'card', include_html: true });
    assert.match(both.markup_notice, /stripe\.com/);
    assert.equal(/myapp\.example/.test(both.markup_notice), false,
      'naming a host the user owns as a source to be careful with is noise that trains the notice out');
  });
});

// The defect that killed compose_build_prompt: it cited DESIGN.md as its
// grounding and emitted token NAMES with no VALUES, so an agent holding only
// that output had to invent its colors. map_reference_to_tokens does emit
// values — measured — and until now nothing asserted it. Every existing check
// reads `binding.token`, so nulling `token_value` reproduced that exact defect
// with the whole suite green.
test('a binding carries the token VALUE, not only its name', async () => {
  await withClient(async (client, home) => {
    const designPath = path.join(home, 'DESIGN.md');
    // The alias has to WIN for the alias assertion to measure anything. Winners
    // order by distance, then family fit, then SHORTEST path — so a fixture with
    // the alias nested under the token it points at binds the base instead, and
    // the assertion passes against a mutant that never resolves aliases at all
    // (measured: returning the raw value left all 13 tests green). `color.ink`
    // is shorter than `color.palette.neutral.base`, so the alias wins.
    await writeFile(designPath, '---\ncolor:\n  ink: "{color.palette.neutral.base}"\n  palette:\n    neutral:\n      base: "#f7f8f8"\ntype:\n  size:\n    hero: "64px"\n---\n\n# Fixture\n', 'utf8');

    const mapped = await call(client, 'map_reference_to_tokens', {
      captured: { 'font-size': '64px', color: 'rgb(247, 248, 248)' },
      design_file_path: designPath
    });

    for (const binding of mapped.bindings) {
      assert.equal(typeof binding.token_value, 'string',
        binding.property + ' bound to ' + binding.token + ' with no value — an agent holding this has to invent one');
      assert.ok(binding.token_value.length > 0, binding.property + ' bound to an empty value');
      assert.equal(typeof binding.css_var, 'string', binding.property + ' has no css_var to write');
    }

    const byProperty = Object.fromEntries(mapped.bindings.map((b) => [b.property, b]));
    assert.equal(byProperty['font-size'].token_value, '64px');
    // An ALIAS resolves to the literal at the end of the chain rather than to
    // the reference text. `{color.base.ink}` is not something you can put in a
    // stylesheet, and a value that still needs resolving is the same defect one
    // indirection along.
    assert.equal(byProperty.color.token, 'color.ink', 'the fixture must bind the ALIAS, or the next assertion measures nothing');
    assert.equal(byProperty.color.token_value, '#f7f8f8');
    assert.equal(/[{}]/.test(byProperty.color.token_value), false);
  });
});

// The two dead ends a person actually hits, at the seam where they hit them.
// Andrew's use case is "show me examples of a scrolling mouse cue in a hero" —
// the first call returns nothing, and `total: 0` alone cannot tell him whether
// the corpus is empty or his words were wrong. Those need different answers, so
// the tool gives different sentences.
//
// Mutation proof: collapse the two branches into one message. Measured — this
// test turns red and nothing else does, because the store-level tests cannot see
// this field at all; it exists only at the seam.
test('a search with nothing to show says which kind of nothing it is', async () => {
  await withClient(async (client) => {
    const empty = await call(client, 'search_references', { query: 'scrolling mouse cue in a hero' });
    assert.equal(empty.total, 0);
    assert.equal(empty.corpus_size, 0);
    assert.match(empty.next_step, /corpus is empty/i);
    assert.match(empty.next_step, /start_grab_session/);
    assert.match(empty.next_step, /capture_reference/);
    // Nothing to suggest yet — an empty vocabulary object here would read as
    // "the corpus has nothing to say about this", which is a different and
    // wrong answer.
    assert.equal(empty.vocabulary, undefined);

    await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'h1.hero',
      styles: { 'font-size': '64px' },
      owner: 'third-party',
      tags: ['hero'],
      taxonomy: ['hero'],
    });

    const missed = await call(client, 'search_references', { query: 'quantum harmonica' });
    assert.equal(missed.total, 0);
    assert.equal(missed.corpus_size, 1);
    assert.match(missed.next_step, /not empty/i);
    assert.deepEqual(missed.vocabulary.taxonomy, ['hero']);
    assert.deepEqual(missed.vocabulary.hosts, ['linear.app']);

    // And a search that finds something says neither — the results are the answer.
    const hit = await call(client, 'search_references', { query: 'hero' });
    assert.ok(hit.total > 0);
    assert.equal(hit.next_step, undefined);
    assert.equal(hit.vocabulary, undefined);
  });
});
