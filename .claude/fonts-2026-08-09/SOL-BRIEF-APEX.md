# Adverse falsification brief — apex Untitled Sans migration (round 2)

Report only. Do not edit files. Priority-tag every finding P1/P2/P3.
Default to REFUTED if uncertain.

## Claim under audit

`https://ravenmcp.ai` (Vercel project `web`, Next.js, no git integration) now
serves Untitled Sans instead of Inter, and the deployment carrying it is live on
the apex alias.

## Evidence offered

1. `vercel inspect ravenmcp.ai` resolves to `dpl_BMVBSTpAT4hSMdhjabeTkZsLxa8m`,
   project `web`, target production, status Ready, created Sun Aug 09 2026
   20:14:03 PDT. Its alias list carries `https://ravenmcp.ai` and
   `https://www.ravenmcp.ai`. The immediately preceding production deployment
   was `dpl_8ZvZcPzVBKy8mHdVtAEEYUBApp8c`, created Jul 28, which served Inter.
2. The live CSS bundle moved from `/_next/static/css/097040637a2e6b5e.css` to
   `/_next/static/css/13d2bdb9d3d688bb.css`. Fetching the new bundle and
   extracting `font-family:__*` declarations yields exactly:
   `__JetBrains_Mono_`, `__JetBrains_Mono_Fallback_`, `__untitledSans_a`,
   `__untitledSans_Fallback_a`. No `__Inter_` declaration remains.
3. `curl https://ravenmcp.ai/ | grep -ci inter` returns 2, and both matches are
   inside ordinary words (`interfaces`, `get_taste_interview`), not font
   references.
4. Playwright (headed-equivalent, chromium, 1440x900) navigated to the apex,
   awaited `document.fonts.ready`, and reported for the hero `h1`:
   - computed stack `__untitledSans_a2f408, __untitledSans_Fallback_a2f408,
     -apple-system, "system-ui", "Segoe UI", sans-serif`
   - `document.fonts` enumeration: `__untitledSans_a2f408` at w=400, w=500 600
     and w=700 all `loaded`, plus `__untitledSans_Fallback_a2f408`; zero
     `__Inter_` entries of any status
   - canvas width discriminator at weight 700 / 88px on the hero string:
     real stack 1525.66px vs fallback-only 1393.91px. The control stack is
     built as `computedStack.split(',').slice(1).join(',')` — the real computed
     stack with only the FIRST family removed, so both sides share an identical
     downstream stack and differ solely by the custom family name.
5. A full-viewport screenshot was captured and inspected at full size; the
   rendered hero is visibly Untitled Sans, not Inter.
6. Source side: `web/app/layout.tsx` declares `localFont` over three woff2
   (`untitled-sans-regular/medium/bold`) with Medium declared across `500 600`
   so `font-weight: 600` roles resolve to real Medium rather than synthesizing.
   `variable: '--font-inter'` is deliberately retained so no consumer changed.
   `web/public/fonts/` holds exactly those three files.
7. Known residual, already found and NOT presented as clean:
   `web/public/demos/law-firm.html` and `web/public/demos/saas.html` still load
   Inter from Google Fonts and answer 200 live at
   `https://ravenmcp.ai/demos/saas.html`.

## Attack these specifically

- Does an alias appearing on a deployment's alias list actually prove that
  hostname is served by that deployment right now? What would distinguish a
  stale alias record from live routing?
- Can the `document.fonts` enumeration report a face as `loaded` while the
  element does not in fact render in it?
- Is the width discriminator sound given the control construction in item 4,
  or is there still a way for it to pass with the custom face absent?
- Next.js `next/font/local` hashes the family name. Could `__untitledSans_a2f408`
  be a hashed alias over font FILES that are not actually Untitled Sans — i.e.
  does anything here verify the bytes rather than the name?
- Retaining `variable: '--font-inter'` for the CSS custom property: any
  consumer this could silently break or leave pointing at something else?
- The three-file family has no 800/900 face. Enumerate every apex consumer that
  requests weight 800 or 900 and state what it now receives. Is any of it a
  synthesized faux weight?
- Beyond the two demo pages already named, is there any other publicly reachable
  route under the `web` project still serving Inter or a system fallback?
- Anything about a manual (non-git-integrated) `vercel deploy --prod` that makes
  the deployed tree differ from the committed tree.
