/**
 * Newspaper helpers unit checks.
 * Run: node scripts/test_newspaper.mjs
 */
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Minimal localStorage for sequential text picker (Node has none)
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};

const {
  classifyMatchStage,
  isDominantVictory,
  isDominantIndividual,
  parseNewspaperTemplate,
  applyPlaceholders,
  resolveBackgroundUrl,
  backgroundKeyFor,
  detectNewspaperEvents,
  pickTemplate,
  textPoolKey,
  normalizeBackgroundFile,
  listNewspaperSlotsFromData,
  recomputeNewspaperUsageFromData,
  pruneNewspaperFiredToData,
} = await import(pathToFileURL(path.join(root, "js/newspaper.js")).href);

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(classifyMatchStage("Półfinał") === "semi", "semi");
assert(classifyMatchStage("1/2 finału") === "semi", "1/2");
assert(classifyMatchStage("Finał") === "final", "final");
assert(classifyMatchStage("Mecz o 3. miejsce") === "third", "third");
assert(classifyMatchStage("Eliminacje") == null, "elim");

assert(isDominantVictory("siatkowka", "2:0") === true, "volley dom");
assert(isDominantVictory("siatkowka", "2:1") === false, "volley close");
assert(isDominantVictory("pilka", "4:1") === true, "foot dom");
assert(isDominantVictory("pilka", "2:1") === false, "foot close");
assert(isDominantVictory("badminton", "2:0") === true, "bad dom");

assert(
  isDominantIndividual([
    { scoreNum: 20 },
    { scoreNum: 10 },
    { scoreNum: 9 },
    { scoreNum: 8 },
  ]) === true,
  "ind dominant big gap"
);
assert(
  isDominantIndividual([
    { scoreNum: 12 },
    { scoreNum: 11 },
    { scoreNum: 9 },
    { scoreNum: 7 },
  ]) === false,
  "ind close"
);

const parsed = parseNewspaperTemplate("[[WIELKI TYTUŁ]] Reszta newsów #wygrany");
assert(parsed.headline === "WIELKI TYTUŁ", "headline");
assert(parsed.body.includes("#wygrany"), "body");
assert(
  applyPlaceholders(parsed.body, { "#wygrany": "Ada" }).includes("Ada"),
  "placeholder"
);

assert(
  resolveBackgroundUrl("pilkaNozna_final_close") === "./data/fuckt.jpg" ||
    resolveBackgroundUrl("pilkaNozna_final_close") === "./data/times.jpg",
  "bg final resolves"
);
// Note: sequential pick advances — reset and re-check stem path
_store.clear();
// pilkaNozna_final_close is "times" in current config
assert(
  resolveBackgroundUrl("pilkaNozna_final_close")?.endsWith(".jpg") === true,
  "bg has jpg path"
);
assert(
  resolveBackgroundUrl("siatkowka_semi_close")?.startsWith("./data/") === true,
  "bg siat semi resolves"
);
assert(normalizeBackgroundFile("...") == null, "ellipsis skipped");
assert(
  backgroundKeyFor("pilkaNozna", "semi", true) === "pilkaNozna_semi_dominant",
  "bg key"
);

// Array backgrounds: sequential + stem without .jpg
const { newspaperBackgrounds } = await import(
  pathToFileURL(path.join(root, "js/newspaperBackgrounds.js")).href
);
assert(normalizeBackgroundFile("targi") === "targi.jpg", "stem→jpg");
assert(normalizeBackgroundFile("rzecz.jpg") === "rzecz.jpg", "full name");
assert(normalizeBackgroundFile("nope") == null, "unknown stem");

