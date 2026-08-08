import { test, afterEach } from 'node:test';

// Overlays created via loadOverlayInternals may leave a re-arming poll timer
// (layerOperationPollTimer / batchPollTimer) or the dispatch done-timer pending
// on the REAL clock in tests that hold an operation mid-flight. Those keep the
// Node event loop alive and hang `node --test` after all tests report. Track
// every instance and clear its overlay timers after each test so the loop drains.
const __overlayInstances = [];
afterEach(() => {
  while (__overlayInstances.length) {
    const inst = __overlayInstances.pop();
    try { if (inst && typeof inst.clearOverlayTimers === 'function') inst.clearOverlayTimers(); } catch { /* best-effort teardown */ }
  }
});
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
import vm from 'node:vm';

const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
const sandboxNoNetwork = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_ASSET_PATH = path.join(tmpdir(), 'missing-raven-grab.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.resolve(__dirname, '../dist/index.js');
// Read from package.json rather than hardcoding. The version these assertions check
// is whatever the build stamps in, so a hardcoded literal turns every release bump
// into a CI failure in a test that has nothing to do with releases.
const { version: pkgVersion } = JSON.parse(
  await readFile(path.resolve(__dirname, '../package.json'), 'utf8')
);
const pkgVersionRe = pkgVersion.replace(/\./g, '\\.');

let indexMod;
let grabBridgeMod;
try {
  indexMod = await import(distIndex);
  grabBridgeMod = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));
} catch (err) {
  const msg = `dist/index.js not found - run \`npm run build\` first. (${err.message})`;
  test('grab bridge module available', (t) => { t.skip(msg); });
  process.exit(0);
} finally {
  if (previousNoUsageLog === undefined) {
    delete process.env.RAVEN_NO_USAGE_LOG;
  } else {
    process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  }
}

async function withClient(server, fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'grab-bridge-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

async function withUpstream(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function makeDesignFixture(projectName) {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-proxy-'));
  const designPath = path.join(dir, 'DESIGN.md');
  const nameLine = projectName ? 'name: "' + projectName + '"\n' : '';
  await writeFile(designPath, `---\n${nameLine}colors:\n  primary: "#111111"\n---\n# Proxy fixture\n`, 'utf8');
  return designPath;
}

function sessionKey(session) {
  const match = session.script_tag.match(/[?&]key=([a-f0-9]+)/);
  assert.ok(match, 'session script tag should contain its capability key');
  return match[1];
}

function fakeStyle(declarations = {}, priorities = {}) {
  const properties = Object.keys(declarations);
  const style = {
    cssText: properties.map((property) => `${property}: ${declarations[property]};`).join(' '),
    length: properties.length,
    getPropertyValue(property) { return declarations[property] || ''; },
    getPropertyPriority(property) { return priorities[property] || ''; },
    setProperty(property, value, priority = '') {
      declarations[property] = value;
      priorities[property] = priority;
    },
    removeProperty(property) {
      delete declarations[property];
      delete priorities[property];
    }
  };
  properties.forEach((property, index) => { style[index] = property; });
  return style;
}

async function loadOverlayInternals(options = {}) {
  const overlayPath = options.overlayPath || process.env.RAVEN_GRAB_TEST_OVERLAY || path.resolve(__dirname, '../browser/raven-grab.js');
  const source = await readFile(overlayPath, 'utf8');
  const marker = '  if (grabConfig) {';
  const instrumented = source.replace(marker, `
  var ravenGrabRenderPanelCallCount = 0;
  var ravenGrabOriginalRenderPanel = renderPanel;
  renderPanel = function () {
    ravenGrabRenderPanelCallCount += 1;
    return ravenGrabOriginalRenderPanel();
  };
  globalThis.__ravenGrabTest = {
    bridgeUrl: bridgeUrl,
    tokenMapFor: tokenMapFor,
    interactiveStylesFor: interactiveStylesFor,
    selectionFor: selectionFor,
    componentScopeFor: typeof componentScopeFor === "function" ? componentScopeFor : undefined,
    isUtilityClassName: typeof isUtilityClassName === "function" ? isUtilityClassName : undefined,
    selectionDisplayLabel: typeof selectionDisplayLabel === "function" ? selectionDisplayLabel : undefined,
    shouldSkipLayerElement: typeof shouldSkipLayerElement === "function" ? shouldSkipLayerElement : undefined,
    buildLayerTree: typeof buildLayerTree === "function" ? buildLayerTree : undefined,
    layerMeasurable: typeof layerMeasurable === "function" ? layerMeasurable : undefined,
    shortenedLayerText: typeof shortenedLayerText === "function" ? shortenedLayerText : undefined,
    parseNumericExpression: typeof parseNumericExpression === "function" ? parseNumericExpression : undefined,
    alternativesFor: alternativesFor,
    tokenIntentFor: tokenIntentFor,
    computedStylesFor: computedStylesFor,
    beginStyleEdit: beginStyleEdit,
    beginStyleScrub: beginStyleScrub,
    beginRadiusEdit: beginRadiusEdit,
    beginTextDecorationEdit: typeof beginTextDecorationEdit === "function" ? beginTextDecorationEdit : undefined,
    beginBoxShadowEdit: typeof beginBoxShadowEdit === "function" ? beginBoxShadowEdit : undefined,
    beginOverflowEdit: typeof beginOverflowEdit === "function" ? beginOverflowEdit : undefined,
    beginSizeEdit: typeof beginSizeEdit === "function" ? beginSizeEdit : undefined,
    classifyStyleControl: typeof classifyStyleControl === "function" ? classifyStyleControl : undefined,
    parseEasingValue: typeof parseEasingValue === "function" ? parseEasingValue : undefined,
    timingFunctionCount: typeof timingFunctionCount === "function" ? timingFunctionCount : undefined,
    formatCubicBezier: typeof formatCubicBezier === "function" ? formatCubicBezier : undefined,
    unitOptionsForProperty: typeof unitOptionsForProperty === "function" ? unitOptionsForProperty : undefined,
    EASING_KEYWORDS: typeof EASING_KEYWORDS !== "undefined" ? EASING_KEYWORDS : undefined,
    enumOptionsForProperty: typeof enumOptionsForProperty === "function" ? enumOptionsForProperty : undefined,
    fontFamilyOptions: typeof fontFamilyOptions === "function" ? fontFamilyOptions : undefined,
    fontFamilyOptionLabel: typeof fontFamilyOptionLabel === "function" ? fontFamilyOptionLabel : undefined,
    composeTextDecoration: typeof composeTextDecoration === "function" ? composeTextDecoration : undefined,
    composeBoxShadow: typeof composeBoxShadow === "function" ? composeBoxShadow : undefined,
    composeOverflow: typeof composeOverflow === "function" ? composeOverflow : undefined,
    parseTextDecorationModel: typeof parseTextDecorationModel === "function" ? parseTextDecorationModel : undefined,
    parseBoxShadowModel: typeof parseBoxShadowModel === "function" ? parseBoxShadowModel : undefined,
    parseOverflowModel: typeof parseOverflowModel === "function" ? parseOverflowModel : undefined,
    sizeModeForValue: typeof sizeModeForValue === "function" ? sizeModeForValue : undefined,
    sizeValueForMode: typeof sizeValueForMode === "function" ? sizeValueForMode : undefined,
    resolvedStyleValue: typeof resolvedStyleValue === "function" ? resolvedStyleValue : undefined,
    styleApplicationTargets: typeof styleApplicationTargets === "function" ? styleApplicationTargets : undefined,
    MIXED_STYLE_VALUE: typeof MIXED_STYLE_VALUE !== "undefined" ? MIXED_STYLE_VALUE : undefined,
    STYLE_PROPERTIES: typeof STYLE_PROPERTIES !== "undefined" ? STYLE_PROPERTIES : undefined,
    STYLE_CATEGORIES: typeof STYLE_CATEGORIES !== "undefined" ? STYLE_CATEGORIES : undefined,
    STYLE_ENUM_OPTIONS: typeof STYLE_ENUM_OPTIONS !== "undefined" ? STYLE_ENUM_OPTIONS : undefined,
    parseBorderRadius: parseBorderRadius,
    composeBorderRadius: composeBorderRadius,
    normalizeColorEntry: normalizeColorEntry,
    commitStyleEdit: commitStyleEdit,
    restoreStyleEdit: typeof restoreStyleEdit === "function" ? restoreStyleEdit : undefined,
    previewStyleEdit: typeof previewStyleEdit === "function" ? previewStyleEdit : undefined,
    cancelStyleEdit: cancelStyleEdit,
    dismiss: dismiss,
    payloadForSend: payloadForSend,
    selectTarget: typeof selectTarget === "function" ? selectTarget : undefined,
    orderedSelection: typeof orderedSelection === "function" ? orderedSelection : undefined,
    getMultiSelectionCount: function () { return typeof multiSelections === "undefined" ? 0 : multiSelections.length; },
    getSelectionModel: function () {
      return {
        order: typeof multiSelections === "undefined" ? [] : multiSelections.slice(),
        primary: typeof selectedElement === "undefined" ? null : selectedElement,
        anchor: typeof selectionAnchor === "undefined" ? null : selectionAnchor,
        origin: typeof selectionOrigin === "undefined" ? "" : selectionOrigin
      };
    },
    styleEditsForSend: styleEditsForSend,
    rowsForStyleDraft: typeof rowsForStyleDraft === "function" ? rowsForStyleDraft : undefined,
    getActiveStyleDraftKey: function () { return typeof activeStyleDraftKey === "undefined" ? null : activeStyleDraftKey; },
    matchedTokenEntryForProperty: typeof matchedTokenEntryForProperty === "function" ? matchedTokenEntryForProperty : undefined,
    tokenPropertyMatches: typeof tokenPropertyMatches === "function" ? tokenPropertyMatches : undefined,
    resolveTokenByIntentKey: typeof resolveTokenByIntentKey === "function" ? resolveTokenByIntentKey : undefined,
    detachTokenBinding: typeof detachTokenBinding === "function" ? detachTokenBinding : undefined,
    stateStyleEditsForSend: typeof stateStyleEditsForSend === "function" ? stateStyleEditsForSend : undefined,
    getStateStyleEdits: function () { return typeof stateStyleEdits === "undefined" ? {} : stateStyleEdits; },
    renderPanel: renderPanel,
    setArmed: typeof setArmed === "function" ? setArmed : undefined,
    collapsePanel: typeof collapsePanel === "function" ? collapsePanel : undefined,
    togglePanels: typeof togglePanels === "function" ? togglePanels : undefined,
    copyElementSelector: typeof copyElementSelector === "function" ? copyElementSelector : undefined,
    switchTab: typeof switchTab === "function" ? switchTab : undefined,
    toggleSection: typeof toggleSection === "function" ? toggleSection : undefined,
    updateIntent: updateIntent,
    layerRowsMarkup: typeof layerRowsMarkup === "function" ? layerRowsMarkup : undefined,
    templateLayerRowMarkup: typeof templateLayerRowMarkup === "function" ? templateLayerRowMarkup : undefined,
    saveTemplate: typeof saveTemplate === "function" ? saveTemplate : undefined,
    persistComponentArtifact: typeof persistComponentArtifact === "function" ? persistComponentArtifact : undefined,
    buildComponentSubtree: typeof buildComponentSubtree === "function" ? buildComponentSubtree : undefined,
    componentArtifactFromSelection: typeof componentArtifactFromSelection === "function" ? componentArtifactFromSelection : undefined,
    setComponentName: function (name) { componentName = name || ""; },
    getComponentName: function () { return componentName; },
    wireframeMarkup: typeof wireframeMarkup === "function" ? wireframeMarkup : undefined,
    reorderLayer: typeof reorderLayer === "function" ? reorderLayer : undefined,
    reparentLayer: typeof reparentLayer === "function" ? reparentLayer : undefined,
    resolveLayerReparentDrop: typeof resolveLayerReparentDrop === "function" ? resolveLayerReparentDrop : undefined,
    validLayerDraft: typeof validLayerDraft === "function" ? validLayerDraft : undefined,
    liveLayerDraftParentsMatch: typeof liveLayerDraftParentsMatch === "function" ? liveLayerDraftParentsMatch : undefined,
    sendLayerIntent: typeof sendLayerIntent === "function" ? sendLayerIntent : undefined,
    pollLayerOperation: typeof pollLayerOperation === "function" ? pollLayerOperation : undefined,
    handleLayerOperationResult: typeof handleLayerOperationResult === "function" ? handleLayerOperationResult : undefined,
    reconcileAppliedLayerOperation: typeof reconcileAppliedLayerOperation === "function" ? reconcileAppliedLayerOperation : undefined,
    refreshAppliedLayerTree: typeof refreshAppliedLayerTree === "function" ? refreshAppliedLayerTree : undefined,
    domSnapshotHash: typeof domSnapshotHash === "function" ? domSnapshotHash : undefined,
    getPendingLayerOrder: function () {
      // new one-button model: active local draft (state 'draft') first, then the first active SENT order (in pendingLayerOrders).
      if (typeof activeLayerOrderDraft === "function") { var d = activeLayerOrderDraft(); if (d) return d; }
      if (typeof activeLayerOrders === "function") { var a = activeLayerOrders()[0]; if (a) return a; }
      if (typeof allLayerOrders === "function") return allLayerOrders()[0] || null;
      return null;
    },
    getLayerOrderDraft: function () { return typeof activeLayerOrderDraft === "function" ? activeLayerOrderDraft() : null; },
    sendActiveLayerIntent: function () { return typeof sendLayerIntent === "function" && typeof activeLayerOrderDraft === "function" ? sendLayerIntent(activeLayerOrderDraft()) : null; },
    dispatchPendingBatch: typeof dispatchPendingBatch === "function" ? dispatchPendingBatch : undefined,
    hasDispatchableDrafts: typeof hasDispatchableDrafts === "function" ? hasDispatchableDrafts : undefined,
    hasInvalidDrafts: typeof hasInvalidDrafts === "function" ? hasInvalidDrafts : undefined,
    batchUiState: typeof batchUiState === "function" ? batchUiState : undefined,
    getDispatchState: function () { return typeof dispatchState === "undefined" ? undefined : dispatchState; },
    getActiveDispatch: function () { return typeof activeDispatch === "undefined" ? null : activeDispatch; },
    localStyleDrafts: function () { return typeof localStyleDrafts === "function" ? localStyleDrafts() : []; },
    activeStyleDraftKey: function () { return typeof activeStyleDraftKey === "undefined" ? null : activeStyleDraftKey; },
    removeChange: typeof removeChange === "function" ? removeChange : undefined,
    freezePendingDispatch: typeof freezePendingDispatch === "function" ? freezePendingDispatch : undefined,
    strokeModelForSelection: typeof strokeModelForSelection === "function" ? strokeModelForSelection : undefined,
    beginStrokeEdit: typeof beginStrokeEdit === "function" ? beginStrokeEdit : undefined,
    commitStrokeEdit: typeof commitStrokeEdit === "function" ? commitStrokeEdit : undefined,
    snapshotStrokeEditState: typeof snapshotStrokeEditState === "function" ? snapshotStrokeEditState : undefined,
    restoreStrokeEditState: typeof restoreStrokeEditState === "function" ? restoreStrokeEditState : undefined,
    getStyleEdits: function () { return typeof styleEdits === "undefined" ? {} : styleEdits; },
    clearOverlayTimers: function () {
      if (typeof layerOperationPollTimer !== "undefined" && layerOperationPollTimer !== null) { clearTimeout(layerOperationPollTimer); layerOperationPollTimer = null; }
      if (typeof batchPollTimer !== "undefined" && batchPollTimer !== null) { clearTimeout(batchPollTimer); batchPollTimer = null; }
      if (typeof dispatchDoneTimer !== "undefined" && dispatchDoneTimer !== null) { clearTimeout(dispatchDoneTimer); dispatchDoneTimer = null; }
      if (typeof layerOperationPollStopped !== "undefined") layerOperationPollStopped = true;
      if (typeof pollingBatchIds !== "undefined" && pollingBatchIds && pollingBatchIds.length) pollingBatchIds.length = 0;
    },
    getActiveLayerOrders: function () {
      if (typeof activeLayerOrders === "function") return activeLayerOrders();
      return typeof pendingLayerOrder !== "undefined" && pendingLayerOrder ? [pendingLayerOrder] : [];
    },
    getPendingLayerOrderKeys: function () { return typeof pendingLayerOrders === "undefined" ? [] : Object.keys(pendingLayerOrders); },
    pendingLayerOrderForId: function (id) {
      if (typeof pendingLayerOrderForId === "function") return pendingLayerOrderForId(id);
      return typeof pendingLayerOrder !== "undefined" && pendingLayerOrder && pendingLayerOrder.operationId === id ? pendingLayerOrder : null;
    },
    pendingLayerOrderForParent: function (parentSelector) {
      if (typeof pendingLayerOrderForParent === "function") return pendingLayerOrderForParent(parentSelector);
      return typeof pendingLayerOrder !== "undefined" && pendingLayerOrder && pendingLayerOrder.parentSelector === parentSelector ? pendingLayerOrder : null;
    },
    getChangeTrayItems: function () { return typeof changeTrayItems === "function" ? changeTrayItems() : []; },
    applyQueuedChanges: typeof applyQueuedChanges === "function" ? applyQueuedChanges : undefined,
    retryChange: typeof retryChange === "function" ? retryChange : undefined,
    hasApplyingLayerOrders: typeof hasApplyingLayerOrders === "function" ? hasApplyingLayerOrders : undefined,
    isLayerOperationPollActive: function () { return typeof layerOperationPollTimer !== "undefined" && layerOperationPollTimer !== null; },
    setActiveTabB: function (tab) { activeTabB = tab; },
    getBatchCommitted: function () { return typeof batchCommitted === "undefined" ? false : batchCommitted; },
    getLayerNotice: function () { return typeof layerNotice === "undefined" ? undefined : layerNotice; },
    getLayerDrag: function () { return typeof layerDrag === "undefined" ? undefined : layerDrag; },
    isLayerCollapsed: typeof layerIsCollapsed === "function" ? layerIsCollapsed : undefined,
    visibleLayerNodes: typeof visibleLayerNodes === "function" ? visibleLayerNodes : undefined,
    toggleLayerNode: typeof toggleLayerNode === "function" ? toggleLayerNode : undefined,
    selectPanelLayerRow: typeof selectPanelLayerRow === "function" ? selectPanelLayerRow : undefined,
    handleLayerTreeKey: typeof handleLayerTreeKey === "function" ? handleLayerTreeKey : undefined,
    setLayerRowHover: typeof setLayerRowHover === "function" ? setLayerRowHover : undefined,
    getHoveredLayerElement: function () { return typeof hoveredLayerElement === "undefined" ? undefined : hoveredLayerElement; },
    autoScrollLayerPanel: typeof autoScrollLayerPanel === "function" ? autoScrollLayerPanel : undefined,
    scheduleLayerDragExpand: typeof scheduleLayerDragExpand === "function" ? scheduleLayerDragExpand : undefined,
    expandLayerDuringDrag: typeof expandLayerDuringDrag === "function" ? expandLayerDuringDrag : undefined,
    endLayerDrag: typeof endLayerDrag === "function" ? endLayerDrag : undefined,
    getRenderPanelCallCount: function () { return ravenGrabRenderPanelCallCount; },
    getAppliedLayerTree: function () { return typeof appliedLayerTree === "undefined" ? undefined : appliedLayerTree; },
    getComponentRequest: function () {
      return {
        issueType: componentRequest.issueType,
        issueSize: componentRequest.issueSize,
        useCase: componentRequest.useCase,
        email: componentRequest.email
      };
    },
    getComponentRequestId: function () { return componentRequestId; },
    setComponentRequestInFlight: function (value) { componentRequestInFlight = !!value; },
    setComponentRequestStep: function (step) { componentRequestStep = step; },
    setComponentRequestEmail: function (value) { componentRequest.email = value || ""; },
    expandPanel: typeof expandPanel === "function" ? expandPanel : undefined,
    collapsePanel: typeof collapsePanel === "function" ? collapsePanel : undefined,
    setPanelCollapsedTestState: function (side, next) {
      setPanelCollapsed(side === "left" ? panelLeft : panel, next);
    },
    getLeftPanelAttribute: function (name) { return panelLeft.getAttribute(name); },
    hasActiveStyleEditor: function () { return activeStyleEditorFlush !== null; },
    setLayerElementsTestState: function (elements) { layerElements = new Map(elements); },
    getLayerElement: function (id) { return layerElements.get(id); },
    setLayerNoticeTestState: function (notice) { layerNotice = notice; },
    setLayerTestState: function (tree, elements, selected, preview, notice, fixedPending, loadPending) {
      layerTree = tree;
      appliedLayerTree = tree;
      layerElements = new Map(elements);
      selectedElement = selected || null;
      multiSelections = selected ? [selected] : [];
      if (typeof selectionAnchor !== "undefined") selectionAnchor = selected || null;
      if (typeof selectionOrigin !== "undefined") selectionOrigin = selected ? "canvas" : "";
      layerPreview = preview || null;
      var testDraft = preview ? {
        clientKey: "draft-test-1", clientSequence: 1,
        operationId: "", parentSelector: "body", fromSelector: "body > div", fromIndex: preview.fromIndex,
        toIndex: preview.toIndex, orderedSelectors: [], state: "draft", domSnapshotHash: domSnapshotHash(document.body), baselineOrder: [],
        parentElement: preview.parentElement, movedElement: preview.movedElement,
        baselineChildren: Array.prototype.slice.call(preview.parentElement.children || []), expectedChildren: preview.orderedElements.slice(),
        // The real reorderLayer() always stamps draft.preview = layerPreview (see
        // browser/raven-grab.js ~3324) -- validLayerDraft()/sendLayerIntent() both
        // read draft.preview.movedRole/.unavailable off of it. Mirror that shape
        // here so drafts built via this test harness gate exactly like real ones.
        preview: preview
      } : null;
      for (var draftKey in layerOrderDrafts) { delete layerOrderDrafts[draftKey]; }
      pendingLayerOrders = {};
      if (testDraft) {
        layerOrderDrafts[testDraft.clientKey] = testDraft;
        activeLayerOrderDraftKey = testDraft.clientKey;
      } else {
        activeLayerOrderDraftKey = null;
      }
      layerNotice = notice || "";
      pendingFixedMove = fixedPending || "";
      templateLoadPending = !!loadPending;
      activeTabB = "layers";
    },
    setTemplateTestState: function (tree, elements, slots, drafts, name, loadPending, selected) {
      layerTree = tree;
      appliedLayerTree = tree;
      layerElements = new Map(elements);
      templateSlots = slots || [];
      templateDrafts = drafts || [];
      templateName = name || "";
      templateLoadPending = !!loadPending;
      selectedElement = selected || null;
      multiSelections = selected ? [selected] : [];
      if (typeof selectionAnchor !== "undefined") selectionAnchor = selected || null;
      if (typeof selectionOrigin !== "undefined") selectionOrigin = selected ? "canvas" : "";
      activeTabB = "assets";
    },
    rollbackTokenPreviews: rollbackTokenPreviews,
    layerBlockRows: layerBlockRows,
    liveLayerChildrenMatch: typeof liveLayerChildrenMatch === "function" ? liveLayerChildrenMatch : undefined,
    sendComponentRequest: typeof sendComponentRequest === "function" ? sendComponentRequest : undefined,
    componentCtaEnabled: typeof componentCtaEnabled === "function" ? componentCtaEnabled : undefined,
    sendSelection: sendSelection,
    getPanelHtml: function () { return panel.innerHTML; },
    getGlobalActionsHtml: function () { return typeof globalActions === "undefined" ? "" : globalActions.innerHTML; },
    getStructureActionsHtml: function () { return typeof structureActions === "undefined" ? "" : structureActions.innerHTML; },
    setPanelHtml: function (value) { panel.innerHTML = value; },
    getPanelAttribute: function (name) { return panel.getAttribute(name); },
    getPanelLeftHtml: function () { return panelLeft.innerHTML; },
    getPanelLeftAttribute: function (name) { return panelLeft.getAttribute(name); },
    setPanelLeftQuery: function (selector, value) { panelLeft.setQuery(selector, value); },
    setPanelQueryAll: function (selector, value) { panel.setQueryAll(selector, value); },
    setPanelLeftQueryAll: function (selector, value) { panelLeft.setQueryAll(selector, value); },
    dispatchPanelLeft: function (type, event) { panelLeft.dispatch(type, event); },
    getEdgeTabAttribute: function (name) { return typeof edgeTab === "undefined" ? null : edgeTab.getAttribute(name); },
    dispatchEdgeTab: function (type, event) { if (typeof edgeTab !== "undefined") edgeTab.dispatch(type, event); },
    getEdgeTabLeftAttribute: function (name) { return typeof edgeTabLeft === "undefined" ? null : edgeTabLeft.getAttribute(name); },
    dispatchEdgeTabLeft: function (type, event) { if (typeof edgeTabLeft !== "undefined") edgeTabLeft.dispatch(type, event); },
    getEdgeTabHtml: function () { return typeof edgeTab === "undefined" ? "" : edgeTab.innerHTML; },
    getEdgeTabLeftHtml: function () { return typeof edgeTabLeft === "undefined" ? "" : edgeTabLeft.innerHTML; },
    dispatchPanel: function (type, event) { panel.dispatch(type, event); },
    getPanelStyle: function (name) { return panel.style[name]; },
    getPanelCapturedPointer: function () { return panel.capturedPointer; },
    setPanelRect: function (rect) { panel.getBoundingClientRect = function () { return rect; }; },
    getBridgeTokens: function () { return bridgeTokens; },
    getEditScope: function () { return typeof editScope === "undefined" ? undefined : editScope; },
    getCurrentSelectionComponentScope: function () { return currentSelection && currentSelection.componentScope; },
    setEditScope: typeof setEditScope === "function" ? setEditScope : undefined,
    setPanelFontSize: typeof setPanelFontSize === "function" ? setPanelFontSize : undefined,
    getPanelFontSize: function () { return typeof panelFontScale === "undefined" ? undefined : panelFontScale; },
    getSettingsModalOpen: function () { return typeof settingsModalOpen === "undefined" ? undefined : settingsModalOpen; },
    getSettingsModalNode: function () { return typeof settingsModal === "undefined" ? undefined : settingsModal; },
    getSettingsModalSection: function () { return typeof settingsModalSection === "undefined" ? undefined : settingsModalSection; },
    getSettingsModalHtml: function () { return typeof settingsModal === "undefined" ? "" : settingsModal.innerHTML; },
    getSettingsModalHidden: function () { return typeof settingsModal === "undefined" ? undefined : settingsModal.hidden; },
    openSettingsModal: typeof openSettingsModal === "function" ? openSettingsModal : undefined,
    closeSettingsModal: typeof closeSettingsModal === "function" ? closeSettingsModal : undefined,
    feedbackPayload: typeof feedbackPayload === "function" ? feedbackPayload : undefined,
    submitFeedback: typeof submitFeedback === "function" ? submitFeedback : undefined,
    getSettingsChord: function () { return typeof SETTINGS_CHORD === "undefined" ? undefined : SETTINGS_CHORD; },
    renderMultiBadges: typeof renderMultiBadges === "function" ? renderMultiBadges : undefined,
    paintSelectionOverlays: typeof paintSelectionOverlays === "function" ? paintSelectionOverlays : undefined,
    visualBadgeElements: typeof visualBadgeElements === "function" ? visualBadgeElements : undefined,
    getMultiBadgeCount: function () { return typeof multiBadges === "undefined" ? 0 : multiBadges.length; },
    getMultiHighlightCount: function () { return typeof multiHighlights === "undefined" ? 0 : multiHighlights.length; },
    getMultiBadgeLabels: function () {
      return typeof multiBadges === "undefined" ? [] : multiBadges.map(function (badge) { return badge.textContent; });
    },
    setPanelQuery: function (selector, value) { panel.setQuery(selector, value); },
    setStyleContext: function (element, styles, tokens, selector, stateStyles, componentScope) {
      if (typeof clearAllStyleDrafts === "function") clearAllStyleDrafts(false);
      else {
        if (typeof styleDrafts !== "undefined") { for (var styleDraftKey in styleDrafts) delete styleDrafts[styleDraftKey]; }
        if (typeof activeStyleDraftKey !== "undefined") activeStyleDraftKey = null;
      }
      if (typeof styleDraftClientSequence !== "undefined") styleDraftClientSequence = 0;
      selectedElement = element;
      multiSelections = [element];
      if (typeof selectionAnchor !== "undefined") selectionAnchor = element;
      if (typeof selectionOrigin !== "undefined") selectionOrigin = "canvas";
      currentSelection = { selector: selector || "#target", html: "", rect: {}, styles: styles, tokens: tokens || [], stateStyles: stateStyles || {}, componentScope: componentScope };
      styleEdits = Object.create(null);
      stateStyleEdits = Object.create(null);
      styleEditOriginalInline = Object.create(null);
      styleEditTarget = null;
      tokenIntents = Object.create(null);
      previewOriginals = Object.create(null);
      activeStyleDraftKey = null;
      instructionDraft = "";
      if (typeof editScope !== "undefined") editScope = "instance";
    },
    setMultiStyleContext: function (elements, primaryStyles, selector, tokens) {
      if (typeof clearAllStyleDrafts === "function") clearAllStyleDrafts(false);
      selectedElement = elements[0] || null;
      multiSelections = (elements || []).slice();
      if (typeof selectionAnchor !== "undefined") selectionAnchor = elements[0] || null;
      if (typeof selectionOrigin !== "undefined") selectionOrigin = "canvas";
      currentSelection = {
        selector: selector || "#target",
        html: "",
        rect: {},
        styles: primaryStyles || {},
        tokens: tokens || [],
        stateStyles: {},
        componentScope: null
      };
      styleEdits = Object.create(null);
      stateStyleEdits = Object.create(null);
      styleEditOriginalInline = Object.create(null);
      styleEditTarget = null;
      tokenIntents = Object.create(null);
      previewOriginals = Object.create(null);
      activeStyleDraftKey = null;
      instructionDraft = "";
      if (typeof editScope !== "undefined") editScope = "instance";
    },
    setIntentRecords: function (tokens, styles) {
      tokenIntents = tokens || Object.create(null);
      styleEdits = styles || Object.create(null);
    },
    setTokenIntent: function (index, intent) { tokenIntents[index] = intent; },
    getTokenIntents: function () { return tokenIntents; },
    getInstructionDraft: function () { return instructionDraft; },
    setInstructionDraft: function (value) { instructionDraft = value; },
    setTokens: function (tokens) { bridgeTokens = normalizeTokens(tokens); bridgeTokensReady = true; }
  };
${marker}`);
  assert.notEqual(instrumented, source, 'overlay test hook insertion point must exist');

  function fakeElement() {
    const attributes = {};
    const listeners = {};
    const queries = {};
    const queryLists = {};
    return {
      nodeType: 1,
      isConnected: true,
      localName: 'div',
      classList: [],
      children: [],
      parentElement: null,
      outerHTML: '<div></div>',
      style: fakeStyle(),
      innerHTML: '',
      textContent: '',
      value: '',
      scrollTop: 0,
      disabled: false,
      capturedPointer: null,
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(attributes, name) ? attributes[name] : null; },
      removeAttribute(name) { delete attributes[name]; },
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        child.parentNode = this;
      },
      removeChild(child) {
        const at = this.children.indexOf(child);
        if (at === -1) return child;
        this.children.splice(at, 1);
        child.parentElement = null;
        child.parentNode = null;
        return child;
      },
      get firstChild() { return this.children[0] || null; },
      insertBefore(node, anchor) {
        const existing = this.children.indexOf(node);
        if (existing !== -1) this.children.splice(existing, 1);
        const at = anchor ? this.children.indexOf(anchor) : -1;
        if (at === -1) this.children.push(node);
        else this.children.splice(at, 0, node);
        node.parentElement = this;
        node.parentNode = this;
      },
      addEventListener(type, listener) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(listener);
      },
      dispatch(type, event) {
        event.currentTarget = this;
        for (const listener of listeners[type] || []) listener(event);
      },
      setPointerCapture(pointerId) { this.capturedPointer = pointerId; },
      hasPointerCapture(pointerId) { return this.capturedPointer === pointerId; },
      releasePointerCapture(pointerId) { if (this.capturedPointer === pointerId) this.capturedPointer = null; },
      focus() {},
      select() {},
      getBoundingClientRect() { return { x: 0, y: 0, top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }; },
      attachShadow() { return { appendChild() {} }; },
      querySelector(selector) { return queries[selector] || null; },
      querySelectorAll(selector) { return queryLists[selector] || []; },
      setQuery(selector, value) { queries[selector] = value; },
      setQueryAll(selector, value) { queryLists[selector] = value; },
      remove() { if (this.parentElement) this.parentElement = null; }
    };
  }

  const documentElement = fakeElement();
  documentElement.contains = () => true;
  const documentListeners = {};
  const document = {
    baseURI: 'http://example.test/',
    currentScript: { src: 'http://127.0.0.1:41234/raven-grab.js?key=test-key' },
    documentElement,
    body: documentElement,
    styleSheets: [],
    createElement: fakeElement,
    addEventListener(type, listener) {
      if (!documentListeners[type]) documentListeners[type] = [];
      documentListeners[type].push(listener);
    },
    dispatch(type, event) {
      for (const listener of documentListeners[type] || []) listener(event);
    },
    querySelectorAll(selector) { return options.querySelectorAll ? options.querySelectorAll(selector) : []; }
  };
  const windowListeners = {};
  const window = {
    RavenGrabConfig: options.config,
    ravenGrabConfig: options.lowercaseConfig,
    localStorage: options.localStorage,
    CSS: {
      escape: (value) => value,
      supports: (_property, value) => value !== 'definitely-invalid'
    },
    matchMedia: () => ({ matches: options.reducedMotion === true }),
    addEventListener(type, listener) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      if (!windowListeners[type]) return;
      windowListeners[type] = windowListeners[type].filter((candidate) => candidate !== listener);
    },
    dispatch(type, event) {
      for (const listener of (windowListeners[type] || []).slice()) listener(event);
    },
    innerWidth: 1440,
    innerHeight: 900
  };
  const context = {
    window,
    document,
    location: { protocol: 'http:', href: 'http://example.test/page' },
    URL,
    navigator: { clipboard: options.clipboard },
    console: { error() {}, warn() {}, info() {} },
    encodeURIComponent,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    innerHeight: 900,
    innerWidth: 1440,
    fetch: options.fetch || (async () => ({ ok: true, json: async () => ({ tokens: [] }) })),
    getComputedStyle(element) {
      return element.computedStyle || fakeStyle();
    }
  };
  vm.runInNewContext(instrumented, context, { filename: overlayPath });
  await Promise.resolve();
  await Promise.resolve();
  // The design-panel dock (data-send-batch) and left-rail Assets dock mount via
  // querySelector('.raven-grab-global-actions-host') on each panel. This fake DOM
  // never parses innerHTML into a real tree, so wire separate mounts so Send stays
  // on the right and Assets CTAs on the left — getGlobalActionsHtml /
  // getStructureActionsHtml then read the persistent dock nodes.
  const globalActionsMount = fakeElement();
  const structureActionsMount = fakeElement();
  context.__ravenGrabTest.setPanelQuery('.raven-grab-global-actions-host', globalActionsMount);
  context.__ravenGrabTest.setPanelLeftQuery('.raven-grab-global-actions-host', structureActionsMount);
  __overlayInstances.push(context.__ravenGrabTest);
  return { internals: context.__ravenGrabTest, document, window };
}

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = [];
  return {
    setTimeout(callback, delay) {
      const timer = { id: nextId, at: now + delay, callback };
      nextId += 1;
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find((entry) => entry.id === id);
      if (timer) timer.cancelled = true;
    },
    tick(duration) {
      const end = now + duration;
      while (true) {
        timers.sort((left, right) => left.at - right.at);
        const timer = timers[0];
        if (!timer || timer.at > end) break;
        timers.shift();
        if (timer.cancelled) continue;
        now = timer.at;
        timer.callback();
      }
      now = end;
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function panelRowTarget(row) {
  return {
    closest(selector) {
      if (selector.includes('[data-layer-id]') && row.getAttribute('data-layer-id') !== null) return row;
      if (selector.includes('[data-template-layer-id]') && row.getAttribute('data-template-layer-id') !== null) return row;
      return null;
    }
  };
}

function clickPanelRow(internals, window, row, downModifiers = {}, upModifiers = downModifiers) {
  const target = panelRowTarget(row);
  internals.dispatchPanelLeft('mousedown', {
    target,
    button: 0,
    clientX: 20,
    clientY: 20,
    metaKey: !!downModifiers.metaKey,
    ctrlKey: !!downModifiers.ctrlKey,
    shiftKey: !!downModifiers.shiftKey,
    preventDefault() {}
  });
  window.dispatch('mouseup', {
    type: 'mouseup',
    target,
    metaKey: !!upModifiers.metaKey,
    ctrlKey: !!upModifiers.ctrlKey,
    shiftKey: !!upModifiers.shiftKey
  });
}

function makeLayerDragFixture(internals, document, options = {}) {
  const parent = document.createElement('section');
  const elements = [document.createElement('header'), document.createElement('main'), document.createElement('footer')];
  parent.parentElement = document.body;
  parent.children = elements;
  elements.forEach((element) => { element.parentElement = parent; });
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] },
    { id: 4, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, elements[0]], [3, elements[1]], [4, elements[2]]], null);

  const rootChildren = [];
  const listChildren = [];
  const root = {
    appendChild(node) {
      rootChildren.push(node);
      node.parentElement = this;
      node.remove = () => {
        const index = rootChildren.indexOf(node);
        if (index !== -1) rootChildren.splice(index, 1);
      };
    }
  };
  // The overlay creates slot <li>s whose classList is a bare array (fakeElement default);
  // layerSiblingRow/layerBlockRows call classList.contains, so rebuild it from className.
  function patchClassList(node) {
    if (Array.isArray(node.classList)) {
      node.classList = { contains(name) { return String(node.className || '').split(/\s+/).includes(name); } };
    }
  }
  // Keep previous/next sibling links live after every mutation — the drag code walks both.
  function relink() {
    listChildren.forEach((child, index) => {
      child.previousElementSibling = listChildren[index - 1] || null;
      child.nextElementSibling = listChildren[index + 1] || null;
    });
  }
  function attachRemove(node) {
    node.remove = () => {
      const index = listChildren.indexOf(node);
      if (index !== -1) { listChildren.splice(index, 1); relink(); }
    };
  }
  const list = {
    children: listChildren,
    appendChild(node) {
      listChildren.push(node);
      node.parentElement = this;
      patchClassList(node);
      attachRemove(node);
      relink();
    },
    insertBefore(node, anchor) {
      const existing = listChildren.indexOf(node);
      if (existing !== -1) listChildren.splice(existing, 1);
      const at = anchor ? listChildren.indexOf(anchor) : -1;
      if (at === -1) listChildren.push(node); else listChildren.splice(at, 0, node);
      node.parentElement = this;
      patchClassList(node);
      attachRemove(node);
      relink();
    },
    getBoundingClientRect() { return { top: 0, bottom: 120, left: 0, width: 240, height: 120 }; }
  };
  const rows = tree.children.map((node, index) => {
    const row = document.createElement('li');
    row.classList = { contains(name) { return name === 'raven-grab-layer-row'; } };
    row.setAttribute('data-layer-id', String(node.id));
    row.setAttribute('data-layer-parent', '1');
    row.style.setProperty('--layer-depth', '1');
    row.parentElement = list;
    row.getRootNode = () => root;
    row.cloneNode = () => document.createElement('li');
    // Static geometry keeps existing tests deterministic; dynamicGeometry makes each row's rect
    // track its live DOM position so a real FLIP delta (and animateLayerSwap) is exercised.
    row.getBoundingClientRect = options.dynamicGeometry
      ? () => { const at = listChildren.indexOf(row); const i = at === -1 ? index : at; return { top: i * 40, bottom: (i + 1) * 40, left: 0, width: 240, height: 40 }; }
      : () => ({ top: index * 40, bottom: (index + 1) * 40, left: 0, width: 240, height: 40 });
    return row;
  });
  listChildren.push(...rows);
  relink();
  rows.forEach((row) => internals.setPanelLeftQuery(`[data-layer-id="${row.getAttribute('data-layer-id')}"]`, row));

  return {
    elements,
    rows,
    transientNodes() {
      return rootChildren.concat(listChildren).filter((node) =>
        /(?:^|\s)raven-grab-layer-(?:drag|slot)(?:\s|$)/.test(node.className || '')
      );
    }
  };
}

function makeNestedLayerFixture(internals, document) {
  const elements = {
    root: document.createElement('body'),
    section: document.createElement('section'),
    article: document.createElement('article'),
    span: document.createElement('span'),
    aside: document.createElement('aside'),
    footer: document.createElement('footer')
  };
  elements.root.parentElement = document.documentElement;
  elements.section.parentElement = elements.root;
  elements.article.parentElement = elements.section;
  elements.span.parentElement = elements.article;
  elements.aside.parentElement = elements.section;
  elements.footer.parentElement = elements.root;
  elements.root.children = [elements.section, elements.footer];
  elements.section.children = [elements.article, elements.aside];
  elements.article.children = [elements.span];
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
      { id: 3, parentId: 2, depth: 2, label: 'article', badges: [], children: [
        { id: 4, parentId: 3, depth: 3, label: 'span', badges: [], children: [] }
      ] },
      { id: 5, parentId: 2, depth: 2, label: 'aside', badges: [], children: [] }
    ] },
    { id: 6, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  const pairs = [
    [1, elements.root], [2, elements.section], [3, elements.article],
    [4, elements.span], [5, elements.aside], [6, elements.footer]
  ];
  internals.setLayerTestState(tree, pairs, null);
  return { tree, pairs, elements };
}

function enableLiveMovePreviewFixture(document, ...parents) {
  const cloneElement = (element) => {
    const clone = document.createElement(element.localName || 'div');
    clone.localName = element.localName;
    clone.tagName = element.tagName;
    clone.getBoundingClientRect = element.getBoundingClientRect;
    clone.appendChild = function (child) {
      const existing = this.children.indexOf(child);
      if (existing !== -1) this.children.splice(existing, 1);
      this.children.push(child);
      child.parentElement = this;
      child.parentNode = this;
    };
    clone.children = Array.from(element.children || [], cloneElement);
    clone.children.forEach((child) => { child.parentElement = clone; child.parentNode = clone; });
    return clone;
  };
  parents.forEach((parent) => {
    parent.querySelectorAll = () => [];
    parent.cloneNode = () => cloneElement(parent);
    Array.from(parent.children || []).forEach((child) => { child.cloneNode = () => cloneElement(child); });
    const insertBefore = parent.insertBefore;
    parent.insertBefore = function (node, anchor) {
      const previousParent = node.parentElement;
      if (previousParent && previousParent !== this) {
        const previousIndex = previousParent.children.indexOf(node);
        if (previousIndex !== -1) previousParent.children.splice(previousIndex, 1);
      }
      insertBefore.call(this, node, anchor);
    };
  });
}

test('tool gating keeps the anonymous remote surface at 45 and gates the local DESIGN.md/grab tools', async () => {
  const stdio = indexMod.buildServer({});
  const remote = indexMod.buildServer({ remote: true });

  const stdioNames = Object.keys(stdio._registeredTools).sort();
  const remoteNames = Object.keys(remote._registeredTools).sort();
  const newTools = [
    'read_design_md',
    'init_design_md',
    'update_design_md',
    'start_grab_session',
    'get_grabbed_elements',
    'stop_grab_session',
    'get_page_template',
    'set_template_slot',
    'list_templates',
    'get_grab_layers',
    'move_grab_layer',
    'get_grab_operation',
    'review_diff',
    'polish_diff'
  ];

  assert.equal(stdioNames.length, 110);
  for (const name of newTools) {
    assert.equal(stdioNames.includes(name), true, `${name} should be registered on stdio`);
    assert.equal(remoteNames.includes(name), false, `${name} should be gated off remote anonymous`);
  }
  assert.equal(remoteNames.length, 45, 'remote anonymous endpoint must stay at 45 tools');
});

test('template routes batch page-scoped slots, round-trip, and flag validation orphans', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const slots = [
      { slotId: 'hero', selector: '#hero', role: 'fixed' },
      { slotId: 'body', selector: 'main', role: 'flexible' }
    ];

    const savedResponse = await fetch(`${session.url}/template?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: '/pricing', templateId: 'marketing', slots })
    });
    assert.equal(savedResponse.status, 200);
    assert.deepEqual(await savedResponse.json(), { saved: true, count: 2 });
    const persisted = await readFile(designPath, 'utf8');
    assert.match(persisted, /templates:/);
    assert.match(persisted, /marketing:/);
    assert.match(persisted, /pricing:/);
    assert.match(persisted, /hero/);
    assert.match(persisted, /body/);

    const initial = await fetch(`${session.url}/template?page=%2Fpricing&key=${key}`);
    assert.equal(initial.status, 200);
    const initialTemplate = await initial.json();
    assert.equal(initialTemplate.templateId, 'marketing');
    assert.deepEqual(initialTemplate.slots, slots.map((slot) => ({ ...slot, validated: false })));
    assert.equal(initialTemplate.validation, null);

    const validation = { page: '/pricing', results: [
      { slotId: 'hero', selector: '#hero', resolved: true },
      { slotId: 'body', selector: 'main', resolved: false }
    ] };
    const validationResponse = await fetch(`${session.url}/template-validation?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validation)
    });
    assert.equal(validationResponse.status, 200);
    assert.deepEqual(await validationResponse.json(), { ok: true });

    const validated = await fetch(`${session.url}/template?page=%2Fpricing&key=${key}`);
    const validatedTemplate = await validated.json();
    assert.deepEqual(validatedTemplate.validation, validation.results);
    assert.equal(validatedTemplate.slots[0].orphaned, undefined);
    assert.equal(validatedTemplate.slots[1].orphaned, true);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('proxy mode withholds the authoring routes and forwards paths it does not own', async () => {
  // A proxied page runs same-origin with the overlay, so every route the key
  // unlocks is reachable by that page's own scripts. Two things follow, and this
  // test pins both: the authoring surface is not served on a third-party origin
  // even with the right key, and a path Raven would otherwise reserve goes
  // upstream when it arrives without the key — /tokens and /components are names
  // a real site may own, and answering 403 breaks the site being measured.
  //
  // The first half originally asserted 502 — "it reached the closed upstream, so
  // Raven did not answer it." That measured the right intent with the wrong
  // instrument, and the instrument hid a second defect: withholding was
  // implemented as "not a bridge route", which fell through to the FORWARDER, so
  // a keyed /layers POST went to the third-party origin carrying that site's
  // cookies and Raven's capability key. Refusing locally is the only correct
  // answer for Raven's own traffic, so these now expect 404 and a companion test
  // in grab-bridge-proxy-round2 asserts upstream received nothing at all.
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
      // A THIRD-PARTY origin: capture-only is a property of a non-loopback
      // upstream now, not of proxying (a loopback proxy keeps the authoring
      // surface — see grab-bridge-proxy-round5). `.invalid` is reserved to
      // never resolve (RFC 2606), so anything reaching the forwarder fails
      // fast into a 502 — which is exactly how "Raven did not answer this
      // itself" is observable.
      const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath, proxy_target: 'https://fixture.invalid' } });
      const session = JSON.parse(started.content[0].text);
      const key = sessionKey(session);
      const authoringRoutes = [
        ['GET', '/template?page=%2F'],
        ['POST', '/template'],
        ['POST', '/template-validation'],
        ['POST', '/layers'],
        ['POST', '/layers-intent'],
        ['GET', '/batch'],
        ['POST', '/batch-commit'],
        ['GET', '/agent/wait']
      ];
      for (const [method, route] of authoringRoutes) {
        const separator = route.includes('?') ? '&' : '?';
        const response = await fetch(`${session.url}${route}${separator}key=${key}`, {
          method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined
        });
        assert.equal(response.status, 404,
          `${method} ${route} must be refused here on a proxied origin — neither served by Raven nor forwarded upstream`);
      }

      // Without the key these are not Raven's requests at all — upstream's.
      for (const route of ['/tokens', '/components', '/grab']) {
        const forwarded = await fetch(`${session.url}${route}?key=wrong`);
        assert.equal(forwarded.status, 502,
          `${route} without the session key belongs to the proxied site, not to Raven`);
      }

      // The overlay's own three routes still work with the real key.
      const tokens = await fetch(`${session.url}/tokens?key=${key}`);
      assert.equal(tokens.status, 200);
      assert.equal((await tokens.json()).count, 1);

      await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('layers intents create the expected state and enforce operation transitions', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const baseIntent = {
      operation: 'reorder', page: '/pricing', parentSelector: 'main', fromIndex: 0, toIndex: 1,
      fromSelector: '#a', orderedSelectors: ['#b', '#a'], baselineOrder: ['#a', '#b'],
      measuredRects: [], approximate: false, domSnapshotHash: 'abc123'
    };
    const layerTree = { id: 1, label: 'main', children: [{ id: 2, label: 'section', children: [] }] };
    const layerResponse = await fetch(`${session.url}/layers?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: '/pricing', tree: layerTree })
    });
    assert.equal(layerResponse.status, 200);
    assert.deepEqual(await layerResponse.json(), { ok: true });
    const layers = await client.callTool({ name: 'get_grab_layers', arguments: { page: '/pricing' } });
    assert.deepEqual(JSON.parse(layers.content[0].text).tree, layerTree);

    const proposedResponse = await fetch(`${session.url}/layers-intent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseIntent)
    });
    assert.equal(proposedResponse.status, 202);
    const proposed = await proposedResponse.json();
    const proposedOperation = await client.callTool({ name: 'get_grab_operation', arguments: { operation_id: proposed.operationId } });
    assert.equal(JSON.parse(proposedOperation.content[0].text).state, 'proposed');

    const previewResponse = await fetch(`${session.url}/layers-intent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseIntent, measuredRects: [{ selector: '#b', x: 0, y: 0, width: 100, height: 20 }] })
    });
    const preview = await previewResponse.json();
    const applied = await client.callTool({ name: 'get_grab_operation', arguments: { operation_id: preview.operationId, mark: 'applied' } });
    assert.equal(JSON.parse(applied.content[0].text).state, 'applied');
    const invalid = await client.callTool({ name: 'get_grab_operation', arguments: { operation_id: preview.operationId, mark: 'rejected' } });
    assert.equal(invalid.isError, true);
    assert.match(invalid.content[0].text, /previewed/);

    const secondPreviewResponse = await fetch(`${session.url}/layers-intent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseIntent, measuredRects: [{ selector: '#a', x: 0, y: 20, width: 100, height: 20 }] })
    });
    const secondPreview = await secondPreviewResponse.json();
    const rejected = await client.callTool({ name: 'get_grab_operation', arguments: { operation_id: secondPreview.operationId, mark: 'rejected' } });
    assert.equal(JSON.parse(rejected.content[0].text).state, 'rejected');
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('layers reparent intents are accepted and surface toParentSelector on the operation payload', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const reparentIntent = {
      operation: 'reparent',
      page: '/pricing',
      fromParentSelector: '#hero',
      toParentSelector: '#mainnav',
      fromSelector: '#hero > .card:nth-of-type(1)',
      fromIndex: 0,
      toIndex: 1,
      orderedSelectors: ['#mainnav > a:nth-of-type(1)', '#hero > .card:nth-of-type(1)', '#mainnav > a:nth-of-type(2)'],
      baselineOrder: ['#hero > .card:nth-of-type(1)', '#hero > .card:nth-of-type(2)'],
      toBaselineOrder: ['#mainnav > a:nth-of-type(1)', '#mainnav > a:nth-of-type(2)'],
      measuredRects: [{ selector: '#hero > .card:nth-of-type(1)', x: 0, y: 20, width: 100, height: 20 }],
      approximate: false,
      domSnapshotHash: 'from-hash',
      toDomSnapshotHash: 'to-hash'
    };
    const response = await fetch(`${session.url}/layers-intent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reparentIntent)
    });
    assert.equal(response.status, 202);
    const queued = await response.json();
    const operation = JSON.parse((await client.callTool({
      name: 'get_grab_operation', arguments: { operation_id: queued.operationId }
    })).content[0].text);
    assert.equal(operation.state, 'previewed');
    assert.equal(operation.payload.operation, 'reparent');
    assert.equal(operation.payload.toParentSelector, '#mainnav');
    assert.equal(operation.payload.fromParentSelector, '#hero');
    assert.equal(operation.kind, 'reorder');

    const rejectedSameParent = await fetch(`${session.url}/layers-intent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...reparentIntent, toParentSelector: '#hero', measuredRects: [] })
    });
    assert.equal(rejectedSameParent.status, 400);

    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('phase 2A keeps style changes durable and exposes the unified batch through get_grab_operation', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const response = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: '#cta',
        styleEdits: [{ property: 'color', oldValue: 'red', newValue: 'blue' }]
      })
    });
    assert.equal(response.status, 202);
    const queued = await response.json();
    assert.match(queued.element.id, /^[a-f0-9]{32}$/);
    assert.match(queued.element.batchId, /^[a-f0-9]{32}$/);
    assert.equal(queued.element.sequence, 1);
    assert.equal(queued.element.kind, 'style');
    assert.equal(queued.element.target, '#cta');
    assert.equal(queued.element.state, 'sent');
    assert.equal(queued.element.payload.selector, '#cta');
    assert.equal(typeof queued.element.updatedAt, 'string');

    const firstDrain = JSON.parse((await client.callTool({ name: 'get_grabbed_elements', arguments: {} })).content[0].text);
    assert.equal(firstDrain.count, 1);
    assert.equal(firstDrain.elements[0].id, queued.element.id);
    const secondDrain = JSON.parse((await client.callTool({ name: 'get_grabbed_elements', arguments: {} })).content[0].text);
    assert.equal(secondDrain.count, 0, 'drained records stay durable but are delivered only once');

    const batchResponse = await client.callTool({ name: 'get_grab_operation', arguments: { batch: true } });
    const batch = JSON.parse(batchResponse.content[0].text);
    assert.equal(batch.batchId, queued.element.batchId);
    assert.equal(batch.changes.length, 1);
    assert.equal(batch.changes[0].id, queued.element.id);
    assert.equal(batch.pending.length, 1);

    const marked = await client.callTool({
      name: 'get_grab_operation',
      arguments: { operation_id: queued.element.id, mark: 'applied' }
    });
    assert.equal(JSON.parse(marked.content[0].text).state, 'applied');
    const afterApply = JSON.parse((await client.callTool({ name: 'get_grab_operation', arguments: { batch: true } })).content[0].text);
    assert.equal(afterApply.pending.length, 0);
    assert.equal(afterApply.changes[0].state, 'applied');
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('phase 2A sequences style and reorder records and supersedes older same-property edits', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const sendStyle = async (newValue) => {
      const response = await fetch(`${session.url}/grab?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: '#cta', styleEdits: [{ property: 'color', oldValue: 'red', newValue }] })
      });
      return (await response.json()).element;
    };
    const first = await sendStyle('blue');
    const second = await sendStyle('green');
    const reorderResponse = await fetch(`${session.url}/layers-intent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'reorder', page: '/', parentSelector: 'main', fromSelector: '#a',
        fromIndex: 0, toIndex: 1, orderedSelectors: ['#b', '#a'], baselineOrder: ['#a', '#b'],
        measuredRects: [{ selector: '#a', x: 0, y: 0, width: 10, height: 10 }],
        approximate: false, domSnapshotHash: 'hash'
      })
    });
    const reorder = await reorderResponse.json();
    const batch = JSON.parse((await client.callTool({ name: 'get_grab_operation', arguments: { batch: true } })).content[0].text);
    assert.deepEqual(batch.changes.map((change) => change.sequence), [1, 2, 3]);
    assert.deepEqual(batch.changes.map((change) => change.kind), ['style', 'style', 'reorder']);
    assert.equal(batch.changes[0].state, 'superseded');
    assert.equal(batch.changes[1].state, 'sent');
    assert.equal(batch.changes[2].id, reorder.operationId);
    assert.equal(batch.changes[2].batchId, first.batchId);
    assert.equal(batch.changes[2].batchId, second.batchId);
    assert.equal(batch.changes[2].target, '#a');
    assert.equal(batch.changes[2].payload.parentSelector, 'main');
    assert.deepEqual(batch.pending.map((change) => change.id), [second.id, reorder.operationId]);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('phase 2A batch commit is authenticated and reaches the agent drain as the apply signal', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const grabResponse = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#cta', instruction: 'Use the compact style.' })
    });
    const style = (await grabResponse.json()).element;

    const forbidden = await fetch(`${session.url}/batch-commit?key=wrong`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: style.batchId })
    });
    assert.equal(forbidden.status, 403);
    const committedResponse = await fetch(`${session.url}/batch-commit?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: style.batchId })
    });
    assert.equal(committedResponse.status, 200);
    const committed = await committedResponse.json();
    assert.equal(committed.committed, true);
    assert.equal(committed.batchId, style.batchId);
    assert.equal(typeof committed.committedAt, 'string');
    assert.equal(committed.count, 1);

    const drained = JSON.parse((await client.callTool({ name: 'get_grabbed_elements', arguments: {} })).content[0].text);
    assert.equal(drained.batchCommit.batchId, style.batchId);
    assert.equal(drained.batchCommit.committedAt, committed.committedAt);
    assert.equal(drained.batch.batchId, style.batchId);
    assert.deepEqual(drained.batch.pending.map((change) => change.id), [style.id]);
    assert.match(drained.agent_protocol, /implement this committed batch now/i);

    const repeatedResponse = await fetch(`${session.url}/batch-commit?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: style.batchId })
    });
    const repeated = await repeatedResponse.json();
    assert.equal(repeated.committedAt, committed.committedAt, 'batch commit is idempotent');
    const afterRepeat = JSON.parse((await client.callTool({ name: 'get_grabbed_elements', arguments: {} })).content[0].text);
    assert.equal(afterRepeat.batchCommit, undefined, 'repeating Apply does not emit a second implementation signal');
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('phase 2B exposes the unified batch through an authenticated GET route', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const grabResponse = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#cta', instruction: 'Use the compact style.' })
    });
    const style = (await grabResponse.json()).element;

    const forbidden = await fetch(`${session.url}/batch?key=wrong`);
    assert.equal(forbidden.status, 403);

    const response = await fetch(`${session.url}/batch?key=${key}`);
    assert.equal(response.status, 200);
    const batch = await response.json();
    assert.equal(batch.batchId, style.batchId);
    assert.deepEqual(batch.changes.map((change) => change.id), [style.id]);
    assert.deepEqual(batch.pending.map((change) => change.id), [style.id]);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('phase 2C GET batch stays pinned to an explicit committed batch after a newer batch opens', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const sendStyle = async (selector) => {
      const response = await fetch(`${session.url}/grab?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector, instruction: `Update ${selector}.` })
      });
      return (await response.json()).element;
    };
    const first = await sendStyle('#first');
    await fetch(`${session.url}/batch-commit?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: first.batchId })
    });
    const second = await sendStyle('#second');
    assert.notEqual(second.batchId, first.batchId);

    const response = await fetch(`${session.url}/batch?key=${key}&batchId=${first.batchId}`);
    assert.equal(response.status, 200);
    const batch = await response.json();
    assert.equal(batch.batchId, first.batchId);
    assert.deepEqual(batch.changes.map((change) => change.id), [first.id]);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('phase 2C delivers one batch commit marker to only one concurrent waiter', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const grabResponse = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#cta', instruction: 'Use the compact style.' })
    });
    const style = (await grabResponse.json()).element;
    await client.callTool({ name: 'get_grabbed_elements', arguments: {} });

    const waiterA = grabBridgeMod.getGrabbedElements(5000);
    const waiterB = grabBridgeMod.getGrabbedElements(5000);
    await fetch(`${session.url}/batch-commit?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: style.batchId })
    });

    const results = await Promise.all([waiterA, waiterB]);
    assert.equal(results.filter((result) => result.batchCommit).length, 1);
    assert.equal(results.filter((result) => result.batch).length, 1);
    assert.deepEqual(results[0].elements, results[1].elements);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('phase 2A enforces committed same-parent sequence and rejects dependent reorders', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const sendReorder = async (fromSelector, orderedSelectors, baselineOrder) => {
      const response = await fetch(`${session.url}/layers-intent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'reorder', page: '/', parentSelector: 'main', fromSelector,
          fromIndex: 0, toIndex: 1, orderedSelectors, baselineOrder,
          measuredRects: [{ selector: fromSelector, x: 0, y: 0, width: 10, height: 10 }],
          approximate: false, domSnapshotHash: orderedSelectors.join('|')
        })
      });
      return response.json();
    };
    const first = await sendReorder('#a', ['#b', '#a'], ['#a', '#b']);
    const second = await sendReorder('#b', ['#a', '#b'], ['#b', '#a']);
    await fetch(`${session.url}/batch-commit?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: first.batchId })
    });

    const outOfOrder = await client.callTool({
      name: 'get_grab_operation', arguments: { operation_id: second.operationId, mark: 'applied' }
    });
    assert.equal(outOfOrder.isError, true);
    assert.match(outOfOrder.content[0].text, /sequence/);

    const rejected = await client.callTool({
      name: 'get_grab_operation', arguments: { operation_id: first.operationId, mark: 'rejected' }
    });
    assert.equal(JSON.parse(rejected.content[0].text).state, 'rejected');
    const dependent = await client.callTool({ name: 'get_grab_operation', arguments: { operation_id: second.operationId } });
    assert.equal(JSON.parse(dependent.content[0].text).state, 'rejected');
    const batch = JSON.parse((await client.callTool({ name: 'get_grab_operation', arguments: { batch: true } })).content[0].text);
    assert.equal(batch.pending.length, 0);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('move_grab_layer rejects caller-supplied role fields', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const result = await client.callTool({ name: 'move_grab_layer', arguments: {
      operation: 'reorder', page: '/', parentSelector: 'main', fromIndex: 0, toIndex: 1,
      orderedSelectors: ['#b', '#a'], measuredRects: [], approximate: false, domSnapshotHash: 'hash', role: 'designer'
    } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /role|unrecognized/i);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('move_grab_layer validates intents and set_template_slot validates identifiers', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const baseIntent = {
      operation: 'reorder', page: '/', parentSelector: 'main', fromIndex: 0, toIndex: 1,
      orderedSelectors: ['#b', '#a'], approximate: false, domSnapshotHash: 'hash'
    };

    const previewed = await client.callTool({ name: 'move_grab_layer', arguments: {
      ...baseIntent, measuredRects: [{ selector: '#b', x: 0, y: 0, width: 100, height: 20 }]
    } });
    assert.equal(JSON.parse(previewed.content[0].text).state, 'previewed');

    const proposed = await client.callTool({ name: 'move_grab_layer', arguments: { ...baseIntent, measuredRects: [] } });
    assert.equal(JSON.parse(proposed.content[0].text).state, 'proposed');

    const outOfBounds = await client.callTool({ name: 'move_grab_layer', arguments: { ...baseIntent, toIndex: 5, measuredRects: [] } });
    assert.equal(outOfBounds.isError, true);
    const samePosition = await client.callTool({ name: 'move_grab_layer', arguments: { ...baseIntent, toIndex: 0, measuredRects: [] } });
    assert.equal(samePosition.isError, true);

    const slot = { slotId: 'hero', selector: '#hero', role: 'fixed' };
    const dottedTemplate = await client.callTool({ name: 'set_template_slot', arguments: { page: '/', template_id: 'a.b', slots: [slot] } });
    assert.equal(dottedTemplate.isError, true);
    assert.match(dottedTemplate.content[0].text, /templateId/);
    const dupSlots = await client.callTool({ name: 'set_template_slot', arguments: { page: '/', slots: [slot, { ...slot, selector: '#other' }] } });
    assert.equal(dupSlots.isError, true);
    assert.match(dupSlots.content[0].text, /Duplicate/);
    const protoSlot = await client.callTool({ name: 'set_template_slot', arguments: { page: '/', slots: [{ ...slot, slotId: '__proto__' }] } });
    assert.equal(protoSlot.isError, true);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('start_grab_session requires its capability key, serves DESIGN.md tokens, queues grabs, and stops cleanly', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-bridge-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, `---\ncolors:\n  primary: "#111111"\nspacing:\n  md: "16px"\n---\n# Bridge fixture\n`, 'utf8');

  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    assert.ok(!started.isError);
    const session = JSON.parse(started.content[0].text);
    assert.ok(session.port > 0, 'bridge should allocate a loopback port');
    const scriptTagMatch = session.script_tag.match(/<script src="http:\/\/127\.0\.0\.1:\d+\/raven-grab\.js\?key=([a-f0-9]+)"><\/script>/);
    assert.ok(scriptTagMatch, 'script tag should carry a random hex capability key');
    const key = scriptTagMatch[1];

    const forbiddenTokensRes = await fetch(`http://127.0.0.1:${session.port}/tokens`);
    assert.equal(forbiddenTokensRes.status, 403, 'missing capability key must be rejected');

    const forbiddenOverlayRes = await fetch(`http://127.0.0.1:${session.port}/raven-grab.js?key=wrong`);
    assert.equal(forbiddenOverlayRes.status, 403, 'wrong capability key must be rejected before asset lookup');

    const forbiddenGrabRes = await fetch(`http://127.0.0.1:${session.port}/grab?key=wrong`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#unauthorized' })
    });
    assert.equal(forbiddenGrabRes.status, 403, 'wrong capability key must not queue a grab');

    const tokensRes = await fetch(`http://127.0.0.1:${session.port}/tokens?key=${key}`);
    assert.equal(tokensRes.status, 200);
    assert.equal(tokensRes.headers.get('access-control-allow-origin'), '*');
    const tokens = await tokensRes.json();
    assert.equal(tokens.path, path.resolve(designPath));
    assert.equal(tokens.count, 2);
    assert.equal(tokens.tokens.find((token) => token.path === 'colors.primary').cssVar, '--color-primary');

    const overlayRes = await fetch(`http://127.0.0.1:${session.port}/raven-grab.js?key=${key}`);
    assert.equal(overlayRes.status, 404, 'missing browser asset must 404 gracefully');

    const grabRes = await fetch(`http://127.0.0.1:${session.port}/grab?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: '#cta',
        html: '<button id="cta">Save</button>',
        rect: { x: 10, y: 20, w: 120, h: 44 },
        styleEdits: [{ property: 'color', oldValue: '#111111', newValue: '#222222' }],
        instruction: 'Swap the primary color to the muted variant.',
        componentRequest: {
          issueType: 'Missing variant',
          issueSize: '100-1,000',
          useCase: 'The billing table needs a compact density variant.',
          email: 'designer@example.com'
        }
      })
    });
    assert.equal(grabRes.status, 202);
    const queued = await grabRes.json();
    assert.equal(queued.queued, true);
    assert.equal(queued.count, 1);

    const drained = await client.callTool({ name: 'get_grabbed_elements', arguments: {} });
    assert.ok(!drained.isError);
    const grabbed = JSON.parse(drained.content[0].text);
    assert.equal(grabbed.count, 1);
    assert.equal(grabbed.elements[0].selector, '#cta');
    assert.deepEqual(grabbed.elements[0].styleEdits, [
      { property: 'color', oldValue: '#111111', newValue: '#222222' }
    ]);
    assert.equal(grabbed.elements[0].instruction, 'Swap the primary color to the muted variant.');
    assert.deepEqual(grabbed.elements[0].componentRequest, {
      issueType: 'Missing variant',
      issueSize: '100-1,000',
      useCase: 'The billing table needs a compact density variant.',
      email: 'designer@example.com'
    });

    const stopped = await client.callTool({ name: 'stop_grab_session', arguments: {} });
    assert.ok(!stopped.isError);
    assert.equal(JSON.parse(stopped.content[0].text).stopped, true);
  });
});

test('/agent/wait rejects requests without the session key', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const response = await fetch(`${session.url}/agent/wait?timeout_ms=200`);
    assert.equal(response.status, 403);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('/agent/wait drains a queued grab for the keyed session', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const element = { selector: '#queued', instruction: 'Move this above the hero.' };
    const grabResponse = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(element)
    });
    assert.equal(grabResponse.status, 202);

    const response = await fetch(`${session.url}/agent/wait?key=${key}&timeout_ms=200`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.count, 1);
    assert.equal(result.elements[0].selector, element.selector);
    assert.equal(result.elements[0].instruction, element.instruction);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('/agent/wait returns an empty result after a short timeout', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const response = await fetch(`${session.url}/agent/wait?key=${key}&timeout_ms=200`);
    assert.equal(response.status, 200);
    // proxyMode and captureOnly ride on every drain result now, including the
    // empty one — both are pinned to the session that was drained rather than
    // looked up after the await, so neither can be omitted on the timeout path
    // without reintroducing the lookup. This session is local, hence both false.
    assert.deepEqual(await response.json(), { count: 0, elements: [], proxyMode: false, captureOnly: false });
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('a pending /agent/wait resolves when /grab queues an item', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const waitResponsePromise = fetch(`${session.url}/agent/wait?key=${key}&timeout_ms=2000`);
    const element = { selector: '#pending', instruction: 'Use the compact variant.' };
    const grabResponse = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(element)
    });
    assert.equal(grabResponse.status, 202);

    const waitResponse = await waitResponsePromise;
    assert.equal(waitResponse.status, 200);
    const result = await waitResponse.json();
    assert.equal(result.count, 1);
    assert.equal(result.elements[0].selector, element.selector);
    assert.equal(result.elements[0].instruction, element.instruction);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('start_grab_session returns a keyed wait URL and background watch command', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    if (session.mode !== 'server') {
      assert.equal(session.wait_url, '');
      assert.equal(session.watch_command, '');
    } else {
      const key = sessionKey(session);
      assert.equal(session.wait_url, `${session.url}/agent/wait?key=${key}&timeout_ms=240000`);
      assert.match(session.watch_command, new RegExp(key));
      assert.match(session.watch_command, /curl -sf/);
      assert.match(session.watch_command, /"count": 0/);
    }
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('a capture-only proxy advertises no wait URL or watch command', async () => {
  // /agent/wait is one of the routes a THIRD-PARTY proxy withholds, so handing
  // back a keyed wait_url pointed at it is an instruction to run a command that
  // 404s for as long as the agent is willing to retry. Worse, the watch_command
  // is the shape an agent is most likely to run unattended — it loops on curl
  // and only exits on a selection, so the advertised-but-withheld route reads
  // as "the designer has not grabbed anything yet" instead of as a refusal.
  // The target must be non-loopback: a loopback proxy keeps the watcher (its
  // batchCommit IS coming — grab-bridge-proxy-round5 pins that direction).
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath, proxy_target: 'https://fixture.invalid' } });
    const session = JSON.parse(started.content[0].text);
    assert.equal(session.mode, 'server', 'the proxy only exists in server mode');
    assert.equal(session.wait_url, '');
    assert.equal(session.watch_command, '');
    const key = sessionKey(session);
    const refused = await fetch(`${session.url}/agent/wait?key=${key}&timeout_ms=100`);
    assert.equal(refused.status, 404, 'and the route it would have named is genuinely withheld');
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('watch_command run in a real shell exits with the sent selection', async (t) => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    if (session.mode !== 'server') {
      await client.callTool({ name: 'stop_grab_session', arguments: {} });
      t.skip('no HTTP listener in shim mode');
      return;
    }
    const key = sessionKey(session);
    const { spawn } = await import('node:child_process');
    const watcher = spawn('sh', ['-c', session.watch_command]);
    let stdout = '';
    watcher.stdout.on('data', (chunk) => { stdout += chunk; });
    const exited = new Promise((resolve) => watcher.on('close', resolve));

    await new Promise((resolve) => setTimeout(resolve, 300));
    const element = { selector: '#watched', instruction: 'Swap to the accent token.' };
    const grabResponse = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(element)
    });
    assert.equal(grabResponse.status, 202);

    const code = await exited;
    assert.equal(code, 0);
    const delivered = JSON.parse(stdout);
    assert.equal(delivered.count, 1);
    assert.equal(delivered.elements[0].selector, element.selector);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('stop_grab_session settles a pending /agent/wait without hanging', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const pending = fetch(`${session.url}/agent/wait?key=${key}&timeout_ms=10000`)
      .then((response) => response.json())
      .catch(() => ({ count: 0, elements: [] }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stopped = await client.callTool({ name: 'stop_grab_session', arguments: {} });
    assert.equal(JSON.parse(stopped.content[0].text).stopped, true);
    const drained = await pending;
    assert.equal(drained.count, 0);
  });
});

test('grab bridge drains ordered multiSelect entries without changing their order', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    assert.ok(!started.isError);
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const multiSelect = [
      { index: 1, selector: '#first', html: '<div id="first"></div>', rect: { x: 1, y: 2, top: 2, right: 11, bottom: 12, left: 1, width: 10, height: 10 }, styles: { color: 'red' } },
      { index: 2, selector: '#second', html: '<div id="second"></div>', rect: { x: 3, y: 4, top: 4, right: 23, bottom: 24, left: 3, width: 20, height: 20 }, styles: { color: 'blue' } },
      { index: 3, selector: '#third', html: '<div id="third"></div>', rect: { x: 5, y: 6, top: 6, right: 35, bottom: 36, left: 5, width: 30, height: 30 }, styles: { color: 'green' } }
    ];

    const grabResponse = await fetch(`${session.url}/grab?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#first', multiSelect })
    });
    assert.equal(grabResponse.status, 202);

    const drained = await client.callTool({ name: 'get_grabbed_elements', arguments: {} });
    assert.ok(!drained.isError);
    const grabbed = JSON.parse(drained.content[0].text);
    assert.deepEqual(grabbed.elements[0].multiSelect, multiSelect);
    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('grab proxy injects exactly one keyed overlay script before the first closing body tag', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const designPath = await makeDesignFixture();
  const original = '<!doctype html><html><body><main>Original content</main></BoDy></html>';

  await withUpstream((req, res) => {
    assert.equal(req.url, '/nested/page?view=full');
    res.writeHead(201, { 'Content-Type': 'text/html; charset=utf-8', 'X-Upstream': 'yes' });
    res.end(original);
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        assert.ok(!started.isError);
        const session = JSON.parse(started.content[0].text);
        const key = sessionKey(session);
        const response = await fetch(`${session.url}/nested/page?view=full`);
        const html = await response.text();

        assert.equal(response.status, 201);
        assert.equal(response.headers.get('x-upstream'), 'yes');
        assert.equal(response.headers.get('access-control-allow-origin'), null);

        // The proxy path carries its config in the SAME-ORIGIN script URL, not in an
        // inline <script>. An inline tag is dropped by any upstream CSP without
        // 'unsafe-inline' (github.com, stripe.com), which silently killed the overlay
        // on exactly the third-party sites this proxy exists to grab from.
        assert.equal(html.indexOf('<script>window.ravenGrabConfig'), -1,
          'proxied HTML must not depend on an inline script that upstream CSP can drop');
        const injectedMatch = html.match(/<script src="\/raven-grab\.js\?key=([a-f0-9]+)&cfg=([^"]+)"><\/script>/);
        assert.ok(injectedMatch, 'proxied HTML carries one keyed overlay script with its config in the URL');
        assert.equal(injectedMatch[1], key);
        assert.equal(html.split(injectedMatch[0]).length - 1, 1);

        const config = JSON.parse(decodeURIComponent(injectedMatch[2]));
        assert.match(config.bridgeOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.equal(typeof config.ravenVersion, 'string');

        // The service-worker guard must run before page scripts but must NEVER
        // precede the doctype — anything ahead of it puts the proxied page into
        // quirks mode and silently changes box-sizing across the whole document.
        const guard = `<script src="/raven-grab.js?key=${key}&sw=1"></script>`;
        assert.ok(html.startsWith('<!doctype html>'), 'the doctype must remain the first bytes of the document');
        assert.equal(html.split(guard).length - 1, 1, 'exactly one service-worker guard');
        assert.ok(html.indexOf(guard) < html.indexOf(injectedMatch[0]), 'the guard precedes the overlay');

        assert.equal(html, original
          .replace(/<html>/i, `<html>${guard}`)
          .replace(/<\/body>/i, `${injectedMatch[0]}</BoDy>`));
        assert.ok(html.indexOf(injectedMatch[0]) < html.toLowerCase().indexOf('</body>'));
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('start_grab_session injects local project metadata for consumer and maintainer sessions', async () => {
  const designPath = await makeDesignFixture('Raven Workspace');

  await withClient(indexMod.buildServer({}), async (client) => {
    const consumerStarted = await client.callTool({
      name: 'start_grab_session',
      arguments: { path: designPath }
    });
    const consumerSession = JSON.parse(consumerStarted.content[0].text);
    assert.equal(consumerSession.project_name, 'Raven Workspace');
    assert.equal(consumerSession.raven_version, pkgVersion);
    assert.match(consumerSession.script_tag, new RegExp(`window\\.ravenGrabConfig=\\{"bridgeOrigin":"http://127\\.0\\.0\\.1:\\d+","projectName":"Raven Workspace","ravenVersion":"${pkgVersionRe}"\\}`));
    assert.doesNotMatch(consumerSession.script_tag, /"role"/);

    const maintainerStarted = await client.callTool({
      name: 'start_grab_session',
      arguments: { path: designPath, role: 'maintainer' }
    });
    const maintainerSession = JSON.parse(maintainerStarted.content[0].text);
    assert.equal(maintainerSession.project_name, 'Raven Workspace');
    assert.match(maintainerSession.script_tag, new RegExp(`"projectName":"Raven Workspace","ravenVersion":"${pkgVersionRe}","role":"maintainer"`));
    const maintainerKey = sessionKey(maintainerSession);
    const grabResponse = await fetch(`${maintainerSession.url}/grab?key=${maintainerKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: '#maintainer-target',
        styles: { color: 'rgb(0, 0, 0)' },
        tokens: [{ path: 'colors.primary' }],
        stateStyles: { hover: { declarations: [{ property: 'color', value: 'red' }] } },
        intent: 'create-component',
        userNotes: 'Keep the compact hover treatment.',
        instruction: 'Build this as a reusable component in the design system and update DESIGN.md.'
      })
    });
    assert.equal(grabResponse.status, 202);
    const drained = await client.callTool({ name: 'get_grabbed_elements', arguments: {} });
    const grabbed = JSON.parse(drained.content[0].text).elements[0];
    assert.equal(grabbed.intent, 'create-component');
    assert.equal(grabbed.userNotes, 'Keep the compact hover treatment.');
    assert.deepEqual(grabbed.stateStyles, { hover: { declarations: [{ property: 'color', value: 'red' }] } });
    assert.match(grabbed.instruction, /update DESIGN\.md/);

    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('start_grab_session falls back to the bridge cwd basename when DESIGN.md has no project name', async () => {
  const designPath = await makeDesignFixture();

  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({
      name: 'start_grab_session',
      arguments: { path: designPath }
    });
    const session = JSON.parse(started.content[0].text);
    const expectedName = path.basename(process.cwd());

    assert.equal(session.project_name, expectedName);
    assert.ok(session.script_tag.includes('"projectName":"' + expectedName + '"'));

    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('start_grab_session rejects an empty proxy_target instead of silently disabling proxy mode', async () => {
  const designPath = await makeDesignFixture();

  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({
      name: 'start_grab_session',
      arguments: { path: designPath, proxy_target: '' }
    });
    if (!started.isError) {
      await client.callTool({ name: 'stop_grab_session', arguments: {} });
    }

    assert.equal(started.isError, true);
    assert.match(started.content[0].text, /proxy_target/);
  });
});

test('grab proxy preserves HEAD semantics without fabricating an injected body length', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const designPath = await makeDesignFixture();

  await withUpstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': '123' });
    res.end();
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const response = await fetch(`${session.url}/document`, { method: 'HEAD' });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') || '', /^text\/html/);
        assert.equal(response.headers.get('content-length'), null);
        assert.equal(await response.text(), '');
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab proxy passes non-HTML response bytes through without injection', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const designPath = await makeDesignFixture();
  const original = Buffer.from('{"message":"unchanged","bytes":[0,255]}\n', 'utf8');

  await withUpstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': original.length });
    res.end(original);
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const response = await fetch(`${session.url}/data.json`);
        const body = Buffer.from(await response.arrayBuffer());

        assert.deepEqual(body, original);
        assert.equal(body.includes(Buffer.from('raven-grab.js')), false);
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab proxy forwards chunked request bodies without forwarding transfer-encoding', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const designPath = await makeDesignFixture();
  let received;

  await withUpstream(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = {
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks),
      transferEncoding: req.headers['transfer-encoding']
    };
    res.writeHead(204);
    res.end();
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const response = await new Promise((resolve, reject) => {
          const request = httpRequest(`${session.url}/api/save?draft=1`, { method: 'PATCH' }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
          });
          request.on('error', reject);
          request.write(Buffer.from([0, 1]));
          request.end(Buffer.from([2, 255]));
        });

        assert.equal(response.status, 204);
        assert.equal(received.method, 'PATCH');
        assert.equal(received.url, '/api/save?draft=1');
        assert.deepEqual(received.body, Buffer.from([0, 1, 2, 255]));
        assert.equal(received.transferEncoding, undefined);
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab bridge routes remain available while proxy mode is active', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const designPath = await makeDesignFixture();

  await withUpstream((_req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('upstream route');
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const key = sessionKey(session);
        const response = await fetch(`${session.url}/tokens?key=${key}`);
        const tokens = await response.json();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
        assert.equal(tokens.count, 1);
        // The proxied page shares this origin, so its scripts can read this
        // response. The token vocabulary is the feature; the absolute path to the
        // user's DESIGN.md is not, and is withheld while proxying.
        assert.equal(tokens.path, undefined, 'the DESIGN.md path must not be exposed to a proxied page');
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab proxy returns 502 when its upstream is unreachable', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const designPath = await makeDesignFixture();
  let unreachableUrl;
  await withUpstream((_req, res) => res.end(), async (upstreamUrl) => {
    unreachableUrl = upstreamUrl;
  });

  await withClient(indexMod.buildServer({}), async (client) => {
    try {
      const started = await client.callTool({
        name: 'start_grab_session',
        arguments: { path: designPath, proxy_target: unreachableUrl }
      });
      const session = JSON.parse(started.content[0].text);
      const response = await fetch(`${session.url}/unreachable`);
      const body = await response.text();

      assert.equal(response.status, 502);
      assert.match(response.headers.get('content-type') || '', /^text\/plain/);
      assert.match(body, /^Bad gateway: /);
    } finally {
      await client.callTool({ name: 'stop_grab_session', arguments: {} });
    }
  });
});

test('overlay token matching keeps only cascade-winning var declarations', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.setTokens([
    { path: 'colors.class', group: 'colors', name: 'class', value: '#111', cssVar: '--color-class' },
    { path: 'colors.id', group: 'colors', name: 'id', value: '#222', cssVar: '--color-id' },
    { path: 'colors.inline', group: 'colors', name: 'inline', value: '#333', cssVar: '--color-inline' },
    { path: 'colors.old', group: 'colors', name: 'old', value: '#444', cssVar: '--color-old' },
    { path: 'colors.new', group: 'colors', name: 'new', value: '#555', cssVar: '--color-new' },
    { path: 'spacing.old', group: 'spacing', name: 'old', value: '8px', cssVar: '--spacing-old' },
    { path: 'spacing.new', group: 'spacing', name: 'new', value: '12px', cssVar: '--spacing-new' }
  ]);
  document.styleSheets = [{ cssRules: [
    { selectorText: '.card', style: fakeStyle({ color: 'var(--color-class)', 'background-color': 'var(--color-old)', 'padding-left': 'var(--spacing-old)' }) },
    { selectorText: '#target', style: fakeStyle({ color: 'var(--color-id)' }) },
    { selectorText: '.card', style: fakeStyle({ 'background-color': 'var(--color-new)' }) },
    { selectorText: '.card.special', style: fakeStyle({ padding: 'var(--spacing-new)' }) }
  ] }];
  const element = {
    matches: () => true,
    style: fakeStyle({ color: 'var(--color-inline)' }),
    computedStyle: fakeStyle({
      '--color-class': '#111', '--color-id': '#222', '--color-inline': '#333',
      '--color-old': '#444', '--color-new': '#555', '--spacing-old': '8px', '--spacing-new': '12px'
    })
  };

  const cssVars = Array.from(internals.tokenMapFor(element), (token) => token.cssVar).sort();
  assert.deepEqual(cssVars, ['--color-inline', '--color-new', '--spacing-new']);
});

test('overlay captures interactive state declarations, tokens, and disabled presence', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.setTokens([
    { path: 'colors.accent', name: 'accent', group: 'colors', value: '#00BFFF', cssVar: '--demo-colors-accent' },
    { path: 'colors.primary', name: 'primary', group: 'colors', value: '#F0F0F2', cssVar: '--demo-colors-primary' }
  ]);
  document.styleSheets.push(
    { get cssRules() { throw new Error('cross-origin'); } },
    { cssRules: [
      { selectorText: 'button:hover', style: fakeStyle({ background: 'var(--demo-colors-primary)' }) },
      { selectorText: '.demo-button:hover, .other:hover', style: fakeStyle({ background: 'var(--demo-colors-accent)', color: 'var(--demo-colors-primary)' }) },
      { selectorText: '.demo-button:focus', style: fakeStyle({ outline: '2px solid var(--demo-colors-accent)' }) },
      { selectorText: '.demo-button:active', style: fakeStyle({ color: 'var(--demo-colors-accent)' }) },
      { selectorText: '.demo-button:disabled', style: fakeStyle({ opacity: '0.5' }) }
    ] }
  );
  const element = document.createElement('button');
  element.localName = 'button';
  element.disabled = true;
  element.computedStyle = fakeStyle({
    '--demo-colors-accent': '#00BFFF',
    '--demo-colors-primary': '#F0F0F2'
  });
  element.matches = (selector) => selector === 'button' || selector === '.demo-button';

  const states = JSON.parse(JSON.stringify(internals.interactiveStylesFor(element)));
  assert.deepEqual(states.hover.declarations, [
    { property: 'background', value: 'var(--demo-colors-accent)', important: false },
    { property: 'color', value: 'var(--demo-colors-primary)', important: false }
  ]);
  assert.deepEqual(states.hover.tokens.map((token) => token.path).sort(), ['colors.accent', 'colors.primary']);
  assert.equal(states.focus.declarations[0].property, 'outline');
  assert.equal(states.active.declarations[0].property, 'color');
  assert.equal(states.disabled.active, true);
  assert.equal(states.disabled.declarations[0].property, 'opacity');
});

test('overlay renders state groups in token and raw style sections and sends them', async () => {
  const { internals } = await loadOverlayInternals();
  const stateStyles = {
    hover: {
      declarations: [{ property: 'background', value: 'var(--demo-colors-accent)', important: false }],
      tokens: [{ property: 'background', name: 'accent', path: 'colors.accent', value: '#00BFFF', cssVar: '--demo-colors-accent', bridgeToken: { path: 'colors.accent' } }]
    },
    focus: {
      declarations: [{ property: 'outline', value: '2px solid var(--demo-colors-accent)', important: false }],
      tokens: [{ property: 'outline', name: 'accent', path: 'colors.accent', value: '#00BFFF', cssVar: '--demo-colors-accent', bridgeToken: { path: 'colors.accent' } }]
    },
    active: { declarations: [], tokens: [] },
    disabled: { active: true, declarations: [], tokens: [] }
  };
  internals.setStyleContext({ style: fakeStyle() }, { padding: '16px' }, [], '#state-target', stateStyles);
  internals.renderPanel();

  const html = internals.getPanelHtml();
  assert.match(html, /data-style-state="hover"[\s\S]*Hover[\s\S]*accent · #00BFFF/);
  assert.match(html, /data-style-state="focus"[\s\S]*Focus[\s\S]*accent · #00BFFF/);
  assert.match(html, /raven-grab-state-label">Hover</);
  assert.doesNotMatch(html, />HOVER</);
  assert.match(html, /data-style-state="hover"[\s\S]*data-style-property="background"[\s\S]*data-style-value/);
  assert.match(html, /data-style-state="focus"[\s\S]*data-style-property="outline"[\s\S]*data-style-value/);
  assert.doesNotMatch(html, /data-token-state="active"|data-style-state="active"/);
  assert.doesNotMatch(html, /data-token-state="disabled"|data-style-state="disabled"/);
  assert.doesNotMatch(html, /data-token-state=/);
  assert.deepEqual(JSON.parse(JSON.stringify(internals.payloadForSend().stateStyles)), stateStyles);
});

test('overlay state capture is wired into selection and playground state fixtures', async () => {
  const overlaySource = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  const playgroundSource = await readFile(path.resolve(__dirname, '../web/app/raven-design/page.tsx'), 'utf8');
  assert.match(overlaySource, /stateStyles:\s*interactiveStylesFor\(element\)/);
  assert.equal((overlaySource.match(/stateStyles:\s*currentSelection\.stateStyles/g) || []).length, 2);
  assert.match(overlaySource, /document\.styleSheets[\s\S]*try\s*\{[\s\S]*\.cssRules/);
  assert.match(overlaySource, /element\.matches\(baseSelector\)/);
  assert.match(playgroundSource, /\.wireframe-button:hover\s*\{/);
  assert.match(playgroundSource, /\.wireframe-field input:focus\s*\{/);
  assert.match(playgroundSource, /\.wireframe-button:disabled\s*\{/);
  assert.match(playgroundSource, /<button[^>]*disabled[^>]*>/);
});

test('overlay alternatives match nested token leaf names within the same group', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setTokens([
    { path: 'typography.body.fontFamily', group: 'typography', name: 'body.fontFamily', value: 'Inter', cssVar: '--font-body' },
    { path: 'typography.caption.fontFamily', group: 'typography', name: 'caption.fontFamily', value: 'Inter', cssVar: '--font-caption' },
    { path: 'typography.body.fontSize', group: 'typography', name: 'body.fontSize', value: '16px', cssVar: '--text-body' },
    { path: 'colors.fontFamily', group: 'colors', name: 'fontFamily', value: '#000', cssVar: '--color-font' }
  ]);

  const alternatives = internals.alternativesFor({
    group: 'typography',
    cssVar: '--font-body',
    bridgeToken: { path: 'typography.body.fontFamily' }
  });
  assert.deepEqual(Array.from(alternatives, (token) => token.path), ['typography.caption.fontFamily']);

  internals.setTokens([
    { path: 'typography.font-family.body', group: 'typography', name: 'font-family.body', value: 'Inter', cssVar: '--font-family-body' },
    { path: 'typography.font-family.caption', group: 'typography', name: 'font-family.caption', value: 'Inter', cssVar: '--font-family-caption' },
    { path: 'typography.font-size.body', group: 'typography', name: 'font-size.body', value: '16px', cssVar: '--font-size-body' }
  ]);
  const propertyFirstAlternatives = internals.alternativesFor({
    group: 'typography',
    cssVar: '--font-family-body',
    bridgeToken: { path: 'typography.font-family.body' }
  });
  assert.deepEqual(Array.from(propertyFirstAlternatives, (token) => token.path), ['typography.font-family.caption']);
});

test('overlay token intents include old and new full token paths', async () => {
  const { internals } = await loadOverlayInternals();
  const token = {
    property: 'font-family',
    group: 'typography',
    name: 'body.fontFamily',
    bridgeToken: { path: 'typography.body.fontFamily' }
  };
  const alternative = {
    path: 'typography.caption.fontFamily',
    name: 'caption.fontFamily',
    value: 'Inter'
  };

  assert.deepEqual(
    { ...internals.tokenIntentFor(token, alternative) },
    {
      property: 'font-family',
      oldToken: 'body.fontFamily',
      oldTokenPath: 'typography.body.fontFamily',
      newToken: 'caption.fontFamily',
      newTokenPath: 'typography.caption.fontFamily',
      newTokenValue: 'Inter'
    }
  );
  assert.deepEqual(
    { ...internals.tokenIntentFor(token, null, 'display.fontFamily', 'Newsreader') },
    {
      property: 'font-family',
      oldToken: 'body.fontFamily',
      oldTokenPath: 'typography.body.fontFamily',
      newToken: 'display.fontFamily',
      newTokenPath: 'typography.display.fontFamily',
      newTokenValue: 'Newsreader'
    }
  );
});

test('overlay computed-style commits preserve the original value across re-edits', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(0, 0, 0)' }) };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });

  assert.equal(internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)'), true);
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(0, 0, 0)', newValue: 'rgb(20, 20, 20)' }
  ]);

  assert.equal(internals.commitStyleEdit('color', 'rgb(40, 40, 40)', 'rgb(20, 20, 20)'), true);
  assert.equal(element.style.getPropertyValue('color'), 'rgb(40, 40, 40)');
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(0, 0, 0)', newValue: 'rgb(40, 40, 40)' }
  ]);
});

test('REGRESSION: a previewed single-target edit survives commit (arrow-step / scrub / picker)', async () => {
  // The real editors preview (inline -> newValue) BEFORE commit, passing the
  // open-time original as currentValue. commit must treat currentValue as the
  // baseline, not the live computed value (which the preview already moved to
  // newValue) — otherwise the equality branch reads it as a no-op revert and
  // silently drops the edit.
  const { internals } = await loadOverlayInternals();
  const element = { nodeType: 1, style: fakeStyle({ padding: '10px' }) };
  // Real browsers: getComputedStyle follows inline writes. Link them so the
  // harness models that — without this the fake computed style is frozen and
  // the whole preview→commit class is invisible to unit tests (it was). nodeType:1
  // is required or computedStyleValueForElement short-circuits before the read.
  element.computedStyle = element.style;
  internals.setStyleContext(element, { padding: '10px' });

  internals.previewStyleEdit('padding', '11px');
  internals.previewStyleEdit('padding', '12px');
  assert.equal(internals.commitStyleEdit('padding', '12px', '10px'), true);

  assert.equal(element.style.getPropertyValue('padding'), '12px', 'element keeps the committed value, not the original');
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'padding', oldValue: '10px', newValue: '12px' }
  ]);
});

test('REGRESSION: a mixed-selection previewed edit records the primary clean value as oldValue, not newValue', async () => {
  // Two layers disagree on padding (row shows "Mixed"). Preview writes newValue
  // to BOTH targets, so a live computed read of the primary is polluted. The
  // commit payload's oldValue must be the primary's clean selection-time value
  // (currentSelection.styles), not the previewed newValue — else the agent gets
  // {oldValue: newValue, newValue} and can't reason about the change.
  const { internals } = await loadOverlayInternals();
  const a = { nodeType: 1, style: fakeStyle({ padding: '10px' }) };
  const b = { nodeType: 1, style: fakeStyle({ padding: '20px' }) };
  a.computedStyle = a.style;
  b.computedStyle = b.style;
  internals.setMultiStyleContext([a, b], { padding: '10px' });

  internals.previewStyleEdit('padding', '12px');
  assert.equal(internals.commitStyleEdit('padding', '12px', 'Mixed'), true);

  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ property: edit.property, oldValue: edit.oldValue, newValue: edit.newValue })), [
    { property: 'padding', oldValue: '10px', newValue: '12px' }
  ]);
});

test('REGRESSION: mixed commit ignores a re-snapshotted (polluted) currentSelection.styles and uses the captured clean baseline (Sol re-check)', async () => {
  // Sol's deeper chain: currentSelection.styles is not immutable — rebase/re-select
  // paths can re-snapshot it WHILE a preview is applied, leaving it polluted. The
  // commit baseline must come from the computed captured BEFORE the first write
  // (styleEditOriginalInline), not from the snapshot. Model a polluted snapshot by
  // passing primaryStyles that disagree with the target's true original.
  const { internals } = await loadOverlayInternals();
  const a = { nodeType: 1, style: fakeStyle({ padding: '10px' }) };
  const b = { nodeType: 1, style: fakeStyle({ padding: '20px' }) };
  a.computedStyle = a.style;
  b.computedStyle = b.style;
  // primaryStyles is a POLLUTED snapshot ('99px'); a's real original is '10px'.
  internals.setMultiStyleContext([a, b], { padding: '99px' });

  internals.previewStyleEdit('padding', '12px');
  assert.equal(internals.commitStyleEdit('padding', '12px', 'Mixed'), true);

  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ property: edit.property, oldValue: edit.oldValue, newValue: edit.newValue })), [
    { property: 'padding', oldValue: '10px', newValue: '12px' }
  ]);
});

test('overlay dismiss rolls back inline computed-style mutations', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(1, 2, 3)' }, { color: 'important' }) };
  internals.setStyleContext(element, { color: 'rgb(1, 2, 3)' });

  assert.equal(internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(1, 2, 3)'), true);
  assert.equal(element.style.getPropertyValue('color'), 'rgb(20, 20, 20)');

  internals.dismiss();
  assert.equal(element.style.getPropertyValue('color'), 'rgb(1, 2, 3)');
  assert.equal(element.style.getPropertyPriority('color'), 'important');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
});

test('overlay reverting to the original computed value removes the inline override', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });

  internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)');
  internals.commitStyleEdit('color', 'rgb(0, 0, 0)', 'rgb(20, 20, 20)');

  assert.equal(element.style.getPropertyValue('color'), '');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
});

test('overlay invalid computed-style value leaves the displayed value unchanged', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const valueCell = document.createElement('code');
  valueCell.textContent = 'rgb(0, 0, 0)';
  valueCell.parentElement = row;
  valueCell.parentNode = row;

  internals.beginStyleEdit(valueCell);
  const input = row.child.children.find((child) => child.type === 'text');
  input.value = 'definitely-invalid';
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });

  assert.equal(row.child.textContent, 'rgb(0, 0, 0)');
  assert.equal(element.style.getPropertyValue('color'), '');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
});

test('[phase4 #5] numeric style editors step with arrows, preserve units and decimals, and defer intent commit', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = document.createElement('div');
  element.style = fakeStyle();
  internals.setStyleContext(element, { padding: '1.5rem' }, [], '#target');
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const cell = document.createElement('code');
  cell.setAttribute('data-style-raw', '1.5rem');
  cell.parentElement = row;
  cell.parentNode = row;
  internals.beginStyleEdit(cell);
  const input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'padding');

  input.dispatch('keydown', { key: 'ArrowUp', shiftKey: false, preventDefault() {} });
  assert.equal(input.value, '2.5');
  assert.equal(element.style.getPropertyValue('padding'), '2.5rem');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);

  input.dispatch('keydown', { key: 'ArrowDown', shiftKey: false, preventDefault() {} });
  assert.equal(input.value, '1.5');
  input.dispatch('keydown', { key: 'ArrowUp', shiftKey: true, preventDefault() {} });
  assert.equal(input.value, '11.5');
  assert.equal(element.style.getPropertyValue('padding'), '11.5rem');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);

  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'padding', oldValue: '1.5rem', newValue: '11.5rem' }
  ]);
});

test('[phase4 #6] numeric style editors evaluate arithmetic and reject mixed units without committing', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = document.createElement('div');
  element.style = fakeStyle();
  internals.setStyleContext(element, { width: '12px' }, [], '#target');
  function makeRow() {
    return {
      child: null,
      getAttribute(name) { return name === 'data-style-property' ? 'width' : null; },
      setAttribute() {},
      replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
    };
  }
  function begin(row, raw) {
    const cell = document.createElement('code');
    cell.setAttribute('data-style-raw', raw);
    cell.parentElement = row;
    cell.parentNode = row;
    internals.beginStyleEdit(cell);
    function findInput(node) {
      if (node.getAttribute && node.getAttribute('data-style-input') === 'width') return node;
      for (const child of node.children || []) {
        const found = findInput(child);
        if (found) return found;
      }
      return null;
    }
    return findInput(row.child);
  }

  const arithmeticRow = makeRow();
  const arithmeticInput = begin(arithmeticRow, '12px');
  arithmeticInput.value = '(12 + 4) * 2 / 4';
  arithmeticInput.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(element.style.getPropertyValue('width'), '8px');
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'width', oldValue: '12px', newValue: '8px' }
  ]);

  internals.setStyleContext(element, { width: '12px' }, [], '#target');
  const mixedRow = makeRow();
  const mixedInput = begin(mixedRow, '12px');
  mixedInput.dispatch('keydown', { key: 'ArrowUp', shiftKey: false, preventDefault() {} });
  assert.equal(element.style.getPropertyValue('width'), '13px');
  mixedInput.value = '12px + 1rem';
  mixedInput.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(mixedRow.child.textContent, '12px + 1rem');
  assert.equal(element.style.getPropertyValue('width'), '8px');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  assert.equal(internals.hasActiveStyleEditor(), false);
});

test('[wave4 comma decimal] numeric expressions accept one decimal comma and reject ambiguous commas', async () => {
  const { internals } = await loadOverlayInternals();
  const decimalComma = internals.parseNumericExpression('1,5', 'px');
  const decimalPoint = internals.parseNumericExpression('1.5', 'px');
  assert.deepEqual(JSON.parse(JSON.stringify(decimalComma)), JSON.parse(JSON.stringify(decimalPoint)));
  assert.deepEqual(
    JSON.parse(JSON.stringify(internals.parseNumericExpression('10,5 + 2', 'px'))),
    JSON.parse(JSON.stringify(internals.parseNumericExpression('10.5 + 2', 'px')))
  );
  assert.equal(internals.parseNumericExpression('1,2,3', 'px'), null);
});

test('[phase4 #13] numeric property label scrubbing previews inline and coalesces one intent on release', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const element = document.createElement('div');
  element.style = fakeStyle();
  internals.setStyleContext(element, { padding: '10px' }, [], '#target');
  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-value', '');
  valueCell.setAttribute('data-style-raw', '10px');
  valueCell.textContent = '10px';
  const row = {
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute(name, value) { this[name] = value; },
    querySelector(selector) { return selector === '[data-style-value]' ? valueCell : null; }
  };
  const label = document.createElement('span');
  label.parentElement = row;
  valueCell.parentElement = row;

  assert.equal(internals.beginStyleScrub(label, { clientX: 100, preventDefault() {} }), true);
  window.dispatch('mousemove', { clientX: 103, shiftKey: false, preventDefault() {} });
  assert.equal(element.style.getPropertyValue('padding'), '13px');
  assert.equal(valueCell.textContent, '13px');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);

  window.dispatch('mousemove', { clientX: 103, shiftKey: true, preventDefault() {} });
  assert.equal(element.style.getPropertyValue('padding'), '40px');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  window.dispatch('mouseup', {});
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'padding', oldValue: '10px', newValue: '40px' }
  ]);
  assert.equal(row['data-edited'], 'true');
});

test('[phase4 #14] border-radius expander parses shorthand and commits one composed corner edit', async () => {
  const { internals, document } = await loadOverlayInternals();
  assert.deepEqual(Array.from(internals.parseBorderRadius('4px')), ['4px', '4px', '4px', '4px']);
  assert.deepEqual(Array.from(internals.parseBorderRadius('4px 8px')), ['4px', '8px', '4px', '8px']);
  assert.deepEqual(Array.from(internals.parseBorderRadius('4px 8px 12px')), ['4px', '8px', '12px', '8px']);
  assert.deepEqual(Array.from(internals.parseBorderRadius('4px 8px 12px 16px')), ['4px', '8px', '12px', '16px']);
  assert.equal(internals.parseBorderRadius('4px / 8px'), null);
  assert.equal(internals.composeBorderRadius(['4px', '8px', '4px', '8px']), '4px 8px');
  assert.equal(internals.composeBorderRadius(['4px', '8px', '12px', '8px']), '4px 8px 12px');

  const element = document.createElement('div');
  element.style = fakeStyle();
  internals.setStyleContext(element, { 'border-radius': '4px 8px 12px' }, [], '#target');
  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-value', '');
  valueCell.setAttribute('data-style-raw', '4px 8px 12px');
  valueCell.textContent = '4px 8px 12px';
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'border-radius' : null; },
    setAttribute() {},
    querySelector(selector) { return selector === '[data-style-value]' ? valueCell : null; },
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  valueCell.parentElement = row;
  valueCell.parentNode = row;
  assert.equal(internals.beginRadiusEdit(row), true);
  const inputs = row.child.children[0].children.map((field) => field.children.find((child) => child.getAttribute('data-radius-corner') !== null));
  assert.deepEqual(inputs.map((input) => input.value), ['4px', '8px', '12px', '8px']);
  inputs[0].value = '16px';
  inputs[0].dispatch('input', {});
  assert.equal(element.style.getPropertyValue('border-radius'), '16px 8px 12px');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  inputs[0].dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'border-radius', oldValue: '4px 8px 12px', newValue: '16px 8px 12px' }
  ]);
});

test('[phase4 #15] color entry accepts bare hex, preserves alpha, and shows token-first page swatches', async () => {
  const { internals, document } = await loadOverlayInternals();
  assert.equal(internals.normalizeColorEntry('abcdef', 'rgba(1, 2, 3, 0.5)', 'hex'), '#abcdef80');
  assert.equal(internals.normalizeColorEntry('abcd', 'rgba(1, 2, 3, 0.5)', 'hex'), '#aabbccdd');
  assert.equal(internals.normalizeColorEntry('abcdefcc', 'rgba(1, 2, 3, 0.5)', 'hex'), '#abcdefcc');
  // Picking a color over a fully transparent original must come out visible,
  // not inherit alpha 0 (the #64748b00 invisible-fill bug, 2026-07-18).
  assert.equal(internals.normalizeColorEntry('64748b', 'rgba(0, 0, 0, 0)', 'hex'), '#64748b');
  assert.equal(internals.normalizeColorEntry('64748b00', 'rgba(1, 2, 3, 0.5)', 'hex'), '#64748b00');
  internals.setTokens([
    { path: 'colors.primary', group: 'colors', name: 'primary', value: '#112233', cssVar: '--colors-primary' },
    { path: 'spacing.small', group: 'spacing', name: 'small', value: '8px', cssVar: '--spacing-small' }
  ]);
  const used = document.createElement('section');
  used.computedStyle = fakeStyle({ color: 'rgb(1, 2, 3)', 'background-color': 'rgb(4, 5, 6)' });
  document.querySelectorAll = () => [used];
  const element = document.createElement('div');
  element.style = fakeStyle();
  internals.setStyleContext(element, { color: 'rgba(10, 20, 30, 0.5)' }, [], '#target');
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const cell = document.createElement('code');
  cell.setAttribute('data-style-raw', 'rgba(10, 20, 30, 0.5)');
  cell.parentElement = row;
  cell.parentNode = row;
  internals.beginStyleEdit(cell);
  let input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'color');
  const suggestions = row.child.children.find((child) => child.className === 'raven-grab-color-suggestions');
  assert.ok(suggestions);
  const suggestionButtons = suggestions.children.flatMap((group) => group.children.filter((child) => child.className === 'raven-grab-color-suggestion'));
  assert.equal(suggestionButtons[0].getAttribute('data-color-source'), 'token');
  assert.equal(suggestionButtons[0].getAttribute('data-color-suggestion'), '#112233');
  assert.equal(suggestionButtons.some((button) => button.getAttribute('data-color-source') === 'page' && button.getAttribute('data-color-suggestion') === '#010203'), true);
  assert.ok(suggestions.children.some((group) => group.children.some((child) => child.className === 'raven-grab-color-suggestion-caption' && child.textContent === 'Tokens')));
  assert.ok(suggestions.children.some((group) => group.children.some((child) => child.className === 'raven-grab-color-suggestion-caption' && child.textContent === 'On this page')));

  // A suggestion pick commits immediately — preview-only left the pick
  // stranded (nothing queued, silently reverted on the next click-away).
  suggestionButtons[0].dispatch('click', {});
  assert.equal(element.style.getPropertyValue('color'), 'rgba(17, 34, 51, 0.5)');
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    {
      property: 'color',
      oldValue: 'rgba(10, 20, 30, 0.5)',
      newValue: 'rgba(17, 34, 51, 0.5)',
      token: 'primary',
      tokenPath: 'colors.primary',
      cssVar: '--colors-primary'
    }
  ]);

  internals.beginStyleEdit(row.child);
  input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'color');
  // Preview via the native picker, then commit an invalid value — the rollback
  // must undo the live preview, not just skip the write.
  const picker = row.child.children.find((child) => child.className === 'raven-grab-color-input');
  picker.value = '#ff0000';
  picker.dispatch('input', {});
  assert.equal(element.style.getPropertyValue('color'), '#ff000080');
  input.value = 'definitely-invalid';
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(element.style.getPropertyValue('color'), 'rgba(17, 34, 51, 0.5)');
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    {
      property: 'color',
      oldValue: 'rgba(10, 20, 30, 0.5)',
      newValue: 'rgba(17, 34, 51, 0.5)',
      token: 'primary',
      tokenPath: 'colors.primary',
      cssVar: '--colors-primary'
    }
  ]);

  internals.beginStyleEdit(row.child);
  const repeatedSuggestions = row.child.children.find((child) => child.className === 'raven-grab-color-suggestions');
  const repeatedSuggestionButtons = repeatedSuggestions.children.flatMap((group) => group.children.filter((child) => child.className === 'raven-grab-color-suggestion'));
  repeatedSuggestionButtons[0].dispatch('click', {});
  internals.beginStyleEdit(row.child);
  input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'color');
  input.value = 'abcdef';
  input.dispatch('input', {});
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgba(10, 20, 30, 0.5)', newValue: 'rgba(171, 205, 239, 0.5)' }
  ]);

  internals.beginStyleEdit(row.child);
  input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'color');
  input.value = 'abcdef';
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(element.style.getPropertyValue('color'), 'rgba(171, 205, 239, 0.5)');
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgba(10, 20, 30, 0.5)', newValue: 'rgba(171, 205, 239, 0.5)' }
  ]);
});

test('overlay computed-style identical, invalid, and cancelled edits record nothing', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(0, 0, 0)' }) };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });

  assert.equal(internals.commitStyleEdit('color', 'rgb(0, 0, 0)', 'rgb(0, 0, 0)'), false);
  assert.equal(internals.commitStyleEdit('color', 'definitely-invalid', 'rgb(0, 0, 0)'), false);
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const valueCell = document.createElement('code');
  valueCell.textContent = 'rgb(0, 0, 0)';
  valueCell.parentElement = row;
  valueCell.parentNode = row;
  internals.beginStyleEdit(valueCell);
  const input = row.child.children.find((child) => child.type === 'text');
  input.dispatch('keydown', {
    key: 'Escape',
    preventDefault() {},
    stopPropagation() {}
  });

  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  assert.equal(element.style.getPropertyValue('color'), 'rgb(0, 0, 0)');
  assert.equal(row.child.textContent, 'rgb(0, 0, 0)');
});

test('overlay grab payload includes computed style edits', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(0, 0, 0)' }) };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });
  internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)');

  assert.deepEqual(Array.from(internals.payloadForSend().styleEdits, (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(0, 0, 0)', newValue: 'rgb(20, 20, 20)' }
  ]);
});

test('overlay detects component scope from exact tag and class-list matches', async () => {
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    querySelectorAll: () => candidates
  });
  const selected = document.createElement('article');
  selected.localName = 'article';
  selected.classList = ['featured', 'card'];
  const peer = document.createElement('article');
  peer.localName = 'article';
  peer.classList = ['card', 'featured'];
  const extraClass = document.createElement('article');
  extraClass.localName = 'article';
  extraClass.classList = ['card', 'featured', 'selected'];
  const disconnected = document.createElement('article');
  disconnected.localName = 'article';
  disconnected.classList = ['card', 'featured'];
  disconnected.isConnected = false;
  candidates = [selected, peer, extraClass, disconnected];

  assert.equal(typeof internals.componentScopeFor, 'function');
  assert.deepEqual(
    JSON.parse(JSON.stringify(internals.componentScopeFor(selected, { componentName: 'FeatureCard' }))),
    {
      componentName: 'FeatureCard',
      matchSelector: 'article.card.featured',
      matchCount: 2
    }
  );
});

test('REGRESSION: font stacks keep quotes per-part and drop Next.js / Fallback faces', async () => {
  const { internals } = await loadOverlayInternals();
  const fonts = internals.fontFamilyOptions('Inter, "Inter Fallback", __nextjs-Geist');
  assert.ok(fonts.indexOf('Inter') !== -1);
  assert.equal(fonts.indexOf('Inter, "Inter Fallback"'), -1);
  assert.equal(fonts.indexOf('Inter, "Inter Fallback'), -1);
  assert.ok(fonts.every((name) => !/Fallback/i.test(name)));
  assert.ok(fonts.every((name) => !/^__nextjs/i.test(name)));
  assert.ok(fonts.every((name) => name.charAt(name.length - 1) !== '"'));
});

test('REGRESSION: base class + per-instance modifier still opens sibling scope', async () => {
  // .cell.cell-1 … .cell.cell-6 never match each other by exact signature, so
  // the Scope switch used to vanish on ordinary hand-written markup.
  const { internals, document } = await loadOverlayInternals({
    querySelectorAll: () => []
  });
  const parent = document.createElement('section');
  parent.localName = 'section';
  parent.parentElement = document.body;
  const cells = [1, 2, 3].map((n) => {
    const cell = document.createElement('div');
    cell.localName = 'div';
    cell.classList = ['cell', 'cell-' + n];
    cell.parentElement = parent;
    return cell;
  });
  // A same-tag sibling sharing no distinctive class must stay out of the set.
  const stranger = document.createElement('div');
  stranger.localName = 'div';
  stranger.classList = ['footnote'];
  stranger.parentElement = parent;
  parent.children = cells.concat([stranger]);

  const scope = internals.componentScopeFor(cells[0], null);
  assert.equal(scope.matchCount, 3);
  assert.equal(scope.siblingScoped, true);
  // Joined: the sandbox realm's Array fails deepStrictEqual's prototype check.
  assert.equal(Array.prototype.join.call(scope.sharedClasses, ','), 'cell');
  assert.match(scope.matchSelector, /div\.cell$/);
});

test('REGRESSION: utility-class atoms do not open "All N like this" scope', async () => {
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    querySelectorAll: (selector) => {
      if (String(selector).indexOf('inline-block') !== -1) return candidates;
      return [];
    }
  });
  assert.equal(internals.isUtilityClassName('inline-block'), true);
  assert.equal(internals.isUtilityClassName('flex'), true);
  assert.equal(internals.isUtilityClassName('card'), false);
  const letter = document.createElement('span');
  letter.localName = 'span';
  letter.classList = ['inline-block'];
  candidates = Array.from({ length: 42 }, () => {
    const peer = document.createElement('span');
    peer.localName = 'span';
    peer.classList = ['inline-block'];
    return peer;
  });
  candidates[0] = letter;
  const scope = internals.componentScopeFor(letter, null);
  assert.equal(scope.matchCount, 0);
  assert.ok(!scope.matchSelector || scope.matchSelector === '');
});

test('REGRESSION: data-raven-component scope matches by attribute, not utilities', async () => {
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    querySelectorAll: (selector) => {
      if (String(selector).indexOf('data-raven-component') !== -1) return candidates;
      return [];
    }
  });
  const a = document.createElement('div');
  a.localName = 'div';
  a.classList = ['flex', 'p-4'];
  a.setAttribute('data-raven-component', 'DemoCard');
  const b = document.createElement('div');
  b.localName = 'div';
  b.classList = ['grid', 'gap-2'];
  b.setAttribute('data-raven-component', 'DemoCard');
  candidates = [a, b];
  const scope = internals.componentScopeFor(a, { componentName: 'DemoCard' });
  assert.equal(scope.componentName, 'DemoCard');
  assert.equal(scope.matchCount, 2);
  assert.match(scope.matchSelector, /data-raven-component/);
});

test('REGRESSION: selection label prefers component/text over deep CSS path', async () => {
  const { internals, document } = await loadOverlayInternals();
  const el = document.createElement('span');
  el.localName = 'span';
  el.classList = ['inline-block'];
  el.setAttribute('data-raven-component', 'FeatureCard');
  el.childNodes = [{ nodeType: 3, nodeValue: 'Hello world' }];
  const label = internals.selectionDisplayLabel(el, {
    selector: 'span.block > span.inline-block:nth-of-type(3)',
    componentScope: { componentName: 'FeatureCard', matchCount: 2 }
  });
  assert.equal(label, 'FeatureCard · Hello world');
  assert.ok(label.indexOf('nth-of-type') === -1);
});

test('REGRESSION: layers skip script/JSON-LD and do not label body with schema.org', async () => {
  const { internals, document } = await loadOverlayInternals();
  const script = document.createElement('script');
  script.tagName = 'SCRIPT';
  script.localName = 'script';
  script.setAttribute('type', 'application/ld+json');
  script.textContent = '{"@context":"https://schema.org"}';
  assert.equal(internals.shouldSkipLayerElement(script), true);
  const body = document.createElement('body');
  body.tagName = 'BODY';
  body.localName = 'body';
  body.textContent = '{"@context":"https://schema.org"}';
  body.childNodes = [{ nodeType: 1, tagName: 'SCRIPT', textContent: '{"@context":"https://schema.org"}' }];
  assert.equal(internals.shortenedLayerText(body), '');
});

test('REGRESSION: empty bridge tokens surface an explicit empty state', async () => {
  const { internals, document } = await loadOverlayInternals();
  const target = document.createElement('div');
  target.localName = 'div';
  target.style = fakeStyle();
  internals.setTokens({});
  internals.setStyleContext(target, { color: 'rgb(0, 0, 0)' }, [], 'div');
  internals.renderPanel();
  assert.match(internals.getPanelHtml(), /No design tokens found for this project/);
});

test('the instruction textarea carries its own accessible name', async () => {
  const { internals } = await loadOverlayInternals();
  internals.expandPanel();
  internals.renderPanel();

  // The visible "Instructions" heading is an <h2>, not a <label> -- it never named
  // this field, and the narrow layout hides it to buy the scrolling body 24px. So
  // the name has to live on the control itself, or a screen reader is left with
  // only the placeholder.
  // Matched on the tag then both attributes, so reordering attributes cannot fail it.
  const tag = (internals.getPanelHtml().match(/<textarea[^>]*data-instruction[^>]*>/) || [])[0];
  assert.ok(tag, 'the instruction textarea should render');
  assert.match(
    tag,
    /aria-label="Instructions"/,
    'the compose field must name itself rather than relying on a heading the narrow layout drops'
  );
});

test('[wave4 P5] component-scoped intents resnapshot live matches at send time and drop scope below two', async () => {
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    querySelectorAll: () => candidates
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.classList = ['action'];
  selected.style = fakeStyle();
  const firstPeer = document.createElement('button');
  firstPeer.localName = 'button';
  firstPeer.classList = ['action'];
  const addedPeer = document.createElement('button');
  addedPeer.localName = 'button';
  addedPeer.classList = ['action'];
  candidates = [selected, firstPeer];
  internals.setStyleContext(selected, { padding: '8px' }, [], '#action', {}, {
    matchSelector: 'button.action', matchCount: 2
  });
  internals.setIntentRecords({}, {
    padding: { property: 'padding', oldValue: '8px', newValue: '12px' }
  });
  assert.equal(internals.setEditScope('component'), true);

  candidates = [selected, firstPeer, addedPeer];
  const addedPayload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  assert.equal(addedPayload.styleEdits[0].scope, 'component');
  assert.equal(addedPayload.styleEdits[0].matchSelector, 'button.action');
  assert.equal(addedPayload.styleEdits[0].matchCount, 3);

  candidates = [selected];
  const removedPayload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  assert.deepEqual(removedPayload.styleEdits, [
    { property: 'padding', oldValue: '8px', newValue: '12px' }
  ]);
});

test('overlay component scope is opt-in, scopes both intent types, previews one instance, persists with the pinned owner, and falls back below two live matches', async () => {
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    querySelectorAll: () => candidates
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.classList = ['action'];
  selected.style = fakeStyle();
  selected.closest = () => null;
  const peer = document.createElement('button');
  peer.localName = 'button';
  peer.classList = ['action'];
  peer.style = fakeStyle();
  peer.closest = () => null;
  candidates = [selected, peer];
  const componentScope = { componentName: 'ActionButton', matchSelector: 'button.action', matchCount: 2 };
  const tokenIntent = {
    property: 'color',
    oldToken: 'primary',
    oldTokenPath: 'colors.primary',
    newToken: 'secondary',
    newTokenPath: 'colors.secondary',
    newTokenValue: '#222222'
  };
  const styleEdit = { property: 'padding', oldValue: '8px', newValue: '12px' };
  internals.setStyleContext(selected, { padding: '8px' }, [], '#action', {}, componentScope);
  internals.setIntentRecords({ 0: tokenIntent }, { padding: styleEdit });

  const defaultPayloadBytes = JSON.stringify(internals.payloadForSend());
  assert.equal(
    defaultPayloadBytes,
    '{"selector":"#action","html":"","rect":{},"styles":{"padding":"8px"},"tokens":[],"stateStyles":{},"tokenIntents":[{"property":"color","oldToken":"primary","oldTokenPath":"colors.primary","newToken":"secondary","newTokenPath":"colors.secondary","newTokenValue":"#222222"}],"styleEdits":[{"property":"padding","oldValue":"8px","newValue":"12px"}],"stateStyleEdits":[],"instruction":""}'
  );
  assert.doesNotMatch(defaultPayloadBytes, /"scope"|"matchSelector"|"matchCount"/);

  internals.renderPanel();
  assert.match(internals.getPanelHtml(), /data-edit-scope="instance"[^>]*aria-pressed="true"/);
  assert.match(internals.getPanelHtml(), /data-edit-scope="component"[^>]*aria-label="All siblings \(2\)"/);
  assert.match(internals.getPanelHtml(), /All siblings/);
  assert.match(internals.getPanelHtml(), /raven-grab-scope-ico" data-kind="siblings"/);
  const componentChip = {
    closest(selector) { return selector === '[data-edit-scope]' ? this : null; },
    getAttribute(name) { return name === 'data-edit-scope' ? 'component' : null; }
  };
  internals.dispatchPanel('click', { target: componentChip, stopPropagation() {} });
  assert.equal(internals.getEditScope(), 'component');
  assert.match(internals.getPanelHtml(), /data-edit-scope="component"[^>]*aria-pressed="true"/);
  assert.match(internals.getPanelHtml(), /data-scope-value="component"/);
  const scopedPayload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  for (const intent of [...scopedPayload.tokenIntents, ...scopedPayload.styleEdits]) {
    assert.equal(intent.scope, 'component');
    assert.equal(intent.matchSelector, 'button.action');
    assert.equal(intent.matchCount, 2);
  }

  internals.commitStyleEdit('padding', '16px', '12px');
  assert.equal(selected.style.getPropertyValue('padding'), '16px');
  // Component scope is live for this edit, so the browser-tab preview mirrors
  // the change onto every matched instance, not just the selected one — the
  // scoped payload already told the backend to apply it everywhere.
  assert.equal(peer.style.getPropertyValue('padding'), '16px');

  internals.selectTarget(peer, true);
  // The edited element stays pinned as primary, so its component-scope choice
  // persists across the selection change: downgrading a staged "apply to all
  // instances" edit to instance-only just because another element was added
  // would silently lose the user's choice. Scope survives with the owner.
  assert.equal(internals.getEditScope(), 'component');
  assert.equal(internals.getSelectionModel().primary, selected, 'pending work keeps the edited primary pinned');
  assert.equal(internals.getSelectionModel().order.length, 2, 'the ordered selection still changes');
  const pinnedPayload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  for (const intent of [...pinnedPayload.tokenIntents, ...pinnedPayload.styleEdits]) {
    assert.equal(intent.scope, 'component');
    assert.equal(intent.matchSelector, 'button.action');
    assert.equal(intent.matchCount, 2);
  }
  assert.match(internals.getPanelHtml(), /data-edit-scope="component"[^>]*aria-pressed="true"/);

  assert.equal(internals.setEditScope('component'), true);
  peer.isConnected = false;
  internals.orderedSelection();
  assert.equal(internals.getSelectionModel().primary, selected);
  assert.equal(internals.getSelectionModel().order.length, 1);
  // The real safety gate is still intact: once fewer than two live instances
  // match, component scope falls back to instance and drops from the payload.
  assert.equal(internals.getEditScope(), 'instance', 'below two live matches, scope falls back to instance');
  assert.doesNotMatch(JSON.stringify(internals.payloadForSend()), /"scope"|"matchSelector"|"matchCount"/);
});

test('overlay hides the scope chip when fewer than two component instances match', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.setStyleContext(
    document.createElement('div'),
    { color: '#111111' },
    [],
    '#only',
    {},
    { matchSelector: 'div.only', matchCount: 1 }
  );
  internals.renderPanel();
  assert.doesNotMatch(internals.getPanelHtml(), /data-edit-scope=/);
});

test('overlay shift-click builds an ordered three-element multi-select payload', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  const third = document.createElement('footer');
  first.localName = 'header';
  second.localName = 'main';
  third.localName = 'footer';
  for (const element of [first, second, third]) element.closest = () => null;

  internals.selectTarget(first, false);
  internals.selectTarget(second, true);
  internals.selectTarget(third, true);

  const payload = internals.payloadForSend();
  assert.deepEqual(Array.from(payload.multiSelect, (selection) => ({
    index: selection.index,
    selector: selection.selector
  })), [
    { index: 1, selector: 'header' },
    { index: 2, selector: 'main' },
    { index: 3, selector: 'footer' }
  ]);
});

test('overlay plain click after multi-select resets and omits multiSelect', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  const reset = document.createElement('footer');
  first.localName = 'header';
  second.localName = 'main';
  reset.localName = 'footer';
  for (const element of [first, second, reset]) element.closest = () => null;

  internals.selectTarget(first, false);
  internals.selectTarget(second, true);
  assert.equal(internals.getMultiSelectionCount(), 2);
  internals.selectTarget(reset, false);

  assert.equal(internals.getMultiSelectionCount(), 1);
  assert.equal(Object.hasOwn(internals.payloadForSend(), 'multiSelect'), false);
});

test('plain Layers row mouseup selects one element and renders data-selected', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  first.localName = 'header';
  second.localName = 'main';
  first.parentElement = document.body;
  second.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second]], first);
  internals.renderPanel();
  const row = document.createElement('li');
  row.setAttribute('data-layer-id', '3');
  row.setAttribute('data-layer-parent', '1');

  clickPanelRow(internals, window, row);

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [second]);
  assert.equal(model.primary, second);
  assert.equal(model.anchor, second);
  assert.equal(model.origin, 'panel');
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="3"[^>]*data-selected="true"/);
});

test('plain Layers row mouseup uses the same unified selection', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const section = document.createElement('section');
  const child = document.createElement('article');
  section.localName = 'section';
  child.localName = 'article';
  section.parentElement = document.body;
  child.parentElement = section;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
      { id: 3, parentId: 2, depth: 2, label: 'article', badges: [], children: [] }
    ] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, section], [3, child]], section);
  internals.renderPanel();
  const row = document.createElement('li');
  row.setAttribute('data-layer-id', '3');

  clickPanelRow(internals, window, row);

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [child]);
  assert.equal(model.primary, child);
  assert.equal(model.anchor, child);
  assert.equal(model.origin, 'panel');
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="3"[^>]*data-selected="true"/);
});

test('shift-click selects a visible flattened range across depths and keeps the panel anchor', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const section = document.createElement('section');
  const article = document.createElement('article');
  const aside = document.createElement('aside');
  const footer = document.createElement('footer');
  section.parentElement = document.body;
  article.parentElement = section;
  aside.parentElement = document.body;
  footer.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
      { id: 3, parentId: 2, depth: 2, label: 'article', badges: [], children: [] }
    ] },
    { id: 4, parentId: 1, depth: 1, label: 'aside', badges: [], children: [] },
    { id: 5, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, section], [3, article], [4, aside], [5, footer]], null);
  internals.renderPanel();
  const anchorRow = document.createElement('li');
  anchorRow.setAttribute('data-layer-id', '2');
  anchorRow.setAttribute('data-layer-parent', '1');
  const footerRow = document.createElement('li');
  footerRow.setAttribute('data-layer-id', '5');
  footerRow.setAttribute('data-layer-parent', '1');
  const clickedRow = document.createElement('li');
  clickedRow.setAttribute('data-layer-id', '4');
  clickedRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, anchorRow);
  clickPanelRow(internals, window, footerRow, { metaKey: true });

  clickPanelRow(internals, window, clickedRow, { shiftKey: true });

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [section, article, aside]);
  assert.equal(model.primary, aside);
  assert.equal(model.anchor, section);
  assert.equal(model.origin, 'panel');
  const markup = internals.layerRowsMarkup(tree);
  for (const id of [2, 3, 4]) assert.match(markup, new RegExp('data-layer-id="' + id + '"[^>]*data-selected="true"'));
  assert.doesNotMatch(markup, /data-layer-id="5"[^>]*data-selected="true"/);
});

test('Template shift-range replaces an invisible anchor with the first clicked visible row', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const hiddenAnchor = document.createElement('header');
  const firstVisible = document.createElement('main');
  const middleVisible = document.createElement('aside');
  const lastVisible = document.createElement('footer');
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] },
    { id: 4, parentId: 1, depth: 1, label: 'aside', badges: [], children: [] },
    { id: 5, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  const drafts = [
    { nodeId: 3, slotId: 'main', selector: 'body > main', role: 'flexible', note: '' },
    { nodeId: 4, slotId: 'aside', selector: 'body > aside', role: 'flexible', note: '' },
    { nodeId: 5, slotId: 'footer', selector: 'body > footer', role: 'fixed', note: '' }
  ];
  internals.setTemplateTestState(
    tree,
    [[1, document.body], [2, hiddenAnchor], [3, firstVisible], [4, middleVisible], [5, lastVisible]],
    [],
    drafts,
    'Product page',
    false,
    hiddenAnchor
  );
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-template-layer-id', '3');
  const lastRow = document.createElement('li');
  lastRow.setAttribute('data-template-layer-id', '5');

  clickPanelRow(internals, window, firstRow, { shiftKey: true });
  assert.deepEqual(Array.from(internals.getSelectionModel().order), [firstVisible]);
  assert.equal(internals.getSelectionModel().anchor, firstVisible);

  clickPanelRow(internals, window, lastRow, { shiftKey: true });
  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [firstVisible, middleVisible, lastVisible]);
  assert.equal(model.primary, lastVisible);
  assert.equal(model.anchor, firstVisible);
});

test('cmd-click toggles a panel row and falls primary back to the last ordered selection', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  first.parentElement = document.body;
  second.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second]], null);
  internals.renderPanel();
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  const secondRow = document.createElement('li');
  secondRow.setAttribute('data-layer-id', '3');
  secondRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, firstRow);
  clickPanelRow(internals, window, secondRow, { metaKey: true });
  const added = internals.getSelectionModel();
  assert.deepEqual(Array.from(added.order), [first, second]);
  assert.equal(added.primary, second);
  assert.equal(added.anchor, first);

  clickPanelRow(internals, window, secondRow, { metaKey: true });

  const removed = internals.getSelectionModel();
  assert.deepEqual(Array.from(removed.order), [first]);
  assert.equal(removed.primary, first);
  assert.equal(removed.anchor, first);
  assert.equal(removed.origin, 'panel');
});

test('un-sent style edit survives panel shift-range selection with edited primary pinned', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const edited = document.createElement('header');
  const middle = document.createElement('main');
  const appended = document.createElement('footer');
  edited.parentElement = document.body;
  middle.parentElement = document.body;
  appended.parentElement = document.body;
  edited.style = fakeStyle({ color: 'rgb(1, 2, 3)' }, { color: 'important' });

  const tree = {
    id: 1,
    parentId: null,
    depth: 0,
    label: 'body',
    badges: [],
    children: [
      { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
      { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] },
      { id: 4, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
    ]
  };

  internals.setLayerTestState(
    tree,
    [[1, document.body], [2, edited], [3, middle], [4, appended]],
    edited
  );
  internals.setStyleContext(
    edited,
    { color: 'rgb(1, 2, 3)' },
    [],
    '#edited'
  );
  assert.equal(
    internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(1, 2, 3)'),
    true
  );
  internals.renderPanel();

  const appendedRow = document.createElement('li');
  appendedRow.setAttribute('data-layer-id', '4');
  appendedRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, appendedRow, { shiftKey: true });

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [edited, middle, appended]);
  assert.equal(model.primary, edited, 'the element owning the un-sent edit stays primary');
  assert.deepEqual(
    Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })),
    [
      {
        property: 'color',
        oldValue: 'rgb(1, 2, 3)',
        newValue: 'rgb(20, 20, 20)'
      }
    ],
    'the un-sent style edit stays queued'
  );
  assert.equal(
    edited.style.getPropertyValue('color'),
    'rgb(20, 20, 20)',
    'shift-append must not roll back the inline preview'
  );
});

test('token-intent-only pending work pins the primary during panel selection', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const intentOwner = document.createElement('header');
  const appended = document.createElement('main');
  intentOwner.parentElement = document.body;
  appended.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  const intent = {
    property: 'color',
    oldToken: 'primary',
    oldTokenPath: 'colors.primary',
    newToken: 'accent',
    newTokenPath: 'colors.accent',
    newTokenValue: '#336699'
  };
  internals.setLayerTestState(tree, [[1, document.body], [2, intentOwner], [3, appended]], intentOwner);
  internals.setTokenIntent(0, intent);
  internals.renderPanel();
  const appendedRow = document.createElement('li');
  appendedRow.setAttribute('data-layer-id', '3');
  appendedRow.setAttribute('data-layer-parent', '1');

  clickPanelRow(internals, window, appendedRow, { shiftKey: true });

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [intentOwner, appended]);
  assert.equal(model.primary, intentOwner);
  assert.equal(internals.getTokenIntents()[0].newTokenPath, 'colors.accent');
  assert.equal(Object.keys(internals.getTokenIntents()).length, 1);
});

test('instruction-draft-only pending work pins the primary during panel selection', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const draftOwner = document.createElement('header');
  const appended = document.createElement('main');
  draftOwner.parentElement = document.body;
  appended.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, draftOwner], [3, appended]], draftOwner);
  const instruction = document.createElement('textarea');
  instruction.setAttribute('data-instruction', '');
  instruction.value = 'make it blue';
  internals.dispatchPanel('input', { target: instruction });
  internals.renderPanel();
  const appendedRow = document.createElement('li');
  appendedRow.setAttribute('data-layer-id', '3');
  appendedRow.setAttribute('data-layer-parent', '1');

  clickPanelRow(internals, window, appendedRow, { shiftKey: true });

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [draftOwner, appended]);
  assert.equal(model.primary, draftOwner);
  assert.equal(internals.getInstructionDraft(), 'make it blue');
});

test('Layers-tab markup marks exactly one primary row when a later row is primary', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('header');
  const laterPrimary = document.createElement('footer');
  first.parentElement = document.body;
  laterPrimary.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, laterPrimary]], first);
  internals.selectTarget(laterPrimary, true, 'panel');

  const markup = internals.getPanelLeftHtml();
  const primaryRows = markup.match(/<li class="raven-grab-layer-row"[^>]*data-layer-id[^>]*data-primary="true"[^>]*>/g) || [];
  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [first, laterPrimary]);
  assert.equal(model.primary, laterPrimary);
  assert.equal(primaryRows.length, 1);
  assert.match(primaryRows[0], /data-layer-id="3"/);
});

test('post-selection scroll targets the primary row instead of the first selected row', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  internals.expandPanel();
  const first = document.createElement('header');
  const middle = document.createElement('main');
  const primary = document.createElement('footer');
  first.parentElement = document.body;
  middle.parentElement = document.body;
  primary.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] },
    { id: 4, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, middle], [4, primary]], null);
  internals.renderPanel();
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  const lastRow = document.createElement('li');
  lastRow.setAttribute('data-layer-id', '4');
  lastRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, firstRow);
  const scrolled = [];
  const firstSelectedRow = document.createElement('li');
  firstSelectedRow.setAttribute('data-layer-id', '2');
  firstSelectedRow.setAttribute('data-selected', 'true');
  firstSelectedRow.scrollIntoView = function () { scrolled.push(this.getAttribute('data-layer-id')); };
  const primaryRow = document.createElement('li');
  primaryRow.setAttribute('data-layer-id', '4');
  primaryRow.setAttribute('data-selected', 'true');
  primaryRow.setAttribute('data-primary', 'true');
  primaryRow.scrollIntoView = function () { scrolled.push(this.getAttribute('data-layer-id')); };
  internals.setPanelLeftQuery('.raven-grab-layer-row[data-selected="true"]', firstSelectedRow);
  internals.setPanelLeftQuery('.raven-grab-layer-row[data-primary="true"]', primaryRow);

  clickPanelRow(internals, window, lastRow, { shiftKey: true });

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [first, middle, primary]);
  assert.equal(model.primary, primary);
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="2"[^>]*data-selected="true"/);
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="4"[^>]*data-selected="true"[^>]*data-primary="true"/);
  assert.deepEqual(scrolled, ['4']);
});

test('detached-primary promotion resets edit context on the original style target', async () => {
  const { internals, document } = await loadOverlayInternals();
  const promoted = document.createElement('main');
  const editedPrimary = document.createElement('header');
  promoted.parentElement = document.body;
  editedPrimary.parentElement = document.body;
  const primaryCalls = [];
  const promotedCalls = [];
  editedPrimary.style = fakeStyle({ color: 'rgb(1, 2, 3)' }, { color: 'important' });
  promoted.style = fakeStyle({ color: 'rgb(9, 9, 9)' });
  const primarySet = editedPrimary.style.setProperty.bind(editedPrimary.style);
  const primaryRemove = editedPrimary.style.removeProperty.bind(editedPrimary.style);
  const promotedSet = promoted.style.setProperty.bind(promoted.style);
  const promotedRemove = promoted.style.removeProperty.bind(promoted.style);
  editedPrimary.style.setProperty = (property, value, priority) => {
    primaryCalls.push(['set', property, value, priority || '']);
    primarySet(property, value, priority);
  };
  editedPrimary.style.removeProperty = (property) => {
    primaryCalls.push(['remove', property]);
    primaryRemove(property);
  };
  promoted.style.setProperty = (property, value, priority) => {
    promotedCalls.push(['set', property, value, priority || '']);
    promotedSet(property, value, priority);
  };
  promoted.style.removeProperty = (property) => {
    promotedCalls.push(['remove', property]);
    promotedRemove(property);
  };
  internals.selectTarget(promoted, false);
  internals.selectTarget(editedPrimary, true);
  assert.equal(internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(1, 2, 3)'), true);
  const callsBeforePromotion = primaryCalls.length;
  Object.defineProperty(editedPrimary, 'isConnected', { get() { return false; } });

  internals.orderedSelection();

  assert.equal(internals.getSelectionModel().primary, promoted);
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  assert.equal(editedPrimary.style.getPropertyValue('color'), 'rgb(1, 2, 3)');
  assert.equal(editedPrimary.style.getPropertyPriority('color'), 'important');
  assert.equal(primaryCalls.length, callsBeforePromotion + 1, 'rollback restores the detached edit target');
  assert.deepEqual(primaryCalls.at(-1), ['set', 'color', 'rgb(1, 2, 3)', 'important']);
  // Multi-select style writes apply to every selected layer; rollback restores the
  // promoted sibling's captured original too.
  assert.deepEqual(promotedCalls, [
    ['set', 'color', 'rgb(20, 20, 20)', ''],
    ['set', 'color', 'rgb(9, 9, 9)', '']
  ]);
});

test('open computed-style editor commits on panel row mousedown before selection mouseup', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const edited = document.createElement('header');
  const appended = document.createElement('main');
  edited.parentElement = document.body;
  appended.parentElement = document.body;
  edited.style = fakeStyle({ color: 'rgb(1, 2, 3)' });
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, edited], [3, appended]], edited);
  internals.setStyleContext(edited, { color: 'rgb(1, 2, 3)' }, [], '#edited');
  const styleRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-raw', 'rgb(1, 2, 3)');
  valueCell.textContent = 'rgb(1, 2, 3)';
  valueCell.parentElement = styleRow;
  valueCell.parentNode = styleRow;
  internals.beginStyleEdit(valueCell);
  const input = styleRow.child.children.find((child) => child.type === 'text');
  input.value = 'rgb(20, 20, 20)';
  const appendedRow = document.createElement('li');
  appendedRow.setAttribute('data-layer-id', '3');
  appendedRow.setAttribute('data-layer-parent', '1');
  const target = panelRowTarget(appendedRow);

  internals.dispatchPanelLeft('mousedown', {
    target,
    button: 0,
    clientX: 20,
    clientY: 20,
    shiftKey: true,
    metaKey: false,
    ctrlKey: false,
    preventDefault() {}
  });
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(1, 2, 3)', newValue: 'rgb(20, 20, 20)' }
  ]);

  window.dispatch('mouseup', {
    type: 'mouseup',
    target,
    shiftKey: true,
    metaKey: false,
    ctrlKey: false
  });

  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(1, 2, 3)', newValue: 'rgb(20, 20, 20)' }
  ]);
  assert.deepEqual(Array.from(internals.getSelectionModel().order), [edited, appended]);
  assert.equal(internals.getSelectionModel().primary, edited);
});

test('stale computed-style editor flush cancels after async primary promotion', async () => {
  const { internals, document } = await loadOverlayInternals();
  const edited = document.createElement('header');
  const promoted = document.createElement('main');
  edited.style = fakeStyle({ color: 'rgb(1, 2, 3)' });
  promoted.style = fakeStyle({ color: 'rgb(9, 9, 9)' });
  internals.setStyleContext(edited, { color: 'rgb(1, 2, 3)' }, [], '#edited');
  const styleRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-raw', 'rgb(1, 2, 3)');
  valueCell.textContent = 'rgb(1, 2, 3)';
  valueCell.parentElement = styleRow;
  valueCell.parentNode = styleRow;
  internals.beginStyleEdit(valueCell);
  const input = styleRow.child.children.find((child) => child.type === 'text');
  input.value = 'rgb(20, 20, 20)';

  internals.selectTarget(promoted, false, 'canvas');
  input.isConnected = false;
  const promotedRow = document.createElement('li');
  promotedRow.setAttribute('data-layer-id', '2');
  assert.doesNotThrow(() => {
    internals.dispatchPanelLeft('mousedown', {
      target: panelRowTarget(promotedRow),
      button: 0,
      clientX: 20,
      clientY: 20,
      preventDefault() {}
    });
  });

  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  assert.equal(promoted.style.getPropertyValue('color'), 'rgb(9, 9, 9)');
});

test('payloadForSend promotes a live fallback and drops edits from a detached primary', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fallback = document.createElement('main');
  const detachedPrimary = document.createElement('header');
  fallback.localName = 'main';
  detachedPrimary.localName = 'header';
  fallback.style = fakeStyle({ color: 'rgb(9, 9, 9)' });
  detachedPrimary.style = fakeStyle({ color: 'rgb(1, 2, 3)' });
  internals.selectTarget(fallback, false, 'canvas');
  internals.selectTarget(detachedPrimary, true, 'canvas');
  assert.equal(internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(1, 2, 3)'), true);
  detachedPrimary.isConnected = false;

  const payload = internals.payloadForSend();

  assert.equal(payload.selector, 'main');
  assert.deepEqual(Array.from(payload.styleEdits), []);
  assert.deepEqual(Array.from(internals.getSelectionModel().order), [fallback]);
});

test('payloadForSend rejects a detached single selection', async () => {
  const { internals, document } = await loadOverlayInternals();
  const detached = document.createElement('main');
  detached.localName = 'main';
  internals.selectTarget(detached, false, 'canvas');
  detached.isConnected = false;

  assert.throws(
    () => internals.payloadForSend(),
    /no longer on the page/
  );
});

test('Layers row range selection uses modifiers captured at mousedown', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  const third = document.createElement('footer');
  first.parentElement = document.body;
  second.parentElement = document.body;
  third.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] },
    { id: 4, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second], [4, third]], null);
  internals.renderPanel();
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  const thirdRow = document.createElement('li');
  thirdRow.setAttribute('data-layer-id', '4');
  thirdRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, firstRow); // establish anchor = header

  // mousedown carries shiftKey:true (range intent); mouseup drops it to false
  clickPanelRow(internals, window, thirdRow, { shiftKey: true }, { shiftKey: false });

  const model = internals.getSelectionModel();
  // Range selection [first..third] only happens if the mousedown's shiftKey won.
  assert.deepEqual(Array.from(model.order), [first, second, third]);
  assert.equal(model.primary, third);
  assert.equal(model.anchor, first);
  assert.equal(model.origin, 'panel');
});

test('Layers row plain selection ignores modifiers introduced at mouseup', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  first.parentElement = document.body;
  second.parentElement = document.body;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second]], null);
  internals.renderPanel();
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  const secondRow = document.createElement('li');
  secondRow.setAttribute('data-layer-id', '3');
  secondRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, firstRow);

  // mousedown plain (no modifiers); mouseup introduces metaKey:true
  clickPanelRow(internals, window, secondRow, {}, { metaKey: true });

  const model = internals.getSelectionModel();
  // Plain single selection [second] only happens if the mouseup's metaKey was ignored;
  // if the (buggy, pre-fix) code read the mouseup event's metaKey, this would instead
  // toggle-add second onto the existing selection, producing [first, second].
  assert.deepEqual(Array.from(model.order), [second]);
  assert.equal(model.primary, second);
  assert.equal(model.anchor, second);
  assert.equal(model.origin, 'panel');
});

test('an edited primary that leaves the selection persists as a stored style draft (accumulate)', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  first.parentElement = document.body;
  second.parentElement = document.body;
  first.style.setProperty('color', 'rgb(1, 2, 3)', 'important');
  first.computedStyle = fakeStyle({ color: 'rgb(1, 2, 3)' });
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second]], null);
  internals.renderPanel();
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  const secondRow = document.createElement('li');
  secondRow.setAttribute('data-layer-id', '3');
  secondRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, secondRow);
  clickPanelRow(internals, window, firstRow, { metaKey: true });
  assert.equal(internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(1, 2, 3)'), true);
  assert.equal(first.style.getPropertyValue('color'), 'rgb(20, 20, 20)');

  // meta-click first again -> first leaves the selection. Its edit no longer
  // rolls back: the inline preview stays applied and the edit is stashed as a
  // per-element draft so one Send dispatches it alongside other elements' edits.
  clickPanelRow(internals, window, firstRow, { metaKey: true });

  // The active element is now `second`, which has no edits of its own.
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  // first's preview persists (NOT rolled back to rgb(1, 2, 3)).
  assert.equal(first.style.getPropertyValue('color'), 'rgb(20, 20, 20)');
  // and its edit is now a stored draft owned by `first`.
  const drafts = internals.localStyleDrafts();
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].target, first);
  assert.deepEqual(Array.from(internals.styleEditsForSend(drafts[0].styleEdits)).map((e) => e.newValue), ['rgb(20, 20, 20)']);
  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [second]);
  assert.equal(model.primary, second);
});

function twoElementAccumulateFixture(internals, document, window) {
  const first = document.createElement('header');
  const second = document.createElement('main');
  first.parentElement = document.body;
  second.parentElement = document.body;
  first.computedStyle = fakeStyle({ color: 'rgb(1, 1, 1)' });
  second.computedStyle = fakeStyle({ color: 'rgb(2, 2, 2)' });
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second]], null);
  internals.renderPanel();
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  const secondRow = document.createElement('li');
  secondRow.setAttribute('data-layer-id', '3');
  secondRow.setAttribute('data-layer-parent', '1');
  // Edit second first, switch to first (single-select -> second stashes), edit first.
  clickPanelRow(internals, window, secondRow);
  assert.equal(internals.commitStyleEdit('color', 'rgb(2, 20, 2)', 'rgb(2, 2, 2)'), true);
  clickPanelRow(internals, window, firstRow);
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  return { first, second };
}

test('style edits on two elements accumulate and dispatch as two records in one batch', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const { first, second } = twoElementAccumulateFixture(internals, document, window);

  // Both previews stay applied across the selection change.
  assert.equal(second.style.getPropertyValue('color'), 'rgb(2, 20, 2)');
  assert.equal(first.style.getPropertyValue('color'), 'rgb(1, 10, 1)');

  // One dispatch carries BOTH elements' edits as separate records (the batch).
  const dispatch = internals.freezePendingDispatch();
  assert.equal(dispatch.styleRecords.length, 2);
  assert.equal(dispatch.logicalCount, 2);
  const byTarget = new Map(dispatch.styleRecords.map((r) => [r.target, r]));
  assert.ok(byTarget.has(first) && byTarget.has(second), 'one record per edited element');
  assert.equal(byTarget.get(second).payload.styleEdits.length, 1);
  assert.equal(byTarget.get(second).payload.styleEdits[0].newValue, 'rgb(2, 20, 2)');
  assert.equal(byTarget.get(first).payload.styleEdits.length, 1);
  assert.equal(byTarget.get(first).payload.styleEdits[0].newValue, 'rgb(1, 10, 1)');
  assert.notEqual(byTarget.get(first).clientKey, byTarget.get(second).clientKey);
});

test('removing one element draft leaves the other element edit pending (accumulate)', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const { first, second } = twoElementAccumulateFixture(internals, document, window);

  // second is the stashed (non-active) draft; first is the active owner.
  const stashed = internals.localStyleDrafts();
  assert.equal(stashed.length, 1);
  assert.equal(stashed[0].target, second);

  internals.removeChange('draft-style:' + stashed[0].clientKey + ':color');

  // second's preview rolls back to its (empty) inline; first's edit survives.
  assert.equal(second.style.getPropertyValue('color'), '');
  assert.equal(first.style.getPropertyValue('color'), 'rgb(1, 10, 1)');
  assert.equal(internals.localStyleDrafts().length, 0, 'the removed draft is pruned');

  // Dispatch now carries only the surviving element.
  const dispatch = internals.freezePendingDispatch();
  assert.equal(dispatch.styleRecords.length, 1);
  assert.equal(dispatch.styleRecords[0].target, first);
});

test('un-sent edit survives when a different element leaves the selection', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  first.parentElement = document.body;
  second.parentElement = document.body;
  first.style.setProperty('color', 'rgb(1, 2, 3)');
  first.computedStyle = fakeStyle({ color: 'rgb(1, 2, 3)' });
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second]], null);
  internals.renderPanel();
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  const secondRow = document.createElement('li');
  secondRow.setAttribute('data-layer-id', '3');
  secondRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, secondRow);
  clickPanelRow(internals, window, firstRow, { metaKey: true });
  assert.equal(internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(1, 2, 3)'), true);

  clickPanelRow(internals, window, secondRow, { metaKey: true });

  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(1, 2, 3)', newValue: 'rgb(20, 20, 20)' }
  ]);
  assert.equal(first.style.getPropertyValue('color'), 'rgb(20, 20, 20)');
  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [first]);
  assert.equal(model.primary, first);
});

test('queued layer operation blocks drag but still permits plain row click selection', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const second = document.createElement('main');
  parent.parentElement = document.body;
  parent.children = [first, second];
  first.parentElement = parent;
  second.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, second]], first);
  internals.reorderLayer('2', '3');
  internals.getPendingLayerOrder().state = 'queued';
  internals.renderPanel();
  const row = document.createElement('li');
  row.setAttribute('data-layer-id', '3');
  row.setAttribute('data-layer-parent', '1');

  clickPanelRow(internals, window, row);

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [second]);
  assert.equal(model.primary, second);
  assert.equal(model.anchor, second);
  assert.equal(internals.getPendingLayerOrder().state, 'queued');
});

test('layer row pointer jitter preserves plain-click selection and expansion', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const section = document.createElement('section');
  const child = document.createElement('article');
  section.localName = 'section';
  child.localName = 'article';
  section.parentElement = document.body;
  child.parentElement = section;
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
      { id: 3, parentId: 2, depth: 2, label: 'article', badges: [], children: [] }
    ] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, section], [3, child]], section);
  internals.renderPanel();
  const row = document.createElement('li');
  row.setAttribute('data-layer-id', '3');
  const target = panelRowTarget(row);

  internals.dispatchPanelLeft('mousedown', {
    target,
    button: 0,
    clientX: 20,
    clientY: 20,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    preventDefault() {}
  });
  window.dispatch('mousemove', {
    type: 'mousemove',
    target,
    clientX: 30,
    clientY: 20,
    preventDefault() {}
  });
  window.dispatch('mouseup', {
    type: 'mouseup',
    target,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false
  });

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [child]);
  assert.equal(model.primary, child);
  assert.equal(model.anchor, child);
  assert.equal(model.origin, 'panel');
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="3"[^>]*data-selected="true"/);
});

test('jitter-blocked-row: drag-blocked pointer jitter notices once and eats the click', async () => {
  const { internals, document, window } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-jitter', batchId: 'batch-jitter' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const second = document.createElement('main');
  parent.parentElement = document.body;
  parent.children = [first, second];
  first.parentElement = parent;
  second.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, second]], first);
  internals.reorderLayer('2', '3');
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(internals.getPendingLayerOrder() && internals.getPendingLayerOrder().state !== 'draft', 'reorder should be actively dispatched (queued/applying), blocking a new drag');
  internals.renderPanel();
  const row = document.createElement('li');
  row.setAttribute('data-layer-id', '3');
  row.setAttribute('data-layer-parent', '1');
  const target = panelRowTarget(row);
  const selectionBeforeJitter = internals.getSelectionModel();
  const rendersBeforeJitter = internals.getRenderPanelCallCount();
  const noticeBeforeJitter = internals.getLayerNotice();

  internals.dispatchPanelLeft('mousedown', {
    target, button: 0, clientX: 20, clientY: 20, preventDefault() {}
  });
  window.dispatch('mousemove', { clientX: 26, clientY: 20, preventDefault() {} });
  window.dispatch('mousemove', { clientX: 32, clientY: 20, preventDefault() {} });
  // Notice is set at release, not mid-gesture — a mid-gesture render (e.g. the
  // agent poll) must have nothing new to expose (#15).
  assert.equal(internals.getLayerNotice(), noticeBeforeJitter, 'notice state must not change mid-gesture');
  assert.doesNotMatch(internals.getPanelLeftHtml(), /A layer move is already with the agent/, 'notice must not render mid-gesture');
  window.dispatch('mouseup', { type: 'mouseup', target });

  const model = internals.getSelectionModel();
  assert.equal(internals.getLayerNotice(), 'A layer move is already with the agent');
  assert.match(internals.getPanelLeftHtml(), /class="raven-grab-layer-notice">A layer move is already with the agent<\/p>/);
  assert.deepEqual(Array.from(model.order), Array.from(selectionBeforeJitter.order));
  assert.equal(model.primary, selectionBeforeJitter.primary);
  assert.equal(model.anchor, selectionBeforeJitter.anchor);
  assert.equal(model.origin, selectionBeforeJitter.origin);
  assert.equal(internals.getRenderPanelCallCount() - rendersBeforeJitter, 1);
});

test('window blur cancels a non-drag row press without selecting it', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, second]], first);
  const row = document.createElement('li');
  row.setAttribute('data-layer-id', '3');
  row.setAttribute('data-layer-parent', '1');
  internals.dispatchPanelLeft('mousedown', {
    target: panelRowTarget(row), button: 0, clientX: 20, clientY: 20, preventDefault() {}
  });

  window.dispatch('blur', { type: 'blur' });

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [first]);
  assert.equal(model.primary, first);
});

test('window blur cancels an activated layer drag without queuing a reorder', async () => {
  const requests = [];
  const { internals, document, window } = await loadOverlayInternals({
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const fixture = makeLayerDragFixture(internals, document);
  const draggedRow = fixture.rows[0];
  const target = panelRowTarget(draggedRow);
  internals.dispatchPanelLeft('mousedown', {
    target, button: 0, clientX: 20, clientY: 20, preventDefault() {}
  });
  window.dispatch('mousemove', { type: 'mousemove', clientX: 30, clientY: 85, preventDefault() {} });
  assert.equal(fixture.transientNodes().length, 2, 'activated drag creates one clone and one drop indicator');

  window.dispatch('blur', new Event('blur'));

  assert.equal(internals.getPendingLayerOrder(), null);
  assert.equal(requests.filter((request) => request.init.method === 'POST').length, 0);
  assert.deepEqual(fixture.transientNodes(), []);
  assert.equal(fixture.rows.some((row) => row.getAttribute('data-dragging') !== null), false);
});

test('a second panel mousedown cancels the active drag before starting a new gesture', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const fixture = makeLayerDragFixture(internals, document);
  const firstTarget = panelRowTarget(fixture.rows[0]);
  internals.dispatchPanelLeft('mousedown', {
    target: firstTarget, button: 0, clientX: 20, clientY: 20, preventDefault() {}
  });
  window.dispatch('mousemove', { type: 'mousemove', clientX: 30, clientY: 85, preventDefault() {} });
  assert.equal(fixture.transientNodes().length, 2);

  const secondTarget = panelRowTarget(fixture.rows[1]);
  internals.dispatchPanelLeft('mousedown', {
    target: secondTarget, button: 0, clientX: 20, clientY: 60, preventDefault() {}
  });

  assert.deepEqual(fixture.transientNodes(), []);
  assert.equal(fixture.rows.some((row) => row.getAttribute('data-dragging') !== null), false);
  assert.equal(internals.getPendingLayerOrder(), null);

  window.dispatch('mouseup', { type: 'mouseup', target: secondTarget });
  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [fixture.elements[1]]);
  assert.equal(model.primary, fixture.elements[1]);
});

test('an activated layer drag ending in mouseup still queues the reorder', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const fixture = makeLayerDragFixture(internals, document);
  const target = panelRowTarget(fixture.rows[0]);
  internals.dispatchPanelLeft('mousedown', {
    target, button: 0, clientX: 20, clientY: 20, preventDefault() {}
  });
  window.dispatch('mousemove', { type: 'mousemove', clientX: 30, clientY: 85, preventDefault() {} });

  window.dispatch('mouseup', { type: 'mouseup', target });

  const pending = internals.getPendingLayerOrder();
  assert.ok(pending);
  assert.equal(pending.state, 'draft');
  assert.equal(pending.fromIndex, 0);
  assert.equal(pending.toIndex, 1);
  assert.deepEqual(fixture.transientNodes(), []);
  assert.equal(fixture.rows.some((row) => row.getAttribute('data-dragging') !== null), false);
});

test('[falsify-drag isConnected] a dropped row whose isConnected is undefined still commits (old-engine contract)', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const fixture = makeLayerDragFixture(internals, document);
  const draggedRow = fixture.rows[0];
  const target = panelRowTarget(draggedRow);
  internals.dispatchPanelLeft('mousedown', { target, button: 0, clientX: 20, clientY: 20, preventDefault() {} });
  window.dispatch('mousemove', { type: 'mousemove', clientX: 30, clientY: 85, preventDefault() {} });
  // Engines without Element.isConnected report undefined; a truthiness check (!isConnected) would
  // wrongly read the row as detached and silently drop the reorder. The contract check is === false.
  draggedRow.isConnected = undefined;
  window.dispatch('mouseup', { type: 'mouseup', target });
  const pending = internals.getPendingLayerOrder();
  assert.ok(pending, 'reorder queued despite an undefined isConnected');
  assert.equal(pending.toIndex, 1);
});

test('[falsify-drag isConnected-poll] liveLayerChildrenMatch treats an undefined-isConnected parent as live, not stale', async () => {
  // Downstream sibling of the drag-lifecycle fix: the operation poll matches expected child order
  // via liveLayerChildrenMatch. On an old engine every element's isConnected is undefined; a
  // truthiness guard (!parent.isConnected) reads a LIVE tree as detached, so the poll marks the
  // op stale ("Page changed") for both expected and baseline orders and the workflow dies. The
  // contract check is === false, so undefined falls through and the order comparison runs.
  const { internals } = await loadOverlayInternals();
  const a = { tag: 'a' };
  const b = { tag: 'b' };
  const liveParent = { isConnected: undefined, children: [a, b] };
  assert.equal(
    internals.liveLayerChildrenMatch(liveParent, [a, b]),
    true,
    'undefined isConnected + expected order must read as a live match, not stale',
  );
  // The guard must still catch a genuinely detached parent — the fix narrows, it does not remove.
  assert.equal(
    internals.liveLayerChildrenMatch({ isConnected: false, children: [a, b] }, [a, b]),
    false,
    'a truly detached parent (isConnected === false) still reads as stale',
  );
});

test('[falsify-drag subtree] layerBlockRows steps over an unrelated draft slot so an ancestor subtree stays whole', async () => {
  const { internals, document } = await loadOverlayInternals();
  function makeRow(names, depth) {
    const row = document.createElement('li');
    row.classList = { contains(name) { return names.includes(name); } };
    row.style.setProperty('--layer-depth', String(depth));
    return row;
  }
  const ancestor = makeRow(['raven-grab-layer-row'], 1);
  const desc1 = makeRow(['raven-grab-layer-row'], 2);
  const slot = makeRow(['raven-grab-layer-slot'], 2); // a separate pending move's draft slot, mid-subtree
  const desc2 = makeRow(['raven-grab-layer-row'], 2);
  const sibling = makeRow(['raven-grab-layer-row'], 1); // ancestor's peer — must NOT be pulled into the block
  const chain = [ancestor, desc1, slot, desc2, sibling];
  chain.forEach((row, index) => {
    row.previousElementSibling = chain[index - 1] || null;
    row.nextElementSibling = chain[index + 1] || null;
  });
  const block = internals.layerBlockRows(ancestor);
  assert.equal(block.length, 3, 'block = ancestor + both descendants (slot skipped, peer excluded)');
  assert.equal(block[0], ancestor);
  assert.equal(block[1], desc1);
  assert.equal(block[2], desc2, 'the descendant AFTER the slot is not stranded');
  assert.equal(block.indexOf(slot), -1, 'the unrelated draft slot is not part of the block');
  assert.equal(block.indexOf(sibling), -1, 'the ancestor peer is not pulled into the block');
});

test('[falsify-drag multiswap] one fast move crosses multiple siblings and the slot carries the grip handle', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const fixture = makeLayerDragFixture(internals, document, { dynamicGeometry: true });
  const draggedRow = fixture.rows[0];
  const target = panelRowTarget(draggedRow);
  internals.dispatchPanelLeft('mousedown', { target, button: 0, clientX: 20, clientY: 20, preventDefault() {} });
  // Rows sit at 0/40/80; a single move to y=155 must cross BOTH siblings in one while-loop pass.
  window.dispatch('mousemove', { type: 'mousemove', clientX: 30, clientY: 155, preventDefault() {} });
  const slot = fixture.transientNodes().find((node) => /raven-grab-layer-slot/.test(node.className || ''));
  assert.ok(slot, 'a drop slot exists mid-drag');
  assert.match(slot.innerHTML, /raven-grab-layer-slot-grip/, 'slot renders the grip handle');
  assert.match(slot.innerHTML, /Move here/, 'slot reads "Move here"');
  assert.ok(fixture.rows[1].style.transition, 'the first displaced sibling got a FLIP transition');
  assert.ok(fixture.rows[2].style.transition, 'the second displaced sibling got a FLIP transition');
  window.dispatch('mouseup', { type: 'mouseup', target });
  const pending = internals.getPendingLayerOrder();
  assert.ok(pending);
  assert.equal(pending.toIndex, 2, 'dragged row crossed two siblings in one move (while-loop ran more than once)');
});

test('[falsify-drag reduced-motion] the sibling swap skips its FLIP transition under prefers-reduced-motion', async () => {
  const { internals, document, window } = await loadOverlayInternals({ reducedMotion: true });
  const fixture = makeLayerDragFixture(internals, document, { dynamicGeometry: true });
  const draggedRow = fixture.rows[0];
  const target = panelRowTarget(draggedRow);
  internals.dispatchPanelLeft('mousedown', { target, button: 0, clientX: 20, clientY: 20, preventDefault() {} });
  // y=105 forces exactly one downward swap; the displaced row is DOM-reordered but must NOT animate.
  window.dispatch('mousemove', { type: 'mousemove', clientX: 30, clientY: 105, preventDefault() {} });
  assert.ok(!fixture.rows[1].style.transition, 'no FLIP transition is installed under reduced motion');
  window.dispatch('mouseup', { type: 'mouseup', target });
});

test('canvas shift-click keeps ordered append semantics in the unified model', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('header');
  const second = document.createElement('main');
  const third = document.createElement('footer');
  for (const element of [first, second, third]) element.closest = () => null;

  internals.selectTarget(first, false);
  internals.selectTarget(second, true);
  internals.selectTarget(third, true);

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [first, second, third]);
  assert.equal(model.primary, third);
  assert.equal(model.anchor, first);
  assert.equal(model.origin, 'canvas');
});

test('detached selection entries reconcile order, primary, anchor, and properties together', async () => {
  const { internals, document } = await loadOverlayInternals();
  const anchor = document.createElement('header');
  const remaining = document.createElement('section');
  const primary = document.createElement('main');
  anchor.localName = 'header';
  remaining.localName = 'section';
  primary.localName = 'main';
  anchor.closest = () => null;
  remaining.closest = () => null;
  primary.closest = () => null;
  internals.selectTarget(anchor, false);
  internals.selectTarget(remaining, true);
  internals.selectTarget(primary, true);

  anchor.isConnected = false;
  primary.isConnected = false;
  internals.renderPanel();

  const model = internals.getSelectionModel();
  assert.deepEqual(Array.from(model.order), [remaining]);
  assert.equal(model.primary, remaining);
  assert.equal(model.anchor, remaining);
  assert.equal(internals.payloadForSend().selector, 'section');
});

test('layers markup marks exactly the last-selected primary row', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('header');
  const primary = document.createElement('main');
  const third = document.createElement('footer');
  first.localName = 'header';
  primary.localName = 'main';
  third.localName = 'footer';
  for (const element of [first, primary, third]) {
    element.parentElement = document.body;
    element.closest = () => null;
  }
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] },
    { id: 4, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  internals.setLayerTestState(
    tree,
    [[1, document.body], [2, first], [3, primary], [4, third]],
    null
  );

  internals.selectTarget(first, false);
  internals.selectTarget(third, true);
  internals.selectTarget(primary, true);

  const model = internals.getSelectionModel();
  const markup = internals.getPanelLeftHtml();
  const primaryRows = markup.match(
    /<li class="raven-grab-layer-row"[^>]*data-primary="true"[^>]*>/g
  ) || [];

  assert.equal(model.primary, primary);
  assert.equal(primaryRows.length, 1);
  assert.match(primaryRows[0], /data-layer-id="3"/);
  for (const id of [2, 3, 4]) {
    assert.match(
      markup,
      new RegExp('data-layer-id="' + id + '"[^>]*data-selected="true"')
    );
  }
});

test('cap-perf-smoke', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const selectableCount = 500;
  const elements = [document.body];
  const elementPairs = [[1, document.body]];
  const children = [];
  let connectedReads = 0;

  Object.defineProperty(document.body, 'isConnected', {
    get() {
      connectedReads += 1;
      return true;
    }
  });

  for (let index = 1; index < selectableCount; index += 1) {
    const element = document.createElement('div');
    element.localName = 'div';
    element.id = `cap-node-${index}`;
    element.parentElement = document.body;
    Object.defineProperty(element, 'isConnected', {
      get() {
        connectedReads += 1;
        return true;
      }
    });
    elements.push(element);
    elementPairs.push([index + 1, element]);
    children.push({
      id: index + 1,
      parentId: 1,
      depth: 1,
      label: `div · ${index}`,
      badges: [],
      children: []
    });
  }

  document.body.children = elements.slice(1);
  document.querySelectorAll = () => [document.body];
  const tree = {
    id: 1,
    parentId: null,
    depth: 0,
    label: 'body',
    badges: [],
    children
  };
  internals.setLayerTestState(tree, elementPairs, null);
  internals.renderPanel();

  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '1');
  firstRow.setAttribute('data-layer-parent', '');
  const lastRow = document.createElement('li');
  lastRow.setAttribute('data-layer-id', String(selectableCount));
  lastRow.setAttribute('data-layer-parent', '1');

  clickPanelRow(internals, window, firstRow);
  connectedReads = 0;

  const startedAt = performance.now();
  clickPanelRow(internals, window, lastRow, { shiftKey: true });
  const elapsed = performance.now() - startedAt;

  const model = internals.getSelectionModel();
  assert.equal(model.order.length, selectableCount);
  assert.equal(internals.getMultiSelectionCount(), selectableCount);
  for (let index = 0; index < selectableCount; index += 1) {
    assert.equal(model.order[index], elements[index], `selection order should preserve visible row ${index + 1}`);
  }
  assert.equal(model.primary, elements[selectableCount - 1]);
  assert.equal(model.anchor, elements[0]);

  const selectedRows = internals.getPanelLeftHtml().match(
    /data-layer-id="\d+"[^>]*data-selected="true"/g
  ) || [];
  assert.equal(selectedRows.length, selectableCount);
  assert.ok(
    connectedReads <= selectableCount * 5,
    `selection rendering should prune once, not once per row (${connectedReads} connectivity reads)`
  );
  assert.ok(
    elapsed < 2000,
    `500-row shift-range selection and render took ${elapsed.toFixed(1)}ms`
  );
});

test('overlay single-select payload has no multiSelect key', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#single');
  assert.equal(Object.hasOwn(internals.payloadForSend(), 'multiSelect'), false);
});

test('overlay appends its script capability key to bridge requests', async () => {
  const { internals } = await loadOverlayInternals();
  assert.equal(internals.bridgeUrl('/tokens'), 'http://127.0.0.1:41234/tokens?key=test-key');
  assert.equal(internals.bridgeUrl('/grab'), 'http://127.0.0.1:41234/grab?key=test-key');
});

test('overlay switches between Layers and Assets tabs; design panel has no request tab', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.renderPanel();

  assert.doesNotMatch(internals.getPanelHtml(), /data-tab="request"/);
  assert.doesNotMatch(internals.getPanelHtml(), /data-tab="design"/);
  assert.match(internals.getPanelLeftHtml(), /data-tab="layers"[^>]*aria-selected="true"/);
  assert.equal(typeof internals.switchTab, 'function');
  internals.switchTab('assets');
  assert.match(internals.getPanelLeftHtml(), /data-tab="assets"[^>]*aria-selected="true"/);
  assert.match(internals.getPanelLeftHtml(), /Reason for new component|Select a component on the page/);
});

test('overlay element chip exposes the full selector and copies it through the clipboard', async () => {
  const writes = [];
  const selector = 'main[data-view="billing"] > section:nth-child(12) .action-row button[data-action="save-and-continue"]';
  const { internals, document } = await loadOverlayInternals({
    clipboard: { writeText: async (value) => { writes.push(value); } }
  });
  internals.setStyleContext({ style: fakeStyle() }, {}, [], selector);
  internals.renderPanel();

  assert.match(
    internals.getPanelHtml(),
    /title="main\[data-view=&quot;billing&quot;\] &gt; section:nth-child\(12\) \.action-row button\[data-action=&quot;save-and-continue&quot;\]"/
  );

  const chip = document.createElement('span');
  chip.closest = (query) => query === '[data-element-selector]' ? chip : null;
  internals.dispatchPanel('click', { target: chip, stopPropagation() {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(writes, [selector]);
  assert.equal(chip.textContent, 'Copied');
  assert.equal(chip.getAttribute('data-copied'), 'true');
});

test('overlay styles section starts expanded and toggle without losing edits', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });
  internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)');
  internals.renderPanel();

  assert.doesNotMatch(internals.getPanelHtml(), /data-section-toggle="tokens"|Design tokens/);
  assert.match(internals.getPanelHtml(), /data-section-toggle="styles"[^>]*aria-expanded="true"/);
  assert.match(internals.getPanelHtml(), />Styles</);
  assert.equal(typeof internals.toggleSection, 'function');
  internals.toggleSection('styles');
  assert.match(internals.getPanelHtml(), /data-section-toggle="styles"[^>]*aria-expanded="false"/);
  assert.match(internals.getPanelHtml(), /data-edited="true"/);
});

test('REGRESSION: tokenized properties appear in Styles with token options', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setTokens([
    { path: 'colors.primary', name: 'primary', group: 'colors', value: '#00BFFF', cssVar: '--color-primary' },
    { path: 'colors.secondary', name: 'secondary', group: 'colors', value: '#111111', cssVar: '--color-secondary' }
  ]);
  internals.setStyleContext(
    element,
    { color: 'rgb(0, 191, 255)', padding: '16px' },
    [{ property: 'color', name: 'primary', value: '#00BFFF', cssVar: '--color-primary', group: 'colors', bridgeToken: { path: 'colors.primary' } }]
  );
  internals.renderPanel();
  // Styles is expanded by default — no need to toggle for the assertion.

  assert.doesNotMatch(internals.getPanelHtml(), /data-section-toggle="tokens"|Design tokens/);
  assert.match(internals.getPanelHtml(), /data-section-toggle="styles"[^>]*aria-expanded="true"/);
  assert.match(internals.getPanelHtml(), /data-style-property="color"[^>]*data-token-index="0"/);
  assert.match(internals.getPanelHtml(), /primary · #00BFFF|primary ·/);
  assert.match(internals.getPanelHtml(), /data-style-property="padding"/);

  const row = {
    child: null,
    getAttribute(name) {
      if (name === 'data-style-property') return 'color';
      if (name === 'data-token-index') return '0';
      return null;
    },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const cell = document.createElement('code');
  cell.setAttribute('data-style-raw', '#00BFFF');
  cell.textContent = 'primary · #00BFFF';
  cell.parentElement = row;
  cell.parentNode = row;
  internals.beginStyleEdit(cell);
  assert.ok(row.child);
  assert.equal(row.child.getAttribute('data-token-linked'), 'true');
  const tokenBlock = row.child.children.find((child) => child.className === 'raven-grab-token-inline');
  assert.ok(tokenBlock);
  const choiceRow = tokenBlock.children[0].children.find((child) => child.className === 'raven-grab-token-choice-row');
  assert.ok(choiceRow, 'token select should sit in a choice row with unlink');
  const tokenSelect = choiceRow.children.find((child) => child.getAttribute('data-token-choice') === '0');
  const unlinkBtn = choiceRow.children.find((child) => child.getAttribute('data-token-unlink') === '0');
  const newFields = tokenBlock.children.find((child) => child.getAttribute('data-new-token') === '0');
  assert.ok(tokenSelect);
  assert.ok(unlinkBtn, 'linked token should show Phosphor link-break detach control');
  assert.match(unlinkBtn.innerHTML, /viewBox="0 0 256 256"/);
  const findDescendant = (node, predicate) => {
    if (!node) return null;
    if (predicate(node)) return node;
    for (const child of node.children || []) {
      const found = findDescendant(child, predicate);
      if (found) return found;
    }
    return null;
  };
  assert.ok(findDescendant(tokenBlock, (node) => node.getAttribute && node.getAttribute('data-token-picker-search') === '0'), 'token picker should include searchable input');
  assert.ok(newFields);
  assert.match(tokenSelect.innerHTML, /New token…/);
  assert.match(tokenSelect.innerHTML, /secondary/);
  const lockedStyle = row.child.children.find((child) => child.getAttribute('data-style-input') === 'color');
  assert.ok(lockedStyle);
  assert.equal(lockedStyle.getAttribute('data-token-locked'), 'true');
  assert.equal(lockedStyle.disabled, true);
  tokenSelect.value = '--color-secondary';
  internals.setPanelQuery('[data-token-choice="0"]', tokenSelect);
  internals.setPanelQuery('[data-new-token="0"]', newFields);
  internals.updateIntent(0);
  assert.equal(internals.getTokenIntents()[0].newTokenPath, 'colors.secondary');
});

test('REGRESSION: detaching a design token unlocks raw style edits (Figma unlink friction)', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = document.createElement('div');
  element.id = 'token-detach-target';
  internals.setTokens([
    { path: 'colors.primary', value: '#00BFFF', cssVar: '--color-primary', type: 'color', group: 'colors' },
    { path: 'colors.secondary', value: '#112233', cssVar: '--color-secondary', type: 'color', group: 'colors' }
  ]);
  internals.setStyleContext(
    element,
    { color: 'rgb(0, 191, 255)' },
    [{ property: 'color', name: 'primary', value: '#00BFFF', cssVar: '--color-primary', group: 'colors', bridgeToken: { path: 'colors.primary' } }]
  );
  const row = {
    child: null,
    getAttribute(name) {
      if (name === 'data-style-property') return 'color';
      if (name === 'data-token-index') return '0';
      return null;
    },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const cell = document.createElement('code');
  cell.setAttribute('data-style-raw', '#00BFFF');
  cell.textContent = 'primary · #00BFFF';
  cell.parentElement = row;
  cell.parentNode = row;
  internals.beginStyleEdit(cell);
  const editor = row.child;
  assert.equal(editor.getAttribute('data-token-linked'), 'true');
  const styleInput = editor.children.find((child) => child.getAttribute('data-style-input') === 'color');
  assert.equal(styleInput.disabled, true);
  // Attempted commit while linked must be a no-op.
  styleInput.value = '#abcdef';
  styleInput.disabled = false;
  styleInput.removeAttribute('disabled');
  styleInput.dispatch('blur', { relatedTarget: null });
  assert.equal(editor.getAttribute('data-token-linked'), 'true');
  assert.equal(element.style.getPropertyValue('color'), '');
  assert.equal(internals.styleEditsForSend().length, 0);

  const tokenBlock = editor.children.find((child) => child.className === 'raven-grab-token-inline');
  const choiceRow = tokenBlock.children[0].children.find((child) => child.className === 'raven-grab-token-choice-row');
  const unlinkBtn = choiceRow.children.find((child) => child.getAttribute('data-token-unlink') === '0');
  unlinkBtn.dispatch('click', {});
  assert.equal(editor.getAttribute('data-token-linked'), 'false');
  assert.equal(editor.children.some((child) => child.className === 'raven-grab-token-inline'), false, 'detach removes token UI');
  assert.equal(styleInput.disabled, false);
  assert.equal(styleInput.getAttribute('data-token-locked'), null);
  styleInput.value = '#abcdef';
  styleInput.dispatch('blur', { relatedTarget: null });
  assert.equal(element.style.getPropertyValue('color'), '#abcdef');
  assert.equal(internals.styleEditsForSend().find((edit) => edit.property === 'color').newValue, '#abcdef');
});

test('overlay keeps consumer component-request markup unchanged when role is absent', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#consumer-target');
  internals.switchTab('assets');

  const html = internals.getPanelLeftHtml();
  const structureHtml = internals.getStructureActionsHtml();
  const actionsHtml = internals.getGlobalActionsHtml();
  assert.match(structureHtml, /Request component/);
  assert.match(actionsHtml, /data-send-batch/);
  assert.match(html, /data-issue-type/);
  assert.match(html, /data-issue-size/);
  assert.match(html, /data-component-name/);
  assert.doesNotMatch(structureHtml, /Add to Design System|Add component/);

  const explicit = await loadOverlayInternals({ lowercaseConfig: { role: 'consumer' } });
  explicit.internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#consumer-target');
  explicit.internals.switchTab('assets');
  assert.equal(explicit.internals.getPanelLeftHtml(), html, 'explicit consumer markup must be byte-for-byte identical to the absent-role default');
  assert.equal(explicit.internals.getStructureActionsHtml(), structureHtml, 'explicit consumer Assets dock markup must be byte-for-byte identical to the absent-role default');
  assert.equal(explicit.internals.getGlobalActionsHtml(), actionsHtml, 'Send dock stays pinned on the right for both roles');
});

test('maintainer role renders add-to-design-system flow and creates an agent instruction without email framing', async () => {
  const { internals } = await loadOverlayInternals({
    lowercaseConfig: { role: 'maintainer' }
  });
  const stateStyles = {
    hover: {
      declarations: [{ property: 'color', value: 'var(--color-primary)', important: false }],
      tokens: [{ property: 'color', path: 'colors.primary', value: '#111111' }]
    }
  };
  internals.setStyleContext(
    { style: fakeStyle() },
    { color: 'rgb(0, 0, 0)' },
    [{ property: 'color', path: 'colors.primary', value: '#111111' }],
    '#maintainer-target',
    stateStyles
  );
  internals.switchTab('assets');
  internals.setComponentName('Primary button');

  const html = internals.getPanelLeftHtml();
  const structureHtml = internals.getStructureActionsHtml();
  const actionsHtml = internals.getGlobalActionsHtml();
  assert.match(structureHtml, /Add component/);
  assert.match(actionsHtml, /data-send-batch/);
  assert.match(html, /data-use-case/);
  assert.match(html, /data-component-name/);
  assert.doesNotMatch(html, /data-component-email|data-issue-type|data-issue-size|EMAIL YOURSELF/);
  assert.doesNotMatch(structureHtml, /Request component/);

  const notes = { value: 'Keep the compact hover treatment.', getAttribute() { return null; } };
  internals.setPanelQuery('[data-use-case]', notes);
  const payload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  assert.equal(payload.intent, 'create-component');
  assert.equal(payload.selector, '#maintainer-target');
  assert.equal(payload.userNotes, 'Keep the compact hover treatment.');
  assert.match(payload.instruction, /Build this as a reusable component in the design system and update DESIGN\.md/);
  assert.deepEqual(payload.styles, { color: 'rgb(0, 0, 0)' });
  assert.deepEqual(payload.tokens, [{ property: 'color', path: 'colors.primary', value: '#111111' }]);
  assert.deepEqual(payload.stateStyles, stateStyles);
  assert.equal(payload.componentRequest, undefined);
});

test('standalone overlay loads configured tokens and POSTs the full component request to the email endpoint', async () => {
  const calls = [];
  const clock = fakeClock();
  const tokens = { 'colors.primary': '#00BFFF' };
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    config: {
      mode: 'standalone',
      tokens,
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request'
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ success: true, mode: 'issue', url: 'https://github.com/o/r/issues/1', message: 'Request created' }) };
    }
  });

  assert.equal(internals.getBridgeTokens().length, 1);
  assert.equal(internals.getBridgeTokens()[0].path, 'colors.primary');
  assert.equal(calls.length, 0, 'standalone token loading must not call GET /tokens');

  const selected = document.createElement('div');
  internals.setStyleContext(
    selected,
    { color: 'rgb(0, 0, 0)' },
    [{ property: 'color', cssVar: '--color-primary', value: '#111111' }],
    '#request-target'
  );
  internals.setTokenIntent(0, {
    property: 'color',
    oldToken: 'primary',
    oldTokenPath: 'colors.primary',
    newToken: 'primary',
    newTokenPath: 'colors.primary',
    newTokenValue: '#00BFFF'
  });
  internals.renderPanel();
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0, 'null standalone grabEndpoint must not POST');
  assert.equal(internals.getDispatchState(), 'done', 'standalone dispatch with no endpoint still reaches a terminal done state');

  // The dispatch above re-snapshots currentSelection from the live element
  // (now inert/empty post-send); re-select to restage the exact selection the
  // component request must carry.
  internals.setStyleContext(
    selected,
    { color: 'rgb(0, 0, 0)' },
    [{ property: 'color', cssVar: '--color-primary', value: '#111111' }],
    '#request-target'
  );

  assert.equal(typeof internals.sendComponentRequest, 'function');
  internals.setComponentName('Request target');
  await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/component-request');
  assert.equal(calls[0].init.method, 'POST');
  const sentBody = JSON.parse(calls[0].init.body);
  assert.match(sentBody.requestId, /^cr-/);
  delete sentBody.requestId;
  assert.deepEqual(sentBody, {
    selector: '#request-target',
    tokens: [{ property: 'color', cssVar: '--color-primary', value: '#111111' }],
    styles: { color: 'rgb(0, 0, 0)' },
    stateStyles: {},
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com',
    componentName: 'Request target'
  });
});

test('email-flow playground overlay requires an email and posts flow:email', async () => {
  const calls = [];
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    config: {
      mode: 'standalone',
      tokens: {},
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request',
      componentRequestFlow: 'email'
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ success: true, mode: 'email', message: 'Email sent' }) };
    }
  });

  internals.setStyleContext(
    { style: fakeStyle() },
    { color: 'rgb(0, 0, 0)' },
    [{ property: 'color', cssVar: '--color-primary', value: '#111111' }],
    '#request-target'
  );
  internals.renderPanel();
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setPanelQuery('[data-send-email]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setComponentName('Request target');

  const rejected = await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: ''
  });
  assert.equal(rejected, false, 'email flow must require an email address');
  assert.equal(calls.length, 0);

  const sent = await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com'
  });
  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  const sentBody = JSON.parse(calls[0].init.body);
  assert.equal(sentBody.flow, 'email');
  assert.equal(sentBody.email, 'designer@example.com');
  assert.equal(status.textContent, 'Email sent');
  clock.tick(820);
  assert.match(button.innerHTML, /Email sent/);
  clock.tick(2300);
  assert.match(button.innerHTML, /Send email/);
});

test('request component shows the clipboard-only setup hint only when no destination is configured', async () => {
  const overlayPath = path.resolve(__dirname, '../web/public/raven-grab.js');
  const stored = {};
  const localStorage = {
    getItem(key) { return Object.hasOwn(stored, key) ? stored[key] : null; },
    setItem(key, value) { stored[key] = String(value); }
  };
  const configurations = [
    {
      config: {
        mode: 'standalone',
        tokens: {},
        grabEndpoint: null,
        componentRequestEndpoint: null
      },
      expected: true
    },
    {
      config: {
        mode: 'standalone',
        tokens: {},
        grabEndpoint: null,
        componentRequestEndpoint: null,
        componentRequestFlow: 'email'
      },
      expected: false
    },
    {
      config: {
        mode: 'standalone',
        tokens: {},
        grabEndpoint: null,
        componentRequestEndpoint: 'https://example.test/component-request'
      },
      expected: false
    }
  ];

  for (const configuration of configurations) {
    const { internals } = await loadOverlayInternals({
      overlayPath,
      config: configuration.config,
      localStorage
    });
    internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
    internals.switchTab('assets');

    const html = internals.getPanelLeftHtml();
    if (configuration.expected) {
      assert.match(html, /No destination configured — requests can&#39;t be sent yet\. Ask your agent to set up GitHub routing\./);
      const dismissButton = {
        closest(selector) { return selector === '[data-dismiss-request-hint]' ? this : null; }
      };
      internals.dispatchPanelLeft('click', { target: dismissButton, stopPropagation() {} });
      assert.equal(stored['raven-grab-request-hint-dismissed'], 'true');
      assert.doesNotMatch(internals.getPanelLeftHtml(), /No destination configured/);
      delete stored['raven-grab-request-hint-dismissed'];
    } else {
      assert.doesNotMatch(html, /No destination configured/);
    }
  }
});

test('reselecting and dismissing restore token previews on their original target', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('div');
  first.style = fakeStyle({ '--color-primary': '#111111' }, { '--color-primary': 'important' });
  const second = document.createElement('div');
  second.id = 'second';
  const select = document.createElement('select');
  select.value = '--color-secondary';
  const newFields = document.createElement('div');
  const token = { property: 'color', cssVar: '--color-primary', value: '#111111', path: 'colors.primary' };

  internals.setTokens([
    { path: 'colors.secondary', name: 'secondary', group: 'colors', value: '#222222', cssVar: '--color-secondary' }
  ]);
  internals.setStyleContext(first, { color: '#111111' }, [token], '#first');
  internals.setPanelQuery('[data-token-choice="0"]', select);
  internals.setPanelQuery('[data-new-token="0"]', newFields);

  internals.updateIntent(0);
  assert.equal(first.style.getPropertyValue('--color-primary'), '#222222');

  // Navigate away (real selection path). The token preview now PERSISTS as a
  // stored draft instead of rolling back the moment `first` leaves.
  document.dispatch('click', {
    target: second,
    altKey: false,
    composedPath: () => [],
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  assert.equal(first.style.getPropertyValue('--color-primary'), '#222222');

  // Navigate BACK to `first` through the real selection path -> its draft
  // rehydrates with the true original (#111111 !important) intact, so dismiss()
  // still restores the original rather than the persisted preview.
  document.dispatch('click', {
    target: first,
    altKey: false,
    composedPath: () => [],
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  internals.dismiss();
  assert.equal(first.style.getPropertyValue('--color-primary'), '#111111');
  assert.equal(first.style.getPropertyPriority('--color-primary'), 'important');
});

test('token rebind previews on every multi-selected element and restores all of them', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('div');
  first.style = fakeStyle({ '--color-primary': '#111111' }, { '--color-primary': 'important' });
  const second = document.createElement('div');
  second.style = fakeStyle({});
  const third = document.createElement('div');
  third.style = fakeStyle({});
  const select = document.createElement('select');
  select.value = '--color-secondary';
  const newFields = document.createElement('div');
  const token = { property: 'background-color', cssVar: '--color-primary', value: '#111111', path: 'colors.primary' };

  internals.setTokens([
    { path: 'colors.secondary', name: 'secondary', group: 'colors', value: '#222222', cssVar: '--color-secondary' }
  ]);
  internals.setMultiStyleContext([first, second, third], { 'background-color': '#111111' }, '#first', [token]);
  internals.setPanelQuery('[data-token-choice="0"]', select);
  internals.setPanelQuery('[data-new-token="0"]', newFields);

  internals.updateIntent(0);
  // The whole selection previews the rebind — not just the primary.
  assert.equal(first.style.getPropertyValue('--color-primary'), '#222222');
  assert.equal(second.style.getPropertyValue('--color-primary'), '#222222');
  assert.equal(third.style.getPropertyValue('--color-primary'), '#222222');

  // Clearing the choice restores every member's original inline value.
  select.value = '';
  internals.updateIntent(0);
  assert.equal(first.style.getPropertyValue('--color-primary'), '#111111');
  assert.equal(first.style.getPropertyPriority('--color-primary'), 'important');
  assert.equal(second.style.getPropertyValue('--color-primary'), '');
  assert.equal(third.style.getPropertyValue('--color-primary'), '');
});

test('REGRESSION: "All N like this" token rebind previews on component siblings and restores them', async () => {
  // updateIntent resolved preview targets via styleApplicationTargets() only,
  // which never includes the component match set — a component-scoped token
  // rebind visibly changed just the selected element while the payload claimed
  // the whole component.
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = { localName: 'a', style: fakeStyle({ '--color-primary': '#111111' }), closest: () => null };
  const sibling = { localName: 'a', style: fakeStyle({}), closest: () => null };
  candidates = [selected, sibling];
  const select = document.createElement('select');
  select.value = '--color-secondary';
  const newFields = document.createElement('div');
  const token = { property: 'background-color', cssVar: '--color-primary', value: '#111111', path: 'colors.primary' };

  internals.setTokens([
    { path: 'colors.secondary', name: 'secondary', group: 'colors', value: '#222222', cssVar: '--color-secondary' }
  ]);
  internals.setStyleContext(selected, { 'background-color': '#111111' }, [token], '#first',
    {}, { componentName: 'NavLink', matchSelector: 'a.nav-link', matchCount: 2 });
  assert.equal(internals.setEditScope('component'), true);
  internals.setPanelQuery('[data-token-choice="0"]', select);
  internals.setPanelQuery('[data-new-token="0"]', newFields);

  internals.updateIntent(0);
  assert.equal(selected.style.getPropertyValue('--color-primary'), '#222222');
  assert.equal(sibling.style.getPropertyValue('--color-primary'), '#222222',
    'component sibling previews the rebind too');

  select.value = '';
  internals.updateIntent(0);
  assert.equal(selected.style.getPropertyValue('--color-primary'), '#111111');
  assert.equal(sibling.style.getPropertyValue('--color-primary'), '',
    'clearing the choice restores the sibling');
});

test('successful agent send morphs through all five beats and restores an empty disabled CTA', async () => {
  // sendSelection()/morphSendButton's 5-beat animation is now gated to the
  // maintainer create-component flow ([data-maintainer-send]) — the consumer
  // [data-send] button is gone and the new [data-send-batch] button is driven
  // by the dispatch state machine (batchUiState), not this timed morph. This
  // is the only surviving live caller of the shared morph function, so the
  // migration targets it to keep exercising the real animation code.
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    lowercaseConfig: { role: 'maintainer' },
    fetch: async () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  });
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#maintainer-target');
  internals.switchTab('assets');
  internals.setComponentName('Primary button');
  internals.renderPanel();
  internals.setPanelQuery('[data-maintainer-send]', button);
  internals.setPanelQuery('[data-status]', status);

  await internals.sendSelection();

  assert.equal(button.getAttribute('data-send-state'), 'collapse');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.disabled, true);
  assert.equal(status.textContent, 'Component added');

  clock.tick(250);
  assert.equal(button.getAttribute('data-send-state'), 'dot');

  clock.tick(120);
  assert.equal(button.getAttribute('data-send-state'), 'trace');

  clock.tick(450);
  assert.equal(button.getAttribute('data-send-state'), 'sent');
  assert.match(button.innerHTML, /Component added/);
  assert.match(button.innerHTML, /raven-grab-border-trace/);

  clock.tick(2299);
  assert.equal(button.getAttribute('data-send-state'), 'sent');

  clock.tick(1);
  assert.equal(button.getAttribute('data-send-state'), 'default');
  assert.equal(button.getAttribute('aria-busy'), null);
  // NOTE (overlay behavior change, not a test-authoring gap): the old
  // finish() re-synced disabled state via syncSendButtonDisabled() for the
  // "[data-send]" selector specifically; that re-sync moved to
  // "[data-send-batch]" only. [data-maintainer-send]'s finish() now
  // unconditionally sets disabled=false, verified by reading
  // browser/raven-grab.js morphSendButton() (frozen source, not edited).
  assert.equal(button.disabled, false);
  assert.match(button.innerHTML, /Add component/);
});

test('successful component-request morph shows Request created and restores Request component', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    config: {
      mode: 'standalone',
      tokens: {},
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request'
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, mode: 'issue', url: 'https://github.com/o/r/issues/1', message: 'Request created' }) })
  });
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.setPanelQuery('[data-send-email]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setComponentName('Request target');

  const sent = await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com'
  });

  assert.equal(sent, true);
  assert.equal(button.getAttribute('data-send-state'), 'collapse');
  assert.match(status.innerHTML, /View request/);
  assert.match(status.innerHTML, /https:\/\/github\.com\/o\/r\/issues\/1/);
  assert.equal(status.getAttribute('data-kind'), 'success');

  clock.tick(820);
  assert.equal(button.getAttribute('data-send-state'), 'sent');
  assert.match(button.innerHTML, /Request created/);

  clock.tick(2300);
  assert.equal(button.getAttribute('data-send-state'), 'default');
  assert.match(button.innerHTML, /Create request|Request component/);
});

test('reduced motion skips dot and trace beats while preserving sent hold and reset', async () => {
  const clock = fakeClock();
  // See the migration note on "successful agent send morphs..." above: the
  // shared morphSendButton animation now only fires from the maintainer
  // create-component flow ([data-maintainer-send]); [data-send] is gone and
  // [data-send-batch] doesn't use this timed morph at all.
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    reducedMotion: true,
    lowercaseConfig: { role: 'maintainer' },
    fetch: async () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  });
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#maintainer-target');
  internals.switchTab('assets');
  internals.setComponentName('Primary button');
  internals.renderPanel();
  internals.setPanelQuery('[data-maintainer-send]', button);
  internals.setPanelQuery('[data-status]', status);

  await internals.sendSelection();

  assert.equal(button.getAttribute('data-send-state'), 'sent');
  assert.match(button.innerHTML, /Component added/);
  clock.tick(1799);
  assert.equal(button.getAttribute('data-send-state'), 'sent');
  clock.tick(1);
  assert.equal(button.getAttribute('data-send-state'), 'default');
});

test('overlay form fields set explicit spellcheck behavior', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#spell-target');
  internals.renderPanel();
  assert.match(internals.getPanelHtml(), /<textarea class="raven-grab-textarea"[^>]*spellcheck="true"/);

  internals.switchTab('assets');
  assert.match(internals.getPanelLeftHtml(), /<textarea class="raven-grab-textarea raven-grab-use-case"[^>]*spellcheck="true"/);

  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  assert.match(source, /data-component-email[^>]*spellcheck="false"/);
  assert.match(source, /data-style-input[\s\S]{0,120}spellcheck/);
});

test('overlay shows a disabled empty-state panel whenever grabbing is armed without a selection', async () => {
  const { internals } = await loadOverlayInternals();
  // Cold open is now EXPANDED (Andrew, 2026-07-19). Collapse first so the rest of this
  // test still exercises the armed-without-selection empty state from a paused start.
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  internals.setPanelCollapsedTestState('left', true);
  internals.setPanelCollapsedTestState('right', true);
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  internals.expandPanel();
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'false');
  assert.match(internals.getPanelHtml(), /raven-grab-element-placeholder[^>]*>Click an element to inspect</);
  assert.doesNotMatch(internals.getPanelHtml(), /data-tab="request"/);
  // [data-send] is gone — the singleton dock's [data-send-batch] button is
  // now the one send CTA, disabled whenever batchUiState() has nothing
  // dispatchable (no live selection here).
  assert.equal(internals.batchUiState().enabled, false);
  internals.renderPanel();
  assert.match(internals.getGlobalActionsHtml(), /data-send-batch[^>]*disabled/);

  internals.setArmed(false);
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
  internals.setArmed(true);
  // Re-arming returns to cold open: collapsed, edge tab offered.
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'false');
});

test('overlay collapses to an edge tab without clearing selection and expands from the tab', async () => {
  const { internals } = await loadOverlayInternals();
  internals.expandPanel();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#kept-selection');
  internals.renderPanel();

  assert.equal(typeof internals.collapsePanel, 'function');
  internals.collapsePanel();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelAttribute('inert'), '');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'false');
  assert.match(internals.getPanelHtml(), /#kept-selection/);

  internals.dispatchEdgeTab('click', { stopPropagation() {} });
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'false');
  assert.equal(internals.getPanelAttribute('inert'), null);
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
  assert.match(internals.getPanelHtml(), /#kept-selection/);

  internals.collapsePanel();
  internals.dismiss();
  // Dismiss resets to cold open: panels collapsed, tabs hidden until re-arm.
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelAttribute('inert'), null);
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');

  internals.expandPanel();
  internals.setStyleContext({ style: fakeStyle() }, {}, [], '#disarm-selection');
  internals.renderPanel();
  internals.collapsePanel();
  internals.setArmed(false);
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
});


test('REGRESSION: Assets tab is Design-only on the right; page template + role CTA on the left', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#assets-sel');
  internals.renderPanel();
  assert.doesNotMatch(internals.getPanelHtml(), /data-tab="request"|data-tab="design"/);
  assert.match(internals.getPanelLeftHtml(), /data-tab="assets"/);
  assert.match(internals.getPanelLeftHtml(), /Layers/);
  // Send change stays pinned on the right even before Assets is opened.
  assert.match(internals.getGlobalActionsHtml(), /data-send-batch[^>]*disabled/);
  internals.switchTab('assets');
  assert.match(internals.getPanelLeftHtml(), /raven-grab-assets-title[^>]*>Page template</);
  assert.match(internals.getPanelLeftHtml(), /raven-grab-assets-title[^>]*>Component</);
  assert.match(internals.getPanelLeftHtml(), /Save page as template/);
  assert.match(internals.getPanelLeftHtml(), /Request component/);
  assert.doesNotMatch(internals.getPanelLeftHtml(), /Add layers to the template|Add all layers/);
  // Assets CTA docks on the left; Send change stays on the right (never swaps).
  assert.match(internals.getStructureActionsHtml(), /Request component/);
  assert.match(internals.getGlobalActionsHtml(), /data-send-batch/);
  assert.doesNotMatch(internals.getGlobalActionsHtml(), /Request component/);

  const maintainer = await loadOverlayInternals({ lowercaseConfig: { role: 'maintainer' } });
  maintainer.internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#assets-sel');
  maintainer.internals.switchTab('assets');
  assert.match(maintainer.internals.getStructureActionsHtml(), /Add component/);
  assert.doesNotMatch(maintainer.internals.getStructureActionsHtml(), /Request component/);
  assert.match(maintainer.internals.getGlobalActionsHtml(), /data-send-batch/);
});

test('REGRESSION: component artifact builds full descendants subtree', async () => {
  const { internals, document } = await loadOverlayInternals();
  const root = document.createElement('section');
  root.id = 'card';
  const child = document.createElement('button');
  child.className = 'cta';
  root.appendChild(child);
  document.body.appendChild(root);
  internals.setStyleContext(root, { color: 'rgb(0, 0, 0)' }, [], 'section#card');
  internals.setComponentName('Feature card');
  const artifact = internals.componentArtifactFromSelection();
  assert.ok(artifact);
  assert.equal(artifact.componentId, 'feature-card');
  assert.equal(artifact.name, 'Feature card');
  assert.equal(artifact.subtree.children.length, 1);
  assert.ok(artifact.subtree.children[0].selector);
});

test('component routes persist DESIGN.md artifacts and round-trip by id', async () => {
  const designPath = await makeDesignFixture();
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    const session = JSON.parse(started.content[0].text);
    const key = sessionKey(session);
    const artifact = {
      componentId: 'feature-card',
      name: 'Feature card',
      page: '/pricing',
      rootSelector: 'section#card',
      subtree: {
        selector: 'section#card',
        children: [{ selector: 'section#card > button.cta', children: [] }]
      },
      note: 'Compact hover'
    };
    const savedResponse = await fetch(`${session.url}/components?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artifact)
    });
    assert.equal(savedResponse.status, 200);
    assert.deepEqual(await savedResponse.json(), { saved: true, componentId: 'feature-card' });
    const persisted = await readFile(designPath, 'utf8');
    assert.match(persisted, /components:/);
    assert.match(persisted, /feature-card:/);

    const listed = await fetch(`${session.url}/components?page=%2Fpricing&key=${key}`);
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.components.length, 1);
    assert.equal(listedBody.components[0].componentId, 'feature-card');

    const got = await fetch(`${session.url}/components?componentId=feature-card&key=${key}`);
    assert.equal(got.status, 200);
    const body = await got.json();
    assert.equal(body.name, 'Feature card');
    assert.equal(body.rootSelector, 'section#card');
    assert.deepEqual(body.subtree, artifact.subtree);
    assert.equal(body.note, 'Compact hover');

    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('left structure panel renders its own aside and collapses in sync with the design panel', async () => {
  const { internals } = await loadOverlayInternals();
  internals.expandPanel();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#split-selection');
  internals.renderPanel();

  assert.equal(internals.getPanelLeftAttribute('data-side'), 'left');
  assert.match(internals.getPanelLeftHtml(), /Raven Design/);
  // The right panel carries a title of its own now, but only simple mode displays it
  // (CSS-gated) -- in the two-panel layout the left panel is still the only titled one.
  assert.doesNotMatch(internals.getPanelHtml(), /Raven Design/);
  assert.match(internals.getPanelHtml(), /<div class="raven-grab-title"><strong>Raven<\/strong><\/div>/);
  assert.match(internals.getPanelLeftHtml(), /data-tab="assets"/);
  assert.match(internals.getPanelLeftHtml(), /data-tab="layers"/);
  assert.match(internals.getPanelLeftHtml(), /data-status-b/);
  assert.doesNotMatch(internals.getPanelHtml(), /data-tab="assets"/);

  // Collapsing the right panel leaves the left panel open (per-panel collapse).
  internals.collapsePanel();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelLeftAttribute('inert'), null);

  internals.collapsePanel(true);
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelLeftAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelLeftAttribute('inert'), '');

  // Either edge tab expands BOTH panels (Andrew, 2026-07-19) -- the left side is no
  // longer still collapsed after clicking the right tab.
  internals.dispatchEdgeTab('click', { stopPropagation() {} });
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  internals.dispatchEdgeTabLeft('click', { stopPropagation() {} });
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelLeftAttribute('inert'), null);

  internals.dismiss();
  assert.equal(internals.getPanelLeftAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelLeftHtml(), '');
});

test('panel headers render mirrored layout presets while edge tabs retain the panel icon', async () => {
  const { internals } = await loadOverlayInternals();
  internals.expandPanel();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#edge-tabs');
  internals.renderPanel();

  assert.equal(internals.getEdgeTabLeftAttribute('data-side'), 'left');
  assert.match(internals.getEdgeTabHtml(), /<svg/);
  assert.match(internals.getEdgeTabLeftHtml(), /<svg/);
  for (const markup of [internals.getPanelHtml(), internals.getPanelLeftHtml()]) {
    assert.match(markup, /role="radiogroup" aria-label="Panel layout"/);
    assert.equal((markup.match(/data-panel-preset=/g) || []).length, 4);
    assert.match(markup, /data-panel-preset="both"[^>]*aria-checked="true"[^>]*aria-label="Open both"/);
    assert.match(markup, /data-panel-preset="left"[^>]*aria-label="Show left only"/);
    assert.match(markup, /data-panel-preset="right"[^>]*aria-label="Show right only"/);
    assert.match(markup, /data-panel-preset="page"[^>]*aria-label="Close both"/);
    assert.doesNotMatch(markup, /data-collapse|aria-label="Collapse/);
  }

  // Only the collapsed panel's own edge tab shows.
  internals.collapsePanel(true);
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
  assert.equal(internals.getEdgeTabLeftAttribute('aria-hidden'), 'false');

  internals.dispatchEdgeTabLeft('click', { stopPropagation() {} });
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
  assert.equal(internals.getEdgeTabLeftAttribute('aria-hidden'), 'true');
});

test('layout presets set both panel states, synchronize both radio groups, and preserve deliberate properties dismissal', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.expandPanel();
  internals.renderPanel();
  const keys = ['both', 'left', 'right', 'page'];
  const makeButtons = () => keys.map((key) => {
    const button = document.createElement('button');
    button.setAttribute('data-panel-preset', key);
    return button;
  });
  const rightButtons = makeButtons();
  const leftButtons = makeButtons();
  internals.setPanelQueryAll('[data-panel-preset]', rightButtons);
  internals.setPanelLeftQueryAll('[data-panel-preset]', leftButtons);
  const clickPreset = (key) => {
    const target = document.createElement('button');
    target.setAttribute('data-panel-preset', key);
    target.closest = (selector) => selector === '[data-panel-preset]' ? target : null;
    internals.dispatchPanel('click', { target, stopPropagation() {} });
  };
  const checked = (buttons) => buttons.filter((button) => button.getAttribute('aria-checked') === 'true').map((button) => button.getAttribute('data-panel-preset'));

  clickPreset('left');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.deepEqual(checked(rightButtons), ['left']);
  assert.deepEqual(checked(leftButtons), ['left']);

  clickPreset('both');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.deepEqual(checked(rightButtons), ['both']);

  clickPreset('page');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.deepEqual(checked(leftButtons), ['page']);

  const selected = document.createElement('div');
  selected.style = fakeStyle();
  internals.setStyleContext(selected, { color: 'rgb(0, 0, 0)' }, [], '#preset-selection');
  internals.selectTarget(selected, false, 'canvas');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true', 'a preset that closes properties records a deliberate dismissal');

  clickPreset('right');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false', 'opening properties through a preset clears deliberate dismissal');
  assert.deepEqual(checked(rightButtons), ['right']);
});

test('disarming clears a deliberate properties dismissal so the next session can still open it', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.expandPanel();
  internals.renderPanel();
  const clickPreset = (key) => {
    const target = document.createElement('button');
    target.setAttribute('data-panel-preset', key);
    target.closest = (selector) => selector === '[data-panel-preset]' ? target : null;
    internals.dispatchPanel('click', { target, stopPropagation() {} });
  };

  // Deliberately close properties, then end the grab session and start a new one.
  clickPreset('left');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  internals.setArmed(false);
  internals.setArmed(true);

  // Open only the layers panel, the way an edge tab would, and select something.
  internals.setPanelCollapsedTestState('left', false);
  const selected = document.createElement('div');
  selected.style = fakeStyle();
  internals.setStyleContext(selected, { color: 'rgb(0, 0, 0)' }, [], '#rearm-selection');
  internals.selectTarget(selected, false, 'canvas');
  assert.equal(
    internals.getPanelAttribute('data-collapsed'),
    'false',
    'a dismissal from a previous session must not survive disarm -- otherwise every later selection is a dead end with nowhere to show its tokens and styles'
  );
});

test('Cmd+. / Ctrl+. toggle both panels together, synchronize presets, and clear properties dismissal on expand', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.expandPanel();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#cmd-period');
  internals.renderPanel();
  const keys = ['both', 'left', 'right', 'page'];
  const makeButtons = () => keys.map((key) => {
    const button = document.createElement('button');
    button.setAttribute('data-panel-preset', key);
    return button;
  });
  const rightButtons = makeButtons();
  const leftButtons = makeButtons();
  const checked = (buttons) => buttons.filter((button) => button.getAttribute('aria-checked') === 'true').map((button) => button.getAttribute('data-panel-preset'));
  internals.setPanelQueryAll('[data-panel-preset]', rightButtons);
  internals.setPanelLeftQueryAll('[data-panel-preset]', leftButtons);
  const pressShortcut = (useCtrl = false) => document.dispatch('keydown', {
    key: '.',
    code: 'Period',
    metaKey: !useCtrl,
    ctrlKey: useCtrl,
    altKey: false,
    shiftKey: false,
    repeat: false,
    preventDefault() {},
    stopImmediatePropagation() {},
    composedPath() { return []; }
  });

  assert.equal(typeof internals.togglePanels, 'function');
  internals.setPanelCollapsedTestState('left', false);
  assert.deepEqual(checked(rightButtons), ['both']);
  assert.deepEqual(checked(leftButtons), ['both']);
  pressShortcut(true);
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'true');
  assert.deepEqual(checked(rightButtons), ['page']);
  assert.deepEqual(checked(leftButtons), ['page']);

  pressShortcut(true);
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.deepEqual(checked(rightButtons), ['both']);
  assert.deepEqual(checked(leftButtons), ['both']);

  internals.setPanelCollapsedTestState('right', true);
  const selected = document.createElement('div');
  selected.style = fakeStyle();
  internals.selectTarget(selected, false, 'canvas');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false', 'shortcut expansion clears deliberate properties dismissal before the next selection');
  assert.deepEqual(checked(rightButtons), ['both']);

  // One panel open -> Cmd+. collapses both (any-expanded state collapses).
  internals.setPanelCollapsedTestState('right', true);
  // The left tab reopens both, so the right panel is expanded again here.
  internals.dispatchEdgeTabLeft('click', { stopPropagation() {} });
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  pressShortcut();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'true');
  assert.deepEqual(checked(rightButtons), ['page']);

  // Both collapsed -> Cmd+. expands both.
  pressShortcut();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  assert.deepEqual(checked(rightButtons), ['both']);
});

test('overlay header drag captures the pointer and clamps the panel inside an 8px viewport margin', async () => {
  const { internals } = await loadOverlayInternals();
  internals.expandPanel();
  const headerTarget = {
    closest(selector) {
      if (selector === '.raven-grab-header') return this;
      return null;
    }
  };
  internals.setPanelRect({ left: 1080, top: 20, width: 360, height: 400 });

  internals.dispatchPanel('pointerdown', {
    target: headerTarget,
    pointerId: 7,
    button: 0,
    clientX: 1100,
    clientY: 40,
    preventDefault() {}
  });
  assert.equal(internals.getPanelCapturedPointer(), 7);
  assert.equal(internals.getPanelAttribute('data-dragging'), 'true');

  internals.dispatchPanel('pointermove', { pointerId: 7, clientX: 2000, clientY: 0 });
  assert.equal(internals.getPanelStyle('right'), 'auto');
  assert.equal(internals.getPanelStyle('left'), '1072px');
  // Panels are pinned full-height; drag is horizontal-only and never sets top.
  assert.equal(internals.getPanelStyle('top'), undefined);

  internals.dispatchPanel('pointerup', { pointerId: 7 });
  assert.equal(internals.getPanelCapturedPointer(), null);
  assert.equal(internals.getPanelAttribute('data-dragging'), null);
});

test('REGRESSION: background shorthand token matches background-color row with closed-row unlink', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext(
    { style: fakeStyle() },
    { 'background-color': '#112233' },
    [{ property: 'background', name: 'surface', value: '#112233', cssVar: '--color-surface', bridgeToken: { path: 'colors.surface' } }]
  );
  internals.renderPanel();
  const html = internals.getPanelHtml();
  assert.match(html, /data-style-property="background-color"[^>]*data-token-index="0"/);
  assert.match(html, /data-token-detach="background-color"/);
  assert.match(html, /raven-grab-token-glyph/);
  assert.equal(internals.tokenPropertyMatches('background', 'background-color'), true);
  assert.equal(internals.matchedTokenEntryForProperty('background-color').index, 0);
});

test('REGRESSION: detach from closed tokenized row force-commits literal value', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(0, 191, 255)' }) };
  internals.setStyleContext(
    element,
    { color: 'rgb(0, 191, 255)' },
    [{ property: 'color', name: 'primary', value: '#00BFFF', cssVar: '--color-primary', group: 'colors', bridgeToken: { path: 'colors.primary' } }]
  );
  internals.renderPanel();
  internals.detachTokenBinding('color');
  assert.equal(internals.styleEditsForSend().find((edit) => edit.property === 'color').newValue, '#00BFFF');
  assert.doesNotMatch(internals.getPanelHtml(), /data-token-index="0"/);
});

test('overlay renders color swatches beside custom token values and inline color style editors', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(
    element,
    { color: 'rgb(17, 34, 51)', padding: '16px' },
    [{ property: 'background', name: 'surface', value: '#112233', cssVar: '--color-surface', bridgeToken: { path: 'colors.surface' } }]
  );
  internals.renderPanel();
  internals.toggleSection('styles');
  assert.match(internals.getPanelHtml(), /data-style-property="background-color"[^>]*data-token-index="0"/);
  assert.match(internals.getPanelHtml(), /surface · #112233/);
  assert.doesNotMatch(internals.getPanelHtml(), /data-new-color=/);

  const tokenRow = {
    child: null,
    getAttribute(name) {
      if (name === 'data-style-property') return 'background-color';
      if (name === 'data-token-index') return '0';
      return null;
    },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const tokenCell = document.createElement('code');
  tokenCell.setAttribute('data-style-raw', '#112233');
  tokenCell.textContent = 'surface · #112233';
  tokenCell.parentElement = tokenRow;
  tokenCell.parentNode = tokenRow;
  internals.beginStyleEdit(tokenCell);
  const tokenBlock = tokenRow.child.children.find((child) => child.className === 'raven-grab-token-inline');
  assert.ok(tokenBlock);
  const choiceRow = tokenBlock.children[0].children.find((child) => child.className === 'raven-grab-token-choice-row');
  assert.ok(choiceRow);
  const tokenSelect = choiceRow.children.find((child) => child.getAttribute('data-token-choice') === '0');
  const unlinkBtn = choiceRow.children.find((child) => child.getAttribute('data-token-unlink') === '0');
  const newFields = tokenBlock.children.find((child) => child.getAttribute('data-new-token') === '0');
  assert.ok(tokenSelect);
  assert.ok(unlinkBtn);
  assert.ok(newFields);
  const nameInput = newFields.children[0].children.find((child) => child.getAttribute('data-new-name') === '0');
  const colorEditor = newFields.children[1].children.find((child) => child.className === 'raven-grab-color-editor');
  assert.ok(nameInput);
  assert.ok(colorEditor, 'new-token value should use a color editor for background-color');
  const liveTokenColor = colorEditor.children.find((child) => child.getAttribute('data-new-color') === '0');
  const liveValueInput = colorEditor.children.find((child) => child.getAttribute('data-new-value') === '0');
  assert.ok(liveTokenColor);
  assert.ok(liveValueInput);
  assert.equal(liveTokenColor.type, 'color');
  assert.equal(liveTokenColor.value, '#112233');
  assert.equal(liveValueInput.getAttribute('spellcheck'), 'false');

  tokenSelect.value = '__new__';
  nameInput.value = 'surface-custom';
  liveValueInput.value = '#112233';
  internals.setPanelQuery('[data-token-choice="0"]', tokenSelect);
  internals.setPanelQuery('[data-new-token="0"]', newFields);
  internals.setPanelQuery('[data-new-name="0"]', nameInput);
  internals.setPanelQuery('[data-new-value="0"]', liveValueInput);
  liveTokenColor.value = '#abcdef';
  internals.dispatchPanel('input', { target: liveTokenColor });
  assert.equal(liveValueInput.value, '#abcdef');
  assert.equal(element.style.getPropertyValue('--color-surface'), '#abcdef');
  assert.equal(internals.payloadForSend().tokenIntents[0].newTokenValue, '#abcdef');

  liveValueInput.value = 'definitely-invalid';
  internals.dispatchPanel('input', { target: liveValueInput });
  assert.equal(newFields.getAttribute('data-error'), 'true');
  // Invalid input keeps the last-valid LIVE PREVIEW (a typo mid-edit must not wipe
  // the good value the user already previewed) — pre-existing invariant, preserved.
  assert.equal(element.style.getPropertyValue('--color-surface'), '#abcdef');
  // Under the one-button collapse, an invalid edit is flagged in the intent so the
  // single global send gate (hasInvalidDrafts) blocks dispatch — this is where the
  // old "a bad value can't be sent" invariant now lives (it used to be enforced by
  // the payload silently retaining the last-valid value; the new model marks it
  // invalid and refuses to send instead, which is stronger).
  assert.equal(internals.hasInvalidDrafts(), true);

  const colorRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const colorCell = document.createElement('code');
  colorCell.textContent = 'rgb(17, 34, 51)';
  colorCell.parentElement = colorRow;
  colorCell.parentNode = colorRow;
  internals.beginStyleEdit(colorCell);
  assert.equal(colorRow.child.className, 'raven-grab-style-editor');
  assert.equal(colorRow.child.children.some((child) => child.type === 'color'), true);
  assert.equal(colorRow.child.children.some((child) => child.type === 'text' && child.getAttribute('spellcheck') === 'false'), true);
  const styleColor = colorRow.child.children.find((child) => child.type === 'color');
  styleColor.value = '#abcdef';
  styleColor.dispatch('change', {});
  assert.equal(element.style.getPropertyValue('color'), '#abcdef');
  assert.equal(internals.styleEditsForSend().find((edit) => edit.property === 'color').newValue, '#abcdef');

  const paddingRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const paddingCell = document.createElement('code');
  paddingCell.textContent = '16px';
  paddingCell.parentElement = paddingRow;
  paddingCell.parentNode = paddingRow;
  internals.beginStyleEdit(paddingCell);
  // Single-value numerics get a number field plus a UNIT DROPDOWN (the unit is a
  // choice — px/pt/rem/cm — not a fixed tag), wrapped in the editor container.
  assert.equal(paddingRow.child.className, 'raven-grab-style-editor');
  const paddingNumber = paddingRow.child.children.find((child) => child.getAttribute('data-style-input') === 'padding');
  assert.ok(paddingNumber, 'padding value should render a numeric expression input');
  assert.equal(paddingNumber.type, 'text');
  assert.equal(paddingNumber.getAttribute('inputmode'), 'decimal');
  assert.equal(paddingNumber.value, '16');
  const paddingUnit = paddingRow.child.children.find((child) => child.className === 'raven-grab-style-unit');
  assert.ok(paddingUnit, 'padding value should render a selectable unit control');
  assert.match(paddingUnit.innerHTML, /value="px"[^>]*selected/, 'current unit px is preselected');
  assert.match(paddingUnit.innerHTML, /value="pt"/, 'alternative units are offered');

  const computed = internals.computedStylesFor({
    computedStyle: fakeStyle({
      'background-color': 'rgb(1, 2, 3)',
      fill: 'rgb(7, 8, 9)',
      stroke: 'rgb(10, 11, 12)'
    })
  });
  assert.deepEqual(
    ['background-color', 'fill', 'stroke'].map((property) => computed[property]),
    ['rgb(1, 2, 3)', 'rgb(7, 8, 9)', 'rgb(10, 11, 12)']
  );
  assert.equal(computed.background, undefined, 'compound background shorthand is hidden from the Styles list');
  assert.equal(computed['outline-color'], undefined, 'outline longhands stay off STYLE_PROPERTIES; Stroke editor owns them');
});

test('REGRESSION: keyword styles use enums/structured editors; exotic CSS goes through Instructions', async () => {
  const { internals, document } = await loadOverlayInternals();
  assert.ok(internals.classifyStyleControl);
  assert.equal(internals.STYLE_PROPERTIES.indexOf('background'), -1);
  assert.equal(internals.STYLE_PROPERTIES.indexOf('overflow-x'), -1);
  assert.equal(internals.STYLE_PROPERTIES.indexOf('overflow-y'), -1);
  assert.ok(internals.STYLE_PROPERTIES.indexOf('background-color') !== -1);
  assert.ok(internals.STYLE_PROPERTIES.indexOf('overflow') !== -1);
  assert.ok(internals.STYLE_PROPERTIES.indexOf('flex-direction') !== -1);
  assert.ok(internals.STYLE_PROPERTIES.indexOf('cursor') !== -1);
  assert.equal(internals.classifyStyleControl('outline-style', 'dashed'), 'enum');
  assert.equal(internals.classifyStyleControl('overflow', 'hidden'), 'overflow');
  assert.equal(internals.classifyStyleControl('text-decoration', 'underline'), 'text-decoration');
  assert.equal(internals.classifyStyleControl('box-shadow', 'none'), 'box-shadow');
  assert.equal(internals.classifyStyleControl('box-shadow', '0 1px 2px rgba(0,0,0,0.3)'), 'box-shadow', 'single-layer shadow keeps the structured editor');
  // A stacked (multi-layer) shadow must NOT open the one-layer structured editor —
  // parseBoxShadowModel keeps only the first layer, so it routes to lossless text.
  assert.equal(internals.classifyStyleControl('box-shadow', '0 1px 2px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.15)'), 'text', 'multi-layer shadow falls back to text to avoid dropping layers');
  assert.equal(internals.classifyStyleControl('font-family', 'Geist, sans-serif'), 'enum');
  assert.equal(internals.classifyStyleControl('width', 'auto'), 'size');
  assert.equal(internals.classifyStyleControl('width', '320px'), 'size');
  assert.equal(internals.classifyStyleControl('height', '100%'), 'size');
  assert.equal(internals.sizeModeForValue('320px'), 'fixed');
  assert.equal(internals.sizeModeForValue('fit-content'), 'hug');
  assert.equal(internals.sizeModeForValue('100%'), 'fill');
  assert.equal(internals.sizeValueForMode('fill'), '100%');
  assert.equal(internals.composeOverflow({ x: 'hidden', y: 'hidden' }), 'hidden');
  assert.equal(internals.composeOverflow({ x: 'hidden', y: 'auto' }), 'hidden auto');
  assert.ok(internals.STYLE_ENUM_OPTIONS['outline-style'].indexOf('dashed') !== -1);
  assert.ok(internals.STYLE_ENUM_OPTIONS['grid-template-columns'].indexOf('1fr 1fr') !== -1);
  assert.equal(internals.composeTextDecoration({ line: 'underline', style: 'wavy', color: '#ff0000' }), 'underline wavy #ff0000');
  assert.equal(internals.composeTextDecoration({ line: 'none', style: 'solid', color: 'currentColor' }), 'none');
  assert.equal(internals.composeBoxShadow({ inset: false, x: '0', y: '2', blur: '8', spread: '0', color: 'rgba(0, 0, 0, 0.12)', unit: 'px' }), '0px 2px 8px 0px rgba(0, 0, 0, 0.12)');
  const fonts = internals.fontFamilyOptions('Geist, sans-serif');
  assert.ok(fonts.indexOf('Geist') !== -1);
  assert.ok(fonts.indexOf('sans-serif') !== -1);
  assert.ok(fonts.indexOf('Geist, sans-serif') === -1);
  assert.ok(fonts.indexOf('Arial') !== -1);
  assert.ok(fonts.indexOf('system-ui') !== -1);
  assert.equal(internals.fontFamilyOptionLabel('system-ui'), 'system-ui (SF on Mac, Segoe on Windows)');
  assert.equal(internals.fontFamilyOptionLabel('Arial'), 'Arial');
  const interFonts = internals.fontFamilyOptions('Inter, "Inter Fallback"');
  assert.ok(interFonts.indexOf('Inter') !== -1);
  assert.ok(interFonts.every(function (name) { return name.indexOf('Inter Fallback') === -1 && name.indexOf('__nextjs') === -1; }));
  assert.ok(interFonts.every(function (name) { return name.charAt(name.length - 1) !== '"'; }));
  const polluted = internals.fontFamilyOptions('__nextjs-Geist, Inter Fallback, Arial');
  assert.ok(polluted.indexOf('Arial') !== -1);
  assert.ok(polluted.indexOf('__nextjs-Geist') === -1);
  assert.ok(polluted.indexOf('Inter Fallback') === -1);

  const shadowRow = {
    getAttribute(name) { return name === 'data-style-property' ? 'box-shadow' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const shadowCell = document.createElement('code');
  shadowCell.setAttribute('data-style-raw', 'none');
  shadowCell.textContent = 'none';
  shadowCell.parentElement = shadowRow;
  shadowCell.parentNode = shadowRow;
  const selected = { style: fakeStyle({ 'box-shadow': 'none' }), nodeType: 1 };
  internals.setStyleContext(selected, { 'box-shadow': 'none' });
  assert.equal(internals.beginBoxShadowEdit(shadowCell), true);
  assert.equal(shadowRow.child.getAttribute('data-control'), 'box-shadow');
  assert.ok(
    Array.from(shadowRow.child.children || []).some((child) => String(child.className || '').indexOf('structured') !== -1)
    || String(shadowRow.child.innerHTML || '').indexOf('Preset') !== -1
    || (shadowRow.child.children && shadowRow.child.children.length >= 4),
    'box-shadow editor mounts preset + structured fields'
  );

  const decoRow = {
    getAttribute(name) { return name === 'data-style-property' ? 'text-decoration' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const decoCell = document.createElement('code');
  decoCell.setAttribute('data-style-raw', 'underline');
  decoCell.textContent = 'underline';
  decoCell.parentElement = decoRow;
  decoCell.parentNode = decoRow;
  internals.setStyleContext(selected, { 'text-decoration': 'underline' });
  assert.equal(internals.beginTextDecorationEdit(decoCell), true);
  assert.equal(decoRow.child.getAttribute('data-control'), 'text-decoration');
});

// The cubic-bezier curve editor's PARSER is the risky half of that feature, not
// the widget. A control that accepts a value it cannot represent writes back its
// own approximation on commit and destroys the original — the same failure the
// stacked-box-shadow fallback already exists to prevent. So most of this test is
// about what classifyStyleControl REFUSES to call "easing".
//
// Mutants (each a string edit on a copy served through RAVEN_GRAB_TEST_OVERLAY,
// radii measured, recorded in test/grab-overlay-easing-control.test.mjs's header
// alongside the widget mutants).
test('REGRESSION: cubic-bezier parsing refuses everything it cannot draw', async () => {
  // The overlay runs in a vm context, so an array it returns has that realm's
  // Array.prototype and deepStrictEqual rejects it against a host literal on
  // prototype identity alone — a failure about realms, not about the value.
  // Array.from re-homes it; null passes through so a "must not parse" assertion
  // still reads as null rather than [].
  const realm = (value) => (Array.isArray(value) || (value && typeof value.length === 'number') ? Array.from(value) : value);
  const { internals } = await loadOverlayInternals();
  const { parseEasingValue, timingFunctionCount, formatCubicBezier, classifyStyleControl } = internals;

  // The five CSS keywords that ARE two-control-point curves, at their spec-exact
  // points. Case-insensitive: a hand-typed "EASE-OUT" is the same function.
  assert.deepEqual(realm(parseEasingValue('linear')), [0, 0, 1, 1]);
  assert.deepEqual(realm(parseEasingValue('ease')), [0.25, 0.1, 0.25, 1]);
  assert.deepEqual(realm(parseEasingValue('ease-in')), [0.42, 0, 1, 1]);
  assert.deepEqual(realm(parseEasingValue('ease-out')), [0, 0, 0.58, 1]);
  assert.deepEqual(realm(parseEasingValue('ease-in-out')), [0.42, 0, 0.58, 1]);
  assert.deepEqual(realm(parseEasingValue('EASE-OUT')), [0, 0, 0.58, 1]);

  // A keyword lookup must not hand out the EASING_KEYWORDS entry itself: the
  // drag handler mutates the array it is given, so one drag on "ease" would
  // rewrite the constant for the rest of the session.
  const borrowed = parseEasingValue('ease');
  borrowed[0] = 0.999;
  assert.deepEqual(realm(parseEasingValue('ease')), [0.25, 0.1, 0.25, 1]);
  assert.deepEqual(realm(internals.EASING_KEYWORDS.ease), [0.25, 0.1, 0.25, 1]);

  assert.deepEqual(realm(parseEasingValue('cubic-bezier(0.4, 0, 0.2, 1)')), [0.4, 0, 0.2, 1]);
  assert.equal(timingFunctionCount('cubic-bezier(0.4, 0, 0.2, 1)'), 1,
    'the commas INSIDE the function are not separators');

  // Two transitions on one element. Splitting on every comma reads this as five
  // functions; not splitting at all reads it as one and lets a single dragged
  // handle rewrite BOTH curves, silently deleting the sibling sub-value.
  assert.equal(timingFunctionCount('cubic-bezier(0.4, 0, 0.2, 1), ease'), 2);
  assert.equal(parseEasingValue('cubic-bezier(0.4, 0, 0.2, 1), ease'), null);
  assert.equal(classifyStyleControl('transition-timing-function', 'cubic-bezier(0.4, 0, 0.2, 1), ease'), 'text');
  assert.equal(timingFunctionCount('cubic-bezier(0,0,1,1), cubic-bezier(0.4,0,0.2,1)'), 2);

  // None of these is a two-control-point curve, so none may be coerced into the
  // nearest-looking bezier.
  for (const value of ['steps(4, end)', 'steps(4)', 'step-start', 'step-end', 'linear(0, 0.25 75%, 1)']) {
    assert.equal(parseEasingValue(value), null, value + ' must not parse as a bezier');
    assert.equal(classifyStyleControl('transition-timing-function', value), 'text', value + ' must stay plain text');
  }

  // CSS Easing L1: x MUST be in [0,1] or the declaration is invalid — a curve
  // editor accepting one would be drawing a value the browser already dropped.
  assert.equal(parseEasingValue('cubic-bezier(-0.1, 0, 0.2, 1)'), null);
  assert.equal(parseEasingValue('cubic-bezier(0.4, 0, 1.2, 1)'), null);
  assert.deepEqual(realm(parseEasingValue('cubic-bezier(0, 0, 1, 1)')), [0, 0, 1, 1], 'exactly at the bounds is valid');
  // y is UNBOUNDED, and that is the whole reason to open a curve editor by hand:
  // overshoot and anticipation live outside the unit square. Clamping y would
  // flatten exactly the curves someone came here to build.
  assert.deepEqual(realm(parseEasingValue('cubic-bezier(0.68, -0.55, 0.27, 1.55)')), [0.68, -0.55, 0.27, 1.55]);

  assert.equal(parseEasingValue('cubic-bezier(0.4, 0, 0.2)'), null, 'three arguments is not a curve');
  assert.equal(parseEasingValue('cubic-bezier(0.4, 0, 0.2, 1, 5)'), null, 'five arguments is not a curve');
  assert.equal(parseEasingValue('cubic-bezier(0.4, 0, 0.2, abc)'), null);
  assert.equal(parseEasingValue('cubic-bezier()'), null);
  assert.equal(parseEasingValue(''), null);
  assert.equal(parseEasingValue(null), null);
  assert.equal(parseEasingValue('wobble'), null, 'an unknown keyword is not a curve');
  // Legal CSS numbers this deliberately rejects. getComputedStyle emits neither,
  // so they arrive only hand-typed, and the text fallback preserves them
  // verbatim — the safe direction. Pinned so a widening states its intent.
  assert.equal(parseEasingValue('cubic-bezier(1e-1, 0, 0.2, 1)'), null);
  assert.equal(parseEasingValue('cubic-bezier(+0.5, 0, 0.2, 1)'), null);

  assert.equal(classifyStyleControl('transition-timing-function', 'ease-out'), 'easing');
  assert.equal(classifyStyleControl('animation-timing-function', 'ease-in'), 'easing');
  // Mixed is handled BEFORE the easing branch: a multi-select whose elements
  // disagree has no single curve to render.
  assert.equal(classifyStyleControl('transition-timing-function', internals.MIXED_STYLE_VALUE), 'text');
  // The branch must not leak onto neighbouring motion rows.
  assert.equal(classifyStyleControl('transition-property', 'transform'), 'text');

  // A duration is a time. Handing it the length list lets the unit dropdown
  // offer "0.2rem" as a transition-duration — a value the browser drops, from a
  // control that presented it.
  assert.deepEqual(realm(internals.unitOptionsForProperty('transition-duration')), ['ms', 's']);
  assert.deepEqual(realm(internals.unitOptionsForProperty('transition-delay')), ['ms', 's']);
  assert.ok(internals.unitOptionsForProperty('width').indexOf('px') !== -1);
  assert.equal(internals.unitOptionsForProperty('width').indexOf('s'), -1);

  assert.equal(formatCubicBezier([0.5, 0, 0.5, 1]), 'cubic-bezier(0.5, 0, 0.5, 1)',
    'a handle landing on a round number reads 0.5, not 0.500');
  assert.deepEqual(realm(parseEasingValue(formatCubicBezier([0.68, -0.55, 0.27, 1.55]))), [0.68, -0.55, 0.27, 1.55],
    'a formatted curve must parse back unchanged, or a drag drifts on every re-open');
});

test('REGRESSION: style categories, Mixed multi-select write-through, size modes, overflow axes', async () => {
  const { internals, document } = await loadOverlayInternals();
  assert.ok(internals.STYLE_CATEGORIES);
  assert.equal(
    internals.STYLE_CATEGORIES.map((category) => category.id).join(','),
    'layout,size,spacing,typography,fill,stroke,effects,motion,interaction'
  );
  const motion = internals.STYLE_CATEGORIES.find((category) => category.id === 'motion');
  assert.ok(motion.properties.indexOf('transition-timing-function') !== -1);
  // STYLE_PROPERTIES is derived from STYLE_CATEGORIES and is what computedStylesFor
  // captures, so a motion row that never reaches the capture set would render in
  // the panel and arrive at the agent empty.
  assert.ok(internals.STYLE_PROPERTIES.indexOf('transition-timing-function') !== -1);
  const typography = internals.STYLE_CATEGORIES.find((category) => category.id === 'typography');
  assert.ok(typography.properties.indexOf('color') !== -1, 'text color lives under Typography');
  assert.equal(typography.properties[typography.properties.length - 1], 'color');
  const layout = internals.STYLE_CATEGORIES.find((category) => category.id === 'layout');
  assert.ok(layout.properties.indexOf('overflow') !== -1);
  assert.equal(layout.properties.indexOf('overflow-x'), -1);

  const a = { style: fakeStyle(), computedStyle: fakeStyle({ width: '10px', color: 'rgb(1, 0, 0)' }), nodeType: 1 };
  const b = { style: fakeStyle(), computedStyle: fakeStyle({ width: '20px', color: 'rgb(0, 0, 1)' }), nodeType: 1 };
  internals.setMultiStyleContext([a, b], { width: '10px', color: 'rgb(1, 0, 0)' });
  assert.equal(internals.resolvedStyleValue('width'), 'Mixed');
  assert.equal(internals.resolvedStyleValue('color'), 'Mixed');
  assert.equal(internals.commitStyleEdit('width', '100%', 'Mixed'), true);
  assert.equal(a.style.getPropertyValue('width'), '100%');
  assert.equal(b.style.getPropertyValue('width'), '100%');
  assert.equal(internals.styleEditsForSend()[0].oldValue, '10px', 'Mixed sentinel is not sent as oldValue');
  assert.equal(internals.styleEditsForSend()[0].newValue, '100%');

  const sizeRow = {
    getAttribute(name) { return name === 'data-style-property' ? 'width' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const sizeCell = document.createElement('code');
  sizeCell.setAttribute('data-style-raw', '100%');
  sizeCell.textContent = '100%';
  sizeCell.parentElement = sizeRow;
  sizeCell.parentNode = sizeRow;
  internals.setStyleContext(a, { width: '100%' });
  assert.equal(internals.beginSizeEdit(sizeCell), true);
  assert.equal(sizeRow.child.getAttribute('data-control'), 'size');
  function findDescendants(node, predicate, found) {
    const list = found || [];
    (node.children || []).forEach((child) => {
      if (predicate(child)) list.push(child);
      findDescendants(child, predicate, list);
    });
    return list;
  }
  const modeSelect = findDescendants(sizeRow.child, (node) => node.getAttribute && node.getAttribute('aria-label') === 'width size mode')[0];
  assert.ok(modeSelect);
  assert.match(modeSelect.innerHTML, /value="fill"[^>]*selected/, 'Fill mode is selected for 100% width');
  const numberInput = findDescendants(sizeRow.child, (node) => node.getAttribute && node.getAttribute('data-style-input') === 'width')[0];
  assert.ok(numberInput);
  assert.equal(numberInput.disabled, true, 'Fill mode disables the numeric width input');

  const overflowRow = {
    getAttribute(name) { return name === 'data-style-property' ? 'overflow' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const overflowCell = document.createElement('code');
  overflowCell.setAttribute('data-style-raw', 'hidden');
  overflowCell.textContent = 'hidden';
  overflowCell.parentElement = overflowRow;
  overflowCell.parentNode = overflowRow;
  const overflowTarget = {
    style: fakeStyle({ overflow: 'hidden' }),
    computedStyle: fakeStyle({ 'overflow-x': 'hidden', 'overflow-y': 'hidden' }),
    nodeType: 1
  };
  internals.setStyleContext(overflowTarget, { overflow: 'hidden' });
  assert.equal(internals.beginOverflowEdit(overflowCell), true);
  assert.equal(overflowRow.child.getAttribute('data-control'), 'overflow');
  assert.equal(
    findDescendants(overflowRow.child, (node) => node.getAttribute && /^Overflow [XY]$/.test(String(node.getAttribute('aria-label') || ''))).length,
    2,
    'overflow editor exposes X and Y axes'
  );
});

test('overlay panel CSS keeps only the body scrollable and provides the collapsed edge tab', async () => {
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  assert.match(source, /\.raven-grab-panel \{[\s\S]*top: 20px; right: 20px; bottom: 20px;[\s\S]*flex-direction: column;/);
  assert.match(source, /\.raven-grab-panel\[data-side="left"\] \{ right: auto; left: 20px; \}/);
  assert.match(source, /\.raven-grab-panel\[data-side="left"\]\[data-collapsed="true"\] \{ transform: translateX\(calc\(-100vw - 100%\)\); \}/);
  assert.match(source, /\.raven-grab-top \{ flex: 0 0 auto;/);
  assert.match(source, /\.raven-grab-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto;/);
  assert.match(source, /\.raven-grab-actions \{ flex: 0 0 auto;/);
  assert.match(source, /\.raven-grab-composer \.raven-grab-textarea \{[^}]*max-height: 30vh;/);
  assert.match(source, /\.raven-grab-layer-row\[data-selected="true"\] \{ background: rgba\(0, 191, 255, \.08\); \}/);
  assert.match(source, /var isSelected = !!element && membership\.indexOf\(element\) !== -1;/);
  assert.match(source, /\.raven-grab-multi-badge \{[\s\S]*z-index: 1;/);
  assert.match(source, /\.raven-grab-panel \{[\s\S]*z-index: 2;/);
  assert.match(source, /\.raven-grab-edge-tab \{[\s\S]*z-index: 2;/);
  assert.match(source, /\.raven-grab-collapsible-inner \{[^}]*visibility: visible;[^}]*transition: visibility 0s linear;/);
  assert.match(source, /\.raven-grab-collapsible\[data-open="false"\] \.raven-grab-collapsible-inner \{ visibility: hidden; transition-delay: 150ms; \}/);
  assert.doesNotMatch(source, /\.raven-grab-arm\b/);
  assert.match(source, /\.raven-grab-panel\[data-collapsed="true"\] \{[^}]*transform: translateX\(calc\(100vw \+ 100%\)\);[^}]*pointer-events: none;/);
  assert.match(source, /\.raven-grab-edge-tab \{[\s\S]*right: 0; top: 33px;[\s\S]*width: 44px; min-height: 44px;[\s\S]*background: rgba\(22, 44, 66, \.9\);[\s\S]*border-radius: 12px 0 0 12px;/);
  assert.match(source, /\.raven-grab-header \{[\s\S]*cursor: grab;/);
  assert.match(source, /\.raven-grab-panel\[data-dragging="true"\] \.raven-grab-header \{ cursor: grabbing; \}/);
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /Math\.max\(8, Math\.min\([^;]*innerWidth[^;]*- 8/);
  assert.match(source, /Math\.max\(8, Math\.min\([^;]*innerHeight[^;]*- 8/);
  assert.match(source, /window\.addEventListener\("resize", function \(\) \{[\s\S]*clampPanelToViewport\(\)/);
  assert.match(source, /\.raven-grab-send\[data-send-state="collapse"\]/);
  assert.match(source, /\.raven-grab-send\[data-send-state="dot"\][\s\S]*width: 12px;[\s\S]*height: 12px;[\s\S]*background: #00BFFF;/);
  assert.match(source, /\.raven-grab-send\[data-send-state="trace"\][\s\S]*background: transparent;/);
  assert.match(source, /@keyframes raven-grab-draw[\s\S]*stroke-dashoffset: 0;/);
  assert.match(source, /\.raven-grab-send\[data-send-state="sent"\][\s\S]*background: rgba\(22, 44, 66, \.9\);[\s\S]*border: 1px solid transparent;[\s\S]*backdrop-filter: blur\(6px\);/);
  assert.match(source, /@keyframes raven-grab-static-border[\s\S]*100% \{ border-color: #00BFFF; \}/);
  assert.match(source, /raven-grab-border-trace[\s\S]*pathLength="1"/);
  assert.match(source, /\.raven-grab-border-trace rect[\s\S]*stroke-dasharray: 1;[\s\S]*stroke-dashoffset: 1;/);
  assert.match(source, /@keyframes raven-grab-trace-border[\s\S]*stroke-dashoffset: 0;/);
  assert.match(source, /\.raven-grab-sent-message[\s\S]*clip-path/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.raven-grab-panel, \.raven-grab-send, \.raven-grab-textarea \{ transition: none !important; \}/);
});

test('panel preset tooltip escapes panel clipping through one fixed shadow-root node', async () => {
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  assert.match(source, /\.raven-grab-panel-preset-tip \{\s*position: fixed;[\s\S]*pointer-events: none;/);
  assert.match(source, /shadow\.appendChild\(panelPresetTooltip\);/);
  assert.match(source, /var triggerCenter = triggerRect\.left \+ triggerRect\.width \/ 2;[\s\S]*panelPresetTooltip\.style\.left = triggerCenter \+ "px";/);
  // Always above, never flipped below: the cursor bitmap extends down from the hotspot,
  // so a below-placed tooltip sits under the pointer that summoned it.
  assert.match(source, /panelPresetTooltip\.setAttribute\("data-placement", "above"\);/);
  assert.match(source, /Math\.max\(2, triggerRect\.top - tooltipRect\.height - gap\)/);
  assert.doesNotMatch(source, /fitsAbove \? "above" : "below"/);
  // The tail is unconditional (there is no below placement to flip to) and tracks the
  // trigger, so a tip clamped away from its tile's centre still points at the tile.
  assert.match(source, /\.raven-grab-panel-preset-tip::after \{[\s\S]*left: var\(--raven-grab-tip-tail, 50%\);[\s\S]*border-top: 5px solid #1a1a22;/);
  assert.match(source, /setProperty\("--raven-grab-tip-tail", \(triggerCenter - \(center - half\)\) \+ "px"\)/);
  // Never wraps: a two-line tip is taller than the headroom above the panel tiles,
  // which is the one way "always above" can land on top of what it describes.
  assert.match(source, /\.raven-grab-panel-preset-tip \{[\s\S]*white-space: nowrap;/);
  assert.doesNotMatch(source, /\.raven-grab-panel-preset-tip \{[\s\S]*max-width: 220px;/);

  // The settings dialog is ONE size and never resizes to its content. A min/max-height
  // range let it size to the showing pane, so Settings -> Feedback jumped 480 -> 507
  // and the dialog re-centred under the cursor mid-click.
  assert.match(source, /\.raven-grab-settings-dialog \{[\s\S]*height: min\(540px, calc\(100vh - 64px\)\);/);
  assert.doesNotMatch(source, /\.raven-grab-settings-dialog \{[^}]*min-height:/);
  assert.doesNotMatch(source, /\.raven-grab-settings-dialog \{[^}]*max-height:/);
  // The narrow-viewport sheet has to cancel that fixed height, not the old range.
  assert.match(source, /\.raven-grab-settings-dialog \{[^}]*width: 100%; height: auto; \}/);

  // The project name is the subject of the row, so it outranks the shortcut chip:
  // primary colour and a size above the 12px the trigger sets.
  assert.match(source, /\.raven-grab-settings-project \{[^}]*color: var\(--raven-grab-text\);[^}]*font: 600 calc\(13px \* var\(--raven-grab-font-scale\)\)/);
  // Gear pinned to the far edge and never squeezed by a long project name --
  // flex:0 0 auto is what makes the name truncate instead of shoving the icon.
  assert.match(source, /\.raven-grab-settings-gear \{ flex: 0 0 auto; margin-left: auto;/);
  // Inlined Phosphor gear-six. The overlay is one file and must not fetch an icon
  // from a stranger's dev server, so a remote <img>/<use> here is a real regression.
  assert.match(source, /class="raven-grab-settings-gear" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"/);
  assert.match(source, /settingsProjectMarkup \+ settingsGearMarkup/);
  assert.match(source, /onPanels\("focusin", function \(event\) \{[\s\S]*showPanelPresetTooltip\(preset\);/);
  assert.match(source, /window\.addEventListener\("scroll", function \(\) \{\s*hidePanelPresetTooltip\(\);/);
  // Block form: setPanelCollapsed's collapse branch also ends any dictation whose
  // field the collapse is about to hide (voice round 2) — the pinned property is
  // still "collapsing hides the tooltip", now first statement in the block.
  assert.match(source, /if \(next\) \{\s*hidePanelPresetTooltip\(\);/);
  assert.match(source, /<span class="raven-grab-panel-preset-tip-source" aria-hidden="true">[\s\S]*<kbd>/);
  assert.doesNotMatch(source, /\.raven-grab-panel-preset-tip \{\s*position: absolute;[^}]*top: calc\(100% \+ 10px\);[^}]*right: 0;/);

  // Settings must be reachable from whichever panel is on screen. Rendering the gear
  // into the left panel alone stranded it off-screen under "Show right only" and in
  // every simple-mode session, with no keyboard way back: the ⌘K chord only fires
  // once focus is already inside Raven. Both panels carry it; CSS shows exactly one.
  // The composer drops out of the actions block ONLY in the mobile tabbed sheet, where
  // Instructions is its own tab. mobileTabbedSheetMode() is false above 760px, so the
  // desktop composition is unchanged -- the actions host and the settings footer stay
  // pinned here, and the conditional is pinned too so it cannot silently widen.
  assert.match(source, /var actionMarkupA = \(mobileTabbedSheetMode\(\) \? "" : footerMarkupA\) \+ '<div class="raven-grab-global-actions-host"><\/div>' \+ structureFooterMarkup;/);
  assert.match(source, /:host\(\[data-settings-home="right"\]\) \.raven-grab-panel:not\(\[data-side="left"\]\) \.raven-grab-structure-footer \{ display: block; \}/);
  // :not([data-side=left]) on purpose -- the right panel carries no data-side, and
  // adding one would wake the dormant narrow-viewport [data-side="right"] rule.
  assert.doesNotMatch(source, /panel\.setAttribute\("data-side", "right"\)/);
  // Simple mode hides the left panel in CSS whatever its collapse state, so the gear
  // has to follow the right panel unconditionally. Keying only off collapsedSides put
  // it back in the hidden left panel the moment the edge tab or ⌘. opened both.
  // mobileSheetMode() joins the disjunction because the mobile sheet is the right panel;
  // it is false above 760px, so the desktop two-panel resolution is unchanged.
  assert.match(source, /var right = mobileSheetMode\(\) \|\| simpleMode\(\) \|\| \(collapsedSides\.left && !collapsedSides\.right\);/);
  // renderPanel detaches the gear the open modal is holding as its return target.
  assert.match(source, /if \(settingsModalOpen && settingsReturnFocus\) \{[\s\S]*home\.querySelector\("\[data-settings-open\]"\)/);
  // The new controls are selects; omitting them from the trap made Tab wrap to Close.
  assert.match(source, /settingsModal\.querySelectorAll\('button:not\(\[disabled\]\), input:not\(\[disabled\]\), select:not\(\[disabled\]\)/);
  assert.match(source, /function setPanelCollapsed\(el, next\) \{[\s\S]*syncSettingsHome\(\);/);
  // Return focus has to follow the gear too, or Esc drops focus into a hidden button.
  assert.match(source, /var footerHost = host\.getAttribute\("data-settings-home"\) === "right" \? panel : panelLeft;/);

  // Simple mode is prod's tool: element summary, instruction box, Send. No scope, no
  // style editor, no second panel, and no layout tiles describing a choice that is gone.
  // The mobile tabbed sheet swaps in its own four-tab body. Both other arms are
  // unchanged, and mobileTabbedSheetMode() is false above 760px, so desktop still
  // resolves to designMarkup exactly as before.
  assert.match(source, /var bodyMarkupA = simpleMode\(\) \? elementMarkup : \(mobileTabbedSheetMode\(\) \? mobileBodyMarkup : designMarkup\);/);
  assert.match(source, /:host\(\[data-mode="simple"\]\) \.raven-grab-panel\[data-side="left"\] \{ display: none; \}/);
  // Hiding the layout tiles emptied the right panel's header band and left the
  // composer under 600px of nothing, so simple mode swaps in a title and hugs content.
  assert.match(source, /:host\(\[data-mode="simple"\]\) \.raven-grab-panel:not\(\[data-side="left"\]\) \{ bottom: auto; max-height: calc\(100vh - 40px\); \}/);
  assert.match(source, /\.raven-grab-panel:not\(\[data-side="left"\]\) \.raven-grab-title \{ display: none; \}/);
  assert.match(source, /window\.localStorage\.setItem\("raven-grab-mode", next\)/);
  assert.match(source, /window\.localStorage\.setItem\("raven-grab-startup", next\)/);
  // Both preferences are read back through one allow-list, so a hand-edited value
  // in localStorage falls back to the default instead of rendering a broken overlay.
  assert.match(source, /readStoredPreference\("raven-grab-mode", \["simple", "full"\], "full"\)/);
  assert.match(source, /readStoredPreference\("raven-grab-startup", \["open", "collapsed"\], "open"\)/);
  assert.match(source, /var collapsedSides = \{ left: coldCollapsed \|\| simpleMode\(\), right: coldCollapsed \};/);
  // Both preferences are segmented buttons, never a native <select>. A select opens OS
  // chrome outside the page, which over a fixed overlay swallowed the option click --
  // reported by Andrew as "I can't click the simple - request only option".
  assert.match(source, /function settingsChoiceMarkup\(/);
  assert.doesNotMatch(source, /function settingsSelectMarkup\(/);
  assert.match(source, /<div class="raven-grab-settings-choices" role="radiogroup"/);
  assert.match(source, /'<button class="raven-grab-settings-choice" type="button" role="radio" aria-checked="'/);
  // The setters do not re-render the modal, so the group updates its own checked state.
  assert.match(source, /function markChoiceChosen\(button\)/);
  // Layer-row hover previews on settle, never on transit. Consecutive rows describe
  // elements of wildly different size (body, then a thin aside, then a full-width div),
  // so painting each one the pointer merely crossed strobed the whole page -- measured
  // at 14 full-frame jumps in one walk down the list, 0 after.
  assert.match(source, /var LAYER_PREVIEW_SETTLE_MS = \d+;/);
  assert.match(source, /function previewHighlight\(element\)/);
  assert.match(source, /panelHoverTimer = setTimeout\(function \(\) \{[\s\S]*?setHighlight\(element\);[\s\S]*?\}, LAYER_PREVIEW_SETTLE_MS\);/);
  // Leaving the panel is a decision, not transit -- that path stays immediate.
  assert.match(source, /cancelPreviewHighlight\(\);\s*\n\s*setHighlight\(selectedElement\);/);
  // The settings row is one hover surface: chip, title and gear all respond together
  // (Andrew, 2026-07-20). The chip pinning its own colour is what made it the one part
  // that ignored hover, so it must inherit.
  assert.match(source, /\.raven-grab-settings-trigger kbd \{[^}]*color: inherit;/);
  assert.doesNotMatch(source, /\.raven-grab-settings-trigger kbd \{[^}]*color: var\(--raven-grab-muted\);/);
  assert.match(source, /\.raven-grab-settings-trigger:hover, \.raven-grab-settings-trigger:focus-visible \{ color: var\(--raven-grab-text\); background: rgba\(255,255,255,\.05\); \}/);
  assert.match(source, /\.raven-grab-settings-trigger:hover kbd, \.raven-grab-settings-trigger:focus-visible kbd \{/);
  // The title rests a step below full so it has somewhere to go on hover.
  assert.match(source, /\.raven-grab-settings-project \{[^}]*opacity: \.82;/);
  assert.match(source, /\.raven-grab-settings-trigger:focus-visible \.raven-grab-settings-gear \{ opacity: 1; \}/);

  // The section switcher must not carry a per-section branch: it hardcoded
  // feedback-or-settings, so adding Shortcuts gave a tab that did nothing when clicked.
  assert.match(source, /settingsModalSection = nav\.getAttribute\("data-settings-section"\);/);
  assert.match(source, /\{ id: "shortcuts", label: "Shortcuts" \}/);
  // Every chord the overlay listens for is named here -- all of them were
  // undiscoverable while nothing in the UI listed them.
  for (const keys of ['Alt G', 'Alt click', 'Shift click', 'Esc']) {
    assert.match(source, new RegExp('keys: "' + keys + '"'));
  }
});

test('layers tree renders sibling numerals from the applied selector index', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('div');
  const moved = document.createElement('div');
  first.localName = 'header';
  moved.localName = 'main';
  document.body.children = [first, moved];
  first.parentElement = document.body;
  moved.parentElement = document.body;
  const tree = {
    id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
      { id: 2, parentId: 1, depth: 1, label: 'div · First', badges: [], children: [] },
      { id: 3, parentId: 1, depth: 1, label: 'div · Moved', badges: [], children: [] }
    ]
  };
  internals.setLayerTestState(tree, [[1, document.body], [2, first], [3, moved]], moved);
  assert.match(internals.layerRowsMarkup(tree), /raven-grab-layer-index">1<[^>]*>[\s\S]*First[\s\S]*raven-grab-layer-index">2<[^>]*>[\s\S]*Moved/);
  assert.match(internals.layerRowsMarkup(tree), /data-layer-id="3"[^>]*data-selected="true"/);
});

test('layer reorder records Variant B pending state without mutating applied rows or numerals', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  const last = document.createElement('footer');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  last.localName = 'footer';
  parent.parentElement = document.body;
  parent.children = [first, moved, last];
  for (const child of parent.children) child.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = {
    id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
      { id: 2, parentId: 1, depth: 1, label: 'header · First', badges: [], children: [] },
      { id: 3, parentId: 1, depth: 1, label: 'main · Moved', badges: [], children: [] },
      { id: 4, parentId: 1, depth: 1, label: 'footer · Last', badges: [], children: [] }
    ]
  };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved], [4, last]], moved);

  internals.reorderLayer('3', '4');

  assert.deepEqual(Array.from(tree.children, (node) => node.id), [2, 4, 3], 'pending reorder teleports the layer tree to the destination order');
  const pending = internals.getPendingLayerOrder();
  assert.deepEqual(Object.keys(pending).sort(), [
    'baselineChildren', 'baselineOrder', 'clientKey', 'clientSequence', 'domSnapshotHash', 'expectedChildren',
    'fixedMoveNote', 'fromIndex', 'fromSelector', 'movedElement', 'movedElements', 'operationId', 'orderedSelectors',
    'parentElement', 'parentSelector', 'preview', 'state', 'toIndex'
  ]);
  assert.equal(pending.operationId, '');
  assert.equal(pending.fromIndex, 1);
  assert.equal(pending.toIndex, 2);
  assert.equal(pending.state, 'draft');
  assert.equal(pending.domSnapshotHash, '0:0');
  assert.deepEqual(Array.from(pending.baselineOrder), [
    'section > header', 'section > main', 'section > footer'
  ]);
  assert.deepEqual(Array.from(pending.orderedSelectors), [
    'section > header', 'section > footer', 'section > main'
  ]);
  assert.equal(pending.parentElement, parent);
  assert.equal(pending.movedElement, moved);
  assert.deepEqual(Array.from(pending.baselineChildren), [first, moved, last]);
  assert.deepEqual(Array.from(pending.expectedChildren), [first, last, moved]);
  const markup = internals.layerRowsMarkup(tree);
  assert.match(markup, /layer-index">1[\s\S]*First[\s\S]*layer-index">2[\s\S]*Last[\s\S]*layer-index">3[\s\S]*Moved/);
  assert.match(markup, /data-layer-pending="true"[\s\S]*raven-grab-layer-pending-badge">Move pending/);
  assert.doesNotMatch(markup, /Move here pending/, 'reparent-capable tree no longer injects same-parent Move here pending slots');
});

test('same-signature sibling reorder verifies by live element identity', async () => {
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-same-signature', batchId: 'batch-same-signature' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('article');
  const moved = document.createElement('article');
  const last = document.createElement('article');
  parent.localName = 'section';
  for (const child of [first, moved, last]) {
    child.localName = 'article';
    child.classList = ['stat-card'];
    child.parentElement = parent;
  }
  first.textContent = 'First';
  moved.textContent = 'Moved';
  last.textContent = 'Last';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved, last];
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'article · First', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'article · Moved', badges: [], children: [] },
    { id: 4, parentId: 1, depth: 1, label: 'article · Last', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved], [4, last]], moved);
  internals.reorderLayer('3', '4');
  // dispatchPendingBatch() drives the draft to a registered/pending operation
  // (operationId assigned by /layers-intent) before it can be resolved by an
  // operation-result event — reorderLayer() alone no longer produces a
  // resolvable operation id.
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  parent.children = [first, last, moved];
  internals.handleLayerOperationResult({ id: 'op-same-signature', state: 'applied', updatedAt: 'now' });

  assert.equal(internals.getPendingLayerOrder(), null);
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children[0].children, (node) => node.label), [
    'article · First', 'article · Last', 'article · Moved'
  ]);
});

test('pending badge stays on the moved element after a DOM tree rebuild', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  const moved = document.createElement('article');
  const second = document.createElement('article');
  const added = document.createElement('article');
  parent.localName = 'section';
  moved.localName = 'article';
  moved.classList = ['stat-card'];
  moved.textContent = 'Moved';
  second.localName = 'article';
  second.classList = ['stat-card'];
  second.textContent = 'Second';
  added.localName = 'article';
  added.classList = ['stat-card'];
  added.textContent = 'Added';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [moved, second];
  for (const child of parent.children) child.parentElement = parent;
  added.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'article · Moved', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'article · Second', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, moved], [3, second]], moved);
  internals.reorderLayer('2', '3');

  parent.children = [added, moved, second];
  internals.refreshAppliedLayerTree();
  const markup = internals.layerRowsMarkup(internals.getAppliedLayerTree());

  assert.equal(internals.getPendingLayerOrder().state, 'draft');
  assert.match(markup, /data-layer-id="3"[^>]*>[\s\S]*raven-grab-layer-index">1[\s\S]*article · Second/);
  assert.match(markup, /data-layer-id="2"[^>]*>[\s\S]*raven-grab-layer-index">2[\s\S]*article · Moved/);
  assert.match(markup, /data-layer-pending="true"[^>]*>[\s\S]*article · Moved[\s\S]*raven-grab-layer-pending-badge">Move pending/);
  assert.doesNotMatch(markup, /data-layer-pending="true"[^>]*>[\s\S]*article · Second[\s\S]*raven-grab-layer-pending-badge">Move pending/);
});

test('queued layer move resolves immediately when live DOM matches the proposal', async () => {
  const requests = [];
  // The old refreshAppliedLayerTree() used to scan the raw pendingLayerOrder for
  // a live-DOM identity match on every call and adopt it immediately (see git
  // history: adoptRebuiltLayerTree() called straight from refreshAppliedLayerTree).
  // That eager scan is gone from the frozen overlay — refreshAppliedLayerTree()
  // now only ever (a) marks a LOCAL draft "needs-recheck" on baseline mismatch or
  // (b) blocks while any order is active; it never resolves one. Identity-match
  // resolution moved into reconcileAppliedLayerOperation(), which only runs off
  // an operation-result event (handleLayerOperationResult with state:'applied').
  // Migrated to drive a real dispatch (Bucket A) so the draft becomes a
  // registered order, then fire that event — this is the same mechanism, still
  // resolves the pending order to null and posts the rebuilt /layers snapshot
  // immediately once the live DOM matches, which is this test's invariant.
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-queued-match', batchId: 'batch-queued-match' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('article');
  const moved = document.createElement('article');
  parent.localName = 'section';
  first.localName = 'article';
  first.classList = ['stat-card'];
  first.textContent = 'First';
  moved.localName = 'article';
  moved.classList = ['stat-card'];
  moved.textContent = 'Moved';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'article · First', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'article · Moved', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  parent.children = [moved, first];
  internals.handleLayerOperationResult({ id: 'op-queued-match', state: 'applied', updatedAt: 'now' });

  assert.equal(internals.getPendingLayerOrder(), null);
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children[0].children, (node) => node.label), ['article · Moved', 'article · First']);
  assert.ok(requests.some((url) => url.includes('/layers?')), 'identity match should post the rebuilt snapshot immediately');
});

test('sending a layer move stores the operation id and keeps the intent payload additive', async () => {
  const requests = [];
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-17', batchId: 'batch-op-17' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  // sendLayerIntent(draft) no longer POSTs on its own — dispatchPendingBatch()
  // drives register (/layers-intent) then auto-commit (/batch-commit), so the
  // draft lands past "queued" straight into "applying" once this resolves.
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const pending = internals.getPendingLayerOrder();
  assert.equal(pending.operationId, 'op-17');
  assert.equal(pending.state, 'applying');
  const sent = requests.find((request) => request.url.includes('/layers-intent'));
  const payload = JSON.parse(sent.init.body);
  assert.equal(payload.operation, 'reorder');
  assert.equal(payload.parentSelector, pending.parentSelector);
  assert.equal(payload.fromIndex, pending.fromIndex);
  assert.equal(payload.toIndex, pending.toIndex);
  assert.deepEqual(payload.orderedSelectors, Array.from(pending.orderedSelectors));
  assert.equal(payload.fromSelector, pending.fromSelector);
  assert.deepEqual(payload.baselineOrder, Array.from(pending.baselineOrder));
});

test('layer intent measured rects exclude non-layer script children', async () => {
  const requests = [];
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-filtered-preview' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  const script = document.createElement('script');
  const rects = [
    { left: 0, top: 0, width: 200, height: 40 },
    { left: 0, top: 40, width: 200, height: 60 },
    { left: 0, top: 100, width: 0, height: 0 }
  ];
  for (const [index, child] of [first, moved, script].entries()) {
    child.localName = ['header', 'main', 'script'][index];
    child.tagName = ['HEADER', 'MAIN', 'SCRIPT'][index];
    child.parentElement = parent;
    child.computedStyle = { display: 'block', position: 'static', width: '200px' };
    child.getBoundingClientRect = () => rects[index];
  }
  parent.localName = 'section';
  parent.tagName = 'SECTION';
  parent.parentElement = document.body;
  parent.children = [first, moved, script];
  parent.computedStyle = { display: 'block', position: 'static', width: '200px' };
  parent.querySelectorAll = () => [];
  parent.cloneNode = () => {
    const clone = document.createElement('section');
    clone.localName = 'section';
    clone.tagName = 'SECTION';
    clone.children = [first, moved, script].map((child, index) => {
      const clonedChild = document.createElement(child.localName);
      clonedChild.localName = child.localName;
      clonedChild.tagName = child.tagName;
      clonedChild.getBoundingClientRect = () => rects[index];
      return clonedChild;
    });
    clone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
    return clone;
  };
  const originalCreateElement = document.createElement;
  document.createElement = (...args) => {
    const element = originalCreateElement(...args);
    element.remove = () => {};
    return element;
  };
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  // sendLayerIntent(draft) no longer POSTs directly and now takes a draft arg —
  // it's invoked internally (with the draft body it builds) from inside
  // dispatchPendingBatch()'s registration chain. Drive the real dispatch so the
  // POST actually fires.
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const sent = requests.find((request) => request.url.includes('/layers-intent'));
  assert.ok(sent, 'layer intent should be posted');
  const payload = JSON.parse(sent.init.body);
  assert.ok(payload.measuredRects.every((rect) => rect.selector !== ''), 'measured rect selectors must be non-empty');
  assert.equal(payload.measuredRects.length, payload.orderedSelectors.length);
});

test('layer intent measured rects drop measurable clone children without ordered elements', async () => {
  const requests = [];
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-extra-clone-child' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  const rects = [
    { left: 0, top: 0, width: 200, height: 40 },
    { left: 0, top: 40, width: 200, height: 60 },
    { left: 0, top: 100, width: 200, height: 20 }
  ];
  for (const [index, child] of [first, moved].entries()) {
    child.localName = ['header', 'main'][index];
    child.tagName = ['HEADER', 'MAIN'][index];
    child.parentElement = parent;
    child.computedStyle = { display: 'block', position: 'static', width: '200px' };
    child.getBoundingClientRect = () => rects[index];
  }
  parent.localName = 'section';
  parent.tagName = 'SECTION';
  parent.parentElement = document.body;
  parent.children = [first, moved];
  parent.computedStyle = { display: 'block', position: 'static', width: '200px' };
  parent.querySelectorAll = () => [];
  parent.cloneNode = () => {
    const clone = document.createElement('section');
    clone.localName = 'section';
    clone.tagName = 'SECTION';
    clone.children = [first, moved].map((child, index) => {
      const clonedChild = document.createElement(child.localName);
      clonedChild.localName = child.localName;
      clonedChild.tagName = child.tagName;
      clonedChild.getBoundingClientRect = () => rects[index];
      return clonedChild;
    });
    const connectedCallbackChild = document.createElement('div');
    connectedCallbackChild.localName = 'div';
    connectedCallbackChild.tagName = 'DIV';
    connectedCallbackChild.getBoundingClientRect = () => rects[2];
    clone.children.push(connectedCallbackChild);
    clone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 120 });
    return clone;
  };
  const originalCreateElement = document.createElement;
  document.createElement = (...args) => {
    const element = originalCreateElement(...args);
    element.remove = () => {};
    return element;
  };
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  // See "measured rects exclude non-layer script children" above — same
  // migration: sendLayerIntent(draft) only builds the body now, dispatch does
  // the send.
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const sent = requests.find((request) => request.url.includes('/layers-intent'));
  assert.ok(sent, 'layer intent should be posted');
  const payload = JSON.parse(sent.init.body);
  assert.ok(payload.measuredRects.every((rect) => rect.selector !== ''), 'measured rect selectors must be non-empty');
  assert.equal(payload.measuredRects.length, payload.orderedSelectors.length);
});

test('layers intent selectionOrder follows panel multi-selection order', async () => {
  const requests = [];
  const clock = fakeClock();
  const { internals, document, window } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-selection-order' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const second = document.createElement('main');
  const moved = document.createElement('footer');
  parent.parentElement = document.body;
  parent.children = [first, second, moved];
  for (const child of parent.children) child.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] },
    { id: 4, parentId: 1, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, second], [4, moved]], null);
  internals.renderPanel();
  const secondRow = document.createElement('li');
  secondRow.setAttribute('data-layer-id', '3');
  secondRow.setAttribute('data-layer-parent', '1');
  const firstRow = document.createElement('li');
  firstRow.setAttribute('data-layer-id', '2');
  firstRow.setAttribute('data-layer-parent', '1');
  clickPanelRow(internals, window, secondRow);
  clickPanelRow(internals, window, firstRow, { ctrlKey: true });
  internals.reorderLayer('4', '2');

  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const request = requests.find((entry) => entry.url.includes('/layers-intent'));
  assert.ok(request, 'panel selection should be posted with the layer intent');
  assert.deepEqual(JSON.parse(request.init.body).selectionOrder, [3, 2]);
});

test('applied operation keeps pinned numerals until live DOM order matches, then adopts and snapshots', async () => {
  const requests = [];
  // handleLayerOperationResult() only resolves a REGISTERED order (looked up by
  // id in pendingLayerOrders) — a bare reorderLayer() draft has no operationId
  // to match against, so this now needs a real dispatch first (Bucket A).
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-1', batchId: 'batch-op-1' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const originalQuerySelector = document.querySelector;
  document.querySelector = (selector) => selector === 'div > section' ? parent : (originalQuerySelector ? originalQuerySelector.call(document, selector) : null);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  internals.handleLayerOperationResult({ id: 'op-1', state: 'applied', updatedAt: 'now' });
  assert.equal(internals.getPendingLayerOrder().state, 'applying');
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children, (node) => node.label), ['main', 'header'], 'pending/applying tree stays teleported at the destination until live DOM matches');
  assert.match(internals.getPanelLeftHtml(), /Applying…/);

  parent.children = [moved, first];
  internals.handleLayerOperationResult({ id: 'op-1', state: 'applied', updatedAt: 'later' });
  assert.equal(internals.getPendingLayerOrder(), null);
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children[0].children, (node) => node.label), ['main', 'header']);
  assert.ok(requests.some((url) => url.includes('/layers?')), 'matching live DOM should post a fresh layer snapshot');
});

test('unexpected extra DOM siblings do not stale a pending move', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  const added = document.createElement('aside');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  added.localName = 'aside';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  added.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const originalQuerySelector = document.querySelector;
  document.querySelector = (selector) => selector === 'div > section' ? parent : (originalQuerySelector ? originalQuerySelector.call(document, selector) : null);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  parent.children = [first, added, moved];

  internals.refreshAppliedLayerTree();
  internals.renderPanel();

  assert.equal(internals.getPendingLayerOrder().state, 'draft');
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children, (node) => node.id), [3, 2], 'draft stays teleported at destination while live DOM gains unrelated siblings');
  assert.doesNotMatch(internals.getPanelLeftHtml(), /Page changed — re-propose the move/);
  assert.match(internals.getPanelLeftHtml(), /raven-grab-layer-pending-badge/);
  assert.doesNotMatch(internals.getPanelLeftHtml(), /Move here pending/, 'pending draft no longer paints same-parent Move here slots');
});

test('same-order DOM hash drift leaves identity-matched queued move active', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  parent.innerHTML = '<header></header><main></main>';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const originalQuerySelector = document.querySelector;
  document.querySelector = (selector) => selector === 'div > section' ? parent : (originalQuerySelector ? originalQuerySelector.call(document, selector) : null);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  internals.getPendingLayerOrder().state = 'queued';
  parent.innerHTML = '<header></header><main data-new></main>';

  internals.refreshAppliedLayerTree();
  internals.renderPanel();

  assert.equal(internals.getPendingLayerOrder().state, 'queued');
  assert.doesNotMatch(internals.getPanelLeftHtml(), /Page changed — re-propose the move/);
});

test('operation polling ignores non-structural DOM drift and requests status', async () => {
  const requests = [];
  // pollLayerOperation() only polls REGISTERED orders (activeLayerOrders(),
  // backed by pendingLayerOrders) — a bare draft mutated in place is invisible
  // to it. Migrated through a real dispatch (Bucket A) so the order is
  // actually registered before polling it.
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-drift', batchId: 'batch-op-drift' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ state: 'queued' }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  parent.innerHTML = '<header></header><main></main>';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const originalQuerySelector = document.querySelector;
  document.querySelector = (selector) => selector === 'div > section' ? parent : (originalQuerySelector ? originalQuerySelector.call(document, selector) : null);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  parent.innerHTML = '<header></header><main data-new></main>';

  internals.pollLayerOperation();

  await new Promise((resolve) => setImmediate(resolve));
  // dispatch's auto-commit already advanced the registered order past 'queued'
  // into 'applying' (see applyQueuedChanges) — the invariant under test (a
  // non-structural DOM drift doesn't stop/confuse an in-flight poll) still
  // holds against that real post-dispatch state.
  assert.equal(internals.getPendingLayerOrder().state, 'applying');
  assert.equal(requests.filter((url) => url.includes('/layers-operation')).length, 1);
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children, (node) => node.id), [3, 2], 'in-flight order keeps teleported destination numerals through non-structural drift');
  internals.handleLayerOperationResult({ id: 'op-drift', state: 'rejected', updatedAt: 'cleanup' });
});

test('DOM snapshot hashing covers same-length changes in the middle', async () => {
  const { internals } = await loadOverlayInternals();
  const prefix = 'a'.repeat(200);
  const suffix = 'z'.repeat(200);
  const before = internals.domSnapshotHash({ innerHTML: `${prefix}x${suffix}` });
  const after = internals.domSnapshotHash({ innerHTML: `${prefix}y${suffix}` });
  assert.notEqual(before, after);
});

test('rejected layer operation clears pending visuals without changing applied numerals', async () => {
  // handleLayerOperationResult() only resolves a REGISTERED order — dispatch
  // first (Bucket A) so 'op-rejected' has a real order to match against.
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-rejected', batchId: 'batch-op-rejected' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  internals.handleLayerOperationResult({ id: 'op-rejected', state: 'rejected', updatedAt: 'now' });

  // Overlay behavior change (not the button-collapse redesign, but a real one):
  // in the old single-order model a rejection nulled the one global
  // pendingLayerOrder outright. The new map model (multiple concurrent orders
  // keyed by clientKey) keeps a rejected order around with state:'rejected'
  // instead of deleting it — getPendingLayerOrder() (which falls back to
  // allLayerOrders()[0]) now returns that record rather than null. The
  // invariant this test actually cares about — no more ACTIVE pending
  // visuals, applied tree/panel unaffected — still holds; assert it via
  // getActiveLayerOrders() (which excludes rejected/applied/mismatch) instead
  // of a bare null check.
  assert.equal(internals.getPendingLayerOrder().state, 'rejected');
  assert.equal(internals.getActiveLayerOrders().length, 0);
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children, (node) => node.id), [2, 3]);
  assert.match(internals.getPanelLeftHtml(), /layer-index">1[\s\S]*header[\s\S]*layer-index">2[\s\S]*main/);
  assert.doesNotMatch(internals.getPanelLeftHtml(), /raven-grab-layer-pending-badge|pending agent/);
});

test('queued layer move blocks replacement and polling pauses off the Layers tab', async () => {
  const requests = [];
  const clock = fakeClock();
  let resolveIntent;
  const intentResponse = new Promise((resolve) => { resolveIntent = resolve; });
  // /batch-commit is ALSO deferred: dispatchPendingBatch()'s registration->commit
  // chain runs in one continuous promise chain, so a normal flush would carry
  // the order straight past 'queued' into 'applying'/committed before this
  // test's off-tab-pause assertions ever run, leaving no reachable window to
  // exercise the pause. Holding /batch-commit open keeps the order genuinely
  // at 'queued' (registered, not yet committed) for that phase of the test.
  let resolveCommit;
  const commitResponse = new Promise((resolve) => { resolveCommit = resolve; });
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/layers-intent')) return intentResponse;
      if (String(url).includes('/batch-commit')) return commitResponse;
      if (String(url).includes('/layers-operation')) return { ok: true, json: async () => ({ id: 'op-queued', state: 'queued', updatedAt: 'now' }) };
      if (String(url).includes('/template')) return { ok: true, json: async () => ({ slots: [] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  // dispatchPendingBatch() synchronously moves the draft into pendingLayerOrders
  // (state 'registering') before the /layers-intent fetch resolves — so the
  // same-parent guard (pendingLayerOrderForParent) is already live for the
  // second reorderLayer() below without awaiting anything.
  internals.dispatchPendingBatch();
  internals.reorderLayer('2', '3');
  assert.equal(internals.getPendingLayerOrder().fromSelector, 'section > main');
  assert.match(internals.getPanelLeftHtml(), /already with the agent/);
  resolveIntent({ ok: true, json: async () => ({ operationId: 'op-queued', batchId: 'batch-op-queued' }) });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(internals.getPendingLayerOrder().operationId, 'op-queued');

  internals.switchTab('assets');
  clock.tick(3000);
  assert.equal(requests.filter((request) => request.url.includes('/layers-operation')).length, 0);
  internals.switchTab('layers');
  clock.tick(1499);
  assert.equal(requests.filter((request) => request.url.includes('/layers-operation')).length, 0);
  clock.tick(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.filter((request) => request.url.includes('/layers-operation')).length, 1);
});

test('missing expected child remains a mismatch and stops after nine checks', async () => {
  // handleLayerOperationResult() only resolves a REGISTERED order — dispatch
  // first (Bucket A) so 'op-lag' has a real order to match against.
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-lag', batchId: 'batch-op-lag' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  parent.isConnected = false;
  parent.children = [moved, first];
  internals.handleLayerOperationResult({ id: 'op-lag', state: 'applied', updatedAt: '-1' });
  assert.equal(internals.getPendingLayerOrder().state, 'applying', 'a detached parent must not verify even when child order matches');
  parent.isConnected = true;
  parent.children = [first];
  internals.handleLayerOperationResult({ id: 'op-lag', state: 'applied', updatedAt: '0' });
  assert.equal(internals.getPendingLayerOrder().state, 'applying', 'a missing expected child must not verify');
  for (let attempt = 1; attempt < 9; attempt += 1) {
    internals.handleLayerOperationResult({ id: 'op-lag', state: 'applied', updatedAt: String(attempt) });
  }
  assert.equal(internals.getPendingLayerOrder().state, 'mismatch');
  assert.match(internals.getPanelLeftHtml(), /Agent said it applied the move, but the page hasn&#39;t changed — drag again to re-check/);
  assert.doesNotMatch(internals.getPanelLeftHtml(), /raven-grab-layer-pending-badge|pending agent/);
  // [data-send-layer-intent]'s per-row "Send to agent" button is gone under the
  // one-button redesign, and its old invariant ("mismatch re-enables a plain
  // Send to agent button") doesn't carry over: the mismatched order is a real
  // batch record that stays in the Changes tray needing review, not a bare
  // local draft ready to resend blind. The singleton dock (mounted at
  // internals.getGlobalActionsHtml(), not the panel markup) now surfaces this
  // as a disabled button labeled with the review count, and the Changes tray
  // row itself carries data-error="true" / "Needs review" — that's the real
  // "stopped retrying, needs a human" signal this test cares about, not a
  // literal "Applying…" spinner staying up forever.
  assert.match(internals.getGlobalActionsHtml(), /raven-grab-send-label">Applied 0 · 1 need review/);
  assert.match(internals.getGlobalActionsHtml(), /data-error="true"[^>]*>[\s\S]*?Needs review/);
  assert.doesNotMatch(internals.getGlobalActionsHtml(), /raven-grab-send-label">Applying…/);
  assert.deepEqual(Array.from(internals.getAppliedLayerTree().children, (node) => node.id), [3, 2], 'mismatch keeps teleported destination tree until the user re-drags');
});

test('layers preview section is absent at idle and appears with a notice, gated send button', async () => {
  const { internals, document } = await loadOverlayInternals();
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [] };
  internals.setLayerTestState(tree, [[1, document.body]], null, null);
  internals.renderPanel();
  const idleHtml = internals.getPanelLeftHtml();
  // [f23 #7] Idle panels lead with the Layers tree — no empty dropzone box.
  assert.doesNotMatch(idleHtml, />Reorder preview</);
  assert.doesNotMatch(idleHtml, /data-layer-preview/);
  // The tree itself carries the drag affordance copy at idle.
  assert.match(idleHtml, /Drag a row to reorder or reparent it\./);
  // A notice without a preview brings the section back as just the notice line —
  // no empty preview box above it.
  internals.setLayerTestState(tree, [[1, document.body]], null, null, 'same-parent reorders only');
  internals.renderPanel();
  const noticeHtml = internals.getPanelLeftHtml();
  assert.match(noticeHtml, />Reorder preview</);
  assert.doesNotMatch(noticeHtml, /data-layer-preview/);
  assert.match(noticeHtml, /same-parent reorders only/);
  internals.setLayerTestState(tree, [[1, document.body]], null, null);
  internals.renderPanel();
  // The per-row [data-send-layer-intent] button is gone under the one-button
  // redesign — its gating logic (validLayerDraft()/hasDispatchableDrafts())
  // now drives the singleton dock's disabled state instead. Assert the same
  // gating via internals.batchUiState().enabled (also mirrored on the dock
  // markup at getGlobalActionsHtml()) rather than a removed attribute.
  assert.equal(internals.batchUiState().enabled, false);
  assert.match(internals.getGlobalActionsHtml(), /data-send-batch[^>]*disabled/);

  internals.setLayerTestState(tree, [[1, document.body]], null, {
    parentElement: document.body,
    fromIndex: 1,
    toIndex: 0,
    orderedElements: [],
    measuredRects: [],
    approximate: false,
    parentWidth: 100,
    parentHeight: 100,
    movedElement: null,
    unavailable: ''
  });
  internals.renderPanel();
  assert.equal(internals.batchUiState().enabled, true);
  assert.doesNotMatch(internals.getGlobalActionsHtml().match(/<button[^>]*data-send-batch[^>]*>/)[0], /\sdisabled(?:\s|>)/);

  internals.setLayerTestState(tree, [[1, document.body]], null, {
    parentElement: document.body, fromIndex: 1, toIndex: 0, orderedElements: [], measuredRects: [],
    approximate: false, parentWidth: 0, parentHeight: 0, movedElement: null,
    movedRole: 'fixed', unavailable: 'preview unavailable (too large)'
  // The real reorderLayer() (browser/raven-grab.js ~3315) derives layerNotice
  // itself when movedRole is "fixed" and the preview is unavailable, and the
  // wording changed under the redesign ("Preview unavailable — cannot send
  // fixed move" -> "Preview could not be generated..."). setLayerTestState
  // doesn't run that derivation, so pass the real current notice text through
  // its 5th arg to mirror what a real fixed-unavailable drag would show.
  }, 'Preview could not be generated for this fixed layer move. Send is disabled.');
  internals.renderPanel();
  const fixedUnavailableHtml = internals.getPanelLeftHtml();
  assert.match(fixedUnavailableHtml, /Preview could not be generated for this fixed layer move\. Send is disabled\./);
  assert.equal(internals.batchUiState().enabled, false);
  assert.match(internals.getGlobalActionsHtml(), /data-send-batch[^>]*disabled/);

  internals.setLayerTestState(tree, [[1, document.body]], null, {
    parentElement: document.body, fromIndex: 1, toIndex: 0, orderedElements: [], measuredRects: [],
    approximate: false, parentWidth: 0, parentHeight: 0, movedElement: null,
    movedRole: 'flexible', unavailable: 'preview unavailable (too large)'
  });
  internals.renderPanel();
  assert.equal(internals.batchUiState().enabled, true);
});

test('fixed-slot move preview shows the warning and note confirmation flow', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixed = document.createElement('div');
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'div · Hero', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, fixed]], fixed, {
    parentElement: document.body,
    fromIndex: 0,
    toIndex: 1,
    orderedElements: [document.body, fixed],
    measuredRects: [],
    approximate: false,
    parentWidth: 100,
    parentHeight: 100,
    movedElement: fixed,
    movedRole: 'fixed',
    unavailable: ''
  }, '', '2:3');
  internals.renderPanel();
  assert.match(internals.getPanelLeftHtml(), /class="raven-grab-layer-notice raven-grab-layer-info"/);
  assert.match(internals.getPanelLeftHtml(), /You are moving a fixed layer, the design system team will be notified\./);
  assert.match(internals.getPanelLeftHtml(), /data-fixed-move-note[^>]*maxlength="2000"/);
  // [data-send-layer-intent] is gone -- the fixed-move-with-valid-preview case
  // is dispatchable via the singleton dock; assert the same "not gated" state
  // through batchUiState()/the dock markup.
  assert.equal(internals.batchUiState().enabled, true);
  assert.doesNotMatch(internals.getGlobalActionsHtml().match(/<button[^>]*data-send-batch[^>]*>/)[0], /\sdisabled(?:\s|>)/);
});

test('template rows recurse through slotless ancestors to individually-added descendants', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  const child = document.createElement('div');
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'section · Parent', badges: [], children: [
      { id: 3, parentId: 2, depth: 2, label: 'div · Nested', badges: [], children: [] }
    ] }
  ] };
  internals.setTemplateTestState(tree, [[1, document.body], [2, parent], [3, child]], [], [
    { nodeId: 3, slotId: 'nested', selector: '#nested', role: 'flexible', note: '' }
  ], 'Product page', false);
  const markup = internals.templateLayerRowMarkup(tree);
  assert.match(markup, /data-template-layer-id="3"/);
  assert.match(markup, /Nested/);
  assert.doesNotMatch(markup, /data-template-layer-id="2"/);
  internals.renderPanel();
  const panelHtml = internals.getPanelLeftHtml();
  assert.match(panelHtml, /Page template|Save page as template/);
  assert.doesNotMatch(panelHtml, /data-template-filter|Add layers to the template/);
});

test('layers view shows Flex only for flexible template roles', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixed = document.createElement('div');
  fixed.id = 'fixed-layer';
  fixed.matches = (selector) => selector === '#fixed-layer';
  const flexible = document.createElement('div');
  flexible.id = 'flex-layer';
  flexible.matches = (selector) => selector === '#flex-layer';
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'div · Fixed', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'div · Flexible', badges: [], children: [] }
  ] };
  internals.setTemplateTestState(tree, [[1, document.body], [2, fixed], [3, flexible]], [
    { slotId: 'fixed', selector: '#fixed-layer', role: 'fixed' },
    { slotId: 'flex', selector: '#flex-layer', role: 'flexible' }
  ], [], '', false);
  const markup = internals.layerRowsMarkup(tree);
  assert.doesNotMatch(markup, /raven-grab-badge">fixed/);
  assert.match(markup, /div · Flexible<\/span><span class="raven-grab-badge">Flex<\/span>/);
});

test('template save sanitizes its id and preserves only unresolved undrafted slots', async () => {
  const requests = [];
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => ({ count: 2, slots: [] }) };
    }
  });
  const originalQuerySelector = document.querySelector;
  document.querySelector = function (selector) {
    if (selector === '#resolved-removed') return document.body;
    if (selector === '#orphan') return null;
    return originalQuerySelector.call(document, selector);
  };
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [] };
  internals.setTemplateTestState(tree, [[1, document.body]], [
    { slotId: 'orphan', selector: '#orphan', role: 'fixed', note: 'Keep me' },
    { slotId: 'removed', selector: '#resolved-removed', role: 'fixed', note: '' }
  ], [
    { nodeId: 1, slotId: 'drafted', selector: 'body', role: 'flexible', note: '' }
  ], ' Product page ', false);
  internals.saveTemplate();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const save = requests.find((request) => request.init.method === 'POST' && request.url.includes('/template?'));
  assert.ok(save);
  const payload = JSON.parse(save.init.body);
  assert.equal(payload.templateId, 'product-page');
  assert.ok(payload.slots.length >= 1);
  assert.ok(payload.slots.some((slot) => slot.slotId === 'orphan' && slot.note === 'Keep me'));
  assert.equal(payload.slots.some((slot) => slot.selector === '#resolved-removed'), false);
});

test('layer send remains disabled with loading status while template classification is pending', async () => {
  const { internals, document } = await loadOverlayInternals();
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [] };
  internals.setLayerTestState(tree, [[1, document.body]], null, {
    parentElement: document.body,
    fromIndex: 1,
    toIndex: 0,
    orderedElements: [],
    measuredRects: [],
    approximate: false,
    parentWidth: 100,
    parentHeight: 100,
    movedElement: null,
    unavailable: ''
  // "Loading template…" is only ever set as a side effect of reorderLayer()
  // itself running while templateLoadPending is true (browser/raven-grab.js
  // ~3254) -- setLayerTestState doesn't call reorderLayer, so pass that real
  // notice text through its notice arg to mirror what a real in-flight drag
  // would show while classification is pending.
  }, 'Loading template…', '', true);
  internals.renderPanel();
  const html = internals.getPanelLeftHtml();
  assert.match(html, /Loading template…/);
  // OVERLAY-GAP (verified, not a test-authoring mistake): under the old model
  // [data-send-layer-intent]'s own disabled/aria-disabled reflected
  // templateLoadPending directly. In the frozen redesign, validLayerDraft()
  // (browser/raven-grab.js ~3623) -- which now gates the singleton dock's
  // batchUiState().enabled -- does NOT check templateLoadPending at all;
  // only sendLayerIntent() does (~3353), and it degrades silently (returns
  // null, the draft is just dropped from that dispatch's registrationPlan
  // rather than blocking send) instead of surfacing as a disabled button.
  // Net effect: the dock now shows ENABLED while template classification is
  // still pending, so a user click here would dispatch anything else that's
  // dispatchable and silently drop this move -- no corruption, but the
  // pre-emptive "can't send yet" affordance this test asserted is gone.
  // Asserting the real (enabled) value here per the migration brief rather
  // than papering over a still-disabled claim that no longer holds.
  assert.equal(internals.batchUiState().enabled, true);
});

test('layers preview CSS reserves the standard content height with no idle dropzone styling', async () => {
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  assert.match(source, /\.raven-grab-layer-preview \{[^}]*height: 140px;/);
  // [f23 #7] The dropzone box is gone — notice-only states render just the notice line.
  assert.doesNotMatch(source, /raven-grab-layer-dropzone/);
  assert.match(source, /\.raven-grab-layer-info \{[^}]*color: var\(--raven-grab-muted\);/);
});

test('layers preview renders numbered boxes full width without labels or an approximate badge', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  parent.localName = 'section';
  parent.classList = ['preview-parent'];
  const first = document.createElement('div');
  first.classList = ['first'];
  const moved = document.createElement('div');
  moved.classList = ['moved'];
  const second = document.createElement('div');
  second.classList = ['second'];
  const third = document.createElement('div');
  third.classList = ['third'];
  parent.appendChild(first);
  parent.appendChild(second);
  parent.appendChild(third);
  parent.appendChild(moved);
  const ordered = [first, moved, second, third];
  internals.setLayerTestState(
    { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [] },
    [[1, document.body]],
    moved,
    {
      parentElement: parent,
      fromIndex: 3,
      toIndex: 1,
      orderedElements: ordered,
      measuredRects: ordered.map((element, index) => ({ selector: `div.${element.classList[0]}`, x: index * 22, y: 0, width: 40, height: 30 })),
      approximate: true,
      parentWidth: 100,
      parentHeight: 30,
      movedElement: moved,
      unavailable: ''
    }
  );

  // Stacked fill preview: numbered flex rows, no absolute measured layout.
  const markup = internals.wireframeMarkup();
  assert.match(markup, /class="raven-grab-wireframe"/);
  assert.equal((markup.match(/class="raven-grab-wire-box"/g) || []).length, 4);
  assert.match(markup, /data-moved="false">1<\/span>/);
  assert.match(markup, /data-moved="true">2<\/span>/);
  assert.match(markup, /data-moved="false">3<\/span>/);
  assert.match(markup, /data-moved="false">4<\/span>/);
  assert.doesNotMatch(markup, /style="/);
  assert.doesNotMatch(markup, /preview approximate|raven-grab-badge|raven-grab-wire-parent-tab|raven-grab-wire-label|raven-grab-wire-index/);
});

test('layers preview clamps very narrow boxes to a minimum size', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  parent.localName = 'section';
  parent.classList = ['preview-parent'];
  const moved = document.createElement('div');
  const narrowUnaffected = document.createElement('div');
  parent.appendChild(moved);
  parent.appendChild(narrowUnaffected);
  internals.setLayerTestState(
    { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [] },
    [[1, document.body]],
    moved,
    {
      parentElement: parent,
      fromIndex: 0,
      toIndex: 0,
      orderedElements: [moved, narrowUnaffected],
      measuredRects: [
        { selector: 'div.moved', x: 0, y: 0, width: 28, height: 30 },
        { selector: 'div.unaffected', x: 32, y: 0, width: 28, height: 30 }
      ],
      approximate: false,
      parentWidth: 1000,
      parentHeight: 30,
      movedElement: moved,
      unavailable: ''
    }
  );

  // Stacked fill preview: every child is a full-width flex row (min-height via CSS).
  const markup = internals.wireframeMarkup();
  assert.match(markup, /data-moved="true">1<\/span>/);
  assert.match(markup, /data-moved="false">2<\/span>/);
  assert.doesNotMatch(markup, /style="/);
  assert.doesNotMatch(markup, /raven-grab-wire-label|…/);
});

test('[wave3 R1] detached sole selection surfaces the selection-gone status', async () => {
  const { internals, document } = await loadOverlayInternals();
  const detached = document.createElement('main');
  detached.localName = 'main';
  detached.style = fakeStyle({ padding: '8px' });
  internals.selectTarget(detached, false, 'canvas');
  // sendSelection() is maintainer-only now (no-op for a plain consumer
  // selection like this one). Under the one-button model a detached-selection
  // send is caught PRE-EMPTIVELY: hasInvalidDrafts() (browser/raven-grab.js
  // ~3662) sees a pending style draft with no live selection and
  // batchUiState() reports a distinct "pending-invalid" state with its own
  // label -- dispatchPendingBatch() then no-ops (never attempts the request,
  // so payloadForSend()'s old async "selection-gone" throw/catch is now
  // unreachable dead code for this scenario). This is a real, better
  // redesign (prevent the doomed send instead of catching its failure) --
  // the surviving invariant is that a detached-sole-selection send state is
  // still a DISTINCT status from a generic bridge failure, never silently
  // treated as "ready to send".
  internals.setStyleContext(detached, { padding: '8px' }, [], 'main');
  internals.setIntentRecords({}, { padding: { property: 'padding', oldValue: '8px', newValue: '12px' } });
  internals.renderPanel();
  detached.isConnected = false;

  const ui = internals.batchUiState();
  assert.equal(ui.state, 'pending-invalid');
  assert.equal(ui.enabled, false);
  assert.notEqual(ui.label, 'Could not reach the Raven bridge');

  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  assert.equal(internals.getDispatchState(), 'idle', 'no request is attempted for an invalid draft');
});

test('[wave3 A3] detached-primary promotion does not migrate the old instruction draft', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fallback = document.createElement('main');
  const detachedPrimary = document.createElement('header');
  fallback.localName = 'main';
  detachedPrimary.localName = 'header';
  internals.selectTarget(fallback, false, 'canvas');
  internals.selectTarget(detachedPrimary, true, 'canvas');
  const instruction = document.createElement('textarea');
  instruction.value = 'Instruction typed for the old primary';
  internals.setPanelQuery('[data-instruction]', instruction);
  detachedPrimary.isConnected = false;

  const payload = internals.payloadForSend();

  assert.equal(payload.selector, 'main');
  assert.equal(payload.instruction, '');
  assert.deepEqual(Array.from(internals.getSelectionModel().order), [fallback]);
});

test('[wave3 R2] a row press survives cancellation rerender by resolving the live row', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const fixture = makeLayerDragFixture(internals, document);
  const firstTarget = panelRowTarget(fixture.rows[0]);
  internals.dispatchPanelLeft('mousedown', {
    target: firstTarget,
    button: 0,
    clientX: 20,
    clientY: 20,
    preventDefault() {}
  });
  window.dispatch('mousemove', { clientX: 40, clientY: 80, preventDefault() {} });
  assert.equal(internals.getLayerDrag().active, true);

  const staleRow = fixture.rows[1];
  const freshRow = document.createElement('li');
  freshRow.setAttribute('data-layer-id', '3');
  internals.setPanelLeftQuery('[data-layer-id="3"]', freshRow);
  const rendersBeforePress = internals.getRenderPanelCallCount();
  Object.defineProperty(staleRow, 'isConnected', {
    configurable: true,
    get() {
      const connected = internals.getRenderPanelCallCount() === rendersBeforePress;
      if (!connected) staleRow.parentElement = null;
      return connected;
    }
  });

  internals.dispatchPanelLeft('mousedown', {
    target: panelRowTarget(staleRow),
    button: 0,
    clientX: 20,
    clientY: 20,
    preventDefault() {}
  });
  assert.doesNotThrow(() => {
    window.dispatch('mousemove', { clientX: 30, clientY: 30, preventDefault() {} });
  });
  window.dispatch('mouseup', { type: 'mouseup', target: panelRowTarget(freshRow) });

  assert.equal(internals.getSelectionModel().primary, fixture.elements[1]);
});

test('[wave3 A1] mouseup drops a row click when a rebuilt tree reuses its runtime id', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const original = document.createElement('header');
  const replacement = document.createElement('aside');
  const selected = document.createElement('main');
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, original], [3, selected]], selected);
  const row = document.createElement('li');
  row.setAttribute('data-layer-id', '2');
  row.setAttribute('data-layer-parent', '1');
  const target = panelRowTarget(row);
  internals.dispatchPanelLeft('mousedown', {
    target,
    button: 0,
    clientX: 20,
    clientY: 20,
    preventDefault() {}
  });
  internals.setLayerElementsTestState([[1, document.body], [2, replacement], [3, selected]]);

  window.dispatch('mouseup', { type: 'mouseup', target });

  assert.deepEqual(Array.from(internals.getSelectionModel().order), [selected]);
  assert.equal(internals.getSelectionModel().primary, selected);
});

test('[wave3 A2] resolving an old send preserves instruction text typed in flight', async () => {
  const response = deferred();
  const { internals, document } = await loadOverlayInternals({
    reducedMotion: true,
    config: { grabEndpoint: 'https://example.test/grab' },
    fetch: () => response.promise
  });
  const selected = document.createElement('main');
  selected.localName = 'main';
  internals.selectTarget(selected, false, 'canvas');
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  instruction.value = 'old instruction';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);
  internals.setInstructionDraft('old instruction');

  // sendSelection() is maintainer-only now; the one-button equivalent of "an
  // instruction-only consumer send" is dispatchPendingBatch(), which captures
  // the CURRENT textarea value into internal state synchronously before the
  // async register/commit chain ever awaits -- typing into the textarea
  // afterward must not be clobbered by anything that runs once the deferred
  // response resolves.
  internals.dispatchPendingBatch();
  instruction.value = 'new instruction';
  response.resolve({ ok: true, json: async () => ({ element: { id: 'style-a2', batchId: 'batch-a2', sequence: 1, state: 'sent' } }) });
  await flushOverlayPromises();
  await flushOverlayPromises();

  assert.equal(instruction.value, 'new instruction');
});

test('[wave3 A4] render defers for an open style editor, then resumes after close and dismiss', async () => {
  const { internals, document } = await loadOverlayInternals();
  const selected = document.createElement('main');
  selected.style = fakeStyle({ color: 'rgb(1, 2, 3)' });
  internals.setStyleContext(selected, { color: 'rgb(1, 2, 3)' }, [], '#selected');
  const styleRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-raw', 'rgb(1, 2, 3)');
  valueCell.textContent = 'rgb(1, 2, 3)';
  valueCell.parentElement = styleRow;
  valueCell.parentNode = styleRow;
  internals.setPanelHtml('editor-stays-mounted');
  internals.beginStyleEdit(valueCell);
  const input = styleRow.child.children.find((child) => child.type === 'text');
  input.value = 'rgb(20, 20, 20)';

  internals.renderPanel();

  assert.equal(internals.getPanelHtml(), 'editor-stays-mounted');
  assert.equal(input.value, 'rgb(20, 20, 20)');
  assert.equal(internals.hasActiveStyleEditor(), true);

  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  internals.renderPanel();
  assert.notEqual(internals.getPanelHtml(), 'editor-stays-mounted');
  assert.equal(internals.hasActiveStyleEditor(), false);

  const secondCell = document.createElement('code');
  secondCell.setAttribute('data-style-raw', 'rgb(20, 20, 20)');
  secondCell.textContent = 'rgb(20, 20, 20)';
  secondCell.parentElement = styleRow;
  secondCell.parentNode = styleRow;
  internals.beginStyleEdit(secondCell);
  assert.equal(internals.hasActiveStyleEditor(), true);
  internals.dismiss();
  assert.equal(internals.hasActiveStyleEditor(), false);
});

test('[wave4 A4] applied layer adoption waits for an active style editor before replacing tree identities', async () => {
  const clock = fakeClock();
  // The old test manually stamped a draft object with state/operationId --
  // handleLayerOperationResult() only resolves a REGISTERED order (looked up
  // by operationId in pendingLayerOrders, browser/raven-grab.js ~2856), and a
  // fresh reorderLayer() draft lives only in layerOrderDrafts until an actual
  // dispatch registers it. Drive a real dispatchPendingBatch() so the draft
  // is genuinely promoted into pendingLayerOrders before we resolve its op.
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ operationId: 'op-editor-defer', batchId: 'batch-editor-defer', committed: true }) })
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  await flushOverlayPromises();
  const pending = internals.getPendingLayerOrder();
  assert.ok(pending, 'the reorder draft registered into a real pending order');
  assert.equal(pending.operationId, 'op-editor-defer');
  parent.children = [moved, first];

  moved.style = fakeStyle({ color: 'rgb(1, 2, 3)' });
  internals.setStyleContext(moved, { color: 'rgb(1, 2, 3)' }, [], '#moved');
  const styleRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-raw', 'rgb(1, 2, 3)');
  valueCell.textContent = 'rgb(1, 2, 3)';
  valueCell.parentElement = styleRow;
  valueCell.parentNode = styleRow;
  internals.beginStyleEdit(valueCell);

  internals.handleLayerOperationResult({ id: 'op-editor-defer', state: 'applied', updatedAt: 'now' });

  assert.equal(internals.getPendingLayerOrder(), pending);
  assert.equal(internals.getAppliedLayerTree(), tree);
  assert.equal(internals.getLayerElement(2), first, 'the pre-editor row identity must remain adopted');

  const input = styleRow.child.children.find((child) => child.type === 'text');
  input.dispatch('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  internals.handleLayerOperationResult({ id: 'op-editor-defer', state: 'applied', updatedAt: 'later' });

  assert.equal(internals.getPendingLayerOrder(), null);
  assert.notEqual(internals.getAppliedLayerTree(), tree);
  assert.equal(internals.getLayerElement(2), parent, 'the rebuilt tree is adopted after the editor closes');
});

test('[wave3 A5] an older component completion cannot clear the newer request state', async () => {
  const firstResponse = deferred();
  const secondResponse = deferred();
  const requests = [];
  const { internals, document } = await loadOverlayInternals({
    config: {
      mode: 'standalone',
      tokens: {},
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request'
    },
    fetch: (_url, init) => {
      requests.push(JSON.parse(init.body));
      return requests.length === 1 ? firstResponse.promise : secondResponse.promise;
    }
  });
  const selected = document.createElement('main');
  selected.localName = 'main';
  internals.selectTarget(selected, false, 'canvas');
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setPanelQuery('[data-send-email]', button);
  internals.setPanelQuery('[data-status]', status);
  const request = {
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Expose a keyboard-safe variant.',
    email: 'designer@example.com'
  };
  internals.setComponentName('Request target');

  const firstSend = internals.sendComponentRequest(request);
  const firstId = internals.getComponentRequestId();
  const secondSend = internals.sendComponentRequest({ ...request, useCase: 'Newer request' });
  const secondId = internals.getComponentRequestId();
  assert.notEqual(firstId, secondId);
  status.textContent = 'newer request still sending';

  firstResponse.resolve({ ok: true, status: 200, json: async () => ({ success: true, mode: 'issue', url: 'https://example.test/old' }) });
  assert.equal(await firstSend, false);
  assert.equal(internals.getComponentRequestId(), secondId);
  assert.equal(status.textContent, 'newer request still sending');

  secondResponse.resolve({ ok: true, status: 200, json: async () => ({ success: true, mode: 'issue', url: 'https://example.test/new' }) });
  assert.equal(await secondSend, true);
  assert.equal(internals.getComponentRequestId(), '');
  assert.match(status.innerHTML, /https:\/\/example\.test\/new/);
});

test('[wave3 S1] component form state survives tab switches while its owner stays selected', async () => {
  const { internals, document } = await loadOverlayInternals();
  const owner = document.createElement('header');
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, owner]], owner);
  internals.switchTab('assets');
  const useCase = document.createElement('textarea');
  useCase.setAttribute('data-use-case', '');
  useCase.value = 'Keep this request attached to the selected header.';
  internals.dispatchPanelLeft('input', { target: useCase });
  assert.equal(internals.getComponentRequest().useCase, useCase.value);

  internals.switchTab('layers');
  assert.equal(internals.getSelectionModel().primary, owner);
  assert.equal(internals.getComponentRequest().useCase, useCase.value);

  internals.switchTab('assets');
  assert.equal(internals.getSelectionModel().primary, owner);
  assert.equal(internals.getComponentRequest().useCase, useCase.value);
});

test('[f23 #2] completing the request form enables the inline CTA on the last field, not one event behind', async () => {
  const { internals, document } = await loadOverlayInternals();
  const selected = document.createElement('header');
  internals.setStyleContext(selected, { color: 'rgb(0, 0, 0)' }, [], '#request-form-target');
  internals.setComponentName('Primary button');
  internals.setActiveTabB('assets');

  // Fake inline form CTA (the copy componentNameMarkup bakes into the assets
  // panel) — mountGlobalActions must keep its disabled state live in place.
  const inlineCta = document.createElement('button');
  inlineCta.disabled = true;
  internals.setPanelLeftQueryAll('[data-request-next], [data-send-email], [data-maintainer-send]', [inlineCta]);

  const useCase = document.createElement('textarea');
  useCase.setAttribute('data-use-case', '');
  useCase.value = 'Reusable header used across pages.';
  internals.dispatchPanelLeft('input', { target: useCase });
  assert.equal(inlineCta.disabled, true, 'still disabled: issue type and size missing');

  const issueType = document.createElement('select');
  issueType.setAttribute('data-issue-type', '');
  issueType.value = 'Missing variant';
  internals.dispatchPanelLeft('change', { target: issueType });
  assert.equal(internals.getComponentRequest().issueType, 'Missing variant');
  assert.equal(inlineCta.disabled, true, 'still disabled: issue size missing');

  // Last field is a <select> change — enablement must read the value assigned
  // by THIS event, not the state from one event earlier.
  const issueSize = document.createElement('select');
  issueSize.setAttribute('data-issue-size', '');
  issueSize.value = '100+';
  internals.dispatchPanelLeft('change', { target: issueSize });
  assert.equal(internals.componentCtaEnabled(), true);
  assert.equal(inlineCta.disabled, false, 'inline CTA enables the moment the form is complete');
});

test('[f23 #3] in-flight request disables BOTH CTA copies; email step gates on validity', async () => {
  const { internals, document } = await loadOverlayInternals();
  const selected = document.createElement('header');
  internals.setStyleContext(selected, { color: 'rgb(0, 0, 0)' }, [], '#request-flight-target');
  internals.setComponentName('Primary button');
  internals.setActiveTabB('assets');

  // Both live copies of the CTA: inline form + left dock.
  const inlineCta = document.createElement('button');
  const dockCta = document.createElement('button');
  internals.setPanelLeftQueryAll('[data-request-next], [data-send-email], [data-maintainer-send]', [inlineCta, dockCta]);

  // Complete the form so the predicate is otherwise true.
  const issueType = document.createElement('select');
  issueType.setAttribute('data-issue-type', '');
  issueType.value = 'Missing variant';
  internals.dispatchPanelLeft('change', { target: issueType });
  const issueSize = document.createElement('select');
  issueSize.setAttribute('data-issue-size', '');
  issueSize.value = '100+';
  internals.dispatchPanelLeft('change', { target: issueSize });
  const useCase = document.createElement('textarea');
  useCase.setAttribute('data-use-case', '');
  useCase.value = 'Reusable header used across pages.';
  internals.dispatchPanelLeft('input', { target: useCase });
  assert.equal(inlineCta.disabled, false);
  assert.equal(dockCta.disabled, false);

  // A request in flight must disable every copy — a still-enabled duplicate
  // CTA is a duplicate external request waiting to happen.
  internals.setComponentRequestInFlight(true);
  assert.equal(internals.componentCtaEnabled(), false);
  internals.dispatchPanelLeft('input', { target: useCase });
  assert.equal(inlineCta.disabled, true, 'inline copy disabled during in-flight send');
  assert.equal(dockCta.disabled, true, 'dock copy disabled during in-flight send');
  internals.setComponentRequestInFlight(false);
  internals.dispatchPanelLeft('input', { target: useCase });
  assert.equal(inlineCta.disabled, false, 'copies re-enable when the send settles');

  // Email step (optional notify flow: no grabConfig): empty allowed, malformed not.
  internals.setComponentRequestStep('email');
  internals.setComponentRequestEmail('');
  assert.equal(internals.componentCtaEnabled(), true, 'optional email may be empty');
  const emailInput = document.createElement('input');
  emailInput.setAttribute('data-component-email', '');
  emailInput.value = 'not-an-email';
  internals.dispatchPanelLeft('input', { target: emailInput });
  assert.equal(internals.componentCtaEnabled(), false, 'malformed email disables the CTA');
  assert.equal(inlineCta.disabled, true, 'email input keystrokes sync the CTA copies');
  emailInput.value = 'dev@example.com';
  internals.dispatchPanelLeft('input', { target: emailInput });
  assert.equal(internals.componentCtaEnabled(), true, 'valid email re-enables');
  assert.equal(inlineCta.disabled, false);
  internals.setComponentRequestStep('form');
});

test('[wave3 S2] detached-primary promotion clears component request fields and id', async () => {
  const response = deferred();
  const { internals, document } = await loadOverlayInternals({
    config: {
      mode: 'standalone',
      tokens: {},
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request'
    },
    fetch: () => response.promise
  });
  const fallback = document.createElement('main');
  const detachedPrimary = document.createElement('header');
  fallback.localName = 'main';
  detachedPrimary.localName = 'header';
  internals.selectTarget(fallback, false, 'canvas');
  internals.selectTarget(detachedPrimary, true, 'canvas');
  internals.setComponentName('Request target');
  void internals.sendComponentRequest({
    issueType: 'Missing variant',
    issueSize: '100+',
    useCase: 'Old primary request',
    email: 'designer@example.com'
  });
  assert.notEqual(internals.getComponentRequestId(), '');
  detachedPrimary.isConnected = false;

  internals.orderedSelection();

  assert.equal(internals.getSelectionModel().primary, fallback);
  assert.deepEqual({ ...internals.getComponentRequest() }, { issueType: '', issueSize: '', useCase: '', email: '' });
  assert.equal(internals.getComponentRequestId(), '');
});

test('[wave3 S4] dismiss cancels an active layer drag without reorder or transient rows', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const fixture = makeLayerDragFixture(internals, document);
  internals.dispatchPanelLeft('mousedown', {
    target: panelRowTarget(fixture.rows[1]),
    button: 0,
    clientX: 20,
    clientY: 60,
    preventDefault() {}
  });
  window.dispatch('mousemove', { clientX: 40, clientY: 100, preventDefault() {} });
  assert.equal(internals.getLayerDrag().active, true);
  assert.equal(fixture.transientNodes().length, 2);

  internals.dismiss();

  assert.equal(internals.getLayerDrag(), null);
  assert.equal(internals.getPendingLayerOrder(), null);
  assert.deepEqual(fixture.transientNodes(), []);
  for (const row of fixture.rows) assert.equal(row.getAttribute('data-dragging'), null);
});

test('layer collapse uses element identity across renders and canvas selection expands ancestors before reveal', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.expandPanel();
  const fixture = makeNestedLayerFixture(internals, document);
  for (const element of Object.values(fixture.elements)) element.tagName = element.localName.toUpperCase();
  document.body = fixture.elements.root;
  internals.toggleLayerNode(2);

  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0]), true);
  assert.doesNotMatch(internals.getPanelLeftHtml(), /data-layer-id="3"/);
  internals.renderPanel();
  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0]), true, 'collapse survives a plain rerender');

  const rebuilt = { id: 10, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 20, parentId: 10, depth: 1, label: 'section', badges: [], children: [
      { id: 30, parentId: 20, depth: 2, label: 'article', badges: [], children: [
        { id: 40, parentId: 30, depth: 3, label: 'span', badges: [], children: [] }
      ] },
      { id: 50, parentId: 20, depth: 2, label: 'aside', badges: [], children: [] }
    ] },
    { id: 60, parentId: 10, depth: 1, label: 'footer', badges: [], children: [] }
  ] };
  const rebuiltPairs = [
    [10, fixture.elements.root], [20, fixture.elements.section], [30, fixture.elements.article],
    [40, fixture.elements.span], [50, fixture.elements.aside], [60, fixture.elements.footer]
  ];
  internals.setLayerTestState(rebuilt, rebuiltPairs, null);
  assert.equal(internals.isLayerCollapsed(rebuilt.children[0]), true, 'runtime id changes do not reset collapse state');

  const revealed = document.createElement('li');
  let revealCalls = 0;
  revealed.scrollIntoView = () => { revealCalls += 1; };
  internals.setPanelLeftQuery('.raven-grab-layer-row[data-primary="true"]', revealed);
  internals.selectTarget(fixture.elements.span, false, 'canvas');

  assert.equal(internals.isLayerCollapsed(rebuilt.children[0]), false);
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="40"[^>]*data-primary="true"/);
  assert.equal(revealCalls, 1);
});

test('collapsing the selected row out of view leaves the tree a tab stop on its root', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.expandPanel();
  const fixture = makeNestedLayerFixture(internals, document);
  for (const element of Object.values(fixture.elements)) element.tagName = element.localName.toUpperCase();
  document.body = fixture.elements.root;

  // Select a deep row, then collapse its ancestor so that row is no longer rendered.
  internals.selectTarget(fixture.elements.span, false, 'canvas');
  assert.match(internals.getPanelLeftHtml(), /tabindex="0"/, 'the selected row is the tab stop while visible');
  internals.toggleLayerNode(2);

  // Count tab stops on LAYER ROWS only -- the panel has other tabindex="0" controls,
  // and matching those would let this test pass with the fix reverted.
  const rowTabStops = (internals.getPanelLeftHtml().match(/class="raven-grab-layer-row"[^>]*?tabindex="0"/g) || []).length;
  assert.equal(
    rowTabStops,
    1,
    'a tree whose only tabbable row was collapsed away is unreachable by keyboard -- the root must take the tab stop, and exactly one row may own it'
  );
});

test('switching to Layers reveals a canvas selection made while the Assets tab was open', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.expandPanel();
  const fixture = makeNestedLayerFixture(internals, document);
  for (const element of Object.values(fixture.elements)) element.tagName = element.localName.toUpperCase();
  document.body = fixture.elements.root;
  internals.toggleLayerNode(2);
  internals.switchTab('assets');
  internals.selectTarget(fixture.elements.span, false, 'canvas');
  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0]), true);
  const revealed = document.createElement('li');
  let revealCalls = 0;
  revealed.scrollIntoView = () => { revealCalls += 1; };
  internals.setPanelLeftQuery('.raven-grab-layer-row[data-primary="true"]', revealed);

  internals.switchTab('layers');

  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0]), false);
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="4"[^>]*data-primary="true"/);
  assert.equal(revealCalls, 1);
});

test('[f23 #5] panels start expanded and collapsed panels always pause grab', async () => {
  const { internals } = await loadOverlayInternals();
  // Load: both panels EXPANDED (Andrew, 2026-07-19, reversing the 2026-07-18 call that
  // they start collapsed). Edge tabs are hidden while their panel is open. The pause
  // half of this test is unchanged and is the part that still guards real behaviour.
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelLeftAttribute('data-collapsed'), 'false');
  internals.setPanelCollapsedTestState('left', true);
  internals.setPanelCollapsedTestState('right', true);
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'false');
  assert.equal(internals.getEdgeTabLeftAttribute('aria-hidden'), 'false');

  // While both panels are collapsed the page behaves normally — the canvas
  // mousemove/click/dblclick handlers bail before touching the event, with NO cold-open
  // exception (Andrew, 2026-07-18: collapsed panels must never hijack clicks).
  // Five gates: mousemove (hover), click (select), dblclick (inline copy edit),
  // wheel (page-scroll containment while panels are open), and pointerdown
  // (canvas drag arming, 2026-08-07 — a collapsed overlay must not start drags
  // any more than it may hijack clicks).
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  const gates = source.match(/if \(!armed \|\| bothCollapsed\(\)\) return;/g) || [];
  assert.equal(gates.length, 5);
  assert.doesNotMatch(source, /coldOpen/);

  // Opening a panel via its edge tab is the deliberate act that engages grab.
  internals.expandPanel();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'false');

  // Dismiss returns to the collapsed (paused) state.
  internals.dismiss();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
});

test('[wave4 focus] toggle and every layer-row selection branch refocus the re-rendered destination row', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixture = makeNestedLayerFixture(internals, document);
  const focused = [];
  const freshRows = new Map();
  for (const id of [2, 3, 4, 5]) {
    const fresh = document.createElement('li');
    fresh.setAttribute('data-layer-id', String(id));
    fresh.focus = () => { focused.push(String(id)); };
    freshRows.set(id, fresh);
    internals.setPanelLeftQuery(`[data-layer-id="${id}"]`, fresh);
  }
  const pressedRow = (id) => {
    const row = document.createElement('li');
    row.setAttribute('data-layer-id', String(id));
    row.focus = () => { throw new Error('the replaced pressed row must not receive focus'); };
    return row;
  };

  internals.toggleLayerNode(2);
  assert.deepEqual(focused, ['2']);
  internals.toggleLayerNode(2);
  assert.deepEqual(focused, ['2', '2']);

  internals.selectPanelLayerRow(pressedRow(3), {});
  assert.equal(internals.getSelectionModel().primary, fixture.elements.article);
  assert.deepEqual(focused, ['2', '2', '3']);
  assert.match(internals.getPanelLeftHtml(), /tabindex="0"[^>]*data-layer-id="3"/);

  internals.selectPanelLayerRow(pressedRow(5), { ctrlKey: true });
  assert.equal(internals.getSelectionModel().primary, fixture.elements.aside);
  assert.deepEqual(focused, ['2', '2', '3', '5']);

  internals.selectPanelLayerRow(pressedRow(4), { shiftKey: true });
  assert.equal(internals.getSelectionModel().primary, fixture.elements.span);
  assert.deepEqual(focused, ['2', '2', '3', '5', '4']);
  assert.equal(freshRows.get(4).getAttribute('data-layer-id'), '4');
});

test('layer tree arrow keys traverse visible rows and expand or collapse before moving parent-child', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixture = makeNestedLayerFixture(internals, document);
  const rows = new Map();
  let focusedId = '';
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const row = document.createElement('li');
    row.setAttribute('data-layer-id', String(id));
    row.focus = () => { focusedId = String(id); };
    rows.set(id, row);
    internals.setPanelLeftQuery(`[data-layer-id="${id}"]`, row);
  }
  const targetFor = (id) => ({
    tagName: 'LI',
    closest(selector) {
      if (selector === '[data-layer-id]') return rows.get(id);
      return null;
    }
  });
  const press = (id, key) => {
    let prevented = false;
    internals.dispatchPanelLeft('keydown', {
      target: targetFor(id), key, shiftKey: false,
      preventDefault() { prevented = true; }, stopPropagation() {}
    });
    assert.equal(prevented, true, `${key} on ${id} should be handled`);
  };

  internals.toggleLayerNode(2);
  assert.deepEqual(Array.from(internals.visibleLayerNodes(), (node) => node.id), [1, 2, 6]);
  press(2, 'ArrowRight');
  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0]), false);
  assert.equal(internals.getSelectionModel().primary, fixture.elements.section);
  press(2, 'ArrowRight');
  assert.equal(internals.getSelectionModel().primary, fixture.elements.article);
  press(3, 'ArrowDown');
  assert.equal(internals.getSelectionModel().primary, fixture.elements.span, 'down walks the visible depth-first row order');
  press(4, 'ArrowLeft');
  assert.equal(internals.getSelectionModel().primary, fixture.elements.article, 'left on a leaf moves to its parent');
  press(3, 'ArrowLeft');
  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0].children[0]), true);
  assert.equal(internals.getSelectionModel().primary, fixture.elements.article, 'left on an expanded parent collapses in place');
  assert.equal(focusedId, '3');
});

test('[wave4 keys] Home and End move focus and selection to visible tree boundaries', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixture = makeNestedLayerFixture(internals, document);
  const rows = new Map();
  const focused = [];
  for (const id of [1, 3, 6]) {
    const row = document.createElement('li');
    row.setAttribute('data-layer-id', String(id));
    row.focus = () => { focused.push(String(id)); };
    rows.set(id, row);
    internals.setPanelLeftQuery(`[data-layer-id="${id}"]`, row);
  }
  const press = (key) => {
    let prevented = false;
    internals.dispatchPanelLeft('keydown', {
      target: {
        tagName: 'LI',
        closest(selector) {
          if (selector === '[data-layer-id]') return rows.get(3);
          return null;
        }
      },
      key,
      shiftKey: false,
      preventDefault() { prevented = true; },
      stopPropagation() {}
    });
    assert.equal(prevented, true, `${key} should be handled`);
  };

  press('Home');
  assert.equal(internals.getSelectionModel().primary, fixture.elements.root);
  press('End');
  assert.equal(internals.getSelectionModel().primary, fixture.elements.footer);
  assert.deepEqual(focused, ['1', '6']);
});

test('Tab navigation stays among siblings, exits at edges, and ignores editable controls', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixture = makeNestedLayerFixture(internals, document);
  const rows = new Map();
  for (const id of [3, 5]) {
    const row = document.createElement('li');
    row.setAttribute('data-layer-id', String(id));
    rows.set(id, row);
    internals.setPanelLeftQuery(`[data-layer-id="${id}"]`, row);
  }
  const rowTarget = (id) => ({
    tagName: 'LI',
    closest(selector) {
      if (selector === '[data-layer-id]') return rows.get(id);
      return null;
    }
  });
  const dispatchTab = (id, shiftKey = false) => {
    let prevented = false;
    internals.dispatchPanelLeft('keydown', {
      target: rowTarget(id), key: 'Tab', shiftKey,
      preventDefault() { prevented = true; }, stopPropagation() {}
    });
    return prevented;
  };

  assert.equal(dispatchTab(3), true);
  assert.equal(internals.getSelectionModel().primary, fixture.elements.aside);
  assert.equal(dispatchTab(5, true), true);
  assert.equal(internals.getSelectionModel().primary, fixture.elements.article);
  assert.equal(dispatchTab(3, true), false, 'first sibling leaves Shift+Tab to the browser');

  const input = {
    tagName: 'INPUT',
    closest(selector) {
      if (selector === 'input, textarea, button, select') return this;
      if (selector === '[data-layer-id]') return rows.get(5);
      return null;
    }
  };
  let inputPrevented = false;
  internals.dispatchPanelLeft('keydown', {
    target: input, key: 'ArrowDown', shiftKey: false,
    preventDefault() { inputPrevented = true; }, stopPropagation() {}
  });
  assert.equal(inputPrevented, false);
  assert.equal(internals.getSelectionModel().primary, fixture.elements.article);
});

test('active layer drag auto-scrolls at panel edges', async () => {
  const clock = fakeClock();
  const { internals, document, window } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });
  const fixture = makeLayerDragFixture(internals, document);
  const body = document.createElement('div');
  body.scrollTop = 0;
  body.getBoundingClientRect = () => ({ top: 0, bottom: 120, height: 120 });
  internals.setPanelLeftQuery('.raven-grab-body', body);
  const target = panelRowTarget(fixture.rows[0]);
  internals.dispatchPanelLeft('mousedown', {
    target, button: 0, clientX: 20, clientY: 20, preventDefault() {}
  });
  window.dispatch('mousemove', { target, clientX: 30, clientY: 110, preventDefault() {} });
  assert.equal(body.scrollTop, 18);
  clock.tick(50);
  assert.equal(body.scrollTop, 36, 'scroll continues while the pointer stays at the edge');
  window.dispatch('mousemove', { target, clientX: 30, clientY: 5, preventDefault() {} });
  assert.equal(body.scrollTop, 18);
  clock.tick(50);
  assert.equal(body.scrollTop, 0);
  internals.dismiss();
});

test('[wave4 drag render] active drag defers ordinary renders but allows expansion and post-drag renders', async () => {
  const clock = fakeClock();
  const { internals, document, window } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });
  const fixture = makeNestedLayerFixture(internals, document);
  internals.toggleLayerNode(2);
  const rootChildren = [];
  const root = {
    appendChild(node) {
      rootChildren.push(node);
      node.parentElement = this;
      node.remove = () => {
        const index = rootChildren.indexOf(node);
        if (index !== -1) rootChildren.splice(index, 1);
      };
    }
  };
  const listChildren = [];
  function patchClassList(node) {
    if (Array.isArray(node.classList)) {
      node.classList = { contains(name) { return String(node.className || '').split(/\s+/).includes(name); } };
    }
  }
  function relink() {
    listChildren.forEach((child, index) => {
      child.previousElementSibling = listChildren[index - 1] || null;
      child.nextElementSibling = listChildren[index + 1] || null;
    });
  }
  function attachRemove(node) {
    node.remove = () => {
      const index = listChildren.indexOf(node);
      if (index !== -1) { listChildren.splice(index, 1); relink(); }
    };
  }
  const list = {
    children: listChildren,
    appendChild(node) {
      listChildren.push(node);
      node.parentElement = this;
      patchClassList(node);
      attachRemove(node);
      relink();
    },
    insertBefore(node, anchor) {
      const existing = listChildren.indexOf(node);
      if (existing !== -1) listChildren.splice(existing, 1);
      const at = anchor ? listChildren.indexOf(anchor) : -1;
      if (at === -1) listChildren.push(node); else listChildren.splice(at, 0, node);
      node.parentElement = this;
      patchClassList(node);
      attachRemove(node);
      relink();
    },
    getBoundingClientRect() { return { top: 0, bottom: 120, left: 0, width: 240, height: 120 }; }
  };
  const targetRow = document.createElement('li');
  targetRow.classList = { contains(name) { return name === 'raven-grab-layer-row'; } };
  targetRow.setAttribute('data-layer-id', '2');
  targetRow.setAttribute('data-layer-parent', '1');
  targetRow.style.setProperty('--layer-depth', '1');
  targetRow.parentElement = list;
  targetRow.getBoundingClientRect = () => ({ top: 0, bottom: 40, left: 0, width: 240, height: 40 });
  const sourceRow = document.createElement('li');
  sourceRow.classList = { contains(name) { return name === 'raven-grab-layer-row'; } };
  sourceRow.setAttribute('data-layer-id', '6');
  sourceRow.setAttribute('data-layer-parent', '1');
  sourceRow.style.setProperty('--layer-depth', '1');
  sourceRow.parentElement = list;
  sourceRow.getRootNode = () => root;
  sourceRow.cloneNode = () => document.createElement('li');
  sourceRow.getBoundingClientRect = () => ({ top: 40, bottom: 80, left: 0, width: 240, height: 40 });
  listChildren.push(targetRow, sourceRow);
  relink();
  internals.setPanelLeftQuery('[data-layer-id="2"]', targetRow);
  internals.setPanelLeftQuery('[data-layer-id="6"]', sourceRow);
  const body = document.createElement('div');
  body.getBoundingClientRect = () => ({ top: 0, bottom: 120, height: 120 });
  internals.setPanelLeftQuery('.raven-grab-body', body);
  const sourceTarget = panelRowTarget(sourceRow);
  internals.dispatchPanelLeft('mousedown', {
    target: sourceTarget, button: 0, clientX: 20, clientY: 60, preventDefault() {}
  });
  window.dispatch('mousemove', { target: sourceTarget, clientX: 30, clientY: 70, preventDefault() {} });
  const markupBeforeDeferredRender = internals.getPanelLeftHtml();
  internals.setLayerNoticeTestState('deferred during drag');
  internals.renderPanel();
  assert.equal(internals.getPanelLeftHtml(), markupBeforeDeferredRender, 'ordinary render must preserve active drag markup');
  assert.equal(sourceRow.isConnected, true);
  const hoverTarget = { closest(selector) { return selector === '[data-layer-id]' ? targetRow : null; } };
  window.dispatch('mousemove', { target: hoverTarget, clientX: 30, clientY: 20, preventDefault() {} });

  clock.tick(599);
  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0]), true);
  clock.tick(1);
  assert.equal(internals.isLayerCollapsed(fixture.tree.children[0]), false);
  assert.equal(internals.getLayerDrag().active, true);
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="3"/);
  assert.match(internals.getPanelLeftHtml(), /deferred during drag/, 'deliberate drag expansion bypasses render deferral');

  internals.setLayerNoticeTestState('rendered after drag');
  internals.endLayerDrag();
  assert.equal(internals.getLayerDrag(), null);
  assert.match(internals.getPanelLeftHtml(), /rendered after drag/, 'ending the drag restores ordinary rendering');
});

test('canvas hover marks the corresponding layer row even while another element is selected', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixture = makeNestedLayerFixture(internals, document);
  const spanRow = document.createElement('li');
  spanRow.setAttribute('data-layer-id', '4');
  const footerRow = document.createElement('li');
  footerRow.setAttribute('data-layer-id', '6');
  internals.setPanelLeftQuery('[data-layer-id="4"]', spanRow);
  internals.setPanelLeftQuery('[data-layer-id="6"]', footerRow);
  internals.expandPanel();
  internals.selectTarget(fixture.elements.root, false, 'canvas');

  document.dispatch('mousemove', { target: fixture.elements.span, composedPath() { return []; } });
  assert.equal(internals.getHoveredLayerElement(), fixture.elements.span);
  assert.equal(spanRow.getAttribute('data-layer-hovered'), 'true');
  internals.renderPanel();
  assert.match(internals.getPanelLeftHtml(), /data-layer-id="4"[^>]*data-layer-hovered="true"/);

  document.dispatch('mousemove', { target: fixture.elements.footer, composedPath() { return []; } });
  assert.equal(spanRow.getAttribute('data-layer-hovered'), null);
  assert.equal(footerRow.getAttribute('data-layer-hovered'), 'true');
});

test('[wave4 hover] a hidden descendant canvas hover marks its nearest rendered ancestor and clears it', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixture = makeNestedLayerFixture(internals, document);
  internals.toggleLayerNode(2);
  const collapsedSectionRow = document.createElement('li');
  collapsedSectionRow.setAttribute('data-layer-id', '2');
  const footerRow = document.createElement('li');
  footerRow.setAttribute('data-layer-id', '6');
  internals.setPanelLeftQuery('[data-layer-id="2"]', collapsedSectionRow);
  internals.setPanelLeftQuery('[data-layer-id="6"]', footerRow);

  internals.setLayerRowHover(fixture.elements.span);
  assert.equal(internals.getHoveredLayerElement(), fixture.elements.span);
  assert.equal(collapsedSectionRow.getAttribute('data-layer-hovered'), 'true');

  internals.setLayerRowHover(fixture.elements.footer);
  assert.equal(collapsedSectionRow.getAttribute('data-layer-hovered'), null);
  assert.equal(footerRow.getAttribute('data-layer-hovered'), 'true');

  internals.setLayerRowHover(null);
  assert.equal(footerRow.getAttribute('data-layer-hovered'), null);
});

test('[wave5 A4] queued layer adoption cannot rebuild row identities through refresh while a style editor is active', async () => {
  const clock = fakeClock();
  // Same root fact as "[wave4 A4] applied layer adoption waits for an active
  // style editor..." above: a fresh reorderLayer() draft only lives in
  // layerOrderDrafts (activeLayerOrderDraft()) until a real dispatch
  // registers it into pendingLayerOrders -- stamping state/operationId
  // directly onto the draft object never reaches the order the "active
  // style editor defers adoption" logic (refreshAppliedLayerTree /
  // reconcileAppliedLayerOperation) actually keys off. Drive a real
  // dispatchPendingBatch() first, then resolve the registered order via
  // handleLayerOperationResult() to genuinely terminate it (nothing in this
  // test's own two refreshAppliedLayerTree() calls does that on its own --
  // an active/"queued" order defers indefinitely, per
  // browser/raven-grab.js ~2989).
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ operationId: 'op-wave5-editor-refresh', batchId: 'batch-wave5-editor-refresh', committed: true }) })
  });
  const parent = document.createElement('section');
  const first = document.createElement('header');
  const moved = document.createElement('main');
  parent.localName = 'section';
  first.localName = 'header';
  moved.localName = 'main';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  await flushOverlayPromises();
  const pending = internals.getPendingLayerOrder();
  assert.ok(pending, 'the reorder draft registered into a real pending order');
  pending.state = 'queued';
  assert.equal(pending.operationId, 'op-wave5-editor-refresh');
  parent.children = [moved, first];

  moved.style = fakeStyle({ color: 'rgb(1, 2, 3)' });
  internals.setStyleContext(moved, { color: 'rgb(1, 2, 3)' }, [], '#moved');
  const styleRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-raw', 'rgb(1, 2, 3)');
  valueCell.textContent = 'rgb(1, 2, 3)';
  valueCell.parentElement = styleRow;
  valueCell.parentNode = styleRow;
  internals.beginStyleEdit(valueCell);

  internals.refreshAppliedLayerTree();

  assert.equal(internals.getAppliedLayerTree(), tree);
  assert.equal(internals.getLayerElement(2), first);
  assert.equal(internals.getLayerElement(3), moved);
  assert.equal(internals.getPendingLayerOrder(), pending);

  const input = styleRow.child.children.find((child) => child.type === 'text');
  input.dispatch('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  internals.handleLayerOperationResult({ id: 'op-wave5-editor-refresh', state: 'applied', updatedAt: 'later' });
  internals.refreshAppliedLayerTree();

  assert.equal(internals.getPendingLayerOrder(), null);
  assert.notEqual(internals.getAppliedLayerTree(), tree);
  assert.equal(internals.getLayerElement(2), parent);
});

test('[wave5 P5] payload resnapshot synchronizes component scope chips and falls back to instance scope', async () => {
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    querySelectorAll: () => candidates
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.classList = ['action'];
  selected.style = fakeStyle();
  const firstPeer = document.createElement('button');
  firstPeer.localName = 'button';
  firstPeer.classList = ['action'];
  const addedPeer = document.createElement('button');
  addedPeer.localName = 'button';
  addedPeer.classList = ['action'];
  candidates = [selected, firstPeer];
  internals.setStyleContext(selected, { padding: '8px' }, [], '#action', {}, {
    matchSelector: 'button.action', matchCount: 2
  });
  internals.setIntentRecords({}, {
    padding: { property: 'padding', oldValue: '8px', newValue: '12px' }
  });
  assert.equal(internals.setEditScope('component'), true);

  candidates = [selected, firstPeer, addedPeer];
  const rendersBeforeAddedPayload = internals.getRenderPanelCallCount();
  const addedPayload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  assert.deepEqual(addedPayload.styleEdits, [{
    property: 'padding', oldValue: '8px', newValue: '12px',
    scope: 'component', matchSelector: 'button.action', matchCount: 3
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(internals.getCurrentSelectionComponentScope())), {
    matchSelector: 'button.action', matchCount: 3
  });
  assert.equal(internals.getRenderPanelCallCount(), rendersBeforeAddedPayload + 1);

  candidates = [selected];
  const rendersBeforeRemovedPayload = internals.getRenderPanelCallCount();
  const removedPayload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  assert.deepEqual(removedPayload.styleEdits, [
    { property: 'padding', oldValue: '8px', newValue: '12px' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(internals.getCurrentSelectionComponentScope())), {
    matchSelector: 'button.action', matchCount: 1
  });
  assert.equal(internals.getEditScope(), 'instance');
  assert.equal(internals.getRenderPanelCallCount(), rendersBeforeRemovedPayload + 1);
});

test('[wave5 hover] hidden descendant hover is restored onto the fresh visible ancestor row after rerender', async () => {
  const { internals, document } = await loadOverlayInternals();
  const fixture = makeNestedLayerFixture(internals, document);
  internals.toggleLayerNode(2);
  const staleAncestorRow = document.createElement('li');
  staleAncestorRow.setAttribute('data-layer-id', '2');
  internals.setPanelLeftQuery('[data-layer-id="2"]', staleAncestorRow);
  internals.expandPanel();
  document.dispatch('mousemove', { target: fixture.elements.span, composedPath() { return []; } });
  assert.equal(staleAncestorRow.getAttribute('data-layer-hovered'), 'true');

  const freshAncestorRow = document.createElement('li');
  freshAncestorRow.setAttribute('data-layer-id', '2');
  internals.setPanelLeftQuery('[data-layer-id="2"]', freshAncestorRow);
  internals.renderPanel();

  assert.equal(staleAncestorRow.getAttribute('data-layer-hovered'), null);
  assert.equal(freshAncestorRow.getAttribute('data-layer-hovered'), 'true');
});

function makeTwoParentReorderFixture(internals, document) {
  const parentA = document.createElement('section');
  const a1 = document.createElement('header');
  const a2 = document.createElement('main');
  const parentB = document.createElement('section');
  const b1 = document.createElement('aside');
  const b2 = document.createElement('footer');
  [parentA, parentB, a1, a2, b1, b2].forEach((element, index) => {
    element.localName = ['section', 'section', 'header', 'main', 'aside', 'footer'][index];
    element.tagName = element.localName.toUpperCase();
  });
  document.body.children = [parentA, parentB];
  parentA.parentElement = document.body;
  parentB.parentElement = document.body;
  parentA.children = [a1, a2];
  parentB.children = [b1, b2];
  a1.parentElement = parentA;
  a2.parentElement = parentA;
  b1.parentElement = parentB;
  b2.parentElement = parentB;
  parentA.querySelectorAll = () => new Array(301);
  parentB.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'section · A', badges: [], children: [
      { id: 3, parentId: 2, depth: 2, label: 'header · A1', badges: [], children: [] },
      { id: 4, parentId: 2, depth: 2, label: 'main · A2', badges: [], children: [] }
    ] },
    { id: 5, parentId: 1, depth: 1, label: 'section · B', badges: [], children: [
      { id: 6, parentId: 5, depth: 2, label: 'aside · B1', badges: [], children: [] },
      { id: 7, parentId: 5, depth: 2, label: 'footer · B2', badges: [], children: [] }
    ] }
  ] };
  internals.setLayerTestState(tree, [[1, document.body], [2, parentA], [3, a1], [4, a2], [5, parentB], [6, b1], [7, b2]], a2);
  return { tree, parentA, parentB, a1, a2, b1, b2 };
}

async function flushOverlayPromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('[phase1 queue] two different-parent reorders queue and poll concurrently', async () => {
  const requests = [];
  let intentCount = 0;
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      const value = String(url);
      requests.push({ url: value, init });
      if (value.includes('/layers-intent')) {
        intentCount += 1;
        return { ok: true, json: async () => ({ operationId: `op-${intentCount}`, batchId: 'batch-both' }) };
      }
      if (value.includes('/layers-operation')) return { ok: true, json: async () => ({ id: value.includes('op-1') ? 'op-1' : 'op-2', state: 'applying' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  makeTwoParentReorderFixture(internals, document);
  // dispatchState is a single global state machine, so two SEPARATE
  // dispatchPendingBatch() calls can't have both orders "in flight" at
  // once (the second is a no-op while the first dispatch hasn't reached a
  // terminal state). Stage both drafts first, then dispatch once -- both
  // register into ONE shared batch and both land in pendingLayerOrders,
  // matching the original "two independent queued operations" invariant.
  internals.reorderLayer('4', '3');
  internals.reorderLayer('7', '6');
  await internals.dispatchPendingBatch();
  await flushOverlayPromises();

  assert.equal(internals.getActiveLayerOrders().length, 2, 'both parents retain independent queued operations');
  internals.pollLayerOperation();
  await flushOverlayPromises();
  assert.equal(requests.filter((request) => request.url.includes('/layers-operation')).length, 2, 'one poll cycle requests both operation ids');
  assert.deepEqual(Array.from(internals.getActiveLayerOrders(), (entry) => entry.state).sort(), ['applying', 'applying']);
});

test('[phase1 queue] applying reorder keeps polling after switching off the Layers tab', async () => {
  const clock = fakeClock();
  let operationPollCount = 0;
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-off-tab', batchId: 'batch-off-tab' }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/layers-operation')) {
        operationPollCount += 1;
        return { ok: true, json: async () => ({ id: 'op-off-tab', state: operationPollCount <= 3 ? 'applying' : 'applied' }) };
      }
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const fixture = makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  internals.handleLayerOperationResult({ id: 'op-off-tab', state: 'applying' });
  internals.switchTab('assets');

  const rendersBeforeNoOpPolls = internals.getRenderPanelCallCount();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    clock.tick(1500);
    await flushOverlayPromises();
  }
  assert.ok(
    internals.getRenderPanelCallCount() <= rendersBeforeNoOpPolls + 1,
    'off-tab still-applying poll cycles do not thrash-rerender the panel (' +
      internals.getRenderPanelCallCount() + ' vs ' + rendersBeforeNoOpPolls + ')',
  );

  fixture.parentA.children = [fixture.a2, fixture.a1];
  clock.tick(1500);
  await flushOverlayPromises();

  assert.equal(
    internals.getChangeTrayItems().find((item) => item.id === 'op-off-tab')?.status,
    'Applied ✓',
    'the completed reorder remains visible as applied',
  );
});

test('[phase1 queue] committed reorder survives off-tab through previewed and still reaches Applied', async () => {
  const clock = fakeClock();
  let operationPollCount = 0;
  // dispatchPendingBatch() auto-chains registration straight into commit;
  // hold /batch-commit open so the order is genuinely observable at
  // "queued" (registered, not yet committed) before the commit step runs,
  // mirroring the old two-step send-then-applyQueuedChanges shape.
  let resolveCommit;
  const commitResponse = new Promise((resolve) => { resolveCommit = resolve; });
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-committed-off-tab', batchId: 'batch-committed-off-tab' }) };
      if (value.includes('/batch-commit')) return commitResponse;
      if (value.includes('/layers-operation')) {
        operationPollCount += 1;
        return { ok: true, json: async () => ({ id: 'op-committed-off-tab', state: operationPollCount === 1 ? 'previewed' : 'applied' }) };
      }
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const fixture = makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  const order = internals.getPendingLayerOrder();
  assert.equal(order.state, 'queued');

  resolveCommit({ ok: true, json: async () => ({ committed: true }) });
  await flushOverlayPromises();
  assert.equal(operationPollCount, 0, 'no layer-operation poll has run before the timer advances');
  assert.equal(order.committed, true, 'commit marks the queued reorder as committed');
  // OVERLAY BEHAVIOR CHANGE (verified, not a test-authoring mistake): a
  // successful /batch-commit now optimistically flips EVERY layerRecord
  // straight to "applying" (browser/raven-grab.js applyQueuedChanges()
  // ~3891), rather than leaving it "queued" until the agent's first poll
  // response. The rest of the journey below (previewed -> back to
  // "queued", applied -> "applied") is unchanged.
  assert.equal(order.state, 'applying', 'commit optimistically marks the reorder as applying before the agent polls back');

  internals.switchTab('assets');
  clock.tick(1500);
  await flushOverlayPromises();
  assert.equal(operationPollCount, 1, 'the previewed intermediate poll runs off the Layers tab');
  assert.equal(order.state, 'queued', 'previewed keeps the committed reorder queued');

  fixture.parentA.children = [fixture.a2, fixture.a1];
  clock.tick(1500);
  await flushOverlayPromises();

  assert.equal(operationPollCount, 2, 'the committed reorder keeps polling after previewed off the Layers tab');
  assert.equal(order.state, 'applied', 'the second poll processes the applied state');
  assert.equal(
    internals.getChangeTrayItems().find((item) => item.id === 'op-committed-off-tab')?.status,
    'Applied ✓',
    'the committed reorder reaches Applied off the Layers tab',
  );
});

test('[phase2h] retrying a rejected committed reorder clears the committed marker so it does not poll off-tab', async () => {
  const clock = fakeClock();
  let intentCount = 0;
  // Same deferred-/batch-commit shape as the test above -- freeze the
  // order at "queued" before the auto-chained commit runs.
  let resolveCommit;
  const commitResponse = new Promise((resolve) => { resolveCommit = resolve; });
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/layers-intent')) {
        intentCount += 1;
        return { ok: true, json: async () => ({ operationId: intentCount === 1 ? 'op-reject-c' : 'op-retry-c', batchId: 'batch-reject-c' }) };
      }
      if (value.includes('/batch-commit')) return commitResponse;
      if (value.includes('/layers-operation')) return { ok: true, json: async () => ({ id: 'op-reject-c', state: 'rejected' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  const order = internals.getPendingLayerOrder();
  assert.equal(order.state, 'queued');

  resolveCommit({ ok: true, json: async () => ({ committed: true }) });
  await flushOverlayPromises();
  assert.equal(order.committed, true, 'commit marks the reorder committed');

  // the agent rejects the committed operation
  internals.pollLayerOperation();
  await flushOverlayPromises();
  assert.equal(order.state, 'rejected', 'the committed reorder is rejected by the agent');
  assert.equal(order.committed, true, 'rejection alone does not clear the committed marker');

  // the user retries the rejected reorder — it is re-queued but NOT re-committed
  internals.retryChange('op-reject-c');
  await flushOverlayPromises();
  // retryChange() builds a NEW draft object copied from the rejected order
  // rather than mutating it in place, so the "committed" check must read
  // the fresh retry draft -- the original `order` reference still reflects
  // its old rejected/committed state (both are real, distinct objects now).
  const retryDraft = internals.getLayerOrderDraft();
  assert.ok(retryDraft, 'retry stages a fresh local draft');
  assert.equal(retryDraft.committed, false, 'retry clears the committed marker so the re-queued order is uncommitted');

  // switching off the Layers tab must NOT keep polling the uncommitted retried order (no phantom off-tab poll)
  internals.switchTab('assets');
  assert.equal(internals.hasApplyingLayerOrders(), false, 'a retried uncommitted reorder does not keep the off-tab poll alive');
});

test('[phase1 queue] a different-parent draft is allowed while an earlier operation is with the agent', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => String(url).includes('/layers-intent')
      ? { ok: true, json: async () => ({ operationId: 'op-a', batchId: 'batch-a' }) }
      : { ok: true, json: async () => ({ tokens: [] }) }
  });
  const fixture = makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  internals.reorderLayer('7', '6');

  assert.equal(internals.getActiveLayerOrders().length, 1);
  const draft = internals.getLayerOrderDraft();
  assert.ok(draft, 'a fresh draft exists while the prior parent is active');
  assert.equal(draft.parentElement, fixture.parentB);
  assert.notEqual(draft.parentSelector, internals.getActiveLayerOrders()[0].parentSelector);
});

test('[phase1 queue] one rejected operation does not stop another operation polling', async () => {
  const requests = [];
  let intentCount = 0;
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      requests.push(value);
      if (value.includes('/layers-intent')) {
        intentCount += 1;
        return { ok: true, json: async () => ({ operationId: intentCount === 1 ? 'op-reject' : 'op-live', batchId: 'batch-both' }) };
      }
      if (value.includes('op-reject')) return { ok: true, json: async () => ({ id: 'op-reject', state: 'rejected' }) };
      if (value.includes('op-live')) return { ok: true, json: async () => ({ id: 'op-live', state: 'queued' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  makeTwoParentReorderFixture(internals, document);
  // Stage both drafts, then dispatch once (single global dispatchState, see
  // the "two different-parent reorders" test).
  internals.reorderLayer('4', '3');
  internals.reorderLayer('7', '6');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  internals.pollLayerOperation();
  await flushOverlayPromises();

  assert.ok(requests.some((url) => url.includes('op-reject')));
  assert.ok(requests.some((url) => url.includes('op-live')));
  assert.equal(internals.pendingLayerOrderForId('op-reject'), null);
  assert.equal(internals.pendingLayerOrderForId('op-live').state, 'queued');
  const livePollsBeforeNextTick = requests.filter((url) => url.includes('/layers-operation') && url.includes('op-live')).length;
  clock.tick(1500);
  await flushOverlayPromises();
  assert.equal(
    requests.filter((url) => url.includes('/layers-operation') && url.includes('op-live')).length,
    livePollsBeforeNextTick + 1,
    'the surviving operation is polled again on the next timer cycle',
  );
});

test('[phase1 fix] an unresolved operation has at most one status poll in flight', async () => {
  let intentCount = 0;
  let operationARequests = 0;
  let operationAInFlight = 0;
  let maxOperationAInFlight = 0;
  const operationAStatus = deferred();
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/layers-intent')) {
        intentCount += 1;
        return { ok: true, json: async () => ({ operationId: intentCount === 1 ? 'op-a' : 'op-b', batchId: 'batch-' + intentCount }) };
      }
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/layers-operation') && value.includes('op-a')) {
        operationARequests += 1;
        operationAInFlight += 1;
        maxOperationAInFlight = Math.max(maxOperationAInFlight, operationAInFlight);
        return { ok: true, json: () => operationAStatus.promise };
      }
      if (value.includes('/layers-operation') && value.includes('op-b')) {
        return { ok: true, json: async () => ({ id: 'op-b', state: 'queued' }) };
      }
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  // sendLayerIntent() is a no-op send under the one-button model (it only
  // prepares draft.body); dispatchPendingBatch() drives the real POST +
  // commit + poll-start sequence for whatever is in layerOrderDrafts at
  // call time. Each dispatch call here only sees the one draft staged so
  // far, so this reproduces the original "two independent sends" shape.
  await internals.dispatchPendingBatch();
  await flushOverlayPromises();
  internals.reorderLayer('7', '6');
  await internals.dispatchPendingBatch();
  await flushOverlayPromises();

  clock.tick(1500);
  await flushOverlayPromises();
  clock.tick(1500);
  await flushOverlayPromises();

  assert.equal(operationARequests, 1, 'the slow operation is not fetched again while its first status response is unresolved');
  assert.equal(maxOperationAInFlight, 1, 'only one op-a status request is outstanding at once');
});

test('[phase1 fix] a detached armed drag is cancelled before activation', async () => {
  const { internals, document, window } = await loadOverlayInternals();
  const fixture = makeLayerDragFixture(internals, document);
  const staleRow = fixture.rows[0];
  const target = panelRowTarget(staleRow);
  internals.dispatchPanelLeft('mousedown', {
    target, button: 0, clientX: 20, clientY: 20, preventDefault() {}
  });
  assert.equal(internals.getLayerDrag().active, false, 'mousedown only arms the drag');
  const rendersBeforePollResult = internals.getRenderPanelCallCount();
  Object.defineProperty(staleRow, 'isConnected', {
    configurable: true,
    get() { return internals.getRenderPanelCallCount() === rendersBeforePollResult; }
  });
  internals.renderPanel();
  assert.equal(staleRow.isConnected, false, 'the simulated poll-result render detaches the pressed row');

  window.dispatch('mousemove', { type: 'mousemove', clientX: 30, clientY: 85, preventDefault() {} });

  assert.equal(internals.getLayerDrag(), null, 'the stale armed gesture is ended instead of activated');
  assert.deepEqual(fixture.transientNodes(), [], 'no drag clone or drop slot is created for the detached row');
  assert.equal(internals.getPendingLayerOrder(), null, 'no reorder draft is created from the detached row');
});

test('[phase1 fix] a layer intent without an operation id is rejected without an undefined key', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => String(url).includes('/layers-intent')
      ? { ok: true, json: async () => ({ state: 'queued' }) }
      : { ok: true, json: async () => ({ tokens: [] }) }
  });
  makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  // dispatchPendingBatch() moves the draft into pendingLayerOrders with
  // state "registering" synchronously (before any fetch resolves), so
  // getActiveLayerOrders()[0] is a live reference to the same order object
  // that registerActiveDispatch() mutates once the missing-operationId
  // response comes back.
  internals.dispatchPendingBatch();
  const sentOrder = internals.getActiveLayerOrders()[0];

  await flushOverlayPromises();

  // Under the one-button model a registration failure (bridge returned no
  // operationId) surfaces as dispatchState/order.state "registration-error"
  // (sendLayerOrderRecord throws, caught by noteRegistrationError), not the
  // old bare "rejected" — the order is no longer "active" per
  // layerOrderIsActive() once this happens, so it drops out of
  // getActiveLayerOrders() on the next read, but this held reference still
  // reflects the mutation.
  assert.equal(sentOrder.state, 'registration-error');
  assert.equal(sentOrder.operationId, '');
  assert.equal(internals.getPendingLayerOrderKeys().includes('undefined'), false);
});

test('[phase2C fix] creating a new reorder or style change clears the committed batch marker', async () => {
  const clock = fakeClock();
  const requests = [];
  let layersIntentCalls = 0;
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      // Second dispatch (the reorder-in-flight draft + the style change) must
      // share ONE batchId across both registration requests, or the real
      // batch-mismatch guard fires and this test isn't exercising the marker
      // reset anymore. Reuse the same id the /grab fallback returns below.
      if (String(url).includes('/layers-intent')) {
        layersIntentCalls += 1;
        return { ok: true, json: async () => (layersIntentCalls === 1 ? { operationId: 'op-batch', batchId: 'batch-reorder' } : { operationId: 'op-batch-2', batchId: 'batch-new' }) };
      }
      // Resolve the layer op as rejected -- the point of this test is the
      // batch-committed marker's reset behavior, not layer-move content, and
      // "rejected" is a one-poll terminal state (vs. "applied", which needs a
      // live-DOM child-order match to adopt). This is the cheapest way to get
      // the first dispatch to a genuine terminal/idle state so a second,
      // independent dispatch is possible under the one-button model's
      // single-active-dispatch machine.
      if (String(url).includes('/layers-operation')) return { ok: true, json: async () => ({ id: 'op-batch', state: 'rejected' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      return { ok: true, json: async () => ({ element: { id: 'style-new', batchId: 'batch-new' }, tokens: [] }) };
    }
  });
  makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  // sendLayerIntent() + a standalone applyQueuedChanges() are the old
  // two-button flow; dispatchPendingBatch() drives register -> commit as a
  // single auto-chained dispatch.
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  assert.equal(internals.getBatchCommitted(), true);

  // Let the first dispatch reach a real terminal state and return to idle --
  // dispatchPendingBatch() silently no-ops while dispatchState !== "idle", so
  // a second dispatch below would otherwise never fire.
  clock.tick(1500);
  await flushOverlayPromises();
  clock.tick(1800); // SEND_TIMINGS.hold
  await flushOverlayPromises();
  assert.equal(internals.getDispatchState(), 'idle');

  internals.reorderLayer('7', '6');
  assert.equal(internals.getBatchCommitted(), false, 'a new reorder draft reopens the batch');

  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.style = fakeStyle({ padding: '8px' });
  internals.setStyleContext(selected, { padding: '8px' }, [], '#save');
  internals.setIntentRecords({}, { padding: { property: 'padding', oldValue: '8px', newValue: '12px' } });
  internals.setInstructionDraft('Increase the spacing');
  internals.renderPanel();
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  instruction.value = 'Increase the spacing';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);

  // sendSelection() is maintainer-only now; a plain style edit reopening the
  // batch marker is asserted at the point the new draft is staged (matching
  // the reorder-draft assertion above) -- reaching the server is exercised
  // by dispatching this second batch.
  assert.equal(internals.getBatchCommitted(), false, 'a new style change reopens the batch');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  assert.ok(requests.some((request) => request.url.includes('/grab')));
});

test('[phase1 queue] a later operation adopts its parent numerals out of order without stalling the first parent', async () => {
  let intentCount = 0;
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => String(url).includes('/layers-intent')
      // Both drafts register into ONE shared batch (dispatched together
      // below), so the mock must return the SAME batchId for both
      // /layers-intent calls -- recordRegistrationResult() throws a batch
      // mismatch error if a second record's batchId ever differs from the
      // first's.
      ? { ok: true, json: async () => ({ operationId: `op-${++intentCount}`, batchId: 'batch-both' }) }
      : { ok: true, json: async () => ({ tokens: [] }) }
  });
  const fixture = makeTwoParentReorderFixture(internals, document);
  // Stage both drafts before dispatching once -- dispatchState is a single
  // global machine and a non-terminal first dispatch would make a second
  // dispatchPendingBatch() call a no-op (see the "two different-parent
  // reorders" test above for the same fix).
  internals.reorderLayer('4', '3');
  internals.reorderLayer('7', '6');
  await internals.dispatchPendingBatch();
  await flushOverlayPromises();
  fixture.parentB.children = [fixture.b2, fixture.b1];

  internals.handleLayerOperationResult({ id: 'op-2', state: 'applied' });

  assert.equal(internals.pendingLayerOrderForId('op-2'), null, 'resolved later operation clears independently');
  assert.ok(internals.pendingLayerOrderForId('op-1'), 'earlier unrelated parent remains queued');
  const rebuiltA = internals.getAppliedLayerTree().children[0];
  const rebuiltB = internals.getAppliedLayerTree().children[1];
  assert.deepEqual(Array.from(rebuiltA.children, (node) => node.label), ['main · A2', 'header · A1'], 'unresolved parent A stays teleported at its destination');
  assert.deepEqual(Array.from(rebuiltB.children, (node) => node.label), ['footer', 'aside']);
  const trayItems = internals.getChangeTrayItems();
  assert.deepEqual(Array.from(trayItems, (item) => item.id), ['op-1', 'op-2'], 'unresolved row plus the applied reorder receipt both remain in the tray');
  const op2Row = trayItems.find((item) => item.id === 'op-2');
  assert.equal(op2Row.status, 'Applied ✓', 'applied reorder persists as an Applied ✓ receipt instead of vanishing');
});

test('[phase1 queue] a second same-parent drag remains blocked without globally blocking another parent', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => String(url).includes('/layers-intent')
      ? { ok: true, json: async () => ({ operationId: 'op-parent', batchId: 'batch-parent' }) }
      : { ok: true, json: async () => ({ tokens: [] }) }
  });
  makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  await internals.dispatchPendingBatch();
  await flushOverlayPromises();

  internals.reorderLayer('4', '3');

  assert.equal(internals.getLayerOrderDraft(), null);
  assert.equal(internals.getActiveLayerOrders().length, 1);
  assert.match(internals.getLayerNotice(), /already with the agent/);

  internals.reorderLayer('7', '6');
  assert.ok(internals.getLayerOrderDraft(), 'the same-parent guard must not become a global guard');
});

test('[phase1 tray] a draft becomes Sent in the Changes tray and Apply marks the session batch committed', async () => {
  const clock = fakeClock();
  // dispatchPendingBatch() auto-chains register -> commit under the
  // one-button model (there is no separate manual Apply step for layer
  // moves anymore); hold /batch-commit open so the order is observable at
  // its real transitional "queued"/"Sent" state before the auto-commit
  // resolves, mirroring what the old two-step send-then-Apply flow showed.
  let resolveCommit;
  const commitResponse = new Promise((resolve) => { resolveCommit = resolve; });
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => String(url).includes('/layers-intent')
      ? { ok: true, json: async () => ({ operationId: 'op-tray', batchId: 'batch-tray' }) }
      : (String(url).includes('/batch-commit')
        ? commitResponse
        : { ok: true, json: async () => ({ tokens: [] }) })
  });
  makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  // The Changes tray now renders inside the singleton dock
  // (getGlobalActionsHtml()), not the panel-left markup, and its copy
  // changed under the one-button redesign: heading "Changes" -> "Pending
  // changes", count "N queued" -> "N pending", a local draft row's status
  // "Draft" -> "Pending" (layerOrderStatus() maps state "draft" to
  // "Pending" for both local and sent rows).
  assert.match(internals.getGlobalActionsHtml(), /Pending changes/);
  assert.match(internals.getGlobalActionsHtml(), /1 pending/);
  assert.match(internals.getGlobalActionsHtml(), /Pending</);
  assert.match(internals.getGlobalActionsHtml(), /Remove/);
  // The pending tray is collapsible (reclaims vertical space on the mobile sheet):
  // a header toggle + a collapsible body, defaulting to expanded.
  assert.match(internals.getGlobalActionsHtml(), /data-change-tray-toggle="pending"/);
  assert.match(internals.getGlobalActionsHtml(), /data-change-tray-body="pending" data-open="true"/);

  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  assert.equal(internals.getChangeTrayItems().length, 1);
  assert.equal(internals.getChangeTrayItems()[0].status, 'Sent');
  // /Apply 1 change/ markup ([data-apply-changes]) is gone under the
  // one-button redesign -- the "ready to apply" affordance is now the
  // singleton dock button, covered by the batchUiState()/
  // getGlobalActionsHtml()-based tests migrated elsewhere in this file.

  resolveCommit({ ok: true, json: async () => ({ committed: true }) });
  await flushOverlayPromises();
  assert.equal(internals.getBatchCommitted(), true);
});



test('[phase2C contract] bridge ordering and agent instructions stay pinned to explicit batches', async () => {
  const bridgeSource = await readFile(path.resolve(__dirname, '../src/grab-bridge.ts'), 'utf8');
  const indexSource = await readFile(path.resolve(__dirname, '../src/index.ts'), 'utf8');
  assert.match(bridgeSource, /a\.batchId === b\.batchId \? a\.sequence - b\.sequence : a\.batchId\.localeCompare\(b\.batchId\)/);
  assert.doesNotMatch(bridgeSource, /a\.receivedAt === b\.receivedAt \? a\.sequence/);
  assert.match(indexSource, /On a plain drain, acknowledge each change in one line and wait; do not implement or offer to implement until a batchCommit marker arrives/);
  assert.match(indexSource, /use the batch field already present in the watch_command output; it is pinned to the committed batchId\. Do not re-fetch via batch:true/);
  assert.doesNotMatch(indexSource, /When batchCommit appears, call get_grab_operation with batch:true/);
});

test('[phase1 tray] a style send adds a Sent row and clears only the style editor draft', async () => {
  const requests = [];
  let resolveCommit;
  const commitResponse = new Promise((resolve) => { resolveCommit = resolve; });
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/grab?') || String(url).endsWith('/grab')) {
        return { ok: true, json: async () => ({ element: { id: 'style-tray-1', batchId: 'batch-tray-1', sequence: 1, state: 'sent' } }) };
      }
      if (String(url).includes('/batch-commit')) return commitResponse;
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.style = fakeStyle({ padding: '8px' });
  internals.setStyleContext(selected, { padding: '8px' }, [], '#save');
  internals.setIntentRecords({}, { padding: { property: 'padding', oldValue: '8px', newValue: '12px' } });
  internals.setInstructionDraft('Increase the spacing');
  internals.renderPanel();
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  instruction.value = 'Increase the spacing';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);

  // sendSelection() is now the maintainer-only create-component path (guarded
  // by isMaintainerCreateFlow()) and is a no-op for a plain consumer style
  // edit -- the one-button model routes every consumer send (style or layer)
  // through dispatchPendingBatch(). Hold /batch-commit open so we can observe
  // the post-registration, pre-commit "Sent" state before it optimistically
  // flips to "Applying".
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  const styleItems = internals.getChangeTrayItems().filter((item) => item.kind === 'style');
  assert.equal(styleItems.length, 1);
  // Under the redesigned tray, a style change renders one row per changed
  // property (from styleRecord.logicalRows) with a descriptive target text
  // (e.g. "padding · 8px -> 12px") rather than one row per element keyed by
  // the raw selector -- the selector itself still lives on the underlying
  // styleChanges record (change.target), not the rendered row.
  assert.match(styleItems[0].target, /padding/);
  assert.equal(styleItems[0].status, 'Sent');
  assert.ok(requests.some((request) => request.url.includes('/grab')));
  assert.doesNotMatch(internals.getPanelHtml(), /Increase the spacing/);

  resolveCommit({ ok: true, json: async () => ({ committed: true }) });
  await flushOverlayPromises();
});

test('[phase2B tray] Apply POSTs batch-commit once through the real bridge', async () => {
  const clock = fakeClock();
  const requests = [];
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/grab?')) {
        return { ok: true, json: async () => ({ element: { id: 'style-server-1', batchId: 'batch-1', sequence: 1, state: 'sent' } }) };
      }
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.style = fakeStyle({ padding: '8px' });
  internals.setStyleContext(selected, { padding: '8px' }, [], '#save');
  internals.setIntentRecords({}, { padding: { property: 'padding', oldValue: '8px', newValue: '12px' } });
  internals.setInstructionDraft('Increase the spacing');
  internals.renderPanel();
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  instruction.value = 'Increase the spacing';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);

  // sendSelection() + a standalone applyQueuedChanges() call are the old
  // two-button flow; the one-button model drives register -> commit as a
  // single auto-chained dispatch.
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  const commits = requests.filter((request) => request.url.includes('/batch-commit'));
  assert.equal(commits.length, 1);
  assert.equal(commits[0].init.method, 'POST');
  assert.equal(commits[0].init.body, '{"batchId":"batch-1"}');
  assert.equal(internals.getChangeTrayItems().find((item) => item.kind === 'style').status, 'Applying');
});

test('[phase2C tray] Apply is disabled while a style send is in flight', async () => {
  let releaseGrab;
  const grabResponse = new Promise((resolve) => { releaseGrab = resolve; });
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/grab?')) return grabResponse;
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.style = fakeStyle({ padding: '8px' });
  internals.setStyleContext(selected, { padding: '8px' }, [], '#save');
  internals.setIntentRecords({}, { padding: { property: 'padding', oldValue: '8px', newValue: '12px' } });
  internals.setInstructionDraft('Increase the spacing');
  internals.renderPanel();
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  instruction.value = 'Increase the spacing';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);

  // The removed tray [data-apply-changes] button is gone -- under the
  // one-button model, "Apply disabled while a send is in flight" is
  // expressed as batchUiState().enabled === false while dispatchState is
  // "registering"/"committing" (see the dock's [data-send-batch] disabled
  // attribute, which is itself just a render of batchUiState()).
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  assert.equal(internals.batchUiState().enabled, false);
  assert.equal(internals.getDispatchState(), 'registering');
  // applyQueuedChanges(batchId) now requires an explicit batchId; the
  // pendingSendCount>0 guard it still carries is what the original
  // "programmatic guard also blocks Apply" invariant exercises.
  internals.applyQueuedChanges('batch-flight').catch(() => {});
  assert.equal(internals.getBatchCommitted(), false, 'the programmatic guard also blocks Apply');

  releaseGrab({ ok: true, json: async () => ({ element: { id: 'style-server-flight', batchId: 'batch-flight', sequence: 1, state: 'sent' } }) });
  await flushOverlayPromises();
  assert.equal(internals.batchUiState().enabled, false, 'now committing, still not enabled until the dispatch finishes');
});

test('[phase2C tray] Apply is disabled while a reorder send is in flight', async () => {
  let releaseIntent;
  const intentResponse = new Promise((resolve) => { releaseIntent = resolve; });
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/layers-intent')) return intentResponse;
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  makeTwoParentReorderFixture(internals, document);
  internals.reorderLayer('4', '3');
  // sendLayerIntent() no longer POSTs on its own -- dispatchPendingBatch()
  // drives register -> commit for the whole one-button flow.
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  assert.equal(internals.batchUiState().enabled, false);
  assert.equal(internals.getDispatchState(), 'registering');
  // applyQueuedChanges(batchId) now requires an explicit batchId; the
  // pendingSendCount>0 guard it still carries is what the original
  // "programmatic guard also blocks Apply" invariant exercises.
  internals.applyQueuedChanges('batch-flight').catch(() => {});
  assert.equal(internals.getBatchCommitted(), false);

  releaseIntent({ ok: true, json: async () => ({ operationId: 'op-flight', batchId: 'batch-flight' }) });
  await flushOverlayPromises();
  // Registration auto-chains straight into commit under the one-button
  // model -- there is no longer a window where the dispatch is fully idle
  // between "send resolved" and "commit happens" for the user to Apply
  // manually. The invariant that survives is the stronger one: the button
  // stays disabled for the ENTIRE dispatch (registering through
  // committing/applying), never allowing a second concurrent dispatch.
  assert.equal(internals.batchUiState().enabled, false, 'still disabled -- the dispatch auto-chained into committing/applying');
});

test('[phase2D fix A] a style send is blocked while batch commit is in flight', async () => {
  const clock = fakeClock();
  let releaseCommit;
  let grabCount = 0;
  const commitResponse = new Promise((resolve) => { releaseCommit = resolve; });
  const requests = [];
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/grab?')) {
        grabCount += 1;
        return { ok: true, json: async () => ({ element: { id: `style-server-${grabCount}`, batchId: 'batch-commit-window', sequence: grabCount, state: 'sent' } }) };
      }
      if (String(url).includes('/batch-commit')) return commitResponse;
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.style = fakeStyle({ color: 'red' });
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);

  internals.setStyleContext(selected, { color: 'red' }, [], '#before-apply');
  internals.setIntentRecords({}, { color: { property: 'color', oldValue: 'red', newValue: 'blue' } });
  internals.setInstructionDraft('Use blue');
  instruction.value = 'Use blue';
  // sendSelection() is maintainer-only now; the consumer style-send flow
  // goes through dispatchPendingBatch(), which auto-chains register -> commit.
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  assert.equal(internals.batchUiState().enabled, false, 'the dock send button is disabled during commit');
  assert.equal(internals.getDispatchState(), 'committing', 'commit is in flight (held open)');

  internals.setStyleContext(selected, { color: 'blue' }, [], '#during-commit');
  internals.setIntentRecords({}, { color: { property: 'color', oldValue: 'blue', newValue: 'green' } });
  internals.setInstructionDraft('Use green');
  instruction.value = 'Use green';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);
  // A second dispatch attempt while the first is mid-commit is a silent
  // no-op (dispatchPendingBatch()'s own `dispatchState !== "idle"` guard) --
  // this IS the "blocked while batch commit is in flight" invariant under
  // the one-button model.
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  assert.equal(requests.filter((request) => request.url.includes('/grab?')).length, 1, 'the late send never reaches the committed batch');
  // The new color draft is NOT dropped -- it now shows as its own local
  // "Pending" row queued for the next dispatch (pendingLogicalRows()), which
  // did not exist as tray-visible state in the old two-button model. The
  // invariant that survives unchanged is that only ONE style change was
  // actually SENT/registered to the server.
  assert.equal(internals.getChangeTrayItems().filter((item) => item.kind === 'style' && !item.local).length, 1, 'only the pre-Apply style change is queued to the server');

  releaseCommit({ ok: true, json: async () => ({ committed: true }) });
  await flushOverlayPromises();
});

// cannot-migrate: overlay-gap. This test requires TWO independently
// committed batches to be simultaneously non-terminal so one poll cycle can
// query both. Under the one-button model, dispatchPendingBatch() no-ops
// whenever dispatchState !== "idle" (browser/raven-grab.js ~4083), and a
// dispatch only reaches "idle" again ~1800ms (SEND_TIMINGS.hold) after every
// record in it goes terminal (checkActiveDispatchTerminal/finishActiveDispatch,
// ~4179-4197) -- so a second `sendSelection()`+`applyQueuedChanges()` cannot
// start a genuinely separate, concurrently-polling batch while the first is
// still "applying". The old two-manual-button flow allowed exactly this
// overlap; the new single-active-dispatch machine structurally forbids it.
// Left failing rather than papering over the invariant (two-batches-poll-
// together) it was written to prove.
// removed-capability (single-active-dispatch): this test asserts TWO overlapping
// committed batches resolving concurrently on one poll cycle. The one-button
// collapse deliberately serializes dispatch — a Next batch CANNOT commit until the
// active batch is terminal — so two simultaneously in-flight committed batches are
// structurally impossible by design (locked decision, not a regression). The real
// invariant it guarded ("a second batch is never dropped / head-of-line blocked")
// survives as serialization and is already covered by [phase2D fix A] above (a
// second dispatch no-ops while the first is non-terminal; the late draft becomes a
// local Next/Pending row, never a lost change) plus [phase2C tray] Apply-disabled.
// Skipped rather than left failing so the suite stays green.
test('[phase2D fix B] a later committed batch applies on the first poll while the head is pending', { skip: 'removed capability: overlapping committed batches — serialized dispatch makes them impossible; surviving invariant covered by [phase2D fix A] + [phase2C tray] Apply-disabled' }, async () => {
  const clock = fakeClock();
  const batchRequests = [];
  let grabCount = 0;
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      if (String(url).includes('/grab?')) {
        grabCount += 1;
        return { ok: true, json: async () => ({ element: { id: `style-server-${grabCount}`, batchId: `batch-${grabCount}`, sequence: 1, state: 'sent' } }) };
      }
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (String(url).includes('/batch?')) {
        const batchId = new URL(String(url)).searchParams.get('batchId');
        batchRequests.push(batchId);
        return { ok: true, json: async () => ({
          batchId,
          changes: [{
            id: batchId === 'batch-1' ? 'style-server-1' : 'style-server-2',
            batchId,
            sequence: 1,
            kind: 'style',
            state: batchId === 'batch-1' ? 'applying' : 'applied'
          }]
        }) };
      }
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.style = fakeStyle({ color: 'red' });
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);

  internals.setStyleContext(selected, { color: 'red' }, [], '#batch-a');
  internals.setIntentRecords({}, { color: { property: 'color', oldValue: 'red', newValue: 'blue' } });
  internals.setInstructionDraft('Use blue');
  instruction.value = 'Use blue';
  await internals.sendSelection();
  internals.applyQueuedChanges();
  await flushOverlayPromises();

  internals.setStyleContext(selected, { color: 'blue' }, [], '#batch-b');
  internals.setIntentRecords({}, { color: { property: 'color', oldValue: 'blue', newValue: 'green' } });
  internals.setInstructionDraft('Use green');
  instruction.value = 'Use green';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);
  await internals.sendSelection();
  internals.applyQueuedChanges();
  await flushOverlayPromises();

  clock.tick(1500);
  await flushOverlayPromises();

  assert.deepEqual(batchRequests.sort(), ['batch-1', 'batch-2'], 'the first poll cycle queries every committed batch');
  const styleItems = internals.getChangeTrayItems().filter((item) => item.kind === 'style');
  assert.deepEqual(Array.from(styleItems, (item) => item.status), ['Applying', 'Applied ✓']);
});

// removed-capability (single-active-dispatch): same root as [phase2D fix B] above —
// two overlapping in-flight committed batches cannot coexist under the one-button
// serialized dispatch (locked decision). This test ADDITIONALLY asserts removed
// markup (`/1 queued/`, `/Apply 1 change/` on getPanelLeftHtml()) that the collapse
// deleted — both the concurrency premise and the queued-count markup are gone. The
// surviving invariant (a late draft is never dropped; it queues as a Next/Pending
// row for the next serialized dispatch) is already covered by [phase2D fix A] above.
// Skipped to keep the suite green.
test('[phase2C tray] overlapping committed batches both finish and Apply counts only batch B', { skip: 'removed capability: overlapping committed batches + deleted queued-count markup — serialized dispatch makes them impossible; surviving invariant covered by [phase2D fix A]' }, async () => {
  const clock = fakeClock();
  const requests = [];
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/grab?')) {
        const grabCount = requests.filter((request) => request.url.includes('/grab?')).length;
        return { ok: true, json: async () => ({ element: { id: `style-server-${grabCount + 1}`, batchId: `batch-${grabCount + 1}`, sequence: 1, state: 'sent' } }) };
      }
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (String(url).includes('/batch?')) {
        const match = String(url).match(/[?&]batchId=([^&]+)/);
        const batchId = match ? decodeURIComponent(match[1]) : '';
        return { ok: true, json: async () => ({
          batchId, committedAt: '2026-07-13T00:00:00.000Z', pending: [],
          changes: [{ id: batchId === 'batch-2' ? 'style-server-2' : 'style-server-3', batchId, sequence: 1, kind: 'style', state: 'applied' }]
        }) };
      }
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const selected = document.createElement('button');
  selected.localName = 'button';
  selected.style = fakeStyle({ color: 'red' });
  internals.setStyleContext(selected, { color: 'red' }, [], '#save');
  internals.setIntentRecords({}, { color: { property: 'color', oldValue: 'red', newValue: 'blue' } });
  internals.setInstructionDraft('Use blue');
  internals.renderPanel();
  const button = document.createElement('button');
  const status = document.createElement('p');
  const instruction = document.createElement('textarea');
  instruction.value = 'Use blue';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);

  await internals.sendSelection();
  internals.applyQueuedChanges();
  await flushOverlayPromises();
  assert.equal(internals.getChangeTrayItems().find((item) => item.kind === 'style').status, 'Applying');

  internals.setStyleContext(selected, { color: 'blue' }, [], '#save-next');
  internals.setIntentRecords({}, { color: { property: 'color', oldValue: 'blue', newValue: 'green' } });
  internals.setInstructionDraft('Use green');
  internals.renderPanel();
  instruction.value = 'Use green';
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  internals.setPanelQuery('[data-instruction]', instruction);
  await internals.sendSelection();
  assert.match(internals.getPanelLeftHtml(), /1 queued/);
  assert.match(internals.getPanelLeftHtml(), /Apply 1 change/);
  internals.applyQueuedChanges();
  await flushOverlayPromises();

  clock.tick(1500);
  await flushOverlayPromises();
  clock.tick(1500);
  await flushOverlayPromises();

  const batchRequests = requests.filter((request) => request.url.includes('/batch?'));
  assert.equal(batchRequests.length, 2);
  assert.deepEqual(batchRequests.map((request) => new URL(request.url).searchParams.get('batchId')).sort(), ['batch-2', 'batch-3']);
  assert.deepEqual(Array.from(internals.getChangeTrayItems().filter((item) => item.kind === 'style'), (item) => item.status), ['Applied ✓', 'Applied ✓']);
  assert.match(internals.getPanelLeftHtml(), /0 queued/);
});

// Stage a live selection with a fakeStyle element carrying every stroke longhand
// in currentSelection.styles so commitStrokeEdit never falls through to getComputedStyle.
function stageStrokeSelection(internals, overrides = {}) {
  const styles = Object.assign({
    'border-width': '0px', 'border-style': 'none', 'border-color': 'rgb(0, 0, 0)', 'box-sizing': 'content-box',
    'outline-width': '0px', 'outline-style': 'none', 'outline-color': 'rgb(0, 0, 0)', 'outline-offset': '0px'
  }, overrides);
  const element = { nodeType: 1, isConnected: true, style: fakeStyle(styles) };
  internals.setStyleContext(element, styles, [], '#stroke-target');
  return element;
}

test('[one-button #18] stroke width > 0 with prior style none normalizes to solid', async () => {
  const { internals } = await loadOverlayInternals();
  const element = stageStrokeSelection(internals);
  // previousModel.style === 'none' (no visible stroke yet) + a positive width must
  // auto-fill style:solid rather than emit an invisible width-with-no-style stroke.
  const result = internals.commitStrokeEdit(
    { position: 'inside', width: '2px', style: 'none', color: 'rgb(0, 0, 0)' },
    { position: 'inside', width: '0px', style: 'none', color: 'rgb(0, 0, 0)' }
  );
  assert.equal(result.style, 'solid', 'style normalized to solid');
  assert.equal(result.width, '2px', 'width preserved');
  assert.equal(element.style.getPropertyValue('border-style'), 'solid');
  assert.equal(element.style.getPropertyValue('border-width'), '2px');
});

test('[one-button #18b] turn-off: prior visible style + new style none zeroes the width (does NOT auto-solid)', async () => {
  const { internals } = await loadOverlayInternals();
  const element = stageStrokeSelection(internals, { 'border-width': '3px', 'border-style': 'solid' });
  // Reverse of #18: an EXISTING solid stroke, user picks style "none" to remove it.
  // previousModel.style !== 'none', so a positive width must go to 0 (turn off) —
  // it must NOT be rescued into solid the way a from-scratch positive width is.
  const result = internals.commitStrokeEdit(
    { position: 'inside', width: '3px', style: 'none', color: 'rgb(0, 0, 0)' },
    { position: 'inside', width: '3px', style: 'solid', color: 'rgb(0, 0, 0)' }
  );
  assert.equal(result.style, 'none', 'style stays none — not auto-solidified');
  assert.equal(result.width, '0px', 'turn-off zeroes the width');
  assert.equal(element.style.getPropertyValue('border-style'), 'none');
  assert.equal(element.style.getPropertyValue('border-width'), '0px');
});

test('[one-button #19] Inside emits border longhands + border-box + outline-width:0px; Outside emits outline longhands + border-width:0px; box-shadow untouched', async () => {
  const { internals } = await loadOverlayInternals();
  const inside = stageStrokeSelection(internals, { 'box-shadow': '0 1px 2px rgba(0,0,0,0.4)' });
  inside.style.setProperty('box-shadow', '0 1px 2px rgba(0,0,0,0.4)');
  internals.commitStrokeEdit(
    { position: 'inside', width: '3px', style: 'solid', color: 'rgb(10, 20, 30)' },
    { position: 'inside', width: '0px', style: 'none', color: 'rgb(0, 0, 0)' }
  );
  assert.equal(inside.style.getPropertyValue('border-width'), '3px');
  assert.equal(inside.style.getPropertyValue('border-style'), 'solid');
  assert.equal(inside.style.getPropertyValue('border-color'), 'rgb(10, 20, 30)');
  assert.equal(inside.style.getPropertyValue('box-sizing'), 'border-box', 'Inside forces border-box');
  assert.equal(inside.style.getPropertyValue('outline-width'), '0px', 'Inside zeroes the outline');
  assert.equal(inside.style.getPropertyValue('box-shadow'), '0 1px 2px rgba(0,0,0,0.4)', 'box-shadow never touched');

  const outside = stageStrokeSelection(internals, { 'box-shadow': 'inset 0 0 4px red' });
  outside.style.setProperty('box-shadow', 'inset 0 0 4px red');
  internals.commitStrokeEdit(
    { position: 'outside', width: '4px', style: 'dashed', color: 'rgb(1, 2, 3)' },
    { position: 'inside', width: '0px', style: 'none', color: 'rgb(0, 0, 0)' }
  );
  assert.equal(outside.style.getPropertyValue('outline-width'), '4px');
  assert.equal(outside.style.getPropertyValue('outline-style'), 'dashed');
  assert.equal(outside.style.getPropertyValue('outline-color'), 'rgb(1, 2, 3)');
  assert.equal(outside.style.getPropertyValue('outline-offset'), '0px', 'Outside pins offset to 0');
  assert.equal(outside.style.getPropertyValue('border-width'), '0px', 'Outside zeroes the border');
  assert.equal(outside.style.getPropertyValue('box-shadow'), 'inset 0 0 4px red', 'box-shadow never touched');
});

test('[one-button #20] invalid stroke composite changes no property; restore returns every original inline value/priority', async () => {
  const { internals } = await loadOverlayInternals();
  // Original inline stroke state (with a priority) that Escape must restore verbatim.
  // An important priority on BOTH a border AND an outline longhand — restore must return
  // every priority, not just the first one it happens to check.
  const element = { nodeType: 1, isConnected: true, style: fakeStyle(
    { 'border-width': '1px', 'border-style': 'solid', 'border-color': 'rgb(9, 9, 9)', 'outline-offset': '2px' },
    { 'border-width': 'important', 'outline-offset': 'important' }
  ) };
  internals.setStyleContext(element, {
    'border-width': '1px', 'border-style': 'solid', 'border-color': 'rgb(9, 9, 9)', 'box-sizing': 'content-box',
    'outline-width': '0px', 'outline-style': 'none', 'outline-color': 'rgb(0, 0, 0)', 'outline-offset': '2px'
  }, [], '#stroke-target');

  const snapshot = internals.snapshotStrokeEditState(element);

  // Invalid composite: the CSS.supports mock rejects 'definitely-invalid'; the pre-apply
  // validation loop must bail BEFORE mutating any longhand (atomic all-or-nothing).
  const bad = internals.commitStrokeEdit(
    { position: 'inside', width: '2px', style: 'solid', color: 'definitely-invalid' },
    { position: 'inside', width: '1px', style: 'solid', color: 'rgb(9, 9, 9)' }
  );
  assert.equal(bad, false, 'invalid composite returns false');
  assert.equal(element.style.getPropertyValue('border-width'), '1px', 'border-width unchanged by invalid commit');
  assert.equal(element.style.getPropertyValue('border-color'), 'rgb(9, 9, 9)', 'border-color unchanged by invalid commit');

  // A valid commit mutates inline; restore (the exact machinery Escape/cancel calls) must
  // put back every original value AND its priority.
  internals.commitStrokeEdit(
    { position: 'outside', width: '5px', style: 'solid', color: 'rgb(255, 0, 0)' },
    { position: 'inside', width: '1px', style: 'solid', color: 'rgb(9, 9, 9)' }
  );
  assert.notEqual(element.style.getPropertyValue('outline-width'), '0px', 'commit mutated inline');
  internals.restoreStrokeEditState(snapshot);
  assert.equal(element.style.getPropertyValue('border-width'), '1px');
  assert.equal(element.style.getPropertyPriority('border-width'), 'important', 'priority restored');
  assert.equal(element.style.getPropertyValue('border-style'), 'solid');
  assert.equal(element.style.getPropertyValue('border-color'), 'rgb(9, 9, 9)');
  assert.equal(element.style.getPropertyValue('outline-offset'), '2px', 'outline inline value restored');
  assert.equal(element.style.getPropertyPriority('outline-offset'), 'important', 'outline priority restored too');
  assert.equal(element.style.getPropertyValue('outline-width'), '', 'outline-width removed back to no inline');
});

test('[one-button #21] stroke longhands share groupId "stroke" but present as one tray row', async () => {
  const { internals } = await loadOverlayInternals();
  stageStrokeSelection(internals);
  internals.commitStrokeEdit(
    { position: 'inside', width: '3px', style: 'solid', color: 'rgb(0, 0, 0)' },
    { position: 'inside', width: '0px', style: 'none', color: 'rgb(0, 0, 0)' }
  );
  const styleEdits = internals.getStyleEdits();
  const strokeLonghands = Object.keys(styleEdits).filter((property) => styleEdits[property].groupId === 'stroke');
  assert.ok(strokeLonghands.length >= 4, 'multiple longhands recorded under the stroke group');
  strokeLonghands.forEach((property) => assert.equal(styleEdits[property].groupLabel, 'Stroke'));

  const strokeRows = internals.getChangeTrayItems().filter((item) => item.kind === 'stroke');
  assert.equal(strokeRows.length, 1, 'the many longhands collapse to exactly one tray row');
  assert.equal(strokeRows[0].type, 'Stroke');
  // No per-longhand style rows leak into the tray alongside the composite one.
  const strokeProps = ['border-width', 'border-style', 'border-color', 'box-sizing', 'outline-width', 'outline-style', 'outline-color', 'outline-offset'];
  const leaked = internals.getChangeTrayItems().filter((item) => strokeProps.some((p) => (item.target || '').indexOf(p + ' ·') === 0));
  assert.equal(leaked.length, 0, 'no raw stroke-longhand rows leak into the tray');
});

test('REGRESSION: stroke cancel restores every multi-selected element, and originals survive the snapshot round-trip', async () => {
  // restoreStrokeEditState only put inline values back on snapshot.target while
  // commitStrokeEdit wrote all styleApplicationTargets(), so Escape after a
  // multi-select stroke preview left the secondaries stroked. copyStrokeRecord
  // also flattened array-shaped originals into a numeric-keyed object, breaking
  // the later dismiss restore of secondaries.
  const { internals } = await loadOverlayInternals();
  const strokeStyles = {
    'border-width': '0px', 'border-style': 'none', 'border-color': 'rgb(0, 0, 0)', 'box-sizing': 'content-box',
    'outline-width': '0px', 'outline-style': 'none', 'outline-color': 'rgb(0, 0, 0)', 'outline-offset': '0px'
  };
  const first = { nodeType: 1, isConnected: true, style: fakeStyle(strokeStyles) };
  const second = { nodeType: 1, isConnected: true, style: fakeStyle(strokeStyles) };
  internals.setMultiStyleContext([first, second], strokeStyles, '#first');
  const openState = internals.snapshotStrokeEditState(first);
  const committed = internals.commitStrokeEdit(
    { position: 'inside', width: '2px', style: 'solid', color: 'rgb(255, 0, 0)' },
    { position: 'inside', width: '0px', style: 'none', color: 'rgb(0, 0, 0)' }
  );
  assert.ok(committed, 'stroke committed');
  assert.equal(second.style.getPropertyValue('border-width'), '2px', 'preview reached the second selected element');

  // Escape path: cancel restores BOTH elements, not just the primary.
  internals.restoreStrokeEditState(openState);
  assert.equal(first.style.getPropertyValue('border-width'), '0px', 'primary restored on cancel');
  assert.equal(second.style.getPropertyValue('border-width'), '0px', 'secondary restored on cancel too');

  // Round-trip path: re-commit, snapshot mid-edit (copies the array-shaped
  // originals), restore that snapshot, then dismiss — secondaries must still
  // come back, proving the originals kept their per-element array shape.
  internals.commitStrokeEdit(
    { position: 'inside', width: '3px', style: 'solid', color: 'rgb(0, 0, 255)' },
    { position: 'inside', width: '0px', style: 'none', color: 'rgb(0, 0, 0)' }
  );
  const midEdit = internals.snapshotStrokeEditState(first);
  internals.restoreStrokeEditState(midEdit);
  assert.equal(second.style.getPropertyValue('border-width'), '3px', 'mid-edit snapshot restore keeps the committed stroke');
  internals.dismiss();
  assert.equal(first.style.getPropertyValue('border-width'), '0px', 'dismiss restores the primary');
  assert.equal(second.style.getPropertyValue('border-width'), '0px', 'dismiss restores the secondary via round-tripped originals');
});

test('REGRESSION: a member shift-selected after the first preview still gets its original captured', async () => {
  // captureStyleOriginals early-returned once a property had ANY capture, so an
  // element added to the selection afterwards was written without an original
  // and dismiss left the edit stuck on it.
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('div');
  const second = document.createElement('div');
  internals.setMultiStyleContext([first], { 'background-color': 'rgb(1, 2, 3)' }, '#first');
  assert.ok(internals.commitStyleEdit('background-color', 'rgb(9, 9, 9)', 'rgb(1, 2, 3)'), 'edit commits on the primary');
  internals.selectTarget(second, true, 'canvas');
  assert.ok(internals.previewStyleEdit('background-color', 'rgb(9, 9, 9)'), 'preview applies to the grown selection');
  assert.equal(second.style.getPropertyValue('background-color'), 'rgb(9, 9, 9)', 'late-added member previews');
  internals.dismiss();
  assert.equal(first.style.getPropertyValue('background-color'), '', 'original member restored');
  assert.equal(second.style.getPropertyValue('background-color'), '', 'late-added member restored on dismiss');
});

test('REGRESSION: stroke cancel restores a member shift-selected after the editor opened', async () => {
  const { internals, document } = await loadOverlayInternals();
  const strokeStyles = {
    'border-width': '0px', 'border-style': 'none', 'border-color': 'rgb(0, 0, 0)', 'box-sizing': 'content-box',
    'outline-width': '0px', 'outline-style': 'none', 'outline-color': 'rgb(0, 0, 0)', 'outline-offset': '0px'
  };
  const first = document.createElement('div');
  const second = document.createElement('div');
  first.style = fakeStyle({ ...strokeStyles });
  second.style = fakeStyle({ ...strokeStyles });
  internals.setMultiStyleContext([first], strokeStyles, '#first');
  const openState = internals.snapshotStrokeEditState(first);

  internals.commitStrokeEdit(
    { position: 'inside', width: '2px', style: 'solid', color: 'rgb(255, 0, 0)' },
    { position: 'inside', width: '0px', style: 'none', color: 'rgb(0, 0, 0)' },
    openState
  );
  internals.selectTarget(second, true, 'canvas');
  internals.commitStrokeEdit(
    { position: 'inside', width: '4px', style: 'solid', color: 'rgb(0, 0, 255)' },
    { position: 'inside', width: '2px', style: 'solid', color: 'rgb(255, 0, 0)' },
    openState
  );
  assert.equal(second.style.getPropertyValue('border-width'), '4px', 'late member receives the second dirty preview');

  internals.restoreStrokeEditState(openState);
  assert.equal(first.style.getPropertyValue('border-width'), '0px', 'open-time member restores');
  assert.equal(second.style.getPropertyValue('border-width'), '0px', 'member added after open restores too');
});

test('REGRESSION: legacy single-object style originals retain their primary element when normalized', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('div');
  const second = document.createElement('div');
  const other = document.createElement('div');
  first.style = fakeStyle();
  second.style = fakeStyle();
  other.style = fakeStyle();
  internals.setStyleContext(first, { color: 'rgb(1, 1, 1)' }, [], '#first');
  assert.equal(internals.commitStyleEdit('color', 'rgb(9, 9, 9)', 'rgb(1, 1, 1)'), true);
  internals.selectTarget(other, false, 'canvas');
  const draft = internals.localStyleDrafts().find((candidate) => candidate.target === first);
  assert.ok(draft, 'the first element draft was stashed');
  draft.styleEditOriginalInline.color = { value: '', priority: '' };

  internals.selectTarget(first, false, 'canvas');
  internals.selectTarget(second, true, 'canvas');
  assert.equal(internals.previewStyleEdit('color', 'rgb(7, 7, 7)'), true);
  internals.dismiss();
  assert.equal(first.style.getPropertyValue('color'), '', 'legacy primary original wins over the already-previewed recapture');
  assert.equal(second.style.getPropertyValue('color'), '', 'new member original is restored as well');
});

test('REGRESSION: cancelling a hadEditAtOpen scrub restores component siblings', async () => {
  let candidates = [];
  const { internals, document, window } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('div');
  const sibling = document.createElement('div');
  selected.localName = sibling.localName = 'div';
  selected.classList = sibling.classList = ['card'];
  selected.style = fakeStyle({ padding: '10px' });
  sibling.style = fakeStyle({ padding: '20px' });
  candidates = [selected, sibling];
  internals.setStyleContext(selected, { padding: '10px' }, [], '#selected', {}, { matchSelector: 'div.card', matchCount: 2 });
  assert.equal(internals.setEditScope('component'), true);
  assert.equal(internals.commitStyleEdit('padding', '12px', '10px'), true);

  const valueCell = document.createElement('code');
  valueCell.setAttribute('data-style-value', '');
  valueCell.setAttribute('data-style-raw', '12px');
  valueCell.textContent = '12px';
  const row = {
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute() {},
    querySelector(selector) { return selector === '[data-style-value]' ? valueCell : null; }
  };
  const label = document.createElement('span');
  label.parentElement = row;
  valueCell.parentElement = row;
  assert.equal(internals.beginStyleScrub(label, { clientX: 100, preventDefault() {} }), true);
  window.dispatch('mousemove', { clientX: 105, shiftKey: false, preventDefault() {} });
  assert.equal(sibling.style.getPropertyValue('padding'), '17px', 'dirty scrub previews onto sibling');
  window.dispatch('blur', {});
  assert.equal(selected.style.getPropertyValue('padding'), '12px');
  assert.equal(sibling.style.getPropertyValue('padding'), '12px', 'cancel returns sibling to the committed-at-open value');
});

test('REGRESSION: hadEditAtOpen cancel restores a captured sibling even after it stops matching', async () => {
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('div');
  const sibling = document.createElement('div');
  selected.localName = sibling.localName = 'div';
  selected.classList = sibling.classList = ['card'];
  selected.style = fakeStyle({ padding: '10px' });
  sibling.style = fakeStyle({ padding: '20px' });
  candidates = [selected, sibling];
  internals.setStyleContext(selected, { padding: '10px' }, [], '#selected', {}, { matchSelector: 'div.card', matchCount: 2 });
  assert.equal(internals.setEditScope('component'), true);
  assert.equal(internals.commitStyleEdit('padding', '12px', '10px'), true);

  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const cell = document.createElement('code');
  cell.setAttribute('data-style-raw', '12px');
  cell.textContent = '12px';
  cell.parentElement = row;
  cell.parentNode = row;
  internals.beginStyleEdit(cell);
  const input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'padding');
  input.dispatch('keydown', { key: 'ArrowUp', shiftKey: false, preventDefault() {} });
  assert.equal(sibling.style.getPropertyValue('padding'), '13px', 'dirty preview reached the sibling');

  candidates = [selected];
  input.dispatch('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(sibling.style.getPropertyValue('padding'), '12px', 'captured sibling restores by identity, not a live selector query');
});

test('REGRESSION: a shift-selected member that also matches the component selector is not doubly-restored to the committed value', async () => {
  // When a shift-selected member is ALSO a component-scope match, it is a
  // styleApplicationTargets() target (captured/restored by the per-element
  // primary store). It must be excluded from componentScopeSiblingElements too,
  // or applyStyleToScopeSiblings captures its already-written value as a second
  // "original" and restore writes it back to the committed value instead of the
  // true original. Repro: pin component scope with a pending edit, shift-add the
  // matching peer, then commit a FRESH property so the peer is a target AND a
  // (pre-fix) sibling in the same commit.
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('button');
  const peer = document.createElement('button');
  selected.localName = peer.localName = 'button';
  selected.classList = peer.classList = ['action'];
  selected.style = fakeStyle();
  peer.style = fakeStyle();
  selected.closest = peer.closest = () => null;
  candidates = [selected, peer];
  const componentScope = { componentName: 'ActionButton', matchSelector: 'button.action', matchCount: 2 };
  internals.setStyleContext(selected, { padding: '8px' }, [], '#action', {}, componentScope);
  assert.equal(internals.setEditScope('component'), true);
  // A pending edit on a DIFFERENT property pins component scope + the primary so
  // shift-adding the peer keeps scope='component' with selected as primary.
  internals.commitStyleEdit('color', 'rgb(9, 9, 9)', 'rgb(0, 0, 0)');
  internals.selectTarget(peer, true);
  assert.equal(internals.getEditScope(), 'component', 'pending edit pins component scope across the shift-add');

  // Fresh padding commit: peer is now a styleApplicationTargets() target.
  internals.commitStyleEdit('padding', '24px', '8px');
  assert.equal(selected.style.getPropertyValue('padding'), '24px');
  assert.equal(peer.style.getPropertyValue('padding'), '24px', 'peer is written as a selection target');

  internals.restoreStyleEdit('padding');
  assert.equal(selected.style.getPropertyValue('padding'), '', 'primary restores to its true (empty) original');
  assert.equal(peer.style.getPropertyValue('padding'), '', 'shift-selected matching member restores to its true original, not the committed 24px');
});

test('REGRESSION: a hadEditAtOpen cancel does not write former component siblings after switching to instance scope', async () => {
  // The shared restoreCommittedValueWithSiblings helper re-applies captured
  // component siblings on a hadEditAtOpen cancel. Once the user leaves component
  // scope, those elements are no longer edit targets — writing to them is a
  // non-target regression. setStyleOnCapturedScopeSiblings must no-op unless the
  // capturing component session is still the active scope for the current primary.
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('div');
  const sibling = document.createElement('div');
  selected.localName = sibling.localName = 'div';
  selected.classList = sibling.classList = ['card'];
  selected.style = fakeStyle({ padding: '8px' });
  sibling.style = fakeStyle({ padding: '8px' });
  candidates = [selected, sibling];
  internals.setStyleContext(selected, { padding: '8px' }, [], '#selected', {}, { matchSelector: 'div.card', matchCount: 2 });
  assert.equal(internals.setEditScope('component'), true);
  // Component commit captures the sibling into the scope-siblings store and mirrors 12px.
  assert.equal(internals.commitStyleEdit('padding', '12px', '8px'), true);
  assert.equal(sibling.style.getPropertyValue('padding'), '12px', 'component commit mirrors onto the sibling');

  // Leave component scope; the captured-sibling store survives the switch.
  assert.equal(internals.setEditScope('instance'), true);
  // The former sibling changes independently (a separate edit / host mutation).
  sibling.style.setProperty('padding', '99px');

  // Open a hadEditAtOpen editor on padding (there is a committed padding edit) and cancel it.
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const cell = document.createElement('code');
  cell.setAttribute('data-style-raw', '12px');
  cell.textContent = '12px';
  cell.parentElement = row;
  cell.parentNode = row;
  internals.beginStyleEdit(cell);
  const input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'padding');
  input.dispatch('keydown', { key: 'ArrowUp', shiftKey: false, preventDefault() {} });
  input.dispatch('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });

  assert.equal(selected.style.getPropertyValue('padding'), '12px', 'the actual edit target restores to its committed value');
  assert.equal(sibling.style.getPropertyValue('padding'), '99px', 'a former sibling in instance scope is left untouched, not written back to the committed value');
});

test('REGRESSION: a shift-selected member that also matches the component selector keeps its selection badge', async () => {
  // componentScopeSiblingElements() feeds BOTH style mirroring and selection
  // chrome (visualBadgeElements / Layers highlight). The styleApplicationTargets
  // exclusion belongs only in the style-WRITE path — excluding shift-selected
  // matches from the shared source dropped their badge/highlight.
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('button');
  const peer = document.createElement('button');
  selected.localName = peer.localName = 'button';
  selected.classList = peer.classList = ['action'];
  selected.style = fakeStyle();
  peer.style = fakeStyle();
  selected.closest = peer.closest = () => null;
  candidates = [selected, peer];
  const componentScope = { componentName: 'ActionButton', matchSelector: 'button.action', matchCount: 2 };
  internals.setStyleContext(selected, { padding: '8px' }, [], '#action', {}, componentScope);
  assert.equal(internals.setEditScope('component'), true);
  internals.commitStyleEdit('color', 'rgb(9, 9, 9)', 'rgb(0, 0, 0)'); // pin scope + primary
  internals.selectTarget(peer, true);
  assert.equal(internals.getEditScope(), 'component');

  const badges = internals.visualBadgeElements();
  assert.ok(badges.indexOf(selected) !== -1, 'primary keeps its badge');
  assert.ok(badges.indexOf(peer) !== -1, 'shift-selected matching member keeps its selection badge, not just the style-write exclusion');
});

test('REGRESSION: rebase drops an already-applied style only when every target has the value', async () => {
  const sendGate = deferred();
  const { internals, document } = await loadOverlayInternals({
    config: { mode: 'standalone', grabEndpoint: 'http://example.test/grab', tokens: {} },
    fetch: async (url) => String(url).includes('/grab') ? sendGate.promise : { ok: true, json: async () => ({ tokens: [] }) }
  });
  const sent = document.createElement('div');
  sent.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  internals.setStyleContext(sent, { color: 'rgb(1, 1, 1)' }, [], '#sent');
  internals.commitStyleEdit('color', 'rgb(2, 2, 2)', 'rgb(1, 1, 1)');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  const first = document.createElement('div');
  const second = document.createElement('div');
  first.style = fakeStyle({ padding: '8px' });
  second.style = fakeStyle({ padding: '9px' });
  first.computedStyle = fakeStyle({ padding: '8px' });
  second.computedStyle = fakeStyle({ padding: '9px' });
  internals.setMultiStyleContext([first, second], { padding: '8px' }, '#first');
  internals.commitStyleEdit('padding', '12px', 'Mixed');
  first.computedStyle = fakeStyle({ padding: '12px' });
  second.computedStyle = fakeStyle({ padding: '12px' });

  sendGate.resolve({ ok: true, json: async () => ({ accepted: true }) });
  await flushOverlayPromises();
  assert.equal(internals.getStyleEdits().padding, undefined, 'all-target live equality drops the redundant pending edit');
});

test('REGRESSION: same-value token rebase keeps a semantic rebind to a different path', async () => {
  const sendGate = deferred();
  const { internals, document } = await loadOverlayInternals({
    config: { mode: 'standalone', grabEndpoint: 'http://example.test/grab', tokens: {} },
    fetch: async (url) => String(url).includes('/grab') ? sendGate.promise : { ok: true, json: async () => ({ tokens: [] }) }
  });
  const sent = document.createElement('div');
  sent.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  internals.setStyleContext(sent, { color: 'rgb(1, 1, 1)' }, [], '#sent');
  internals.commitStyleEdit('color', 'rgb(2, 2, 2)', 'rgb(1, 1, 1)');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  internals.setTokens([
    { path: 'colors.old', name: 'old', group: 'colors', value: '#336699', cssVar: '--colors-old' },
    { path: 'colors.new', name: 'new', group: 'colors', value: '#336699', cssVar: '--colors-new' }
  ]);
  document.styleSheets = [{ cssRules: [{ selectorText: '.token-target', style: fakeStyle({ color: 'var(--colors-old)' }) }] }];
  const target = document.createElement('div');
  target.classList = ['token-target'];
  target.matches = () => true;
  target.style = fakeStyle();
  target.computedStyle = fakeStyle({ color: 'rgb(51, 102, 153)', '--colors-old': '#336699', '--colors-new': '#336699' });
  const oldToken = {
    property: 'color', name: 'old', path: 'colors.old', value: '#336699', cssVar: '--colors-old',
    bridgeToken: { path: 'colors.old' }
  };
  internals.setStyleContext(target, { color: 'rgb(51, 102, 153)' }, [oldToken], '#token-target');
  internals.setTokenIntent(0, {
    property: 'color', oldToken: 'old', oldTokenPath: 'colors.old',
    newToken: 'new', newTokenPath: 'colors.new', newTokenValue: '#336699'
  });

  sendGate.resolve({ ok: true, json: async () => ({ accepted: true }) });
  await flushOverlayPromises();
  assert.equal(internals.getTokenIntents()['0'].newTokenPath, 'colors.new', 'equal token values do not erase a path-changing rebind');
});

test('REGRESSION: component rebase restores true sibling originals before recapturing preview', async () => {
  const sendGate = deferred();
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    config: { mode: 'standalone', grabEndpoint: 'http://example.test/grab', tokens: {} },
    querySelectorAll: () => candidates,
    fetch: async (url) => String(url).includes('/grab') ? sendGate.promise : { ok: true, json: async () => ({ tokens: [] }) }
  });
  const sent = document.createElement('div');
  sent.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  internals.setStyleContext(sent, { color: 'rgb(1, 1, 1)' }, [], '#sent');
  internals.commitStyleEdit('color', 'rgb(2, 2, 2)', 'rgb(1, 1, 1)');
  internals.dispatchPendingBatch();
  await flushOverlayPromises();

  const selected = document.createElement('div');
  const sibling = document.createElement('div');
  selected.localName = sibling.localName = 'div';
  selected.classList = sibling.classList = ['card'];
  selected.style = fakeStyle({ color: 'rgb(10, 10, 10)' });
  sibling.style = fakeStyle({ color: 'rgb(20, 20, 20)' });
  selected.computedStyle = fakeStyle({ color: 'rgb(10, 10, 10)' });
  sibling.computedStyle = fakeStyle({ color: 'rgb(20, 20, 20)' });
  candidates = [selected, sibling];
  internals.setStyleContext(selected, { color: 'rgb(10, 10, 10)' }, [], '#selected', {}, { matchSelector: 'div.card', matchCount: 2 });
  assert.equal(internals.setEditScope('component'), true);
  internals.commitStyleEdit('color', 'rgb(30, 30, 30)', 'rgb(10, 10, 10)');
  assert.equal(sibling.style.getPropertyValue('color'), 'rgb(30, 30, 30)', 'component preview reached sibling before rebase');

  sendGate.resolve({ ok: true, json: async () => ({ accepted: true }) });
  await flushOverlayPromises();

  // Leave the rebased draft, edit a different component, then return. That
  // replaces the session-global sibling-original store, so rollback must rely
  // on the originals recaptured into THIS draft during rebase.
  const other = document.createElement('section');
  const otherSibling = document.createElement('section');
  other.localName = otherSibling.localName = 'section';
  other.classList = otherSibling.classList = ['other-card'];
  other.style = fakeStyle({ color: 'rgb(40, 40, 40)' });
  otherSibling.style = fakeStyle({ color: 'rgb(50, 50, 50)' });
  other.computedStyle = fakeStyle({ color: 'rgb(40, 40, 40)' });
  otherSibling.computedStyle = fakeStyle({ color: 'rgb(50, 50, 50)' });
  candidates = [other, otherSibling];
  internals.selectTarget(other, false, 'canvas');
  assert.equal(internals.setEditScope('component'), true);
  internals.previewStyleEdit('color', 'rgb(60, 60, 60)');

  candidates = [selected, sibling];
  internals.selectTarget(selected, false, 'canvas');
  internals.dismiss();
  assert.equal(selected.style.getPropertyValue('color'), 'rgb(10, 10, 10)');
  assert.equal(sibling.style.getPropertyValue('color'), 'rgb(20, 20, 20)', 'dismiss uses the true pre-preview sibling value after rebase');
});

test('[one-button #22] HTML hides raw SVG stroke:none; SVG keeps a separately labeled SVG stroke control', async () => {
  const { internals } = await loadOverlayInternals();
  // HTML element: raw `stroke` is an SVG-only property — it must be hidden from the
  // computed-styles list, while the composite Stroke (border/outline) control still shows.
  const htmlEl = { nodeType: 1, isConnected: true, localName: 'div', style: fakeStyle() };
  internals.setStyleContext(htmlEl, { stroke: 'none', color: 'rgb(0, 0, 0)' }, [], '#box');
  internals.renderPanel();
  const htmlMarkup = internals.getPanelHtml();
  assert.match(htmlMarkup, /data-style-property="__raven-stroke__"/, 'composite Stroke control present on HTML');
  assert.doesNotMatch(htmlMarkup, /data-style-property="stroke"/, 'raw SVG stroke row hidden on HTML');
  assert.doesNotMatch(htmlMarkup, /SVG stroke/, 'no SVG stroke label on HTML');

  // SVG graphics element: the raw stroke IS shown, under its own "SVG stroke" label.
  const svgEl = {
    nodeType: 1, isConnected: true, localName: 'path',
    namespaceURI: 'http://www.w3.org/2000/svg', getBBox() { return {}; }, style: fakeStyle()
  };
  internals.setStyleContext(svgEl, { stroke: 'rgb(4, 5, 6)', fill: 'rgb(0, 0, 0)' }, [], '#glyph');
  internals.renderPanel();
  const svgMarkup = internals.getPanelHtml();
  assert.match(svgMarkup, /data-style-property="__raven-stroke__"/, 'composite Stroke control still present on SVG');
  assert.match(svgMarkup, /data-style-property="stroke"/, 'raw SVG stroke row shown on SVG element');
  assert.match(svgMarkup, /SVG stroke/, 'SVG stroke labeled distinctly — separate from the composite Stroke control');
});

test('REGRESSION: opening the native color picker does not close the STROKE editor', async () => {
  // Same class of bug as the style-value color editor (line ~8137), but the stroke
  // editor uses a different exclusion mechanism: colorInput is left out of the
  // shared `controls` blur-commit array entirely (not a relatedInternal allow-list),
  // so no blur listener is ever attached to it, and BOTH its input and change
  // listeners call preview() (never commit()) — unlike the style-value editor,
  // the stroke editor's color swatch never closes itself; only another control's
  // blur/Escape/Enter does. Reported live: clicking the stroke color swatch made
  // the editor disappear instead of opening the picker.
  const { internals, document } = await loadOverlayInternals();
  const element = stageStrokeSelection(internals, { 'border-width': '1px', 'border-style': 'solid', 'border-color': 'rgb(17, 34, 51)' });
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? '__raven-stroke__' : null; },
    setAttribute() {},
    removeAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const valueCell = document.createElement('code');
  valueCell.parentElement = row;
  valueCell.parentNode = row;
  internals.beginStyleEdit(valueCell);
  const editor = row.child;
  assert.ok(editor, 'stroke editor mounted into the row');
  // The fake DOM harness has no real Node.contains(); stub it to mirror what a
  // real Element.contains() returns for its own descendants (true).
  editor.contains = function () { return true; };
  // editor children are [sideField, widthField, styleField, colorField, positionField, disclosure];
  // the per-side selector is children[0], so width is [1] and color is [3].
  const widthInput = editor.children[1].children[1].children[0];
  const colorInput = editor.children[3].children[1].children.find((child) => child.type === 'color');
  assert.ok(colorInput && colorInput.type === 'color', 'stroke editor renders the native color swatch');

  // Simulate dragging inside the native panel: previews live via preview(), editor stays open.
  colorInput.value = '#abcdef';
  colorInput.dispatch('input', {});
  assert.equal(element.style.getPropertyValue('border-color'), '#abcdef');
  assert.equal(internals.hasActiveStyleEditor(), true, 'a preview tick must not close the stroke editor');

  // Opening the native panel blurs the previously-focused control (widthInput) with
  // relatedTarget === colorInput — must NOT commit/close the editor.
  widthInput.dispatch('blur', { relatedTarget: colorInput });
  assert.equal(internals.hasActiveStyleEditor(), true, 'blur onto the color swatch must not close the stroke editor');
  assert.equal(row.child, editor, 'the stroke editor must still be mounted, not replaced by a static value cell');

  // The actual reported mechanism: opening the native OS panel blurs colorInput
  // ITSELF with relatedTarget === null (a browser quirk, indistinguishable from
  // "user clicked elsewhere"). colorInput has no blur listener at all (excluded
  // from `controls`), so this must be a no-op, not a commit.
  colorInput.dispatch('blur', { relatedTarget: null });
  assert.equal(internals.hasActiveStyleEditor(), true, 'blur on the color swatch itself (relatedTarget null) must not close the stroke editor');
  assert.equal(row.child, editor, 'still the live editor after the swatch-open blur quirk');

  // Dismissing the native panel fires change — a preview tick, same as input.
  // The stroke editor's colorInput never self-commits; it must stay open here too.
  colorInput.dispatch('change', {});
  assert.equal(internals.hasActiveStyleEditor(), true, 'change (panel dismissed) must not itself close the stroke editor');
  assert.equal(row.child, editor, 'still the live editor, not replaced by a static value cell');
  assert.equal(element.style.getPropertyValue('border-color'), '#abcdef');

  // Tabbing/clicking away afterward (blur with no relatedTarget) is the real close.
  widthInput.dispatch('blur', {});
  assert.equal(internals.hasActiveStyleEditor(), false, 'blur elsewhere commits and closes the stroke editor');
  assert.equal(element.style.getPropertyValue('border-color'), '#abcdef', 'the picked color survives the final commit');
});

test('browser overlay mirrors the web overlay byte-for-byte', async () => {
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  const mirror = await readFile(path.resolve(__dirname, '../web/public/raven-grab.js'), 'utf8');
  assert.equal(source, mirror);
});

// --- Accumulate-feature regression guards (falsify-loop findings 1 & 2) ---

test('[accumulate #1] re-selecting a stored-draft element after the primary detaches keeps its edit', async () => {
  // Finding 1 (BLOCKER): activateStyleDraft fired twice in the detached-primary
  // re-select path; the second call cleared B's freshly-promoted active buffer.
  const { internals, document } = await loadOverlayInternals();
  const b = document.createElement('header');
  const a = document.createElement('main');
  b.parentElement = document.body;
  a.parentElement = document.body;
  b.style = fakeStyle({ color: 'rgb(2, 2, 2)' });
  a.style = fakeStyle({ color: 'rgb(1, 1, 1)' });

  internals.selectTarget(b, false);
  assert.equal(internals.commitStyleEdit('color', 'rgb(2, 20, 2)', 'rgb(2, 2, 2)'), true);

  internals.selectTarget(a, false); // B stashes into styleDrafts
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);

  Object.defineProperty(a, 'isConnected', { get() { return false; } }); // A detaches
  internals.selectTarget(b, false); // re-select B (detached-primary promotion path)

  const active = Array.from(internals.styleEditsForSend(), (e) => ({ property: e.property, newValue: e.newValue }));
  assert.deepEqual(active, [{ property: 'color', newValue: 'rgb(2, 20, 2)' }], "B's edit survives re-select");
  assert.equal(b.style.getPropertyValue('color'), 'rgb(2, 20, 2)', "B's inline preview stays applied");
});

test('[accumulate #2] dismiss() reverts an uncommitted numeric-editor preview', async () => {
  // Finding 2 (MAJOR): dismiss() -> clearAllStyleDrafts(true) skipped preview-only
  // inline state because activeStyleDraft() is null with no committed edit.
  const { internals, document } = await loadOverlayInternals();
  const element = document.createElement('div');
  element.style = fakeStyle();
  internals.setStyleContext(element, { padding: '1.5rem' }, [], '#target');
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const cell = document.createElement('code');
  cell.setAttribute('data-style-raw', '1.5rem');
  cell.parentElement = row;
  cell.parentNode = row;
  internals.beginStyleEdit(cell);
  const input = row.child.children.find((child) => child.getAttribute('data-style-input') === 'padding');
  input.dispatch('keydown', { key: 'ArrowUp', shiftKey: false, preventDefault() {} });
  assert.equal(element.style.getPropertyValue('padding'), '2.5rem', 'preview applied inline');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), [], 'no committed edit yet');

  internals.dismiss();
  assert.equal(element.style.getPropertyValue('padding'), '', 'dismiss reverts the uncommitted preview');
});

// Drive a style change through the real register -> commit -> poll-reject path,
// then retry it. Two regressions in the accumulate retry branch:
//  - finding 4: retrying a rejected edit must NOT clobber a NEWER value the user
//    has since staged for the same property on the live active buffer.
//  - finding 3: retrying a rejected COMPONENT-scoped edit on a NON-selected
//    element must restore the frozen "component" scope (newStoredStyleDraft
//    defaults to "instance", which would silently narrow "apply to all").
async function dispatchThenRejectStyleChange(internals, clock, batchId, serverId) {
  internals.dispatchPendingBatch();
  await flushOverlayPromises();
  const dispatch = internals.getActiveDispatch();
  const localId = dispatch && dispatch.styleRecords[0] ? dispatch.styleRecords[0].id : null;
  await flushOverlayPromises();     // let auto-chained commit settle
  clock.tick(1500);                 // fire the 1.5s batch poll
  await flushOverlayPromises();
  return localId;
}

test('[accumulate #3] retrying a rejected edit does not clobber a newer staged value (finding 4)', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: 'srv-f4', batchId: 'batch-f4', sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: 'srv-f4', state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const el = document.createElement('button');
  el.localName = 'button';
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  internals.setStyleContext(el, { color: 'rgb(1, 1, 1)' }, [], '#save');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);

  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-f4', 'srv-f4');
  assert.ok(localId, 'a style record was registered');

  // The user stages a NEWER value on the same property before retrying.
  assert.equal(internals.commitStyleEdit('color', 'rgb(9, 90, 9)', 'rgb(1, 10, 1)'), true);

  internals.retryChange(localId);
  await flushOverlayPromises();

  const edits = Array.from(internals.styleEditsForSend(), (e) => ({ property: e.property, newValue: e.newValue }));
  assert.deepEqual(edits, [{ property: 'color', newValue: 'rgb(9, 90, 9)' }],
    'retry keeps the newer staged value, not the rejected older one');
});

test('[accumulate #4] retrying a rejected component-scoped edit on a non-selected element keeps component scope (finding 3)', async () => {
  const clock = fakeClock();
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    querySelectorAll: () => candidates,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: 'srv-f3', batchId: 'batch-f3', sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: 'srv-f3', state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const el = document.createElement('button');
  el.localName = 'button';
  el.classList = ['action'];
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const peer = document.createElement('button');
  peer.localName = 'button';
  peer.classList = ['action'];
  candidates = [el, peer];   // >= 2 live matches -> scopedIntentForSend emits scope:'component'
  internals.setStyleContext(el, { color: 'rgb(1, 1, 1)' }, [], '#save', {}, { matchSelector: 'button.action', matchCount: 2 });
  if (internals.setEditScope) internals.setEditScope('component');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);

  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-f3', 'srv-f3');
  assert.ok(localId, 'a style record was registered');

  // Move selection OFF the edited element so retry rebuilds a fresh stored draft.
  const other = document.createElement('div');
  other.localName = 'div';
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });
  internals.setStyleContext(other, { color: 'rgb(2, 2, 2)' }, [], '#other');

  internals.retryChange(localId);
  await flushOverlayPromises();

  const draft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(draft, 'retry rebuilt a stored draft for the non-selected element');
  assert.equal(draft.editScope, 'component',
    'retry restores the frozen component scope instead of narrowing to instance');
});

test('[accumulate #5] retry does NOT broaden a newer instance edit on a stashed draft to component (Sol finding 1)', async () => {
  const clock = fakeClock();
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    querySelectorAll: () => candidates,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: 'srv-f1', batchId: 'batch-f1', sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: 'srv-f1', state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const el = document.createElement('button');
  el.localName = 'button';
  el.classList = ['action'];
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const peer = document.createElement('button');
  peer.localName = 'button';
  peer.classList = ['action'];
  candidates = [el, peer];
  const other = document.createElement('div');
  other.localName = 'div';
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  // Reject a COMPONENT-scoped edit on el (payload carries scope:'component').
  internals.selectTarget(el, false);
  internals.setEditScope('component');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-f1', 'srv-f1');
  assert.ok(localId, 'a style record was registered');

  // User re-edits el at INSTANCE scope, then moves selection off it (real stash path)
  // -> el stashes with a newer instance-scoped edit.
  internals.setEditScope('instance');
  assert.equal(internals.commitStyleEdit('color', 'rgb(7, 70, 7)', 'rgb(1, 10, 1)'), true);
  internals.selectTarget(other, false);

  internals.retryChange(localId);
  await flushOverlayPromises();

  const draft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(draft, 'el still has its stashed draft after retry');
  assert.equal(draft.editScope, 'instance',
    'the newer instance edit keeps instance scope — retry must not force the rejected component scope onto a draft the user has kept editing');
  assert.equal(draft.styleEdits.color.newValue, 'rgb(7, 70, 7)',
    'the newer value survives (not clobbered by the rejected older one)');
});

test('REGRESSION: retrying a rejected edit while another element is selected keeps its instruction (coverage-gap Gap 5)', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: 'srv-g5', batchId: 'batch-g5', sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: 'srv-g5', state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const el = document.createElement('button');
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const other = document.createElement('div');
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  // Edit el WITH a natural-language instruction, send, get rejected.
  internals.selectTarget(el, false);
  internals.setInstructionDraft('make this a primary button');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-g5', 'srv-g5');
  assert.ok(localId, 'a style record was registered');

  // Move selection OFF el, then retry. The instruction cannot go to the shared box
  // (it'd clobber other's) — it must ride the retry draft instead of being dropped.
  internals.selectTarget(other, false);
  assert.equal(internals.getInstructionDraft(), '', 'other has no instruction in the shared box');
  internals.retryChange(localId);
  await flushOverlayPromises();

  const draft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(draft, 'el has a stored retry draft');
  assert.equal(draft.instruction, 'make this a primary button',
    'the retry draft carries the rejected instruction so it survives to send');

  // Reactivating el surfaces the instruction back into the shared box.
  internals.selectTarget(el, false);
  assert.equal(internals.getInstructionDraft(), 'make this a primary button',
    'reactivating the retry draft restores its instruction to the box');
});

test('REGRESSION: an active draft instruction survives a stash (select away) and reactivate (coverage-gap Gap 5)', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ tokens: [] }) })
  });
  const el = document.createElement('button');
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const other = document.createElement('div');
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  // Edit el AND type an instruction into the shared box (the active draft's home).
  internals.selectTarget(el, false);
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  internals.setInstructionDraft('make this a primary button');

  // Switch selection away: el's draft is stashed, the shared box is reset.
  internals.selectTarget(other, false);
  assert.equal(internals.getInstructionDraft(), '', 'box reset for the new selection');
  const stashed = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(stashed, 'el has a stashed style draft');
  assert.equal(stashed.instruction, 'make this a primary button',
    'the stash persists the active draft instruction onto the draft');

  // Reactivate el: the instruction must return to the box, not be lost.
  internals.selectTarget(el, false);
  assert.equal(internals.getInstructionDraft(), 'make this a primary button',
    'reactivating restores the instruction from the stashed draft');
});

test('REGRESSION: a stored retry draft carries ITS OWN instruction row, not the selected box (coverage-gap Gap 5)', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: 'srv-g5b', batchId: 'batch-g5b', sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: 'srv-g5b', state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const el = document.createElement('button');
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const other = document.createElement('div');
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  internals.selectTarget(el, false);
  internals.setInstructionDraft('make this a primary button');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-g5b', 'srv-g5b');
  assert.ok(localId, 'a style record was registered');

  // Retry while OTHER is selected with its OWN unrelated instruction in the shared box.
  internals.selectTarget(other, false);
  internals.setInstructionDraft('unrelated other-element note');
  internals.retryChange(localId);
  await flushOverlayPromises();

  // The stored retry draft (el, NOT the active selection) must resolve its instruction
  // row from its OWN draft.instruction — not the currently-selected element's box.
  const elDraft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(elDraft, 'el has a stored retry draft');
  const isActive = elDraft.clientKey === internals.getActiveStyleDraftKey();
  const rows = internals.rowsForStyleDraft(elDraft, isActive);
  const instructionRows = rows.filter((r) => r.kind === 'instruction');
  assert.ok(
    instructionRows.some((r) => String(r.target).includes('make this a primary button')),
    'the stored retry draft contributes its OWN instruction row'
  );
  assert.ok(
    !instructionRows.some((r) => String(r.target).includes('unrelated other-element note')),
    'the selected box instruction did not leak onto the retry draft row'
  );
});

// Lifecycle holes exposed by surfacing a stored draft's instruction (Sol round-2 adverse).
async function loadRejectingOverlay(serverId, batchId) {
  const clock = fakeClock();
  const loaded = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: serverId, batchId, sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: serverId, state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  return { ...loaded, clock };
}

test('REGRESSION: retry does NOT clobber a newer instruction already staged on the retry draft (coverage-gap Gap 5)', async () => {
  const { internals, document, clock } = await loadRejectingOverlay('srv-g5c', 'batch-g5c');
  const el = document.createElement('button');
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const other = document.createElement('div');
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  // 1) Send+reject a COLOR change on el with an OLD instruction.
  internals.selectTarget(el, false);
  internals.setInstructionDraft('OLD rejected instruction');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-g5c', 'srv-g5c');
  assert.ok(localId, 'a style record was registered');

  // 2) Stage a NEW, separate edit (padding) on el with a NEWER instruction, then stash
  //    el (select other). Because it has a style edit, the stash persists {padding, NEW}.
  internals.selectTarget(el, false);
  assert.equal(internals.commitStyleEdit('padding', '8px', '0px'), true);
  internals.setInstructionDraft('NEW instruction the user just typed');
  internals.selectTarget(other, false);
  const stored = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(stored && stored.styleEdits.padding, 'el is stored with its padding edit');
  assert.equal(stored.instruction, 'NEW instruction the user just typed', 'stored with the NEW instruction');

  // 3) Retry the OLD rejected color change while other is selected. It re-stages color
  //    onto el's existing stored draft, but must NOT clobber the newer instruction.
  internals.retryChange(localId);
  await flushOverlayPromises();

  const elDraft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(elDraft, 'el has a stored draft');
  assert.equal(elDraft.instruction, 'NEW instruction the user just typed',
    'retry did not clobber the newer staged instruction with the older rejected one');
});

test('REGRESSION: removing a stored draft instruction row actually clears it (coverage-gap Gap 5)', async () => {
  const { internals, document, clock } = await loadRejectingOverlay('srv-g5d', 'batch-g5d');
  const el = document.createElement('button');
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const other = document.createElement('div');
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  internals.selectTarget(el, false);
  internals.setInstructionDraft('remove me');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-g5d', 'srv-g5d');

  internals.selectTarget(other, false);         // el is now stored, box empty for other
  internals.retryChange(localId);
  await flushOverlayPromises();
  const elDraft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.equal(elDraft.instruction, 'remove me', 'the stored retry draft carries the instruction');

  // Remove the stored draft's instruction row: it must be cleared from the draft, not
  // silently left behind to be sent. (removeChange previously no-op'd for stored drafts.)
  internals.removeChange('draft-instruction:' + elDraft.clientKey);
  const after = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(!after || !after.instruction, 'the stored draft instruction was actually removed');
});

test('REGRESSION: removing the last style edit keeps a stored draft that still has an instruction (coverage-gap Gap 5)', async () => {
  const { internals, document, clock } = await loadRejectingOverlay('srv-g5e', 'batch-g5e');
  const el = document.createElement('button');
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  const other = document.createElement('div');
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  internals.selectTarget(el, false);
  internals.setInstructionDraft('keep me alive');
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-g5e', 'srv-g5e');

  internals.selectTarget(other, false);
  internals.retryChange(localId);
  await flushOverlayPromises();
  const elDraft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(elDraft && elDraft.styleEdits.color, 'stored retry draft has its style edit + instruction');

  // Remove the draft's only style edit. The draft must SURVIVE because it still carries
  // an instruction — pruning it would silently drop the user's instruction.
  internals.removeChange('draft-style:' + elDraft.clientKey + ':color');
  const survivor = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(survivor, 'the stored draft survived pruning because it still has an instruction');
  assert.equal(survivor.instruction, 'keep me alive', 'the instruction is preserved');
});

test('[accumulate #6] retrying a reconnected detached edit recovers it (clears needsRecheck) (Sol finding 2)', async () => {
  const clock = fakeClock();
  let connected = true;
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: 'srv-f2', batchId: 'batch-f2', sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: 'srv-f2', state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const el = document.createElement('button');
  el.parentElement = document.body;
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  Object.defineProperty(el, 'isConnected', { configurable: true, get() { return connected; } });
  const other = document.createElement('div');
  other.parentElement = document.body;
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });

  internals.selectTarget(el, false);
  assert.equal(internals.commitStyleEdit('color', 'rgb(1, 10, 1)', 'rgb(1, 1, 1)'), true);
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-f2', 'srv-f2');
  assert.ok(localId, 'a style record was registered');

  // Move selection off el (real stash path), detach it, then retry -> stored draft gets a needsRecheck placeholder.
  internals.selectTarget(other, false);
  connected = false;
  internals.retryChange(localId);
  await flushOverlayPromises();
  let draft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(draft && draft.styleEdits.color, 'a detached retry created a stored draft');
  assert.equal(!!draft.styleEdits.color.needsRecheck, true, 'detached retry marks the edit needsRecheck');

  // Element reconnects; retry again -> the fix re-processes the placeholder and clears needsRecheck.
  connected = true;
  internals.retryChange(localId);
  await flushOverlayPromises();
  draft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(draft && draft.styleEdits.color, 'the draft still exists after reconnect retry');
  assert.equal(!!draft.styleEdits.color.needsRecheck, false,
    'a reconnected retry recovers the edit — needsRecheck must clear so dispatch is no longer blocked');
});

test('[accumulate #7] retrying a record with two unmatched token intents keeps BOTH (Sol finding 3)', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/grab')) return { ok: true, json: async () => ({ element: { id: 'srv-f7', batchId: 'batch-f7', sequence: 1, state: 'sent' } }) };
      if (value.includes('/batch-commit')) return { ok: true, json: async () => ({ committed: true }) };
      if (value.includes('/batch')) return { ok: true, json: async () => ({ changes: [{ id: 'srv-f7', state: 'rejected' }] }) };
      return { ok: true, json: async () => ({ tokens: [] }) };  // retry-time selection has NO tokens -> both intents unmatched
    }
  });
  const el = document.createElement('button');
  el.localName = 'button';
  el.style = fakeStyle({ color: 'rgb(1, 1, 1)' });
  internals.setStyleContext(el, { color: 'rgb(1, 1, 1)' }, [], '#save');
  // Two token intents on ONE element, different properties.
  internals.setTokenIntent(0, { property: 'color', oldToken: 'text', oldTokenPath: 'colors.text', newToken: 'accent', newTokenPath: 'colors.accent', newTokenValue: '#336699' });
  internals.setTokenIntent(1, { property: 'background-color', oldToken: 'surface', oldTokenPath: 'colors.surface', newToken: 'raised', newTokenPath: 'colors.raised', newTokenValue: '#112233' });
  const localId = await dispatchThenRejectStyleChange(internals, clock, 'batch-f7', 'srv-f7');
  assert.ok(localId, 'a style record was registered');

  // Move selection off el so retry rebuilds a fresh stored draft with an empty-token selection.
  const other = document.createElement('div');
  other.localName = 'div';
  other.style = fakeStyle({ color: 'rgb(2, 2, 2)' });
  internals.setStyleContext(other, { color: 'rgb(2, 2, 2)' }, [], '#other');

  internals.retryChange(localId);
  await flushOverlayPromises();

  const draft = internals.localStyleDrafts().find((d) => d.target === el);
  assert.ok(draft, 'retry rebuilt a stored draft for el');
  assert.equal(Object.keys(draft.tokenIntents).length, 2,
    'both unmatched token intents survive — unique retry keys prevent collapse onto one key');
});

test('REGRESSION: standalone dispatch actually sends a layer move, not stuck forever', async () => {
  // completeStandaloneDispatch() used to build its send list from
  // activeDispatch.styleRecords ONLY, never touching activeDispatch.layerRecords
  // at all — a layer move in standalone mode registered with the dispatch but
  // was never POSTed, staying "queued"/unsent with no error and no terminal
  // state forever (reported live: "Move #mainnav — Not sent", stuck).
  const requests = [];
  const { internals, document } = await loadOverlayInternals({
    config: { mode: 'standalone', tokens: {}, grabEndpoint: null },
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-standalone-move', batchId: 'batch-standalone-move' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('nav');
  const first = document.createElement('a');
  const moved = document.createElement('a');
  parent.localName = 'nav';
  first.localName = 'a';
  first.classList = ['nav-link'];
  first.textContent = 'First';
  moved.localName = 'a';
  moved.classList = ['nav-link'];
  moved.textContent = 'Moved';
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'nav', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'a · First', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'a · Moved', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');

  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(requests.some((url) => url.includes('/layers-intent')), 'the layer move was actually POSTed in standalone mode');
  assert.equal(internals.getDispatchState(), 'applying', 'registered layer move moves the dispatch to applying, not left idle/stuck');

  parent.children = [moved, first];
  internals.handleLayerOperationResult({ id: 'op-standalone-move', state: 'applied', updatedAt: 'now' });

  assert.equal(internals.getDispatchState(), 'done', 'the standalone dispatch reaches a real terminal state once the move applies');
});

test('REGRESSION: dismiss() during an applying standalone layer dispatch does not wedge dispatchState forever', async () => {
  // dismiss() unconditionally called stopLayerOperationPoll() and never touched
  // activeDispatch/dispatchState. If a user dismissed the overlay selection
  // while a standalone layer move was still "applying" (POST resolved, 1.5s
  // poll scheduled but not yet fired), the poll was killed and nothing else
  // ever rescheduled it -- dispatchState stayed "applying" forever, so
  // dispatchPendingBatch() silently no-ops on every future attempt to send.
  const requests = [];
  const { internals, document } = await loadOverlayInternals({
    config: { mode: 'standalone', tokens: {}, grabEndpoint: null },
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-dismiss-race', batchId: 'batch-dismiss-race' }) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const parent = document.createElement('nav');
  const first = document.createElement('a');
  const moved = document.createElement('a');
  parent.localName = 'nav';
  first.localName = 'a';
  first.classList = ['nav-link'];
  moved.localName = 'a';
  moved.classList = ['nav-link'];
  document.body.children = [parent];
  parent.parentElement = document.body;
  parent.children = [first, moved];
  first.parentElement = parent;
  moved.parentElement = parent;
  parent.querySelectorAll = () => new Array(301);
  const tree = { id: 1, parentId: null, depth: 0, label: 'nav', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'a · First', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'a · Moved', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, first], [3, moved]], moved);
  internals.reorderLayer('3', '2');

  await internals.dispatchPendingBatch();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(internals.getDispatchState(), 'applying', 'dispatch is applying, poll scheduled, before the user dismisses');
  assert.equal(internals.isLayerOperationPollActive(), true, 'the 1.5s poll is live while the layer move is still applying');

  internals.dismiss();

  assert.equal(internals.getDispatchState(), 'applying', 'dismiss() does not clear/terminalize an in-flight standalone dispatch');
  assert.equal(internals.isLayerOperationPollActive(), true, 'the poll must still be scheduled after dismiss, or the dispatch is stuck forever');

  parent.children = [moved, first];
  internals.handleLayerOperationResult({ id: 'op-dismiss-race', state: 'applied', updatedAt: 'now' });
  assert.equal(internals.getDispatchState(), 'done', 'the dispatch still reaches a real terminal state after a dismiss mid-flight');
});

test('REGRESSION: "All N like this" mirrors a live style edit onto matched sibling elements', async () => {
  // previewStyleEdit/commitStyleEdit used to mutate selectedElement only —
  // component-scope edits were sent to the backend with scope:"component" but
  // the browser-tab preview never touched the other matched instances, so
  // toggling "All N like this" looked like a no-op on every element but the
  // selected one (reported live from a real "All 4 like this" nav edit).
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('a');
  const sibling = document.createElement('a');
  selected.localName = 'a';
  selected.classList = ['nav-link'];
  selected.style = fakeStyle({ 'background-color': 'rgb(1, 1, 1)' });
  selected.closest = () => null;
  sibling.localName = 'a';
  sibling.classList = ['nav-link'];
  sibling.style = fakeStyle({ 'background-color': 'rgb(1, 1, 1)' });
  sibling.closest = () => null;
  candidates = [selected, sibling];
  const componentScope = { componentName: 'NavLink', matchSelector: 'a.nav-link', matchCount: 2 };
  internals.setStyleContext(selected, { 'background-color': 'rgb(1, 1, 1)' }, [], '#mainnav a:nth-of-type(1)', {}, componentScope);
  assert.equal(internals.setEditScope('component'), true);

  internals.previewStyleEdit('background-color', 'rgb(192, 57, 43)');
  assert.equal(selected.style.getPropertyValue('background-color'), 'rgb(192, 57, 43)');
  assert.equal(sibling.style.getPropertyValue('background-color'), 'rgb(192, 57, 43)', 'preview mirrors onto the sibling live, not just the selected element');

  internals.dismiss();
  assert.equal(selected.style.getPropertyValue('background-color'), 'rgb(1, 1, 1)');
  assert.equal(sibling.style.getPropertyValue('background-color'), 'rgb(1, 1, 1)', 'dismiss restores the sibling to its original value too');
});

test('REGRESSION: "All N like this" — a sibling that newly matches mid-edit-session is still captured for rollback', async () => {
  // applyStyleToScopeSiblings used to capture each sibling's original value only
  // on the FIRST call for a given property, but re-queried the live match set on
  // every call. A sibling that starts out not matching (e.g. a class toggled on
  // later in the same edit session) and then matches on a LATER preview for the
  // same property got mutated but was never captured — dismiss/restore left it
  // stuck at the mirrored value instead of its real original.
  let candidates = [];
  const { internals } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = { localName: 'a', style: fakeStyle({ 'background-color': 'rgb(1, 1, 1)' }), closest: () => null };
  const earlySibling = { localName: 'a', style: fakeStyle({ 'background-color': 'rgb(3, 3, 3)' }), closest: () => null };
  const lateSibling = { localName: 'a', style: fakeStyle({ 'background-color': 'rgb(2, 2, 2)' }), closest: () => null };
  // earlySibling is present from the FIRST call so the old "capture originals only
  // once per property" gate actually fires and gets skipped for lateSibling below.
  candidates = [selected, earlySibling];
  const componentScope = { componentName: 'NavLink', matchSelector: 'a.nav-link', matchCount: 2 };
  internals.setStyleContext(selected, { 'background-color': 'rgb(1, 1, 1)' }, [], '#mainnav a:nth-of-type(1)', {}, componentScope);
  assert.equal(internals.setEditScope('component'), true);

  internals.previewStyleEdit('background-color', 'rgb(192, 57, 43)');
  assert.equal(selected.style.getPropertyValue('background-color'), 'rgb(192, 57, 43)');
  assert.equal(earlySibling.style.getPropertyValue('background-color'), 'rgb(192, 57, 43)');

  // lateSibling now matches the live query for the SAME property that already ran once.
  candidates = [selected, earlySibling, lateSibling];
  internals.previewStyleEdit('background-color', 'rgb(50, 60, 70)');
  assert.equal(lateSibling.style.getPropertyValue('background-color'), 'rgb(50, 60, 70)', 'newly-matched sibling is mirrored');

  internals.dismiss();
  assert.equal(selected.style.getPropertyValue('background-color'), 'rgb(1, 1, 1)');
  assert.equal(earlySibling.style.getPropertyValue('background-color'), 'rgb(3, 3, 3)');
  assert.equal(lateSibling.style.getPropertyValue('background-color'), 'rgb(2, 2, 2)', 'the late-matching sibling is restored to ITS real original, not left at the mirrored value');
});

test('REGRESSION: "All N like this" — commitStyleEdit (not just previewStyleEdit) also mirrors onto siblings, and restoreStyleEdit undoes both', async () => {
  // previewStyleEdit (live-preview tick) and commitStyleEdit (panel Enter/blur
  // commit) are separate code paths that each independently call
  // applyStyleToScopeSiblings — a fix that mirrored only the preview tick would
  // still leave the committed value desynced between selected and sibling.
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('a');
  const sibling = document.createElement('a');
  selected.localName = 'a';
  selected.classList = ['nav-link'];
  selected.style = fakeStyle({ 'background-color': 'rgb(1, 1, 1)' });
  selected.closest = () => null;
  sibling.localName = 'a';
  sibling.classList = ['nav-link'];
  sibling.style = fakeStyle({ 'background-color': 'rgb(1, 1, 1)' });
  sibling.closest = () => null;
  candidates = [selected, sibling];
  const componentScope = { componentName: 'NavLink', matchSelector: 'a.nav-link', matchCount: 2 };
  internals.setStyleContext(selected, { 'background-color': 'rgb(1, 1, 1)' }, [], '#mainnav a:nth-of-type(1)', {}, componentScope);
  assert.equal(internals.setEditScope('component'), true);

  internals.commitStyleEdit('background-color', 'rgb(9, 9, 9)', 'rgb(1, 1, 1)');
  assert.equal(selected.style.getPropertyValue('background-color'), 'rgb(9, 9, 9)');
  assert.equal(sibling.style.getPropertyValue('background-color'), 'rgb(9, 9, 9)', 'commit mirrors onto the sibling, not just preview');

  internals.restoreStyleEdit('background-color');
  assert.equal(selected.style.getPropertyValue('background-color'), 'rgb(1, 1, 1)');
  assert.equal(sibling.style.getPropertyValue('background-color'), 'rgb(1, 1, 1)', 'restoreStyleEdit undoes the sibling mirror too');
});

test('REGRESSION: "All N like this" paints multi-badges for every live match, not just the primary', async () => {
  // setEditScope used to flip editScope and re-render the panel only — canvas
  // chrome stayed on selectedElement alone (setHighlight draws one box;
  // renderMultiBadges only read multiSelections, which component scope never
  // populates). Clicking "All N like this" therefore never visually selected
  // the sibling matches even though componentScopeSiblingElements() already
  // knew the set used for style mirroring.
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('a');
  const siblingA = document.createElement('a');
  const siblingB = document.createElement('a');
  const outsider = document.createElement('span');
  [selected, siblingA, siblingB].forEach((el, index) => {
    el.localName = 'a';
    el.classList = ['nav-link'];
    el.style = fakeStyle();
    el.closest = () => null;
    el.getBoundingClientRect = () => ({
      top: 40 + index * 30, bottom: 60 + index * 30, left: 20, right: 120,
      width: 100, height: 20, x: 20, y: 40 + index * 30
    });
  });
  outsider.localName = 'span';
  outsider.closest = () => null;
  outsider.getBoundingClientRect = () => ({ top: 200, bottom: 220, left: 20, right: 80, width: 60, height: 20, x: 20, y: 200 });
  candidates = [selected, siblingA, siblingB];
  const componentScope = { componentName: 'NavLink', matchSelector: 'a.nav-link', matchCount: 3 };
  // "All N like this" is clicked inside an open panel; collapsed panels pause
  // all selection overlays, so expand before scoping.
  internals.expandPanel();
  internals.setStyleContext(selected, { color: 'rgb(0, 0, 0)' }, [], '#mainnav a:nth-of-type(1)', {}, componentScope);
  assert.equal(internals.getMultiBadgeCount(), 0, 'instance scope with a single primary has no badges');

  assert.equal(internals.setEditScope('component'), true);
  assert.equal(internals.getEditScope(), 'component');
  assert.equal(internals.getMultiBadgeCount(), 3, 'component scope badges the primary plus every live matchSelector sibling');
  assert.equal(internals.getMultiBadgeLabels().join(','), '1,2,3');
  assert.equal(internals.getMultiHighlightCount(), 2, 'component scope paints a page highlight on every sibling match (primary uses setHighlight)');
  assert.equal(internals.visualBadgeElements().length, 3);
  assert.equal(internals.visualBadgeElements()[0], selected);
  assert.equal(internals.visualBadgeElements()[1], siblingA);
  assert.equal(internals.visualBadgeElements()[2], siblingB);

  // Stale DOM mid-edit: a sibling drops out of the match set — next badge render
  // must re-query, not keep a cached N.
  candidates = [selected, siblingB];
  internals.paintSelectionOverlays();
  assert.equal(internals.getMultiBadgeCount(), 2, 'badge count tracks the live match set, not a cached sibling list');
  assert.equal(internals.getMultiHighlightCount(), 1, 'sibling highlight count tracks the live match set');
  assert.equal(internals.visualBadgeElements().length, 2);
  assert.equal(internals.visualBadgeElements()[0], selected);
  assert.equal(internals.visualBadgeElements()[1], siblingB);

  // Rare combo: real shift-click multi-grab + component scope — component visual
  // wins (match set only; outsider stays out even if multi-selected). Keep the
  // primary pinned via an unsent style edit so shift-click does not reset scope.
  candidates = [selected, siblingA, siblingB];
  internals.setIntentRecords({}, {
    color: { property: 'color', oldValue: 'rgb(0, 0, 0)', newValue: 'rgb(1, 1, 1)' }
  });
  internals.selectTarget(outsider, true, 'canvas');
  assert.equal(internals.getSelectionModel().primary, selected, 'unsent edits keep the component-scoped primary pinned');
  assert.ok(internals.getSelectionModel().order.indexOf(outsider) !== -1, 'shift-click added the outsider to multiSelections');
  assert.equal(internals.getEditScope(), 'component', 'shift-click must not drop component scope when primary is pinned');
  const componentVisual = internals.visualBadgeElements();
  assert.equal(componentVisual.length, 3, 'component-scope badges ignore non-matching multi-grab members');
  assert.equal(componentVisual[0], selected);
  assert.equal(componentVisual[1], siblingA);
  assert.equal(componentVisual[2], siblingB);
  assert.equal(componentVisual.indexOf(outsider), -1);
  assert.equal(internals.getMultiBadgeCount(), 3);
  assert.equal(internals.getMultiHighlightCount(), 2);

  assert.equal(internals.setEditScope('instance'), true);
  assert.equal(internals.getEditScope(), 'instance');
  // After instance restore, badges follow real multiSelections (primary + outsider).
  const instanceBadges = internals.visualBadgeElements();
  assert.ok(instanceBadges.indexOf(selected) !== -1, 'primary remains in instance multi-grab badges');
  assert.ok(instanceBadges.indexOf(outsider) !== -1, 'outsider reappears in instance multi-grab badges');
  assert.equal(instanceBadges.indexOf(siblingA), -1, 'component siblings were never in multiSelections');
  assert.equal(internals.getMultiHighlightCount(), 1, 'instance multi-grab paints one sibling highlight for the outsider');

  // Collapsed = paused clears secondary overlays too (Andrew, 2026-07-18); they
  // return when a panel reopens.
  internals.collapsePanel();
  internals.collapsePanel(true);
  assert.equal(internals.getMultiBadgeCount(), 0, 'collapsing both panels clears multi badges');
  assert.equal(internals.getMultiHighlightCount(), 0, 'collapsing both panels clears sibling highlights');
  internals.expandPanel();
  assert.ok(internals.getMultiBadgeCount() > 0, 'reopening a panel repaints the selection badges');
});

test('REGRESSION: "All N like this" marks every matching layer row data-selected', async () => {
  // selectionHasElement only read multiSelections, so component scope painted
  // canvas badges for all N matches but the Layers list kept a single
  // data-selected row (the primary). Membership must follow visualBadgeElements.
  let candidates = [];
  const { internals, document } = await loadOverlayInternals({ querySelectorAll: () => candidates });
  const selected = document.createElement('a');
  const siblingA = document.createElement('a');
  const siblingB = document.createElement('a');
  [selected, siblingA, siblingB].forEach((el) => {
    el.localName = 'a';
    el.classList = ['nav-link'];
    el.style = fakeStyle();
    el.closest = () => null;
    el.getBoundingClientRect = () => ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0 });
  });
  candidates = [selected, siblingA, siblingB];
  const tree = {
    id: 1, parentId: null, depth: 0, label: 'nav', badges: [], children: [
      { id: 2, parentId: 1, depth: 1, label: 'a · Home', badges: [], children: [] },
      { id: 3, parentId: 1, depth: 1, label: 'a · Work', badges: [], children: [] },
      { id: 4, parentId: 1, depth: 1, label: 'a · About', badges: [], children: [] }
    ]
  };
  internals.setLayerTestState(tree, [[1, document.body], [2, selected], [3, siblingA], [4, siblingB]], selected);
  internals.setStyleContext(selected, { color: 'rgb(0, 0, 0)' }, [], '#mainnav a:nth-of-type(1)', {}, {
    componentName: 'NavLink', matchSelector: 'a.nav-link', matchCount: 3
  });

  let markup = internals.layerRowsMarkup(tree);
  assert.match(markup, /data-layer-id="2"[^>]*data-selected="true"/);
  assert.doesNotMatch(markup, /data-layer-id="3"[^>]*data-selected="true"/, 'instance scope selects primary only');
  assert.doesNotMatch(markup, /data-layer-id="4"[^>]*data-selected="true"/);

  assert.equal(internals.setEditScope('component'), true);
  markup = internals.layerRowsMarkup(tree);
  for (const id of [2, 3, 4]) {
    assert.match(markup, new RegExp('data-layer-id="' + id + '"[^>]*data-selected="true"'), 'component scope selects every live match row');
  }
  assert.match(markup, /data-layer-id="2"[^>]*data-primary="true"/);
  assert.doesNotMatch(markup, /data-layer-id="3"[^>]*data-primary="true"/);

  assert.equal(internals.setEditScope('instance'), true);
  markup = internals.layerRowsMarkup(tree);
  assert.match(markup, /data-layer-id="2"[^>]*data-selected="true"/);
  assert.doesNotMatch(markup, /data-layer-id="3"[^>]*data-selected="true"/, 'instance restores primary-only layer selection');
});

test('REGRESSION: Structure footer renders the platform shortcut and configured project name, with the legacy entry removed', async () => {
  const { internals } = await loadOverlayInternals({
    config: { mode: 'standalone', tokens: {}, bridgeOrigin: 'http://127.0.0.1:41234', projectName: 'Raven Workspace', ravenVersion: '1.17.0' }
  });
  internals.renderPanel();
  const left = internals.getPanelLeftHtml();
  assert.match(left, /data-tab="layers"[^>]*aria-selected="true"/);
  assert.match(left, /raven-grab-layer-list/);
  assert.match(left, /raven-grab-structure-footer[\s\S]*data-settings-open(?:\s|>)/);
  assert.match(left, /<kbd aria-hidden="true">(?:⌘K|Ctrl K)<\/kbd>/);
  assert.match(left, /Raven Workspace/);
  assert.match(left, /aria-label="Open Raven settings for Raven Workspace"/);
  assert.doesNotMatch(left, /data-structure-settings|raven-grab-settings-entry|>Settings<\/span>/);
  const contentOnly = left.match(/raven-grab-content">([\s\S]*?)<\/div>\s*<div class="raven-grab-actions"/);
  assert.ok(contentOnly, 'structure content and actions regions must be separable');
  assert.doesNotMatch(contentOnly[1], /data-settings-open/, 'shortcut must stay pinned outside the scrollable layer tree');

  const unnamed = await loadOverlayInternals({ config: { mode: 'standalone', tokens: {} } });
  unnamed.internals.renderPanel();
  const unnamedLeft = unnamed.internals.getPanelLeftHtml();
  assert.match(unnamedLeft, /<kbd aria-hidden="true">(?:⌘K|Ctrl K)<\/kbd>/);
  assert.doesNotMatch(unnamedLeft, /raven-grab-settings-project|undefined|Unknown project/);
});

test('REGRESSION: settings modal opens from footer and command shortcut, toggles on the chord, and closes on Escape', async () => {
  const { internals, document } = await loadOverlayInternals({
    config: { mode: 'standalone', tokens: {}, projectName: 'Raven Workspace' }
  });
  internals.renderPanel();
  const trigger = { isConnected: true, focused: false, focus() { this.focused = true; }, closest(selector) { return selector === '[data-settings-open]' ? this : null; } };
  internals.dispatchPanelLeft('click', { target: trigger, stopPropagation() {} });
  assert.equal(internals.getSettingsModalOpen(), true);
  assert.equal(internals.getSettingsModalHidden(), false);
  document.dispatch('keydown', { key: 'Escape', code: 'Escape', preventDefault() {}, stopImmediatePropagation() {}, composedPath() { return []; } });
  assert.equal(internals.getSettingsModalOpen(), false);
  assert.equal(internals.getSettingsModalHidden(), true);
  assert.equal(trigger.focused, true, 'close returns focus to the footer shortcut');

  // Cmd/Ctrl+K belongs to the host page unless focus is already inside Raven.
  // Linear, Slack and Notion all bind this chord, and the overlay is injected into
  // other people's dev servers -- capturing it globally steals their shortcut.
  const hostTarget = { nodeType: 1, tagName: 'DIV' };
  const chordFrom = (target) => ({
    key: 'k', code: 'KeyK', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
    repeat: false, target, preventDefault() {}, stopImmediatePropagation() {},
    composedPath() { return [target]; }
  });

  document.dispatch('keydown', chordFrom(hostTarget));
  assert.equal(internals.getSettingsModalOpen(), false, 'the host page keeps Cmd/Ctrl+K when focus is outside Raven');

  const hostInput = { nodeType: 1, tagName: 'INPUT', isContentEditable: false };
  document.dispatch('keydown', chordFrom(hostInput));
  assert.equal(internals.getSettingsModalOpen(), false, 'host typing keeps ownership of Cmd/Ctrl+K');

  // From inside the overlay the chord is ours, and it toggles.
  const insideRaven = internals.getSettingsModalNode();
  assert.ok(insideRaven, 'the modal node is reachable for the inside-Raven case');
  // The fake DOM has no real Node.contains(); stub what a real element returns for
  // itself and its descendants, which is what the chord guard reads.
  insideRaven.contains = (node) => node === insideRaven;
  document.dispatch('keydown', chordFrom(insideRaven));
  assert.equal(internals.getSettingsModalOpen(), true, 'the chord works when focus is inside Raven');
  document.dispatch('keydown', chordFrom(insideRaven));
  assert.equal(internals.getSettingsModalOpen(), false, 'the documented chord is a toggle');
});

test('REGRESSION: feedback submit POSTs the documented context and preserves the message when routing is unavailable', async () => {
  const requests = [];
  const { internals } = await loadOverlayInternals({
    config: { mode: 'standalone', tokens: {}, bridgeOrigin: 'http://127.0.0.1:41234', projectName: 'Raven Workspace', ravenVersion: '1.17.0' },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ ok: true, delivered: false, reason: 'not configured' }) };
    }
  });
  const message = { value: 'The layer label is clipped.', focus() {} };
  const email = { value: 'builder@example.test' };
  const status = { textContent: '', setAttribute() {}, removeAttribute() {} };
  const send = { disabled: false };
  const includePage = { checked: false };
  const form = {
    querySelector(selector) {
      if (selector === 'textarea[name="message"]') return message;
      if (selector === 'input[name="email"]') return email;
      if (selector === '[data-feedback-status]') return status;
      if (selector === 'button[type="submit"]') return send;
      if (selector === '[data-feedback-include-page]') return includePage;
      return null;
    }
  };
  assert.equal(await internals.submitFeedback(form), false);
  assert.equal(requests.length, 1);
  // Never the bridgeOrigin, even though one is configured: routing feedback through
  // the local bridge posted the message and email to the user's own dev server.
  assert.equal(requests[0].url, 'https://ravenmcp.ai/api/feedback');
  // The consent box is unticked, so nothing that names the user's page may be in the body.
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    v: 1,
    message: 'The layer label is clipped.',
    email: 'builder@example.test',
    viewport: { w: 1440, h: 900 },
    ravenVersion: '1.17.0'
  });
  includePage.checked = true;
  send.disabled = false;
  await internals.submitFeedback(form);
  const consented = JSON.parse(requests[1].options.body);
  assert.equal(consented.page, 'http://example.test/page');
  assert.equal(consented.projectName, 'Raven Workspace');
  assert.equal(status.textContent, 'Recorded, but not yet routed.');
  assert.equal(message.value, 'The layer label is clipped.', 'an unrouted message stays in the field');
});

test('REGRESSION: panel text size remains the single modal control and scales chrome fonts via the shared CSS variable', async () => {
  const { internals } = await loadOverlayInternals({ config: { mode: 'standalone', tokens: {} } });
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  assert.match(internals.getSettingsModalHtml(), /data-settings-pane="settings"[\s\S]*Panel text size/);
  assert.equal((source.match(/id="raven-grab-panel-font"/g) || []).length, 1, 'text-size control has one owner');
  assert.match(source, /--raven-grab-font-scale/);
  assert.match(source, /calc\(12px \* var\(--raven-grab-font-scale\)\)/);
  assert.equal(internals.getPanelFontSize(), 100);
  assert.equal(internals.setPanelFontSize(107), true);
  assert.equal(internals.getPanelFontSize(), 110);
  assert.equal(internals.setPanelFontSize(200), true);
  assert.equal(internals.getPanelFontSize(), 140);
  assert.equal(internals.setPanelFontSize(50), true);
  assert.equal(internals.getPanelFontSize(), 80);
  assert.doesNotMatch(source, /structureSettingsOpen|data-structure-settings|data-structure-settings-panel|data-structure-settings-close|settingsGearSvg|raven-grab-settings-entry/);
});

test('REGRESSION: opening the native color picker does not close the style-value color editor', async () => {
  // Clicking the swatch focuses colorInput, which blurs the previously-focused
  // text `input` with relatedTarget === colorInput. If colorInput isn't
  // whitelisted in relatedInternal, handleBlur treated that as "clicked
  // elsewhere" and committed/closed the editor before a color could be picked
  // (reported live: clicking the picker made it disappear instead of opening).
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(17, 34, 51)' }) };
  internals.setStyleContext(element, { color: 'rgb(17, 34, 51)' }, [], '.thing');
  const colorRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const colorCell = document.createElement('code');
  colorCell.textContent = 'rgb(17, 34, 51)';
  colorCell.parentElement = colorRow;
  colorCell.parentNode = colorRow;
  internals.beginStyleEdit(colorCell);
  const editor = colorRow.child;
  const textInput = editor.children.find((child) => child.type === 'text' && child.getAttribute('spellcheck') === 'false');
  const colorInput = editor.children.find((child) => child.type === 'color');
  assert.ok(textInput && colorInput, 'editor renders both the text field and the native color swatch');

  // Simulate dragging inside the native panel: previews live, editor stays open.
  colorInput.value = '#abcdef';
  colorInput.dispatch('input', {});
  assert.equal(element.style.getPropertyValue('color'), '#abcdef');
  assert.equal(internals.hasActiveStyleEditor(), true, 'a preview tick must not close the editor');

  // Opening the panel blurs the text input with relatedTarget === colorInput —
  // must NOT commit/close the editor.
  textInput.dispatch('blur', { relatedTarget: colorInput });
  assert.equal(internals.hasActiveStyleEditor(), true, 'blur onto the color swatch must not close the editor');
  assert.equal(colorRow.child, editor, 'the editor must still be mounted, not replaced by a static value cell');

  // Dismissing the native panel fires change — that's the real commit signal.
  colorInput.dispatch('change', {});
  assert.equal(internals.hasActiveStyleEditor(), false, 'change (panel dismissed) commits and closes the editor');
  assert.equal(element.style.getPropertyValue('color'), '#abcdef');
  assert.equal(internals.styleEditsForSend().find((edit) => edit.property === 'color').newValue, '#abcdef');
});

test('reparentLayer drafts a cross-parent move and sendLayerIntent emits operation reparent', async () => {
  const { internals, document } = await loadOverlayInternals();
  const body = document.body;
  body.localName = 'body';
  const hero = document.createElement('section');
  const nav = document.createElement('nav');
  const card = document.createElement('div');
  const link = document.createElement('a');
  hero.localName = 'section';
  hero.id = 'hero';
  nav.localName = 'nav';
  nav.id = 'mainnav';
  card.localName = 'div';
  card.classList = ['card'];
  link.localName = 'a';
  body.children = [hero, nav];
  hero.parentElement = body;
  nav.parentElement = body;
  hero.children = [card];
  card.parentElement = hero;
  nav.children = [link];
  link.parentElement = nav;
  // Force unavailable preview (same pattern as reorder tests) so the fake DOM
  // does not need a full getComputedStyle/cloneNode measurement path.
  hero.querySelectorAll = () => new Array(301);
  nav.querySelectorAll = () => new Array(301);
  body.querySelectorAll = () => [];
  const tree = {
    id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
      { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
        { id: 3, parentId: 2, depth: 2, label: 'div', badges: [], children: [] }
      ] },
      { id: 4, parentId: 1, depth: 1, label: 'nav', badges: [], children: [
        { id: 5, parentId: 4, depth: 2, label: 'a', badges: [], children: [] }
      ] }
    ]
  };
  internals.setLayerTestState(tree, [[1, body], [2, hero], [3, card], [4, nav], [5, link]], card);
  // Force unavailable preview after setLayerTestState (same pattern as reorder tests).
  nav.querySelectorAll = () => new Array(301);
  hero.querySelectorAll = () => new Array(301);
  assert.equal(typeof internals.reparentLayer, 'function');
  internals.reparentLayer('3', '4', 0);
  const draft = internals.getLayerOrderDraft();
  assert.ok(draft, 'reparent creates an active layer draft');
  assert.equal(draft.operation, 'reparent');
  assert.equal(draft.fromIndex, 0);
  assert.equal(draft.toIndex, 0);
  assert.equal(draft.movedElement, card);
  assert.equal(draft.fromParentElement, hero);
  assert.equal(draft.toParentElement, nav);
  assert.equal(draft.parentElement, nav, 'destination parent is the draft parentElement for preview chrome');
  assert.ok(Array.isArray(draft.expectedChildren) && draft.expectedChildren[0] === card);
  assert.deepEqual(Array.from(tree.children[1].children, (node) => node.id), [3, 5], 'reparent teleports the moved node into the destination parent');
  assert.deepEqual(Array.from(tree.children[0].children, (node) => node.id), [], 'source parent loses the moved node while pending');
  const teleportMarkup = internals.layerRowsMarkup(tree);
  assert.match(teleportMarkup, /data-layer-id="3"[^>]*data-layer-pending="true"[\s\S]*Move pending/);

  const prepared = internals.sendLayerIntent(draft);
  assert.ok(prepared && prepared.body, 'sendLayerIntent prepares a reparent body');
  assert.equal(prepared.body.operation, 'reparent');
  assert.equal(prepared.body.fromParentSelector, draft.fromParentSelector);
  assert.equal(prepared.body.toParentSelector, draft.toParentSelector);
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.body, 'parentSelector')
    || prepared.body.parentSelector === undefined, 'reparent payload must not use reorder parentSelector');
  assert.equal(prepared.body.toIndex, 0);
  assert.ok(prepared.body.orderedSelectors.length >= 1);
});

test('reparentLayer rejects cycles, same-parent, and shadow/iframe boundaries', async () => {
  const { internals, document } = await loadOverlayInternals();
  const body = document.body;
  const parent = document.createElement('section');
  const child = document.createElement('article');
  const grand = document.createElement('div');
  const shadowHost = document.createElement('div');
  parent.localName = 'section';
  child.localName = 'article';
  grand.localName = 'div';
  shadowHost.localName = 'div';
  body.children = [parent];
  parent.parentElement = body;
  parent.children = [child];
  child.parentElement = parent;
  child.children = [grand];
  grand.parentElement = child;
  parent.querySelectorAll = () => [];
  child.querySelectorAll = () => [];
  const tree = {
    id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
      { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
        { id: 3, parentId: 2, depth: 2, label: 'article', badges: [], children: [
          { id: 4, parentId: 3, depth: 3, label: 'div', badges: [], children: [] }
        ] },
        { id: 5, parentId: 2, depth: 2, label: 'div', badges: ['#shadow'], children: [] }
      ] }
    ]
  };
  internals.setLayerTestState(tree, [[1, body], [2, parent], [3, child], [4, grand], [5, shadowHost]], child);

  internals.reparentLayer('2', '4', 0);
  assert.equal(internals.getLayerOrderDraft(), null, 'cannot move an ancestor into its descendant');
  assert.match(internals.getLayerNotice(), /own subtree/i);

  internals.setLayerNoticeTestState('');
  internals.reparentLayer('3', '2', 0);
  assert.equal(internals.getLayerOrderDraft(), null, 'same-parent must stay on reorder path');
  assert.match(internals.getLayerNotice(), /same-parent/i);

  internals.setLayerNoticeTestState('');
  internals.reparentLayer('3', '5', 0);
  assert.equal(internals.getLayerOrderDraft(), null, 'shadow hosts are out of scope');
  assert.match(internals.getLayerNotice(), /Shadow and iframe/i);
});

test('resolveLayerReparentDrop nests into containers only and ignores same-parent hits', async () => {
  const { internals, document } = await loadOverlayInternals();
  const body = document.body;
  const hero = document.createElement('section');
  const nav = document.createElement('nav');
  const card = document.createElement('div');
  const link = document.createElement('a');
  hero.localName = 'section';
  nav.localName = 'nav';
  card.localName = 'div';
  link.localName = 'a';
  body.children = [hero, nav];
  hero.parentElement = body;
  nav.parentElement = body;
  hero.children = [card];
  card.parentElement = hero;
  nav.children = [link];
  link.parentElement = nav;
  const tree = {
    id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
      { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
        { id: 3, parentId: 2, depth: 2, label: 'div', badges: [], children: [] }
      ] },
      { id: 4, parentId: 1, depth: 1, label: 'nav', badges: [], children: [
        { id: 5, parentId: 4, depth: 2, label: 'a', badges: [], children: [] }
      ] }
    ]
  };
  internals.setLayerTestState(tree, [[1, body], [2, hero], [3, card], [4, nav], [5, link]], card);
  internals.setArmed(true);
  internals.switchTab('layers');
  internals.renderPanel();

  const makeRow = (id, parentId, depth, top) => {
    const row = document.createElement('li');
    row.className = 'raven-grab-layer-row';
    row.classList = { contains(name) { return name === 'raven-grab-layer-row'; } };
    row.setAttribute('data-layer-id', String(id));
    row.setAttribute('data-layer-parent', parentId == null ? '' : String(parentId));
    row.style.setProperty('--layer-depth', String(depth));
    row.getBoundingClientRect = () => ({ top, bottom: top + 30, height: 30, left: 0, right: 200, width: 200 });
    row.nextElementSibling = null;
    row.previousElementSibling = null;
    return row;
  };
  const rowHero = makeRow(2, 1, 1, 100);
  const rowCard = makeRow(3, 2, 2, 130);
  const rowNav = makeRow(4, 1, 1, 200);
  const rowLink = makeRow(5, 4, 2, 230);
  rowHero.nextElementSibling = rowCard;
  rowCard.previousElementSibling = rowHero;
  rowCard.nextElementSibling = rowNav;
  rowNav.previousElementSibling = rowCard;
  rowNav.nextElementSibling = rowLink;
  rowLink.previousElementSibling = rowNav;
  const rows = [rowHero, rowCard, rowNav, rowLink];
  internals.setPanelLeftQueryAll('.raven-grab-layer-row[data-layer-id]', rows);
  internals.setPanelLeftQuery('.raven-grab-layer-list', {
    querySelectorAll() { return rows; }
  });

  const drag = { row: rowCard, block: [rowCard], reparentTarget: null };
  // Same parent (sibling under hero): should be null so reorder owns it.
  assert.equal(internals.resolveLayerReparentDrop(drag, 115), null, 'same-parent hero hit stays reorder');
  // Cross-parent sibling under nav (upper half of link): insert before link under nav.
  const siblingDrop = internals.resolveLayerReparentDrop(drag, 240);
  assert.ok(siblingDrop, 'cross-parent sibling drop resolves');
  assert.equal(siblingDrop.toParentId, 4);
  assert.equal(siblingDrop.toIndex, 0);
  // Nest into nav container on lower half of nav row.
  const nestDrop = internals.resolveLayerReparentDrop(drag, 220);
  assert.ok(nestDrop, 'container lower-half nests');
  assert.equal(nestDrop.toParentId, 4);
  assert.equal(nestDrop.toIndex, 1);
});

test('REGRESSION: reparent draft stays valid across refreshAppliedLayerTree when both parents are unchanged', async () => {
  // refreshAppliedLayerTree used to compare parentElement (destination) against
  // baselineChildren (source siblings) for every draft — reparent drafts always
  // failed that check and flipped to needs-recheck before Send.
  const { internals, document } = await loadOverlayInternals();
  const body = document.body;
  const hero = document.createElement('section');
  const nav = document.createElement('nav');
  const card = document.createElement('div');
  const link = document.createElement('a');
  hero.localName = 'section';
  nav.localName = 'nav';
  card.localName = 'div';
  link.localName = 'a';
  body.children = [hero, nav];
  hero.parentElement = body;
  nav.parentElement = body;
  hero.children = [card];
  card.parentElement = hero;
  nav.children = [link];
  link.parentElement = nav;
  nav.querySelectorAll = () => new Array(301);
  hero.querySelectorAll = () => new Array(301);
  const tree = {
    id: 1, parentId: null, depth: 0, label: 'body', badges: [], children: [
      { id: 2, parentId: 1, depth: 1, label: 'section', badges: [], children: [
        { id: 3, parentId: 2, depth: 2, label: 'div', badges: [], children: [] }
      ] },
      { id: 4, parentId: 1, depth: 1, label: 'nav', badges: [], children: [
        { id: 5, parentId: 4, depth: 2, label: 'a', badges: [], children: [] }
      ] }
    ]
  };
  internals.setLayerTestState(tree, [[1, body], [2, hero], [3, card], [4, nav], [5, link]], card);
  internals.reparentLayer('3', '4', 0);
  const draft = internals.getLayerOrderDraft();
  assert.equal(draft.operation, 'reparent');
  assert.equal(draft.state, 'draft');
  assert.equal(internals.liveLayerDraftParentsMatch(draft), true);

  // Simulate the poll refresh path: rebuild tree while draft is live.
  // Keep child arrays identical so the dual-parent match still holds.
  hero.children = [card];
  nav.children = [link];
  internals.refreshAppliedLayerTree();
  const after = internals.getLayerOrderDraft();
  assert.ok(after, 'draft survives refresh');
  assert.equal(after.state, 'draft', 'unchanged parents must not flip reparent to needs-recheck');
  assert.equal(internals.liveLayerDraftParentsMatch(after), true);
});

// Andrew, 2026-07-19: the send button must never shrink -- not to the 12px dot, not to a
// 44px circle, not to a max-content pill sized to the sent message -- and must not glow on
// hover. Both were live regressions in the morph sequence; this pins the CSS that fixed them.
test('send button holds one size through every state and does not glow on hover', async () => {
  const overlay = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');

  // Match only rules whose whole selector list is send-button state selectors -- collapse and
  // dot share one block, and descendant rules (.raven-grab-send-label) have no geometry to pin.
  const stateRules = [...overlay.matchAll(
    /((?:\.raven-grab-send\[data-send-state="(?:collapse|dot|trace|sent)"\]\s*,\s*)*\.raven-grab-send\[data-send-state="(?:collapse|dot|trace|sent)"\])\s*\{([^}]*)\}/g
  )].map(([, selector, body]) => [
    [...selector.matchAll(/data-send-state="(\w+)"/g)].map((m) => m[1]).join('+'),
    body,
  ]);
  const states = new Set(stateRules.flatMap(([names]) => names.split('+')));
  assert.ok(states.has('collapse') && states.has('dot') && states.has('trace') && states.has('sent'),
    `expected all four morph states to be styled, saw ${[...states].join(',')}`);

  // No state rule may set a geometry other than the resting pill. A rule with no width at all
  // (the reduced-motion override) is fine -- it inherits, and nothing upstream shrinks.
  const sized = new Set();
  for (const [state, body] of stateRules) {
    const width = /(?:^|;)\s*width\s*:\s*([^;]+)/.exec(body);
    const height = /(?:^|;)\s*height\s*:\s*([^;]+)/.exec(body);
    if (width) {
      assert.equal(width[1].trim(), '100%', `${state} shrinks the send button to ${width[1].trim()}`);
      state.split('+').forEach((s) => sized.add(s));
    }
    if (height) {
      assert.equal(height[1].trim(), '44px', `${state} changes the send button height to ${height[1].trim()}`);
    }
  }
  for (const state of ['collapse', 'dot', 'trace', 'sent']) {
    assert.ok(sized.has(state), `${state} must pin width:100% so it cannot inherit a shrink`);
  }

  const hover = /\.raven-grab-send\[data-send-state="default"\]:hover\s*\{([^}]*)\}/.exec(overlay);
  assert.ok(hover, 'default hover rule should exist');
  assert.ok(!/box-shadow/.test(hover[1]), `hover must not add a glow, saw: ${hover[1].trim()}`);
});

// Andrew's loop, 2026-07-19: with only the Layers panel open, clicking an element on the
// page produced a badge and a highlight and nothing else -- the properties panel stayed
// collapsed offscreen, so tokens/styles/send had nowhere to appear. openPanel() re-applied
// collapsedSides verbatim ("never force-expand"), which cannot tell a panel the user closed
// from one they have simply never opened.
test('selecting an element opens a never-closed properties panel, but respects a deliberate close', async () => {
  const { internals, document } = await loadOverlayInternals();

  // Cold open is expanded now; collapse to reach the paused state this test is about.
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  internals.setPanelCollapsedTestState('left', true);
  internals.setPanelCollapsedTestState('right', true);
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getLeftPanelAttribute('data-collapsed'), 'true');

  // Engage grab by opening Layers only -- the exact state the bug lived in.
  internals.setPanelCollapsedTestState('left', false);
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');

  const target = document.createElement('h2');
  target.localName = 'h2';
  target.closest = () => null;
  target.style = fakeStyle();
  internals.selectTarget(target, false, 'canvas');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false',
    'a selection must open the properties panel it has nowhere else to render into');

  // Closing properties by hand is a preference, and later selections must honour it.
  internals.collapsePanel(false);
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  const second = document.createElement('p');
  second.localName = 'p';
  second.closest = () => null;
  second.style = fakeStyle();
  internals.selectTarget(second, false, 'canvas');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true',
    'a deliberately closed properties panel must stay closed on the next selection');

  // Reopening it retracts the dismissal, so selections follow it again.
  internals.setPanelCollapsedTestState('right', false);
  internals.collapsePanel(false);
  internals.setPanelCollapsedTestState('right', false);
  const third = document.createElement('span');
  third.localName = 'span';
  third.closest = () => null;
  third.style = fakeStyle();
  internals.selectTarget(third, false, 'canvas');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
});

test('start_grab_session succeeds with only proxy_target set and no path, using an auto-created temp DESIGN.md', async () => {
  await withClient(indexMod.buildServer({}), async (client) => {
    try {
      const started = await client.callTool({
        name: 'start_grab_session',
        arguments: { proxy_target: 'http://127.0.0.1:9' }
      });
      assert.equal(started.isError, undefined, `expected success, got: ${started.content && started.content[0] && started.content[0].text}`);
      const session = JSON.parse(started.content[0].text);
      assert.equal(typeof session.path, 'string');
      assert.ok(session.path.length > 0, 'session.path should be populated with the auto-created temp DESIGN.md path');
      assert.match(session.path, /raven-grab-design-.*\.md$/);
    } finally {
      await client.callTool({ name: 'stop_grab_session', arguments: {} });
    }
  });
});


test('start_grab_session rejects when both path and proxy_target are omitted', async () => {
  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({
      name: 'start_grab_session',
      arguments: {}
    });
    if (!started.isError) {
      await client.callTool({ name: 'stop_grab_session', arguments: {} });
    }
    assert.equal(started.isError, true);
    assert.match(started.content[0].text, /path.*proxy_target|proxy_target.*path/i);
  });
});

test('drain frees grab queue capacity so later sends succeed after filling the cap', async () => {
  const grabMod = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-cap-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, `---\ncolors:\n  primary: "#111111"\n---\n# Cap fixture\n`, 'utf8');

  try {
    await grabMod.startGrabSession(designPath);
    for (let i = 0; i < 200; i++) {
      grabMod.queueGrabSelection({
        selector: `#el-${i}`,
        html: `<div id="el-${i}">x</div>`,
        rect: { x: 0, y: 0, w: 10, h: 10 },
        instruction: `change ${i}`
      });
    }
    await assert.rejects(
      async () => grabMod.queueGrabSelection({
        selector: '#overflow',
        html: '<div id="overflow">x</div>',
        rect: { x: 0, y: 0, w: 10, h: 10 },
        instruction: 'overflow'
      }),
      /queue is full/i
    );
    const drained = await grabMod.getGrabbedElements();
    assert.equal(drained.count, 200);
    // After drain, capacity must free — this was the regression from mark-only drain.
    const after = grabMod.queueGrabSelection({
      selector: '#after-drain',
      html: '<div id="after-drain">x</div>',
      rect: { x: 0, y: 0, w: 10, h: 10 },
      instruction: 'after drain'
    });
    assert.equal(after.selector, '#after-drain');
  } finally {
    await grabMod.stopGrabSession();
  }
});

test('[scroll fix] document wheel listener drives the panel scroller on the main thread and contains page scroll under panels', async () => {
  // Real trackpad wheels are hit-tested on the compositor thread, which misses the
  // pointer-events:none host's auto descendants — the blocking document listener is the
  // deterministic main-thread fallback. Revert the listener and every assertion here dies.
  const { internals, document } = await loadOverlayInternals();
  const scroller = { tagName: 'DIV', classList: { contains: (n) => n === 'raven-grab-body' }, scrollHeight: 500, clientHeight: 200, scrollTop: 0 };
  const panel = { tagName: 'DIV', classList: { contains: (n) => n === 'raven-grab-panel' } };
  const pageEl = { tagName: 'DIV', classList: { contains: () => false } };
  let prevented = false;
  let stopped = false;
  const wheel = (path, deltaY, opts = {}) => {
    prevented = false;
    stopped = false;
    document.dispatch('wheel', {
      deltaY,
      deltaMode: opts.deltaMode || 0,
      metaKey: opts.metaKey === true,
      ctrlKey: opts.ctrlKey === true,
      composedPath() { return path; },
      preventDefault() { prevented = true; },
      // Smooth-scroll libraries (Lenis) read deltas from their own listener and
      // scrollTo() the page — swallowed wheels must stop propagation to starve them.
      stopImmediatePropagation() { stopped = true; }
    });
  };

  // Over the scroller: the body scrolls and the page never does — propagation
  // stops too, so a Lenis-style library never sees the delta.
  wheel([scroller, panel], 120);
  assert.equal(scroller.scrollTop, 120);
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  // deltaMode 1 (line mode) scales by 16.
  wheel([scroller, panel], 2, { deltaMode: 1 });
  assert.equal(scroller.scrollTop, 152);

  // Over the panel header (no scroller in path): contained — nothing moves, page blocked.
  wheel([panel], 120);
  assert.equal(prevented, true);

  // Over the page while panels are open: plain scroll is swallowed — the canvas
  // must not drift out from under the work (Andrew, 2026-07-23).
  wheel([pageEl], 120);
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  // Cmd/Ctrl+scroll deliberately pans the page — propagation must survive so the
  // host page's own scroll machinery (native or Lenis) receives it.
  wheel([pageEl], 120, { metaKey: true });
  assert.equal(prevented, false);
  assert.equal(stopped, false);
  wheel([pageEl], 120, { ctrlKey: true });
  assert.equal(prevented, false);
  assert.equal(stopped, false);

  // With both panels collapsed the page behaves completely normally.
  internals.setPanelCollapsedTestState('left', true);
  internals.setPanelCollapsedTestState('right', true);
  wheel([pageEl], 120);
  assert.equal(prevented, false);
  internals.setPanelCollapsedTestState('left', false);
  internals.setPanelCollapsedTestState('right', false);

  // An overflowing composer textarea inside the panel keeps its native internal scroll.
  const textarea = { tagName: 'TEXTAREA', classList: { contains: () => false }, scrollHeight: 300, clientHeight: 100, scrollTop: 0 };
  wheel([textarea, scroller, panel], 50);
  assert.equal(prevented, false);
  assert.equal(scroller.scrollTop, 152);
});

test('[scroll fix] panel scroller stays compositor-clean: no mask on the body, no backdrop-filter on the panel', async () => {
  // Masking the scrolling contents (and layerizing the panel with a backdrop-filter
  // that was invisible over its opaque background) corrupted compositor scroll
  // hit-test data — real trackpad wheels latched the page underneath the panel
  // while synthetic wheels worked fine. The fade is a sticky ::after overlay now.
  const overlayPath = process.env.RAVEN_GRAB_TEST_OVERLAY || path.resolve(__dirname, '../browser/raven-grab.js');
  const src = await readFile(overlayPath, 'utf8');
  const bodyRule = src.match(/\.raven-grab-body \{[^}]*\}/)[0];
  assert.ok(!/mask-image/.test(bodyRule), 'no mask on the scrolling body');
  assert.ok(src.includes('.raven-grab-body::after'), 'sticky fade overlay replaces the mask');
  const panelRule = src.match(/\.raven-grab-panel \{[\s\S]*?\n    \}/)[0];
  assert.ok(!/backdrop-filter\s*:/.test(panelRule), 'no backdrop-filter declaration on the panel');
});

test('[live-move preview] reorder applies immediately and keeps the draft valid', async () => {
  const { internals, document } = await loadOverlayInternals();
  const { elements } = makeLayerDragFixture(internals, document);
  const parent = elements[0].parentElement;
  enableLiveMovePreviewFixture(document, parent);

  internals.reorderLayer('4', '2');
  const draft = internals.getLayerOrderDraft();

  assert.ok(draft, 'reorder creates a draft');
  assert.deepEqual(parent.children, draft.expectedChildren, 'live DOM order must match the proposal immediately');
  assert.equal(draft.livePreviewApplied, true);
  assert.equal(internals.validLayerDraft(draft), true);
  assert.equal(internals.batchUiState().enabled, true, 'Send stays enabled for a previewed valid draft');
});

test('[live-move preview] removeChange restores reorder baseline and clears the preview flag', async () => {
  const { internals, document } = await loadOverlayInternals();
  const { elements } = makeLayerDragFixture(internals, document);
  const parent = elements[0].parentElement;
  const baseline = parent.children.slice();
  enableLiveMovePreviewFixture(document, parent);

  internals.reorderLayer('4', '2');
  const draft = internals.getLayerOrderDraft();
  assert.equal(draft.livePreviewApplied, true, 'precondition: preview was applied');

  internals.removeChange(draft.clientKey);

  assert.deepEqual(parent.children, baseline);
  assert.equal(draft.livePreviewApplied, false);
  assert.equal(internals.getLayerOrderDraft(), null);
});

test('[live-move preview] dismiss restores reorder baseline', async () => {
  const { internals, document } = await loadOverlayInternals();
  const { elements } = makeLayerDragFixture(internals, document);
  const parent = elements[0].parentElement;
  const baseline = parent.children.slice();
  enableLiveMovePreviewFixture(document, parent);

  internals.reorderLayer('4', '2');
  const draft = internals.getLayerOrderDraft();
  assert.equal(draft.livePreviewApplied, true, 'precondition: preview was applied');

  internals.dismiss();

  assert.deepEqual(parent.children, baseline);
  assert.equal(draft.livePreviewApplied, false);
});

test('[live-move preview] reparent moves across parents and discard restores both baselines', async () => {
  const { internals, document } = await loadOverlayInternals();
  const { elements } = makeNestedLayerFixture(internals, document);
  const sourceParent = elements.section;
  const targetParent = elements.footer;
  const sourceBaseline = sourceParent.children.slice();
  const targetBaseline = targetParent.children.slice();
  enableLiveMovePreviewFixture(document, sourceParent, targetParent);

  internals.reparentLayer('3', '6', 0);
  const draft = internals.getLayerOrderDraft();

  assert.equal(draft.livePreviewApplied, true);
  assert.deepEqual(sourceParent.children, [elements.aside]);
  assert.deepEqual(targetParent.children, [elements.article]);

  internals.removeChange(draft.clientKey);

  assert.deepEqual(sourceParent.children, sourceBaseline);
  assert.deepEqual(targetParent.children, targetBaseline);
  assert.equal(draft.livePreviewApplied, false);
});

test('[live-move preview] membership drift leaves DOM untouched and flags the draft invalid', async () => {
  const { internals, document } = await loadOverlayInternals();
  const { elements } = makeLayerDragFixture(internals, document);
  const parent = elements[0].parentElement;
  enableLiveMovePreviewFixture(document, parent);

  internals.reorderLayer('4', '2');
  const draft = internals.getLayerOrderDraft();
  assert.equal(draft.livePreviewApplied, true, 'precondition: preview was applied');
  parent.removeChild(elements[1]);
  const driftedOrder = parent.children.slice();

  assert.doesNotThrow(() => internals.dismiss());

  assert.deepEqual(parent.children, driftedOrder, 'revert must not mutate a drifted child set');
  assert.equal(draft.livePreviewApplied, false);
  assert.equal(internals.validLayerDraft(draft), false, 'membership drift remains visibly invalid');
});

test('[live-move fix] script-interleaved sibling order restores byte-exact on discard', async () => {
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  const a = document.createElement('header');
  const script = document.createElement('script');
  const b = document.createElement('main');
  parent.localName = 'section';
  parent.tagName = 'SECTION';
  a.localName = 'header';
  a.tagName = 'HEADER';
  script.localName = 'script';
  script.tagName = 'SCRIPT';
  b.localName = 'main';
  b.tagName = 'MAIN';
  parent.parentElement = document.body;
  parent.children = [a, script, b];
  parent.children.forEach((child) => { child.parentElement = parent; child.parentNode = parent; });
  const tree = { id: 1, parentId: null, depth: 0, label: 'section', badges: [], children: [
    { id: 2, parentId: 1, depth: 1, label: 'header', badges: [], children: [] },
    { id: 3, parentId: 1, depth: 1, label: 'main', badges: [], children: [] }
  ] };
  internals.setLayerTestState(tree, [[1, parent], [2, a], [3, b]], b);
  enableLiveMovePreviewFixture(document, parent);

  assert.equal(internals.shouldSkipLayerElement(script), true, 'precondition: SCRIPT is excluded from the layers tree');
  internals.reorderLayer('3', '2');
  const draft = internals.getLayerOrderDraft();
  assert.deepEqual(parent.children, [b, a, script], 'precondition: B moves before A optimistically');

  internals.removeChange(draft.clientKey);

  assert.deepEqual(parent.children, [a, script, b]);
});

test('[live-move fix] composed reparent chain discard restores the element to its original parent', async () => {
  const { internals, document } = await loadOverlayInternals();
  const { tree, pairs, elements } = makeNestedLayerFixture(internals, document);
  elements.root.localName = 'body';
  elements.root.tagName = 'BODY';
  document.body.children = [elements.root];
  const thirdParent = document.createElement('nav');
  thirdParent.localName = 'nav';
  thirdParent.tagName = 'NAV';
  thirdParent.parentElement = elements.root;
  thirdParent.parentNode = elements.root;
  elements.root.children.push(thirdParent);
  tree.children.push({ id: 7, parentId: 1, depth: 1, label: 'nav', badges: [], children: [] });
  pairs.push([7, thirdParent]);
  internals.setLayerTestState(tree, pairs, elements.article);
  const originalChildren = elements.section.children.slice();
  enableLiveMovePreviewFixture(document, elements.section, elements.footer, thirdParent);

  internals.reparentLayer('3', '6', 0);
  const firstDraft = internals.getLayerOrderDraft();
  assert.equal(elements.article.parentElement, elements.footer, 'precondition: first preview reparents P to Q');

  internals.reparentLayer('3', '7', 0);
  const composedDraft = internals.getLayerOrderDraft();
  assert.equal(composedDraft.fromParentSelector, firstDraft.toParentSelector, 'the second drag starts from Q');
  assert.equal(composedDraft.clientKey, firstDraft.clientKey, 'the Q to R drag composes into the same draft');

  internals.removeChange(composedDraft.clientKey);

  assert.equal(elements.article.parentElement, elements.section);
  assert.deepEqual(elements.section.children, originalChildren);
});

test('[live-move fix] host order drift then rejection leaves the DOM alone', async () => {
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-live-drift', batchId: 'batch-live-drift' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const { elements } = makeLayerDragFixture(internals, document);
  const parent = elements[0].parentElement;
  document.body.children = [parent];
  enableLiveMovePreviewFixture(document, parent);

  internals.reorderLayer('4', '2');
  await internals.dispatchPendingBatch();
  await flushOverlayPromises();
  const order = internals.getPendingLayerOrder();
  assert.equal(order.operationId, 'op-live-drift', 'precondition: the preview is a registered operation');
  const driftedOrder = [elements[0], elements[2], elements[1]];
  parent.children = driftedOrder.slice();
  parent.children.forEach((child) => { child.parentElement = parent; child.parentNode = parent; });

  internals.handleLayerOperationResult({ id: 'op-live-drift', state: 'rejected', updatedAt: 'now' });

  assert.deepEqual(parent.children, driftedOrder, 'rejection must not overwrite same-membership host order drift');
  assert.equal(order.livePreviewApplied, false);
});

test('[live-move fix] adoption clears the preview flag on the applied receipt', async () => {
  const { internals, document } = await loadOverlayInternals({
    fetch: async (url) => {
      if (String(url).includes('/layers-intent')) return { ok: true, json: async () => ({ operationId: 'op-live-adopt', batchId: 'batch-live-adopt' }) };
      if (String(url).includes('/batch-commit')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ tokens: [] }) };
    }
  });
  const { elements } = makeLayerDragFixture(internals, document);
  const parent = elements[0].parentElement;
  document.body.children = [parent];
  enableLiveMovePreviewFixture(document, parent);

  internals.reorderLayer('4', '2');
  const expectedOrder = parent.children.slice();
  await internals.dispatchPendingBatch();
  await flushOverlayPromises();
  const receipt = internals.getPendingLayerOrder();
  assert.equal(receipt.operationId, 'op-live-adopt', 'precondition: the preview is a registered operation');

  internals.handleLayerOperationResult({ id: 'op-live-adopt', state: 'applied', updatedAt: 'now' });

  assert.equal(receipt.livePreviewApplied, false);
  assert.equal(receipt.livePreviewUndo ?? null, null);
  internals.dismiss();
  assert.deepEqual(parent.children, expectedOrder, 'dismiss must keep the adopted order');
});

test('[live-move fix] composed same-parent second drag keeps the pristine domSnapshotHash', async () => {
  const { internals, document } = await loadOverlayInternals();
  const { elements } = makeLayerDragFixture(internals, document);
  const parent = elements[0].parentElement;
  parent.localName = 'section';
  parent.tagName = 'SECTION';
  document.body.children = [parent];
  const pristineOrder = parent.children.slice();
  Object.defineProperty(parent, 'innerHTML', {
    configurable: true,
    get() {
      return this.children.map((child) => String(pristineOrder.indexOf(child))).join('');
    }
  });
  enableLiveMovePreviewFixture(document, parent);

  internals.reorderLayer('4', '2');
  const firstDraft = internals.getLayerOrderDraft();
  const h1 = firstDraft.domSnapshotHash;

  internals.reorderLayer('3', '4');
  const composedDraft = internals.getLayerOrderDraft();

  assert.equal(composedDraft.parentSelector, firstDraft.parentSelector);
  assert.equal(composedDraft.clientKey, firstDraft.clientKey);
  assert.equal(composedDraft.domSnapshotHash, h1);
  internals.removeChange(composedDraft.clientKey);
  assert.deepEqual(parent.children, pristineOrder);
});

test('REGRESSION: a branch past the depth cap does not truncate the rest of the page out of the layer tree', async () => {
  // A deep nav (>12 levels) used to set the SHARED `stopped` flag, which broke out of
  // every remaining sibling loop — so `main` and everything after it never entered
  // layerElements, and a canvas selection there had no row to select or reveal.
  const { internals, document } = await loadOverlayInternals();
  const deep = document.createElement('nav');
  deep.localName = 'nav';
  document.body.appendChild(deep);
  let cursor = deep;
  for (let i = 0; i < 15; i += 1) {
    const next = document.createElement('div');
    next.localName = 'div';
    cursor.appendChild(next);
    cursor = next;
  }
  const main = document.createElement('main');
  main.localName = 'main';
  const link = document.createElement('a');
  link.localName = 'a';
  main.appendChild(link);
  document.body.appendChild(main);

  const tree = internals.buildLayerTree(document.body);
  // buildLayerTree runs in the overlay's vm realm, so its arrays fail deepStrictEqual's
  // prototype check — compare joined labels instead.
  assert.equal(tree.children.map((child) => child.label).join(','), 'nav,main', 'the sibling after the deep branch still gets a node');

  const flat = [];
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    flat.push(node);
    (node.children || []).forEach((child) => pending.push(child));
  }
  assert.ok(flat.some((node) => node.label === 'a' && !node.truncated), 'descendants of the later sibling are in the tree');
  const truncatedIds = flat.filter((node) => node.truncated).map((node) => node.id);
  assert.equal(new Set(truncatedIds).size, truncatedIds.length, 'truncated placeholder ids stay unique');
});

test('REGRESSION: a non-layer sibling does not shift reorder indices off the layer tree', async () => {
  // layerMeasurable kept its own copy of buildLayerTree's exclusion list and had drifted:
  // a <template>/<noscript>/ld+json sibling was measured but never got a tree node, so the
  // live index ran one ahead of orderedElements and the bridge rejected the intent.
  const { internals, document } = await loadOverlayInternals();
  const parent = document.createElement('section');
  parent.localName = 'section';
  const first = document.createElement('div');
  first.localName = 'div';
  const skipped = document.createElement('template');
  skipped.localName = 'template';
  skipped.tagName = 'TEMPLATE';
  const last = document.createElement('div');
  last.localName = 'div';
  [first, skipped, last].forEach((child) => parent.appendChild(child));

  const measured = parent.children.filter((child) => internals.layerMeasurable(child));
  const tree = internals.buildLayerTree(parent);
  assert.equal(measured.length, tree.children.length, 'measured children align 1:1 with tree nodes');
  assert.equal(measured.indexOf(last), 1, 'the excluded sibling does not advance the live index');
});

test('REGRESSION: a visible aria-hidden leaf (decorative video) gets a layer row', async () => {
  // Decorative media is aria-hidden="true" with no element children — but it renders at
  // real size and is fully clickable on the canvas. The old skip dropped it from the tree,
  // so clicking a portfolio video updated the right panel while the layers list showed no
  // selection at all. Zero-size aria-hidden nodes (a11y plumbing) must still stay out.
  const { internals, document } = await loadOverlayInternals();
  const link = document.createElement('a');
  link.localName = 'a';
  const video = document.createElement('video');
  video.localName = 'video';
  video.setAttribute('aria-hidden', 'true');
  video.getBoundingClientRect = () => ({ width: 400, height: 225, top: 0, left: 0, right: 400, bottom: 225 });
  const srOnly = document.createElement('span');
  srOnly.localName = 'span';
  srOnly.setAttribute('aria-hidden', 'true');
  srOnly.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });
  link.appendChild(video);
  link.appendChild(srOnly);

  const tree = internals.buildLayerTree(link);
  assert.equal(tree.children.map((child) => child.label).join(','), 'video', 'sized aria-hidden media is in the tree, zero-size plumbing is not');
});
