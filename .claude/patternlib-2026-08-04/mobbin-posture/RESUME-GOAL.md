Paste the block below into a fresh session.

---

/goal Get the pattern library to where I can test my own use case by hand: ask Raven for scroll-cue hero examples, see one with a picture and attribution, pick it. Everything below serves that.

First action: read /Users/accunliffe/projects/raven-mcp/.claude/patternlib-2026-08-04/mobbin-posture/RESUME-STATE.md. It is the complete measured state — work from it, don't restate it.

Ordering, and why. Two items first. Both cheap, both the same disease — a check whose failure mode is invisible:
1. The verification_failed fix is committed but UNTESTED: the suite count did not move when it landed (1353/1350 before and after), so no test looks at it. Write the tests that make it falsifiable — an unreadable reference directory must not report cleared, and the note sentence must not read as "records were left behind". Revert the fix in dist/ and confirm each new test goes red.
2. The adverse pass's #8 (the localBlockedHosts "only this test turns red" comment) looks right but is UNMEASURED — the mutant regex failed to apply to compiled dist (exit 9). Rewrite it to match the emitted `(0, node_fs_1.readFileSync)` form or mutate src/ and rebuild, measure how many tests actually fail, and correct the comment to the real blast radius.

Then in order: the #6 test hardenings (monotonicity fixture and the exact limit boundaries first — sharpest); the cheap #2 mitigation (re-check the blocklist immediately before the write — same shape as the still_present re-read); narrow the POLICY wording for #4 and #5 (never widen the code); write down a decision on #1's residual window; document the #7 prefix acceptance. Then attempt four of the seed capture, verbatim:

SEED_EXPECT="home-hero-scroll" RAVEN_NO_USAGE_LOG=1 node scripts/seed-reference.mjs \
  "https://lusion.co" 720 875 "scroll cue,hero,scroll to explore" "scroll-cue,hero" \
  "Scroll-to-explore cue centred under a full-bleed hero."

Attempt four is the cap. If it fails, stop and report the diagnosis — don't grind.

Out of scope: cross-process locking (the remedy for #1 and #2 — too large; #1 gets a written decision, not a lock), and anything that pushes to main — that deploys live mcp.ravenmcp.ai and is my call.

Done means, measurably: npm test green with the new tests in the count and every new test proven red under its own revert or mutant; #8's blast radius a measured number, not source-reasoning; CLAUDE.md count current; one real record in ~/.raven/references with thumbnail and attribution, or a stopped-at-four report; committed on explicit paths with the trailer, NOT pushed.

Constraints that carry: Codex is out of credits — adversarial and falsification passes go through `ow-run moonshotai/kimi-k3` or `ow-run z-ai/glm-5.2` (read ~/.claude/reference/routing-ladder.md first; hand a refuter one short claim by file path, not a tree). Repo is public and .claude/ is tracked — raw agent output only ever goes in .claude/**/agent-output/. Commit explicit paths after a fresh git status. Never push. Keep stash@{0} intact.

Two things only I can do before hands-on testing — say so up front, not when I hit them: restart/reconnect the MCP server (it is running stale code that silently drops taxonomy), and the corpus is empty until the seed lands. Also surface the product finding in the state file — twelve sites, one scroll cue, and the galleries that would find more are exactly what the blocklist refuses. That's my fork to call, not yours.
