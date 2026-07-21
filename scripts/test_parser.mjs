import { readFileSync } from "fs";
import { parseCsv, parseInfoSheet, parseDisciplineSheet } from "../js/data.js";

const sample = JSON.parse(readFileSync(new URL("../data/sample.json", import.meta.url), "utf8"));

const info = parseInfoSheet(sample.sheets["Info"]);
console.log("INFO title:", info.title);
console.log("INFO paragraphs:", info.paragraphs.length, info.meta);

for (const name of ["Piłka Nożna", "Siatkówka", "Koszykówka", "Badminton", "Inne"]) {
  const d = parseDisciplineSheet(name, sample.sheets[name]);
  console.log(name + ":", {
    teams: d.teams.length,
    matches: d.matches.length,
    ranking: d.ranking.length,
    players: d.players.length,
    sections: d.sections.length,
    matchSample: d.matches[0],
    teamSample: d.teams[0],
    playerSample: d.players[0],
    sectionSample: d.sections[0]?.title,
  });
}

const legacyCsv = [
  '"","Piłka Nożna"',
  '"","DRUŻYNY"',
  '"","ID_drużyny","Nazwa drużyny","Gracze"',
  '"","1","Drużyna 1","A, B"',
  '"","MECZE (faza pucharowa)"',
  '"","ID_meczu","Faza","Drużyna 1","Drużyna 2","Wynik (X:Y)"',
  '"","1","1/2 Finału","Drużyna 1","Drużyna 2","2:1"',
  '"","2","Finał","","",""',
  '"","RANKING INDYWIDUALNY"',
  '"","miejsce","gracz","%","różnica","uwagi"',
  '"","1","Jan","100%","+3",""',
].join("\n");

const leg = parseDisciplineSheet("Piłka Nożna", parseCsv(legacyCsv));
console.log("LEGACY:", {
  teams: leg.teams,
  matches: leg.matches,
  ranking: leg.ranking,
});
