/**
 * Deep functional audit / simulations for Olimpiada PWA.
 * Run: node scripts/audit_deep.mjs
 */
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
};

const findings = [];
function note(sev, area, msg, detail = "") {
  findings.push({ sev, area, msg, detail });
  const tag = sev === "high" ? "HIGH" : sev === "med" ? "MED " : "LOW ";
  console.log(`[${tag}] ${area}: ${msg}${detail ? "\n         " + detail : ""}`);
}

const {
  parseDisciplineSheet,
  parsePlayersDirectory,
  parseMatchScore,
  finalizeSkillPlayers,
  specialSValue,
  collectShotPools,
  isSpecialS,
  computeAttemptScore,
  collectPlayerMedals,
  parseGender,
  loadTournamentData,
} = await import(pathToFileURL(path.join(root, "js/data.js")).href);

const {
  extractEventsSnapshot,
  detectEvents,
  processDataForEvents,
  isCurrentAttemptComplete,
  genderForName,
  verbForm,
  matchResultBodies,
} = await import(pathToFileURL(path.join(root, "js/notifications.js")).href);

const {
  classifyMatchStage,
  isDominantVictory,
  isDominantIndividual,
  detectNewspaperEvents,
  resolveBackgroundUrl,
  normalizeBackgroundFile,
  NEWSPAPER_MASTHEAD_PX,
} = await import(pathToFileURL(path.join(root, "js/newspaper.js")).href).catch(
  async () => {
    const m = await import(pathToFileURL(path.join(root, "js/newspaper.js")).href);
    return m;
  }
);

const { newspaperTexts } = await import(
  pathToFileURL(path.join(root, "js/newspaperTexts.js")).href
);
const { newspaperBackgrounds, NEWSPAPER_DATA_FILES } = await import(
  pathToFileURL(path.join(root, "js/newspaperBackgrounds.js")).href
);
const { MEDAL_SOUNDS, DISCIPLINE_LABELS, TABS, SHEET_GIDS } = await import(
  pathToFileURL(path.join(root, "js/config.js")).href
);

// re-import NEWSPAPER_MASTHEAD from render if needed
const renderMod = await import(pathToFileURL(path.join(root, "js/render.js")).href);

console.log("\n========== 1. CONFIG CONSISTENCY ==========\n");

// Tabs vs SHEET_GIDS
for (const t of TABS) {
  if (!SHEET_GIDS[t.sheet]) {
    note("high", "config", `Tab ${t.id} sheet "${t.sheet}" missing from SHEET_GIDS`);
  }
}
// MEDAL_SOUNDS files
for (const s of MEDAL_SOUNDS) {
  if (!s.url) continue;
  const fs = await import("fs");
  const p = path.join(root, s.url);
  if (!fs.existsSync(p)) {
    note("high", "sounds", `Missing sound file for ${s.label}: ${s.url}`);
  }
}
// Background files
for (const [k, v] of Object.entries(newspaperBackgrounds)) {
  const list = Array.isArray(v) ? v : [v];
  for (const x of list) {
    const n = normalizeBackgroundFile(x);
    if (x !== "..." && !n) {
      note("med", "newspaper-bg", `Background unresolvable: ${k} → ${JSON.stringify(x)}`);
    }
  }
}
// Texts structure
const teamFields = ["close", "dominant", "finalClose", "finalDominant"];
const indFields = ["close", "dominant"];
for (const [disc, fields] of Object.entries({
  pilkaNozna: teamFields,
  siatkowka: teamFields,
  badminton: teamFields,
  koszykowka: indFields,
  pilkaInd: indFields,
})) {
  const pack = newspaperTexts[disc];
  if (!pack) {
    note("high", "newspaper-text", `Missing texts pack: ${disc}`);
    continue;
  }
  for (const f of fields) {
    if (!Array.isArray(pack[f]) || !pack[f].length) {
      note("high", "newspaper-text", `${disc}.${f} empty or not array`);
    }
  }
}

console.log("\n========== 2. SPECIAL S / SKILL SCORING ==========\n");

