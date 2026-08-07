# Adversarial brief — pattern-library hardening round (2026-08-06)

You are a skeptic. Try to REFUTE each claim below. Default to "refuted" when
uncertain. Read the named files cold; do not trust the claims' own framing.

Files:
- docs/PATTERN-LIBRARY-POLICY.md (sections "Where captures come from")
- src/reference-blocklist.ts (header comments)
- src/reference-store.ts (saveReference pre-write re-check; deleteReferencesByHost
  DECISION block; fieldMatchesTerm prefix comment)
- test/reference-blocklist.test.mjs (mid-call test, EACCES test, doc-reading
  gallery test)
- test/reference-store.test.mjs (round-trip on-disk loop, 8000/8001, 200-boundary
  tests, two-record monotonicity test)

Claims to refute:

1. The doc-reading gallery test holds docs/PATTERN-LIBRARY-POLICY.md and
   GALLERY_HOSTS equal in BOTH directions — a gallery added to only one side
   turns it red. Find an edit to either side that drifts silently.
2. The pre-write re-check in saveReference actually brackets the validation
   window: a host added to the local do-not-capture file between the entry
   check and the write is refused. Find a path where a blocked host still
   lands on disk (other than the documented few-syscall residual).
3. The mid-call test's anchoring assumption (first env read inside
   saveReference is the entry check's) is currently true of the source. Refute
   by finding an earlier env read.
4. The #4/#5 policy rewrite narrows WORDING only — no code behaviour changed
   with it. Find a behaviour change smuggled in.
5. The two-record monotonicity fixtures are inert: neither selector nor any
   other field gives the combined query an unintended hit. Find a confounder.
6. The #1 DECISION comment's harm bound ("one stale success on the first
   takedown, self-heals") is accurate. Find a worse concrete harm inside the
   accepted window.

Output: per claim, SURVIVES or REFUTED with the exact file:line evidence.
No fixes; report only.
