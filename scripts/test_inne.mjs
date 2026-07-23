import {
  parseDisciplineSheet,
  collectPlayerMedals,
} from "../js/data.js";

const rows = [
  ["Inne konkurencje"],
  [],
  ["# SEKCJA | Krokiet"],
  ["miejsce", "uczestnik", "wynik", "uwagi"],
  [],
  ["# STREFA MEDALOWA"],
  ["medal", "nazwa", "gracze"],
  ["złoty", "", ""],
  ["srebrny", "", ""],
  ["brązowy", "", ""],
  [],
  ["# SEKCJA | Pétanque"],
  ["miejsce", "uczestnik", "wynik", "uwagi"],
  [],
  ["# STREFA MEDALOWA"],
  ["medal", "nazwa", "gracze"],
  ["złoty", "Mela", ""],
  ["srebrny", "", ""],
  ["brązowy", "", ""],
];

const d = parseDisciplineSheet("Inne", rows);
console.log("title:", d.title);
console.log(
  "competitions:",
  JSON.stringify(
    d.competitions.map((c) => ({
      name: c.name,
      medals: c.medals.map((m) => `${m.medal}:${m.name || "-"}`),
    })),
    null,
    2
  )
);

const awards = collectPlayerMedals("Mela", { inne: d });
console.log(
  "Mela medals:",
  awards.map((a) => `${a.medal} @ ${a.discipline}`)
);

// live sheet
const ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU";
const t = await (
  await fetch(
    `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=2009710327`
  )
).text();

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

const live = parseDisciplineSheet("Inne", parseCsv(t));
console.log("LIVE title:", live.title);
console.log(
  "LIVE competitions:",
  live.competitions.map((c) => ({
    name: c.name,
    gold: c.medals.find((m) => m.medal === "złoty")?.name || "",
  }))
);
console.log(
  "LIVE Mela:",
  collectPlayerMedals("Mela", { inne: live }).map(
    (a) => `${a.medal}@${a.discipline}`
  )
);
