# /goal — web changelog: keep continuation paragraphs, fix AA contrast, ship

Approval: Andrew, 2026-09-24, "write yourself a /goal to fix these" over a list that named push + apex deploy. Covers this goal's push of main and one `vercel deploy --prod` from web/. No email, no Release edit, no workflow dispatch.

OUTCOME
1. A multi-paragraph CHANGELOG bullet reaches web/data/changelog.json whole: `leadParagraphs` (scripts/release-notes.mjs) keeps continuation paragraphs, joined by "\n\n"; the feed renders them as separate paragraphs inside the same <li>. v2.6.0's entry regenerated from the 2.6.0 block; older entries are as-shipped facts and stay untouched.
2. Changelog text meets WCAG AA 4.5:1. Cause: changelog.css sets `--text-tertiary: var(--text-muted-deep)` (#5C5F68) at :root, used by .cl-date (2.19:1) and .cl-eyebrow; .cl-badge base text #9498A0 sits at 4.37:1 on its 3% white fill. Fix: a scoped `--cl-text-meta` (#A6AAB2: 5.99:1 on card, 5.5:1 on badge) for date, eyebrow and base badge text. Decorative dots keep their grey.
3. The two local session-log commits plus these fixes pushed to origin/main; web/ deployed to apex; live https://ravenmcp.ai/changelog shows the v2.6.0 second paragraphs and Raven audit_url reports 0 contrast/aa errors.

GATES
- Tests updated where they pinned "leads only"; new test for multi-paragraph bullets; focused + full suite (`RAVEN_NO_USAGE_LOG=1 npm test`), read the ℹ lines.
- `npm run check:site` passes; web build passes; Chromium capture before/after.
- Commits by explicit pathspec; never include conversations/2026-09-23-client-overlay-goal.md or test/fixtures/thumb-session-*.
- Before push: `git log origin/main..HEAD` holds only this session's commits.
- design-judge + one Opus 5.5 report-only falsification pass before the completion claim.
