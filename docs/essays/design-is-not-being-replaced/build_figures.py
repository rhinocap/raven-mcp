#!/usr/bin/env python3
"""Build the four editorial SVG plates for 'Design Isn't Being Replaced' (Part 1).

Every plate is self-contained: inline <style>, subset Untitled Sans inlined as
base64, one --fig-* token namespace shared across all four.
"""
import base64
import math
import pathlib

D = pathlib.Path("/Users/accunliffe/projects/raven-mcp/docs/essays/design-is-not-being-replaced")
FONTS = D / "fonts"

b64 = lambda p: base64.b64encode((FONTS / p).read_bytes()).decode()
US_REG, US_MED = b64("us-regular.subset.woff2"), b64("us-medium.subset.woff2")

# ---------------------------------------------------------------- shared chrome

FONT_FACE = f"""
@font-face{{font-family:'Untitled Sans';src:url(data:font/woff2;base64,{US_REG}) format('woff2');font-weight:400;font-style:normal;font-display:swap}}
@font-face{{font-family:'Untitled Sans';src:url(data:font/woff2;base64,{US_MED}) format('woff2');font-weight:500 600;font-style:normal;font-display:swap}}
""".strip()

# Token block. Each token resolves an outer override first, so setting
# --essay-fig-* on any ancestor retints all four plates at once.
TOKENS = """
svg.fig{
  --fig-ground: var(--essay-fig-ground, #0E1013);
  --fig-ink:    var(--essay-fig-ink,    #E8EAED);
  --fig-muted:  var(--essay-fig-muted,  #8A9299);
  --fig-accent: var(--essay-fig-accent, #7E9CB8);
  --fig-rule:   var(--essay-fig-rule,   #2B3036);
  --fig-wash:   var(--essay-fig-wash,   #7E9CB8);
  --fig-wash-o: var(--essay-fig-wash-o, 0.14);
  --fig-font:   var(--essay-fig-font,   'Untitled Sans');
  --fig-fs-marker: var(--essay-fig-fs-marker, 13);
  --fig-fs-title:  var(--essay-fig-fs-title,  27);
  --fig-fs-label:  var(--essay-fig-fs-label,  15);
  --fig-fs-axis:   var(--essay-fig-fs-axis,   14);
  --fig-fs-value:  var(--essay-fig-fs-value,  18);
  --fig-fs-total:  var(--essay-fig-fs-total,  36);
  --fig-fs-note:   var(--essay-fig-fs-note,   13);
  --fig-hair:      var(--essay-fig-hair,      1);
  --fig-stroke:    var(--essay-fig-stroke,    2);
}
/* Rendered narrow, the plate scales down with its viewBox; the type scale is
   re-tuned in user units so nothing lands under 10 CSS px down to a 348px
   render width (a 380px viewport inside the contact sheet's gutters). Every
   narrow value takes an outer override too, so one ancestor retints and
   re-scales the whole set at both widths. */
@media (max-width: 480px){
  svg.fig{
    --fig-fs-marker: var(--essay-fig-fs-marker-sm, 21);
    --fig-fs-title:  var(--essay-fig-fs-title-sm,  34);
    --fig-fs-label:  var(--essay-fig-fs-label-sm,  23);
    --fig-fs-axis:   var(--essay-fig-fs-axis-sm,   22);
    --fig-fs-value:  var(--essay-fig-fs-value-sm,  26);
    --fig-fs-total:  var(--essay-fig-fs-total-sm,  56);
    --fig-fs-note:   var(--essay-fig-fs-note-sm,   21);
    --fig-hair:      var(--essay-fig-hair-sm,      1.6);
    --fig-stroke:    var(--essay-fig-stroke-sm,    3);
  }
  svg.fig .drop-narrow{ display:none }
}
"""