const shotKeys = ["1P", "2P", "3P"];
const playersS = [
  {
    name: "A",
    attemptRows: [{ index: 1, shots: { "1P": "10", "2P": "8", "3P": "6" } }],
  },
  {
    name: "B",
    attemptRows: [{ index: 1, shots: { "1P": "4", "2P": "4", "3P": "4" } }],
  },
  {
    name: "C",
    attemptRows: [{ index: 1, shots: { "1P": "S", "2P": "2", "3P": "S" } }],
  },
];
finalizeSkillPlayers(playersS, shotKeys);
const pools = collectShotPools(playersS, shotKeys);
// Pool for 1P should be 10,4 only (not S)
if (pools["1P"].length !== 2) {
  note("high", "S-score", `1P pool size expected 2 got ${pools["1P"].length}`);
} else {
  const s1 = specialSValue("1P", pools);
  // 0.5*min(4,10)+0.5*avg(4,10)=0.5*4+0.5*7=2+3.5=5.5
  if (Math.abs(s1 - 5.5) > 0.01) {
    note("high", "S-score", `S(1P) expected 5.5 got ${s1}`);
  } else {
    note("low", "S-score", `S formula OK (1P → ${s1})`);
  }
}
// All S column with no numbers
const emptyPoolPlayers = [
  { name: "X", attemptRows: [{ index: 1, shots: { "1P": "S", "2P": "S", "3P": "S" } }] },
];
finalizeSkillPlayers(emptyPoolPlayers, shotKeys);
if (emptyPoolPlayers[0].scoreNum != null && emptyPoolPlayers[0].score) {
  // might be empty score
}
if (!emptyPoolPlayers[0].score) {
  note("low", "S-score", "All-S player with empty pool gets empty score (expected)");
}

// Incomplete attempt leader guard
const incomplete = {
  name: "Lead",
  scoreNum: 99,
  attemptRows: [
    { index: 1, shots: { "1P": "9", "2P": "9", "3P": "" } },
  ],
};
if (isCurrentAttemptComplete(incomplete, shotKeys)) {
  note("high", "leader", "Incomplete attempt marked complete");
} else {
  note("low", "leader", "Incomplete attempt correctly rejected");
}

console.log("\n========== 3. MATCH SCORE PARSING ==========\n");

const scoreCases = [
  ["2:1", { a: 2, b: 1 }],
  ["3-1", { a: 3, b: 1 }],
  ["2:01:00", { a: 2, b: 1 }], // sheets time
  ["02:01:00", { a: 2, b: 1 }],
  ["", null],
  ["vs", null],
  ["2/1", { a: 2, b: 1 }],
];
for (const [raw, exp] of scoreCases) {
  const got = parseMatchScore(raw);
  const ok =
    exp == null
      ? got == null
      : got && got.a === exp.a && got.b === exp.b;
  if (!ok) {
    note("med", "parseMatchScore", `Failed for ${JSON.stringify(raw)}`, JSON.stringify(got));
  }
}

console.log("\n========== 4. PHASE / DOMINANT CLASSIFICATION ==========\n");

const phases = [
  ["1/2 Finału", "semi"],
  ["Półfinał", "semi"],
  ["Półfinały", "semi"],
  ["Finał", "final"],
  ["Mecz o 3. miejsce", "third"],
  ["Eliminacje", null],
  ["1/4 Finału", null], // should NOT be semi
  ["Towarzyski", null],
];
for (const [p, exp] of phases) {
  const g = classifyMatchStage(p);
  if (g !== exp) {
    note("high", "phase", `classifyMatchStage(${JSON.stringify(p)}) → ${g}, expected ${exp}`);
  }
}

// Dominant thresholds
const domCases = [
  ["siatkowka", "2:0", true],
  ["siatkowka", "2:1", false],
  ["pilka", "3:0", true],
  ["pilka", "2:0", false],
  ["badminton", "2:0", true],
  ["badminton", "2:1", false],
];
for (const [tab, sc, exp] of domCases) {
  const g = isDominantVictory(tab, sc);
  if (g !== exp) {
    note("med", "dominant", `${tab} ${sc} → ${g}, expected ${exp}`);
  }
}

