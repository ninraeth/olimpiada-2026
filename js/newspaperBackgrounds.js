/**
 * Map event keys → image filenames in /data/.
 * Use a real file name from data/ (e.g. "fuckt.jpg").
 * Use "..." or omit to skip newspaper for that event.
 *
 * Available in data/: czas.jpg, fuckt.jpg, jar.jpg, ps.jpg, rzecz.jpg,
 *   sven.jpg, targi.jpg, times.jpg, wyb.jpg
 */

export const newspaperBackgrounds = {
  // Piłka Nożna
  pilkaNozna_semi_close: "gazeta1.jpg",
  pilkaNozna_semi_dominant: "gazeta2.jpg",
  pilkaNozna_third: "gazeta3.jpg",
  pilkaNozna_final_close: "fuckt.jpg",
  pilkaNozna_final_dominant: "fuckt.jpg",

  // Siatkówka
  siatkowka_semi_close: "...",
  siatkowka_semi_dominant: "...",
  siatkowka_third: "...",
  siatkowka_final_close: "...",
  siatkowka_final_dominant: "...",

  // Badminton
  badminton_semi_close: "...",
  badminton_semi_dominant: "...",
  badminton_third: "...",
  badminton_final_close: "...",
  badminton_final_dominant: "...",

  // Indywidualne
  koszykowka_close: "...",
  koszykowka_dominant: "...",
  pilkaInd_close: "...",
  pilkaInd_dominant: "...",
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
