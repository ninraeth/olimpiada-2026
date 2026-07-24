/**
 * Newspaper-style notifications (extra layer on top of regular events).
 *
 * Triggers:
 *  - Team sports + Badminton: results from semi-finals onward
 *  - Basketball / Piłka ind.: final medal announcement (gold set)
 *
 * Skips silently when text template or background file is missing.
 */

import {
  NEWSPAPER_TEXT_USAGE_KEY,
  NEWSPAPER_BG_USAGE_KEY,
} from "./config.js";
import { parseMatchScore } from "./data.js";
import { newspaperTexts } from "./newspaperTexts.js";
import {
  newspaperBackgrounds,
  NEWSPAPER_DATA_FILES,
} from "./newspaperBackgrounds.js";

/** @typedef {'semi' | 'third' | 'final'} MatchStage */

const AVAILABLE_BG = new Set(NEWSPAPER_DATA_FILES);

/** Tab id → texts/backgrounds key */
const DISC_KEY = {
  pilka: "pilkaNozna",
  siatkowka: "siatkowka",
  badminton: "badminton",
  koszykowka: "koszykowka",
  pilka_ind: "pilkaInd",
};

function cellStr(v) {
  return String(v ?? "").trim();
}

function normKey(s) {
  return cellStr(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/\s+/g, " ")
    .trim();
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Classify match phase: semi | third | final | null (ignore).
 * @param {string} phase
 * @returns {MatchStage|null}
 */
export function classifyMatchStage(phase) {
  const p = normKey(phase);
  if (!p) return null;

  // Mecz o 3. miejsce
  if (
    /o\s*3/.test(p) ||
    /3\s*\.?\s*miejsc/.test(p) ||
    /br[a]?z/.test(p) ||
    /third/.test(p) ||
    /bronze/.test(p)
  ) {
    return "third";
  }

  // Półfinał / 1/2 (check before plain "finał")
  if (
    /pol\s*fina/.test(p) ||
    /polfina/.test(p) ||
    /1\s*\/\s*2/.test(p) ||
    /\bsemi\b/.test(p) ||
    /polfinal/.test(p)
  ) {
    return "semi";
  }

  // Finał
  if (/\bfina/.test(p) || p === "final" || /grand\s*final/.test(p)) {
    return "final";
  }

  return null;
}

/**
 * Score margin dominant?
 * @param {string} tabId
 * @param {string} score
 * @returns {boolean|null} null if score unparsable
 */
export function isDominantVictory(tabId, score) {
  const parsed = parseMatchScore(score);
  if (!parsed) return null;
  const diff = Math.abs(parsed.a - parsed.b);
  if (tabId === "siatkowka") return diff >= 2;
  if (tabId === "pilka") return diff >= 3;
  if (tabId === "badminton") return diff >= 2;
  return diff >= 2;
}

/**
 * Individual: dominant if (1st − 2nd) ≥ mean consecutive gap among the rest.
 * @param {{ scoreNum?: number|null }[]} players
 * @returns {boolean|null}
 */
export function isDominantIndividual(players) {
  const scores = (players || [])
    .map((p) => p.scoreNum)
    .filter((n) => n != null && Number.isFinite(n))
    .sort((a, b) => b - a);
  if (scores.length < 2) return null;
  const gapTop = scores[0] - scores[1];
  if (scores.length === 2) {
    // No "remaining" gaps — treat any positive gap as close unless huge; use close
    return false;
  }
  const restGaps = [];
  for (let i = 1; i < scores.length - 1; i++) {
    restGaps.push(scores[i] - scores[i + 1]);
  }
  if (!restGaps.length) return false;
  const mean =
    restGaps.reduce((a, b) => a + b, 0) / restGaps.length;
  return gapTop >= mean;
}

/**
 * Normalize a background entry to a filename present in data/ if possible.
 * Accepts "targi", "targi.jpg", "data/targi.jpg".
 * @param {unknown} raw
 * @returns {string|null} e.g. "targi.jpg"
 */
export function normalizeBackgroundFile(raw) {
  let s = cellStr(raw);
  if (!s || s === "...") return null;
  s = s.replace(/^.*[\\/]/, ""); // strip path
  if (!s) return null;
  // Allow stem without extension
  if (!/\.[a-z0-9]+$/i.test(s)) {
    const withJpg = `${s}.jpg`;
    if (AVAILABLE_BG.has(withJpg)) return withJpg;
    // try other known extensions from AVAILABLE_BG
    for (const f of AVAILABLE_BG) {
      if (f.replace(/\.[^.]+$/, "") === s) return f;
    }
    return null;
  }
  if (AVAILABLE_BG.has(s)) return s;
  return null;
}

/**
 * Resolve background for an event key.
 * Value in newspaperBackgrounds may be:
 *   - string: "targi.jpg" or "targi"
 *   - array:  ["targi", "rzecz"] — pick next unused in order (localStorage)
 * Missing / "..." / unknown files → null (skip newspaper).
 *
 * @param {string} bgKey e.g. "badminton_semi_close"
 * @returns {string|null} relative URL data/…
 */
export function resolveBackgroundUrl(bgKey) {
  const entry = newspaperBackgrounds[bgKey];
  if (entry == null) return null;

  /** @type {string[]} */
  let candidates = [];
  if (Array.isArray(entry)) {
    candidates = entry.map((x) => normalizeBackgroundFile(x)).filter(Boolean);
  } else {
    const one = normalizeBackgroundFile(entry);
    if (one) candidates = [one];
  }
  if (!candidates.length) return null;

  // Sequential rotation per bgKey (same idea as text pools)
  const picked = pickSequential(NEWSPAPER_BG_USAGE_KEY, `bg:${bgKey}`, candidates);
  return picked ? `data/${picked}` : null;
}

/**
 * @param {string} discKey
 * @param {MatchStage|'individual'} stage
 * @param {boolean} dominant
 */
function textArrayFor(discKey, stage, dominant) {
  const pack = newspaperTexts[discKey];
  if (!pack) return null;
  if (stage === "final") {
    return dominant ? pack.finalDominant : pack.finalClose;
  }
  // semi, third, individual
  return dominant ? pack.dominant : pack.close;
}

/**
 * Stable key for sequential text rotation (per array in newspaperTexts).
 * @param {string} discKey
 * @param {MatchStage|'individual'} stage
 * @param {boolean} dominant
 */
export function textPoolKey(discKey, stage, dominant) {
  if (stage === "final") {
    return `${discKey}.${dominant ? "finalDominant" : "finalClose"}`;
  }
  // semi / third / individual share close|dominant arrays
  return `${discKey}.${dominant ? "dominant" : "close"}`;
}

/**
 * Background map key for an event.
 * @param {string} discKey
 * @param {MatchStage|'individual'} stage
 * @param {boolean} dominant
 */
export function backgroundKeyFor(discKey, stage, dominant) {
  if (stage === "individual") {
    return `${discKey}_${dominant ? "dominant" : "close"}`;
  }
  if (stage === "third") {
    return `${discKey}_third`;
  }
  if (stage === "final") {
    return `${discKey}_final_${dominant ? "dominant" : "close"}`;
  }
  // semi
  return `${discKey}_semi_${dominant ? "dominant" : "close"}`;
}

/**
 * @param {string} storageKey
 * @returns {Record<string, number>} poolKey → next index
 */
function loadUsageMap(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} storageKey
 * @param {Record<string, number>} state
 */
function saveUsageMap(storageKey, state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

/**
 * Take next item in order for a named pool; wrap when exhausted.
 * Progress is stored in localStorage under storageKey.
 *
 * @param {string} storageKey localStorage key for the usage map
 * @param {string} poolKey e.g. "pilkaNozna.close" or "bg:badminton_semi_close"
 * @param {string[]} items non-empty candidates (already filtered)
 * @returns {string|null}
 */
export function pickSequential(storageKey, poolKey, items) {
  if (!items?.length) return null;
  const state = loadUsageMap(storageKey);
  let idx = Number(state[poolKey]);
  if (!Number.isFinite(idx) || idx < 0) idx = 0;
  idx = idx % items.length;
  const value = items[idx];
  state[poolKey] = (idx + 1) % items.length;
  saveUsageMap(storageKey, state);
  return value;
}

/**
 * Take next unused template in order for this pool; wrap when exhausted.
 *
 * @param {string} poolKey e.g. "pilkaNozna.close"
 * @param {string[]|null|undefined} arr
 * @returns {string|null}
 */
export function pickTemplate(poolKey, arr) {
  if (!arr?.length) return null;
  const usable = arr.map((t) => cellStr(t)).filter(Boolean);
  if (!usable.length) return null;
  return pickSequential(NEWSPAPER_TEXT_USAGE_KEY, poolKey, usable);
}

/**
 * @param {string} raw
 * @returns {{ headline: string, body: string }}
 */
export function parseNewspaperTemplate(raw) {
  const s = cellStr(raw);
  const m = s.match(/^\[\[([\s\S]*?)\]\]\s*([\s\S]*)$/);
  if (m) {
    return { headline: cellStr(m[1]), body: cellStr(m[2]) };
  }
  return { headline: "", body: s };
}

/**
 * @param {string} text
 * @param {Record<string, string>} map
 */
export function applyPlaceholders(text, map) {
  let out = String(text ?? "");
  for (const [key, val] of Object.entries(map)) {
    const token = key.startsWith("#") ? key : `#${key}`;
    out = out.split(token).join(val ?? "");
  }
  return out;
}

/**
 * @param {{ name: string, players?: string[] }[]|null|undefined} teams
 * @param {string} teamName
 */
function rosterForTeam(teams, teamName) {
  const key = normKey(teamName);
  if (!key || !teams?.length) return "";
  const team = teams.find((t) => normKey(t.name) === key);
  if (!team) return "";
  const list = Array.isArray(team.players) ? team.players.filter(Boolean) : [];
  return list.join(", ");
}

/**
 * Winner / loser from score.
 * @param {string} side1
 * @param {string} side2
 * @param {string} score
 */
function sidesFromScore(side1, side2, score) {
  const parsed = parseMatchScore(score);
  if (!parsed || parsed.a === parsed.b) {
    return { winner: side1, loser: side2, score };
  }
  if (parsed.a > parsed.b) {
    return { winner: side1, loser: side2, score };
  }
  return { winner: side2, loser: side1, score };
}

/**
 * Find bronze match winner in discipline matches.
 * @param {any[]} matches
 */
function thirdPlaceWinner(matches) {
  for (const m of matches || []) {
    if (classifyMatchStage(m.phase) !== "third") continue;
    if (!cellStr(m.score)) continue;
    const { winner } = sidesFromScore(m.side1, m.side2, m.score);
    if (winner) return winner;
  }
  return "";
}

/**
 * Final match gold/silver from scored final.
 * @param {any[]} matches
 */
function finalistsFromMatches(matches) {
  for (const m of matches || []) {
    if (classifyMatchStage(m.phase) !== "final") continue;
    if (!cellStr(m.score)) continue;
    const { winner, loser } = sidesFromScore(m.side1, m.side2, m.score);
    return { gold: winner, silver: loser };
  }
  return { gold: "", silver: "" };
}

/**
 * Medal name by type.
 * @param {any[]} medals
 * @param {string} type złoty|srebrny|brązowy
 */
function medalName(medals, type) {
  const row = (medals || []).find((m) => m.medal === type);
  return cellStr(row?.name);
}

/**
 * Build one newspaper DetectedEvent-like object, or null if skip.
 * @param {object} opts
 */
function buildNewspaperEvent(opts) {
  const {
    discKey,
    stage,
    dominant,
    placeholders,
    tabId,
    disciplineLabel,
  } = opts;

  const templates = textArrayFor(discKey, stage, dominant);
  const poolKey = textPoolKey(discKey, stage, dominant);
  const template = pickTemplate(poolKey, templates);
  if (!template) return null;

  const bgKey = backgroundKeyFor(discKey, stage, dominant);
  const background = resolveBackgroundUrl(bgKey);
  if (!background) return null;

  const filled = applyPlaceholders(template, placeholders);
  const { headline, body } = parseNewspaperTemplate(filled);
  if (!headline && !body) return null;

  const title = headline || "Wydanie specjalne";
  const plainBody = body || headline;

  return {
    type: "newspaper",
    title,
    body: plainBody,
    bodyHtml: undefined,
    discipline: disciplineLabel,
    tabId,
    celebrate: false,
    newspaper: {
      background,
      headline,
      body: plainBody,
      bgKey,
      stage,
      dominant: Boolean(dominant),
    },
  };
}

/**
 * Detect newspaper events from snapshot diff (same prev/next as regular).
 * @param {object|null} prev
 * @param {object} next
 * @param {any} data
 * @returns {import('./notifications.js').DetectedEvent[]}
 */
export function detectNewspaperEvents(prev, next, data) {
  if (!prev || !next) return [];
  /** @type {any[]} */
  const events = [];
  const disciplines = data?.disciplines || {};

  // ── Team + badminton knockout matches ────────────────────────
  const matchTabs = ["pilka", "siatkowka", "badminton"];
  const prevMatches = prev.matches || {};
  const nextMatches = next.matches || {};

  for (const [key, score] of Object.entries(nextMatches)) {
    if (!score || prevMatches[key]) continue; // only brand-new results
    const [tabId, , , , idxStr] = key.split("|");
    if (!matchTabs.includes(tabId)) continue;
    const discKey = DISC_KEY[tabId];
    if (!discKey) continue;

    const disc = disciplines[tabId];
    const idx = Number(idxStr);
    const m = disc?.matches?.[idx];
    if (!m) continue;

    const stage = classifyMatchStage(m.phase);
    if (!stage) continue;

    const dominantFlag = isDominantVictory(tabId, score);
    if (dominantFlag == null) continue;
    const dominant = dominantFlag;

    const { winner, loser } = sidesFromScore(m.side1, m.side2, score);
    const finals = finalistsFromMatches(disc.matches || []);
    const bronze = thirdPlaceWinner(disc.matches || []);

    let zloty = "";
    let srebrny = "";
    let brazowy = bronze;
    let skladzloto = "";

    if (stage === "final") {
      zloty = winner;
      srebrny = loser;
      skladzloto = rosterForTeam(disc.teams, winner);
    } else {
      zloty = finals.gold;
      srebrny = finals.silver;
      if (finals.gold) {
        skladzloto = rosterForTeam(disc.teams, finals.gold);
      }
    }
    if (stage === "third") {
      brazowy = winner;
    }

    const placeholders = {
      "#wygrany": winner || "",
      "#przegrany": loser || "",
      "#wynik": cellStr(score),
      "#zloty": zloty,
      "#srebrny": srebrny,
      "#brazowy": brazowy,
      "#skladzloto": skladzloto,
    };

    const ev = buildNewspaperEvent({
      discKey,
      stage,
      dominant,
      placeholders,
      tabId,
      disciplineLabel: disc?.title || tabId,
    });
    if (ev) events.push(ev);
  }

  // ── Individual medal announcements ───────────────────────────
  for (const tabId of ["koszykowka", "pilka_ind"]) {
    const discKey = DISC_KEY[tabId];
    const goldKey = `${tabId}::`;
    const prevGold = cellStr(prev.golds?.[goldKey] || "");
    const nextGold = cellStr(next.golds?.[goldKey] || "");
    if (!nextGold || normKey(prevGold) === normKey(nextGold)) continue;

    const disc = disciplines[tabId];
    const medals = disc?.medals || [];
    const dominantFlag = isDominantIndividual(disc?.players || []);
    if (dominantFlag == null) continue;
    const dominant = dominantFlag;

    const placeholders = {
      "#wygrany": nextGold,
      "#przegrany": medalName(medals, "srebrny"),
      "#wynik": "",
      "#zloty": medalName(medals, "złoty") || nextGold,
      "#srebrny": medalName(medals, "srebrny"),
      "#brazowy": medalName(medals, "brązowy"),
      "#skladzloto": "",
    };

    const ev = buildNewspaperEvent({
      discKey,
      stage: "individual",
      dominant,
      placeholders,
      tabId,
      disciplineLabel: disc?.title || tabId,
    });
    if (ev) events.push(ev);
  }

  return events;
}