// Individual dominant edge: 2 players only → false (not null)
const ind2 = isDominantIndividual([{ scoreNum: 20 }, { scoreNum: 1 }]);
if (ind2 !== false) {
  note("med", "dominant-ind", `2 players dominant flag = ${ind2} (expected false)`);
}
// <2 scores
const ind1 = isDominantIndividual([{ scoreNum: 10 }]);
if (ind1 != null) {
  note("med", "dominant-ind", `1 player should return null for newspaper skip, got ${ind1}`);
}

console.log("\n========== 5. REGULAR NOTIFICATIONS DIFF ==========\n");

_store.clear();
const dataEmpty = {
  disciplines: {
    pilka: {
      title: "Piłka Nożna",
      matches: [{ phase: "1/2 Finału", side1: "A", side2: "B", score: "" }],
      medals: [],
      teams: [],
    },
    koszykowka: { players: [], medals: [], skillShotKeys: ["1P", "2P", "3P"] },
    pilka_ind: { players: [], medals: [] },
    siatkowka: { matches: [], medals: [] },
    badminton: { matches: [], medals: [] },
    inne: { competitions: [] },
  },
  playersDirectory: [
    { name: "Anna", gender: 0 },
    { name: "Bartek", gender: 1 },
  ],
};
const snap0 = extractEventsSnapshot(dataEmpty);
// First process = baseline
const r0 = processDataForEvents(dataEmpty);
if (r0.regular.length || r0.newspaper.length) {
  note("high", "events", "First processDataForEvents should baseline with 0 events", JSON.stringify(r0));
} else {
  note("low", "events", "First load baselines correctly (0 events)");
}

// Add score
const dataScore = structuredClone(dataEmpty);
dataScore.disciplines.pilka.matches[0].score = "3:1";
const r1 = processDataForEvents(dataScore);
const matchEv = r1.regular.filter((e) => e.type === "match_result");
if (matchEv.length !== 1) {
  note("high", "events", `Expected 1 match_result, got ${matchEv.length}`);
} else {
  // body format side (score) side
  if (!matchEv[0].body.includes("(3:1)")) {
    note("med", "events", "Match body missing (3:1)", matchEv[0].body);
  }
  if (!matchEv[0].title.includes("WYNIK MECZU")) {
    note("med", "events", "Match title format", matchEv[0].title);
  }
  // Winner should be green-marked as side with higher score - A
  if (!matchEv[0].bodyHtml?.includes("notif-win") || !matchEv[0].bodyHtml.includes("A")) {
    note("med", "events", "Winner highlight missing", matchEv[0].bodyHtml);
  }
}

// Same score again → no new match event
const r2 = processDataForEvents(dataScore);
if (r2.regular.some((e) => e.type === "match_result")) {
  note("high", "events", "Duplicate match_result on unchanged score");
}

// Score change 3:1 → 4:1: current code only notifies when !prevMatches[key] (first score only)
dataScore.disciplines.pilka.matches[0].score = "4:1";
const r3 = processDataForEvents(dataScore);
if (r3.regular.some((e) => e.type === "match_result")) {
  note("low", "events", "Score correction also fires match_result (may be OK)");
} else {
  note(
    "med",
    "events",
    "Score change 3:1→4:1 does NOT fire notification (by design: only first appearance of score on key)"
  );
}

console.log("\n========== 6. LEADER NOTIFICATIONS ==========\n");

function skillPlayers(specs) {
  // specs: [{name, scores as complete map or incomplete}]
  return specs.map((s) => ({
    name: s.name,
    scoreNum: s.scoreNum,
    score: String(s.scoreNum),
    attemptRows: s.complete
      ? [
          {
            index: 1,
            shots: { "1P": "5", "2P": "5", "3P": "5", UK1: "1", UK2: "1" },
          },
        ]
      : [
          {
            index: 1,
            shots: { "1P": "5", "2P": "", "3P": "5", UK1: "1", UK2: "1" },
          },
        ],
  }));
}

