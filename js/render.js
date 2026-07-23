/**
 * DOM rendering for Olimpiada Bieździadów 2026.
 */

import { TABS, APP_TITLE } from "./config.js";
import { buildPlayerProfile, sortPlayersByMedals } from "./data.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emptyBlock(msg) {
  return `<div class="empty-state"><p>${esc(msg)}</p></div>`;
}

function sectionTitle(title, count) {
  const badge =
    count != null
      ? `<span class="section-count">${count}</span>`
      : "";
  return `<h2 class="section-title">${esc(title)} ${badge}</h2>`;
}

/**
 * Group matches by phase preserving order.
 * @param {{ phase: string }[]} matches
 */
function groupByPhase(matches) {
  /** @type {Map<string, typeof matches>} */
  const map = new Map();
  for (const m of matches) {
    const key = m.phase || "Inne";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return map;
}

function renderTeams(teams) {
  if (!teams?.length) return emptyBlock("Brak drużyn w arkuszu.");
  const cards = teams
    .map((t) => {
      const chips = (t.players || [])
        .map((p) => `<span class="chip">${esc(p)}</span>`)
        .join("");
      return `
        <article class="card team-card">
          <h3 class="card-title">${esc(t.name)}</h3>
          <div class="chips">${chips || '<span class="muted">Brak listy graczy</span>'}</div>
        </article>`;
    })
    .join("");
  return `
    <section class="block">
      ${sectionTitle("Drużyny", teams.length)}
      <div class="card-grid">${cards}</div>
    </section>`;
}

function renderPlayersList(players, title = "Gracze") {
  if (!players?.length) return "";
  const items = players
    .map(
      (p) => `
      <li class="player-item">
        <span class="player-name">${esc(p.name)}</span>
        ${
          p.score
            ? `<span class="player-score">${esc(p.score)}</span>`
            : ""
        }
      </li>`
    )
    .join("");
  return `
    <section class="block">
      ${sectionTitle(title, players.length)}
      <ul class="player-list">${items}</ul>
    </section>`;
}

/**
 * Normalize label for team name lookup (local to render).
 * @param {string} s
 */
function normLabel(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find team roster by match side name.
 * @param {{ name: string, players?: string[] }[]|null|undefined} teams
 * @param {string} sideName
 * @returns {string[]}
 */
function rosterForSide(teams, sideName) {
  if (!teams?.length || !sideName) return [];
  const key = normLabel(sideName);
  if (!key || key === "tbd" || key === "—") return [];
  const team = teams.find((t) => normLabel(t.name) === key);
  if (!team) {
    // loose: strip non-alphanumeric
    const loose = key.replace(/[^a-z0-9]/g, "");
    const t2 = teams.find(
      (t) => normLabel(t.name).replace(/[^a-z0-9]/g, "") === loose
    );
    if (!t2) return [];
    return Array.isArray(t2.players) ? [...t2.players] : [];
  }
  return Array.isArray(team.players) ? [...team.players] : [];
}

/**
 * Expanded roster panel under a team-sport match.
 * Players A–Z (pl), one name per row, two columns (side1 | side2).
 * @param {any} match
 * @param {{ name: string, players?: string[] }[]|null|undefined} teams
 */
function renderMatchRosters(match, teams) {
  const sideBlock = (sideName) => {
    const players = rosterForSide(teams, sideName).sort((a, b) =>
      a.localeCompare(b, "pl", { sensitivity: "base" })
    );
    const rows = players.length
      ? players.map((p) => `<li class="match-roster-player">${esc(p)}</li>`).join("")
      : `<li class="match-roster-player muted">Brak składu</li>`;
    return `
      <div class="match-roster">
        <h4 class="match-roster-team">${esc(sideName || "—")}</h4>
        <ul class="match-roster-list">${rows}</ul>
      </div>`;
  };
  return `
    <div class="match-rosters">
      ${sideBlock(match.side1)}
      ${sideBlock(match.side2)}
    </div>`;
}

/**
 * @param {any[]} matches
 * @param {{
 *   teams?: { name: string, players?: string[] }[]|null,
 *   expandable?: boolean,
 *   expandedMatchKey?: string|null,
 * }} [opts]
 */
function renderMatches(matches, opts = {}) {
  if (!matches?.length) return emptyBlock("Brak meczów w arkuszu.");
  const expandable = Boolean(opts.expandable);
  const teams = opts.teams || null;
  const expandedKey = opts.expandedMatchKey ?? null;

  // Preserve original index for stable expand keys across phase groups
  const indexed = matches.map((m, i) => ({ m, key: String(i) }));
  /** @type {Map<string, typeof indexed>} */
  const groups = new Map();
  for (const item of indexed) {
    const phase = item.m.phase || "Inne";
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(item);
  }

  let html = `<section class="block">${sectionTitle("Mecze", matches.length)}`;
  if (expandable) {
    html += `<p class="hint">Dotknij aby zobaczyć składy drużyn</p>`;
  }

  for (const [phase, list] of groups) {
    html += `<h3 class="phase-title">${esc(phase)}</h3>`;
    html += `<div class="match-list">`;
    for (const { m, key } of list) {
      const hasScore = Boolean(m.score);
      const expanded = expandable && expandedKey === key;
      const classes = [
        "match-card",
        hasScore ? "has-score" : "pending",
        expandable ? "is-expandable" : "",
        expanded ? "is-expanded" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const toggleAttrs = expandable
        ? ` role="button" tabindex="0" aria-expanded="${expanded}" data-toggle-match="${esc(key)}"`
        : "";
      const chevron = expandable
        ? `<span class="match-chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>`
        : "";
      const roster =
        expandable && expanded ? renderMatchRosters(m, teams) : "";

      html += `
        <article class="${classes}"${toggleAttrs}>
          <div class="match-main">
            <div class="match-sides">
              <span class="side side-a">${esc(m.side1)}</span>
              <span class="match-vs">${hasScore ? esc(m.score) : "vs"}</span>
              <span class="side side-b">${esc(m.side2)}</span>
            </div>
            ${chevron ? `<div class="match-meta">${chevron}</div>` : ""}
          </div>
          ${roster}
        </article>`;
    }
    html += `</div>`;
  }
  html += `</section>`;
  return html;
}

/**
 * @param {any[]} ranking
 * @param {string | { title?: string, scoreLabel?: string, diffLabel?: string, notesLabel?: string, hint?: string, emptyMessage?: string, splitStats?: boolean }} [opts]
 */
function renderRanking(ranking, opts = "Wynik") {
  const options =
    typeof opts === "string"
      ? { scoreLabel: opts }
      : opts || {};
  const title = options.title || "Ranking";
  const scoreLabel = options.scoreLabel || "Wynik";
  const diffLabel = options.diffLabel || "Różnica";
  const notesLabel = options.notesLabel || "Uwagi";
  const hint = options.hint || "";
  const emptyMessage =
    options.emptyMessage || "Ranking jest pusty — uzupełnij w arkuszu.";
  const splitStats =
    options.splitStats ??
    ranking?.some((r) => r.diff != null && String(r.diff).length > 0);

  if (!ranking?.length) {
    return `
      <section class="block">
        ${sectionTitle(title)}
        ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
        ${emptyBlock(emptyMessage)}
      </section>`;
  }

  const rows = ranking
    .map((r, i) => {
      const place = r.place || String(i + 1);
      if (splitStats) {
        return `
        <tr>
          <td class="col-place"><span class="place-pill">${esc(place)}</span></td>
          <td class="col-player">${esc(r.player)}</td>
          <td class="col-stat">${esc(r.winRate || "—")}</td>
          <td class="col-stat">${esc(r.diff || "—")}</td>
          <td class="col-notes muted">${esc(r.notes || "")}</td>
        </tr>`;
      }
      const secondary = [r.winRate, r.diff].filter(Boolean).join(" · ");
      return `
        <tr>
          <td class="col-place"><span class="place-pill">${esc(place)}</span></td>
          <td class="col-player">${esc(r.player)}</td>
          <td class="col-stat">${esc(secondary || "—")}</td>
          <td class="col-notes muted">${esc(r.notes || "")}</td>
        </tr>`;
    })
    .join("");

  const head = splitStats
    ? `<tr>
        <th>#</th>
        <th>Gracz</th>
        <th>${esc(scoreLabel)}</th>
        <th>${esc(diffLabel)}</th>
        <th>${esc(notesLabel)}</th>
      </tr>`
    : `<tr>
        <th>#</th>
        <th>Gracz</th>
        <th>${esc(scoreLabel)}</th>
        <th>${esc(notesLabel)}</th>
      </tr>`;

  return `
    <section class="block">
      ${sectionTitle(title, ranking.length)}
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
      <div class="table-wrap">
        <table class="data-table">
          <thead>${head}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

/**
 * Individual attempt ranking (Koszykówka / Piłka ind.).
 * @param {any} disc
 * @param {Set<string>} [expandedNames]
 * @param {{ shotKeys?: string[], emptyMessage?: string, categoriesLabel?: string }} [opts]
 */
function renderSkillRanking(disc, expandedNames = new Set(), opts = {}) {
  const players = disc.players || [];
  const shotKeys =
    opts.shotKeys ||
    disc.skillShotKeys ||
    players[0]?.shotKeys ||
    ["1P", "2P", "3P", "UK1", "UK2"];
  const emptyMessage =
    opts.emptyMessage || "Brak graczy w arkuszu.";
  const categoriesLabel = opts.categoriesLabel || shotKeys.join(" / ");

  if (!players.length) {
    return emptyBlock(emptyMessage);
  }

  const sorted = [...players].sort(
    (a, b) => (b.scoreNum ?? -Infinity) - (a.scoreNum ?? -Infinity)
  );

  const rows = sorted
    .map((p, i) => {
      const hasAttempts =
        (p.attemptRows && p.attemptRows.length > 0) ||
        Object.keys(p.attempts || {}).length > 0;
      const expanded = expandedNames.has(p.name);
      const scoreDisplay = p.score || "—";

      let attemptRow = "";
      if (expanded && p.attemptRows?.length) {
        const head =
          shotKeys.map((k) => `<th>${esc(k)}</th>`).join("") +
          `<th class="col-attempt-avg" title="Średnia próby">⌀</th>`;
        const resolvedRows = p.resolvedAttemptRows || null;
        const means = p.attemptMeans || [];
        const body = p.attemptRows
          .map((ar, ri) => {
            const cells = shotKeys
              .map((k) => {
                const raw = ar.shots[k] || "";
                if (/^s\.?$/i.test(String(raw).trim().replace(/\s+/g, ""))) {
                  const resolved = resolvedRows?.[ri]?.shots?.[k] || "";
                  const label = resolved || "—";
                  return `<td class="shot-s" title="Wartość wyliczona: 50% najgorszy ${esc(k)} + 50% średnia ${esc(k)}">${esc(label)}</td>`;
                }
                return `<td>${esc(raw)}</td>`;
              })
              .join("");
            const mean = means[ri];
            const meanStr =
              mean != null && Number.isFinite(mean)
                ? (Math.round(mean * 100) / 100).toFixed(2)
                : "—";
            return `<tr>${cells}<td class="col-attempt-avg" title="Średnia próby">${esc(meanStr)}</td></tr>`;
          })
          .join("");
        attemptRow = `
          <tr class="bball-attempts-row">
            <td colspan="3">
              <div class="attempt-panel" data-player-attempts="${esc(p.name)}">
                <table class="attempt-table">
                  <thead><tr>${head}</tr></thead>
                  <tbody>${body}</tbody>
                </table>
              </div>
            </td>
          </tr>`;
      } else if (expanded && hasAttempts && !p.attemptRows?.length) {
        const items = Object.entries(p.attempts || {})
          .map(
            ([k, v]) =>
              `<span class="attempt-item"><strong>${esc(k)}</strong>: ${esc(v)}</span>`
          )
          .join("");
        attemptRow = `
          <tr class="bball-attempts-row">
            <td colspan="3">
              <div class="attempt-panel attempt-grid">${items}</div>
            </td>
          </tr>`;
      }

      const nameClass = hasAttempts
        ? "player-name player-name--toggle"
        : "player-name";
      const aria = hasAttempts
        ? ` role="button" tabindex="0" aria-expanded="${expanded}" data-toggle-player="${esc(p.name)}"`
        : "";
      const chevron = hasAttempts
        ? `<span class="chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>`
        : "";

      return `
        <tr class="bball-row ${expanded ? "is-expanded" : ""}">
          <td class="col-place"><span class="place-pill">${i + 1}</span></td>
          <td>
            <div class="${nameClass}"${aria}>${chevron}<span>${esc(p.name)}</span></div>
          </td>
          <td class="col-stat score-cell">${esc(scoreDisplay)}</td>
        </tr>
        ${attemptRow}`;
    })
    .join("");

  return `
    <section class="block">
      ${sectionTitle("Gracze / Ranking", sorted.length)}
      <p class="hint">Średnia z najlepszej próby (50%) i pozostałych prób (50%)</p>
      <div class="table-wrap">
        <table class="data-table data-table--basketball">
          <thead>
            <tr><th>#</th><th>Gracz</th><th>Wynik</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderGenericSections(sections) {
  if (!sections?.length) {
    return emptyBlock(
      "Brak danych w arkuszu „Inne”. Dodaj sekcje w formacie: # SEKCJA | Nazwa."
    );
  }

  return sections
    .map((sec) => {
      if (!sec.rows?.length) {
        return `
          <section class="block">
            ${sectionTitle(sec.title || "Sekcja")}
            ${emptyBlock("Brak wierszy w tej sekcji.")}
          </section>`;
      }
      const headers = sec.headers?.length
        ? sec.headers
        : Object.keys(sec.rows[0] || {});
      const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
      const body = sec.rows
        .map((row) => {
          const cells = headers
            .map((h) => `<td>${esc(row[h] ?? "")}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `
        <section class="block">
          ${sectionTitle(sec.title || "Sekcja", sec.rows.length)}
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr>${head}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </section>`;
    })
    .join("");
}

