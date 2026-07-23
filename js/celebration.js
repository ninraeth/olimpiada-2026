/**
 * Gold-medal celebration overlay + sound.
 */

import {
  GOLD_MEDAL_SOUND_URL,
  CELEBRATION_DURATION_MS,
} from "./config.js";
import { isSoundEnabled } from "./notifications.js";

/** @type {Array<{ recipient: string, discipline: string }>} */
const queue = [];
let active = false;
let hideTimer = 0;
/** @type {AudioContext|null} */
let audioCtx = null;
/** @type {HTMLAudioElement|null} */
let medalAudio = null;
let medalAudioReady = false;
let medalAudioFailed = false;

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
 * Try to preload optional mp3; failures fall back to Web Audio.
 */
export function preloadCelebrationSound() {
  if (medalAudio || medalAudioFailed) return;
  try {
    const a = new Audio(GOLD_MEDAL_SOUND_URL);
    a.preload = "auto";
    a.addEventListener(
      "canplaythrough",
      () => {
        medalAudioReady = true;
      },
      { once: true }
    );
    a.addEventListener(
      "error",
      () => {
        medalAudioFailed = true;
        medalAudio = null;
        medalAudioReady = false;
      },
      { once: true }
    );
    medalAudio = a;
  } catch {
    medalAudioFailed = true;
    medalAudio = null;
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

/**
 * Built-in triumphant chime (no external file required).
 */
function playFallbackChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const notes = [
    { f: 523.25, t: 0, d: 0.18 }, // C5
    { f: 659.25, t: 0.12, d: 0.18 }, // E5
    { f: 783.99, t: 0.24, d: 0.22 }, // G5
    { f: 1046.5, t: 0.4, d: 0.55 }, // C6
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

  // Soft sparkle layer
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

function playMedalSound() {
  if (!isSoundEnabled()) return;

  if (medalAudio && medalAudioReady && !medalAudioFailed) {
    try {
      medalAudio.currentTime = 0;
      const p = medalAudio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => playFallbackChime());
      }
      return;
    } catch {
      /* fall through */
    }
  }
  playFallbackChime();
}

function confettiPieces(count = 48) {
  const colors = ["#fbbf24", "#f59e0b", "#fde68a", "#38bdf8", "#f472b6", "#34d399", "#fff"];
  let html = "";
  for (let i = 0; i < count; i++) {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.8;
    const dur = 2.2 + Math.random() * 1.8;
    const size = 6 + Math.random() * 8;
    const color = colors[i % colors.length];
    const rot = Math.random() * 360;
    const drift = (Math.random() - 0.5) * 120;
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
  const spots = [
    { x: 18, y: 22 },
    { x: 82, y: 18 },
    { x: 50, y: 12 },
    { x: 30, y: 35 },
    { x: 70, y: 32 },
  ];
  spots.forEach((s, i) => {
    html += `<span class="celeb-firework" style="--fx:${s.x}%;--fy:${s.y}%;--fd:${0.15 * i}s"></span>`;
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
      <div class="celeb-backdrop"></div>
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
  root.querySelector("[data-celeb-close]")?.addEventListener("click", close);
  root.querySelector(".celeb-backdrop")?.addEventListener("click", close);

  // Enter animation frame
  requestAnimationFrame(() => {
    root.querySelector(".celeb-overlay")?.classList.add("is-visible");
  });

  playMedalSound();

  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hideOverlay(false), CELEBRATION_DURATION_MS);
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
  clearTimeout(hideTimer);
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
 * Queue a gold celebration (shown one at a time).
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
