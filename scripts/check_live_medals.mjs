import { parseDisciplineSheet } from "../js/data.js";

const ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU";
const sheets = [
  ["Piłka Nożna", "1316428330"],
  ["Siatkówka", "734879588"],
];

function parseCsv(text) {
  const rows = [];
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
      rows.push(row);
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
    rows.push(row);
  }
  return rows;
}

for (const [name, gid] of sheets) {
  const t = await (
    await fetch(
      `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${gid}`
    )
  ).text();
  const d = parseDisciplineSheet(name, parseCsv(t));
  console.log(name);
  console.log("  medals:", JSON.stringify(d.medals, null, 2));
  console.log("  teams[0]:", d.teams?.[0]);
}