/**
 * Render Info tab.
 */
export function renderInfo(data) {
  const info = data?.info || {};
  const title = info.title || APP_TITLE;
  const paragraphs = info.paragraphs || [];
  const meta = info.meta || {};
  const fetchedAt = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleString("pl-PL")
    : "—";

  const metaHtml = Object.keys(meta).length
    ? `<dl class="meta-list">${Object.entries(meta)
        .map(
          ([k, v]) =>
            `<div class="meta-item"><dt>${esc(k)}</dt><dd>${esc(v) || "—"}</dd></div>`
        )
        .join("")}</dl>`
    : "";

  const body = paragraphs
    .map((p) => {
      if (p.startsWith("•") || /^\d+\./.test(p)) {
        return `<li>${esc(p.replace(/^•\s*/, ""))}</li>`;
      }
      if (/^(Dyscypliny|Uwagi|Informacje)/i.test(p)) {
        return `</ul><h3 class="info-subtitle">${esc(p)}</h3><ul class="info-list">`;
      }
      return `<p class="info-para">${esc(p)}</p>`;
    })
    .join("");

  const cacheNote = data?.fromCache
    ? `<p class="banner banner-warn">Wyświetlane są dane z pamięci podręcznej (offline lub błąd sieci).</p>`
    : "";

  const errNote =
    data?.errors?.length
      ? `<p class="banner banner-error">Częściowe błędy pobierania: ${esc(data.errors.join("; "))}</p>`
      : "";

  return `
    <div class="hero">
      <p class="hero-kicker">Turniej sportowy</p>
      <h1 class="hero-title">${esc(title)}</h1>
      <p class="hero-sub">Informacje i regulamin</p>
    </div>
    ${cacheNote}
    ${errNote}
    ${metaHtml}
    <section class="block info-content">
      <ul class="info-list">${body}</ul>
    </section>
    <p class="updated muted">Ostatnia aktualizacja: ${esc(fetchedAt)}</p>
  `;
}

