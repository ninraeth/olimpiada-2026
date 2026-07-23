/**
 * Fetch and parse tournament data from Google Sheets.
 * Supports both new (# SEKCJA) and legacy layouts.
 */

import {
  TABS,
  exportCsvUrl,
  gvizCsvUrl,
  openSheetUrl,
  CACHE_KEY,
  BASKETBALL_SHOT_KEYS,
  FOOTBALL_IND_SHOT_KEYS,
} from "./config.js";

// ─── CSV helpers ───────────────────────────────────────────────

/**
 * Parse CSV text into rows of strings (handles quotes).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // ignore
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Strip leading empty columns (legacy layout starts at column B).
 * @param {string[][]} rows
 */
function stripLeadingEmptyCols(rows) {
  if (!rows.length) return rows;
  let minLead = Infinity;
  for (const row of rows) {
    let lead = 0;
    while (lead < row.length && !String(row[lead] ?? "").trim()) lead++;
    if (lead < row.length) minLead = Math.min(minLead, lead);
  }
  if (!Number.isFinite(minLead) || minLead === 0) return rows;
  return rows.map((r) => r.slice(minLead));
}

function cellStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

function isEmptyRow(row) {
  return !row || row.every((c) => !cellStr(c));
}

function isCommentRow(row) {
  const first = cellStr(row?.[0]);
  return first.startsWith("*") || first.startsWith("//");
}

