/**
 * Point hit-test against an accessibility tree (points, top-left origin).
 * Prefers the smallest containing node (deepest visual / most specific).
 */

export function flattenTree(nodes, ancestors = []) {
  var out = [];
  if (!Array.isArray(nodes)) return out;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!n || !n.rect) continue;
    var path = ancestors.concat([n]);
    out.push({ node: n, ancestors: ancestors });
    if (Array.isArray(n.children) && n.children.length) {
      out = out.concat(flattenTree(n.children, path));
    }
  }
  return out;
}

export function containsPoint(rect, x, y) {
  if (!rect) return false;
  var rx = Number(rect.x) || 0;
  var ry = Number(rect.y) || 0;
  var rw = Number(rect.w != null ? rect.w : rect.width) || 0;
  var rh = Number(rect.h != null ? rect.h : rect.height) || 0;
  return x >= rx && y >= ry && x < rx + rw && y < ry + rh;
}

export function area(rect) {
  if (!rect) return Infinity;
  var rw = Number(rect.w != null ? rect.w : rect.width) || 0;
  var rh = Number(rect.h != null ? rect.h : rect.height) || 0;
  return Math.max(1, rw * rh);
}

export function hitTest(tree, x, y) {
  var flat = flattenTree(tree);
  var hits = [];
  for (var i = 0; i < flat.length; i++) {
    var item = flat[i];
    if (containsPoint(item.node.rect, x, y)) hits.push(item);
  }
  if (!hits.length) return null;
  hits.sort(function (a, b) {
    return area(a.node.rect) - area(b.node.rect);
  });
  return hits[0];
}

export function toGrabSelection(hit, opts) {
  opts = opts || {};
  var n = hit.node;
  var rect = n.rect || {};
  var w = Number(rect.w != null ? rect.w : rect.width) || 0;
  var h = Number(rect.h != null ? rect.h : rect.height) || 0;
  var selector = n.identifier
    ? "ax://identifier/" + n.identifier
    : n.label
      ? "ax://label/" + encodeURIComponent(n.label)
      : "ax://role/" + (n.role || "element") + "@" + Math.round(rect.x || 0) + "," + Math.round(rect.y || 0);

  return {
    platform: "ios",
    source: "ax",
    selector: selector,
    label: n.label || undefined,
    role: n.role || undefined,
    identifier: n.identifier || undefined,
    rect: {
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
      w: w,
      h: h,
      width: w,
      height: h
    },
    styles: n.styles || {},
    tokens: n.tokens || [],
    instruction: opts.instruction || "",
    editScope: opts.editScope || "instance",
    matchCount: n.matchCount || 1,
    ancestors: (hit.ancestors || []).map(function (a) {
      return {
        label: a.label || undefined,
        role: a.role || undefined,
        identifier: a.identifier || undefined
      };
    }),
    grabbedAt: new Date().toISOString()
  };
}