/**
 * Render player match card for Gracze profile (team or 1v1).
 * @param {any} m
 */
function renderPlayerMatchCard(m) {
  const outcome = m.outcome || "pending";
  const outcomeClass =
    outcome === "win"
      ? "pmatch--win"
      : outcome === "loss"
        ? "pmatch--loss"
        : outcome === "both"
          ? "pmatch--both"
          : outcome === "draw"
            ? "pmatch--draw"
            : "pmatch--pending";

  const side = (name, mine) =>
    `<span class="pmatch-side ${mine ? "pmatch-side--mine" : ""}">${esc(name)}</span>`;

  const scoreOrVs = m.score
    ? `<span class="pmatch-score">${esc(m.score)}</span>`
    : `<span class="pmatch-score pmatch-score--vs">vs</span>`;

  return `
    <article class="pmatch ${outcomeClass}" title="${esc(
      outcome === "win"
        ? "Wygrana"
        : outcome === "loss"
          ? "Porażka"
          : outcome === "both"
            ? "Obie drużyny"
            : outcome === "draw"
              ? "Remis"
              : "Zaplanowany"
    )}">
      <div class="pmatch-phase">${esc(m.phase || "—")}</div>
      <div class="pmatch-body">
        ${side(m.side1, m.mine1)}
        ${scoreOrVs}
        ${side(m.side2, m.mine2)}
      </div>
    </article>`;
}

