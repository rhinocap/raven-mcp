// Proper two-sided t critical value from the Welch-Satterthwaite df.
//
// Both analysis scripts originally hardcoded t = 2.16 / 2.18 with a comment saying
// "~t(.975) at df~=13; conservative". It was not conservative. The primary endpoint's
// real df is 6 (arm B has zero variance, so the whole df comes from arm A), where
// t(.975) = 2.4469 — the hardcoded value understated the interval by ~14%. Caught by the
// round-3 falsification pass; fixed here rather than papered over, because the round
// exists to stop exactly this kind of unchecked inference.
//
// Implemented by bisection on the regularised incomplete beta, so there is no lookup
// table to drift and no dependency to install.

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Two-sided tail probability P(|T_df| > t). */
export const tTail = (t, df) => betai(df / 2, 0.5, df / (df + t * t));

/** Two-sided critical value: t such that P(|T_df| > t) = alpha. Default alpha = 0.05. */
export function tCrit(df, alpha = 0.05) {
  if (!(df > 0) || !Number.isFinite(df)) return NaN;
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tTail(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Welch two-sample interval with the correct df-derived critical value. */
export function welch(a, b, alpha = 0.05) {
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const varr = (v) => (v.length < 2 ? 0 : v.reduce((s, x) => s + (x - mean(v)) ** 2, 0) / (v.length - 1));
  const [ma, mb] = [mean(a), mean(b)];
  const [va, vb] = [varr(a), varr(b)];
  const [na, nb] = [a.length, b.length];
  const se = Math.sqrt(va / na + vb / nb);
  // With one arm at zero variance the Welch df collapses to that arm's df alone (n-1).
  const num = (va / na + vb / nb) ** 2;
  const den = (va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1);
  const df = den === 0 ? na + nb - 2 : num / den;
  const t = tCrit(df, alpha);
  return { ma, mb, diff: ma - mb, sdA: Math.sqrt(va), sdB: Math.sqrt(vb), se, df, t,
           lo: ma - mb - t * se, hi: ma - mb + t * se };
}

// Self-check against published values when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const cases = [[6, 2.4469], [9.5605, 2.2422], [13, 2.1604], [30, 2.0423], [1, 12.7062]];
  let bad = 0;
  for (const [df, want] of cases) {
    const got = tCrit(df);
    const ok = Math.abs(got - want) < 5e-4;
    if (!ok) bad++;
    console.log(`  t(.975, df=${df}) = ${got.toFixed(4)}  expected ${want}  ${ok ? 'ok' : 'MISMATCH'}`);
  }
  console.log(bad === 0 ? 'tCrit self-check passed' : `tCrit self-check FAILED (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
}