function normalizeHeader(h) {
  return cellStr(h)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// ─── Section detection ─────────────────────────────────────────

const SECTION_MARKERS = {
  teams: /#\s*DRU[ŻZ]YNY/i,
  matches: /#\s*MECZE/i,
  ranking: /#\s*RANKING/i,
  players: /#\s*GRACZE/i,
  medals: /#\s*(STREFA\s*MEDALOWA|MEDALE)/i,
  section: /#\s*SEKCJA/i,
};

const LEGACY_SECTION = {
  teams: /^(DRU[ŻZ]YNY)$/i,
  matches: /^(MECZE)/i,
  ranking: /^(RANKING)/i,
  players: /^(GRACZE)$/i,
  medals: /^(STREFA\s*MEDALOWA|MEDALE)$/i,
};

/**
 * @param {string} text
 * @returns {"teams"|"matches"|"ranking"|"players"|"section"|null}
 */
function detectSectionMarker(text) {
  const t = cellStr(text);
  if (!t) return null;
  for (const [key, re] of Object.entries(SECTION_MARKERS)) {
    if (re.test(t)) return /** @type {any} */ (key);
  }
  for (const [key, re] of Object.entries(LEGACY_SECTION)) {
    if (re.test(t)) return /** @type {any} */ (key);
  }
  return null;
}

/**
 * Detect header row type from cell values.
 * @param {string[]} row
 */
function detectHeaderType(row) {
  const norms = row.map(normalizeHeader);
  const joined = norms.join(" | ");

  // Matches first — "Drużyna 1" / "Gracz 1" appear in match tables
  if (
    joined.includes("id_meczu") ||
    (joined.includes("faza") &&
      (joined.includes("druzyna 1") ||
        joined.includes("gracz 1") ||
        norms.some((h) => h === "druzyna 1" || h === "gracz 1")))
  ) {
    return "matches";
  }

  // Ranking: miejsce+gracz, or gracz + stats columns (gviz may drop "miejsce")
  if (
    (joined.includes("miejsce") &&
      (joined.includes("gracz") || joined.includes("uczestnik"))) ||
    (joined.includes("gracz") &&
      (joined.includes("zwyc") ||
        joined.includes("%") ||
        joined.includes("roznica") ||
        joined.includes("uwagi")) &&
      !joined.includes("id_"))
  ) {
    return "ranking";
  }

  // Medals before teams — headers "medal | nazwa | gracze" must not look like teams
  if (
    joined.includes("medal") &&
    (joined.includes("nazwa") ||
      joined.includes("gracze") ||
      joined.includes("sklad") ||
      joined.includes("skład"))
  ) {
    return "medals";
  }

  // Teams: ID + nazwa, players may be one "Gracze" col OR many "Gracz 1/2/3…" cols
  if (
    joined.includes("id_druzyny") ||
    joined.includes("nazwa druzyny") ||
    (joined.includes("nazwa") &&
      (joined.includes("gracze") || /gracz\s*\d/.test(joined)) &&
      !joined.includes("faza") &&
      !joined.includes("wynik (") &&
      !joined.includes("id_meczu") &&
      !joined.includes("medal"))
  ) {
    return "teams";
  }

  if (
    joined.includes("id_gracza") ||
    (joined.includes("imie gracza") && joined.includes("wynik")) ||
    (joined.includes("imie") && joined.includes("proba")) ||
    (joined.includes("imie") &&
      (joined.includes("karne") ||
        joined.includes("1na1") ||
        joined.includes("luta") ||
        joined.includes("1p")))
  ) {
    return "players";
  }

  return null;
}

function findCol(headers, predicates) {
  const norms = headers.map(normalizeHeader);
  for (const pred of predicates) {
    const idx = norms.findIndex(pred);
    if (idx >= 0) return idx;
  }
  return -1;
}

// ─── Row parsers ───────────────────────────────────────────────

/**
 * Parse a team roster row.
 * Supports:
 * - Legacy: ID | Nazwa | "Jan, Piotr, Adam" (comma-separated in one cell)
 * - New:    ID | Nazwa | Jan | Piotr | Adam | … (one player per column)
 * Mixed: cells may still contain comma lists; all columns after the team name
 * (or from the first "Gracze"/"Gracz N" header) are collected.
 *
 * @param {string[]} headers
 * @param {string[]} row
 */
function parseTeamRow(headers, row) {
  const idIdx = findCol(headers, [
    (h) => h.includes("id_druz"),
    (h) => h === "id",
  ]);
  const nameIdx = findCol(headers, [
    (h) => h.includes("nazwa druz") || h.includes("nazwa dru"),
    (h) => h.includes("nazwa") && !h.includes("gracz"),
    (h) => h === "druzyna" || h === "druzyna ",
  ]);

  let teamName = nameIdx >= 0 ? cellStr(row[nameIdx]) : "";
  if (!teamName) {
    // Fallback: first non-numeric cell that looks like a team label
    for (let i = 0; i < row.length; i++) {
      if (i === idIdx) continue;
      const c = cellStr(row[i]);
      if (!c || /^\d+(\.0+)?$/.test(c)) continue;
      teamName = c;
      break;
    }
  }
  if (!teamName) return null;
  if (
    /^id_/i.test(teamName) ||
    /^nazwa/i.test(teamName) ||
    /^\d+(\.0)?$/.test(teamName) ||
    /^(faza|final|fina[lł]|eliminacje|gracz|gracze|miejsce|mecz|wynik)/i.test(
      teamName
    )
  ) {
    return null;
  }

  // Where player columns start
  let startPlayers = findCol(headers, [
    (h) => h.includes("gracze") || h.includes("zawodnicy"),
    (h) => /^gracz(\s*\d+)?$/.test(h) || /^gracz\s+\d+/.test(h),
  ]);
  if (startPlayers < 0) {
    startPlayers = nameIdx >= 0 ? nameIdx + 1 : idIdx >= 0 ? idIdx + 2 : 2;
  }

  const width = Math.max(headers.length, row.length);
  /** @type {string[]} */
  const players = [];
  const seen = new Set();

  for (let i = startPlayers; i < width; i++) {
    if (i === nameIdx || i === idIdx) continue;

    const hNorm = normalizeHeader(headers[i] || "");
    // Safety: stop if a later section header leaked into a wide row
    if (
      hNorm === "faza" ||
      hNorm.includes("wynik (") ||
      hNorm.includes("id_meczu") ||
      hNorm === "miejsce"
    ) {
      break;
    }

    const cell = cellStr(row[i]);
    if (!cell) continue;
    // Skip pure header leftovers in data cells
    if (isJunkPlayerToken(cell)) continue;

    // One name per cell, OR still allow comma-separated legacy inside a cell
    for (const p of splitPlayerList(cell)) {
      if (isJunkPlayerToken(p)) continue;
      // Don't treat the team name itself as a player if repeated
      if (normName(p) === normName(teamName)) continue;
      const key = normName(p);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      players.push(p);
    }
  }

  return { name: teamName, players };
}

/**
 * Split roster cell: commas, semicolons, newlines, " i ".
 * Single name without separators → one-element list.
 * @param {string} raw
 * @returns {string[]}
 */
function splitPlayerList(raw) {
  const s = cellStr(raw);
  if (!s) return [];
  // If no common separators, whole cell is one player (new multi-column layout)
  if (!/[,;|\n\r]/.test(s) && !/\s+i\s+/i.test(s)) {
    return [s];
  }
  return s
    .split(/[,;|\n\r]+|\s+i\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * @param {string} p
 */
function isJunkPlayerToken(p) {
  const s = cellStr(p);
  if (!s) return true;
  if (/^id_/i.test(s)) return true;
  if (/^\d+(\.0+)?$/.test(s)) return true;
  if (
    /^(gracze|zawodnicy|nazwa|nazwa druzyny|faza|wynik|miejsce|uwagi|druzyna)$/i.test(
      normalizeHeader(s)
    )
  ) {
    return true;
  }
  if (/^gracze\s*\(/i.test(s)) return true;
  return false;
}

function parseMatchRow(headers, row) {
  const phaseIdx = findCol(headers, [(h) => h.includes("faza")]);
  const s1Idx = findCol(headers, [
    (h) => h.includes("druzyna 1") || h === "druzyna1",
    (h) => h.includes("gracz 1") || h === "gracz1",
  ]);
  const s2Idx = findCol(headers, [
    (h) => h.includes("druzyna 2") || h === "druzyna2",
    (h) => h.includes("gracz 2") || h === "gracz2",
  ]);
  const scoreIdx = findCol(headers, [
    (h) => h.includes("wynik"),
    (h) => h.includes("score"),
  ]);

  // Fallback layout: ID, Faza, Side1, Side2, Wynik
  const phase = phaseIdx >= 0 ? cellStr(row[phaseIdx]) : cellStr(row[1]);
  const side1 = s1Idx >= 0 ? cellStr(row[s1Idx]) : cellStr(row[2]);
  const side2 = s2Idx >= 0 ? cellStr(row[s2Idx]) : cellStr(row[3]);
  const score = scoreIdx >= 0 ? cellStr(row[scoreIdx]) : cellStr(row[4]);

  // Skip pure ID placeholder rows
  if (!phase && !side1 && !side2) return null;
  // Need at least a phase or one side
  if (!phase && !side1) return null;
  // Skip header-like
  if (/^faza$/i.test(phase) || /^id_/i.test(phase)) return null;

  return {
    phase: phase || "—",
    side1: side1 || "TBD",
    side2: side2 || "TBD",
    score: score || "",
  };
}

function parseRankingRow(headers, row) {
  const placeIdx = findCol(headers, [
    (h) => h.includes("miejsce"),
    (h) => h === "pos",
  ]);
  const playerIdx = findCol(headers, [
    (h) => h.includes("gracz"),
    (h) => h.includes("uczestnik"),
    (h) => h.includes("imie"),
  ]);
  const rateIdx = findCol(headers, [
    (h) => h.includes("zwyc"),
    (h) => h.includes("%"),
  ]);
  const diffIdx = findCol(headers, [
    (h) => h.includes("roznica") || h.includes("różnica"),
    (h) => h.includes("diff"),
  ]);
  const notesIdx = findCol(headers, [
    (h) => h.includes("uwagi"),
    (h) => h.includes("notes"),
  ]);

  const player =
    playerIdx >= 0 ? cellStr(row[playerIdx]) : cellStr(row[1]);
  if (!player || /^gracz$/i.test(player) || /^uczestnik$/i.test(player)) {
    return null;
  }

  // Collect extra columns that aren't standard
  const used = new Set(
    [placeIdx, playerIdx, rateIdx, diffIdx, notesIdx].filter((i) => i >= 0)
  );
  /** @type {Record<string, string>} */
  const extra = {};
  headers.forEach((h, i) => {
    if (used.has(i)) return;
    if (/^id_/i.test(cellStr(h))) return;
    const val = cellStr(row[i]);
    if (val) extra[cellStr(h) || `col${i}`] = val;
  });

  return {
    place: placeIdx >= 0 ? cellStr(row[placeIdx]) : cellStr(row[0]),
    player,
    winRate: rateIdx >= 0 ? cellStr(row[rateIdx]) : "",
    diff: diffIdx >= 0 ? cellStr(row[diffIdx]) : "",
    notes: notesIdx >= 0 ? cellStr(row[notesIdx]) : "",
    extra,
  };
}

/**
 * Shot keys for individual attempt sports (Koszykówka / Piłka ind.).
 * @param {string} sheetName
 * @returns {string[]|null}
 */
export function getSkillShotKeys(sheetName) {
  if (/koszyk/i.test(sheetName)) return BASKETBALL_SHOT_KEYS;
  if (/pi[lł]ka\s*ind/i.test(sheetName)) return FOOTBALL_IND_SHOT_KEYS;
  return null;
}

/**
 * Parse a numeric cell (supports "2,5", "2.5", "1/2", spaces).
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s.startsWith("=")) return null;
  // Unicode fractions / thin spaces
  s = s.replace(/\u00a0/g, " ").replace(/\s+/g, "");
  // Simple fraction a/b
  const frac = s.match(/^(-?\d+)[/⁄](\d+)$/);
  if (frac) {
    const a = Number(frac[1]);
    const b = Number(frac[2]);
    if (b !== 0 && Number.isFinite(a) && Number.isFinite(b)) return a / b;
  }
  // Polish decimal comma → dot (but keep thousand separators carefully)
  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else if (s.includes(",") && s.includes(".")) {
    // e.g. 1.234,56 → 1234.56
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format score always with 2 decimal places (PL comma).
 * @param {number|null} n
 */
function formatScore2(n) {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * "S" / "s" = special marker in attempt cells (not a literal score).
 * @param {unknown} raw
 */
export function isSpecialS(raw) {
  // allow whitespace / accidental punctuation: "S", "s", "S.", " s "
  return /^s\.?$/i.test(cellStr(raw).replace(/\s+/g, ""));
}

/**
 * Cell has a usable attempt value (number or S).
 * @param {unknown} raw
 */
function hasShotValue(raw) {
  const s = cellStr(raw);
  if (!s || s.startsWith("=")) return false;
  if (isSpecialS(s)) return true;
  return parseNumber(s) != null;
}

/**
 * Collect real numeric values per shot type from all players/attempts.
 * "S" markers are excluded (they are derived from this pool).
 * @param {{ attemptRows?: { shots: Record<string, string> }[] }[]} players
 * @param {string[]} shotKeys
 * @returns {Record<string, number[]>}
 */
export function collectShotPools(players, shotKeys = BASKETBALL_SHOT_KEYS) {
  /** @type {Record<string, number[]>} */
  const pools = Object.fromEntries(shotKeys.map((k) => [k, []]));
  for (const p of players || []) {
    const rows =
      p.attemptRows?.length > 0
        ? p.attemptRows
        : buildAttemptRowsFromFlat(p.attempts || {}, shotKeys);
    for (const ar of rows) {
      for (const key of shotKeys) {
        const raw = ar.shots?.[key];
        if (!cellStr(raw) || isSpecialS(raw)) continue;
        const n = parseNumber(raw);
        if (n != null) pools[key].push(n);
      }
    }
  }
  return pools;
}

/**
 * Value for "S" in a given shot column:
 * 50% × worst (min) of that shot type across all attempts of all players
 * + 50% × average of that shot type across all attempts of all players
 * (only real numbers; other "S" cells do not enter the pool)
 *
 * @param {string} shotKey
 * @param {Record<string, number[]>} pools
 * @returns {number|null}
 */
export function specialSValue(shotKey, pools) {
  const nums = pools?.[shotKey] || [];
  if (!nums.length) return null;
  const worst = Math.min(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return 0.5 * worst + 0.5 * avg;
}

/**
 * Resolve one shot cell to a number (handles "S").
 * @param {unknown} raw
 * @param {string} shotKey
 * @param {Record<string, number[]>|null|undefined} pools
 */
function resolveShotValue(raw, shotKey, pools) {
  if (!cellStr(raw)) return null;
  if (isSpecialS(raw)) {
    return pools ? specialSValue(shotKey, pools) : null;
  }
  return parseNumber(raw);
}

/**
 * Mean of filled shot values in one attempt.
 * @param {Record<string, string>} shots
 * @param {Record<string, number[]>|null|undefined} pools
 * @param {string[]} shotKeys
 * @returns {number|null}
 */
function averageAttemptShots(shots, pools, shotKeys = BASKETBALL_SHOT_KEYS) {
  const nums = [];
  for (const key of shotKeys) {
    const n = resolveShotValue(shots?.[key], key, pools);
    if (n != null) nums.push(n);
  }
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Weighted attempt score:
 * - 1 attempt  → mean of that attempt's shots
 * - 2+ attempts → (mean of BEST attempt + mean of OTHER attempts' means) / 2
 *
 * @param {{ index: number, shots: Record<string, string> }[]} attemptRows
 * @param {Record<string, number[]>|null|undefined} pools
 * @param {string[]} shotKeys
 * @returns {number|null}
 */
export function computeAttemptScore(
  attemptRows,
  pools = null,
  shotKeys = BASKETBALL_SHOT_KEYS
) {
  if (!attemptRows?.length) return null;

  /** @type {number[]} */
  const attemptMeans = [];
  for (const ar of attemptRows) {
    const avg = averageAttemptShots(ar.shots, pools, shotKeys);
    if (avg != null) attemptMeans.push(avg);
  }
  if (!attemptMeans.length) return null;
  if (attemptMeans.length === 1) return attemptMeans[0];

  let bestI = 0;
  for (let i = 1; i < attemptMeans.length; i++) {
    if (attemptMeans[i] > attemptMeans[bestI]) bestI = i;
  }
  const best = attemptMeans[bestI];
  const others = attemptMeans.filter((_, i) => i !== bestI);
  const othersMean = others.reduce((a, b) => a + b, 0) / others.length;
  return (best + othersMean) / 2;
}

/** @deprecated use computeAttemptScore */
export function computeBasketballScore(attemptRows, pools = null) {
  return computeAttemptScore(attemptRows, pools, BASKETBALL_SHOT_KEYS);
}

/**
 * After all players are parsed: resolve "S" and recompute scores.
 * @param {any[]} players
 * @param {string[]} shotKeys
 */
export function finalizeSkillPlayers(players, shotKeys = BASKETBALL_SHOT_KEYS) {
  for (const p of players) {
    if (!p.attemptRows?.length && p.attempts && Object.keys(p.attempts).length) {
      p.attemptRows = buildAttemptRowsFromFlat(p.attempts, shotKeys);
    }
  }

  const pools = collectShotPools(players, shotKeys);
  /** @type {Record<string, number|null>} */
  const sResolved = {};
  for (const key of shotKeys) {
    sResolved[key] = specialSValue(key, pools);
  }

  for (const p of players) {
    const scoreNum = computeAttemptScore(p.attemptRows || [], pools, shotKeys);
    p.scoreNum = scoreNum;
    p.score = scoreNum != null ? formatScore2(scoreNum) : "";
    p.shotKeys = shotKeys;
    p.sResolved = sResolved;
    p.attemptMeans = (p.attemptRows || []).map((ar) =>
      averageAttemptShots(ar.shots, pools, shotKeys)
    );
    p.resolvedAttemptRows = (p.attemptRows || []).map((ar) => {
      /** @type {Record<string, string>} */
      const shots = {};
      for (const key of shotKeys) {
        const raw = ar.shots?.[key] || "";
        if (isSpecialS(raw)) {
          const n = specialSValue(key, pools);
          shots[key] = n != null ? formatScore2(n) : "S";
        } else {
          shots[key] = raw;
        }
      }
      return { index: ar.index, shots, raw: { ...ar.shots } };
    });
  }
  return pools;
}

/** @deprecated use finalizeSkillPlayers */
export function finalizeBasketballPlayers(players) {
  return finalizeSkillPlayers(players, BASKETBALL_SHOT_KEYS);
}

/**
 * Map matched header token to a canonical shot key from shotKeys.
 * @param {string} token
 * @param {string[]} shotKeys
 */
function canonicalShotKey(token, shotKeys) {
  const t = normalizeHeader(token).replace(/\s+/g, "");
  for (const k of shotKeys) {
    if (normalizeHeader(k).replace(/\s+/g, "") === t) return k;
  }
  // Basketball style 1P/UK1
  const upper = token.toUpperCase().replace(/\s+/g, "");
  if (shotKeys.includes(upper)) return upper;
  return null;
}

/**
 * Detect attempt index + shot key from header like "Próba 1 - Karne" / "Próba 1 - 1P".
 * @param {string} header
 * @param {string[]} shotKeys
 * @returns {{ attempt: number, shot: string }|null}
 */
function parseAttemptHeader(header, shotKeys = BASKETBALL_SHOT_KEYS) {
  const raw = cellStr(header);
  if (!raw) return null;
  const nh = normalizeHeader(raw);

  // Escape shot keys for regex (1na1, uk1, 1p…)
  const alts = shotKeys
    .map((k) =>
      normalizeHeader(k)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s*")
    )
    .join("|");
  if (!alts) return null;

  let m = nh.match(
    new RegExp(
      `proba\\s*(\\d+)\\s*[-–—:._\\s]*\\s*(${alts})`,
      "i"
    )
  );
  if (!m) {
    m = nh.match(
      new RegExp(
        `(?:^|[^a-z0-9])(\\d{1,2})\\s*[-–—:._\\s]+\\s*(${alts})(?:$|[^a-z0-9])`,
        "i"
      )
    );
  }
  if (!m) {
    m = nh.match(new RegExp(`proba\\s*(\\d+).{0,16}?(${alts})`, "i"));
  }
  if (!m) return null;

  const attempt = Number(m[1]);
  const shot = canonicalShotKey(m[2], shotKeys);
  if (!shot) return null;
  if (!Number.isFinite(attempt) || attempt < 1) return null;
  return { attempt, shot };
}

/**
 * @param {string[]} shotKeys
 */
function emptyShotMap(shotKeys = BASKETBALL_SHOT_KEYS) {
  return Object.fromEntries(shotKeys.map((k) => [k, ""]));
}

/**
 * Rebuild attempt rows from flat { "Próba 1 - Karne": "5", ... } map.
 * @param {Record<string, string>} flat
 * @param {string[]} shotKeys
 */
function buildAttemptRowsFromFlat(flat, shotKeys = BASKETBALL_SHOT_KEYS) {
  /** @type {Map<number, Record<string, string>>} */
  const byAttempt = new Map();
  for (const [h, v] of Object.entries(flat || {})) {
    const meta = parseAttemptHeader(h, shotKeys);
    if (!meta || !hasShotValue(v)) continue;
    if (!byAttempt.has(meta.attempt)) {
      byAttempt.set(meta.attempt, emptyShotMap(shotKeys));
    }
    byAttempt.get(meta.attempt)[meta.shot] = cellStr(v);
  }
  return [...byAttempt.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({ index, shots: byAttempt.get(index) }))
    .filter((ar) => shotKeys.some((k) => hasShotValue(ar.shots[k])));
}

/**
 * @param {string[]} headers
 * @param {string[]} row
 * @param {string[]} shotKeys
 */
function parseSkillPlayerRow(headers, row, shotKeys = BASKETBALL_SHOT_KEYS) {
  const nameIdx = findCol(headers, [
    (h) => h.includes("imie"),
    (h) => h === "gracz" || h.startsWith("gracz "),
    (h) => h.includes("nazwa") && !h.includes("druzyn"),
  ]);
  const scoreIdx = findCol(headers, [
    (h) => h === "wynik",
    (h) => h.startsWith("wynik") && !h.includes("proba"),
  ]);

  let name = nameIdx >= 0 ? cellStr(row[nameIdx]) : "";
  if (!name) {
    for (let i = 0; i < row.length; i++) {
      const c = cellStr(row[i]);
      if (!c || /^\d+(\.0+)?$/.test(c)) continue;
      if (parseNumber(c) != null && !/[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(c)) {
        continue;
      }
      if (/^id_/i.test(c)) continue;
      name = c;
      break;
    }
  }
  if (!name || /^imie/i.test(name) || /^id_/i.test(name)) return null;

  let scoreRaw = scoreIdx >= 0 ? cellStr(row[scoreIdx]) : "";
  if (scoreRaw.startsWith("=")) scoreRaw = "";

  /** @type {Map<number, Record<string, string>>} */
  const byAttempt = new Map();
  /** @type {Record<string, string>} */
  const attemptsFlat = {};

  const nHeaders = Math.max(headers.length, row.length);
  const flatHint = shotKeys
    .map((k) => normalizeHeader(k).replace(/\s+/g, ""))
    .join("|");

  for (let i = 0; i < nHeaders; i++) {
    const h = headers[i] != null ? headers[i] : "";
    const meta = parseAttemptHeader(h, shotKeys);
    const v = cellStr(row[i]);

    if (meta) {
      if (!byAttempt.has(meta.attempt)) {
        byAttempt.set(meta.attempt, emptyShotMap(shotKeys));
      }
      if (hasShotValue(v)) {
        byAttempt.get(meta.attempt)[meta.shot] = v;
        attemptsFlat[cellStr(h) || `${meta.attempt}-${meta.shot}`] = v;
      }
      continue;
    }

    if (hasShotValue(v)) {
      const nh = normalizeHeader(h);
      if (
        nh.includes("proba") ||
        new RegExp(flatHint, "i").test(nh.replace(/\s+/g, ""))
      ) {
        attemptsFlat[cellStr(h) || `col${i}`] = v;
      }
    }
  }

  let attemptRows = [...byAttempt.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({ index, shots: byAttempt.get(index) }))
    .filter((ar) => shotKeys.some((k) => hasShotValue(ar.shots[k])));

  if (!attemptRows.length && Object.keys(attemptsFlat).length) {
    attemptRows = buildAttemptRowsFromFlat(attemptsFlat, shotKeys);
  }

  const scoreNum = computeAttemptScore(attemptRows, null, shotKeys);

  return {
    name,
    score: scoreNum != null ? formatScore2(scoreNum) : "",
    scoreNum,
    _scoreRaw: scoreRaw,
    attempts: attemptsFlat,
    attemptRows,
    shotKeys,
  };
}

/** @deprecated use parseSkillPlayerRow */
function parseBasketballPlayerRow(headers, row) {
  return parseSkillPlayerRow(headers, row, BASKETBALL_SHOT_KEYS);
}

function parseGenericRow(headers, row) {
  if (isEmptyRow(row) || isCommentRow(row)) return null;
  /** @type {Record<string, string>} */
  const obj = {};
  let hasData = false;
  headers.forEach((h, i) => {
    const key = cellStr(h) || `Kolumna ${i + 1}`;
    if (/^id_/i.test(key)) return;
    const val = cellStr(row[i]);
    obj[key] = val;
    if (val) hasData = true;
  });
  return hasData ? obj : null;
}

const MEDAL_ORDER = ["złoty", "srebrny", "brązowy"];

function defaultMedalSlots() {
  return MEDAL_ORDER.map((medal) => ({
    medal,
    name: "",
    players: "",
  }));
}

/**
 * Normalize medal list to always have złoty / srebrny / brązowy in order.
 * @param {any[]} list
 */
function normalizeMedalList(list) {
  const byKey = new Map();
  for (const m of list || []) {
    const key = normalizeMedalKey(m.medal || m.place || "");
    if (!key) continue;
    byKey.set(key, {
      medal: key,
      name: cellStr(m.name),
      players: cellStr(m.players),
    });
  }
  return MEDAL_ORDER.map(
    (medal) => byKey.get(medal) || { medal, name: "", players: "" }
  );
}

function normalizeMedalKey(raw) {
  // ł does not always strip via NFD — handle explicitly
  const s = normalizeHeader(raw).replace(/ł/g, "l");
  if (!s) return "";
  if (
    s.includes("zlot") ||
    s === "gold" ||
    s === "1" ||
    String(raw).includes("🥇")
  ) {
    return "złoty";
  }
  if (
    s.includes("srebr") ||
    s === "silver" ||
    s === "2" ||
    String(raw).includes("🥈")
  ) {
    return "srebrny";
  }
  if (
    s.includes("braz") ||
    s === "bronze" ||
    s === "3" ||
    String(raw).includes("🥉")
  ) {
    return "brązowy";
  }
  return "";
}

/**
 * Parse Strefa medalowa table rows.
 * Expected: medal | nazwa | gracze
 * @param {string[]} headers
 * @param {string[][]} rows
 */
function parseMedalSection(headers, rows) {
  /** @type {any[]} */
  const out = [];
  const h = (headers || []).map(cellStr);
  const norms = h.map(normalizeHeader);

  let medalIdx = norms.findIndex(
    (x) => x.includes("medal") || x.includes("miejsce") || x === "pos"
  );
  let nameIdx = norms.findIndex(
    (x) =>
      x.includes("nazwa") ||
      x.includes("druzyna") ||
      (x.includes("gracz") && !x.includes("gracze")) ||
      x.includes("zwyciezca") ||
      x === "imie"
  );
  let playersIdx = norms.findIndex(
    (x) =>
      x.includes("gracze") ||
      x.includes("sklad") ||
      x.includes("zawodnicy") ||
      x.includes("skład")
  );

  const headerLooksLikeData = h.some((c) => normalizeMedalKey(c));

  /** @type {string[][]} */
  let dataRows = rows || [];
  if (headerLooksLikeData && medalIdx < 0) {
    dataRows = [headers, ...(rows || [])];
    medalIdx = 0;
    nameIdx = 1;
    playersIdx = 2;
  } else {
    if (medalIdx < 0) medalIdx = 0;
    if (nameIdx < 0) nameIdx = Math.min(1, h.length ? 1 : 0);
    if (playersIdx < 0) playersIdx = 2;
  }

  for (const row of dataRows) {
    if (isEmptyRow(row) || isCommentRow(row)) continue;
    let medal = normalizeMedalKey(cellStr(row[medalIdx]));
    if (!medal) medal = normalizeMedalKey(cellStr(row[0]));
    if (!medal) continue;

    let name = cellStr(row[nameIdx]);
    let players = playersIdx >= 0 ? cellStr(row[playersIdx]) : "";

    if (normalizeMedalKey(name) === medal) {
      name = cellStr(row[nameIdx + 1] ?? row[1]);
      if (!players) players = cellStr(row[nameIdx + 2] ?? row[2]);
    }
    if (/^(nazwa|gracze|medal|sklad|skład)$/i.test(name)) continue;

    out.push({
      medal,
      name: name || "",
      players: players || "",
    });
  }
  return out;
}

// ─── Sheet parsers ─────────────────────────────────────────────

/**
 * True if row has label cells typical of a column header row
 * (even when col0 is a mangled "Siatkówka # DRUŻYNY ID_drużyny").
 * @param {string[]} row
 */
function rowLooksLikeColumnHeaders(row) {
  const norms = row.map(normalizeHeader);
  const joined = norms.join(" | ");
  if (joined.includes("nazwa druz") || joined.includes("nazwa dru")) return true;
  if (/gracz\s*\d/.test(joined) || joined.includes("gracze")) return true;
  if (joined.includes("medal") && joined.includes("nazwa")) return true;
  if (joined.includes("faza") && (joined.includes("druzyna") || joined.includes("wynik"))) {
    return true;
  }
  if (joined.includes("imie") && joined.includes("wynik")) return true;
  if (joined.includes("id_meczu") || joined.includes("id_druzyny")) return true;
  // Multiple header-ish words across cells
  const hits = norms.filter(
    (h) =>
      h.includes("nazwa") ||
      h.includes("faza") ||
      h.includes("wynik") ||
      h.includes("gracz") ||
      h.includes("miejsce")
  ).length;
  return hits >= 2;
}

/**
 * Data rows usually start with a numeric ID (team/match id).
 * @param {string[]} row
 */
function rowLooksLikeIdData(row) {
  const c0 = cellStr(row[0]);
  return /^\d+(\.0+)?$/.test(c0);
}

/**
 * Fallback headers when the real header row was merged into a # SEKCJA line.
 * @param {string} type
 * @param {number} width
 */
function defaultHeadersForSection(type, width) {
  const w = Math.max(width, 5);
  if (type === "teams") {
    const h = ["ID_drużyny", "Nazwa drużyny"];
    for (let i = 1; i <= Math.max(6, w - 2); i++) h.push(`Gracz ${i}`);
    return h;
  }
  if (type === "matches") {
    return ["ID_meczu", "Faza", "Drużyna 1", "Drużyna 2", "Wynik (X:Y)"];
  }
  if (type === "ranking") {
    return ["miejsce", "gracz", "zwycięstwa / mecze (%)", "różnica setów", "uwagi"];
  }
  if (type === "players") {
    return ["ID_gracza", "Imię gracza", "WYNIK"];
  }
  if (type === "medals") {
    return ["medal", "nazwa", "gracze"];
  }
  return Array.from({ length: w }, (_, i) => `Kolumna ${i + 1}`);
}

/**
 * Walk rows and split into section blocks.
 * Supports new markers (# DRUŻYNY …) and legacy multi-table gviz exports.
 * Handles Google merging title+#DRUŻYNY+column headers into one first cell.
 * @param {string[][]} rows
 */
function splitSections(rows) {
  /** @type {{ type: string, title: string, headers: string[], rows: string[][] }[]} */
  const sections = [];
  let current = null;
  let expectingHeader = false;

  const pushCurrent = () => {
    if (current) sections.push(current);
    current = null;
    expectingHeader = false;
  };

  const startSection = (type, title, headers = null) => {
    pushCurrent();
    current = {
      type,
      title: title || type,
      headers: headers ? headers.map(cellStr) : [],
      rows: [],
    };
    expectingHeader = !headers;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isEmptyRow(row)) continue;
    if (isCommentRow(row)) continue;

    const firstNonEmpty = row.map(cellStr).find(Boolean) || "";
    const first = cellStr(row[0]) || firstNonEmpty;
    const marker =
      detectSectionMarker(first) || detectSectionMarker(firstNonEmpty);

    if (marker) {
      let title = firstNonEmpty || first;
      if (marker === "section") {
        const m = title.match(/#\s*SEKCJA\s*[|–-]?\s*(.*)$/i);
        title = (m && m[1].trim()) || "Sekcja";
      }

      // Same row often already holds real column headers (gviz / merged cells)
      if (rowLooksLikeColumnHeaders(row) || detectHeaderType(row)) {
        startSection(marker, title, row);
      } else {
        startSection(marker, title, null);
      }
      continue;
    }

    const headerType = detectHeaderType(row);

    if (headerType) {
      if (expectingHeader && current) {
        current.headers = row.map(cellStr);
        if (current.type !== "section") {
          current.type = headerType;
        }
        expectingHeader = false;
        continue;
      }

      // New header while in another table → switch (legacy multi-section sheets)
      startSection(headerType, headerType, row);
      continue;
    }

    if (current && expectingHeader) {
      // Do NOT treat the first data row (ID=1, Drużyna 1, Ali…) as headers
      if (rowLooksLikeIdData(row)) {
        current.headers = defaultHeadersForSection(
          current.type,
          Math.max(row.length, 8)
        );
        expectingHeader = false;
        current.rows.push(row);
        continue;
      }
      current.headers = row.map(cellStr);
      const ht = detectHeaderType(row);
      if (ht && current.type !== "section") {
        current.type = ht;
      }
      expectingHeader = false;
      continue;
    }

    if (current && current.headers.length) {
      current.rows.push(row);
      continue;
    }

    if (!current) {
      sections.push({
        type: "info-line",
        title: firstNonEmpty || first,
        headers: [],
        rows: [row],
      });
    }
  }
  pushCurrent();
  return sections;
}

/**
 * Parse Info sheet.
 * @param {string[][]} rows
 */
export function parseInfoSheet(rows) {
  const cleaned = stripLeadingEmptyCols(rows);
  const paragraphs = [];
  let title = "Olimpiada Bieździadów 2026";
  /** @type {Record<string, string>} */
  const meta = {};

  const META_KEYS = new Set([
    "data",
    "miejsce",
    "wersja",
    "lokalizacja",
    "organizator",
  ]);

  for (const row of cleaned) {
    if (isEmptyRow(row) || isCommentRow(row)) continue;
    const rawCells = row.map(cellStr);
    const cells = rawCells.filter(Boolean);
    if (!cells.length) continue;

    const key = cells[0].toLowerCase();
    // Key-value meta (value may be empty — skip until filled)
    if (META_KEYS.has(key) && cells[0].length < 30 && !cells[0].startsWith("•")) {
      const value = rawCells.slice(1).map(cellStr).filter(Boolean).join(" ");
      if (value) meta[key] = value;
      continue;
    }

    const line = cells.join(" ");
    if (
      /olimpiada/i.test(line) &&
      paragraphs.length === 0 &&
      !line.startsWith("•")
    ) {
      title = line;
      continue;
    }
    paragraphs.push(line);
  }

  return { title, paragraphs, meta };
}

/**
 * Parse a discipline sheet into a unified model.
 * @param {string} sheetName
 * @param {string[][]} rows
 */
export function parseDisciplineSheet(sheetName, rows) {
  const cleaned = stripLeadingEmptyCols(rows);
  const sections = splitSections(cleaned);

  /** @type {any} */
  const result = {
    sheetName,
    title: sheetName,
    teams: [],
    matches: [],
    ranking: [],
    players: [],
    medals: [], // Strefa medalowa: złoty / srebrny / brązowy
    sections: [], // generic for Inne
  };

  // First info-line as title
  const titleLine = sections.find((s) => s.type === "info-line");
  if (titleLine) result.title = titleLine.title;

  for (const sec of sections) {
    if (sec.type === "info-line") continue;

    if (sec.type === "teams") {
      for (const row of sec.rows) {
        if (isCommentRow(row)) continue;
        const t = parseTeamRow(sec.headers, row);
        if (t) result.teams.push(t);
      }
    } else if (sec.type === "matches") {
      for (const row of sec.rows) {
        if (isCommentRow(row)) continue;
        const m = parseMatchRow(sec.headers, row);
        if (m) result.matches.push(m);
      }
    } else if (sec.type === "ranking") {
      for (const row of sec.rows) {
        if (isCommentRow(row)) continue;
        const r = parseRankingRow(sec.headers, row);
        if (r) result.ranking.push(r);
      }
    } else if (sec.type === "players") {
      const shotKeys =
        getSkillShotKeys(sheetName) ||
        (sec.headers.some((h) => /karne|1na1|luta/i.test(h))
          ? FOOTBALL_IND_SHOT_KEYS
          : sec.headers.some((h) => /1p|2p|3p|uk\s*1|uk\s*2/i.test(h))
            ? BASKETBALL_SHOT_KEYS
            : null);
      for (const row of sec.rows) {
        if (isCommentRow(row)) continue;
        if (shotKeys) {
          const p = parseSkillPlayerRow(sec.headers, row, shotKeys);
          if (p) result.players.push(p);
        } else {
          // simple player list: ID + name
          const nameIdx = findCol(sec.headers, [
            (h) => h.includes("imie"),
            (h) => h.includes("gracz") && !h.includes("id"),
            (h) => h.includes("nazwa"),
          ]);
          const name =
            nameIdx >= 0 ? cellStr(row[nameIdx]) : cellStr(row[1]) || cellStr(row[0]);
          if (name && !/^id_/i.test(name) && !/^\d+(\.0)?$/.test(name)) {
            result.players.push({ name, score: "", scoreNum: null, attempts: {} });
          }
        }
      }
    } else if (sec.type === "medals") {
      const parsed = parseMedalSection(sec.headers, sec.rows);
      if (parsed.length) result.medals = parsed;
    } else if (sec.type === "section") {
      const headers = sec.headers;
      const dataRows = [];
      for (const row of sec.rows) {
        if (isCommentRow(row)) continue;
        const obj = parseGenericRow(headers, row);
        if (obj) dataRows.push(obj);
      }
      // Only include sections with data or at least headers
      if (headers.length) {
        result.sections.push({
          title: sec.title,
          headers: headers.filter((h) => h && !/^id_/i.test(h)),
          rows: dataRows,
        });
      }
    }
  }

  // Ensure medal slots exist even if empty (app can still show placeholders)
  if (!result.medals.length) {
    result.medals = defaultMedalSlots();
  } else {
    result.medals = normalizeMedalList(result.medals);
  }

  // Legacy skill sheet: no # GRACZE, only header with ID_gracza
  const skillKeys = getSkillShotKeys(sheetName);
  if (skillKeys && result.players.length === 0) {
    for (const sec of sections) {
      if (sec.headers.some((h) => /id_gracza|imie gracza/i.test(h))) {
        for (const row of sec.rows) {
          const p = parseSkillPlayerRow(sec.headers, row, skillKeys);
          if (p) result.players.push(p);
        }
      }
    }
    if (result.players.length === 0) {
      for (let i = 0; i < cleaned.length; i++) {
        const ht = detectHeaderType(cleaned[i]);
        if (ht === "players") {
          const headers = cleaned[i].map(cellStr);
          for (let j = i + 1; j < cleaned.length; j++) {
            if (isEmptyRow(cleaned[j]) || isCommentRow(cleaned[j])) continue;
            if (detectSectionMarker(cellStr(cleaned[j][0]))) break;
            if (detectHeaderType(cleaned[j])) break;
            const p = parseSkillPlayerRow(headers, cleaned[j], skillKeys);
            if (p) result.players.push(p);
          }
          break;
        }
      }
    }
  }

  // Derive players from matches if no explicit list (badminton legacy)
  if (
    result.players.length === 0 &&
    result.matches.length > 0 &&
    result.teams.length === 0 &&
    !skillKeys
  ) {
    const names = new Set();
    for (const m of result.matches) {
      if (m.side1 && m.side1 !== "TBD") names.add(m.side1);
      if (m.side2 && m.side2 !== "TBD") names.add(m.side2);
    }
    result.players = [...names].map((name) => ({
      name,
      score: "",
      scoreNum: null,
      attempts: {},
    }));
  }

  // Individual skill sports (Koszykówka, Piłka ind.): S-resolve + ranking by score
  if (skillKeys && result.players.length) {
    finalizeSkillPlayers(result.players, skillKeys);
    result.skillShotKeys = skillKeys;
    const sorted = [...result.players].sort(
      (a, b) => (b.scoreNum ?? -Infinity) - (a.scoreNum ?? -Infinity)
    );
    result.ranking = sorted.map((p, i) => ({
      place: String(i + 1),
      player: p.name,
      winRate: p.score || "—",
      diff: "",
      notes: "",
      extra: {},
    }));
  }

  // Team sports: auto ranking from rosters + matches (overrides sheet ranking)
  // Piłka Nożna (team) — not "Piłka ind."
  if (
    /siatk/i.test(sheetName) ||
    (/pi[lł]ka/i.test(sheetName) && !/ind/i.test(sheetName))
  ) {
    result.ranking = computeTeamSportRanking(result.teams, result.matches);
    result.rankingAuto = true;
  }

  return result;
}

// ─── Volleyball ranking ────────────────────────────────────────

/**
 * Normalize team/player label for comparison.
 * @param {string} s
 */
function normName(s) {
  return cellStr(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Even looser: drop all spaces/punctuation for team match. */
function normNameLoose(s) {
  return normName(s).replace(/[^a-z0-9]/g, "");
}

/**
 * Whether two team labels refer to the same team.
 * @param {string} a
 * @param {string} b
 */
function sameTeamName(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (normNameLoose(a) === normNameLoose(b)) return true;
  return false;
}

/**
 * Parse match score "X:Y".
 * Also handles Google Sheets turning "2:1" into time "2:01:00".
 * @param {string} score
 * @returns {{ a: number, b: number }|null}
 */
export function parseMatchScore(score) {
  let s = cellStr(score);
  if (!s) return null;

  // Strip accidental date prefixes from Sheets datetime cells
  s = s.replace(/^\d{4}-\d{2}-\d{2}[ T]/, "").trim();

  // Classic set score: 2:1, 2-1, 2 – 1
  let m = s.match(/^(\d+)\s*[:\-–—]\s*(\d+)$/);
  if (m) {
    return { a: Number(m[1]), b: Number(m[2]) };
  }

  // Sheets time export of a set score: "2:01:00", "2:01", "02:01:00 AM"
  // Originally typed as 2:1 → hours=2, minutes=1
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?$/);
  if (m) {
    return { a: Number(m[1]), b: Number(m[2]) };
  }

  // 2/1 or 2x1
  m = s.match(/^(\d+)\s*[\/xX]\s*(\d+)$/);
  if (m) {
    return { a: Number(m[1]), b: Number(m[2]) };
  }

  return null;
}

function isPlaceholderSide(name) {
  const n = cellStr(name);
  if (!n) return true;
  if (/^tbd$/i.test(n)) return true;
  if (/^—$|^-$|^–$|^n\/?a$/i.test(n)) return true;
  if (/^(zwyciezca|przegrany|finalista)/i.test(normName(n))) return true;
  // Placeholder like "Drużyna XY" / "Team ?"
  if (/\bxy\b|\?+/i.test(n)) return true;
  return false;
}

/**
 * Individual ranking for team sports (Siatkówka / Piłka Nożna).
 * - Player may belong to multiple teams (all memberships counted)
 * - If both teams in a match include the player, the match counts twice
 *   (once from each team's perspective)
 * - Only matches with a parseable score X:Y count as played
 * - Sort: win rate desc, then score difference (sets or goals) desc, then name
 * - Draw (X:Y equal): match played, no win, diff 0 for that side
 *
 * @param {{ name: string, players: string[] }[]} teams
 * @param {{ phase: string, side1: string, side2: string, score: string }[]} matches
 */
export function computeTeamSportRanking(teams, matches) {
  /** @type {Map<string, { display: string, teams: Set<string> }>} */
  const players = new Map();

  // teamKey (loose) -> list of player keys on that team
  /** @type {Map<string, Set<string>>} */
  const rosterByTeamLoose = new Map();
  /** @type {Map<string, string>} loose -> display team name */
  const teamDisplayByLoose = new Map();

  for (const team of teams || []) {
    const teamName = cellStr(team.name);
    if (!teamName) continue;
    const loose = normNameLoose(teamName);
    if (!loose) continue;
    teamDisplayByLoose.set(loose, teamName);
    if (!rosterByTeamLoose.has(loose)) {
      rosterByTeamLoose.set(loose, new Set());
    }

    // players may be array or (defensive) a raw string
    const list = Array.isArray(team.players)
      ? team.players
      : splitPlayerList(team.players);

    for (const raw of list) {
      const display = cellStr(raw);
      if (!display) continue;
      // skip accidental multi-name leftovers that look like headers
      if (/^gracze$/i.test(display)) continue;
      const key = normName(display);
      if (!key) continue;

      if (!players.has(key)) {
        players.set(key, { display, teams: new Set() });
      }
      players.get(key).teams.add(teamName);
      rosterByTeamLoose.get(loose).add(key);
    }
  }

  /** @type {Map<string, { wins: number, played: number, setDiff: number }>} */
  const stats = new Map();
  for (const key of players.keys()) {
    stats.set(key, { wins: 0, played: 0, setDiff: 0 });
  }

  /**
   * Resolve match side label → player keys on that team.
   * @param {string} sideName
   * @returns {Set<string>}
   */
  function playersOnSide(sideName) {
    const out = new Set();
    if (isPlaceholderSide(sideName)) return out;
    const sideLoose = normNameLoose(sideName);
    // Direct loose key hit
    if (rosterByTeamLoose.has(sideLoose)) {
      for (const pk of rosterByTeamLoose.get(sideLoose)) out.add(pk);
      return out;
    }
    // Fuzzy: compare against every known team name
    for (const [loose, pkeys] of rosterByTeamLoose) {
      const display = teamDisplayByLoose.get(loose) || loose;
      if (sameTeamName(sideName, display) || loose === sideLoose) {
        for (const pk of pkeys) out.add(pk);
      }
    }
    return out;
  }

  for (const match of matches || []) {
    const score = parseMatchScore(match.score);
    if (!score) continue;
    if (isPlaceholderSide(match.side1) || isPlaceholderSide(match.side2)) {
      continue;
    }

    const on1 = playersOnSide(match.side1);
    const on2 = playersOnSide(match.side2);

    // Count each side independently (player on both teams → +2 played)
    for (const key of on1) {
      const st = stats.get(key);
      if (!st) continue;
      st.played += 1;
      st.setDiff += score.a - score.b;
      if (score.a > score.b) st.wins += 1;
    }
    for (const key of on2) {
      const st = stats.get(key);
      if (!st) continue;
      st.played += 1;
      st.setDiff += score.b - score.a;
      if (score.b > score.a) st.wins += 1;
    }
  }

  /** @type {any[]} */
  const rows = [];
  for (const [key, p] of players) {
    const st = stats.get(key);
    const winPct = st.played > 0 ? st.wins / st.played : null;
    const pctStr =
      winPct == null
        ? "—"
        : `${st.wins}/${st.played} (${(winPct * 100).toLocaleString("pl-PL", {
            maximumFractionDigits: 1,
            minimumFractionDigits: 0,
          })}%)`;
    const diffStr =
      st.played === 0
        ? "—"
        : st.setDiff > 0
          ? `+${st.setDiff}`
          : String(st.setDiff);
    const teamList = [...p.teams].join(", ");

    rows.push({
      place: "",
      player: p.display,
      winRate: pctStr,
      diff: diffStr,
      notes: teamList,
      extra: {},
      _winPct: winPct == null ? -1 : winPct,
      _setDiff: st.setDiff,
      _played: st.played,
      _name: key,
    });
  }

  rows.sort((a, b) => {
    if ((b._played > 0) !== (a._played > 0)) {
      return b._played > 0 ? 1 : -1;
    }
    if (b._winPct !== a._winPct) return b._winPct - a._winPct;
    if (b._setDiff !== a._setDiff) return b._setDiff - a._setDiff;
    return a._name.localeCompare(b._name, "pl");
  });

  return rows.map((r, i) => ({
    place: String(i + 1),
    player: r.player,
    winRate: r.winRate,
    diff: r.diff,
    notes: r.notes,
    extra: r.extra,
  }));
}

/** @deprecated use computeTeamSportRanking */
export const computeVolleyballRanking = computeTeamSportRanking;

// ─── Fetch layer ───────────────────────────────────────────────

/**
 * Fetch sheet as string[][].
 * Prefer official CSV export (keeps text like "s"); gviz is fallback only
 * because it type-coerces columns and drops non-numeric cells (e.g. H9 = "s").
 * @param {string} sheetName
 */
async function fetchSheetRows(sheetName) {
  // 1) Official CSV export by gid — preserves "s" / mixed types, CORS *
  const exportUrl = exportCsvUrl(sheetName);
  if (exportUrl) {
    try {
      const res = await fetch(exportUrl, {
        cache: "no-store",
        mode: "cors",
      });
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trimStart().startsWith("<")) {
          return parseCsv(text);
        }
      }
    } catch (e) {
      console.warn("export csv failed for", sheetName, e);
    }
  }

  // 2) gviz CSV (may drop text in numeric-looking columns)
  try {
    const res = await fetch(gvizCsvUrl(sheetName), {
      cache: "no-store",
      mode: "cors",
    });
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trimStart().startsWith("<")) {
        console.warn(
          "Using gviz for",
          sheetName,
          "— text cells like 's' may be missing"
        );
        return parseCsv(text);
      }
    }
  } catch (e) {
    console.warn("gviz fetch failed for", sheetName, e);
  }

  // 3) OpenSheet JSON
  try {
    const res = await fetch(openSheetUrl(sheetName), {
      cache: "no-store",
      mode: "cors",
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        const keys = Object.keys(data[0]);
        const rows = [keys];
        for (const obj of data) {
          rows.push(keys.map((k) => (obj[k] != null ? String(obj[k]) : "")));
        }
        return rows;
      }
      if (Array.isArray(data)) return [];
    }
  } catch (e) {
    console.warn("opensheet fetch failed for", sheetName, e);
  }

  // 4) Bundled sample (offline / dev)
  try {
    const res = await fetch("./data/sample.json", { cache: "no-store" });
    if (res.ok) {
      const sample = await res.json();
      if (sample?.sheets?.[sheetName]) {
        console.info("Using bundled sample for", sheetName);
        return sample.sheets[sheetName];
      }
    }
  } catch (e) {
    console.warn("sample.json fetch failed for", sheetName, e);
  }

  throw new Error(`Nie udało się pobrać arkusza: ${sheetName}`);
}

/**
 * Parse Gracze sheet — keep sheet order (alphabetically maintained there).
 * @param {string[][]} rows
 * @returns {{ id: string, name: string }[]}
 */
export function parsePlayersDirectory(rows) {
  const cleaned = stripLeadingEmptyCols(rows);
  const sections = splitSections(cleaned);
  /** @type {{ id: string, name: string }[]} */
  const list = [];
  const seen = new Set();

  const pushName = (id, name) => {
    const n = cellStr(name);
    if (!n || /^imie/i.test(n) || /^gracz$/i.test(n) || /^id_/i.test(n)) return;
    const key = normName(n);
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push({ id: cellStr(id), name: n });
  };

  for (const sec of sections) {
    if (sec.type === "players" || sec.type === "teams") {
      // players section preferred
    }
    if (sec.headers?.length && sec.rows?.length) {
      const nameIdx = findCol(sec.headers, [
        (h) => h.includes("imie"),
        (h) => h.includes("gracz") && !h.includes("id"),
        (h) => h === "nazwa",
      ]);
      const idIdx = findCol(sec.headers, [
        (h) => h.includes("id_gracza"),
        (h) => h === "id",
      ]);
      for (const row of sec.rows) {
        if (isCommentRow(row) || isEmptyRow(row)) continue;
        const name =
          nameIdx >= 0 ? cellStr(row[nameIdx]) : cellStr(row[1]) || cellStr(row[0]);
        const id = idIdx >= 0 ? cellStr(row[idIdx]) : cellStr(row[0]);
        pushName(id, name);
      }
    }
  }

  // Fallback raw scan
  if (!list.length) {
    for (let i = 0; i < cleaned.length; i++) {
      const ht = detectHeaderType(cleaned[i]);
      if (ht === "players" || cleaned[i].some((c) => /imie|gracz/i.test(cellStr(c)))) {
        const headers = cleaned[i].map(cellStr);
        const nameIdx = findCol(headers, [
          (h) => h.includes("imie"),
          (h) => h.includes("gracz") && !h.includes("id"),
        ]);
        const idIdx = findCol(headers, [(h) => h.includes("id")]);
        for (let j = i + 1; j < cleaned.length; j++) {
          if (isEmptyRow(cleaned[j]) || isCommentRow(cleaned[j])) continue;
          if (detectSectionMarker(cellStr(cleaned[j][0]))) break;
          const name =
            nameIdx >= 0
              ? cellStr(cleaned[j][nameIdx])
              : cellStr(cleaned[j][1]) || cellStr(cleaned[j][0]);
          const id =
            idIdx >= 0 ? cellStr(cleaned[j][idIdx]) : cellStr(cleaned[j][0]);
          pushName(id, name);
        }
        break;
      }
    }
  }

  return list;
}

function namesMatch(a, b) {
  return normName(a) === normName(b) && normName(a) !== "";
}

/**
 * Teams containing this player (team sports).
 * @param {string} playerName
 * @param {{ name: string, players: string[] }[]} teams
 */
function teamsForPlayer(playerName, teams) {
  const out = [];
  for (const t of teams || []) {
    const list = Array.isArray(t.players) ? t.players : [];
    if (list.some((p) => namesMatch(p, playerName))) {
      out.push(t.name);
    }
  }
  return out;
}

/**
 * Match involvements for a player in a team-sport discipline.
 * @param {string} playerName
 * @param {any} disc
 */
export function playerTeamMatchCards(playerName, disc) {
  const myTeams = teamsForPlayer(playerName, disc?.teams || []);
  const myTeamKeys = new Set(myTeams.map((t) => normNameLoose(t)));
  /** @type {any[]} */
  const cards = [];

  for (const m of disc?.matches || []) {
    if (isPlaceholderSide(m.side1) && isPlaceholderSide(m.side2)) continue;
    const s1 = !isPlaceholderSide(m.side1) && myTeamKeys.has(normNameLoose(m.side1));
    const s2 = !isPlaceholderSide(m.side2) && myTeamKeys.has(normNameLoose(m.side2));
    if (!s1 && !s2) continue;

    const score = parseMatchScore(m.score);
    let outcome = "pending"; // pending | win | loss | draw | both
    if (s1 && s2) {
      outcome = "both";
    } else if (score) {
      if (score.a === score.b) outcome = "draw";
      else if (s1) outcome = score.a > score.b ? "win" : "loss";
      else outcome = score.b > score.a ? "win" : "loss";
    }

    cards.push({
      phase: m.phase,
      side1: m.side1,
      side2: m.side2,
      score: m.score || "",
      mine1: s1,
      mine2: s2,
      outcome,
    });
  }
  return { teams: myTeams, matches: cards };
}

/**
 * Match involvements for individual match sports (Badminton).
 * @param {string} playerName
 * @param {any} disc
 */
export function playerIndividualMatchCards(playerName, disc) {
  /** @type {any[]} */
  const cards = [];
  for (const m of disc?.matches || []) {
    const s1 = namesMatch(m.side1, playerName);
    const s2 = namesMatch(m.side2, playerName);
    if (!s1 && !s2) continue;
    if (isPlaceholderSide(m.side1) && isPlaceholderSide(m.side2)) continue;

    const score = parseMatchScore(m.score);
    let outcome = "pending";
    if (s1 && s2) {
      outcome = "both";
    } else if (score) {
      if (score.a === score.b) outcome = "draw";
      else if (s1) outcome = score.a > score.b ? "win" : "loss";
      else outcome = score.b > score.a ? "win" : "loss";
    }

    cards.push({
      phase: m.phase,
      side1: m.side1,
      side2: m.side2,
      score: m.score || "",
      mine1: s1,
      mine2: s2,
      outcome,
    });
  }
  return { matches: cards };
}

/**
 * Skill ranking standing for a player.
 * @param {string} playerName
 * @param {any} disc
 */
export function playerSkillStanding(playerName, disc) {
  if (!disc) return null;
  const players = disc.players || [];
  const sorted = [...players].sort(
    (a, b) => (b.scoreNum ?? -Infinity) - (a.scoreNum ?? -Infinity)
  );
  const idx = sorted.findIndex((p) => namesMatch(p.name, playerName));
  if (idx < 0) {
    // try ranking list
    const rIdx = (disc.ranking || []).findIndex((r) =>
      namesMatch(r.player, playerName)
    );
    if (rIdx < 0) return null;
    const r = disc.ranking[rIdx];
    return {
      place: r.place || String(rIdx + 1),
      score: r.winRate || "—",
      scoreNum: null,
    };
  }
  const p = sorted[idx];
  return {
    place: String(idx + 1),
    score: p.score || "—",
    scoreNum: p.scoreNum,
  };
}

/**
 * Map discipline id → display label for medal attribution.
 */
const DISCIPLINE_LABELS = {
  pilka: "Piłka Nożna",
  pilka_ind: "Piłka ind.",
  siatkowka: "Siatkówka",
  koszykowka: "Koszykówka",
  badminton: "Badminton",
  inne: "Inne",
};

/**
 * Does this medal entry award the given player?
 * Matches: individual name, name in "gracze" list, or team roster when nazwa = drużyna.
 * @param {string} playerName
 * @param {{ medal: string, name: string, players: string }} entry
 * @param {any} disc
 */
function medalAwardsPlayer(playerName, entry, disc) {
  if (!entry?.name && !entry?.players) return false;
  if (namesMatch(entry.name, playerName)) return { via: null };

  // Explicit roster in medal row
  const listed = splitPlayerList(entry.players || "");
  if (listed.some((p) => namesMatch(p, playerName))) {
    return { via: entry.name || null };
  }

  // Team name: player is on that team in this discipline
  const teams = disc?.teams || [];
  if (entry.name && teams.length) {
    const team = teams.find((t) => namesMatch(t.name, entry.name));
    if (team) {
      const roster = Array.isArray(team.players) ? team.players : [];
      if (roster.some((p) => namesMatch(p, playerName))) {
        return { via: team.name };
      }
    }
    // Also: medal.nazwa is team-like and player is on a team with that name
    const myTeams = teamsForPlayer(playerName, teams);
    if (myTeams.some((t) => namesMatch(t, entry.name))) {
      return { via: entry.name };
    }
  }

  return false;
}

/**
 * Collect all medals for a player across disciplines.
 * @param {string} playerName
 * @param {Record<string, any>} disciplines
 * @returns {{ medal: string, disciplineId: string, discipline: string, recipient: string, via: string|null }[]}
 */
export function collectPlayerMedals(playerName, disciplines) {
  /** @type {{ medal: string, disciplineId: string, discipline: string, recipient: string, via: string|null }[]} */
  const awards = [];
  const order = [
    "pilka",
    "siatkowka",
    "pilka_ind",
    "koszykowka",
    "badminton",
    "inne",
  ];

  for (const id of order) {
    const disc = disciplines?.[id];
    if (!disc?.medals?.length) continue;
    const label = DISCIPLINE_LABELS[id] || disc.title || id;
    for (const entry of disc.medals) {
      if (!entry.name && !entry.players) continue;
      const hit = medalAwardsPlayer(playerName, entry, disc);
      if (!hit) continue;
      awards.push({
        medal: entry.medal,
        disciplineId: id,
        discipline: label,
        recipient: entry.name || playerName,
        via: hit.via,
      });
    }
  }

  // Sort awards: gold first, then silver, bronze; then by discipline label
  const rank = { złoty: 0, srebrny: 1, brązowy: 2 };
  awards.sort((a, b) => {
    const ra = rank[a.medal] ?? 9;
    const rb = rank[b.medal] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.discipline.localeCompare(b.discipline, "pl");
  });

  return awards;
}

/**
 * Count medals by type.
 * @param {{ medal: string }[]} awards
 */
export function countMedals(awards) {
  const c = { złoty: 0, srebrny: 0, brązowy: 0 };
  for (const a of awards || []) {
    if (c[a.medal] != null) c[a.medal] += 1;
  }
  return c;
}

/**
 * Full cross-discipline profile for one player (for Gracze tab).
 * @param {string} playerName
 * @param {Record<string, any>} disciplines
 */
export function buildPlayerProfile(playerName, disciplines) {
  const medals = collectPlayerMedals(playerName, disciplines);
  return {
    name: playerName,
    medals,
    medalCounts: countMedals(medals),
    pilka: playerTeamMatchCards(playerName, disciplines.pilka),
    siatkowka: playerTeamMatchCards(playerName, disciplines.siatkowka),
    pilka_ind: playerSkillStanding(playerName, disciplines.pilka_ind),
    koszykowka: playerSkillStanding(playerName, disciplines.koszykowka),
    badminton: playerIndividualMatchCards(playerName, disciplines.badminton),
  };
}

/**
 * Sort players for Gracze tab: gold ↓, silver ↓, bronze ↓, then A–Z.
 * @param {{ name: string }[]} directory
 * @param {Record<string, any>} disciplines
 */
export function sortPlayersByMedals(directory, disciplines) {
  return [...(directory || [])]
    .map((entry) => {
      const medals = collectPlayerMedals(entry.name, disciplines);
      const counts = countMedals(medals);
      return { ...entry, medals, medalCounts: counts };
    })
    .sort((a, b) => {
      const ca = a.medalCounts;
      const cb = b.medalCounts;
      if (cb.złoty !== ca.złoty) return cb.złoty - ca.złoty;
      if (cb.srebrny !== ca.srebrny) return cb.srebrny - ca.srebrny;
      if (cb.brązowy !== ca.brązowy) return cb.brązowy - ca.brązowy;
      return a.name.localeCompare(b.name, "pl", { sensitivity: "base" });
    });
}

/**
 * Load all tournament data.
 * @returns {Promise<{ info: any, disciplines: Record<string, any>, playersDirectory: {id:string,name:string}[], fetchedAt: string, fromCache?: boolean, errors?: string[] }>}
 */
export async function loadTournamentData() {
  const errors = [];
  /** @type {Record<string, any>} */
  const disciplines = {};
  /** @type {{ id: string, name: string }[]} */
  let playersDirectory = [];
  let info = {
    title: "Olimpiada Bieździadów 2026",
    paragraphs: [],
    meta: {},
  };

  const tasks = TABS.map(async (tab) => {
    try {
      const rows = await fetchSheetRows(tab.sheet);
      if (tab.id === "info") {
        info = parseInfoSheet(rows);
      } else if (tab.id === "gracze") {
        playersDirectory = parsePlayersDirectory(rows);
      } else {
        disciplines[tab.id] = parseDisciplineSheet(tab.sheet, rows);
      }
    } catch (e) {
      console.error(e);
      errors.push(`${tab.label}: ${e.message || e}`);
      if (tab.id === "gracze") {
        playersDirectory = [];
      } else if (tab.id !== "info") {
        disciplines[tab.id] = {
          sheetName: tab.sheet,
          title: tab.label,
          teams: [],
          matches: [],
          ranking: [],
          players: [],
          sections: [],
        };
      }
    }
  });

  await Promise.all(tasks);

  // Fallback directory from union of known players if sheet empty
  if (!playersDirectory.length) {
    const seen = new Set();
    const add = (n) => {
      const name = cellStr(n);
      const key = normName(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      playersDirectory.push({ id: "", name });
    };
    for (const disc of Object.values(disciplines)) {
      for (const t of disc.teams || []) {
        for (const p of t.players || []) add(p);
      }
      for (const p of disc.players || []) add(p.name);
    }
    playersDirectory.sort((a, b) =>
      a.name.localeCompare(b.name, "pl", { sensitivity: "base" })
    );
  }

  const payload = {
    info,
    disciplines,
    playersDirectory,
    fetchedAt: new Date().toISOString(),
    errors: errors.length ? errors : undefined,
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }

  return payload;
}

/**
 * Read last successful snapshot from localStorage.
 */
export function loadCachedData() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    data.fromCache = true;
    return data;
  } catch {
    return null;
  }
}