/**
 * @param {string} title
 * @param {{ teams?: string[], matches: any[] }} block
 */
function renderPlayerMatchDiscipline(title, block) {
  const teams =
    block.teams?.length
      ? `<p class="profile-teams muted">Drużyny: ${esc(block.teams.join(", "))}</p>`
      : "";
  if (!block.matches?.length) {
    return `
      <section class="profile-disc">
        <h3 class="profile-disc-title">${esc(title)}</h3>
        ${teams}
        <p class="muted profile-empty">Brak meczów z udziałem gracza.</p>
      </section>`;
  }
  return `
    <section class="profile-disc">
      <h3 class="profile-disc-title">${esc(title)}</h3>
      ${teams}
      <div class="pmatch-list">
        ${block.matches.map(renderPlayerMatchCard).join("")}
      </div>
    </section>`;
}

/**
 * @param {string} title
 * @param {{ place: string, score: string }|null} standing
 */
function renderPlayerSkillDiscipline(title, standing) {
  if (!standing) {
    return `
      <section class="profile-disc">
        <h3 class="profile-disc-title">${esc(title)}</h3>
        <p class="muted profile-empty">Brak wyniku w rankingu.</p>
      </section>`;
  }
  return `
    <section class="profile-disc">
      <h3 class="profile-disc-title">${esc(title)}</h3>
      <div class="profile-skill-row">
        <span class="place-pill">${esc(standing.place)}</span>
        <span class="profile-skill-score">Wynik: <strong>${esc(standing.score)}</strong></span>
      </div>
    </section>`;
}

