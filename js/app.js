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
  renderOptionsModalBody,
} from "./render.js";
import {
  processDataForEvents,
  loadNotifications,
  dismissNotification,
  clearAllNotifications,
  addNotificationsFromEvents,
  loadSettings,
  saveSettings,
} from "./notifications.js";
import {
  queueGoldCelebration,
  preloadCelebrationSound,
} from "./celebration.js";

const state = {
  activeTab: "info",
  data: null,
  loading: false,
  error: null,
  refreshTimer: null,
  /** @type {Set<string>} expanded skill-attempt rows (Koszykówka / Piłka ind.) */
  expandedAttempts: new Set(),
  /** @type {string|null} single expanded player on Gracze tab */
  expandedGracz: null,
  /** @type {string|null} expanded team-sport match key (roster panel) */
  expandedMatchKey: null,
  /** @type {import('./notifications.js').AppNotification[]} */
  notifications: [],
  optionsOpen: false,
};

const els = {
  nav: document.getElementById("main-nav"),
  content: document.getElementById("content"),
  refreshBtn: document.getElementById("btn-refresh"),
  status: document.getElementById("status-line"),
  optionsBtn: document.getElementById("btn-options"),
  optionsModal: document.getElementById("options-modal"),
  optionsBody: document.getElementById("options-body"),
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
  // Collapse expandables when leaving their context
  state.expandedMatchKey = null;
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
    els.content.innerHTML = renderInfo(state.data, {
      notifications: state.notifications,
    });
  } else {
    els.content.innerHTML = renderDiscipline(state.activeTab, state.data, {
      expandedAttempts: state.expandedAttempts,
      expandedGracz: state.expandedGracz,
      expandedMatchKey: state.expandedMatchKey,
    });
  }

  bindAttemptToggles();
  bindGraczToggles();
  bindMatchToggles();
  bindNotificationSwipe();

  if (els.refreshBtn) {
    els.refreshBtn.disabled = state.loading;
    els.refreshBtn.classList.toggle("is-spinning", state.loading);
  }

  if (state.optionsOpen) {
    refreshOptionsModal();
  }
}

