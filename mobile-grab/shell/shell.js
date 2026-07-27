const state = {
  session: null,
  tree: [],
  viewport: { w: 393, h: 852 },
  selectedId: null,
  selectedNode: null,
  flat: []
};

const els = {
  tree: document.getElementById("tree"),
  mirror: document.getElementById("mirror"),
  screenImg: document.getElementById("screenImg"),
  hoverBox: document.getElementById("hoverBox"),
  selectBox: document.getElementById("selectBox"),
  emptyDesign: document.getElementById("emptyDesign"),
  designBody: document.getElementById("designBody"),
  roleChip: document.getElementById("roleChip"),
  idChip: document.getElementById("idChip"),
  factLabel: document.getElementById("factLabel"),
  factRect: document.getElementById("factRect"),
  factSelector: document.getElementById("factSelector"),
  stylesPre: document.getElementById("stylesPre"),
  tokenList: document.getElementById("tokenList"),
  instruction: document.getElementById("instruction"),
  sendBtn: document.getElementById("sendBtn"),
  sendStatus: document.getElementById("sendStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  sourcePill: document.getElementById("sourcePill"),
  sessionMeta: document.getElementById("sessionMeta")
};

function flatten(nodes, depth, out) {
  out = out || [];
  depth = depth || 0;
  (nodes || []).forEach(function (n) {
    out.push({ node: n, depth: depth });
    if (n.children && n.children.length) flatten(n.children, depth + 1, out);
  });
  return out;
}

function findById(nodes, id) {
  for (var i = 0; i < (nodes || []).length; i++) {
    var n = nodes[i];
    if (n.id === id) return n;
    var nested = findById(n.children, id);
    if (nested) return nested;
  }
  return null;
}

function selectorFor(n) {
  if (!n) return "—";
  if (n.identifier) return "ax://identifier/" + n.identifier;
  if (n.label) return "ax://label/" + encodeURIComponent(n.label);
  return "ax://role/" + (n.role || "element");
}

function scale() {
  var rect = els.mirror.getBoundingClientRect();
  return {
    sx: rect.width / state.viewport.w,
    sy: rect.height / state.viewport.h,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function pointFromEvent(e) {
  var s = scale();
  var x = ((e.clientX - s.left) / s.sx);
  var y = ((e.clientY - s.top) / s.sy);
  return { x: x, y: y };
}

function placeBox(box, node) {
  if (!node || !node.rect) {
    box.hidden = true;
    return;
  }
  var s = scale();
  var r = node.rect;
  box.hidden = false;
  box.style.left = (r.x * s.sx) + "px";
  box.style.top = (r.y * s.sy) + "px";
  box.style.width = ((r.w != null ? r.w : r.width) * s.sx) + "px";
  box.style.height = ((r.h != null ? r.h : r.height) * s.sy) + "px";
}

function contains(rect, x, y) {
  var w = rect.w != null ? rect.w : rect.width;
  var h = rect.h != null ? rect.h : rect.height;
  return x >= rect.x && y >= rect.y && x < rect.x + w && y < rect.y + h;
}

function hitLocal(x, y) {
  var hits = state.flat.filter(function (item) {
    return item.node.rect && contains(item.node.rect, x, y);
  });
  if (!hits.length) return null;
  hits.sort(function (a, b) {
    var aw = (a.node.rect.w != null ? a.node.rect.w : a.node.rect.width) * (a.node.rect.h != null ? a.node.rect.h : a.node.rect.height);
    var bw = (b.node.rect.w != null ? b.node.rect.w : b.node.rect.width) * (b.node.rect.h != null ? b.node.rect.h : b.node.rect.height);
    return aw - bw;
  });
  return hits[0].node;
}

function renderTree() {
  els.tree.innerHTML = "";
  state.flat.forEach(function (item) {
    var n = item.node;
    if (n.role === "Application") return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tree-row";
    btn.style.paddingLeft = (10 + item.depth * 12) + "px";
    btn.setAttribute("role", "treeitem");
    btn.setAttribute("aria-selected", n.id === state.selectedId ? "true" : "false");
    btn.innerHTML =
      '<span class="tree-role">' + escapeHtml(n.role || "?") + "</span>" +
      '<span class="tree-label">' + escapeHtml(n.label || n.identifier || n.id) + "</span>";
    btn.addEventListener("click", function () {
      selectNode(n);
    });
    els.tree.appendChild(btn);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function selectNode(n) {
  if (!n) return;
  state.selectedId = n.id;
  state.selectedNode = n;
  placeBox(els.selectBox, n);
  placeBox(els.hoverBox, null);
  els.hoverBox.hidden = true;
  renderTree();
  renderDesign();
}

function renderDesign() {
  var n = state.selectedNode;
  if (!n) {
    els.emptyDesign.hidden = false;
    els.designBody.hidden = true;
    return;
  }
  els.emptyDesign.hidden = true;
  els.designBody.hidden = false;
  els.roleChip.textContent = n.role || "—";
  els.idChip.textContent = n.identifier || n.id || "—";
  els.factLabel.textContent = n.label || "—";
  var r = n.rect || {};
  var w = r.w != null ? r.w : r.width;
  var h = r.h != null ? r.h : r.height;
  els.factRect.textContent = Math.round(r.x || 0) + ", " + Math.round(r.y || 0) + " · " + Math.round(w || 0) + "×" + Math.round(h || 0);
  els.factSelector.textContent = selectorFor(n);
  els.stylesPre.textContent = n.styles && Object.keys(n.styles).length
    ? JSON.stringify(n.styles, null, 2)
    : "—";
  els.tokenList.innerHTML = "";
  (n.tokens || []).forEach(function (t) {
    var li = document.createElement("li");
    li.innerHTML = '<span class="name">' + escapeHtml(t.name || t.property || "?") + "</span>" +
      '<span class="val">' + escapeHtml(t.value || "") + "</span>";
    els.tokenList.appendChild(li);
  });
  if (!(n.tokens || []).length) {
    var empty = document.createElement("li");
    empty.innerHTML = '<span class="name">No tokens mapped yet</span><span class="val">—</span>';
    els.tokenList.appendChild(empty);
  }
}

async function loadSession() {
  var res = await fetch("/api/session");
  state.session = await res.json();
  state.viewport = state.session.viewport || state.viewport;
  state.tree = state.session.tree || [];
  state.flat = flatten(state.tree);
  els.sourcePill.textContent = state.session.source || "fixture";
  els.sessionMeta.textContent = "Path A · " + (state.session.screen || "screen") + " · :" + (state.session.port || 49911);
  els.screenImg.src = "/api/screenshot?t=" + Date.now();
  renderTree();
  if (state.selectedId) {
    var again = findById(state.tree, state.selectedId);
    if (again) selectNode(again);
  }
}

els.mirror.addEventListener("mousemove", function (e) {
  var p = pointFromEvent(e);
  var n = hitLocal(p.x, p.y);
  if (n && n.id !== state.selectedId) placeBox(els.hoverBox, n);
  else {
    els.hoverBox.hidden = true;
  }
});

els.mirror.addEventListener("mouseleave", function () {
  els.hoverBox.hidden = true;
});

els.mirror.addEventListener("click", function (e) {
  var p = pointFromEvent(e);
  var n = hitLocal(p.x, p.y);
  if (n) selectNode(n);
});

els.sendBtn.addEventListener("click", async function () {
  if (!state.selectedNode) return;
  els.sendStatus.textContent = "Sending…";
  els.sendStatus.className = "status";
  try {
    var res = await fetch("/api/grab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: state.selectedNode.id,
        instruction: els.instruction.value.trim()
      })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "send failed");
    els.sendStatus.textContent = "Queued for agent · " + (data.selection && data.selection.selector);
    els.sendStatus.className = "status ok";
  } catch (err) {
    els.sendStatus.textContent = String(err.message || err);
  }
});

els.refreshBtn.addEventListener("click", async function () {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "Refreshing…";
  try {
    await fetch("/api/refresh", { method: "POST" });
    await loadSession();
  } finally {
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "Refresh from Simulator";
  }
});

window.addEventListener("resize", function () {
  if (state.selectedNode) placeBox(els.selectBox, state.selectedNode);
});

loadSession().catch(function (err) {
  els.sessionMeta.textContent = "Failed to load session: " + err.message;
});