const MEDAL_EMOJI = {
  złoty: "🥇",
  srebrny: "🥈",
  brązowy: "🥉",
};

/**
 * Medal icons next to the player name — every medal shown separately.
 * Order left → right: złoty, srebrny, brązowy.
 * @param {{ medal: string }[]} awards
 */
function renderMedalIcons(awards) {
  if (!awards?.length) return "";
  const rank = { złoty: 0, srebrny: 1, brązowy: 2 };
  const sorted = [...awards].sort(
    (a, b) => (rank[a.medal] ?? 9) - (rank[b.medal] ?? 9)
  );
  const parts = sorted
    .map((a) => {
      const key = a.medal;
      const emoji = MEDAL_EMOJI[key];
      if (!emoji) return "";
      return `<span class="medal-icon medal-icon--${esc(key)}" title="${esc(key)}">${emoji}</span>`;
    })
    .filter(Boolean);
  if (!parts.length) return "";
  return `<span class="medal-icons" aria-label="Medale">${parts.join("")}</span>`;
}

/**
 * Expanded list: what each medal is for.
 * @param {{ medal: string, discipline: string, recipient: string, via: string|null }[]} awards
 */
function renderPlayerMedalsDetail(awards) {
  if (!awards?.length) {
    return `
      <section class="profile-disc">
        <h3 class="profile-disc-title">Medale</h3>
        <p class="muted profile-empty">Brak medali.</p>
      </section>`;
  }
  const items = awards
    .map((a) => {
      const emoji = MEDAL_EMOJI[a.medal] || "🏅";
      const label =
        a.medal === "złoty"
          ? "Złoty"
          : a.medal === "srebrny"
            ? "Srebrny"
            : a.medal === "brązowy"
              ? "Brązowy"
              : a.medal;
      const via =
        a.via
          ? ` <span class="muted">(z drużyną ${esc(a.via)})</span>`
          : a.recipient && a.recipient !== a.discipline
            ? ` <span class="muted">— ${esc(a.recipient)}</span>`
            : "";
      return `
        <li class="medal-award medal-award--${esc(a.medal)}">
          <span class="medal-award-emoji">${emoji}</span>
          <span class="medal-award-text">
            <strong>${esc(label)}</strong> — ${esc(a.discipline)}${via}
          </span>
        </li>`;
    })
    .join("");
  return `
    <section class="profile-disc">
      <h3 class="profile-disc-title">Medale</h3>
      <ul class="medal-award-list">${items}</ul>
    </section>`;
}

