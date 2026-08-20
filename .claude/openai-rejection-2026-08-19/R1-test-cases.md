# Resubmission test cases — R1 remediation

Measured live against the DEPLOYED anonymous endpoint `https://mcp.ravenmcp.ai/api/mcp`
on 2026-08-20, after commit `ba8f0b3`. Not measured locally and not inferred from
source: every number below came back over the wire from the surface a reviewer calls.

## Why these five replace the five that were submitted

OpenAI's R1 finding was that a submitted test case's stored expected value could not be
reproduced. That was correct, and the root cause was ours: **the dossier recorded
CAPTURED NUMBERS taken off a live, changing input.**

The two failing cases (`audit_contrast` and `audit_tap_targets`) were run against
`https://ravenmcp.ai` — our own marketing site, which we redeploy. The submitted
expectation "373 text elements" reads **344** today. Nothing regressed; the page changed,
and `audit_contrast` additionally went tri-state at commit `488b315`, which moves the
tally again. An expected value computed from a moving input is not an expectation, it is
a snapshot with a timestamp nobody wrote down.

The same class was live in a third case at the moment of writing this file:
`get_principles` was submitted as **28** and returns **26** today, because the principle
corpus is edited. That one happened not to be flagged, which is luck, not correctness.

**The fix is structural, not a re-capture.** Every case below either (a) supplies its
entire input inline, so the expected output is a pure function of the request a reviewer
pastes, or (b) states an INVARIANT that is stable under corpus growth rather than a
total. No case depends on a URL we control, on page content, or on a headless browser
run.

Two consequences worth stating plainly rather than leaving to be discovered:

- **No case renders a page.** The two audit cases use the tools' pre-measured input
  modes (`dom_snapshot` / `elements`), which are first-class documented parameters, not
  a test-only path. This removes both the drift mechanism AND the latency mechanism from
  the graded path — the previous `audit_tap_targets` case took **40.9 s** wall clock
  against a live URL; its replacement returns in **135 ms**.
- **Totals appear below only where the input pins them.** Where a total is corpus-derived
  it is written as an invariant and the exact count is explicitly marked as NOT the
  expectation.

---

## P1 — `audit_contrast`, pinned snapshot

**Call**

```json
{ "name": "audit_contrast", "arguments": { "dom_snapshot": [
  { "selector": "p.ok",   "color": "#111111", "bgColor": "#ffffff", "fontPx": 16, "bold": false, "text": "Passing body copy at 16px on white." },
  { "selector": "p.fail", "color": "#bbbbbb", "bgColor": "#ffffff", "fontPx": 16, "bold": false, "text": "Failing low-contrast copy at 16px on white." }
] } }
```

**Expected — all four are arithmetic on the supplied colors, so they cannot drift**

- `total_text_elements` is `2` (the caller supplied two rows).
- `p.ok` → `status: "pass"`, `ratio: 18.88`, `aa: true`, `aaa: true`.
- `p.fail` → `status: "fail"`, `ratio: 1.92`, `aa: false`, `delta_to_aa: 2.58`.
- `aa_fail_count` is `1`, and `aa_failures` contains exactly the `p.fail` row.

`#111111` on `#ffffff` and `#bbbbbb` on `#ffffff` are WCAG 2.x relative-luminance
computations over constants. `required_aa` is `4.5` because both rows are 16px non-bold,
which the response reports as `large: false`.

**Measured 2026-08-20:** HTTP 200, `isError` absent, **322 ms**, 1,694-char response,
every value above matching exactly.

---

## P2 — `audit_tap_targets`, pinned elements

**Call**

```json
{ "name": "audit_tap_targets", "arguments": { "elements": [
  { "selector": "a.tap-ok",    "w": 48, "h": 48, "x": 0,  "y": 0, "role": "link", "text": "A" },
  { "selector": "a.tap-small", "w": 20, "h": 20, "x": 60, "y": 0, "role": "link", "text": "B" }
] } }
```

**Expected**

- `minSize` is `44`, `total` is `2`, `passing` is `1`, `failing` is `1`.
- `fix_table` has exactly one entry, for `a.tap-small`, with `deficit_w: 24` and
  `deficit_h: 24` (44 − 20 on both axes).
- `a.tap-ok` at 48×48 does not appear in `fix_table`.

**Measured 2026-08-20:** HTTP 200, `isError` absent, **135 ms**, 388-char response,
matching exactly.

---

## P3 — `get_principles`, stated as an invariant

**Call:** `{ "name": "get_principles", "arguments": { "context": "landing page" } }`

**Expected — deliberately NOT a count.** The principle corpus is editable content and
grows; `count` was 28 at the original submission and is **26** today. Pinning it would
re-create exactly the R1 defect. The stable claims are:

- The response parses as JSON with `context`, `category`, `count` and `principles`.
- `count` equals `principles.length`, and `count >= 20`.
- Every principle carries non-empty `id`, `name`, `category` and `summary`
  (full key set: `id, name, category, summary, description, implications, violations,
  applies_to, sources`).
- The returned set includes the principle with id `color-palette-discipline`.

**Measured 2026-08-20:** HTTP 200, **225 ms**, `count: 26`, all four invariants holding.

---

## P4 — `list_design_systems` + `get_design_system`

**Call A:** `{ "name": "list_design_systems", "arguments": {} }`

**Expected:** `count` equals `systems.length` and the set includes the ids
`stripe`, `linear`, `apple-hig` and `material-design`. The exact count is **not** the
expectation — it is 12 today and rises when a system is added.

**Call B:** `{ "name": "get_design_system", "arguments": { "id": "stripe" } }`

**Expected:** the `primary` color token has `$value` exactly `#635BFF`. This is a shipped
brand constant in tracked repo data, not a measurement, which is why it is safe to pin
where the counts are not.

**Measured 2026-08-20:** Call A HTTP 200, **121 ms**, `count: 12`, ids
`stripe, linear, apple-hig, material-design, vercel, shadcn, github-primer, notion,
supabase, tailwind, spotify, airbnb`. Call B HTTP 200, **182 ms**, 8,619 chars,
`"primary": { "$value": "#635BFF", … }`.

---

## P5 — `get_checklist`

**Call:** `{ "name": "get_checklist", "arguments": { "type": "landing-page" } }`

**Expected:** `pattern_match` is `"matched"`, `platform` is `"responsive"`, and
`pattern_checklists` contains an entry whose `source` is `"Landing Page"` with a
non-empty `items` array. The item count (12 today) is not pinned.

**Measured 2026-08-20:** HTTP 200, **225 ms**, 1,404-char response, matching.

---

## N1 / N2 / N3 — negative cases

The three negatives submitted previously asserted browser-level network failures
(e.g. `ERR_NAME_NOT_RESOLVED` for an unresolvable host). Those are **withdrawn**, for a
reason that is now a property of the surface rather than an accident:

**On the hosted endpoint `audit_url` no longer reaches the network at all.** It declines,
by design, and the decline is what R2's annotation change made honest. A negative case
asserting a DNS error would be asserting behaviour the reviewed surface does not have.

The replacements assert the decline and its scope explanation.

### N1 — `audit_url` declines on the hosted endpoint and says why

**Call:** `{ "name": "audit_url", "arguments": { "url": "https://example.com" } }`

**Expected:** HTTP 200 with a JSON-RPC *result* (not a protocol error) carrying
`isError: true` and text that (a) states `audit_url` is unavailable on the hosted
endpoint, (b) gives the measured reason — a full render-and-measure run was timed at
**95.2 s**, far past a connector's tool-call budget — and (c) names the two routes that
do work: `npx raven-mcp` locally, and `audit_page` for static markup.

**Measured 2026-08-20:** **0.304 s**, `isError: true`, decline text as above. The
headline number for this case is the ratio: **0.304 s against a 95.2 s floor.** The tool
does not attempt the work and time out; it refuses immediately and explains.

This is also the case that makes R2 checkable end to end: the same table entry that
produces this decline is the single source both the declared annotations and the
description sentence are derived from. See `R2-annotation-justification.md`.

### N2 — a hosted tool that CAN reach the web is not swept up in the decline

**Call:** `{ "name": "audit_contrast", "arguments": { "url": "https://example.com" } }`

**Expected — an invariant, because the target is a live external page.** The call is
*not* declined: the response carries no `isError`, and its payload includes the `url`
field and a text-element tally. `audit_contrast` remains network-capable on the hosted
endpoint and is annotated `openWorldHint: true` accordingly. **The tallies themselves are
explicitly not the expectation** — `example.com` is not ours and can change, which is the
whole R1 lesson.

The case exists to prove the refusal is scoped to one tool rather than applied
blanket-fashion; a fix that simply refused everything would pass N1 and fail here. It is
also the direct behavioural evidence for the `openWorldHint: true` justification on this
tool: it demonstrably reaches the open web on the surface being reviewed.

**Measured 2026-08-20:** HTTP 200, **4.02 s**, `isError` absent, 1,984-char response
beginning `{"url":"https://example.com","total_text_elements":3,…}` — a real render, not
a decline.

### N3 — missing required argument

**Call:** `{ "name": "get_design_system", "arguments": {} }`

**Expected:** a JSON-RPC error `-32602`, "Input validation error", naming path `id` with
`expected: "string", received: "undefined"`. Schema-derived, so stable.

**Measured 2026-08-20:** exactly that, **122 ms**.

---

## What a reviewer needs to reproduce this

Every case above is a single `tools/call` POST to `https://mcp.ravenmcp.ai/api/mcp`
with no authentication, no fixture file and no local checkout. The slowest is 322 ms.