_store.clear();
const leadBase = {
  disciplines: {
    koszykowka: {
      skillShotKeys: ["1P", "2P", "3P", "UK1", "UK2"],
      players: skillPlayers([
        { name: "Anna", scoreNum: 10, complete: true },
        { name: "Bartek", scoreNum: 8, complete: true },
        { name: "Celina", scoreNum: 6, complete: true },
      ]),
      medals: [],
    },
    pilka: { matches: [], medals: [] },
    pilka_ind: { players: [], medals: [] },
    siatkowka: { matches: [], medals: [] },
    badminton: { matches: [], medals: [] },
    inne: { competitions: [] },
  },
  playersDirectory: [
    { name: "Anna", gender: 0 },
    { name: "Bartek", gender: 1 },
    { name: "Celina", gender: 0 },
  ],
};
processDataForEvents(leadBase);
// New leader Bartek complete
const leadNext = structuredClone(leadBase);
leadNext.disciplines.koszykowka.players = skillPlayers([
  { name: "Bartek", scoreNum: 20, complete: true },
  { name: "Anna", scoreNum: 10, complete: true },
  { name: "Celina", scoreNum: 6, complete: true },
]);
const lr = processDataForEvents(leadNext);
const leaders = lr.regular.filter((e) => e.type === "leader");
if (leaders.length !== 1 || leaders[0].recipient !== "Bartek") {
  note("high", "leader", "Expected leader Bartek", JSON.stringify(leaders));
} else if (!leaders[0].body.includes("został")) {
  // Bartek gender 1 → został
  note("med", "leader", "Gender verb for man", leaders[0].body);
} else {
  note("low", "leader", "Leader + masculine form OK: " + leaders[0].body);
}

// Incomplete leader should not fire
_store.clear();
processDataForEvents(leadBase);
const leadInc = structuredClone(leadBase);
leadInc.disciplines.koszykowka.players = skillPlayers([
  { name: "Bartek", scoreNum: 20, complete: false },
  { name: "Anna", scoreNum: 10, complete: true },
  { name: "Celina", scoreNum: 6, complete: true },
]);
// Need snapshot leaders to have Anna first - process
const li = processDataForEvents(leadInc);
if (li.regular.some((e) => e.type === "leader" && e.recipient === "Bartek")) {
  note("high", "leader", "Incomplete attempt still fired leader for Bartek");
} else {
  note("low", "leader", "Incomplete leader correctly suppressed");
}

// <3 scorers — no leader in snapshot
_store.clear();
const few = structuredClone(leadBase);
few.disciplines.koszykowka.players = skillPlayers([
  { name: "Anna", scoreNum: 10, complete: true },
  { name: "Bartek", scoreNum: 8, complete: true },
]);
processDataForEvents(few);
const few2 = structuredClone(few);
few2.disciplines.koszykowka.players = skillPlayers([
  { name: "Anna", scoreNum: 10, complete: true },
  { name: "Bartek", scoreNum: 8, complete: true },
  { name: "Celina", scoreNum: 1, complete: true },
]);
const lf = processDataForEvents(few2);
// First time we have leader with 3 people — Anna leads
if (!lf.regular.some((e) => e.type === "leader")) {
  note(
    "med",
    "leader",
    "Going from <3 to ≥3 scorers with Anna leading: no leader event (prev leader was null, next Anna complete — should fire as new leader)"
  );
} else {
  note("low", "leader", "Leader fires when crossing 3-player threshold");
}

console.log("\n========== 7. GOLD + GENDER + CELEBRATION FLAG ==========\n");

_store.clear();
const goldBase = {
  disciplines: {
    siatkowka: {
      title: "Siatkówka",
      matches: [],
      medals: [
        { medal: "złoty", name: "", players: "", playerList: [] },
        { medal: "srebrny", name: "", players: "", playerList: [] },
        { medal: "brązowy", name: "", players: "", playerList: [] },
      ],
      teams: [],
    },
    pilka: { matches: [], medals: [] },
    koszykowka: { players: [], medals: [] },
    pilka_ind: { players: [], medals: [] },
    badminton: { matches: [], medals: [] },
    inne: { competitions: [] },
  },
  playersDirectory: [{ name: "Anna", gender: 0 }],
};
processDataForEvents(goldBase);
const goldNext = structuredClone(goldBase);
goldNext.disciplines.siatkowka.medals[0].name = "Anna";
const gr = processDataForEvents(goldNext);
const golds = gr.regular.filter((e) => e.type === "gold");
if (golds.length !== 1) {
  note("high", "gold", `Expected 1 gold event, got ${golds.length}`);
} else {
  if (!golds[0].celebrate) note("high", "gold", "Gold missing celebrate:true");
  if (!golds[0].body.includes("zdobyła")) {
    note("med", "gold", "Expected feminine zdobyła", golds[0].body);
  } else {
    note("low", "gold", "Gold + feminine form OK");
  }
  // Silver should not celebrate
}

