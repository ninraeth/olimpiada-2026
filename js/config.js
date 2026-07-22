/** Configuration for Olimpiada Bieździadów 2026 PWA */

export const SPREADSHEET_ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU";

/** Tab labels and corresponding Google Sheet names (must match sheet titles). */
export const TABS = [
  { id: "info", label: "Info", sheet: "Info", icon: "ℹ️" },
  { id: "pilka", label: "Piłka Nożna", sheet: "Piłka Nożna", icon: "⚽" },
  { id: "siatkowka", label: "Siatkówka", sheet: "Siatkówka", icon: "🏐" },
  { id: "koszykowka", label: "Koszykówka", sheet: "Koszykówka", icon: "🏀" },
  { id: "badminton", label: "Badminton", sheet: "Badminton", icon: "🏸" },
  { id: "inne", label: "Inne", sheet: "Inne", icon: "🏆" },
];

/** Auto-refresh interval in milliseconds (5 minutes) */
export const REFRESH_INTERVAL_MS = 5 * 60_000;

/** localStorage key for last successful data snapshot */
export const CACHE_KEY = "olimpiada2026_data_v1";

/** App metadata */
export const APP_TITLE = "Olimpiada Bieździadów 2026";

/**
 * Build gviz CSV URL for a sheet.
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
