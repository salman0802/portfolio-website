// UI shell, view switching, persistent settings and pixel-precise dock workspace.
const SETTINGS_KEY = "jubalStudioSettings";
const THEME_KEY = "jubalStudioTheme";
const KEYBOARD_STICKY_KEY = "jubalStudioKeyboardSticky";
const DOCK_LAYOUT_KEY = "jubalStudioDockLayoutV4";
const LEGACY_DOCK_LAYOUT_KEYS = ["jubalStudioDockLayoutV3", "jubalStudioDockLayoutV2"];
const DOCK_KEYS = ["scale", "hardware", "arranger", "seq"];
const DRAG_THRESHOLD = 5;
const LAYOUT_MOTION_DURATION = 180;
const MIN_PANEL_WIDTH = 220;
const MIN_PANEL_HEIGHT = 150;
const MAX_PANEL_HEIGHT = 760;

const DEFAULT_DOCKS = {
  scale: { width: 330, height: 260 },
  hardware: { width: 560, height: 300 },
  arranger: { width: 290, height: 240 },
  seq: { width: 340, height: 260 }
};

let layoutLocked = false;
let interaction = null;
let interactionFrame = 0;
let latestPointer = null;
let activeDropTarget = null;
let activeDropZone = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const desktopDockingEnabled = () => window.matchMedia("(min-width: 1100px)").matches;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function applyTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.dataset.theme = isLight ? "light" : "dark";
  const button = document.getElementById("theme-toggle");
  if (button) {
    button.textContent = isLight ? "☾" : "◐";
    button.setAttribute("aria-pressed", String(isLight));
    button.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    button.title = isLight ? "Dark theme" : "Light theme";
  }
}

function initTheme() {
  let theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {}
  applyTheme(theme);
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  });
}


function applyKeyboardSticky(enabled) {
  const sticky = Boolean(enabled);
  document.documentElement.dataset.keyboardSticky = sticky ? "true" : "false";
  const button = document.getElementById("keyboard-sticky-toggle");
  if (button) {
    button.setAttribute("aria-pressed", String(sticky));
    button.setAttribute("aria-label", sticky
      ? "Unpin main keyboard from workspace"
      : "Keep main keyboard visible while scrolling");
    button.title = sticky ? "Unpin keyboard" : "Pin keyboard";
  }
}

function initKeyboardStickyPreference() {
  let enabled = document.documentElement.dataset.keyboardSticky === "true";
  try {
    const saved = localStorage.getItem(KEYBOARD_STICKY_KEY);
    if (saved === "true" || saved === "false") enabled = saved === "true";
  } catch {}

  applyKeyboardSticky(enabled);
  document.getElementById("keyboard-sticky-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.keyboardSticky !== "true";
    applyKeyboardSticky(next);
    try { localStorage.setItem(KEYBOARD_STICKY_KEY, String(next)); } catch {}
  });
}

function installInstrumentScrollGuards() {
  const selector = ".keyboard-dock, .academy-scroll-wrapper, .wind-container, #learn-wind-container";
  document.querySelectorAll(selector).forEach(surface => {
    surface.addEventListener("wheel", event => {
      // Instrument surfaces are deliberately horizontal-only. A vertical
      // trackpad gesture over them must never turn into workspace/page scroll.
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.preventDefault();
    }, { passive: false });
  });
}

export function switchView(viewName) {
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(el => {
    el.classList.remove("active");
    el.setAttribute("aria-pressed", "false");
  });

  const live = document.getElementById("view-live");
  const learning = document.getElementById("view-learning");
  const panelToolbar = document.querySelector(".panel-toggler-bar");
  const isLive = viewName === "live";

  panelToolbar?.style.setProperty("display", isLive ? "flex" : "none");
  if (isLive) {
    live?.classList.add("active");
    tabs[0]?.classList.add("active");
    tabs[0]?.setAttribute("aria-pressed", "true");
  } else {
    learning?.classList.add("active");
    tabs[1]?.classList.add("active");
    tabs[1]?.setAttribute("aria-pressed", "true");
    window.dispatchEvent(new CustomEvent("jubal:resizeWaterfall"));
  }
}

