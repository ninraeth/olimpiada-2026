/**
 * In-app notifications & change detection.
 *
 * Compares a compact localStorage snapshot with freshly loaded tournament data
 * and emits typed events (match result, ranking leader, gold medal).
 * Notification cards are stored separately and shown on the Info tab.
 */

import {
  EVENTS_SNAPSHOT_KEY,
  NOTIFICATIONS_KEY,
  SETTINGS_KEY,
  DISCIPLINE_LABELS,
  BASKETBALL_SHOT_KEYS,
  FOOTBALL_IND_SHOT_KEYS,
  MEDAL_SOUNDS,
  DEFAULT_MEDAL_SOUND_ID,
} from "./config.js";
import { parseMatchScore } from "./data.js";

/** @typedef {'match_result' | 'leader' | 'gold'} NotificationType */

/**
 * @typedef {object} AppNotification
 * @property {string} id
 * @property {NotificationType} type
 * @property {string} title
 * @property {string} body plain-text fallback
 * @property {string} [bodyHtml] safe HTML (names escaped; green spans allowed)
 * @property {number} createdAt
 * @property {string} [discipline]
 * @property {string} [recipient]
 * @property {string} [tabId] discipline tab to open on click
 */

/**
 * @typedef {object} DetectedEvent
 * @property {NotificationType} type
 * @property {string} title
 * @property {string} body
 * @property {string} [bodyHtml]
 * @property {string} [discipline]
 * @property {string} [recipient]
 * @property {string} [tabId]
 * @property {boolean} [celebrate]
 */

const SNAPSHOT_VERSION = 1;
const MAX_NOTIFICATIONS = 80;

// ─── Settings ──────────────────────────────────────────────────

/** @returns {{ soundEnabled: boolean, medalSoundId: string }} */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { soundEnabled: true, medalSoundId: DEFAULT_MEDAL_SOUND_ID };
    }
    const parsed = JSON.parse(raw);
    const soundId =
      typeof parsed.medalSoundId === "string" &&
      MEDAL_SOUNDS.some((s) => s.id === parsed.medalSoundId)
        ? parsed.medalSoundId
        : DEFAULT_MEDAL_SOUND_ID;
    return {
      soundEnabled: parsed.soundEnabled !== false,
      medalSoundId: soundId,
    };
  } catch {
    return { soundEnabled: true, medalSoundId: DEFAULT_MEDAL_SOUND_ID };
  }
}

