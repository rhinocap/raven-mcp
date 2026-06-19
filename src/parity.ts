export type El = { label?: string; id?: string; role?: string; rect: { x: number; y: number; w: number; h: number } };
export type Snapshot = { elements: El[]; viewport: { w: number; h: number } };
export type ChecklistItem = { name: string; a: string; b?: string; relation: "present"|"vertically-centered"|"baseline-aligned"|"left-aligned"|"equal-gap"|"equal-size"|"same-truncation"; tolerance?: number };
export type ParityVerdict = { name: string; relation: string; verdict: "match"|"mismatch"|"uncertain"; reason: string; ios?: any; android?: any };
export type ParityResult = { mismatch_count: number; results: ParityVerdict[] };

const DEFAULT_PX_TOLERANCE = 4;
const DEFAULT_RATIO_TOLERANCE = 0.05;

type ResolvedPair = {
  ios: El | null;
  android: El | null;
};

export function auditParity(
  ios: Snapshot,
  android: Snapshot,
  checklist: ChecklistItem[]
): ParityResult {
  const results = checklist.map((item) => auditItem(ios, android, item));
  const mismatch_count = results.filter((result) => result.verdict === "mismatch").length;

  return {
    mismatch_count,
    results
  };
}

function auditItem(ios: Snapshot, android: Snapshot, item: ChecklistItem): ParityVerdict {
  if (item.relation === "present") {
    return auditPresent(ios, android, item);
  }

  const a = resolvePair(ios, android, item.a);
  const missingA = missingSides(a);
  if (missingA.length > 0) {
    return uncertain(item, missingElementReason(item.a, missingA));
  }

  if (!a.ios || !a.android) {
    return uncertain(item, "required element could not be measured");
  }

  if (item.relation === "equal-size") {
    return auditEqualSize(item, a.ios, a.android);
  }

  if (item.relation === "same-truncation") {
    return auditSameTruncation(item, ios, android, a.ios, a.android);
  }

  if (!item.b) {
    return uncertain(item, "relation '" + item.relation + "' requires element b");
  }

  const b = resolvePair(ios, android, item.b);
  const missingB = missingSides(b);
  if (missingB.length > 0) {
    return uncertain(item, missingElementReason(item.b, missingB));
  }

  if (!b.ios || !b.android) {
    return uncertain(item, "required element could not be measured");
  }

  if (item.relation === "vertically-centered") {
    return auditVerticallyCentered(item, a.ios, a.android, b.ios, b.android);
  }

  if (item.relation === "baseline-aligned") {
    return auditBaselineAligned(item, a.ios, a.android, b.ios, b.android);
  }

  if (item.relation === "left-aligned") {
    return auditLeftAligned(item, a.ios, a.android, b.ios, b.android);
  }

  if (item.relation === "equal-gap") {
    return auditEqualGap(item, a.ios, a.android, b.ios, b.android);
  }

  return uncertain(item, "unknown relation '" + item.relation + "'");
}

function auditPresent(ios: Snapshot, android: Snapshot, item: ChecklistItem): ParityVerdict {
  const a = resolvePair(ios, android, item.a);
  const foundIos = Boolean(a.ios);
  const foundAndroid = Boolean(a.android);

  if (foundIos && foundAndroid) {
    return {
      name: item.name,
      relation: item.relation,
      verdict: "match",
      reason: "element '" + item.a + "' found on both platforms",
      ios: { present: true },
      android: { present: true }
    };
  }

  if (!foundIos && !foundAndroid) {
    return {
      name: item.name,
      relation: item.relation,
      verdict: "uncertain",
      reason: "element '" + item.a + "' not found on ios or android",
      ios: { present: false },
      android: { present: false }
    };
  }

  return {
    name: item.name,
    relation: item.relation,
    verdict: "mismatch",
    reason: missingElementReason(item.a, missingSides(a)),
    ios: { present: foundIos },
    android: { present: foundAndroid }
  };
}

function auditVerticallyCentered(
  item: ChecklistItem,
  iosA: El,
  androidA: El,
  iosB: El,
  androidB: El
): ParityVerdict {
  const tol = pxTolerance(item);
  const iosD = centerY(iosA) - centerY(iosB);
  const androidD = centerY(androidA) - centerY(androidB);
  const iosCentered = Math.abs(iosD) <= tol;
  const androidCentered = Math.abs(androidD) <= tol;

  return {
    name: item.name,
    relation: item.relation,
    verdict: iosCentered === androidCentered ? "match" : "mismatch",
    reason:
      iosCentered === androidCentered
        ? "vertical centering parity matched"
        : "vertical centering parity differed",
    ios: { d: iosD, centered: iosCentered },
    android: { d: androidD, centered: androidCentered }
  };
}