/**
 * Gracze directory — sorted by medals (gold → silver → bronze), then A–Z.
 * Icons next to name; expand one profile at a time.
 * @param {any} data
 * @param {string|null} expandedName
 */
export function renderGracze(data, expandedName = null) {
  const directory = data?.playersDirectory || [];
  if (!directory.length) {
    return `
      <header class="page-header"><h1>Gracze - Klasyfikacja medalowa</h1></header>
      ${emptyBlock("Brak listy graczy w arkuszu „Gracze”.")}
    `;
  }

  const sorted = sortPlayersByMedals(directory, data.disciplines || {});

  const items = sorted
    .map((entry) => {
      const name = entry.name;
      const awards = entry.medals || [];
      const expanded = expandedName && name === expandedName;
      const chevron = expanded ? "▾" : "▸";
      let detail = "";
      if (expanded) {
        const profile = buildPlayerProfile(name, data.disciplines || {});
        detail = `
          <div class="player-profile">
            ${renderPlayerMedalsDetail(profile.medals)}
            ${renderPlayerMatchDiscipline("Piłka Nożna", profile.pilka)}
            ${renderPlayerMatchDiscipline("Siatkówka", profile.siatkowka)}
            ${renderPlayerSkillDiscipline("Piłka ind.", profile.pilka_ind)}
            ${renderPlayerSkillDiscipline("Koszykówka", profile.koszykowka)}
            ${renderPlayerMatchDiscipline("Badminton", profile.badminton)}
          </div>`;
      }
      return `
        <li class="gracz-item ${expanded ? "is-expanded" : ""}">
          <button type="button" class="gracz-toggle" data-toggle-gracz="${esc(name)}" aria-expanded="${expanded}">
            <span class="chevron" aria-hidden="true">${chevron}</span>
            <span class="gracz-name">${esc(name)}</span>
            ${renderMedalIcons(awards)}
          </button>
          ${detail}
        </li>`;
    })
    .join("");

  return `
    <header class="page-header">
      <h1>Gracze - Klasyfikacja medalowa</h1>
      <p class="hint">Dotknij aby rozwinąć</p>
    </header>
    <ul class="gracz-list">${items}</ul>
  `;
}

