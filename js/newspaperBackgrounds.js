/**
 * Map event keys → image filename(s) in /data/.
 *
 * Value may be:
 *   - string:  "targi.jpg" or "targi"  (extension optional)
 *   - array:   ["targi", "rzecz"]      — used in order, then from start again
 *              (progress saved in localStorage)
 *   - "..." or missing file → skip newspaper for that event
 *
 * Available in data/: czas.jpg, fuckt.jpg, jar.jpg, ps.jpg, rzecz.jpg,
 *   sven.jpg, targi.jpg, times.jpg, wyb.jpg
 */

export const newspaperBackgrounds = {
  // Piłka Nożna
  pilkaNozna_semi_close: ["czas", "targi"],
  pilkaNozna_semi_dominant: ["ps", "fuckt"],
  pilkaNozna_third: "wyb",
  pilkaNozna_final_close: "times",
  pilkaNozna_final_dominant: "times",

  // Siatkówka
  siatkowka_semi_close: ["targi", "jar"],
  siatkowka_semi_dominant: ["fuckt", "jar"],
  siatkowka_third: "sven",
  siatkowka_final_close: "czas",
  siatkowka_final_dominant: "ps",

  // Badminton — example of array (sequential, not random)
  // badminton_semi_close: ["targi", "rzecz"],
  // badminton_semi_dominant: ["czas", "times"],
  badminton_semi_close: ["ps", "targi"],
  badminton_semi_dominant: ["wyb", "fuckt"],
  badminton_third: "jar",
  badminton_final_close: "rzecz",
  badminton_final_dominant: "jar",

  // Indywidualne
  koszykowka_close: "rzecz",
  koszykowka_dominant: "times",
  pilkaInd_close: "rzecz",
  pilkaInd_dominant: "times",
};

/**
 * Filenames that actually exist under data/ (for safe resolution).
 * Keep in sync with the data/ folder.
 */
export const NEWSPAPER_DATA_FILES = [
  "czas.jpg",
  "fuckt.jpg",
  "jar.jpg",
  "ps.jpg",
  "rzecz.jpg",
  "sven.jpg",
  "targi.jpg",
  "times.jpg",
  "wyb.jpg",
];
