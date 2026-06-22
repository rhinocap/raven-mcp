// layout-orphans.ts
// Pure module — no I/O, no browser, no side effects.
// Exports detectOrphanStretch() for use by audit_layout.

export interface OrphanItem {
  selector: string;
  width: number;
  height: number;
  card_width: number;
  ratio: number;
  row_y: number;
}

export interface OrphanIssue {
  severity: "warning";
  rule: "layout/orphan-stretch";
  message: string;
  fix: string;
}

export interface OrphanStretchResult {
  has_orphan: boolean;
  card_width: number | null;
  card_height: number | null;
  card_count: number;
  orphans: OrphanItem[];
  issues: OrphanIssue[];
}

export interface OrphanElement {
  selector: string;
  rect: { x: number; y: number; w: number; h: number };
  computed?: unknown;
}

export interface OrphanOpts {
  widthRatio?: number;
}

function median(values: number[]): number {
  var sorted = values.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectOrphanStretch(
  elements: OrphanElement[],
  opts?: OrphanOpts
): OrphanStretchResult {
  var widthRatio = (opts && opts.widthRatio != null) ? opts.widthRatio : 1.5;

  // Fresh object per call — never share a mutable singleton across returns.
  function noCardResult(): OrphanStretchResult {
    return {
      has_orphan: false,
      card_width: null,
      card_height: null,
      card_count: 0,
      orphans: [],
      issues: []
    };
  }

  if (!elements || elements.length === 0) {
    return noCardResult();
  }

  // Step 1: find the modal width cluster (count >= 3).
  // Group rects whose widths are within ±12% of a representative.
  var widthTol = 0.12;
  var clusters: Array<{ rep: number; indices: number[] }> = [];

  for (var i = 0; i < elements.length; i++) {
    var w = elements[i].rect.w;
    var placed = false;
    for (var c = 0; c < clusters.length; c++) {
      var rep = clusters[c].rep;
      if (Math.abs(w - rep) / rep <= widthTol) {
        clusters[c].indices.push(i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ rep: w, indices: [i] });
    }
  }

  // Find the largest cluster with count >= 3.
  var bestCluster: { rep: number; indices: number[] } | null = null;
  for (var k = 0; k < clusters.length; k++) {
    if (clusters[k].indices.length >= 3) {
      if (bestCluster === null || clusters[k].indices.length > bestCluster.indices.length) {
        bestCluster = clusters[k];
      }
    }
  }

  if (bestCluster === null) {
    return noCardResult();
  }

  // W = median width of card group, H = median height of card group.
  var cardWidths: number[] = bestCluster.indices.map(function(idx) { return elements[idx].rect.w; });
  var cardHeights: number[] = bestCluster.indices.map(function(idx) { return elements[idx].rect.h; });
  var W = median(cardWidths);
  var H = median(cardHeights);
  var cardCount = bestCluster.indices.length;

  // Step 2: H-band = H ± 15%.
  var hBandLo = H * (1 - 0.15);
  var hBandHi = H * (1 + 0.15);

  // Step 3: Find orphans.
  // An orphan: height in H-band AND width >= widthRatio * W,
  // EXCLUDING elements within ±12% of W (those are cards).
  var orphans: OrphanItem[] = [];
  for (var j = 0; j < elements.length; j++) {
    var el = elements[j];
    var ew = el.rect.w;
    var eh = el.rect.h;

    // Must be in the H-band.
    if (eh < hBandLo || eh > hBandHi) {
      continue;
    }

    // Must be wide enough to be an orphan.
    if (ew < widthRatio * W) {
      continue;
    }

    // Exclude elements within ±12% of W (they are cards, not orphans).
    if (Math.abs(ew - W) / W <= widthTol) {
      continue;
    }

    orphans.push({
      selector: el.selector,
      width: ew,
      height: eh,
      card_width: W,
      ratio: Number((ew / W).toFixed(2)),
      row_y: el.rect.y
    });
  }

  // Sort orphans by rect.y descending (last-row orphan first).
  orphans.sort(function(a, b) { return b.row_y - a.row_y; });

  // Build issues: one per orphan.
  var issues: OrphanIssue[] = orphans.map(function(o) {
    var message = o.selector + " spans " + o.width + "px — " + o.ratio + "× the " + W + "px card width (lonely last-row orphan).";
    var fix = "Use grid-template-columns: repeat(auto-fill, " + W + "px) (auto-FILL, not auto-fit) or cap item max-width:" + W + "px so a lone final-row card stays card-width.";
    return {
      severity: "warning" as const,
      rule: "layout/orphan-stretch" as const,
      message: message,
      fix: fix
    };
  });

  return {
    has_orphan: orphans.length > 0,
    card_width: W,
    card_height: H,
    card_count: cardCount,
    orphans: orphans,
    issues: issues
  };
}