function loadDockLayout() {
  try {
    const raw = localStorage.getItem(DOCK_LAYOUT_KEY);
    if (raw) return JSON.parse(raw);
    for (const legacyKey of LEGACY_DOCK_LAYOUT_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const legacy = JSON.parse(legacyRaw);
      localStorage.setItem(DOCK_LAYOUT_KEY, JSON.stringify(legacy));
      return legacy;
    }
    return null;
  } catch (error) {
    console.error("Failed to load dock layout", error);
    return null;
  }
}

function panelSize(panel) {
  const rect = panel?.getBoundingClientRect();
  return {
    width: Number(panel?.dataset.dockWidth) || rect?.width || 320,
    height: Number(panel?.dataset.dockHeight) || rect?.height || 240
  };
}

function getDefaultSize(key, grid) {
  const base = DEFAULT_DOCKS[key] || { width: 320, height: 240 };
  const maxWidth = Math.max(MIN_PANEL_WIDTH, (grid?.clientWidth || base.width) - 2);
  return {
    width: Math.round(clamp(base.width, MIN_PANEL_WIDTH, maxWidth)),
    height: Math.round(clamp(base.height, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT))
  };
}

function setDockPixelSize(panel, width, height) {
  if (!panel) return;
  const grid = document.getElementById("live-workspace-grid");
  const maxWidth = Math.max(MIN_PANEL_WIDTH, (grid?.clientWidth || window.innerWidth) - 2);
  const safeWidth = Math.round(clamp(Number(width) || MIN_PANEL_WIDTH, MIN_PANEL_WIDTH, maxWidth));
  const safeHeight = Math.round(clamp(Number(height) || MIN_PANEL_HEIGHT, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT));
  panel.dataset.dockWidth = String(safeWidth);
  panel.dataset.dockHeight = String(safeHeight);
  panel.style.setProperty("--dock-width", `${safeWidth}px`);
  panel.style.setProperty("--dock-height", `${safeHeight}px`);
}

function currentDockLayout() {
  const grid = document.getElementById("live-workspace-grid");
  if (!grid) return null;
  const gridRect = grid.getBoundingClientRect();
  const panels = [...grid.querySelectorAll(":scope > .panel-card[data-dock-key]")];
  return {
    version: 4,
    locked: layoutLocked,
    order: panels.map(panel => panel.dataset.dockKey),
    panels: Object.fromEntries(DOCK_KEYS.map(key => {
      const panel = document.getElementById(`panel-${key}`);
      const size = panelSize(panel);
      const rect = panel?.getBoundingClientRect();
      const index = panels.indexOf(panel);
      return [key, {
        width: Math.round(size.width),
        height: Math.round(size.height),
        hidden: Boolean(panel?.hidden),
        position: {
          index: index < 0 ? 0 : index,
          x: rect ? Math.round(rect.left - gridRect.left + grid.scrollLeft) : 0,
          y: rect ? Math.round(rect.top - gridRect.top + grid.scrollTop) : 0
        }
      }];
    }))
  };
}

