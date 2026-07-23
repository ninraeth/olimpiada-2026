import {
  parseDisciplineSheet,
  collectPlayerMedals,
  finalizeSkillPlayers,
} from "../js/data.js";

// Team-style medal zone: one player per column (like # DRUŻYNY)
const teamRows = [
  ["Siatkówka"],
  ["# DRUŻYNY"],
  ["ID_drużyny", "Nazwa drużyny", "Gracz 1", "Gracz 2", "Gracz 3"],
  ["1", "Drużyna 1", "Ali", "Oli", "Dorota"],
  ["2", "Drużyna 2", "Piotrek", "Łukasz", "Krzychu"],
  ["# STREFA MEDALOWA"],
  ["medal", "Nazwa drużyny", "Gracz 1", "Gracz 2", "Gracz 3", "Gracz 4"],
  ["złoty", "Drużyna 1", "Ali", "Oli", "Dorota", ""],
  ["srebrny", "Drużyna 2", "Piotrek", "Łukasz", "Krzychu", ""],
  ["brązowy", "", "Joasia", "", "", ""],
];

const siat = parseDisciplineSheet("Siatkówka", teamRows);
console.log("=== Team multi-col medals ===");
console.log(JSON.stringify(siat.medals, null, 2));

// Legacy comma-separated (individual / old format)
const indRows = [
  ["Koszykówka"],
  ["# STREFA MEDALOWA"],
  ["medal", "nazwa", "gracze"],
  ["złoty", "Ali", ""],
  ["srebrny", "Turniej", "Oli, Dorota"],
  ["brązowy", "", ""],
];
const kosz = parseDisciplineSheet("Koszykówka", indRows);
console.log("=== Legacy individual medals ===");
console.log(JSON.stringify(kosz.medals, null, 2));

const disciplines = { siatkowka: siat, koszykowka: kosz };
for (const name of ["Ali", "Oli", "Dorota", "Piotrek", "Joasia", "Krzychu"]) {
  const awards = collectPlayerMedals(name, disciplines);
  console.log(
    name,
    "→",
    awards.map((a) => `${a.medal}@${a.discipline}${a.via ? `(${a.via})` : ""}`).join(", ") || "(none)"
  );
}

// attemptMeans present for avg column
const players = [
  {
    name: "Ali",
    attemptRows: [
      { index: 1, shots: { "1P": "2", "2P": "4", "3P": "6", UK1: "2", UK2: "2" } },
      { index: 2, shots: { "1P": "4", "2P": "4", "3P": "4", UK1: "4", UK2: "4" } },
    ],
  },
];
finalizeSkillPlayers(players, ["1P", "2P", "3P", "UK1", "UK2"]);
console.log("=== attemptMeans ===", players[0].attemptMeans);
console.log("OK");