/** @param {Partial<{ soundEnabled: boolean, medalSoundId: string }>} patch */
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  if (
    next.medalSoundId &&
    !MEDAL_SOUNDS.some((s) => s.id === next.medalSoundId)
  ) {
    next.medalSoundId = DEFAULT_MEDAL_SOUND_ID;
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

export function isSoundEnabled() {
  return loadSettings().soundEnabled;
}

/** @returns {{ id: string, label: string, url: string|null }} */
export function getSelectedMedalSound() {
  const { medalSoundId } = loadSettings();
  return (
    MEDAL_SOUNDS.find((s) => s.id === medalSoundId) ||
    MEDAL_SOUNDS.find((s) => s.id === DEFAULT_MEDAL_SOUND_ID) ||
    MEDAL_SOUNDS[0]
  );
}

// ─── Notifications store ───────────────────────────────────────

/** @returns {AppNotification[]} */
export function loadNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** @param {AppNotification[]} list */
function persistNotifications(list) {
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

/**
 * Prepend events as notification cards (newest first).
 * @param {DetectedEvent[]} events
 * @returns {AppNotification[]}
 */
export function addNotificationsFromEvents(events) {
  if (!events?.length) return loadNotifications();
  const now = Date.now();
  const incoming = events.map((e, i) => ({
    id: `n_${now}_${i}_${Math.random().toString(36).slice(2, 8)}`,
    type: e.type,
    title: e.title,
    body: e.body,
    bodyHtml: e.bodyHtml || undefined,
    createdAt: now + (events.length - i),
    discipline: e.discipline,
    recipient: e.recipient,
    tabId: e.tabId,
  }));
  const merged = [...incoming, ...loadNotifications()].slice(0, MAX_NOTIFICATIONS);
  persistNotifications(merged);
  return merged;
}

/** @param {string} id */
export function dismissNotification(id) {
  const next = loadNotifications().filter((n) => n.id !== id);
  persistNotifications(next);
  return next;
}

export function clearAllNotifications() {
  persistNotifications([]);
  return [];
}

// ─── Snapshot extract / persist ────────────────────────────────

/** @returns {object|null} */
export function loadEventsSnapshot() {
  try {
    const raw = localStorage.getItem(EVENTS_SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || snap.v !== SNAPSHOT_VERSION) return null;
    return snap;
  } catch {
    return null;
  }
}

/** @param {object} snap */
export function saveEventsSnapshot(snap) {
  try {
    localStorage.setItem(
      EVENTS_SNAPSHOT_KEY,
      JSON.stringify({
        ...snap,
        v: SNAPSHOT_VERSION,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* quota */
  }
}

function cellStr(v) {
  return String(v ?? "").trim();
}

function normKey(s) {
  return cellStr(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function discLabel(id, fallback = "") {
  return DISCIPLINE_LABELS[id] || fallback || id;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Gender from Gracze directory: 0 woman, 1 man, null unknown.
 * @param {string} name
 * @param {any} data
 * @returns {0|1|null}
 */
export function genderForName(name, data) {
  const key = normKey(name);
  if (!key) return null;
  const dir = data?.playersDirectory || [];
  for (const p of dir) {
    if (normKey(p.name) === key && (p.gender === 0 || p.gender === 1)) {
      return p.gender;
    }
  }
  return null;
}

/**
 * Pick feminine/masculine form. Unknown → masculine.
 * @param {0|1|null|undefined} gender
 * @param {string} female
 * @param {string} male
 */
export function verbForm(gender, female, male) {
  return gender === 0 ? female : male;
}

/**
 * Whether the player's latest attempt has every shot key filled.
 * @param {any} player
 * @param {string[]} shotKeys
 */
export function isCurrentAttemptComplete(player, shotKeys) {
  const rows = player?.attemptRows;
  if (!rows?.length || !shotKeys?.length) return false;
  const current = rows[rows.length - 1];
  if (!current?.shots) return false;
  return shotKeys.every((k) => cellStr(current.shots[k]) !== "");
}

/**
 * @param {any} disc
 * @param {string[]} shotKeys
 * @returns {{ name: string, complete: boolean }|null}
 */
function skillLeaderSnapshot(disc, shotKeys) {
  const players = disc?.players || [];
  const withScore = players.filter(
    (p) => p.scoreNum != null && Number.isFinite(p.scoreNum)
  );
  if (withScore.length < 3) return null;
  const sorted = [...withScore].sort(
    (a, b) => (b.scoreNum ?? -Infinity) - (a.scoreNum ?? -Infinity)
  );
  const leader = sorted[0];
  if (!leader?.name) return null;
  return {
    name: leader.name,
    complete: isCurrentAttemptComplete(leader, shotKeys),
  };
}

/**
 * Gold medal slots: key → recipient display name.
 * @param {Record<string, any>} disciplines
 * @returns {Record<string, string>}
 */
function extractGolds(disciplines) {
  /** @type {Record<string, string>} */
  const golds = {};
  for (const [id, disc] of Object.entries(disciplines || {})) {
    if (disc?.competitions?.length) {
      for (const comp of disc.competitions) {
        const gold = (comp.medals || []).find((m) => m.medal === "złoty");
        const name = cellStr(gold?.name);
        if (!name) continue;
        golds[`${id}::${comp.name || ""}`] = name;
      }
    } else {
      const gold = (disc?.medals || []).find((m) => m.medal === "złoty");
      const name = cellStr(gold?.name);
      if (!name) continue;
      golds[`${id}::`] = name;
    }
  }
  return golds;
}

/**
 * Match scores keyed by stable identity.
 * @param {Record<string, any>} disciplines
 * @returns {Record<string, string>}
 */
function extractMatchScores(disciplines) {
  /** @type {Record<string, string>} */
  const out = {};
  const matchTabs = ["pilka", "siatkowka", "badminton"];
  for (const id of matchTabs) {
    const disc = disciplines?.[id];
    if (!disc?.matches?.length) continue;
    disc.matches.forEach((m, i) => {
      const score = cellStr(m.score);
      if (!score) return;
      const key = [
        id,
        normKey(m.phase),
        normKey(m.side1),
        normKey(m.side2),
        String(i),
      ].join("|");
      out[key] = score;
    });
  }
  return out;
}

/**
 * Compact snapshot used for change detection.
 * @param {any} data full tournament payload
 */
export function extractEventsSnapshot(data) {
  const disciplines = data?.disciplines || {};
  return {
    v: SNAPSHOT_VERSION,
    matches: extractMatchScores(disciplines),
    leaders: {
      koszykowka: skillLeaderSnapshot(
        disciplines.koszykowka,
        disciplines.koszykowka?.skillShotKeys || BASKETBALL_SHOT_KEYS
      ),
      pilka_ind: skillLeaderSnapshot(
        disciplines.pilka_ind,
        disciplines.pilka_ind?.skillShotKeys || FOOTBALL_IND_SHOT_KEYS
      ),
    },
    golds: extractGolds(disciplines),
  };
}

// ─── Diff → events ─────────────────────────────────────────────

/**
 * Match body: "Side1 (score) Side2" with winner marked green in HTML.
 * @param {string} side1
 * @param {string} side2
 * @param {string} score
 * @returns {{ body: string, bodyHtml: string }}
 */
export function matchResultBodies(side1, side2, score) {
  const s1 = cellStr(side1) || "—";
  const s2 = cellStr(side2) || "—";
  const sc = cellStr(score) || "—";
  const body = `${s1} (${sc}) ${s2}`;
  const parsed = parseMatchScore(sc);
  let bodyHtml;
  if (parsed && parsed.a > parsed.b) {
    bodyHtml = `<span class="notif-win">${escHtml(s1)}</span> (${escHtml(sc)}) ${escHtml(s2)}`;
  } else if (parsed && parsed.b > parsed.a) {
    bodyHtml = `${escHtml(s1)} (${escHtml(sc)}) <span class="notif-win">${escHtml(s2)}</span>`;
  } else {
    bodyHtml = `${escHtml(s1)} (${escHtml(sc)}) ${escHtml(s2)}`;
  }
  return { body, bodyHtml };
}

/**
 * Reconstruct match meta from key + live data.
 * @param {string} key
 * @param {any} data
 */
function matchFromKey(key, data) {
  const [id, , , , idxStr] = key.split("|");
  const idx = Number(idxStr);
  const disc = data?.disciplines?.[id];
  const m = disc?.matches?.[idx];
  return {
    id,
    label: discLabel(id, disc?.title),
    side1: m?.side1 || "—",
    side2: m?.side2 || "—",
    score: m?.score || "",
  };
}

/**
 * @param {object|null} prev
 * @param {object} next
 * @param {any} data live payload (for labels / match sides / gender)
 * @returns {DetectedEvent[]}
 */
export function detectEvents(prev, next, data) {
  if (!prev || !next) return [];
  /** @type {DetectedEvent[]} */
  const events = [];

  // A) New match results
  const prevMatches = prev.matches || {};
  const nextMatches = next.matches || {};
  for (const [key, score] of Object.entries(nextMatches)) {
    if (!score) continue;
    if (prevMatches[key] === score) continue;
    if (!prevMatches[key]) {
      const meta = matchFromKey(key, data);
      const { body, bodyHtml } = matchResultBodies(
        meta.side1,
        meta.side2,
        score || meta.score
      );
      events.push({
        type: "match_result",
        title: `${meta.label} - WYNIK MECZU`,
        body,
        bodyHtml,
        discipline: meta.label,
        tabId: meta.id,
        celebrate: false,
      });
    }
  }

  // B) New individual ranking leaders
  for (const id of ["koszykowka", "pilka_ind"]) {
    const prevL = prev.leaders?.[id] || null;
    const nextL = next.leaders?.[id] || null;
    if (!nextL?.name || !nextL.complete) continue;
    const prevName = prevL?.name ? normKey(prevL.name) : "";
    const nextName = normKey(nextL.name);
    if (!nextName) continue;
    const samePerson = prevName === nextName;
    if (samePerson && prevL?.complete) continue;
    const label = discLabel(id);
    const g = genderForName(nextL.name, data);
    const verb = verbForm(g, "została", "został");
    const nameEsc = escHtml(nextL.name);
    events.push({
      type: "leader",
      title: "Nowy lider rankingu",
      body: `${nextL.name} ${verb} nowym liderem w ${label}!`,
      bodyHtml: `<span class="notif-win">${nameEsc}</span> ${escHtml(verb)} nowym liderem w ${escHtml(label)}!`,
      discipline: label,
      recipient: nextL.name,
      tabId: id,
      celebrate: false,
    });
  }

  // C) New gold medals
  const prevGolds = prev.golds || {};
  const nextGolds = next.golds || {};
  for (const [slot, name] of Object.entries(nextGolds)) {
    if (!cellStr(name)) continue;
    if (normKey(prevGolds[slot] || "") === normKey(name)) continue;
    const [discId, compName] = slot.split("::");
    const baseLabel = discLabel(discId);
    const displayLabel =
      discId === "inne" && compName ? compName : baseLabel;
    const g = genderForName(name, data);
    const verb = verbForm(g, "zdobyła", "zdobył");
    const nameEsc = escHtml(name);
    events.push({
      type: "gold",
      title: "Złoty medal!",
      body: `${name} ${verb} złoty medal w ${displayLabel}!`,
      bodyHtml: `<span class="notif-win">${nameEsc}</span> ${escHtml(verb)} złoty medal w ${escHtml(displayLabel)}!`,
      discipline: displayLabel,
      recipient: name,
      tabId: discId,
      celebrate: true,
    });
  }

  return events;
}

/**
 * Run full detect cycle: load prev snapshot, compare, save next, return events.
 * First run (no prev) only baselines — no notifications.
 * @param {any} data
 * @returns {DetectedEvent[]}
 */
export function processDataForEvents(data) {
  const next = extractEventsSnapshot(data);
  const prev = loadEventsSnapshot();
  let events = [];
  if (prev) {
    events = detectEvents(prev, next, data);
  }
  saveEventsSnapshot(next);
  return events;
}
