/**
 * Fetch and parse tournament data from Google Sheets.
 * Supports both new (# SEKCJA) and legacy layouts.
 */

import {
  TABS,
  gvizCsvUrl,
  openSheetUrl,
  CACHE_KEY,
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
  section: /#\s*SEKCJA/i,
};

const LEGACY_SECTION = {
  teams: /^(DRU[ŻZ]YNY)$/i,
  matches: /^(MECZE)/i,
  ranking: /^(RANKING)/i,
  players: /^(GRACZE)$/i,
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

  // Teams: ID + nazwa, players may be one "Gracze" col OR many "Gracz 1/2/3…" cols
  if (
    joined.includes("id_druzyny") ||
    joined.includes("nazwa druzyny") ||
    (joined.includes("nazwa") &&
      (joined.includes("gracze") || /gracz\s*\d/.test(joined)) &&
      !joined.includes("faza") &&
      !joined.includes("wynik (") &&
      !joined.includes("id_meczu"))
  ) {
    return "teams";
  }

  if (
    joined.includes("id_gracza") ||
    (joined.includes("imie gracza") && joined.includes("wynik")) ||
    (joined.includes("imie") && joined.includes("proba"))
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

const ATTEMPT_SHOT_KEYS = ["1P", "2P", "3P", "UK1", "UK2"];

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
 * @returns {Record<string, number[]>}
 */
export function collectShotPools(players) {
  /** @type {Record<string, number[]>} */
  const pools = { "1P": [], "2P": [], "3P": [], UK1: [], UK2: [] };
  for (const p of players || []) {
    const rows =
      p.attemptRows?.length > 0
        ? p.attemptRows
        : buildAttemptRowsFromFlat(p.attempts || {});
    for (const ar of rows) {
      for (const key of ATTEMPT_SHOT_KEYS) {
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
 * Mean of filled shot values in one attempt (1P, 2P, 3P, UK1, UK2).
 * @param {Record<string, string>} shots
 * @param {Record<string, number[]>|null|undefined} pools
 * @returns {number|null}
 */
function averageAttemptShots(shots, pools) {
  const nums = [];
  for (const key of ATTEMPT_SHOT_KEYS) {
    const n = resolveShotValue(shots?.[key], key, pools);
    if (n != null) nums.push(n);
  }
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Weighted basketball score from any number of attempts:
 * - 1 attempt  → mean of that attempt's shots (1P…UK2)
 * - 2+ attempts → 50% × mean of BEST attempt + 50% × mean of the OTHER attempts' means
 *   Example: means 5, 2, 4 → (5 + (2+4)/2) / 2 = 4.00
 *   NOT the simple average (5+2+4)/3 = 3.67
 *
 * @param {{ index: number, shots: Record<string, string> }[]} attemptRows
 * @param {Record<string, number[]>|null|undefined} pools  needed to resolve "S"
 * @returns {number|null}
 */
export function computeBasketballScore(attemptRows, pools = null) {
  if (!attemptRows?.length) return null;

  /** @type {number[]} */
  const attemptMeans = [];
  for (const ar of attemptRows) {
    const avg = averageAttemptShots(ar.shots, pools);
    if (avg != null) attemptMeans.push(avg);
  }
  if (!attemptMeans.length) return null;
  if (attemptMeans.length === 1) return attemptMeans[0];

  // Best attempt (highest mean)
  let bestI = 0;
  for (let i = 1; i < attemptMeans.length; i++) {
    if (attemptMeans[i] > attemptMeans[bestI]) bestI = i;
  }
  const best = attemptMeans[bestI];
  const others = attemptMeans.filter((_, i) => i !== bestI);
  const othersMean = others.reduce((a, b) => a + b, 0) / others.length;
  // Explicit form: (best + othersMean) / 2
  return (best + othersMean) / 2;
}

/**
 * After all players are parsed: resolve "S" and recompute scores (never use sheet AVERAGE).
 * @param {any[]} players
 */
export function finalizeBasketballPlayers(players) {
  // Ensure attempt rows exist (rebuild from flat headers if needed)
  for (const p of players) {
    if (!p.attemptRows?.length && p.attempts && Object.keys(p.attempts).length) {
      p.attemptRows = buildAttemptRowsFromFlat(p.attempts);
    }
  }

  const pools = collectShotPools(players);
  /** @type {Record<string, number|null>} */
  const sResolved = {};
  for (const key of ATTEMPT_SHOT_KEYS) {
    sResolved[key] = specialSValue(key, pools);
  }

  for (const p of players) {
    // Always recompute from attempts + S pools — do NOT use sheet WYNIK (simple AVERAGE)
    const scoreNum = computeBasketballScore(p.attemptRows || [], pools);
    p.scoreNum = scoreNum;
    p.score = scoreNum != null ? formatScore2(scoreNum) : "";
    p.sResolved = sResolved;
    p.attemptMeans = (p.attemptRows || []).map((ar) =>
      averageAttemptShots(ar.shots, pools)
    );
    p.resolvedAttemptRows = (p.attemptRows || []).map((ar) => {
      /** @type {Record<string, string>} */
      const shots = {};
      for (const key of ATTEMPT_SHOT_KEYS) {
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

/**
 * Detect attempt index + shot key from header like "Próba 1 - 1P".
 * Works for Próba N beyond 3; tolerates odd dashes/spaces from Sheets.
 * @param {string} header
 * @returns {{ attempt: number, shot: string }|null}
 */
function parseAttemptHeader(header) {
  const raw = cellStr(header);
  if (!raw) return null;
  const nh = normalizeHeader(raw);

  // "proba 1 - 1p", "proba 1 – 1p", "proba1 1p", "proba 2 uk1"
  let m = nh.match(
    /proba\s*(\d+)\s*[-–—:._\s]*\s*(1\s*p|2\s*p|3\s*p|uk\s*1|uk\s*2)/i
  );
  if (!m) {
    // "1 - 1p" / "2-uk1" when "proba" was lost in merge
    m = nh.match(
      /(?:^|[^a-z0-9])(\d{1,2})\s*[-–—:._\s]+\s*(1\s*p|2\s*p|3\s*p|uk\s*1|uk\s*2)(?:$|[^a-z0-9])/i
    );
  }
  if (!m) {
    // last resort: any "proba N ... 1p"
    m = nh.match(/proba\s*(\d+).{0,12}?(1p|2p|3p|uk\s*1|uk\s*2)/i);
  }
  if (!m) return null;

  const attempt = Number(m[1]);
  const shot = m[2].toUpperCase().replace(/\s+/g, "");
  if (!ATTEMPT_SHOT_KEYS.includes(shot)) return null;
  if (!Number.isFinite(attempt) || attempt < 1) return null;
  return { attempt, shot };
}

function emptyShotMap() {
  return { "1P": "", "2P": "", "3P": "", UK1: "", UK2: "" };
}

/**
 * Rebuild attempt rows from flat { "Próba 1 - 1P": "5", ... } map.
 * @param {Record<string, string>} flat
 */
function buildAttemptRowsFromFlat(flat) {
  /** @type {Map<number, Record<string, string>>} */
  const byAttempt = new Map();
  for (const [h, v] of Object.entries(flat || {})) {
    const meta = parseAttemptHeader(h);
    if (!meta || !hasShotValue(v)) continue;
    if (!byAttempt.has(meta.attempt)) {
      byAttempt.set(meta.attempt, emptyShotMap());
    }
    byAttempt.get(meta.attempt)[meta.shot] = cellStr(v);
  }
  return [...byAttempt.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({ index, shots: byAttempt.get(index) }))
    .filter((ar) => ATTEMPT_SHOT_KEYS.some((k) => hasShotValue(ar.shots[k])));
}

/**
 * @param {string[]} headers
 * @param {string[]} row
 */
function parseBasketballPlayerRow(headers, row) {
  // Prefer "imie" — avoid matching random "gracz" columns
  const nameIdx = findCol(headers, [
    (h) => h.includes("imie"),
    (h) => h === "gracz" || h.startsWith("gracz "),
    (h) => h.includes("nazwa") && !h.includes("druzyn"),
  ]);
  const scoreIdx = findCol(headers, [
    (h) => h === "wynik",
    (h) => h.startsWith("wynik") && !h.includes("proba"),
  ]);

  // name column: never use pure ID
  let name = nameIdx >= 0 ? cellStr(row[nameIdx]) : "";
  if (!name) {
    // fallback: first non-numeric, non-empty cell that isn't a score
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
  // Keep "Gracz 1", "Gracz 4", real names, etc.

  let scoreRaw = scoreIdx >= 0 ? cellStr(row[scoreIdx]) : "";
  if (scoreRaw.startsWith("=")) scoreRaw = "";

  /** @type {Map<number, Record<string, string>>} */
  const byAttempt = new Map();
  /** @type {Record<string, string>} */
  const attemptsFlat = {};

  const nHeaders = Math.max(headers.length, row.length);
  for (let i = 0; i < nHeaders; i++) {
    const h = headers[i] != null ? headers[i] : "";
    const meta = parseAttemptHeader(h);
    const v = cellStr(row[i]);

    if (meta) {
      if (!byAttempt.has(meta.attempt)) {
        byAttempt.set(meta.attempt, emptyShotMap());
      }
      if (hasShotValue(v)) {
        byAttempt.get(meta.attempt)[meta.shot] = v;
        attemptsFlat[cellStr(h) || `${meta.attempt}-${meta.shot}`] = v;
      }
      continue;
    }

    // Fallback flat capture
    if (hasShotValue(v)) {
      const nh = normalizeHeader(h);
      if (nh.includes("proba") || /1p|2p|3p|uk\s*[12]/.test(nh)) {
        attemptsFlat[cellStr(h) || `col${i}`] = v;
      }
    }
  }

  // Build attempt rows (only attempts with at least one value / S)
  let attemptRows = [...byAttempt.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({ index, shots: byAttempt.get(index) }))
    .filter((ar) => ATTEMPT_SHOT_KEYS.some((k) => hasShotValue(ar.shots[k])));

  if (!attemptRows.length && Object.keys(attemptsFlat).length) {
    attemptRows = buildAttemptRowsFromFlat(attemptsFlat);
  }

  // Provisional score without S pool (finalized later)
  const scoreNum = computeBasketballScore(attemptRows, null);

  return {
    name,
    score: scoreNum != null ? formatScore2(scoreNum) : "",
    scoreNum,
    _scoreRaw: scoreRaw,
    attempts: attemptsFlat,
    attemptRows,
  };
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
      const isBasketball =
        /koszyk/i.test(sheetName) ||
        sec.headers.some((h) => /proba|próba|1p|2p|3p/i.test(h));
      for (const row of sec.rows) {
        if (isCommentRow(row)) continue;
        if (isBasketball) {
          const p = parseBasketballPlayerRow(sec.headers, row);
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

  // Legacy basketball: no # GRACZE, only header with ID_gracza
  if (/koszyk/i.test(sheetName) && result.players.length === 0) {
    // try find header in all sections of type that might have been missed
    for (const sec of sections) {
      if (sec.headers.some((h) => /id_gracza|imie gracza/i.test(h))) {
        for (const row of sec.rows) {
          const p = parseBasketballPlayerRow(sec.headers, row);
          if (p) result.players.push(p);
        }
      }
    }
    // raw scan
    if (result.players.length === 0) {
      for (let i = 0; i < cleaned.length; i++) {
        const ht = detectHeaderType(cleaned[i]);
        if (ht === "players") {
          const headers = cleaned[i].map(cellStr);
          for (let j = i + 1; j < cleaned.length; j++) {
            if (isEmptyRow(cleaned[j]) || isCommentRow(cleaned[j])) continue;
            if (detectSectionMarker(cellStr(cleaned[j][0]))) break;
            if (detectHeaderType(cleaned[j])) break;
            const p = parseBasketballPlayerRow(headers, cleaned[j]);
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
    result.teams.length === 0
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

  // Basketball: resolve "S" markers, recompute scores, then ranking
  if (/koszyk/i.test(sheetName) && result.players.length) {
    finalizeBasketballPlayers(result.players);
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

  // Volleyball: auto ranking from teams + matches (overrides sheet ranking)
  // Sort: win% desc, then set difference desc (per sheet rules)
  if (/siatk/i.test(sheetName)) {
    result.ranking = computeVolleyballRanking(result.teams, result.matches);
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
  return false;
}

/**
 * Build individual ranking for volleyball.
 * - Player may belong to multiple teams (all memberships counted)
 * - If both teams in a match include the player, the match counts twice
 *   (once from each team's perspective)
 * - Only matches with a parseable score count as played
 * - Sort: win rate desc, then set difference desc, then name
 *
 * @param {{ name: string, players: string[] }[]} teams
 * @param {{ phase: string, side1: string, side2: string, score: string }[]} matches
 */
export function computeVolleyballRanking(teams, matches) {
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

// ─── Fetch layer ───────────────────────────────────────────────

/**
 * Fetch sheet as string[][] via gviz CSV, fallback OpenSheet.
 * @param {string} sheetName
 */
async function fetchSheetRows(sheetName) {
  // 1) gviz CSV
  try {
    const res = await fetch(gvizCsvUrl(sheetName), {
      cache: "no-store",
      mode: "cors",
    });
    if (res.ok) {
      const text = await res.text();
      // gviz sometimes returns HTML error page
      if (text && !text.trimStart().startsWith("<")) {
        return parseCsv(text);
      }
    }
  } catch (e) {
    console.warn("gviz fetch failed for", sheetName, e);
  }

  // 2) OpenSheet JSON
  try {
    const res = await fetch(openSheetUrl(sheetName), {
      cache: "no-store",
      mode: "cors",
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        // OpenSheet returns array of objects (first row = keys)
        // Multi-section sheets are imperfect — use as fallback only
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

  // 3) Bundled sample from local xlsx (offline / dev)
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
 * Load all tournament data.
 * @returns {Promise<{ info: any, disciplines: Record<string, any>, fetchedAt: string, fromCache?: boolean, errors?: string[] }>}
 */
export async function loadTournamentData() {
  const errors = [];
  /** @type {Record<string, any>} */
  const disciplines = {};
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
      } else {
        disciplines[tab.id] = parseDisciplineSheet(tab.sheet, rows);
      }
    } catch (e) {
      console.error(e);
      errors.push(`${tab.label}: ${e.message || e}`);
      if (tab.id !== "info") {
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

  const payload = {
    info,
    disciplines,
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
