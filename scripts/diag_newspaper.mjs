const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};

import { parseDisciplineSheet } from "../js/data.js";
import { extractEventsSnapshot, detectEvents } from "../js/notifications.js";
import {
  detectNewspaperEvents,
  classifyMatchStage,
  resolveBackgroundUrl,
  normalizeBackgroundFile,
} from "../js/newspaper.js";
import { newspaperBackgrounds } from "../js/newspaperBackgrounds.js";

function parseCsv(text) {
  const rowsOut = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
      continue;
    }
    if (!q && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rowsOut.push(row);
      row = [];
      cur = "";
      continue;
    }
    if (!q && c === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rowsOut.push(row);
  }
  return rowsOut;
}

const ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU";
async function load(gid, name) {
  const url = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${gid}`;
  const t = await (await fetch(url)).text();
  return parseDisciplineSheet(name, parseCsv(t));
}

console.log("=== config stems ===");
for (const [k, v] of Object.entries(newspaperBackgrounds)) {
  const list = Array.isArray(v) ? v : [v];
  for (const x of list) {
    console.log(k, x, "->", normalizeBackgroundFile(x));
  }
}

const pilka = await load("1316428330", "Piłka Nożna");
const siat = await load("734879588", "Siatkówka");
console.log(
  "pilka matches",
  pilka.matches.map((m) => ({
    phase: m.phase,
    score: m.score,
    stage: classifyMatchStage(m.phase),
  }))
);
console.log(
  "siat matches",
  siat.matches.map((m) => ({
    phase: m.phase,
    score: m.score,
    stage: classifyMatchStage(m.phase),
  }))
);

const data = {
  disciplines: {
    pilka,
    siatkowka: siat,
    badminton: { matches: [] },
    koszykowka: { players: [], medals: [] },
    pilka_ind: { players: [], medals: [] },
  },
};
const next = extractEventsSnapshot(data);
const prev = { v: 1, matches: {}, leaders: {}, golds: {} };
const papers = detectNewspaperEvents(prev, next, data);
console.log("newspaper count", papers.length);
for (const p of papers) {
  console.log(
    "-",
    p.title,
    p.newspaper?.bgKey,
    p.newspaper?.background,
    p.discipline
  );
}
const regular = detectEvents(prev, next, data);
console.log(
  "regular match/gold",
  regular
    .filter((e) => e.type === "match_result" || e.type === "gold")
    .map((e) => `${e.type}:${e.title}`)
);