/**
 * Strefa medalowa — złoty / srebrny / brązowy (ręczne wpisy z arkusza).
 * @param {any[]} medals
 * @param {{ heading?: string|null }} [opts] heading defaults to "Strefa medalowa"; null = no title
 */
function renderMedalZone(medals, opts = {}) {
  const list = medals?.length
    ? medals
    : [
        { medal: "złoty", name: "", players: "" },
        { medal: "srebrny", name: "", players: "" },
        { medal: "brązowy", name: "", players: "" },
      ];

  const meta = {
    złoty: { emoji: "🥇", label: "Złoty", cls: "medal--gold" },
    srebrny: { emoji: "🥈", label: "Srebrny", cls: "medal--silver" },
    brązowy: { emoji: "🥉", label: "Brązowy", cls: "medal--bronze" },
  };

  const cards = list
    .map((m) => {
      const key = m.medal || "złoty";
      const info = meta[key] || {
        emoji: "🏅",
        label: key,
        cls: "medal--other",
      };
      const name = cellOrDash(m.name);
      const players = cellStrSafe(m.players);
      const playersHtml = players
        ? `<p class="medal-players">${esc(players)}</p>`
        : "";
      const empty = !m.name && !players;
      return `
        <article class="medal-card ${info.cls} ${empty ? "is-empty" : ""}">
          <div class="medal-emoji" aria-hidden="true">${info.emoji}</div>
          <div class="medal-label">${esc(info.label)}</div>
          <div class="medal-name">${esc(name)}</div>
          ${playersHtml}
        </article>`;
    })
    .join("");

  const heading =
    opts.heading === null
      ? ""
      : sectionTitle(opts.heading || "Strefa medalowa");

  return `
    <section class="block medal-zone">
      ${heading}
      <div class="medal-grid">${cards}</div>
    </section>`;
}

/**
 * Inne: only competition names + per-event medal zones (no results tables).
 * @param {any} disc
 */
function renderInne(disc) {
  const title = disc?.title || "Inne konkurencje";
  const competitions = disc?.competitions || [];

  let body = "";
  if (competitions.length) {
    body = competitions
      .map((comp) =>
        renderMedalZone(comp.medals, {
          heading: comp.name || "Konkurencja",
        })
      )
      .join("");
  } else {
    // Fallback: single medal zone if sheet has no # SEKCJA blocks
    body = renderMedalZone(disc?.medals);
  }

  return `
    <header class="page-header">
      <h1>${esc(title)}</h1>
      <p class="hint">Ewentualne inne konkurencje po zatwierdzeniu przez organizatorów</p>
    </header>
    ${body}
  `;
}

function cellOrDash(v) {
  const s = String(v ?? "").trim();
  return s || "—";
}

function cellStrSafe(v) {
  return String(v ?? "").trim();
}

/**
 * Render a discipline tab by id.
 * @param {string} tabId
 * @param {any} data
 * @param {{ expandedAttempts?: Set<string>, expandedGracz?: string|null, expandedMatchKey?: string|null }} [uiState]
 */
