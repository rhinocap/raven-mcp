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
  var grabConfig = window.RavenGrabConfig && window.RavenGrabConfig.mode === "standalone"
    ? window.RavenGrabConfig
    : null;
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
  var styleEdits = Object.create(null);
  var styleEditOriginalInline = Object.create(null);
  var previewOriginals = Object.create(null);
  var activeTab = "design";
  var expandedSections = { tokens: false, styles: false };
  var instructionDraft = "";
  var componentRequestStep = "form";
  var componentRequest = { issueType: "", issueSize: "", useCase: "", email: "" };

  var host = document.createElement("div");
  host.setAttribute("data-raven-grab-overlay", "");
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:" + Z_INDEX + ";font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
  (document.documentElement || document.body).appendChild(host);
  var shadow = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      --raven-grab-bg: #1a1a22;
      --raven-grab-surface: #212129;
      --raven-grab-raised: #2a2a33;
      --raven-grab-overlay: #32323d;
      --raven-grab-text: #F0F0F2;
      --raven-grab-muted: #9498A0;
      --raven-grab-tertiary: #8E929C;
      --raven-grab-accent: #00BFFF;
      --raven-grab-accent-hover: #33CFFF;
      --raven-grab-error: #FF4060;
      --raven-grab-ui: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --raven-grab-mono: "JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", monospace;
    }
    * { box-sizing: border-box; }
    .raven-grab-highlight {
      position: fixed; display: none; pointer-events: none; border: 2px solid var(--raven-grab-accent);
      background: rgba(0, 191, 255, .08); border-radius: 3px;
      box-shadow: 0 0 0 1px rgba(10, 10, 18, .72) inset, 0 0 0 1px rgba(0, 191, 255, .35);
    }
    .raven-grab-label {
      position: fixed; display: none; max-width: min(420px, calc(100vw - 24px));
      padding: 5px 8px; color: #0a0a12; background: var(--raven-grab-accent); border-radius: 4px;
      font: 600 11px/1.25 var(--raven-grab-mono);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
      box-shadow: 0 0 0 1px rgba(0, 191, 255, .6), 0 4px 16px rgba(0, 191, 255, .35);
    }
    .raven-grab-panel {
      position: fixed; top: 20px; right: 20px; display: none; width: min(360px, calc(100vw - 40px));
      max-height: calc(100vh - 40px); overflow: hidden; pointer-events: auto; flex-direction: column;
      color: var(--raven-grab-text); background: #212129;
      border: 1px solid rgba(255, 255, 255, .12); border-radius: 20px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .25), 0 0 32px rgba(0, 191, 255, .06),
        0 8px 16px -4px rgba(0, 0, 0, .35), 0 24px 48px -12px rgba(0, 0, 0, .5);
      backdrop-filter: blur(12px); font: 13px/1.45 var(--raven-grab-ui);
      overscroll-behavior: contain;
    }
    .raven-grab-panel[aria-hidden="false"] { display: flex; }
    .raven-grab-top { flex: 0 0 auto; background: #212129; }
    .raven-grab-header {
      display: flex; align-items: center; min-height: 56px; padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, .06);
    }
    .raven-grab-title { min-width: 0; flex: 1; }
    .raven-grab-title strong { display: block; color: var(--raven-grab-text); font: 700 14px/1.3 var(--raven-grab-ui); letter-spacing: -.01em; }
    .raven-grab-icon-button {
      width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%;
      color: var(--raven-grab-muted); background: rgba(255, 255, 255, .06); cursor: pointer;
      font: 18px/1 var(--raven-grab-ui); transition: color 150ms ease, background 150ms ease;
    }
    .raven-grab-icon-button:hover { color: var(--raven-grab-text); background: rgba(255, 255, 255, .12); }
    .raven-grab-tabs { display: grid; grid-template-columns: 1fr 1fr; min-height: 44px; padding: 0 16px; background: rgba(14, 30, 46, .82); border-bottom: 1px solid rgba(255, 255, 255, .12); backdrop-filter: blur(6px); }
    .raven-grab-tab { min-height: 44px; padding: 0 4px; color: var(--raven-grab-text); background: transparent; border: 0; border-bottom: 2px solid transparent; cursor: pointer; font: 500 13px/1 var(--raven-grab-mono); }
    .raven-grab-tab[aria-selected="true"] { border-bottom-color: rgba(0, 191, 255, .3); }
    .raven-grab-tab:hover { color: var(--raven-grab-accent); }
    .raven-grab-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #3c3c47 #212129; }
    .raven-grab-body::-webkit-scrollbar { width: 6px; }
    .raven-grab-body::-webkit-scrollbar-thumb { background: #3c3c47; border-radius: 999px; }
    .raven-grab-content { padding: 16px; }
    .raven-grab-section + .raven-grab-section { margin-top: 16px; }
    .raven-grab-section-title { margin: 0 0 8px; color: var(--raven-grab-tertiary); font: 500 12px/1.3 var(--raven-grab-mono); letter-spacing: .96px; text-transform: uppercase; }
    .raven-grab-section-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 36px; margin: 0; padding: 0; color: var(--raven-grab-tertiary); background: transparent; border: 0; cursor: pointer; text-align: left; font: 500 12px/1.3 var(--raven-grab-mono); letter-spacing: .96px; text-transform: uppercase; }
    .raven-grab-section-toggle:hover { color: var(--raven-grab-text); }
    .raven-grab-caret { font: 500 11px/1 var(--raven-grab-mono); transition: transform 150ms ease; }
    .raven-grab-section-toggle[aria-expanded="false"] .raven-grab-caret { transform: rotate(-90deg); }
    .raven-grab-collapsible { display: grid; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 150ms ease, opacity 150ms ease; }
    .raven-grab-collapsible[data-open="false"] { grid-template-rows: 0fr; opacity: 0; }
    .raven-grab-collapsible-inner { min-height: 0; overflow: hidden; visibility: visible; transition: visibility 0s linear; }
    .raven-grab-collapsible[data-open="false"] .raven-grab-collapsible-inner { visibility: hidden; transition-delay: 150ms; }
    .raven-grab-element-wrap { position: relative; display: inline-block; max-width: min(100%, 320px); }
    .raven-grab-element-chip { display: block; max-width: 100%; padding: 3px 8px; overflow: hidden; color: var(--raven-grab-accent); background: rgba(0, 191, 255, .1); border: 1px solid rgba(0, 191, 255, .3); border-radius: 4px; cursor: pointer; font: 500 11px/1.4 var(--raven-grab-mono); text-overflow: ellipsis; white-space: nowrap; transition: background 150ms ease, border-color 150ms ease, color 150ms ease; }
    .raven-grab-element-chip:hover { background: rgba(0, 191, 255, .16); border-color: rgba(0, 191, 255, .55); }
    .raven-grab-element-chip:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 2px; }
    .raven-grab-element-chip[data-copied="true"] { color: #00BFFF; }
    .raven-grab-element-tooltip { position: absolute; top: calc(100% + 6px); left: 0; z-index: 3; width: max-content; max-width: 320px; padding: 7px 9px; visibility: hidden; opacity: 0; color: var(--raven-grab-text); background: #1a1a22; border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .35); font: 400 11px/1.4 var(--raven-grab-mono); overflow-wrap: anywhere; pointer-events: none; white-space: normal; transition: opacity 120ms ease, visibility 120ms ease; }
    .raven-grab-element-wrap:hover .raven-grab-element-tooltip, .raven-grab-element-wrap:focus-within .raven-grab-element-tooltip { visibility: visible; opacity: 1; }
    .raven-grab-token {
      padding: 12px; background: var(--raven-grab-raised); border: 1px solid rgba(255, 255, 255, .06); border-radius: 12px;
    }
    .raven-grab-token + .raven-grab-token { margin-top: 8px; }
    .raven-grab-token-line { display: flex; align-items: center; min-height: 20px; gap: 8px; }
    .raven-grab-swatch { width: 16px; height: 16px; flex: 0 0 auto; border: 1px solid rgba(255, 255, 255, .12); border-radius: 4px; background: var(--swatch, transparent); }
    .raven-grab-token-name { min-width: 0; flex: 1; color: var(--raven-grab-tertiary); font: 500 11px/1.3 var(--raven-grab-mono); overflow-wrap: anywhere; }
    .raven-grab-token-value { display: none; }
    .raven-grab-field { display: block; margin-top: 8px; }
    .raven-grab-field > span { display: block; margin-bottom: 4px; color: var(--raven-grab-muted); font: 600 11px/1.35 var(--raven-grab-ui); }
    .raven-grab-input, .raven-grab-select, .raven-grab-textarea {
      width: 100%; min-height: 44px; padding: 7px 14px; color: var(--raven-grab-text); background: var(--raven-grab-bg);
      border: 1px solid rgba(255, 255, 255, .12); border-radius: 10px; outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .raven-grab-input, .raven-grab-select { font: 500 13px/1.4 var(--raven-grab-mono); }
    .raven-grab-select { cursor: pointer; }
    .raven-grab-input:hover, .raven-grab-select:hover, .raven-grab-textarea:hover { border-color: rgba(0, 191, 255, .3); }
    .raven-grab-input:focus, .raven-grab-select:focus, .raven-grab-textarea:focus { border-color: var(--raven-grab-accent); box-shadow: 0 0 0 3px rgba(0, 191, 255, .15); }
    .raven-grab-textarea { min-height: 88px; padding: 12px 14px; resize: vertical; font: 400 12px/1.4 var(--raven-grab-ui); }
    .raven-grab-textarea::placeholder, .raven-grab-input::placeholder { color: var(--raven-grab-tertiary); }
    .raven-grab-use-case { min-height: 200px; }
    .raven-grab-new-token { display: none; grid-template-columns: 1fr 1fr; gap: 8px; }
    .raven-grab-new-token[data-open="true"] { display: grid; }
    .raven-grab-styles { margin: 0; padding: 0; overflow: hidden; list-style: none; background: var(--raven-grab-raised); border: 1px solid rgba(255, 255, 255, .06); border-radius: 12px; }
    .raven-grab-styles li { display: grid; grid-template-columns: minmax(92px, .8fr) minmax(0, 1.2fr); align-items: center; gap: 12px; min-height: 36px; padding: 9px 12px; }
    .raven-grab-styles li + li { border-top: 1px solid rgba(255, 255, 255, .06); }
    .raven-grab-styles li[data-edited="true"] { background: rgba(0, 191, 255, .08); }
    .raven-grab-styles span { color: var(--raven-grab-tertiary); font: 400 11px/1.4 var(--raven-grab-mono); }
    .raven-grab-styles code { display: flex; align-items: center; justify-content: flex-end; min-height: 18px; overflow-wrap: anywhere; color: var(--raven-grab-text); font: 400 11px/1.4 var(--raven-grab-mono); cursor: pointer; border-radius: 4px; text-align: right; }
    .raven-grab-styles code:hover { background: rgba(255, 255, 255, .04); text-decoration: underline dashed; text-underline-offset: 3px; }
    .raven-grab-styles code:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 2px; }
    .raven-grab-styles li[data-edited="true"] code { color: var(--raven-grab-accent); font-weight: 700; }
    .raven-grab-styles li[data-error="true"] { border-color: #FF4060; }
    .raven-grab-style-input {
      width: 100%; min-width: 0; min-height: 32px; padding: 6px 10px; color: var(--raven-grab-text); background: var(--raven-grab-bg);
      border: 1px solid var(--raven-grab-accent); border-radius: 8px; outline: none;
      font: 400 11px/1.4 var(--raven-grab-mono);
    }
    .raven-grab-style-input:focus { box-shadow: 0 0 0 3px rgba(0, 191, 255, .15); }
    .raven-grab-empty { margin: 0; padding: 12px; color: var(--raven-grab-muted); background: var(--raven-grab-raised); border: 1px dashed rgba(255, 255, 255, .1); border-radius: 12px; font: 400 12px/1.45 var(--raven-grab-ui); }
    .raven-grab-actions { flex: 0 0 auto; padding: 12px 16px 16px; background: #212129; border-top: 1px solid rgba(255, 255, 255, .06); }
    .raven-grab-send {
      display: flex; align-items: center; justify-content: center; width: 100%; height: 44px; min-height: 44px; margin: 0 auto; padding: 12px 28px;
      overflow: hidden; border: 0 solid transparent; border-radius: 9999px; color: #0a1018;
      background: var(--raven-grab-accent); cursor: pointer;
      font: 600 14px/1 var(--raven-grab-ui);
      box-shadow: 0 4px 20px rgba(0, 191, 255, .4);
      transition: width 250ms ease, background 250ms ease, border-radius 250ms ease, border-color 250ms ease, box-shadow 250ms ease, color 250ms ease, padding 250ms ease, transform 150ms cubic-bezier(.16, 1, .3, 1);
    }
    .raven-grab-send[data-send-state="default"]:hover { background: var(--raven-grab-accent-hover); transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(0, 191, 255, .8), 0 8px 32px rgba(0, 191, 255, .45), 0 0 60px rgba(0, 191, 255, .2); }
    .raven-grab-send[data-send-state="check"] {
      width: 44px; height: 44px; padding: 0; color: #00BFFF; background: rgba(255, 255, 255, .06);
      border: 1.375px solid #00BFFF; border-radius: 9999px; box-shadow: none;
    }
    .raven-grab-send[data-send-state="sent"] {
      width: var(--raven-grab-sent-width, max-content); height: 44px; padding: 0; color: #00BFFF;
      background: rgba(22, 44, 66, .9); border: 1px solid #00BFFF; border-radius: 9999px;
      box-shadow: none; backdrop-filter: blur(6px);
    }
    .raven-grab-check {
      display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: 0 0 44px;
      color: #00BFFF; font: 700 16.5px/1 var(--raven-grab-ui);
    }
    .raven-grab-sent-content { display: inline-flex; align-items: center; gap: 10px; padding-right: 16px; white-space: nowrap; }
    .raven-grab-send[data-send-state="sent"] .raven-grab-check {
      background: rgba(255, 255, 255, .06); border: 1.375px solid #00BFFF; border-radius: 9999px;
    }
    .raven-grab-sent-message { color: #00BFFF; font: 600 14px/1 var(--raven-grab-ui); }
    .raven-grab-send:focus-visible, .raven-grab-icon-button:focus-visible { outline: 3px solid rgba(0, 191, 255, .35); outline-offset: 2px; }
    .raven-grab-send:disabled { cursor: wait; }
    .raven-grab-status { min-height: 18px; margin: 8px 2px 0; color: var(--raven-grab-tertiary); font: 400 11px/1.4 var(--raven-grab-ui); text-align: center; }
    .raven-grab-status[data-kind="error"] { color: var(--raven-grab-error); }
    .raven-grab-status[data-kind="success"] { color: #00E676; }
    .raven-grab-arm {
      position: fixed; left: 50%; bottom: 20px; min-height: 44px; padding: 12px 20px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 8px; pointer-events: auto; cursor: pointer;
      color: var(--raven-grab-text); background: rgba(14, 30, 46, .82); border: 1px solid rgba(0, 191, 255, .3); border-radius: 9999px;
      backdrop-filter: blur(12px) saturate(1.4); font: 500 13px/1 var(--raven-grab-mono);
      box-shadow: 0 4px 24px rgba(0, 0, 0, .3), 0 0 0 1px rgba(0, 0, 0, .2);
      transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    }
    .raven-grab-arm::before { content: ""; width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--raven-grab-accent); box-shadow: 0 0 12px var(--raven-grab-accent), 0 0 24px rgba(0, 191, 255, .3); }
    .raven-grab-arm:hover { background: rgba(22, 44, 66, .9); border-color: var(--raven-grab-accent); }
    .raven-grab-arm[data-armed="false"] { color: var(--raven-grab-muted); background: rgba(36, 36, 46, .95); border-color: rgba(255, 255, 255, .12); }
    .raven-grab-arm[data-armed="false"]::before { background: #5C5F68; box-shadow: none; }
    .raven-grab-arm[data-armed="false"]:hover { color: var(--raven-grab-text); background: var(--raven-grab-overlay); border-color: var(--raven-grab-accent); }
    .raven-grab-arm:focus-visible { outline: 3px solid rgba(0, 191, 255, .35); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; }
      .raven-grab-send { transition: none !important; }
    }
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
      if (value !== null && typeof value !== "object") {
        if (!path.length) return;
        var flatPath = path.length === 1 ? String(path[0]).split(".") : path;
        var flatName = flatPath[flatPath.length - 1];
        var flatGroup = flatPath.length > 1 ? flatPath[0] : "custom";
        output.push({
          path: flatPath.join("."),
          name: String(flatName),
          value: String(value),
          group: String(flatGroup),
          cssVar: "--" + flatPath.join("-").replace(/[^\w-]+/g, "-").toLowerCase()
        });
        return;
      }
      if (!value) return;
      var tokenValue = value.value !== undefined ? value.value : value.$value;
      // Ref tokens arrive as {$ref: "colors.primary"} — show them as "{colors.primary}".
      if (tokenValue && typeof tokenValue === "object") {
        tokenValue = tokenValue.$ref ? "{" + tokenValue.$ref + "}" : undefined;
      }
      var cssVar = value.cssVar || value.cssVariable || value.cssVariableName || value.cssVarName || value.css_var || value.variable;
      if (tokenValue !== undefined && (value.name || cssVar || path.length)) {
        var tokenPath = typeof value.path === "string" ? value.path.split(".") : (path.length === 1 ? String(path[0]).split(".") : path);
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

  function legacyCopyText(value) {
    var textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }
    if (!copied) return Promise.reject(new Error("Copy command was rejected"));
    return Promise.resolve();
  }

  function writeClipboardText(value) {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return Promise.resolve(navigator.clipboard.writeText(value)).catch(function () {
        return legacyCopyText(value);
      });
    }
    return legacyCopyText(value);
  }

  function copyElementSelector(chip) {
    if (!currentSelection || !chip) return Promise.resolve(false);
    var selector = currentSelection.selector;
    return writeClipboardText(selector).then(function () {
      chip.textContent = "Copied";
      chip.setAttribute("data-copied", "true");
      setTimeout(function () {
        chip.textContent = selector;
        chip.setAttribute("data-copied", "false");
      }, 1200);
      return true;
    }).catch(function (error) {
      console.warn("[Raven Grab] Could not copy the element selector.", error);
      return false;
    });
  }

  function styleEditsForSend() {
    return Object.keys(styleEdits).map(function (property) { return styleEdits[property]; });
  }

  function restoreStyleEdit(property) {
    var original = styleEditOriginalInline[property];
    if (!selectedElement || !original) return;
    if (original.value) selectedElement.style.setProperty(property, original.value, original.priority);
    else selectedElement.style.removeProperty(property);
  }

  function rollbackStyleEdits() {
    Object.keys(styleEditOriginalInline).forEach(restoreStyleEdit);
    styleEdits = Object.create(null);
    styleEditOriginalInline = Object.create(null);
  }

  function rollbackTokenPreviews() {
    Object.keys(previewOriginals).forEach(function (cssVar) {
      var original = previewOriginals[cssVar];
      var target = original.target || document.documentElement;
      if (original.value) target.style.setProperty(cssVar, original.value, original.priority);
      else target.style.removeProperty(cssVar);
    });
    previewOriginals = Object.create(null);
  }

  function commitStyleEdit(property, newValue, currentValue) {
    if (!selectedElement || newValue === currentValue) return false;
    if (window.CSS && typeof window.CSS.supports === "function" && !window.CSS.supports(property, newValue)) return false;
    var originalValue = styleEdits[property] ? styleEdits[property].oldValue : currentSelection.styles[property];
    if (!styleEditOriginalInline[property]) {
      styleEditOriginalInline[property] = {
        value: selectedElement.style.getPropertyValue(property),
        priority: selectedElement.style.getPropertyPriority(property)
      };
    }
    if (newValue === originalValue) {
      restoreStyleEdit(property);
      delete styleEdits[property];
      delete styleEditOriginalInline[property];
    } else {
      selectedElement.style.setProperty(property, newValue);
      styleEdits[property] = { property: property, oldValue: originalValue, newValue: newValue };
    }
    return true;
  }

  function replaceStyleInput(input, value) {
    var row = input.parentElement;
    var property = row.getAttribute("data-style-property");
    var cell = document.createElement("code");
    cell.setAttribute("data-style-value", "");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", "Edit " + property);
    cell.textContent = value;
    row.setAttribute("data-edited", styleEdits[property] ? "true" : "false");
    input.parentNode.replaceChild(cell, input);
  }

  function cancelStyleEdit(input, previousValue) {
    if (input && input.parentNode) replaceStyleInput(input, previousValue);
  }

  function beginStyleEdit(valueCell) {
    var row = valueCell.parentElement;
    var property = row.getAttribute("data-style-property");
    var previousValue = valueCell.textContent;
    var input = document.createElement("input");
    var finished = false;
    input.className = "raven-grab-style-input";
    input.type = "text";
    input.value = previousValue;
    input.setAttribute("data-style-input", property);
    valueCell.parentNode.replaceChild(input, valueCell);
    input.focus();
    input.select();

    function commit() {
      if (finished) return;
      finished = true;
      var newValue = input.value.trim();
      var committed = commitStyleEdit(property, newValue, previousValue);
      if (!committed && newValue !== previousValue) {
        row.setAttribute("data-error", "true");
        setTimeout(function () {
          if (typeof row.removeAttribute === "function") row.removeAttribute("data-error");
        }, 600);
      }
      replaceStyleInput(input, committed ? newValue : previousValue);
    }

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finished = true;
        cancelStyleEdit(input, previousValue);
      }
    });
    input.addEventListener("blur", commit);
  }

  function optionMarkup(value, label, selectedValue) {
    return '<option value="' + escapeHtml(value) + '"' + (value === selectedValue ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function capturePanelDrafts() {
    var instruction = panel.querySelector("[data-instruction]");
    if (instruction) instructionDraft = instruction.value;
    var issueType = panel.querySelector("[data-issue-type]");
    var issueSize = panel.querySelector("[data-issue-size]");
    var useCase = panel.querySelector("[data-use-case]");
    var email = panel.querySelector("[data-component-email]");
    if (issueType) componentRequest.issueType = issueType.value;
    if (issueSize) componentRequest.issueSize = issueSize.value;
    if (useCase) componentRequest.useCase = useCase.value;
    if (email) componentRequest.email = email.value;
  }

  function selectedTokenChoice(index, alternatives) {
    var intent = tokenIntents[index];
    if (!intent) return "";
    for (var i = 0; i < alternatives.length; i += 1) {
      if (alternatives[i].path === intent.newTokenPath) return alternatives[i].cssVar;
    }
    return "__new__";
  }

  function renderPanel() {
    if (!currentSelection) return;
    var tokens = currentSelection.tokens;
    var matchedTokens = tokens.map(function (token, index) {
      return { token: token, index: index };
    }).filter(function (entry) { return entry.token.bridgeToken; });
    var tokenMarkup = matchedTokens.length
      ? matchedTokens.map(function (entry) {
          var token = entry.token;
          var index = entry.index;
          var alternatives = alternativesFor(token);
          var selectedChoice = selectedTokenChoice(index, alternatives);
          var intent = tokenIntents[index];
          var options = alternatives.map(function (alternative) {
            return optionMarkup(alternative.cssVar, alternative.name + " · " + alternative.value, selectedChoice);
          }).join("");
          return `
            <div class="raven-grab-token" data-token-index="${index}">
              <div class="raven-grab-token-line">
                <span class="raven-grab-swatch" style="--swatch:${isColor(token.value) ? escapeHtml(token.value) : "transparent"}"></span>
                <span class="raven-grab-token-name">${escapeHtml(token.property)}</span>
                <span class="raven-grab-token-value">${escapeHtml(token.value || "unresolved")}</span>
              </div>
              <label class="raven-grab-field">
                <select class="raven-grab-select" data-token-choice="${index}">
                  ${optionMarkup("", token.name + " · " + (token.value || "unresolved"), selectedChoice)}${options}${optionMarkup("__new__", "New token…", selectedChoice)}
                </select>
              </label>
              <div class="raven-grab-new-token" data-new-token="${index}" data-open="${selectedChoice === "__new__" ? "true" : "false"}">
                <label class="raven-grab-field"><span>Name</span><input class="raven-grab-input" data-new-name="${index}" value="${escapeHtml(intent && intent.newToken ? intent.newToken : "")}" placeholder="e.g. accent-soft"></label>
                <label class="raven-grab-field"><span>Value</span><input class="raven-grab-input" data-new-value="${index}" value="${escapeHtml(intent && intent.newTokenValue ? intent.newTokenValue : token.value)}" placeholder="#000000"></label>
              </div>
            </div>`;
        }).join("")
      : '<p class="raven-grab-empty">No design tokens matched this element. Computed styles are still included.</p>';
    var tokenizedProperties = matchedTokens.map(function (entry) { return entry.token.property; });
    var stylesMarkup = Object.keys(currentSelection.styles).filter(function (property) {
      return tokenizedProperties.indexOf(property) === -1;
    }).map(function (property) {
      var edit = styleEdits[property];
      var value = edit ? edit.newValue : currentSelection.styles[property];
      return '<li data-style-property="' + escapeHtml(property) + '" data-edited="' + (edit ? "true" : "false") + '"><span>' + escapeHtml(property) + '</span><code data-style-value tabindex="0" role="button" aria-label="Edit ' + escapeHtml(property) + '">' + escapeHtml(value) + "</code></li>";
    }).join("");

    var elementMarkup = `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">ELEMENT</h2>
        <span class="raven-grab-element-wrap">
          <span class="raven-grab-element-chip" data-element-selector tabindex="0" role="button" aria-label="Copy element selector" title="${escapeHtml(currentSelection.selector)}">${escapeHtml(currentSelection.selector)}</span>
          <span class="raven-grab-element-tooltip" role="tooltip">${escapeHtml(currentSelection.selector)}</span>
        </span>
      </section>`;
    var designMarkup = `
      ${elementMarkup}
      <section class="raven-grab-section">
        <button class="raven-grab-section-toggle" type="button" data-section-toggle="tokens" aria-expanded="${expandedSections.tokens ? "true" : "false"}" aria-controls="raven-grab-tokens"><span>DESIGN TOKENS</span><span class="raven-grab-caret" aria-hidden="true">▾</span></button>
        <div class="raven-grab-collapsible" id="raven-grab-tokens" data-section-body="tokens" data-open="${expandedSections.tokens ? "true" : "false"}" aria-hidden="${expandedSections.tokens ? "false" : "true"}"><div class="raven-grab-collapsible-inner">${tokenMarkup}</div></div>
      </section>
      <section class="raven-grab-section">
        <button class="raven-grab-section-toggle" type="button" data-section-toggle="styles" aria-expanded="${expandedSections.styles ? "true" : "false"}" aria-controls="raven-grab-styles"><span>COMPUTED STYLES - NOT TOKENIZED</span><span class="raven-grab-caret" aria-hidden="true">▾</span></button>
        <div class="raven-grab-collapsible" id="raven-grab-styles" data-section-body="styles" data-open="${expandedSections.styles ? "true" : "false"}" aria-hidden="${expandedSections.styles ? "false" : "true"}"><div class="raven-grab-collapsible-inner"><ul class="raven-grab-styles">${stylesMarkup}</ul></div></div>
      </section>
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">INSTRUCTIONS</h2>
        <textarea class="raven-grab-textarea" data-instruction placeholder="Tell the agent what to change…">${escapeHtml(instructionDraft)}</textarea>
      </section>`;
    var issueTypes = ["UX/Usability", "Visual bug", "Missing variant", "Accessibility", "New pattern", "Other"];
    var issueSizes = ["1-10 users/customers", "10-100", "100-1,000", "1,000+", "Internal only"];
    var requestFormMarkup = `
      ${elementMarkup}
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">REASON FOR NEW COMPONENT</h2>
        <div class="raven-grab-token"><label class="raven-grab-field"><span>Issue type</span><select class="raven-grab-select" data-issue-type required><option value="">Issue type</option>${issueTypes.map(function (value) { return optionMarkup(value, value, componentRequest.issueType); }).join("")}</select></label></div>
        <div class="raven-grab-token"><label class="raven-grab-field"><span>Issue size</span><select class="raven-grab-select" data-issue-size required><option value="">Issue size</option>${issueSizes.map(function (value) { return optionMarkup(value, value, componentRequest.issueSize); }).join("")}</select></label></div>
      </section>
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">DESCRIBE THE USE CASE AND IMPACT</h2>
        <textarea class="raven-grab-textarea raven-grab-use-case" data-use-case placeholder="Tell the design team why you need this…">${escapeHtml(componentRequest.useCase)}</textarea>
      </section>`;
    var emailMarkup = `
      ${elementMarkup}
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">EMAIL YOURSELF THE COMPONENT</h2>
        <input class="raven-grab-input" data-component-email type="email" value="${escapeHtml(componentRequest.email)}" placeholder="email" required>
      </section>`;
    var bodyMarkup = activeTab === "design"
      ? designMarkup
      : (componentRequestStep === "email" ? emailMarkup : requestFormMarkup);
    var actionMarkup = activeTab === "design"
      ? '<button class="raven-grab-send" type="button" data-send data-send-state="default"><span class="raven-grab-send-label">Send to agent</span></button>'
      : (componentRequestStep === "email"
          ? '<button class="raven-grab-send" type="button" data-send-email data-send-state="default"><span class="raven-grab-send-label">Send email</span></button>'
          : '<button class="raven-grab-send" type="button" data-request-next data-send-state="default"><span class="raven-grab-send-label">Send component request to design</span></button>');

    panel.innerHTML = `
      <div class="raven-grab-top">
        <div class="raven-grab-header">
          <div class="raven-grab-title"><strong>Raven design</strong></div>
          <button class="raven-grab-icon-button" type="button" data-close aria-label="Dismiss Raven Grab">&gt;</button>
        </div>
        <div class="raven-grab-tabs" role="tablist" aria-label="Raven design actions">
          <button class="raven-grab-tab" type="button" role="tab" data-tab="design" aria-selected="${activeTab === "design" ? "true" : "false"}">Design</button>
          <button class="raven-grab-tab" type="button" role="tab" data-tab="request" aria-selected="${activeTab === "request" ? "true" : "false"}">Request Component</button>
        </div>
      </div>
      <div class="raven-grab-body"><div class="raven-grab-content">${bodyMarkup}</div></div>
      <div class="raven-grab-actions">${actionMarkup}<p class="raven-grab-status" data-status aria-live="polite"></p></div>`;
    panel.setAttribute("aria-hidden", "false");
  }

  function switchTab(tab) {
    if (tab !== "design" && tab !== "request") return;
    capturePanelDrafts();
    activeTab = tab;
    renderPanel();
  }

  function toggleSection(section) {
    if (section !== "tokens" && section !== "styles") return;
    expandedSections[section] = !expandedSections[section];
    var toggle = panel.querySelector('[data-section-toggle="' + section + '"]');
    var body = panel.querySelector('[data-section-body="' + section + '"]');
    if (!toggle || !body) {
      renderPanel();
      return;
    }
    toggle.setAttribute("aria-expanded", expandedSections[section] ? "true" : "false");
    body.setAttribute("data-open", expandedSections[section] ? "true" : "false");
    body.setAttribute("aria-hidden", expandedSections[section] ? "false" : "true");
  }

  function dismiss() {
    rollbackTokenPreviews();
    rollbackStyleEdits();
    selectedElement = null;
    hoveredElement = null;
    currentSelection = null;
    reactMetadata = null;
    activeTab = "design";
    expandedSections = { tokens: false, styles: false };
    instructionDraft = "";
    componentRequestStep = "form";
    componentRequest = { issueType: "", issueSize: "", useCase: "", email: "" };
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
    // Preview on the selected element: an inline custom property there beats any
    // ancestor definition (e.g. a component-local --demo-* block), which a
    // documentElement-level override would not.
    var previewEl = selectedElement || document.documentElement;
    if (!choice) {
      delete tokenIntents[index];
      if (previewOriginals[token.cssVar]) {
        var original = previewOriginals[token.cssVar];
        var target = original.target || document.documentElement;
        if (original.value) target.style.setProperty(token.cssVar, original.value, original.priority);
        else target.style.removeProperty(token.cssVar);
        delete previewOriginals[token.cssVar];
      }
      return;
    }
    if (!previewOriginals[token.cssVar]) {
      previewOriginals[token.cssVar] = {
        target: previewEl,
        value: previewEl.style.getPropertyValue(token.cssVar),
        priority: previewEl.style.getPropertyPriority(token.cssVar)
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
      if (valueInput.value.trim()) previewEl.style.setProperty(token.cssVar, valueInput.value.trim());
      return;
    }
    var alternative = tokenByCssVar(choice);
    if (!alternative) return;
    tokenIntents[index] = tokenIntentFor(token, alternative);
    previewEl.style.setProperty(token.cssVar, alternative.value);
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
    capturePanelDrafts();
    var payload = {
      selector: currentSelection.selector,
      html: currentSelection.html,
      rect: currentSelection.rect,
      styles: currentSelection.styles,
      tokens: currentSelection.tokens,
      tokenIntents: Object.keys(tokenIntents).map(function (key) { return tokenIntents[key]; }),
      styleEdits: styleEditsForSend(),
      instruction: instructionDraft
    };
    if (componentRequest.issueType || componentRequest.issueSize || componentRequest.useCase || componentRequest.email) {
      payload.componentRequest = {
        issueType: componentRequest.issueType,
        issueSize: componentRequest.issueSize,
        useCase: componentRequest.useCase,
        email: componentRequest.email
      };
    }
    if (reactMetadata) {
      Object.keys(reactMetadata).forEach(function (key) {
        if (reactMetadata[key] !== undefined) payload[key] = reactMetadata[key];
      });
    }
    return payload;
  }

  function sendButtonMarkup(state, message) {
    if (state === "check") return '<span class="raven-grab-check" aria-hidden="true">✓</span>';
    if (state === "sent") {
      return '<span class="raven-grab-sent-content"><span class="raven-grab-check" aria-hidden="true">✓</span><span class="raven-grab-sent-message">' + escapeHtml(message) + "</span></span>";
    }
    return '<span class="raven-grab-send-label">' + escapeHtml(message) + "</span>";
  }

  function setSendButtonState(button, state, message) {
    if (!button) return;
    if (state === "sent") {
      var markup = sendButtonMarkup(state, message);
      button.innerHTML = markup;
      // Measure the natural pill width with an offscreen clone: the live button is
      // still 44px wide mid-morph, so its own scrollWidth under-reports and clips
      // the sent message.
      if (button.parentNode && button.style && typeof button.style.setProperty === "function") {
        var probe = document.createElement("button");
        probe.className = button.className;
        probe.setAttribute("data-send-state", "sent");
        probe.style.cssText = "position:absolute;visibility:hidden;width:max-content;transition:none;";
        probe.innerHTML = markup;
        button.parentNode.appendChild(probe);
        var sentWidth = probe.offsetWidth;
        probe.remove();
        if (sentWidth) button.style.setProperty("--raven-grab-sent-width", sentWidth + "px");
      }
    } else {
      button.innerHTML = sendButtonMarkup(state, message);
    }
    button.setAttribute("data-send-state", state);
  }

  function morphSendButton(button, selector, sentMessage, defaultLabel) {
    if (!button) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-label", sentMessage);
    setSendButtonState(button, "check", sentMessage);
    setTimeout(function () {
      if (panel.querySelector(selector) !== button) return;
      setSendButtonState(button, "sent", sentMessage);
    }, 650);
    setTimeout(function () {
      if (panel.querySelector(selector) !== button) return;
      setSendButtonState(button, "check", sentMessage);
    }, 2500);
    setTimeout(function () {
      if (panel.querySelector(selector) !== button) return;
      setSendButtonState(button, "default", defaultLabel);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-label");
      if (button.style && typeof button.style.removeProperty === "function") button.style.removeProperty("--raven-grab-sent-width");
    }, 2750);
  }

  async function sendSelection() {
    var button = panel.querySelector("[data-send]");
    var status = panel.querySelector("[data-status]");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Sending…";
    status.textContent = "";
    status.removeAttribute("data-kind");
    try {
      var payload = payloadForSend();
      var endpoint = grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab");
      if (!endpoint) {
        status.textContent = "Would send " + payload.selector + " · " + payload.tokenIntents.length + (payload.tokenIntents.length === 1 ? " token change" : " token changes") + " · " + payload.styleEdits.length + (payload.styleEdits.length === 1 ? " style edit" : " style edits");
        status.setAttribute("data-kind", "success");
        morphSendButton(button, "[data-send]", "Sent to agent", "Send to agent");
        return;
      }
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Bridge returned " + response.status);
      reactMetadata = null;
      status.textContent = "Sent to agent";
      status.setAttribute("data-kind", "success");
      morphSendButton(button, "[data-send]", "Sent to agent", "Send to agent");
    } catch (error) {
      status.textContent = "Could not reach the Raven bridge";
      status.setAttribute("data-kind", "error");
      button.disabled = false;
      button.textContent = "Try again";
      button.setAttribute("data-send-state", "default");
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-label");
      console.error("[Raven Grab] POST /grab failed.", error);
    }
  }

  function setPanelStatus(message, kind) {
    var status = panel.querySelector("[data-status]");
    if (!status) return;
    status.textContent = message;
    if (kind) status.setAttribute("data-kind", kind);
    else status.removeAttribute("data-kind");
  }

  function advanceComponentRequest() {
    capturePanelDrafts();
    if (!componentRequest.issueType || !componentRequest.issueSize || !componentRequest.useCase.trim()) {
      setPanelStatus("Choose an issue type and size, then describe the impact.", "error");
      return;
    }
    componentRequestStep = "email";
    renderPanel();
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function sendComponentRequestEmail(requestOverride) {
    if (requestOverride) {
      componentRequest = {
        issueType: requestOverride.issueType || "",
        issueSize: requestOverride.issueSize || "",
        useCase: requestOverride.useCase || "",
        email: requestOverride.email || ""
      };
    } else {
      capturePanelDrafts();
    }
    var button = panel.querySelector("[data-send-email]");
    var emailInput = panel.querySelector("[data-component-email]");
    if (!validEmail(componentRequest.email)) {
      setPanelStatus("Enter a valid email address.", "error");
      if (emailInput) emailInput.focus();
      return false;
    }
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Sending…";
    }
    setPanelStatus("", "");
    try {
      var standaloneEndpoint = grabConfig && grabConfig.componentRequestEndpoint;
      var endpoint = standaloneEndpoint || bridgeUrl("/grab");
      var body = standaloneEndpoint ? {
        selector: currentSelection.selector,
        tokens: currentSelection.tokens,
        styles: currentSelection.styles,
        issueType: componentRequest.issueType,
        issueSize: componentRequest.issueSize,
        useCase: componentRequest.useCase,
        email: componentRequest.email
      } : payloadForSend();
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("Request returned " + response.status);
      setPanelStatus("Email sent", "success");
      if (button) morphSendButton(button, "[data-send-email]", "Email sent", "Send email");
      return true;
    } catch (error) {
      setPanelStatus("Could not send the component request", "error");
      if (button) {
        button.disabled = false;
        button.textContent = "Try again";
        button.setAttribute("data-send-state", "default");
        button.removeAttribute("aria-busy");
        button.removeAttribute("aria-label");
      }
      console.error("[Raven Grab] Component request failed.", error);
      return false;
    }
  }

  panel.addEventListener("click", function (event) {
    event.stopPropagation();
    var elementChip = event.target.closest("[data-element-selector]");
    if (elementChip) copyElementSelector(elementChip);
    if (event.target.closest("[data-close]")) dismiss();
    if (event.target.closest("[data-send]")) sendSelection();
    if (event.target.closest("[data-request-next]")) advanceComponentRequest();
    if (event.target.closest("[data-send-email]")) sendComponentRequestEmail();
    var tab = event.target.closest("[data-tab]");
    if (tab) switchTab(tab.getAttribute("data-tab"));
    var sectionToggle = event.target.closest("[data-section-toggle]");
    if (sectionToggle) toggleSection(sectionToggle.getAttribute("data-section-toggle"));
    var styleValue = event.target.closest("[data-style-value]");
    if (styleValue) beginStyleEdit(styleValue);
  });
  panel.addEventListener("keydown", function (event) {
    var elementChip = event.target.closest("[data-element-selector]");
    if (elementChip && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      copyElementSelector(elementChip);
    }
    var styleValue = event.target.closest("[data-style-value]");
    if (styleValue && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      beginStyleEdit(styleValue);
    }
  });
  panel.addEventListener("change", function (event) {
    var index = event.target.getAttribute("data-token-choice");
    if (index !== null) updateIntent(Number(index));
    if (event.target.getAttribute("data-issue-type") !== null) componentRequest.issueType = event.target.value;
    if (event.target.getAttribute("data-issue-size") !== null) componentRequest.issueSize = event.target.value;
  });
  panel.addEventListener("input", function (event) {
    var index = event.target.getAttribute("data-new-name");
    if (index === null) index = event.target.getAttribute("data-new-value");
    if (index !== null) updateIntent(Number(index));
    if (event.target.getAttribute("data-instruction") !== null) instructionDraft = event.target.value;
    if (event.target.getAttribute("data-use-case") !== null) componentRequest.useCase = event.target.value;
    if (event.target.getAttribute("data-component-email") !== null) componentRequest.email = event.target.value;
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
    rollbackTokenPreviews();
    rollbackStyleEdits();
    tokenIntents = Object.create(null);
    styleEdits = Object.create(null);
    styleEditOriginalInline = Object.create(null);
    activeTab = "design";
    expandedSections = { tokens: false, styles: false };
    instructionDraft = "";
    componentRequestStep = "form";
    componentRequest = { issueType: "", issueSize: "", useCase: "", email: "" };
    selectedElement = target;
    setHighlight(target);
    currentSelection = selectionFor(target);
    renderPanel();
  }, true);

  document.addEventListener("keydown", function (event) {
    var styleInput = shadow.activeElement && shadow.activeElement.getAttribute("data-style-input") !== null;
    if (event.key === "Escape" && !styleInput) dismiss();
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

  if (grabConfig) {
    bridgeTokens = normalizeTokens(grabConfig.tokens || {});
  } else {
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
  }
})();
