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
  { id: "pilka", label: "Piłka Nożna", sheet: "Piłka Nożna", icon: "🏟️" },
  { id: "pilka_ind", label: "Piłka ind.", sheet: "Piłka ind.", icon: "⚽" },
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

/**
 * How long a local snapshot is still considered "safe to show".
 * Older cache is discarded — better empty/error than wrong match results.
 * (Tournament data changes; multi-hour offline views caused false scores.)
 */
export const MAX_TRUSTED_CACHE_AGE_MS = 10 * 60_000;

/**
 * localStorage key for last successful *network* snapshot.
 * Bump when cache shape or trust rules change (v3: never store sample/partial junk).
 */
export const CACHE_KEY = "olimpiada2026_data_v3";

/** localStorage: compact snapshot for change-detection (notifications) */
export const EVENTS_SNAPSHOT_KEY = "olimpiada2026_events_snap_v1";

/** localStorage: notification cards shown in Info */
export const NOTIFICATIONS_KEY = "olimpiada2026_notifications_v1";

/** localStorage: user preferences (sounds, …) */
export const SETTINGS_KEY = "olimpiada2026_settings_v1";

/** localStorage: next newspaper text index per template pool */
export const NEWSPAPER_TEXT_USAGE_KEY = "olimpiada2026_newspaper_text_usage_v1";

/** localStorage: next newspaper background index per bg key */
export const NEWSPAPER_BG_USAGE_KEY = "olimpiada2026_newspaper_bg_usage_v1";

/** localStorage: which newspaper stories already emitted (idempotent) */
export const NEWSPAPER_FIRED_KEY = "olimpiada2026_newspaper_fired_v1";

/**
 * Gold-medal celebration sounds available in Options.
 * `url: null` = built-in Web Audio chime ("Domyślny").
 * Files live in /sounds/.
 */
export const MEDAL_SOUNDS = [
  { id: "default", label: "Domyślny", url: null },
  { id: "incredible", label: "Incredible", url: "sounds/incredible.mp3" },
  { id: "67_ft_dori", label: "67 (ft. Dori)", url: "sounds/67_ft_Dori.mp3" },
  { id: "champions", label: "The Champions", url: "sounds/Champions.mp3" },
  {
    id: "m_to_the_b",
    label: "M to the B (ft. Dori67)",
    url: "sounds/M_to_the_B_ft_Dori67.mp3",
  },
  { id: "mario", label: "Mario", url: "sounds/mario.mp3" },
  { id: "noice", label: "Noice", url: "sounds/noice.mp3" },
  { id: "rocky", label: "Rocky", url: "sounds/rocky.mp3" },
  {
    id: "king_of_the_world",
    label: "King of the world",
    url: "sounds/Titanic_king_of_the_world.mp3",
  },
];

/** Default selection when nothing stored yet */
export const DEFAULT_MEDAL_SOUND_ID = "default";

/** App metadata */
export const APP_TITLE = "Olimpiada Bieździadów 2026";

/** Display labels for discipline ids (tabs / notifications) */
export const DISCIPLINE_LABELS = {
  pilka: "Piłka Nożna",
  pilka_ind: "Piłka ind.",
  siatkowka: "Siatkówka",
  koszykowka: "Koszykówka",
  badminton: "Badminton",
  inne: "Inne",
};

/**
 * Official CSV export by gid — preserves text values (e.g. letter "s").
 * CORS: Access-Control-Allow-Origin: *
 * @param {string} sheetName
 */
/**
 * Cache-buster so mobile browsers / CDNs don't serve a frozen sheet export.
 * @param {string} url
 */
export function withCacheBust(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_ts=${Date.now()}`;
}

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

/* OpenSheet removed: third-party proxy can return multi-day-old sheet snapshots. */