function saveDockLayout() {
  try {
    const state = currentDockLayout();
    if (state) localStorage.setItem(DOCK_LAYOUT_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save dock layout", error);
  }
}

function syncPanelToggles() {
  DOCK_KEYS.forEach(key => {
    const panel = document.getElementById(`panel-${key}`);
    const chip = document.getElementById(`toggle-${key}-panel`);
    if (panel && chip) chip.classList.toggle("active", !panel.hidden);
  });
}

function updateLayoutLockUI() {
  const grid = document.getElementById("live-workspace-grid");
  grid?.classList.toggle("dock-layout-locked", layoutLocked);
  const button = document.getElementById("btn-lock-layout");
  if (button) {
    button.classList.toggle("active", layoutLocked);
    button.setAttribute("aria-pressed", String(layoutLocked));
    button.textContent = layoutLocked ? "▣" : "⌑";
    button.setAttribute("aria-label", layoutLocked ? "Unlock workspace layout" : "Lock workspace layout");
    button.title = layoutLocked ? "Unlock workspace layout" : "Lock workspace layout";
  }
}

function applyDockLayout(state) {
  const grid = document.getElementById("live-workspace-grid");
  if (!grid) return;

  let order = state?.order?.filter(key => DOCK_KEYS.includes(key));
  if (!order?.length && state?.panels) {
    order = DOCK_KEYS.slice().sort((a, b) => {
      const pa = state.panels[a]?.position || {};
      const pb = state.panels[b]?.position || {};
      return (Number(pa.y) || 0) - (Number(pb.y) || 0)
        || (Number(pa.x) || 0) - (Number(pb.x) || 0)
        || (Number(pa.index) || 0) - (Number(pb.index) || 0);
    });
  }
  order = order?.length ? order : DOCK_KEYS;
  const completeOrder = [...order, ...DOCK_KEYS.filter(key => !order.includes(key))];
  completeOrder.forEach(key => {
    const panel = document.getElementById(`panel-${key}`);
    if (panel) grid.appendChild(panel);
  });

  DOCK_KEYS.forEach(key => {
    const panel = document.getElementById(`panel-${key}`);
    if (!panel) return;
    const saved = state?.panels?.[key];
    const defaults = getDefaultSize(key, grid);
    setDockPixelSize(panel, saved?.width ?? defaults.width, saved?.height ?? defaults.height);
    panel.hidden = Boolean(saved?.hidden);
    updateDockSizeLabel(panel);
  });

  layoutLocked = Boolean(state?.locked);
  syncPanelToggles();
  updateLayoutLockUI();
}

function makeResizeHandle(axis, title) {
  const handle = document.createElement("div");
  handle.className = `dock-resize-edge dock-resize-${axis}`;
  handle.dataset.resizeAxis = axis;
  handle.title = title;
  handle.setAttribute("aria-hidden", "true");
  return handle;
}

function addDockChrome(panel) {
  if (panel.dataset.dockReady === "true") return;
  panel.dataset.dockReady = "true";
  const key = panel.dataset.dockKey;
  const title = panel.dataset.dockTitle || key;

  const content = document.createElement("div");
  content.className = "dock-panel-content";
  while (panel.firstChild) content.appendChild(panel.firstChild);

  const header = document.createElement("div");
  header.className = "dock-panel-header";
  header.title = "Drag to rearrange this panel";
  header.setAttribute("role", "toolbar");
  header.setAttribute("aria-label", `${title} panel controls`);
  header.innerHTML = `
    <span class="dock-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <strong title="${title}">${title}</strong>
    <span class="dock-size-label" aria-hidden="true"></span>
    <button type="button" class="dock-hide" title="Hide ${title}" aria-label="Hide ${title}">×</button>`;

  const resizeX = makeResizeHandle("x", `Resize ${title} width`);
  const resizeY = makeResizeHandle("y", `Resize ${title} height`);
  const resizeXY = makeResizeHandle("xy", `Resize ${title}`);

  panel.append(header, content, resizeX, resizeY, resizeXY);

  const oldTitle = [...content.querySelectorAll("label")].find(label =>
    label.textContent.trim().toUpperCase() === title.toUpperCase()
  );
  if (oldTitle) oldTitle.classList.add("dock-inline-title");

  header.querySelector(".dock-hide")?.addEventListener("click", e => {
    e.stopPropagation();
    togglePanel(key);
  });
  header.addEventListener("pointerdown", e => prepareDockDrag(e, panel));
  [resizeX, resizeY, resizeXY].forEach(handle => {
    handle.addEventListener("pointerdown", e => startDockResize(e, panel, handle.dataset.resizeAxis));
  });
}

function updateDockSizeLabel(panel, text = null) {
  const label = panel?.querySelector(".dock-size-label");
  if (!label) return;
  const size = panelSize(panel);
  label.textContent = text || `${Math.round(size.width)}×${Math.round(size.height)}`;
}

function createOriginSpacer(panel, rect = panel.getBoundingClientRect()) {
  const spacer = document.createElement("div");
  spacer.className = "dock-origin-spacer";
  spacer.style.setProperty("--dock-width", `${Math.round(rect.width)}px`);
  spacer.style.setProperty("--dock-height", `${Math.round(rect.height)}px`);
  spacer.setAttribute("aria-hidden", "true");
  return spacer;
}

function setSpacerSize(spacer, width, height) {
  if (!spacer) return;
  spacer.style.setProperty("--dock-width", `${Math.round(width)}px`);
  spacer.style.setProperty("--dock-height", `${Math.round(height)}px`);
}

function createInsertionGuide() {
  const guide = document.createElement("div");
  guide.className = "dock-insertion-guide";
  guide.innerHTML = `<span class="dock-insertion-label"></span>`;
  document.body.appendChild(guide);
  return guide;
}

function createResizePreview() {
  const preview = document.createElement("div");
  preview.className = "dock-size-preview";
  preview.innerHTML = `<span class="dock-size-preview-label"></span>`;
  document.body.appendChild(preview);
  return preview;
}

function capturePanelRects(grid, exclude = []) {
  const excluded = new Set(exclude);
  return new Map(
    [...grid.querySelectorAll(":scope > .panel-card[data-dock-key]")]
      .filter(panel => !panel.hidden && !excluded.has(panel))
      .map(panel => [panel, panel.getBoundingClientRect()])
  );
}

function animatePanelsFromRects(beforeRects) {
  if (reduceMotion()) return;
  requestAnimationFrame(() => {
    beforeRects.forEach((rect, el) => {
      if (!el.isConnected || el.hidden || !el.animate) return;
      const nextRect = el.getBoundingClientRect();
      const dx = rect.left - nextRect.left;
      const dy = rect.top - nextRect.top;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
      const animation = el.animate(
        [{ transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: "translate3d(0,0,0)" }],
        { duration: LAYOUT_MOTION_DURATION, easing: "cubic-bezier(.2,.82,.2,1)" }
      );
      animation.id = "dock-layout-motion";
    });
  });
}

function floatPanel(panel, rect) {
  panel.classList.add("dock-floating");
  panel.style.position = "fixed";
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  panel.style.width = `${rect.width}px`;
  panel.style.height = `${rect.height}px`;
  panel.style.margin = "0";
  panel.style.zIndex = "240";
  panel.style.pointerEvents = "none";
  panel.style.transform = "translate3d(0,0,0)";
}

function clearFloatingStyles(panel) {
  panel.classList.remove("dock-floating", "dock-dragging", "dock-resizing");
  ["position", "left", "top", "width", "height", "margin", "z-index", "pointer-events", "transform", "will-change"].forEach(prop => {
    panel.style.removeProperty(prop);
  });
}

function prepareDockDrag(e, panel) {
  if (e.button !== 0 || layoutLocked || !desktopDockingEnabled() || interaction) return;
  if (e.target.closest("button, input, select, textarea, a")) return;
  e.preventDefault();
  const header = e.currentTarget;
  try { header.setPointerCapture(e.pointerId); } catch {}
  interaction = {
    mode: "pending-drag",
    panel,
    header,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY
  };
  latestPointer = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
}

function beginDockDrag(point) {
  const state = interaction;
  if (!state || state.mode !== "pending-drag") return;
  const grid = document.getElementById("live-workspace-grid");
  if (!grid) return;
  const rect = state.panel.getBoundingClientRect();
  const originSpacer = createOriginSpacer(state.panel, rect);
  grid.insertBefore(originSpacer, state.panel);
  Object.assign(state, {
    mode: "drag",
    grid,
    originSpacer,
    insertionGuide: createInsertionGuide(),
    originRect: rect,
    dropTarget: null,
    dropZone: null,
    dropAtEnd: false,
    validDrop: false
  });
  floatPanel(state.panel, rect);
  state.panel.classList.add("dock-dragging");
  state.panel.style.willChange = "transform";
  document.body.classList.add("dock-drag-active");
  grid.classList.add("dock-interacting");
  updateDragPosition(point);
}

function pickDropZone(target, x, y) {
  const rect = target.getBoundingClientRect();
  const nx = clamp((x - rect.left) / Math.max(1, rect.width), 0, 1);
  const ny = clamp((y - rect.top) / Math.max(1, rect.height), 0, 1);
  if (activeDropTarget === target && activeDropZone) {
    if (activeDropZone === "left" && nx < .45) return "left";
    if (activeDropZone === "right" && nx > .55) return "right";
    if (activeDropZone === "top" && ny < .45) return "top";
    if (activeDropZone === "bottom" && ny > .55) return "bottom";
  }
  return [["left", nx], ["right", 1 - nx], ["top", ny], ["bottom", 1 - ny]].sort((a,b) => a[1] - b[1])[0][0];
}

function clearDropTarget() {
  if (activeDropTarget) {
    activeDropTarget.classList.remove("dock-drop-target", "dock-drop-left", "dock-drop-right", "dock-drop-top", "dock-drop-bottom");
    activeDropTarget.removeAttribute("data-drop-label");
  }
  activeDropTarget = null;
  activeDropZone = null;
}

function setDropTarget(target, zone) {
  if (activeDropTarget === target && activeDropZone === zone) return;
  clearDropTarget();
  activeDropTarget = target;
  activeDropZone = zone;
  if (!target) return;
  target.classList.add("dock-drop-target", `dock-drop-${zone}`);
}

function updateInsertionGuide(guide, target, zone, panelTitle) {
  if (!guide || !target) return;
  const rect = target.getBoundingClientRect();
  const label = guide.querySelector(".dock-insertion-label");
  const vertical = zone === "left" || zone === "right";
  const thickness = 4;
  guide.classList.toggle("vertical", vertical);
  guide.classList.toggle("horizontal", !vertical);
  guide.style.display = "block";
  if (vertical) {
    guide.style.left = `${(zone === "left" ? rect.left : rect.right) - thickness / 2}px`;
    guide.style.top = `${rect.top}px`;
    guide.style.width = `${thickness}px`;
    guide.style.height = `${rect.height}px`;
  } else {
    guide.style.left = `${rect.left}px`;
    guide.style.top = `${(zone === "top" ? rect.top : rect.bottom) - thickness / 2}px`;
    guide.style.width = `${rect.width}px`;
    guide.style.height = `${thickness}px`;
  }
  if (label) label.textContent = `Drop ${panelTitle} ${zone === "left" || zone === "top" ? "before" : "after"}`;
}

function updateEndGuide(guide, grid, panelTitle) {
  if (!guide || !grid) return;
  const visiblePanels = [...grid.querySelectorAll(":scope > .panel-card[data-dock-key]")]
    .filter(el => !el.hidden && !el.classList.contains("dock-floating"));
  const lastRect = visiblePanels.at(-1)?.getBoundingClientRect() || grid.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  guide.classList.remove("vertical");
  guide.classList.add("horizontal");
  guide.style.display = "block";
  guide.style.left = `${gridRect.left}px`;
  guide.style.top = `${lastRect.bottom + 4}px`;
  guide.style.width = `${gridRect.width}px`;
  guide.style.height = "4px";
  const label = guide.querySelector(".dock-insertion-label");
  if (label) label.textContent = `Drop ${panelTitle} at end`;
}

function hideInsertionGuide(guide) {
  if (guide) guide.style.display = "none";
}

function maybeAutoScroll(y) {
  const edge = 70;
  if (y < edge) window.scrollBy({ top: -12, behavior: "auto" });
  else if (y > window.innerHeight - edge) window.scrollBy({ top: 12, behavior: "auto" });
}

function updateDragPosition(point) {
  const state = interaction;
  if (!state || state.mode !== "drag") return;
  state.panel.style.transform = `translate3d(${point.x - state.startX}px,${point.y - state.startY}px,0)`;
  maybeAutoScroll(point.y);

  const element = document.elementFromPoint(point.x, point.y);
  const target = element?.closest?.(".panel-card[data-dock-key]");
  const title = state.panel.dataset.dockTitle || "panel";
  if (target && target !== state.panel && target.parentElement === state.grid && !target.hidden) {
    const zone = pickDropZone(target, point.x, point.y);
    state.dropTarget = target;
    state.dropZone = zone;
    state.dropAtEnd = false;
    state.validDrop = true;
    setDropTarget(target, zone);
    updateInsertionGuide(state.insertionGuide, target, zone, title);
    return;
  }

  const gridRect = state.grid.getBoundingClientRect();
  const insideGrid = point.x >= gridRect.left && point.x <= gridRect.right && point.y >= gridRect.top && point.y <= gridRect.bottom + 100;
  clearDropTarget();
  state.dropTarget = null;
  state.dropZone = null;
  state.dropAtEnd = insideGrid;
  state.validDrop = insideGrid;
  if (insideGrid) updateEndGuide(state.insertionGuide, state.grid, title);
  else hideInsertionGuide(state.insertionGuide);
}

function startDockResize(e, panel, axis = "xy") {
  if (e.button !== 0 || layoutLocked || !desktopDockingEnabled() || interaction) return;
  e.preventDefault();
  e.stopPropagation();
  const grid = document.getElementById("live-workspace-grid");
  if (!grid) return;

  const rect = panel.getBoundingClientRect();
  const originSpacer = createOriginSpacer(panel, rect);
  grid.insertBefore(originSpacer, panel);
  const preview = createResizePreview();

  interaction = {
    mode: "resize",
    panel,
    handle: e.currentTarget,
    pointerId: e.pointerId,
    axis,
    grid,
    originSpacer,
    sizePreview: preview,
    originRect: rect,
    startX: e.clientX,
    startY: e.clientY,
    originalWidth: rect.width,
    originalHeight: rect.height,
    currentWidth: rect.width,
    currentHeight: rect.height,
    maxWidth: Math.max(MIN_PANEL_WIDTH, Math.min(grid.clientWidth, window.innerWidth - rect.left - 10)),
    maxHeight: Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, window.innerHeight - rect.top - 10))
  };

  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  floatPanel(panel, rect);
  panel.classList.add("dock-resizing");
  panel.style.willChange = "width,height";
  document.body.classList.add("dock-resize-active", `dock-resize-axis-${axis}`);
  grid.classList.add("dock-interacting");
  latestPointer = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  updateResizePreview(interaction);
}

