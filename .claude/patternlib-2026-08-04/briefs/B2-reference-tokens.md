# Leg B2 — map a captured pattern's raw CSS onto the user's own design tokens

Repo: `/Users/accunliffe/projects/raven-mcp` (TypeScript, ESM, Node built-ins only, no deps).

## Why this exists

Raven can now grab an element off any third-party site and read its computed styles —
measured live on linear.app: `font-size: 64px`, `font-weight: 510`,
`letter-spacing: -1.408px`, `color: rgb(247, 248, 248)`. And then the payload said
`tokens: []`. **That empty array is the whole gap.** A designer who liked Linear's hero does
not want Linear's hex codes pasted into their product — they want *their own* type ramp and
palette, arranged the way Linear arranged theirs. Nothing today translates one into the other,
so a coding agent handed a capture invents literals.

You are building the translator. It is a pure, deterministic function — no model, no network,
no I/O. That is deliberate: this server has never had an LLM dependency and is not getting one.

## Read these first

- `src/designmd.ts:25` — `FlattenedDesignToken { path, group, name, value, kind, cssVar, ref? }`.
  This is the user's token vocabulary and it is your target space.
- `src/contrast.ts` — this repo already parses CSS colors and does colour math. **Reuse it.**
  Do not write a second colour parser. If what you need is not exported, export it minimally
  rather than duplicating it, and say so in your report.

## Build `src/reference-tokens.ts`

```ts
export type BindingVerdict = "exact" | "near" | "none";

export interface TokenBinding {
  property: string;        // e.g. "font-size"
  captured: string;        // e.g. "64px"
  token?: string;          // FlattenedDesignToken.path
  css_var?: string;        // FlattenedDesignToken.cssVar
  token_value?: string;    // the token's own value, RESOLVED
  verdict: BindingVerdict;
  delta?: number;          // distance in the unit of comparison
  delta_unit?: "px" | "rgb" | "ratio" | "unitless";
  why: string;             // plain words: "nearest step in the type ramp, 4px larger"
}

export interface ReferenceTokenMap {
  bindings: TokenBinding[];
  gaps: Array<{ property: string; captured: string; why: string }>;
  coverage: { bound: number; total: number; ratio: number };
  ramps_used: string[];    // which token groups the bindings landed in
}

export function mapReferenceToTokens(
  captured: Record<string, string>,
  tokens: FlattenedDesignToken[],
  opts?: { thresholds?: Partial<Thresholds>; properties?: string[] }
): ReferenceTokenMap;
```

### Matching rules — per value kind, and stated numerically

- **Colour** (`color`, `background-color`, `border-color`, `outline-color`, `fill`, `stroke`,
  and any `*-color`): parse both sides to RGB, compare by Euclidean distance in sRGB.
  `exact` at distance 0, `near` under a threshold (default **12**), else `none`.
  Alpha is compared separately; a token that matches in RGB but differs in alpha is `near`
  at best and `why` must say so.
- **Length** (`font-size`, `line-height`, `letter-spacing`, `padding*`, `margin*`, `gap`,
  `border-radius`, `border-width`, sizes): normalize to px where the unit permits
  (`px` direct; `rem`/`em` × a configurable root of **16**; `%` and viewport units are NOT
  convertible — emit a gap that says why, do not guess). `exact` at 0, `near` under
  **2px** by default, else `none`.
- **Unitless number** (`font-weight`, `opacity`, `z-index`, unitless `line-height`):
  `exact` at 0, `near` within **1%** relative, else `none`.
- **Font family**: normalize both sides — lowercase, strip quotes, split the stack, compare
  the FIRST family. `exact` on a first-family match; `near` if the captured first family
  appears anywhere later in the token's stack; else `none`.
- **Everything else** (shadows, gradients, transitions, `display`, `position`, …): no
  matching. Emit a gap with a `why` that names the property class. Do NOT force a match.

### Rules that keep this honest

- **A token reference must be resolved before comparison.** `kind: "ref"` tokens point at
  another token via `ref`; follow the chain, and on a cycle or dangling ref emit a gap
  naming the broken path rather than comparing against `undefined`.
- **Ties are broken deterministically**: smallest delta, then shortest `path`, then
  lexicographic `path`. Never rely on array order.
- **An empty token array is not an error and not a silent pass** — it returns every property
  as a gap with `coverage.ratio: 0`, and every `why` says the project has no tokens. The
  failure mode this prevents: a caller reading `bindings: []` as "nothing needed mapping."
- `coverage.ratio` counts only properties that were *eligible* for matching (i.e. exclude the
  no-matching-possible classes from the denominator) and the field docs must say so, because
  a ratio whose denominator is undocumented is a number nobody can act on.

## Test file: `test/reference-tokens.test.mjs`

`node:test` + `node:assert/strict`. Pure functions, so no temp dirs and no env vars needed.
Build a small fixture token set (a 6-step type ramp, a 4-step spacing scale, 3 colours,
2 font families, one `ref` token pointing at a colour).

Cover, and make each able to fail:
1. Exact hits on all four kinds — colour, length, unitless, font-family — verdict `exact`,
   `delta` 0.
2. A near miss on each kind returns `near` with the CORRECT numeric delta (assert the number,
   not just the verdict).
3. A value beyond threshold returns `none` and lands in `gaps`, not in `bindings` with a
   bogus token.
4. `rem` converts at root 16; `%` and `vw` produce gaps whose `why` names the reason.
5. A `ref` token resolves and binds to the resolved value; a dangling `ref` becomes a gap
   naming the path; a `ref` CYCLE becomes a gap and does not hang.
6. Empty `tokens: []` → every property a gap, `coverage.ratio === 0`, and at least one `why`
   mentions the absent token set.
7. Determinism: two tokens at IDENTICAL distance from the captured value — assert which one
   wins by the stated tie-break, and assert it wins again with the array order reversed.
8. `box-shadow` (a no-match class) is a gap and is EXCLUDED from `coverage.total`, asserted
   by computing the expected denominator explicitly in the test.
9. Alpha: a colour matching in RGB but differing in alpha is at most `near`, and `why` says alpha.

## Constraints — hard

- Create **only** `src/reference-tokens.ts` and `test/reference-tokens.test.mjs`. You may add
  a minimal `export` to `src/contrast.ts` ONLY if you need an existing colour parser that is
  currently private — no other change to that file, and name it in your report.
- Do **not** edit `src/index.ts`, `manifest.json`, `package.json`, or any other test file.
  The orchestrator registers MCP tools and owns the frozen tool-count contract.
- **Do not run `npm run build`, `tsc`, `npm test`, or any git command.** Other agents are
  writing this worktree concurrently. Write source only.
- No new dependencies. Match the surrounding file style.

## Deliverable

Write the code, then write `.claude/patternlib-2026-08-04/out/B2-report.md`: exported
signatures verbatim, every default threshold and where it is configurable, whether you had to
export anything from `contrast.ts`, anything this brief got wrong about the existing code,
and any matching rule you had to decide that the brief did not specify.