function bindAttemptToggles() {
  if (!els.content) return;
  els.content.querySelectorAll("[data-toggle-player]").forEach((el) => {
    const name = el.getAttribute("data-toggle-player");
    if (!name) return;
    const toggle = () => {
      if (state.expandedAttempts.has(name)) {
        state.expandedAttempts.delete(name);
      } else {
        state.expandedAttempts.add(name);
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

function bindGraczToggles() {
  if (!els.content) return;
  els.content.querySelectorAll("[data-toggle-gracz]").forEach((el) => {
    const name = el.getAttribute("data-toggle-gracz");
    if (!name) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      // Only one player expanded at a time
      state.expandedGracz =
        state.expandedGracz === name ? null : name;
      render();
    });
  });
}

function bindMatchToggles() {
  if (!els.content) return;
  els.content.querySelectorAll("[data-toggle-match]").forEach((el) => {
    const key = el.getAttribute("data-toggle-match");
    if (key == null) return;
    const toggle = () => {
      state.expandedMatchKey =
        state.expandedMatchKey === key ? null : key;
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
 * Swipe-to-dismiss + click-to-open discipline for notification cards.
 */
function bindNotificationSwipe() {
  if (!els.content) return;
  els.content.querySelectorAll("[data-swipe-notif]").forEach((card) => {
    const id = card.getAttribute("data-notif-id");
    if (!id) return;
    const tabId = card.getAttribute("data-notif-tab");

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let tracking = false;
    let horizontal = null;
    let didSwipe = false;

    const inner = card.querySelector(".notif-card-inner") || card;

    const openTab = () => {
      if (!tabId || didSwipe) return;
      switchTab(tabId);
    };

    const onStart = (clientX, clientY) => {
      startX = clientX;
      startY = clientY;
      dx = 0;
      tracking = true;
      horizontal = null;
      didSwipe = false;
      inner.style.transition = "none";
    };

    const onMove = (clientX, clientY) => {
      if (!tracking) return;
      const mx = clientX - startX;
      const my = clientY - startY;
      if (horizontal == null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        horizontal = Math.abs(mx) > Math.abs(my);
        if (!horizontal) {
          tracking = false;
          return;
        }
      }
      if (!horizontal) return;
      dx = mx;
      if (Math.abs(dx) > 12) didSwipe = true;
      inner.style.transform = `translateX(${dx}px)`;
      inner.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / 220));
    };

    const onEnd = () => {
      if (!tracking && horizontal == null) {
        // pure click without move tracking edge-case
        return;
      }
      tracking = false;
      inner.style.transition = "transform 0.22s ease, opacity 0.22s ease";
      if (Math.abs(dx) > 96) {
        didSwipe = true;
        const dir = dx > 0 ? 1 : -1;
        inner.style.transform = `translateX(${dir * 120}vw)`;
        inner.style.opacity = "0";
        window.setTimeout(() => {
          state.notifications = dismissNotification(id);
          if (state.activeTab === "info") render();
          else if (state.optionsOpen) refreshOptionsModal();
        }, 200);
      } else {
        inner.style.transform = "";
        inner.style.opacity = "";
        if (!didSwipe && Math.abs(dx) < 12) {
          openTab();
        }
      }
      dx = 0;
      horizontal = null;
    };

    card.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        if (t) onStart(t.clientX, t.clientY);
      },
      { passive: true }
    );
    card.addEventListener(
      "touchmove",
      (e) => {
        const t = e.changedTouches[0];
        if (!t) return;
        if (horizontal) e.preventDefault();
        onMove(t.clientX, t.clientY);
      },
      { passive: false }
    );
    card.addEventListener("touchend", onEnd);
    card.addEventListener("touchcancel", onEnd);

    card.addEventListener("click", (e) => {
      // Keyboard / mouse click without drag
      if (didSwipe) {
        e.preventDefault();
        return;
      }
      openTab();
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openTab();
      }
    });

    // Mouse drag (desktop)
    card.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY);
      const move = (ev) => onMove(ev.clientX, ev.clientY);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        onEnd();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
  });
}

// ─── Options modal ─────────────────────────────────────────────

function refreshOptionsModal() {
  if (!els.optionsBody) return;
  els.optionsBody.innerHTML = renderOptionsModalBody(
    loadSettings(),
    state.notifications.length
  );

  const sound = /** @type {HTMLInputElement|null} */ (
    els.optionsBody.querySelector("#opt-sound")
  );
  const medalSelect = /** @type {HTMLSelectElement|null} */ (
    els.optionsBody.querySelector("#opt-medal-sound")
  );

  sound?.addEventListener("change", () => {
    saveSettings({ soundEnabled: Boolean(sound.checked) });
    if (medalSelect) medalSelect.disabled = !sound.checked;
  });

  // Save selection only — no preview playback
  medalSelect?.addEventListener("change", () => {
    saveSettings({ medalSoundId: medalSelect.value });
  });

  els.optionsBody
    .querySelector("#opt-clear-notifs")
    ?.addEventListener("click", () => {
      state.notifications = clearAllNotifications();
      refreshOptionsModal();
      if (state.activeTab === "info") render();
    });
}

function openOptions() {
  state.optionsOpen = true;
  if (!els.optionsModal) return;
  refreshOptionsModal();
  els.optionsModal.hidden = false;
  els.optionsModal.classList.add("is-open");
  document.body.classList.add("modal-open");
  els.optionsBtn?.setAttribute("aria-expanded", "true");
  // Focus first control
  window.setTimeout(() => {
    els.optionsBody?.querySelector("#opt-sound")?.focus();
  }, 50);
}

function closeOptions() {
  state.optionsOpen = false;
  if (!els.optionsModal) return;
  els.optionsModal.classList.remove("is-open");
  els.optionsModal.hidden = true;
  document.body.classList.remove("modal-open");
  els.optionsBtn?.setAttribute("aria-expanded", "false");
}

function bindOptionsUi() {
  els.optionsBtn?.addEventListener("click", () => {
    if (state.optionsOpen) closeOptions();
    else openOptions();
  });

  els.optionsModal?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t?.dataset?.optionsClose != null) {
      closeOptions();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.optionsOpen) {
      closeOptions();
    }
  });
}

// ─── Events from data refresh ──────────────────────────────────

/**
 * Detect changes vs previous snapshot, store cards, queue celebrations.
 * @param {any} data
 */
function handleDataEvents(data) {
  const events = processDataForEvents(data);
  if (!events.length) return;

  state.notifications = addNotificationsFromEvents(events);

  for (const ev of events) {
    if (ev.celebrate && ev.type === "gold") {
      queueGoldCelebration({
        recipient: ev.recipient,
        discipline: ev.discipline,
      });
    }
  }
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
    handleDataEvents(data);
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

  state.notifications = loadNotifications();
  preloadCelebrationSound();

  // Show cache immediately if available (no event detection — wait for network)
  const cached = loadCachedData();
  if (cached) {
    state.data = cached;
    setStatus("…", "loading");
  }

  updateNav();
  render();
  bindOptionsUi();

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
