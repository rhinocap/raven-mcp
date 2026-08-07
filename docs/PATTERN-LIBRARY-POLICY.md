# Pattern library — sourcing, attribution, and takedown

Raven's pattern library lets you capture a piece of interface from a page you are
looking at, keep it, and translate its values onto your own design tokens. Some of
what you capture will be your own product. Some of it will belong to someone else.

This document says what Raven does with the second kind, and how to get it removed.

It is a statement of practice, not legal advice.

---

## What Raven stores

A captured reference holds:

- the **source URL** and hostname
- the **CSS selector** you pointed at
- the element's **computed styles** — a map of resolved property values
- the element's **markup**, truncated
- an offline-rendered **thumbnail** of that markup
- when it was captured, and which Raven version captured it

It does not hold a screenshot of the page. It holds the small piece of structure
and style you selected, plus a picture Raven renders of that piece by itself.

This is worth being precise about, because it is not what a screenshot gallery
stores. Markup and computed styles are closer to the underlying work than a
picture of it is. Raven's position is that a single component's resolved styles,
kept as a reference for building your own version, is research use — the same
thing a designer does with browser devtools open. That position is asserted, not
adjudicated. Nobody has tested it.

**The thumbnail renders offline.** Every external request is blocked at render
time, so a stored reference can never call back to the site it came from — not
when it is captured, not months later. The cost is that remote images and
webfonts do not appear, and the record says so: `fidelity: "offline"`. It is a
picture of the structure, not a faithful reproduction of the page.

---

## Where captures come from

**The intended source is a page you are already looking at.** Raven's grab
overlay runs on a page you opened, and the capture flow is built around handing
its selection to `capture_reference`. Enforcement ends there: the tool takes a
URL as an argument, so nothing stops an agent from passing one you never opened.
What Raven guarantees is what it provides and records — no crawler, no search,
full provenance on every record — not what a caller chooses to pass in.

**Raven refuses captures from the curated galleries it knows about.** The seeded
list names these galleries — Mobbin, Refero, Screensdesign, Clicky, Screenlane,
Pttrns, UI Patterns, Collect UI, Land-book, Godly, Lapa, SiteInspire,
SaaS Landing Page, Awwwards, Dribbble, Behance — plus anything you add to your
local do-not-capture file. That list is the only enforcement; it is finite, and
a gallery missing from it is a gap in the list, not permission. The position
behind the list covers every curated library: their terms forbid mirroring
their corpus, and re-hosting someone else's curation is a different act from
capturing a pattern off the live product it ships in. Capture from the site
that actually runs the pattern.

**Captures stay on your machine by default.** They are written to
`~/.raven/references/` as ordinary files you own. Nothing is uploaded. The hosted
Raven endpoint at `mcp.ravenmcp.ai` does not serve the pattern tools at all.

---

## Attribution

Raven does not own these patterns and does not claim to. Neither do you, by
capturing one.

Attribution is enforced by the shape of the data, not by a line of documentation
asking nicely:

- Every third-party record carries its source URL, hostname, and owner.
- `search_references` returns the thumbnail **nested inside** the attribution
  object, alongside the credit line. You cannot destructure out the picture
  without carrying the source with it.
- A notice rides on third-party records specifically — not on your own captures,
  because a notice attached to everything is a notice nobody reads.

The notice says: *this pattern belongs to its original site, not to Raven or to
you; show the source with it, use it as a reference for your own implementation,
and do not republish it as your own work.*

That is the intended use. Look at how someone solved a problem, understand the
values, build your own version grounded in your own tokens. Not: lift the markup
and ship it.

---

## Takedown

**If you own a pattern in this library and want it gone, it goes.** No argument,
no process to exhaust, no requirement that you explain why.

### If you are a rights holder

Open an issue at **https://github.com/rhinocap/raven-mcp/issues** identifying the
site or URL. You do not need a lawyer, a takedown notice, or any particular
form — a link is enough.

What happens:

1. The pattern and any patterns from that host are removed from anything Raven
   distributes, and the host is added to a do-not-capture list.
2. The removal is stated in the changelog for the next release.
3. If the request is ambiguous about scope, the wider reading is taken.

Raven is open source and installed copies live on other people's machines.
Removal from what Raven distributes is a thing that can be promised and done.
Reaching every already-installed copy is not, and this document will not pretend
otherwise. What ships next will not contain it.

### If you are a Raven user

`forget_references` removes captures from your own corpus — by host, or by
specific reference id. It removes the record and the rendered thumbnail together,
so nothing survives as a picture of itself beside a gap in the index. It tells you
what it removed, what it could not remove, and what is still on disk, and it will
not report a clean sweep it did not achieve.

---

## What this does not cover

**Jurisdiction.** Raven is maintained from the United States, so the applicable
doctrine is fair use. Some comparable libraries operate under other regimes with
different tests — Mobbin, the best-known one, is Singaporean and rests on fair
dealing. These are not the same test and a conclusion under one does not transfer
to the other. No court has ruled on any of them, as far as public records show,
which is a negative result and not a safety proof. The category runs on tolerance
plus prompt compliance, and this document is the compliance half.

**Your use of what you capture.** Raven gives you a reference and the source it
came from. What you build is yours to be responsible for. A reference is not a
license.

**Trade dress, trademarks, and design patents.** Attribution addresses copyright.
It does not address a logo, a registered mark, or a patented interaction, and
capturing something into Raven is not a finding that it is free of those.

---

## Changing this

This document is versioned with the code. Material changes are noted in the
changelog rather than made quietly, so a rights holder who read it once can see
what changed since.