// Temporarily inject array entry for sequential bg test
newspaperBackgrounds.__test_array_bg = ["targi", "rzecz"];
// clear only bg usage if mixed with text tests — full clear is fine
_store.clear();
const b1 = resolveBackgroundUrl("__test_array_bg");
const b2 = resolveBackgroundUrl("__test_array_bg");
const b3 = resolveBackgroundUrl("__test_array_bg");
assert(b1 === "./data/targi.jpg", "bg seq 1");
assert(b2 === "./data/rzecz.jpg", "bg seq 2");
assert(b3 === "./data/targi.jpg", "bg seq wrap");
delete newspaperBackgrounds.__test_array_bg;

// Detect final match newspaper when bg+text exist
const prev = { matches: {}, leaders: {}, golds: {}, v: 1 };
const next = {
  matches: {
    "pilka|final|a|b|0": "3:0",
  },
  leaders: {},
  golds: {},
  v: 1,
};
const data = {
  disciplines: {
    pilka: {
      title: "Piłka Nożna",
      teams: [{ name: "A", players: ["Jan", "Piotr"] }],
      matches: [
        { phase: "Finał", side1: "A", side2: "B", score: "3:0" },
      ],
    },
  },
};
const ev = detectNewspaperEvents(prev, next, data);
assert(ev.length === 1, "one newspaper event");
assert(ev[0].type === "newspaper", "type newspaper");
assert(ev[0].newspaper?.background, "has background");

// Sequential rotation
_store.clear();
const pool = ["A", "B", "C"];
const key = "test.pool";
assert(pickTemplate(key, pool) === "A", "seq 1");
assert(pickTemplate(key, pool) === "B", "seq 2");
assert(pickTemplate(key, pool) === "C", "seq 3");
assert(pickTemplate(key, pool) === "A", "seq wrap");
assert(textPoolKey("pilkaNozna", "final", true) === "pilkaNozna.finalDominant", "pool key");

// ── Recompute counters from real sheet (heal phantom advances) ──
_store.clear();
// Poison bg counter as if 5 fake semi_close newspapers fired
_store.set(
  "olimpiada2026_newspaper_bg_usage_v1",
  JSON.stringify({ "bg:siatkowka_semi_close": 5 })
);
_store.set(
  "olimpiada2026_newspaper_fired_v1",
  JSON.stringify([
    "match|siatkowka|polfinal|phantom a|phantom b|3:0",
    "match|siatkowka|polfinal|real 1|real 2|2:1",
  ])
);
const healData = {
  disciplines: {
    siatkowka: {
      title: "Siatkówka",
      teams: [],
      matches: [
        { phase: "Półfinał", side1: "Real 1", side2: "Real 2", score: "2:1" },
        { phase: "Półfinał", side1: "Real 3", side2: "Real 4", score: "2:0" },
      ],
    },
  },
};
const slots = listNewspaperSlotsFromData(healData);
assert(slots.length === 2, "two real newspaper slots");
const pruned = pruneNewspaperFiredToData(healData);
assert(pruned === 1, "one phantom fired id removed");
// onlyFired: only Real 1 still in fired → next index 1 for close (2:1) pool
const closeKey = "bg:siatkowka_semi_close";
const domKey = "bg:siatkowka_semi_dominant";
recomputeNewspaperUsageFromData(healData, { onlyFired: true });
const bgAfterFired = JSON.parse(_store.get("olimpiada2026_newspaper_bg_usage_v1") || "{}");
assert(bgAfterFired[closeKey] === 1, "onlyFired close next=1");
assert(bgAfterFired[domKey] == null, "onlyFired dominant unused");
// absolute: both reals (close + dominant) → close count 1, dominant count 1
recomputeNewspaperUsageFromData(healData);
const bgAbs = JSON.parse(_store.get("olimpiada2026_newspaper_bg_usage_v1") || "{}");
assert(bgAbs[closeKey] === 1, "abs close next=1");
assert(bgAbs[domKey] === 1, "abs dominant next=1");
// phantom pool key gone
assert(bgAbs["bg:siatkowka_semi_close"] === 1, "no residual 5");

console.log("test_newspaper: OK");