function updateResizePreview(state) {
  const preview = state.sizePreview;
  if (!preview) return;
  const spacerRect = state.originSpacer.getBoundingClientRect();
  preview.style.left = `${spacerRect.left}px`;
  preview.style.top = `${spacerRect.top}px`;
  preview.style.width = `${state.currentWidth}px`;
  preview.style.height = `${state.currentHeight}px`;
  const label = preview.querySelector(".dock-size-preview-label");
  if (label) label.textContent = `${Math.round(state.currentWidth)} × ${Math.round(state.currentHeight)} px`;
}

function updateResizePosition(point) {
  const state = interaction;
  if (!state || state.mode !== "resize") return;
  const dx = point.x - state.startX;
  const dy = point.y - state.startY;
  let width = state.originalWidth;
  let height = state.originalHeight;
  if (state.axis.includes("x")) width = clamp(state.originalWidth + dx, MIN_PANEL_WIDTH, state.maxWidth);
  if (state.axis.includes("y")) height = clamp(state.originalHeight + dy, MIN_PANEL_HEIGHT, state.maxHeight);

  // Keep the floating card truly continuous; no grid conversion or rounding during interaction.
  state.currentWidth = width;
  state.currentHeight = height;
  state.panel.style.width = `${width}px`;
  state.panel.style.height = `${height}px`;
  setSpacerSize(state.originSpacer, width, height);
  updateResizePreview(state);
  updateDockSizeLabel(state.panel, `${Math.round(width)}×${Math.round(height)} px`);
}

