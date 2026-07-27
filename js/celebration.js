/**
 * Gold-medal celebration overlay + sound.
 * Stays until the user dismisses (no auto-hide).
 */

import { getSelectedMedalSound, isSoundEnabled } from "./notifications.js";

/** @type {Array<{ recipient: string, discipline: string }>} */
const queue = [];
let active = false;
/** @type {AudioContext|null} */
let audioCtx = null;
/** @type {Map<string, { audio: HTMLAudioElement, ready: boolean, failed: boolean }>} */
const fileSounds = new Map();

function ensureOverlayRoot() {
  let root = document.getElementById("celebration-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "celebration-root";
    root.setAttribute("aria-live", "assertive");
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Preload currently selected medal sound (no autoplay / no option preview).
 */
export function preloadCelebrationSound() {
  const selected = getSelectedMedalSound();
  const url = selected?.url;
  if (!url || fileSounds.has(url)) return;
  try {
    const a = new Audio(url);
    a.preload = "auto";
    const entry = { audio: a, ready: false, failed: false };
    a.addEventListener(
      "canplaythrough",
      () => {
        entry.ready = true;
      },
      { once: true }
    );
    a.addEventListener(
      "error",
      () => {
        entry.failed = true;
        entry.ready = false;
      },
      { once: true }
    );
    fileSounds.set(url, entry);
  } catch {
    /* ignore */
  }
}

function getAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  return audioCtx;
}

/** Built-in triumphant chime ("Domyślny"). */
function playDefaultChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const notes = [
    { f: 523.25, t: 0, d: 0.18 },
    { f: 659.25, t: 0.12, d: 0.18 },
    { f: 783.99, t: 0.24, d: 0.22 },
    { f: 1046.5, t: 0.4, d: 0.55 },
  ];

  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = n.f;
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(0.22, now + n.t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.02);
  }

  const sparkle = ctx.createOscillator();
  const sg = ctx.createGain();
  sparkle.type = "sine";
  sparkle.frequency.setValueAtTime(1568, now + 0.45);
  sparkle.frequency.exponentialRampToValueAtTime(2093, now + 0.9);
  sg.gain.setValueAtTime(0.0001, now + 0.45);
  sg.gain.exponentialRampToValueAtTime(0.08, now + 0.5);
  sg.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  sparkle.connect(sg);
  sg.connect(ctx.destination);
  sparkle.start(now + 0.45);
  sparkle.stop(now + 1.15);
}

/**
 * Play selected medal sound. File failure → default chime.
 * Does nothing if sounds disabled. Never used for option previews.
 */
function playMedalSound() {
  if (!isSoundEnabled()) return;

  const selected = getSelectedMedalSound();
  if (!selected?.url) {
    playDefaultChime();
    return;
  }

  let entry = fileSounds.get(selected.url);
  if (!entry) {
    try {
      const a = new Audio(selected.url);
      entry = { audio: a, ready: false, failed: false };
      a.addEventListener(
        "canplaythrough",
        () => {
          entry.ready = true;
        },
        { once: true }
      );
      a.addEventListener(
        "error",
        () => {
          entry.failed = true;
        },
        { once: true }
      );
      fileSounds.set(selected.url, entry);
      a.load();
    } catch {
      playDefaultChime();
      return;
    }
  }

  if (entry.failed) {
    playDefaultChime();
    return;
  }

  try {
    entry.audio.currentTime = 0;
    const p = entry.audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => playDefaultChime());
    }
  } catch {
    playDefaultChime();
  }
}

function confettiPieces(count = 64) {
  const colors = [
    "#fbbf24",
    "#f59e0b",
    "#fde68a",
    "#38bdf8",
    "#f472b6",
    "#34d399",
    "#fff",
  ];
  let html = "";
  for (let i = 0; i < count; i++) {
    const left = Math.random() * 100;
    // Stagger across full cycle so loops feel continuous
    const delay = Math.random() * 3.2;
    const dur = 2.4 + Math.random() * 2.2;
    const size = 6 + Math.random() * 8;
    const color = colors[i % colors.length];
    const rot = Math.random() * 360;
    const drift = (Math.random() - 0.5) * 140;
    html += `<span class="celeb-confetti" style="
      --c-left:${left}%;
      --c-delay:${delay}s;
      --c-dur:${dur}s;
      --c-size:${size}px;
      --c-color:${color};
      --c-rot:${rot}deg;
      --c-drift:${drift}px;
    "></span>`;
  }
  return html;
}

