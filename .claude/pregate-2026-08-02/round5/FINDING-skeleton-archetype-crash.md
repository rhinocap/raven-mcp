# A skeleton node missing `archetype` passes lint, then crashes the composer

Found during round 5, from build b12's report. Reproduced directly rather than taken on
trust, because a builder's self-report is a guess until it is run.

## The defect

`compose_build_prompt`'s skeleton lint does not require `archetype` on a `StructureNode`.
The renderer then reads it unguarded, so the call dies with:

    compose_build_prompt failed: Cannot read properties of undefined (reading 'toLowerCase')

Probed one field at a time against an otherwise-valid single-node skeleton:

| omitted field | result |
|---|---|
| `archetype`   | **CRASH — `toLowerCase` of undefined** |
| `density`     | lint rejects, with a message |
| `emphasis`    | lint rejects, with a message |
| `role`        | accepted |
| `containment` | accepted |
| `order`       | accepted |

A fully-shaped skeleton returns the full second-half prompt normally — Structure section,
tokens, decisions, prohibitions, acceptance criteria — so the skeleton pass itself works.
`archetype` is the only field with this gap.

## Why it matters more than an error message usually does

`compose_build_prompt` is a two-call workflow, and the grounding response *instructs* the
caller to derive a skeleton and call again. So the failure lands on the one path the tool
tells every caller to take. What the caller sees is not "you left out `archetype`" but an
internal `toLowerCase` stack message, which reads as *the tool is broken* rather than *your
argument is incomplete*. Build b12 reached exactly that conclusion and wrote in its notes
that the second call "never succeeds" — for every skeleton it tried.

`role`, `containment` and `order` being silently accepted is the same gap in a quieter form:
lint covers four of the seven `StructureNode` fields.

## The fix

In `src/reference-prompt.ts`, extend the skeleton lint (`~line 193`, the walk that already
reports `skeleton.structure is required`) to require every non-optional `StructureNode`
field — `node_id`, `role`, `archetype`, `containment`, `order`, `emphasis`, `density`,
`children` — reporting each missing one by node id, as `density` and `emphasis` already are.
The renderer's unguarded `.toLowerCase()` then becomes unreachable rather than merely
unlikely. One test per field, matching the probe table above.

## Not fixed yet, deliberately

`compose_build_prompt` is the independent variable of the round currently running. Editing it
between the builds and the measurement would mean the eighteen builds were not all run against
one tool. The fix lands after round 5 is analysed, and the round records the crash as part of
what the tool actually does today — b12 and b14 both lost the skeleton pass to it, b14 after
roughly twenty attempts at a lint-passing skeleton. That is a cost of the tool, not a defect
of the harness, and it belongs in the result rather than in a footnote excusing it.

---

## Second observation, from the same round: the composer never emits token VALUES

Both arm-A builds that reported in detail (b12, b14) hit the crash above, and both then
reported the same second thing independently: `compose_build_prompt` lists token *names* and
their CSS custom-property names — `colors.surface-base` (`--color-surface-base`) — in both
halves of the workflow, and never their values. It also says "No hex, no px, no font-family
literals", and cites `DESIGN.md` as its grounding without being able to hand over what is in
it.

For arm A that is unbuildable as stated: an agent holding only the composer has to declare
`--color-surface-base` somewhere, and the only source for `#101215` is `read_design_md`,
which arm A does not have. Both builds invented values and said so. The B arms read the real
ones out of the frontmatter.

Whether that is a defect depends on a product question this experiment does not settle: is
`compose_build_prompt` meant to be sufficient on its own, or is it meant to be called
alongside `read_design_md`? §13's premise is the former, and round 5's arm A is built on that
reading. If the intended answer is the latter, then arm A as specified tests a configuration
nobody would ship — which is worth knowing, and is a finding about the tool's contract rather
than about the harness.

Recorded here without a fix, for the same reason as the crash: the tool is the round's
independent variable and does not change until the round is analysed.
