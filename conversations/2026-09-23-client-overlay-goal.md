# 2026-09-23: Raven client overlay /goal

Request (Andrew): write a /goal prompt from `Raven Studio/Raven Client Overlay Spec.md`, with the engineering workflow set out as a graph. The key requirement is that a nontechnical client on their own computer opens their business site from a link or a dashboard button, sends edits through a Raven overlay, and the requests reach Andrew.

Output: `Raven Studio/Raven Client Overlay — Goal.md` in the Obsidian vault, opened in Obsidian. It covers spec stages 0 and 1, with stages 2 and 3 as follow-on goals.

Decisions written into the goal:
- D1: the review service is a separate app and Vercel project (`raven-review`).
- D2: client mode is a `mode:"client"` in `browser/raven-grab.js`. The review service serves a pinned copy, so no npm release is needed.
- D3: one shared, frozen transport contract.
- D4: the fragment → POST → host-only cookie handoff from the spec.
- D5: uploads are verified from the bytes and handed to the worker with `sourcePath:null`.
- D6: the receipt shows only after the commit lands, and notifications go through an outbox.

Human gates Andrew needs to clear:
- G1: Neon and a private Blob store.
- G2: the review Vercel project and its domain.
- G3: the Resend domain.
- G4: preview protection and a shareable link.
- G5: two test invite addresses.

Facts checked before writing:
- `attachmentPrecondition()` is at `browser/raven-grab.js:4292`. It blocks attachments when `grabEndpoint` is set (`:4294`).
- raven-studio has staged and uncommitted work on `main`.
- This repo has uncommitted release-pipeline work.
- Both must go onto WIP branches before any worktree is created.

No code changed in either repo.
