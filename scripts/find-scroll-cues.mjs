// Discovery pass for a seed corpus: which live sites actually carry a scroll cue
// in their hero, and what element is it?
//
// This does NOT capture anything. It renders each page, scores every element in
// the first viewport against what a scroll cue actually is, and prints the best
// candidates so a human can pick before any capture runs. Guessing the selector
// and capturing blind is how you end up with a corpus of wrappers and nav bars.
//
// Usage: node scripts/find-scroll-cues.mjs [url ...]
import { chromium } from 'playwright';

var URLS = process.argv.slice(2);
if (URLS.length === 0) {
  console.error('usage: node scripts/find-scroll-cues.mjs <url> [url ...]');
  process.exit(2);
}

// A scroll cue is small, sits low in the first viewport, is horizontally
// centred more often than not, and usually says so in a class, aria-label or
// its own text. Each signal is weak alone — a footer link is also small and
// low — so they are scored together and the result is printed for a human
// rather than acted on.
var SCORE = `(() => {
  const vh = window.innerHeight, vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top < 0 || r.top > vh) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
    if (r.width > vw * 0.4 || r.height > vh * 0.35) continue;

    let score = 0;
    const reasons = [];
    const words = ((el.className && typeof el.className === 'string' ? el.className : '') + ' '
      + (el.id || '') + ' ' + (el.getAttribute('aria-label') || '') + ' '
      + (el.getAttribute('data-testid') || '')).toLowerCase();
    if (/scroll|mouse|wheel|chevron|arrow-down|down-arrow|indicator|cue/.test(words)) { score += 5; reasons.push('names itself'); }
    const text = (el.textContent || '').trim().toLowerCase();
    if (text.length < 30 && /scroll|explore|discover/.test(text)) { score += 3; reasons.push('says scroll'); }

    const bottomBand = r.top > vh * 0.62 && r.top < vh * 0.98;
    if (bottomBand) { score += 3; reasons.push('low in the hero'); }
    const centre = Math.abs((r.left + r.width / 2) - vw / 2);
    if (centre < vw * 0.08) { score += 2; reasons.push('horizontally centred'); }
    if (r.width < 80 && r.height < 120) { score += 2; reasons.push('small'); }
    // A cue that animates is the strongest positive signal after naming itself.
    if (cs.animationName && cs.animationName !== 'none') { score += 3; reasons.push('animates'); }
    if (el.querySelector('svg') || el.tagName === 'SVG') { score += 1; reasons.push('has an svg'); }
    // A leaf or near-leaf. A wrapper that CONTAINS the cue scores the same on
    // position and size, and capturing it stores the padding around a pattern
    // instead of the pattern.
    if (el.children.length <= 2) { score += 2; reasons.push('near-leaf'); }

    if (score < 8) continue;

    // A stable-ish selector. Hashed utility classes are the norm now, so this is
    // a starting point for a human, not a promise.
    let selector = el.tagName.toLowerCase();
    if (el.id) selector += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) {
      selector += '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
    }
    out.push({
      selector, score, reasons,
      rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      centre: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
      text: text.slice(0, 40),
      animation: cs.animationName === 'none' ? null : cs.animationName,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 6);
})()`;

var browser = await chromium.launch();
for (var url of URLS) {
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Entrance animations and lazy heroes need a beat; a cue that fades in is
    // invisible to a scan taken at domcontentloaded.
    await page.waitForTimeout(3500);
    var found = await page.evaluate(SCORE);
    console.log('\n=== ' + url + ' ===');
    if (found.length === 0) console.log('  no candidate scored above the floor');
    for (var candidate of found) {
      console.log('  ' + String(candidate.score).padStart(2) + '  ' + candidate.selector);
      console.log('      ' + candidate.reasons.join(', '));
      console.log('      click at (' + candidate.centre.x + ', ' + candidate.centre.y + ')'
        + '  size ' + candidate.rect.width + 'x' + candidate.rect.height
        + (candidate.animation ? '  animation=' + candidate.animation : '')
        + (candidate.text ? '  text="' + candidate.text + '"' : ''));
    }
  } catch (error) {
    console.log('\n=== ' + url + ' ===\n  FAILED: ' + error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}
await browser.close();
