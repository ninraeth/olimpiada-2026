/** Configuration for Olimpiada Bieździadów 2026 PWA */

export const SPREADSHEET_ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU";

/**
 * Google Sheet tab GIDs (from the document).
 * Prefer export?format=csv&gid=… over gviz — gviz coerces mixed columns to
 * numbers and DROPS text like "s" in attempt cells (e.g. H9).
 */
export const SHEET_GIDS = {
  Info: "319772086",
  Gracze: "54966058",
  "Piłka Nożna": "1316428330",
  Siatkówka: "734879588",
  Koszykówka: "590850824",
  "Piłka ind.": "2094114091",
  Badminton: "593977644",
  Inne: "2009710327",
};

/** Tab labels and corresponding Google Sheet names (must match sheet titles). */
export const TABS = [
  { id: "info", label: "Info", sheet: "Info", icon: "ℹ️" },
  { id: "gracze", label: "Gracze", sheet: "Gracze", icon: "👥" },
  { id: "pilka", label: "Piłka Nożna", sheet: "Piłka Nożna", icon: "⚽" },
  { id: "pilka_ind", label: "Piłka ind.", sheet: "Piłka ind.", icon: "🎯" },
  { id: "siatkowka", label: "Siatkówka", sheet: "Siatkówka", icon: "🏐" },
  { id: "koszykowka", label: "Koszykówka", sheet: "Koszykówka", icon: "🏀" },
  { id: "badminton", label: "Badminton", sheet: "Badminton", icon: "🏸" },
  { id: "inne", label: "Inne", sheet: "Inne", icon: "🏆" },
];

/** Shot categories for attempt-based individual rankings */
export const BASKETBALL_SHOT_KEYS = ["1P", "2P", "3P", "UK1", "UK2"];
export const FOOTBALL_IND_SHOT_KEYS = ["Karne", "1na1", "Luta"];

/** Auto-refresh interval in milliseconds (5 minutes) */
export const REFRESH_INTERVAL_MS = 5 * 60_000;

/** localStorage key for last successful data snapshot */
export const CACHE_KEY = "olimpiada2026_data_v2";

/** App metadata */
export const APP_TITLE = "Olimpiada Bieździadów 2026";

/**
 * Official CSV export by gid — preserves text values (e.g. letter "s").
 * CORS: Access-Control-Allow-Origin: *
 * @param {string} sheetName
 */
export function exportCsvUrl(sheetName) {
  const gid = SHEET_GIDS[sheetName];
  if (!gid) return null;
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

/**
 * Build gviz CSV URL for a sheet (fallback).
 * Warning: mixed-type columns may drop non-numeric cells.
 * @param {string} sheetName
 */
export function gvizCsvUrl(sheetName) {
  const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: sheetName,
  });
  return `${base}?${params.toString()}`;
}

/**
 * OpenSheet fallback (CORS-friendly JSON).
 * @param {string} sheetName
 */
export function openSheetUrl(sheetName) {
  return `https://opensheet.elk.sh/${SPREADSHEET_ID}/${encodeURIComponent(sheetName)}`;
}
