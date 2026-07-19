# External benchmark results

External results score coverage of the corpus's labeled defect classes side-by-side without pretending that different tools use the same language. This is not a general head-to-head product comparison; see the caveat in `bench/README.md`. Store one human-graded JSON file per tool at `bench/external/<slug>.json`:

```json
{
  "tool": "tool-name",
  "version": "exact version",
  "graded_by": "grader name",
  "graded_at": "YYYY-MM-DD",
  "notes": "Run configuration; raw output: /preserved/path/tool-output.txt",
  "cases": [
    { "id": "manifest-case-id", "detected": true, "evidence": "Short quote from the tool output." }
  ]
}
```

Every case id in `bench/corpus/manifest.json` must appear exactly once. `detected` must be a JSON boolean. On a seeded case it records whether the tool detected the labeled defect class. On a clean-control case, `detected: true` means the tool flagged something actionable and counts as a false alarm. `evidence` is a short quote from the tool output that justifies the human grade, including for misses. Record the exact tool version, grader, grading date, and relevant run notes. Raw-output preservation is required: `notes` must name the path or URL where the tool's raw output is preserved. Validation rejects empty `notes` or notes without a path/URL-like token. This intentionally simple check forces the reference field; it does not prove authenticity or inspect the preserved output.

## Grading procedure

1. Build the project and serve the corpus pages using the same URLs and fixed case configuration that `bench/run.mjs` serves.
2. Run the external tool on every served corpus page. Preserve its raw output and record its path or URL in `notes`.
3. Read the output for each case and paste a short supporting quote into `evidence`.
4. Record `detected: true` only when the output identifies the labeled defect class, or flags something actionable on a clean control. Record `false` for every miss; do not omit misses.
5. Include every manifest id exactly once, then run `node bench/compare.mjs`.

External detection is human-graded. Do not automatically text-match competitor prose against `seeded_defect` strings.

## Fairness and interpretation

The corpus was self-authored with knowledge of Raven's audits and is biased toward Raven's rule vocabulary. This comparison measures coverage of these labeled defect classes, not overall product quality. It is not an independent validation set or a general product ranking.

Do not fabricate competitor data. `example-tool.json` is an intentionally incomplete synthetic template: its `detected` values are `null`, so validation rejects it until a human replaces every value with `true` or `false` and fills in real metadata and evidence. The default repository run skips that ungraded shipped template and writes a Raven-only comparison; copied or renamed null templates fail with a pointer back to this document.
