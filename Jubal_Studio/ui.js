// 1 + 11. UI, theme state, DOM visibility and localStorage.
const SETTINGS_KEY = "jubalStudioSettings";

export function switchView(viewName) {
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  const live = document.getElementById("view-live");
  const learning = document.getElementById("view-learning");
  const tabs = document.querySelectorAll(".tab-btn");
  if (viewName === "live") {
    live?.classList.add("active");
    tabs[0]?.classList.add("active");
  } else {
    learning?.classList.add("active");
    tabs[1]?.classList.add("active");
    window.dispatchEvent(new CustomEvent("jubal:resizeWaterfall"));
  }
}

export function togglePanel(panelKey) {
  const panelEl = document.getElementById(`panel-${panelKey}`);
  const chipEl = document.getElementById(`toggle-${panelKey}-panel`);
  if (!panelEl || !chipEl) return;

  const isHidden = panelEl.style.display === "none";
  panelEl.style.display = isHidden ? "flex" : "none";
  chipEl.classList.toggle("active", isHidden);

  const grid = document.getElementById("live-workspace-grid");
  if (grid) {
    const visiblePanels = ["scale", "hardware", "arranger", "seq"].filter(k => {
      const el = document.getElementById(`panel-${k}`);
      return el && el.style.display !== "none";
    });
    grid.style.gridTemplateColumns =
      visiblePanels.length === 4 ? "350px 1fr 300px 350px" :
      visiblePanels.length === 3 ? "450px 1fr 450px" :
      visiblePanels.length === 2 ? "1fr 1fr" : "1fr";
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save settings", error);
  }
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
