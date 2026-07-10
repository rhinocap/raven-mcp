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
  var suppliedGrabConfig = window.RavenGrabConfig || window.ravenGrabConfig || null;
  var grabConfig = suppliedGrabConfig && suppliedGrabConfig.mode === "standalone"
    ? suppliedGrabConfig
    : null;
  var grabRole = suppliedGrabConfig && suppliedGrabConfig.role === "maintainer" ? "maintainer" : "consumer";
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
  var Z_INDEX = "2147483647";
  var STYLE_PROPERTIES = [
    "display", "position", "box-sizing", "width", "height", "margin", "padding", "gap",
    "color", "background", "background-color", "border-color", "outline-color", "fill", "stroke", "border-width", "border-style", "border-radius",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-decoration",
    "opacity", "box-shadow", "align-items", "justify-content", "grid-template-columns"
  ];
  var INTERACTIVE_STATES = ["hover", "focus", "active", "disabled"];

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
  var componentRequestId = "";
  var collapsed = window.innerWidth <= 640;
  var panelDrag = null;
  var panelPosition = null;
  var SEND_TIMINGS = {
    collapse: 250, // Beat 1: pill collapses into the dot.
    dot: 120, // Beat 2: solid dot hold.
    trace: 450, // Beat 3: dot becomes the check stroke.
    expand: 500, // Beat 4: pill, label, and border draw together.
    hold: 1800 // Beat 5: completed result hold before reset.
  };

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
      overscroll-behavior: contain; transform: translateX(0); transition: transform 200ms ease;
    }
    .raven-grab-panel[aria-hidden="false"] { display: flex; }
    .raven-grab-panel[data-collapsed="true"] { display: flex; transform: translateX(calc(100vw + 100%)); pointer-events: none; }
    .raven-grab-top { flex: 0 0 auto; background: #212129; }
    .raven-grab-header {
      display: flex; align-items: center; min-height: 56px; padding: 12px 16px;
      background: rgba(255, 255, 255, .01); border-bottom: 1px solid rgba(255, 255, 255, .06); cursor: grab; touch-action: none; user-select: none;
    }
    .raven-grab-panel[data-dragging="true"] .raven-grab-header { cursor: grabbing; }
    .raven-grab-title { min-width: 0; flex: 1; }
    .raven-grab-title strong { display: block; color: var(--raven-grab-text); font: 500 14px/1.3 var(--raven-grab-ui); letter-spacing: -.01em; }
    .raven-grab-icon-button {
      width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%;
      color: var(--raven-grab-muted); background: rgba(255, 255, 255, .06); cursor: pointer;
      font: 18px/1 var(--raven-grab-ui); transition: color 150ms ease, background 150ms ease;
    }
    .raven-grab-icon-button:hover { color: var(--raven-grab-text); background: rgba(255, 255, 255, .12); }
    .raven-grab-tabs { display: grid; grid-template-columns: 1fr 1fr; min-height: 44px; background: rgba(255, 255, 255, .01); border-bottom: 1px solid rgba(255, 255, 255, .12); backdrop-filter: blur(6px); }
    .raven-grab-tab { min-height: 44px; padding: 12px 20px; color: var(--raven-grab-text); background: transparent; border: 0; border-bottom: 1px solid transparent; cursor: pointer; font: 400 13px/1 var(--raven-grab-mono); }
    .raven-grab-tab[aria-selected="true"] { color: var(--raven-grab-accent); border-bottom-color: rgba(0, 191, 255, .3); font-weight: 500; }
    .raven-grab-tab:hover { color: var(--raven-grab-accent); }
    .raven-grab-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #3c3c47 #212129; }
    .raven-grab-body::-webkit-scrollbar { width: 6px; }
    .raven-grab-body::-webkit-scrollbar-thumb { background: #3c3c47; border-radius: 999px; }
    .raven-grab-content { padding: 16px; }
    .raven-grab-section + .raven-grab-section { margin-top: 16px; }
    .raven-grab-section-title { margin: 0 0 8px; color: var(--raven-grab-tertiary); font: 500 12px/1.3 var(--raven-grab-mono); letter-spacing: .96px; text-transform: uppercase; }
    .raven-grab-section-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; margin: 0; padding: 0; color: var(--raven-grab-tertiary); background: transparent; border: 0; cursor: pointer; text-align: left; font: 500 12px/1.3 var(--raven-grab-mono); letter-spacing: .96px; text-transform: uppercase; }
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
    .raven-grab-element-placeholder { display: inline-block; padding: 3px 8px; color: var(--raven-grab-muted); background: rgba(255, 255, 255, .04); border: 1px solid rgba(255, 255, 255, .1); border-radius: 4px; font: 500 11px/1.4 var(--raven-grab-mono); }
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
    .raven-grab-state-group { margin-top: 12px; }
    .raven-grab-state-label { margin: 0 0 6px; color: var(--raven-grab-accent); font: 600 10px/1.3 var(--raven-grab-mono); letter-spacing: .8px; }
    .raven-grab-state-token-value { color: var(--raven-grab-text); font: 400 11px/1.3 var(--raven-grab-mono); overflow-wrap: anywhere; text-align: right; }
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
    .raven-grab-textarea { transition: opacity 240ms ease, transform 240ms ease; }
    .raven-grab-textarea[data-clearing] { opacity: 0; transform: translateY(-8px); }
    .raven-grab-use-case { min-height: 200px; }
    .raven-grab-new-token { display: none; grid-template-columns: 1fr 1fr; gap: 8px; }
    .raven-grab-new-token[data-open="true"] { display: grid; }
    .raven-grab-color-editor { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 8px; }
    .raven-grab-color-input { width: 28px; height: 28px; min-width: 28px; padding: 0; overflow: hidden; background: var(--raven-grab-bg); border: 1px solid rgba(255, 255, 255, .12); border-radius: 10px; cursor: pointer; }
    .raven-grab-color-input::-webkit-color-swatch-wrapper { padding: 0; }
    .raven-grab-color-input::-webkit-color-swatch { border: 0; border-radius: 9px; }
    .raven-grab-color-input::-moz-color-swatch { border: 0; border-radius: 9px; }
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
    .raven-grab-style-editor { display: flex; align-items: center; gap: 6px; width: 100%; }
    .raven-grab-style-editor .raven-grab-style-input { flex: 1 1 auto; }
    .raven-grab-color-input { flex: 0 0 28px; width: 28px; height: 28px; padding: 0; background: none; border: 1px solid var(--raven-grab-accent); border-radius: 8px; cursor: pointer; }
    .raven-grab-style-select, .raven-grab-style-format, .raven-grab-style-unit {
      min-height: 32px; padding: 6px 8px; color: var(--raven-grab-text); background: var(--raven-grab-bg);
      border: 1px solid var(--raven-grab-accent); border-radius: 8px; outline: none; cursor: pointer;
      font: 400 11px/1.4 var(--raven-grab-mono);
    }
    .raven-grab-style-select { flex: 1 1 auto; width: 100%; }
    .raven-grab-style-format, .raven-grab-style-unit { flex: 0 0 auto; }
    .raven-grab-style-select:focus, .raven-grab-style-format:focus, .raven-grab-style-unit:focus { box-shadow: 0 0 0 3px rgba(0, 191, 255, .15); }
    .raven-grab-empty { margin: 0; padding: 12px; color: var(--raven-grab-muted); background: var(--raven-grab-raised); border: 1px dashed rgba(255, 255, 255, .1); border-radius: 12px; font: 400 12px/1.45 var(--raven-grab-ui); }
    .raven-grab-actions { flex: 0 0 auto; padding: 12px 16px 16px; background: #212129; border-top: 1px solid rgba(255, 255, 255, .06); }
    .raven-grab-send {
      position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 44px; min-height: 0; margin: 0 auto; padding: 12px 28px;
      overflow: hidden; border: 0 solid transparent; border-radius: 9999px; color: #0a1018;
      background: var(--raven-grab-accent); cursor: pointer;
      font: 600 14px/1 var(--raven-grab-ui);
      box-shadow: 0 4px 20px rgba(0, 191, 255, .4);
      transition: width 250ms ease-in, height 250ms ease-in, background 250ms ease-in, border-radius 250ms ease-in, border-color 250ms ease-in, box-shadow 250ms ease-in, color 250ms ease-in, padding 250ms ease-in, transform 150ms cubic-bezier(.16, 1, .3, 1);
    }
    .raven-grab-send[data-send-state="default"]:hover { background: var(--raven-grab-accent-hover); transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(0, 191, 255, .8), 0 8px 32px rgba(0, 191, 255, .45), 0 0 60px rgba(0, 191, 255, .2); }
    .raven-grab-send[data-send-state="collapse"], .raven-grab-send[data-send-state="dot"] {
      width: 12px; height: 12px; padding: 0; color: transparent; background: #00BFFF;
      border: 0; border-radius: 50%; box-shadow: none;
    }
    .raven-grab-send[data-send-state="collapse"] .raven-grab-send-label {
      opacity: 0; clip-path: inset(0 50%); transition: opacity 180ms ease-in, clip-path 250ms ease-in;
    }
    .raven-grab-send[data-send-state="trace"] {
      width: 44px; height: 44px; padding: 0; color: #00BFFF; background: transparent;
      border: 0; border-radius: 9999px; box-shadow: none;
    }
    .raven-grab-send[data-send-state="sent"] {
      width: var(--raven-grab-sent-width, max-content); height: 44px; padding: 0; color: #00BFFF;
      background: rgba(22, 44, 66, .9); border: 1px solid transparent; border-radius: 9999px;
      box-shadow: none; backdrop-filter: blur(6px);
      transition-duration: 500ms; transition-timing-function: cubic-bezier(.16, 1, .3, 1);
      animation: raven-grab-static-border 500ms ease forwards;
    }
    .raven-grab-check {
      display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: 0 0 44px;
      color: #00BFFF;
    }
    .raven-grab-check svg { width: 20px; height: 20px; }
    .raven-grab-check path { stroke-dasharray: 24; stroke-dashoffset: 24; }
    .raven-grab-send[data-send-state="trace"] .raven-grab-check path { animation: raven-grab-draw 450ms ease-out forwards; }
    @keyframes raven-grab-draw { to { stroke-dashoffset: 0; } }
    .raven-grab-pen-dot { position: absolute; width: 12px; height: 12px; background: #00BFFF; border-radius: 50%; animation: raven-grab-pen-away 180ms ease-out forwards; }
    @keyframes raven-grab-pen-away { to { width: 0; height: 0; opacity: 0; } }
    .raven-grab-sent-content { display: inline-flex; align-items: center; gap: 2px; padding: 0 20px 0 8px; white-space: nowrap; }
    .raven-grab-send[data-send-state="sent"] .raven-grab-check svg { width: 16px; height: 16px; }
    .raven-grab-send[data-send-state="sent"] .raven-grab-check path { animation: none; stroke-dashoffset: 0; }
    .raven-grab-sent-message { color: #00BFFF; font: 600 14px/1 var(--raven-grab-ui); clip-path: inset(0 100% 0 0); animation: raven-grab-print 500ms linear forwards; }
    /* The SVG stroke exists only to draw the border in; it must yield to the
       real CSS border as raven-grab-static-border lands, or the two strokes
       stack as a permanent double outline. */
    .raven-grab-border-trace { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; animation: raven-grab-trace-fade 500ms ease forwards; }
    .raven-grab-border-trace rect { fill: none; stroke: #00BFFF; stroke-width: 1; stroke-dasharray: 1; stroke-dashoffset: 1; animation: raven-grab-trace-border 500ms ease-out forwards; }
    @keyframes raven-grab-print { to { clip-path: inset(0 0 0 0); } }
    @keyframes raven-grab-trace-border { to { stroke-dashoffset: 0; } }
    @keyframes raven-grab-trace-fade { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes raven-grab-static-border { 0%, 85% { border-color: transparent; } 100% { border-color: #00BFFF; } }
    .raven-grab-send:focus-visible, .raven-grab-icon-button:focus-visible { outline: 3px solid rgba(0, 191, 255, .35); outline-offset: 2px; }
    .raven-grab-send:disabled { cursor: not-allowed; opacity: .5; transform: none; box-shadow: none; }
    .raven-grab-send:not([data-send-state="default"]):disabled { opacity: 1; }
    .raven-grab-status { min-height: 18px; margin: 8px 2px 0; color: var(--raven-grab-tertiary); font: 400 11px/1.4 var(--raven-grab-ui); text-align: center; }
    .raven-grab-status a { color: #00BFFF; text-decoration: underline; }
    .raven-grab-status[data-kind="error"] { color: var(--raven-grab-error); }
    .raven-grab-status[data-kind="success"] { color: #00E676; }
    .raven-grab-status[data-kind="sr-only"] { position: absolute; width: 1px; height: 1px; min-height: 0; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .raven-grab-edge-tab {
      position: fixed; right: 0; top: 33px; display: none; align-items: center; justify-content: center;
      width: 44px; min-height: 44px; padding: 0; pointer-events: auto; cursor: pointer;
      color: var(--raven-grab-accent); background: rgba(22, 44, 66, .9); border: 1px solid var(--raven-grab-accent); border-right: 0; border-radius: 12px 0 0 12px;
      backdrop-filter: blur(12px); font: 500 24px/1 var(--raven-grab-ui); box-shadow: 0 8px 24px rgba(0, 0, 0, .3);
    }
    .raven-grab-edge-tab[aria-hidden="false"] { display: flex; }
    .raven-grab-edge-tab:hover { background: rgba(22, 44, 66, 1); }
    .raven-grab-edge-tab:focus-visible { outline: 3px solid rgba(0, 191, 255, .35); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; }
      .raven-grab-panel, .raven-grab-send, .raven-grab-textarea { transition: none !important; }
      .raven-grab-check path, .raven-grab-pen-dot, .raven-grab-sent-message, .raven-grab-border-trace rect { animation: none !important; }
      .raven-grab-border-trace { display: none !important; }
      .raven-grab-send[data-send-state="sent"] { animation: none !important; border-color: #00BFFF !important; }
      .raven-grab-check path { stroke-dashoffset: 0 !important; }
      .raven-grab-sent-message { clip-path: none !important; }
    }
  `;

  var highlight = document.createElement("div");
  highlight.className = "raven-grab-highlight";
  var label = document.createElement("div");
  label.className = "raven-grab-label";
  var panel = document.createElement("aside");
  panel.className = "raven-grab-panel";
  panel.setAttribute("aria-label", "Raven Design selection");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("data-collapsed", collapsed ? "true" : "false");
  if (collapsed) panel.setAttribute("inert", "");
  var edgeTab = document.createElement("button");
  edgeTab.className = "raven-grab-edge-tab";
  edgeTab.type = "button";
  edgeTab.textContent = "‹";
  edgeTab.setAttribute("aria-label", "Expand Raven panel");
  edgeTab.setAttribute("aria-hidden", collapsed ? "false" : "true");
  shadow.appendChild(style);
  shadow.appendChild(highlight);
  shadow.appendChild(label);
  shadow.appendChild(panel);
  shadow.appendChild(edgeTab);

  var armed = true;
  function expandPanel() {
    collapsed = false;
    panel.setAttribute("data-collapsed", "false");
    panel.setAttribute("aria-hidden", "false");
    panel.removeAttribute("inert");
    edgeTab.setAttribute("aria-hidden", "true");
    if (selectedElement) setHighlight(selectedElement);
  }
  // On mobile the expanded panel covers ~90% of the wireframe, so arming and
  // selecting open the panel COLLAPSED (edge-tab visible, wireframe unobscured);
  // the user taps the edge-tab to expand. Desktop keeps the immediate expand.
  function openPanel() {
    if (window.innerWidth <= 640) {
      collapsed = true;
      panel.setAttribute("data-collapsed", "true");
      panel.setAttribute("aria-hidden", "true");
      panel.setAttribute("inert", "");
      edgeTab.setAttribute("aria-hidden", "false");
      if (selectedElement) setHighlight(selectedElement);
    } else {
      expandPanel();
    }
  }
  function collapsePanel() {
    if (!armed || panel.getAttribute("aria-hidden") === "true") return;
    collapsed = true;
    panel.setAttribute("data-collapsed", "true");
    panel.setAttribute("aria-hidden", "true");
    panel.setAttribute("inert", "");
    edgeTab.setAttribute("aria-hidden", "false");
    hoveredElement = null;
    highlight.style.display = "none";
    label.style.display = "none";
  }
  function setArmed(next) {
    armed = next;
    if (!armed) dismiss();
    else {
      openPanel();
      renderPanel();
    }
  }
  var edgeTabDragged = false;
  edgeTab.addEventListener("click", function (event) {
    event.stopPropagation();
    if (edgeTabDragged) {
      edgeTabDragged = false;
      return;
    }
    expandPanel();
  });
  edgeTab.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    var startY = event.clientY;
    var startTop = edgeTab.getBoundingClientRect().top;
    var moved = false;
    function onMove(e) {
      var delta = e.clientY - startY;
      if (!moved && Math.abs(delta) < 4) return;
      moved = true;
      edgeTabDragged = true;
      var top = Math.max(8, Math.min(startTop + delta, innerHeight - edgeTab.offsetHeight - 8));
      edgeTab.style.top = top + "px";
    }
    function onUp() {
      removeEventListener("pointermove", onMove, true);
      removeEventListener("pointerup", onUp, true);
    }
    addEventListener("pointermove", onMove, true);
    addEventListener("pointerup", onUp, true);
  });

  function clampPanelCoordinate(left, top, width, height) {
    return {
      left: Math.max(8, Math.min(left, innerWidth - width - 8)),
      top: Math.max(8, Math.min(top, innerHeight - height - 8))
    };
  }

  function placePanel(left, top, width, height) {
    var next = clampPanelCoordinate(left, top, width, height);
    panelPosition = { left: next.left, top: next.top, width: width, height: height };
    panel.style.right = "auto";
    panel.style.left = next.left + "px";
    panel.style.top = next.top + "px";
  }

  function clampPanelToViewport() {
    if (!panelPosition) return;
    var rect = collapsed ? null : panel.getBoundingClientRect();
    var width = rect && rect.width ? rect.width : panelPosition.width;
    var height = rect && rect.height ? rect.height : panelPosition.height;
    placePanel(panelPosition.left, panelPosition.top, width, height);
  }

  panel.addEventListener("pointerdown", function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    var header = target ? target.closest(".raven-grab-header") : null;
    if (!header || target.closest("button") || collapsed || (event.button !== undefined && event.button !== 0)) return;
    var rect = panel.getBoundingClientRect();
    panelDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
    panel.setPointerCapture(event.pointerId);
    panel.setAttribute("data-dragging", "true");
    if (event.preventDefault) event.preventDefault();
  });

  panel.addEventListener("pointermove", function (event) {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    placePanel(event.clientX - panelDrag.offsetX, event.clientY - panelDrag.offsetY, panelDrag.width, panelDrag.height);
  });

  function endPanelDrag(event) {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    if (panel.hasPointerCapture && panel.hasPointerCapture(event.pointerId)) panel.releasePointerCapture(event.pointerId);
    panelDrag = null;
    panel.removeAttribute("data-dragging");
  }

  panel.addEventListener("pointerup", endPanelDrag);
  panel.addEventListener("pointercancel", endPanelDrag);

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

  function winningDeclarationsFromMatches(matches) {
    var winners = Object.create(null);
    matches.forEach(function (match) {
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

  function winningDeclarations(element) {
    return winningDeclarationsFromMatches(matchingRules(element));
  }

  function statesForSelector(selector) {
    var positiveSelector = selector.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
    return INTERACTIVE_STATES.filter(function (state) {
      return new RegExp(":" + state + "(?:\\b|-)", "i").test(positiveSelector);
    });
  }

  function baseSelectorForState(selector) {
    return selector.replace(/:(?!:)[a-zA-Z-]+(?:\((?:[^()]|\([^()]*\))*\))?/g, "").trim() || "*";
  }

  function matchingStateRules(element) {
    var matches = { hover: [], focus: [], active: [], disabled: [] };
    var sourceOrder = 0;
    function walk(ruleList) {
      if (!ruleList) return;
      for (var i = 0; i < ruleList.length; i += 1) {
        var rule = ruleList[i];
        if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
        if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
        if (rule.selectorText && rule.style) {
          splitSelectorList(rule.selectorText).forEach(function (selector) {
            var states = statesForSelector(selector);
            if (!states.length) return;
            var baseSelector = baseSelectorForState(selector);
            try {
              if (!element.matches(baseSelector)) return;
            } catch (error) {
              return;
            }
            var specificity = specificityForSelector(selector);
            states.forEach(function (state) {
              matches[state].push({ style: rule.style, specificity: specificity, sourceOrder: sourceOrder, inline: false });
            });
          });
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
    return matches;
  }

  function tokenByCssVar(cssVar) {
    for (var i = 0; i < bridgeTokens.length; i += 1) {
      if (bridgeTokens[i].cssVar === cssVar) return bridgeTokens[i];
    }
    return null;
  }

  function tokenMapForDeclarations(element, declarations) {
    var computed = getComputedStyle(element);
    var rootComputed = getComputedStyle(document.documentElement);
    var found = Object.create(null);
    declarations.forEach(function (declaration) {
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

  function tokenMapFor(element) {
    return tokenMapForDeclarations(element, winningDeclarations(element));
  }

  function interactiveStylesFor(element) {
    var stateMatches = matchingStateRules(element);
    var output = {};
    INTERACTIVE_STATES.forEach(function (state) {
      var winners = winningDeclarationsFromMatches(stateMatches[state]);
      if (!winners.length && !(state === "disabled" && (element.disabled === true || (element.getAttribute && element.getAttribute("disabled") !== null)))) return;
      output[state] = {
        declarations: winners.map(function (declaration) {
          return { property: declaration.property, value: declaration.value, important: declaration.important };
        }),
        tokens: tokenMapForDeclarations(element, winners)
      };
      if (state === "disabled" && (element.disabled === true || (element.getAttribute && element.getAttribute("disabled") !== null))) output[state].active = true;
    });
    return output;
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
      tokens: tokenMapFor(element),
      stateStyles: interactiveStylesFor(element)
    };
  }

  function setHighlight(element) {
    if (!element || element === host || typeof element.getBoundingClientRect !== "function" || !document.documentElement.contains(element)) {
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

  function displayComputedStyleValue(value) {
    return String(value || "").replace(/(-?\d*\.?\d+)px\b/g, function (match, number) {
      return String(Math.round(Number(number) * 10) / 10) + "px";
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

  function isColorProperty(property) {
    return ["color", "background", "background-color", "border-color", "outline-color", "fill", "stroke"].indexOf(property) !== -1;
  }

  // Parse a hex or rgb()/rgba() color to {r,g,b,a} (a in 0..1), or null if it
  // isn't one of those forms. Computed color values are always rgb/rgba, so this
  // covers every real case; named/hsl values (which getComputedStyle never
  // returns for these properties) fall through to null and are left untouched.
  function parseColorParts(value) {
    var t = String(value || "").trim();
    var hex = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      var d = hex[1];
      if (d.length === 3) d = d.charAt(0) + d.charAt(0) + d.charAt(1) + d.charAt(1) + d.charAt(2) + d.charAt(2);
      return {
        r: parseInt(d.slice(0, 2), 16),
        g: parseInt(d.slice(2, 4), 16),
        b: parseInt(d.slice(4, 6), 16),
        a: d.length === 8 ? Math.round(parseInt(d.slice(6, 8), 16) / 255 * 1000) / 1000 : 1
      };
    }
    var rgb = t.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i);
    if (!rgb) return null;
    return {
      r: Math.max(0, Math.min(255, Math.round(Number(rgb[1])))),
      g: Math.max(0, Math.min(255, Math.round(Number(rgb[2])))),
      b: Math.max(0, Math.min(255, Math.round(Number(rgb[3])))),
      a: rgb[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgb[4])))
    };
  }

  function channelHex(n) {
    var d = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return d.length === 1 ? "0" + d : d;
  }

  function colorToHex(parts) {
    var base = "#" + channelHex(parts.r) + channelHex(parts.g) + channelHex(parts.b);
    return parts.a < 1 ? base + channelHex(parts.a * 255) : base;
  }

  function colorToRgb(parts) {
    if (parts.a < 1) return "rgba(" + parts.r + ", " + parts.g + ", " + parts.b + ", " + parts.a + ")";
    return "rgb(" + parts.r + ", " + parts.g + ", " + parts.b + ")";
  }

  // The native <input type="color"> can only hold an opaque #rrggbb; alpha is
  // preserved separately in the text field, not here.
  function colorInputValue(value) {
    var parts = parseColorParts(value);
    if (!parts) return "#000000";
    return "#" + channelHex(parts.r) + channelHex(parts.g) + channelHex(parts.b);
  }

  function replaceStyleInput(input, value) {
    var editor = input.parentElement && input.parentElement.className === "raven-grab-style-editor" ? input.parentElement : input;
    var row = editor.parentElement;
    var property = row.getAttribute("data-style-property");
    var cell = document.createElement("code");
    cell.setAttribute("data-style-value", "");
    cell.setAttribute("data-style-raw", value);
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", "Edit " + property);
    cell.textContent = displayComputedStyleValue(value);
    row.setAttribute("data-edited", styleEdits[property] ? "true" : "false");
    row.replaceChild(cell, editor);
  }

  function cancelStyleEdit(input, previousValue) {
    if (input && input.parentNode) replaceStyleInput(input, previousValue);
  }

  // Figma-inspector-style typed editing: numbers get a number field (unit fixed),
  // colors get a HEX/RGB format dropdown, keyword properties get a value dropdown,
  // and only genuinely compound shorthands fall back to free text.
  var STYLE_ENUM_OPTIONS = {
    "display": ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "flow-root", "none", "contents"],
    "position": ["static", "relative", "absolute", "fixed", "sticky"],
    "box-sizing": ["content-box", "border-box"],
    "border-style": ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"],
    "text-align": ["left", "right", "center", "justify", "start", "end"],
    "font-weight": ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold", "lighter", "bolder"],
    "align-items": ["normal", "stretch", "center", "start", "end", "flex-start", "flex-end", "baseline"],
    "justify-content": ["normal", "flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "start", "end"]
  };

  // Common CSS length/angle units offered in the number editor's unit dropdown.
  // The value's ACTUAL unit is always preserved and prepended if it isn't here
  // (px is the default assumption, but a "cm"/"pt"/whatever value keeps its own).
  var STYLE_UNIT_OPTIONS = ["px", "pt", "rem", "em", "%", "vw", "vh", "ch", "cm", "mm", "in"];

  // Single-value number+unit only (e.g. "16px", "1.4", "0.9", "0px"). Compound
  // values like "8px 16px" return null so they don't masquerade as a number field.
  function parseNumericValue(value) {
    var match = String(value || "").trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
    if (!match) return null;
    return { number: match[1], unit: match[2] || "" };
  }

  // A single hex or rgb()/rgba() color — NOT a compound shorthand like the
  // computed `background` ("rgba(...) none repeat ..."). Restricted to the forms
  // parseColorParts understands so the swatch/format controls never fall back to
  // black on a value they can't round-trip (named/hsl never reach here from
  // getComputedStyle; if one ever does, it stays a plain text edit).
  function isSingleColorValue(value) {
    return parseColorParts(value) !== null;
  }

  function classifyStyleControl(property, value) {
    if (isColorProperty(property) && isSingleColorValue(value)) return "color";
    if (STYLE_ENUM_OPTIONS[property] && STYLE_ENUM_OPTIONS[property].indexOf(String(value).trim()) !== -1) return "enum";
    if (parseNumericValue(value)) return "number";
    // A keyword value on an enum property (e.g. width:auto has no enum map, but
    // display:contents does) still gets its dropdown; otherwise free text.
    if (STYLE_ENUM_OPTIONS[property]) return "enum";
    return "text";
  }

  // Reformat a color between hex and rgb WITHOUT losing alpha (a passive
  // format-flip must never turn rgba(0,0,0,0) into opaque black). Unparseable
  // values pass through unchanged.
  function formatColorValue(value, format) {
    var parts = parseColorParts(value);
    if (!parts) return String(value).trim();
    return format === "rgb" ? colorToRgb(parts) : colorToHex(parts);
  }

  function beginStyleEdit(valueCell) {
    var row = valueCell.parentElement;
    var property = row.getAttribute("data-style-property");
    // Edit the ORIGINAL unrounded computed value, not the display-rounded text —
    // otherwise editing one component of a compound value (box-shadow, transition)
    // silently rewrites the untouched components at reduced precision.
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var control = classifyStyleControl(property, previousValue);
    var finished = false;

    var editor = document.createElement("div");
    editor.className = "raven-grab-style-editor";
    editor.setAttribute("data-control", control);

    // The primary control (text/number input or select) that replaceStyleInput
    // reads from; its parentElement is always the editor wrapper.
    var input = document.createElement("input");
    input.className = "raven-grab-style-input";
    input.setAttribute("data-style-input", property);
    input.setAttribute("spellcheck", "false");

    var focusTarget = input;
    var relatedInternal = [];

    if (control === "enum") {
      var select = document.createElement("select");
      select.className = "raven-grab-style-select";
      select.setAttribute("data-style-input", property);
      var options = STYLE_ENUM_OPTIONS[property].slice();
      if (options.indexOf(previousValue) === -1) options.unshift(previousValue);
      select.innerHTML = options.map(function (opt) { return optionMarkup(opt, opt, previousValue); }).join("");
      input = select;
      focusTarget = select;
      editor.appendChild(select);
    } else if (control === "number") {
      var parsed = parseNumericValue(previousValue);
      input.type = "number";
      input.value = parsed.number;
      input.setAttribute("step", "any");
      editor.appendChild(input);
      // The unit is itself a choice — px/pt/rem/cm/… — so it's a dropdown, not a
      // fixed tag. The value's own unit is always kept (prepended if unusual).
      if (parsed.unit) {
        var unitSelect = document.createElement("select");
        unitSelect.className = "raven-grab-style-unit";
        unitSelect.setAttribute("aria-label", property + " unit");
        var units = STYLE_UNIT_OPTIONS.slice();
        if (units.indexOf(parsed.unit) === -1) units.unshift(parsed.unit);
        unitSelect.innerHTML = units.map(function (u) { return optionMarkup(u, u, parsed.unit); }).join("");
        editor.appendChild(unitSelect);
        input.unitSelect = unitSelect; // ponytail: readValue reads the live unit
        relatedInternal.push(input, unitSelect);
        unitSelect.addEventListener("blur", handleBlur);
        unitSelect.addEventListener("change", commit);
      } else {
        input.unitSelect = null;
      }
    } else if (control === "color") {
      input.type = "text";
      input.value = previousValue;
      var colorInput = document.createElement("input");
      colorInput.className = "raven-grab-color-input";
      colorInput.type = "color";
      colorInput.value = colorInputValue(previousValue);
      colorInput.setAttribute("aria-label", "Choose " + property + " color");
      var formatSelect = document.createElement("select");
      formatSelect.className = "raven-grab-style-format";
      formatSelect.setAttribute("aria-label", property + " color format");
      var initialFormat = /^rgb/i.test(previousValue) ? "rgb" : "hex";
      formatSelect.innerHTML = optionMarkup("hex", "HEX", initialFormat) + optionMarkup("rgb", "RGB", initialFormat);
      editor.appendChild(colorInput);
      editor.appendChild(input);
      editor.appendChild(formatSelect);
      // All three participate in one editor; a blur to any of them must NOT commit.
      relatedInternal.push(input, colorInput, formatSelect);
      var reformat = function () { input.value = formatColorValue(input.value, formatSelect.value); };
      formatSelect.addEventListener("change", reformat);
      var syncColor = function () { input.value = formatColorValue(colorInput.value, formatSelect.value); commit(); };
      colorInput.addEventListener("input", syncColor);
      colorInput.addEventListener("change", syncColor);
      colorInput.addEventListener("blur", handleBlur);
      formatSelect.addEventListener("blur", handleBlur);
    } else {
      input.type = "text";
      input.value = previousValue;
      editor.appendChild(input);
    }

    valueCell.parentNode.replaceChild(editor, valueCell);
    focusTarget.focus();
    if (typeof focusTarget.select === "function") focusTarget.select();

    function readValue() {
      if (control === "number") {
        var n = input.value.trim();
        if (n === "") return "";
        return n + (input.unitSelect ? input.unitSelect.value : "");
      }
      return input.value.trim();
    }

    function commit() {
      if (finished) return;
      finished = true;
      var newValue = readValue();
      var committed = commitStyleEdit(property, newValue, previousValue);
      if (!committed && newValue !== previousValue) {
        row.setAttribute("data-error", "true");
        setTimeout(function () {
          if (typeof row.removeAttribute === "function") row.removeAttribute("data-error");
        }, 600);
      }
      replaceStyleInput(input, committed ? newValue : previousValue);
      syncSendButtonDisabled();
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
    function handleBlur(event) {
      if (relatedInternal.indexOf(event.relatedTarget) !== -1) return;
      commit();
    }
    input.addEventListener("blur", handleBlur);
    if (control === "enum") input.addEventListener("change", commit);
  }

  function optionMarkup(value, label, selectedValue) {
    return '<option value="' + escapeHtml(value) + '"' + (value === selectedValue ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function isMaintainerCreateFlow() {
    return grabRole === "maintainer" && activeTab === "request";
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

  function stateTokenGroupsMarkup(stateStyles) {
    var markup = "";
    INTERACTIVE_STATES.forEach(function (state) {
      var stateData = stateStyles[state];
      if (!stateData || !stateData.declarations || !stateData.declarations.length) return;
      var tokens = (stateData.tokens || []).filter(function (token) { return token.bridgeToken; });
      if (!tokens.length) return;
      markup += '<div class="raven-grab-state-group" data-token-state="' + state + '"><h3 class="raven-grab-state-label">' + state.toUpperCase() + "</h3>";
      tokens.forEach(function (token) {
        markup += '<div class="raven-grab-token"><div class="raven-grab-token-line">' +
          '<span class="raven-grab-swatch" style="--swatch:' + escapeHtml(isColor(token.value) ? token.value : "transparent") + '"></span>' +
          '<span class="raven-grab-token-name">' + escapeHtml(token.property) + "</span>" +
          '<span class="raven-grab-state-token-value">' + escapeHtml(tokenPathFor(token)) + "</span>" +
          "</div></div>";
      });
      markup += "</div>";
    });
    return markup;
  }

  function stateStyleGroupsMarkup(stateStyles) {
    var markup = "";
    INTERACTIVE_STATES.forEach(function (state) {
      var stateData = stateStyles[state];
      if (!stateData || !stateData.declarations || !stateData.declarations.length) return;
      markup += '<div class="raven-grab-state-group" data-style-state="' + state + '"><h3 class="raven-grab-state-label">' + state.toUpperCase() + '</h3><ul class="raven-grab-styles">';
      stateData.declarations.forEach(function (declaration) {
        var value = displayComputedStyleValue(declaration.value) + (declaration.important ? " !important" : "");
        markup += '<li data-state-style-property="' + escapeHtml(declaration.property) + '"><span>' + escapeHtml(declaration.property) + "</span><code>" + escapeHtml(value) + "</code></li>";
      });
      markup += "</ul></div>";
    });
    return markup;
  }

  function renderPanel() {
    var hasSelection = !!currentSelection;
    var tokens = hasSelection ? currentSelection.tokens : [];
    var stateStyles = hasSelection && currentSelection.stateStyles ? currentSelection.stateStyles : {};
    var matchedTokens = tokens.map(function (token, index) {
      return { token: token, index: index };
    }).filter(function (entry) { return entry.token.bridgeToken; });
    var stateTokenMarkup = stateTokenGroupsMarkup(stateStyles);
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
                <label class="raven-grab-field"><span>Value</span>${isColorProperty(token.property) ? `<span class="raven-grab-color-editor"><input type="color" class="raven-grab-color-input" data-new-color="${index}" value="${colorInputValue(intent && intent.newTokenValue ? intent.newTokenValue : token.value)}" aria-label="Choose ${escapeHtml(token.property)} color"><input type="text" class="raven-grab-input" data-new-value="${index}" value="${escapeHtml(intent && intent.newTokenValue ? intent.newTokenValue : token.value)}" placeholder="#000000" spellcheck="false"></span>` : `<input type="text" class="raven-grab-input" data-new-value="${index}" value="${escapeHtml(intent && intent.newTokenValue ? intent.newTokenValue : token.value)}" placeholder="CSS value" spellcheck="false">`}</label>
              </div>
            </div>`;
        }).join("")
      : (hasSelection && !stateTokenMarkup ? '<p class="raven-grab-empty">No design tokens matched this element. Computed styles are still included.</p>' : "");
    tokenMarkup += stateTokenMarkup;
    var tokenizedProperties = matchedTokens.map(function (entry) { return entry.token.property; });
    var stylesMarkup = Object.keys(hasSelection ? currentSelection.styles : {}).filter(function (property) {
      return tokenizedProperties.indexOf(property) === -1;
    }).map(function (property) {
      var edit = styleEdits[property];
      var value = edit ? edit.newValue : currentSelection.styles[property];
      return '<li data-style-property="' + escapeHtml(property) + '" data-edited="' + (edit ? "true" : "false") + '"><span>' + escapeHtml(property) + '</span><code data-style-value data-style-raw="' + escapeHtml(value) + '" tabindex="0" role="button" aria-label="Edit ' + escapeHtml(property) + '">' + escapeHtml(displayComputedStyleValue(value)) + "</code></li>";
    }).join("");
    var stateStylesMarkup = stateStyleGroupsMarkup(stateStyles);

    var elementMarkup = hasSelection ? `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">ELEMENT</h2>
        <span class="raven-grab-element-wrap">
          <span class="raven-grab-element-chip" data-element-selector tabindex="0" role="button" aria-label="Copy element selector" title="${escapeHtml(currentSelection.selector)}">${escapeHtml(currentSelection.selector)}</span>
          <span class="raven-grab-element-tooltip" role="tooltip">${escapeHtml(currentSelection.selector)}</span>
        </span>
      </section>` : `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">ELEMENT</h2>
        <span class="raven-grab-element-placeholder">Click an element to inspect</span>
      </section>`;
    var designMarkup = `
      ${elementMarkup}
      <section class="raven-grab-section">
        <button class="raven-grab-section-toggle" type="button" data-section-toggle="tokens" aria-expanded="${expandedSections.tokens ? "true" : "false"}" aria-controls="raven-grab-tokens"><span>DESIGN TOKENS</span><span class="raven-grab-caret" aria-hidden="true">▾</span></button>
        <div class="raven-grab-collapsible" id="raven-grab-tokens" data-section-body="tokens" data-open="${expandedSections.tokens ? "true" : "false"}" aria-hidden="${expandedSections.tokens ? "false" : "true"}"><div class="raven-grab-collapsible-inner">${tokenMarkup}</div></div>
      </section>
      <section class="raven-grab-section">
        <button class="raven-grab-section-toggle" type="button" data-section-toggle="styles" aria-expanded="${expandedSections.styles ? "true" : "false"}" aria-controls="raven-grab-styles"><span>Computed styles</span><span class="raven-grab-caret" aria-hidden="true">▾</span></button>
        <div class="raven-grab-collapsible" id="raven-grab-styles" data-section-body="styles" data-open="${expandedSections.styles ? "true" : "false"}" aria-hidden="${expandedSections.styles ? "false" : "true"}"><div class="raven-grab-collapsible-inner"><ul class="raven-grab-styles">${stylesMarkup}</ul>${stateStylesMarkup}</div></div>
      </section>
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">INSTRUCTIONS</h2>
        <textarea class="raven-grab-textarea" data-instruction spellcheck="true" placeholder="Tell the agent what to change…">${escapeHtml(instructionDraft)}</textarea>
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
        <textarea class="raven-grab-textarea raven-grab-use-case" data-use-case spellcheck="true" placeholder="Tell the design team why you need this…">${escapeHtml(componentRequest.useCase)}</textarea>
      </section>`;
    var emailMarkup = `
      ${elementMarkup}
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">GET NOTIFIED (OPTIONAL)</h2>
        <input class="raven-grab-input" data-component-email type="email" value="${escapeHtml(componentRequest.email)}" placeholder="email (optional)" spellcheck="false">
      </section>`;
    var maintainerFormMarkup = elementMarkup +
      '<section class="raven-grab-section">' +
        '<h2 class="raven-grab-section-title">COMPONENT NOTES</h2>' +
        '<textarea class="raven-grab-textarea raven-grab-use-case" data-use-case spellcheck="true" placeholder="Describe the reusable component, variants, or behavior…">' + escapeHtml(componentRequest.useCase) + '</textarea>' +
      '</section>';
    var bodyMarkup = activeTab === "design"
      ? designMarkup
      : (grabRole === "maintainer" ? maintainerFormMarkup : (componentRequestStep === "email" ? emailMarkup : requestFormMarkup));
    var actionMarkup = activeTab === "design"
      ? '<button class="raven-grab-send" type="button" data-send data-send-state="default"' + (hasSelection ? "" : " disabled") + '><span class="raven-grab-send-label">Send to agent</span></button>'
      : (grabRole === "maintainer"
          ? '<button class="raven-grab-send" type="button" data-send data-send-state="default"' + (hasSelection ? "" : " disabled") + '><span class="raven-grab-send-label">Add to design system</span></button>'
          : (componentRequestStep === "email"
          ? '<button class="raven-grab-send" type="button" data-send-email data-send-state="default"' + (hasSelection ? "" : " disabled") + '><span class="raven-grab-send-label">Create request</span></button>'
          : '<button class="raven-grab-send" type="button" data-request-next data-send-state="default"' + (hasSelection ? "" : " disabled") + '><span class="raven-grab-send-label">Send component request to design</span></button>'));
    var requestTabLabel = grabRole === "maintainer" ? "Add component" : "Request Component";

    panel.innerHTML = `
      <div class="raven-grab-top">
        <div class="raven-grab-header">
          <div class="raven-grab-title"><strong>Raven design</strong></div>
          <button class="raven-grab-icon-button" type="button" data-collapse aria-label="Collapse Raven panel">&gt;</button>
        </div>
        <div class="raven-grab-tabs" role="tablist" aria-label="Raven design actions">
          <button class="raven-grab-tab" type="button" role="tab" data-tab="design" aria-selected="${activeTab === "design" ? "true" : "false"}">Design</button>
          <button class="raven-grab-tab" type="button" role="tab" data-tab="request" aria-selected="${activeTab === "request" ? "true" : "false"}">${requestTabLabel}</button>
        </div>
      </div>
      <div class="raven-grab-body"><div class="raven-grab-content">${bodyMarkup}</div></div>
      <div class="raven-grab-actions">${actionMarkup}<p class="raven-grab-status" data-status aria-live="polite"></p></div>`;
    panel.setAttribute("aria-hidden", "false");
    panel.setAttribute("data-collapsed", collapsed ? "true" : "false");
  }

  function syncSendButtonDisabled() {
    var button = panel.querySelector("[data-send]");
    if (button) button.disabled = !currentSelection;
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
    componentRequestId = "";
    collapsed = window.innerWidth <= 640;
    panel.setAttribute("data-collapsed", collapsed ? "true" : "false");
    panel.removeAttribute("inert");
    edgeTab.setAttribute("aria-hidden", "true");
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
      var customValue = valueInput.value.trim();
      if (customValue && window.CSS && typeof window.CSS.supports === "function" && !window.CSS.supports(token.property, customValue)) {
        newFields.setAttribute("data-error", "true");
        return;
      }
      newFields.removeAttribute("data-error");
      tokenIntents[index] = tokenIntentFor(
        token,
        null,
        nameInput.value.trim() || undefined,
        customValue || undefined
      );
      if (customValue) previewEl.style.setProperty(token.cssVar, customValue);
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
      stateStyles: currentSelection.stateStyles,
      tokenIntents: Object.keys(tokenIntents).map(function (key) { return tokenIntents[key]; }),
      styleEdits: styleEditsForSend(),
      instruction: instructionDraft
    };
    if (isMaintainerCreateFlow()) {
      var userNotes = componentRequest.useCase.trim();
      payload.intent = "create-component";
      payload.userNotes = userNotes;
      payload.instruction = "Build this as a reusable component in the design system and update DESIGN.md." + (userNotes ? " User notes: " + userNotes : "");
    } else if (componentRequest.issueType || componentRequest.issueSize || componentRequest.useCase || componentRequest.email) {
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

  function checkMarkup() {
    return '<span class="raven-grab-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>';
  }

  function sendButtonMarkup(state, message) {
    if (state === "collapse") return '<span class="raven-grab-send-label">' + escapeHtml(message) + "</span>";
    if (state === "dot") return "";
    if (state === "trace") return checkMarkup() + '<span class="raven-grab-pen-dot" aria-hidden="true"></span>';
    if (state === "sent") {
      return '<svg class="raven-grab-border-trace" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><rect x="0.5" y="0.5" width="99" height="43" rx="21.5" pathLength="1"></rect></svg>' +
        '<span class="raven-grab-sent-content">' + checkMarkup() + '<span class="raven-grab-sent-message">' + escapeHtml(message) + "</span></span>";
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
        if (sentWidth) {
          button.style.setProperty("--raven-grab-sent-width", sentWidth + "px");
          // Match the trace SVG to the real pill geometry — stretching the
          // static 100x44 viewBox distorts the corner radii into stray arcs.
          var trace = button.querySelector(".raven-grab-border-trace");
          if (trace) {
            trace.setAttribute("viewBox", "0 0 " + sentWidth + " 44");
            var traceRect = trace.querySelector("rect");
            if (traceRect) traceRect.setAttribute("width", String(sentWidth - 1));
          }
        }
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
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var finish = function () {
      if (panel.querySelector(selector) !== button) return;
      setSendButtonState(button, "default", defaultLabel);
      button.disabled = false;
      if (selector === "[data-send]") syncSendButtonDisabled();
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-label");
      if (button.style && typeof button.style.removeProperty === "function") button.style.removeProperty("--raven-grab-sent-width");
    };
    if (reducedMotion) {
      setSendButtonState(button, "sent", sentMessage);
      setTimeout(finish, SEND_TIMINGS.hold);
      return;
    }
    setSendButtonState(button, "collapse", defaultLabel);
    setTimeout(function () {
      if (panel.querySelector(selector) !== button) return;
      setSendButtonState(button, "dot", sentMessage);
    }, SEND_TIMINGS.collapse);
    setTimeout(function () {
      if (panel.querySelector(selector) !== button) return;
      setSendButtonState(button, "trace", sentMessage);
    }, SEND_TIMINGS.collapse + SEND_TIMINGS.dot);
    setTimeout(function () {
      if (panel.querySelector(selector) !== button) return;
      setSendButtonState(button, "sent", sentMessage);
    }, SEND_TIMINGS.collapse + SEND_TIMINGS.dot + SEND_TIMINGS.trace);
    setTimeout(finish, SEND_TIMINGS.collapse + SEND_TIMINGS.dot + SEND_TIMINGS.trace + SEND_TIMINGS.expand + SEND_TIMINGS.hold);
  }

  function clearInstructionText() {
    instructionDraft = "";
    var field = panel.querySelector("[data-instruction]");
    if (!field || !field.value) return;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      field.value = "";
      return;
    }
    field.setAttribute("data-clearing", "");
    setTimeout(function () {
      if (panel.querySelector("[data-instruction]") === field) field.value = "";
      field.removeAttribute("data-clearing");
    }, 250);
  }

  async function sendSelection() {
    var button = panel.querySelector("[data-send]");
    var status = panel.querySelector("[data-status]");
    capturePanelDrafts();
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Sending…";
    status.textContent = "";
    status.removeAttribute("data-kind");
    var defaultLabel = isMaintainerCreateFlow() ? "Add to design system" : "Send to agent";
    var sentLabel = isMaintainerCreateFlow() ? "Added to design system" : "Sent to agent";
    try {
      var payload = payloadForSend();
      var endpoint = grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab");
      if (!endpoint) {
        status.textContent = "Sent " + payload.selector + " · " + payload.tokenIntents.length + (payload.tokenIntents.length === 1 ? " token change" : " token changes") + " · " + payload.styleEdits.length + (payload.styleEdits.length === 1 ? " style edit" : " style edits");
        status.setAttribute("data-kind", "sr-only");
        clearInstructionText();
        morphSendButton(button, "[data-send]", sentLabel, defaultLabel);
        return;
      }
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Bridge returned " + response.status);
      reactMetadata = null;
      status.textContent = sentLabel;
      status.setAttribute("data-kind", "sr-only");
      clearInstructionText();
      morphSendButton(button, "[data-send]", sentLabel, defaultLabel);
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

  async function sendComponentRequest(requestOverride) {
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
    componentRequest.email = componentRequest.email.trim();
    if (componentRequest.email && !validEmail(componentRequest.email)) {
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
      // Destination adapter priority: a live agent session (bridge or configured
      // grab endpoint) beats the standalone request endpoint; the standalone
      // endpoint is the fallback when no agent is connected.
      var agentEndpoint = grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab");
      var standaloneEndpoint = agentEndpoint ? null : (grabConfig && grabConfig.componentRequestEndpoint);
      var endpoint = agentEndpoint || standaloneEndpoint;
      if (!endpoint) throw new Error("No component request destination is configured");
      if (!componentRequestId) componentRequestId = "cr-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      var body = standaloneEndpoint ? {
        requestId: componentRequestId,
        selector: currentSelection.selector,
        tokens: currentSelection.tokens,
        styles: currentSelection.styles,
        stateStyles: currentSelection.stateStyles,
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
      if (!standaloneEndpoint) {
        componentRequestId = "";
        setPanelStatus("Sent to agent", "sr-only");
        if (button) morphSendButton(button, "[data-send-email]", "Sent to agent", "Create request");
        return true;
      }
      var result = await response.json();
      componentRequestId = "";
      var status = panel.querySelector("[data-status]");
      // Only render server-supplied URLs that are plain https links; escapeHtml
      // does not neutralize a javascript: scheme inside href.
      var safeUrl = typeof result.url === "string" && /^https:\/\//i.test(result.url) ? result.url : "";
      var statusLink = function (label) {
        if (!status || !safeUrl) return;
        status.innerHTML = '<a href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener">' + escapeHtml(label) + "</a>";
        status.setAttribute("data-kind", "success");
      };
      if (result.mode === "issue" && safeUrl) {
        statusLink("View request");
        if (button) morphSendButton(button, "[data-send-email]", "Request created", "Create request");
      } else if (result.mode === "prefill" && safeUrl && typeof result.packet === "string") {
        // Clipboard can be denied; the prefilled-issue link still works without it.
        var prefillCopied = true;
        try { await writeClipboardText(result.packet); } catch (clipboardError) { prefillCopied = false; }
        statusLink("Open prefilled issue");
        if (button) morphSendButton(button, "[data-send-email]", prefillCopied ? "Packet copied" : "Request ready", "Create request");
      } else if (result.mode === "packet" && typeof result.packet === "string") {
        await writeClipboardText(result.packet);
        setPanelStatus("Request packet copied — paste it to your team or agent", "success");
        if (button) morphSendButton(button, "[data-send-email]", "Packet copied", "Create request");
      } else {
        throw new Error("Unexpected component request response");
      }
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
    if (event.target.closest("[data-collapse]")) collapsePanel();
    if (event.target.closest("[data-send]")) sendSelection();
    if (event.target.closest("[data-request-next]")) advanceComponentRequest();
    if (event.target.closest("[data-send-email]")) sendComponentRequest();
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
    syncSendButtonDisabled();
    if (event.target.getAttribute("data-issue-type") !== null) componentRequest.issueType = event.target.value;
    if (event.target.getAttribute("data-issue-size") !== null) componentRequest.issueSize = event.target.value;
  });
  panel.addEventListener("input", function (event) {
    var colorIndex = event.target.getAttribute("data-new-color");
    if (colorIndex !== null) {
      var colorValueInput = panel.querySelector('[data-new-value="' + colorIndex + '"]');
      if (colorValueInput) colorValueInput.value = event.target.value;
    }
    var index = event.target.getAttribute("data-new-name");
    if (index === null) index = event.target.getAttribute("data-new-value");
    if (index === null) index = colorIndex;
    if (index !== null) updateIntent(Number(index));
    if (event.target.getAttribute("data-instruction") !== null) {
      instructionDraft = event.target.value;
      syncSendButtonDisabled();
    }
    if (event.target.getAttribute("data-use-case") !== null) componentRequest.useCase = event.target.value;
    if (event.target.getAttribute("data-component-email") !== null) componentRequest.email = event.target.value;
  });
  panel.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var isInstruction = target.getAttribute("data-instruction") !== null;
    var isUseCase = target.getAttribute("data-use-case") !== null;
    var isEmail = target.getAttribute("data-component-email") !== null;
    if (!isInstruction && !isUseCase && !isEmail) return;
    if (event.metaKey || event.ctrlKey) {
      if (target.tagName === "TEXTAREA") {
        event.preventDefault();
        var start = target.selectionStart;
        var end = target.selectionEnd;
        target.value = target.value.slice(0, start) + "\n" + target.value.slice(end);
        target.selectionStart = target.selectionEnd = start + 1;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    event.preventDefault();
    var sendButton = panel.querySelector(isInstruction || (grabRole === "maintainer" && isUseCase) ? "[data-send]" : "[data-send-email], [data-request-next]");
    if (sendButton && !sendButton.disabled) sendButton.click();
  });

  function inIgnoredRegion(target) {
    if (!target || typeof target.closest !== "function") return false;
    // Injected dev tooling (Vercel toolbar etc.) must keep its own clicks.
    return !!target.closest("[data-raven-grab-ignore], vercel-live-feedback, [data-vercel-toolbar], vercel-toolbar, nextjs-portal");
  }

  document.addEventListener("mousemove", function (event) {
    if (!armed || collapsed) return;
    var path = event.composedPath ? event.composedPath() : [];
    if (path.indexOf(host) !== -1 || selectedElement) return;
    var target = event.target && event.target.nodeType === 1 ? event.target : event.target.parentElement;
    if (inIgnoredRegion(target)) return;
    if (target && target !== hoveredElement) {
      hoveredElement = target;
      setHighlight(target);
    }
  }, true);

  document.addEventListener("click", function (event) {
    if (!armed || collapsed) return;
    var path = event.composedPath ? event.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    var target = event.target && event.target.nodeType === 1 ? event.target : event.target.parentElement;
    if (!target || inIgnoredRegion(target)) return;
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
    componentRequestId = "";
    selectedElement = target;
    openPanel();
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
    clampPanelToViewport();
    if (selectedElement && !collapsed) setHighlight(selectedElement);
  });
  window.addEventListener("scroll", function () {
    if (selectedElement && !collapsed) setHighlight(selectedElement);
  }, true);

  // Always listen — react-grab may load after this script.
  var captureReactMetadata = function (event) {
    reactMetadata = normalizedReactMetadata(event.detail);
  };
  window.addEventListener("react-grab:element-selected", captureReactMetadata);
  document.addEventListener("react-grab:element-selected", captureReactMetadata);

  renderPanel();

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