TYPE = """
svg.fig text{ font-family: var(--fig-font, 'Untitled Sans'); fill: var(--fig-ink, #E8EAED);
  font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1 }
svg.fig .marker{ font-size: calc(var(--fig-fs-marker, 13) * 1px); font-weight: 500;
  letter-spacing: 0.14em; fill: var(--fig-muted, #8A9299) }
svg.fig .title{ font-size: calc(var(--fig-fs-title, 27) * 1px); font-weight: 500; letter-spacing: -0.012em }
svg.fig .label{ font-size: calc(var(--fig-fs-label, 15) * 1px); font-weight: 400 }
svg.fig .label-key{ font-size: calc(var(--fig-fs-label, 15) * 1px); font-weight: 500 }
svg.fig .axis{ font-size: calc(var(--fig-fs-axis, 14) * 1px); font-weight: 400; fill: var(--fig-muted, #8A9299) }
svg.fig .value{ font-size: calc(var(--fig-fs-value, 18) * 1px); font-weight: 500 }
svg.fig .total{ font-size: calc(var(--fig-fs-total, 36) * 1px); font-weight: 500;
  fill: var(--fig-accent, #7E9CB8); letter-spacing: -0.02em }
svg.fig .note{ font-size: calc(var(--fig-fs-note, 13) * 1px); font-weight: 400; fill: var(--fig-muted, #8A9299) }
svg.fig .muted{ fill: var(--fig-muted, #8A9299) }
svg.fig .accent{ fill: var(--fig-accent, #7E9CB8) }
svg.fig .flag{ font-size: calc(var(--fig-fs-label, 15) * 1px); font-weight: 500;
  letter-spacing: 0.16em; fill: var(--fig-accent, #7E9CB8) }
svg.fig .rule{ stroke: var(--fig-rule, #2B3036); stroke-width: calc(var(--fig-hair, 1) * 1px) }
svg.fig .axisline{ stroke: var(--fig-muted, #8A9299); stroke-width: calc(var(--fig-hair, 1) * 1px) }
svg.fig .series-a{ fill: none; stroke: var(--fig-accent, #7E9CB8);
  stroke-width: calc(var(--fig-stroke, 2) * 1px); stroke-linecap: round; stroke-linejoin: round }
svg.fig .series-b{ fill: none; stroke: var(--fig-ink, #E8EAED);
  stroke-width: calc(var(--fig-stroke, 2) * 1px); stroke-linecap: round; stroke-linejoin: round }
svg.fig .marker-line{ stroke: var(--fig-accent, #7E9CB8); stroke-width: calc(var(--fig-hair, 1) * 1px);
  stroke-dasharray: 3 4 }
svg.fig .wash{ fill: var(--fig-wash, #7E9CB8); fill-opacity: var(--fig-wash-o, 0.14) }
svg.fig .seat{ fill: var(--fig-muted, #8A9299) }
svg.fig .seat-empty{ fill: none; stroke: var(--fig-accent, #7E9CB8);
  stroke-width: calc(var(--fig-stroke, 2) * 1px); stroke-dasharray: 4 4 }
svg.fig .table-edge{ fill: none; stroke: var(--fig-muted, #8A9299);
  stroke-width: calc(var(--fig-hair, 1) * 1px) }
"""


def plate(n, w, h, title, desc, body, extra_css=""):
    tid, did = f"fig{n}-title", f"fig{n}-desc"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" class="fig" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="{tid} {did}" preserveAspectRatio="xMidYMid meet">
