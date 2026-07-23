import { parseDisciplineSheet } from "../js/data.js";

const rows = [
  ["T"],
  ["# STREFA MEDALOWA"],
  ["medal", "nazwa", "gracze"],
  ["złoty", "Drużyna 1", "Ali, Oli"],
  ["srebrny", "Ali", ""],
  ["brązowy", "Piotrek", ""],
];

const d = parseDisciplineSheet("Siatkówka", rows);
console.log(JSON.stringify(d.medals, null, 2));
