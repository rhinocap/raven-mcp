# Docs redesign — concept round (July 2026)

Eight standalone HTML concepts for the `/docs` page, generated 2026-07-18/19.
Each is self-contained: open it in a browser, no build step.

`sol3-raven.html` is the one that shipped. It became `web/app/docs/page.tsx` +
`web/app/docs/docs.css` on the `site-audit-polish-wt` branch, merged to `main`
in `ed944f9` (PR #51). Its distinguishing moves — the numbered field index in
the left rail, the "Machine register" panel on the right, and the
"Design judgment, available at the prompt." hero — are all live.

| File | Line |
|---|---|
| `sol-1.html` | dense, table-forward |
| `sol-2.html` | card grid |
| `sol-3.html` | field index + machine register — **the direction that won** |
| `sol3-raven.html` | sol-3 with Raven's own type and color applied — **shipped** |
| `fable-1.html` | editorial, long-form |
| `fable-2.html` | sidebar-driven |
| `fable-3.html` | split-pane reference |
| `hybrid-sol2-fable3.html` | sol-2 grid with fable-3's reading pane |

Kept because the reasoning behind the shipped page is not recoverable from the
shipped page: seven of these show what was considered and set aside, which is
the part that gets re-litigated later.

Not shipped to npm — `package.json`'s `files` array does not include `docs/`.

## One decision that did not survive

The branch also carried an unmerged tweak to the prose-link hover in
`site/index.html`:

```css
/* branch: hue shift on hover */
.layer-card p a { color: var(--text-accent); transition: color 200ms; }
.layer-card p a:hover { color: var(--bg-accent-hover); }
```

`main` keeps the quieter version instead — the link color holds steady and only
the underline appears:

```css
.layer-card p a { border-bottom: 1px solid transparent; transition: border-color 200ms; }
.layer-card p a:hover { border-bottom-color: var(--text-accent); }
```

Recorded here so the hue-shift version does not get reintroduced as a fix.
