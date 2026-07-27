# SaaS demo hero video — regeneration (July 2026)

`assets/video/demos/saas.mp4` was wedding-reception footage: white roses,
glassware, string lights. One commit, one blob — it was never right, and it
duplicated `wedding.mp4`'s scene while sitting on the Flux developer-analytics
demo page. Replaced 2026-07-27.

## The pattern the set follows

Each demo clip is **the environment of the business its page sells** — a law
office, a café, a villa, a gym, a wedding. Not a metaphor. So the sibling for a
developer-analytics product is a software workspace, shot in the same register.
Worth stating because the first instinct is to avoid "developer at a desk" as a
cliché and reach for an abstraction; that produces something that matches
nothing else in the set.

## Measured treatment spec

Derived from the five correct clips with `ffprobe` and `signalstats`, not by eye.

| Property | Value |
|---|---|
| Container | H.264 mp4, yuv420p, `+faststart` |
| Frame | 1280×720, 24 fps, exactly 8.000 s / 192 frames |
| Bitrate | siblings span 0.57–2.0 Mbps |
| Grade | YAVG 78–114, SATAVG 6.8–22.1 — warm highlights, cool shadows, lifted blacks |
| Motion | one continuous move on ONE axis, or locked-off with one physical event; decelerates to rest in the last 2 s; no cuts, no reversal |
| Light | one low warm key behind or three-quarter-behind the subject; no second key; cool dim ambient fill only |
| Optics | a soft near-plane element in the bottom third the camera looks past, plus something in the air (haze, dust, steam, bokeh) |
| Safe area | payoff inside x 8–92%, y 21–79%; hero at x 40–65% |
| Poster | `saas.jpg` is **frame 0** — it must not jump when autoplay starts |

Two crops apply, so nothing load-bearing sits outside the safe area: the
homepage card cover-fits to 432×243 then crops to 365×243 at x=33; the page hero
crops 21.3% off top and bottom.

## What shipped

`p3-push.txt` — slow dolly push toward a desk at dusk, warm Edison practical
camera-left, bokeh'd city behind, mug and mechanical keyboard. Generated with
Google Veo 3.1 (`veo-3-1-fast`, 8 s, 16:9), measured **YAVG 89.9 / SATAVG 17.3**,
1.81 MB, watermark-free.

Chosen over the two alternates on the hero crop specifically: its upper half is
soft bokeh, which is a clean bed for headline type.

- `p1-locked.txt` — locked-off desk at dusk. Equally clean and in-band
  (Y 93.9 / S 20.8) but only the steam moves across 8 seconds, so it risks
  reading as a still.
- `p2-truck.txt` — lateral track at golden hour. **Rejected**: the monitors are
  unmistakably iMac silhouettes with Apple's aluminium stand, the windows blow
  to near-white (Y 124.1, above every sibling) and would fight white headline
  type, and there is a green lens-flare artifact bottom-left.

Kept because the prompt that produced a shipped marketing asset is not
recoverable from the asset, and because the rejection reasons are the kind of
thing that otherwise gets re-litigated.

Not shipped to npm — `package.json`'s `files` array does not include `docs/`.