<title id="{tid}">{title}</title>
<desc id="{did}">{desc}</desc>
<style>
{FONT_FACE}
{TOKENS.strip()}
{TYPE.strip()}
{extra_css}
</style>
<rect width="{w}" height="{h}" fill="var(--fig-ground, #0E1013)"/>
{body}
</svg>
"""


def head(n, title, w=720):
    """Figure marker, title, and the rule that sits under it."""
    return f"""  <text class="marker" x="56" y="48">FIG. {n:02d}</text>
  <text class="title" x="56" y="98">{title}</text>
  <line class="rule" x1="56" y1="124" x2="{w - 40}" y2="124"/>"""


def path_from(pts):
    return "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)


# --------------------------------------------------------------- plot geometry
X0, X1 = 56.0, 680.0
SPAN = X1 - X0
YEAR0, YEAR1 = 2014, 2032
YBASE = 392.0


def yr(y):
    return X0 + (y - YEAR0) / (YEAR1 - YEAR0) * SPAN


def axis(ticks, now_year=None):
    out = [f'  <line class="axisline" x1="{X0}" y1="{YBASE}" x2="{X1}" y2="{YBASE}"/>']
    for i, t in enumerate(ticks):
        x = yr(t)
        cls = ' class="drop-narrow"' if (now_year and t != now_year and i % 2 == 1) else ""
        anchor = "start" if t == ticks[0] else ("end" if t == ticks[-1] else "middle")
        out.append(f'  <g{cls}><line class="axisline" x1="{x:.1f}" y1="{YBASE}" x2="{x:.1f}" y2="{YBASE + 7}"/>'
                   f'<text class="axis" x="{x:.1f}" y="{YBASE + 28}" text-anchor="{anchor}">{t}</text></g>')
    return "\n".join(out)


# ============================================================ FIG 01
# Production cost: flat-high, steep collapse through NOW, flat-low after.
# Judgment cost: flat, and the production curve crosses it at NOW.
Y_HI, Y_LO, K, U0 = 158.0, 366.0, 9.0, 0.62
prod = [(X0 + u / 200 * SPAN, Y_LO + (Y_HI - Y_LO) / (1 + math.exp(K * (u / 200 - U0))))
        for u in range(201)]
U_NOW = (2026 - YEAR0) / (YEAR1 - YEAR0)
X_NOW = yr(2026)
Y_JUDGE = Y_LO + (Y_HI - Y_LO) / (1 + math.exp(K * (U_NOW - U0)))

fig01_body = f"""{head(1, "Production got cheap. Judgment didn&#8217;t.")}
  <line class="marker-line" x1="{X_NOW:.1f}" y1="150" x2="{X_NOW:.1f}" y2="{YBASE}"/>
  <text class="flag" x="{X_NOW + 10:.1f}" y="150">NOW</text>
  <line class="series-a" x1="{X0}" y1="{Y_JUDGE:.1f}" x2="{X1}" y2="{Y_JUDGE:.1f}"/>
  <path class="series-b" d="{path_from(prod)}"/>
  <circle cx="{X_NOW:.1f}" cy="{Y_JUDGE:.1f}" r="4" fill="var(--fig-accent, #7E9CB8)"/>
  <text class="label-key accent" x="{X1}" y="{Y_JUDGE - 16:.1f}" text-anchor="end">Cost of judgment</text>
  <text class="label-key" x="{X0 + 8}" y="{Y_HI + 32:.1f}">Cost of production</text>
{axis([2014, 2020, 2026, 2032], now_year=2026)}
  <text class="note" x="56" y="{YBASE + 62}">Vertical axis is relative cost, deliberately</text>
  <text class="note" x="56" y="{YBASE + 84}">unlabelled. The shape is the argument.</text>"""

# ============================================================ FIG 02
A = 3.0
Y_ATT, Y_TOP, Y_START = 300.0, 172.0, 344.0


def supply(u):
    return Y_START - (Y_START - Y_TOP) * (math.exp(A * u) - 1) / (math.exp(A) - 1)


sup_pts = [(X0 + u / 200 * SPAN, supply(u / 200)) for u in range(201)]
U_CROSS = math.log(1 + (Y_START - Y_ATT) / (Y_START - Y_TOP) * (math.exp(A) - 1)) / A
X_CROSS = X0 + U_CROSS * SPAN
wedge = [(x, y) for x, y in sup_pts if x >= X_CROSS]
wedge_d = path_from([(X_CROSS, Y_ATT)] + wedge + [(X1, Y_ATT)]) + " Z"
U_TAX = 0.86
X_TAX = X0 + U_TAX * SPAN
Y_TAX = (supply(U_TAX) + Y_ATT) / 2

fig02_body = f"""{head(2, "Infinite supply. Fixed attention.")}
  <path class="wash" d="{wedge_d}"/>
  <path class="series-b" d="{path_from(sup_pts)}"/>
  <line class="series-a" x1="{X0}" y1="{Y_ATT}" x2="{X1}" y2="{Y_ATT}"/>
  <text class="flag" x="{X_TAX:.1f}" y="{Y_TAX + 5:.1f}" text-anchor="middle">THE TAX</text>
  <text class="label-key" x="{X1}" y="{Y_TOP - 18:.1f}" text-anchor="end">Products shipped</text>
  <text class="label-key accent" x="{X0}" y="{Y_ATT - 18:.1f}">Attention available</text>
{axis([2014, 2020, 2026, 2032])}
  <text class="note" x="56" y="{YBASE + 62}">Both axes are relative. Attention is flat because</text>
  <text class="note" x="56" y="{YBASE + 84}">there is no mechanism by which it could rise.</text>"""

# ============================================================ FIG 03  (ledger)
# 13 min x 100,000 people x 4 releases = 5,200,000 min/yr
#   = 86,666.7 h = 3,611.1 d = 9.89 yr of continuous human life.
MIN_PER_YEAR = 13 * 100_000 * 4
HOURS = MIN_PER_YEAR / 60
DAYS = HOURS / 24
YEARS = HOURS / 8760
assert MIN_PER_YEAR == 5_200_000
assert round(HOURS) == 86_667 and round(DAYS) == 3_611 and round(YEARS, 1) == 9.9

L, R = 56, 680
rows_in = [("Extra time one confusing flow costs a person", "13 min"),
           ("People who meet that flow", "100,000"),
           ("Releases in a year", "4")]
rows_out = [("Minutes lost, every year", f"{MIN_PER_YEAR:,}"),
            ("Hours", f"{round(HOURS):,}"),
            ("Days", f"{round(DAYS):,}")]


def ledger(rows, y, step=44):
    out = []
    for i, (k, v) in enumerate(rows):
        yy = y + i * step
        out.append(f'  <text class="label muted" x="{L}" y="{yy}">{k}</text>'
                   f'<text class="value" x="{R}" y="{yy}" text-anchor="end">{v}</text>')
    return "\n".join(out), y + (len(rows) - 1) * step


blk1, e1 = ledger(rows_in, 190)
blk2, e2 = ledger(rows_out, e1 + 116)

fig03_body = f"""{head(3, "One confusing flow, itemised.")}
  <text class="marker" x="{L}" y="156">WHAT GOES IN</text>
{blk1}
  <line class="rule" x1="{L}" y1="{e1 + 34}" x2="{R}" y2="{e1 + 34}"/>
  <text class="marker" x="{L}" y="{e1 + 82}">WHAT COMES OUT</text>
{blk2}
  <line class="rule" x1="{L}" y1="{e2 + 34}" x2="{R}" y2="{e2 + 34}"
        stroke="var(--fig-accent, #7E9CB8)"/>
  <text class="label-key" x="{L}" y="{e2 + 92}">Human-years, every year</text>
  <text class="total" x="{R}" y="{e2 + 100}" text-anchor="end">9.9</text>
  <text class="note" x="{L}" y="{e2 + 150}">13 &#215; 100,000 &#215; 4 = 5,200,000 minutes. At 60 minutes</text>
  <text class="note" x="{L}" y="{e2 + 172}">to the hour and 8,760 hours to the year, that is 9.9</text>
  <text class="note" x="{L}" y="{e2 + 194}">years of continuous human life, every year, from one flow.</text>"""

# ============================================================ FIG 04  (the room)
CX, CY = 424.0, 288.0
fig04_body = f"""{head(4, "Nobody in the room represents them.")}
  <rect class="table-edge" x="{CX - 158}" y="{CY - 62}" width="316" height="124" rx="62"/>
  <text class="note" x="{CX}" y="{CY + 5}" text-anchor="middle">Release review</text>

  <rect class="seat" x="{CX - 110}" y="{CY - 118}" width="38" height="26" rx="6"/>
  <text class="label-key" x="{CX - 91}" y="{CY - 134}" text-anchor="middle">Product</text>

  <rect class="seat" x="{CX - 19}" y="{CY + 92}" width="38" height="26" rx="6"/>
  <text class="label-key" x="{CX}" y="{CY + 142}" text-anchor="middle">Engineering</text>

  <rect class="seat" x="{CX + 72}" y="{CY - 118}" width="38" height="26" rx="6"/>
  <text class="label-key" x="{CX + 91}" y="{CY - 134}" text-anchor="middle">Design</text>

  <rect class="seat-empty" x="{CX - 210}" y="{CY - 19}" width="26" height="38" rx="6"/>
  <text class="label-key accent" x="{CX - 226}" y="{CY + 6}" text-anchor="end">the user</text>

  <text class="note" x="56" y="482">Three functions are represented. The seat at the head</text>
  <text class="note" x="56" y="504">belongs to the party the release is for, and it is the</text>
  <text class="note" x="56" y="526">one nobody is sitting in.</text>"""

# ============================================================ emit
plates = [
    (1, "fig-01-production-judgment.svg", 720, 520,
     "Figure 1. Production got cheap. Judgment didn't.",
     "A line chart on a dark ground. The cost of production holds high, collapses steeply, then "
     "flattens near zero. The cost of judgment is a flat horizontal line. The production curve "
     "crosses the judgment line at a point marked NOW; after that crossing, production is the "
     "cheap input and judgment is the expensive one.", fig01_body),
    (2, "fig-02-supply-attention.svg", 720, 520,
     "Figure 2. Infinite supply. Fixed attention.",
     "A line chart on a dark ground. Products shipped rises exponentially. Attention available is "
     "a flat horizontal line. Where the rising curve passes above the flat line, the widening gap "
     "between them is shaded and labelled THE TAX.", fig02_body),
    (3, "fig-03-confusion-ledger.svg", 720, 694,
     "Figure 3. One confusing flow, itemised.",
     "A ledger on a dark ground. Inputs: 13 minutes lost per person, 100,000 people, 4 releases a "
     "year. Outputs: 5,200,000 minutes, 86,667 hours, 3,611 days. The total, set large in the "
     "accent colour, is 9.9 human-years every year, from a single confusing flow.", fig03_body),
    (4, "fig-04-empty-seat.svg", 720, 566,
     "Figure 4. Nobody in the room represents them.",
     "A diagram of a review table seen from above, on a dark ground. Three seats are filled and "
     "labelled Product, Design and Engineering, all along the long sides. The one seat at an end of "
     "the table is drawn as an empty dashed outline in the accent colour and labelled 'the user'.", fig04_body),
]

D.mkdir(parents=True, exist_ok=True)
written = []
for n, name, w, h, t, d, body in plates:
    (D / name).write_text(plate(n, w, h, t, d, body))
    written.append((name, (D / name).stat().st_size))

# ---------------------------------------------------------- contact sheet
sheet_figs = "\n".join(
    f'  <figure>\n{(D / name).read_text().rstrip()}\n    <figcaption>{t}</figcaption>\n  </figure>'
    for (n, name, w, h, t, d, body) in plates)

sheet = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Figures &#8212; Design Isn&#8217;t Being Replaced (Part 1)</title>
<style>
{FONT_FACE}
:root{{
  --sheet-ground: #0E1013;
  --sheet-ink: #E8EAED;
  --sheet-muted: #8A9299;
  --sheet-rule: #2B3036;
  --sheet-font: 'Untitled Sans';
  --sheet-measure: 720px;
}}
*{{box-sizing:border-box}}
html,body{{margin:0;padding:0}}
html{{font-family: var(--sheet-font, 'Untitled Sans')}}
body{{
  background: var(--sheet-ground, #0E1013);
  color: var(--sheet-ink, #E8EAED);
  font-family: var(--sheet-font, 'Untitled Sans');
  font-weight: 400;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}}
main{{max-width: var(--sheet-measure, 720px); margin: 0 auto; padding: clamp(48px, 8vw, 96px) clamp(16px, 4vw, 24px) 128px}}
header{{margin-bottom: 96px}}
h1{{font-size: 32px; font-weight: 500; letter-spacing: -0.014em; line-height: 1.35; margin: 0 0 16px}}
header p{{margin:0; color: var(--sheet-muted, #8A9299); font-size: 16px}}
figure{{margin: 0 0 96px}}
figure svg{{display:block; width:100%; height:auto}}
figcaption{{
  margin-top: 24px; padding-top: 16px;
  border-top: 1px solid var(--sheet-rule, #2B3036);
  color: var(--sheet-muted, #8A9299); font-size: 14px;
}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Design Isn&#8217;t Being Replaced &#8212; figures</h1>
    <p>Part 1, RavenMCP series. Four plates, one token namespace, Untitled Sans throughout.</p>
  </header>
{sheet_figs}
</main>
</body>
</html>
"""
(D / "figures-contact-sheet.html").write_text(sheet)

print(f"crossing NOW at x={X_NOW:.1f}  judgment y={Y_JUDGE:.1f}")
print(f"supply crosses attention at x={X_CROSS:.1f} (u={U_CROSS:.3f})")
print(f"arithmetic: {MIN_PER_YEAR:,} min = {HOURS:,.1f} h = {DAYS:,.1f} d = {YEARS:.4f} yr")
for name, size in written:
    print(f"{name:38} {size/1024:6.1f} KB")
print(f"{'figures-contact-sheet.html':38} {(D/'figures-contact-sheet.html').stat().st_size/1024:6.1f} KB")