function fireworkBursts() {
  let html = "";
  // Multiple layers with different periods so bursts keep reappearing
  const spots = [
    { x: 18, y: 18, d: 0, dur: 1.2 },
    { x: 82, y: 16, d: 0.35, dur: 1.35 },
    { x: 50, y: 10, d: 0.7, dur: 1.15 },
    { x: 28, y: 32, d: 0.2, dur: 1.5 },
    { x: 72, y: 30, d: 0.55, dur: 1.4 },
    { x: 12, y: 42, d: 0.9, dur: 1.25 },
    { x: 88, y: 40, d: 1.1, dur: 1.45 },
    { x: 40, y: 22, d: 1.4, dur: 1.3 },
    { x: 60, y: 38, d: 0.45, dur: 1.55 },
    { x: 50, y: 48, d: 1.6, dur: 1.2 },
  ];
  spots.forEach((s) => {
    html += `<span class="celeb-firework" style="--fx:${s.x}%;--fy:${s.y}%;--fd:${s.d}s;--c-burst-dur:${s.dur}s"></span>`;
  });
  return html;
}

/**
 * @param {{ recipient: string, discipline: string }} item
 */
function showOverlay(item) {
  const root = ensureOverlayRoot();
  const who = item.recipient || "Zwycięzca";
  const disc = item.discipline || "konkurencji";

  root.innerHTML = `
    <div class="celeb-overlay" role="dialog" aria-modal="true" aria-label="Złoty medal">
      <div class="celeb-backdrop" data-celeb-close></div>
      <div class="celeb-fx" aria-hidden="true">
        ${confettiPieces()}
        ${fireworkBursts()}
      </div>
      <div class="celeb-card">
        <button type="button" class="celeb-close" data-celeb-close aria-label="Zamknij">×</button>
        <div class="celeb-wreath" aria-hidden="true">
          <span class="celeb-wreath-left">🌿</span>
          <div class="celeb-medal" aria-hidden="true">
            <span class="celeb-medal-ring"></span>
            <span class="celeb-medal-core">🥇</span>
          </div>
          <span class="celeb-wreath-right">🌿</span>
        </div>
        <p class="celeb-kicker">Złoty medal</p>
        <h2 class="celeb-who">${escapeHtml(who)}</h2>
        <p class="celeb-disc">w konkurencji <strong>${escapeHtml(disc)}</strong></p>
      </div>
    </div>
  `;

  const close = () => hideOverlay(true);
  root.querySelectorAll("[data-celeb-close]").forEach((el) => {
    el.addEventListener("click", close);
  });

  requestAnimationFrame(() => {
    root.querySelector(".celeb-overlay")?.classList.add("is-visible");
  });

  playMedalSound();
  // No auto-dismiss — user closes manually
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {boolean} immediate
 */
function hideOverlay(immediate) {
  const root = document.getElementById("celebration-root");
  const overlay = root?.querySelector(".celeb-overlay");
  if (!overlay) {
    active = false;
    drainQueue();
    return;
  }
  if (immediate) {
    if (root) root.innerHTML = "";
    active = false;
    drainQueue();
    return;
  }
  overlay.classList.remove("is-visible");
  overlay.classList.add("is-leaving");
  window.setTimeout(() => {
    if (root) root.innerHTML = "";
    active = false;
    drainQueue();
  }, 380);
}

function drainQueue() {
  if (active) return;
  const next = queue.shift();
  if (!next) return;
  active = true;
  showOverlay(next);
}

/**
 * Queue a gold celebration (shown one at a time until dismissed).
 * @param {{ recipient?: string, discipline?: string }} event
 */
export function queueGoldCelebration(event) {
  queue.push({
    recipient: event.recipient || "Zwycięzca",
    discipline: event.discipline || "konkurencji",
  });
  drainQueue();
}

/** Clear pending celebrations (not the visible one). */
export function clearCelebrationQueue() {
  queue.length = 0;
}
