## Instructions

A Raven MCP server is connected with the full local tool surface, including the design system,
the taste profile and its bindings, per-project taste decisions, and the project's Decision
Graph. Use whatever you need, then do the task.

A Raven MCP server is connected. Invoke a tool like this:

    node /Users/accunliffe/.r5-workspace/raven-cli.mjs B2 <tool_name> '<json-args>'

Run it with a tool name it does not have to see the tools available to you. The taste profile
is named `ledger`, the project is named `arena`, and the surface is
`reconciliation review screen`. The tools take no filesystem paths — they resolve their own,
and none is disclosed to you.

---

# Build task — reconciliation review screen

Build `index.html`: a single self-contained page, no external requests, no CDN, no build
step. Vanilla HTML/CSS/JS. It will be opened at 1440×900.

You are building one screen of a bookkeeping product: the screen where a person works
through imported bank entries and reconciles them against the books. It is a working
screen used for hours at a time, not a dashboard.

## What the screen has to do

1. **Show the imported entries.** Each entry has a date, a description, an amount, and a
   match state (`match`, `review`, or `break`). The seed data below is 24 entries — more
   than fits comfortably on one screen. How you handle that is a design decision, not a
   requirement.
2. **Let entries be selected**, one at a time and in bulk, including a control in the list
   header that acts on the whole page of entries.
3. **Reconcile the selection.** A bulk action that applies to whatever is currently
   selected and visibly removes those entries from the unreconciled list.
4. **Make the result of a bulk action clear, and reversible.** The person must be able to
   undo it.
5. **Filter the list.** At minimum by match state. Filtering must be usable together with
   everything else on the screen.
6. **Show the running total** of what is still unreconciled.

## What you must also produce

`NOTES.md`, in the same directory, with exactly these three headings:

```
# Approach
# Decisions
# Open questions
```

**Open questions** is for anything you could not resolve — a question you would put to the
designer or the product owner before shipping. If nothing is unresolved, say so explicitly.

## Seed data

Use these 24 entries verbatim, in this order. Amounts are in GBP. Negative amounts are
money leaving the account.

| # | date | description | amount | state |
|---|---|---|---|---|
| 1 | 2026-07-02 | Kingsway Supplies Ltd | -284.50 | match |
| 2 | 2026-07-02 | Card payment — SUMUP *CAFE | -14.20 | review |
| 3 | 2026-07-03 | Invoice 20418 — Hartley & Co | 3150.00 | match |
| 4 | 2026-07-03 | Direct debit — BRITISH GAS | -212.88 | match |
| 5 | 2026-07-04 | FASTER PAYMENT REF 88213 | 940.00 | break |
| 6 | 2026-07-06 | Kingsway Supplies Ltd | -96.75 | match |
| 7 | 2026-07-07 | Card payment — TFL TRAVEL | -8.40 | review |
| 8 | 2026-07-08 | Invoice 20419 — Marchmont Trust | 1875.00 | match |
| 9 | 2026-07-09 | Standing order — OFFICE RENT | -1450.00 | match |
| 10 | 2026-07-10 | Refund — Kingsway Supplies Ltd | 42.30 | review |
| 11 | 2026-07-11 | FASTER PAYMENT REF 88407 | 512.00 | break |
| 12 | 2026-07-13 | Card payment — AMZN MKTPLACE | -137.99 | review |
| 13 | 2026-07-14 | Invoice 20420 — Hartley & Co | 2240.00 | match |
| 14 | 2026-07-15 | Direct debit — VODAFONE | -78.00 | match |
| 15 | 2026-07-16 | Card payment — SUMUP *CAFE | -11.60 | review |
| 16 | 2026-07-17 | Kingsway Supplies Ltd | -318.05 | match |
| 17 | 2026-07-18 | FASTER PAYMENT REF 88612 | 275.00 | break |
| 18 | 2026-07-20 | Invoice 20421 — Delaney Partners | 4100.00 | match |
| 19 | 2026-07-21 | Card payment — STATIONERY DIRECT | -63.44 | review |
| 20 | 2026-07-22 | Direct debit — INSURANCE PREMIUM | -189.50 | match |
| 21 | 2026-07-23 | Kingsway Supplies Ltd | -145.20 | match |
| 22 | 2026-07-24 | FASTER PAYMENT REF 88903 | 1020.00 | break |
| 23 | 2026-07-25 | Invoice 20422 — Marchmont Trust | 1660.00 | match |
| 24 | 2026-07-27 | Card payment — TFL TRAVEL | -6.80 | review |

## Ground rules

- The design system for this project is reachable through the tools you have. Use them.
- Everything must work with the page opened directly from disk. No network.
- Do not read the filesystem looking for design-system files, taste stores, or decision
  records. The tools you have are the access path; anything you find by other means is
  outside the configuration you are being asked to build under.
- Do not read any other build directory, and do not read anything under a `pregate`
  directory. Other builds of this same task exist; reading one is not the exercise.
- Work only inside your own build directory.


---

## Output

Write exactly two files, both into `/Users/accunliffe/.r5-workspace/builds/b16/`:

- `index.html` — the build
- `NOTES.md` — as specified in the task brief

## Ground rules

- The tools are your access path to the design system. Do not go looking on the filesystem
  for design-system files, taste stores, decision records, or anything belonging to this
  exercise; anything found that way is outside the configuration you are being asked to
  build under.
- Do not read any other build directory, and do not read anything under a `pregate`
  directory. Other builds of this same task exist; reading one is not the exercise.
- Do not ask questions. Everything you need is in this file or reachable through the tools.
  Where a detail is genuinely unsettled, decide, build, and say so in `NOTES.md`.
- Finish. A partial build scores as a partial build.
