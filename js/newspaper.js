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
  NEWSPAPER_FIRED_KEY,
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
    /\bbr[a]?z/.test(p) ||
    /\bthird\b/.test(p) ||
    /\bbronze\b/.test(p)
  ) {
    return "third";
  }

  // Early knockout rounds — NOT newspaper territory (must run before "finał")
  // "1/4 Finału" previously matched final via /\bfina/ — bug.
  if (
    /1\s*\/\s*(4|8|16|32)\b/.test(p) ||
    /cwierc/.test(p) ||
    /quarter/.test(p) ||
    /osem\s*fina/.test(p) ||
    /osemfina/.test(p) ||
    /round\s*of\s*(16|32)/.test(p)
  ) {
    return null;
  }

  // Półfinał / 1/2
  if (
    /pol\s*fina/.test(p) ||
    /polfina/.test(p) ||
    /1\s*\/\s*2\b/.test(p) ||
    /\bsemi\b/.test(p) ||
    /polfinal/.test(p)
  ) {
    return "semi";
  }

  // Finał only (not 1/4, 1/2, pół-, ćwierć-)
  if (
    /grand\s*final/.test(p) ||
    /^final(owy|owa|owe|u)?$/.test(p) ||
    /^(mecz\s+)?final(owy|owa|owe)?$/.test(p) ||
    (/\bfinal\b/.test(p) && !/pol/.test(p) && !/1\s*\//.test(p) && !/cwierc/.test(p))
  ) {
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
  // Leading "./" keeps url() stable relative to the app root
  return picked ? `./data/${picked}` : null;
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
 * Candidates for a text pool key (`pilkaNozna.close`, …).
 * @param {string} poolKey
 * @returns {string[]}
 */
export function textPoolItems(poolKey) {
  const i = String(poolKey).indexOf(".");
  if (i < 0) return [];
  const discKey = poolKey.slice(0, i);
  const field = poolKey.slice(i + 1);
  const arr = newspaperTexts[discKey]?.[field];
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => cellStr(t)).filter(Boolean);
}

/**
 * Background filenames for a map key (`siatkowka_semi_close`, …).
 * @param {string} bgKey
 * @returns {string[]}
 */
export function bgPoolItems(bgKey) {
  const entry = newspaperBackgrounds[bgKey];
  if (entry == null) return [];
  if (Array.isArray(entry)) {
    return entry.map((x) => normalizeBackgroundFile(x)).filter(Boolean);
  }
  const one = normalizeBackgroundFile(entry);
  return one ? [one] : [];
}

/**
 * List every newspaper-worthy result currently in the live sheet
 * (knockout matches with scores + individual golds). Does not touch storage.
 *
 * @param {any} data
 * @returns {{ paperId: string, discKey: string, stage: string, dominant: boolean, textPoolKey: string, bgKey: string }[]}
 */
export function listNewspaperSlotsFromData(data) {
  /** @type {{ paperId: string, discKey: string, stage: string, dominant: boolean, textPoolKey: string, bgKey: string }[]} */
  const slots = [];
  const disciplines = data?.disciplines || {};
  const matchTabs = ["pilka", "siatkowka", "badminton"];

  for (const tabId of matchTabs) {
    const discKey = DISC_KEY[tabId];
    const disc = disciplines[tabId];
    if (!discKey || !disc?.matches?.length) continue;

    for (const m of disc.matches) {
      const score = cellStr(m.score);
      if (!score) continue;
      const stage = classifyMatchStage(m.phase);
      if (!stage) continue;
      const dominantFlag = isDominantVictory(tabId, score);
      if (dominantFlag == null) continue;
      const dominant = dominantFlag;
      const paperId = [
        "match",
        tabId,
        normKey(m.phase),
        normKey(m.side1),
        normKey(m.side2),
        score,
      ].join("|");
      const poolKey = textPoolKey(discKey, stage, dominant);
      const bgKey = backgroundKeyFor(discKey, stage, dominant);
      // Only count if this event could actually render (text + bg configured)
      if (!textPoolItems(poolKey).length) continue;
      if (!bgPoolItems(bgKey).length) continue;
      slots.push({
        paperId,
        discKey,
        stage,
        dominant,
        textPoolKey: poolKey,
        bgKey,
      });
    }
  }

  for (const tabId of ["koszykowka", "pilka_ind"]) {
    const discKey = DISC_KEY[tabId];
    const disc = disciplines[tabId];
    if (!discKey || !disc) continue;
    const gold = medalName(disc.medals || [], "złoty");
    if (!gold) continue;
    const dominantFlag = isDominantIndividual(disc.players || []);
    if (dominantFlag == null) continue;
    const dominant = dominantFlag;
    const paperId = `gold|${tabId}|${normKey(gold)}`;
    const poolKey = textPoolKey(discKey, "individual", dominant);
    const bgKey = backgroundKeyFor(discKey, "individual", dominant);
    if (!textPoolItems(poolKey).length) continue;
    if (!bgPoolItems(bgKey).length) continue;
    slots.push({
      paperId,
      discKey,
      stage: "individual",
      dominant,
      textPoolKey: poolKey,
      bgKey,
    });
  }

  return slots;
}

/**
 * Rebuild text/bg sequential counters from *actual* sheet results.
 * Fixes drift when fake/stale newspaper events advanced the pools.
 *
 * nextIndex[pool] = (number of counted events in that pool) % poolLength
 *
 * @param {any} data
 * @param {{ onlyFired?: boolean }} [opts]
 *   onlyFired: count only results already in NEWSPAPER_FIRED (for pre-pick align).
 *   default: count every legitimate slot in the live sheet (post-pick absolute).
 * @returns {{ text: Record<string, number>, bg: Record<string, number>, slots: number }}
 */
export function recomputeNewspaperUsageFromData(data, opts = {}) {
  const allSlots = listNewspaperSlotsFromData(data);
  let slots = allSlots;
  if (opts.onlyFired) {
    const fired = loadNewspaperFired();
    slots = allSlots.filter((s) => fired.has(s.paperId));
  }

  /** @type {Record<string, number>} */
  const textCounts = {};
  /** @type {Record<string, number>} */
  const bgCounts = {};

  for (const s of slots) {
    textCounts[s.textPoolKey] = (textCounts[s.textPoolKey] || 0) + 1;
    const bgStoreKey = `bg:${s.bgKey}`;
    bgCounts[bgStoreKey] = (bgCounts[bgStoreKey] || 0) + 1;
  }

  /** @type {Record<string, number>} */
  const textState = {};
  for (const [poolKey, count] of Object.entries(textCounts)) {
    const len = textPoolItems(poolKey).length;
    if (len > 0) textState[poolKey] = count % len;
  }

  /** @type {Record<string, number>} */
  const bgState = {};
  for (const [storeKey, count] of Object.entries(bgCounts)) {
    const bgKey = storeKey.startsWith("bg:") ? storeKey.slice(3) : storeKey;
    const len = bgPoolItems(bgKey).length;
    if (len > 0) bgState[storeKey] = count % len;
  }

  // Full replace — drops phantom pool keys advanced by false events
  saveUsageMap(NEWSPAPER_TEXT_USAGE_KEY, textState);
  saveUsageMap(NEWSPAPER_BG_USAGE_KEY, bgState);

  return { text: textState, bg: bgState, slots: slots.length };
}

/**
 * Drop "already told" newspaper ids that no longer exist in the live sheet
 * (e.g. phantom teams/scores from stale cache). Does not mark unfired reals.
 *
 * @param {any} data
 * @returns {number} how many phantom ids removed
 */
export function pruneNewspaperFiredToData(data) {
  const valid = new Set(listNewspaperSlotsFromData(data).map((s) => s.paperId));
  const fired = loadNewspaperFired();
  let removed = 0;
  for (const id of [...fired]) {
    if (!valid.has(id)) {
      fired.delete(id);
      removed++;
    }
  }
  if (removed) saveNewspaperFired(fired);
  return removed;
}

/**
 * Heal sequential counters + fired set from live tournament data.
 * Safe to call on every successful network load.
 * @param {any} data
 */
export function syncNewspaperStateFromData(data) {
  if (!data?.disciplines) return { slots: 0, pruned: 0 };
  const { slots } = recomputeNewspaperUsageFromData(data);
  const pruned = pruneNewspaperFiredToData(data);
  return { slots, pruned };
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

/** @returns {Set<string>} */
function loadNewspaperFired() {
  try {
    const raw = localStorage.getItem(NEWSPAPER_FIRED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

/** @param {Set<string>} set */
function saveNewspaperFired(set) {
  try {
    localStorage.setItem(NEWSPAPER_FIRED_KEY, JSON.stringify([...set]));
  } catch {
    /* quota */
  }
}

/**
 * Detect newspaper events for knockout results / medal announcements.
 *
 * Unlike regular notifications (diff-only), newspapers use a dedicated
 * "already told" set so stories still appear for results that were already
 * in the snapshot when the newspaper feature was added.
 *
 * First app session (no prev snapshot yet) only baselines — no spam.
 *
 * @param {object|null} prev
 * @param {object} next
 * @param {any} data
 * @returns {import('./notifications.js').DetectedEvent[]}
 */
export function detectNewspaperEvents(prev, next, data) {
  // Wait until regular system has baselined once
  if (!prev || !next) {
    // Drop phantom fired ids; counters = already-told reals only (usually 0).
    // Do NOT count all sheet results yet — they will fire on the next refresh.
    pruneNewspaperFiredToData(data);
    recomputeNewspaperUsageFromData(data, { onlyFired: true });
    return [];
  }

  // Align pools to legitimate stories already told (undo phantom advances)
  pruneNewspaperFiredToData(data);
  recomputeNewspaperUsageFromData(data, { onlyFired: true });

  /** @type {any[]} */
  const events = [];
  const disciplines = data?.disciplines || {};
  const fired = loadNewspaperFired();
  let dirty = false;

  const mark = (id) => {
    if (fired.has(id)) return false;
    fired.add(id);
    dirty = true;
    return true;
  };

  // ── Team + badminton knockout matches ────────────────────────
  const matchTabs = ["pilka", "siatkowka", "badminton"];

  for (const tabId of matchTabs) {
    const discKey = DISC_KEY[tabId];
    const disc = disciplines[tabId];
    if (!discKey || !disc?.matches?.length) continue;

    disc.matches.forEach((m) => {
      const score = cellStr(m.score);
      if (!score) return;

      const stage = classifyMatchStage(m.phase);
      if (!stage) return;

      // Identity without row index (stable when rows are inserted/reordered)
      const paperId = [
        "match",
        tabId,
        normKey(m.phase),
        normKey(m.side1),
        normKey(m.side2),
        score,
      ].join("|");
      if (!mark(paperId)) return;

      const dominantFlag = isDominantVictory(tabId, score);
      if (dominantFlag == null) {
        // Unparseable score — don't keep the id blocked forever
        fired.delete(paperId);
        dirty = true;
        return;
      }
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
        "#wynik": score,
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
      if (ev) {
        events.push(ev);
      } else {
        // Missing text/bg — allow retry later when config is filled
        fired.delete(paperId);
        dirty = true;
      }
    });
  }

  // ── Individual medal announcements ───────────────────────────
  for (const tabId of ["koszykowka", "pilka_ind"]) {
    const discKey = DISC_KEY[tabId];
    const disc = disciplines[tabId];
    if (!discKey || !disc) continue;

    const gold =
      medalName(disc.medals || [], "złoty") ||
      cellStr(next.golds?.[`${tabId}::`] || "");
    if (!gold) continue;

    const paperId = `gold|${tabId}|${normKey(gold)}`;
    if (!mark(paperId)) continue;

    const medals = disc.medals || [];
    const dominantFlag = isDominantIndividual(disc.players || []);
    if (dominantFlag == null) {
      fired.delete(paperId);
      dirty = true;
      continue;
    }
    const dominant = dominantFlag;

    const placeholders = {
      "#wygrany": gold,
      "#przegrany": medalName(medals, "srebrny"),
      "#wynik": "",
      "#zloty": medalName(medals, "złoty") || gold,
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
    if (ev) {
      events.push(ev);
    } else {
      fired.delete(paperId);
      dirty = true;
    }
  }

  if (dirty) saveNewspaperFired(fired);

  // Absolute resync: counters = f(real sheet), not f(whatever fired before).
  // Runs after pickSequential so a just-emitted story is included in the count.
  syncNewspaperStateFromData(data);

  return events;
}
