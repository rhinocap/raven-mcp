(function () {
  "use strict";

  if (window.__RAVEN_GRAB__) return;
  window.__RAVEN_GRAB__ = true;

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("[Raven Grab] Cannot find the script URL. Include raven-grab.js with a src attribute.");
    return;
  }

  var bridgeOrigin;
  var bridgeKey;
  try {
    var scriptUrl = new URL(script.src, document.baseURI);
    bridgeOrigin = scriptUrl.origin;
    bridgeKey = scriptUrl.searchParams.get("key") || "";
  } catch (error) {
    console.error("[Raven Grab] Cannot parse the bridge URL from the script src.", error);
    return;
  }
  var bridgeQuery = "?key=" + encodeURIComponent(bridgeKey);
  function bridgeUrl(path) {
    return bridgeOrigin + path + bridgeQuery;
  }

  if (location.protocol === "https:" && bridgeOrigin.indexOf("http:") === 0) {
    console.warn(
      "[Raven Grab] Mixed content: this HTTPS page cannot call the HTTP Raven bridge at " +
        bridgeOrigin +
        ". Load the app over HTTP for local development, or serve the bridge over HTTPS."
    );
  }

  var MAX_HTML = 2000;
  var Z_INDEX = "2147483646";
  var STYLE_PROPERTIES = [
    "display", "position", "box-sizing", "width", "height", "margin", "padding", "gap",
    "color", "background-color", "border-color", "border-width", "border-style", "border-radius",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align",
    "opacity", "box-shadow", "align-items", "justify-content", "grid-template-columns"
  ];

  var bridgeTokens = [];
  var selectedElement = null;
  var hoveredElement = null;
  var currentSelection = null;
  var reactMetadata = null;
  var tokenIntents = Object.create(null);
  var previewOriginals = Object.create(null);

  var host = document.createElement("div");
  host.setAttribute("data-raven-grab-overlay", "");
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:" + Z_INDEX + ";font-family:system-ui,sans-serif;";
  (document.documentElement || document.body).appendChild(host);
  var shadow = host.attachShadow({ mode: "closed" });

  var style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .raven-grab-highlight {
      position: fixed; display: none; pointer-events: none; border: 2px solid #3b67f2;
      background: rgba(59, 103, 242, .08); border-radius: 3px;
      box-shadow: 0 0 0 1px rgba(255,255,255,.72) inset;
    }
    .raven-grab-label {
      position: fixed; display: none; max-width: min(420px, calc(100vw - 24px));
      padding: 5px 8px; color: #fff; background: #2851d4; border-radius: 4px;
      font: 600 11px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
      box-shadow: 0 2px 8px rgba(15, 23, 42, .18);
    }
    .raven-grab-panel {
      position: fixed; top: 12px; right: 12px; display: none; width: min(360px, calc(100vw - 24px));
      max-height: calc(100vh - 24px); overflow: auto; pointer-events: auto;
      color: #172033; background: #f8f9fb; border: 1px solid #d9dde7; border-radius: 12px;
      box-shadow: 0 18px 52px rgba(15, 23, 42, .22); font: 13px/1.45 system-ui, sans-serif;
      overscroll-behavior: contain;
    }
    .raven-grab-panel[aria-hidden="false"] { display: block; }
    .raven-grab-header {
      position: sticky; top: 0; z-index: 1; display: flex; align-items: center; min-height: 52px;
      padding: 8px 8px 8px 14px; background: rgba(248,249,251,.96); border-bottom: 1px solid #e2e5ec;
      backdrop-filter: blur(8px);
    }
    .raven-grab-title { min-width: 0; flex: 1; }
    .raven-grab-title strong { display: block; font-size: 13px; font-weight: 700; letter-spacing: -.01em; }
    .raven-grab-title span { display: block; margin-top: 1px; color: #6c7485; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .raven-grab-icon-button {
      width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; color: #5f687a;
      background: transparent; cursor: pointer; font: 20px/1 system-ui, sans-serif;
    }
    .raven-grab-icon-button:hover { color: #172033; background: #e9ecf2; }
    .raven-grab-content { padding: 14px; }
    .raven-grab-section + .raven-grab-section { margin-top: 16px; }
    .raven-grab-section-title { margin: 0 0 8px; color: #656e80; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .raven-grab-token {
      padding: 10px; background: #fff; border: 1px solid #e0e4eb; border-radius: 9px;
    }
    .raven-grab-token + .raven-grab-token { margin-top: 8px; }
    .raven-grab-token-line { display: flex; align-items: center; min-height: 24px; gap: 8px; }
    .raven-grab-swatch { width: 18px; height: 18px; flex: 0 0 auto; border: 1px solid rgba(15,23,42,.14); border-radius: 5px; background: var(--swatch, transparent); }
    .raven-grab-token-name { min-width: 0; flex: 1; font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .raven-grab-token-value { color: #737b8b; font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .raven-grab-field { display: block; margin-top: 8px; }
    .raven-grab-field > span { display: block; margin-bottom: 4px; color: #596274; font-size: 11px; font-weight: 650; }
    .raven-grab-input, .raven-grab-select, .raven-grab-textarea {
      width: 100%; min-height: 44px; padding: 9px 10px; color: #172033; background: #fff;
      border: 1px solid #cdd2dc; border-radius: 7px; outline: none; font: 13px/1.35 system-ui, sans-serif;
    }
    .raven-grab-select { cursor: pointer; }
    .raven-grab-input:hover, .raven-grab-select:hover, .raven-grab-textarea:hover { border-color: #929baa; }
    .raven-grab-input:focus, .raven-grab-select:focus, .raven-grab-textarea:focus { border-color: #3b67f2; box-shadow: 0 0 0 3px rgba(59,103,242,.15); }
    .raven-grab-textarea { min-height: 88px; resize: vertical; }
    .raven-grab-new-token { display: none; grid-template-columns: 1fr 1fr; gap: 8px; }
    .raven-grab-new-token[data-open="true"] { display: grid; }
    .raven-grab-styles { margin: 0; padding: 0; list-style: none; background: #fff; border: 1px solid #e0e4eb; border-radius: 9px; overflow: hidden; }
    .raven-grab-styles li { display: grid; grid-template-columns: minmax(92px, .8fr) minmax(0, 1.2fr); gap: 10px; padding: 7px 9px; }
    .raven-grab-styles li + li { border-top: 1px solid #edf0f4; }
    .raven-grab-styles span { color: #687184; font-size: 11px; }
    .raven-grab-styles code { overflow-wrap: anywhere; color: #313a4b; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .raven-grab-empty { margin: 0; padding: 11px; color: #697285; background: #fff; border: 1px dashed #cfd5df; border-radius: 9px; font-size: 12px; }
    .raven-grab-actions { position: sticky; bottom: 0; padding: 10px 14px 14px; background: linear-gradient(to bottom, rgba(248,249,251,0), #f8f9fb 18%); }
    .raven-grab-send {
      width: 100%; min-height: 44px; border: 0; border-radius: 8px; color: #fff; background: #315fe8;
      cursor: pointer; font: 700 13px/1 system-ui, sans-serif; box-shadow: 0 1px 2px rgba(15,23,42,.16);
    }
    .raven-grab-send:hover { background: #244ecb; }
    .raven-grab-send:focus-visible, .raven-grab-icon-button:focus-visible { outline: 3px solid rgba(59,103,242,.35); outline-offset: 2px; }
    .raven-grab-send:disabled { cursor: wait; opacity: .62; }
    .raven-grab-status { min-height: 18px; margin: 6px 2px 0; color: #697285; font-size: 11px; text-align: center; }
    .raven-grab-status[data-kind="error"] { color: #a33a3a; }
    .raven-grab-status[data-kind="success"] { color: #21734d; }
    .raven-grab-arm {
      position: fixed; right: 12px; bottom: 12px; min-height: 44px; padding: 0 16px;
      display: flex; align-items: center; gap: 8px; pointer-events: auto; cursor: pointer;
      color: #fff; background: #315fe8; border: 0; border-radius: 22px;
      font: 700 12px/1 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(15,23,42,.28);
    }
    .raven-grab-arm:hover { background: #244ecb; }
    .raven-grab-arm[data-armed="false"] { color: #313a4b; background: #e9ecf2; }
    .raven-grab-arm[data-armed="false"]:hover { background: #dde1e9; }
    .raven-grab-arm:focus-visible { outline: 3px solid rgba(59,103,242,.35); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }
  `;

  var highlight = document.createElement("div");
  highlight.className = "raven-grab-highlight";
  var label = document.createElement("div");
  label.className = "raven-grab-label";
  var panel = document.createElement("aside");
  panel.className = "raven-grab-panel";
  panel.setAttribute("aria-label", "Raven Grab selection");
  panel.setAttribute("aria-hidden", "true");
  var armButton = document.createElement("button");
  armButton.className = "raven-grab-arm";
  armButton.type = "button";
  armButton.setAttribute("aria-label", "Toggle Raven Grab element picking (Alt+G)");
  shadow.appendChild(style);
  shadow.appendChild(highlight);
  shadow.appendChild(label);
  shadow.appendChild(panel);
  shadow.appendChild(armButton);

  var armed = true;
  function renderArmButton() {
    armButton.setAttribute("data-armed", armed ? "true" : "false");
    armButton.textContent = armed ? "Grabbing — click an element" : "Grab off (Alt+G)";
  }
  function setArmed(next) {
    armed = next;
    renderArmButton();
    if (!armed) dismiss();
  }
  armButton.addEventListener("click", function (event) {
    event.stopPropagation();
    setArmed(!armed);
  });
  renderArmButton();

  function escapeCss(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (char) {
      return "\\" + char.charCodeAt(0).toString(16) + " ";
    });
  }

  function uniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (error) {
      return false;
    }
  }

  function stableSelector(element) {
    if (!element || element.nodeType !== 1) return "";
    if (element.id) {
      var idSelector = "#" + escapeCss(element.id);
      if (uniqueSelector(idSelector)) return idSelector;
    }
    var testId = element.getAttribute("data-testid");
    if (testId) {
      var testSelector = '[data-testid="' + String(testId).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
      if (uniqueSelector(testSelector)) return testSelector;
    }

    var parts = [];
    var node = element;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 5) {
      var part = node.localName.toLowerCase();
      var classes = Array.prototype.filter.call(node.classList || [], function (name) {
        return name.indexOf("raven-grab-") !== 0 && name.length < 48;
      }).slice(0, 2);
      if (classes.length) part += "." + classes.map(escapeCss).join(".");
      var siblings = node.parentElement
        ? Array.prototype.filter.call(node.parentElement.children, function (child) { return child.localName === node.localName; })
        : [];
      if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
      parts.unshift(part);
      var path = parts.join(" > ");
      if (uniqueSelector(path)) return path;
      node = node.parentElement;
    }
    return parts.join(" > ") || element.localName.toLowerCase();
  }

  function rectFor(element) {
    var rect = element.getBoundingClientRect();
    var output = {};
    ["x", "y", "top", "right", "bottom", "left", "width", "height"].forEach(function (key) {
      output[key] = Math.round(rect[key] * 100) / 100;
    });
    return output;
  }

  function computedStylesFor(element) {
    var computed = getComputedStyle(element);
    var output = {};
    STYLE_PROPERTIES.forEach(function (property) {
      var value = computed.getPropertyValue(property).trim();
      if (value) output[property] = value;
    });
    return output;
  }

  function splitSelectorList(selectorText) {
    var selectors = [];
    var start = 0;
    var depth = 0;
    var quote = "";
    for (var i = 0; i < selectorText.length; i += 1) {
      var char = selectorText.charAt(i);
      if (quote) {
        if (char === quote && selectorText.charAt(i - 1) !== "\\") quote = "";
        continue;
      }
      if (char === '"' || char === "'") quote = char;
      else if (char === "(" || char === "[") depth += 1;
      else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
      else if (char === "," && depth === 0) {
        selectors.push(selectorText.slice(start, i).trim());
        start = i + 1;
      }
    }
    selectors.push(selectorText.slice(start).trim());
    return selectors.filter(function (selector) { return !!selector; });
  }

  function specificityForSelector(selector) {
    var withoutWhere = selector.replace(/:where\(([^()]|\([^()]*\))*\)/g, "");
    var ids = (withoutWhere.match(/#[\w-]+/g) || []).length;
    var classes = (withoutWhere.match(/\.[\w-]+/g) || []).length;
    classes += (withoutWhere.match(/\[[^\]]+\]/g) || []).length;
    classes += (withoutWhere.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
    var typeSource = withoutWhere
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/#[\w-]+|\.[\w-]+/g, " ")
      .replace(/::?[\w-]+(?:\([^)]*\))?/g, " ")
      .replace(/[>+~*]/g, " ");
    var types = (typeSource.match(/(?:^|\s)([a-zA-Z][\w-]*)/g) || []).length;
    return [ids, classes, types];
  }

  function matchingSpecificity(element, selectorText) {
    var best = null;
    splitSelectorList(selectorText).forEach(function (selector) {
      try {
        if (!element.matches(selector)) return;
        var specificity = specificityForSelector(selector);
        if (!best || compareSpecificity(specificity, best) > 0) best = specificity;
      } catch (error) {
        // Unsupported selectors and pseudo-elements do not target this element.
      }
    });
    return best;
  }

  function compareSpecificity(left, right) {
    for (var i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return 0;
  }

  function matchingRules(element) {
    var matches = [];
    var sourceOrder = 0;
    function walk(ruleList) {
      if (!ruleList) return;
      for (var i = 0; i < ruleList.length; i += 1) {
        var rule = ruleList[i];
        if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
        if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
        if (rule.selectorText && rule.style) {
          var specificity = matchingSpecificity(element, rule.selectorText);
          if (specificity) matches.push({ style: rule.style, specificity: specificity, sourceOrder: sourceOrder, inline: false });
          sourceOrder += 1;
        }
        if (rule.cssRules) {
          try { walk(rule.cssRules); } catch (error) { /* inaccessible nested rules */ }
        }
      }
    }
    for (var i = 0; i < document.styleSheets.length; i += 1) {
      try { walk(document.styleSheets[i].cssRules); } catch (error) { /* cross-origin sheet */ }
    }
    matches.push({ style: element.style, specificity: [0, 0, 0], sourceOrder: sourceOrder, inline: true });
    return matches;
  }

  function declarationsFor(match) {
    var declarations = [];
    var style = match.style;
    for (var i = 0; i < style.length; i += 1) {
      var property = style[i];
      declarations.push({
        property: property,
        value: style.getPropertyValue(property),
        important: style.getPropertyPriority(property) === "important",
        match: match,
        declarationOrder: i
      });
    }
    // Pending-substitution: shorthands using var() expand to EMPTY longhands in
    // CSSOM, so the var() only survives in cssText. Always merge cssText
    // declarations that indexed iteration missed.
    if (style.cssText) {
      var seen = Object.create(null);
      for (var s = 0; s < declarations.length; s += 1) seen[declarations[s].property] = true;
      var pattern = /(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g;
      var parsed;
      while ((parsed = pattern.exec(style.cssText))) {
        if (seen[parsed[1]]) continue;
        var value = parsed[2].trim();
        var important = /\s*!important\s*$/i.test(value);
        declarations.push({
          property: parsed[1],
          value: value.replace(/\s*!important\s*$/i, ""),
          important: important,
          match: match,
          declarationOrder: declarations.length
        });
      }
    }
    return declarations;
  }

  function boxLonghands(prefix) {
    return [prefix + "-top", prefix + "-right", prefix + "-bottom", prefix + "-left"];
  }

  function affectedProperties(property) {
    if (property === "margin" || property === "padding" || property === "inset") return boxLonghands(property);
    if (property === "border") {
      return ["top", "right", "bottom", "left"].reduce(function (output, side) {
        return output.concat(["border-" + side + "-width", "border-" + side + "-style", "border-" + side + "-color"]);
      }, []);
    }
    if (/^border-(width|style|color)$/.test(property)) {
      var suffix = property.slice("border-".length);
      return ["top", "right", "bottom", "left"].map(function (side) { return "border-" + side + "-" + suffix; });
    }
    var borderSide = property.match(/^border-(top|right|bottom|left)$/);
    if (borderSide) return ["width", "style", "color"].map(function (suffix) { return property + "-" + suffix; });
    if (property === "background") return ["background-color", "background-image", "background-position", "background-size", "background-repeat", "background-origin", "background-clip", "background-attachment"];
    if (property === "font") return ["font-style", "font-variant", "font-weight", "font-stretch", "font-size", "line-height", "font-family"];
    return [property];
  }

  function declarationWins(candidate, incumbent) {
    if (!incumbent) return true;
    if (candidate.important !== incumbent.important) return candidate.important;
    if (candidate.match.inline !== incumbent.match.inline) return candidate.match.inline;
    var specificity = compareSpecificity(candidate.match.specificity, incumbent.match.specificity);
    if (specificity !== 0) return specificity > 0;
    if (candidate.match.sourceOrder !== incumbent.match.sourceOrder) return candidate.match.sourceOrder > incumbent.match.sourceOrder;
    return candidate.declarationOrder > incumbent.declarationOrder;
  }

  function winningDeclarations(element) {
    var winners = Object.create(null);
    matchingRules(element).forEach(function (match) {
      declarationsFor(match).forEach(function (declaration) {
        affectedProperties(declaration.property).forEach(function (property) {
          if (declarationWins(declaration, winners[property])) winners[property] = declaration;
        });
      });
    });
    var unique = [];
    Object.keys(winners).forEach(function (property) {
      if (unique.indexOf(winners[property]) === -1) unique.push(winners[property]);
    });
    return unique;
  }

  function tokenByCssVar(cssVar) {
    for (var i = 0; i < bridgeTokens.length; i += 1) {
      if (bridgeTokens[i].cssVar === cssVar) return bridgeTokens[i];
    }
    return null;
  }

  function tokenMapFor(element) {
    var computed = getComputedStyle(element);
    var rootComputed = getComputedStyle(document.documentElement);
    var found = Object.create(null);
    winningDeclarations(element).forEach(function (declaration) {
      var expression = /var\(\s*(--[\w-]+)/g;
      var match;
      while ((match = expression.exec(declaration.value))) {
        var cssVar = match[1];
        var key = declaration.property + "|" + cssVar;
        if (found[key]) continue;
        var resolved = computed.getPropertyValue(cssVar).trim() || rootComputed.getPropertyValue(cssVar).trim();
        var bridgeToken = tokenByCssVar(cssVar);
        found[key] = {
          property: declaration.property,
          cssVar: cssVar,
          value: resolved,
          name: bridgeToken ? bridgeToken.name : cssVar,
          group: bridgeToken ? bridgeToken.group : "custom",
          path: bridgeToken ? bridgeToken.path : cssVar,
          bridgeToken: bridgeToken || null
        };
      }
    });
    return Object.keys(found).map(function (key) { return found[key]; });
  }

  function normalizeTokens(input) {
    var source = input && input.tokens !== undefined ? input.tokens : input;
    var output = [];
    function visit(value, path) {
      if (Array.isArray(value)) {
        value.forEach(function (item) { visit(item, path); });
        return;
      }
      if (!value || typeof value !== "object") return;
      var tokenValue = value.value !== undefined ? value.value : value.$value;
      // Ref tokens arrive as {$ref: "colors.primary"} — show them as "{colors.primary}".
      if (tokenValue && typeof tokenValue === "object") {
        tokenValue = tokenValue.$ref ? "{" + tokenValue.$ref + "}" : undefined;
      }
      var cssVar = value.cssVar || value.cssVariable || value.cssVariableName || value.cssVarName || value.css_var || value.variable;
      if (tokenValue !== undefined && (value.name || cssVar || path.length)) {
        var tokenPath = typeof value.path === "string" ? value.path.split(".") : path;
        var name = value.name || tokenPath[tokenPath.length - 1] || cssVar;
        var group = value.group || value.type || (tokenPath.length > 1 ? tokenPath[tokenPath.length - 2] : "custom");
        output.push({
          path: tokenPath.join("."),
          name: String(name),
          value: String(tokenValue),
          group: String(group),
          cssVar: cssVar ? String(cssVar) : "--" + String(group).replace(/[^\w-]+/g, "-").toLowerCase() + "-" + String(name).replace(/[^\w-]+/g, "-").toLowerCase()
        });
        return;
      }
      Object.keys(value).forEach(function (key) { visit(value[key], path.concat(key)); });
    }
    visit(source, []);
    return output;
  }

  function selectionFor(element) {
    var html = element.outerHTML || "";
    if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML - 1) + "…";
    return {
      selector: stableSelector(element),
      html: html,
      rect: rectFor(element),
      styles: computedStylesFor(element),
      tokens: tokenMapFor(element)
    };
  }

  function setHighlight(element) {
    if (!element || element === host || !document.documentElement.contains(element)) {
      highlight.style.display = "none";
      label.style.display = "none";
      return;
    }
    var rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    highlight.style.display = "block";
    highlight.style.left = rect.left + "px";
    highlight.style.top = rect.top + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";
    label.style.display = "block";
    label.textContent = stableSelector(element);
    var labelTop = rect.top >= 30 ? rect.top - 26 : Math.min(rect.bottom + 4, innerHeight - 30);
    label.style.left = Math.max(8, Math.min(rect.left, innerWidth - 240)) + "px";
    label.style.top = Math.max(4, labelTop) + "px";
  }

  function isColor(value) {
    if (!value) return false;
    return /^(#|rgb|hsl|oklch|oklab|color\(|transparent|[a-z]+$)/i.test(value.trim());
  }

  function alternativesFor(token) {
    var tokenPath = token.bridgeToken && token.bridgeToken.path ? token.bridgeToken.path : token.path;
    var tokenParts = String(tokenPath || "").split(".");
    var tokenLeaf = tokenLeafProperty(token.group, tokenParts);
    return bridgeTokens.filter(function (candidate) {
      if (candidate.group !== token.group || candidate.cssVar === token.cssVar) return false;
      if (tokenParts.length <= 2) return true;
      var candidateParts = String(candidate.path || "").split(".");
      return candidateParts.length > 2 && tokenLeafProperty(candidate.group, candidateParts) === tokenLeaf;
    });
  }

  function tokenLeafProperty(group, pathParts) {
    var last = String(pathParts[pathParts.length - 1] || "").replace(/[-_]/g, "").toLowerCase();
    if (group !== "typography" || pathParts.length <= 2) return last;
    var property = String(pathParts[1] || "").replace(/[-_]/g, "").toLowerCase();
    var typographyProperties = {
      fontfamily: true,
      fontsize: true,
      fontweight: true,
      fontstyle: true,
      lineheight: true,
      letterspacing: true,
      texttransform: true
    };
    return typographyProperties[property] ? property : last;
  }

  function tokenPathFor(token) {
    if (token.bridgeToken && token.bridgeToken.path) return token.bridgeToken.path;
    if (token.path) return token.path;
    if (token.group && token.name) return token.group + "." + token.name;
    return token.name;
  }

  function tokenIntentFor(token, alternative, newName, newValue) {
    var nextName = alternative ? alternative.name : newName;
    return {
      property: token.property,
      oldToken: token.name,
      oldTokenPath: tokenPathFor(token),
      newToken: nextName,
      newTokenPath: alternative ? alternative.path : (token.group && nextName ? token.group + "." + nextName : nextName),
      newTokenValue: alternative ? alternative.value : newValue
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function renderPanel() {
    tokenIntents = Object.create(null);
    var tokens = currentSelection.tokens;
    var matchedTokens = tokens.map(function (token, index) {
      return { token: token, index: index };
    }).filter(function (entry) { return entry.token.bridgeToken; });
    var tokenMarkup = matchedTokens.length
      ? matchedTokens.map(function (entry) {
          var token = entry.token;
          var index = entry.index;
          var alternatives = alternativesFor(token);
          var options = alternatives.map(function (alternative) {
            return '<option value="' + escapeHtml(alternative.cssVar) + '">' + escapeHtml(alternative.name) + " · " + escapeHtml(alternative.value) + "</option>";
          }).join("");
          return `
            <div class="raven-grab-token" data-token-index="${index}">
              <div class="raven-grab-token-line">
                <span class="raven-grab-swatch" style="--swatch:${isColor(token.value) ? escapeHtml(token.value) : "transparent"}"></span>
                <span class="raven-grab-token-name">${escapeHtml(token.name)}</span>
                <span class="raven-grab-token-value">${escapeHtml(token.value || "unresolved")}</span>
              </div>
              <label class="raven-grab-field"><span>Use token</span>
                <select class="raven-grab-select" data-token-choice="${index}">
                  <option value="">Keep ${escapeHtml(token.name)}</option>${options}<option value="__new__">New token…</option>
                </select>
              </label>
              <div class="raven-grab-new-token" data-new-token="${index}">
                <label class="raven-grab-field"><span>Name</span><input class="raven-grab-input" data-new-name="${index}" placeholder="e.g. accent-soft"></label>
                <label class="raven-grab-field"><span>Value</span><input class="raven-grab-input" data-new-value="${index}" value="${escapeHtml(token.value)}" placeholder="#000000"></label>
              </div>
            </div>`;
        }).join("")
      : '<p class="raven-grab-empty">No design tokens matched this element. Computed styles are still included.</p>';
    var stylesMarkup = Object.keys(currentSelection.styles).map(function (property) {
      return "<li><span>" + escapeHtml(property) + "</span><code>" + escapeHtml(currentSelection.styles[property]) + "</code></li>";
    }).join("");

    panel.innerHTML = `
      <div class="raven-grab-header">
        <div class="raven-grab-title"><strong>Raven Grab</strong><span>${escapeHtml(currentSelection.selector)}</span></div>
        <button class="raven-grab-icon-button" type="button" data-close aria-label="Dismiss Raven Grab">×</button>
      </div>
      <div class="raven-grab-content">
        <section class="raven-grab-section"><h2 class="raven-grab-section-title">Matched tokens</h2>${tokenMarkup}</section>
        <section class="raven-grab-section"><h2 class="raven-grab-section-title">Computed styles</h2><ul class="raven-grab-styles">${stylesMarkup}</ul></section>
        <section class="raven-grab-section">
          <label class="raven-grab-field"><span>Tell the agent what to change</span>
            <textarea class="raven-grab-textarea" data-instruction placeholder="Make the primary action quieter and align it with the spacing system."></textarea>
          </label>
        </section>
      </div>
      <div class="raven-grab-actions"><button class="raven-grab-send" type="button" data-send>Send to agent</button><p class="raven-grab-status" data-status aria-live="polite"></p></div>`;
    panel.setAttribute("aria-hidden", "false");
  }

  function dismiss() {
    Object.keys(previewOriginals).forEach(function (cssVar) {
      var original = previewOriginals[cssVar];
      if (original.value) document.documentElement.style.setProperty(cssVar, original.value, original.priority);
      else document.documentElement.style.removeProperty(cssVar);
    });
    previewOriginals = Object.create(null);
    selectedElement = null;
    hoveredElement = null;
    currentSelection = null;
    reactMetadata = null;
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
    setHighlight(null);
  }

  function updateIntent(index) {
    var token = currentSelection.tokens[index];
    var select = panel.querySelector('[data-token-choice="' + index + '"]');
    var newFields = panel.querySelector('[data-new-token="' + index + '"]');
    var choice = select.value;
    newFields.setAttribute("data-open", choice === "__new__" ? "true" : "false");
    if (!choice) {
      delete tokenIntents[index];
      if (previewOriginals[token.cssVar]) {
        var original = previewOriginals[token.cssVar];
        if (original.value) document.documentElement.style.setProperty(token.cssVar, original.value, original.priority);
        else document.documentElement.style.removeProperty(token.cssVar);
        delete previewOriginals[token.cssVar];
      }
      return;
    }
    if (!previewOriginals[token.cssVar]) {
      previewOriginals[token.cssVar] = {
        value: document.documentElement.style.getPropertyValue(token.cssVar),
        priority: document.documentElement.style.getPropertyPriority(token.cssVar)
      };
    }
    if (choice === "__new__") {
      var nameInput = panel.querySelector('[data-new-name="' + index + '"]');
      var valueInput = panel.querySelector('[data-new-value="' + index + '"]');
      tokenIntents[index] = tokenIntentFor(
        token,
        null,
        nameInput.value.trim() || undefined,
        valueInput.value.trim() || undefined
      );
      if (valueInput.value.trim()) document.documentElement.style.setProperty(token.cssVar, valueInput.value.trim());
      return;
    }
    var alternative = tokenByCssVar(choice);
    if (!alternative) return;
    tokenIntents[index] = tokenIntentFor(token, alternative);
    document.documentElement.style.setProperty(token.cssVar, alternative.value);
  }

  function normalizedReactMetadata(detail) {
    if (!detail || typeof detail !== "object") return null;
    var source = detail.source || detail;
    var line = detail.line !== undefined ? detail.line : (detail.lineNumber !== undefined ? detail.lineNumber : (source.line !== undefined ? source.line : source.lineNumber));
    var column = detail.column !== undefined ? detail.column : (detail.columnNumber !== undefined ? detail.columnNumber : (source.column !== undefined ? source.column : source.columnNumber));
    return {
      componentName: detail.componentName || source.componentName,
      filePath: detail.filePath || source.filePath,
      line: line,
      column: column,
      lineNumber: line,
      columnNumber: column
    };
  }

  function payloadForSend() {
    var payload = {
      selector: currentSelection.selector,
      html: currentSelection.html,
      rect: currentSelection.rect,
      styles: currentSelection.styles,
      tokens: currentSelection.tokens,
      tokenIntents: Object.keys(tokenIntents).map(function (key) { return tokenIntents[key]; }),
      instruction: (panel.querySelector("[data-instruction]") || {}).value || ""
    };
    if (reactMetadata) {
      Object.keys(reactMetadata).forEach(function (key) {
        if (reactMetadata[key] !== undefined) payload[key] = reactMetadata[key];
      });
    }
    return payload;
  }

  async function sendSelection() {
    var button = panel.querySelector("[data-send]");
    var status = panel.querySelector("[data-status]");
    button.disabled = true;
    button.textContent = "Sending…";
    status.textContent = "";
    status.removeAttribute("data-kind");
    try {
      var response = await fetch(bridgeUrl("/grab"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForSend())
      });
      if (!response.ok) throw new Error("Bridge returned " + response.status);
      reactMetadata = null;
      status.textContent = "Sent to the agent";
      status.setAttribute("data-kind", "success");
      button.textContent = "Sent";
      setTimeout(function () {
        if (panel.querySelector("[data-send]") === button) {
          button.disabled = false;
          button.textContent = "Send to agent";
        }
      }, 1200);
    } catch (error) {
      status.textContent = "Could not reach the Raven bridge";
      status.setAttribute("data-kind", "error");
      button.disabled = false;
      button.textContent = "Try again";
      console.error("[Raven Grab] POST /grab failed.", error);
    }
  }

  panel.addEventListener("click", function (event) {
    event.stopPropagation();
    if (event.target.closest("[data-close]")) dismiss();
    if (event.target.closest("[data-send]")) sendSelection();
  });
  panel.addEventListener("change", function (event) {
    var index = event.target.getAttribute("data-token-choice");
    if (index !== null) updateIntent(Number(index));
  });
  panel.addEventListener("input", function (event) {
    var index = event.target.getAttribute("data-new-name");
    if (index === null) index = event.target.getAttribute("data-new-value");
    if (index !== null) updateIntent(Number(index));
  });

  document.addEventListener("mousemove", function (event) {
    if (!armed) return;
    var path = event.composedPath ? event.composedPath() : [];
    if (path.indexOf(host) !== -1 || selectedElement) return;
    var target = event.target && event.target.nodeType === 1 ? event.target : event.target.parentElement;
    if (target && target !== hoveredElement) {
      hoveredElement = target;
      setHighlight(target);
    }
  }, true);

  document.addEventListener("click", function (event) {
    if (!armed) return;
    var path = event.composedPath ? event.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    var target = event.target && event.target.nodeType === 1 ? event.target : event.target.parentElement;
    if (!target) return;
    if (event.altKey && target.parentElement) target = target.parentElement;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectedElement = target;
    setHighlight(target);
    currentSelection = selectionFor(target);
    renderPanel();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") dismiss();
    if (event.altKey && (event.key === "g" || event.key === "G" || event.code === "KeyG")) setArmed(!armed);
  }, true);

  window.addEventListener("resize", function () {
    if (selectedElement) setHighlight(selectedElement);
  });
  window.addEventListener("scroll", function () {
    if (selectedElement) setHighlight(selectedElement);
  }, true);

  // Always listen — react-grab may load after this script.
  var captureReactMetadata = function (event) {
    reactMetadata = normalizedReactMetadata(event.detail);
  };
  window.addEventListener("react-grab:element-selected", captureReactMetadata);
  document.addEventListener("react-grab:element-selected", captureReactMetadata);

  fetch(bridgeUrl("/tokens"))
    .then(function (response) {
      if (!response.ok) throw new Error("Bridge returned " + response.status);
      return response.json();
    })
    .then(function (tokens) { bridgeTokens = normalizeTokens(tokens); })
    .catch(function (error) {
      bridgeTokens = [];
      console.info("[Raven Grab] Tokens unavailable; selections will include computed styles only.", error);
    });
})();