function scheduleInteractionFrame(e) {
  if (!interaction || e.pointerId !== interaction.pointerId) return;
  latestPointer = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  if (interactionFrame) return;
  interactionFrame = requestAnimationFrame(() => {
    interactionFrame = 0;
    if (!interaction || !latestPointer) return;
    const point = latestPointer;
    if (interaction.mode === "pending-drag") {
      if (Math.hypot(point.x - interaction.startX, point.y - interaction.startY) >= DRAG_THRESHOLD) beginDockDrag(point);
    } else if (interaction.mode === "drag") updateDragPosition(point);
    else if (interaction.mode === "resize") updateResizePosition(point);
  });
}

function animateDroppedPanel(panel, fromRect) {
  if (reduceMotion() || !panel.animate) return;
  const toRect = panel.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;
  if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
  panel.animate(
    [{ transform: `translate3d(${dx}px,${dy}px,0)`, opacity: .96 }, { transform: "translate3d(0,0,0)", opacity: 1 }],
    { duration: LAYOUT_MOTION_DURATION, easing: "cubic-bezier(.2,.85,.2,1)" }
  );
}

function insertDroppedPanel(state) {
  const { grid, panel, dropTarget, dropZone, dropAtEnd, originSpacer } = state;
  if (dropTarget?.isConnected) {
    const before = dropZone === "left" || dropZone === "top";
    grid.insertBefore(panel, before ? dropTarget : dropTarget.nextSibling);
  } else if (dropAtEnd) grid.appendChild(panel);
  else grid.insertBefore(panel, originSpacer);
}

