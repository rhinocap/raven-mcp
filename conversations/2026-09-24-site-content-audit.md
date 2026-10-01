# 2026-09-24 · ravenmcp.ai content audit

Goal: audit every text, video, and image asset on ravenmcp.ai against the content rules and propose replacement media. The audit changed nothing: no site edits and no push.

Surface: `web/` (Next.js), at `origin/main 1564162`, npm 2.6.0.

## Findings

Block:
- Clip `assets/video/clips/06-evaluate.mp4` shows a personal account header in the terminal. Pull it first.
- Three of the six `assets/video/demos/*.mp4` files carry a Veo watermark (law-firm, fitness, real-estate). All six are AI b-roll with no product UI in them, and the fitness sign renders as "F RGE".
- "Zero runtime dependencies" is false: `package.json` has 4.

Claims:
- The page says both 73/13 and 129/22 for principles/patterns.
- The page says both "Nine layers" and "19 Knowledge Layers", and the catalog groups tools by job.
- It says both "20 Audit tools" and "Audit 27".
- 129 and 22 could not be reproduced from `src/data`.
- Install time is given as 30 s on the homepage and 2 min in the docs.
- The changelog says "every Friday", but releases have landed on other days.
- The "Installs" counter shows npm downloads.
- The "Get in touch" block sits under "Free. All of it."
- The `/design-system` footer cites the retired `site/`.

Voice:
- "Field-tested" and "proven" appear with no evidence.
- The mythology section is decoration.
- The SwiftUI claim outruns the clips.
- "No designer." is Andrew's decision.
- The metric strip is decoration.
- Filler phrases and mannered docs labels.
- Changelog aphorisms.
- Em-dash density: 110 on the homepage.
- The `get_brand_system` description reads as cloning.
- The OG tagline is stale.

Media:
- The hero playground was recorded on an older build, and the headline is cut off.
- The SwiftUI clips are unreadable or static; clip 03 shows failed tool calls.
- The Nexus before/after is a strawman.
- Oddlot is v1 → v2, not before/after Raven.
- The Fogline "before" shows the overlay rail.
- About 52 MB of unreferenced video is deployed: sizzle-reel, raven-hero-1/2 (identical), demo.mp4.

Raven gaps:
- The `CSS-ARITHMETIC` rule fires on prose.
- There is no watermark detector.

## Proposals

1. Re-record the hero on v2.6, including an image attachment.
2. Replace the six SwiftUI clips with one audit loop: BLOCK → fix → PASS.
3. Replace the demo b-roll with scroll captures of the pages Raven built.
4. A fair before/after: same prompt and same model, with and without Raven.
5. A still of `decision_get` and `gap_scan` output.
6. An OG image with the current hero line.
7. Delete the unreferenced media.

## Pending

- Andrew decides whether to take clip 06 and the Veo demos down now. That needs a push to main, which needs his approval.
- Copy pass and recordings, not started.
- Log the two Raven gaps in `.claude/raven-opportunities.md`.

Report: published as a private artifact (link in session reply).

## Fix pass (started 2026-09-24)

Andrew: "Write yourself a /goal to get the work done and do it".

Spec: apply the audit fixes to `web/` on branch `site-content-fixes` (worktree `~/projects/raven-mcp-site-fixes`, from `0f8e956`). Nothing is pushed to main without his approval.
- Cut: the SwiftUI clip section (clip 06 included), the Veo "Example pages" section, and the unreferenced media (sizzle-reel, raven-hero-1/2, demo.mp4).
- Before/after: remove Nexus, recaption Oddlot, recrop the Fogline before.
- Claims: 132 principles / 23 patterns (the source sums every principles/patterns dir; the docs already say this, so the audit row calling 129/22 "unreproducible" was wrong, and the correct reading is "stale"). Also fix the layers wording, 20→27 audit tools, dependencies, install time, "every Friday", Installs→npm downloads, Get in touch, and the design-system footer.
- Voice: Field-tested/proven, mythology, metric strip, docs labels, changelog aphorisms, get_brand_system, OG title plus a regenerated OG image.
- Out of scope: "No designer." and new recordings.
- Acceptance: next build, grep for stale strings, renders at 1440 and 390 checked by eye, design-judge, Sol, commit on the branch, then ask about the push.

### Sol pass on the audit report (complete)

Sol confirmed: 73/13 conflicts; 20 vs 27 audit tools; zero-deps false (4); "every Friday" false; "Installs" = npm downloads; 4 unreferenced videos, 51.7 MiB, hero files byte-identical. It could not verify the watermark or account-header claims from source (frame-level).

Sol refuted or narrowed, with dispositions:
1. 129/22 is stale; the source sums to 132/23, as the docs say. Report reworded.
2. "Nine layers" = nine summary cards; `LAYER_COUNT = 19` = tool-reference groups. Not a count error; the site wording must name what each number counts.
3. 30 s vs 2 min is not a contradiction; both are unmeasured. Site: one wording, no unmeasured time.
4. Design-system footer: `site/index.html` still exists and globals.css says it was ported from it. Provenance unverified, not false. Site: reword to what is true.
5. Pattern schema has `evidence`, not `sources`. Rewrites use "evidence".
6. The changelog feed omits 1.16.0, so "every release" is false. Use "Selected releases".
7. Em-dash count had no scope; page.tsx has 46. Report corrected.
8. Custom-design-system card conflict is interpretation. Softened.
9. "Central claim" / "confirms it" lines cut from the report.

State at this checkpoint: no site files edited yet.

### Fix pass checkpoint (pre-edit)

page.tsx read in full; edit plan fixed. Metric strip, mythology, #watch, #examples, custom-design-system card and FAQ subtitle to be removed. No files edited yet.