// Silver only change
_store.clear();
processDataForEvents(goldBase);
const sil = structuredClone(goldBase);
sil.disciplines.siatkowka.medals[1].name = "Anna";
const sr = processDataForEvents(sil);
if (sr.regular.some((e) => e.celebrate)) {
  note("high", "gold", "Silver change triggered celebrate");
} else if (sr.regular.some((e) => e.type === "gold")) {
  note("high", "gold", "Silver incorrectly typed as gold event");
} else {
  note("low", "gold", "Silver-only fill does not notify (OK per spec)");
}

// Team gold — recipient is team name, gender lookup fails → masculine default
_store.clear();
processDataForEvents(goldBase);
const tg = structuredClone(goldBase);
tg.disciplines.siatkowka.medals[0].name = "Drużyna Alfa";
tg.disciplines.siatkowka.medals[0].playerList = ["Anna", "Bartek"];
const tr = processDataForEvents(tg);
const tgold = tr.regular.find((e) => e.type === "gold");
if (tgold) {
  if (tgold.recipient !== "Drużyna Alfa") {
    note("med", "gold", "Team gold recipient should be team name", tgold.recipient);
  }
  if (tgold.body.includes("zdobyła") === false && tgold.body.includes("zdobył")) {
    note(
      "med",
      "gold",
      "Team gold uses masculine zdobył by default (Drużyna is feminine in Polish — possible UX nit)",
      tgold.body
    );
  }
}

console.log("\n========== 8. MEDALS → GRACZE ATTRIBUTION ==========\n");

const discMedals = {
  siatkowka: {
    medals: [
      {
        medal: "złoty",
        name: "Drużyna 1",
        playerList: ["Ali", "Oli"],
        players: "Ali, Oli",
      },
    ],
    teams: [{ name: "Drużyna 1", players: ["Ali", "Oli", "Dorota"] }],
  },
  inne: {
    competitions: [
      {
        name: "Krokiet",
        medals: [
          { medal: "złoty", name: "Mela", playerList: [], players: "" },
          { medal: "srebrny", name: "", playerList: [], players: "" },
          { medal: "brązowy", name: "", playerList: [], players: "" },
        ],
      },
    ],
  },
};
const ali = collectPlayerMedals("Ali", discMedals);
if (!ali.some((a) => a.medal === "złoty" && a.discipline.includes("Siat"))) {
  // label is Siatkówka from DISCIPLINE
  if (!ali.some((a) => a.medal === "złoty")) {
    note("high", "medals", "Ali should get gold from team roster list");
  }
}
const mela = collectPlayerMedals("Mela", discMedals);
if (!mela.some((a) => a.discipline === "Krokiet")) {
  note("high", "medals", "Mela gold @ Krokiet missing", JSON.stringify(mela));
} else {
  note("low", "medals", "Inne multi-competition medals OK");
}
// Dorota on team but not in playerList — still via team name + teams roster
const dor = collectPlayerMedals("Dorota", discMedals);
if (!dor.some((a) => a.medal === "złoty")) {
  note(
    "med",
    "medals",
    "Dorota on team roster but not in medal playerList — no medal via team name lookup?",
    "medalAwardsPlayer checks teams when entry.name is team — should work"
  );
} else {
  note("low", "medals", "Dorota gets gold via team name + disc.teams");
}

console.log("\n========== 9. NEWSPAPER SEMANTICS ==========\n");