function finishInteraction({ cancel = false } = {}) {
  const state = interaction;
  if (!state) return;
  if (interactionFrame) {
    cancelAnimationFrame(interactionFrame);
    interactionFrame = 0;
  }

  if (state.mode === "pending-drag") {
    try { state.header?.releasePointerCapture(state.pointerId); } catch {}
    interaction = null;
    latestPointer = null;
    return;
  }

  const panel = state.panel;
  const grid = state.grid;
  const fromRect = panel.getBoundingClientRect();
  const beforeRects = capturePanelRects(grid, [panel]);

  if (state.mode === "drag") {
    if (cancel || !state.validDrop) grid.insertBefore(panel, state.originSpacer);
    else insertDroppedPanel(state);
  } else if (state.mode === "resize") {
    const width = cancel ? state.originalWidth : state.currentWidth;
    const height = cancel ? state.originalHeight : state.currentHeight;
    setDockPixelSize(panel, width, height);
    grid.insertBefore(panel, state.originSpacer);
  }

  state.originSpacer?.remove();
  state.insertionGuide?.remove();
  state.sizePreview?.remove();
  clearFloatingStyles(panel);
  updateDockSizeLabel(panel);
  clearDropTarget();

  // Drag commits animate position. Resize commits keep exact pixels and avoid scale animation.
  if (state.mode === "drag") {
    animatePanelsFromRects(beforeRects);
    animateDroppedPanel(panel, fromRect);
  }

  grid?.classList.remove("dock-interacting");
  document.body.classList.remove("dock-drag-active", "dock-resize-active", "dock-resize-axis-x", "dock-resize-axis-y", "dock-resize-axis-xy");
  try { state.header?.releasePointerCapture(state.pointerId); } catch {}
  try { state.handle?.releasePointerCapture(state.pointerId); } catch {}
  interaction = null;
  latestPointer = null;
  if (!cancel) saveDockLayout();
}

