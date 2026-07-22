/**
 * Main application controller.
 */

import { TABS, REFRESH_INTERVAL_MS, APP_TITLE } from "./config.js";
import { loadTournamentData, loadCachedData } from "./data.js";
import {
  renderNav,
  renderInfo,
  renderDiscipline,
  renderLoading,
  renderError,
} from "./render.js";

const state = {
  activeTab: "info",
  data: null,
  loading: false,
  error: null,
  refreshTimer: null,
  /** @type {Set<string>} */
  expandedBasketball: new Set(),
};

const els = {
  nav: document.getElementById("main-nav"),
  content: document.getElementById("content"),
  refreshBtn: document.getElementById("btn-refresh"),
  status: document.getElementById("status-line"),
};

function setStatus(text, kind = "") {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function updateNav() {
  if (!els.nav) return;
  els.nav.innerHTML = renderNav(state.activeTab);
  els.nav.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.getAttribute("data-tab"));
    });
  });
}

function switchTab(tabId) {
  if (!TABS.some((t) => t.id === tabId)) return;
  state.activeTab = tabId;
  // Persist tab in hash for deep links / refresh
  if (location.hash.replace("#", "") !== tabId) {
    history.replaceState(null, "", `#${tabId}`);
  }
  updateNav();
  render();
  // Scroll content to top on tab change
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  if (!els.content) return;

  if (state.loading && !state.data) {
    els.content.innerHTML = renderLoading();
    return;
  }

  if (state.error && !state.data) {
    els.content.innerHTML = renderError(state.error);
    els.content.querySelector("[data-action=retry]")?.addEventListener("click", () => {
      refresh(true);
    });
    return;
  }

  if (state.activeTab === "info") {
    els.content.innerHTML = renderInfo(state.data);
  } else {
    els.content.innerHTML = renderDiscipline(state.activeTab, state.data, {
      expandedBasketball: state.expandedBasketball,
    });
  }

  bindBasketballToggles();

  if (els.refreshBtn) {
    els.refreshBtn.disabled = state.loading;
    els.refreshBtn.classList.toggle("is-spinning", state.loading);
  }
}

function bindBasketballToggles() {
  if (!els.content) return;
  els.content.querySelectorAll("[data-toggle-player]").forEach((el) => {
    const name = el.getAttribute("data-toggle-player");
    if (!name) return;
    const toggle = () => {
      if (state.expandedBasketball.has(name)) {
        state.expandedBasketball.delete(name);
      } else {
        state.expandedBasketball.add(name);
      }
      render();
    };
    el.addEventListener("click", (e) => {
      e.preventDefault();
      toggle();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });
}

/**
 * @param {boolean} forceNetwork
 */
async function refresh(forceNetwork = false) {
  state.loading = true;
  state.error = null;
  setStatus("…", "loading");
  render();

  try {
    const data = await loadTournamentData();
    state.data = data;
    state.loading = false;
    const t = new Date(data.fetchedAt).toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const warn = data.errors?.length ? " !" : "";
    setStatus(`akt. ${t}${warn}`, data.errors?.length ? "warn" : "ok");
    render();
  } catch (e) {
    console.error(e);
    state.loading = false;
    // Fall back to cache
    const cached = loadCachedData();
    if (cached) {
      state.data = cached;
      state.error = null;
      setStatus("offline", "warn");
      render();
    } else {
      state.error = e.message || String(e);
      setStatus("błąd", "error");
      render();
    }
  }
}

function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  }, REFRESH_INTERVAL_MS);
}

function initFromHash() {
  const hash = location.hash.replace("#", "");
  if (TABS.some((t) => t.id === hash)) {
    state.activeTab = hash;
  }
}

function init() {
  document.title = APP_TITLE;
  initFromHash();

  // Show cache immediately if available
  const cached = loadCachedData();
  if (cached) {
    state.data = cached;
    setStatus("…", "loading");
  }

  updateNav();
  render();

  els.refreshBtn?.addEventListener("click", () => refresh(true));

  window.addEventListener("hashchange", () => {
    initFromHash();
    updateNav();
    render();
  });

  // Initial network load
  refresh(true);
  startAutoRefresh();

  // Re-fetch when returning to the tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  });
}

init();
