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

  if (
    joined.includes("id_druzyny") ||
    (joined.includes("nazwa druzyny") && joined.includes("gracze")) ||
    (joined.includes("nazwa") && joined.includes("gracze") && !joined.includes("faza"))
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

function parseTeamRow(headers, row) {
  const nameIdx = findCol(headers, [
    (h) => h.includes("nazwa"),
    (h) => h === "druzyna",
  ]);
  const playersIdx = findCol(headers, [
    (h) => h.includes("gracze"),
    (h) => h.includes("zawodnicy"),
  ]);
  const teamName =
    nameIdx >= 0 ? cellStr(row[nameIdx]) : cellStr(row[1]);
  if (!teamName) return null;
  if (
    /^id_/i.test(teamName) ||
    /^nazwa/i.test(teamName) ||
    /^\d+(\.0)?$/.test(teamName) ||
    /^(faza|final|finał|eliminacje|gracz|miejsce|mecz)/i.test(teamName)
  ) {
    return null;
  }

  const playersRaw =
    playersIdx >= 0 ? cellStr(row[playersIdx]) : cellStr(row[2]);
  // Players cell should look like a name list, not another team header
  if (/^druzyna 1$/i.test(playersRaw) || /^wynik/i.test(playersRaw)) {
    return null;
  }
  const players = playersRaw
    ? playersRaw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return { name: teamName, players };
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

function parseBasketballPlayerRow(headers, row) {
  const nameIdx = findCol(headers, [
    (h) => h.includes("imie"),
    (h) => h.includes("gracz") && !h.includes("id"),
    (h) => h === "nazwa",
  ]);
  const scoreIdx = findCol(headers, [
    (h) => h === "wynik",
    (h) => h.includes("wynik"),
  ]);

  const name = nameIdx >= 0 ? cellStr(row[nameIdx]) : cellStr(row[1]);
  if (!name || /^imie/i.test(name) || /^id_/i.test(name)) return null;

  let scoreRaw = scoreIdx >= 0 ? cellStr(row[scoreIdx]) : cellStr(row[2]);
  // Skip formula text if unevaluated
  if (scoreRaw.startsWith("=")) scoreRaw = "";

  /** @type {Record<string, string>} */
  const attempts = {};
  const attemptValues = [];
  headers.forEach((h, i) => {
    const nh = normalizeHeader(h);
    if (nh.includes("proba") || nh.includes("próba") || /[123]p|uk[12]/.test(nh)) {
      const v = cellStr(row[i]);
      if (v && !v.startsWith("=")) {
        attempts[cellStr(h)] = v;
        const n = Number(v.replace(",", "."));
        if (!Number.isNaN(n)) attemptValues.push(n);
      }
    }
  });

  let score = scoreRaw;
  if (!score && attemptValues.length) {
    const avg =
      attemptValues.reduce((a, b) => a + b, 0) / attemptValues.length;
    score = String(Math.round(avg * 100) / 100);
  }

  return {
    name,
    score,
    scoreNum: score ? Number(String(score).replace(",", ".")) || 0 : null,
    attempts,
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
 * Walk rows and split into section blocks.
 * Supports new markers (# DRUŻYNY …) and legacy multi-table gviz exports.
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
      startSection(marker, title, null);
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

  // Basketball ranking = players sorted by score
  if (/koszyk/i.test(sheetName) && result.players.length) {
    const sorted = [...result.players]
      .filter((p) => p.scoreNum != null || p.score)
      .sort((a, b) => (b.scoreNum ?? -1) - (a.scoreNum ?? -1));
    if (sorted.length && result.ranking.length === 0) {
      result.ranking = sorted.map((p, i) => ({
        place: String(i + 1),
        player: p.name,
        winRate: p.score || "—",
        diff: "",
        notes: "",
        extra: {},
      }));
    }
  }

  return result;
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
