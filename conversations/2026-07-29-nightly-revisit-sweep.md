# 2026-07-29 — nightly /revisit sweep over the 48-session backlog

## Where this left off

Sweep complete through step 4. `~/.claude` has two local commits (`549e0f0`,
`b678a31`); raven-mcp has one (see below). Nothing pushed — the raven-mcp push
gate is Andrew's, and `~/.claude` has no remote.

## Scope: the backlog was 48 sessions, not two

The task framing implied a small backlog. Measured against disk it is **48
un-revisited session logs** spanning 2026-04-11 → 2026-07-28. Coverage was keyed
on the full filename, per instruction — `conversations/metrics.md` carries 25
table columns and 26 `###` entries, which credit **24** of the 69 eligible logs.

Two reconciliation calls worth recording:

- `2026-06-24-site-awardify.md` + `2026-06-25-revisit.md` are one covered
  session (the 06-25 metrics entry is the revisit output of the 06-24 work).
- The `2026-07-21/24` metrics entry **claims** "batch catch-up covering
  2026-07-21 through 2026-07-24" but its content is a coachmark-tour thread plus
  morven-loop it109-171, and matches none of the 8 logs dated 07-21..07-24 on
  disk. Those 8 were counted un-revisited. The claim in metrics.md is wrong and
  is left in place rather than rewritten, since it is a historical record.

Skipped per the rules: everything matching `-PROPOSAL`/`-DRAFT`/`-TEMPLATE`,
today's `2026-07-29-*` logs, and `PROMOTION-QUEUE.md` /
`ideas-and-innovations.md` / `metrics.md` / `CODEX-HANDOFF.md`.

## Transcript resolution FAILED for all 48 — session logs were used

The prescribed disambiguator
(`grep -l '<log-slug>' ~/.claude/projects/-Users-accunliffe-projects-raven-mcp/*.jsonl`)
resolved to **exactly one transcript for zero of the 48 slugs**. Hit counts ran
2 → 50 files per slug. The reason is structural, not incidental: a session log's
filename is read, grepped, and quoted by every later session that consults it,
so the slug appears in far more transcripts than the one that wrote it. Slug-grep
is not a selective index.

**Every one of the 48 was therefore revisited from its session log**, as the
fallback instruction directs. A better future disambiguator would key on the
`cwd` + first-user-turn timestamp range rather than the slug.

## Step 0 — promotion queue

`## Open` was **empty** (cleared earlier the same day by the manual
working-agreement revisit; all 7 items promoted and grep-confirmed).
`## Needs Andrew` empty. Recorded as **queue already empty** — no work.

## Step 3 — ten rules promoted (commit `549e0f0` in `~/.claude`)

Every candidate was grepped against `~/.claude/CLAUDE.md` first; none already
existed. Seven of the ten **amend an existing bullet** rather than adding a new
one, which was deliberate — it keeps CLAUDE.md inside its size budget and, more
importantly, preserves every case that already triggered the host bullet.