function auditBaselineAligned(
  item: ChecklistItem,
  iosA: El,
  androidA: El,
  iosB: El,
  androidB: El
): ParityVerdict {
  const tol = pxTolerance(item);
  const iosE = bottom(iosA) - bottom(iosB);
  const androidE = bottom(androidA) - bottom(androidB);
  const iosAligned = Math.abs(iosE) <= tol;
  const androidAligned = Math.abs(androidE) <= tol;

  return {
    name: item.name,
    relation: item.relation,
    verdict: iosAligned === androidAligned ? "match" : "mismatch",
    reason:
      iosAligned === androidAligned
        ? "baseline alignment parity matched"
        : "baseline alignment parity differed",
    ios: { e: iosE, aligned: iosAligned },
    android: { e: androidE, aligned: androidAligned }
  };
}

function auditLeftAligned(
  item: ChecklistItem,
  iosA: El,
  androidA: El,
  iosB: El,
  androidB: El
): ParityVerdict {
  const tol = pxTolerance(item);
  const iosE = iosA.rect.x - iosB.rect.x;
  const androidE = androidA.rect.x - androidB.rect.x;
  const iosAligned = Math.abs(iosE) <= tol;
  const androidAligned = Math.abs(androidE) <= tol;

  return {
    name: item.name,
    relation: item.relation,
    verdict: iosAligned === androidAligned ? "match" : "mismatch",
    reason:
      iosAligned === androidAligned
        ? "left alignment parity matched"
        : "left alignment parity differed",
    ios: { e: iosE, aligned: iosAligned },
    android: { e: androidE, aligned: androidAligned }
  };
}

function auditEqualGap(
  item: ChecklistItem,
  iosA: El,
  androidA: El,
  iosB: El,
  androidB: El
): ParityVerdict {
  const tol = pxTolerance(item);
  const iosGap = Math.max(0, top(iosB) - bottom(iosA));
  const androidGap = Math.max(0, top(androidB) - bottom(androidA));
  const delta = Math.abs(iosGap - androidGap);

  return {
    name: item.name,
    relation: item.relation,
    verdict: delta > tol ? "mismatch" : "match",
    reason: delta > tol ? "vertical gap differed by " + delta + "px" : "vertical gap matched",
    ios: { gap: iosGap },
    android: { gap: androidGap }
  };
}

function auditEqualSize(item: ChecklistItem, iosA: El, androidA: El): ParityVerdict {
  const tol = pxTolerance(item);
  const wDelta = Math.abs(iosA.rect.w - androidA.rect.w);
  const hDelta = Math.abs(iosA.rect.h - androidA.rect.h);
  const matched = wDelta <= tol && hDelta <= tol;

  return {
    name: item.name,
    relation: item.relation,
    verdict: matched ? "match" : "mismatch",
    reason: matched ? "element size matched" : "element size differed across platforms",
    ios: { w: iosA.rect.w, h: iosA.rect.h },
    android: { w: androidA.rect.w, h: androidA.rect.h }
  };
}

function auditSameTruncation(
  item: ChecklistItem,
  ios: Snapshot,
  android: Snapshot,
  iosA: El,
  androidA: El
): ParityVerdict {
  const tol = item.tolerance ?? DEFAULT_RATIO_TOLERANCE;
  const iosRatio = ratioFor(iosA, ios.viewport.w);
  const androidRatio = ratioFor(androidA, android.viewport.w);
  const delta = Math.abs(iosRatio - androidRatio);

  return {
    name: item.name,
    relation: item.relation,
    verdict: delta > tol ? "mismatch" : "match",
    reason: delta > tol ? "truncation ratio differed by " + delta : "truncation ratio matched",
    ios: { ratio: iosRatio },
    android: { ratio: androidRatio }
  };
}

function resolvePair(ios: Snapshot, android: Snapshot, key: string): ResolvedPair {
  return {
    ios: resolveElement(ios, key),
    android: resolveElement(android, key)
  };
}

function resolveElement(snapshot: Snapshot, key: string): El | null {
  const byId = snapshot.elements.find((el) => el.id === key);
  if (byId) {
    return byId;
  }

  return snapshot.elements.find((el) => el.label === key) ?? null;
}

function missingSides(pair: ResolvedPair): string[] {
  const sides: string[] = [];

  if (!pair.ios) {
    sides.push("ios");
  }

  if (!pair.android) {
    sides.push("android");
  }

  return sides;
}

function missingElementReason(key: string, sides: string[]): string {
  if (sides.length === 1) {
    return "element '" + key + "' not found on " + sides[0];
  }

  return "element '" + key + "' not found on " + sides.join(" or ");
}

function uncertain(item: ChecklistItem, reason: string): ParityVerdict {
  return {
    name: item.name,
    relation: item.relation,
    verdict: "uncertain",
    reason
  };
}

function pxTolerance(item: ChecklistItem): number {
  return item.tolerance ?? DEFAULT_PX_TOLERANCE;
}

function ratioFor(el: El, viewportWidth: number): number {
  if (viewportWidth === 0) {
    return 0;
  }

  return el.rect.w / viewportWidth;
}

function centerY(el: El): number {
  return el.rect.y + el.rect.h / 2;
}

function bottom(el: El): number {
  return el.rect.y + el.rect.h;
}

function top(el: El): number {
  return el.rect.y;
}
