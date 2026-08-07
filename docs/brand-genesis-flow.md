# Brand genesis: from nothing to a design system your coding agent obeys

A recurring workflow in the Claude community starts a brand from zero with an
AI image generator (Higgsfield is the usual one), turns the generated pack into
a design system, and then hauls that system into Claude Code by exporting and
reimporting a zip. Raven already owns most of that chain natively — the
interview, the design system, and the file the coding agent actually reads —
so the flow below replaces the zip handover with tools that were built for it.

The premise it shares with those tutorials is one Raven agrees with: **the
design system is the core piece upfront.** Get it right before the first page
is built and everything downstream inherits it.

## What you need

- Raven connected over local stdio (`npx -y raven-mcp`). Every tool below is a
  local tool; none of this touches the hosted endpoint.
- Your own image-generation account if you want generated brand assets.
  Higgsfield connects to Claude via its own MCP connector
  (`https://mcp.higgsfield.ai/mcp`) or CLI — Raven never bundles or calls it,
  and any generator (or a folder of your own images) works in its place.

## The flow

### 1. Interview — invent the brand in conversation

Run the kickoff interview even though the project doesn't exist yet:

- `get_taste_interview` with your profile and the new brand's working name.
- Answer the four core questions as *decisions*, not descriptions: what the
  product is, how it should read (aesthetic), how it should sound (voice), and
  what hosts will identify it later.
- Persist with `bind_taste_surface`. Anything you already know — palette
  leanings, type feelings, cliches to avoid — goes in `design_notes`.

If you can't yet answer "how should it read," step 0 is
`generate_mood_board` with `mode:'example'`: a labeled sample board that
exists to get your thinking started before the interview, not to decide
anything for you.

### 2. Generate — take the brief to your generator

The interview's answers *are* the generation brief: product, name, vibe,
avoid-list. Take them to Higgsfield (or any generator) and produce the brand
pack — logo directions, product imagery, textures. Two outputs matter more
than the pretty pictures:

- **One hex.** The primary brand color, as an exact value. Higgsfield brand
  kits lock colors to hex; keep that number.
- **A vibe word** that maps to a style preset: `minimal`, `bold`, `warm`,
  `corporate`, `playful`, or `dark`.

### 3. Look — mood board as the approval stop

Back in Raven, `generate_mood_board` (`mode:'board'`) composes what the
binding now holds — your notes as chips, your references — into one
self-contained HTML board. Put the generated pack next to it and look.

This is deliberately a stop, not a step. The board names the next tool and
never runs it: a human decides the direction is right first. If it isn't,
change the notes or regenerate the pack — both are one call.

### 4. Commit — the design system, generated from the decision

When the direction holds:

```
generate_design_system({
  name: "Smash & Grab Burger Co",
  brand_color: "#E8442E",   // the hex from step 2
  style: "bold",            // the vibe word from step 2
  format: "all",            // html doc + css vars + DTCG + Figma + svg
  save: true                // store it — this is what makes it an OUTPUT
})
```

One brand color in, a full harmonious token set out — palette, spacing,
radii, shadows, motion, typography — with dark mode alongside. `save: true`
stores the system under its slugified name (`smash-grab-burger-co` here) in
`~/.raven/design-systems`, and from then on the id works everywhere a bundled
system's does: `base_system`, `get_design_system`, `list_design_systems`
(category `user`), and `init_design_md`. A name that collides with a bundled
system is refused rather than silently shadowed — pick another name.

### 5. Land it where the agent reads

`DESIGN.md` is the import: every coding-agent session that reads the repo
builds against the brand's actual tokens, and `review_diff` / `polish_diff`
can hold diffs to it. No export, no zip, no reupload — the design system
lives in the project, and landing it is one call:

```
init_design_md({ path: "DESIGN.md", source: "smash-grab-burger-co" })
```

The saved system's palette, spacing, radii, and typography arrive in the
frontmatter directly; `update_design_md` keeps later edits surgical.

## What this flow does not do yet

Two gaps are known and deliberate — they add tool surface, which is a
product decision, not a doc fix:

1. **Generated images as references.** `capture_reference` captures from a
   live page; a generated brand pack is a directory of image files. Until a
   local-image intake exists, the pack informs the flow through the interview
   notes and the hex, and the images themselves stay beside the mood board
   rather than inside it.
2. **A genesis interview mode.** The kickoff interview calibrates taste for a
   project; a dedicated brand-genesis question set (name exploration, hero
   products, avoid-list as a first-class answer) would make step 1 sharper
   for someone starting from nothing.

A third gap closed since this doc first shipped: generated systems used to
vanish with the response, which is why step 5 once required hand-transcribing
DTCG into the frontmatter. `save: true` (step 4) is the fix — the design
system is now a durable output of the taste engine, not a string that
scrolls past. Saved systems are local-only: the hosted endpoint neither
stores nor lists them.