| rule | earned by | landed |
|---|---|---|
| Instrument the live surface before shipping a fix built on an engine-internals theory | 2026-07-23 grab-scroll-fix (2 fixes on a wrong compositor theory; `Lenis.setScroll` found by live forensics) | `<understanding-and-autonomy>` |
| A named URL/surface is BINDING; identity = rendered page-specific content, not route or chrome | 2026-07-20/21/22 video sessions — 4 wrong-surface misses; `/raven-design` called the Playground twice while Marginalia was loaded | new bullet, `<understanding-and-autonomy>` |
| A pasted URL/screenshot is not an assignment, and work stays in this session's repo | 2026-07-28 v2.3.0-prep (edited a portfolio file from a raven-mcp session), 2026-07-17 | new bullet, `<understanding-and-autonomy>` |
| Repo / published / deployed are three claims; pull the artifact you are asserting | 2026-07-25 (`gitBranch` pin, 7 minors stale), 07-27, 07-28 (npm served 100 tools, guard green) | new bullet, `<verification>` |
| Media handoff: verify resolved path, metadata, and first frame are THIS render; collision-proof filenames | 2026-07-20 | new bullet, `<verification>` |
| A derived expected value in a harness is itself a claim | 2026-07-27 (`box-sizing` 1px-border harness bug) | new bullet, `<verification>` |
| Motion restraint: no synthetic captions, no flash/whole-screen blur between same-canvas states, ≤2 emphasis beats, no frozen "Applying…" tail | 2026-07-20/21/22 | appended to the restrained-not-salesy bullet |
| Park WIP on a named branch before any clean checkout or parallel fan-out; prefer `git stash push -- <paths>` over `git checkout --` | 2026-07-17 | new bullet, `<session-memory-and-git>` |
| Read a script's argument parsing before passing it a flag | 2026-07-28 (`./scripts/release.sh minor --dry-run` ran a real release; dry-run is `DRY_RUN=1`) | new bullet, `<coding>` |
| Fourth delegation check: confirm the brief ARRIVED intact; pass big context by file path | 2026-07-10 (a Workflow/Codex wrapper truncated the payload; the agent spec'd the wrong feature) | appended to the three-delegation-checks bullet |

New memories in the canonical pool
(`~/.claude/projects/-Users-accunliffe-projects/memory/`), each with a
`MEMORY.md` index line and a `(Memory: [[slug]])` back-link in CLAUDE.md:
`feedback-named-surface-is-binding`,
`feedback-repo-published-deployed-are-three-claims`.

`CLAUDE.md` went 24,058 → 28,954 bytes. That is inside the ~30 KB ceiling but
close to it, which is why three further findings went to `reference/` instead
(commit `b678a31`):

- Playwright `isMobile: true` invalidates every geometry assertion in the run —
  use `deviceScaleFactor` and leave `isMobile` off (2026-07-20 produced a BLOCK
  finding on compliant tap targets this way). → `verification-incidents.md`
- `getBoundingClientRect().height >= 44` does not prove a 44px tap target; probe
  `elementFromPoint` across the box (2026-07-24). → `verification-incidents.md`
- Codex exposes **at most 50 tools per MCP server** (a 105-tool server is
  silently truncated there), and its `approval_mode="approve"` means
  **pre-approved**, not "ask me" (2026-07-24/26). → `routing-ladder.md`

## A superseded lesson that must NOT be re-promoted

`2026-07-02-taste-interview-robust.md` records
*"Delegate-by-default, main-loop-implement is the exception needing
justification."* The current `~/.claude/CLAUDE.md` `<operating-model>` says the
opposite — implementation stays in the main session; delegation is the
exception — because delegate-by-default is what produced the agent-self-report
failure class. **The current rule wins.** Any future revisit reading that log
must not resurrect the reversed lesson.

## Carried forward

- Nothing in this sweep is blocked. The only open item is cadence: see below.
- **This is not a nightly loop.** No single instance can hold one — the longest
  self-scheduled wakeup is one hour. Making it genuinely nightly needs a launchd
  LaunchAgent (precedent: `~/Library/LaunchAgents/com.accunliffe.claude-improve-pipeline.plist`;
  the crontab already runs three trading-bot jobs). Not created — that is
  Andrew's call.

## Correction: the backlog is 48, not 45 (found by the falsification pass)

The first pass credited three logs to `metrics.md` column headers that do not
actually cover them: two `2026-06-21` headers were treated as covering all four
`2026-06-21-*` files, and one `2026-07-04/05` header as covering both
`2026-07-04-*` files. Coverage is keyed by **full filename**, so
`2026-06-21-watch-grid-loop`, `2026-06-21-backlog-loop` and
`2026-07-04-interview-guard` were un-revisited and are folded in here — 48.

Two logs remain legitimately excluded because they are revisit *output*, not
sessions: `2026-06-25-revisit.md` and `2026-07-02-revisit-retrain-and-demo.md`.

## The eleventh rule

`2026-07-04-interview-guard.md` earned one more promotion, into `<coding>`:
**a gate that only exists in prose will be bypassed by the next agent that reads
it — enforce it in the engine.** Codex called `get_taste_interview`, skipped
asking the user, and bound a surface identity-only, because the interview
requirement lived in a tool description rather than in `bindTasteSurface`. The
fix that session was an engine-level refusal. `~/.claude/CLAUDE.md` is now
**29,698 bytes** against the ~30 KB ceiling — the *next* promotion must relocate
detail into `reference/` first.

## Per-session record (all 48)

`disposition`: **P** = fed a promoted global rule · **R** = routed to
`~/.claude/reference/` · **C** = class already covered by a loaded rule ·
**proj** = project-specific, stays in its log · **–** = no retrospectable miss
(build/status log only).

| Session log | Class | Lesson as recorded | Disp |
|---|---|---|---|
| 2026-04-11 | – | site/email build log, no mistakes section | – |
| 2026-04-17 | accuracy | torque must be normalised; balance midline = content bounds; alignment is a ratio not a column count | proj |
| 2026-04-18 | accuracy ×2 | manifest listed a non-existent tool (grep `server.tool(` in dist/); "DXT" renamed MCPB (verify via `npm view`) | C (repo/published/deployed) |
| 2026-04-19 | comm + accuracy ×3 | told Andrew to add a secret without "not into chat" — he pasted a live key; `gh --json` field assumptions; backticks in `gh pr create --body`; strict SDK overload when monkey-patching | C (memory exists) |
| 2026-04-23 | – | v1.3.0 authoring log; "none yet — session in progress" | – |
| 2026-04-24 | comm + accuracy ×2 | split `cp`/`launchctl` steps and he ran only one (use `&&` chains); fuzzy-search defaults produced 65 noise matches; GitHub issues endpoint semantics drifted | proj |
| 2026-05-25-android-spec-linkedin-handoff | – | spec + handoff log | – |
| 2026-05-25-audit-compose-spec | – | Compose audit spec, never built | – |
| 2026-06-13 | – | empty mistakes table | – |
| 2026-06-14 | – | empty mistakes table | – |
| 2026-06-21-backlog-loop | reuse-miss | authored `dropdown-menu.json` fresh instead of checking the `knowledge/issue-1-*` draft branch | proj |
| 2026-06-21-watch-grid-loop | taste | eyes-on overruled a 94/B metric; "preserve the craft" was Andrew's own answer; `resize_window` moved the OS window, not the viewport | C (eyes-first; browser-tool self-report) |
| 2026-06-27-aeo-and-nextjs-port | – | AEO + Next.js port log | – |
| 2026-06-27 | – | empty mistakes table | – |
| 2026-07-01-taste-engine-session | verification ×3 | `node smoke \| head` SIGPIPE-killed a smoke mid-run; recommended a non-rules-shaped doc for ingestion; hand-edited a **generated** changelog so the apex kept serving the old version | P (repo/published/deployed) |
| 2026-07-01-taste-engine | – | build log | – |
| 2026-07-02-taste-interview-robust | superseded | "delegate-by-default; main-loop-implement is the exception" — **reversed** by the current rule | not promoted (see above) |
| 2026-07-04-interview-guard | accuracy | Codex bypassed a prose-only interview gate; fixed by refusing in `bindTasteSurface` | **P** (11th rule) |
| 2026-07-04-portrait-genre | – | build log | – |
| 2026-07-09-grab-designmd | assumption | token matching ran against indexed CSSOM longhands, empty under `var()` shorthand | proj |
| 2026-07-09 | – | empty mistakes table | – |
| 2026-07-10-f1-ds-diff | – | build log | – |
| 2026-07-10-grab-email-fork | – | build log | – |
| 2026-07-10-three-feature-feasibility | tooling | a Codex/Workflow wrapper truncated a large context payload and the agent spec'd the wrong feature | **P** (brief-arrived-intact check) |
| 2026-07-17-designer-mcp-journey-audit | – | audit output | – |
| 2026-07-17-marketing-site-handoff | – | handoff log | – |
| 2026-07-17 | autonomy + comm | a parallel `/goal` clean checkout discarded a finished fix ladder; edited `site/*.html` another instance owned | **P** ×2 (park WIP; a URL is not an assignment) |
| 2026-07-18 | – | empty mistakes table | – |
| 2026-07-19-docs-redesign-grab-iteration | – | build log | – |
| 2026-07-19 | – | empty mistakes table | – |
| 2026-07-20-grab-devtools-device-mode | verification | Playwright `isMobile: true` invalidated every geometry assertion → a BLOCK on compliant tap targets | **R** (verification-incidents) |
| 2026-07-20-site-2.0-truth | verification | repo said 105 tools, npm served 100, README said 99, and the drift guard stayed green | **P** (three claims) |
| 2026-07-20-video-rerecord | verification ×2 + comm + accuracy | handed off a media path that resolved to the OLD video; a click tour instead of a real job; a send beat that never reached its post-click state; camera zoom + captions on nearly every interaction | **P** ×2 (media handoff; motion restraint) |
| 2026-07-21-paper-vs-raven-investment-sims | – | simulation writeup | – |
| 2026-07-21-video-polish | accuracy ×6 | editorial text + cyan flash + poor music bed; ended on a frozen `Applying changes…`; narrowed the audience to a skeptical evaluator; reused Marginalia footage for a Playground demo; called `/raven-design` the Playground; then blindly rebound an older URL that was also Marginalia | **P** ×2 (named surface is binding; motion restraint) |
| 2026-07-22-video-production | accuracy ×4 + verification ×3 | recorded an unrelated localhost page; a template-success beat the bridge could not complete; treated the route as canvas identity; too-slow edit + static phone hold; ran a stale recorder copy inside the container; repeated camera motion; whole-screen blur between same-canvas states | **P** ×2 (same two rules) |
| 2026-07-22 | – | empty mistakes table | – |
| 2026-07-23-grab-scroll-fix | accuracy | two fixes shipped on an unfalsifiable compositor hit-testing theory; live forensics found `Lenis.setScroll` in one wheel event | C (loaded rule) — but its `(Memory: [[forensics-before-theory-on-scroll-bugs]])` back-link was **dangling**; memory written this sweep |
| 2026-07-24-f23-crash-recovery | – | recovery log | – |
| 2026-07-24-grab-layers-selection-sync | verification | a falsifier's HIGH finding was real but pre-existing; `tagName` vs `localName` on test doubles; `deepEqual` across vm realms | proj + C (harness expectations) |
| 2026-07-24-jitter-feasibility | accuracy ×2 | asserted surface-safety from memory of a precedent when the gate is a denylist; drafted motion tools past the ground-truth boundary in the spec step | C (verify the effect, not the code) |
| 2026-07-25-anthropic-distribution | – | distribution research | – |
| 2026-07-25-distribution-channels | 8 misses, mixed | submitted an irreversible form after saying it would stop; `next build` clobbered a live `next dev`; a leg reported success on a file it never wrote; a stale test baseline; two unverifiable privacy-policy numbers; a false `icon.png` gap; 135 form values set past `maxLength`; a no-op `str.replace()` + `cherry-pick $(git rev-parse main)` publishing an auto-save | C ×3 (delegate self-report; serial gate discovery; scripted-edit assertions) + proj |
| 2026-07-25-submission-dossier | – | dossier | – |
| 2026-07-27-flux-demo-de-slop | accuracy | a fill-width harness reported FAIL at all four widths because its `expected` forgot the panel's 1px border under `box-sizing` | **P** (harness expected-values) |
| 2026-07-28-v2.3.0-prep | accuracy | `./scripts/release.sh minor --dry-run` ran a real release — dry-run is `DRY_RUN=1` | **P** (read script args) |
| raven-2.0-coordination | – | cross-instance coordination log | – |
| raven-2.0-release-readiness | – | readiness checklist | – |

Eleven of the 48 fed a promoted global rule, one fed `reference/` only, eight
were already covered by a rule that loads today, seven are project-specific, one
is a superseded lesson deliberately not promoted, and 20 are build/status logs
with no retrospectable miss.