function resetDockLayout() {
  if (interaction) finishInteraction({ cancel: true });
  try {
    localStorage.removeItem(DOCK_LAYOUT_KEY);
    LEGACY_DOCK_LAYOUT_KEYS.forEach(key => localStorage.removeItem(key));
  } catch {}
  layoutLocked = false;
  applyDockLayout(null);
}

function toggleLayoutLock() {
  if (interaction) finishInteraction({ cancel: true });
  layoutLocked = !layoutLocked;
  updateLayoutLockUI();
  saveDockLayout();
}

function clampDockSizesToWorkspace() {
  if (!desktopDockingEnabled()) return;
  const grid = document.getElementById("live-workspace-grid");
  if (!grid) return;
  let changed = false;
  grid.querySelectorAll(":scope > .panel-card[data-dock-key]").forEach(panel => {
    const size = panelSize(panel);
    if (size.width > grid.clientWidth) {
      setDockPixelSize(panel, grid.clientWidth, size.height);
      updateDockSizeLabel(panel);
      changed = true;
    }
  });
  if (changed) saveDockLayout();
}

function initDockWorkspace() {
  const grid = document.getElementById("live-workspace-grid");
  if (!grid) return;
  grid.classList.add("dock-workspace");
  grid.querySelectorAll(":scope > .panel-card[data-dock-key]").forEach(addDockChrome);
  applyDockLayout(loadDockLayout());

  document.getElementById("btn-reset-layout")?.addEventListener("click", resetDockLayout);
  document.getElementById("btn-lock-layout")?.addEventListener("click", toggleLayoutLock);

  window.addEventListener("pointermove", e => {
    if (!interaction) return;
    if (interaction.mode !== "pending-drag") e.preventDefault();
    scheduleInteractionFrame(e);
  }, { passive: false });
  window.addEventListener("pointerup", e => {
    if (!interaction || e.pointerId !== interaction.pointerId) return;
    finishInteraction();
  });
  window.addEventListener("pointercancel", e => {
    if (!interaction || e.pointerId !== interaction.pointerId) return;
    finishInteraction({ cancel: true });
  });
  window.addEventListener("blur", () => interaction && finishInteraction({ cancel: true }));
  window.addEventListener("resize", clampDockSizesToWorkspace);
  // Persist the exact user-modified dock order/position/size when the page is left
  // as an additional safety net beyond drag/resize/hide commit saves.
  window.addEventListener("pagehide", saveDockLayout);
  window.addEventListener("beforeunload", saveDockLayout);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveDockLayout();
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && interaction) {
      e.preventDefault();
      finishInteraction({ cancel: true });
    }
  });
}

export function togglePanel(panelKey) {
  const panelEl = document.getElementById(`panel-${panelKey}`);
  const chipEl = document.getElementById(`toggle-${panelKey}-panel`);
  if (!panelEl || !chipEl) return;
  panelEl.hidden = !panelEl.hidden;
  panelEl.style.removeProperty("display");
  syncPanelToggles();
  saveDockLayout();
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch (error) { console.error("Failed to save settings", error); }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Failed to load settings", error);
    return null;
  }
}

export function bindUiEvents() {
  initTheme();
  initKeyboardStickyPreference();
  initDockWorkspace();
  installInstrumentScrollGuards();
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.querySelectorAll("[data-panel-toggle]").forEach(btn => {
    btn.addEventListener("click", () => togglePanel(btn.dataset.panelToggle));
  });
  window.addEventListener("keydown", e => {
    if (e.code !== "Space" || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("jubal:spacePressed"));
  });
}
