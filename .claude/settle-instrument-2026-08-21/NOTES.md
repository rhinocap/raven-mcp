# The settle-cap assertions were measuring the wrong quantity (2026-08-21)

Three tests in `test/capture.test.mjs` claimed *"this page does not consume the
3s animation-settle cap"* and measured it by timing the whole `capturePage()`
call against a 2800ms bound — browser launch, navigation, traits collection,
`page.content()` and a full-page screenshot, as well as the settle wait.

Those are two different quantities. On a cold CI runner the total exceeds
2800ms with the settle wait near zero, and the assertion then reports a slow box
as a settle-cap defect. It did exactly that on 2026-07-24
(`infinite spinner must not consume the 3s settle cap (elapsed 3967ms)`).

**That test is the release gate**, so it could fail a release for a reason that
has nothing to do with releasing. This is the same class this repo's ledger
already states about products, applied to an instrument: a check whose failure
mode is indistinguishable from an unrelated cause is not a check.

## The fix

`capturePage` now reports `viewportAnimationSettleMs` — the VIEWPORT settle wait
and nothing else. Deliberately not the total settle time: the scroll-phase
settle inside `settleScrollReveals` is bounded by a different cap and already
announces itself through `scroll-animation-settle-cap-reached`, so summing the
two would produce a number no single cap explains. Absent on the `file://`
fallback, which runs no settle wait at all — hence optional, and all three tests
already `t.skip()` on `usedFileFallback` before reaching the assertion.

## The bound is measured, not reasoned

Four fixtures, browser path, `dist/` built from committed source:

| fixture | settle | settled? |
|---|---|---|
| `entrance-animation.html` | 798ms | yes |
| `scroll-timeline-animation.html` | 200ms | yes |
| `permanently-hidden.html` | 200ms | yes |
| `long-entrance-animation.html` | **3002ms** | **no — consumed the cap** |

`SETTLE_FAST_BOUND_MS = 2000` separates those two populations with 2.5x above
the slowest honest observation and 1002ms below the capped one. **798 rather
than ~0 is why the number could not be reasoned**: `entrance-animation.html`
runs a real finite animation, so a bound picked off the 180ms quiescence window
would have been red on correct code — and the old 2800 sits 202ms from the
capped observation, the same mistake in the other direction.

## Matrix (`settle-mutants.mjs`)

Run from the repo root, after `npm run build`. Mutants are string-edited into
`dist/capture.js`, load-checked, run with `node --test` DIRECTLY (never
`npm test`, which rebuilds and clobbers the mutant), and restored with the
restore verified by string equality. The baseline is graded on its declared
shape (40 tests / 1 skip) as well as on being green, because a shortened suite
satisfies every count guard while measuring nothing.

**2 mutants, 2 killed, 0 survived**, EXIT=0.

- **M1** — the product stops reporting the field. Radius **3**, exactly the
  three tests, each red on the declared message. **What the `typeof` guard buys
  is a DIAGNOSIS, not a detection**: `undefined < 2000` is false, so the bound
  assertion would go red without it — but with the same message a genuinely slow
  settle produces, which sends the reader after a settle bug that does not
  exist. Naming the two causes apart is the whole of it.
- **M2** — the quiescence predicate never returns true, so every page consumes
  the full cap. Radius **6**: the three new assertions plus three pre-existing
  `animationsSettled` tests, which is correct for a mutant that breaks settle
  globally. **Read the attribution honestly**: `assert` aborts at the first
  failure, and two of the three tests assert `animationsSettled === true` ahead
  of the bound, so M2 reaches the bound assertion through `permanently-hidden`
  alone. The independent evidence the bound is reachable is
  `long-entrance-animation.html` measuring 3002ms in the standing suite.
