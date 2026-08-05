# B2 — Reference token mapper report

## Exported signatures

```ts
export type BindingVerdict = "exact" | "near" | "none";

export interface Thresholds {
  color: number;
  length: number;
  unitless: number;
  rootPx: number;
}

export interface TokenBinding {
  property: string;
  captured: string;
  token?: string;
  css_var?: string;
  token_value?: string;
  verdict: BindingVerdict;
  delta?: number;
  delta_unit?: "px" | "rgb" | "ratio" | "unitless";
  why: string;
}

export interface ReferenceTokenMap {
  bindings: TokenBinding[];
  gaps: Array<{ property: string; captured: string; why: string }>;
  coverage: { bound: number; total: number; ratio: number };
  ramps_used: string[];
}

export function mapReferenceToTokens(
  captured: Record<string, string>,
  tokens: FlattenedDesignToken[],
  opts?: { thresholds?: Partial<Thresholds>; properties?: string[] }
): ReferenceTokenMap;
```

## Defaults and configuration

- Colour: RGB distance `< 12` is near; configure with `opts.thresholds.color`.
- Length: absolute distance `< 2px` is near; configure with `opts.thresholds.length`.
- Unitless: relative distance `<= 0.01` (1%) is near; configure with `opts.thresholds.unitless`.
- `rem` and `em`: multiply by 16px; configure the conversion root with `opts.thresholds.rootPx`.
- `opts.properties` restricts mapping to named properties that exist in `captured`.
- Coverage `total` includes only colour, length, unitless-number, and font-family properties. Unsupported property classes remain explicit gaps but do not inflate the denominator.

## Existing-code reuse

`parseKnownColor` in `src/contrast.ts` was minimally exported and reused. The already-public `parseColor` cannot be used here because its documented legacy fallback converts an unknown colour to opaque black, which would create false token matches.

Additional minimal export: `export function parseKnownColor(css: string): Rgba | null`.

## Brief corrections

The brief's `FlattenedDesignToken.value` shorthand omits that its actual type is `DesignMdValue`, not always a scalar string. The mapper therefore accepts only resolved string and number values for comparison and reports other terminal values as broken token values.

## Decisions not specified by the brief

- `Thresholds` uses the keys `color`, `length`, `unitless`, and `rootPx` because the brief referenced the type without defining its fields.
- Font-family exact matches report delta `0`; a near match reports the captured first family's zero-based position in the token stack as a unitless delta (so the second family has delta `1`).
- Length-size properties include width/height, their min/max variants, and logical inline/block-size variants. Compound shorthand values are not guessed.
- A relative unitless comparison against captured zero only matches exact zero; any nonzero difference has infinite relative distance.
- Relative unitless distance uses the absolute captured value as its denominator.
- When several tokens have the same compatible value, the required path tie-break applies across groups; no group-name heuristic is inserted ahead of it.
- Output property order follows `opts.properties` when supplied, otherwise the captured record's key order.

## Verification boundary

No build, TypeScript compiler, test, or git command was run, as required by the brief. Verification in this leg was limited to source inspection against the acceptance list.