_store.clear();
const paperData = {
  disciplines: {
    pilka: {
      title: "Piłka Nożna",
      teams: [{ name: "A", players: ["X", "Y"] }],
      matches: [
        { phase: "Eliminacje", side1: "A", side2: "B", score: "5:0" },
        { phase: "1/2 Finału", side1: "A", side2: "B", score: "2:0" },
        { phase: "1/2 Finału", side1: "C", side2: "D", score: "1:0" },
        { phase: "Mecz o 3. miejsce", side1: "B", side2: "D", score: "2:1" },
        { phase: "Finał", side1: "A", side2: "C", score: "3:0" },
      ],
      medals: [],
    },
    siatkowka: { matches: [], medals: [], teams: [] },
    badminton: { matches: [], medals: [] },
    koszykowka: { players: [], medals: [] },
    pilka_ind: { players: [], medals: [] },
    inne: { competitions: [] },
  },
};
// baseline
processDataForEvents(paperData);
// Second call: newspaper should fire for knockout with scores (fired set empty after clear... wait process first baseline saves fired on first detect which needs prev)

// After clear, first process: prev null → no newspaper
// Second process same data: prev exists, fired empty → should emit newspapers for all scored knockout
const p2 = processDataForEvents(paperData);
const papers = p2.newspaper;
const stages = papers.map((p) => p.newspaper?.stage);
// eliminacje must not appear
if (papers.some((p) => p.body?.includes("Eliminacje") && p.newspaper?.stage == null)) {
  /* n/a */
}
// Expect: 2 semi + 1 third + 1 final = 4
if (papers.length !== 4) {
  note(
    "med",
    "newspaper",
    `Expected 4 newspaper events for full KO scored bracket, got ${papers.length}`,
    stages.join(", ")
  );
} else {
  note("low", "newspaper", "4 KO newspaper events OK");
}
// Eliminacje not included
// Dominant final 3:0 for pilka → diff 3 → dominant
const finalPaper = papers.find((p) => p.newspaper?.stage === "final");
if (finalPaper && !finalPaper.newspaper.dominant) {
  note("med", "newspaper", "Final 3:0 should be dominant for pilka (diff>=3)");
}
// third place bronze placeholder
const thirdPaper = papers.find((p) => p.newspaper?.stage === "third");
if (thirdPaper) {
  // #brazowy should be B (winner of third)
  note("low", "newspaper", "Third place paper present");
}
// 1/4 should not fire
const qf = {
  disciplines: {
    ...paperData.disciplines,
    badminton: {
      matches: [{ phase: "1/4 Finału", side1: "G1", side2: "G2", score: "2:0" }],
      medals: [],
    },
  },
};
_store.clear();
processDataForEvents(qf);
const qf2 = processDataForEvents(qf);
if (qf2.newspaper.length) {
  note("high", "newspaper", "1/4 Finału should NOT generate newspaper", JSON.stringify(qf2.newspaper));
} else {
  note("low", "newspaper", "1/4 correctly ignored for newspaper");
}

// Draw score dominant?
const drawDom = isDominantVictory("pilka", "1:1");
if (drawDom !== false) {
  note("low", "newspaper", `Draw 1:1 dominant=${drawDom}`);
}

// Masthead constant
const mast =
  renderMod.NEWSPAPER_MASTHEAD_PX ?? 360;
if (mast !== 360) {
  note("med", "newspaper-ui", `MASTHEAD expected 360 got ${mast}`);
}

// Sequential text: two picks differ when multiple templates
_store.clear();
// force resolve bg and detect one semi twice - fired prevents second
// text pool sequential tested elsewhere

console.log("\n========== 10. LIVE SHEET SNAPSHOT ==========\n");

