/**
 * Unit-style checks for notification change detection (no DOM).
 * Run: node scripts/test_notifications.mjs
 */

import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Dynamic import of ES modules from project
const { extractEventsSnapshot, detectEvents, isCurrentAttemptComplete } =
  await import(pathToFileURL(path.join(root, "js/notifications.js")).href);
const { parseMatchScore } = await import(
  pathToFileURL(path.join(root, "js/data.js")).href
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─── Match score parse sanity ──────────────────────────────────
assert(parseMatchScore("3:1")?.a === 3, "parse 3:1 a");
assert(parseMatchScore("3:1")?.b === 1, "parse 3:1 b");

// ─── Attempt completeness ──────────────────────────────────────
const shotKeys = ["1P", "2P", "3P"];
assert(
  isCurrentAttemptComplete(
    {
      attemptRows: [{ index: 1, shots: { "1P": "5", "2P": "3", "3P": "s" } }],
    },
    shotKeys
  ),
  "complete attempt"
);
assert(
  !isCurrentAttemptComplete(
    {
      attemptRows: [{ index: 1, shots: { "1P": "5", "2P": "", "3P": "1" } }],
    },
    shotKeys
  ),
  "incomplete attempt"
);

// ─── Snapshot + detect ─────────────────────────────────────────
function makeData({ score, leader, goldName, players = 3 } = {}) {
  const skillPlayers = [];
  for (let i = 0; i < players; i++) {
    const name = i === 0 && leader ? leader : `Gracz ${i + 1}`;
    skillPlayers.push({
      name,
      scoreNum: 10 - i,
      score: String(10 - i),
      attemptRows: [
        {
          index: 1,
          shots: { "1P": "5", "2P": "5", "3P": "5", UK1: "1", UK2: "1" },
        },
      ],
    });
  }
  return {
    disciplines: {
      pilka: {
        title: "Piłka Nożna",
        matches: [
          {
            phase: "Eliminacje",
            side1: "Drużyna 1",
            side2: "Drużyna 2",
            score: score || "",
          },
        ],
        medals: goldName
          ? [
              { medal: "złoty", name: goldName, players: "", playerList: [] },
              { medal: "srebrny", name: "", players: "", playerList: [] },
              { medal: "brązowy", name: "", players: "", playerList: [] },
            ]
          : [],
      },
      koszykowka: {
        title: "Koszykówka",
        skillShotKeys: ["1P", "2P", "3P", "UK1", "UK2"],
        players: skillPlayers,
        medals: [],
      },
      pilka_ind: { players: [], medals: [] },
      siatkowka: { matches: [], medals: [] },
      badminton: { matches: [], medals: [] },
      inne: { competitions: [] },
    },
  };
}

const prev = extractEventsSnapshot(makeData({}));
const nextMatch = extractEventsSnapshot(makeData({ score: "3:1" }));
const matchEvents = detectEvents(prev, nextMatch, makeData({ score: "3:1" }));
assert(
  matchEvents.some((e) => e.type === "match_result"),
  "detect new match result"
);
assert(
  matchEvents[0].body.includes("3:1"),
  "match body has score"
);

const prevL = extractEventsSnapshot(
  makeData({ leader: "Anna", players: 3 })
);
// Change leader: Bob has highest score
const dataBob = makeData({ leader: "Bob", players: 3 });
// Ensure Bob is first with higher score
dataBob.disciplines.koszykowka.players = [
  {
    name: "Bob",
    scoreNum: 20,
    score: "20",
    attemptRows: [
      {
        index: 1,
        shots: { "1P": "9", "2P": "9", "3P": "9", UK1: "2", UK2: "2" },
      },
    ],
  },
  {
    name: "Anna",
    scoreNum: 10,
    score: "10",
    attemptRows: [
      {
        index: 1,
        shots: { "1P": "5", "2P": "5", "3P": "5", UK1: "1", UK2: "1" },
      },
    ],
  },
  {
    name: "Celina",
    scoreNum: 8,
    score: "8",
    attemptRows: [
      {
        index: 1,
        shots: { "1P": "4", "2P": "4", "3P": "4", UK1: "1", UK2: "1" },
      },
    ],
  },
];
const nextL = extractEventsSnapshot(dataBob);
const leaderEvents = detectEvents(prevL, nextL, dataBob);
assert(
  leaderEvents.some((e) => e.type === "leader" && e.recipient === "Bob"),
  "detect new leader Bob"
);

// Incomplete attempt should NOT fire leader
const incomplete = structuredClone(dataBob);
incomplete.disciplines.koszykowka.players[0].attemptRows[0].shots["3P"] = "";
const nextInc = extractEventsSnapshot(incomplete);
const noLeader = detectEvents(prevL, nextInc, incomplete);
assert(
  !noLeader.some((e) => e.type === "leader"),
  "no leader when attempt incomplete"
);

// Gold medal
const prevG = extractEventsSnapshot(makeData({}));
const dataGold = makeData({ goldName: "Drużyna 3" });
const nextG = extractEventsSnapshot(dataGold);
const goldEvents = detectEvents(prevG, nextG, dataGold);
assert(
  goldEvents.some((e) => e.type === "gold" && e.celebrate),
  "detect gold medal"
);
assert(
  goldEvents.some((e) => e.body.includes("Drużyna 3")),
  "gold body has name"
);

// Silver-only change should not appear (we only track golds in snapshot)
// No-op re-detect
const same = detectEvents(nextG, nextG, dataGold);
assert(same.length === 0, "no events when snapshot unchanged");

console.log("test_notifications: OK");
