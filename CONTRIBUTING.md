# Contributing to Raven MCP

Thanks for the interest. Raven is a personal project that ships design intelligence into Claude — principles, patterns, tokens, content systems, research methods, service blueprints. Almost every contribution falls into one of three shapes: a new knowledge entry, a bug fix, or a new tool.

## Scope of contributions

- **Knowledge entries** — new principles, patterns, design systems, content systems, research methods. This is the most common contribution and the easiest to land.
- **Bug fixes** — schema errors, missing tokens, broken cross-references, MCP protocol issues, packaging bugs.
- **New tools** — new MCP tools exposed by the server (e.g. a new `get_*` or `audit_*` handler). Open an issue first to discuss the shape before writing one.

## Knowledge entries

Knowledge lives as JSON files under `src/data/`:

- `src/data/principles/` — design principles (e.g. Nielsen heuristics, Laws of UX)
- `src/data/patterns/` — interaction and UI patterns
- `src/data/tokens/` — design systems (colors, type, spacing, motion)
- `src/data/content/systems/` — content design systems and voice guides
- `src/data/content/principles/` — writing principles
- `src/data/research/` — research methods
- `src/data/service-design/` — service patterns and standards
- `src/data/brand/` — brand systems
- `src/data/business/` — strategy frameworks

Use an existing file as a structural template — for example `src/data/principles/nielsen-heuristics.json` for principle collections, `src/data/content/systems/atlassian.json` for content systems, `src/data/tokens/material.json` for design token sets. Match the existing schema; don't invent new fields without a reason.

Every entry must include a `sources` array. Each source should be the canonical URL for the underlying work — a primary academic citation, an official documentation page, or a publisher page. Don't cite secondary aggregators if a primary source exists.

If you're adding a system named after a real company or org, only include material that is either (a) original commentary, or (b) published under a license that permits redistribution under Apache-2.0, including commercial use. When in doubt, paraphrase from the public source rather than copying.

### Adding a new design system, content system, or principle

1. Copy an existing file in the same category as a template.
2. Replace the contents. Keep the same top-level shape — `id`, `name`, `category`, `summary`, `description`, `implications`, `violations`, `applies_to`, `sources`.
3. Register it in the matching `registry.json` if the category has one (e.g. `src/data/content/systems/registry.json`).
4. Rebuild and run the server to verify it loads: `npm run build && npm run dev`.
5. If the entry derives from a third-party source, declare that source and its license in the PR description and add an attribution line to `NOTICE`.

## Code contributions

```
git clone https://github.com/rhinocap/raven-mcp.git
cd raven-mcp
npm install
npm run build
npm run dev
```

Open a PR against `main`. Keep diffs focused — one logical change per PR. Include a one-line summary in the PR title and a short body explaining the why.

For tool changes, update the manifest, the README tool list, and the LAUNCHGUIDE in the same PR so they stay in sync.

## Licensing and contributor agreement

Raven is licensed under Apache-2.0. By submitting a contribution you agree that it is your own work (or work you have the right to submit), that it is licensed inbound under Apache-2.0, and that you grant the project maintainer a perpetual, worldwide, royalty-free right to relicense or dual-license your contribution — including in commercial or closed-source distributions of this project's successors. This keeps the project free to evolve its licensing without tracking down every past contributor. If you can't agree to that, don't submit the contribution.

If your contribution is derived from a third-party source:

- Declare the source and its license in the PR description.
- Add an attribution entry to the `NOTICE` file in the same PR.
- Only submit content from sources whose licenses permit redistribution under Apache-2.0, including commercial use (most permissive licenses, public domain, and works you authored yourself qualify; CC BY-NC, CC BY-NC-ND, and similar non-commercial or no-derivatives licenses do not — rewrite in original prose and cite the underlying primary source instead).

If you're not sure whether a source is compatible, open an issue before doing the work.

## Bug reports

File issues at https://github.com/rhinocap/raven-mcp/issues. Include:

- Raven version (`npx raven-mcp --version` or check `package.json`)
- What you ran, what you expected, what you got
- Any console errors or stack traces

## Contact

Drew Cunliffe — drew@ravenmcp.ai