try {
  const live = await loadTournamentData();
  const discs = live.disciplines || {};
  for (const [id, d] of Object.entries(discs)) {
    const m = (d.matches || []).filter((x) => x.score);
    const ko = (d.matches || []).filter(
      (x) => x.score && classifyMatchStage(x.phase)
    );
    console.log(
      `  ${id}: matches=${(d.matches || []).length} scored=${m.length} knockoutScored=${ko.length} players=${(d.players || []).length} medalsGold=${
        (d.medals || []).find((x) => x.medal === "złoty")?.name ||
        (d.competitions || [])
          .map((c) => c.medals?.find((x) => x.medal === "złoty")?.name)
          .filter(Boolean)
          .join(",") ||
        "-"
      }`
    );
    for (const x of ko) {
      console.log(
        `    KO ${x.phase} ${x.side1} vs ${x.side2} ${x.score} stage=${classifyMatchStage(x.phase)} dom=${isDominantVictory(id, x.score)}`
      );
    }
  }
  // Gender directory
  const withG = (live.playersDirectory || []).filter(
    (p) => p.gender === 0 || p.gender === 1
  );
  console.log(
    `  Gracze directory: ${live.playersDirectory?.length || 0}, with gender: ${withG.length}`
  );
  if ((live.playersDirectory || []).length && withG.length === 0) {
    note(
      "med",
      "gender",
      "Players directory has names but no gender parsed — check column header is exactly 'gender'"
    );
  }
  // Sim second refresh for newspaper backfill
  _store.clear();
  const a1 = processDataForEvents(live);
  const a2 = processDataForEvents(live);
  console.log(
    `  Live process: first regular=${a1.regular.length} paper=${a1.newspaper.length}; second regular=${a2.regular.length} paper=${a2.newspaper.length}`
  );
  if (a1.regular.length || a1.newspaper.length) {
    note("high", "live", "First live process should be baseline-only (0 events)");
  }
  // Second should newspaper any existing KO scores
  if (a2.newspaper.length === 0) {
    const anyKo = Object.values(discs).some((d) =>
      (d.matches || []).some((m) => m.score && classifyMatchStage(m.phase))
    );
    if (anyKo) {
      note(
        "med",
        "live",
        "Second process produced 0 newspapers despite KO scores — check bg/text or fired logic"
      );
    }
  } else {
    note("low", "live", `Second process newspapers: ${a2.newspaper.length}`);
  }
} catch (e) {
  note("med", "live", "loadTournamentData failed", String(e.message || e));
}

console.log("\n========== 11. EDGE / CONTRACT BUGS ==========\n");

// match key uses index — reorder matches changes identity
note(
  "med",
  "contract",
  "Match event keys include row index; reordering rows in the sheet can re-fire notifications or break continuity"
);

// forceNetwork unused
note(
  "low",
  "app",
  "refresh(forceNetwork) parameter is ignored — always hits network via loadTournamentData"
);

// Offline path skips handleDataEvents
note(
  "med",
  "app",
  "On network failure, cached data is shown but handleDataEvents is NOT run — no new notifications offline"
);

// Celebration queue + multiple golds
note(
  "low",
  "celebration",
  "Multiple gold events queue celebrations sequentially until each is dismissed manually"
);

// Newspaper fired vs score correction
note(
  "med",
  "newspaper",
  "Newspaper fired key includes score; correcting 2:0→2:1 emits a second newspaper for same match"
);

// Regular match first score only
// already noted

// Badminton players list removed from UI but still in data
note(
  "low",
  "ui",
  "Badminton has no Gracze section in UI (by design); players may still exist in sheet data"
);

// Inne results tables ignored
note(
  "low",
  "inne",
  "Inne # SEKCJA result tables are not displayed — only medals per competition"
);

// SW cache sounds not all listed
const sw = await import("fs").then((fs) =>
  fs.readFileSync(path.join(root, "sw.js"), "utf8")
);
const soundFiles = MEDAL_SOUNDS.map((s) => s.url).filter(Boolean);
for (const u of soundFiles) {
  if (!sw.includes(u.replace(/^\.\//, "")) && !sw.includes(u)) {
    note(
      "low",
      "sw",
      `Sound ${u} not in SW shell precache — first play needs network (stale-while-revalidate may still cache later)`
    );
  }
}

// Gender default
if (verbForm(null, "została", "został") !== "został") {
  note("high", "gender", "null gender should default masculine");
}

// draw match body
const drawBody = matchResultBodies("A", "B", "1:1");
if (!drawBody.body.includes("(1:1)")) {
  note("med", "events", "Draw body format", drawBody.body);
}

console.log("\n========== SUMMARY ==========\n");
const high = findings.filter((f) => f.sev === "high");
const med = findings.filter((f) => f.sev === "med");
const low = findings.filter((f) => f.sev === "low");
console.log(`High: ${high.length}  Med: ${med.length}  Low/info: ${low.length}`);
console.log("\nDone.");