export function renderDiscipline(tabId, data, uiState = {}) {
  if (tabId === "gracze") {
    return renderGracze(data, uiState.expandedGracz ?? null);
  }

  const disc = data?.disciplines?.[tabId];
  if (!disc) {
    return emptyBlock("Brak danych dla tej dyscypliny.");
  }

  if (tabId === "koszykowka") {
    return `
      <header class="page-header">
        <h1>${esc(disc.title || "Koszykówka")}</h1>
      </header>
      ${renderSkillRanking(disc, uiState.expandedAttempts || new Set(), {
        shotKeys: disc.skillShotKeys || ["1P", "2P", "3P", "UK1", "UK2"],
        emptyMessage: "Brak graczy w arkuszu Koszykówka.",
        categoriesLabel: "1P / 2P / 3P / UK1 / UK2",
      })}
      ${renderMedalZone(disc.medals)}
    `;
  }

  if (tabId === "pilka_ind") {
    return `
      <header class="page-header">
        <h1>${esc(disc.title || "Piłka ind.")}</h1>
      </header>
      ${renderSkillRanking(disc, uiState.expandedAttempts || new Set(), {
        shotKeys: disc.skillShotKeys || ["Karne", "1na1", "Luta"],
        emptyMessage: "Brak graczy w arkuszu Piłka ind.",
        categoriesLabel: "Karne / 1na1 / Luta",
      })}
      ${renderMedalZone(disc.medals)}
    `;
  }

  if (tabId === "inne") {
    return renderInne(disc);
  }

  // Team sports + badminton
  const parts = [];
  parts.push(`
    <header class="page-header">
      <h1>${esc(disc.title || tabId)}</h1>
    </header>
  `);

  const isTeamSport = tabId === "pilka" || tabId === "siatkowka";

  if (isTeamSport) {
    // Mecze (składy po kliknięciu) → Ranking — składy z arkusza, bez osobnej sekcji Drużyny
    parts.push(
      renderMatches(disc.matches, {
        expandable: true,
        teams: disc.teams || [],
        expandedMatchKey: uiState.expandedMatchKey ?? null,
      })
    );
  } else {
    // Badminton: tylko mecze (bez osobnej listy graczy)
    parts.push(renderMatches(disc.matches));
  }

  if (tabId === "siatkowka") {
    parts.push(
      renderRanking(disc.ranking, {
        title: "Statystyki indywidualne",
        scoreLabel: "Zwycięstwa / mecze",
        diffLabel: "Różnica setów",
        notesLabel: "Drużyny",
        splitStats: true,
        hint: "Nie mają wpływu na przyznawane medale",
        emptyMessage:
          "Brak graczy w drużynach — uzupełnij składy w arkuszu Siatkówka.",
      })
    );
  } else if (tabId === "pilka") {
    parts.push(
      renderRanking(disc.ranking, {
        title: "Statystyki indywidualne",
        scoreLabel: "Zwycięstwa / mecze",
        diffLabel: "Różnica goli",
        notesLabel: "Drużyny",
        splitStats: true,
        hint: "Nie mają wpływu na przyznawane medale",
        emptyMessage:
          "Brak graczy w drużynach — uzupełnij składy w arkuszu Piłka Nożna.",
      })
    );
  } else if (disc.ranking?.length) {
    parts.push(renderRanking(disc.ranking, "Statystyki"));
  }

  parts.push(renderMedalZone(disc.medals));

  return parts.join("");
}

/**
 * Build top navigation HTML.
 * @param {string} activeId
 */
export function renderNav(activeId) {
  return TABS.map((tab) => {
    const active = tab.id === activeId ? " is-active" : "";
    return `
      <button type="button" class="nav-tab${active}" data-tab="${esc(tab.id)}" role="tab" aria-selected="${tab.id === activeId}">
        <span class="nav-icon" aria-hidden="true">${tab.icon}</span>
        <span class="nav-label">${esc(tab.label)}</span>
      </button>`;
  }).join("");
}

/**
 * Loading skeleton.
 */
export function renderLoading() {
  return `
    <div class="loading" aria-busy="true" aria-live="polite">
      <div class="spinner"></div>
      <p>Ładowanie danych turnieju…</p>
    </div>`;
}

/**
 * Error state with retry.
 * @param {string} message
 */
export function renderError(message) {
  return `
    <div class="error-state">
      <h2>Nie udało się pobrać danych</h2>
      <p>${esc(message)}</p>
      <button type="button" class="btn btn-primary" data-action="retry">Spróbuj ponownie</button>
    </div>`;
}
