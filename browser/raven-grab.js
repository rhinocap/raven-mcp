(function () {
  "use strict";

  if (window.__RAVEN_GRAB__) return;
  window.__RAVEN_GRAB__ = true;

  function resolveGrabScript() {
    if (document.currentScript && document.currentScript.src) return document.currentScript;
    var config = window.RavenGrabConfig || window.ravenGrabConfig || null;
    if (config && config.bridgeOrigin) {
      var origin = String(config.bridgeOrigin).replace(/\/$/, "");
      return { src: origin + "/raven-grab.js" + (config.key ? "?key=" + encodeURIComponent(String(config.key)) : "") };
    }
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i -= 1) {
      var candidate = scripts[i];
      var src = candidate && candidate.src ? String(candidate.src) : "";
      if (src.indexOf("raven-grab.js") !== -1) return candidate;
    }
    return null;
  }

  var script = resolveGrabScript();
  if (!script || !script.src) {
    console.error("[Raven Grab] Cannot find the script URL. Include raven-grab.js with a src attribute, or set window.RavenGrabConfig.bridgeOrigin.");
    return;
  }

  var bridgeOrigin;
  var bridgeKey;
  try {
    var scriptUrl = new URL(script.src, document.baseURI);
    bridgeOrigin = scriptUrl.origin;
    bridgeKey = scriptUrl.searchParams.get("key") || "";
    var grabBootConfig = window.RavenGrabConfig || window.ravenGrabConfig || null;
    if (!bridgeKey && grabBootConfig && grabBootConfig.key) bridgeKey = String(grabBootConfig.key);
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
  var ravenVersion = suppliedGrabConfig && suppliedGrabConfig.ravenVersion ? String(suppliedGrabConfig.ravenVersion) : "";
  // Config wins, then the page's own title, then the host. All three resolve locally --
  // the grab bridge runs on the user's machine, so none of this needs the network.
  // Trimmed to a bar-sized label; a 60-character <title> would push the footer around.
  var projectName = (function () {
    var supplied = suppliedGrabConfig && suppliedGrabConfig.projectName ? String(suppliedGrabConfig.projectName) : "";
    var name = supplied || (document.title ? String(document.title) : "") || (location.hostname ? String(location.hostname) : "");
    name = name.replace(/\s+/g, " ").trim();
    // Array.from splits on code points, so a title truncated mid-emoji keeps the
    // whole glyph instead of leaving half a surrogate pair in the footer.
    var chars = Array.from(name);
    return chars.length > 28 ? chars.slice(0, 27).join("").replace(/\s+$/, "") + "…" : name;
  })();
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
  // Keyword / discrete props get dropdowns or structured editors. Numbers and
  // colors keep typed controls. Compound `background` is hidden — use
  // background-color; exotic values go through the agent Instructions box.
  // Sentinel shown when multi-selected layers disagree on a property. Choosing a
  // new value writes through to every selected layer (see styleApplicationTargets).
  var MIXED_STYLE_VALUE = "Mixed";

  // Category order = panel order. Props within each category are display order.
  // overflow-x/y are not listed — they are axes on the Overflow structured editor.
  // Stroke longhands (border-*/outline-*) stay out of the list; the Stroke row
  // owns them. __raven-stroke__ is a panel-only row id, not a CSS property.
  var STYLE_CATEGORIES = [
    {
      id: "layout",
      label: "Layout",
      properties: [
        "display", "position", "flex-direction", "flex-wrap", "align-items", "justify-content",
        "align-content", "justify-items", "gap", "grid-template-columns", "box-sizing", "overflow", "object-fit"
      ]
    },
    { id: "size", label: "Size", properties: ["width", "height"] },
    { id: "spacing", label: "Spacing", properties: ["margin", "padding"] },
    {
      id: "typography",
      label: "Typography",
      properties: [
        "font-family", "font-weight", "font-style", "font-size", "line-height", "letter-spacing",
        "text-align", "text-decoration", "text-transform", "text-overflow", "white-space", "word-break", "color"
      ]
    },
    { id: "fill", label: "Fill", properties: ["background-color", "fill", "opacity"] },
    { id: "stroke", label: "Stroke", properties: ["__raven-stroke__", "border-radius", "stroke"] },
    { id: "effects", label: "Effects", properties: ["box-shadow"] },
    { id: "interaction", label: "Interaction", properties: ["visibility", "pointer-events", "cursor"] }
  ];

  var STYLE_PROPERTIES = [];
  STYLE_CATEGORIES.forEach(function (category) {
    category.properties.forEach(function (property) {
      if (property.indexOf("__raven-") === 0) return;
      if (STYLE_PROPERTIES.indexOf(property) === -1) STYLE_PROPERTIES.push(property);
    });
  });
  var INTERACTIVE_STATES = ["hover", "focus", "active", "disabled"];

  var bridgeTokens = [];
  var bridgeTokensReady = false;
  var selectedElement = null;
  var multiSelections = [];
  var selectionAnchor = null;
  var selectionOrigin = "";
  var multiBadges = [];
  var multiHighlights = [];
  // Once-per-renderPanel membership for layer-row data-selected. Null outside a
  // render so direct layerRowsMarkup / selectionHasElement callers re-derive via
  // visualBadgeElements(). Never store a sticky empty array across selection
  // changes — that falsely looks "cached" under a truthiness check.
  var selectionMembershipForRender = null;
  var hoveredElement = null;
  var currentSelection = null;
  var reactMetadata = null;
  var tokenIntents = Object.create(null);
  var styleEdits = Object.create(null);
  var stateStyleEdits = Object.create(null);
  // Inline copy edit for the active draft's element: { target, selector, oldText, newText } or null.
  // Singular per element (an element has one text body), so it mirrors the stateStyleEdits sibling
  // rather than the keyed styleEdits map. textEditingElement is the transient live-edit target.
  var textEdit = null;
  var textEditingElement = null;
  var activeStateStylePreview = null;
  var styleDrafts = Object.create(null);
  var activeStyleDraftKey = null;
  var styleDraftClientSequence = 0;
  var editScope = "instance";
  var styleEditOriginalInline = Object.create(null);
  var styleEditTarget = null;
  var styleEditScopeSiblingsOriginal = Object.create(null); // property -> [{element, value, priority}]
  var styleEditScopeSiblingsTarget = null;
  var activeStyleEditorFlush = null;
  var activeStyleScrub = null;
  var previewOriginals = Object.create(null);
  var activeTabA = "design";
  var activeTabB = "layers";
  var activeGlobalActionSurface = "design";
  var expandedSections = { styles: true };
  // Pending-changes tray sections start expanded; the user can collapse each to
  // reclaim vertical space (critical on the mobile sheet). Keyed by section role.
  var changeTrayCollapsed = Object.create(null);
  var instructionDraft = "";
  var componentRequestStep = "form";
  var componentRequest = { issueType: "", issueSize: "", useCase: "", email: "" };
  var componentRequestId = "";
  var componentRequestInFlight = false;
  var componentName = "";
  var templateId = "default";
  var templateSlots = [];
  var templateDrafts = [];
  var templateName = "";
  var templateFilter = "";
  var templateExpandedId = "";
  var templateLoaded = false;
  var templateLoading = false;
  var templateLoadPending = false;
  var layerRuntimeId = 0;
  var layerElements = new Map();
  var layerTree = null;
  var appliedLayerTree = null;
  var layerOrderDrafts = Object.create(null);
  var activeLayerOrderDraftKey = null;
  var pendingLayerOrders = {};
  var appliedLayerReceipts = [];
  var layerOrderClientSequence = 0;
  var layerOperationPollTimer = null;
  var layerOperationPollStopped = false;
  var batchPollTimer = null;
  var batchPollInFlight = false;
  var pendingBatchId = null;
  var pollingBatchIds = [];
  var pendingSendCount = 0;
  var commitInFlight = false;
  var styleChanges = {};
  var changeSequence = 0;
  var batchCommitted = false;
  var dispatchState = "idle";
  var activeDispatch = null;
  var dispatchDoneTimer = null;
  // Un-sent changes carried over from a prior page load (see the persistence
  // block near freezePendingDispatch); populated at boot once PENDING_STORE_KEY exists.
  var carriedPending = [];
  // Set when Send is pressed while a dispatch is in flight; the next batch
  // auto-fires when the active one finishes (single-slot conveyor, never concurrent).
  var sendQueued = false;
  var layerDrag = null; // pointer-drag state: source block, floating clone, sibling bounds
  var collapsedLayerElements = new WeakSet();
  var hoveredLayerElement = null;
  var hoveredLayerRow = null; // the row currently carrying data-layer-hovered
  // Long enough that scanning the list paints nothing, short enough that stopping on a
  // row feels immediate. Measured against a 25fps capture: transit crossings land
  // 40-80ms apart, a deliberate stop is well over 200ms.
  var LAYER_PREVIEW_SETTLE_MS = 110;
  var layerDragExpandTimer = null;
  var layerDragExpandElement = null;
  var layerDragAutoScrollTimer = null;
  var layerDragAutoScrollY = null;
  var layerDragAutoScrollDirection = 0;
  var layerDragRenderBypass = false; // expandLayerDuringDrag re-renders deliberately mid-drag
  var layerNotice = "";
  var layerPreview = null;
  var pendingFixedMove = "";
  var fixedMoveNote = "";
  var requestHintDismissed = false;
  try {
    requestHintDismissed = window.localStorage.getItem("raven-grab-request-hint-dismissed") === "true";
  } catch (storageError) {
    requestHintDismissed = false;
  }
  // Two preferences that change what the overlay IS on arrival, so they are read
  // before any state derives from them.
  //   mode    simple = prod's tool: grab an element, type an instruction, send. No
  //           tokens/styles body, no second panel. full = the two-panel build.
  //   startup open|collapsed. Collapsed hands the page back on load: grab is only
  //           armed once a panel is opened, so the host app stays freely clickable.
  var overlayMode = "full";
  var startupState = "open";
  function readStoredPreference(key, allowed, fallback) {
    try {
      var stored = window.localStorage.getItem(key);
      return allowed.indexOf(stored) !== -1 ? stored : fallback;
    } catch (storageError) {
      return fallback;
    }
  }
  overlayMode = readStoredPreference("raven-grab-mode", ["simple", "full"], "full");
  startupState = readStoredPreference("raven-grab-startup", ["open", "collapsed"], "open");
  var mobileSheetDock = readStoredPreference("raven-grab-sheet-dock", ["bottom", "top"], "bottom");
  function simpleMode() { return overlayMode === "simple"; }
  // Simple mode is the right panel alone, so the left side is collapsed from the
  // start regardless of the startup preference.
  var coldCollapsed = startupState === "collapsed";
  var collapsedSides = { left: coldCollapsed || simpleMode(), right: coldCollapsed };
  // Cold open: BOTH panels start expanded (Andrew, 2026-07-19), reversing the
  // 2026-07-18 call that they start collapsed and an edge tab is the deliberate
  // act that engages grab. Consequence of the reversal, kept here deliberately:
  // grab is now armed the moment the script loads, so the host page is NOT freely
  // clickable on arrival -- clicking selects. Collapsing both still fully pauses
  // grab and hands the page back.
  // Both panels collapsed = grab fully paused: the page is clickable and
  // navigable as if the overlay weren't there.
  function bothCollapsed() { return collapsedSides.left && collapsedSides.right; }
  // Never-opened is not the same as deliberately closed. Only a user-initiated
  // collapse of the properties panel sets this; while it is false, selecting an
  // element is allowed to slide that panel open.
  var propertiesDismissed = false;
  var panelDrag = null;
  var panelPosition = null;
  var mobileSheetViewport = window.innerWidth <= 760;
  var mobileSheetSnap = "half";
  var mobileSheetDrag = null;
  var PANEL_FONT_SCALE_MIN = 80;
  var PANEL_FONT_SCALE_MAX = 140;
  var PANEL_FONT_SCALE_STEP = 10;
  var PANEL_FONT_SCALE_DEFAULT = 100;
  var panelFontScale = PANEL_FONT_SCALE_DEFAULT;
  var settingsModalOpen = false;
  var settingsModalSection = "settings";
  var settingsReturnFocus = null;
  try {
    var storedPanelFontScale = window.localStorage.getItem("raven-grab-panel-font-scale");
    if (storedPanelFontScale) {
      var parsedPanelFontScale = parseInt(storedPanelFontScale, 10);
      if (parsedPanelFontScale >= PANEL_FONT_SCALE_MIN && parsedPanelFontScale <= PANEL_FONT_SCALE_MAX) {
        panelFontScale = Math.round(parsedPanelFontScale / PANEL_FONT_SCALE_STEP) * PANEL_FONT_SCALE_STEP;
      }
    } else {
      // Migrate legacy pixel preference (11–18 around a 13px base) into percent steps.
      var storedPanelFontPx = window.localStorage.getItem("raven-grab-panel-font-size");
      if (storedPanelFontPx) {
        var parsedPanelFontPx = parseInt(storedPanelFontPx, 10);
        if (parsedPanelFontPx >= 11 && parsedPanelFontPx <= 18) {
          panelFontScale = Math.max(
            PANEL_FONT_SCALE_MIN,
            Math.min(PANEL_FONT_SCALE_MAX, Math.round((parsedPanelFontPx / 13) * 10) * 10)
          );
        }
      }
    }
  } catch (panelFontStorageError) { /* keep default */ }
  var SEND_TIMINGS = {
    collapse: 250, // Beat 1: pill collapses into the dot.
    dot: 120, // Beat 2: solid dot hold.
    trace: 450, // Beat 3: dot becomes the check stroke.
    expand: 500, // Beat 4: pill, label, and border draw together.
    hold: 1800 // Beat 5: completed result hold before reset.
  };

  var host = document.createElement("div");
  host.setAttribute("data-raven-grab-overlay", "");
  host.setAttribute("data-mobile-sheet", mobileSheetViewport ? "true" : "false");
  host.setAttribute("data-mobile-sheet-dock", mobileSheetDock);
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:" + Z_INDEX + ";font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
  (document.documentElement || document.body).appendChild(host);
  var shadow = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = `
    @import url("https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap");
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
      --raven-grab-pending: #D9A13B;
      --raven-grab-error: #FF4060;
      --raven-grab-warning: #FF5C5C;
      --raven-grab-ui: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --raven-grab-mono: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --raven-grab-font-scale: 1;
    }
    * { box-sizing: border-box; }
    .raven-grab-highlight {
      position: fixed; display: none; pointer-events: none; z-index: 1; border: 2px solid var(--raven-grab-accent);
      background: rgba(0, 191, 255, .08); border-radius: 3px;
      box-shadow: 0 0 0 1px rgba(10, 10, 18, .72) inset, 0 0 0 1px rgba(0, 191, 255, .35);
    }
    .raven-grab-multi-highlight {
      position: fixed; display: block; pointer-events: none; z-index: 1; border: 2px solid var(--raven-grab-accent);
      background: rgba(0, 191, 255, .08); border-radius: 3px;
      box-shadow: 0 0 0 1px rgba(10, 10, 18, .72) inset, 0 0 0 1px rgba(0, 191, 255, .35);
    }
    .raven-grab-label {
      position: fixed; display: none; z-index: 1; max-width: min(420px, calc(100vw - 24px));
      padding: 5px 8px; color: #0a0a12; background: var(--raven-grab-accent); border-radius: 4px;
      font: 600 calc(11px * var(--raven-grab-font-scale))/1.25 var(--raven-grab-mono);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
      box-shadow: 0 0 0 1px rgba(0, 191, 255, .6), 0 4px 16px rgba(0, 191, 255, .35);
    }
    .raven-grab-multi-badge {
      position: fixed; display: flex; align-items: center; justify-content: center; z-index: 1; width: 18px; height: 18px;
      color: #fff; background: var(--raven-grab-bg); border: 1px solid var(--raven-grab-accent); border-radius: 50%;
      pointer-events: none; font: 600 calc(10px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); box-shadow: 0 2px 8px rgba(0, 0, 0, .45);
    }
    .raven-grab-panel {
      position: fixed; top: 20px; right: 20px; bottom: 20px; display: none; z-index: 2; width: min(360px, calc(100vw - 40px));
      overflow: hidden; pointer-events: auto; flex-direction: column;
      color: var(--raven-grab-text); background: #212129;
      border: 1px solid rgba(255, 255, 255, .12); border-radius: 20px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .25), 0 0 32px rgba(0, 191, 255, .06),
        0 8px 16px -4px rgba(0, 0, 0, .35), 0 24px 48px -12px rgba(0, 0, 0, .5);
      backdrop-filter: blur(12px); font: calc(13px * var(--raven-grab-font-scale))/1.45 var(--raven-grab-ui);
      overscroll-behavior: contain; transform: translateX(0); transition: transform 200ms ease;
    }
    .raven-grab-panel[data-side="left"] { right: auto; left: 20px; }
    .raven-grab-panel[aria-hidden="false"] { display: flex; }
    .raven-grab-panel[data-collapsed="true"] { display: flex; transform: translateX(calc(100vw + 100%)); pointer-events: none; }
    .raven-grab-panel[data-side="left"][data-collapsed="true"] { transform: translateX(calc(-100vw - 100%)); }
    @media (max-width: 1280px) {
      .raven-grab-panel { width: min(320px, calc(100vw - 32px)); top: 12px; right: 12px; bottom: 12px; border-radius: 16px; }
      .raven-grab-panel[data-side="left"] { left: 12px; }
    }
    @media (max-width: 1024px) {
      .raven-grab-panel { width: min(300px, calc(50vw - 20px)); top: 10px; right: 10px; bottom: 10px; }
      .raven-grab-panel[data-side="left"] { left: 10px; }
    }
    @media (max-width: 760px) {
      /* The mobile surface is one sheet, but both desktop panels stay mounted so
         crossing the breakpoint can restore the two-panel workspace without
         reconstructing state or duplicating handlers. */
      :host([data-mobile-sheet="true"]) .raven-grab-panel[data-side="left"],
      :host([data-mobile-sheet="true"]) .raven-grab-edge-tab:not([data-side="left"]) { display: none; }
      :host([data-mobile-sheet="true"]) .raven-grab-panel:not([data-side="left"]) {
        top: auto; right: 0; bottom: 0; left: 0;
        width: 100%; height: var(--raven-grab-sheet-height, 50vh); border-radius: 16px 16px 0 0;
        transition: height 200ms ease, transform 200ms ease;
      }
      /* Only the handle moves when the sheet docks to the top -- it is the grip on
         the page-facing edge, so it follows that edge. Mirroring the whole sheet
         (column-reverse) also flipped the reading order to Send -> settings ->
         content -> tabs, and stranded Send in the far top corner, the least
         reachable point on a phone. Tabs stay above the content and the actions
         stay below it in both docks, matching desktop. */
      :host([data-mobile-sheet="true"][data-mobile-sheet-dock="top"]) .raven-grab-panel:not([data-side="left"]) {
        top: 0; bottom: auto; border-radius: 0 0 16px 16px;
      }
      :host([data-mobile-sheet="true"][data-mobile-sheet-dock="top"]) .raven-grab-sheet-handle { order: 1; }
      :host([data-mobile-sheet="true"][data-mobile-sheet-dock="bottom"]) .raven-grab-panel:not([data-side="left"])[data-collapsed="true"] { transform: translateY(calc(100% + 24px)); }
      :host([data-mobile-sheet="true"][data-mobile-sheet-dock="top"]) .raven-grab-panel:not([data-side="left"])[data-collapsed="true"] { transform: translateY(calc(-100% - 24px)); }
      :host([data-mobile-sheet="true"]) .raven-grab-panel:not([data-side="left"])[data-sheet-dragging="true"] { transition: none; }
      :host([data-mobile-sheet="true"]) .raven-grab-panel:not([data-side="left"]) .raven-grab-top { display: none; }
      :host([data-mobile-sheet="true"]) .raven-grab-mobile-tabs { display: grid; grid-template-columns: repeat(4, minmax(44px, 1fr)); }
      :host([data-mobile-sheet="true"]) .raven-grab-sheet-handle {
        position: relative; display: flex; align-items: center; justify-content: center; flex: 0 0 44px;
        width: 100%; height: 44px; min-height: 44px; padding: 0; touch-action: none; cursor: ns-resize;
        color: var(--raven-grab-muted); background: var(--raven-grab-surface); border: 0;
      }
      .raven-grab-sheet-handle::before { content: ""; width: 36px; height: 4px; background: currentColor; border-radius: 999px; transition: background-color 120ms ease; }
      .raven-grab-sheet-handle:hover, .raven-grab-sheet-handle:focus-visible { color: var(--raven-grab-text); }
      .raven-grab-sheet-handle:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: -2px; }
      /* The mobile tab occupies the page edge opposite the sheet. Full height
         leaves only 24px, so syncMobileSheetEdgeTabs hides it rather than letting
         a 44px target cover sheet content. */
      :host([data-mobile-sheet="true"]) .raven-grab-edge-tab[data-side="left"][aria-hidden="false"] { display: flex; min-width: 44px; min-height: 44px; }
      :host([data-mobile-sheet="true"][data-mobile-sheet-dock="bottom"]) .raven-grab-edge-tab[data-side="left"] { top: 24px; bottom: auto; }
      :host([data-mobile-sheet="true"][data-mobile-sheet-dock="top"]) .raven-grab-edge-tab[data-side="left"] { top: auto; bottom: 24px; }
      .raven-grab-panel:not([data-side="left"]) .raven-grab-body { flex: 1; min-height: 0; }
    }
    .raven-grab-top { flex: 0 0 auto; background: #212129; }
    .raven-grab-header {
      display: flex; align-items: center; min-height: 56px; padding: 12px 16px;
      background: rgba(255, 255, 255, .01); border-bottom: 1px solid rgba(255, 255, 255, .06); cursor: grab; touch-action: none; user-select: none;
    }
    .raven-grab-panel[data-dragging="true"] .raven-grab-header { cursor: grabbing; }
    .raven-grab-title { min-width: 0; flex: 1; }
    .raven-grab-title strong { display: block; color: var(--raven-grab-text); font: 500 calc(14px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: -.01em; }
    .raven-grab-panel-presets { display: flex; gap: 4px; margin-left: auto; }
    .raven-grab-panel-preset {
      position: relative; width: 26px; height: 19px; padding: 0; cursor: pointer;
      background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .12); border-radius: 4px;
    }
    /* The tile is 26x19 for legibility, but the pointer target reaches the full 44px
       header height. Vertical only: the tiles sit 4px apart, so widening the target
       sideways would overlap the neighbour and make which tile you hit ambiguous. */
    .raven-grab-panel-preset::before { content: ""; position: absolute; top: -12.5px; bottom: -12.5px; left: 0; right: 0; }
    .raven-grab-panel-preset:hover { border-color: rgba(255, 255, 255, .28); }
    .raven-grab-panel-preset:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 1px; }
    .raven-grab-panel-preset[aria-checked="true"] { background: rgba(0, 191, 255, .12); border-color: var(--raven-grab-accent); }
    /* :not(...-source) keeps the hidden tooltip content from becoming a third bar. */
    .raven-grab-panel-preset span:not(.raven-grab-panel-preset-tip-source) { position: absolute; top: 3px; bottom: 3px; width: 5px; border-radius: 1.5px; background: currentColor; color: var(--raven-grab-muted); }
    .raven-grab-panel-preset[aria-checked="true"] span:not(.raven-grab-panel-preset-tip-source) { color: var(--raven-grab-accent); }
    .raven-grab-panel-preset-tip-source { display: none; }
    /* The panels clip their top bars and the last tile sits at the right edge, so no
       child-positioned tip can be both centred and visible. This fixed shadow-root
       sibling escapes that clip, like the layer drag ghost. */
    .raven-grab-panel-preset-tip {
      position: fixed; z-index: 3; display: flex; align-items: center; justify-content: center; gap: 6px;
      width: max-content; padding: 6px 8px; visibility: hidden; opacity: 0; text-align: center;
      color: var(--raven-grab-text); background: #1a1a22; border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .35); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui);
      pointer-events: none; white-space: nowrap; transition: opacity 120ms ease, visibility 120ms ease; transform: translateX(-50%);
    }
    .raven-grab-panel-preset-tip[data-visible="true"] { visibility: visible; opacity: 1; }
    /* The tail tracks the trigger rather than sitting at a fixed 50%, so a tip clamped
       away from its tile's centre still points at the tile. */
    .raven-grab-panel-preset-tip::after {
      content: ""; position: absolute; left: var(--raven-grab-tip-tail, 50%); width: 0; height: 0; margin-left: -5px;
      border-left: 5px solid transparent; border-right: 5px solid transparent;
      top: 100%; border-top: 5px solid #1a1a22;
    }
    .raven-grab-panel-preset-tip kbd {
      padding: 1px 5px; color: var(--raven-grab-muted); background: rgba(255, 255, 255, .06);
      border: 1px solid rgba(255, 255, 255, .12); border-radius: 4px;
      font: 400 calc(10px * var(--raven-grab-font-scale))/1.5 var(--raven-grab-mono);
    }
    .raven-grab-panel-preset span.raven-grab-panel-preset-left { left: 3px; }
    .raven-grab-panel-preset span.raven-grab-panel-preset-right { right: 3px; }
    .raven-grab-panel-preset span.raven-grab-panel-preset-hidden { opacity: .18; }
    .raven-grab-edge-tab svg { display: block; margin: auto; }
    .raven-grab-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); min-height: 44px; background: rgba(255, 255, 255, .01); border-bottom: 1px solid rgba(255, 255, 255, .12); backdrop-filter: blur(6px); }
    .raven-grab-mobile-tabs, .raven-grab-sheet-handle { display: none; }
    .raven-grab-tab { min-height: 44px; padding: 12px 6px; color: var(--raven-grab-text); background: transparent; border: 0; border-bottom: 1px solid transparent; cursor: pointer; font: 400 calc(11px * var(--raven-grab-font-scale))/1 var(--raven-grab-mono); }
    .raven-grab-tab[aria-selected="true"] { color: var(--raven-grab-accent); border-bottom-color: rgba(0, 191, 255, .3); font-weight: 500; }
    .raven-grab-tab:hover { color: var(--raven-grab-accent); }
    /* Content that runs past the bottom edge was cut mid-glyph -- a half-height
       "Styles" heading reads as a rendering bug, not as "there is more below".
       The fade is 16px, exactly the content's bottom padding, so with nothing
       overflowing it falls entirely on empty space and is invisible.
       scroll-padding-bottom keeps the fade off keyboard focus: tabbing and
       scrollIntoView({block:"nearest"}) both park an element flush against the
       bottom edge, which would otherwise leave a real focus ring half faded on a
       control that is still focused and operable. */
    .raven-grab-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; scroll-padding-bottom: 18px; scrollbar-width: thin; scrollbar-color: #3c3c47 #212129; -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 16px), transparent 100%); mask-image: linear-gradient(to bottom, #000 calc(100% - 16px), transparent 100%); }
    .raven-grab-body::-webkit-scrollbar { width: 6px; }
    .raven-grab-body::-webkit-scrollbar-thumb { background: #3c3c47; border-radius: 999px; }
    .raven-grab-content { padding: 16px; }
    .raven-grab-section + .raven-grab-section { margin-top: 16px; }
    /* Raven spacing.8 (32px) between Assets blocks — page template vs component. */
    .raven-grab-assets-block + .raven-grab-assets-block { margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, .08); }
    .raven-grab-assets-title {
      margin: 0 0 12px; color: var(--raven-grab-text);
      font: 700 calc(14px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: -.01em;
    }
    .raven-grab-assets-cta { margin-top: 12px; }
    .raven-grab-composer { margin: 0 0 12px; }
    .raven-grab-composer .raven-grab-textarea { width: 100%; box-sizing: border-box; max-height: 30vh; }
    .raven-grab-section-title { margin: 0 0 8px; color: var(--raven-grab-tertiary); font: 500 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: -.01em; }
    .raven-grab-section-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; margin: 0; padding: 0; color: var(--raven-grab-tertiary); background: transparent; border: 0; cursor: pointer; text-align: left; font: 500 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: -.01em; }
    .raven-grab-section-toggle:hover { color: var(--raven-grab-text); }
    .raven-grab-caret { font: 500 calc(11px * var(--raven-grab-font-scale))/1 var(--raven-grab-mono); transition: transform 150ms ease; }
    .raven-grab-section-toggle[aria-expanded="false"] .raven-grab-caret { transform: rotate(-90deg); }
    .raven-grab-collapsible { display: grid; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 150ms ease, opacity 150ms ease; }
    .raven-grab-collapsible[data-open="false"] { grid-template-rows: 0fr; opacity: 0; }
    .raven-grab-collapsible-inner { min-height: 0; overflow: hidden; visibility: visible; transition: visibility 0s linear; }
    .raven-grab-collapsible[data-open="false"] .raven-grab-collapsible-inner { visibility: hidden; transition-delay: 150ms; }
    .raven-grab-element-wrap { position: relative; display: inline-block; max-width: min(100%, 320px); }
    .raven-grab-element-chip { display: block; max-width: 100%; padding: 3px 8px; overflow: hidden; color: var(--raven-grab-accent); background: rgba(0, 191, 255, .1); border: 1px solid rgba(0, 191, 255, .3); border-radius: 4px; cursor: pointer; font: 500 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono); text-overflow: ellipsis; white-space: nowrap; transition: background 150ms ease, border-color 150ms ease, color 150ms ease; }
    .raven-grab-element-chip:hover { background: rgba(0, 191, 255, .16); border-color: rgba(0, 191, 255, .55); }
    .raven-grab-element-chip:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 2px; }
    .raven-grab-element-chip[data-copied="true"] { color: #00BFFF; }
    .raven-grab-element-placeholder { display: inline-block; padding: 3px 8px; color: var(--raven-grab-muted); background: rgba(255, 255, 255, .04); border: 1px solid rgba(255, 255, 255, .1); border-radius: 4px; font: 500 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono); }
    .raven-grab-element-tooltip { position: absolute; top: calc(100% + 6px); left: 0; z-index: 3; width: max-content; max-width: 320px; padding: 7px 9px; visibility: hidden; opacity: 0; color: var(--raven-grab-text); background: #1a1a22; border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .35); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono); overflow-wrap: anywhere; pointer-events: none; white-space: normal; transition: opacity 120ms ease, visibility 120ms ease; }
    .raven-grab-element-wrap:hover .raven-grab-element-tooltip, .raven-grab-element-wrap:focus-within .raven-grab-element-tooltip { visibility: visible; opacity: 1; }
    .raven-grab-tokens-empty { margin: 0 0 8px; padding: 0 2px; color: var(--raven-grab-muted); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui); }
    /* Flat field group — no nested cards inside the panel card (Andrew, 2026-07-18). */
    .raven-grab-token { padding: 0; }
    .raven-grab-token + .raven-grab-token { margin-top: 12px; }
    .raven-grab-token-line { display: flex; align-items: center; min-height: 20px; gap: 8px; }
    .raven-grab-swatch {
      width: 14px; height: 14px; min-width: 14px; max-width: 14px; min-height: 14px; max-height: 14px;
      flex: 0 0 14px; aspect-ratio: 1 / 1; box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, .12); border-radius: 4px; background: var(--swatch, transparent);
    }
    .raven-grab-token-name { min-width: 0; flex: 1; color: var(--raven-grab-tertiary); font: 500 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); overflow-wrap: anywhere; }
    .raven-grab-token-value { display: none; }
    .raven-grab-state-group { margin-top: 12px; }
    /* Match Size / Spacing / Typography category titles (white, bold UI). */
    .raven-grab-state-label {
      margin: 0 0 6px;
      color: var(--raven-grab-text);
      font: 700 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui);
      letter-spacing: .02em;
      text-transform: none;
    }
    .raven-grab-state-token-value { color: var(--raven-grab-text); font: 400 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); overflow-wrap: anywhere; text-align: right; }
    .raven-grab-field { display: block; margin-top: 8px; }
    .raven-grab-field > span { display: block; margin-bottom: 4px; color: var(--raven-grab-muted); font: 600 calc(11px * var(--raven-grab-font-scale))/1.35 var(--raven-grab-ui); }
    .raven-grab-input, .raven-grab-select, .raven-grab-textarea {
      width: 100%; min-height: 44px; padding: 7px 14px; color: var(--raven-grab-text); background: var(--raven-grab-bg);
      border: 1px solid rgba(255, 255, 255, .12); border-radius: 10px; outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .raven-grab-input, .raven-grab-select { font: 500 calc(13px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono); }
    .raven-grab-select { cursor: pointer; }
    .raven-grab-input:hover, .raven-grab-select:hover, .raven-grab-textarea:hover { border-color: rgba(0, 191, 255, .3); }
    .raven-grab-input:focus, .raven-grab-select:focus, .raven-grab-textarea:focus { border-color: var(--raven-grab-accent); box-shadow: 0 0 0 3px rgba(0, 191, 255, .15); }
    .raven-grab-textarea { min-height: 88px; padding: 12px 14px; resize: vertical; font: 400 calc(12px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui); }
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
    /* Flat hairline-ruled groups — no nested card inside the panel card (Andrew, 2026-07-18). */
    .raven-grab-styles { margin: 0; padding: 0; list-style: none; }
    .raven-grab-styles li { display: grid; grid-template-columns: minmax(92px, .8fr) minmax(0, 1.2fr); align-items: center; gap: 12px; min-height: 36px; padding: 9px 2px; }
    .raven-grab-styles li + li { border-top: 1px solid rgba(255, 255, 255, .06); }
    .raven-grab-styles li[data-edited="true"] { background: rgba(0, 191, 255, .08); }
    .raven-grab-styles li.raven-grab-style-category { display: block; grid-template-columns: none; min-height: 0; padding: 16px 2px 6px; background: transparent; pointer-events: none; }
    .raven-grab-styles li.raven-grab-style-category + li { border-top: 0; }
    .raven-grab-styles li.raven-grab-style-category:first-child { padding-top: 2px; }
    .raven-grab-styles li.raven-grab-style-category .raven-grab-style-category-label {
      color: var(--raven-grab-text);
      font: 700 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui);
      letter-spacing: .02em;
    }
    .raven-grab-styles span { color: var(--raven-grab-tertiary); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono); }
    .raven-grab-styles [data-style-label] { cursor: ew-resize; user-select: none; }
    .raven-grab-style-label-wrap { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
    .raven-grab-radius-expand { position: relative; width: 20px; height: 20px; padding: 0; color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 4px; cursor: pointer; font: 600 calc(12px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    /* Hit-slop: 20px visual glyph, 24x24 clickable area (WCAG 2.2 SC 2.5.8 floor) with no layout/visual change — the ::before belongs to the button so clicks on it hit the button. */
    .raven-grab-radius-expand::before { content: ""; position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; }
    .raven-grab-radius-expand:hover { color: var(--raven-grab-text); background: rgba(255, 255, 255, .06); }
    .raven-grab-radius-editor { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; width: 100%; }
    .raven-grab-radius-field { display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 3px; min-width: 0; }
    .raven-grab-radius-field > span { font: 600 calc(8px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); letter-spacing: -.01em; }
    .raven-grab-radius-field input { width: 100%; min-width: 0; padding: 4px 5px; color: var(--raven-grab-text); background: var(--raven-grab-bg); border: 1px solid rgba(255, 255, 255, .12); border-radius: 5px; outline: none; font: 400 calc(10px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); }
    .raven-grab-radius-field input:focus { border-color: var(--raven-grab-accent); }
    .raven-grab-styles code { display: flex; align-items: center; justify-content: flex-end; min-height: 18px; overflow-wrap: anywhere; color: var(--raven-grab-text); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono); cursor: pointer; border-radius: 4px; text-align: right; }
    .raven-grab-styles code:hover { background: rgba(255, 255, 255, .04); text-decoration: underline dashed; text-underline-offset: 3px; }
    .raven-grab-styles code:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 2px; }
    .raven-grab-styles code[data-mixed="true"] { color: var(--raven-grab-muted); font-style: italic; }
    .raven-grab-styles li[data-edited="true"] code { color: var(--raven-grab-accent); font-weight: 700; font-style: normal; }
    .raven-grab-styles li[data-error="true"] { background: rgba(255, 64, 96, .08); box-shadow: inset 2px 0 0 var(--raven-grab-error); }
    .raven-grab-style-input {
      width: 100%; min-width: 0; min-height: 32px; padding: 6px 10px; color: var(--raven-grab-text); background: var(--raven-grab-bg);
      border: 1px solid var(--raven-grab-accent); border-radius: 8px; outline: none;
      font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono);
    }
    .raven-grab-style-input:focus { box-shadow: 0 0 0 3px rgba(0, 191, 255, .15); }
    .raven-grab-style-editor { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; width: 100%; }
    .raven-grab-style-editor[data-token-linked="true"] > :not(.raven-grab-token-inline) { opacity: .45; }
    .raven-grab-token-inline { display: grid; gap: 8px; width: 100%; flex: 1 0 100%; margin-bottom: 2px; }
    .raven-grab-token-inline .raven-grab-field { margin-top: 0; }
    .raven-grab-token-inline .raven-grab-new-token[data-open="true"] { display: grid; }
    .raven-grab-token-choice-row { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
    .raven-grab-token-choice-row .raven-grab-select { flex: 1 1 auto; min-width: 0; }
    .raven-grab-token-unlink {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; padding: 0; color: var(--raven-grab-muted);
      background: transparent; border: 1px solid rgba(255, 255, 255, .12); border-radius: 7px; cursor: pointer;
    }
    .raven-grab-token-unlink:hover { color: var(--raven-grab-text); border-color: rgba(0, 191, 255, .4); background: rgba(0, 191, 255, .08); }
    .raven-grab-token-unlink:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 2px; }
    .raven-grab-token-unlink svg { display: block; width: 14px; height: 14px; }
    .raven-grab-token-unlink-row { opacity: 0; flex: 0 0 auto; margin-left: 4px; transition: opacity 120ms ease; }
    .raven-grab-styles li:hover .raven-grab-token-unlink-row,
    .raven-grab-styles li:focus-within .raven-grab-token-unlink-row { opacity: 1; }
    .raven-grab-token-value { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; min-width: 0; max-width: 100%; }
    .raven-grab-token-glyph { flex: 0 0 auto; display: inline-flex; align-items: center; color: var(--raven-grab-accent); opacity: .85; }
    .raven-grab-token-glyph svg { display: block; width: 12px; height: 12px; }
    .raven-grab-token-label { min-width: 0; overflow-wrap: anywhere; text-align: right; }
    .raven-grab-token-picker { position: relative; flex: 1 1 auto; min-width: 0; }
    .raven-grab-token-picker-trigger { width: 100%; text-align: left; cursor: pointer; }
    .raven-grab-token-picker-menu {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 6;
      display: none; max-height: 220px; overflow: hidden; padding: 6px;
      background: #1a1a22; border: 1px solid rgba(255, 255, 255, .12); border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
    }
    .raven-grab-token-picker-menu[data-open="true"] { display: grid; gap: 6px; }
    .raven-grab-token-picker-search { min-height: 32px; padding: 6px 10px; font-size: calc(11px * var(--raven-grab-font-scale)); }
    .raven-grab-token-picker-list { display: grid; gap: 2px; max-height: 160px; overflow-y: auto; }
    .raven-grab-token-picker-group-label { padding: 4px 6px 2px; color: var(--raven-grab-muted); font: 600 calc(9px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: .04em; text-transform: uppercase; }
    .raven-grab-token-picker-option {
      display: block; width: 100%; min-height: 28px; padding: 5px 8px; text-align: left;
      color: var(--raven-grab-text); background: transparent; border: 0; border-radius: 6px; cursor: pointer;
      font: 400 calc(11px * var(--raven-grab-font-scale))/1.35 var(--raven-grab-mono);
    }
    .raven-grab-token-picker-option:hover, .raven-grab-token-picker-option:focus-visible,
    .raven-grab-token-picker-option[aria-selected="true"] { background: rgba(0, 191, 255, .12); outline: none; }
    .raven-grab-token-choice-source { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; overflow: hidden; clip: rect(0, 0, 0, 0); }
    .raven-grab-color-suggestion-group { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; width: 100%; }
    .raven-grab-color-suggestion-caption { flex: 0 0 100%; margin: 0; padding: 2px 0 0; color: var(--raven-grab-muted); font: 600 calc(9px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: .04em; text-transform: uppercase; }
    .raven-grab-style-editor[data-control="color"] { flex-wrap: wrap; }
    .raven-grab-style-editor[data-control="stroke"],
    .raven-grab-style-editor[data-control="text-decoration"],
    .raven-grab-style-editor[data-control="box-shadow"],
    .raven-grab-style-editor[data-control="overflow"],
    .raven-grab-style-editor[data-control="size"] { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 8px; padding-top: 4px; }
    .raven-grab-style-editor[data-control="size"] { grid-template-columns: minmax(0, 1fr) auto; }
    .raven-grab-structured-row[data-disabled="true"] { opacity: .45; }
    .raven-grab-stroke-field, .raven-grab-structured-field { display: grid; gap: 4px; min-width: 0; }
    .raven-grab-stroke-field > span, .raven-grab-structured-field > span { color: var(--raven-grab-muted); font: 600 calc(9px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-stroke-width, .raven-grab-stroke-color, .raven-grab-structured-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .raven-grab-stroke-position, .raven-grab-structured-span { grid-column: 1 / -1; }
    .raven-grab-shadow-presets { display: flex; flex-wrap: wrap; gap: 4px; }
    .raven-grab-shadow-preset { min-height: 28px; padding: 4px 8px; color: var(--raven-grab-muted); background: var(--raven-grab-bg); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; cursor: pointer; font: 600 calc(10px * var(--raven-grab-font-scale))/1.2 var(--raven-grab-ui); }
    .raven-grab-shadow-preset:hover { color: var(--raven-grab-text); border-color: rgba(0,191,255,.35); }
    .raven-grab-shadow-preset[aria-pressed="true"] { color: #0a1018; background: var(--raven-grab-accent); border-color: var(--raven-grab-accent); }
    .raven-grab-structured-check { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; color: var(--raven-grab-text); font: 500 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-structured-check input { width: 14px; height: 14px; accent-color: var(--raven-grab-accent); }
    .raven-grab-stroke-segmented { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; background: var(--raven-grab-bg); border: 1px solid rgba(255, 255, 255, .12); border-radius: 9px; }
    .raven-grab-stroke-segmented button { min-height: 30px; padding: 5px 8px; color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 7px; cursor: pointer; font: 600 calc(10px * var(--raven-grab-font-scale))/1.2 var(--raven-grab-ui); }
    .raven-grab-stroke-segmented button:hover { color: var(--raven-grab-text); background: rgba(255, 255, 255, .06); }
    .raven-grab-stroke-segmented button[aria-pressed="true"] { color: #0a1018; background: var(--raven-grab-accent); }
    .raven-grab-stroke-sides { grid-template-columns: repeat(5, 1fr); }
    .raven-grab-stroke-sides button { min-height: 28px; padding: 5px 4px; }
    .raven-grab-stroke-disclosure { grid-column: 1 / -1; margin: -2px 0 0; color: var(--raven-grab-muted); font: 400 calc(9px * var(--raven-grab-font-scale))/1.35 var(--raven-grab-ui); }
    .raven-grab-style-editor[data-control="stroke"] > .raven-grab-color-suggestions,
    .raven-grab-style-editor[data-control="text-decoration"] > .raven-grab-color-suggestions,
    .raven-grab-style-editor[data-control="box-shadow"] > .raven-grab-color-suggestions { grid-column: 1 / -1; }
    .raven-grab-style-editor .raven-grab-style-input { flex: 1 1 auto; }
    .raven-grab-color-suggestions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 5px; width: 100%; padding-top: 4px; }
    .raven-grab-color-suggestion {
      -webkit-appearance: none; appearance: none;
      flex: 0 0 20px; width: 20px; height: 20px; min-width: 20px; max-width: 20px; min-height: 20px; max-height: 20px;
      aspect-ratio: 1 / 1; box-sizing: border-box; padding: 0; margin: 0; line-height: 0;
      background-color: var(--swatch, transparent); background-image: none;
      border: 1px solid rgba(255, 255, 255, .22); border-radius: 5px;
      cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .14);
    }
    .raven-grab-color-suggestion:hover, .raven-grab-color-suggestion:focus-visible { border-color: var(--raven-grab-accent); outline: none; }
    /* Scope switch (17): Instance ↔ All siblings — Raven grab tokens only. */
    .raven-grab-scope {
      position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr) 36px; align-items: center;
      width: 100%; max-width: 300px; min-height: 44px; padding: 4px;
      background: var(--raven-grab-bg); border: 1px solid rgba(255, 255, 255, .1); border-radius: 999px;
    }
    .raven-grab-scope-cap {
      position: relative; display: grid; place-items: center; width: 36px; height: 36px; padding: 0;
      border: 0; border-radius: 50%; background: transparent; color: var(--raven-grab-muted); cursor: pointer;
      transition: color 140ms ease;
    }
    .raven-grab-scope-cap:hover { color: var(--raven-grab-text); }
    .raven-grab-scope-cap:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 2px; }
    .raven-grab-scope-cap[aria-pressed="true"] { color: var(--raven-grab-accent); }
    .raven-grab-scope-cap[aria-pressed="true"]:hover { color: var(--raven-grab-accent-hover); }
    .raven-grab-scope-ico { display: inline-grid; place-items: center; width: 16px; height: 16px; color: currentColor; }
    .raven-grab-scope-ico[data-kind="instance"] span {
      display: block; width: 11px; height: 11px; border: 1.5px solid currentColor; border-radius: 2px;
    }
    .raven-grab-scope-ico[data-kind="siblings"] {
      grid-template-columns: 1fr 1fr; gap: 1.5px;
    }
    .raven-grab-scope-ico[data-kind="siblings"] span {
      display: block; width: 100%; height: 100%; border: 1.25px solid currentColor; border-radius: 1.5px; box-sizing: border-box;
    }
    .raven-grab-scope-track {
      position: relative; height: 28px; border-radius: 999px; background: rgba(0, 0, 0, .28); cursor: pointer; overflow: hidden;
    }
    .raven-grab-scope-knob {
      position: absolute; top: 2px; left: 2px; width: calc(50% - 2px); height: 24px; border-radius: 999px;
      background: var(--raven-grab-accent); box-shadow: 0 4px 14px rgba(0, 191, 255, .35);
      transition: transform 200ms cubic-bezier(.16, 1, .3, 1); pointer-events: none;
    }
    .raven-grab-scope[data-scope-value="component"] .raven-grab-scope-knob { transform: translateX(100%); }
    .raven-grab-scope-labels {
      position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; align-items: center;
      pointer-events: none; font: 700 calc(9px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); letter-spacing: .02em;
    }
    .raven-grab-scope-labels span { text-align: center; color: var(--raven-grab-muted); }
    .raven-grab-scope[data-scope-value="instance"] .raven-grab-scope-labels span:first-child,
    .raven-grab-scope[data-scope-value="component"] .raven-grab-scope-labels span:last-child { color: var(--raven-grab-bg); }
    .raven-grab-color-input { flex: 0 0 28px; width: 28px; height: 28px; padding: 0; background: none; border: 1px solid var(--raven-grab-accent); border-radius: 8px; cursor: pointer; }
    .raven-grab-style-select, .raven-grab-style-format, .raven-grab-style-unit {
      min-height: 32px; padding: 6px 8px; color: var(--raven-grab-text); background: var(--raven-grab-bg);
      border: 1px solid var(--raven-grab-accent); border-radius: 8px; outline: none; cursor: pointer;
      font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono);
    }
    .raven-grab-style-select { flex: 1 1 auto; width: 100%; }
    .raven-grab-style-format, .raven-grab-style-unit { flex: 0 0 auto; }
    .raven-grab-style-select:focus, .raven-grab-style-format:focus, .raven-grab-style-unit:focus { box-shadow: 0 0 0 3px rgba(0, 191, 255, .15); }
    .raven-grab-empty { margin: 0; padding: 12px; color: var(--raven-grab-muted); background: var(--raven-grab-raised); border: 1px dashed rgba(255, 255, 255, .1); border-radius: 12px; font: 400 calc(12px * var(--raven-grab-font-scale))/1.45 var(--raven-grab-ui); }
    .raven-grab-note { margin: 0; color: var(--raven-grab-muted); font: 400 calc(11px * var(--raven-grab-font-scale))/1.45 var(--raven-grab-ui); }
    .raven-grab-slot { margin-top: 8px; padding: 10px; background: var(--raven-grab-raised); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; }
    .raven-grab-slot-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .raven-grab-slot-selector { min-width: 0; flex: 1; overflow: hidden; color: var(--raven-grab-muted); font: 400 calc(10px * var(--raven-grab-font-scale))/1.35 var(--raven-grab-mono); text-overflow: ellipsis; white-space: nowrap; }
    .raven-grab-role { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; }
    .raven-grab-role button { min-height: 44px; color: var(--raven-grab-muted); background: var(--raven-grab-bg); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; cursor: pointer; }
    .raven-grab-role button:hover, .raven-grab-role button[data-active="true"] { color: var(--raven-grab-accent); border-color: rgba(0,191,255,.45); }
    .raven-grab-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .raven-grab-section-heading .raven-grab-section-title { margin: 0; }
    .raven-grab-link-button { padding: 0; color: var(--raven-grab-accent); background: transparent; border: 0; cursor: pointer; font: 500 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-link-button:hover { color: var(--raven-grab-accent-hover); }
    .raven-grab-heading-status { color: var(--raven-grab-muted); font: 400 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-badge { flex: 0 0 auto; padding: 2px 5px; color: var(--raven-grab-accent); background: rgba(0,191,255,.1); border: 1px solid rgba(0,191,255,.25); border-radius: 999px; font: 600 calc(9px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); }
    .raven-grab-badge[data-kind="orphan"] { color: var(--raven-grab-error); background: rgba(255,64,96,.1); border-color: rgba(255,64,96,.3); }
    .raven-grab-layer-list { position: relative; margin: 0; padding: 0; list-style: none; }
    .raven-grab-layer-row { display: flex; align-items: center; gap: 5px; min-height: 30px; padding: 4px 6px; padding-left: calc(6px + var(--layer-depth) * 12px); overflow: hidden; border-bottom: 1px solid rgba(255,255,255,.04); cursor: grab; }
    .raven-grab-layer-row:hover { background: rgba(255,255,255,.04); }
    .raven-grab-layer-row[data-layer-hovered="true"] { background: rgba(255,255,255,.07); box-shadow: inset 2px 0 0 var(--raven-grab-accent); }
    .raven-grab-layer-row[data-dragging="true"] { display: none; }
    .raven-grab-layer-row[data-layer-pending="true"] .raven-grab-layer-index { color: var(--raven-grab-pending); background: rgba(217,161,59,.16); border-radius: 5px; }
    .raven-grab-layer-row[data-layer-pending="true"] {
      opacity: 0.72;
      background: rgba(217, 161, 59, 0.08);
      outline: 1px dashed rgba(217, 161, 59, 0.55);
      outline-offset: -1px;
    }
    .raven-grab-layer-pending-badge { flex: 0 0 auto; padding: 2px 7px; color: var(--raven-grab-pending); background: rgba(217,161,59,.14); border-radius: 999px; font: 600 calc(9px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: -.01em; }
    .raven-grab-layer-slot { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 4px 12px 4px 6px; padding-left: calc(6px + var(--layer-depth) * 12px); color: var(--raven-grab-muted); background: var(--raven-grab-raised); border: 1px solid rgba(255,255,255,.12); font: 500 calc(10px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); pointer-events: none; }
    .raven-grab-layer-slot[data-pending="true"] { color: var(--raven-grab-accent); background: rgba(0,191,255,.08); border-color: rgba(0,191,255,.45); }
    .raven-grab-layer-slot[data-reparent="true"] { color: var(--raven-grab-accent); background: rgba(0,191,255,.12); border-color: rgba(0,191,255,.55); border-style: dashed; }
    .raven-grab-layer-slot-grip { flex: 0 0 auto; font: 500 calc(12px * var(--raven-grab-font-scale))/1 var(--raven-grab-mono); }
    .raven-grab-layer-drag { position: fixed; z-index: 2147483647; margin: 0; padding: 0; list-style: none; pointer-events: none; background: var(--raven-grab-raised); border-radius: 8px; overflow: hidden; box-shadow: 0 12px 32px rgba(0, 0, 0, .45), 0 0 0 1px rgba(0, 191, 255, .35); }
    .raven-grab-layer-drag .raven-grab-layer-row { cursor: grabbing; }
    .raven-grab-layer-row[data-selected="true"] { background: rgba(0, 191, 255, .08); }
    .raven-grab-layer-row[data-selected="true"] .raven-grab-layer-label { color: var(--raven-grab-accent); }
    .raven-grab-layer-row[data-template-layer-id] { cursor: pointer; }
    .raven-grab-layer-row:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: -2px; }
    /* Visual box stays 14x18 for tree density; padding + negative margin grow the hit area to 24x30. */
    .raven-grab-layer-toggle, .raven-grab-layer-toggle-spacer { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 30px; margin: -6px -5px; padding: 6px 5px; flex: 0 0 24px; }
    .raven-grab-layer-toggle { color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 4px; cursor: pointer; font: 600 calc(13px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); transition: transform 120ms ease, color 120ms ease, background 120ms ease; }
    .raven-grab-layer-toggle[data-expanded="true"] { transform: rotate(90deg); }
    .raven-grab-layer-toggle:hover { color: var(--raven-grab-accent); background: rgba(0,191,255,.08); }
    button.raven-grab-layer-row { width: 100%; color: var(--raven-grab-text); background: transparent; border: 0; border-bottom: 1px solid rgba(255,255,255,.04); text-align: left; }
    .raven-grab-layer-action { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; margin: -4px -6px -4px 0; padding: 0; flex: 0 0 auto; color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 50%; cursor: pointer; font: 500 calc(18px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    .raven-grab-layer-action:hover { color: var(--raven-grab-accent); background: rgba(0,191,255,.08); }
    .raven-grab-template-detail { margin: 0 0 8px; padding: 8px 8px 10px; padding-left: calc(24px + var(--layer-depth) * 12px); background: var(--raven-grab-raised); }
    .raven-grab-template-detail .raven-grab-textarea { min-height: 64px; }
    .raven-grab-layer-index { flex: 0 0 14px; color: var(--raven-grab-muted); font: 400 calc(9px * var(--raven-grab-font-scale))/1 var(--raven-grab-mono); text-align: right; }
    .raven-grab-layer-label { min-width: 0; flex: 1; overflow: hidden; color: var(--raven-grab-text); font: 400 calc(10px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); text-overflow: ellipsis; white-space: nowrap; }
    .raven-grab-layer-notice { margin: 8px 0 0; color: var(--raven-grab-error); font: 500 calc(10px * var(--raven-grab-font-scale))/1.35 var(--raven-grab-ui); }
    .raven-grab-layer-warning { color: var(--raven-grab-warning); }
    .raven-grab-layer-info { color: var(--raven-grab-muted); }
    .raven-grab-layer-preview { display: flex; align-items: stretch; justify-content: stretch; width: 100%; height: 140px; overflow: hidden; border-radius: 10px; }
    .raven-grab-layer-filter { width: 100%; min-height: 44px; padding: 0; color: var(--raven-grab-text); background: transparent; border: 0; outline: none; font: 400 calc(12px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui); text-align: center; }
    .raven-grab-wireframe { position: relative; display: flex; flex-direction: column; gap: 4px; width: 100%; height: 100%; min-height: 132px; padding: 8px; overflow: hidden; background: var(--raven-grab-bg); border: 1px solid rgba(255,255,255,.24); border-radius: 10px; box-sizing: border-box; }
    .raven-grab-wire-box { position: relative; display: flex; align-items: center; justify-content: center; flex: 1 1 0; width: 100%; min-height: 24px; color: var(--raven-grab-text); background: rgba(0,191,255,.08); border: 1px solid rgba(0,191,255,.45); border-radius: 6px; font: 600 calc(9px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); box-sizing: border-box; }
    .raven-grab-wire-box[data-moved="true"] { color: #0a1018; background: var(--raven-grab-accent); }
    .raven-grab-structure-footer { flex: 0 0 auto; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.08); }
    /* Exactly one gear on screen. Both panels carry the footer; the host attribute
       picks the one in the panel the user can actually see. Default (no attribute)
       matches the historical placement: left panel. */
    /* :not([data-side=left]) rather than [data-side=right]: the right panel carries no
       data-side, and adding one would wake the dormant narrow-viewport rule above it. */
    :host .raven-grab-panel:not([data-side="left"]) .raven-grab-structure-footer { display: none; }
    :host([data-settings-home="right"]) .raven-grab-panel:not([data-side="left"]) .raven-grab-structure-footer { display: block; }
    :host([data-settings-home="right"]) .raven-grab-panel[data-side="left"] .raven-grab-structure-footer { display: none; }
    /* Simple mode is one panel, so the layout tiles and the left edge tab describe
       choices that no longer exist. Hidden in CSS rather than branched in markup --
       the mode flips live from Settings and nothing has to re-render to follow it. */
    :host([data-mode="simple"]) .raven-grab-panel-presets,
    :host([data-mode="simple"]) .raven-grab-edge-tab[data-side="left"],
    :host([data-mode="simple"]) .raven-grab-panel[data-side="left"] { display: none; }
    /* Full height is right for the two-panel build, where the body holds a style
       editor or a layer tree. Simple mode's body is one element chip, so the panel
       hugs its content instead of standing 600px of empty column over the composer. */
    :host([data-mode="simple"]) .raven-grab-panel:not([data-side="left"]) { bottom: auto; max-height: calc(100vh - 40px); }
    /* The right panel's header holds only the layout tiles, so hiding them in simple
       mode left an empty band. The title takes the space it already occupies. */
    .raven-grab-panel:not([data-side="left"]) .raven-grab-title { display: none; }
    :host([data-mode="simple"]) .raven-grab-panel:not([data-side="left"]) .raven-grab-title { display: block; }
    /* The whole row is one hover surface. Negative margin against matching padding lets
       the hover background run the full width of the footer while the ⌘K chip stays on
       the same left edge it sits on at rest. */
    .raven-grab-settings-trigger { display: inline-flex; align-items: center; gap: 8px; width: calc(100% + 16px); min-height: 44px; margin: 0 -8px; padding: 4px 10px; color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 8px; cursor: pointer; font: 500 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); text-align: left; transition: background-color 120ms ease, color 120ms ease; }
    .raven-grab-settings-trigger:hover, .raven-grab-settings-trigger:focus-visible { color: var(--raven-grab-text); background: rgba(255,255,255,.05); }
    .raven-grab-settings-trigger:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 1px; }
    /* color:inherit rather than a pinned muted -- the chip pinning its own colour is why
       it was the one part of the row that ignored hover. */
    .raven-grab-settings-trigger kbd { flex: 0 0 auto; padding: 2px 6px; color: inherit; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 4px; font: 500 calc(10px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); transition: background-color 120ms ease, border-color 120ms ease; }
    .raven-grab-settings-trigger:hover kbd, .raven-grab-settings-trigger:focus-visible kbd { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.22); }
    /* The project name is the subject of this row, not a caption on the shortcut, so it
       carries primary colour and outranks the ⌘K chip beside it. It rests a step below
       full so it has somewhere to go on hover along with everything else in the row. */
    .raven-grab-settings-project { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--raven-grab-text); opacity: .82; font: 600 calc(13px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: -.01em; transition: opacity 120ms ease; }
    /* margin-left:auto pins the gear to the far edge whatever the name's length, and it
       inherits currentColor so it brightens with the row on hover rather than separately. */
    .raven-grab-settings-gear { flex: 0 0 auto; margin-left: auto; width: 16px; height: 16px; opacity: .75; transition: opacity 120ms ease; }
    .raven-grab-settings-trigger:hover .raven-grab-settings-project,
    .raven-grab-settings-trigger:focus-visible .raven-grab-settings-project,
    .raven-grab-settings-trigger:hover .raven-grab-settings-gear,
    .raven-grab-settings-trigger:focus-visible .raven-grab-settings-gear { opacity: 1; }
    .raven-grab-settings-modal { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 32px; pointer-events: auto; background: rgba(4,7,12,.72); backdrop-filter: blur(4px); box-sizing: border-box; }
    .raven-grab-settings-modal[hidden] { display: none; }
    /* One fixed size, never resized by its content (Andrew, 2026-07-20). The old
       min-height 480 / max-height 680 range let the dialog size itself to whichever
       pane was showing, so switching Settings -> Feedback jumped it 480px -> 507px
       and the whole dialog re-centred under the cursor. 540 clears the tallest pane
       (feedback, 505) so nothing scrolls; the viewport clamp still collapses it on
       short screens, and the narrow-viewport rule below returns it to a full sheet. */
    .raven-grab-settings-dialog { position: relative; display: grid; grid-template-columns: 190px minmax(0,1fr); width: min(760px, calc(100vw - 64px)); height: min(540px, calc(100vh - 64px)); overflow: hidden; color: var(--raven-grab-text); background: var(--raven-grab-bg); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; box-shadow: 0 28px 80px rgba(0,0,0,.55); font-family: var(--raven-grab-ui); box-sizing: border-box; }
    .raven-grab-settings-close { position: absolute; top: 18px; right: 18px; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 8px; cursor: pointer; font: 300 24px/1 var(--raven-grab-ui); }
    .raven-grab-settings-close:hover { color: var(--raven-grab-text); background: rgba(255,255,255,.06); }
    .raven-grab-settings-close:focus-visible, .raven-grab-settings-nav button:focus-visible, .raven-grab-feedback-send:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 2px; }
    .raven-grab-settings-nav { display: flex; flex-direction: column; gap: 4px; padding: 32px 18px; background: var(--raven-grab-raised); border-right: 1px solid rgba(255,255,255,.08); }
    .raven-grab-settings-nav-label { margin: 0 10px 8px; color: var(--raven-grab-tertiary); font: 600 calc(10px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); letter-spacing: .06em; text-transform: uppercase; }
    .raven-grab-settings-nav button { min-height: 38px; padding: 8px 10px; color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 8px; cursor: pointer; font: 500 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); text-align: left; }
    .raven-grab-settings-nav button:hover { color: var(--raven-grab-text); background: rgba(255,255,255,.04); }
    .raven-grab-settings-nav button[aria-selected="true"] { color: var(--raven-grab-text); background: rgba(255,255,255,.08); }
    .raven-grab-settings-pane { min-width: 0; padding: 40px 48px; overflow-y: auto; box-sizing: border-box; }
    .raven-grab-settings-pane[hidden] { display: none; }
    .raven-grab-settings-pane h2 { margin: 0 48px 32px 0; color: var(--raven-grab-text); font: 600 calc(20px * var(--raven-grab-font-scale))/1.25 var(--raven-grab-ui); letter-spacing: -.02em; }
    .raven-grab-settings-row { display: flex; align-items: center; gap: 24px; min-height: 52px; padding: 12px 0; border-top: 1px solid rgba(255,255,255,.08); }
    .raven-grab-settings-row label { min-width: 0; flex: 1; color: var(--raven-grab-text); font: 500 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    /* The shared select is width:100% for panel fields; in a settings row it sits
       beside its label instead of pushing it off the line. */
    .raven-grab-settings-choices { display: inline-flex; flex: 0 0 auto; padding: 2px; gap: 2px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; }
    .raven-grab-settings-choice { min-height: 32px; padding: 0 14px; color: var(--raven-grab-muted); background: transparent; border: 0; border-radius: 6px; cursor: pointer; font: 500 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-settings-choice:hover { color: var(--raven-grab-text); }
    .raven-grab-settings-choice[data-on="true"] { color: var(--raven-grab-text); background: rgba(255,255,255,.1); }
    .raven-grab-settings-choice:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 1px; }
    .raven-grab-settings-row .raven-grab-hint { display: block; margin-top: 4px; color: var(--raven-grab-muted); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui); }
    .raven-grab-shortcut-list { display: grid; margin: 0; grid-template-columns: auto 1fr; align-items: baseline; gap: 10px 18px; }
    .raven-grab-shortcut-list dt { justify-self: start; }
    .raven-grab-shortcut-list dt kbd { display: inline-block; padding: 3px 7px; color: var(--raven-grab-text); background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 4px; font: 500 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-mono); white-space: nowrap; }
    .raven-grab-shortcut-list dd { margin: 0; color: var(--raven-grab-muted); font: 400 calc(12px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui); }
    .raven-grab-font-stepper { display: inline-flex; align-items: center; gap: 4px; }
    .raven-grab-font-stepper button { width: 28px; height: 28px; padding: 0; color: var(--raven-grab-text); background: var(--raven-grab-raised); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; cursor: pointer; font: 600 calc(14px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    .raven-grab-font-stepper button:hover { border-color: rgba(0,191,255,.45); color: var(--raven-grab-accent); }
    /* The % has to read as part of the value, not as a label sitting after the field.
       It stays a sibling span (two call sites share this markup, so changing the DOM
       would mean changing both), and is pulled back over the input's right padding.
       The input is right-aligned rather than centred so the digits always end at the
       same x -- centred text would drift away from the % between 90 and 100. */
    .raven-grab-font-stepper input { width: 62px; height: 28px; padding: 0 22px 0 6px; color: var(--raven-grab-text); background: var(--raven-grab-bg); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; text-align: right; font: 500 calc(12px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    .raven-grab-font-stepper input:focus-visible { outline: 2px solid var(--raven-grab-accent); outline-offset: 1px; }
    /* type="number" paints its own spinners, which sat next to this control's custom
       -/+ buttons -- two steppers on one field. appearance:textfield covers Firefox,
       the ::-webkit pair covers Chrome and Safari. Keeping type="number" (rather than
       switching to text) keeps the browser's arrow-key stepping and min/max clamping. */
    .raven-grab-font-stepper input { appearance: textfield; -moz-appearance: textfield; }
    .raven-grab-font-stepper input::-webkit-outer-spin-button,
    .raven-grab-font-stepper input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    /* -24px = the flex gap (4) plus the distance needed to land the % inside the
       input's 22px right padding. Measured, not guessed: at -14px it still sat 4px
       past the input's border box. margin-right restores the gap before the + button. */
    .raven-grab-font-suffix { margin-left: -24px; margin-right: 6px; width: 16px; color: var(--raven-grab-muted); pointer-events: none; font: 500 calc(12px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    .raven-grab-feedback-copy { max-width: 52ch; margin: -18px 0 28px; color: var(--raven-grab-muted); font: 400 calc(12px * var(--raven-grab-font-scale))/1.55 var(--raven-grab-ui); }
    .raven-grab-feedback-form { display: grid; gap: 18px; }
    .raven-grab-feedback-field { display: grid; gap: 7px; color: var(--raven-grab-text); font: 500 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-feedback-field textarea, .raven-grab-feedback-field input { width: 100%; padding: 10px 12px; color: var(--raven-grab-text); background: var(--raven-grab-raised); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; outline: none; font: 400 calc(12px * var(--raven-grab-font-scale))/1.45 var(--raven-grab-ui); box-sizing: border-box; }
    .raven-grab-feedback-field textarea { min-height: 128px; resize: vertical; }
    /* flex, not the form's grid: the label wraps to three lines at 390px and the wrapped
       lines must hang beside the checkbox rather than running back under it. */
    .raven-grab-feedback-consent { display: flex; align-items: flex-start; gap: 8px; color: var(--raven-grab-muted); font: 400 calc(11px * var(--raven-grab-font-scale))/1.45 var(--raven-grab-ui); cursor: pointer; }
    .raven-grab-feedback-consent input { flex: 0 0 auto; width: 14px; height: 14px; margin: 2px 0 0; accent-color: var(--raven-grab-accent); }
    .raven-grab-feedback-field textarea:focus, .raven-grab-feedback-field input:focus { border-color: var(--raven-grab-accent); box-shadow: 0 0 0 2px rgba(0,191,255,.14); }
    .raven-grab-feedback-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .raven-grab-feedback-send { min-height: 38px; padding: 8px 18px; color: #0a1018; background: var(--raven-grab-accent); border: 0; border-radius: 999px; cursor: pointer; font: 600 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-feedback-send:disabled { cursor: wait; opacity: .6; }
    .raven-grab-feedback-status { min-height: 18px; margin: 0; color: var(--raven-grab-muted); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui); }
    .raven-grab-feedback-status[data-kind="error"] { color: var(--raven-grab-error); }
    @media (max-width: 600px) {
      .raven-grab-settings-modal { align-items: stretch; padding: 12px; }
      .raven-grab-settings-dialog { grid-template-columns: 1fr; grid-template-rows: auto minmax(0,1fr); width: 100%; height: auto; }
      /* Two persistent tabs keep both destinations one tap away without a mobile-only back stack. */
      .raven-grab-settings-nav { flex-direction: row; gap: 2px; padding: 14px 54px 10px 14px; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.08); }
      .raven-grab-settings-nav-label { display: none; }
      .raven-grab-settings-nav button { flex: 1; text-align: center; }
      .raven-grab-settings-close { top: 8px; right: 10px; }
      .raven-grab-settings-pane { padding: 28px 22px; }
      .raven-grab-settings-pane h2 { margin-bottom: 24px; }
      .raven-grab-settings-row { align-items: flex-start; flex-direction: column; gap: 12px; }
      .raven-grab-feedback-actions { align-items: flex-start; flex-direction: column; }
    }
    .raven-grab-actions { flex: 0 0 auto; padding: 12px 16px 16px; background: #212129; border-top: 1px solid rgba(255, 255, 255, .06); }
    .raven-grab-changes { margin: 0 0 10px; padding: 10px; background: var(--raven-grab-raised); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; }
    .raven-grab-changes-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; color: var(--raven-grab-text); font: 600 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-changes-header span { color: var(--raven-grab-muted); font-weight: 400; }
    .raven-grab-changes-toggle { color: var(--raven-grab-text); font: 600 calc(11px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui); }
    .raven-grab-changes-toggle:hover { color: var(--raven-grab-text); }
    .raven-grab-changes-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .raven-grab-changes-heading span { color: var(--raven-grab-muted); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .raven-grab-collapsible[data-change-tray-body] .raven-grab-change-list { margin-top: 8px; }
    .raven-grab-change-list { display: grid; gap: 6px; margin: 0 0 8px; padding: 0; list-style: none; }
    .raven-grab-change-row { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: 6px; min-height: 28px; color: var(--raven-grab-text); }
    .raven-grab-change-icon { color: var(--raven-grab-accent); font: 600 calc(11px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); text-align: center; }
    .raven-grab-change-copy { display: flex; min-width: 0; flex-direction: column; gap: 1px; font: 500 calc(10px * var(--raven-grab-font-scale))/1.2 var(--raven-grab-ui); }
    .raven-grab-change-copy span { overflow: hidden; color: var(--raven-grab-muted); font: 400 calc(9px * var(--raven-grab-font-scale))/1.2 var(--raven-grab-mono); text-overflow: ellipsis; white-space: nowrap; }
    .raven-grab-change-status { color: var(--raven-grab-muted); font: 500 calc(9px * var(--raven-grab-font-scale))/1.2 var(--raven-grab-ui); white-space: nowrap; }
    .raven-grab-change-row[data-local="true"] .raven-grab-change-copy strong, .raven-grab-change-row[data-local="true"] .raven-grab-change-status { color: var(--raven-grab-accent); }
    .raven-grab-change-row[data-local="false"] .raven-grab-change-copy strong { color: var(--raven-grab-muted); }
    .raven-grab-change-row[data-error="true"] .raven-grab-change-copy strong, .raven-grab-change-row[data-error="true"] .raven-grab-change-status { color: var(--raven-grab-error); }
    .raven-grab-change-control { min-height: 28px; padding: 0 6px; color: var(--raven-grab-accent); background: transparent; border: 0; border-radius: 5px; cursor: pointer; font: 500 calc(9px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    .raven-grab-change-control:hover { background: rgba(0,191,255,.08); }
    .raven-grab-apply-changes { width: 100%; min-height: 34px; padding: 7px 10px; color: #0a1018; background: var(--raven-grab-accent); border: 0; border-radius: 999px; cursor: pointer; font: 600 calc(11px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    .raven-grab-apply-changes:hover { background: var(--raven-grab-accent-hover); }
    .raven-grab-request-hint { display: flex; align-items: flex-start; gap: 6px; margin: 0 0 8px; color: var(--raven-grab-muted); font: 400 calc(11px * var(--raven-grab-font-scale))/1.35 var(--raven-grab-ui); }
    .raven-grab-request-hint-dismiss { flex: 0 0 auto; margin: -4px -4px -4px 0; padding: 4px; color: var(--raven-grab-muted); background: transparent; border: 0; cursor: pointer; font: 400 calc(14px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); }
    .raven-grab-request-hint-dismiss:hover { color: var(--raven-grab-text); }
    .raven-grab-send {
      position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 44px; min-height: 0; margin: 0 auto; padding: 12px 28px;
      overflow: hidden; border: 0 solid transparent; border-radius: 9999px; color: #0a1018;
      background: var(--raven-grab-accent); cursor: pointer;
      font: 600 calc(14px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui);
      box-shadow: 0 4px 20px rgba(0, 191, 255, .4);
      transition: width 250ms ease-in, height 250ms ease-in, background 250ms ease-in, border-radius 250ms ease-in, border-color 250ms ease-in, box-shadow 250ms ease-in, color 250ms ease-in, padding 250ms ease-in, transform 150ms cubic-bezier(.16, 1, .3, 1);
    }
    .raven-grab-send[data-send-state="default"]:hover { background: var(--raven-grab-accent-hover); transform: translateY(-2px); }
    /* The send button holds one size through the whole morph — never shrinks to a dot or a
       circle, never resizes to fit the sent message. Only fill, colour and contents change,
       so the panel's primary action stays put instead of collapsing and springing back. */
    .raven-grab-send[data-send-state="collapse"], .raven-grab-send[data-send-state="dot"] {
      width: 100%; height: 44px; padding: 12px 28px; color: transparent; background: #00BFFF;
      border: 0; border-radius: 9999px; box-shadow: none;
    }
    .raven-grab-send[data-send-state="collapse"] .raven-grab-send-label {
      opacity: 0; clip-path: inset(0 50%); transition: opacity 180ms ease-in, clip-path 250ms ease-in;
    }
    .raven-grab-send[data-send-state="trace"] {
      width: 100%; height: 44px; padding: 0; color: #00BFFF; background: transparent;
      border: 0; border-radius: 9999px; box-shadow: none;
    }
    .raven-grab-send[data-send-state="sent"] {
      width: 100%; height: 44px; padding: 0; color: #00BFFF;
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
    .raven-grab-sent-message { color: #00BFFF; font: 600 calc(14px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); clip-path: inset(0 100% 0 0); animation: raven-grab-print 500ms linear forwards; }
    /* The SVG stroke exists only to draw the border in; it must yield to the
       real CSS border as raven-grab-static-border lands, or the two strokes
       stack as a permanent double outline. */
    .raven-grab-border-trace { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; animation: raven-grab-trace-fade 500ms ease forwards; }
    .raven-grab-border-trace rect { fill: none; stroke: #00BFFF; stroke-width: 1; stroke-dasharray: 1; stroke-dashoffset: 1; animation: raven-grab-trace-border 500ms ease-out forwards; }
    @keyframes raven-grab-print { to { clip-path: inset(0 0 0 0); } }
    @keyframes raven-grab-trace-border { to { stroke-dashoffset: 0; } }
    @keyframes raven-grab-trace-fade { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes raven-grab-static-border { 0%, 85% { border-color: transparent; } 100% { border-color: #00BFFF; } }
    .raven-grab-send:focus-visible { outline: 3px solid rgba(0, 191, 255, .35); outline-offset: 2px; }
    .raven-grab-send:disabled { cursor: not-allowed; opacity: .5; transform: none; box-shadow: none; }
    .raven-grab-send:not([data-send-state="default"]):disabled { opacity: 1; }
    .raven-grab-status { min-height: 18px; margin: 8px 2px 0; color: var(--raven-grab-tertiary); font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-ui); text-align: center; }
    .raven-grab-status a { color: #00BFFF; text-decoration: underline; }
    .raven-grab-status[data-kind="error"] { color: var(--raven-grab-error); }
    .raven-grab-status[data-kind="success"] { color: #00E676; }
    .raven-grab-status[data-kind="sr-only"] { position: absolute; width: 1px; height: 1px; min-height: 0; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .raven-grab-edge-tab {
      position: fixed; right: 0; top: 33px; display: none; align-items: center; justify-content: center; z-index: 2;
      width: 44px; min-height: 44px; padding: 0; pointer-events: auto; cursor: pointer;
      color: var(--raven-grab-accent); background: rgba(22, 44, 66, .9); border: 1px solid var(--raven-grab-accent); border-right: 0; border-radius: 12px 0 0 12px;
      backdrop-filter: blur(12px); font: 500 calc(24px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); box-shadow: 0 8px 24px rgba(0, 0, 0, .3);
    }
    .raven-grab-edge-tab[data-side="left"] { right: auto; left: 0; border-right: 1px solid var(--raven-grab-accent); border-left: 0; border-radius: 0 12px 12px 0; }
    .raven-grab-edge-tab[aria-hidden="false"] { display: flex; }
    .raven-grab-edge-tab:hover { background: rgba(22, 44, 66, 1); }
    .raven-grab-edge-tab:focus-visible { outline: 3px solid rgba(0, 191, 255, .35); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; }
      .raven-grab-panel, .raven-grab-send, .raven-grab-textarea { transition: none !important; }
      /* Separate rule rather than a fourth selector on the line above: that line is
         pinned byte-for-byte by a regression guard, and loosening the guard to admit
         new code defeats the guard. New reduced-motion clamps go here. */
      .raven-grab-sheet-handle::before { transition: none !important; }
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
  var panelPresetTooltip = document.createElement("div");
  panelPresetTooltip.className = "raven-grab-panel-preset-tip";
  panelPresetTooltip.setAttribute("aria-hidden", "true");
  var settingsModal = document.createElement("div");
  settingsModal.className = "raven-grab-settings-modal";
  settingsModal.setAttribute("data-raven-grab-settings-modal", "");
  settingsModal.hidden = true;
  var panel = document.createElement("aside");
  panel.className = "raven-grab-panel";
  panel.setAttribute("aria-label", "Raven Design selection");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("data-collapsed", collapsedSides.right ? "true" : "false");
  if (collapsedSides.right) panel.setAttribute("inert", "");
  var panelLeft = document.createElement("aside");
  panelLeft.className = "raven-grab-panel";
  panelLeft.setAttribute("data-side", "left");
  panelLeft.setAttribute("aria-label", "Raven structure");
  panelLeft.setAttribute("aria-hidden", "true");
  panelLeft.setAttribute("data-collapsed", collapsedSides.left ? "true" : "false");
  if (collapsedSides.left) panelLeft.setAttribute("inert", "");
  var globalActions = document.createElement("div");
  globalActions.className = "raven-grab-global-actions";
  globalActions.setAttribute("data-raven-grab-global-actions", "");
  // Left-rail dock for Assets CTAs only — Send change stays pinned on the right.
  var structureActions = document.createElement("div");
  structureActions.className = "raven-grab-global-actions";
  structureActions.setAttribute("data-raven-grab-global-actions", "");
  structureActions.setAttribute("data-side", "left");
  var panels = [panel, panelLeft];
  function sideOf(el) { return el === panelLeft ? "left" : "right"; }
  function mobileSheetMode() { return mobileSheetViewport; }
  function mobileTabbedSheetMode() { return mobileSheetMode() && !simpleMode(); }
  function layerPanel() { return mobileTabbedSheetMode() ? panel : panelLeft; }
  function onPanels(type, handler) {
    for (var i = 0; i < panels.length; i++) panels[i].addEventListener(type, handler);
  }
  function panelQuery(selector) {
    return panel["querySelector"](selector) || panelLeft["querySelector"](selector);
  }
  function panelQueryAll(selector) {
    var a = panel["querySelectorAll"](selector);
    var b = panelLeft["querySelectorAll"](selector);
    var out = [];
    var i;
    for (i = 0; i < a.length; i++) out.push(a[i]);
    for (i = 0; i < b.length; i++) out.push(b[i]);
    return out;
  }
  // Figma/Chrome-style panel icon: three stacked lines + a caret pointing `dir`.
  function panelIconSvg(dir) {
    var caret = dir === "left" ? '<polyline points="13.5,5 10.5,8 13.5,11"/>' : '<polyline points="10.5,5 13.5,8 10.5,11"/>';
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="2.5" y1="4.5" x2="8" y2="4.5"/><line x1="2.5" y1="8" x2="8" y2="8"/><line x1="2.5" y1="11.5" x2="8" y2="11.5"/>' + caret + "</svg>";
  }
  // Phosphor LinkBreak — Figma-style "detach token" affordance.
  function linkBreakSvg() {
    return '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
      '<path d="M198.63,57.37a32,32,0,0,0-45.19-.06L141.79,69.52a8,8,0,0,1-11.58-11l11.72-12.29a1.59,1.59,0,0,1,.13-.13,48,48,0,0,1,67.88,67.88,1.59,1.59,0,0,1-.13.13l-12.29,11.72a8,8,0,0,1-11-11.58l12.21-11.65A32,32,0,0,0,198.63,57.37ZM114.21,186.48l-11.65,12.21a32,32,0,0,1-45.25-45.25l12.21-11.65a8,8,0,0,0-11-11.58L46.19,141.93a1.59,1.59,0,0,0-.13.13,48,48,0,0,0,67.88,67.88,1.59,1.59,0,0,0,.13-.13l11.72-12.29a8,8,0,1,0-11.58-11ZM216,152H192a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16ZM40,104H64a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm120,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V192A8,8,0,0,0,160,184ZM96,72a8,8,0,0,0,8-8V40a8,8,0,0,0-16,0V64A8,8,0,0,0,96,72Z"/>' +
      '</svg>';
  }
  function variableGlyphSvg() {
    return '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
      '<rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/>' +
      '<rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg>';
  }
  function makeEdgeTab(side) {
    var tab = document.createElement("button");
    tab.className = "raven-grab-edge-tab";
    tab.type = "button";
    if (side === "left") tab.setAttribute("data-side", "left");
    tab.innerHTML = panelIconSvg(side === "left" ? "right" : "left");
    tab.setAttribute("aria-label", side === "left" ? "Expand Raven Design panel" : "Expand design panel");
    tab.setAttribute("aria-hidden", collapsedSides[side] ? "false" : "true");
    return tab;
  }
  var edgeTab = makeEdgeTab("right");
  var edgeTabLeft = makeEdgeTab("left");
  var edgeTabs = [edgeTab, edgeTabLeft];
  function setEdgeTabsHidden(hidden) {
    for (var i = 0; i < edgeTabs.length; i++) edgeTabs[i].setAttribute("aria-hidden", hidden ? "true" : "false");
  }
  shadow.appendChild(style);
  shadow.appendChild(highlight);
  shadow.appendChild(label);
  shadow.appendChild(panelPresetTooltip);
  shadow.appendChild(settingsModal);
  shadow.appendChild(panel);
  shadow.appendChild(panelLeft);
  shadow.appendChild(edgeTab);
  shadow.appendChild(edgeTabLeft);

  var armed = true;
  function panelPresetKey() {
    return collapsedSides.left && collapsedSides.right ? "page" : collapsedSides.left ? "right" : collapsedSides.right ? "left" : "both";
  }
  // Each tile draws the layout it produces: a solid bar for a panel that stays open,
  // a faded one for a panel it collapses.
  // Only the both/page pair has a key: Cmd+. toggles between them. Left-only and
  // right-only are click-or-arrow-key, so their tooltip shows no chord rather than
  // teaching one that does not exist.
  var PANEL_PRESETS = [
    { key: "both", left: false, right: false, label: "Open both", chord: true },
    { key: "left", left: false, right: true, label: "Show left only" },
    { key: "right", left: true, right: false, label: "Show right only" },
    { key: "page", left: true, right: true, label: "Close both", chord: true }
  ];
  var PANEL_TOGGLE_CHORD = /Mac|iPhone|iPad/.test((navigator.platform || navigator.userAgent) + "") ? "⌘ ." : "Ctrl .";
  function panelPresetsMarkup() {
    var key = panelPresetKey();
    var markup = '<div class="raven-grab-panel-presets" role="radiogroup" aria-label="Panel layout">';
    for (var i = 0; i < PANEL_PRESETS.length; i++) {
      var preset = PANEL_PRESETS[i];
      var checked = preset.key === key;
      markup += '<button class="raven-grab-panel-preset" type="button" role="radio"' +
        ' data-panel-preset="' + preset.key + '" aria-checked="' + (checked ? "true" : "false") + '"' +
        // Roving tabindex: the group is one tab stop and the arrow keys move within it,
        // which is what a radiogroup is expected to do.
        ' tabindex="' + (checked ? "0" : "-1") + '" aria-label="' + preset.label + '">' +
        '<span class="raven-grab-panel-preset-left' + (preset.left ? " raven-grab-panel-preset-hidden" : "") + '"></span>' +
        '<span class="raven-grab-panel-preset-right' + (preset.right ? " raven-grab-panel-preset-hidden" : "") + '"></span>' +
        // aria-hidden: the button already carries this text as its aria-label, so an
        // exposed tooltip would make a screen reader read the layout name twice.
        '<span class="raven-grab-panel-preset-tip-source" aria-hidden="true">' + escapeHtml(preset.label) +
        (preset.chord ? '<kbd>' + escapeHtml(PANEL_TOGGLE_CHORD) + '</kbd>' : '') +
        '</span>' +
        '</button>';
    }
    return markup + '</div>';
  }
  var activePanelPresetTooltipTrigger = null;
  function hidePanelPresetTooltip() {
    activePanelPresetTooltipTrigger = null;
    panelPresetTooltip.setAttribute("data-visible", "false");
  }
  function showPanelPresetTooltip(trigger) {
    if (!trigger || typeof trigger.getBoundingClientRect !== "function") return;
    var source = typeof trigger.querySelector === "function" ? trigger.querySelector(".raven-grab-panel-preset-tip-source") : null;
    if (!source) return;
    panelPresetTooltip.innerHTML = source.innerHTML;
    panelPresetTooltip.setAttribute("data-visible", "false");
    var triggerRect = trigger.getBoundingClientRect();
    var triggerCenter = triggerRect.left + triggerRect.width / 2;
    panelPresetTooltip.style.left = triggerCenter + "px";
    panelPresetTooltip.style.top = "0px";
    var tooltipRect = panelPresetTooltip.getBoundingClientRect();
    var gap = 7;
    var edge = 4;
    // These tips never wrap. Wrapping was the reason "always above" could fail: a
    // two-line tip is ~48px tall and the panel tiles sit ~39px from the top of the
    // viewport, so it had nowhere to go but on top of the tile it described. One line
    // is ~33px and always fits. The old approach -- narrowing max-width near a screen
    // edge to keep the tail centred -- is what forced the wrap in the first place, so
    // the tip now keeps its natural width and its POSITION is clamped instead, with
    // the tail tracking the trigger so it still points at the right tile.
    var half = tooltipRect.width / 2;
    var center = Math.min(Math.max(triggerCenter, half + edge), window.innerWidth - half - edge);
    panelPresetTooltip.style.left = center + "px";
    panelPresetTooltip.style.setProperty("--raven-grab-tip-tail", (triggerCenter - (center - half)) + "px");
    // ALWAYS above (Andrew, 2026-07-19): the mouse pointer's own bitmap extends DOWN
    // and to the right from the hotspot, so a tooltip placed below sits under the
    // cursor that summoned it.
    panelPresetTooltip.setAttribute("data-placement", "above");
    panelPresetTooltip.style.top = Math.max(2, triggerRect.top - tooltipRect.height - gap) + "px";
    activePanelPresetTooltipTrigger = trigger;
    panelPresetTooltip.setAttribute("data-visible", "true");
  }
  // Case-insensitive on purpose: userAgentData.platform reports "macOS" (lowercase m)
  // while navigator.platform reports "MacIntel". A /Mac/ test matches the second and
  // misses the first, which put "Ctrl K" on every Chrome-based Mac.
  var platformName = navigator.userAgentData && navigator.userAgentData.platform ? navigator.userAgentData.platform : (navigator.platform || navigator.userAgent || "");
  var SETTINGS_CHORD = /mac|iphone|ipad|darwin/i.test(String(platformName)) ? "⌘K" : "Ctrl K";
  var SETTINGS_SECTIONS = [
    { id: "settings", label: "Settings" },
    { id: "shortcuts", label: "Shortcuts" },
    { id: "feedback", label: "Feedback" }
  ];
  var MAC_PLATFORM = /mac|iphone|ipad|darwin/i.test(String(navigator.userAgentData && navigator.userAgentData.platform ? navigator.userAgentData.platform : (navigator.platform || navigator.userAgent || "")));
  // Every shortcut the overlay listens for. They were all undiscoverable until this
  // list existed -- nothing in the UI named them.
  var SHORTCUTS = [
    { keys: "Alt G", what: "Arm or pause grab" },
    { keys: "Click", what: "Select the element under the cursor" },
    { keys: "Alt click", what: "Select the parent of that element instead" },
    { keys: "Shift click", what: "Add an element to the selection" },
    { keys: MAC_PLATFORM ? "⌘ K" : "Ctrl K", what: "Open these settings (while focus is in Raven)" },
    { keys: MAC_PLATFORM ? "⌘ ." : "Ctrl .", what: "Show or hide the panels (while grab is armed)" },
    { keys: "Esc", what: "Close this dialog" }
  ];
  function shortcutsMarkup() {
    var rows = "";
    for (var i = 0; i < SHORTCUTS.length; i++) {
      rows += "<dt><kbd>" + escapeHtml(SHORTCUTS[i].keys) + "</kbd></dt><dd>" + escapeHtml(SHORTCUTS[i].what) + "</dd>";
    }
    return '<dl class="raven-grab-shortcut-list">' + rows + "</dl>";
  }
  // A native <select> opens OS chrome that renders outside the page. Over a fixed
  // overlay on someone else's dev server that popup swallows the option click and the
  // grab highlight keeps chasing the cursor underneath it. Two choices don't need a
  // menu anyway -- this is the same segmented control the panel presets already use,
  // and its click never leaves the shadow root.
  function settingsChoiceMarkup(id, label, hint, attr, options, current) {
    var opts = "";
    for (var i = 0; i < options.length; i++) {
      var on = options[i].value === current;
      opts += '<button class="raven-grab-settings-choice" type="button" role="radio" aria-checked="' +
        (on ? "true" : "false") + '"' + (on ? ' data-on="true"' : "") + " " + attr + '="' +
        options[i].value + '">' + escapeHtml(options[i].label) + "</button>";
    }
    return '<div class="raven-grab-settings-row"><span id="' + id + '">' + escapeHtml(label) +
      (hint ? '<span class="raven-grab-hint">' + escapeHtml(hint) + "</span>" : "") + "</span>" +
      '<div class="raven-grab-settings-choices" role="radiogroup" aria-labelledby="' + id + '">' + opts + "</div></div>";
  }
  function modeControlMarkup() {
    return settingsChoiceMarkup("raven-grab-mode-select", "Panels",
      "Full gives you design and structure. Simple is one panel: grab an element, say what to change, send.",
      "data-overlay-mode",
      [{ value: "full", label: "Full" }, { value: "simple", label: "Simple" }],
      overlayMode);
  }
  function startupControlMarkup() {
    return settingsChoiceMarkup("raven-grab-startup-select", "On page load",
      "Closed hands the page back: grab arms when you open a panel.",
      "data-startup-state",
      [{ value: "open", label: "Open" }, { value: "collapsed", label: "Closed" }],
      startupState);
  }
  function panelFontControlMarkup() {
    return '<div class="raven-grab-settings-row"><label for="raven-grab-panel-font">Panel text size</label>' +
      '<div class="raven-grab-font-stepper">' +
        '<button type="button" data-panel-font-step="-' + PANEL_FONT_SCALE_STEP + '" aria-label="Decrease panel text size">−</button>' +
        '<input id="raven-grab-panel-font" type="number" data-panel-font-size min="' + PANEL_FONT_SCALE_MIN + '" max="' + PANEL_FONT_SCALE_MAX + '" step="' + PANEL_FONT_SCALE_STEP + '" value="' + panelFontScale + '" aria-label="Panel text size percent">' +
        '<span class="raven-grab-font-suffix" aria-hidden="true">%</span>' +
        '<button type="button" data-panel-font-step="' + PANEL_FONT_SCALE_STEP + '" aria-label="Increase panel text size">+</button>' +
      '</div></div>';
  }
  function settingsModalMarkup() {
    var nav = '<p class="raven-grab-settings-nav-label">Raven</p>';
    for (var i = 0; i < SETTINGS_SECTIONS.length; i++) {
      var section = SETTINGS_SECTIONS[i];
      nav += '<button type="button" role="tab" data-settings-section="' + section.id + '" aria-selected="' + (settingsModalSection === section.id ? "true" : "false") + '">' + escapeHtml(section.label) + '</button>';
    }
    return '<div class="raven-grab-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="raven-grab-settings-title">' +
      '<button class="raven-grab-settings-close" type="button" data-settings-close aria-label="Close Raven settings">×</button>' +
      '<nav class="raven-grab-settings-nav" role="tablist" aria-label="Raven settings sections">' + nav + '</nav>' +
      '<section class="raven-grab-settings-pane" data-settings-pane="settings"><h2 id="raven-grab-settings-title">Settings</h2>' + modeControlMarkup() + startupControlMarkup() + panelFontControlMarkup() + '</section>' +
      '<section class="raven-grab-settings-pane" data-settings-pane="shortcuts" hidden><h2>Shortcuts</h2>' + shortcutsMarkup() + '</section>' +
      '<section class="raven-grab-settings-pane" data-settings-pane="feedback" hidden><h2>Feedback</h2>' +
        '<p class="raven-grab-feedback-copy">Tell us what is wrong or missing. We send your message, the Raven version, and your viewport size — nothing else from this page.</p>' +
        '<form class="raven-grab-feedback-form" data-feedback-form>' +
          '<label class="raven-grab-feedback-field">Message<textarea name="message" maxlength="5000" required></textarea></label>' +
          '<label class="raven-grab-feedback-field">Email (optional, so we can reply)<input name="email" type="email" autocomplete="email"></label>' +
          // Off by default. Grab runs on other people's dev servers, where a path like
          // /admin/unreleased-feature is itself product information. Opt-in, and the
          // label states the exact URL being attached rather than describing it.
          '<label class="raven-grab-feedback-consent"><input name="includePage" type="checkbox" data-feedback-include-page>' +
            'Include the page address and title (' + escapeHtml(location.href) + ' — ' + escapeHtml(projectName) + ')</label>' +
          '<div class="raven-grab-feedback-actions"><p class="raven-grab-feedback-status" data-feedback-status aria-live="polite"></p><button class="raven-grab-feedback-send" type="submit">Send</button></div>' +
        '</form>' +
      '</section>' +
    '</div>';
  }
  settingsModal.innerHTML = settingsModalMarkup();
  function syncSettingsModalSection() {
    var known = false;
    for (var s = 0; s < SETTINGS_SECTIONS.length; s++) if (SETTINGS_SECTIONS[s].id === settingsModalSection) known = true;
    if (!known) settingsModalSection = "settings";
    var tabs = settingsModal.querySelectorAll('[data-settings-section]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute("aria-selected", tabs[i].getAttribute("data-settings-section") === settingsModalSection ? "true" : "false");
    }
    var panes = settingsModal.querySelectorAll('[data-settings-pane]');
    for (var j = 0; j < panes.length; j++) panes[j].hidden = panes[j].getAttribute("data-settings-pane") !== settingsModalSection;
  }
  function settingsFocusables() {
    // select included: the mode and startup controls are selects, and leaving them out
    // made Tab wrap to Close from the first one, skipping every control after it.
    var candidates = settingsModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    var visible = [];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i].getClientRects !== "function" || candidates[i].getClientRects().length) visible.push(candidates[i]);
    }
    return visible;
  }
  function openSettingsModal(trigger) {
    if (settingsModalOpen) return;
    settingsModalOpen = true;
    // Both panels carry a trigger and CSS hides one; returning focus to the hidden
    // one drops focus to the body, so pick the panel that currently owns the gear.
    var footerHost = host.getAttribute("data-settings-home") === "right" ? panel : panelLeft;
    var footerTrigger = footerHost && typeof footerHost.querySelector === "function" ? footerHost.querySelector("[data-settings-open]") : null;
    settingsReturnFocus = trigger && typeof trigger.focus === "function" ? trigger : (footerTrigger || shadow.activeElement || null);
    settingsModal.hidden = false;
    syncSettingsModalSection();
    var first = settingsModal.querySelector('[data-settings-close]') || settingsModal.querySelector('button');
    if (first && typeof first.focus === "function") first.focus();
  }
  function closeSettingsModal() {
    if (!settingsModalOpen) return;
    settingsModalOpen = false;
    settingsModal.hidden = true;
    var returnTarget = settingsReturnFocus;
    settingsReturnFocus = null;
    if (returnTarget && returnTarget.isConnected !== false && typeof returnTarget.focus === "function") returnTarget.focus();
  }
  function toggleSettingsModal(trigger) {
    if (settingsModalOpen) closeSettingsModal();
    else openSettingsModal(trigger);
  }
  function isTypingTarget(target) {
    if (!target) return false;
    var tag = target.tagName ? String(target.tagName).toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable === true;
  }
  function feedbackEndpoint() {
    if (suppliedGrabConfig && suppliedGrabConfig.feedbackEndpoint) return String(suppliedGrabConfig.feedbackEndpoint);
    // Deliberately NOT the local bridge. Routing feedback through it sent the message
    // and the submitter's email to the user's own dev server whenever grab was
    // proxying, and turned the loopback bridge into an unauthenticated relay any
    // script on the host page could post through. Straight to the hosted endpoint;
    // self-hosters override with config.feedbackEndpoint.
    return "https://ravenmcp.ai/api/feedback";
  }
  // v is frozen into every published copy -- npm never recalls a version, so overlays
  // in the wild will POST this exact shape indefinitely. Bump it, never repurpose a field.
  // page/projectName are omitted unless the user ticked the consent box: both can carry
  // the name of something unreleased.
  function feedbackPayload(message, email, includePage) {
    var payload = {
      v: 1,
      message: message,
      email: email,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      ravenVersion: ravenVersion
    };
    if (includePage) {
      payload.page = location.href;
      payload.projectName = projectName;
    }
    return payload;
  }
  function submitFeedback(form) {
    var messageField = form && typeof form.querySelector === "function" ? form.querySelector('textarea[name="message"]') : null;
    var emailField = form && typeof form.querySelector === "function" ? form.querySelector('input[name="email"]') : null;
    var includePageField = form && typeof form.querySelector === "function" ? form.querySelector('[data-feedback-include-page]') : null;
    var status = form && typeof form.querySelector === "function" ? form.querySelector('[data-feedback-status]') : null;
    var send = form && typeof form.querySelector === "function" ? form.querySelector('button[type="submit"]') : null;
    var message = messageField && messageField.value ? String(messageField.value).trim() : "";
    var email = emailField && emailField.value ? String(emailField.value).trim() : "";
    if (!message) {
      if (status) { status.textContent = "Enter a message."; status.setAttribute("data-kind", "error"); }
      if (messageField && typeof messageField.focus === "function") messageField.focus();
      return Promise.resolve(false);
    }
    if (send) send.disabled = true;
    if (status) { status.textContent = "Sending…"; status.removeAttribute("data-kind"); }
    return fetch(feedbackEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedbackPayload(message, email, !!(includePageField && includePageField.checked)))
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (result) {
        if (!response.ok) throw new Error(result && result.error ? result.error : "Feedback delivery failed");
        if (result.delivered === false) {
          if (status) status.textContent = "Recorded, but not yet routed.";
          return false;
        }
        if (status) status.textContent = "Feedback sent.";
        if (messageField) messageField.value = "";
        return true;
      });
    }).catch(function () {
      if (status) { status.textContent = "Could not send feedback. Your message is still here."; status.setAttribute("data-kind", "error"); }
      return false;
    }).then(function (delivered) {
      if (send) send.disabled = false;
      return delivered;
    });
  }
  settingsModal.addEventListener("click", function (event) {
    if (event.target === settingsModal || (event.target.closest && event.target.closest('[data-settings-close]'))) {
      closeSettingsModal();
      return;
    }
    var nav = event.target.closest ? event.target.closest('[data-settings-section]') : null;
    if (!nav) return;
    // syncSettingsModalSection falls back to "settings" for anything unrecognised,
    // so the tab's own id is enough -- no per-section branch to keep in step here.
    settingsModalSection = nav.getAttribute("data-settings-section");
    syncSettingsModalSection();
    var heading = settingsModal.querySelector('[data-settings-pane="' + settingsModalSection + '"] h2');
    if (heading) heading.setAttribute("tabindex", "-1");
    if (heading && typeof heading.focus === "function") heading.focus();
  });
  settingsModal.addEventListener("submit", function (event) {
    var form = event.target && event.target.getAttribute && event.target.getAttribute("data-feedback-form") !== null ? event.target : null;
    if (!form) return;
    event.preventDefault();
    submitFeedback(form);
  });
  settingsModal.addEventListener("click", function (event) {
    var closest = event.target.closest ? event.target.closest.bind(event.target) : null;
    if (!closest) return;
    var fontStep = closest("[data-panel-font-step]");
    if (fontStep) { setPanelFontSize(panelFontScale + Number(fontStep.getAttribute("data-panel-font-step") || 0)); return; }
    var mode = closest("[data-overlay-mode]");
    if (mode) { if (setOverlayMode(mode.getAttribute("data-overlay-mode"))) markChoiceChosen(mode); return; }
    var startup = closest("[data-startup-state]");
    if (startup && setStartupState(startup.getAttribute("data-startup-state"))) markChoiceChosen(startup);
  });
  // The settings modal is not re-rendered by the setters, so the group it lives in
  // has to carry the new state itself.
  function markChoiceChosen(button) {
    var group = button.parentElement;
    if (!group) return;
    var buttons = group.querySelectorAll(".raven-grab-settings-choice");
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i] === button;
      buttons[i].setAttribute("aria-checked", on ? "true" : "false");
      if (on) buttons[i].setAttribute("data-on", "true");
      else buttons[i].removeAttribute("data-on");
    }
  }
  settingsModal.addEventListener("change", function (event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    if (target.getAttribute("data-panel-font-size") !== null) setPanelFontSize(target.value);
  });
  function panelPresetTrigger(target) {
    return target && typeof target.closest === "function" ? target.closest(".raven-grab-panel-preset") : null;
  }
  function syncPanelPresets() {
    var key = panelPresetKey();
    for (var panelIndex = 0; panelIndex < panels.length; panelIndex++) {
      if (!panels[panelIndex] || typeof panels[panelIndex].querySelectorAll !== "function") continue;
      var buttons = panels[panelIndex].querySelectorAll("[data-panel-preset]");
      for (var buttonIndex = 0; buttonIndex < buttons.length; buttonIndex++) {
        if (!buttons[buttonIndex] || typeof buttons[buttonIndex].getAttribute !== "function" || typeof buttons[buttonIndex].setAttribute !== "function") continue;
        var isChecked = buttons[buttonIndex].getAttribute("data-panel-preset") === key;
        buttons[buttonIndex].setAttribute("aria-checked", isChecked ? "true" : "false");
        buttons[buttonIndex].setAttribute("tabindex", isChecked ? "0" : "-1");
      }
    }
  }
  // Arrow keys move between tiles and pick as they go, per radiogroup convention.
  function movePanelPresetFocus(current, step) {
    var group = current.parentNode;
    if (!group || typeof group.querySelectorAll !== "function") return;
    var buttons = group.querySelectorAll("[data-panel-preset]");
    var index = -1;
    for (var i = 0; i < buttons.length; i++) if (buttons[i] === current) index = i;
    if (index < 0 || !buttons.length) return;
    var nextIndex = step === "home" ? 0
      : step === "end" ? buttons.length - 1
      : (index + step + buttons.length) % buttons.length;
    var next = buttons[nextIndex];
    if (!next) return;
    applyPanelPreset(next.getAttribute("data-panel-preset"));
    // Re-query after applying: collapsing a panel can re-render its header, which
    // would leave the pre-render node detached and unfocusable.
    var refreshed = group.querySelector('[data-panel-preset="' + next.getAttribute("data-panel-preset") + '"]') || next;
    // If the chosen preset collapsed this very panel, applyPanelPreset has already sent
    // focus to its edge tab. Pulling it back onto a tile inside a collapsed panel would
    // strand the keyboard, so leave it where it landed.
    var ownPanel = typeof refreshed.closest === "function" ? refreshed.closest(".raven-grab-panel") : null;
    if (ownPanel && ownPanel.getAttribute("data-collapsed") === "true") return;
    if (typeof refreshed.focus === "function") refreshed.focus();
  }
  // The gear lives in whichever panel is on screen. Left wins when both are open,
  // matching where it has always been; the right panel takes it over the moment the
  // left is collapsed, which is permanently true in simple mode.
  function syncSettingsHome() {
    // Simple mode hides the left panel in CSS whatever its collapse state, so the gear
    // must follow the right panel unconditionally there. Keying only off collapsedSides
    // stranded it: "Open both" (edge tab, ⌘.) uncollapses the left panel, which in
    // simple mode is invisible -- and every gear with it.
    var right = mobileSheetMode() || simpleMode() || (collapsedSides.left && !collapsedSides.right);
    host.setAttribute("data-settings-home", right ? "right" : "left");
  }
  syncSettingsHome();
  host.setAttribute("data-mode", overlayMode);
  function applyOverlayMode() {
    host.setAttribute("data-mode", overlayMode);
    // Simple mode owns the left panel's collapse state: it is gone while simple is
    // on, and comes back open when the user switches to full.
    setPanelCollapsed(panelLeft, simpleMode());
    if (simpleMode()) setPanelCollapsed(panel, false);
    renderPanel();
    // renderPanel replaces both panels' innerHTML, detaching the gear the modal is
    // holding as its return target. Closing would then focus a disconnected node and
    // drop focus to the body, so re-point it at the freshly rendered one.
    if (settingsModalOpen && settingsReturnFocus) {
      var home = host.getAttribute("data-settings-home") === "right" ? panel : panelLeft;
      settingsReturnFocus = home.querySelector("[data-settings-open]") || settingsReturnFocus;
    }
  }
  function setOverlayMode(next) {
    if (next !== "simple" && next !== "full") return false;
    overlayMode = next;
    try { window.localStorage.setItem("raven-grab-mode", next); } catch (storageError) { /* keep in-memory */ }
    applyOverlayMode();
    return true;
  }
  function setStartupState(next) {
    if (next !== "open" && next !== "collapsed") return false;
    startupState = next;
    try { window.localStorage.setItem("raven-grab-startup", next); } catch (storageError) { /* keep in-memory */ }
    return true;
  }
  function setMobileSheetDock(next) {
    if (next !== "bottom" && next !== "top") return false;
    mobileSheetDock = next;
    host.setAttribute("data-mobile-sheet-dock", next);
    panel.style.removeProperty("top");
    panel.style.removeProperty("bottom");
    try { window.localStorage.setItem("raven-grab-sheet-dock", next); } catch (storageError) { /* keep in-memory */ }
    syncMobileSheetEdgeTabs();
    return true;
  }
  function syncMobileSheetEdgeTabs() {
    if (mobileSheetMode()) {
      edgeTab.setAttribute("aria-hidden", "true");
      edgeTabLeft.style.removeProperty("top");
      edgeTabLeft.style.removeProperty("bottom");
      edgeTabLeft.setAttribute("aria-hidden", mobileSheetSnap === "full" && !collapsedSides.right ? "true" : "false");
      edgeTabLeft.setAttribute("aria-label", collapsedSides.right ? "Expand Raven sheet" : "Collapse Raven sheet");
      edgeTabLeft.innerHTML = panelIconSvg(collapsedSides.right ? "right" : "left");
      return;
    }
    edgeTab.setAttribute("aria-hidden", collapsedSides.right ? "false" : "true");
    edgeTabLeft.setAttribute("aria-hidden", collapsedSides.left ? "false" : "true");
  }
  // Each panel collapses independently; its edge tab shows only while it is collapsed.
  function setPanelCollapsed(el, next) {
    // Reopening properties by any route retracts the dismissal, so selections
    // follow it again instead of staying silently opted out for the session.
    if (el === panel && !next) propertiesDismissed = false;
    if (next) hidePanelPresetTooltip();
    collapsedSides[sideOf(el)] = !!next;
    el.setAttribute("data-collapsed", next ? "true" : "false");
    el.setAttribute("aria-hidden", next ? "true" : "false");
    if (next) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
    syncMobileSheetEdgeTabs();
    if (!next) activeGlobalActionSurface = el === panelLeft ? activeTabB : activeTabA;
    else if (el === panel && !collapsedSides.left) activeGlobalActionSurface = activeTabB;
    else if (el === panelLeft && !collapsedSides.right) activeGlobalActionSurface = activeTabA;
    syncSettingsHome();
    syncPanelPresets();
    mountGlobalActions();
    // Collapsed = paused: secondary highlights/badges clear with the panels and
    // return when a panel reopens (paintSelectionOverlays self-gates on bothCollapsed).
    paintSelectionOverlays();
  }
  function setPanelsCollapsed(next) {
    for (var i = 0; i < panels.length; i++) setPanelCollapsed(panels[i], next);
  }
  function mobileSheetHeight(snap) {
    return snap === "full" ? Math.max(44, window.innerHeight - 24) : window.innerHeight / 2;
  }
  function setMobileSheetSnap(snap) {
    if (snap !== "collapsed" && snap !== "half" && snap !== "full") return;
    mobileSheetSnap = snap;
    if (snap === "collapsed") {
      setPanelsCollapsed(true);
      return;
    }
    panel.style.setProperty("--raven-grab-sheet-height", mobileSheetHeight(snap) + "px");
    setPanelsCollapsed(false);
  }
  function expandPanel() {
    setPanelsCollapsed(false);
    if (selectedElement) setHighlight(selectedElement);
  }
  // The old stacked mobile panels covered nearly the whole page, so selection
  // collapsed them. The half-height sheet leaves the canvas readable and keeps
  // the newly selected layer/styles visible without a second tap.
  function openPanel() {
    if (mobileSheetMode()) {
      setMobileSheetSnap("half");
      if (selectedElement) setHighlight(selectedElement);
    } else {
      // Respect a deliberate per-panel collapse, but a properties panel the user has
      // never closed is not a preference — it is just still shut. Selecting an element
      // with nowhere to show its tokens and styles is a dead end, so open it. With no
      // selection (a bare re-arm) there is nothing to show, so cold open stays collapsed.
      var holdRightCollapsed = propertiesDismissed || !selectedElement;
      setPanelCollapsed(panelLeft, collapsedSides.left);
      setPanelCollapsed(panel, holdRightCollapsed && collapsedSides.right);
      if (selectedElement) setHighlight(selectedElement);
    }
  }
  function collapsePanel(fromLeft) {
    var el = fromLeft ? panelLeft : panel;
    if (!armed || el.getAttribute("aria-hidden") === "true") return;
    if (!fromLeft) propertiesDismissed = true;
    setPanelCollapsed(el, true);
    var focusTab = fromLeft ? edgeTabLeft : edgeTab;
    if (typeof focusTab.focus === "function") focusTab.focus();
    if (bothCollapsed()) {
      hoveredElement = null;
      highlight.style.display = "none";
      label.style.display = "none";
    }
  }
  function applyPanelPreset(key) {
    if (key !== "both" && key !== "left" && key !== "right" && key !== "page") return;
    var leftCollapsed = key === "right" || key === "page";
    var rightCollapsed = key === "left" || key === "page";
    if (rightCollapsed) propertiesDismissed = true;
    // Where focus sits has to be read before the panels move, because collapsing the
    // panel that holds focus would otherwise strand the keyboard on an inert element.
    var focused = shadow.activeElement;
    var wasInLeft = !!(focused && panelLeft.contains(focused));
    var wasInRight = !!(focused && panel.contains(focused));
    setPanelCollapsed(panelLeft, leftCollapsed);
    setPanelCollapsed(panel, rightCollapsed);
    // Hand focus to the edge tab of the panel that just closed — the same place the
    // old collapse button sent it, and the control that brings the panel back.
    var focusTab = null;
    if (wasInLeft && leftCollapsed) focusTab = edgeTabLeft;
    else if (wasInRight && rightCollapsed) focusTab = edgeTab;
    if (focusTab && typeof focusTab.focus === "function") focusTab.focus();
  }
  // Cmd+. / Ctrl+. — Figma/Sketch convention: toggle both panels together.
  function togglePanels() {
    if (!armed) return;
    if (bothCollapsed()) expandPanel();
    else {
      propertiesDismissed = true;
      setPanelsCollapsed(true);
      hoveredElement = null;
      highlight.style.display = "none";
      label.style.display = "none";
    }
  }
  function setArmed(next) {
    armed = next;
    if (!armed) dismiss();
    else {
      openPanel();
      renderPanel();
    }
  }
  function bindEdgeTab(tab) {
    var dragged = false;
    tab.addEventListener("click", function (event) {
      event.stopPropagation();
      if (dragged) {
        dragged = false;
        return;
      }
      // Either tab opens BOTH panels (Andrew, 2026-07-19). Opening only the tab's own
      // side meant expanding one, then hunting for the other side's tab to expand it
      // too -- two deliberate acts for what is one intent, "show me Raven". The
      // layout tiles remain the way to get a single panel on purpose.
      var ownPanel = tab === edgeTabLeft ? panelLeft : panel;
      if (mobileSheetMode()) {
        if (collapsedSides.right) setMobileSheetSnap("half");
        else setMobileSheetSnap("collapsed");
        if (selectedElement) setHighlight(selectedElement);
        return;
      }
      setPanelsCollapsed(false);
      if (selectedElement) setHighlight(selectedElement);
      var activePreset = ownPanel && typeof ownPanel.querySelector === "function" ? ownPanel.querySelector('[data-panel-preset][aria-checked="true"]') : null;
      if (activePreset && typeof activePreset.focus === "function") activePreset.focus();
    });
    tab.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      // On mobile the tab is a dock-aware fixed target. Letting its desktop drag
      // affordance write an inline top would detach it from the clear page edge.
      if (mobileSheetMode()) return;
      var startY = event.clientY;
      var startTop = tab.getBoundingClientRect().top;
      var moved = false;
      function onMove(e) {
        var delta = e.clientY - startY;
        if (!moved && Math.abs(delta) < 4) return;
        moved = true;
        dragged = true;
        var top = Math.max(8, Math.min(startTop + delta, innerHeight - tab.offsetHeight - 8));
        tab.style.top = top + "px";
      }
      function onUp() {
        removeEventListener("pointermove", onMove, true);
        removeEventListener("pointerup", onUp, true);
      }
      addEventListener("pointermove", onMove, true);
      addEventListener("pointerup", onUp, true);
    });
  }
  bindEdgeTab(edgeTab);
  bindEdgeTab(edgeTabLeft);

  function clampPanelCoordinate(left, top, width, height) {
    return {
      left: Math.max(8, Math.min(left, innerWidth - width - 8)),
      top: Math.max(8, Math.min(top, innerHeight - height - 8))
    };
  }

  function placePanel(el, left, top, width, height) {
    var next = clampPanelCoordinate(left, top, width, height);
    el.__ravenPosition = { left: next.left, top: next.top, width: width, height: height };
    if (el === panel) panelPosition = el.__ravenPosition;
    el.style.right = "auto";
    el.style.left = next.left + "px";
    // Panels are pinned full-height (top/bottom 20px); drag moves them horizontally only.
  }

  function clampPanelToViewport() {
    if (mobileSheetMode()) return;
    var i;
    for (i = 0; i < panels.length; i++) {
      var el = panels[i];
      var pos = el.__ravenPosition;
      if (!pos) continue;
      var rect = collapsedSides[sideOf(el)] ? null : el.getBoundingClientRect();
      var width = rect && rect.width ? rect.width : pos.width;
      var height = rect && rect.height ? rect.height : pos.height;
      placePanel(el, pos.left, pos.top, width, height);
    }
  }

  function wirePanelDrag(el) {
    el.addEventListener("pointerdown", function (event) {
      var target = event.target && event.target.closest ? event.target : null;
      var header = target ? target.closest(".raven-grab-header") : null;
      if (!header || target.closest("button") || collapsedSides[sideOf(el)] || (event.button !== undefined && event.button !== 0)) return;
      var rect = el.getBoundingClientRect();
      panelDrag = {
        el: el,
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
      };
      el.setPointerCapture(event.pointerId);
      el.setAttribute("data-dragging", "true");
      if (event.preventDefault) event.preventDefault();
    });

    el.addEventListener("pointermove", function (event) {
      if (!panelDrag || panelDrag.el !== el || event.pointerId !== panelDrag.pointerId) return;
      placePanel(el, event.clientX - panelDrag.offsetX, event.clientY - panelDrag.offsetY, panelDrag.width, panelDrag.height);
    });

    function endPanelDrag(event) {
      if (!panelDrag || panelDrag.el !== el || event.pointerId !== panelDrag.pointerId) return;
      if (el.hasPointerCapture && el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      panelDrag = null;
      el.removeAttribute("data-dragging");
    }

    el.addEventListener("pointerup", endPanelDrag);
    el.addEventListener("pointercancel", endPanelDrag);
  }
  wirePanelDrag(panel);
  wirePanelDrag(panelLeft);

  // Pointer capture stays on the persistent panel while renderPanel replaces the
  // handle node beneath it, so a background refresh cannot strand an in-flight drag.
  function wireMobileSheetDrag() {
    panel.addEventListener("pointerdown", function (event) {
      var target = event.target && event.target.closest ? event.target.closest("[data-sheet-drag-handle]") : null;
      if (!target || !mobileSheetMode() || collapsedSides.right || (event.button !== undefined && event.button !== 0)) return;
      mobileSheetDrag = {
        pointerId: event.pointerId,
        offsetY: event.clientY - panel.getBoundingClientRect().top,
        startHeight: panel.getBoundingClientRect().height
      };
      panel.setPointerCapture(event.pointerId);
      panel.setAttribute("data-sheet-dragging", "true");
      edgeTabLeft.setAttribute("aria-hidden", "true");
      event.preventDefault();
    });
    panel.addEventListener("pointermove", function (event) {
      if (!mobileSheetDrag || event.pointerId !== mobileSheetDrag.pointerId) return;
      // Move the sheet as one object while the handle is held. Resizing from the
      // bottom could never cross the viewport midpoint: it only made the sheet
      // taller and kept covering the same page chrome.
      var nextTop = Math.max(0, Math.min(event.clientY - mobileSheetDrag.offsetY, window.innerHeight - mobileSheetDrag.startHeight));
      panel.style.top = nextTop + "px";
      panel.style.bottom = "auto";
    });
    function endMobileSheetDrag(event) {
      if (!mobileSheetDrag || event.pointerId !== mobileSheetDrag.pointerId) return;
      var height = panel.getBoundingClientRect().height;
      var targets = [
        { snap: "collapsed", height: 0 },
        { snap: "half", height: mobileSheetHeight("half") },
        { snap: "full", height: mobileSheetHeight("full") }
      ];
      var nearest = targets[0];
      for (var i = 1; i < targets.length; i++) {
        if (Math.abs(targets[i].height - height) < Math.abs(nearest.height - height)) nearest = targets[i];
      }
      var nextDock = panel.getBoundingClientRect().top + height / 2 < window.innerHeight / 2 ? "top" : "bottom";
      if (panel.hasPointerCapture && panel.hasPointerCapture(event.pointerId)) panel.releasePointerCapture(event.pointerId);
      mobileSheetDrag = null;
      panel.removeAttribute("data-sheet-dragging");
      setMobileSheetDock(nextDock);
      setMobileSheetSnap(nearest.snap);
    }
    panel.addEventListener("pointerup", endMobileSheetDrag);
    panel.addEventListener("pointercancel", endMobileSheetDrag);
  }
  wireMobileSheetDrag();

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

  // Tailwind / utility atoms are too broad for "All N like this" (e.g. span.inline-block → dozens).
  var UTILITY_CLASS_RE = /^(?:[mp][trblxyse]?|-[mp][trblxyse]?|[xy]|[mp]x|[mp]y|[wh]|min-[wh]|max-[wh]|size-|flex|inline|block|inline-block|inline-flex|grid|contents|hidden|visible|absolute|relative|fixed|sticky|static|top-|right-|bottom-|left-|inset-|z-|order-|grow|shrink|basis-|gap-|space-[xy]-|col-|row-|self-|items-|justify-|content-|place-|overflow-|object-|text-|font-|leading-|tracking-|align-|whitespace-|break-|truncate|rounded(?:-.+)?|border(?:-.+)?|bg-|from-|via-|to-|shadow(?:-.+)?|opacity-|ring(?:-.+)?|outline(?:-.+)?|transition(?:-.+)?|duration-|ease-|delay-|animate-|cursor-|pointer-events-|select-|resize-|sr-only|not-sr-only|container|prose|aspect-|p-|m-|px-|py-|pt-|pr-|pb-|pl-|mx-|my-|mt-|mr-|mb-|ml-|w-|h-|sm:|md:|lg:|xl:|2xl:)/;
  var COMPONENT_SCOPE_MATCH_CAP = 32;

  function isUtilityClassName(name) {
    var n = String(name || "");
    if (!n || n.indexOf("raven-grab-") === 0) return true;
    if (/^__/.test(n)) return true;
    if (UTILITY_CLASS_RE.test(n)) return true;
    // Responsive / state variants: md:flex, hover:bg-white
    if (/^(?:sm|md|lg|xl|2xl|hover|focus|active|disabled|group-hover):/.test(n)) return true;
    return false;
  }

  function distinctiveClassesFor(element) {
    return Array.prototype.slice.call(element.classList || []).map(function (name) {
      return String(name);
    }).filter(function (name) {
      return !isUtilityClassName(name);
    }).sort();
  }

  function componentNameFor(element, metadata) {
    if (metadata && metadata.componentName) return String(metadata.componentName);
    if (element && typeof element.getAttribute === "function") {
      var attr = element.getAttribute("data-raven-component");
      if (attr) return String(attr);
    }
    return "";
  }

  function sameTag(element, tag) {
    return !!element && element.nodeType === 1 && String(element.localName || "").toLowerCase() === tag;
  }

  function componentSignatureFor(element) {
    if (!element || element.nodeType !== 1) return null;
    var tag = String(element.localName || element.tagName || "").toLowerCase();
    if (!tag) return null;
    return { tag: tag, classes: distinctiveClassesFor(element) };
  }

  function componentSignaturesMatch(left, right) {
    if (!left || !right || left.tag !== right.tag || left.classes.length !== right.classes.length) return false;
    for (var i = 0; i < left.classes.length; i += 1) {
      if (left.classes[i] !== right.classes[i]) return false;
    }
    return true;
  }

  function componentScopeFor(element, metadata) {
    var signature = componentSignatureFor(element);
    if (!signature) return { matchSelector: "", matchCount: 0 };
    var componentName = componentNameFor(element, metadata);
    var hasComponentAttr = !!(element && typeof element.getAttribute === "function" && element.getAttribute("data-raven-component"));
    // Named component attribute is authoritative. A class-less element (bare
    // <h2>/<blockquote>/<li> in hand-written semantic markup) can't open a
    // document-wide tag set — "every <p> on the page" — so instead scope it to
    // same-signature siblings under the SAME parent. That makes "All siblings"
    // work for content HTML while staying bounded: a tag match never escapes
    // its parent, and the MATCH_CAP still applies.
    if (!hasComponentAttr && signature.classes.length === 0) {
      var parent = element.parentElement;
      var siblingCount = parent
        ? Array.prototype.filter.call(parent.children, function (child) {
            return sameTag(child, signature.tag);
          }).length
        : 0;
      if (!parent || siblingCount > COMPONENT_SCOPE_MATCH_CAP) {
        var emptyScope = { matchSelector: "", matchCount: 0 };
        if (parent) emptyScope.tooBroad = true;
        if (componentName) emptyScope.componentName = componentName;
        return emptyScope;
      }
      // matchSelector is a best-effort parent-qualified selector for the sent
      // payload; the local count/preview re-derives from parent.children (exact),
      // so an ambiguous parent selector never widens what we show or apply here.
      var parentSelector = stableSelector(parent);
      var siblingScope = {
        matchSelector: parentSelector ? parentSelector + " > " + signature.tag : signature.tag,
        matchCount: siblingCount,
        siblingScoped: true
      };
      if (componentName) siblingScope.componentName = componentName;
      return siblingScope;
    }
    var matchSelector;
    if (hasComponentAttr && componentName) {
      matchSelector = '[data-raven-component="' + String(componentName).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
    } else {
      matchSelector = signature.tag + signature.classes.map(function (name) {
        return "." + escapeCss(name);
      }).join("");
    }
    var candidates = [];
    try {
      candidates = Array.prototype.slice.call(document.querySelectorAll(matchSelector));
    } catch (error) {
      candidates = [];
    }
    var matchCount = candidates.filter(function (candidate) {
      if (!candidate || candidate.isConnected === false) return false;
      if (hasComponentAttr) {
        return componentNameFor(candidate, null) === componentName;
      }
      return componentSignaturesMatch(componentSignatureFor(candidate), signature);
    }).length;
    // Unsigned class signatures that match "too many" are unsafe on utility-heavy pages.
    if (!componentName && !hasComponentAttr && matchCount > COMPONENT_SCOPE_MATCH_CAP) {
      return { matchSelector: matchSelector, matchCount: 0, tooBroad: true };
    }
    var scope = { matchSelector: matchSelector, matchCount: matchCount };
    if (componentName) scope.componentName = componentName;
    return scope;
  }

  function selectionDisplayLabel(element, selection) {
    if (!element || element.nodeType !== 1) return (selection && selection.selector) || "";
    var componentName = (selection && selection.componentScope && selection.componentScope.componentName) || componentNameFor(element, null);
    var tag = String(element.localName || element.tagName || "").toLowerCase() || "element";
    var text = shortenedLayerText(element);
    if (componentName) return componentName + (text ? " · " + text : "");
    if (element.id) return tag + "#" + element.id + (text ? " · " + text : "");
    var classes = distinctiveClassesFor(element).slice(0, 2);
    if (classes.length) return tag + "." + classes.join(".") + (text ? " · " + text : "");
    if (text) return tag + " · " + text;
    return tag;
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
      stateStyles: interactiveStylesFor(element),
      componentScope: componentScopeFor(element, reactMetadata)
    };
  }

  function setHighlight(element) {
    // isConnected, not documentElement.contains(): contains() is light-DOM only and
    // reports false for every node inside a shadow root, which hid the highlight on
    // exactly the design-system components people most want to inspect.
    if (!element || element === host || typeof element.getBoundingClientRect !== "function" || !element.isConnected) {
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
    var label = selectionDisplayLabel(selectedElement, currentSelection) || selector;
    return writeClipboardText(selector).then(function () {
      chip.textContent = "Copied";
      chip.setAttribute("data-copied", "true");
      setTimeout(function () {
        chip.textContent = label;
        chip.setAttribute("data-copied", "false");
      }, 1200);
      return true;
    }).catch(function (error) {
      console.warn("[Raven Grab] Could not copy the element selector.", error);
      return false;
    });
  }

  function styleEditsForSend(edits) {
    var source = edits || styleEdits;
    return Object.keys(source).map(function (property) { return source[property]; });
  }

  function stateStyleEditsForSend(edits) {
    var source = edits || stateStyleEdits;
    return Object.keys(source).map(function (key) { return source[key]; });
  }

  function tokenPropertyMatches(tokenProperty, styleProperty) {
    if (!tokenProperty || !styleProperty) return false;
    if (tokenProperty === styleProperty) return true;
    var affected = affectedProperties(tokenProperty);
    for (var i = 0; i < affected.length; i += 1) {
      if (affected[i] === styleProperty) return true;
    }
    return false;
  }

  function normalizeIntentKey(index) {
    var key = String(index);
    if (/^\d+$/.test(key)) return Number(key);
    return key;
  }

  function resolveTokenByIntentKey(index) {
    if (index == null || !currentSelection) return null;
    var key = String(index);
    var stateMatch = key.match(/^([^:]+):(\d+)$/);
    if (stateMatch) {
      var state = stateMatch[1];
      var tokenIndex = Number(stateMatch[2]);
      var stateData = currentSelection.stateStyles && currentSelection.stateStyles[state];
      if (!stateData || !stateData.tokens) return null;
      return stateData.tokens[tokenIndex] || null;
    }
    if (!currentSelection.tokens) return null;
    return currentSelection.tokens[Number(key)] || null;
  }

  function stateStyleEditKey(state, property) {
    return String(state || "") + "|" + String(property || "");
  }

  function statePreviewStyleEl() {
    if (!document || typeof document.querySelector !== "function" || typeof document.createElement !== "function") return null;
    var existing = document.querySelector("[data-raven-grab-state-preview]");
    if (existing) return existing;
    if (typeof document.head === "undefined" || !document.head || typeof document.head.appendChild !== "function") return null;
    var styleEl = document.createElement("style");
    styleEl.setAttribute("data-raven-grab-state-preview", "");
    document.head.appendChild(styleEl);
    return styleEl;
  }

  // State previews must cover the whole multi-selection, not just the primary's
  // selector — a :hover edit with N siblings selected previews on all N.
  function statePreviewSelectors() {
    var selectors = [];
    if (currentSelection && currentSelection.selector) selectors.push(currentSelection.selector);
    styleApplicationTargets().concat(componentScopeSiblingElements()).forEach(function (element) {
      if (element === selectedElement) return;
      var selector = stableSelector(element);
      if (selector && selectors.indexOf(selector) === -1) selectors.push(selector);
    });
    return selectors;
  }

  function renderStatePreviewStyles() {
    var styleEl = statePreviewStyleEl();
    if (!styleEl) return;
    var selectors = statePreviewSelectors();
    if (!selectors.length) {
      styleEl.textContent = "";
      return;
    }
    function stateSelectorList(state) {
      return selectors.map(function (selector) { return selector + ":" + state; }).join(", ");
    }
    var rules = [];
    Object.keys(stateStyleEdits).forEach(function (key) {
      var edit = stateStyleEdits[key];
      if (!edit) return;
      rules.push(stateSelectorList(edit.state) + " { " + edit.property + ": " + edit.newValue + " !important; }");
    });
    if (activeStateStylePreview) {
      rules.push(stateSelectorList(activeStateStylePreview.state) + " { " + activeStateStylePreview.property + ": " + activeStateStylePreview.value + " !important; }");
    }
    styleEl.textContent = rules.join("\n");
  }

  function clearStateStylePreview() {
    activeStateStylePreview = null;
    renderStatePreviewStyles();
  }

  function previewStateStyleEdit(state, property, newValue) {
    if (!currentSelection || !currentSelection.selector) return false;
    if (window.CSS && typeof window.CSS.supports === "function" && !window.CSS.supports(property, newValue)) return false;
    activeStateStylePreview = { state: state, property: property, value: newValue };
    renderStatePreviewStyles();
    return true;
  }

  function commitStateStyleEdit(state, property, newValue, currentValue, tokenMeta) {
    var key = stateStyleEditKey(state, property);
    var existing = stateStyleEdits[key];
    var originalValue = existing ? existing.oldValue : currentValue;
    if (window.CSS && typeof window.CSS.supports === "function" && !window.CSS.supports(property, newValue)) return false;
    if (newValue === originalValue && !existing) return false;
    if (newValue === originalValue && existing) {
      delete stateStyleEdits[key];
    } else {
      stateStyleEdits[key] = { state: state, property: property, oldValue: originalValue, newValue: newValue };
      if (tokenMeta && tokenMeta.name) {
        stateStyleEdits[key].token = tokenMeta.name;
        stateStyleEdits[key].tokenPath = tokenMeta.path;
        if (tokenMeta.cssVar) stateStyleEdits[key].cssVar = tokenMeta.cssVar;
      }
    }
    clearStateStylePreview();
    renderStatePreviewStyles();
    syncActiveStyleDraftKey();
    return true;
  }

  function forceCommitStyleEdit(property, newValue) {
    var targets = styleApplicationTargets();
    if (!targets.length) return false;
    styleEditTarget = selectedElement;
    var resolved = styleEdits[property] ? styleEdits[property].oldValue : resolvedStyleValue(property);
    var originalValue = resolved;
    if (resolved === MIXED_STYLE_VALUE) {
      originalValue = computedStyleValueForElement(selectedElement, property)
        || (currentSelection && currentSelection.styles && currentSelection.styles[property])
        || "";
    }
    captureStyleOriginals(property, targets);
    setStyleOnTargets(property, newValue, targets);
    applyStyleToScopeSiblings(property, newValue);
    styleEdits[property] = { property: property, oldValue: originalValue, newValue: newValue };
    syncActiveStyleDraftKey();
    return true;
  }

  function forceCommitStateStyleEdit(state, property, newValue) {
    var key = stateStyleEditKey(state, property);
    var existing = stateStyleEdits[key];
    var stateData = currentSelection && currentSelection.stateStyles && currentSelection.stateStyles[state];
    var declarationValue = "";
    if (stateData && stateData.declarations) {
      for (var i = 0; i < stateData.declarations.length; i += 1) {
        if (stateData.declarations[i].property === property) {
          declarationValue = stateData.declarations[i].value;
          break;
        }
      }
    }
    var originalValue = existing ? existing.oldValue : declarationValue;
    stateStyleEdits[key] = { state: state, property: property, oldValue: originalValue, newValue: newValue };
    clearStateStylePreview();
    renderStatePreviewStyles();
    syncActiveStyleDraftKey();
    return true;
  }

  function tokenLinkedDisplayText(matched, rawValue) {
    if (!matched || !matched.token) return displayComputedStyleValue(rawValue);
    return matched.token.name + " · " + displayComputedStyleValue(matched.token.value || rawValue);
  }

  function tokenUnlinkButtonMarkup(property, state, intentKey) {
    var stateAttr = state ? ' data-style-state="' + escapeHtml(state) + '"' : "";
    return '<button type="button" class="raven-grab-token-unlink raven-grab-token-unlink-row" data-token-detach="' + escapeHtml(property) + '"' + stateAttr + ' data-token-intent-key="' + escapeHtml(String(intentKey)) + '" aria-label="Detach design token" title="Detach token">' + linkBreakSvg() + "</button>";
  }

  function tokenLinkedValueInnerMarkup(matched, rawValue, property, state) {
    if (!matched || !matched.token) return escapeHtml(displayComputedStyleValue(rawValue));
    var display = tokenLinkedDisplayText(matched, rawValue);
    return '<span class="raven-grab-token-value">' +
      '<span class="raven-grab-token-glyph">' + variableGlyphSvg() + "</span>" +
      '<span class="raven-grab-token-label">' + escapeHtml(display) + "</span>" +
      tokenUnlinkButtonMarkup(property, state, matched.index) +
      "</span>";
  }

  function buildStyleValueCell(property, value, styleState, matched, edited) {
    var cell = document.createElement("code");
    cell.setAttribute("data-style-value", "");
    cell.setAttribute("data-style-raw", value);
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", "Edit " + property);
    var showLinked = matched && matched.token && !edited;
    if (showLinked) cell.innerHTML = tokenLinkedValueInnerMarkup(matched, value, property, styleState);
    else cell.textContent = displayComputedStyleValue(value);
    return cell;
  }

  function styleValueDisplayMarkup(property, value, styleState, matched, edited, isMixed) {
    var display = isMixed ? MIXED_STYLE_VALUE : displayComputedStyleValue(value);
    var showLinked = !isMixed && !edited && matched && matched.token;
    if (showLinked) display = tokenLinkedDisplayText(matched, value);
    var inner = showLinked
      ? tokenLinkedValueInnerMarkup(matched, value, property, styleState)
      : escapeHtml(display);
    return inner;
  }

  function appendGroupedColorSuggestions(editor, property, previousValue, onPick, relatedInternal) {
    var suggestions = colorSuggestions(property, previousValue);
    if (!suggestions.length) return;
    var suggestionRow = document.createElement("div");
    suggestionRow.className = "raven-grab-color-suggestions";
    suggestionRow.setAttribute("aria-label", "Suggested colors");
    var lastSource = "";
    var currentGroup = null;
    suggestions.forEach(function (suggestion) {
      if (suggestion.source !== lastSource) {
        lastSource = suggestion.source;
        var caption = document.createElement("p");
        caption.className = "raven-grab-color-suggestion-caption";
        caption.textContent = suggestion.source === "token" ? "Tokens" : "On this page";
        currentGroup = document.createElement("div");
        currentGroup.className = "raven-grab-color-suggestion-group";
        currentGroup.appendChild(caption);
        suggestionRow.appendChild(currentGroup);
      }
      if (!currentGroup) return;
      var suggestionButton = document.createElement("button");
      suggestionButton.className = "raven-grab-color-suggestion";
      suggestionButton.type = "button";
      suggestionButton.style.setProperty("--swatch", suggestion.value);
      suggestionButton.setAttribute("data-color-suggestion", suggestion.value);
      suggestionButton.setAttribute("data-color-source", suggestion.source);
      suggestionButton.setAttribute("aria-label", suggestion.label);
      suggestionButton.setAttribute("title", suggestion.label);
      suggestionButton.addEventListener("mousedown", function (event) { event.preventDefault(); });
      suggestionButton.addEventListener("click", function () { onPick(suggestion.value, suggestion.token || null); });
      currentGroup.appendChild(suggestionButton);
      if (relatedInternal) relatedInternal.push(suggestionButton);
    });
    editor.appendChild(suggestionRow);
  }

  function scopedIntentForSend(intent, target, draftContext) {
    var scope = draftContext ? draftContext.editScope : editScope;
    var scopeTarget = target || selectedElement;
    var metadata = draftContext ? draftContext.reactMetadata : reactMetadata;
    var selection = draftContext ? draftContext.selection : currentSelection;
    if (scope !== "component") return intent;
    // The selection-time snapshot goes stale as the agent mutates the page —
    // resnapshot at send time so matchSelector/matchCount describe the live DOM.
    var componentScope = scopeTarget && scopeTarget.isConnected !== false
      ? componentScopeFor(scopeTarget, metadata)
      : selection && selection.componentScope;
    // The chip must never disclose a different scope than the payload carries —
    // sync the selection snapshot (and fall back to instance below two matches).
    if (selection) selection.componentScope = componentScope;
    if (!componentScope || componentScope.matchCount < 2) {
      if (draftContext) draftContext.editScope = "instance";
      else editScope = "instance";
      return intent;
    }
    var scoped = {};
    Object.keys(intent).forEach(function (key) { scoped[key] = intent[key]; });
    scoped.scope = "component";
    scoped.matchSelector = componentScope.matchSelector;
    scoped.matchCount = componentScope.matchCount;
    return scoped;
  }

  function localStyleDrafts() {
    return Object.keys(styleDrafts).map(function (key) { return styleDrafts[key]; }).sort(function (left, right) {
      return left.clientSequence - right.clientSequence;
    });
  }

  function styleDraftForElement(element) {
    var drafts = localStyleDrafts();
    for (var i = 0; i < drafts.length; i += 1) {
      if (drafts[i].target === element) return drafts[i];
    }
    return null;
  }

  function activeStyleDraft(force) {
    var hasWork = Object.keys(styleEdits).length > 0 || Object.keys(stateStyleEdits).length > 0 || Object.keys(tokenIntents).length > 0 || !!textEdit;
    if (!force && !hasWork && !instructionDraft.trim()) return null;
    ensureActiveStyleDraftKey();
    return {
      clientKey: activeStyleDraftKey,
      clientSequence: Number(String(activeStyleDraftKey).replace("style-draft-", "")) || styleDraftClientSequence,
      target: styleEditTarget || selectedElement,
      selector: currentSelection ? currentSelection.selector : "",
      selection: currentSelection,
      selectionElements: multiSelections.slice(),
      styleEdits: styleEdits,
      stateStyleEdits: stateStyleEdits,
      textEdit: textEdit,
      styleEditOriginalInline: styleEditOriginalInline,
      styleEditScopeSiblingsOriginal: styleEditScopeSiblingsOriginal,
      styleEditScopeSiblingsTarget: styleEditScopeSiblingsTarget,
      styleEditTarget: styleEditTarget,
      tokenIntents: tokenIntents,
      previewOriginals: previewOriginals,
      editScope: editScope,
      reactMetadata: reactMetadata,
      // The active draft's instruction lives in the shared box; capture it so a
      // stash (selection switch) persists it and a later activate restores it.
      instruction: instructionDraft
    };
  }

  function ensureActiveStyleDraftKey() {
    if (!activeStyleDraftKey) {
      styleDraftClientSequence += 1;
      activeStyleDraftKey = "style-draft-" + styleDraftClientSequence;
    }
    return activeStyleDraftKey;
  }

  function syncActiveStyleDraftKey() {
    if (Object.keys(styleEdits).length || Object.keys(stateStyleEdits).length || Object.keys(tokenIntents).length || textEdit) ensureActiveStyleDraftKey();
    else activeStyleDraftKey = null;
  }

  function clearActiveStyleDraftState() {
    tokenIntents = Object.create(null);
    styleEdits = Object.create(null);
    stateStyleEdits = Object.create(null);
    textEdit = null;
    activeStateStylePreview = null;
    styleEditOriginalInline = Object.create(null);
    styleEditScopeSiblingsOriginal = Object.create(null);
    styleEditScopeSiblingsTarget = null;
    styleEditTarget = null;
    previewOriginals = Object.create(null);
    activeStyleDraftKey = null;
    renderStatePreviewStyles();
  }

  function stashActiveStyleDraft() {
    if (!Object.keys(styleEdits).length && !Object.keys(stateStyleEdits).length && !Object.keys(tokenIntents).length && !textEdit && !instructionDraft.trim()) {
      activeStyleDraftKey = null;
      return null;
    }
    var draft = activeStyleDraft();
    styleDrafts[draft.clientKey] = draft;
    clearActiveStyleDraftState();
    return draft;
  }

  function activateStyleDraft(element) {
    var active = activeStyleDraft();
    if (active && active.target === element) return active;
    var draft = styleDraftForElement(element);
    clearActiveStyleDraftState();
    if (!draft) return null;
    delete styleDrafts[draft.clientKey];
    activeStyleDraftKey = draft.clientKey;
    styleEdits = draft.styleEdits;
    stateStyleEdits = draft.stateStyleEdits || Object.create(null);
    textEdit = draft.textEdit || null;
    styleEditOriginalInline = draft.styleEditOriginalInline;
    styleEditScopeSiblingsOriginal = draft.styleEditScopeSiblingsOriginal || Object.create(null);
    styleEditScopeSiblingsTarget = draft.styleEditScopeSiblingsTarget || null;
    styleEditTarget = draft.styleEditTarget;
    tokenIntents = draft.tokenIntents;
    previewOriginals = draft.previewOriginals;
    editScope = draft.editScope || "instance";
    reactMetadata = draft.reactMetadata || null;
    // Symmetric with stash: the draft's instruction (persisted by activeStyleDraft,
    // or carried from a rejected retry) moves back into the shared box, which is the
    // single home for the active draft's instruction. Consume it off the draft.
    if (draft.instruction != null) {
      instructionDraft = draft.instruction;
      delete draft.instruction;
    }
    // Stashing cleared the shared state-preview stylesheet; re-render it so a
    // reactivated draft's hover/focus edits preview again.
    renderStatePreviewStyles();
    return draft;
  }

  function restoreStyleOriginalEntries(property, original, fallbackTarget) {
    if (!original) return;
    var entries = Array.isArray(original)
      ? original
      : [{ element: fallbackTarget, value: original.value, priority: original.priority }];
    entries.forEach(function (entry) {
      if (!entry || !entry.element) return;
      if (entry.value) entry.element.style.setProperty(property, entry.value, entry.priority);
      else entry.element.style.removeProperty(property);
    });
  }

  function restoreStyleDraftPreview(draft, revertText) {
    if (!draft) return;
    // Copy edits are content the user is evaluating on the page — unlike a style preview,
    // the new text must STAY after Send/rebase (the whole point is "see what works"). Only a
    // genuine discard reverts it; callers that keep the copy pass revertText === false.
    if (revertText !== false && draft.textEdit && draft.textEdit.target && draft.textEdit.target.isConnected !== false) {
      draft.textEdit.target.textContent = draft.textEdit.oldText;
    }
    var target = draft.styleEditTarget || draft.target;
    Object.keys(draft.styleEditOriginalInline || {}).forEach(function (property) {
      restoreStyleOriginalEntries(property, draft.styleEditOriginalInline[property], target);
    });
    Object.keys(draft.previewOriginals || {}).forEach(function (cssVar) {
      restoreTokenPreviewEntries(cssVar, draft.previewOriginals[cssVar]);
    });
    var siblingOriginals = draft.styleEditScopeSiblingsOriginal;
    if (siblingOriginals) restoreStyleScopeSiblingOriginalStore(siblingOriginals);
    if (siblingOriginals === styleEditScopeSiblingsOriginal) {
      styleEditScopeSiblingsOriginal = Object.create(null);
      styleEditScopeSiblingsTarget = null;
    }
    draft.styleEditScopeSiblingsOriginal = Object.create(null);
    draft.styleEditScopeSiblingsTarget = null;
  }

  function dropStyleDraft(draft, restore) {
    if (!draft) return;
    if (restore) restoreStyleDraftPreview(draft);
    if (styleDrafts[draft.clientKey] === draft) delete styleDrafts[draft.clientKey];
    if (activeStyleDraftKey === draft.clientKey) clearActiveStyleDraftState();
  }

  function draftAwaitingReconnect(draft) {
    // A needsRecheck placeholder is deliberately held for a detached target to
    // reconnect and be retried later — the routine stale-draft sweep must not
    // drop it out from under a pending retry.
    return Object.keys(draft.styleEdits).some(function (property) { return !!draft.styleEdits[property].needsRecheck; }) ||
      Object.keys(draft.tokenIntents).some(function (key) { return !!draft.tokenIntents[key].needsRecheck; });
  }

  function clearAllStyleDrafts(restore) {
    // Restore the active buffer's inline state UNCONDITIONALLY (via the rollback
    // pair, which iterates styleEditOriginalInline/previewOriginals directly) so a
    // preview-only edit — no committed styleEdits entry, so activeStyleDraft() is
    // null — is still reverted. Gating on activeStyleDraft() leaked such previews.
    if (restore) { rollbackStyleEdits(); rollbackTokenPreviews(); }
    clearActiveStyleDraftState();
    localStyleDrafts().forEach(function (draft) {
      if (restore) restoreStyleDraftPreview(draft);
      delete styleDrafts[draft.clientKey];
    });
  }

  function setEditScope(scope) {
    var componentScope = currentSelection && currentSelection.componentScope;
    if (scope !== "instance" && scope !== "component") return false;
    if (scope === "component" && (!componentScope || componentScope.matchCount < 2)) return false;
    capturePanelDrafts();
    editScope = scope;
    // renderPanel → orderedSelection may immediately prune a detached multi-grab
    // member and flip editScope back to instance. Paint canvas chrome AFTER that
    // settles so badges match the final scope, not a transient component paint.
    renderPanel();
    if (selectedElement) setHighlight(selectedElement);
    paintSelectionOverlays();
    return true;
  }

  function restoreStyleEdit(property) {
    restoreStyleOriginalEntries(property, styleEditOriginalInline[property], styleEditTarget || selectedElement);
    restoreStyleScopeSiblings(property);
  }

  // Layers that receive a style write: every shift-multi selection, else primary.
  // Component-scope siblings are still mirrored via applyStyleToScopeSiblings.
  // During renderPanel, reuse selectionMembershipForRender so Mixed resolution
  // does not re-enter orderedSelection (isConnected) once per style row.
  function styleApplicationTargets() {
    if (selectionMembershipForRender && selectionMembershipForRender.length) {
      return selectionMembershipForRender.slice();
    }
    var ordered = orderedSelection();
    if (ordered.length) return ordered;
    return selectedElement ? [selectedElement] : [];
  }

  function computedStyleValueForElement(element, property) {
    if (!element || element.nodeType !== 1) return "";
    try { return getComputedStyle(element).getPropertyValue(property).trim(); }
    catch (error) { return ""; }
  }

  // Resolves the panel value for a property across the current selection.
  // Returns MIXED_STYLE_VALUE when selected layers disagree and there is no edit.
  function resolvedStyleValue(property) {
    if (styleEdits[property]) return styleEdits[property].newValue;
    var targets = styleApplicationTargets();
    if (!targets.length) {
      return currentSelection && currentSelection.styles ? (currentSelection.styles[property] || "") : "";
    }
    var first = computedStyleValueForElement(targets[0], property);
    for (var i = 1; i < targets.length; i += 1) {
      if (computedStyleValueForElement(targets[i], property) !== first) return MIXED_STYLE_VALUE;
    }
    if (first) return first;
    return currentSelection && currentSelection.styles ? (currentSelection.styles[property] || "") : "";
  }

  function captureStyleOriginals(property, targets) {
    // Append, never early-return: a member shift-selected AFTER the first
    // preview of this property must still get its original captured, or
    // dismiss leaves the edit stuck on it.
    var captured = styleEditOriginalInline[property];
    if (captured && !Array.isArray(captured)) {
      captured = [{
        element: captured.element || styleEditTarget || selectedElement || targets[0],
        value: captured.value,
        priority: captured.priority
      }];
    }
    if (!captured) captured = [];
    styleEditOriginalInline[property] = captured;
    targets.forEach(function (element) {
      var already = captured.some(function (entry) { return entry && entry.element === element; });
      if (already) return;
      captured.push({
        element: element,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
        // Clean computed captured BEFORE the first write — the only baseline that
        // stays correct even if currentSelection.styles is re-snapshotted mid-preview
        // (rebase / re-select paths). Read via capturedOriginalComputed().
        computed: computedStyleValueForElement(element, property)
      });
    });
  }

  // The clean pre-write computed value for a target, captured by the first
  // captureStyleOriginals of this property. Returns "" if not captured.
  function capturedOriginalComputed(property, element) {
    var captured = styleEditOriginalInline[property];
    if (!captured || !Array.isArray(captured)) return "";
    for (var i = 0; i < captured.length; i += 1) {
      if (captured[i] && captured[i].element === element) return captured[i].computed || "";
    }
    return "";
  }

  function setStyleOnTargets(property, newValue, targets) {
    targets.forEach(function (element) {
      element.style.setProperty(property, newValue);
    });
  }

  // "All N like this" (editScope === "component") mirrors edits onto every
  // element matching componentScope.matchSelector so the live browser preview
  // shows the same result the scoped payload sends to the backend — otherwise
  // only selectedElement visibly changes and the rest look like a no-op.
  // Scoped to the CURRENT edit session (tied to selectedElement, not to the
  // stash/reactivate draft lifecycle) — switching to another element mid-edit
  // without committing/dismissing first can leave a sibling override in place.
  function componentScopeSiblingElements() {
    if (editScope !== "component" || !selectedElement || !currentSelection || !currentSelection.componentScope) return [];
    var scope = currentSelection.componentScope;
    // Class-less scope is same-parent, same-signature — re-derived live from the
    // parent's children (there is no global selector that means "these siblings").
    if (scope.siblingScoped) {
      var parent = selectedElement.parentElement;
      if (!parent) return [];
      var tag = String(selectedElement.localName || "").toLowerCase();
      return Array.prototype.filter.call(parent.children, function (element) {
        return element !== selectedElement && sameTag(element, tag);
      });
    }
    var selector = scope.matchSelector;
    if (!selector) return [];
    var matches;
    try { matches = Array.prototype.slice.call(document.querySelectorAll(selector)); }
    catch (error) { return []; }
    // Excludes only the primary. This is the generic component-match source used
    // for selection chrome (badges/highlights via visualBadgeElements) AND for
    // style mirroring — a shift-selected member that also matches must KEEP its
    // badge, so the styleApplicationTargets exclusion lives in the style-write
    // path (applyStyleToScopeSiblings), not here.
    return matches.filter(function (element) { return element !== selectedElement; });
  }

  function applyStyleToScopeSiblings(property, newValue) {
    // A shift-selected member that also matches the component selector is already
    // captured/restored by the per-element primary store (captureStyleOriginals).
    // Exclude every selection target here so it is not captured a SECOND time
    // AFTER setStyleOnTargets wrote it (wrong original) and doubly-restored.
    var selectionTargets = styleApplicationTargets();
    var siblings = componentScopeSiblingElements().filter(function (element) {
      return selectionTargets.indexOf(element) === -1;
    });
    if (!siblings.length) return;
    if (styleEditScopeSiblingsTarget !== selectedElement) {
      styleEditScopeSiblingsOriginal = Object.create(null);
      styleEditScopeSiblingsTarget = selectedElement;
    }
    var captured = styleEditScopeSiblingsOriginal[property];
    if (!captured) {
      captured = [];
      styleEditScopeSiblingsOriginal[property] = captured;
    }
    siblings.forEach(function (element) {
      var alreadyCaptured = captured.some(function (entry) { return entry.element === element; });
      if (!alreadyCaptured) {
        captured.push({ element: element, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) });
      }
      element.style.setProperty(property, newValue);
    });
  }

  function restoreStyleScopeSiblings(property) {
    var originals = styleEditScopeSiblingsOriginal[property];
    if (!originals) return;
    restoreStyleScopeSiblingOriginalEntries(property, originals);
    delete styleEditScopeSiblingsOriginal[property];
  }

  function restoreStyleScopeSiblingOriginalEntries(property, originals) {
    (originals || []).forEach(function (entry) {
      if (entry.value) entry.element.style.setProperty(property, entry.value, entry.priority);
      else entry.element.style.removeProperty(property);
    });
  }

  function restoreStyleScopeSiblingOriginalStore(originalStore) {
    Object.keys(originalStore || {}).forEach(function (property) {
      (originalStore[property] || []).forEach(function (entry) {
        if (entry.value) entry.element.style.setProperty(property, entry.value, entry.priority);
        else entry.element.style.removeProperty(property);
      });
      delete originalStore[property];
    });
  }

  function setStyleOnCapturedScopeSiblings(property, value) {
    // Only re-apply to captured siblings while the component-scope session that
    // captured them is still active and owned by the current primary. After a
    // switch to instance scope (or a new primary), those elements are no longer
    // part of the edit — writing to them is a non-target regression.
    if (editScope !== "component" || styleEditScopeSiblingsTarget !== selectedElement) return;
    (styleEditScopeSiblingsOriginal[property] || []).forEach(function (entry) {
      entry.element.style.setProperty(property, value);
    });
  }

  function restoreCommittedValueWithSiblings(property, previousValue) {
    setStyleOnTargets(property, previousValue, styleApplicationTargets());
    setStyleOnCapturedScopeSiblings(property, previousValue);
  }

  function rollbackStyleEdits() {
    Object.keys(styleEditOriginalInline).forEach(restoreStyleEdit);
    styleEdits = Object.create(null);
    styleEditOriginalInline = Object.create(null);
    styleEditTarget = null;
  }

  // previewOriginals[cssVar] holds one entry per previewed element (multi-select
  // previews every selected element, not just the primary). Tolerates the legacy
  // single-object shape from drafts stashed before the list form existed.
  function restoreTokenPreviewEntries(cssVar, original) {
    if (!original) return;
    var entries = Array.isArray(original) ? original : [original];
    entries.forEach(function (entry) {
      var target = entry.target || document.documentElement;
      if (entry.value) target.style.setProperty(cssVar, entry.value, entry.priority);
      else target.style.removeProperty(cssVar);
    });
  }

  function rollbackTokenPreviews() {
    Object.keys(previewOriginals).forEach(function (cssVar) {
      restoreTokenPreviewEntries(cssVar, previewOriginals[cssVar]);
    });
    previewOriginals = Object.create(null);
  }

  function commitStyleEdit(property, newValue, currentValue, tokenMeta) {
    var targets = styleApplicationTargets();
    if (!targets.length || newValue === currentValue) return false;
    if (window.CSS && typeof window.CSS.supports === "function" && !window.CSS.supports(property, newValue)) return false;
    styleEditTarget = selectedElement;
    // Baseline = the caller's pre-edit value. On a preview→commit (arrow-step,
    // scrub, color-picker), the preview already wrote the new value inline, so
    // resolvedStyleValue would read the POLLUTED live computed and mistake the
    // commit for a no-op (equality branch below), dropping the edit. currentValue
    // is the clean open-time original — trust it over the live read. A true no-op
    // (newValue === currentValue) already early-returned above.
    var resolved = styleEdits[property]
      ? styleEdits[property].oldValue
      : (currentValue != null && currentValue !== MIXED_STYLE_VALUE ? currentValue : resolvedStyleValue(property));
    // Mixed is a UI sentinel only — store the primary's real value for the agent payload.
    var originalValue = resolved;
    if (resolved === MIXED_STYLE_VALUE || currentValue === MIXED_STYLE_VALUE) {
      // Preview has already written newValue to every mixed target, so a live
      // computed read of the primary is POLLUTED (returns newValue) — but ONLY
      // when a preview ran, which is exactly when capturedOriginalComputed exists
      // (captured clean before the first write). So: captured clean first; if none
      // (no preview → DOM not polluted) the live computed is clean; snapshot last.
      originalValue = capturedOriginalComputed(property, selectedElement)
        || computedStyleValueForElement(selectedElement, property)
        || (currentSelection && currentSelection.styles && currentSelection.styles[property])
        || "";
    }
    captureStyleOriginals(property, targets);
    if (newValue === originalValue && resolved !== MIXED_STYLE_VALUE && currentValue !== MIXED_STYLE_VALUE) {
      restoreStyleEdit(property);
      delete styleEdits[property];
      delete styleEditOriginalInline[property];
    } else {
      setStyleOnTargets(property, newValue, targets);
      applyStyleToScopeSiblings(property, newValue);
      styleEdits[property] = { property: property, oldValue: originalValue, newValue: newValue };
      if (tokenMeta && tokenMeta.name) {
        styleEdits[property].token = tokenMeta.name;
        styleEdits[property].tokenPath = tokenMeta.path;
        if (tokenMeta.cssVar) styleEdits[property].cssVar = tokenMeta.cssVar;
      }
    }
    syncActiveStyleDraftKey();
    return true;
  }

  function previewStyleEdit(property, newValue) {
    var targets = styleApplicationTargets();
    if (!targets.length) return false;
    if (window.CSS && typeof window.CSS.supports === "function" && !window.CSS.supports(property, newValue)) return false;
    styleEditTarget = selectedElement;
    captureStyleOriginals(property, targets);
    setStyleOnTargets(property, newValue, targets);
    applyStyleToScopeSiblings(property, newValue);
    return true;
  }

  var STROKE_SIDES = ["top", "right", "bottom", "left"];
  var STROKE_SIDE_LABEL = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" };
  var STROKE_SIDE_PROPERTIES = [];
  STROKE_SIDES.forEach(function (side) {
    ["width", "style", "color"].forEach(function (prop) { STROKE_SIDE_PROPERTIES.push("border-" + side + "-" + prop); });
  });

  var STROKE_PROPERTIES = [
    "border-width", "border-style", "border-color", "box-sizing",
    "outline-width", "outline-style", "outline-color", "outline-offset"
  ].concat(STROKE_SIDE_PROPERTIES);

  function isSvgGraphicsElement(element) {
    if (!element || element.nodeType !== 1) return false;
    if (typeof SVGGraphicsElement !== "undefined" && element instanceof SVGGraphicsElement) return true;
    return element.namespaceURI === "http://www.w3.org/2000/svg" && typeof element.getBBox === "function";
  }

  function strokePropertyValueForDraft(property, draft) {
    var edits = draft ? draft.styleEdits : styleEdits;
    var selection = draft ? draft.selection : currentSelection;
    var target = draft ? draft.target : selectedElement;
    if (edits[property]) return edits[property].newValue;
    if (selection && selection.styles && selection.styles[property] !== undefined) return selection.styles[property];
    if (target) return getComputedStyle(target).getPropertyValue(property).trim();
    return "";
  }

  function strokePropertyValue(property) {
    return strokePropertyValueForDraft(property, null);
  }

  // A per-side longhand read that also honours a uniform shorthand edit — the
  // editor may have committed either border-width or border-left-width, and the
  // display must reflect whichever is live.
  function strokeSideValueForDraft(side, prop, draft) {
    var edits = draft ? draft.styleEdits : styleEdits;
    if (!edits["border-" + side + "-" + prop] && edits["border-" + prop]) return edits["border-" + prop].newValue;
    return strokePropertyValueForDraft("border-" + side + "-" + prop, draft);
  }

  function strokeSideModel(side, draft) {
    return {
      width: strokeSideValueForDraft(side, "width", draft) || "0px",
      style: strokeSideValueForDraft(side, "style", draft) || "none",
      color: strokeSideValueForDraft(side, "color", draft) || "rgb(0, 0, 0)"
    };
  }

  function strokeSideVisible(side) {
    return !!side && (parseFloat(side.width) || 0) > 0 && side.style !== "none";
  }

  function strokeSidesUniform(sides) {
    var first = sides.top;
    return STROKE_SIDES.every(function (name) {
      var s = sides[name];
      return s.width === first.width && s.style === first.style && s.color === first.color;
    });
  }

  function strokeSidesForDraft(draft) {
    var sides = {};
    STROKE_SIDES.forEach(function (name) { sides[name] = strokeSideModel(name, draft); });
    return sides;
  }

  function strokeModelForDraft(draft) {
    var outlineWidth = strokePropertyValueForDraft("outline-width", draft) || "0px";
    var outlineStyle = strokePropertyValueForDraft("outline-style", draft) || "none";
    var outside = (parseFloat(outlineWidth) || 0) > 0 && outlineStyle !== "none";
    if (outside) {
      return {
        position: "outside",
        width: outlineWidth,
        style: outlineStyle,
        color: strokePropertyValueForDraft("outline-color", draft) || "rgb(0, 0, 0)"
      };
    }
    // Borders are per-side. Read the four longhands (the border-width shorthand
    // resolves EMPTY for a non-uniform border, which read as "None" before) and
    // collapse to the uniform shape only when every side truly matches.
    var sides = strokeSidesForDraft(draft);
    if (!strokeSidesUniform(sides)) return { position: "inside", perSide: true, sides: sides };
    var uniform = sides.top;
    return { position: "inside", width: uniform.width, style: uniform.style, color: uniform.color };
  }

  function strokeModelForSelection() {
    return strokeModelForDraft(null);
  }

  function normalizeStrokeModel(model, previousModel) {
    var parsed = parseNumericValue(model && model.width);
    var position = model && String(model.position || "").toLowerCase();
    var styleName = model && String(model.style || "").toLowerCase();
    var color = model && String(model.color || "").trim();
    var allowedStyles = ["none", "solid", "dashed", "dotted", "double"];
    if (!parsed || Number(parsed.number) < 0 || (position !== "inside" && position !== "outside") || allowedStyles.indexOf(styleName) === -1 || !color) return null;
    var widthNumber = Number(parsed.number);
    var unit = parsed.unit || "px";
    if (styleName === "none" && widthNumber > 0) {
      if (previousModel && String(previousModel.style || "").toLowerCase() !== "none") widthNumber = 0;
      else styleName = "solid";
    }
    var width = formatNumericResult(widthNumber) + unit;
    if (styleName === "none") width = "0" + unit;
    return { position: position, width: width, style: styleName, color: color };
  }

  function strokeColorDisplay(color) {
    return parseColorParts(color) ? formatColorValue(color, "hex").toUpperCase() : color;
  }

  function strokePerSideSummary(model) {
    var visible = STROKE_SIDES.filter(function (name) { return strokeSideVisible(model.sides[name]); });
    if (!visible.length) return "None";
    var sidesLabel = visible.map(function (name) { return STROKE_SIDE_LABEL[name]; }).join("+");
    var ref = model.sides[visible[0]];
    var sameLook = visible.every(function (name) {
      var s = model.sides[name];
      return s.width === ref.width && s.style === ref.style && s.color === ref.color;
    });
    if (!sameLook) return "Mixed · " + sidesLabel;
    return ref.width + " " + ref.style + " " + strokeColorDisplay(ref.color) + " · " + sidesLabel;
  }

  function strokeSummary(model) {
    if (model && model.perSide) return strokePerSideSummary(model);
    var normalized = normalizeStrokeModel(model, model);
    if (!normalized || (parseFloat(normalized.width) || 0) <= 0 || normalized.style === "none") return "None";
    return normalized.width + " " + normalized.style + " " + strokeColorDisplay(normalized.color) + " · " + (normalized.position === "outside" ? "Outside" : "Inside");
  }

  function copyStrokeRecord(record) {
    if (!record) return null;
    // Originals are arrays of per-element entries; Object.keys on an array
    // would produce a numeric-keyed object that restore misreads as the
    // legacy single-entry shape.
    if (Array.isArray(record)) return record.map(copyStrokeRecord);
    var copy = {};
    Object.keys(record).forEach(function (key) { copy[key] = record[key]; });
    return copy;
  }

  function snapshotStrokeEditState(target) {
    // Snapshot inline values for EVERY element a stroke preview writes to
    // (multi-select), not just the primary — cancel must undo all of them.
    var elements = styleApplicationTargets();
    if (elements.indexOf(target) === -1) elements = [target].concat(elements);
    var snapshot = { target: target, inline: Object.create(null), edits: Object.create(null), originals: Object.create(null), styleEditTarget: styleEditTarget };
    STROKE_PROPERTIES.forEach(function (property) {
      snapshot.inline[property] = elements.map(function (element) {
        return {
          element: element,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property)
        };
      });
      if (styleEdits[property]) snapshot.edits[property] = copyStrokeRecord(styleEdits[property]);
      if (styleEditOriginalInline[property]) snapshot.originals[property] = copyStrokeRecord(styleEditOriginalInline[property]);
    });
    return snapshot;
  }

  function captureStrokeSnapshotTargets(snapshot, elements) {
    if (!snapshot) return;
    STROKE_PROPERTIES.forEach(function (property) {
      var entries = snapshot.inline[property];
      if (!Array.isArray(entries)) {
        entries = [{ element: snapshot.target, value: entries.value, priority: entries.priority }];
        snapshot.inline[property] = entries;
      }
      elements.forEach(function (element) {
        if (entries.some(function (entry) { return entry.element === element; })) return;
        entries.push({
          element: element,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property)
        });
      });
    });
  }

  function restoreStrokeEditState(snapshot) {
    if (!snapshot || !snapshot.target) return;
    STROKE_PROPERTIES.forEach(function (property) {
      var inline = snapshot.inline[property];
      var entries = Array.isArray(inline)
        ? inline
        : [{ element: snapshot.target, value: inline.value, priority: inline.priority }];
      entries.forEach(function (entry) {
        var element = entry.element || snapshot.target;
        if (entry.value) element.style.setProperty(property, entry.value, entry.priority);
        else element.style.removeProperty(property);
      });
      delete styleEdits[property];
      delete styleEditOriginalInline[property];
      if (snapshot.edits[property]) styleEdits[property] = copyStrokeRecord(snapshot.edits[property]);
      if (snapshot.originals[property]) styleEditOriginalInline[property] = copyStrokeRecord(snapshot.originals[property]);
    });
    styleEditTarget = snapshot.styleEditTarget;
  }

  function normalizeStrokeSide(side) {
    var parsed = parseNumericValue(side && side.width);
    var styleName = side && String(side.style || "").toLowerCase();
    var color = side && String(side.color || "").trim();
    var allowedStyles = ["none", "solid", "dashed", "dotted", "double"];
    if (!parsed || Number(parsed.number) < 0 || allowedStyles.indexOf(styleName) === -1 || !color) return null;
    var unit = parsed.unit || "px";
    if (styleName === "none" || Number(parsed.number) <= 0) return { width: "0" + unit, style: "none", color: color };
    return { width: formatNumericResult(Number(parsed.number)) + unit, style: styleName, color: color };
  }

  // Shared writer for the Stroke group: validate every entry, restore any stroke
  // edit it no longer emits (so switching uniform↔per-side or inside↔outside never
  // strands a stale border-*/outline-* longhand), then apply and record the group.
  function applyStrokeEmission(emitted, editorSnapshot) {
    for (var validationIndex = 0; validationIndex < emitted.length; validationIndex += 1) {
      if (!window.CSS.supports(emitted[validationIndex].property, emitted[validationIndex].value)) return false;
    }
    var before = snapshotStrokeEditState(selectedElement);
    var emittedProperties = Object.create(null);
    for (var emittedIndex = 0; emittedIndex < emitted.length; emittedIndex += 1) emittedProperties[emitted[emittedIndex].property] = true;
    try {
      styleEditTarget = selectedElement;
      STROKE_PROPERTIES.forEach(function (property) {
        var edit = styleEdits[property];
        if (!emittedProperties[property] && edit && edit.groupId === "stroke") {
          restoreStyleEdit(property);
          delete styleEdits[property];
        }
      });
      var strokeTargets = styleApplicationTargets();
      captureStrokeSnapshotTargets(editorSnapshot, strokeTargets);
      emitted.forEach(function (entry) {
        var existing = styleEdits[entry.property];
        captureStyleOriginals(entry.property, strokeTargets);
        var oldValue = existing ? existing.oldValue : (currentSelection.styles[entry.property] || getComputedStyle(selectedElement).getPropertyValue(entry.property).trim());
        setStyleOnTargets(entry.property, entry.value, strokeTargets);
        styleEdits[entry.property] = {
          property: entry.property,
          oldValue: oldValue,
          newValue: entry.value,
          groupId: "stroke",
          groupLabel: "Stroke"
        };
      });
    } catch (error) {
      restoreStrokeEditState(before);
      return false;
    }
    syncActiveStyleDraftKey();
    return true;
  }

  // Per-side commit: writes all four sides as longhands (never the shorthand), so
  // editing one side keeps the other three exactly as they were. Outside/outline
  // is always uniform, so it never routes here.
  function commitStrokeSidesEdit(model, editorSnapshot) {
    var normalizedSides = {};
    var emitted = [];
    for (var i = 0; i < STROKE_SIDES.length; i += 1) {
      var name = STROKE_SIDES[i];
      var n = normalizeStrokeSide(model.sides[name]);
      if (!n) return false;
      normalizedSides[name] = n;
      emitted.push({ property: "border-" + name + "-width", value: n.width });
      emitted.push({ property: "border-" + name + "-style", value: n.style });
      emitted.push({ property: "border-" + name + "-color", value: n.color });
    }
    emitted.push({ property: "box-sizing", value: "border-box" });
    emitted.push({ property: "outline-width", value: "0px" });
    return applyStrokeEmission(emitted, editorSnapshot) ? { position: "inside", perSide: true, sides: normalizedSides } : false;
  }

  function commitStrokeEdit(model, previousModel, editorSnapshot) {
    if (!selectedElement || !currentSelection || !window.CSS || typeof window.CSS.supports !== "function") return false;
    if (model && model.perSide) return commitStrokeSidesEdit(model, editorSnapshot);
    var normalized = normalizeStrokeModel(model, previousModel);
    if (!normalized) return false;
    var emitted = normalized.position === "outside"
      ? [
          { property: "outline-width", value: normalized.width },
          { property: "outline-style", value: normalized.style },
          { property: "outline-color", value: normalized.color },
          { property: "outline-offset", value: "0px" },
          { property: "border-width", value: "0px" }
        ]
      : [
          { property: "border-width", value: normalized.width },
          { property: "border-style", value: normalized.style },
          { property: "border-color", value: normalized.color },
          { property: "box-sizing", value: "border-box" },
          { property: "outline-width", value: "0px" }
        ];
    return applyStrokeEmission(emitted, editorSnapshot) ? normalized : false;
  }

  function removeStrokeEditGroup() {
    STROKE_PROPERTIES.forEach(function (property) {
      if (styleEditOriginalInline[property]) restoreStyleEdit(property);
      if (styleEdits[property] && styleEdits[property].groupId === "stroke") delete styleEdits[property];
      delete styleEditOriginalInline[property];
    });
    syncActiveStyleDraftKey();
  }

  function isColorProperty(property) {
    return ["color", "background-color", "border-color", "outline-color", "fill", "stroke"].indexOf(property) !== -1;
  }

  // Parse a hex (including #rgba) or rgb()/rgba() color to {r,g,b,a} (a in 0..1), or null if it
  // isn't one of those forms. Computed color values are always rgb/rgba, so this
  // covers every real case; named/hsl values (which getComputedStyle never
  // returns for these properties) fall through to null and are left untouched.
  function parseColorParts(value) {
    var t = String(value || "").trim();
    var hex = t.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      var d = hex[1];
      if (d.length === 3) d = d.charAt(0) + d.charAt(0) + d.charAt(1) + d.charAt(1) + d.charAt(2) + d.charAt(2);
      if (d.length === 4) d = d.charAt(0) + d.charAt(0) + d.charAt(1) + d.charAt(1) + d.charAt(2) + d.charAt(2) + d.charAt(3) + d.charAt(3);
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
    var editor = input;
    while (editor.parentElement && editor.className !== "raven-grab-style-editor") editor = editor.parentElement;
    if (editor.className !== "raven-grab-style-editor") editor = input;
    var row = editor.parentElement;
    var property = row.getAttribute("data-style-property");
    var styleState = row.getAttribute("data-style-state");
    var matched = matchedTokenEntryForProperty(property, styleState);
    var edited = styleState
      ? !!stateStyleEdits[stateStyleEditKey(styleState, property)]
      : !!styleEdits[property];
    var tokenEdited = matched && !!tokenIntents[matched.index];
    row.setAttribute("data-edited", edited || tokenEdited ? "true" : "false");
    var cell = buildStyleValueCell(property, value, styleState, matched, edited);
    row.replaceChild(cell, editor);
  }

  function cancelStyleEdit(input, previousValue) {
    if (input && input.parentNode) replaceStyleInput(input, previousValue);
  }

  // Figma-inspector-style typed editing: numbers get a number field (unit fixed),
  // colors get a HEX/RGB format dropdown, keyword properties get a value dropdown.
  // No per-field "Custom…" — use the agent Instructions box for exotic values.
  // Current computed values missing from a list are prepended at edit time.
  var STYLE_ENUM_OPTIONS = {
    "display": ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "flow-root", "none", "contents"],
    "position": ["static", "relative", "absolute", "fixed", "sticky"],
    "box-sizing": ["content-box", "border-box"],
    "overflow": ["visible", "hidden", "clip", "scroll", "auto"],
    "visibility": ["visible", "hidden", "collapse"],
    "pointer-events": ["auto", "none"],
    "cursor": ["auto", "default", "pointer", "text", "move", "grab", "grabbing", "not-allowed", "crosshair", "help", "wait", "progress", "zoom-in", "zoom-out", "col-resize", "row-resize", "n-resize", "s-resize", "e-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize"],
    "object-fit": ["fill", "contain", "cover", "none", "scale-down"],
    "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
    "flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
    "align-items": ["normal", "stretch", "center", "start", "end", "flex-start", "flex-end", "baseline"],
    "justify-content": ["normal", "flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "start", "end"],
    "align-content": ["normal", "flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "stretch", "start", "end"],
    "justify-items": ["normal", "stretch", "center", "start", "end", "left", "right"],
    "border-style": ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"],
    "outline-style": ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"],
    "text-align": ["left", "right", "center", "justify", "start", "end"],
    "text-transform": ["none", "capitalize", "uppercase", "lowercase", "full-width"],
    "text-overflow": ["clip", "ellipsis"],
    "white-space": ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
    "word-break": ["normal", "break-all", "keep-all", "break-word"],
    "font-style": ["normal", "italic", "oblique"],
    "font-weight": ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold", "lighter", "bolder"],
    "grid-template-columns": ["none", "1fr", "1fr 1fr", "1fr 1fr 1fr", "repeat(2, minmax(0, 1fr))", "repeat(3, minmax(0, 1fr))", "auto 1fr", "max-content 1fr", "min-content 1fr"]
  };

  // Overflow axes share one keyword set. Standalone overflow-x/y rows are hidden.
  var OVERFLOW_AXIS_OPTIONS = ["visible", "hidden", "clip", "scroll", "auto"];

  // Size modes: Fixed = length scrubber; Hug = fit-content; Fill = 100% only.
  var SIZE_MODE_FILL_VALUE = "100%";
  var SIZE_MODE_HUG_VALUE = "fit-content";
  var SIZE_MODE_HUG_VALUES = ["auto", "fit-content", "min-content", "max-content"];

  var SYSTEM_FONT_FAMILIES = [
    "Geist", "Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto",
    "Helvetica Neue", "Helvetica", "Arial", "Georgia", "Times New Roman", "Times",
    "Courier New", "Menlo", "Monaco", "ui-sans-serif", "ui-serif", "ui-monospace", "sans-serif", "serif", "monospace"
  ];

  var BOX_SHADOW_PRESETS = [
    { id: "none", label: "None", value: "none" },
    { id: "soft", label: "Soft", value: "0 2px 8px rgba(0, 0, 0, 0.12)" },
    { id: "medium", label: "Medium", value: "0 4px 16px rgba(0, 0, 0, 0.18)" },
    { id: "hard", label: "Hard", value: "0 1px 0 rgba(0, 0, 0, 0.25)" },
    { id: "inset", label: "Inset soft", value: "inset 0 1px 2px rgba(0, 0, 0, 0.14)" }
  ];

  var TEXT_DECORATION_LINES = ["none", "underline", "overline", "line-through", "underline line-through"];
  var TEXT_DECORATION_STYLES = ["solid", "double", "dotted", "dashed", "wavy"];

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

  function parseNumericExpression(value, defaultUnit) {
    // Accept "1,5" as a decimal separator — normalize digit,digit to digit.digit.
    var text = String(value || "").replace(/(\d),(\d)/g, "$1.$2");
    var index = 0;
    var invalid = false;
    var explicitUnit = "";
    var precision = 0;

    function skipSpace() {
      while (/\s/.test(text.charAt(index))) index += 1;
    }

    function readNumber() {
      skipSpace();
      var match = text.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) { invalid = true; return 0; }
      index += match[0].length;
      var mantissa = match[0].split(/[eE]/)[0];
      var decimal = mantissa.indexOf(".");
      if (decimal !== -1) precision = Math.max(precision, mantissa.length - decimal - 1);
      var unitMatch = text.slice(index).match(/^[a-z%]+/i);
      if (unitMatch) {
        var unit = unitMatch[0];
        index += unit.length;
        if (explicitUnit && explicitUnit.toLowerCase() !== unit.toLowerCase()) invalid = true;
        if (defaultUnit && defaultUnit.toLowerCase() !== unit.toLowerCase()) invalid = true;
        explicitUnit = explicitUnit || unit;
      }
      return Number(match[0]);
    }

    function readFactor() {
      skipSpace();
      var sign = 1;
      if (text.charAt(index) === "+" || text.charAt(index) === "-") {
        if (text.charAt(index) === "-") sign = -1;
        index += 1;
      }
      skipSpace();
      if (text.charAt(index) === "(") {
        index += 1;
        var grouped = readExpression();
        skipSpace();
        if (text.charAt(index) !== ")") invalid = true;
        else index += 1;
        return sign * grouped;
      }
      return sign * readNumber();
    }

    function readTerm() {
      var result = readFactor();
      while (!invalid) {
        skipSpace();
        var operator = text.charAt(index);
        if (operator !== "*" && operator !== "/") break;
        index += 1;
        var right = readFactor();
        if (operator === "/" && right === 0) { invalid = true; break; }
        result = operator === "*" ? result * right : result / right;
      }
      return result;
    }

    function readExpression() {
      var result = readTerm();
      while (!invalid) {
        skipSpace();
        var operator = text.charAt(index);
        if (operator !== "+" && operator !== "-") break;
        index += 1;
        var right = readTerm();
        result = operator === "+" ? result + right : result - right;
      }
      return result;
    }

    var number = readExpression();
    skipSpace();
    if (index !== text.length || !isFinite(number)) invalid = true;
    if (invalid) return null;
    return { number: number, unit: explicitUnit || defaultUnit || "", precision: precision };
  }

  function formatNumericResult(number) {
    return String(Math.round(number * 1000000000000) / 1000000000000);
  }

  function steppedNumericValue(value, delta, defaultUnit) {
    var parsed = parseNumericExpression(value, defaultUnit);
    if (!parsed) return null;
    var next = parsed.number + delta;
    if (!isFinite(next)) return null;
    return (parsed.precision ? next.toFixed(parsed.precision) : String(Math.round(next))) + parsed.unit;
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
    if (property === "__raven-stroke__") return "stroke";
    if (property === "text-decoration") return "text-decoration";
    if (property === "box-shadow") return shadowLayerCount(value) > 1 ? "text" : "box-shadow";
    if (property === "overflow") return "overflow";
    if (property === "width" || property === "height") return "size";
    if (property === "font-family") return "enum";
    var raw = String(value || "").trim();
    if (raw === MIXED_STYLE_VALUE) {
      if (isColorProperty(property)) return "color";
      if (STYLE_ENUM_OPTIONS[property]) return "enum";
      return "text";
    }
    if (isColorProperty(property) && isSingleColorValue(value)) return "color";
    if (STYLE_ENUM_OPTIONS[property] && STYLE_ENUM_OPTIONS[property].indexOf(raw) !== -1) return "enum";
    if (parseNumericValue(value)) return "number";
    if (STYLE_ENUM_OPTIONS[property]) return "enum";
    return "text";
  }

  function sizeModeForValue(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (!raw || raw === MIXED_STYLE_VALUE.toLowerCase()) return "fixed";
    if (raw === "100%" || raw === "stretch") return "fill";
    if (SIZE_MODE_HUG_VALUES.indexOf(raw) !== -1) return "hug";
    return "fixed";
  }

  function sizeValueForMode(mode, numberPart, unit) {
    if (mode === "fill") return SIZE_MODE_FILL_VALUE;
    if (mode === "hug") return SIZE_MODE_HUG_VALUE;
    var amount = numberPart === "" || numberPart == null ? "0" : String(numberPart);
    return amount + (unit || "px");
  }

  function parseOverflowModel(value, element) {
    var x = "visible";
    var y = "visible";
    if (element && element.nodeType === 1) {
      try {
        var computed = getComputedStyle(element);
        x = (computed.overflowX || "visible").trim() || "visible";
        y = (computed.overflowY || "visible").trim() || "visible";
        return { x: x, y: y };
      } catch (error) {
        // Fall through to string parse.
      }
    }
    var parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      x = parts[0];
      y = parts[0];
    } else if (parts.length >= 2) {
      x = parts[0];
      y = parts[1];
    }
    return { x: x, y: y };
  }

  function composeOverflow(model) {
    var x = model && model.x ? model.x : "visible";
    var y = model && model.y ? model.y : x;
    if (x === y) return x;
    return x + " " + y;
  }

  function overflowSummary(model) {
    return composeOverflow(model);
  }

  function fontFamilyOptionLabel(name) {
    var key = String(name || "").trim();
    if (key.toLowerCase() === "system-ui") return "system-ui (SF on Mac, Segoe on Windows)";
    return key;
  }

  function isIgnoredFontFamily(name) {
    var key = String(name || "").trim();
    if (!key) return true;
    if (/^__nextjs[-_]/i.test(key)) return true;
    if (/\bFallback\b/i.test(key)) return true;
    return false;
  }

  function stripFontFamilyQuotes(part) {
    return String(part || "").trim().replace(/^["']+|["']+$/g, "");
  }

  function fontFamilyOptions(currentValue) {
    var seen = Object.create(null);
    var options = [];
    function add(name) {
      var key = stripFontFamilyQuotes(name);
      if (!key || isIgnoredFontFamily(key)) return;
      var normalized = key.toLowerCase();
      if (seen[normalized]) return;
      seen[normalized] = true;
      options.push(key);
    }
    var current = String(currentValue || "").trim();
    // Never add the full comma-separated stack as one option — stripping quotes
    // on the whole stack corrupts values like Inter, "Inter Fallback".
    if (current.indexOf(",") !== -1) {
      current.split(",").forEach(function (part) { add(part); });
    } else if (current) {
      add(current);
    }
    try {
      if (document.fonts && typeof document.fonts.forEach === "function") {
        document.fonts.forEach(function (face) {
          if (face && face.family) add(face.family);
        });
      }
    } catch (error) {
      // FontFaceSet iteration can throw in restricted documents.
    }
    var elements = document.querySelectorAll("body, body *");
    var limit = Math.min(elements.length, 120);
    for (var i = 0; i < limit; i += 1) {
      try {
        var family = getComputedStyle(elements[i]).fontFamily;
        if (!family) continue;
        family.split(",").forEach(function (part) { add(part); });
      } catch (error) {
        // Skip detached / cross-origin style reads.
      }
    }
    for (var s = 0; s < SYSTEM_FONT_FAMILIES.length; s += 1) add(SYSTEM_FONT_FAMILIES[s]);
    return options;
  }

  function enumOptionsForProperty(property, previousValue) {
    if (property === "font-family") return fontFamilyOptions(previousValue);
    var options = (STYLE_ENUM_OPTIONS[property] || []).slice();
    var current = String(previousValue || "").trim();
    if (current && options.indexOf(current) === -1) options.unshift(current);
    return options;
  }

  function parseTextDecorationModel(value, element) {
    var line = "none";
    var style = "solid";
    var color = "currentColor";
    if (element && element.nodeType === 1) {
      try {
        var computed = getComputedStyle(element);
        line = (computed.textDecorationLine || computed.textDecoration || "none").trim() || "none";
        style = (computed.textDecorationStyle || "solid").trim() || "solid";
        color = (computed.textDecorationColor || "currentColor").trim() || "currentColor";
      } catch (error) {
        // Fall through to string parse.
      }
    }
    var text = String(value || "").trim();
    if (text && text !== "none" && line === "none") {
      var parts = text.split(/\s+/);
      var lines = [];
      for (var i = 0; i < parts.length; i += 1) {
        var part = parts[i];
        if (TEXT_DECORATION_LINES.indexOf(part) !== -1 || part === "underline" || part === "overline" || part === "line-through") {
          if (part !== "none") lines.push(part);
        } else if (TEXT_DECORATION_STYLES.indexOf(part) !== -1) style = part;
        else if (parseColorParts(part) || part === "currentColor") color = part;
      }
      if (lines.length) line = lines.join(" ");
    }
    if (TEXT_DECORATION_LINES.indexOf(line) === -1 && line !== "none") {
      if (line.indexOf("underline") !== -1 && line.indexOf("line-through") !== -1) line = "underline line-through";
      else if (line.indexOf("underline") !== -1) line = "underline";
      else if (line.indexOf("line-through") !== -1) line = "line-through";
      else if (line.indexOf("overline") !== -1) line = "overline";
      else line = "none";
    }
    if (TEXT_DECORATION_STYLES.indexOf(style) === -1) style = "solid";
    return { line: line, style: style, color: color };
  }

  function composeTextDecoration(model) {
    if (!model || model.line === "none") return "none";
    var parts = [model.line];
    if (model.style && model.style !== "solid") parts.push(model.style);
    if (model.color && model.color !== "currentColor") parts.push(model.color);
    return parts.join(" ");
  }

  function parseBoxShadowModel(value) {
    var text = String(value || "").trim();
    if (!text || text === "none") {
      return { preset: "none", inset: false, x: "0", y: "0", blur: "0", spread: "0", color: "rgba(0, 0, 0, 0.2)", unit: "px" };
    }
    var first = text.split(/,(?![^(]*\))/)[0].trim();
    var preset = "";
    for (var p = 0; p < BOX_SHADOW_PRESETS.length; p += 1) {
      if (BOX_SHADOW_PRESETS[p].value === first || BOX_SHADOW_PRESETS[p].value === text) {
        preset = BOX_SHADOW_PRESETS[p].id;
        break;
      }
    }
    var inset = /^inset\b/i.test(first);
    var rest = inset ? first.replace(/^inset\s+/i, "") : first;
    var color = "rgba(0, 0, 0, 0.2)";
    var colorMatch = rest.match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8})/i);
    if (colorMatch) {
      color = colorMatch[1];
      rest = (rest.slice(0, colorMatch.index) + rest.slice(colorMatch.index + colorMatch[0].length)).trim();
    }
    var nums = rest.match(/-?\d*\.?\d+[a-z%]*/gi) || [];
    function numPart(index, fallback) {
      var raw = nums[index] || fallback;
      var parsed = parseNumericValue(raw) || { number: fallback.replace(/[a-z%]/gi, ""), unit: "px" };
      return parsed;
    }
    var x = numPart(0, "0px");
    var y = numPart(1, "0px");
    var blur = numPart(2, "0px");
    var spread = numPart(3, "0px");
    return {
      preset: preset,
      inset: inset,
      x: x.number,
      y: y.number,
      blur: blur.number,
      spread: spread.number,
      color: color,
      unit: x.unit || y.unit || "px"
    };
  }

  function composeBoxShadow(model) {
    if (!model) return "none";
    var unit = model.unit || "px";
    var parts = [];
    if (model.inset) parts.push("inset");
    parts.push(String(model.x) + unit);
    parts.push(String(model.y) + unit);
    parts.push(String(model.blur) + unit);
    parts.push(String(model.spread) + unit);
    parts.push(model.color || "rgba(0, 0, 0, 0.2)");
    return parts.join(" ");
  }

  // The structured box-shadow editor models a SINGLE layer; parseBoxShadowModel
  // keeps only split(...)[0], so opening it on a stacked shadow would drop every
  // layer after the first on commit. Count comma-separated layers (ignoring commas
  // inside rgb()/rgba()) so multi-layer values route to the lossless text editor.
  function shadowLayerCount(value) {
    var text = String(value || "").trim();
    if (!text || text === "none") return 0;
    return text.split(/,(?![^(]*\))/).filter(function (part) { return part.trim(); }).length;
  }

  // Reformat a color between hex and rgb WITHOUT losing alpha (a passive
  // format-flip must never turn rgba(0,0,0,0) into opaque black). Unparseable
  // values pass through unchanged.
  function formatColorValue(value, format) {
    var parts = parseColorParts(value);
    if (!parts) return String(value).trim();
    return format === "rgb" ? colorToRgb(parts) : colorToHex(parts);
  }

  function hasExplicitColorAlpha(value) {
    var text = String(value || "").trim();
    if (/^#?(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(text)) return true;
    return /^rgba\(/i.test(text);
  }

  function normalizeColorEntry(value, previousValue, format) {
    var text = String(value || "").trim();
    if (/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) text = "#" + text;
    var parts = parseColorParts(text);
    if (!parts) return text;
    var previous = parseColorParts(previousValue);
    // Carry a partial alpha (e.g. 50% opacity) onto a newly entered color, but
    // never alpha 0 — inheriting full transparency from a transparent original
    // makes every fresh pick invisible (#64748b00 on a transparent row).
    if (previous && previous.a < 1 && previous.a > 0 && !hasExplicitColorAlpha(text)) parts.a = previous.a;
    var outputFormat = format || (/^rgb/i.test(text) ? "rgb" : "hex");
    return outputFormat === "rgb" ? colorToRgb(parts) : colorToHex(parts);
  }

  function colorSuggestions(property, currentValue) {
    var suggestions = [];
    var seen = Object.create(null);
    function add(value, label, source, tokenMeta) {
      var parts = parseColorParts(value);
      if (!parts) return;
      var key = colorToHex(parts).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var suggestion = { value: colorToHex(parts), label: label, source: source };
      if (tokenMeta) suggestion.token = tokenMeta;
      suggestions.push(suggestion);
    }
    for (var i = 0; i < bridgeTokens.length && suggestions.length < 8; i += 1) {
      add(bridgeTokens[i].value, bridgeTokens[i].name + " · " + bridgeTokens[i].value, "token", {
        name: bridgeTokens[i].name,
        path: bridgeTokens[i].path,
        cssVar: bridgeTokens[i].cssVar
      });
    }
    add(currentValue, "Current color", "page");
    var elements = document.querySelectorAll("*");
    var pageProperties = [property, "color", "background-color", "border-color", "outline-color", "fill", "stroke"];
    for (var elementIndex = 0; elementIndex < elements.length && elementIndex < 200 && suggestions.length < 12; elementIndex += 1) {
      var computed = getComputedStyle(elements[elementIndex]);
      for (var propertyIndex = 0; propertyIndex < pageProperties.length && suggestions.length < 12; propertyIndex += 1) {
        add(computed.getPropertyValue(pageProperties[propertyIndex]), "Used on page", "page");
      }
    }
    return suggestions;
  }

  function replaceStrokeEditor(editor, model) {
    if (!editor || !editor.parentElement) return;
    var row = editor.parentElement;
    var summary = strokeSummary(model);
    var cell = document.createElement("code");
    cell.setAttribute("data-style-value", "");
    cell.setAttribute("data-style-raw", summary);
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", "Edit Stroke");
    cell.textContent = summary;
    var edited = STROKE_PROPERTIES.some(function (property) {
      return !!styleEdits[property] && styleEdits[property].groupId === "stroke";
    });
    row.setAttribute("data-edited", edited ? "true" : "false");
    row.replaceChild(cell, editor);
  }

  function beginStrokeEdit(valueCell) {
    if (!valueCell || !selectedElement || !currentSelection) return false;
    var editorTarget = selectedElement;
    var row = valueCell.parentElement;
    var previousModel = strokeModelForSelection();
    var sides = strokeSidesForDraft(null);
    // A non-uniform border opens straight into per-side mode on its first visible
    // side; a uniform border (or outline) opens in "all" mode like before.
    var firstVisibleSide = STROKE_SIDES.filter(function (name) { return strokeSideVisible(sides[name]); })[0] || "top";
    // "All" is uniform mode (single border + position control). Otherwise the user
    // edits one or more selected sides at once; selectedSides is the live multi-select.
    var uniform = !previousModel.perSide;
    var selectedSides = uniform ? [] : [firstVisibleSide];
    var seedSide = uniform ? previousModel : sides[firstVisibleSide];
    var model = {
      position: uniform ? previousModel.position : "inside",
      width: seedSide.width,
      style: seedSide.style,
      color: seedSide.color
    };
    var openState = snapshotStrokeEditState(editorTarget);
    var finished = false;
    var dirty = false;
    var editor = document.createElement("div");
    editor.className = "raven-grab-style-editor";
    editor.setAttribute("data-control", "stroke");

    var sideField = document.createElement("div");
    sideField.className = "raven-grab-stroke-field raven-grab-stroke-position";
    var sideLabel = document.createElement("span");
    sideLabel.textContent = "Sides";
    var sideGroup = document.createElement("div");
    sideGroup.className = "raven-grab-stroke-segmented raven-grab-stroke-sides";
    sideGroup.setAttribute("role", "group");
    sideGroup.setAttribute("aria-label", "Border sides (select one or more)");
    var sideButtons = {};
    [["all", "All"]].concat(STROKE_SIDES.map(function (name) { return [name, STROKE_SIDE_LABEL[name]]; })).forEach(function (entry) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = entry[1];
      button.setAttribute("data-stroke-side", entry[0]);
      sideButtons[entry[0]] = button;
      sideGroup.appendChild(button);
    });
    sideField.appendChild(sideLabel);
    sideField.appendChild(sideGroup);

    var widthField = document.createElement("label");
    widthField.className = "raven-grab-stroke-field";
    var widthLabel = document.createElement("span");
    widthLabel.textContent = "Width";
    var widthRow = document.createElement("span");
    widthRow.className = "raven-grab-stroke-width";
    var widthInput = document.createElement("input");
    widthInput.className = "raven-grab-style-input";
    widthInput.type = "text";
    widthInput.setAttribute("inputmode", "decimal");
    widthInput.setAttribute("aria-label", "Stroke width");
    widthInput.setAttribute("spellcheck", "false");
    var parsedWidth = parseNumericValue(model.width) || { number: "0", unit: "px" };
    widthInput.value = parsedWidth.number;
    var widthUnit = document.createElement("select");
    widthUnit.className = "raven-grab-style-unit";
    widthUnit.setAttribute("aria-label", "Stroke width unit");
    var initialUnit = parsedWidth.unit || "px";
    var units = STYLE_UNIT_OPTIONS.slice();
    if (units.indexOf(initialUnit) === -1) units.unshift(initialUnit);
    widthUnit.innerHTML = units.map(function (unit) { return optionMarkup(unit, unit, initialUnit); }).join("");
    widthUnit.value = initialUnit;
    widthRow.appendChild(widthInput);
    widthRow.appendChild(widthUnit);
    widthField.appendChild(widthLabel);
    widthField.appendChild(widthRow);

    var styleField = document.createElement("label");
    styleField.className = "raven-grab-stroke-field";
    var styleLabel = document.createElement("span");
    styleLabel.textContent = "Style";
    var styleSelect = document.createElement("select");
    styleSelect.className = "raven-grab-style-select";
    styleSelect.setAttribute("aria-label", "Stroke style");
    var strokeStyles = ["none", "solid", "dashed", "dotted", "double"];
    styleSelect.innerHTML = strokeStyles.map(function (styleName) { return optionMarkup(styleName, styleName, model.style); }).join("");
    styleSelect.value = strokeStyles.indexOf(model.style) === -1 ? "none" : model.style;
    styleField.appendChild(styleLabel);
    styleField.appendChild(styleSelect);

    var colorField = document.createElement("label");
    colorField.className = "raven-grab-stroke-field";
    var colorLabel = document.createElement("span");
    colorLabel.textContent = "Color";
    var colorRow = document.createElement("span");
    colorRow.className = "raven-grab-stroke-color";
    var colorInput = document.createElement("input");
    colorInput.className = "raven-grab-color-input";
    colorInput.type = "color";
    colorInput.value = colorInputValue(model.color);
    colorInput.setAttribute("aria-label", "Choose Stroke color");
    var colorText = document.createElement("input");
    colorText.className = "raven-grab-style-input";
    colorText.type = "text";
    colorText.value = model.color;
    colorText.setAttribute("aria-label", "Stroke color");
    colorText.setAttribute("spellcheck", "false");
    var colorFormat = document.createElement("select");
    colorFormat.className = "raven-grab-style-format";
    colorFormat.setAttribute("aria-label", "Stroke color format");
    var initialFormat = /^rgb/i.test(model.color) ? "rgb" : "hex";
    colorFormat.innerHTML = optionMarkup("hex", "HEX", initialFormat) + optionMarkup("rgb", "RGB", initialFormat);
    colorFormat.value = initialFormat;
    colorRow.appendChild(colorInput);
    colorRow.appendChild(colorText);
    colorRow.appendChild(colorFormat);
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorRow);

    var positionField = document.createElement("div");
    positionField.className = "raven-grab-stroke-field raven-grab-stroke-position";
    var positionLabel = document.createElement("span");
    positionLabel.textContent = "Position";
    var positionGroup = document.createElement("div");
    positionGroup.className = "raven-grab-stroke-segmented";
    positionGroup.setAttribute("role", "group");
    positionGroup.setAttribute("aria-label", "Stroke position");
    var insideButton = document.createElement("button");
    insideButton.type = "button";
    insideButton.textContent = "Inside";
    insideButton.setAttribute("data-stroke-position", "inside");
    var outsideButton = document.createElement("button");
    outsideButton.type = "button";
    outsideButton.textContent = "Outside";
    outsideButton.setAttribute("data-stroke-position", "outside");
    positionGroup.appendChild(insideButton);
    positionGroup.appendChild(outsideButton);
    positionField.appendChild(positionLabel);
    positionField.appendChild(positionGroup);
    var disclosure = document.createElement("p");
    disclosure.className = "raven-grab-stroke-disclosure";
    disclosure.textContent = "Inside uses CSS border-box; Outside uses outline.";

    editor.appendChild(sideField);
    editor.appendChild(widthField);
    editor.appendChild(styleField);
    editor.appendChild(colorField);
    editor.appendChild(positionField);
    editor.appendChild(disclosure);
    var suggestions = colorSuggestions("border-color", model.color);
    if (suggestions.length) {
      appendGroupedColorSuggestions(editor, "border-color", model.color, function (pickedValue) {
        colorText.value = normalizeColorEntry(pickedValue, colorText.value, colorFormat.value);
        colorInput.value = colorInputValue(colorText.value);
        preview();
      }, null);
    }
    valueCell.parentNode.replaceChild(editor, valueCell);

    function updatePositionButtons() {
      insideButton.setAttribute("aria-pressed", model.position === "inside" ? "true" : "false");
      outsideButton.setAttribute("aria-pressed", model.position === "outside" ? "true" : "false");
    }

    function updateSideButtons() {
      sideButtons.all.setAttribute("aria-pressed", uniform ? "true" : "false");
      STROKE_SIDES.forEach(function (name) {
        if (sideButtons[name]) sideButtons[name].setAttribute("aria-pressed", (!uniform && selectedSides.indexOf(name) !== -1) ? "true" : "false");
      });
      // Per-side is inside-only (outline can't be one-sided); the side picker hides
      // for Outside, and the position control hides while editing individual sides.
      sideField.style.display = model.position === "outside" ? "none" : "";
      positionField.style.display = uniform ? "" : "none";
      disclosure.style.display = uniform ? "" : "none";
    }

    function loadControlsFromValues(width, style, color) {
      var parsed = parseNumericValue(width) || { number: "0", unit: "px" };
      widthInput.value = parsed.number;
      if (parsed.unit) widthUnit.value = parsed.unit;
      var strokeStyleOptions = ["none", "solid", "dashed", "dotted", "double"];
      styleSelect.value = strokeStyleOptions.indexOf(style) === -1 ? "none" : style;
      colorText.value = color;
      colorInput.value = colorInputValue(color);
    }

    function readModel() {
      var expression = parseNumericExpression(widthInput.value.trim(), widthUnit.value || "px");
      if (!expression) return null;
      var width = formatNumericResult(expression.number) + (expression.unit || "px");
      var color = normalizeColorEntry(colorText.value, model.color, colorFormat.value);
      var style = styleSelect.value;
      if (uniform) return { position: model.position, width: width, style: style, color: color };
      var nextSides = {};
      STROKE_SIDES.forEach(function (name) {
        nextSides[name] = selectedSides.indexOf(name) !== -1
          ? { width: width, style: style, color: color }
          : { width: sides[name].width, style: sides[name].style, color: sides[name].color };
      });
      return { perSide: true, sides: nextSides };
    }

    function syncControls(nextModel) {
      if (nextModel && nextModel.perSide) {
        sides = nextModel.sides;
        var s = sides[selectedSides[0]] || sides.top;
        loadControlsFromValues(s.width, s.style, s.color);
        model.position = "inside";
      } else {
        loadControlsFromValues(nextModel.width, nextModel.style, nextModel.color);
        model = { position: nextModel.position, width: nextModel.width, style: nextModel.style, color: nextModel.color };
        STROKE_SIDES.forEach(function (name) { sides[name] = { width: nextModel.width, style: nextModel.style, color: nextModel.color }; });
      }
      updatePositionButtons();
      updateSideButtons();
    }

    function selectUniform() {
      uniform = true;
      if (model.position !== "outside") model.position = "inside";
      loadControlsFromValues(model.width, model.style, model.color);
      updatePositionButtons();
      updateSideButtons();
    }

    function toggleSide(name) {
      if (uniform) {
        // First per-side pick: narrow the controls to this side. Other sides keep
        // their existing border; nothing is written until the user edits.
        uniform = false;
        model.position = "inside";
        selectedSides = [name];
        var seed = sides[name] || { width: model.width, style: model.style, color: model.color };
        loadControlsFromValues(seed.width, seed.style, seed.color);
        updatePositionButtons();
        updateSideButtons();
        return;
      }
      var i = selectedSides.indexOf(name);
      if (i === -1) {
        // Add the side — it takes the border currently in the controls (preview writes it).
        selectedSides = selectedSides.concat([name]);
      } else if (selectedSides.length > 1) {
        // Deselecting a side means "no border here": drop it, then preview clears it.
        selectedSides = selectedSides.filter(function (n) { return n !== name; });
        sides[name] = { width: "0px", style: "none", color: sides[name].color };
      } else {
        return; // keep at least one side selected
      }
      updateSideButtons();
      preview();
    }

    function markError() {
      row.setAttribute("data-error", "true");
      setTimeout(function () {
        if (typeof row.removeAttribute === "function") row.removeAttribute("data-error");
      }, 600);
    }

    function preview() {
      if (finished || editorTarget !== selectedElement || editor.isConnected === false) return false;
      dirty = true;
      var nextModel = readModel();
      if (!nextModel) { markError(); return false; }
      var committed = commitStrokeEdit(nextModel, previousModel, openState);
      if (!committed) { markError(); return false; }
      syncControls(committed);
      row.setAttribute("data-edited", "true");
      row.removeAttribute("data-error");
      syncSendButtonDisabled();
      return true;
    }

    function cancel() {
      if (finished) return;
      finished = true;
      activeStyleEditorFlush = null;
      if (editorTarget === selectedElement) restoreStrokeEditState(openState);
      replaceStrokeEditor(editor, previousModel);
      syncSendButtonDisabled();
    }

    function commit() {
      if (finished) return;
      if (editorTarget !== selectedElement || editor.isConnected === false) {
        finished = true;
        activeStyleEditorFlush = null;
        return;
      }
      if (!dirty) {
        finished = true;
        activeStyleEditorFlush = null;
        replaceStrokeEditor(editor, previousModel);
        return;
      }
      var nextModel = readModel();
      var committed = nextModel ? commitStrokeEdit(nextModel, previousModel, openState) : false;
      finished = true;
      activeStyleEditorFlush = null;
      if (!committed) {
        restoreStrokeEditState(openState);
        markError();
        replaceStrokeEditor(editor, previousModel);
      } else replaceStrokeEditor(editor, committed);
      syncSendButtonDisabled();
    }

    widthInput.addEventListener("input", function () {
      var expression = parseNumericExpression(widthInput.value.trim(), widthUnit.value || "px");
      if (expression && expression.number > 0 && styleSelect.value === "none") styleSelect.value = "solid";
      preview();
    });
    widthUnit.addEventListener("change", preview);
    styleSelect.addEventListener("change", function () {
      if (styleSelect.value === "none") widthInput.value = "0";
      preview();
    });
    colorText.addEventListener("input", preview);
    colorInput.addEventListener("input", function () {
      colorText.value = normalizeColorEntry(colorInput.value, colorText.value, "hex");
      colorFormat.value = "hex";
      preview();
    });
    colorInput.addEventListener("change", function () {
      colorText.value = normalizeColorEntry(colorInput.value, colorText.value, "hex");
      colorFormat.value = "hex";
      preview();
    });
    colorFormat.addEventListener("change", function () {
      colorText.value = formatColorValue(colorText.value, colorFormat.value);
      preview();
    });
    insideButton.addEventListener("click", function () { model.position = "inside"; updatePositionButtons(); updateSideButtons(); preview(); });
    outsideButton.addEventListener("click", function () { uniform = true; model.position = "outside"; updatePositionButtons(); updateSideButtons(); preview(); });
    sideButtons.all.addEventListener("click", selectUniform);
    STROKE_SIDES.forEach(function (name) {
      if (!sideButtons[name]) return;
      sideButtons[name].addEventListener("click", function () { toggleSide(name); });
    });
    // colorInput excluded: opening its native OS color panel blurs it immediately
    // with relatedTarget === null (same as "clicked elsewhere"), which closed the
    // editor before a color could be picked. Its own input/change listeners above
    // already call preview(), which is enough to keep the edit live.
    var controls = [widthInput, widthUnit, styleSelect, colorText, colorFormat, insideButton, outsideButton]
      .concat(STROKE_SIDES.concat(["all"]).map(function (name) { return sideButtons[name]; }));
    controls.forEach(function (control) {
      control.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
        else if (event.key === "Enter") { event.preventDefault(); commit(); }
      });
      control.addEventListener("blur", function (event) {
        if (event.relatedTarget && typeof editor.contains === "function" && editor.contains(event.relatedTarget)) return;
        commit();
      });
    });
    updatePositionButtons();
    updateSideButtons();
    activeStyleEditorFlush = commit;
    widthInput.focus();
    widthInput.select();
    return true;
  }

  function beginTextDecorationEdit(valueCell) {
    if (!valueCell || !selectedElement) return false;
    var editorTarget = selectedElement;
    var property = "text-decoration";
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var model = parseTextDecorationModel(previousValue, selectedElement);
    var finished = false;
    var previewed = false;
    var hadEditAtOpen = !!styleEdits[property];
    var editor = document.createElement("div");
    editor.className = "raven-grab-style-editor";
    editor.setAttribute("data-control", "text-decoration");

    var lineField = document.createElement("label");
    lineField.className = "raven-grab-structured-field";
    var lineLabel = document.createElement("span");
    lineLabel.textContent = "Line";
    var lineSelect = document.createElement("select");
    lineSelect.className = "raven-grab-style-select";
    lineSelect.setAttribute("aria-label", "Text decoration line");
    var lineOptions = TEXT_DECORATION_LINES.slice();
    if (lineOptions.indexOf(model.line) === -1) lineOptions.unshift(model.line);
    lineSelect.innerHTML = lineOptions.map(function (opt) { return optionMarkup(opt, opt, model.line); }).join("");
    lineField.appendChild(lineLabel);
    lineField.appendChild(lineSelect);

    var styleField = document.createElement("label");
    styleField.className = "raven-grab-structured-field";
    var styleLabel = document.createElement("span");
    styleLabel.textContent = "Style";
    var styleSelect = document.createElement("select");
    styleSelect.className = "raven-grab-style-select";
    styleSelect.setAttribute("aria-label", "Text decoration style");
    var styleOptions = TEXT_DECORATION_STYLES.slice();
    if (styleOptions.indexOf(model.style) === -1) styleOptions.unshift(model.style);
    styleSelect.innerHTML = styleOptions.map(function (opt) { return optionMarkup(opt, opt, model.style); }).join("");
    styleField.appendChild(styleLabel);
    styleField.appendChild(styleSelect);

    var colorField = document.createElement("label");
    colorField.className = "raven-grab-structured-field raven-grab-structured-span";
    var colorLabel = document.createElement("span");
    colorLabel.textContent = "Color";
    var colorRow = document.createElement("span");
    colorRow.className = "raven-grab-structured-row";
    var colorInput = document.createElement("input");
    colorInput.className = "raven-grab-color-input";
    colorInput.type = "color";
    colorInput.value = colorInputValue(model.color === "currentColor" ? "#000000" : model.color);
    colorInput.setAttribute("aria-label", "Text decoration color");
    var colorText = document.createElement("input");
    colorText.className = "raven-grab-style-input";
    colorText.type = "text";
    colorText.value = model.color;
    colorText.setAttribute("spellcheck", "false");
    colorText.setAttribute("aria-label", "Text decoration color value");
    var colorFormat = document.createElement("select");
    colorFormat.className = "raven-grab-style-format";
    var initialFormat = model.color === "currentColor" ? "hex" : (/^rgb/i.test(model.color) ? "rgb" : "hex");
    colorFormat.innerHTML = optionMarkup("hex", "HEX", initialFormat) + optionMarkup("rgb", "RGB", initialFormat);
    colorFormat.value = initialFormat;
    colorRow.appendChild(colorInput);
    colorRow.appendChild(colorText);
    colorRow.appendChild(colorFormat);
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorRow);

    editor.appendChild(lineField);
    editor.appendChild(styleField);
    editor.appendChild(colorField);
    valueCell.parentNode.replaceChild(editor, valueCell);

    function readValue() {
      var color = colorText.value.trim() || "currentColor";
      if (color.toLowerCase() !== "currentcolor") {
        color = normalizeColorEntry(color, model.color, colorFormat.value === "rgb" ? "rgb" : "hex");
      } else {
        color = "currentColor";
      }
      return composeTextDecoration({ line: lineSelect.value, style: styleSelect.value, color: color });
    }

    function preview() {
      var next = readValue();
      if (next == null) return;
      previewed = previewStyleEdit(property, next) || previewed;
    }

    function cancel() {
      finished = true;
      activeStyleEditorFlush = null;
      if (previewed && editorTarget === selectedElement) {
        if (hadEditAtOpen) restoreCommittedValueWithSiblings(property, previousValue);
        else {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
      }
      cancelStyleEdit(lineSelect, previousValue);
    }

    function commit() {
      if (finished) return;
      if (editorTarget !== selectedElement || lineSelect.isConnected === false) {
        finished = true;
        activeStyleEditorFlush = null;
        return;
      }
      var next = readValue();
      finished = true;
      activeStyleEditorFlush = null;
      if (next == null || next === previousValue) {
        cancelStyleEdit(lineSelect, previousValue);
        if (previewed && editorTarget === selectedElement && !hadEditAtOpen) {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
        return;
      }
      var ok = commitStyleEdit(property, next, previousValue);
      if (!ok) cancelStyleEdit(lineSelect, previousValue);
      else replaceStyleInput(lineSelect, next);
    }

    function handleBlur(event) {
      if (event.relatedTarget && typeof editor.contains === "function" && editor.contains(event.relatedTarget)) return;
      commit();
    }

    [lineSelect, styleSelect, colorText, colorFormat].forEach(function (control) {
      control.addEventListener("change", function () {
        if (control === colorFormat && colorText.value.toLowerCase() !== "currentcolor") {
          colorText.value = formatColorValue(colorText.value, colorFormat.value);
        }
        preview();
        if (control === lineSelect || control === styleSelect) commit();
      });
      control.addEventListener("blur", handleBlur);
      control.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { event.preventDefault(); cancel(); }
        else if (event.key === "Enter") { event.preventDefault(); commit(); }
      });
    });
    colorInput.addEventListener("input", function () {
      colorText.value = normalizeColorEntry(colorInput.value, colorText.value, "hex");
      colorFormat.value = "hex";
      preview();
    });
    colorInput.addEventListener("change", commit);
    activeStyleEditorFlush = commit;
    lineSelect.focus();
    return true;
  }

  function beginBoxShadowEdit(valueCell) {
    if (!valueCell || !selectedElement) return false;
    var editorTarget = selectedElement;
    var property = "box-shadow";
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var model = parseBoxShadowModel(previousValue);
    var activePresetId = model.preset || "";
    var finished = false;
    var previewed = false;
    var hadEditAtOpen = !!styleEdits[property];
    var editor = document.createElement("div");
    editor.className = "raven-grab-style-editor";
    editor.setAttribute("data-control", "box-shadow");

    var presetField = document.createElement("div");
    presetField.className = "raven-grab-structured-field raven-grab-structured-span";
    var presetLabel = document.createElement("span");
    presetLabel.textContent = "Preset";
    var presetRow = document.createElement("div");
    presetRow.className = "raven-grab-shadow-presets";
    presetRow.setAttribute("role", "group");
    presetRow.setAttribute("aria-label", "Box shadow presets");
    var presetButtons = [];
    BOX_SHADOW_PRESETS.forEach(function (preset) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "raven-grab-shadow-preset";
      button.textContent = preset.label;
      button.setAttribute("data-shadow-preset", preset.id);
      button.setAttribute("aria-pressed", activePresetId === preset.id ? "true" : "false");
      presetButtons.push(button);
      presetRow.appendChild(button);
    });
    presetField.appendChild(presetLabel);
    presetField.appendChild(presetRow);

    function makeNumberField(labelText, aria, initial) {
      var field = document.createElement("label");
      field.className = "raven-grab-structured-field";
      var label = document.createElement("span");
      label.textContent = labelText;
      var input = document.createElement("input");
      input.className = "raven-grab-style-input";
      input.type = "text";
      input.setAttribute("inputmode", "decimal");
      input.setAttribute("aria-label", aria);
      input.setAttribute("spellcheck", "false");
      input.value = initial;
      field.appendChild(label);
      field.appendChild(input);
      return { field: field, input: input };
    }

    var xField = makeNumberField("X", "Box shadow X offset", model.x);
    var yField = makeNumberField("Y", "Box shadow Y offset", model.y);
    var blurField = makeNumberField("Blur", "Box shadow blur", model.blur);
    var spreadField = makeNumberField("Spread", "Box shadow spread", model.spread);

    var insetField = document.createElement("label");
    insetField.className = "raven-grab-structured-field raven-grab-structured-check raven-grab-structured-span";
    var insetInput = document.createElement("input");
    insetInput.type = "checkbox";
    insetInput.checked = !!model.inset;
    insetInput.setAttribute("aria-label", "Inset box shadow");
    var insetText = document.createElement("span");
    insetText.textContent = "Inset";
    insetField.appendChild(insetInput);
    insetField.appendChild(insetText);

    var colorField = document.createElement("label");
    colorField.className = "raven-grab-structured-field raven-grab-structured-span";
    var colorLabel = document.createElement("span");
    colorLabel.textContent = "Color";
    var colorRow = document.createElement("span");
    colorRow.className = "raven-grab-structured-row";
    var colorInput = document.createElement("input");
    colorInput.className = "raven-grab-color-input";
    colorInput.type = "color";
    colorInput.value = colorInputValue(model.color);
    colorInput.setAttribute("aria-label", "Box shadow color");
    var colorText = document.createElement("input");
    colorText.className = "raven-grab-style-input";
    colorText.type = "text";
    colorText.value = model.color;
    colorText.setAttribute("spellcheck", "false");
    var colorFormat = document.createElement("select");
    colorFormat.className = "raven-grab-style-format";
    var initialFormat = /^rgb/i.test(model.color) ? "rgb" : "hex";
    colorFormat.innerHTML = optionMarkup("hex", "HEX", initialFormat) + optionMarkup("rgb", "RGB", initialFormat);
    colorRow.appendChild(colorInput);
    colorRow.appendChild(colorText);
    colorRow.appendChild(colorFormat);
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorRow);

    editor.appendChild(presetField);
    editor.appendChild(xField.field);
    editor.appendChild(yField.field);
    editor.appendChild(blurField.field);
    editor.appendChild(spreadField.field);
    editor.appendChild(insetField);
    editor.appendChild(colorField);
    valueCell.parentNode.replaceChild(editor, valueCell);

    function syncPresetButtons(activeId) {
      activePresetId = activeId || "";
      for (var i = 0; i < presetButtons.length; i += 1) {
        presetButtons[i].setAttribute("aria-pressed", presetButtons[i].getAttribute("data-shadow-preset") === activePresetId ? "true" : "false");
      }
    }

    function readValue() {
      if (activePresetId === "none") return "none";
      return composeBoxShadow({
        inset: insetInput.checked,
        x: xField.input.value.trim() || "0",
        y: yField.input.value.trim() || "0",
        blur: blurField.input.value.trim() || "0",
        spread: spreadField.input.value.trim() || "0",
        color: normalizeColorEntry(colorText.value, model.color, colorFormat.value),
        unit: model.unit || "px"
      });
    }

    function applyPreset(preset) {
      syncPresetButtons(preset.id);
      if (preset.id === "none") {
        insetInput.checked = false;
        xField.input.value = "0";
        yField.input.value = "0";
        blurField.input.value = "0";
        spreadField.input.value = "0";
        colorText.value = "rgba(0, 0, 0, 0.2)";
        colorInput.value = colorInputValue(colorText.value);
        colorFormat.value = "rgb";
        return "none";
      }
      var parsed = parseBoxShadowModel(preset.value);
      insetInput.checked = parsed.inset;
      xField.input.value = parsed.x;
      yField.input.value = parsed.y;
      blurField.input.value = parsed.blur;
      spreadField.input.value = parsed.spread;
      colorText.value = parsed.color;
      colorInput.value = colorInputValue(parsed.color);
      colorFormat.value = /^rgb/i.test(parsed.color) ? "rgb" : "hex";
      model.unit = parsed.unit;
      return preset.value;
    }

    function preview(nextValue) {
      var next = nextValue != null ? nextValue : readValue();
      if (next == null) return;
      previewed = previewStyleEdit(property, next) || previewed;
    }

    function cancel() {
      finished = true;
      activeStyleEditorFlush = null;
      if (previewed && editorTarget === selectedElement) {
        if (hadEditAtOpen) restoreCommittedValueWithSiblings(property, previousValue);
        else {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
      }
      cancelStyleEdit(xField.input, previousValue);
    }

    function commit(nextValue) {
      if (finished) return;
      if (editorTarget !== selectedElement || xField.input.isConnected === false) {
        finished = true;
        activeStyleEditorFlush = null;
        return;
      }
      var next = nextValue != null ? nextValue : readValue();
      finished = true;
      activeStyleEditorFlush = null;
      if (next == null || next === previousValue) {
        cancelStyleEdit(xField.input, previousValue);
        if (previewed && editorTarget === selectedElement && !hadEditAtOpen) {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
        return;
      }
      var ok = commitStyleEdit(property, next, previousValue);
      if (!ok) cancelStyleEdit(xField.input, previousValue);
      else replaceStyleInput(xField.input, next);
    }

    function handleBlur(event) {
      if (event.relatedTarget && typeof editor.contains === "function" && editor.contains(event.relatedTarget)) return;
      commit();
    }

    presetButtons.forEach(function (button) {
      button.addEventListener("mousedown", function (event) { event.preventDefault(); });
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-shadow-preset");
        var preset = null;
        for (var i = 0; i < BOX_SHADOW_PRESETS.length; i += 1) {
          if (BOX_SHADOW_PRESETS[i].id === id) { preset = BOX_SHADOW_PRESETS[i]; break; }
        }
        if (!preset) return;
        var next = applyPreset(preset);
        preview(next);
        commit(next);
      });
    });

    [xField.input, yField.input, blurField.input, spreadField.input, colorText, colorFormat, insetInput].forEach(function (control) {
      control.addEventListener("change", function () {
        syncPresetButtons("");
        if (control === colorFormat) colorText.value = formatColorValue(colorText.value, colorFormat.value);
        preview();
        if (control === insetInput || control === colorFormat) commit();
      });
      control.addEventListener("input", function () {
        if (control === insetInput) return;
        syncPresetButtons("");
        preview();
      });
      control.addEventListener("blur", handleBlur);
      control.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { event.preventDefault(); cancel(); }
        else if (event.key === "Enter") { event.preventDefault(); commit(); }
      });
    });
    colorInput.addEventListener("input", function () {
      syncPresetButtons("");
      colorText.value = normalizeColorEntry(colorInput.value, colorText.value, "hex");
      colorFormat.value = "hex";
      preview();
    });
    colorInput.addEventListener("change", function () { commit(); });
    syncPresetButtons(activePresetId);
    activeStyleEditorFlush = commit;
    xField.input.focus();
    xField.input.select();
    return true;
  }

  function beginOverflowEdit(valueCell) {
    if (!valueCell || !selectedElement) return false;
    var editorTarget = selectedElement;
    var property = "overflow";
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var model = previousValue === MIXED_STYLE_VALUE
      ? { x: "visible", y: "visible" }
      : parseOverflowModel(previousValue, selectedElement);
    var finished = false;
    var previewed = false;
    var hadEditAtOpen = !!styleEdits[property];
    var editor = document.createElement("div");
    editor.className = "raven-grab-style-editor";
    editor.setAttribute("data-control", "overflow");

    function axisField(axisLabel, axisValue, ariaLabel) {
      var field = document.createElement("label");
      field.className = "raven-grab-structured-field";
      var label = document.createElement("span");
      label.textContent = axisLabel;
      var select = document.createElement("select");
      select.className = "raven-grab-style-select";
      select.setAttribute("aria-label", ariaLabel);
      var options = OVERFLOW_AXIS_OPTIONS.slice();
      if (options.indexOf(axisValue) === -1) options.unshift(axisValue);
      select.innerHTML = options.map(function (opt) { return optionMarkup(opt, opt, axisValue); }).join("");
      field.appendChild(label);
      field.appendChild(select);
      return { field: field, select: select };
    }

    var xAxis = axisField("X", model.x, "Overflow X");
    var yAxis = axisField("Y", model.y, "Overflow Y");
    editor.appendChild(xAxis.field);
    editor.appendChild(yAxis.field);
    valueCell.parentNode.replaceChild(editor, valueCell);

    function readValue() {
      return composeOverflow({ x: xAxis.select.value, y: yAxis.select.value });
    }

    function preview() {
      var next = readValue();
      previewed = previewStyleEdit(property, next) || previewed;
    }

    function cancel() {
      finished = true;
      activeStyleEditorFlush = null;
      if (previewed && editorTarget === selectedElement) {
        if (hadEditAtOpen) restoreCommittedValueWithSiblings(property, previousValue === MIXED_STYLE_VALUE ? "" : previousValue);
        else {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
      }
      cancelStyleEdit(xAxis.select, previousValue);
    }

    function commit() {
      if (finished) return;
      finished = true;
      activeStyleEditorFlush = null;
      var next = readValue();
      var ok = commitStyleEdit(property, next, previousValue);
      if (!ok && previewed) {
        restoreStyleEdit(property);
        delete styleEditOriginalInline[property];
      }
      replaceStyleInput(xAxis.select, ok ? next : previousValue);
      syncSendButtonDisabled();
    }

    [xAxis.select, yAxis.select].forEach(function (control) {
      control.addEventListener("change", function () { preview(); commit(); });
      control.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
        else if (event.key === "Enter") { event.preventDefault(); commit(); }
      });
      control.addEventListener("blur", function (event) {
        if (event.relatedTarget && typeof editor.contains === "function" && editor.contains(event.relatedTarget)) return;
        commit();
      });
    });
    activeStyleEditorFlush = commit;
    xAxis.select.focus();
    return true;
  }

  function beginSizeEdit(valueCell) {
    if (!valueCell || !selectedElement) return false;
    var editorTarget = selectedElement;
    var row = valueCell.parentElement;
    var property = row.getAttribute("data-style-property");
    if (property !== "width" && property !== "height") return false;
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var mode = sizeModeForValue(previousValue);
    var parsed = previousValue === MIXED_STYLE_VALUE ? null : parseNumericValue(previousValue);
    var finished = false;
    var previewed = false;
    var hadEditAtOpen = !!styleEdits[property];
    var editor = document.createElement("div");
    editor.className = "raven-grab-style-editor";
    editor.setAttribute("data-control", "size");

    var modeField = document.createElement("label");
    modeField.className = "raven-grab-structured-field raven-grab-structured-span";
    var modeLabel = document.createElement("span");
    modeLabel.textContent = "Mode";
    var modeSelect = document.createElement("select");
    modeSelect.className = "raven-grab-style-select";
    modeSelect.setAttribute("aria-label", property + " size mode");
    modeSelect.innerHTML = [
      optionMarkup("fixed", "Fixed", mode),
      optionMarkup("hug", "Hug", mode),
      optionMarkup("fill", "Fill", mode)
    ].join("");
    modeSelect.value = mode;
    modeField.appendChild(modeLabel);
    modeField.appendChild(modeSelect);

    var numberInput = document.createElement("input");
    numberInput.className = "raven-grab-style-input";
    numberInput.type = "text";
    numberInput.setAttribute("inputmode", "decimal");
    numberInput.setAttribute("data-style-input", property);
    numberInput.setAttribute("spellcheck", "false");
    numberInput.setAttribute("aria-label", property + " value");
    numberInput.value = parsed ? parsed.number : "";

    var unitSelect = document.createElement("select");
    unitSelect.className = "raven-grab-style-unit";
    unitSelect.setAttribute("aria-label", property + " unit");
    var units = STYLE_UNIT_OPTIONS.slice();
    var unit = parsed && parsed.unit ? parsed.unit : "px";
    if (units.indexOf(unit) === -1) units.unshift(unit);
    unitSelect.innerHTML = units.map(function (u) { return optionMarkup(u, u, unit); }).join("");
    unitSelect.value = unit;

    var valueRow = document.createElement("div");
    valueRow.className = "raven-grab-structured-row raven-grab-structured-span";
    valueRow.appendChild(numberInput);
    valueRow.appendChild(unitSelect);

    editor.appendChild(modeField);
    editor.appendChild(valueRow);
    valueCell.parentNode.replaceChild(editor, valueCell);

    function currentSizeMode() {
      return modeSelect.value || sizeModeForValue(previousValue === MIXED_STYLE_VALUE ? "" : previousValue);
    }

    function syncFixedEnabled() {
      var fixed = currentSizeMode() === "fixed";
      numberInput.disabled = !fixed;
      unitSelect.disabled = !fixed;
      valueRow.setAttribute("data-disabled", fixed ? "false" : "true");
    }

    function readValue() {
      var mode = currentSizeMode();
      if (mode === "fill" || mode === "hug") return sizeValueForMode(mode);
      var n = numberInput.value.trim();
      if (n === "") return "";
      var expression = parseNumericExpression(n, unitSelect.value || "px");
      if (!expression) return null;
      return formatNumericResult(expression.number) + expression.unit;
    }

    function preview() {
      var next = readValue();
      if (next == null) return;
      if (currentSizeMode() === "fixed" && numberInput.value.trim() === "" && previousValue !== MIXED_STYLE_VALUE) return;
      previewed = previewStyleEdit(property, next) || previewed;
    }

    function cancel() {
      finished = true;
      activeStyleEditorFlush = null;
      if (previewed && editorTarget === selectedElement) {
        if (hadEditAtOpen && previousValue !== MIXED_STYLE_VALUE) restoreCommittedValueWithSiblings(property, previousValue);
        else {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
      }
      cancelStyleEdit(numberInput, previousValue);
    }

    function commit() {
      if (finished) return;
      finished = true;
      activeStyleEditorFlush = null;
      var next = readValue();
      if (next == null) {
        if (previewed) {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
        row.setAttribute("data-error", "true");
        replaceStyleInput(numberInput, numberInput.value.trim());
        syncSendButtonDisabled();
        return;
      }
      if (currentSizeMode() === "fixed" && numberInput.value.trim() === "") {
        if (previewed) {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
        replaceStyleInput(numberInput, previousValue);
        syncSendButtonDisabled();
        return;
      }
      var ok = commitStyleEdit(property, next, previousValue);
      if (!ok && previewed) {
        restoreStyleEdit(property);
        delete styleEditOriginalInline[property];
      }
      replaceStyleInput(numberInput, ok ? next : previousValue);
      syncSendButtonDisabled();
    }

    modeSelect.addEventListener("change", function () {
      syncFixedEnabled();
      if (currentSizeMode() !== "fixed") preview();
      else if (numberInput.value.trim() !== "") preview();
    });
    numberInput.addEventListener("input", preview);
    unitSelect.addEventListener("change", preview);
    numberInput.addEventListener("keydown", function (event) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (currentSizeMode() !== "fixed") return;
        event.preventDefault();
        var delta = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowDown") delta *= -1;
        var stepped = steppedNumericValue(
          numberInput.value.trim() || (parsed ? String(parsed.number) : "0"),
          delta,
          unitSelect.value || "px"
        );
        if (stepped === null) return;
        var steppedParsed = parseNumericValue(stepped);
        if (!steppedParsed) return;
        numberInput.value = steppedParsed.number;
        if (steppedParsed.unit) unitSelect.value = steppedParsed.unit;
        preview();
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
      else if (event.key === "Enter") { event.preventDefault(); commit(); }
    });
    [modeSelect, unitSelect].forEach(function (control) {
      control.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
        else if (event.key === "Enter") { event.preventDefault(); commit(); }
      });
      control.addEventListener("blur", function (event) {
        if (event.relatedTarget && typeof editor.contains === "function" && editor.contains(event.relatedTarget)) return;
        commit();
      });
    });
    numberInput.addEventListener("blur", function (event) {
      if (event.relatedTarget && typeof editor.contains === "function" && editor.contains(event.relatedTarget)) return;
      commit();
    });
    syncFixedEnabled();
    activeStyleEditorFlush = commit;
    if (currentSizeMode() === "fixed") {
      numberInput.focus();
      numberInput.select();
    } else modeSelect.focus();
    return true;
  }

  function isTokenEditorControl(node) {
    if (!node || typeof node.getAttribute !== "function") return false;
    return node.getAttribute("data-token-choice") != null
      || node.getAttribute("data-token-unlink") != null
      || node.getAttribute("data-token-detach") != null
      || node.getAttribute("data-token-picker-search") != null
      || node.getAttribute("data-token-picker-value") != null
      || node.getAttribute("data-new-name") != null
      || node.getAttribute("data-new-value") != null
      || node.getAttribute("data-new-color") != null
      || (node.className && String(node.className).indexOf("raven-grab-token-inline") !== -1);
  }

  function isStyleValueControl(node) {
    if (!node || typeof node.getAttribute !== "function") return false;
    if (isTokenEditorControl(node)) return false;
    if (node.getAttribute("data-style-input") != null) return true;
    if (node.getAttribute("data-color-suggestion") != null) return true;
    var cls = String(node.className || "");
    return cls.indexOf("raven-grab-style-input") !== -1
      || cls.indexOf("raven-grab-style-select") !== -1
      || cls.indexOf("raven-grab-style-unit") !== -1
      || cls.indexOf("raven-grab-style-format") !== -1
      || cls.indexOf("raven-grab-color-input") !== -1
      || cls.indexOf("raven-grab-color-suggestion") !== -1;
  }

  function styleValueControlsInEditor(editor) {
    var controls = [];
    function visit(node) {
      if (!node) return;
      if (node.className === "raven-grab-token-inline") return;
      if (isStyleValueControl(node)) controls.push(node);
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i += 1) visit(kids[i]);
    }
    if (!editor) return controls;
    var top = editor.children || [];
    for (var t = 0; t < top.length; t += 1) visit(top[t]);
    return controls;
  }

  function setStyleEditorTokenLinked(editor, linked) {
    if (!editor || typeof editor.setAttribute !== "function") return;
    editor.setAttribute("data-token-linked", linked ? "true" : "false");
    var controls = styleValueControlsInEditor(editor);
    for (var i = 0; i < controls.length; i += 1) {
      var el = controls[i];
      if (linked) {
        el.setAttribute("disabled", "");
        el.setAttribute("data-token-locked", "true");
        el.disabled = true;
      } else {
        el.removeAttribute("disabled");
        el.removeAttribute("data-token-locked");
        el.disabled = false;
      }
    }
  }

  function detachTokenFromStyleEditor(editor, tokenIndex) {
    if (!editor) return;
    var token = resolveTokenByIntentKey(tokenIndex);
    var row = editor.parentElement;
    var property = row ? row.getAttribute("data-style-property") : "";
    var styleState = row ? row.getAttribute("data-style-state") : "";
    if (token && token.cssVar && previewOriginals[token.cssVar]) {
      restoreTokenPreviewEntries(token.cssVar, previewOriginals[token.cssVar]);
      delete previewOriginals[token.cssVar];
    }
    delete tokenIntents[normalizeIntentKey(tokenIndex)];
    if (token && property) {
      var resolvedValue = token.value || "";
      if (styleState) forceCommitStateStyleEdit(styleState, property, resolvedValue);
      else forceCommitStyleEdit(property, resolvedValue);
    }
    var kids = [];
    var top = editor.children || [];
    for (var c = 0; c < top.length; c += 1) kids.push(top[c]);
    for (var i = 0; i < kids.length; i += 1) {
      if (kids[i].className !== "raven-grab-token-inline") continue;
      if (kids[i].parentNode && typeof kids[i].parentNode.removeChild === "function") {
        kids[i].parentNode.removeChild(kids[i]);
      } else if (kids[i].parentNode && kids[i].parentNode.children) {
        var list = kids[i].parentNode.children;
        var at = list.indexOf(kids[i]);
        if (at !== -1) list.splice(at, 1);
        kids[i].parentElement = null;
        kids[i].parentNode = null;
      }
    }
    setStyleEditorTokenLinked(editor, false);
    syncActiveStyleDraftKey();
    syncSendButtonDisabled();
  }

  function detachTokenBinding(property, state) {
    var matched = matchedTokenEntryForProperty(property, state || null);
    if (!matched || !matched.token) return;
    var token = matched.token;
    var index = matched.index;
    if (token.cssVar && previewOriginals[token.cssVar]) {
      restoreTokenPreviewEntries(token.cssVar, previewOriginals[token.cssVar]);
      delete previewOriginals[token.cssVar];
    }
    delete tokenIntents[normalizeIntentKey(index)];
    var resolvedValue = token.value || "";
    if (state) forceCommitStateStyleEdit(state, property, resolvedValue);
    else forceCommitStyleEdit(property, resolvedValue);
    renderPanel();
    syncSendButtonDisabled();
  }

  function appendTokenChoiceEditor(editor, matched, relatedInternal, styleProperty) {
    if (!editor || !matched || !matched.token) return null;
    var token = matched.token;
    var index = matched.index;
    var indexStr = String(index);
    var alternatives = alternativesFor(token);
    var selectedChoice = selectedTokenChoice(index, alternatives);
    var intent = tokenIntents[normalizeIntentKey(index)];
    var colorProperty = styleProperty || token.property;
    var tokenBlock = document.createElement("div");
    tokenBlock.className = "raven-grab-token-inline";
    tokenBlock.setAttribute("data-token-index", indexStr);
    var selectLabel = document.createElement("label");
    selectLabel.className = "raven-grab-field";
    var selectCaption = document.createElement("span");
    selectCaption.textContent = "Design token";
    var choiceRow = document.createElement("div");
    choiceRow.className = "raven-grab-token-choice-row";
    var select = document.createElement("select");
    select.className = "raven-grab-select raven-grab-token-choice-source";
    select.setAttribute("data-token-choice", indexStr);
    select.setAttribute("aria-hidden", "true");
    select.setAttribute("tabindex", "-1");
    var optionsHtml = optionMarkup("", token.name + " · " + (token.value || "unresolved"), selectedChoice);
    alternatives.forEach(function (alternative) {
      optionsHtml += optionMarkup(alternative.cssVar, alternative.name + " · " + alternative.value, selectedChoice);
    });
    optionsHtml += optionMarkup("__new__", "New token…", selectedChoice);
    select.innerHTML = optionsHtml;
    var picker = document.createElement("div");
    picker.className = "raven-grab-token-picker";
    picker.setAttribute("data-token-picker", indexStr);
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "raven-grab-token-picker-trigger raven-grab-select";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    var menu = document.createElement("div");
    menu.className = "raven-grab-token-picker-menu";
    menu.setAttribute("data-open", "false");
    menu.setAttribute("role", "listbox");
    var searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "raven-grab-token-picker-search raven-grab-input";
    searchInput.setAttribute("placeholder", "Search tokens…");
    searchInput.setAttribute("data-token-picker-search", indexStr);
    searchInput.setAttribute("spellcheck", "false");
    var list = document.createElement("div");
    list.className = "raven-grab-token-picker-list";
    function currentPickerLabel() {
      var choice = select.value;
      if (!choice) return token.name + " · " + (token.value || "unresolved");
      if (choice === "__new__") return "New token…";
      var alt = tokenByCssVar(choice);
      return alt ? alt.name + " · " + alt.value : token.name + " · " + (token.value || "unresolved");
    }
    function rebuildPickerOptions(filterText) {
      while (list.firstChild) list.removeChild(list.firstChild);
      var filter = String(filterText || "").toLowerCase();
      var grouped = Object.create(null);
      var groupOrder = [];
      function addChoice(value, label, groupName) {
        var haystack = (label + " " + value).toLowerCase();
        if (filter && haystack.indexOf(filter) === -1) return;
        var groupKey = groupName || "Tokens";
        if (!grouped[groupKey]) {
          grouped[groupKey] = [];
          groupOrder.push(groupKey);
        }
        grouped[groupKey].push({ value: value, label: label });
      }
      addChoice("", token.name + " · " + (token.value || "unresolved"), token.group || "Tokens");
      alternatives.forEach(function (alternative) {
        addChoice(alternative.cssVar, alternative.name + " · " + alternative.value, alternative.group || "Tokens");
      });
      addChoice("__new__", "New token…", "Actions");
      groupOrder.forEach(function (groupName) {
        var label = document.createElement("div");
        label.className = "raven-grab-token-picker-group-label";
        label.textContent = groupName;
        list.appendChild(label);
        grouped[groupName].forEach(function (choice) {
          var optionButton = document.createElement("button");
          optionButton.type = "button";
          optionButton.className = "raven-grab-token-picker-option";
          optionButton.setAttribute("role", "option");
          optionButton.setAttribute("data-token-picker-value", choice.value);
          optionButton.textContent = choice.label;
          if (select.value === choice.value) optionButton.setAttribute("aria-selected", "true");
          optionButton.addEventListener("mousedown", function (event) { event.preventDefault(); });
          optionButton.addEventListener("click", function () {
            select.value = choice.value;
            trigger.textContent = currentPickerLabel();
            menu.setAttribute("data-open", "false");
            trigger.setAttribute("aria-expanded", "false");
            select.dispatchEvent(new Event("change", { bubbles: true }));
            updateIntent(index);
            syncSendButtonDisabled();
          });
          list.appendChild(optionButton);
        });
      });
    }
    trigger.textContent = currentPickerLabel();
    rebuildPickerOptions("");
    searchInput.addEventListener("input", function () { rebuildPickerOptions(searchInput.value); });
    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var open = menu.getAttribute("data-open") === "true";
      menu.setAttribute("data-open", open ? "false" : "true");
      trigger.setAttribute("aria-expanded", open ? "false" : "true");
      if (!open) {
        rebuildPickerOptions(searchInput.value);
        searchInput.focus();
      }
    });
    menu.appendChild(searchInput);
    menu.appendChild(list);
    picker.appendChild(trigger);
    picker.appendChild(menu);
    var unlinkBtn = document.createElement("button");
    unlinkBtn.type = "button";
    unlinkBtn.className = "raven-grab-token-unlink";
    unlinkBtn.setAttribute("data-token-unlink", indexStr);
    unlinkBtn.setAttribute("aria-label", "Detach design token");
    unlinkBtn.setAttribute("title", "Detach token");
    unlinkBtn.innerHTML = linkBreakSvg();
    choiceRow.appendChild(picker);
    choiceRow.appendChild(select);
    choiceRow.appendChild(unlinkBtn);
    selectLabel.appendChild(selectCaption);
    selectLabel.appendChild(choiceRow);
    tokenBlock.appendChild(selectLabel);
    var newFields = document.createElement("div");
    newFields.className = "raven-grab-new-token";
    newFields.setAttribute("data-new-token", indexStr);
    newFields.setAttribute("data-open", selectedChoice === "__new__" ? "true" : "false");
    var nameLabel = document.createElement("label");
    nameLabel.className = "raven-grab-field";
    nameLabel.innerHTML = "<span>Name</span>";
    var nameInput = document.createElement("input");
    nameInput.className = "raven-grab-input";
    nameInput.setAttribute("data-new-name", indexStr);
    nameInput.value = intent && intent.newToken ? intent.newToken : "";
    nameInput.placeholder = "e.g. accent-soft";
    nameLabel.appendChild(nameInput);
    var valueLabel = document.createElement("label");
    valueLabel.className = "raven-grab-field";
    valueLabel.innerHTML = "<span>Value</span>";
    var valueInput = document.createElement("input");
    valueInput.className = "raven-grab-input";
    valueInput.setAttribute("data-new-value", indexStr);
    valueInput.setAttribute("spellcheck", "false");
    valueInput.value = intent && intent.newTokenValue ? intent.newTokenValue : (token.value || "");
    valueInput.placeholder = isColorProperty(colorProperty) ? "#000000" : "CSS value";
    if (isColorProperty(colorProperty)) {
      var colorWrap = document.createElement("span");
      colorWrap.className = "raven-grab-color-editor";
      var colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "raven-grab-color-input";
      colorInput.setAttribute("data-new-color", indexStr);
      colorInput.value = colorInputValue(intent && intent.newTokenValue ? intent.newTokenValue : token.value);
      colorInput.setAttribute("aria-label", "Choose " + token.property + " color");
      colorWrap.appendChild(colorInput);
      colorWrap.appendChild(valueInput);
      valueLabel.appendChild(colorWrap);
      relatedInternal.push(colorInput);
      colorInput.addEventListener("input", function () {
        valueInput.value = colorInput.value;
        updateIntent(index);
      });
    } else {
      valueLabel.appendChild(valueInput);
    }
    newFields.appendChild(nameLabel);
    newFields.appendChild(valueLabel);
    tokenBlock.appendChild(newFields);
    editor.insertBefore(tokenBlock, editor.firstChild);
    relatedInternal.push(select, trigger, searchInput, unlinkBtn, nameInput, valueInput);
    select.addEventListener("change", function () {
      trigger.textContent = currentPickerLabel();
      newFields.setAttribute("data-open", select.value === "__new__" ? "true" : "false");
      updateIntent(index);
      syncSendButtonDisabled();
    });
    nameInput.addEventListener("input", function () { updateIntent(index); syncSendButtonDisabled(); });
    valueInput.addEventListener("input", function () { updateIntent(index); syncSendButtonDisabled(); });
    return { select: select, unlinkBtn: unlinkBtn, tokenBlock: tokenBlock, index: index, trigger: trigger };
  }

  function beginStyleEdit(valueCell) {
    var editorTarget = selectedElement;
    var row = valueCell.parentElement;
    var property = row.getAttribute("data-style-property");
    var styleState = row.getAttribute("data-style-state");
    if (property === "__raven-stroke__") return beginStrokeEdit(valueCell);
    if (property === "text-decoration") return beginTextDecorationEdit(valueCell);
    if (property === "box-shadow") {
      // Only the single-layer structured editor is safe here; a stacked shadow
      // falls through to the plain-text editor so its extra layers survive commit.
      var shadowRaw = valueCell.getAttribute("data-style-raw");
      if (shadowRaw == null) shadowRaw = valueCell.textContent;
      if (shadowLayerCount(shadowRaw) <= 1) return beginBoxShadowEdit(valueCell);
    }
    if (property === "overflow") return beginOverflowEdit(valueCell);
    if (property === "width" || property === "height") return beginSizeEdit(valueCell);
    // Edit the ORIGINAL unrounded computed value, not the display-rounded text —
    // otherwise editing one component of a compound value (box-shadow, transition)
    // silently rewrites the untouched components at reduced precision.
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var control = classifyStyleControl(property, previousValue);
    var finished = false;
    var previewed = false;
    var pendingTokenPick = null;
    var stateEditKey = styleState ? stateStyleEditKey(styleState, property) : null;
    var hadEditAtOpen = styleState ? !!stateStyleEdits[stateEditKey] : !!styleEdits[property];
    var matchedToken = matchedTokenEntryForProperty(property, styleState);

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
    var tokenUi = appendTokenChoiceEditor(editor, matchedToken, relatedInternal, property);

    if (control === "enum") {
      var select = document.createElement("select");
      select.className = "raven-grab-style-select";
      select.setAttribute("data-style-input", property);
      var options = enumOptionsForProperty(property, previousValue === MIXED_STYLE_VALUE ? "" : previousValue);
      var enumHtml = "";
      if (previousValue === MIXED_STYLE_VALUE) {
        enumHtml += '<option value="" disabled selected>Mixed</option>';
      }
      enumHtml += options.map(function (opt) {
        var label = property === "font-family" ? fontFamilyOptionLabel(opt) : opt;
        return optionMarkup(opt, label, previousValue === MIXED_STYLE_VALUE ? "" : previousValue);
      }).join("");
      select.innerHTML = enumHtml;
      input = select;
      focusTarget = select;
      editor.appendChild(select);
    } else if (control === "number") {
      var parsed = parseNumericValue(previousValue);
      input.type = "text";
      input.value = parsed.number;
      input.setAttribute("inputmode", "decimal");
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
        unitSelect.value = parsed.unit;
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
      formatSelect.value = initialFormat;
      editor.appendChild(colorInput);
      editor.appendChild(input);
      editor.appendChild(formatSelect);
      // All three participate in one editor; a blur to any of them must NOT commit.
      relatedInternal.push(input, colorInput, formatSelect);
      var reformat = function () { input.value = formatColorValue(input.value, formatSelect.value); };
      formatSelect.addEventListener("change", reformat);
      // input fires on every drag tick inside a native <input type=color> panel —
      // committing (which tears down the editor) on each tick closed the editor
      // after the first pixel of movement. Only preview on input; commit on change,
      // which fires once when the native panel is dismissed.
      var previewColor = function () {
        input.value = normalizeColorEntry(colorInput.value, input.value, "hex");
        formatSelect.value = "hex";
        if (styleState) previewed = previewStateStyleEdit(styleState, property, input.value) || previewed;
        else previewed = previewStyleEdit(property, input.value) || previewed;
      };
      var commitColor = function () {
        input.value = normalizeColorEntry(colorInput.value, input.value, "hex");
        formatSelect.value = "hex";
        commit();
      };
      input.addEventListener("input", function () { pendingTokenPick = null; });
      colorInput.addEventListener("input", function () { pendingTokenPick = null; });
      colorInput.addEventListener("input", previewColor);
      colorInput.addEventListener("change", commitColor);
      // No blur->commit on colorInput: opening the native color panel blurs the
      // input immediately with relatedTarget === null, indistinguishable from
      // "user clicked elsewhere" — that closed the editor before a color could be
      // picked. change (above) is the correct "picker closed" signal.
      formatSelect.addEventListener("blur", handleBlur);
      appendGroupedColorSuggestions(editor, property, previousValue, function (pickedValue, tokenMeta) {
        input.value = normalizeColorEntry(pickedValue, previousValue, formatSelect.value);
        colorInput.value = colorInputValue(input.value);
        pendingTokenPick = tokenMeta;
        // A suggestion pick is a decisive choice, like dismissing the native
        // panel — commit it. Preview-only left the pick stranded: the chip's
        // mousedown preventDefault means no blur ever fires, so nothing was
        // queued and the preview silently reverted on the next click-away.
        commit();
      }, relatedInternal);
    } else {
      input.type = "text";
      input.value = previousValue;
      editor.appendChild(input);
    }

    if (tokenUi) {
      setStyleEditorTokenLinked(editor, true);
      focusTarget = tokenUi.trigger || tokenUi.select;
      tokenUi.unlinkBtn.addEventListener("mousedown", function (event) { event.preventDefault(); });
      tokenUi.unlinkBtn.addEventListener("click", function () {
        detachTokenFromStyleEditor(editor, tokenUi.index);
        focusTarget = input;
        if (typeof input.focus === "function") input.focus();
        if (typeof input.select === "function") input.select();
      });
    }

    valueCell.parentNode.replaceChild(editor, valueCell);
    focusTarget.focus();
    if (typeof focusTarget.select === "function") focusTarget.select();

    function previewValue(newValue) {
      if (styleState) return previewStateStyleEdit(styleState, property, newValue);
      return previewStyleEdit(property, newValue);
    }

    function rollbackPreviewState() {
      if (!previewed) return;
      if (styleState) clearStateStylePreview();
      else if (editorTarget === selectedElement) {
        if (hadEditAtOpen) {
          restoreCommittedValueWithSiblings(property, previousValue);
        }
        else {
          restoreStyleEdit(property);
          delete styleEditOriginalInline[property];
        }
      }
      previewed = false;
    }

    function readValue() {
      if (control === "number") {
        var n = input.value.trim();
        if (n === "") return "";
        var expression = parseNumericExpression(n, input.unitSelect ? input.unitSelect.value : "");
        if (!expression) return null;
        return formatNumericResult(expression.number) + expression.unit;
      }
      if (control === "color") return normalizeColorEntry(input.value, previousValue, formatSelect.value);
      return input.value.trim();
    }

    function cancel() {
      finished = true;
      activeStyleEditorFlush = null;
      rollbackPreviewState();
      cancelStyleEdit(input, previousValue);
    }

    function rollbackPreview() {
      rollbackPreviewState();
    }

    function commit() {
      var tokenMeta = pendingTokenPick;
      pendingTokenPick = null;
      if (finished) return;
      // Linked to a design token — Figma-style friction: refuse raw style writes
      // until the user explicitly detaches via the link-break control.
      if (editor.getAttribute("data-token-linked") === "true") return;
      // A commit whose editor left the DOM or whose element is no longer primary is stale
      // (renderPanel replaced the editor / selection moved on) — cancel instead of writing
      // the old typed value onto the current selection.
      if (editorTarget !== selectedElement || input.isConnected === false) {
        finished = true;
        activeStyleEditorFlush = null;
        return;
      }
      var newValue = readValue();
      if (newValue === null) {
        finished = true;
        activeStyleEditorFlush = null;
        rollbackPreview();
        row.setAttribute("data-error", "true");
        replaceStyleInput(input, input.value.trim());
        syncSendButtonDisabled();
        return;
      }
      finished = true;
      activeStyleEditorFlush = null;
      var committed = styleState
        ? commitStateStyleEdit(styleState, property, newValue, previousValue, tokenMeta)
        : commitStyleEdit(property, newValue, previousValue, tokenMeta);
      if (!committed) {
        // Nothing was written, so any live preview must not survive the editor —
        // committing "the original value" after a picker preview otherwise left
        // the previewed color inline with nothing queued. Error styling only
        // when an actual change failed; re-choosing the original is a no-op.
        rollbackPreview();
        if (newValue !== previousValue) {
          row.setAttribute("data-error", "true");
          setTimeout(function () {
            if (typeof row.removeAttribute === "function") row.removeAttribute("data-error");
          }, 600);
        }
      }
      replaceStyleInput(input, committed ? newValue : previousValue);
      syncSendButtonDisabled();
    }
    activeStyleEditorFlush = commit;

    input.addEventListener("keydown", function (event) {
      if (control === "number" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        var delta = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowDown") delta *= -1;
        var stepped = steppedNumericValue(input.value, delta, input.unitSelect ? input.unitSelect.value : "");
        if (stepped !== null) {
          var parsedStep = parseNumericValue(stepped);
          input.value = parsedStep.number;
          previewed = previewValue(stepped) || previewed;
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    });
    function handleBlur(event) {
      if (relatedInternal.indexOf(event.relatedTarget) !== -1) return;
      commit();
    }
    input.addEventListener("blur", handleBlur);
    if (control === "enum") input.addEventListener("change", commit);
  }

  function beginStyleScrub(label, event) {
    if (!label || !selectedElement || activeStyleScrub) return false;
    var row = typeof label.closest === "function" ? label.closest("[data-style-property]") : label.parentElement;
    if (!row) return false;
    // Token-bound properties must be detached before scrubbing raw values.
    if (row.getAttribute("data-token-index") != null) return false;
    var property = row.getAttribute("data-style-property");
    var valueCell = row.querySelector("[data-style-value]");
    if (!valueCell) return false;
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var parsed = parseNumericValue(previousValue);
    if (!parsed) return false;
    var target = selectedElement;
    var startX = event.clientX;
    var decimal = parsed.number.indexOf(".");
    var precision = decimal === -1 ? 0 : parsed.number.length - decimal - 1;
    var latestValue = previousValue;
    var moved = false;
    var hadEditAtOpen = !!styleEdits[property];

    function cleanup() {
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", release, true);
      window.removeEventListener("blur", cancel);
      activeStyleScrub = null;
    }

    function rollback() {
      if (!moved || target !== selectedElement) return;
      if (hadEditAtOpen) restoreCommittedValueWithSiblings(property, previousValue);
      else {
        restoreStyleEdit(property);
        delete styleEditOriginalInline[property];
      }
      valueCell.setAttribute("data-style-raw", previousValue);
      valueCell.textContent = displayComputedStyleValue(previousValue);
    }

    function move(moveEvent) {
      if (target !== selectedElement || valueCell.isConnected === false) { cancel(); return; }
      var delta = moveEvent.clientX - startX;
      if (moveEvent.shiftKey) delta *= 10;
      var nextNumber = Number(parsed.number) + delta;
      var nextText = precision ? nextNumber.toFixed(precision) : String(Math.round(nextNumber));
      var nextValue = nextText + parsed.unit;
      if (!previewStyleEdit(property, nextValue)) return;
      moved = true;
      latestValue = nextValue;
      valueCell.setAttribute("data-style-raw", nextValue);
      valueCell.textContent = displayComputedStyleValue(nextValue);
      moveEvent.preventDefault();
    }

    function release() {
      cleanup();
      if (!moved || target !== selectedElement || valueCell.isConnected === false) return;
      commitStyleEdit(property, latestValue, previousValue);
      row.setAttribute("data-edited", styleEdits[property] ? "true" : "false");
      syncSendButtonDisabled();
    }

    function cancel() {
      rollback();
      cleanup();
    }

    activeStyleScrub = { cancel: cancel };
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", release, true);
    window.addEventListener("blur", cancel);
    event.preventDefault();
    return true;
  }

  function parseBorderRadius(value) {
    var text = String(value || "").trim();
    if (!text || text.indexOf("/") !== -1) return null;
    var parts = text.split(/\s+/);
    if (parts.length < 1 || parts.length > 4) return null;
    for (var i = 0; i < parts.length; i += 1) {
      if (!parseNumericValue(parts[i])) return null;
    }
    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
    return parts;
  }

  function composeBorderRadius(corners) {
    if (!corners || corners.length !== 4) return "";
    if (corners[0] === corners[1] && corners[0] === corners[2] && corners[0] === corners[3]) return corners[0];
    if (corners[0] === corners[2] && corners[1] === corners[3]) return corners[0] + " " + corners[1];
    if (corners[1] === corners[3]) return corners[0] + " " + corners[1] + " " + corners[2];
    return corners.join(" ");
  }

  function beginRadiusEdit(row) {
    if (!row || !selectedElement) return false;
    var valueCell = row.querySelector("[data-style-value]");
    if (!valueCell) return false;
    var previousValue = valueCell.getAttribute("data-style-raw");
    if (previousValue == null) previousValue = valueCell.textContent;
    var corners = parseBorderRadius(previousValue);
    if (!corners) { beginStyleEdit(valueCell); return false; }
    var editorTarget = selectedElement;
    var finished = false;
    var previewed = false;
    var hadEditAtOpen = !!styleEdits["border-radius"];
    var matchedToken = matchedTokenEntryForProperty("border-radius");
    var editor = document.createElement("div");
    editor.className = "raven-grab-style-editor";
    editor.setAttribute("data-control", "radius");
    var relatedInternal = [];
    var tokenUi = appendTokenChoiceEditor(editor, matchedToken, relatedInternal, "border-radius");
    var grid = document.createElement("div");
    grid.className = "raven-grab-radius-editor";
    var inputs = [];
    var cornerNames = ["top-left", "top-right", "bottom-right", "bottom-left"];
    var cornerLabels = ["TL", "TR", "BR", "BL"];

    function readCorners() {
      return inputs.map(function (input) { return input.value.trim(); });
    }

    function preview() {
      var nextValue = composeBorderRadius(readCorners());
      if (!nextValue) return;
      previewed = previewStyleEdit("border-radius", nextValue) || previewed;
    }

    function cancel() {
      finished = true;
      activeStyleEditorFlush = null;
      if (previewed && editorTarget === selectedElement) {
        if (hadEditAtOpen) restoreCommittedValueWithSiblings("border-radius", previousValue);
        else {
          restoreStyleEdit("border-radius");
          delete styleEditOriginalInline["border-radius"];
        }
      }
      cancelStyleEdit(inputs[0], previousValue);
    }

    function commit() {
      if (finished) return;
      if (editor.getAttribute("data-token-linked") === "true") return;
      finished = true;
      activeStyleEditorFlush = null;
      if (editorTarget !== selectedElement || inputs[0].isConnected === false) return;
      var nextValue = composeBorderRadius(readCorners());
      var committed = commitStyleEdit("border-radius", nextValue, previousValue);
      if (!committed && previewed) {
        if (hadEditAtOpen) restoreCommittedValueWithSiblings("border-radius", previousValue);
        else {
          restoreStyleEdit("border-radius");
          delete styleEditOriginalInline["border-radius"];
        }
      }
      replaceStyleInput(inputs[0], committed ? nextValue : previousValue);
      syncSendButtonDisabled();
    }

    corners.forEach(function (corner, index) {
      var field = document.createElement("label");
      field.className = "raven-grab-radius-field";
      var fieldLabel = document.createElement("span");
      fieldLabel.textContent = cornerLabels[index];
      var input = document.createElement("input");
      input.type = "text";
      input.value = corner;
      input.setAttribute("data-radius-corner", cornerNames[index]);
      input.setAttribute("aria-label", "Border radius " + cornerNames[index]);
      input.setAttribute("spellcheck", "false");
      field.appendChild(fieldLabel);
      field.appendChild(input);
      grid.appendChild(field);
      inputs.push(input);
      input.addEventListener("input", preview);
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
      });
      input.addEventListener("blur", function (event) {
        if (inputs.indexOf(event.relatedTarget) !== -1) return;
        commit();
      });
    });
    editor.appendChild(grid);
    if (tokenUi) {
      setStyleEditorTokenLinked(editor, true);
      tokenUi.unlinkBtn.addEventListener("mousedown", function (event) { event.preventDefault(); });
      tokenUi.unlinkBtn.addEventListener("click", function () {
        detachTokenFromStyleEditor(editor, tokenUi.index);
        inputs[0].focus();
      });
    }
    valueCell.parentNode.replaceChild(editor, valueCell);
    (tokenUi && tokenUi.trigger ? tokenUi.trigger : inputs[0]).focus();
    if (!tokenUi || !tokenUi.trigger) inputs[0].select();
    activeStyleEditorFlush = commit;
    return true;
  }

  function optionMarkup(value, label, selectedValue) {
    return '<option value="' + escapeHtml(value) + '"' + (value === selectedValue ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function isMaintainerCreateFlow() {
    return grabRole === "maintainer" && activeTabB === "assets";
  }

  function isComponentAssetsFlow() {
    return activeTabB === "assets";
  }

  function captureTemplateDrafts() {
    var nameInput = panelQuery("[data-template-name]");
    var filterInput = panelQuery("[data-template-filter]");
    var fixedNoteInput = panelQuery("[data-fixed-move-note]");
    if (nameInput) templateName = nameInput.value;
    if (filterInput) templateFilter = filterInput.value;
    if (fixedNoteInput) fixedMoveNote = fixedNoteInput.value;
    var activeDraft = activeLayerOrderDraft();
    if (activeDraft) activeDraft.fixedMoveNote = fixedMoveNote;
    var notes = panelQueryAll("[data-template-note]");
    Array.prototype.forEach.call(notes, function (input) {
      var id = input.getAttribute("data-template-note");
      for (var i = 0; i < templateDrafts.length; i += 1) {
        if (String(templateDrafts[i].nodeId) === String(id)) templateDrafts[i].note = input.value;
      }
    });
  }

  function queryResolves(selector) {
    try { return !!document.querySelector(selector); } catch (error) { return false; }
  }

  function loadTemplate() {
    if (templateLoading || templateLoaded) return;
    templateLoading = true;
    templateLoadPending = true;
    fetch(bridgeUrl("/template") + "&page=" + encodeURIComponent(location.pathname))
      .then(function (response) {
        if (!response.ok) throw new Error("Bridge returned " + response.status);
        return response.json();
      })
      .then(function (data) {
        templateId = data.templateId || "default";
        if (!templateName && templateId !== "default") templateName = templateId;
        templateSlots = Array.isArray(data.slots) ? data.slots.map(function (slot) {
          return { slotId: slot.slotId, selector: slot.selector, role: slot.role, note: slot.note || "", resolved: queryResolves(slot.selector) };
        }) : [];
        restoreTemplateDraftsFromSlots();
        templateLoaded = true;
        return fetch(bridgeUrl("/template-validation"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: location.pathname, results: templateSlots.map(function (slot) {
            return { slotId: slot.slotId, selector: slot.selector, resolved: slot.resolved };
          }) })
        });
      })
      .then(function () {
        templateLoading = false;
        templateLoadPending = false;
        if (activeTabB === "assets" || activeTabB === "layers") renderPanel();
      })
      .catch(function (error) {
        templateLoading = false;
        templateLoadPending = false;
        // Running without a bridge is the normal standalone case, not a failure:
        // report it as an empty state and keep the console clean. Only a bridge that
        // answered and then broke is worth an error.
        var noBridge = error instanceof TypeError || /\b404\b/.test(String(error && error.message));
        if (activeTabB === "assets") {
          if (noBridge) setPanelStatus("Templates appear when a Raven bridge is connected", "", "b");
          else setPanelStatus("Could not load template slots", "error", "b");
        }
        if (activeTabB === "layers") renderPanel();
        if (!noBridge) console.error("[Raven Grab] GET /template failed.", error);
      });
  }

  function setTemplateRole(index, role) {
    captureTemplateDrafts();
    for (var i = 0; i < templateDrafts.length; i += 1) {
      if (String(templateDrafts[i].nodeId) === String(index)) templateDrafts[i].role = role;
    }
    renderPanel();
  }

  function layerNodeList(node) {
    var output = [];
    var pending = node ? [node] : [];
    while (pending.length) {
      var current = pending.pop();
      if (!current || current.truncated) continue;
      output.push(current);
      for (var i = current.children.length - 1; i >= 0; i -= 1) {
        pending.push(current.children[i]);
      }
    }
    return output;
  }

  function orderedSelection() {
    var live = [];
    var previousPrimary = selectedElement;
    var previousActiveDraft = activeStyleDraft();
    localStyleDrafts().forEach(function (draft) {
      if (!draft.target) { dropStyleDraft(draft, true); return; }
      if (draft.target.isConnected === false && !draftAwaitingReconnect(draft)) dropStyleDraft(draft, true);
    });
    multiSelections.forEach(function (element) {
      if (!element || element.isConnected === false || live.indexOf(element) !== -1) return;
      live.push(element);
    });
    // Pruning a detached multi-grab member also drops component scope (match set
    // may no longer describe the live selection). Badge chrome refreshes on the
    // next renderMultiBadges call (scroll/resize/setEditScope/applySelection) —
    // do not call it here: renderMultiBadges → visualBadgeElements → orderedSelection
    // would re-enter while multiSelections is mid-update.
    if (live.length !== multiSelections.length) editScope = "instance";
    multiSelections = live;
    if (live.indexOf(selectedElement) === -1) selectedElement = live.length ? live[live.length - 1] : null;
    if (selectionAnchor && selectionAnchor.isConnected === false) selectionAnchor = selectedElement;
    if (previousPrimary !== selectedElement) {
      // Detached-primary work is explicit cancellation: restore/drop its active
      // or stored preview before promoting a fallback. A same-selector replacement
      // is a different element and must never inherit this draft.
      if (previousPrimary && previousPrimary.isConnected === false) {
        var detachedActiveDraft = previousActiveDraft;
        if (detachedActiveDraft && detachedActiveDraft.target === previousPrimary) dropStyleDraft(detachedActiveDraft, true);
        var detachedStoredDraft = styleDraftForElement(previousPrimary);
        if (detachedStoredDraft) dropStyleDraft(detachedStoredDraft, true);
        resetSelectionLocalContext();
      }
      currentSelection = selectedElement ? selectionFor(selectedElement) : null;
      if (previousPrimary && previousPrimary.isConnected === false && selectedElement) activateStyleDraft(selectedElement);
      setHighlight(selectedElement);
    }
    return live;
  }

  function selectionHasElement(element) {
    // Visual selection membership — same set as canvas multi-badges. Component
    // scope includes live matchSelector siblings; instance scope is the pruned
    // multiSelections. During renderPanel the list is snapshotted once into
    // selectionMembershipForRender so the 500-node tree does not re-prune.
    if (!element) return false;
    var membership = selectionMembershipForRender || visualBadgeElements();
    return membership.indexOf(element) !== -1;
  }

  function visiblePanelSelectionElements() {
    var nodes = activeTabB === "layers" ? visibleLayerNodes() : layerNodeList(layerTree);
    return nodes.filter(function (node) {
      return activeTabB !== "assets" || !!templateDraftForNode(node.id);
    }).map(function (node) {
      return layerElements.get(node.id);
    }).filter(function (element) {
      return !!element && element.isConnected !== false;
    });
  }

  function slotIdForLayer(node) {
    var label = String(node && node.label ? node.label : "layer").replace(/\s+·\s+/g, "-").toLowerCase();
    label = label.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return (label || "layer").slice(0, 48);
  }

  function uniqueSlotIdForLayer(node) {
    var base = slotIdForLayer(node);
    var candidate = base;
    var suffix = 2;
    while (templateDrafts.some(function (slot) { return slot.slotId === candidate; })) {
      candidate = base.slice(0, 44) + "-" + suffix;
      suffix += 1;
    }
    return candidate;
  }

  function templateDraftForNode(id) {
    for (var i = 0; i < templateDrafts.length; i += 1) {
      if (String(templateDrafts[i].nodeId) === String(id)) return templateDrafts[i];
    }
    return null;
  }

  function addTemplateNode(node) {
    if (!node || node.truncated) return;
    var element = layerElements.get(node.id);
    if (element && !templateDraftForNode(node.id)) {
      templateDrafts.push({ nodeId: node.id, slotId: uniqueSlotIdForLayer(node), selector: stableSelector(element), role: "fixed", note: "" });
    }
    node.children.forEach(addTemplateNode);
  }

  function addAllTemplateLayers() {
    captureTemplateDrafts();
    addTemplateNode(layerTree);
    templateFilter = "";
    renderPanel();
  }

  function removeTemplateNode(node) {
    if (!node) return;
    var ids = layerNodeList(node).map(function (item) { return String(item.id); });
    templateDrafts = templateDrafts.filter(function (slot) { return ids.indexOf(String(slot.nodeId)) === -1; });
    if (ids.indexOf(String(templateExpandedId)) !== -1) templateExpandedId = "";
    renderPanel();
  }

  function restoreTemplateDraftsFromSlots() {
    if (!layerTree || templateDrafts.length) return;
    templateSlots.forEach(function (slot) {
      var matchedElement = null;
      try { matchedElement = document.querySelector(slot.selector); } catch (error) { matchedElement = null; }
      if (!matchedElement) return;
      var nodes = layerNodeList(layerTree);
      for (var i = 0; i < nodes.length; i += 1) {
        if (layerElements.get(nodes[i].id) === matchedElement) {
          templateDrafts.push({ nodeId: nodes[i].id, slotId: slot.slotId || slotIdForLayer(nodes[i]), selector: slot.selector, role: slot.role === "flexible" ? "flexible" : "fixed", note: slot.note || "" });
          break;
        }
      }
    });
  }

  function rebuildTemplateDraftsFromPage() {
    templateDrafts = [];
    if (layerTree) addTemplateNode(layerTree);
  }

  function saveTemplate() {
    capturePanelDrafts();
    if (!templateName.trim()) return;
    if (!layerTree) refreshAppliedLayerTree();
    rebuildTemplateDraftsFromPage();
    if (!templateDrafts.length) {
      setPanelStatus("Could not save template — no layers on the page", "error", "b");
      return;
    }
    var savedTemplateId = templateName.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    if (!savedTemplateId) {
      setPanelStatus("Could not save template", "error", "b");
      return;
    }
    var slots = templateDrafts.filter(function (slot) { return !!slot.slotId && !!slot.selector; }).map(function (slot) {
      var saved = { slotId: slot.slotId, selector: slot.selector, role: slot.role };
      if (slot.note && slot.note.trim()) saved.note = slot.note.trim();
      return saved;
    });
    templateSlots.forEach(function (existing) {
      var drafted = slots.some(function (slot) { return slot.slotId === existing.slotId; });
      if (!drafted && !queryResolves(existing.selector)) {
        var preserved = { slotId: existing.slotId, selector: existing.selector, role: existing.role };
        if (existing.note && existing.note.trim()) preserved.note = existing.note.trim();
        slots.push(preserved);
      }
    });
    fetch(bridgeUrl("/template"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: location.pathname, templateId: savedTemplateId, slots: slots })
    }).then(function (response) {
      if (!response.ok) throw new Error("Bridge returned " + response.status);
      return response.json();
    }).then(function (result) {
      templateLoaded = false;
      templateSlots = [];
      setPanelStatus("Saved page template · " + result.count + (result.count === 1 ? " layer" : " layers"), "success", "b");
      loadTemplate();
    }).catch(function (error) {
      setPanelStatus("Could not save template", "error", "b");
      console.error("[Raven Grab] POST /template failed.", error);
    });
  }

  function slugifyComponentId(name) {
    var slug = String(name || "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return slug.slice(0, 64);
  }

  function buildComponentSubtree(element) {
    if (!element) return null;
    // Test harness selections sometimes omit nodeType; treat those as elements.
    if (element.nodeType != null && element.nodeType !== 1) return null;
    var skipped = { SCRIPT: true, STYLE: true, LINK: true, META: true };
    if (skipped[element.tagName] || element === host || (typeof element.hasAttribute === "function" && element.hasAttribute("data-raven-grab-overlay"))) return null;
    var children = [];
    if (!element.shadowRoot && element.tagName !== "IFRAME" && element.children) {
      for (var i = 0; i < element.children.length; i += 1) {
        var child = buildComponentSubtree(element.children[i]);
        if (child) children.push(child);
      }
    }
    var selector = "";
    try { selector = stableSelector(element); } catch (error) { selector = ""; }
    if (!selector && currentSelection && element === selectedElement) selector = currentSelection.selector || "";
    if (!selector) selector = element.id ? ("#" + element.id) : (element.localName || "div");
    return { selector: selector, children: children };
  }

  function componentArtifactFromSelection() {
    if (!selectedElement || selectedElement.isConnected === false) return null;
    var name = String(componentName || "").trim();
    if (!name) return null;
    var componentId = slugifyComponentId(name);
    if (!componentId) return null;
    var subtree = buildComponentSubtree(selectedElement);
    if (!subtree) return null;
    var artifact = {
      componentId: componentId,
      name: name,
      page: location.pathname,
      rootSelector: subtree.selector,
      subtree: subtree,
      capturedAt: new Date().toISOString()
    };
    var note = componentRequest.useCase && componentRequest.useCase.trim();
    if (note) artifact.note = note;
    return artifact;
  }

  function canPersistComponents() {
    // Standalone playground has no DESIGN.md session — skip local persist there.
    return !grabConfig;
  }

  function persistComponentArtifact() {
    var artifact = componentArtifactFromSelection();
    if (!artifact) {
      return Promise.reject(new Error("Name the component and select it on the page"));
    }
    if (!canPersistComponents()) {
      return Promise.resolve({ saved: false, skipped: true, componentId: artifact.componentId, artifact: artifact });
    }
    return fetch(bridgeUrl("/components"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(artifact)
    }).then(function (response) {
      if (!response.ok) throw new Error("Bridge returned " + response.status);
      return response.json();
    }).then(function (result) {
      return { saved: true, skipped: false, componentId: result.componentId || artifact.componentId, artifact: artifact };
    });
  }

  function shortenedLayerText(element) {
    // Prefer own text nodes only — descendant script/JSON-LD textContent pollutes labels.
    var text = "";
    var nodes = element.childNodes;
    if (nodes && typeof nodes.length === "number") {
      var parts = [];
      for (var i = 0; i < nodes.length; i += 1) {
        if (nodes[i] && nodes[i].nodeType === 3) parts.push(String(nodes[i].nodeValue || ""));
      }
      text = parts.join(" ").replace(/\s+/g, " ").trim();
    } else {
      // Test doubles / sparse hosts may only expose textContent.
      text = String(element.textContent || "").replace(/\s+/g, " ").trim();
    }
    if (!text && typeof element.getAttribute === "function") {
      text = String(element.getAttribute("aria-label") || element.getAttribute("alt") || element.getAttribute("title") || "").trim();
    }
    if (text.indexOf('"@context"') !== -1 || /^\{\s*"@/.test(text)) text = "";
    if (text.length > 40) text = text.slice(0, 37) + "…";
    return text;
  }

  function shouldSkipLayerElement(element) {
    if (!element || element.nodeType !== 1) return true;
    var tag = String(element.tagName || "").toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "META" || tag === "NOSCRIPT" || tag === "TEMPLATE") return true;
    if (typeof element.getAttribute === "function") {
      var type = String(element.getAttribute("type") || "").toLowerCase();
      if (type === "application/ld+json") return true;
      if (element.getAttribute("data-raven-grab-ignore") != null) return true;
      if (element.getAttribute("aria-hidden") === "true" && !(element.children && element.children.length)) return true;
    }
    return false;
  }

  function buildLayerTree(root) {
    layerRuntimeId = 0;
    layerElements = new Map();
    var total = 0;
    var stopped = false;
    function visit(element, parentId, depth) {
      if (!element || element.nodeType !== 1 || shouldSkipLayerElement(element) || element === host || (typeof element.hasAttribute === "function" && element.hasAttribute("data-raven-grab-overlay"))) return null;
      if (total >= 500 || depth > 12) {
        stopped = true;
        return { id: "truncated-" + total, parentId: parentId, depth: depth, label: "truncated", badges: ["truncated"], children: [], truncated: true };
      }
      total += 1;
      layerRuntimeId += 1;
      var id = layerRuntimeId;
      layerElements.set(id, element);
      var badges = [];
      var shadowRoot = element.shadowRoot;
      if (shadowRoot) badges.push("#shadow");
      if (element.tagName === "IFRAME") badges.push("iframe");
      var text = shortenedLayerText(element);
      var componentLabel = componentNameFor(element, null);
      var labelBase = componentLabel || element.localName.toLowerCase();
      var node = { id: id, parentId: parentId, depth: depth, label: labelBase + (text ? " · " + text : ""), badges: badges, children: [] };
      if (!shadowRoot && element.tagName !== "IFRAME") {
        for (var i = 0; i < element.children.length; i += 1) {
          var child = visit(element.children[i], id, depth + 1);
          if (child) node.children.push(child);
          if (stopped) break;
        }
      }
      return node;
    }
    var tree = visit(root, null, 0);
    seedLayerCollapse(tree);
    return tree;
  }

  // Fully expanded, a real page opens as a wall of leaves -- an article dumps every
  // paragraph as its own row before you have seen the page skeleton. So the tree opens
  // showing structure only, and you drill in from there.
  //
  // Raw depth is the wrong ruler: `body > div#root > div.app > ...` spends three levels
  // on wrappers that carry no choice, while a flat page spends none. What costs the
  // reader is a BRANCH -- a point where the tree asks which way to go. So single-child
  // chains are free to follow, and only branching increments the budget.
  var LAYER_BRANCH_BUDGET = 2;
  var seededLayerElements = new WeakSet();
  function seedLayerCollapse(tree) {
    if (!tree) return;
    var pending = [{ node: tree, branch: 0 }];
    while (pending.length) {
      var entry = pending.pop();
      var node = entry.node;
      var children = node.children || [];
      if (!children.length) continue;
      var element = layerElements.get(node.id);
      // Budget is spent by what opening this node would REVEAL, so it is the children's
      // branch count that decides, not this node's.
      var childBranch = children.length > 1 ? entry.branch + 1 : entry.branch;
      // Seed each element once. A rebuild after a DOM change must not re-collapse a
      // branch the user opened -- their expansion outlives the tree object.
      if (element && !seededLayerElements.has(element)) {
        seededLayerElements.add(element);
        if (childBranch >= LAYER_BRANCH_BUDGET) collapsedLayerElements.add(element);
      }
      for (var i = 0; i < children.length; i++) pending.push({ node: children[i], branch: childBranch });
    }
  }

  function layerOrdersMatch(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (var i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function liveLayerChildrenMatch(parentElement, expectedChildren) {
    // A detached parent can still contain the expected order; require document membership so a
    // framework swap of the subtree never reads as success against dead nodes. Use `=== false`
    // (not truthiness): on engines lacking Element.isConnected the property is undefined and we
    // must fall through, per the file-wide isConnected contract — never mark a live tree stale.
    if (!parentElement || parentElement.isConnected === false || !expectedChildren) return false;
    var currentChildren = Array.prototype.filter.call(parentElement.children || [], function (child) {
      return expectedChildren.indexOf(child) !== -1;
    });
    return layerOrdersMatch(currentChildren, expectedChildren);
  }

  function layerOrderIsActive(order) {
    return !!order && (order.state === "registering" || order.state === "queued" || order.state === "applying");
  }

  function allLayerOrders() {
    return Object.keys(pendingLayerOrders).map(function (key) { return pendingLayerOrders[key]; });
  }

  function activeLayerOrders() {
    return allLayerOrders().filter(layerOrderIsActive);
  }

  function localLayerDrafts() {
    return Object.keys(layerOrderDrafts).map(function (key) {
      return layerOrderDrafts[key];
    }).filter(function (draft) {
      return !!draft;
    }).sort(function (left, right) {
      return (left.clientSequence || 0) - (right.clientSequence || 0);
    });
  }

  function activeLayerOrderDraft() {
    return activeLayerOrderDraftKey ? layerOrderDrafts[activeLayerOrderDraftKey] || null : null;
  }

  function localLayerDraftForParent(parentSelector) {
    var drafts = localLayerDrafts();
    for (var i = 0; i < drafts.length; i += 1) {
      var draft = drafts[i];
      if (draft.parentSelector === parentSelector) return draft;
      if (draft.fromParentSelector === parentSelector || draft.toParentSelector === parentSelector) return draft;
    }
    return null;
  }

  function layerOrderRecordForId(id) {
    if (!id) return null;
    if (pendingLayerOrders[id]) return pendingLayerOrders[id];
    var orders = allLayerOrders();
    for (var i = 0; i < orders.length; i += 1) {
      if (orders[i].operationId === id || orders[i].clientKey === id) return orders[i];
    }
    return null;
  }

  function pendingLayerOrderForId(id) {
    var order = layerOrderRecordForId(id);
    return layerOrderIsActive(order) ? order : null;
  }

  function pendingLayerOrderForParent(parentSelector) {
    var orders = activeLayerOrders();
    for (var i = 0; i < orders.length; i += 1) {
      var order = orders[i];
      if (order.parentSelector === parentSelector) return order;
      if (order.fromParentSelector === parentSelector || order.toParentSelector === parentSelector) return order;
    }
    return null;
  }

  function removePendingLayerOrder(order) {
    var keys = Object.keys(pendingLayerOrders);
    for (var i = 0; i < keys.length; i += 1) {
      if (pendingLayerOrders[keys[i]] === order) delete pendingLayerOrders[keys[i]];
    }
  }

  function visualLayerOrderForMovedElement(element) {
    var drafts = localLayerDrafts();
    for (var draftIndex = 0; draftIndex < drafts.length; draftIndex += 1) {
      if (drafts[draftIndex].movedElement === element) return drafts[draftIndex];
    }
    var orders = activeLayerOrders();
    for (var i = 0; i < orders.length; i += 1) {
      if (orders[i].movedElement === element) return orders[i];
    }
    return null;
  }

  function visualLayerOrderForParentElement(element) {
    var drafts = localLayerDrafts();
    for (var draftIndex = 0; draftIndex < drafts.length; draftIndex += 1) {
      if (drafts[draftIndex].parentElement === element) return drafts[draftIndex];
      if (drafts[draftIndex].fromParentElement === element || drafts[draftIndex].toParentElement === element) return drafts[draftIndex];
    }
    var orders = activeLayerOrders();
    for (var i = 0; i < orders.length; i += 1) {
      if (orders[i].parentElement === element) return orders[i];
      if (orders[i].fromParentElement === element || orders[i].toParentElement === element) return orders[i];
    }
    return null;
  }

  function liveLayerChildElements(parentElement) {
    if (!parentElement || !parentElement.children) return [];
    return Array.prototype.filter.call(parentElement.children, function (child) {
      return layerMeasurable(child);
    });
  }

  function layerNodesForElements(elements) {
    var nodes = [];
    for (var i = 0; i < (elements || []).length; i += 1) {
      var node = layerNodeForElement(elements[i]);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  function updateLayerSubtreeMeta(node, parentId, depth) {
    if (!node) return;
    node.parentId = parentId;
    node.depth = depth;
    for (var i = 0; i < node.children.length; i += 1) {
      updateLayerSubtreeMeta(node.children[i], node.id, depth + 1);
    }
  }

  function projectLayerOrderOntoTree(order) {
    if (!order || !layerTree || !order.movedElement) return false;
    var movedNode = layerNodeForElement(order.movedElement);
    if (!movedNode) return false;
    if (order.operation === "reparent") {
      var fromParent = layerNodeForElement(order.fromParentElement);
      var toParent = layerNodeForElement(order.toParentElement || order.parentElement);
      if (!fromParent || !toParent) return false;
      var fromKids = [];
      (order.baselineChildren || []).forEach(function (element) {
        if (element === order.movedElement) return;
        var node = layerNodeForElement(element);
        if (node) fromKids.push(node);
      });
      fromParent.children = fromKids;
      fromKids.forEach(function (node) { node.parentId = fromParent.id; });
      // Use the captured movedNode — after detaching from fromParent it is no longer
      // discoverable via layerNodeForElement tree walk.
      var toKids = [];
      (order.expectedChildren || []).forEach(function (element) {
        var node = element === order.movedElement ? movedNode : layerNodeForElement(element);
        if (node) toKids.push(node);
      });
      toParent.children = toKids;
      updateLayerSubtreeMeta(movedNode, toParent.id, toParent.depth + 1);
      toKids.forEach(function (node) {
        if (node !== movedNode) node.parentId = toParent.id;
      });
      return true;
    }
    var parent = layerNodeForElement(order.parentElement);
    if (!parent) return false;
    parent.children = layerNodesForElements(order.expectedChildren || []);
    parent.children.forEach(function (node) { node.parentId = parent.id; });
    return true;
  }

  function projectableLayerOrders() {
    var all = localLayerDrafts().concat(activeLayerOrders());
    return all.filter(function (order) {
      return !!order && order.state !== "rejected" && order.state !== "mismatch" && order.state !== "needs-recheck";
    }).sort(function (left, right) {
      return (left.clientSequence || 0) - (right.clientSequence || 0);
    });
  }

  function projectAllLayerOrdersOntoTree() {
    var orders = projectableLayerOrders();
    for (var i = 0; i < orders.length; i += 1) projectLayerOrderOntoTree(orders[i]);
  }

  function rebuildLiveLayerTreeKeepingCollapse() {
    var nextTree = buildLayerTree(document.body);
    appliedLayerTree = nextTree;
    layerTree = nextTree;
    return nextTree;
  }

  function layerRowRectForElement(element) {
    var node = layerNodeForElement(element);
    var owner = layerPanel();
    if (!node || !owner || typeof owner.querySelector !== "function") return null;
    var row = owner.querySelector('.raven-grab-layer-row[data-layer-id="' + node.id + '"]');
    return row && typeof row.getBoundingClientRect === "function" ? { row: row, rect: row.getBoundingClientRect() } : null;
  }

  function reverseLayerOrderProjection(order) {
    if (!order || !layerTree || !order.movedElement) return false;
    var movedNode = layerNodeForElement(order.movedElement);
    if (order.operation === "reparent") {
      var fromParent = layerNodeForElement(order.fromParentElement);
      var toParent = layerNodeForElement(order.toParentElement || order.parentElement);
      if (fromParent && order.baselineChildren) {
        fromParent.children = layerNodesForElements(order.baselineChildren);
        fromParent.children.forEach(function (node) { node.parentId = fromParent.id; });
      }
      if (toParent && order.toBaselineChildren) {
        toParent.children = layerNodesForElements(order.toBaselineChildren);
        toParent.children.forEach(function (node) { node.parentId = toParent.id; });
      }
      if (movedNode && fromParent) updateLayerSubtreeMeta(movedNode, fromParent.id, fromParent.depth + 1);
      return true;
    }
    var parent = layerNodeForElement(order.parentElement);
    if (!parent || !order.baselineChildren) return false;
    parent.children = layerNodesForElements(order.baselineChildren);
    parent.children.forEach(function (node) { node.parentId = parent.id; });
    return true;
  }

  function restoreLayerTreeFromLiveDom(animateElement, clearedOrder) {
    var fromTop = null;
    if (animateElement) {
      var before = layerRowRectForElement(animateElement);
      if (before) fromTop = before.rect.top;
    }
    if (clearedOrder) reverseLayerOrderProjection(clearedOrder);
    var bodyChildren = document.body && document.body.children ? document.body.children.length : 0;
    if (bodyChildren > 0) {
      var nextTree = buildLayerTree(document.body);
      if (nextTree && layerNodeList(nextTree).length > 1) {
        appliedLayerTree = nextTree;
        layerTree = nextTree;
      }
    }
    projectAllLayerOrdersOntoTree();
    renderPanel();
    if (animateElement && fromTop != null) {
      var after = layerRowRectForElement(animateElement);
      if (after && after.row) animateLayerSwap([after.row], fromTop);
    }
  }

  function layerElementIsPendingMove(element) {
    if (!element) return false;
    var orders = projectableLayerOrders();
    for (var i = 0; i < orders.length; i += 1) {
      var order = orders[i];
      if (order.movedElement === element) return true;
      if (order.movedElements && order.movedElements.indexOf(element) !== -1) return true;
    }
    return false;
  }

  function copyPinnedLayerMappings(node, elements, previousElements) {
    if (!node) return;
    var previousElement = previousElements.get(node.id);
    if (previousElement) elements.set(node.id, previousElement);
    for (var i = 0; i < node.children.length; i += 1) copyPinnedLayerMappings(node.children[i], elements, previousElements);
  }

  function pinUnresolvedParentTrees(tree, elements, previousTree, previousElements, resolvedOrder) {
    var orders = activeLayerOrders();
    for (var i = 0; i < orders.length; i += 1) {
      var order = orders[i];
      if (order === resolvedOrder) continue;
      var previousParent = null;
      var nextParent = null;
      previousElements.forEach(function (element, id) {
        if (element === order.parentElement) previousParent = findLayerNode(previousTree, id);
      });
      elements.forEach(function (element, id) {
        if (element === order.parentElement) nextParent = findLayerNode(tree, id);
      });
      if (previousParent && nextParent) {
        nextParent.children = previousParent.children;
        copyPinnedLayerMappings(previousParent, elements, previousElements);
      }
    }
  }

  function adoptRebuiltLayerTree(tree, elements, order) {
    var previousTree = appliedLayerTree;
    var previousElements = layerElements;
    pinUnresolvedParentTrees(tree, elements, previousTree, previousElements, order);
    appliedLayerTree = tree;
    layerTree = tree;
    layerElements = elements;
    order.state = "applied";
    if (appliedLayerReceipts.indexOf(order) === -1) appliedLayerReceipts.push(order);
    removePendingLayerOrder(order);
    layerNotice = "";
    postLayerSnapshot();
    renderPanel();
    ensureLayerOperationPoll();
  }

  function pendingLayerVisualsActive(parentElement) {
    if (parentElement) return !!visualLayerOrderForParentElement(parentElement);
    return localLayerDrafts().length > 0 || activeLayerOrders().length > 0;
  }

  function stopLayerOperationPoll() {
    if (layerOperationPollTimer !== null) clearTimeout(layerOperationPollTimer);
    layerOperationPollTimer = null;
  }

  function refreshAppliedLayerTree() {
    // A4 also binds here: rebuilding swaps layerElements under rows the deferred
    // renderPanel still shows — hold the previous identities until the editor closes.
    if (activeStyleEditorFlush || activeStyleScrub) { ensureLayerOperationPoll(); return appliedLayerTree; }
    var previousTree = appliedLayerTree;
    var previousElements = layerElements;
    var nextTree = buildLayerTree(document.body);
    var nextElements = layerElements;
    var drafts = localLayerDrafts();
    if (drafts.length) {
      for (var draftIndex = 0; draftIndex < drafts.length; draftIndex += 1) {
        if (!liveLayerDraftParentsMatch(drafts[draftIndex])) {
          drafts[draftIndex].state = "needs-recheck";
          if (drafts[draftIndex].clientKey === activeLayerOrderDraftKey) {
            layerPreview = null;
            pendingFixedMove = "";
            fixedMoveNote = "";
          }
          layerNotice = "Page changed — re-propose the move";
        }
      }
      appliedLayerTree = previousTree;
      layerTree = previousTree;
      layerElements = previousElements;
      return previousTree;
    }
    if (activeLayerOrders().length > 0) {
      appliedLayerTree = previousTree;
      layerTree = previousTree;
      layerElements = previousElements;
      return previousTree;
    }
    appliedLayerTree = nextTree;
    layerTree = nextTree;
    layerElements = nextElements;
    return nextTree;
  }

  function serializableLayerTree(node) {
    if (!node) return null;
    return { id: node.id, parentId: node.parentId, label: node.label, badges: node.badges, children: node.children.map(serializableLayerTree) };
  }

  function postLayerSnapshot() {
    if (!appliedLayerTree) return;
    fetch(bridgeUrl("/layers"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: location.pathname, tree: serializableLayerTree(appliedLayerTree) })
    }).catch(function (error) { console.error("[Raven Grab] POST /layers failed.", error); });
  }

  function findLayerNode(node, id) {
    if (!node) return null;
    if (String(node.id) === String(id)) return node;
    for (var i = 0; i < node.children.length; i += 1) {
      var found = findLayerNode(node.children[i], id);
      if (found) return found;
    }
    return null;
  }

  function layerNodeForElement(element) {
    if (!element || !layerTree) return null;
    var nodes = layerNodeList(layerTree);
    for (var i = 0; i < nodes.length; i += 1) {
      if (layerElements.get(nodes[i].id) === element) return nodes[i];
    }
    return null;
  }

  function layerIsCollapsed(node) {
    var element = node ? layerElements.get(node.id) : null;
    return !!element && node.children.length > 0 && collapsedLayerElements.has(element);
  }

  function visibleLayerNodes() {
    var visible = [];
    var pending = layerTree ? [layerTree] : [];
    while (pending.length) {
      var current = pending.pop();
      if (!current || current.truncated) continue;
      visible.push(current);
      if (layerIsCollapsed(current)) continue;
      for (var i = current.children.length - 1; i >= 0; i -= 1) pending.push(current.children[i]);
    }
    return visible;
  }

  function primaryLayerRowVisible() {
    if (!selectedElement) return false;
    var visible = visibleLayerNodes();
    for (var i = 0; i < visible.length; i++) {
      if (layerElements.get(visible[i].id) === selectedElement) return true;
    }
    return false;
  }

  function expandLayerAncestorsForElement(element) {
    var node = layerNodeForElement(element);
    var changed = false;
    while (node && node.parentId != null) {
      node = findLayerNode(layerTree, node.parentId);
      if (!node) break;
      var ancestor = layerElements.get(node.id);
      if (ancestor && collapsedLayerElements.has(ancestor)) {
        collapsedLayerElements.delete(ancestor);
        changed = true;
      }
    }
    return changed;
  }

  function setLayerExpanded(node, expanded) {
    if (!node || !node.children.length) return false;
    var element = layerElements.get(node.id);
    if (!element) return false;
    if (expanded) collapsedLayerElements.delete(element);
    else collapsedLayerElements.add(element);
    return true;
  }

  function toggleLayerNode(id) {
    var node = findLayerNode(layerTree, id);
    if (!node || !node.children.length) return;
    setLayerExpanded(node, layerIsCollapsed(node));
    renderPanel();
    // renderPanel replaced the chevron button that held focus — refocus the row
    // so arrow-key navigation keeps working after a mouse toggle.
    focusLayerRow(node);
  }

  function setLayerRowHover(element) {
    if (hoveredLayerRow) { hoveredLayerRow.removeAttribute("data-layer-hovered"); hoveredLayerRow = null; }
    hoveredLayerElement = element && element.isConnected !== false ? element : null;
    var nextNode = layerNodeForElement(hoveredLayerElement);
    // A collapsed subtree renders no rows for its descendants — walk up to the
    // nearest visible ancestor so canvas hover always has a panel echo.
    while (nextNode) {
      var nextRow = layerPanel().querySelector('[data-layer-id="' + nextNode.id + '"]');
      if (nextRow) { nextRow.setAttribute("data-layer-hovered", "true"); hoveredLayerRow = nextRow; return; }
      nextNode = nextNode.parentId != null ? findLayerNode(layerTree, nextNode.parentId) : null;
    }
  }

  function slotRoleForElement(element) {
    for (var i = 0; i < templateSlots.length; i += 1) {
      try { if (element.matches(templateSlots[i].selector)) return templateSlots[i].role; } catch (error) { /* invalid saved selector */ }
    }
    return "";
  }

  function layerRowsMarkup(node, siblingIndex, membership) {
    if (!node) return "";
    if (!membership) membership = selectionMembershipForRender || visualBadgeElements();
    var element = layerElements.get(node.id);
    var displayIndex = typeof siblingIndex === "number" ? siblingIndex + 1 : 1;
    if (node.truncated) return '<li class="raven-grab-layer-row" style="--layer-depth:' + node.depth + '"><span class="raven-grab-layer-index">' + displayIndex + '</span><span class="raven-grab-layer-label">truncated</span></li>';
    var role = element ? slotRoleForElement(element) : "";
    var badges = node.badges.slice();
    if (role === "flexible") badges.push("Flex");
    var isSelected = !!element && membership.indexOf(element) !== -1;
    var isPrimary = !!element && element === selectedElement;
    var movedVisualOrder = visualLayerOrderForMovedElement(element);
    var isPending = layerElementIsPendingMove(element);
    var isCollapsed = layerIsCollapsed(node);
    var hasChildren = node.children.length > 0;
    var isHovered = !!element && element === hoveredLayerElement;
    // The tree is one tab stop, normally the selected row. Collapsing an ancestor can
    // hide that row, and without the fallback the whole tree would then have no tabbable
    // row at all -- a keyboard user could not reach it. Root takes the stop instead.
    var rowTabIndex = isPrimary || ((!selectedElement || !primaryLayerRowVisible()) && node === layerTree) ? "0" : "-1";
    var toggleMarkup = hasChildren
      ? '<button class="raven-grab-layer-toggle" type="button" data-layer-toggle="' + node.id + '" data-expanded="' + (isCollapsed ? "false" : "true") + '" aria-label="' + (isCollapsed ? "Expand " : "Collapse ") + escapeHtml(node.label) + '" aria-expanded="' + (isCollapsed ? "false" : "true") + '">›</button>'
      : '<span class="raven-grab-layer-toggle-spacer" aria-hidden="true"></span>';
    var markup = '<li class="raven-grab-layer-row" role="treeitem" tabindex="' + rowTabIndex + '" aria-level="' + (node.depth + 1) + '" data-layer-id="' + node.id + '" data-layer-parent="' + (node.parentId == null ? "" : node.parentId) + '"' + (hasChildren ? ' aria-expanded="' + (isCollapsed ? "false" : "true") + '"' : "") + (isSelected ? ' data-selected="true"' : "") + (isPrimary ? ' data-primary="true"' : "") + (isPending ? ' data-layer-pending="true"' : "") + (isHovered ? ' data-layer-hovered="true"' : "") + ' style="--layer-depth:' + node.depth + '">' + toggleMarkup + '<span class="raven-grab-layer-index">' + displayIndex + '</span><span class="raven-grab-layer-label">' + escapeHtml(node.label) + "</span>" + badges.map(function (badge) { return '<span class="raven-grab-badge">' + escapeHtml(badge) + "</span>"; }).join("") + (isPending ? '<span class="raven-grab-layer-pending-badge">Move pending</span>' : "") + "</li>";
    if (pendingFixedMove && layerPreview && layerPreview.movedElement === element) {
      markup += '<li class="raven-grab-template-detail" style="--layer-depth:' + node.depth + '"><p class="raven-grab-layer-notice raven-grab-layer-info">You are moving a fixed layer, the design system team will be notified.</p><label class="raven-grab-field"><span>Add note…</span><textarea class="raven-grab-textarea" data-fixed-move-note maxlength="2000" spellcheck="true" placeholder="Add note…">' + escapeHtml(fixedMoveNote) + '</textarea></label></li>';
    }
    if (!isCollapsed) {
      node.children.forEach(function (child, index) {
        markup += layerRowsMarkup(child, index, membership);
      });
    }
    return markup;
  }

  function siblingIndexForLayer(node) {
    if (!node || node.parentId == null) return 0;
    var parent = findLayerNode(layerTree, node.parentId);
    return parent ? parent.children.indexOf(node) : 0;
  }

  function removeLayerIconMarkup() {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><path d="M5.5 8h5"></path></svg>';
  }

  function templateLayerRowMarkup(node) {
    var slot = templateDraftForNode(node.id);
    if (!slot) {
      return node.children.map(function (child) { return templateLayerRowMarkup(child); }).join("");
    }
    var displayIndex = siblingIndexForLayer(node) + 1;
    var expanded = String(templateExpandedId) === String(node.id);
    var rowElement = layerElements.get(node.id);
    var rowSelected = selectionHasElement(rowElement);
    var rowPrimary = !!rowElement && rowElement === selectedElement;
    var markup = '<li class="raven-grab-layer-row" data-template-layer-id="' + node.id + '" data-expanded="' + (expanded ? "true" : "false") + '"' + (rowSelected ? ' data-selected="true"' : '') + (rowPrimary ? ' data-primary="true"' : '') + ' style="--layer-depth:' + node.depth + '"><span class="raven-grab-layer-index">' + displayIndex + '</span><span class="raven-grab-layer-label">' + escapeHtml(node.label) + '</span>' +
      (slot.role === "flexible" ? '<span class="raven-grab-badge">Flex</span>' : '') +
      '<button class="raven-grab-layer-action" type="button" data-remove-template-layer="' + node.id + '" aria-label="Remove ' + escapeHtml(node.label) + '">' + removeLayerIconMarkup() + '</button></li>';
    if (expanded) {
      markup += '<li class="raven-grab-template-detail" style="--layer-depth:' + node.depth + '"><div class="raven-grab-role" role="group" aria-label="Layer role"><button type="button" data-template-role="fixed" data-template-index="' + node.id + '" data-active="' + (slot.role === "fixed" ? "true" : "false") + '">Fixed</button><button type="button" data-template-role="flexible" data-template-index="' + node.id + '" data-active="' + (slot.role === "flexible" ? "true" : "false") + '">Flexible</button></div><label class="raven-grab-field"><span>Add note…</span><textarea class="raven-grab-textarea" data-template-note="' + node.id + '" maxlength="2000" spellcheck="true" placeholder="Add note…">' + escapeHtml(slot.note || "") + '</textarea></label></li>';
    }
    node.children.forEach(function (child) { markup += templateLayerRowMarkup(child); });
    return markup;
  }

  function templateFilterMatchesMarkup() {
    var query = templateFilter.trim().toLowerCase();
    if (!query) return "";
    var matches = layerNodeList(layerTree).filter(function (node) {
      return !templateDraftForNode(node.id) && node.label.toLowerCase().indexOf(query) !== -1;
    });
    if (!matches.length) return '<p class="raven-grab-note">No matching layers.</p>';
    return '<ul class="raven-grab-layer-list">' + matches.map(function (node) {
      return '<li><button class="raven-grab-layer-row" type="button" data-add-template-layer="' + node.id + '" style="--layer-depth:' + node.depth + '"><span class="raven-grab-layer-index">' + (siblingIndexForLayer(node) + 1) + '</span><span class="raven-grab-layer-label">' + escapeHtml(node.label) + '</span></button></li>';
    }).join("") + '</ul>';
  }

  function domSnapshotHash(parent) {
    var html = parent.innerHTML || "";
    var hash = 0;
    for (var i = 0; i < html.length; i += 1) hash = ((hash << 5) - hash + html.charCodeAt(i)) | 0;
    return String(html.length) + ":" + Math.abs(hash).toString(36);
  }

  // Mirror buildLayerTree's exclusions (line ~2269) so measured children align 1:1 with
  // orderedElements: skip SCRIPT/STYLE/LINK/META (e.g. the injected overlay <script>) and the
  // overlay's own host. Without this, a non-layer child maps to orderedElements[undefined] and
  // emits an empty selector the bridge rejects.
  var LAYER_MEASURE_SKIP = { SCRIPT: true, STYLE: true, LINK: true, META: true };
  function layerMeasurable(element) {
    if (!element || element.nodeType !== 1 || LAYER_MEASURE_SKIP[element.tagName]) return false;
    if (element === host) return false;
    if (typeof element.hasAttribute === "function" && element.hasAttribute("data-raven-grab-overlay")) return false;
    return true;
  }

  function cloneMeasuredPreview(parent, fromIndex, toIndex, orderedElements) {
    if (parent.querySelectorAll("*").length > 300) return { unavailable: "preview unavailable (too large)" };
    var computed = getComputedStyle(parent);
    var approximate = computed.display === "inline" || computed.display === "inline-block" || computed.position === "absolute" || computed.position === "fixed";
    orderedElements.forEach(function (element) {
      var style = getComputedStyle(element);
      if (style.position === "absolute" || style.position === "fixed") approximate = true;
    });
    var container = document.createElement("div");
    container.setAttribute("data-raven-grab-preview", "");
    container.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;width:" + computed.width + ";";
    var clone = parent.cloneNode(true);
    container.appendChild(clone);
    document.body.appendChild(container);
    var cloneChildren = Array.prototype.slice.call(clone.children).filter(layerMeasurable);
    var liveChildren = Array.prototype.slice.call(parent.children).filter(layerMeasurable);
    for (var f = 0; f < cloneChildren.length && f < liveChildren.length; f += 1) {
      var cloneRect = cloneChildren[f].getBoundingClientRect();
      var liveRect = liveChildren[f].getBoundingClientRect();
      if (Math.abs(cloneRect.width - liveRect.width) > 2 || Math.abs(cloneRect.height - liveRect.height) > 2) { approximate = true; break; }
    }
    var movedClone = cloneChildren.splice(fromIndex, 1)[0];
    cloneChildren.splice(toIndex, 0, movedClone);
    cloneChildren.forEach(function (child) { clone.appendChild(child); });
    clone.getBoundingClientRect();
    var parentRect = clone.getBoundingClientRect();
    var measuredRects = [];
    cloneChildren.forEach(function (child, index) {
      var mapped = orderedElements[index];
      if (!mapped) return;
      var selector = stableSelector(mapped);
      if (!selector) return;
      var rect = child.getBoundingClientRect();
      measuredRects.push({ selector: selector, x: rect.left - parentRect.left, y: rect.top - parentRect.top, width: rect.width, height: rect.height });
    });
    container.remove();
    return { measuredRects: measuredRects, approximate: approximate, parentWidth: parentRect.width, parentHeight: parentRect.height };
  }

  // Reparent preview: measure the destination parent as if movedElement were already
  // inserted at toIndex. Shadow/iframe hosts are never destination parents (buildLayerTree
  // stops there); callers must reject those before invoking this.
  function cloneMeasuredReparentPreview(toParent, movedElement, toIndex, orderedElements) {
    if (!toParent || !movedElement) return { unavailable: "preview unavailable" };
    if (typeof toParent.cloneNode !== "function" || typeof movedElement.cloneNode !== "function") {
      return { unavailable: "preview unavailable" };
    }
    var descendantCount = typeof toParent.querySelectorAll === "function" ? toParent.querySelectorAll("*").length : 0;
    if (descendantCount > 300) return { unavailable: "preview unavailable (too large)" };
    var computed = getComputedStyle(toParent);
    var approximate = computed.display === "inline" || computed.display === "inline-block" || computed.position === "absolute" || computed.position === "fixed";
    orderedElements.forEach(function (element) {
      var style = getComputedStyle(element);
      if (style.position === "absolute" || style.position === "fixed") approximate = true;
    });
    var container = document.createElement("div");
    container.setAttribute("data-raven-grab-preview", "");
    container.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;width:" + computed.width + ";";
    var clone = toParent.cloneNode(true);
    container.appendChild(clone);
    document.body.appendChild(container);
    var cloneChildren = Array.prototype.slice.call(clone.children).filter(layerMeasurable);
    var movedClone = movedElement.cloneNode(true);
    if (toIndex >= cloneChildren.length) clone.appendChild(movedClone);
    else clone.insertBefore(movedClone, cloneChildren[toIndex] || null);
    cloneChildren = Array.prototype.slice.call(clone.children).filter(layerMeasurable);
    clone.getBoundingClientRect();
    var parentRect = clone.getBoundingClientRect();
    var measuredRects = [];
    cloneChildren.forEach(function (child, index) {
      var mapped = orderedElements[index];
      if (!mapped) return;
      var selector = stableSelector(mapped);
      if (!selector) return;
      var rect = child.getBoundingClientRect();
      measuredRects.push({ selector: selector, x: rect.left - parentRect.left, y: rect.top - parentRect.top, width: rect.width, height: rect.height });
    });
    container.remove();
    return { measuredRects: measuredRects, approximate: approximate, parentWidth: parentRect.width, parentHeight: parentRect.height };
  }

  function layerNodeIsAncestorOf(ancestor, node) {
    var cursor = node;
    while (cursor) {
      if (cursor === ancestor) return true;
      cursor = cursor.parentId != null ? findLayerNode(layerTree, cursor.parentId) : null;
    }
    return false;
  }

  function layerSubtreeDepthSpan(node) {
    var maxDepth = node.depth;
    function walk(current) {
      if (current.depth > maxDepth) maxDepth = current.depth;
      for (var i = 0; i < current.children.length; i += 1) walk(current.children[i]);
    }
    walk(node);
    return maxDepth - node.depth;
  }

  function layerNodeBoundaryBlocked(node) {
    if (!node || !node.badges || !node.badges.length) return false;
    for (var i = 0; i < node.badges.length; i += 1) {
      if (node.badges[i] === "#shadow" || node.badges[i] === "iframe") return true;
    }
    return false;
  }

  function reorderLayer(fromId, toId) {
    captureTemplateDrafts();
    if (templateLoadPending) {
      layerNotice = "Loading template…";
      renderPanel();
      return;
    }
    var fromNode = findLayerNode(layerTree, fromId);
    var toNode = findLayerNode(layerTree, toId);
    if (!fromNode || !toNode || fromNode.parentId !== toNode.parentId || fromNode.parentId == null) {
      layerNotice = "same-parent reorders only";
      renderPanel();
      return;
    }
    var movedRole = slotRoleForElement(layerElements.get(fromNode.id));
    pendingFixedMove = movedRole === "fixed" ? String(fromId) + ":" + String(toId) : "";
    fixedMoveNote = "";
    var parentNode = findLayerNode(layerTree, fromNode.parentId);
    var fromIndex = parentNode.children.indexOf(fromNode);
    var toIndex = parentNode.children.indexOf(toNode);
    var parentElement = layerElements.get(parentNode.id);
    var parentSelector = stableSelector(parentElement);
    if (pendingLayerOrderForParent(parentSelector)) {
      layerNotice = "A layer move is already with the agent";
      renderPanel();
      return;
    }
    var movedElement = layerElements.get(fromNode.id);
    var liveBaselineChildren = liveLayerChildElements(parentElement);
    var liveFromIndex = liveBaselineChildren.indexOf(movedElement);
    if (liveFromIndex < 0) liveFromIndex = fromIndex;
    var orderedNodes = parentNode.children.slice();
    orderedNodes.splice(fromIndex, 1);
    orderedNodes.splice(toIndex, 0, fromNode);
    var orderedElements = orderedNodes.map(function (node) { return layerElements.get(node.id); });
    var preview = cloneMeasuredPreview(parentElement, liveFromIndex, toIndex, orderedElements);
    var baselineOrder = liveBaselineChildren.map(stableSelector);
    var orderedSelectors = orderedElements.map(stableSelector);
    var existingDraft = localLayerDraftForParent(parentSelector);
    // Same-parent moves compose into one draft: baseline stays live DOM, expected is the
    // latest projected sibling order (so a second drag next to a ghost still works).
    if (existingDraft && existingDraft.clientKey === activeLayerOrderDraftKey) existingDraft.fixedMoveNote = fixedMoveNote;
    if (!existingDraft) {
      layerOrderClientSequence += 1;
      existingDraft = {
        clientKey: "draft-" + layerOrderClientSequence,
        clientSequence: layerOrderClientSequence
      };
    } else if (existingDraft.baselineChildren && existingDraft.baselineChildren.length) {
      // Keep the original live baseline from the first draft in this parent.
      liveBaselineChildren = existingDraft.baselineChildren.slice();
      baselineOrder = existingDraft.baselineOrder ? existingDraft.baselineOrder.slice() : liveBaselineChildren.map(stableSelector);
      liveFromIndex = liveBaselineChildren.indexOf(movedElement);
      if (liveFromIndex < 0) liveFromIndex = fromIndex;
    }
    var movedElements = [];
    if (existingDraft && existingDraft.movedElements && existingDraft.movedElements.length) {
      movedElements = existingDraft.movedElements.slice();
    } else if (existingDraft && existingDraft.movedElement) {
      movedElements = [existingDraft.movedElement];
    }
    if (movedElements.indexOf(movedElement) === -1) movedElements.push(movedElement);
    resetBatchCommitted();
    var nextDraft = {
      clientKey: existingDraft.clientKey,
      clientSequence: existingDraft.clientSequence,
      operationId: "",
      parentSelector: parentSelector,
      fromSelector: stableSelector(movedElement),
      fromIndex: liveFromIndex,
      toIndex: toIndex,
      orderedSelectors: orderedSelectors,
      state: "draft",
      domSnapshotHash: domSnapshotHash(parentElement),
      baselineOrder: baselineOrder,
      parentElement: parentElement,
      movedElement: movedElement,
      movedElements: movedElements,
      baselineChildren: liveBaselineChildren.slice(),
      expectedChildren: orderedElements.slice(),
      fixedMoveNote: fixedMoveNote
    };
    layerOperationPollStopped = false;
    layerNotice = preview.unavailable && movedRole === "fixed"
      ? "Preview could not be generated for this fixed layer move. Send is disabled."
      : (preview.unavailable || "");
    layerPreview = {
      parentElement: parentElement, fromIndex: liveFromIndex, toIndex: toIndex,
      orderedElements: orderedElements, measuredRects: preview.measuredRects || [],
      approximate: !!preview.approximate, parentWidth: preview.parentWidth || 0, parentHeight: preview.parentHeight || 0,
      movedElement: movedElement, movedRole: movedRole, unavailable: preview.unavailable || ""
    };
    nextDraft.preview = layerPreview;
    layerOrderDrafts[nextDraft.clientKey] = nextDraft;
    activeLayerOrderDraftKey = nextDraft.clientKey;
    projectLayerOrderOntoTree(nextDraft);
    renderPanel();
  }

  // Cross-parent move intent. Overlay records only — agent applies later.
  // v1: no shadow-root/iframe destinations or sources; no cycles; depth cap 12.
  function reparentLayer(fromId, toParentId, toIndex) {
    captureTemplateDrafts();
    if (templateLoadPending) {
      layerNotice = "Loading template…";
      renderPanel();
      return;
    }
    var fromNode = findLayerNode(layerTree, fromId);
    var toParentNode = findLayerNode(layerTree, toParentId);
    if (!fromNode || !toParentNode || fromNode.parentId == null) {
      layerNotice = "Cannot reparent this layer";
      renderPanel();
      return;
    }
    if (String(fromNode.parentId) === String(toParentId)) {
      layerNotice = "same-parent reorders only — use reorder";
      renderPanel();
      return;
    }
    if (layerNodeIsAncestorOf(fromNode, toParentNode)) {
      layerNotice = "Cannot move a layer into its own subtree";
      renderPanel();
      return;
    }
    if (layerNodeBoundaryBlocked(fromNode) || layerNodeBoundaryBlocked(toParentNode)) {
      layerNotice = "Shadow and iframe boundaries are out of scope for reparent";
      renderPanel();
      return;
    }
    if (toParentNode.depth + 1 + layerSubtreeDepthSpan(fromNode) > 12) {
      layerNotice = "Move would exceed the layer depth cap";
      renderPanel();
      return;
    }
    var fromParentNode = findLayerNode(layerTree, fromNode.parentId);
    if (!fromParentNode) {
      layerNotice = "Cannot reparent this layer";
      renderPanel();
      return;
    }
    var fromIndex = fromParentNode.children.indexOf(fromNode);
    if (fromIndex < 0) {
      layerNotice = "Cannot reparent this layer";
      renderPanel();
      return;
    }
    var safeToIndex = Math.max(0, Math.min(toIndex, toParentNode.children.length));
    var movedElement = layerElements.get(fromNode.id);
    var fromParentElement = layerElements.get(fromParentNode.id);
    var toParentElement = layerElements.get(toParentNode.id);
    if (!movedElement || !fromParentElement || !toParentElement) {
      layerNotice = "Cannot reparent this layer";
      renderPanel();
      return;
    }
    var fromParentSelector = stableSelector(fromParentElement);
    var toParentSelector = stableSelector(toParentElement);
    if (pendingLayerOrderForParent(fromParentSelector) || pendingLayerOrderForParent(toParentSelector)) {
      layerNotice = "A layer move is already with the agent";
      renderPanel();
      return;
    }
    var movedRole = slotRoleForElement(movedElement);
    pendingFixedMove = movedRole === "fixed" ? String(fromId) + "->" + String(toParentId) + ":" + String(safeToIndex) : "";
    fixedMoveNote = "";
    var liveFromBaseline = liveLayerChildElements(fromParentElement);
    var liveToBaseline = liveLayerChildElements(toParentElement);
    var liveFromIndex = liveFromBaseline.indexOf(movedElement);
    if (liveFromIndex < 0) liveFromIndex = fromIndex;
    // Destination children are the projected tree (may already include other ghosts).
    var destChildren = toParentNode.children.slice();
    destChildren.splice(safeToIndex, 0, fromNode);
    var orderedElements = destChildren.map(function (node) { return layerElements.get(node.id); });
    var preview = cloneMeasuredReparentPreview(toParentElement, movedElement, safeToIndex, orderedElements);
    var baselineOrder = liveFromBaseline.map(stableSelector);
    var toBaselineOrder = liveToBaseline.map(stableSelector);
    var orderedSelectors = orderedElements.map(stableSelector);
    var existingDraft = localLayerDraftForParent(toParentSelector) || localLayerDraftForParent(fromParentSelector);
    if (existingDraft && existingDraft.movedElement && existingDraft.movedElement !== movedElement) existingDraft = null;
    if (existingDraft && existingDraft.clientKey === activeLayerOrderDraftKey) existingDraft.fixedMoveNote = fixedMoveNote;
    if (!existingDraft) {
      layerOrderClientSequence += 1;
      existingDraft = {
        clientKey: "draft-" + layerOrderClientSequence,
        clientSequence: layerOrderClientSequence
      };
    }
    resetBatchCommitted();
    var nextDraft = {
      clientKey: existingDraft.clientKey,
      clientSequence: existingDraft.clientSequence,
      operation: "reparent",
      operationId: "",
      parentSelector: toParentSelector,
      fromParentSelector: fromParentSelector,
      toParentSelector: toParentSelector,
      fromSelector: stableSelector(movedElement),
      fromIndex: liveFromIndex,
      toIndex: safeToIndex,
      orderedSelectors: orderedSelectors,
      state: "draft",
      domSnapshotHash: domSnapshotHash(fromParentElement),
      toDomSnapshotHash: domSnapshotHash(toParentElement),
      baselineOrder: baselineOrder,
      toBaselineOrder: toBaselineOrder,
      parentElement: toParentElement,
      fromParentElement: fromParentElement,
      toParentElement: toParentElement,
      movedElement: movedElement,
      baselineChildren: liveFromBaseline.slice(),
      toBaselineChildren: liveToBaseline.slice(),
      expectedChildren: orderedElements.slice(),
      fixedMoveNote: fixedMoveNote
    };
    layerOperationPollStopped = false;
    layerNotice = preview.unavailable && movedRole === "fixed"
      ? "Preview could not be generated for this fixed layer move. Send is disabled."
      : (preview.unavailable || "");
    layerPreview = {
      parentElement: toParentElement, fromIndex: liveFromIndex, toIndex: safeToIndex,
      orderedElements: orderedElements, measuredRects: preview.measuredRects || [],
      approximate: !!preview.approximate, parentWidth: preview.parentWidth || 0, parentHeight: preview.parentHeight || 0,
      movedElement: movedElement, movedRole: movedRole, unavailable: preview.unavailable || "",
      operation: "reparent"
    };
    nextDraft.preview = layerPreview;
    layerOrderDrafts[nextDraft.clientKey] = nextDraft;
    activeLayerOrderDraftKey = nextDraft.clientKey;
    projectLayerOrderOntoTree(nextDraft);
    renderPanel();
  }

  function wireframeMarkup() {
    if (!layerPreview) return "";
    if (layerPreview.unavailable) return '<p class="raven-grab-empty">' + escapeHtml(layerPreview.unavailable) + "</p>";
    var boxes = layerPreview.orderedElements.map(function (element, index) {
      return '<span class="raven-grab-wire-box" data-moved="' + (element === layerPreview.movedElement ? "true" : "false") + '">' + (index + 1) + "</span>";
    }).join("");
    return '<div class="raven-grab-wireframe">' + boxes + "</div>";
  }

  function sendLayerIntent(draft) {
    if (!draft || draft.state !== "draft" || !draft.preview || templateLoadPending || (draft.preview.movedRole === "fixed" && draft.preview.unavailable)) return null;
    var isReparent = draft.operation === "reparent";
    if (isReparent) {
      if (!liveLayerChildrenMatch(draft.fromParentElement, draft.baselineChildren)
        || !liveLayerChildrenMatch(draft.toParentElement, draft.toBaselineChildren)) {
        draft.state = "needs-recheck";
        if (draft.clientKey === activeLayerOrderDraftKey) {
          layerPreview = null;
          pendingFixedMove = "";
          fixedMoveNote = "";
        }
        layerNotice = "Page changed — re-propose the move";
        return null;
      }
    } else if (!liveLayerChildrenMatch(draft.parentElement, draft.baselineChildren)) {
      draft.state = "needs-recheck";
      if (draft.clientKey === activeLayerOrderDraftKey) {
        layerPreview = null;
        pendingFixedMove = "";
        fixedMoveNote = "";
      }
      layerNotice = "Page changed — re-propose the move";
      return null;
    }
    var preview = draft.preview;
    draft.parentElement = preview.parentElement;
    draft.movedElement = preview.movedElement;
    draft.baselineChildren = draft.baselineChildren.slice();
    draft.expectedChildren = preview.orderedElements.slice();
    if (isReparent && draft.toBaselineChildren) draft.toBaselineChildren = draft.toBaselineChildren.slice();
    var selectionOrder = [];
    orderedSelection().forEach(function (element) {
      var index = preview.orderedElements.indexOf(element);
      if (index !== -1) selectionOrder.push(index + 1);
    });
    var body;
    if (isReparent) {
      body = {
        operation: "reparent", page: location.pathname,
        fromParentSelector: draft.fromParentSelector,
        toParentSelector: draft.toParentSelector,
        fromIndex: preview.fromIndex, toIndex: preview.toIndex,
        orderedSelectors: preview.orderedElements.map(stableSelector),
        selectionOrder: selectionOrder,
        measuredRects: preview.measuredRects,
        approximate: preview.approximate,
        domSnapshotHash: draft.domSnapshotHash,
        toDomSnapshotHash: draft.toDomSnapshotHash,
        toBaselineOrder: (draft.toBaselineOrder || []).slice()
      };
    } else {
      body = {
        operation: "reorder", page: location.pathname,
        parentSelector: stableSelector(preview.parentElement),
        fromIndex: preview.fromIndex, toIndex: preview.toIndex,
        orderedSelectors: preview.orderedElements.map(stableSelector),
        selectionOrder: selectionOrder,
        measuredRects: preview.measuredRects,
        approximate: preview.approximate,
        domSnapshotHash: draft.domSnapshotHash
      };
    }
    body.fromSelector = draft.fromSelector;
    body.baselineOrder = draft.baselineOrder.slice();
    if (preview.movedRole) body.movedRole = preview.movedRole;
    if (preview.movedRole === "fixed") {
      body.fixedMove = true;
      body.note = draft.fixedMoveNote || "";
    }
    draft.body = body;
    draft.mismatchPolls = 0;
    return draft;
  }

  function trackPendingSend(factory) {
    pendingSendCount += 1;
    renderPanel();
    var request;
    try { request = factory(); }
    catch (error) { request = Promise.reject(error); }
    return request.then(function (value) {
      return { ok: true, value: value };
    }, function (error) {
      return { ok: false, error: error };
    }).then(function (outcome) {
      pendingSendCount = Math.max(0, pendingSendCount - 1);
      renderPanel();
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    });
  }

  function sendLayerOrderRecord(order) {
    return trackPendingSend(function () {
      return fetch(bridgeUrl("/layers-intent"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order.body) })
        .then(function (response) { if (!response.ok) throw new Error("Bridge returned " + response.status); return response.json(); })
        .then(function (result) {
          if (!result || !result.operationId) throw new Error("Bridge returned no layer operation id");
          return { batchId: result.batchId, id: result.operationId };
        });
      });
  }

  function hasApplyingLayerOrders() {
    return activeLayerOrders().some(function (order) { return !!order.operationId && (order.state === "applying" || order.committed === true); });
  }

  function ensureLayerOperationPoll() {
    var orders = activeLayerOrders().filter(function (order) { return !!order.operationId; });
    if (layerOperationPollStopped || layerOperationPollTimer !== null || (activeTabB !== "layers" && !hasApplyingLayerOrders()) || !orders.length) return;
    layerOperationPollTimer = setTimeout(function () {
      layerOperationPollTimer = null;
      pollLayerOperation();
    }, 1500);
  }

  function pollLayerOperation() {
    if (layerOperationPollStopped || (activeTabB !== "layers" && !hasApplyingLayerOrders())) return;
    refreshAppliedLayerTree();
    var orders = activeLayerOrders().filter(function (order) { return !!order.operationId; });
    orders.forEach(function (order) {
      if (order.pollInFlight) return;
      var operationId = order.operationId;
      order.pollInFlight = true;
      fetch(bridgeUrl("/layers-operation") + "&id=" + encodeURIComponent(operationId))
        .then(function (response) {
          if (!response.ok) throw new Error("Bridge returned " + response.status);
          return response.json();
        })
        .then(function (result) {
          order.pollInFlight = false;
          if (pendingLayerOrderForId(operationId) !== order) return;
          handleLayerOperationResult(result);
        })
        .catch(function (error) {
          order.pollInFlight = false;
          if (pendingLayerOrderForId(operationId) !== order) return;
          order.pollError = true;
          layerNotice = "Could not check layer move status";
          renderPanel();
          ensureLayerOperationPoll();
          console.error("[Raven Grab] GET /layers-operation failed.", error);
        });
    });
  }

  function hasPendingStyleChanges(batchId) {
    return Object.keys(styleChanges).some(function (id) {
      var change = styleChanges[id];
      return change.batchId === batchId && (change.state === "applying" || change.state === "sent");
    });
  }

  function ensureBatchPoll() {
    pollingBatchIds = pollingBatchIds.filter(function (batchId) { return hasPendingStyleChanges(batchId); });
    if (!pollingBatchIds.length || batchPollTimer !== null || batchPollInFlight) return;
    batchPollTimer = setTimeout(function () {
      batchPollTimer = null;
      pollBatch();
    }, 1500);
  }

  function pollBatch() {
    pollingBatchIds = pollingBatchIds.filter(function (batchId) { return hasPendingStyleChanges(batchId); });
    if (batchPollInFlight || !pollingBatchIds.length) return;
    var committedBatchIds = pollingBatchIds.slice();
    batchPollInFlight = true;
    Promise.all(committedBatchIds.map(function (committedBatchId) {
      return fetch(bridgeUrl("/batch") + "&batchId=" + encodeURIComponent(committedBatchId))
        .then(function (response) {
          if (!response.ok) throw new Error("Bridge returned " + response.status);
          return response.json();
        })
        .then(function (batch) {
          return { batchId: committedBatchId, records: batch && batch.changes ? batch.changes : [] };
        });
    }))
      .then(function (results) {
        var changed = false;
        results.forEach(function (result) {
          Object.keys(styleChanges).forEach(function (id) {
            var change = styleChanges[id];
            if (!change.serverId || change.batchId !== result.batchId) return;
            var record = null;
            for (var i = 0; i < result.records.length; i += 1) {
              if (result.records[i].id === change.serverId) {
                record = result.records[i];
                break;
              }
            }
            if (!record || (record.state !== "applied" && record.state !== "rejected" && record.state !== "superseded")) return;
            if (change.state !== record.state) {
              change.state = record.state;
              changed = true;
            }
          });
        });
        batchPollInFlight = false;
        if (changed) renderPanel();
        pollingBatchIds = pollingBatchIds.filter(function (batchId) { return hasPendingStyleChanges(batchId); });
        ensureBatchPoll();
        checkActiveDispatchTerminal();
      })
      .catch(function (error) {
        batchPollInFlight = false;
        ensureBatchPoll();
        console.error("[Raven Grab] GET /batch failed.", error);
      });
  }

  function handleLayerOperationResult(result) {
    if (!result) return;
    var order = layerOrderRecordForId(result.id);
    if (!order) return;
    var priorState = order.state;
    if (result.state === "rejected") {
      order.state = "rejected";
      layerNotice = "Layer move rejected";
      var rejectedElement = order.movedElement;
      restoreLayerTreeFromLiveDom(rejectedElement, order);
      ensureLayerOperationPoll();
      checkActiveDispatchTerminal();
      return;
    }
    if (result.state === "applied") {
      reconcileAppliedLayerOperation(order);
      return;
    }
    if (result.state === "applying") {
      order.state = "applying";
      layerNotice = "Applying…";
    } else {
      order.state = "queued";
      layerNotice = "Queued with agent";
    }
    if (order.state !== priorState) renderPanel();
    ensureLayerOperationPoll();
    checkActiveDispatchTerminal();
  }

  function reconcileAppliedLayerOperation(order) {
    if (!order) return;
    // A4 defers panel renders while a style editor/scrub is open — adopting the
    // rebuilt tree now would swap layerElements under rows still showing old IDs,
    // so defer adoption too and let the next poll retry once the editor closes.
    if (activeStyleEditorFlush || activeStyleScrub) { ensureLayerOperationPoll(); return; }
    var previousTree = appliedLayerTree;
    var previousElements = layerElements;
    var candidateTree = buildLayerTree(document.body);
    var candidateElements = layerElements;
    if (liveLayerChildrenMatch(order.parentElement, order.expectedChildren)) {
      adoptRebuiltLayerTree(candidateTree, candidateElements, order);
      checkActiveDispatchTerminal();
      return;
    }
    appliedLayerTree = previousTree;
    layerTree = previousTree;
    layerElements = previousElements;
    order.state = "applying";
    order.mismatchPolls = (order.mismatchPolls || 0) + 1;
    if (order.mismatchPolls > 8) {
      order.state = "mismatch";
      layerNotice = "Agent said it applied the move, but the page hasn't changed — drag again to re-check";
    } else {
      layerNotice = "Applying…";
    }
    renderPanel();
    ensureLayerOperationPoll();
    checkActiveDispatchTerminal();
  }

  function capturePanelDrafts() {
    var instruction = panelQuery("[data-instruction]");
    if (instruction) instructionDraft = instruction.value;
    var issueType = panelQuery("[data-issue-type]");
    var issueSize = panelQuery("[data-issue-size]");
    var useCase = panelQuery("[data-use-case]");
    var email = panelQuery("[data-component-email]");
    var nameField = panelQuery("[data-component-name]");
    if (issueType) componentRequest.issueType = issueType.value;
    if (issueSize) componentRequest.issueSize = issueSize.value;
    if (useCase) componentRequest.useCase = useCase.value;
    if (email) componentRequest.email = email.value;
    if (nameField) componentName = nameField.value;
    captureTemplateDrafts();
  }

  function layerOrderStatus(order) {
    if (!order) return "Draft";
    if (order.state === "draft") return "Pending";
    if (order.state === "needs-recheck" || order.state === "stale") return "Needs recheck";
    if (order.state === "registration-error") return "Not sent";
    if (order.state === "registering") return "Sending";
    if (order.state === "queued") return "Sent";
    if (order.state === "applying") return "Applying";
    if (order.state === "applied") return "Applied ✓";
    if (order.state === "rejected") return "Rejected";
    return "Needs review";
  }

  function liveSelectionAvailable() {
    return !!selectedElement && selectedElement.isConnected !== false && !!currentSelection;
  }

  function validLayerDraft(draft) {
    if (!draft || draft.state !== "draft" || !draft.preview) return false;
    if (draft.preview.movedRole === "fixed" && draft.preview.unavailable) return false;
    return liveLayerDraftParentsMatch(draft);
  }

  function liveLayerDraftParentsMatch(draft) {
    if (!draft) return false;
    if (draft.operation === "reparent") {
      return liveLayerChildrenMatch(draft.fromParentElement, draft.baselineChildren)
        && liveLayerChildrenMatch(draft.toParentElement, draft.toBaselineChildren);
    }
    return liveLayerChildrenMatch(draft.parentElement, draft.baselineChildren);
  }

  function rowsForStyleDraft(draft, isActive) {
    var rows = [];
    var hasStrokeDraft = false;
    var selector = draft.selector || (draft.selection && draft.selection.selector) || "element";
    Object.keys(draft.styleEdits).forEach(function (property) {
      var edit = draft.styleEdits[property];
      if (edit.groupId === "stroke") {
        hasStrokeDraft = true;
        return;
      }
      rows.push({ id: "draft-style:" + draft.clientKey + ":" + property, kind: "style", type: "Style", target: selector + " · " + property + " · " + edit.oldValue + " → " + (edit.token || edit.newValue) + " · " + (edit.scope || draft.editScope), status: edit.needsRecheck ? "Needs recheck" : "Pending", removable: true, local: true });
    });
    Object.keys(draft.stateStyleEdits || {}).forEach(function (key) {
      var edit = draft.stateStyleEdits[key];
      rows.push({ id: "draft-state-style:" + draft.clientKey + ":" + key, kind: "state-style", type: "State", target: selector + ":" + edit.state + " · " + edit.property + " · " + edit.oldValue + " → " + (edit.token || edit.newValue) + " · " + (edit.scope || draft.editScope), status: edit.needsRecheck ? "Needs recheck" : "Pending", removable: true, local: true });
    });
    Object.keys(draft.tokenIntents).forEach(function (key) {
      var intent = draft.tokenIntents[key];
      rows.push({ id: "draft-token:" + draft.clientKey + ":" + key, kind: "token", type: "Token", target: selector + " · " + (intent.property || "token") + " · " + (intent.oldTokenPath || intent.oldToken || "current") + " → " + (intent.newTokenPath || intent.newToken || "new"), status: intent.needsRecheck || intent.invalid ? "Needs recheck" : "Pending", removable: true, local: true });
    });
    if (hasStrokeDraft) {
      var strokeNeedsRecheck = STROKE_PROPERTIES.some(function (property) {
        return !!draft.styleEdits[property] && draft.styleEdits[property].groupId === "stroke" && !!draft.styleEdits[property].needsRecheck;
      });
      rows.push({ id: "draft-stroke:" + draft.clientKey, kind: "stroke", type: "Stroke", target: selector + " · " + strokeSummary(strokeModelForDraft(draft)), status: strokeNeedsRecheck ? "Needs recheck" : "Pending", removable: true, local: true });
    }
    if (draft.textEdit) {
      rows.push({ id: "draft-text:" + draft.clientKey, kind: "text", type: "Copy", target: selector + " · “" + truncateCopy(draft.textEdit.oldText) + "” → “" + truncateCopy(draft.textEdit.newText) + "”", status: "Pending", removable: true, local: true });
    }
    // The active draft's instruction lives in the shared box; a stored/retry draft
    // carries its own on draft.instruction. Resolve by which this draft is.
    var effectiveInstruction = isActive ? instructionDraft : (draft.instruction || "");
    if (effectiveInstruction.trim()) rows.push({ id: "draft-instruction:" + draft.clientKey, kind: "instruction", type: "Instruction", target: selector + " · " + effectiveInstruction.trim(), status: "Pending", removable: true, local: true });
    return rows;
  }

  function allStyleDrafts() {
    localStyleDrafts().forEach(function (draft) {
      if (!draft.target) { dropStyleDraft(draft, true); return; }
      if (draft.target.isConnected === false && !draftAwaitingReconnect(draft)) dropStyleDraft(draft, true);
    });
    var drafts = localStyleDrafts();
    var active = activeStyleDraft();
    if (active) drafts.push(active);
    return drafts;
  }

  function pendingLogicalRows() {
    var rows = [];
    allStyleDrafts().forEach(function (draft) {
      rows = rows.concat(rowsForStyleDraft(draft, draft.clientKey === activeStyleDraftKey));
    });
    localLayerDrafts().forEach(function (draft) {
      var draftStatus = draft.state === "draft" && !validLayerDraft(draft) ? "Needs recheck" : layerOrderStatus(draft);
      var moveType = draft.operation === "reparent" ? "Reparent" : "Move";
      rows.push({ id: draft.clientKey, kind: "move", type: moveType, target: draft.fromSelector || draft.parentSelector, status: draftStatus, removable: true, local: true });
    });
    return rows;
  }

  function pendingLogicalCount() {
    return pendingLogicalRows().length + carriedPending.length;
  }

  function hasInvalidDrafts() {
    if (allStyleDrafts().some(function (draft) {
      if (!draft.target || draft.target.isConnected === false) return true;
      if (Object.keys(draft.styleEdits).some(function (property) { return !!draft.styleEdits[property].needsRecheck; })) return true;
      if (Object.keys(draft.stateStyleEdits || {}).some(function (key) { return !!draft.stateStyleEdits[key].needsRecheck; })) return true;
      return Object.keys(draft.tokenIntents).some(function (key) { return !!draft.tokenIntents[key].needsRecheck || !!draft.tokenIntents[key].invalid; });
    })) return true;
    return localLayerDrafts().some(function (draft) { return !validLayerDraft(draft); });
  }

  function hasDispatchableDrafts() {
    var hasStyleDraft = allStyleDrafts().some(function (draft) {
      return !!draft.target && draft.target.isConnected !== false && rowsForStyleDraft(draft, draft.clientKey === activeStyleDraftKey).length > 0;
    });
    return hasStyleDraft || carriedPending.length > 0 || localLayerDrafts().some(validLayerDraft);
  }

  function activeDispatchCounts() {
    var counts = { applied: 0, failed: 0 };
    if (!activeDispatch) return counts;
    activeDispatch.styleRecords.forEach(function (record) {
      var styleCount = record.logicalRows ? record.logicalRows.length : 1;
      if (record.state === "applied" || record.state === "superseded" || record.state === "sent-locally" || record.state === "preview-only") counts.applied += styleCount;
      else if (record.state === "rejected") counts.failed += styleCount;
    });
    activeDispatch.layerRecords.forEach(function (order) {
      if (order.state === "applied") counts.applied += 1;
      else if (order.state === "rejected" || order.state === "mismatch") counts.failed += 1;
    });
    return counts;
  }

  function batchUiState() {
    var nextCount = pendingLogicalCount();
    var activeCount = activeDispatch ? activeDispatch.logicalCount : 0;
    var counts;
    if (dispatchState === "registering") return { state: "registering", label: "Sending " + activeCount + " changes…", enabled: false, count: activeCount };
    if (dispatchState === "committing") return { state: "committing", label: "Sending " + activeCount + " changes…", enabled: false, count: activeCount };
    if (dispatchState === "applying") {
      if (nextCount) return { state: "applying-with-next", label: sendQueued ? "Applying " + activeCount + " · " + nextCount + " queued" : "Applying " + activeCount + " · send " + nextCount + " next", enabled: !sendQueued, count: nextCount };
      return { state: "applying", label: "Applying " + activeCount + " changes…", enabled: false, count: activeCount };
    }
    if (dispatchState === "done") {
      if (grabConfig && activeDispatch && activeDispatch.styleRecords.length && activeDispatch.styleRecords.every(function (record) { return record.state === "preview-only"; })) return { state: "done", label: "Preview only", enabled: false, count: nextCount };
      if (grabConfig && activeDispatch && activeDispatch.styleRecords.length && activeDispatch.styleRecords.every(function (record) { return record.state === "sent-locally"; })) return { state: "done", label: "Sent locally", enabled: false, count: nextCount };
      counts = activeDispatchCounts();
      return { state: "done", label: counts.failed ? "Applied " + counts.applied + " · " + counts.failed + " need review" : activeCount + " changes applied ✓", enabled: false, count: nextCount };
    }
    if (dispatchState === "registration-error") return { state: "registration-error", label: "Retry send", enabled: !!activeDispatch && !activeDispatch.registrationErrors.batchMismatch, count: activeCount };
    if (dispatchState === "commit-error") return { state: "commit-error", label: "Retry send", enabled: !!activeDispatch && !!activeDispatch.batchId, count: activeCount };
    if (nextCount && (!hasDispatchableDrafts() || hasInvalidDrafts())) return { state: "pending-invalid", label: "Review pending changes", enabled: false, count: nextCount };
    if (hasDispatchableDrafts()) return { state: "pending", label: "Send " + nextCount + (nextCount === 1 ? " change" : " changes"), enabled: true, count: nextCount };
    return { state: "idle", label: "Send to agent", enabled: false, count: 0 };
  }

  function changeTrayItems() {
    var items = pendingLogicalRows();
    allLayerOrders().forEach(function (order) {
      items.push({ id: order.operationId || order.clientKey, batchId: order.batchId, kind: "move", type: "Move", target: order.fromSelector || order.parentSelector, status: layerOrderStatus(order), removable: false, retryable: order.state === "rejected" });
    });
    appliedLayerReceipts.forEach(function (order) {
      if (!activeDispatch || activeDispatch.layerRecords.indexOf(order) === -1) return;
      if (items.some(function (item) { return item.id === (order.operationId || order.clientKey); })) return;
      items.push({ id: order.operationId || order.clientKey, batchId: order.batchId, kind: "move", type: "Move", target: order.fromSelector || order.parentSelector, status: layerOrderStatus(order), removable: false, retryable: false });
    });
    Object.keys(styleChanges).forEach(function (id) {
      var change = styleChanges[id];
      if (grabConfig && (change.state === "sent-locally" || change.state === "preview-only")) return;
      if ((!activeDispatch || activeDispatch.styleRecords.indexOf(change) === -1) && change.state !== "rejected") return;
      var status = change.state === "applied" ? "Applied ✓"
        : (change.state === "superseded" ? "Superseded"
          : (change.state === "applying" ? "Applying"
            : (change.state === "rejected" ? "Rejected" : "Sent")));
      if (change.state === "registering") status = "Sending";
      if (change.state === "registration-error") status = "Not sent";
      if (change.state === "sent-locally") status = "Sent locally";
      if (change.state === "preview-only") status = "Preview only";
      var logicalRows = change.logicalRows && change.logicalRows.length ? change.logicalRows : [{ kind: "style", type: "Style", target: change.selector || "element" }];
      logicalRows.forEach(function (logicalRow, index) {
        items.push({ id: id + ":" + index, sourceId: id, batchId: change.batchId, kind: logicalRow.kind || "style", type: logicalRow.type || "Style", target: logicalRow.target || change.target, status: status, removable: false, retryable: change.state === "rejected" });
      });
    });
    carriedPending.forEach(function (entry) {
      items.push({ id: "carried:" + entry.key, kind: "change", type: "Carried", target: entry.label || "element", status: "Pending", local: true, removable: true });
    });
    return items;
  }

  function changeTrayRowsMarkup(items) {
    var rows = items.map(function (item) {
      var icon = item.kind === "move" ? "⇅" : (item.kind === "instruction" ? "✎" : "◆");
      var type = item.type || (item.kind === "move" ? "Move" : "Style");
      var control = item.removable
        ? '<button class="raven-grab-change-control" type="button" data-remove-change="' + escapeHtml(item.id) + '">Remove</button>'
        : (item.retryable ? '<button class="raven-grab-change-control" type="button" data-retry-change="' + escapeHtml(item.sourceId || item.id) + '">Retry</button>' : "");
      var isError = item.status === "Rejected" || item.status === "Needs review" || item.status === "Needs recheck" || item.status === "Not sent";
      return '<li class="raven-grab-change-row" data-local="' + (item.local ? "true" : "false") + '" data-error="' + (isError ? "true" : "false") + '"><span class="raven-grab-change-icon" aria-hidden="true">' + icon + '</span><span class="raven-grab-change-copy"><strong>' + escapeHtml(type) + '</strong><span title="' + escapeHtml(item.target) + '">' + escapeHtml(item.target) + '</span></span><span class="raven-grab-change-status">' + escapeHtml(item.status) + '</span>' + control + '</li>';
    }).join("");
    return rows;
  }

  function changeTraySectionMarkup(items, heading, summary, role) {
    if (!items.length) return "";
    var collapsed = !!changeTrayCollapsed[role];
    var bodyId = "raven-grab-tray-" + role;
    return '<section class="raven-grab-changes" aria-label="' + escapeHtml(heading) + '">'
      + '<button class="raven-grab-section-toggle raven-grab-changes-toggle" type="button" data-change-tray-toggle="' + escapeHtml(role) + '" aria-expanded="' + (collapsed ? "false" : "true") + '" aria-controls="' + bodyId + '">'
      + '<span class="raven-grab-changes-heading"><strong>' + escapeHtml(heading) + '</strong><span>' + escapeHtml(summary) + '</span></span>'
      + '<span class="raven-grab-caret" aria-hidden="true">▾</span></button>'
      + '<div class="raven-grab-collapsible" id="' + bodyId + '" data-change-tray-body="' + escapeHtml(role) + '" data-open="' + (collapsed ? "false" : "true") + '" aria-hidden="' + (collapsed ? "true" : "false") + '"><div class="raven-grab-collapsible-inner"><ul class="raven-grab-change-list">' + changeTrayRowsMarkup(items) + '</ul></div></div>'
      + '</section>';
  }

  function changesTrayMarkup() {
    var items = changeTrayItems();
    if (!items.length) return "";
    var count = pendingLogicalCount();
    var localItems = items.filter(function (item) { return !!item.local; });
    var submittedItems = items.filter(function (item) { return !item.local; });
    if (dispatchState !== "idle" && localItems.length) {
      return changeTraySectionMarkup(submittedItems, "Applying", activeDispatch ? activeDispatch.logicalCount + " active" : submittedItems.length + " active", "applying") + changeTraySectionMarkup(localItems, "Next changes", count + " pending", "next");
    }
    if (dispatchState !== "idle") return changeTraySectionMarkup(items, "Applying", activeDispatch ? activeDispatch.logicalCount + " active" : submittedItems.length + " active", "applying");
    return changeTraySectionMarkup(items, "Pending changes", count + " pending", "pending");
  }

  function styleDraftForClientKey(clientKey) {
    if (clientKey === activeStyleDraftKey) return activeStyleDraft();
    return styleDrafts[clientKey] || null;
  }

  function tokenForDraftKey(draft, tokenKey) {
    var selectionTokens = draft.selection && draft.selection.tokens ? draft.selection.tokens : [];
    var token = selectionTokens[Number(tokenKey)];
    if (token) return token;
    var intent = draft.tokenIntents[tokenKey];
    for (var i = 0; intent && i < selectionTokens.length; i += 1) {
      if (selectionTokens[i].property === intent.property && tokenPathFor(selectionTokens[i]) === (intent.oldTokenPath || intent.oldToken)) return selectionTokens[i];
    }
    return null;
  }

  function restoreDraftStyleProperty(draft, property) {
    var original = draft.styleEditOriginalInline[property];
    var target = draft.styleEditTarget || draft.target;
    restoreStyleOriginalEntries(property, original, target);
    delete draft.styleEdits[property];
    delete draft.styleEditOriginalInline[property];
  }

  function restoreDraftToken(draft, tokenKey) {
    var token = tokenForDraftKey(draft, tokenKey);
    if (token && draft.previewOriginals[token.cssVar]) {
      restoreTokenPreviewEntries(token.cssVar, draft.previewOriginals[token.cssVar]);
      delete draft.previewOriginals[token.cssVar];
    }
    delete draft.tokenIntents[tokenKey];
  }

  function pruneEmptyStyleDraft(draft) {
    // stateStyleEdits (hover/focus edits) count as real work too — a draft holding
    // only those must survive pruning (pre-existing omission alongside styleEdits/tokens).
    if (!draft || Object.keys(draft.styleEdits).length || Object.keys(draft.tokenIntents).length || Object.keys(draft.stateStyleEdits || {}).length || draft.textEdit) return;
    if (draft.clientKey === activeStyleDraftKey) {
      if (!instructionDraft.trim()) activeStyleDraftKey = null;
    }
    // A stored draft may hold only a carried instruction (e.g. a retry whose last
    // style edit was removed) — keep it so the instruction still sends, mirroring
    // the active-draft branch that keeps the key alive while the box has text.
    else if (!(draft.instruction && draft.instruction.trim())) delete styleDrafts[draft.clientKey];
  }

  function removeChange(id) {
    if (id.indexOf("carried:") === 0) {
      var carriedKey = id.slice("carried:".length);
      carriedPending = carriedPending.filter(function (entry) { return entry.key !== carriedKey; });
      persistPendingNow();
      renderPanel();
      syncSendButtonDisabled();
      return;
    }
    if (id.indexOf("draft-stroke:") === 0) {
      var strokeClientKey = id.slice("draft-stroke:".length);
      var strokeDraft = styleDraftForClientKey(strokeClientKey);
      if (!strokeDraft) return;
      if (strokeClientKey === activeStyleDraftKey) removeStrokeEditGroup();
      else STROKE_PROPERTIES.forEach(function (property) {
        if (strokeDraft.styleEdits[property] && strokeDraft.styleEdits[property].groupId === "stroke") restoreDraftStyleProperty(strokeDraft, property);
      });
      pruneEmptyStyleDraft(strokeDraft);
    } else if (id.indexOf("draft-style:") === 0) {
      var styleParts = id.slice("draft-style:".length).split(":");
      var styleClientKey = styleParts.shift();
      var property = styleParts.join(":");
      var styleDraft = styleDraftForClientKey(styleClientKey);
      if (!styleDraft || !styleDraft.styleEdits[property]) return;
      if (styleClientKey === activeStyleDraftKey) {
        restoreStyleEdit(property);
        delete styleEdits[property];
        delete styleEditOriginalInline[property];
      } else restoreDraftStyleProperty(styleDraft, property);
      pruneEmptyStyleDraft(styleDraft);
    } else if (id.indexOf("draft-text:") === 0) {
      var textClientKey = id.slice("draft-text:".length);
      var textDraft = styleDraftForClientKey(textClientKey);
      if (!textDraft || !textDraft.textEdit) return;
      if (textEditingElement === textDraft.textEdit.target) cancelTextEditLive();
      if (textDraft.textEdit.target && textDraft.textEdit.target.isConnected !== false) {
        textDraft.textEdit.target.textContent = textDraft.textEdit.oldText;
      }
      if (textClientKey === activeStyleDraftKey) textEdit = null;
      else textDraft.textEdit = null;
      pruneEmptyStyleDraft(textDraft);
    } else if (id.indexOf("draft-token:") === 0) {
      var tokenParts = id.slice("draft-token:".length).split(":");
      var tokenClientKey = tokenParts.shift();
      var tokenKey = tokenParts.join(":");
      var tokenDraft = styleDraftForClientKey(tokenClientKey);
      if (!tokenDraft || !tokenDraft.tokenIntents[tokenKey]) return;
      restoreDraftToken(tokenDraft, tokenKey);
      pruneEmptyStyleDraft(tokenDraft);
    } else if (id.indexOf("draft-instruction:") === 0) {
      var instrClientKey = id.slice("draft-instruction:".length);
      if (instrClientKey === activeStyleDraftKey) {
        clearInstructionText();
        syncActiveStyleDraftKey();
      } else {
        // A stored/retry draft surfaces its own instruction row; removing it must
        // clear that draft's carried instruction (not the shared box) and prune the
        // draft if nothing else remains — otherwise the "removed" instruction sends.
        var instrDraft = styleDrafts[instrClientKey];
        if (!instrDraft) return;
        delete instrDraft.instruction;
        pruneEmptyStyleDraft(instrDraft);
      }
    } else if (layerOrderDrafts[id]) {
      var clearedDraft = layerOrderDrafts[id];
      var clearedElement = clearedDraft ? clearedDraft.movedElement : null;
      delete layerOrderDrafts[id];
      if (activeLayerOrderDraftKey === id) {
        var remainingDrafts = localLayerDrafts();
        var nextActiveDraft = remainingDrafts.length ? remainingDrafts[remainingDrafts.length - 1] : null;
        activeLayerOrderDraftKey = nextActiveDraft ? nextActiveDraft.clientKey : null;
        layerPreview = nextActiveDraft ? nextActiveDraft.preview : null;
        pendingFixedMove = "";
        fixedMoveNote = nextActiveDraft ? nextActiveDraft.fixedMoveNote || "" : "";
        layerNotice = "";
      }
      restoreLayerTreeFromLiveDom(clearedElement, clearedDraft);
      return;
    } else return;
    renderPanel();
  }

  function newStoredStyleDraft(target, selection, selector) {
    styleDraftClientSequence += 1;
    return {
      clientKey: "style-draft-" + styleDraftClientSequence,
      clientSequence: styleDraftClientSequence,
      target: target,
      selector: selector || (selection && selection.selector) || "",
      selection: selection,
      selectionElements: target ? [target] : [],
      styleEdits: Object.create(null),
      stateStyleEdits: Object.create(null),
      textEdit: null,
      styleEditOriginalInline: Object.create(null),
      styleEditScopeSiblingsOriginal: Object.create(null),
      styleEditScopeSiblingsTarget: null,
      styleEditTarget: target,
      tokenIntents: Object.create(null),
      previewOriginals: Object.create(null),
      editScope: "instance",
      reactMetadata: null
    };
  }

  function retryStyleDraftForChange(change) {
    var target = change.target;
    if (target && target === selectedElement) {
      ensureActiveStyleDraftKey();
      return activeStyleDraft(true);
    }
    var existing = styleDraftForElement(target);
    if (existing) return existing;
    var selection = target && target.isConnected !== false ? selectionFor(target) : null;
    var draft = newStoredStyleDraft(target, selection, change.selector);
    styleDrafts[draft.clientKey] = draft;
    return draft;
  }

  function retryChange(id) {
    var order = layerOrderRecordForId(id);
    if (order && order.state === "rejected") {
      var existingRetryDraft = localLayerDraftForParent(order.parentSelector);
      if (!existingRetryDraft) layerOrderClientSequence += 1;
      var retryOrder = {};
      Object.keys(order).forEach(function (key) { retryOrder[key] = order[key]; });
      retryOrder.clientKey = existingRetryDraft ? existingRetryDraft.clientKey : "draft-" + layerOrderClientSequence;
      retryOrder.clientSequence = existingRetryDraft ? existingRetryDraft.clientSequence : layerOrderClientSequence;
      retryOrder.operationId = "";
      retryOrder.batchId = "";
      retryOrder.committed = false;
      retryOrder.state = liveLayerDraftParentsMatch(retryOrder) ? "draft" : "needs-recheck";
      layerOrderDrafts[retryOrder.clientKey] = retryOrder;
      activeLayerOrderDraftKey = retryOrder.clientKey;
      layerPreview = retryOrder.preview || null;
      if (retryOrder.state === "draft") projectLayerOrderOntoTree(retryOrder);
      renderPanel();
      return;
    }
    if (styleChanges[id] && styleChanges[id].state === "rejected") {
      var sourceChange = styleChanges[id];
      var payload = sourceChange.payload || {};
      var retryDraft = retryStyleDraftForChange(sourceChange);
      var retryTarget = retryDraft.target;
      var retryConnected = !!retryTarget && retryTarget.isConnected !== false;
      var retryReusesActive = !!retryTarget && retryTarget === selectedElement;
      if (retryConnected) {
        retryDraft.selection = selectionFor(retryTarget);
        retryDraft.selector = retryDraft.selection.selector;
      }
      // Restore the rejected record's frozen scope onto a fresh/stashed retry draft
      // (newStoredStyleDraft defaults to "instance") — otherwise a component-scoped
      // "apply to all instances" edit silently narrows on retry. The live active
      // buffer keeps its own current scope (never clobber a newer edit's scope).
      // Only a FRESH retry draft inherits the rejected record's frozen scope. A
      // stashed draft the user has kept editing keeps its own chosen scope —
      // otherwise a newer instance edit silently broadens to component-wide.
      var retryDraftIsFresh = Object.keys(retryDraft.styleEdits).length === 0 && Object.keys(retryDraft.tokenIntents).length === 0;
      if (!retryReusesActive && retryDraftIsFresh) {
        var frozenScope = "instance";
        (payload.styleEdits || []).forEach(function (edit) { if (edit && edit.scope === "component") frozenScope = "component"; });
        (payload.tokenIntents || []).forEach(function (intent) { if (intent && intent.scope === "component") frozenScope = "component"; });
        retryDraft.editScope = frozenScope;
      }
      (payload.styleEdits || []).forEach(function (edit) {
        // Never overwrite a newer APPLIED value the user has already staged for this
        // property with the older rejected value — but a needsRecheck placeholder from
        // a prior detached retry is stale, so let a reconnected retry re-process it.
        if (retryDraft.styleEdits[edit.property] && !retryDraft.styleEdits[edit.property].needsRecheck) return;
        var staged = {};
        Object.keys(edit).forEach(function (key) { staged[key] = edit[key]; });
        if (!retryConnected) staged.needsRecheck = true;
        retryDraft.styleEdits[edit.property] = staged;
        if (!staged.needsRecheck) {
          var savedStyleOriginal = sourceChange.originalStyleInline && sourceChange.originalStyleInline[edit.property];
          retryDraft.styleEditTarget = retryTarget;
          if (!retryDraft.styleEditOriginalInline[edit.property]) retryDraft.styleEditOriginalInline[edit.property] = savedStyleOriginal ? { value: savedStyleOriginal.value, priority: savedStyleOriginal.priority } : { value: retryTarget.style.getPropertyValue(edit.property), priority: retryTarget.style.getPropertyPriority(edit.property) };
          retryTarget.style.setProperty(edit.property, edit.newValue);
        }
      });
      (payload.tokenIntents || []).forEach(function (intent, intentPosition) {
        var tokenIndex = -1;
        if (retryDraft.selection && retryDraft.selection.tokens) {
          for (var i = 0; i < retryDraft.selection.tokens.length; i += 1) {
            if (retryDraft.selection.tokens[i].property === intent.property && tokenPathFor(retryDraft.selection.tokens[i]) === (intent.oldTokenPath || intent.oldToken)) { tokenIndex = i; break; }
          }
        }
        var stagedIntent = {};
        Object.keys(intent).forEach(function (key) { stagedIntent[key] = intent[key]; });
        if (tokenIndex === -1 || !retryConnected) stagedIntent.needsRecheck = true;
        var retryTokenKey = tokenIndex === -1 ? "retry-" + sourceChange.id + "-" + intentPosition : String(tokenIndex);
        if (retryDraft.tokenIntents[retryTokenKey] && !retryDraft.tokenIntents[retryTokenKey].needsRecheck) return;
        retryDraft.tokenIntents[retryTokenKey] = stagedIntent;
        if (!stagedIntent.needsRecheck) {
          var retryToken = retryDraft.selection.tokens[tokenIndex];
          var savedTokenOriginal = sourceChange.tokenPreviewOriginals && sourceChange.tokenPreviewOriginals[retryToken.cssVar];
          if (!retryDraft.previewOriginals[retryToken.cssVar]) retryDraft.previewOriginals[retryToken.cssVar] = savedTokenOriginal || [{ target: retryTarget, value: retryTarget.style.getPropertyValue(retryToken.cssVar), priority: retryTarget.style.getPropertyPriority(retryToken.cssVar) }];
          var retryTokenValue = stagedIntent.newTokenValue || "";
          for (var bridgeIndex = 0; !retryTokenValue && bridgeIndex < bridgeTokens.length; bridgeIndex += 1) {
            if (bridgeTokens[bridgeIndex].path === stagedIntent.newTokenPath) retryTokenValue = bridgeTokens[bridgeIndex].value;
          }
          if (retryTokenValue) retryTarget.style.setProperty(retryToken.cssVar, retryTokenValue);
        }
      });
      if (retryTarget === selectedElement) {
        activeStyleDraftKey = retryDraft.clientKey;
        if (payload.instruction && !instructionDraft.trim()) instructionDraft = payload.instruction;
      } else if (payload.instruction && !retryDraft.instruction) {
        // el isn't selected: the rejected instruction can't go to the shared box
        // (it'd clobber the current selection's). Carry it on the retry draft so it
        // survives to send (freeze honors draft.instruction) and reappears when el
        // is reactivated. Without this the user's typed instruction is lost on retry.
        // Never clobber a newer instruction the user already staged on this draft
        // (mirrors the styleEdits "don't overwrite a newer staged value" guard above).
        retryDraft.instruction = payload.instruction;
      }
      renderPanel();
    }
  }

  function applyQueuedChanges(batchId) {
    if (grabConfig || commitInFlight || pendingSendCount > 0 || !batchId) return Promise.reject(new Error("Batch is not ready to commit"));
    batchCommitted = true;
    try { window.sessionStorage.setItem("raven-grab-batch-committed", "true"); } catch (storageError) { /* session storage unavailable */ }
    var committedBatchId = batchId;
    commitInFlight = true;
    renderPanel();
    return fetch(bridgeUrl("/batch-commit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: committedBatchId })
    }).then(function (response) {
      if (!response.ok) throw new Error("Bridge returned " + response.status);
      commitInFlight = false;
      if (activeDispatch && activeDispatch.batchId === committedBatchId) {
        activeDispatch.committed = true;
        activeDispatch.styleRecords.forEach(function (record) { record.state = "applying"; });
        activeDispatch.layerRecords.forEach(function (order) { order.committed = true; order.state = "applying"; });
      }
      ensureLayerOperationPoll();
      if (pendingBatchId === committedBatchId) pendingBatchId = null;
      if (pollingBatchIds.indexOf(committedBatchId) === -1) pollingBatchIds.push(committedBatchId);
      ensureBatchPoll();
      dispatchState = "applying";
      renderPanel();
      checkActiveDispatchTerminal();
      return committedBatchId;
    }).catch(function (error) {
      commitInFlight = false;
      resetBatchCommitted();
      dispatchState = "commit-error";
      renderPanel();
      console.error("[Raven Grab] POST /batch-commit failed.", error);
      throw error;
    });
  }

  function resetBatchCommitted() {
    batchCommitted = false;
    try { window.sessionStorage.removeItem("raven-grab-batch-committed"); } catch (storageError) { }
  }

  function styleDraftContextForFreeze(draft, instruction) {
    return {
      clientKey: draft.clientKey,
      clientSequence: draft.clientSequence,
      target: draft.target,
      selector: draft.selector,
      selection: draft.selection,
      selectionElements: draft.selectionElements,
      styleEdits: draft.styleEdits,
      stateStyleEdits: draft.stateStyleEdits,
      textEdit: draft.textEdit || null,
      styleEditOriginalInline: draft.styleEditOriginalInline,
      styleEditScopeSiblingsOriginal: draft.styleEditScopeSiblingsOriginal,
      styleEditScopeSiblingsTarget: draft.styleEditScopeSiblingsTarget,
      styleEditTarget: draft.styleEditTarget,
      tokenIntents: draft.tokenIntents,
      previewOriginals: draft.previewOriginals,
      editScope: draft.editScope,
      reactMetadata: draft.reactMetadata,
      instructionDraft: instruction || ""
    };
  }

  // --- Cross-navigation persistence of un-sent changes --------------------
  // A full page load reruns this whole IIFE fresh (the __RAVEN_GRAB__ guard is
  // per-document), wiping every in-memory draft. Users accumulate several edits
  // across pages before sending, so losing them on navigation is data loss.
  // We serialize each live draft into the exact send-ready payload the freeze
  // path builds (while its node is still connected) and stash it in
  // sessionStorage. On the next load those become "carried" rows: detached from
  // any live node, not re-editable, but still sendable — they POST the frozen
  // payload straight to the bridge, bypassing the freeze/dispatch state machine
  // entirely (no live target, no clientKey collision, no batch interaction).
  var PENDING_STORE_KEY = "raven-grab-pending-v1";
  var pendingPersistTimer = null;

  function readCarriedPending() {
    try {
      var raw = window.sessionStorage.getItem(PENDING_STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (entry) { return entry && entry.payload && entry.endpoint; });
    } catch (error) { return []; }
  }

  function serializeLivePending() {
    var out = [];
    allStyleDrafts().forEach(function (draft) {
      if (!draft.target || draft.target.isConnected === false) return;
      var instruction = draft.instruction || "";
      var hasWork = Object.keys(draft.styleEdits || {}).length
        || Object.keys(draft.stateStyleEdits || {}).length
        || Object.keys(draft.tokenIntents || {}).length
        || !!draft.textEdit
        || !!instruction.trim();
      if (!hasWork) return;
      try {
        var ctx = styleDraftContextForFreeze(draft, instruction);
        var payload = JSON.parse(JSON.stringify(payloadForSend(true, draft.target, ctx)));
        out.push({
          key: "live:" + draft.clientKey,
          pathname: location.pathname,
          endpoint: grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab"),
          label: payload.selector || draft.selector || "element",
          payload: payload
        });
      } catch (error) { /* selection resolved to nothing mid-serialize — skip it */ }
    });
    return out;
  }

  function persistPendingNow() {
    if (pendingPersistTimer !== null) { clearTimeout(pendingPersistTimer); pendingPersistTimer = null; }
    try {
      // One writer: carried (prior-page) entries + this page's live drafts. A
      // freeze/delete that drops a live draft naturally drops it from storage
      // on the next persist, so already-sent work never resurrects as a zombie.
      var all = carriedPending.concat(serializeLivePending());
      if (all.length) window.sessionStorage.setItem(PENDING_STORE_KEY, JSON.stringify(all.slice(-100)));
      else window.sessionStorage.removeItem(PENDING_STORE_KEY);
    } catch (error) { /* storage unavailable or over quota — keep in memory */ }
  }

  function schedulePersistPending() {
    if (pendingPersistTimer !== null) return;
    pendingPersistTimer = setTimeout(function () { pendingPersistTimer = null; persistPendingNow(); }, 250);
  }

  function drainCarriedPending() {
    if (!carriedPending.length) return;
    var batch = carriedPending;
    carriedPending = [];
    persistPendingNow();
    renderPanel();
    batch.forEach(function (entry) {
      fetch(entry.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload)
      }).then(function (response) {
        if (!response.ok) throw new Error("Bridge returned " + response.status);
      }).catch(function (error) {
        // Re-carry a failed send so it is neither lost nor silently dropped.
        carriedPending.push(entry);
        persistPendingNow();
        renderPanel();
        setGlobalActionStatus("Couldn't send a carried change — it's still pending", "error");
        console.error("[Raven Grab] Carried change failed to send.", error);
      });
    });
  }

  function freezePendingDispatch() {
    var allRows = pendingLogicalRows();
    var activeBeforeFreeze = activeStyleDraft();
    var activeClientKeyBeforeFreeze = activeBeforeFreeze ? activeBeforeFreeze.clientKey : null;
    var activeTargetBeforeFreeze = activeBeforeFreeze ? activeBeforeFreeze.target : null;
    var activeInstructionBeforeFreeze = instructionDraft;
    var activeWasStashed = false;
    var styleRecords = [];
    var frozenDrafts = [];
    var layerRecords = [];
    if (activeBeforeFreeze && (Object.keys(activeBeforeFreeze.styleEdits).length || Object.keys(activeBeforeFreeze.tokenIntents).length)) {
      stashActiveStyleDraft();
      activeWasStashed = true;
    }
    var draftsForFreeze = localStyleDrafts();
    if (activeBeforeFreeze && !activeWasStashed) draftsForFreeze.push(activeBeforeFreeze);
    try {
      draftsForFreeze.forEach(function (draft) {
        var ownsInstruction = draft.clientKey === activeClientKeyBeforeFreeze && !!activeInstructionBeforeFreeze.trim();
        // Active draft's instruction is in the shared box; a stored retry draft carries
        // its own (see retryChange). rowsForStyleDraft resolves the same way via isActive.
        var draftInstruction = ownsInstruction ? activeInstructionBeforeFreeze : (draft.instruction || "");
        var logicalRows = rowsForStyleDraft(draft, ownsInstruction);
        if (!logicalRows.length) return;
        var draftContext = styleDraftContextForFreeze(draft, draftInstruction);
        var payload = payloadForSend(true, draft.target, draftContext);
        payload = JSON.parse(JSON.stringify(payload));
        changeSequence += 1;
        var styleChangeId = "style-" + changeSequence;
        styleRecords.push({
          id: styleChangeId,
          clientKey: draft.clientKey,
          clientSequence: draft.clientSequence,
          target: draft.target,
          selector: payload.selector,
          state: "registering",
          payload: payload,
          endpoint: grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab"),
          originalStyleInline: draft.styleEditOriginalInline,
          tokenPreviewOriginals: draft.previewOriginals,
          styleEditTarget: draft.styleEditTarget,
          logicalRows: logicalRows.map(function (row) { return { kind: row.kind, type: row.type, target: row.target }; })
        });
        frozenDrafts.push(draft);
      });
    } catch (error) {
      if (activeWasStashed && activeTargetBeforeFreeze) {
        // Clear the box first so activateStyleDraft doesn't early-return on a still
        // -occupied box (which would leave the instruction BOTH in the box and on the
        // re-stored draft, double-emitting it on the next freeze). With the box empty
        // activate fully restores the stashed draft and consumes its instruction.
        instructionDraft = "";
        activateStyleDraft(activeTargetBeforeFreeze);
      }
      instructionDraft = activeInstructionBeforeFreeze;
      throw error;
    }
    localLayerDrafts().forEach(function (draft) {
      var record = sendLayerIntent(draft);
      if (record) layerRecords.push(record);
    });
    var logicalCount = styleRecords.reduce(function (count, record) { return count + record.logicalRows.length; }, 0) + layerRecords.length;
    if (!logicalCount) return null;
    styleRecords.forEach(function (record) { styleChanges[record.id] = record; });
    if (styleRecords.length) {
      frozenDrafts.forEach(function (draft) {
        restoreStyleDraftPreview(draft, false); // keep sent copy visible on the page
        if (styleDrafts[draft.clientKey] === draft) delete styleDrafts[draft.clientKey];
      });
      instructionDraft = "";
      clearActiveStyleDraftState();
    }
    layerRecords.forEach(function (order) {
      delete layerOrderDrafts[order.clientKey];
      order.state = "registering";
      pendingLayerOrders[order.clientKey] = order;
    });
    if (layerRecords.some(function (order) { return order.clientKey === activeLayerOrderDraftKey; })) {
      activeLayerOrderDraftKey = null;
      layerPreview = null;
      pendingFixedMove = "";
      fixedMoveNote = "";
    }
    if (liveSelectionAvailable()) currentSelection = selectionFor(selectedElement);
    return {
      clientId: "dispatch-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      logicalCount: logicalCount,
      styleRecords: styleRecords.sort(function (left, right) {
        return left.clientSequence - right.clientSequence;
      }),
      layerRecords: layerRecords.sort(function (left, right) { return left.clientSequence - right.clientSequence; }),
      batchId: "",
      registeredRecordIds: Object.create(null),
      registrationErrors: Object.create(null),
      committed: false,
      submittedAt: Date.now(),
      sourceRows: allRows
    };
  }

  function recordRegistrationResult(key, record, result) {
    if (!activeDispatch || !result || !result.id || !result.batchId) throw new Error("Registration returned no batch or record id");
    if (!activeDispatch.batchId) {
      activeDispatch.batchId = result.batchId;
      pendingBatchId = result.batchId;
    } else if (activeDispatch.batchId !== result.batchId) {
      activeDispatch.registrationErrors.batchMismatch = "Batch mismatch: " + activeDispatch.batchId + " vs " + result.batchId;
      throw new Error(activeDispatch.registrationErrors.batchMismatch);
    }
    activeDispatch.registeredRecordIds[key] = result.id;
    delete activeDispatch.registrationErrors[key];
    record.batchId = result.batchId;
    if (activeDispatch.styleRecords.indexOf(record) !== -1) {
      record.serverId = result.id;
      record.state = "sent";
    } else {
      record.operationId = result.id;
      record.state = "queued";
      layerOperationPollStopped = false;
    }
  }

  function noteRegistrationError(key, record, error) {
    if (!activeDispatch) return;
    activeDispatch.registrationErrors[key] = error && error.message ? error.message : "Registration failed";
    record.state = "registration-error";
    console.error("[Raven Grab] Registration failed.", error);
  }

  function registrationPlan() {
    var plan = [];
    if (activeDispatch) activeDispatch.styleRecords.forEach(function (record) {
      var key = "style:" + record.clientKey;
      if (!activeDispatch.registeredRecordIds[key]) plan.push({ key: key, kind: "style", record: record });
    });
    if (activeDispatch) activeDispatch.layerRecords.forEach(function (order) {
      var key = "layer:" + order.clientKey;
      if (!activeDispatch.registeredRecordIds[key]) plan.push({ key: key, kind: "layer", record: order });
    });
    return plan;
  }

  function registerActiveDispatch() {
    if (!activeDispatch) return;
    dispatchState = "registering";
    var plan = registrationPlan();
    var chain = Promise.resolve();
    plan.forEach(function (step) {
      chain = chain.then(function () {
        step.record.state = "registering";
        var request = step.kind === "style" ? sendStyleChange(step.record) : sendLayerOrderRecord(step.record);
        return request.then(function (result) {
          try { recordRegistrationResult(step.key, step.record, result); }
          catch (error) { noteRegistrationError(step.key, step.record, error); }
        }, function (error) {
          noteRegistrationError(step.key, step.record, error);
        });
      });
    });
    chain.then(function () {
      if (!activeDispatch) return;
      var missing = registrationPlan();
      var hasError = Object.keys(activeDispatch.registrationErrors).length > 0;
      if (pendingSendCount !== 0 || hasError || missing.length || !activeDispatch.batchId) {
        dispatchState = "registration-error";
        renderPanel();
        if (activeDispatch.registrationErrors.batchMismatch) setGlobalActionStatus(activeDispatch.registrationErrors.batchMismatch, "error");
        return;
      }
      dispatchState = "committing";
      renderPanel();
      applyQueuedChanges(activeDispatch.batchId).catch(function () { /* applyQueuedChanges owns commit-error state */ });
    });
  }

  function completeStandaloneDispatch() {
    if (!activeDispatch || (!activeDispatch.styleRecords.length && !activeDispatch.layerRecords.length)) {
      dispatchState = "idle";
      renderPanel();
      setGlobalActionStatus("No valid changes to send", "error");
      return;
    }
    dispatchState = "registering";
    renderPanel();
    // Standalone endpoints do not expose bridge batch registration/commit for
    // style edits, so each style record sends as an independent endpoint
    // request. Layer moves always go through the bridge's own /layers-intent
    // registration + /layers-operation poll (bridgeUrl is unconditional, not
    // gated on standalone mode), so they register the same way the
    // full-bridge path does via recordRegistrationResult/noteRegistrationError.
    var sends = activeDispatch.styleRecords.map(function (record) {
      var key = "style:" + record.clientKey;
      if (record.state === "sent-locally" || record.state === "preview-only") return Promise.resolve();
      if (!record.endpoint) {
        record.state = "preview-only";
        delete activeDispatch.registrationErrors[key];
        return Promise.resolve();
      }
      return sendStyleChange(record).then(function () {
        record.state = "sent-locally";
        delete activeDispatch.registrationErrors[key];
      }, function (error) {
        noteRegistrationError(key, record, error);
      });
    }).concat(activeDispatch.layerRecords.map(function (order) {
      var key = "layer:" + order.clientKey;
      order.state = "registering";
      return sendLayerOrderRecord(order).then(function (result) {
        try { recordRegistrationResult(key, order, result); }
        catch (error) { noteRegistrationError(key, order, error); }
      }, function (error) {
        noteRegistrationError(key, order, error);
      });
    }));
    Promise.all(sends).then(function () {
      if (!activeDispatch) return;
      if (Object.keys(activeDispatch.registrationErrors).length) {
        dispatchState = "registration-error";
        renderPanel();
        return;
      }
      if (activeDispatch.layerRecords.length) {
        // Layer moves resolve asynchronously (applying -> applied/rejected),
        // unlike standalone style sends which are done as soon as the request
        // completes. Hand off to the same poll-driven terminal check the
        // full-bridge path uses instead of closing the dispatch immediately.
        activeDispatch.committed = true;
        dispatchState = "applying";
        renderPanel();
        ensureLayerOperationPoll();
        checkActiveDispatchTerminal();
        return;
      }
      finishActiveDispatch();
    });
  }

  function dispatchPendingBatch() {
    // Carried rows send independently of the dispatch state machine — POST their
    // frozen payloads straight away, even mid-flight, so Send always flushes them.
    if (carriedPending.length) drainCarriedPending();
    if (dispatchState === "registration-error") {
      if (activeDispatch && !activeDispatch.registrationErrors.batchMismatch) {
        if (grabConfig) completeStandaloneDispatch();
        else registerActiveDispatch();
      }
      return;
    }
    if (dispatchState === "commit-error") {
      if (activeDispatch && activeDispatch.batchId) {
        dispatchState = "committing";
        renderPanel();
        applyQueuedChanges(activeDispatch.batchId).catch(function () { /* applyQueuedChanges owns commit-error state */ });
      }
      return;
    }
    if (dispatchState !== "idle") {
      // A dispatch is in flight. Don't start a second one (single activeDispatch
      // slot) — queue, and finishActiveDispatch fires the next batch when this
      // one lands. Only queue when there is genuinely new pending work.
      if (hasDispatchableDrafts()) {
        sendQueued = true;
        setGlobalActionStatus("Queued — sends when the current batch finishes", "");
        renderPanel();
      }
      return;
    }
    // The copy edit is already staged via live input; exit edit mode cleanly (keeps the staged
    // textEdit) so the sent element carries no lingering contenteditable/spellcheck attributes.
    if (textEditingElement) teardownTextEditing(textEditingElement);
    if (activeStyleEditorFlush) activeStyleEditorFlush();
    capturePanelDrafts();
    var ui = batchUiState();
    if (!ui.enabled || ui.state !== "pending") return;
    dispatchState = "registering";
    if (dispatchDoneTimer !== null) clearTimeout(dispatchDoneTimer);
    try {
      activeDispatch = freezePendingDispatch();
    } catch (error) {
      dispatchState = "idle";
      renderPanel();
      setGlobalActionStatus(error && error.message ? error.message : "Review pending changes", "error");
      return;
    }
    if (!activeDispatch) {
      dispatchState = "idle";
      renderPanel();
      setGlobalActionStatus(grabConfig ? "Layer moves need a connected Raven bridge" : "No valid changes to send", "error");
      return;
    }
    resetBatchCommitted();
    renderPanel();
    if (grabConfig) completeStandaloneDispatch();
    else registerActiveDispatch();
  }

  function rebaseStyleDraft(draft) {
    var styleKeys = Object.keys(draft.styleEdits);
    var tokenKeys = Object.keys(draft.tokenIntents);
    var target = draft.target;
    if (!target || target.isConnected === false) {
      styleKeys.forEach(function (property) { draft.styleEdits[property].needsRecheck = true; });
      tokenKeys.forEach(function (key) { draft.tokenIntents[key].needsRecheck = true; });
      return;
    }
    restoreStyleDraftPreview(draft, false); // keep any sent copy; rebase only re-previews styles
    // Rebase re-previews on every element the draft was selected across, not
    // just its primary — otherwise a pending multi-select edit visually
    // collapses to one element after another dispatch completes.
    var rebaseTargets = (draft.selectionElements || []).filter(function (element) {
      return element && element.isConnected !== false;
    });
    if (rebaseTargets.indexOf(target) === -1) rebaseTargets.unshift(target);
    var freshSelection = selectionFor(target);
    var componentRebaseSiblings = [];
    // A component-scoped draft previewed onto every matching element; rebase
    // must re-preview onto them too or they visibly revert after a dispatch.
    if (draft.editScope === "component" && freshSelection.componentScope && freshSelection.componentScope.matchSelector) {
      try {
        Array.prototype.slice.call(document.querySelectorAll(freshSelection.componentScope.matchSelector)).forEach(function (element) {
          if (rebaseTargets.indexOf(element) === -1) rebaseTargets.push(element);
          if (element !== target && componentRebaseSiblings.indexOf(element) === -1) componentRebaseSiblings.push(element);
        });
      } catch (error) {}
    }
    draft.selection = freshSelection;
    draft.selector = freshSelection.selector;
    draft.styleEditTarget = target;
    Object.keys(draft.styleEditOriginalInline).forEach(function (property) { delete draft.styleEditOriginalInline[property]; });
    styleKeys.forEach(function (property) {
      var edit = draft.styleEdits[property];
      var liveValue = freshSelection.styles[property] || "";
      edit.oldValue = liveValue;
      delete edit.needsRecheck;
      var alreadyAppliedEverywhere = rebaseTargets.every(function (element) {
        return computedStyleValueForElement(element, property) === edit.newValue;
      });
      if (edit.groupId !== "stroke" && alreadyAppliedEverywhere) {
        delete draft.styleEdits[property];
        return;
      }
      draft.styleEditOriginalInline[property] = rebaseTargets.map(function (element) {
        return { element: element, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
      });
      if (componentRebaseSiblings.length) {
        draft.styleEditScopeSiblingsOriginal[property] = componentRebaseSiblings.map(function (element) {
          return { element: element, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
        });
        draft.styleEditScopeSiblingsTarget = target;
      }
      setStyleOnTargets(property, edit.newValue, rebaseTargets);
    });
    var rebasedTokenIntents = Object.create(null);
    Object.keys(draft.previewOriginals).forEach(function (cssVar) { delete draft.previewOriginals[cssVar]; });
    tokenKeys.forEach(function (key) {
      var intent = draft.tokenIntents[key];
      var tokenIndex = -1;
      for (var i = 0; i < freshSelection.tokens.length; i += 1) {
        if (freshSelection.tokens[i].property === intent.property && tokenPathFor(freshSelection.tokens[i]) === (intent.oldTokenPath || intent.oldToken)) { tokenIndex = i; break; }
      }
      if (tokenIndex === -1) {
        intent.needsRecheck = true;
        rebasedTokenIntents[key] = intent;
        return;
      }
      var token = freshSelection.tokens[tokenIndex];
      intent.oldToken = token.name;
      intent.oldTokenPath = tokenPathFor(token);
      delete intent.needsRecheck;
      var desiredToken = null;
      for (var bridgeIndex = 0; bridgeIndex < bridgeTokens.length; bridgeIndex += 1) {
        if (bridgeTokens[bridgeIndex].path === intent.newTokenPath) { desiredToken = bridgeTokens[bridgeIndex]; break; }
      }
      var desiredValue = intent.newTokenValue || (desiredToken && desiredToken.value) || "";
      var desiredPath = intent.newTokenPath || (desiredToken && desiredToken.path) || intent.newToken || "";
      if (desiredValue && desiredValue === token.value && desiredPath === tokenPathFor(token)) return;
      rebasedTokenIntents[String(tokenIndex)] = intent;
      if (desiredValue) {
        draft.previewOriginals[token.cssVar] = rebaseTargets.map(function (element) {
          return { target: element, value: element.style.getPropertyValue(token.cssVar), priority: element.style.getPropertyPriority(token.cssVar) };
        });
        rebaseTargets.forEach(function (element) { element.style.setProperty(token.cssVar, desiredValue); });
      }
    });
    draft.tokenIntents = rebasedTokenIntents;
    draft.selection = selectionFor(target);
    if (draft.clientKey === activeStyleDraftKey) {
      tokenIntents = draft.tokenIntents;
      currentSelection = draft.selection;
      styleEditTarget = draft.styleEditTarget;
      styleEditScopeSiblingsOriginal = draft.styleEditScopeSiblingsOriginal || Object.create(null);
      styleEditScopeSiblingsTarget = draft.styleEditScopeSiblingsTarget || null;
    }
    pruneEmptyStyleDraft(draft);
  }

  function rebaseNextDrafts() {
    allStyleDrafts().forEach(rebaseStyleDraft);
    if (localLayerDrafts().length && !activeLayerOrders().length) {
      appliedLayerTree = buildLayerTree(document.body);
      layerTree = appliedLayerTree;
    }
    localLayerDrafts().forEach(function (draft) {
      draft.state = liveLayerDraftParentsMatch(draft) ? "draft" : "needs-recheck";
    });
  }

  function finishActiveDispatch() {
    if (!activeDispatch) return;
    rebaseNextDrafts();
    dispatchState = "done";
    renderPanel();
    dispatchDoneTimer = setTimeout(function () {
      dispatchDoneTimer = null;
      activeDispatch = null;
      dispatchState = "idle";
      renderPanel();
      // Conveyor: a Send pressed while this batch was in flight fires now.
      if (sendQueued) {
        sendQueued = false;
        if (hasDispatchableDrafts()) dispatchPendingBatch();
      }
    }, SEND_TIMINGS.hold);
  }

  function checkActiveDispatchTerminal() {
    if (dispatchState !== "applying" || !activeDispatch || !activeDispatch.committed) return;
    // "sent-locally"/"preview-only" are standalone-dispatch style terminal
    // states (completeStandaloneDispatch); "applied"/"rejected"/"superseded"
    // are the full-bridge ones (applyQueuedChanges). A dispatch only ever
    // uses one set, so accepting both here is safe for either path.
    var styleTerminal = activeDispatch.styleRecords.every(function (record) { return ["applied", "rejected", "superseded", "sent-locally", "preview-only"].indexOf(record.state) !== -1; });
    var layersTerminal = activeDispatch.layerRecords.every(function (order) { return ["applied", "rejected", "mismatch"].indexOf(order.state) !== -1; });
    if (styleTerminal && layersTerminal) finishActiveDispatch();
  }

  function matchedTokenEntryForProperty(property, state) {
    if (!currentSelection || !property) return null;
    if (state && currentSelection.stateStyles && currentSelection.stateStyles[state]) {
      var stateTokens = currentSelection.stateStyles[state].tokens || [];
      for (var si = 0; si < stateTokens.length; si += 1) {
        var stateToken = stateTokens[si];
        if (stateToken && stateToken.bridgeToken && tokenPropertyMatches(stateToken.property, property)) {
          return { token: stateToken, index: state + ":" + si, state: state };
        }
      }
      return null;
    }
    if (!currentSelection.tokens) return null;
    for (var i = 0; i < currentSelection.tokens.length; i += 1) {
      var token = currentSelection.tokens[i];
      if (token && token.bridgeToken && tokenPropertyMatches(token.property, property)) {
        return { token: token, index: i, state: null };
      }
    }
    return null;
  }

  function selectedTokenChoice(index, alternatives) {
    var intent = tokenIntents[normalizeIntentKey(index)];
    if (!intent) return "";
    for (var i = 0; i < alternatives.length; i += 1) {
      if (alternatives[i].path === intent.newTokenPath) return alternatives[i].cssVar;
    }
    return "__new__";
  }

  function stateStyleGroupsMarkup(stateStyles) {
    var markup = "";
    INTERACTIVE_STATES.forEach(function (state) {
      var stateData = stateStyles[state];
      if (!stateData || !stateData.declarations || !stateData.declarations.length) return;
      // Title case to match Size/Spacing (not cyan HOVER mono label).
      var stateTitle = state.charAt(0).toUpperCase() + state.slice(1);
      markup += '<div class="raven-grab-state-group" data-style-state="' + state + '"><h3 class="raven-grab-state-label">' + escapeHtml(stateTitle) + '</h3><ul class="raven-grab-styles">';
      stateData.declarations.forEach(function (declaration) {
        var property = declaration.property;
        var rawValue = declaration.value;
        var matched = matchedTokenEntryForProperty(property, state);
        var editKey = stateStyleEditKey(state, property);
        var edit = stateStyleEdits[editKey];
        var value = edit ? edit.newValue : rawValue;
        var displayInner = styleValueDisplayMarkup(property, value, state, matched, !!edit, false);
        var tokenAttr = (!edit && matched) ? ' data-token-index="' + escapeHtml(String(matched.index)) + '"' : "";
        var tokenEdited = matched && !!tokenIntents[normalizeIntentKey(matched.index)];
        markup += '<li data-style-property="' + escapeHtml(property) + '" data-style-state="' + escapeHtml(state) + '"' + tokenAttr + ' data-edited="' + (edit || tokenEdited ? "true" : "false") + '">' +
          "<span>" + escapeHtml(property) + "</span>" +
          '<code data-style-value data-style-raw="' + escapeHtml(value) + '" tabindex="0" role="button" aria-label="Edit ' + escapeHtml(property) + '">' + displayInner + "</code></li>";
      });
      markup += "</ul></div>";
    });
    return markup;
  }

  function batchActionMarkup() {
    var ui = batchUiState();
    return changesTrayMarkup() + '<button class="raven-grab-send" type="button" data-send-batch data-send-state="default"' + (ui.enabled ? "" : " disabled") + '><span class="raven-grab-send-label">' + escapeHtml(ui.label) + '</span></button>';
  }

  function componentAssetsCtaMarkup() {
    var componentCtaLabel = grabRole === "maintainer" ? "Add component" : (componentRequestStep === "email"
      ? ((grabConfig && grabConfig.componentRequestFlow === "email") ? "Send email" : "Create request")
      : ((grabConfig && grabConfig.componentRequestFlow === "email") ? "Continue" : "Request component"));
    var componentSendAttr = grabRole === "maintainer"
      ? "data-maintainer-send"
      : (componentRequestStep === "email" ? "data-send-email" : "data-request-next");
    return '<button class="raven-grab-send raven-grab-assets-cta" type="button" ' + componentSendAttr + ' data-send-state="default"' + (componentCtaEnabled() ? "" : " disabled") + '><span class="raven-grab-send-label">' + escapeHtml(componentCtaLabel) + '</span></button>';
  }

  function componentCtaEnabled() {
    var enabled = liveSelectionAvailable() && !!String(componentName || "").trim() && !commitInFlight && !componentRequestInFlight;
    if (grabRole !== "maintainer" && componentRequestStep === "form") {
      enabled = enabled && !!(componentRequest.issueType && componentRequest.issueSize && componentRequest.useCase.trim());
    }
    if (grabRole !== "maintainer" && componentRequestStep === "email") {
      // Mirror sendComponentRequest's validation: required email flow needs a
      // valid address; the optional notify field allows empty but not malformed.
      var ctaEmail = String(componentRequest.email || "").trim();
      var ctaEmailRequired = !!(grabConfig && grabConfig.componentRequestFlow === "email");
      enabled = enabled && (ctaEmail ? validEmail(ctaEmail) : !ctaEmailRequired);
    }
    return enabled;
  }

  function mountGlobalActions() {
    if (!globalActions || !panel || !panelLeft) return;
    // Send change is always pinned on the design (right) panel — never teleports
    // to Layers/Assets. Disabled until batchUiState().enabled.
    var rightMount = panel.querySelector(".raven-grab-global-actions-host");
    if (rightMount) {
      globalActions.innerHTML = batchActionMarkup() + '<p class="raven-grab-status" data-status aria-live="polite"></p>';
      if (dispatchState === "registration-error" && activeDispatch && activeDispatch.registrationErrors.batchMismatch) {
        var mismatchStatus = globalActions.querySelector("[data-status]");
        if (mismatchStatus) {
          mismatchStatus.textContent = activeDispatch.registrationErrors.batchMismatch;
          mismatchStatus.setAttribute("data-kind", "error");
        }
      }
      rightMount.appendChild(globalActions);
    }
    // The assets form renders its own inline copy of the component CTA
    // (componentNameMarkup); keep its enabled state live in place — a full
    // re-render here would drop focus from the field being typed in.
    var inlineCtas = panelQueryAll("[data-request-next], [data-send-email], [data-maintainer-send]");
    var inlineEnabled = componentCtaEnabled();
    for (var ctaIndex = 0; ctaIndex < inlineCtas.length; ctaIndex++) {
      // morphSendButton owns disabled while a send is animating (aria-busy).
      if (inlineCtas[ctaIndex].getAttribute("aria-busy") === "true") continue;
      inlineCtas[ctaIndex].disabled = !inlineEnabled;
    }
    // Left dock: Assets component CTA only. Layers keeps an empty host + Settings.
    var leftMount = panelLeft.querySelector(".raven-grab-global-actions-host");
    if (!leftMount || !structureActions) return;
    if (activeTabB === "assets") {
      structureActions.innerHTML = componentAssetsCtaMarkup() + '<p class="raven-grab-status" data-status-b aria-live="polite"></p>';
      leftMount.appendChild(structureActions);
    } else if (structureActions.parentNode) {
      structureActions.parentNode.removeChild(structureActions);
      structureActions.innerHTML = "";
    }
  }

  function renderPanel() {
    if (!armed) return;
    // Defer background rerenders while the user is typing in a style editor;
    // gesture paths flush the editor first, and the next poll renders after it closes.
    if (activeStyleEditorFlush || activeStyleScrub) return;
    // A mid-drag rerender (template load, operation poll) detaches the drag's rows
    // and silently cancels the drop — defer; every endLayerDrag path renders.
    if (layerDrag && layerDrag.active && !layerDragRenderBypass) return;
    hidePanelPresetTooltip();
    selectionMembershipForRender = null;
    orderedSelection();
    // Snapshot after prune. Instance path reuses multiSelections (no second
    // connectivity walk); component path re-derives the live match set once.
    if (editScope === "component" && selectedElement) selectionMembershipForRender = visualBadgeElements();
    else selectionMembershipForRender = multiSelections.slice();
    var hasSelection = !!currentSelection;
    var stateStyles = hasSelection && currentSelection.stateStyles ? currentSelection.stateStyles : {};
    var boxStrokeProperties = ["border-width", "border-style", "border-color", "outline-width", "outline-style", "outline-color", "outline-offset"];
    var svgGraphicsSelected = hasSelection && isSvgGraphicsElement(selectedElement);
    var strokeModel = hasSelection ? strokeModelForSelection() : null;
    var strokeEdited = STROKE_PROPERTIES.some(function (property) {
      return !!styleEdits[property] && styleEdits[property].groupId === "stroke";
    });
    var strokeMarkup = hasSelection
      ? '<li data-style-property="__raven-stroke__" data-edited="' + (strokeEdited ? "true" : "false") + '"><span>Stroke</span><code data-style-value data-style-raw="' + escapeHtml(strokeSummary(strokeModel)) + '" tabindex="0" role="button" aria-label="Edit Stroke">' + escapeHtml(strokeSummary(strokeModel)) + "</code></li>"
      : "";
    function styleRowMarkup(property) {
      if (property === "__raven-stroke__") return strokeMarkup;
      if (boxStrokeProperties.indexOf(property) !== -1) return "";
      if (property === "stroke" && !svgGraphicsSelected) return "";
      if (property === "fill" && !svgGraphicsSelected) return "";
      var matched = matchedTokenEntryForProperty(property);
      var edit = styleEdits[property];
      var value = edit ? edit.newValue : (hasSelection ? resolvedStyleValue(property) : "");
      if (!value && !edit) {
        // Fall back to primary computed map so single-select still shows defaults.
        value = hasSelection && currentSelection.styles ? (currentSelection.styles[property] || "") : "";
      }
      if (!value && !edit && matched && matched.token.value) value = matched.token.value;
      if (!value && !edit) return "";
      var isMixed = value === MIXED_STYLE_VALUE;
      var propertyLabel = property === "stroke" ? "SVG stroke" : property;
      var label = "<span" + (!isMixed && parseNumericValue(value) ? " data-style-label" : "") + ">" + escapeHtml(propertyLabel) + "</span>";
      if (property === "border-radius" && !isMixed && parseBorderRadius(value)) {
        label = '<span class="raven-grab-style-label-wrap">' + label + '<button class="raven-grab-radius-expand" type="button" data-radius-expand aria-label="Edit individual border radius corners">⌄</button></span>';
      }
      var tokenAttr = (!isMixed && !edit && matched) ? ' data-token-index="' + escapeHtml(String(matched.index)) + '"' : "";
      var tokenEdited = matched && !!tokenIntents[normalizeIntentKey(matched.index)];
      var displayInner = styleValueDisplayMarkup(property, value, null, matched, !!edit, isMixed);
      return '<li data-style-property="' + escapeHtml(property) + '"' + tokenAttr + ' data-edited="' + (edit || tokenEdited ? "true" : "false") + '">' + label + '<code data-style-value data-style-raw="' + escapeHtml(value) + '" data-mixed="' + (isMixed ? "true" : "false") + '" tabindex="0" role="button" aria-label="Edit ' + escapeHtml(property) + '">' + displayInner + "</code></li>";
    }
    var stylesMarkup = "";
    STYLE_CATEGORIES.forEach(function (category) {
      if (!hasSelection) return;
      var rows = [];
      category.properties.forEach(function (property) {
        var row = styleRowMarkup(property);
        if (row) rows.push(row);
      });
      if (!rows.length) return;
      stylesMarkup += '<li class="raven-grab-style-category" data-style-category="' + escapeHtml(category.id) + '"><span class="raven-grab-style-category-label">' + escapeHtml(category.label) + "</span></li>";
      stylesMarkup += rows.join("");
    });
    var stateStylesMarkup = stateStyleGroupsMarkup(stateStyles);
    var tokensEmptyMarkup = hasSelection && bridgeTokensReady && bridgeTokens.length === 0
      ? '<p class="raven-grab-tokens-empty" role="status">No design tokens found for this project</p>'
      : "";
    var componentScope = hasSelection ? currentSelection.componentScope : null;
    var scopeMarkup = componentScope && componentScope.matchCount >= 2
      ? '<section class="raven-grab-section"><h2 class="raven-grab-section-title">Scope</h2>' +
          '<div class="raven-grab-scope" role="group" aria-label="Edit scope" data-scope-value="' + (editScope === "component" ? "component" : "instance") + '">' +
            '<button class="raven-grab-scope-cap" type="button" data-edit-scope="instance" aria-pressed="' + (editScope === "instance" ? "true" : "false") + '" aria-label="Instance">' +
              '<span class="raven-grab-scope-ico" data-kind="instance" aria-hidden="true"><span></span></span>' +
            '</button>' +
            '<div class="raven-grab-scope-track" data-scope-track>' +
              '<span class="raven-grab-scope-knob" aria-hidden="true"></span>' +
              '<span class="raven-grab-scope-labels" aria-hidden="true"><span>Instance</span><span>All siblings</span></span>' +
            '</div>' +
            '<button class="raven-grab-scope-cap" type="button" data-edit-scope="component" aria-pressed="' + (editScope === "component" ? "true" : "false") + '" aria-label="All siblings (' + componentScope.matchCount + ')">' +
              '<span class="raven-grab-scope-ico" data-kind="siblings" aria-hidden="true"><span></span><span></span><span></span><span></span></span>' +
            '</button>' +
          '</div></section>'
      : "";

    var elementLabel = hasSelection ? selectionDisplayLabel(selectedElement, currentSelection) : "";
    var elementMarkup = hasSelection ? `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">Element</h2>
        <span class="raven-grab-element-wrap">
          <span class="raven-grab-element-chip" data-element-selector tabindex="0" role="button" aria-label="Copy element selector" title="${escapeHtml(currentSelection.selector)}">${escapeHtml(elementLabel)}</span>
          <span class="raven-grab-element-tooltip" role="tooltip">${escapeHtml(currentSelection.selector)}</span>
        </span>
      </section>` : `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">Element</h2>
        <span class="raven-grab-element-placeholder">Click an element to inspect</span>
      </section>`;
    var designMarkup = `
      ${elementMarkup}
      ${scopeMarkup}
      <section class="raven-grab-section">
        <button class="raven-grab-section-toggle" type="button" data-section-toggle="styles" aria-expanded="${expandedSections.styles ? "true" : "false"}" aria-controls="raven-grab-styles"><span>Styles</span><span class="raven-grab-caret" aria-hidden="true">▾</span></button>
        <div class="raven-grab-collapsible" id="raven-grab-styles" data-section-body="styles" data-open="${expandedSections.styles ? "true" : "false"}" aria-hidden="${expandedSections.styles ? "false" : "true"}"><div class="raven-grab-collapsible-inner">${tokensEmptyMarkup}<ul class="raven-grab-styles">${stylesMarkup}</ul>${stateStylesMarkup}</div></div>
      </section>`;
    var instructionsMarkup = `
      <section class="raven-grab-section raven-grab-composer">
        <h2 class="raven-grab-section-title">Instructions</h2>
        <textarea class="raven-grab-textarea" data-instruction spellcheck="true" aria-label="Instructions" placeholder="Tell the agent what to change…">${escapeHtml(instructionDraft)}</textarea>
      </section>`;
    var issueTypes = ["UX/Usability", "Visual bug", "Missing variant", "Accessibility", "New pattern", "Other"];
    var issueSizes = ["1-10 users/customers", "10-100", "100-1,000", "1,000+", "Internal only"];
    var emailFlow = !!(grabConfig && grabConfig.componentRequestFlow === "email");
    var agentEndpoint = emailFlow ? null : (grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab"));
    var standaloneEndpoint = agentEndpoint ? null : (grabConfig && grabConfig.componentRequestEndpoint);
    var copyOnlyRequest = !emailFlow && !agentEndpoint && !standaloneEndpoint;
    var requestFormMarkup = `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">Reason for new component</h2>
        <div class="raven-grab-token"><label class="raven-grab-field"><span>Issue type</span><select class="raven-grab-select" data-issue-type required><option value="">Select…</option>${issueTypes.map(function (value) { return optionMarkup(value, value, componentRequest.issueType); }).join("")}</select></label></div>
        <div class="raven-grab-token"><label class="raven-grab-field"><span>Issue size</span><select class="raven-grab-select" data-issue-size required><option value="">Select…</option>${issueSizes.map(function (value) { return optionMarkup(value, value, componentRequest.issueSize); }).join("")}</select></label></div>
      </section>
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">Describe the use case and impact</h2>
        <textarea class="raven-grab-textarea raven-grab-use-case" data-use-case spellcheck="true" placeholder="${emailFlow ? "Describe why you need this…" : "Tell the design team why you need this…"}">${escapeHtml(componentRequest.useCase)}</textarea>
      </section>`;
    var emailMarkup = emailFlow ? `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">Email yourself the component</h2>
        <input class="raven-grab-input" data-component-email type="email" value="${escapeHtml(componentRequest.email)}" placeholder="email" spellcheck="false" required>
      </section>` : `
      <section class="raven-grab-section">
        <h2 class="raven-grab-section-title">Get notified (optional)</h2>
        <input class="raven-grab-input" data-component-email type="email" value="${escapeHtml(componentRequest.email)}" placeholder="email (optional)" spellcheck="false">
      </section>`;
    var maintainerFormMarkup =
      '<section class="raven-grab-section">' +
        '<h2 class="raven-grab-section-title">Component notes</h2>' +
        '<textarea class="raven-grab-textarea raven-grab-use-case" data-use-case spellcheck="true" placeholder="Describe the reusable component, variants, or behavior…">' + escapeHtml(componentRequest.useCase) + '</textarea>' +
      '</section>';
    // Layers is the default left tab — load the tree on first paint, not only when
    // Assets is opened (otherwise Layers shows "No layer tree available.").
    if ((activeTabB === "assets" || activeTabB === "layers") && !layerTree) refreshAppliedLayerTree();
    if (activeTabB === "assets") restoreTemplateDraftsFromSlots();
    if (activeTabB === "assets" && !grabConfig) loadTemplate();
    var pageTemplateMarkup = '<section class="raven-grab-section raven-grab-assets-block">' +
      '<h2 class="raven-grab-assets-title">Page template</h2>' +
      '<p class="raven-grab-note">Save the entire page as a reusable template. All layers are included automatically.</p>' +
      '<label class="raven-grab-field"><span>Template name</span><input class="raven-grab-input" type="text" data-template-name value="' + escapeHtml(templateName) + '" placeholder="Product page" spellcheck="false"></label>' +
      '<button class="raven-grab-send raven-grab-assets-cta" type="button" data-save-template data-send-state="default"' + (templateName.trim() ? "" : " disabled") + '><span class="raven-grab-send-label">Save page as template</span></button>' +
      '</section>';
    var componentProcessMarkup = !liveSelectionAvailable()
      ? ""
      : (grabRole === "maintainer"
        ? maintainerFormMarkup
        : (componentRequestStep === "email" ? emailMarkup : requestFormMarkup));
    var componentNameMarkup = '<section class="raven-grab-section raven-grab-assets-block">' +
      '<h2 class="raven-grab-assets-title">Component</h2>' +
      (liveSelectionAvailable()
        ? '<p class="raven-grab-note">Captures the selected element and its full descendants into DESIGN.md, then ' + (grabRole === "maintainer" ? "adds it to the design system." : "sends a component request.") + '</p><label class="raven-grab-field"><span>Component name</span><input class="raven-grab-input" type="text" data-component-name value="' + escapeHtml(componentName) + '" placeholder="Primary button" spellcheck="false"></label>'
        : '<p class="raven-grab-empty">Select a component on the page</p>') +
      componentProcessMarkup +
      componentAssetsCtaMarkup() +
      '</section>';
    var assetsMarkup = pageTemplateMarkup + componentNameMarkup;
    var previewMarkup = layerPreview
      ? '<div class="raven-grab-layer-preview" data-layer-preview>' + wireframeMarkup() + '</div>'
      : '';
    // The Reorder preview section exists only once there is something to show —
    // a proposed move or a notice. An idle panel leads with the Layers tree,
    // and a notice-only state shows just the notice line, never an empty box.
    var reorderSectionMarkup = layerPreview || layerNotice
      ? '<section class="raven-grab-section"><h2 class="raven-grab-section-title">Reorder preview</h2>' + previewMarkup + (layerNotice ? '<p class="raven-grab-layer-notice' + (pendingFixedMove && !layerPreview ? ' raven-grab-layer-warning' : '') + '">' + escapeHtml(layerNotice) + '</p>' : '') + '</section>'
      : '';
    var layersMarkup = reorderSectionMarkup +
      '<section class="raven-grab-section"><h2 class="raven-grab-section-title">Layers</h2>' + (layerTree ? '<p class="raven-grab-note">Drag a row to reorder or reparent it.</p><ul class="raven-grab-layer-list" role="tree">' + layerRowsMarkup(layerTree) + '</ul>' : '<p class="raven-grab-empty">No layer tree available.</p>') + '</section>';
    // Mobile borrows the structure tab state so the same selection survives a
    // breakpoint crossing; desktop never exposes the two additional values.
    var mobileBodyMarkup = activeTabB === "assets" ? assetsMarkup
      : activeTabB === "styles" ? designMarkup
      : activeTabB === "instructions" ? instructionsMarkup
      : layersMarkup;
    // Simple mode is prod's tool: what you grabbed, what you want changed, Send.
    // Scope and the style editor are the two-panel build's additions, so they go.
    var bodyMarkupA = simpleMode() ? elementMarkup : (mobileTabbedSheetMode() ? mobileBodyMarkup : designMarkup);
    var bodyMarkupB = activeTabB === "assets" ? assetsMarkup : layersMarkup;
    // Pinned under Send (actions chrome) — never buried at the end of the scrollable layers list.
    var settingsProjectMarkup = projectName ? '<span class="raven-grab-settings-project">' + escapeHtml(projectName) + '</span>' : '';
    var settingsLabel = projectName ? 'Open Raven settings for ' + projectName : 'Open Raven settings';
    // Phosphor gear-six (regular), inlined rather than fetched — the overlay is one file
    // and must not reach the network from a stranger's dev server. aria-hidden because
    // the button already carries settingsLabel.
    var settingsGearMarkup = '<svg class="raven-grab-settings-gear" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z"/></svg>';
    var structureFooterMarkup = '<div class="raven-grab-structure-footer"><button class="raven-grab-settings-trigger" type="button" data-settings-open aria-label="' + escapeHtml(settingsLabel) + '"><kbd aria-hidden="true">' + escapeHtml(SETTINGS_CHORD) + '</kbd>' + settingsProjectMarkup + settingsGearMarkup + '</button></div>';
    var footerMarkupA = instructionsMarkup;
    // The gear rides in BOTH panels and CSS shows exactly one, keyed off
    // data-settings-home on the host. Rendering it in only the left panel stranded
    // settings off-screen whenever the left was collapsed ("Show right only", and
    // every session in simple mode) with no keyboard way back -- the ⌘K chord only
    // fires when focus is already inside Raven.
    var actionMarkupA = (mobileTabbedSheetMode() ? "" : footerMarkupA) + '<div class="raven-grab-global-actions-host"></div>' + structureFooterMarkup;
    var actionMarkupB = '<div class="raven-grab-global-actions-host"></div>' + structureFooterMarkup;
    var changesMarkup = "";
    var requestHintText = "No destination configured — requests can't be sent yet. Ask your agent to set up GitHub routing.";
    var requestHintMarkup = activeTabB === "assets" && grabRole !== "maintainer" && copyOnlyRequest && !requestHintDismissed
      ? '<p class="raven-grab-request-hint" data-request-hint><span>' + escapeHtml(requestHintText) + '</span><button class="raven-grab-request-hint-dismiss" type="button" data-dismiss-request-hint aria-label="' + escapeHtml("Dismiss setup hint") + '">' + escapeHtml("×") + "</button></p>"
      : "";

    var mobileTabsMarkup = mobileTabbedSheetMode() ? `
      <div class="raven-grab-tabs raven-grab-mobile-tabs" role="tablist" aria-label="Raven Design actions">
        <button class="raven-grab-tab" type="button" role="tab" data-tab="layers" aria-selected="${activeTabB === "layers" ? "true" : "false"}">Layers</button>
        <button class="raven-grab-tab" type="button" role="tab" data-tab="assets" aria-selected="${activeTabB === "assets" ? "true" : "false"}">Assets</button>
        <button class="raven-grab-tab" type="button" role="tab" data-tab="styles" aria-selected="${activeTabB === "styles" ? "true" : "false"}">Styles</button>
        <button class="raven-grab-tab" type="button" role="tab" data-tab="instructions" aria-selected="${activeTabB === "instructions" ? "true" : "false"}">Instructions</button>
      </div>` : "";
    panel.innerHTML = `
      <button class="raven-grab-sheet-handle" type="button" data-sheet-drag-handle aria-label="Resize Raven sheet"></button>
      <div class="raven-grab-top">
        <div class="raven-grab-header">
          <div class="raven-grab-title"><strong>Raven</strong></div>
          ${panelPresetsMarkup()}
        </div>
      </div>
      ${mobileTabsMarkup}
      <div class="raven-grab-body"><div class="raven-grab-content">${bodyMarkupA}</div></div>
      <div class="raven-grab-actions"${mobileTabbedSheetMode() ? " data-mobile-bottom-bar" : ""}>${changesMarkup}${actionMarkupA}<p class="raven-grab-status" data-status aria-live="polite"></p></div>`;
    panelLeft.innerHTML = `
      <div class="raven-grab-top">
        <div class="raven-grab-header">
          <div class="raven-grab-title"><strong>Raven Design</strong></div>
          ${panelPresetsMarkup()}
        </div>
        <div class="raven-grab-tabs" role="tablist" aria-label="Raven Design actions">
          <button class="raven-grab-tab" type="button" role="tab" data-tab="layers" aria-selected="${activeTabB === "layers" ? "true" : "false"}">Layers</button>
          <button class="raven-grab-tab" type="button" role="tab" data-tab="assets" aria-selected="${activeTabB === "assets" ? "true" : "false"}">Assets</button>
        </div>
      </div>
      <div class="raven-grab-body"><div class="raven-grab-content">${bodyMarkupB}</div></div>
      <div class="raven-grab-actions">${changesMarkup}${requestHintMarkup}${actionMarkupB}<p class="raven-grab-status" data-status-b aria-live="polite"></p></div>`;
    for (var pi = 0; pi < panels.length; pi++) {
      var isCollapsed = collapsedSides[sideOf(panels[pi])];
      panels[pi].setAttribute("aria-hidden", isCollapsed ? "true" : "false");
      panels[pi].setAttribute("data-collapsed", isCollapsed ? "true" : "false");
    }
    syncMobileSheetEdgeTabs();
    syncPanelPresets();
    var legacyStatusA = panel.querySelector("[data-status]");
    var legacyStatusB = panelLeft.querySelector("[data-status-b]");
    if (legacyStatusA) legacyStatusA.remove();
    if (legacyStatusB) legacyStatusB.remove();
    mountGlobalActions();
    // Row markup only marks the exact hovered element — re-apply so the
    // nearest-visible-ancestor hover echo survives background rerenders.
    if (hoveredLayerElement) setLayerRowHover(hoveredLayerElement);
    // Drop the render snapshot so later direct layerRowsMarkup / selectionHasElement
    // callers (tests, post-mutation checks) re-derive from live selection state.
    selectionMembershipForRender = null;
    applyPanelFontSize();
  }

  function applyPanelFontSize() {
    var scale = String(panelFontScale / 100);
    function setScale(target) {
      if (target && target.style && typeof target.style.setProperty === "function") {
        target.style.setProperty("--raven-grab-font-scale", scale);
      }
    }
    setScale(host);
    setScale(panel);
    setScale(panelLeft);
    // Keep the settings readout current without remounting the modal.
    if (settingsModal && typeof settingsModal.querySelector === "function") {
      var fontInput = settingsModal.querySelector("[data-panel-font-size]");
      if (fontInput) fontInput.value = String(panelFontScale);
    }
  }

  function setPanelFontSize(next) {
    var parsed = typeof next === "number" ? next : parseInt(next, 10);
    if (!isFinite(parsed)) return false;
    var stepped = Math.round(parsed / PANEL_FONT_SCALE_STEP) * PANEL_FONT_SCALE_STEP;
    var clamped = Math.max(PANEL_FONT_SCALE_MIN, Math.min(PANEL_FONT_SCALE_MAX, stepped));
    panelFontScale = clamped;
    try { window.localStorage.setItem("raven-grab-panel-font-scale", String(clamped)); } catch (storageError) { /* keep in-memory */ }
    applyPanelFontSize();
    return true;
  }

  function syncSendButtonDisabled() {
    mountGlobalActions();
    schedulePersistPending();
  }

  function switchTab(tab) {
    if (tab !== "design" && tab !== "assets" && tab !== "layers" && tab !== "styles" && tab !== "instructions") return;
    if ((tab === "styles" || tab === "instructions") && !mobileTabbedSheetMode()) return;
    capturePanelDrafts();
    activeGlobalActionSurface = tab;
    if (tab === "design") activeTabA = tab;
    else {
      activeTabB = tab;
      if (tab !== "layers") {
        if (hasApplyingLayerOrders()) ensureLayerOperationPoll();
        else stopLayerOperationPoll();
      }
    }
    if (tab === "assets") loadTemplate();
    if (tab === "layers") {
      if (!grabConfig) loadTemplate();
      refreshAppliedLayerTree();
      if (selectedElement && selectionOrigin === "canvas") expandLayerAncestorsForElement(selectedElement);
      if (!activeLayerOrderDraft()) {
        layerPreview = null;
        layerNotice = "";
        pendingFixedMove = "";
        fixedMoveNote = "";
      }
      postLayerSnapshot();
      ensureLayerOperationPoll();
    }
    renderPanel();
    if (tab === "layers" && selectedElement && selectionOrigin === "canvas" && !collapsedSides.left) {
      var selectedRow = layerPanel().querySelector('.raven-grab-layer-row[data-primary="true"]') || layerPanel().querySelector('.raven-grab-layer-row[data-selected="true"]');
      if (selectedRow && typeof selectedRow.scrollIntoView === "function") selectedRow.scrollIntoView({ block: "nearest" });
    }
  }

  function toggleSection(section) {
    if (section !== "styles") return;
    expandedSections[section] = !expandedSections[section];
    var toggle = panelQuery('[data-section-toggle="' + section + '"]');
    var body = panelQuery('[data-section-body="' + section + '"]');
    if (!toggle || !body) {
      renderPanel();
      return;
    }
    toggle.setAttribute("aria-expanded", expandedSections[section] ? "true" : "false");
    body.setAttribute("data-open", expandedSections[section] ? "true" : "false");
    body.setAttribute("aria-hidden", expandedSections[section] ? "false" : "true");
  }

  function toggleChangeTraySection(role) {
    if (!role) return;
    changeTrayCollapsed[role] = !changeTrayCollapsed[role];
    var toggle = panelQuery('[data-change-tray-toggle="' + role + '"]');
    var body = panelQuery('[data-change-tray-body="' + role + '"]');
    if (!toggle || !body) {
      renderPanel();
      return;
    }
    var collapsed = !!changeTrayCollapsed[role];
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    body.setAttribute("data-open", collapsed ? "false" : "true");
    body.setAttribute("aria-hidden", collapsed ? "true" : "false");
  }

  function dismiss() {
    hidePanelPresetTooltip();
    if (layerDrag) endLayerDrag();
    if (activeStyleScrub) activeStyleScrub.cancel();
    activeStyleEditorFlush = null;
    clearAllStyleDrafts(true);
    selectedElement = null;
    // A deliberate properties close is a preference within one grab session, not a
    // durable setting. Disarming ends the session, so carrying the flag past it would
    // leave the next re-arm unable to ever open properties from a selection again.
    propertiesDismissed = false;
    multiSelections = [];
    selectionAnchor = null;
    selectionOrigin = "";
    clearSelectionOverlays();
    hoveredElement = null;
    setLayerRowHover(null);
    currentSelection = null;
    reactMetadata = null;
    editScope = "instance";
    // Do not stop the poll while a dispatch is still applying (e.g. a
    // standalone layer move mid-flight) — dismiss() never clears activeDispatch,
    // so dispatchState would stay stuck at "applying" with nothing left to
    // reach a terminal state and free it up for the next dispatch.
    if (dispatchState === "applying" && activeDispatch) ensureLayerOperationPoll();
    else stopLayerOperationPoll();
    activeTabA = "design";
    activeTabB = "layers";
    activeGlobalActionSurface = "design";
    closeSettingsModal();
    expandedSections = { styles: true };
    instructionDraft = "";
    componentRequestStep = "form";
    componentRequest = { issueType: "", issueSize: "", useCase: "", email: "" };
    componentRequestId = "";
    componentRequestInFlight = false;
    componentName = "";
    collapsedSides.left = collapsedSides.right = true;
    setEdgeTabsHidden(true);
    for (var pi = 0; pi < panels.length; pi++) {
      panels[pi].setAttribute("data-collapsed", collapsedSides[sideOf(panels[pi])] ? "true" : "false");
      panels[pi].removeAttribute("inert");
      panels[pi].setAttribute("aria-hidden", "true");
      panels[pi].innerHTML = "";
    }
    setHighlight(null);
  }

  function updateIntent(index) {
    var intentKey = normalizeIntentKey(index);
    var token = resolveTokenByIntentKey(index);
    if (!token) return;
    var indexStr = String(index);
    var select = panelQuery('[data-token-choice="' + indexStr + '"]');
    var newFields = panelQuery('[data-new-token="' + indexStr + '"]');
    if (!select || !newFields) return;
    var choice = select.value;
    newFields.setAttribute("data-open", choice === "__new__" ? "true" : "false");
    // Preview on the selected elements: an inline custom property there beats any
    // ancestor definition (e.g. a component-local --demo-* block), which a
    // documentElement-level override would not. Every selected element gets the
    // override — a multi-select rebind must recolor all members, not just the
    // primary.
    var previewTargets = styleApplicationTargets().concat(componentScopeSiblingElements());
    if (!previewTargets.length) previewTargets = [document.documentElement];
    if (!choice) {
      delete tokenIntents[intentKey];
      restoreTokenPreviewEntries(token.cssVar, previewOriginals[token.cssVar]);
      delete previewOriginals[token.cssVar];
      syncActiveStyleDraftKey();
      return;
    }
    var captured = previewOriginals[token.cssVar];
    if (!captured) {
      captured = [];
      previewOriginals[token.cssVar] = captured;
    } else if (!Array.isArray(captured)) {
      captured = [captured];
      previewOriginals[token.cssVar] = captured;
    }
    previewTargets.forEach(function (element) {
      var alreadyCaptured = captured.some(function (entry) { return entry.target === element; });
      if (!alreadyCaptured) {
        captured.push({ target: element, value: element.style.getPropertyValue(token.cssVar), priority: element.style.getPropertyPriority(token.cssVar) });
      }
    });
    if (choice === "__new__") {
      var nameInput = panelQuery('[data-new-name="' + indexStr + '"]');
      var valueInput = panelQuery('[data-new-value="' + indexStr + '"]');
      var customValue = valueInput.value.trim();
      var invalidCustomValue = !customValue || (window.CSS && typeof window.CSS.supports === "function" && !window.CSS.supports(token.property, customValue));
      if (invalidCustomValue) {
        var invalidIntent = tokenIntentFor(token, null, nameInput.value.trim() || undefined, customValue || undefined);
        invalidIntent.invalid = true;
        tokenIntents[intentKey] = invalidIntent;
        syncActiveStyleDraftKey();
        newFields.setAttribute("data-error", "true");
        valueInput.setAttribute("aria-invalid", "true");
        // Invalid edit keeps the last-valid live preview (does not roll back to the
        // pre-edit original) — pre-I1/I2 invariant; a typo mid-edit must not wipe the
        // good value the user already previewed.
        return;
      }
      newFields.removeAttribute("data-error");
      valueInput.removeAttribute("aria-invalid");
      tokenIntents[intentKey] = tokenIntentFor(
        token,
        null,
        nameInput.value.trim() || undefined,
        customValue || undefined
      );
      if (customValue) {
        previewTargets.forEach(function (element) { element.style.setProperty(token.cssVar, customValue); });
      }
      syncActiveStyleDraftKey();
      return;
    }
    var alternative = tokenByCssVar(choice);
    if (!alternative) return;
    tokenIntents[intentKey] = tokenIntentFor(token, alternative);
    previewTargets.forEach(function (element) { element.style.setProperty(token.cssVar, alternative.value); });
    syncActiveStyleDraftKey();
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

  function payloadForSend(skipRender, target, draftContext) {
    var payloadTarget = target || selectedElement;
    var selection;
    var payloadStyleEdits;
    var payloadTokenIntents;
    var payloadTextEdit;
    var payloadInstruction;
    var payloadMetadata;
    var payloadSelectionElements;
    if (draftContext) {
      if (!payloadTarget || payloadTarget.isConnected === false) {
        var draftSelectionGoneError = new Error("The selected element is no longer on the page");
        draftSelectionGoneError.ravenSelectionGone = true;
        throw draftSelectionGoneError;
      }
      selection = selectionFor(payloadTarget);
      draftContext.selection = selection;
      draftContext.selector = selection.selector;
      payloadStyleEdits = draftContext.styleEdits;
      payloadTokenIntents = draftContext.tokenIntents;
      payloadTextEdit = draftContext.textEdit || null;
      payloadInstruction = draftContext.instructionDraft || "";
      payloadMetadata = draftContext.reactMetadata;
      payloadSelectionElements = draftContext.selectionElements || [payloadTarget];
    } else {
      // Capture drafts for the primary the user saw before reconciliation; a promotion resets
      // edit context so a stale instruction can never migrate onto the promoted element.
      capturePanelDrafts();
      orderedSelection();
      selection = currentSelection;
      payloadTarget = selectedElement;
      payloadStyleEdits = styleEdits;
      payloadTokenIntents = tokenIntents;
      payloadTextEdit = textEdit;
      payloadInstruction = instructionDraft;
      payloadMetadata = reactMetadata;
      payloadSelectionElements = orderedSelection();
    }
    if (!selection) {
      var selectionGoneError = new Error("The selected element is no longer on the page");
      selectionGoneError.ravenSelectionGone = true;
      throw selectionGoneError;
    }
    var payload = {
      selector: selection.selector,
      html: selection.html,
      rect: selection.rect,
      styles: selection.styles,
      tokens: selection.tokens,
      stateStyles: selection.stateStyles,
      tokenIntents: Object.keys(payloadTokenIntents).map(function (key) { return scopedIntentForSend(payloadTokenIntents[key], payloadTarget, draftContext); }),
      styleEdits: styleEditsForSend(payloadStyleEdits).map(function (intent) { return scopedIntentForSend(intent, payloadTarget, draftContext); }),
      stateStyleEdits: stateStyleEditsForSend(draftContext ? draftContext.stateStyleEdits : stateStyleEdits).map(function (intent) { return scopedIntentForSend(intent, payloadTarget, draftContext); }),
      instruction: payloadInstruction
    };
    if (payloadTextEdit && payloadTextEdit.newText !== payloadTextEdit.oldText) {
      payload.textEdit = { oldText: payloadTextEdit.oldText, newText: payloadTextEdit.newText };
    }
    if (!draftContext) payload.stateStyles = ({ stateStyles: currentSelection.stateStyles }).stateStyles;
    if (!draftContext && isMaintainerCreateFlow()) {
      var userNotes = componentRequest.useCase.trim();
      payload.intent = "create-component";
      payload.userNotes = userNotes;
      payload.instruction = "Build this as a reusable component in the design system and update DESIGN.md." + (userNotes ? " User notes: " + userNotes : "");
    } else if (!draftContext && isComponentAssetsFlow() && componentRequestHasDraft()) {
      payload.componentRequest = {
        issueType: componentRequest.issueType,
        issueSize: componentRequest.issueSize,
        useCase: componentRequest.useCase,
        email: componentRequest.email
      };
    }
    if (!draftContext && isComponentAssetsFlow() && componentName.trim()) {
      payload.componentName = componentName.trim();
    }
    if (payloadMetadata) {
      Object.keys(payloadMetadata).forEach(function (key) {
        if (payloadMetadata[key] !== undefined) payload[key] = payloadMetadata[key];
      });
    }
    var ordered = payloadSelectionElements.filter(function (element, index, elements) {
      return !!element && element.isConnected !== false && elements.indexOf(element) === index;
    });
    if (ordered.length >= 2) {
      payload.multiSelect = ordered.map(function (element, index) {
        var elementSelection = selectionFor(element);
        return {
          index: index + 1,
          selector: elementSelection.selector,
          html: elementSelection.html,
          rect: elementSelection.rect,
          styles: elementSelection.styles
        };
      });
    }
    // scopedIntentForSend may have resnapshot the component scope — repaint so
    // the chips show exactly what this payload carries, and drop stale
    // component-scope badges if scope fell back to instance below two matches.
    if (!skipRender && !draftContext) {
      renderPanel();
      paintSelectionOverlays();
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
      button.innerHTML = sendButtonMarkup(state, message);
      // The button holds its width through every state now, so its own offsetWidth is the
      // final pill geometry — no offscreen probe needed. Match the trace SVG to it anyway:
      // stretching the static 100x44 viewBox distorts the corner radii into stray arcs.
      var sentWidth = button.offsetWidth;
      if (sentWidth) {
        var trace = button.querySelector(".raven-grab-border-trace");
        if (trace) {
          trace.setAttribute("viewBox", "0 0 " + sentWidth + " 44");
          var traceRect = trace.querySelector("rect");
          if (traceRect) traceRect.setAttribute("width", String(sentWidth - 1));
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
      if (panelQuery(selector) !== button) return;
      setSendButtonState(button, "default", defaultLabel);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-label");
      // Reapply real enablement (not unconditional enable): the component name
      // or selection may have been invalidated while the animation was busy.
      syncSendButtonDisabled();
    };
    if (reducedMotion) {
      setSendButtonState(button, "sent", sentMessage);
      setTimeout(finish, SEND_TIMINGS.hold);
      return;
    }
    setSendButtonState(button, "collapse", defaultLabel);
    setTimeout(function () {
      if (panelQuery(selector) !== button) return;
      setSendButtonState(button, "dot", sentMessage);
    }, SEND_TIMINGS.collapse);
    setTimeout(function () {
      if (panelQuery(selector) !== button) return;
      setSendButtonState(button, "trace", sentMessage);
    }, SEND_TIMINGS.collapse + SEND_TIMINGS.dot);
    setTimeout(function () {
      if (panelQuery(selector) !== button) return;
      setSendButtonState(button, "sent", sentMessage);
    }, SEND_TIMINGS.collapse + SEND_TIMINGS.dot + SEND_TIMINGS.trace);
    setTimeout(finish, SEND_TIMINGS.collapse + SEND_TIMINGS.dot + SEND_TIMINGS.trace + SEND_TIMINGS.expand + SEND_TIMINGS.hold);
  }

  function clearInstructionText() {
    instructionDraft = "";
    var field = panelQuery("[data-instruction]");
    if (!field || !field.value) return;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      field.value = "";
      return;
    }
    field.setAttribute("data-clearing", "");
    var instructionToClear = field.value;
    setTimeout(function () {
      if (panelQuery("[data-instruction]") === field && field.value === instructionToClear) field.value = "";
      field.removeAttribute("data-clearing");
    }, 250);
  }

  function sendStyleChange(change) {
    if (!change.endpoint) return Promise.resolve({ local: true });
    return trackPendingSend(function () {
      return fetch(change.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change.payload)
      }).then(function (response) {
        if (!response.ok) throw new Error("Bridge returned " + response.status);
        return response.json();
      }).then(function (body) {
        return body && body.element ? { batchId: body.element.batchId, id: body.element.id, body: body } : { local: true, body: body };
      });
    });
  }

  async function sendSelection() {
    if (commitInFlight || !isMaintainerCreateFlow()) return;
    var button = panelQuery("[data-maintainer-send]");
    capturePanelDrafts();
    if (!button) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Sending…";
    setGlobalActionStatus("", "");
    var defaultLabel = "Add component";
    var sentLabel = "Component added";
    try {
      await persistComponentArtifact();
      var payload = payloadForSend();
      var endpoint = grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab");
      var styleChange = { id: "maintainer-" + Date.now().toString(36), target: payload.selector, state: "sent", payload: payload, endpoint: endpoint };
      button = panelQuery("[data-maintainer-send]") || button;
      if (!endpoint) {
        setGlobalActionStatus("Saved " + payload.selector, "sr-only");
        morphSendButton(button, "[data-maintainer-send]", sentLabel, defaultLabel);
        return;
      }
      await sendStyleChange(styleChange);
      reactMetadata = null;
      setGlobalActionStatus(sentLabel, "sr-only");
      morphSendButton(button, "[data-maintainer-send]", sentLabel, defaultLabel);
    } catch (error) {
      renderPanel();
      button = panelQuery("[data-maintainer-send]") || button;
      setGlobalActionStatus(error && error.ravenSelectionGone ? error.message : (error && error.message ? error.message : "Could not add component"), "error");
      if (button) {
        button.disabled = false;
        button.textContent = "Try again";
        button.setAttribute("data-send-state", "default");
        button.removeAttribute("aria-busy");
        button.removeAttribute("aria-label");
      }
      console.error("[Raven Grab] Add component failed.", error);
    }
  }

  function setPanelStatus(message, kind, card) {
    var status = panelQuery(card === "b" ? "[data-status-b]" : "[data-status]");
    if (!status) return;
    status.textContent = message;
    if (kind) status.setAttribute("data-kind", kind);
    else status.removeAttribute("data-kind");
  }

  function setGlobalActionStatus(message, kind) {
    var status = (structureActions && structureActions.querySelector("[data-status-b]"))
      || (globalActions && globalActions.querySelector("[data-status]"))
      || panelQuery("[data-status-b]")
      || panelQuery("[data-status]");
    if (!status) return;
    status.textContent = message;
    if (kind) status.setAttribute("data-kind", kind);
    else status.removeAttribute("data-kind");
  }

  function advanceComponentRequest() {
    capturePanelDrafts();
    if (!componentName.trim()) {
      setGlobalActionStatus("Name the component first.", "error");
      return;
    }
    if (!componentRequest.issueType || !componentRequest.issueSize || !componentRequest.useCase.trim()) {
      setGlobalActionStatus("Choose an issue type and size, then describe the impact.", "error");
      return;
    }
    componentRequestStep = "email";
    renderPanel();
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function dismissRequestHint() {
    requestHintDismissed = true;
    try {
      window.localStorage.setItem("raven-grab-request-hint-dismissed", "true");
    } catch (storageError) {
      // The in-memory dismissal still applies when storage is unavailable.
    }
    renderPanel();
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
    var button = panelQuery("[data-send-email]");
    var emailInput = panelQuery("[data-component-email]");
    var emailFlow = !!(grabConfig && grabConfig.componentRequestFlow === "email");
    componentRequest.email = componentRequest.email.trim();
    if (!componentName.trim()) {
      setGlobalActionStatus("Name the component first.", "error");
      return false;
    }
    if ((emailFlow || componentRequest.email) && !validEmail(componentRequest.email)) {
      setGlobalActionStatus("Enter a valid email address.", "error");
      if (emailInput) emailInput.focus();
      return false;
    }
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Sending…";
    }
    // The CTA renders in two copies (inline form + left dock); disable every
    // copy in place so a second click can't fire a duplicate request mid-send.
    var ctaCopies = panelQueryAll("[data-request-next], [data-send-email], [data-maintainer-send]");
    for (var ctaCopyIndex = 0; ctaCopyIndex < ctaCopies.length; ctaCopyIndex++) ctaCopies[ctaCopyIndex].disabled = true;
    setGlobalActionStatus("", "");
    var requestIdAtSend = null;
    try {
      if (!componentRequestId || componentRequestInFlight) componentRequestId = "cr-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      requestIdAtSend = componentRequestId;
      componentRequestInFlight = true;
      await persistComponentArtifact();
      // Destination adapter priority: a live agent session (bridge or configured
      // grab endpoint) beats the standalone request endpoint; the standalone
      // endpoint is the fallback when no agent is connected.
      // The playground email flow always uses the standalone endpoint; the
      // agent-session arm only applies to the production destination adapter.
      var agentEndpoint = emailFlow ? null : (grabConfig ? grabConfig.grabEndpoint : bridgeUrl("/grab"));
      var standaloneEndpoint = agentEndpoint ? null : (grabConfig && grabConfig.componentRequestEndpoint);
      var endpoint = agentEndpoint || standaloneEndpoint;
      if (!endpoint) throw new Error("No component request destination is configured");
      var body = standaloneEndpoint ? {
        requestId: componentRequestId,
        selector: currentSelection.selector,
        tokens: currentSelection.tokens,
        styles: currentSelection.styles,
        stateStyles: currentSelection.stateStyles,
        issueType: componentRequest.issueType,
        issueSize: componentRequest.issueSize,
        useCase: componentRequest.useCase,
        email: componentRequest.email,
        componentName: componentName.trim()
      } : payloadForSend();
      if (standaloneEndpoint && emailFlow) body.flow = "email";
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (componentRequestId !== requestIdAtSend) return false;
      if (!response.ok) throw new Error("Request returned " + response.status);
      if (!standaloneEndpoint) {
        componentRequestInFlight = false;
        componentRequestId = "";
        syncSendButtonDisabled();
        setGlobalActionStatus("Sent to agent", "sr-only");
        if (button) morphSendButton(button, "[data-send-email]", "Sent to agent", "Create request");
        return true;
      }
      var result = await response.json();
      if (componentRequestId !== requestIdAtSend) return false;
      var status = (structureActions && structureActions.querySelector("[data-status-b]"))
        || (globalActions && globalActions.querySelector("[data-status]"))
        || panelQuery("[data-status-b]")
        || panelQuery("[data-status]");
      // Only render server-supplied URLs that are plain https links; escapeHtml
      // does not neutralize a javascript: scheme inside href.
      var safeUrl = typeof result.url === "string" && /^https:\/\//i.test(result.url) ? result.url : "";
      var statusLink = function (label) {
        if (!status || !safeUrl) return;
        status.innerHTML = '<a href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener">' + escapeHtml(label) + "</a>";
        status.setAttribute("data-kind", "success");
      };
      if (result.mode === "email" && result.success === true) {
        setGlobalActionStatus("Email sent", "sr-only");
        if (button) morphSendButton(button, "[data-send-email]", "Email sent", emailFlow ? "Send email" : "Create request");
      } else if (result.mode === "issue" && safeUrl) {
        statusLink("View request");
        if (button) morphSendButton(button, "[data-send-email]", "Request created", "Create request");
      } else if (result.mode === "prefill" && safeUrl && typeof result.packet === "string") {
        // Clipboard can be denied; the prefilled-issue link still works without it.
        var prefillCopied = true;
        try { await writeClipboardText(result.packet); } catch (clipboardError) { prefillCopied = false; }
        if (componentRequestId !== requestIdAtSend) return false;
        statusLink("Open prefilled issue");
        if (button) morphSendButton(button, "[data-send-email]", prefillCopied ? "Packet copied" : "Request ready", "Create request");
      } else if (result.mode === "packet" && typeof result.packet === "string") {
        await writeClipboardText(result.packet);
        if (componentRequestId !== requestIdAtSend) return false;
        setGlobalActionStatus("Request packet copied — paste it to your team or agent", "success");
        if (button) morphSendButton(button, "[data-send-email]", "Packet copied", "Create request");
      } else {
        throw new Error("Unexpected component request response");
      }
      if (componentRequestId !== requestIdAtSend) return false;
      componentRequestInFlight = false;
      componentRequestId = "";
      syncSendButtonDisabled();
      return true;
    } catch (error) {
      if (requestIdAtSend !== null && componentRequestId !== requestIdAtSend) return false;
      if (requestIdAtSend !== null) componentRequestInFlight = false;
      if (emailFlow) componentRequestId = "";
      setGlobalActionStatus(error && error.ravenSelectionGone ? error.message : (error && error.message ? error.message : "Could not send the component request"), "error");
      if (button) {
        button.disabled = false;
        button.textContent = "Try again";
        button.setAttribute("data-send-state", "default");
        button.removeAttribute("aria-busy");
        button.removeAttribute("aria-label");
      }
      syncSendButtonDisabled();
      console.error("[Raven Grab] Component request failed.", error);
      return false;
    }
  }

  onPanels("click", function (event) {
    event.stopPropagation();
    if (!event.target.closest("[data-raven-grab-global-actions]")) {
      activeGlobalActionSurface = event.currentTarget === panelLeft ? activeTabB : activeTabA;
      mountGlobalActions();
    }
    var layerToggle = event.target.closest("[data-layer-toggle]");
    if (layerToggle) {
      toggleLayerNode(layerToggle.getAttribute("data-layer-toggle"));
      return;
    }
    var addTemplateLayer = event.target.closest("[data-add-template-layer]");
    if (addTemplateLayer) {
      addTemplateNode(findLayerNode(layerTree, addTemplateLayer.getAttribute("data-add-template-layer")));
      templateFilter = "";
      renderPanel();
      return;
    }
    var removeTemplateLayer = event.target.closest("[data-remove-template-layer]");
    if (removeTemplateLayer) {
      removeTemplateNode(findLayerNode(layerTree, removeTemplateLayer.getAttribute("data-remove-template-layer")));
      return;
    }
    if (event.target.closest("[data-add-all-template-layers]")) {
      addAllTemplateLayers();
      return;
    }
    var elementChip = event.target.closest("[data-element-selector]");
    if (elementChip) copyElementSelector(elementChip);
    var scopeChip = event.target.closest("[data-edit-scope]");
    if (scopeChip) {
      setEditScope(scopeChip.getAttribute("data-edit-scope"));
      return;
    }
    var scopeTrack = event.target.closest("[data-scope-track]");
    if (scopeTrack && typeof event.clientX === "number" && typeof scopeTrack.getBoundingClientRect === "function") {
      var trackRect = scopeTrack.getBoundingClientRect();
      setEditScope(event.clientX < trackRect.left + trackRect.width / 2 ? "instance" : "component");
      return;
    }
    var panelPreset = event.target.closest("[data-panel-preset]");
    if (panelPreset) {
      applyPanelPreset(panelPreset.getAttribute("data-panel-preset"));
      return;
    }
    if (event.target.closest("[data-maintainer-send]")) sendSelection();
    if (event.target.closest("[data-send-batch]")) dispatchPendingBatch();
    if (event.target.closest("[data-request-next]")) advanceComponentRequest();
    if (event.target.closest("[data-send-email]")) sendComponentRequest();
    if (event.target.closest("[data-save-template]")) saveTemplate();
    var removeChangeButton = event.target.closest("[data-remove-change]");
    if (removeChangeButton) removeChange(removeChangeButton.getAttribute("data-remove-change"));
    var retryChangeButton = event.target.closest("[data-retry-change]");
    if (retryChangeButton) retryChange(retryChangeButton.getAttribute("data-retry-change"));
    if (event.target.closest("[data-dismiss-request-hint]")) dismissRequestHint();
    var settingsTrigger = event.target.closest("[data-settings-open]");
    if (settingsTrigger) {
      openSettingsModal(settingsTrigger);
      return;
    }
    var templateRole = event.target.closest("[data-template-role]");
    if (templateRole) setTemplateRole(Number(templateRole.getAttribute("data-template-index")), templateRole.getAttribute("data-template-role"));
    var tab = event.target.closest("[data-tab]");
    if (tab) switchTab(tab.getAttribute("data-tab"));
    var sectionToggle = event.target.closest("[data-section-toggle]");
    if (sectionToggle) toggleSection(sectionToggle.getAttribute("data-section-toggle"));
    var trayToggle = event.target.closest("[data-change-tray-toggle]");
    if (trayToggle) toggleChangeTraySection(trayToggle.getAttribute("data-change-tray-toggle"));
    var styleValue = event.target.closest("[data-style-value]");
    if (styleValue && !event.target.closest("[data-token-detach]")) beginStyleEdit(styleValue);
    var detachBtn = event.target.closest("[data-token-detach]");
    if (detachBtn) {
      event.preventDefault();
      event.stopPropagation();
      detachTokenBinding(detachBtn.getAttribute("data-token-detach"), detachBtn.getAttribute("data-style-state"));
      return;
    }
    var radiusExpand = event.target.closest("[data-radius-expand]");
    if (radiusExpand) beginRadiusEdit(radiusExpand.closest("[data-style-property]"));
  });

  onPanels("keydown", function (event) {
    var tile = event.target.closest ? event.target.closest("[data-panel-preset]") : null;
    if (!tile) return;
    var step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
      : event.key === "Home" ? "home"
      : event.key === "End" ? "end"
      : null;
    if (step === null) return;
    event.preventDefault();
    movePanelPresetFocus(tile, step);
  });

  function focusLayerRow(node) {
    if (!node) return;
    var row = layerPanel().querySelector('[data-layer-id="' + node.id + '"]');
    if (!row) return;
    if (typeof row.focus === "function") row.focus();
    if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }

  function selectLayerNodeFromKeyboard(node) {
    if (!node) return false;
    var element = layerElements.get(node.id);
    if (!element || element.isConnected === false) return false;
    applySelection([element], element, element, "panel");
    focusLayerRow(node);
    return true;
  }

  function handleLayerTreeKey(event) {
    if (activeTabB !== "layers" || event.currentTarget !== panelLeft) return false;
    var target = event.target;
    if (!target || typeof target.closest !== "function") return false;
    var tagName = target.tagName;
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "BUTTON" || tagName === "SELECT" || target.isContentEditable) return false;
    if (target.closest("input, textarea, button, select")) return false;
    var row = target.closest("[data-layer-id]");
    if (!row) return false;
    var node = findLayerNode(layerTree, row.getAttribute("data-layer-id"));
    if (!node) return false;
    var destination = null;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      var visible = visibleLayerNodes();
      var currentIndex = visible.indexOf(node);
      var offset = event.key === "ArrowUp" ? -1 : 1;
      if (currentIndex !== -1 && visible[currentIndex + offset]) destination = visible[currentIndex + offset];
    } else if (event.key === "ArrowRight") {
      if (node.children.length && layerIsCollapsed(node)) {
        setLayerExpanded(node, true);
        destination = node;
      } else if (node.children.length) destination = node.children[0];
    } else if (event.key === "ArrowLeft") {
      if (node.children.length && !layerIsCollapsed(node)) {
        setLayerExpanded(node, false);
        destination = node;
      } else if (node.parentId != null) destination = findLayerNode(layerTree, node.parentId);
    } else if (event.key === "Tab") {
      if (node.parentId == null) return false;
      var parent = findLayerNode(layerTree, node.parentId);
      var siblingIndex = parent ? parent.children.indexOf(node) : -1;
      var siblingOffset = event.shiftKey ? -1 : 1;
      if (parent && siblingIndex !== -1 && parent.children[siblingIndex + siblingOffset]) destination = parent.children[siblingIndex + siblingOffset];
    } else if (event.key === "Home" || event.key === "End") {
      var boundary = visibleLayerNodes();
      if (boundary.length) destination = event.key === "Home" ? boundary[0] : boundary[boundary.length - 1];
    } else return false;
    if (!destination || !selectLayerNodeFromKeyboard(destination)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  onPanels("contextmenu", function (event) {
    var row = event.target.closest("li[data-token-index]");
    if (!row) return;
    event.preventDefault();
    detachTokenBinding(row.getAttribute("data-style-property"), row.getAttribute("data-style-state"));
  });
  onPanels("keydown", function (event) {
    if (handleLayerTreeKey(event)) return;
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
  onPanels("change", function (event) {
    var index = event.target.getAttribute("data-token-choice");
    if (index !== null) updateIntent(index);
    if (event.target.getAttribute("data-issue-type") !== null) componentRequest.issueType = event.target.value;
    if (event.target.getAttribute("data-issue-size") !== null) componentRequest.issueSize = event.target.value;
    // Assignments above must precede the sync — enablement reads componentRequest.
    syncSendButtonDisabled();
  });
  onPanels("input", function (event) {
    var colorIndex = event.target.getAttribute("data-new-color");
    if (colorIndex !== null) {
      var colorValueInput = panelQuery('[data-new-value="' + colorIndex + '"]');
      if (colorValueInput) colorValueInput.value = event.target.value;
    }
    var index = event.target.getAttribute("data-new-name");
    if (index === null) index = event.target.getAttribute("data-new-value");
    if (index === null) index = colorIndex;
    if (index !== null) {
      updateIntent(index);
      syncSendButtonDisabled();
    }
    if (event.target.getAttribute("data-instruction") !== null) {
      instructionDraft = event.target.value;
      syncSendButtonDisabled();
    }
    if (event.target.getAttribute("data-use-case") !== null) {
      componentRequest.useCase = event.target.value;
      syncSendButtonDisabled();
    }
    if (event.target.getAttribute("data-component-email") !== null) {
      componentRequest.email = event.target.value;
      syncSendButtonDisabled();
    }
    if (event.target.getAttribute("data-component-name") !== null) {
      componentName = event.target.value;
      syncSendButtonDisabled();
    }
    if (event.target.getAttribute("data-template-name") !== null) {
      templateName = event.target.value;
      var saveButton = panelQuery("[data-save-template]");
      if (saveButton) saveButton.disabled = !templateName.trim();
    }
    if (event.target.getAttribute("data-template-note") !== null) {
      var noteId = event.target.getAttribute("data-template-note");
      var noteSlot = templateDraftForNode(noteId);
      if (noteSlot) noteSlot.note = event.target.value;
    }
    if (event.target.getAttribute("data-fixed-move-note") !== null) fixedMoveNote = event.target.value;
    if (event.target.getAttribute("data-template-filter") !== null) {
      templateFilter = event.target.value;
      renderPanel();
      var filterField = panelQuery("[data-template-filter]");
      if (filterField) {
        filterField.focus();
        filterField.setSelectionRange(filterField.value.length, filterField.value.length);
      }
    }
  });
  // Pointer drag follows the codepen model: the source block hides behind a traveling
  // "Move here" slot box while sibling blocks live-swap (FLIP) around it; a floating
  // subtree clone follows the cursor.
  function layerRowDepth(row) {
    var depth = parseInt(row.style.getPropertyValue("--layer-depth"), 10);
    return isNaN(depth) ? 0 : depth;
  }

  // A node's block = its row + every contiguous following row that is deeper (its subtree).
  function layerBlockRows(row) {
    var depth = layerRowDepth(row);
    var block = [row];
    var next = row.nextElementSibling;
    while (next) {
      // A separate operation's draft pending slot can sit among these rows — step over it
      // (like layerSiblingRow does) so it never splits the subtree we're collecting.
      if (next.classList.contains("raven-grab-layer-slot")) { next = next.nextElementSibling; continue; }
      // A fixed-move detail row belongs to the layer row directly above it.
      var isDetail = next.classList.contains("raven-grab-template-detail");
      if (!isDetail && (!next.classList.contains("raven-grab-layer-row") || layerRowDepth(next) <= depth)) break;
      block.push(next);
      next = next.nextElementSibling;
    }
    return block;
  }

  function layerBlockRect(rows) {
    var first = rows[0].getBoundingClientRect();
    var last = rows[rows.length - 1].getBoundingClientRect();
    return { top: first.top, bottom: last.bottom, height: last.bottom - first.top };
  }

  // Nearest same-parent sibling row in the given direction, skipping detail rows and
  // drop slot boxes; null when the parent's region ends first.
  function layerSiblingRow(row, direction) {
    var depth = layerRowDepth(row);
    var parentKey = row.getAttribute("data-layer-parent");
    var block = layerBlockRows(row);
    var cursor = direction < 0 ? row.previousElementSibling : block[block.length - 1].nextElementSibling;
    while (cursor) {
      if (cursor.classList.contains("raven-grab-template-detail") || cursor.classList.contains("raven-grab-layer-slot")) {
        cursor = direction < 0 ? cursor.previousElementSibling : cursor.nextElementSibling;
        continue;
      }
      if (!cursor.classList.contains("raven-grab-layer-row")) return null;
      var cursorDepth = layerRowDepth(cursor);
      if (cursorDepth < depth) return null; // left the parent's region
      if (cursorDepth === depth && cursor.getAttribute("data-layer-parent") === parentKey && cursor.getAttribute("data-layer-id")) return cursor;
      cursor = direction < 0 ? cursor.previousElementSibling : cursor.nextElementSibling;
    }
    return null;
  }

  // FLIP the displaced sibling block so the swap animates instead of teleporting.
  function animateLayerSwap(rows, previousTop) {
    // Reduced-motion: the rows are already in their new DOM slot — skip the FLIP entirely.
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var delta = previousTop - rows[0].getBoundingClientRect().top;
    if (!delta) return;
    rows.forEach(function (swapRow) {
      swapRow.style.transition = "none";
      swapRow.style.transform = "translateY(" + delta + "px)";
    });
    rows[0].getBoundingClientRect(); // reflow so the transition below runs
    rows.forEach(function (swapRow) {
      swapRow.style.transition = "transform 150ms ease";
      swapRow.style.transform = "";
      swapRow.addEventListener("transitionend", function handler() {
        swapRow.style.transition = "";
        swapRow.removeEventListener("transitionend", handler);
      });
    });
  }

  function clearLayerDragExpand() {
    if (layerDragExpandTimer !== null) clearTimeout(layerDragExpandTimer);
    layerDragExpandTimer = null;
    layerDragExpandElement = null;
  }

  function stopLayerDragAutoScroll() {
    if (layerDragAutoScrollTimer !== null) clearTimeout(layerDragAutoScrollTimer);
    layerDragAutoScrollTimer = null;
    layerDragAutoScrollY = null;
    layerDragAutoScrollDirection = 0;
  }

  // The slot box stands in for the hidden source block and marks the drop position
  // in the flow — it travels with the block as siblings live-swap around it.
  function createLayerDragSlot(drag) {
    var slot = document.createElement("li");
    slot.className = "raven-grab-layer-slot";
    slot.style.setProperty("--layer-depth", String(layerRowDepth(drag.row)));
    slot.innerHTML = '<span class="raven-grab-layer-slot-grip" aria-hidden="true">⠿</span>Move here';
    drag.row.parentElement.insertBefore(slot, drag.row);
    drag.slot = slot;
    // Do not clear drag.reparentTarget here — expandLayerDuringDrag recreates the
    // slot mid-gesture and must re-resolve from lastClientY without wiping intent.
  }

  function restoreLayerDragToHomeParent(drag) {
    if (!drag || !drag.row || !drag.row.parentElement) return;
    var parentKey = drag.row.getAttribute("data-layer-parent");
    var list = drag.row.parentElement;
    var rows = list.querySelectorAll(".raven-grab-layer-row[data-layer-id]");
    var home = null;
    for (var i = 0; i < rows.length; i += 1) {
      if (drag.block && drag.block.indexOf(rows[i]) !== -1) continue;
      if (rows[i].getAttribute("data-layer-parent") === parentKey) {
        home = rows[i];
        break;
      }
    }
    var unit = [drag.slot].concat(drag.block || []);
    if (home) unit.forEach(function (node) { list.insertBefore(node, home); });
    setLayerDragSlotMode(drag, false, layerRowDepth(drag.row));
  }

  function setLayerDragSlotMode(drag, reparent, depth) {
    if (!drag || !drag.slot) return;
    drag.slot.style.setProperty("--layer-depth", String(depth));
    if (reparent) {
      drag.slot.setAttribute("data-reparent", "true");
      drag.slot.innerHTML = '<span class="raven-grab-layer-slot-grip" aria-hidden="true">⠿</span>Move into…';
    } else {
      drag.slot.removeAttribute("data-reparent");
      drag.slot.innerHTML = '<span class="raven-grab-layer-slot-grip" aria-hidden="true">⠿</span>Move here';
    }
  }

  function layerRowAtClientY(clientY, excludeRows) {
    var list = layerPanel().querySelector(".raven-grab-layer-list");
    if (!list) return null;
    var rows = list.querySelectorAll(".raven-grab-layer-row[data-layer-id]");
    for (var i = 0; i < rows.length; i += 1) {
      if (excludeRows && excludeRows.indexOf(rows[i]) !== -1) continue;
      if (rows[i].getAttribute("data-dragging") === "true") continue;
      var rect = rows[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) return rows[i];
    }
    return null;
  }

  // Resolve a cross-parent drop from the pointer. Same-parent targets return null
  // so the existing sibling-swap path owns reorder. Nesting only when the hit row
  // already has children (container) and the pointer is in its lower half — never
  // nest into a leaf on a casual "drop after", which would steal same-parent reorder.
  function resolveLayerReparentDrop(drag, clientY) {
    if (!drag || !drag.row) return null;
    var fromId = drag.row.getAttribute("data-layer-id");
    var fromNode = findLayerNode(layerTree, fromId);
    if (!fromNode || fromNode.parentId == null) return null;
    if (layerNodeBoundaryBlocked(fromNode)) return null;
    var hit = layerRowAtClientY(clientY, drag.block);
    if (!hit) return null;
    var hitNode = findLayerNode(layerTree, hit.getAttribute("data-layer-id"));
    if (!hitNode || String(hitNode.id) === String(fromNode.id)) return null;
    if (layerNodeIsAncestorOf(fromNode, hitNode)) return null;
    var hitRect = hit.getBoundingClientRect();
    var after = clientY >= hitRect.top + hitRect.height / 2;
    var toParentId;
    var toIndex;
    var destDepth;
    if (after && hitNode.children.length > 0 && !layerNodeBoundaryBlocked(hitNode)) {
      toParentId = hitNode.id;
      toIndex = hitNode.children.length;
      destDepth = hitNode.depth + 1;
    } else {
      if (hitNode.parentId == null) return null;
      toParentId = hitNode.parentId;
      var toParentNode = findLayerNode(layerTree, toParentId);
      if (!toParentNode || layerNodeBoundaryBlocked(toParentNode)) return null;
      toIndex = toParentNode.children.indexOf(hitNode);
      if (after) toIndex += 1;
      destDepth = hitNode.depth;
    }
    if (String(toParentId) === String(fromNode.parentId)) return null;
    var toParentNodeFinal = findLayerNode(layerTree, toParentId);
    if (!toParentNodeFinal) return null;
    if (layerNodeIsAncestorOf(fromNode, toParentNodeFinal)) return null;
    if (toParentNodeFinal.depth + 1 + layerSubtreeDepthSpan(fromNode) > 12) return null;
    return {
      toParentId: toParentId,
      toIndex: Math.max(0, Math.min(toIndex, toParentNodeFinal.children.length)),
      destDepth: destDepth,
      anchorRow: hit,
      after: after
    };
  }

  function placeLayerDragAtReparentDrop(drag, drop) {
    if (!drag || !drop || !drop.anchorRow) return;
    var unit = [drag.slot].concat(drag.block);
    var anchor = drop.anchorRow;
    if (String(drop.toParentId) === String(anchor.getAttribute("data-layer-id"))) {
      // Nesting under the hit row: place after its visible block (as last child slot).
      var block = layerBlockRows(anchor);
      var afterNode = block[block.length - 1].nextElementSibling;
      unit.forEach(function (node) { anchor.parentElement.insertBefore(node, afterNode); });
    } else if (drop.after) {
      var hitBlock = layerBlockRows(anchor);
      var next = hitBlock[hitBlock.length - 1].nextElementSibling;
      unit.forEach(function (node) { anchor.parentElement.insertBefore(node, next); });
    } else {
      unit.forEach(function (node) { anchor.parentElement.insertBefore(node, anchor); });
    }
    drag.reparentTarget = { toParentId: drop.toParentId, toIndex: drop.toIndex };
    setLayerDragSlotMode(drag, true, drop.destDepth);
  }

  function autoScrollLayerPanel(clientY) {
    var body = layerPanel().querySelector(".raven-grab-body");
    if (!body || typeof body.getBoundingClientRect !== "function") {
      stopLayerDragAutoScroll();
      return;
    }
    var rect = body.getBoundingClientRect();
    var edge = 36;
    var direction = 0;
    if (clientY < rect.top + edge) direction = -1;
    else if (clientY > rect.bottom - edge) direction = 1;
    if (!direction) {
      stopLayerDragAutoScroll();
      return;
    }
    layerDragAutoScrollY = clientY;
    if (layerDragAutoScrollDirection !== direction) {
      if (layerDragAutoScrollTimer !== null) clearTimeout(layerDragAutoScrollTimer);
      layerDragAutoScrollTimer = null;
      layerDragAutoScrollDirection = direction;
    }
    if (layerDragAutoScrollTimer !== null) return;
    body.scrollTop = Math.max(0, (body.scrollTop || 0) + direction * 18);
    layerDragAutoScrollTimer = setTimeout(function () {
      layerDragAutoScrollTimer = null;
      if (layerDrag && layerDrag.active && layerDragAutoScrollY !== null) autoScrollLayerPanel(layerDragAutoScrollY);
    }, 50);
  }

  function expandLayerDuringDrag(element) {
    if (!layerDrag || !layerDrag.active || element.isConnected === false) return;
    var targetNode = layerNodeForElement(element);
    if (!targetNode || !layerIsCollapsed(targetNode)) return;
    var drag = layerDrag;
    var sourceNode = layerNodeForElement(drag.pressElement);
    var body = layerPanel().querySelector(".raven-grab-body");
    var scrollTop = body ? body.scrollTop || 0 : 0;
    if (drag.slot && typeof drag.slot.remove === "function") drag.slot.remove();
    setLayerExpanded(targetNode, true);
    layerDragRenderBypass = true;
    renderPanel();
    layerDragRenderBypass = false;
    var freshRow = sourceNode ? layerPanel().querySelector('[data-layer-id="' + sourceNode.id + '"]') : null;
    if (!freshRow) {
      endLayerDrag();
      return;
    }
    drag.row = freshRow;
    drag.block = layerBlockRows(freshRow);
    drag.block.forEach(function (blockRow) { blockRow.setAttribute("data-dragging", "true"); });
    createLayerDragSlot(drag);
    body = layerPanel().querySelector(".raven-grab-body");
    if (body) body.scrollTop = scrollTop;
    // Re-resolve reparent after the expand rebuild so a nest-into gesture is not
    // silently demoted to same-parent reorder on the next mouseup.
    if (typeof drag.lastClientY === "number") {
      var drop = resolveLayerReparentDrop(drag, drag.lastClientY);
      if (drop) placeLayerDragAtReparentDrop(drag, drop);
      else {
        drag.reparentTarget = null;
        setLayerDragSlotMode(drag, false, layerRowDepth(drag.row));
      }
    }
  }

  function scheduleLayerDragExpand(event) {
    var target = event.target;
    var row = target && typeof target.closest === "function" ? target.closest("[data-layer-id]") : null;
    var node = row ? findLayerNode(layerTree, row.getAttribute("data-layer-id")) : null;
    var element = node ? layerElements.get(node.id) : null;
    if (!node || !element || !node.children.length || !layerIsCollapsed(node)) {
      clearLayerDragExpand();
      return;
    }
    if (layerDragExpandTimer !== null && layerDragExpandElement === element) return;
    clearLayerDragExpand();
    layerDragExpandElement = element;
    layerDragExpandTimer = setTimeout(function () {
      var pendingElement = layerDragExpandElement;
      layerDragExpandTimer = null;
      layerDragExpandElement = null;
      if (pendingElement) expandLayerDuringDrag(pendingElement);
    }, 600);
  }

  function startLayerDrag(event) {
    var row = layerDrag.row;
    var block = layerBlockRows(row);
    var rect = layerBlockRect(block);
    var listRect = row.parentElement.getBoundingClientRect();
    var clone = document.createElement("ul");
    clone.className = "raven-grab-layer-list raven-grab-layer-drag";
    block.forEach(function (blockRow) { clone.appendChild(blockRow.cloneNode(true)); });
    clone.style.width = listRect.width + "px";
    clone.style.left = listRect.left + "px";
    clone.style.top = rect.top + "px";
    row.getRootNode().appendChild(clone);
    block.forEach(function (blockRow) { blockRow.setAttribute("data-dragging", "true"); });
    layerDrag.block = block;
    layerDrag.clone = clone;
    layerDrag.grabOffset = event.clientY - rect.top;
    layerDrag.active = true;
    layerDrag.reparentTarget = null;
    layerDrag.lastClientY = event.clientY;
    createLayerDragSlot(layerDrag);
  }

  function moveLayerDrag(event) {
    layerDrag.lastClientY = event.clientY;
    layerDrag.clone.style.top = event.clientY - layerDrag.grabOffset + "px";
    autoScrollLayerPanel(event.clientY);
    scheduleLayerDragExpand(event);
    var reparentDrop = resolveLayerReparentDrop(layerDrag, event.clientY);
    if (reparentDrop) {
      placeLayerDragAtReparentDrop(layerDrag, reparentDrop);
      return;
    }
    if (layerDrag.reparentTarget) {
      layerDrag.reparentTarget = null;
      restoreLayerDragToHomeParent(layerDrag);
    }
    var moved = true;
    while (moved) { // may pass several short siblings in one fast move
      moved = false;
      var row = layerDrag.row;
      var unit = [layerDrag.slot].concat(layerDrag.block);
      var prevRow = layerSiblingRow(row, -1);
      if (prevRow) {
        var prevBlock = layerBlockRows(prevRow);
        var prevRect = layerBlockRect(prevBlock);
        if (event.clientY < prevRect.top + prevRect.height / 2) {
          var prevTop = prevRect.top;
          unit.forEach(function (node) { row.parentElement.insertBefore(node, prevBlock[0]); });
          animateLayerSwap(prevBlock, prevTop);
          moved = true;
          continue;
        }
      }
      var nextRow = layerSiblingRow(row, 1);
      if (nextRow) {
        var nextBlock = layerBlockRows(nextRow);
        var nextRect = layerBlockRect(nextBlock);
        if (event.clientY > nextRect.top + nextRect.height / 2) {
          var nextTop = nextRect.top;
          var anchor = nextBlock[nextBlock.length - 1].nextElementSibling;
          unit.forEach(function (node) { row.parentElement.insertBefore(node, anchor); });
          animateLayerSwap(nextBlock, nextTop);
          moved = true;
        }
      }
    }
  }

  function endLayerDrag(event) {
    window.removeEventListener("mousemove", onLayerDragMove, true);
    window.removeEventListener("mouseup", onLayerDragUp, true);
    window.removeEventListener("blur", onLayerDragUp);
    if (!layerDrag) return;
    clearLayerDragExpand();
    stopLayerDragAutoScroll();
    var drag = layerDrag;
    layerDrag = null;
    if (!drag.active) {
      // Modifier state is read from mousedown (stored on the drag), not from the
      // mouseup event — releasing Shift/Cmd mid-click must not change the gesture.
      if (!drag.cancelClick && event && event.type === "mouseup") selectPanelLayerRow(drag.row, drag);
      else if (drag.cancelClick) {
        // Deferred blocked-drag notice (#15): set only now so no mid-gesture
        // render could have exposed it.
        layerNotice = "A layer move is already with the agent";
        renderPanel();
      }
      return;
    }
    drag.clone.remove();
    if (drag.slot) drag.slot.remove();
    drag.block.forEach(function (blockRow) { blockRow.removeAttribute("data-dragging"); });
    // Blur (Alt-Tab) or a programmatic end mid-drag is a cancel, not a drop — only a real
    // mouseup commits a reorder.
    if (!event || event.type !== "mouseup") { renderPanel(); return; }
    if (drag.row.isConnected === false) { renderPanel(); return; } // panel rerendered mid-drag; nothing to commit
    var fromId = drag.row.getAttribute("data-layer-id");
    if (drag.reparentTarget && drag.reparentTarget.toParentId != null) {
      reparentLayer(fromId, drag.reparentTarget.toParentId, drag.reparentTarget.toIndex);
      return;
    }
    var fromNode = findLayerNode(layerTree, fromId);
    var parentNode = fromNode && fromNode.parentId != null ? findLayerNode(layerTree, fromNode.parentId) : null;
    if (!parentNode) { renderPanel(); return; }
    // The block's live DOM position IS the drop slot: count same-parent rows above it.
    var finalIndex = 0;
    var cursor = drag.row.previousElementSibling;
    var parentKey = drag.row.getAttribute("data-layer-parent");
    while (cursor) {
      if (cursor.getAttribute && cursor.getAttribute("data-layer-parent") === parentKey && cursor.getAttribute("data-layer-id")) finalIndex += 1;
      cursor = cursor.previousElementSibling;
    }
    var fromIndex = parentNode.children.indexOf(fromNode);
    if (finalIndex === fromIndex || !parentNode.children[finalIndex]) { renderPanel(); return; }
    reorderLayer(fromId, String(parentNode.children[finalIndex].id));
  }

  function onLayerDragMove(event) {
    if (!layerDrag) return;
    if (layerDrag.active && layerDrag.row.isConnected === false) { endLayerDrag(); return; } // rerender detached the source rows
    if (!layerDrag.active) {
      if (layerDrag.row && layerDrag.row.isConnected === false) { endLayerDrag(); return; }
      if (Math.abs(event.clientX - layerDrag.startX) + Math.abs(event.clientY - layerDrag.startY) < 4) return;
      if (!layerDrag.dragAllowed || layerDrag.dragBlocked) {
        // Never-draggable rows keep their click through pointer jitter — there is
        // no drag to disambiguate from, so eating the select is pure loss.
        // The notice is set at release, not here: any mid-gesture render (the
        // 1.5s agent poll included) would insert the notice section and shift
        // the rows under the still-held pointer (#15).
        if (layerDrag.dragBlocked) layerDrag.cancelClick = true;
        event.preventDefault();
        return;
      }
      startLayerDrag(event);
    }
    event.preventDefault();
    moveLayerDrag(event);
  }

  function onLayerDragUp(event) {
    endLayerDrag(event);
  }

  onPanels("mousedown", function (event) {
    if (event.button !== 0) return;
    // Clicking Send must NOT blur whatever field is focused (a style-editor input, the instruction
    // textarea, or a live copy edit): the blur commits + calls mountGlobalActions, which REPLACES the
    // send button node between mousedown and mouseup, so the two land on different nodes and the browser
    // fires no click at all (the "had to click Send twice" bug). Keep focus for any focused field;
    // dispatchPendingBatch flushes the style editor, tears down copy editing, and captures drafts itself.
    if (event.target.closest("[data-send-batch]")) { event.preventDefault(); return; }
    var styleLabel = event.target.closest("[data-style-label]");
    if (styleLabel && beginStyleScrub(styleLabel, event)) return;
    var row = event.target.closest("[data-layer-id], [data-template-layer-id]");
    if (!row) return;
    if (event.target.closest("button, textarea, input") && event.target !== row) return;
    // preventDefault below suppresses blur-commit, so flush the typed value explicitly.
    if (activeStyleEditorFlush) activeStyleEditorFlush();
    // A second press before the first release cancels the prior gesture (no event = cancel per
    // F4) so its clone and slot never leak.
    if (layerDrag) endLayerDrag();
    if (row.isConnected === false) {
      var freshLayerId = row.getAttribute("data-layer-id");
      var freshTemplateLayerId = row.getAttribute("data-template-layer-id");
      row = freshLayerId !== null
        ? panelQuery('[data-layer-id="' + freshLayerId + '"]')
        : panelQuery('[data-template-layer-id="' + freshTemplateLayerId + '"]');
      if (!row) return;
    }
    var layerId = row.getAttribute("data-layer-id");
    var dragAllowed = layerId !== null && !!row.getAttribute("data-layer-parent");
    var dragParentNode = dragAllowed ? findLayerNode(layerTree, Number(row.getAttribute("data-layer-parent"))) : null;
    var dragParentElement = dragParentNode ? layerElements.get(dragParentNode.id) : null;
    var dragBlocked = dragAllowed && dragParentElement && pendingLayerOrderForParent(stableSelector(dragParentElement));
    layerDrag = {
      row: row, startX: event.clientX, startY: event.clientY, active: false,
      dragAllowed: dragAllowed, dragBlocked: !!dragBlocked,
      pressElement: layerId !== null ? (layerElements.get(Number(layerId)) || null) : null,
      shiftKey: !!event.shiftKey, metaKey: !!event.metaKey, ctrlKey: !!event.ctrlKey
    };
    event.preventDefault(); // rows are not text-editable; stops text selection while dragging
    window.addEventListener("mousemove", onLayerDragMove, true);
    window.addEventListener("mouseup", onLayerDragUp, true);
    window.addEventListener("blur", onLayerDragUp); // release outside the window must not strand the clone
  });
  onPanels("mouseover", function (event) {
    var preset = panelPresetTrigger(event.target);
    if (preset && preset !== activePanelPresetTooltipTrigger) showPanelPresetTooltip(preset);
  });
  onPanels("mouseout", function (event) {
    var preset = panelPresetTrigger(event.target);
    if (!preset || (event.relatedTarget && preset.contains(event.relatedTarget))) return;
    if (shadow.activeElement === preset) return;
    hidePanelPresetTooltip();
  });
  onPanels("focusin", function (event) {
    var preset = panelPresetTrigger(event.target);
    if (preset) showPanelPresetTooltip(preset);
  });
  onPanels("focusout", function (event) {
    var preset = panelPresetTrigger(event.target);
    if (!preset || (event.relatedTarget && preset.contains(event.relatedTarget))) return;
    if (typeof preset.matches === "function" && preset.matches(":hover")) return;
    hidePanelPresetTooltip();
  });
  // Rows next to each other in the tree describe elements of wildly different size --
  // body, then a thin aside, then a full-width div. Painting each one as the pointer
  // merely passes over it on the way somewhere else strobed the whole page. Preview on
  // settle instead, the way a browser's own element inspector does.
  var panelHoverTimer = null;
  function previewHighlight(element) {
    if (panelHoverTimer) clearTimeout(panelHoverTimer);
    panelHoverTimer = setTimeout(function () {
      panelHoverTimer = null;
      setHighlight(element);
    }, LAYER_PREVIEW_SETTLE_MS);
  }
  function cancelPreviewHighlight() {
    if (panelHoverTimer) { clearTimeout(panelHoverTimer); panelHoverTimer = null; }
  }
  onPanels("mouseover", function (event) {
    if (layerDrag && layerDrag.active) return;
    setLayerRowHover(null);
    var row = event.target.closest ? event.target.closest("[data-layer-id]") : null;
    if (!row) { previewHighlight(selectedElement); return; }
    var element = layerElements.get(Number(row.getAttribute("data-layer-id")));
    previewHighlight(element || selectedElement);
  });
  onPanels("mouseleave", function () {
    if (layerDrag && layerDrag.active) return;
    // Leaving the panel is a decision, not transit -- put the selection back at once.
    cancelPreviewHighlight();
    setHighlight(selectedElement);
  });
  onPanels("keydown", function (event) {
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
    var sendSelector = isInstruction ? "[data-send-batch]" : ((grabRole === "maintainer" && isUseCase) ? "[data-maintainer-send]" : "[data-send-email], [data-request-next]");
    var sendButton = panelQuery(sendSelector);
    if (sendButton && !sendButton.disabled) sendButton.click();
  });

  function inIgnoredRegion(target) {
    if (!target || typeof target.closest !== "function") return false;
    // Injected dev tooling (Vercel toolbar etc.) must keep its own clicks.
    return !!target.closest("[data-raven-grab-ignore], vercel-live-feedback, [data-vercel-toolbar], vercel-toolbar, nextjs-portal");
  }

  function clearMultiBadges() {
    multiBadges.forEach(function (badge) {
      if (badge.parentNode && typeof badge.parentNode.removeChild === "function") badge.parentNode.removeChild(badge);
    });
    multiBadges = [];
  }

  function clearMultiHighlights() {
    multiHighlights.forEach(function (box) {
      if (box.parentNode && typeof box.parentNode.removeChild === "function") box.parentNode.removeChild(box);
    });
    multiHighlights = [];
  }

  function clearSelectionOverlays() {
    clearMultiBadges();
    clearMultiHighlights();
  }

  // Visual selection for canvas badges. Component scope intentionally wins over
  // real shift-click multiSelections: "All N like this" is the primary's live
  // matchSelector set (re-derived each call via componentScopeSiblingElements —
  // never cached), not a union with arbitrary multi-grab members. Returning to
  // editScope === "instance" restores multiSelections badges unchanged.
  function visualBadgeElements() {
    if (editScope === "component" && selectedElement) {
      var siblings = componentScopeSiblingElements();
      var ordered = [selectedElement];
      for (var i = 0; i < siblings.length; i += 1) {
        if (siblings[i] && ordered.indexOf(siblings[i]) === -1) ordered.push(siblings[i]);
      }
      return ordered;
    }
    return orderedSelection();
  }

  // Sibling highlight boxes for every visual match beyond the primary. The
  // primary keeps setHighlight() (box + selector label); these paint the rest
  // so "All N like this" / multi-grab is visible on the page, not only in Layers.
  function renderMultiHighlights(ordered) {
    clearMultiHighlights();
    if (!ordered) ordered = visualBadgeElements();
    if (ordered.length < 2) return;
    ordered.forEach(function (element) {
      if (!element || element === selectedElement) return;
      // visualBadgeElements() comes from orderedSelection(), which already prunes
      // disconnected nodes -- re-reading isConnected here costs one forced
      // connectivity check per row on a 500-row selection.
      if (typeof element.getBoundingClientRect !== "function") return;
      var rect = element.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      var box = document.createElement("div");
      box.className = "raven-grab-multi-highlight";
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.width = rect.width + "px";
      box.style.height = rect.height + "px";
      shadow.appendChild(box);
      multiHighlights.push(box);
    });
  }

  function renderMultiBadges(ordered) {
    clearMultiBadges();
    if (!ordered) ordered = visualBadgeElements();
    if (ordered.length < 2) return;
    ordered.forEach(function (element, index) {
      if (!element || typeof element.getBoundingClientRect !== "function") return;
      var rect = element.getBoundingClientRect();
      var badge = document.createElement("span");
      badge.className = "raven-grab-multi-badge";
      badge.textContent = String(index + 1);
      badge.style.left = Math.max(2, Math.min(rect.left - 9, innerWidth - 20)) + "px";
      badge.style.top = Math.max(2, Math.min(rect.top - 9, innerHeight - 20)) + "px";
      shadow.appendChild(badge);
      multiBadges.push(badge);
    });
  }

  function paintSelectionOverlays() {
    if (bothCollapsed()) { clearSelectionOverlays(); return; }
    // Instance path reuses the already-pruned multiSelections (callers run
    // orderedSelection first). Component path re-derives the live match set once
    // and shares it across highlight + badge painters — never twice.
    var ordered = (editScope === "component" && selectedElement)
      ? visualBadgeElements()
      : multiSelections.slice();
    renderMultiHighlights(ordered);
    renderMultiBadges(ordered);
  }

  function resetSelectionLocalContext() {
    clearActiveStyleDraftState();
    editScope = "instance";
    reactMetadata = null;
    instructionDraft = "";
    componentRequestStep = "form";
    componentRequest = { issueType: "", issueSize: "", useCase: "", email: "" };
    componentRequestId = "";
    componentRequestInFlight = false;
  }

  function resetEditContext() {
    rollbackTokenPreviews();
    rollbackStyleEdits();
    resetSelectionLocalContext();
  }

  function resetSelectionContext() {
    resetSelectionLocalContext();
    activeTabA = "design";
    expandedSections = { styles: true };
  }

  function componentRequestHasDraft() {
    return componentRequest.issueType !== "" || componentRequest.issueSize !== "" || componentRequest.useCase !== "" || componentRequest.email !== "";
  }

  function applySelection(elements, primary, anchor, origin) {
    // Keep the edited owner pinned while it remains selected. Once the primary
    // truly changes, transfer its singleton maps into a persistent element draft;
    // previews stay applied until removal, dispatch, detachment, or dismissal.
    var previousPrimary = selectedElement;
    var hasUnsentEdits = Object.keys(styleEdits).length > 0 || Object.keys(stateStyleEdits).length > 0 || Object.keys(tokenIntents).length > 0 || !!textEdit || instructionDraft !== "" || componentRequestHasDraft();
    if (hasUnsentEdits && selectedElement && elements.indexOf(selectedElement) !== -1) primary = selectedElement;
    if (previousPrimary !== primary) {
      if (activeStyleEditorFlush) activeStyleEditorFlush();
      capturePanelDrafts();
      if (Object.keys(styleEdits).length || Object.keys(stateStyleEdits).length || Object.keys(tokenIntents).length || !!textEdit || instructionDraft.trim()) stashActiveStyleDraft();
      resetSelectionContext();
    }
    multiSelections = elements.slice();
    var ordered = orderedSelection();
    selectedElement = ordered.indexOf(primary) !== -1 ? primary : (ordered.length ? ordered[ordered.length - 1] : null);
    selectionAnchor = anchor && anchor.isConnected !== false ? anchor : (selectedElement || null);
    selectionOrigin = origin;
    clearSelectionOverlays();
    if (!selectedElement) {
      currentSelection = null;
      setHighlight(null);
      renderPanel();
      return;
    }
    openPanel();
    setHighlight(selectedElement);
    currentSelection = selectionFor(selectedElement);
    if (previousPrimary !== selectedElement) activateStyleDraft(selectedElement);
    if (activeTabB === "layers") {
      var inTree = false;
      layerElements.forEach(function (element) { if (element === selectedElement) inTree = true; });
      if (!inTree) refreshAppliedLayerTree();
      if (origin === "canvas") expandLayerAncestorsForElement(selectedElement);
    }
    paintSelectionOverlays();
    renderPanel();
    // Reflect the canvas selection in whichever layer list is visible (Layers or Template tab).
    // Follow the PRIMARY row (latest selected), not the first selected row in DOM order.
    if (!collapsedSides.left) {
      var selectedRow = layerPanel().querySelector('.raven-grab-layer-row[data-primary="true"]') || layerPanel().querySelector('.raven-grab-layer-row[data-selected="true"]');
      if (selectedRow && typeof selectedRow.scrollIntoView === "function") selectedRow.scrollIntoView({ block: "nearest" });
    }
  }

  function selectTarget(target, shiftKey, origin) {
    var nextOrigin = origin === "panel" ? "panel" : "canvas";
    if (shiftKey && selectedElement) {
      var next = orderedSelection().slice();
      if (next.indexOf(target) === -1) next.push(target);
      // Shift-click also starts a native text selection on the page; clear it.
      if (window.getSelection) window.getSelection().removeAllRanges();
      applySelection(next, target, selectionAnchor || next[0] || target, nextOrigin);
      return;
    }
    applySelection([target], target, target, nextOrigin);
  }

  function elementForPanelLayerRow(row) {
    var id = row.getAttribute("data-layer-id");
    if (id === null) id = row.getAttribute("data-template-layer-id");
    return id === null ? null : layerElements.get(Number(id));
  }

  function selectPanelLayerRow(row, event) {
    var element = elementForPanelLayerRow(row);
    if (!element || element.isConnected === false) return;
    if (event && event.pressElement != null && event.pressElement !== element) return;
    // Selection re-renders the tree and replaces this row node, dropping focus to
    // <body> — re-resolve by id and focus so keyboard nav continues from the click.
    var focusNodeId = row.getAttribute("data-layer-id");
    var focusNode = focusNodeId === null ? null : findLayerNode(layerTree, focusNodeId);
    var shiftKey = !!(event && event.shiftKey);
    var toggleKey = !!(event && (event.metaKey || event.ctrlKey));
    var templateId = row.getAttribute("data-template-layer-id");
    if (templateId !== null && !shiftKey && !toggleKey) {
      captureTemplateDrafts();
      templateExpandedId = String(templateExpandedId) === String(templateId) ? "" : String(templateId);
    }
    if (shiftKey) {
      var visible = visiblePanelSelectionElements();
      var anchor = selectionAnchor || element;
      var anchorIndex = visible.indexOf(anchor);
      var clickedIndex = visible.indexOf(element);
      if (anchorIndex === -1 || clickedIndex === -1) {
        // An anchor not visible in this tab cannot define a range — the clicked row becomes
        // the new anchor (Figma behavior), otherwise shift-range stays broken for the whole tab session.
        applySelection([element], element, element, "panel");
        focusLayerRow(focusNode);
        return;
      }
      var start = Math.min(anchorIndex, clickedIndex);
      var end = Math.max(anchorIndex, clickedIndex);
      applySelection(visible.slice(start, end + 1), element, anchor, "panel");
      focusLayerRow(focusNode);
      return;
    }
    if (toggleKey) {
      var next = orderedSelection().slice();
      var index = next.indexOf(element);
      var primary = selectedElement;
      if (index === -1) {
        next.push(element);
        primary = element;
      } else {
        next.splice(index, 1);
        if (primary === element) primary = next.length ? next[next.length - 1] : null;
      }
      applySelection(next, primary, selectionAnchor || element, "panel");
      focusLayerRow(focusNode);
      return;
    }
    selectTarget(element, false, "panel");
    focusLayerRow(focusNode);
  }

  // event.target is retargeted to the shadow host, so a click on a button inside an
  // open shadow root reports the wrapper. composedPath()[0] is the node actually hit.
  function composedTarget(event) {
    var path = event.composedPath ? event.composedPath() : [];
    var node = path.length && path[0] && path[0].nodeType === 1 ? path[0] : event.target;
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  var TEXT_UNEDITABLE_TAGS = { input: 1, textarea: 1, select: 1, option: 1, button: 1, img: 1, svg: 1, video: 1, audio: 1, canvas: 1, iframe: 1, br: 1, hr: 1 };

  // A copy edit only makes sense on a leaf-ish text element: it has visible text and its
  // children are text/inline line breaks, so retyping replaces one caption, not a container's
  // worth of nested markup. ponytail: leaf + <br> only; nested-markup editing is a later ask.
  function isTextEditableElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (host.contains && host.contains(el)) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (TEXT_UNEDITABLE_TAGS[tag]) return false;
    var text = (el.innerText || el.textContent || "").trim();
    if (!text) return false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType === 1 && child.tagName && child.tagName.toLowerCase() !== "br") return false;
    }
    return true;
  }

  function truncateCopy(text) {
    var value = (text || "").replace(/\s+/g, " ").trim();
    return value.length > 32 ? value.slice(0, 31) + "…" : value;
  }

  function selectAllText(el) {
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (rangeError) { }
  }

  function textEditKeydown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelTextEditLive(); }
    else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); commitTextEditLive(); }
    else event.stopPropagation();
  }

  function textEditBlur() {
    // A blur means focus left the caption (clicked away, tabbed out) — treat it as commit.
    commitTextEditLive();
  }

  function textEditInput() {
    // Stage live as the user types so "Send" lights up the moment the copy differs —
    // no hidden Enter/blur commit gesture required.
    if (!textEditingElement) return;
    refreshTextEditDraft(textEditingElement);
    renderPanel();
  }

  function teardownTextEditing(el) {
    if (!el) return;
    el.removeEventListener("keydown", textEditKeydown, true);
    el.removeEventListener("input", textEditInput, true);
    el.removeEventListener("blur", textEditBlur, true);
    if (el.__ravenPrevContentEditable == null) el.removeAttribute("contenteditable");
    else el.setAttribute("contenteditable", el.__ravenPrevContentEditable);
    el.removeAttribute("data-raven-text-editing");
    delete el.__ravenPrevContentEditable;
    delete el.__ravenTextOriginal;
    if (textEditingElement === el) textEditingElement = null;
  }

  function beginTextEdit(el) {
    if (!isTextEditableElement(el)) return false;
    if (textEditingElement && textEditingElement !== el) commitTextEditLive();
    if (selectedElement !== el) selectTarget(el, false, "canvas");
    textEditingElement = el;
    // Re-editing an already-staged caption resumes from the ORIGINAL copy so the tray keeps
    // one before→after, not a chain of intermediate edits.
    var original = (textEdit && textEdit.target === el) ? textEdit.oldText : (el.innerText || el.textContent || "");
    el.__ravenTextOriginal = original;
    el.__ravenPrevContentEditable = el.getAttribute("contenteditable");
    el.setAttribute("contenteditable", "true");
    el.spellcheck = true;
    el.setAttribute("data-raven-text-editing", "true");
    el.addEventListener("keydown", textEditKeydown, true);
    el.addEventListener("input", textEditInput, true);
    el.addEventListener("blur", textEditBlur, true);
    if (typeof el.focus === "function") el.focus();
    selectAllText(el);
    setHighlight(el);
    return true;
  }

  // Reconcile the staged text edit against the element's current copy. Reads the ORIGINAL
  // from __ravenTextOriginal (still present — call BEFORE teardown deletes it). Shared by the
  // live input handler and commit so the tray/Send state stays identical on both paths.
  function refreshTextEditDraft(el) {
    if (!el || selectedElement !== el) return;
    var oldText = el.__ravenTextOriginal != null ? el.__ravenTextOriginal : (el.innerText || el.textContent || "");
    var newText = el.innerText || el.textContent || "";
    if (newText.trim() === oldText.trim()) {
      // No real change (or user typed the original back) — drop any staged edit for this element.
      textEdit = null;
      syncActiveStyleDraftKey();
    } else {
      textEdit = { target: el, selector: currentSelection ? currentSelection.selector : stableSelector(el), oldText: oldText, newText: newText };
      ensureActiveStyleDraftKey();
    }
  }

  function commitTextEditLive() {
    var el = textEditingElement;
    if (!el) return;
    refreshTextEditDraft(el);
    teardownTextEditing(el);
    renderPanel();
  }

  function cancelTextEditLive() {
    var el = textEditingElement;
    if (!el) return;
    var oldText = el.__ravenTextOriginal;
    teardownTextEditing(el);
    if (oldText != null && el.isConnected !== false) el.textContent = oldText;
    // Escape abandons the in-progress typing but keeps any previously-staged edit intact.
    renderPanel();
  }

  // Real trackpad/wheel scrolls are hit-tested on the compositor thread, and the
  // full-viewport pointer-events:none host (plus backdrop-filter/mask layerization on
  // the panels) makes that fast path miss the panel's scroller — the gesture latches
  // the page's root scroller instead, so panels never scroll under hardware wheel.
  // A blocking (non-passive) document-level wheel listener forces every wheel to the
  // main thread, where hit-testing is correct, and we drive the panel scroller there.
  document.addEventListener("wheel", function (event) {
    var path = event.composedPath ? event.composedPath() : [];
    var panel = null;
    var scroller = null;
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || !el.classList) continue;
      if (!scroller && el.scrollHeight > el.clientHeight && (el.tagName === "TEXTAREA" || el.classList.contains("raven-grab-body"))) scroller = el;
      if (el.classList.contains("raven-grab-panel")) { panel = el; break; }
    }
    if (!panel) return; // not over the overlay: native scroll untouched
    if (scroller && scroller.tagName === "TEXTAREA") return; // let an overflowing composer scroll natively
    if (scroller) scroller.scrollTop += (event.deltaMode === 1 ? 16 : 1) * event.deltaY;
    event.preventDefault(); // never let the page scroll under a panel
  }, { passive: false, capture: true });

  document.addEventListener("mousemove", function (event) {
    if (textEditingElement) return;
    if (!armed || bothCollapsed()) return;
    var path = event.composedPath ? event.composedPath() : [];
    if (path.indexOf(host) !== -1) {
      setLayerRowHover(null);
      return;
    }
    var target = composedTarget(event);
    if (inIgnoredRegion(target)) {
      setLayerRowHover(null);
      return;
    }
    setLayerRowHover(target);
    if (selectedElement) return;
    if (target && target !== hoveredElement) {
      hoveredElement = target;
      setHighlight(target);
    }
  }, true);

  document.addEventListener("click", function (event) {
    // While a caption is being edited, let clicks reach it (caret placement, text
    // selection). Clicking a DIFFERENT element blurs the caption first (blur commits),
    // clearing textEditingElement before this fires, so re-selection still works.
    if (textEditingElement) return;
    if (!armed || bothCollapsed()) return;
    var path = event.composedPath ? event.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    var target = composedTarget(event);
    if (!target || inIgnoredRegion(target)) return;
    if (event.altKey && target.parentElement) target = target.parentElement;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectTarget(target, event.shiftKey === true);
  }, true);

  // Double-click a text element to edit its copy inline — the standard "edit text"
  // gesture. Falls through silently on non-text elements (containers, media, controls).
  document.addEventListener("dblclick", function (event) {
    if (!armed || bothCollapsed()) return;
    var path = event.composedPath ? event.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    var target = composedTarget(event);
    if (!target || inIgnoredRegion(target)) return;
    if (!isTextEditableElement(target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    beginTextEdit(target);
  }, true);

  document.addEventListener("keydown", function (event) {
    var keyPath = event.composedPath ? event.composedPath() : [];
    var keyTarget = keyPath.length ? keyPath[0] : event.target;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key === "k" || event.key === "K" || event.code === "KeyK")) {
      if (event.repeat) return;
      // The host page owns this chord unless focus is already inside Raven. Linear,
      // Slack, Notion and most command palettes bind Cmd+K; this overlay ships onto
      // strangers' dev servers, and taking their shortcut out from under them is the
      // fastest route to a top-voted bug. The footer bar opens the modal by click for
      // everyone, so nothing is unreachable without the chord.
      var insideRaven = (settingsModal.contains && settingsModal.contains(keyTarget)) ||
        (host.contains && host.contains(keyTarget)) ||
        (shadow.contains && shadow.contains(keyTarget));
      if (!insideRaven) return;
      if (isTypingTarget(keyTarget) && !(settingsModal.contains && settingsModal.contains(keyTarget))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSettingsModal(null);
      return;
    }
    if (settingsModalOpen && (event.key === "Escape" || event.code === "Escape")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSettingsModal();
      return;
    }
    if (settingsModalOpen && event.key === "Tab") {
      var focusable = settingsFocusables();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      var active = shadow.activeElement;
      var activeIndex = -1;
      for (var focusIndex = 0; focusIndex < focusable.length; focusIndex++) {
        if (focusable[focusIndex] === active) activeIndex = focusIndex;
      }
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === focusable.length - 1)) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }
    if (event.altKey && (event.key === "g" || event.key === "G" || event.code === "KeyG")) setArmed(!armed);
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key === "." || event.code === "Period")) {
      if (!armed || event.repeat) return;
      if (keyTarget && keyTarget.nodeType === 1) {
        var keyTag = keyTarget.tagName;
        if (keyTag === "INPUT" || keyTag === "TEXTAREA" || keyTag === "SELECT" || keyTarget.isContentEditable) return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      togglePanels();
    }
  }, true);

  function updateMobileSheetViewport() {
    var nextMobile = window.innerWidth <= 760;
    var changed = nextMobile !== mobileSheetViewport;
    mobileSheetViewport = nextMobile;
    host.setAttribute("data-mobile-sheet", mobileSheetViewport ? "true" : "false");
    if (mobileSheetMode()) {
      // Desktop drag coordinates are retained on __ravenPosition and restored by
      // clampPanelToViewport after exit; inline left/right would outrank the sheet dock.
      for (var panelIndex = 0; panelIndex < panels.length; panelIndex++) {
        panels[panelIndex].style.removeProperty("left");
        panels[panelIndex].style.removeProperty("right");
      }
      if (mobileSheetSnap !== "collapsed") panel.style.setProperty("--raven-grab-sheet-height", mobileSheetHeight(mobileSheetSnap) + "px");
    } else {
      panel.style.removeProperty("--raven-grab-sheet-height");
      panel.style.removeProperty("top");
      panel.style.removeProperty("bottom");
      panel.removeAttribute("data-sheet-dragging");
      mobileSheetDrag = null;
      mobileSheetSnap = "half";
      if (activeTabB === "styles" || activeTabB === "instructions") activeTabB = "layers";
      activeGlobalActionSurface = "design";
    }
    syncMobileSheetEdgeTabs();
    if (changed) renderPanel();
  }

  window.addEventListener("resize", function () {
    hidePanelPresetTooltip();
    updateMobileSheetViewport();
    clampPanelToViewport();
    if (selectedElement && !bothCollapsed()) setHighlight(selectedElement);
    paintSelectionOverlays();
  });
  window.addEventListener("scroll", function () {
    hidePanelPresetTooltip();
    if (selectedElement && !bothCollapsed()) setHighlight(selectedElement);
    paintSelectionOverlays();
  }, true);
  window.addEventListener("blur", hidePanelPresetTooltip);
  // Synchronous final flush: pagehide fires on real navigation/tab close where
  // the debounced persist may not have run yet, so un-sent changes survive.
  window.addEventListener("pagehide", persistPendingNow);

  // Always listen — react-grab may load after this script.
  var captureReactMetadata = function (event) {
    reactMetadata = normalizedReactMetadata(event.detail);
    if (selectedElement && currentSelection) {
      currentSelection.componentScope = componentScopeFor(selectedElement, reactMetadata);
      if (currentSelection.componentScope.matchCount < 2) editScope = "instance";
      // Scope may have fallen back to instance — refresh overlays so a stale
      // component-scope badge/highlight set does not linger on a single remaining match.
      paintSelectionOverlays();
      renderPanel();
    }
  };
  window.addEventListener("react-grab:element-selected", captureReactMetadata);
  document.addEventListener("react-grab:element-selected", captureReactMetadata);

  // Restore un-sent changes from a prior page load before the first render so
  // they show in the tray immediately (see the persistence block).
  carriedPending = readCarriedPending();

  renderPanel();

  if (grabConfig) {
    bridgeTokens = normalizeTokens(grabConfig.tokens || {});
    bridgeTokensReady = true;
  } else {
    fetch(bridgeUrl("/tokens"))
      .then(function (response) {
        if (!response.ok) throw new Error("Bridge returned " + response.status);
        return response.json();
      })
      .then(function (tokens) {
        bridgeTokens = normalizeTokens(tokens);
        bridgeTokensReady = true;
        renderPanel();
      })
      .catch(function (error) {
        bridgeTokens = [];
        bridgeTokensReady = true;
        renderPanel();
        console.info("[Raven Grab] Tokens unavailable; selections will include computed styles only.", error);
      });
  }
})();
