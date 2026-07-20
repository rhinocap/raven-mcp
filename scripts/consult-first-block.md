## Design decisions

This repo keeps its design intent — the resolved rulings on how the UI should look and
behave — in a shared decision graph under `.raven/decisions/`. It is the source of truth
for design choices; a teammate or a prior agent already settled these, and they outrank
your defaults.

Before you choose or change anything visual — color, type, spacing, layout, motion,
component structure, interaction — consult it first:

```
node scripts/consult.mjs <query>
```

Pass a term for the choice you're about to make (e.g. `color`, `spacing`, `motion`,
`layout`). It returns the active decisions that apply. Follow them. If a decision
conflicts with what you were about to do, the decision wins; if you believe it's wrong,
say so rather than silently overriding it.

If nothing matches your query, proceed on your own judgment — there's no ruling yet.
