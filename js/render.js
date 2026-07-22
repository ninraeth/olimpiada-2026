/**
 * DOM rendering for Olimpiada Bieździadów 2026.
 */

import { TABS, APP_TITLE } from "./config.js";

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

function renderMatches(matches) {
  if (!matches?.length) return emptyBlock("Brak meczów w arkuszu.");
  const groups = groupByPhase(matches);
  let html = `<section class="block">${sectionTitle("Mecze", matches.length)}`;

  for (const [phase, list] of groups) {
    html += `<h3 class="phase-title">${esc(phase)}</h3>`;
    html += `<div class="match-list">`;
    for (const m of list) {
      const hasScore = Boolean(m.score);
      html += `
        <article class="match-card ${hasScore ? "has-score" : "pending"}">
          <div class="match-sides">
            <span class="side side-a">${esc(m.side1)}</span>
            <span class="match-vs">${hasScore ? esc(m.score) : "vs"}</span>
            <span class="side side-b">${esc(m.side2)}</span>
          </div>
          ${
            hasScore
              ? `<span class="badge badge-score">Wynik</span>`
              : `<span class="badge badge-pending">Oczekuje</span>`
          }
        </article>`;
    }
    html += `</div>`;
  }
  html += `</section>`;
  return html;
}

/**
 * @param {any[]} ranking
 * @param {string | { scoreLabel?: string, diffLabel?: string, notesLabel?: string, hint?: string, emptyMessage?: string, splitStats?: boolean }} [opts]
 */
function renderRanking(ranking, opts = "Wynik") {
  const options =
    typeof opts === "string"
      ? { scoreLabel: opts }
      : opts || {};
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
        ${sectionTitle("Ranking")}
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
      ${sectionTitle("Ranking", ranking.length)}
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
 * @param {any} disc
 * @param {Set<string>} [expandedNames]
 */
function renderBasketball(disc, expandedNames = new Set()) {
  const players = disc.players || [];
  if (!players.length) {
    return emptyBlock("Brak graczy w arkuszu Koszykówka.");
  }

  const sorted = [...players].sort(
    (a, b) => (b.scoreNum ?? -Infinity) - (a.scoreNum ?? -Infinity)
  );

  const shotKeys = ["1P", "2P", "3P", "UK1", "UK2"];

  const rows = sorted
    .map((p, i) => {
      const hasAttempts = (p.attemptRows && p.attemptRows.length > 0) ||
        Object.keys(p.attempts || {}).length > 0;
      const expanded = expandedNames.has(p.name);
      const scoreDisplay = p.score || "—";

      let attemptBlock = "";
      if (expanded && p.attemptRows?.length) {
        const head = shotKeys.map((k) => `<th>${k}</th>`).join("");
        const resolvedRows = p.resolvedAttemptRows || null;
        const body = p.attemptRows
          .map((ar, ri) => {
            const cells = shotKeys
              .map((k) => {
                const raw = ar.shots[k] || "";
                if (/^s$/i.test(String(raw).trim())) {
                  const resolved = resolvedRows?.[ri]?.shots?.[k] || "";
                  const label = resolved
                    ? `S (${resolved})`
                    : "S";
                  return `<td class="shot-s" title="S = 50% najgorszy ${k} + 50% średnia ${k}">${esc(label)}</td>`;
                }
                return `<td>${esc(raw)}</td>`;
              })
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        attemptBlock = `
          <div class="attempt-panel" data-player-attempts="${esc(p.name)}">
            <table class="attempt-table">
              <thead><tr>${head}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>`;
      } else if (expanded && hasAttempts && !p.attemptRows?.length) {
        // Fallback flat attempts if structure missing
        const items = Object.entries(p.attempts || {})
          .map(
            ([k, v]) =>
              `<span class="attempt-item"><strong>${esc(k)}</strong>: ${esc(v)}</span>`
          )
          .join("");
        attemptBlock = `<div class="attempt-panel attempt-grid">${items}</div>`;
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
            ${attemptBlock}
          </td>
          <td class="col-stat score-cell">${esc(scoreDisplay)}</td>
        </tr>`;
    })
    .join("");

  return `
    <section class="block">
      ${sectionTitle("Gracze / Ranking", sorted.length)}
      <p class="hint">Wynik = (średnia najlepszej próby + średnia pozostałych prób) / 2, nie zwykła średnia arytmetyczna. 1 próba → średnia z 1P…UK2. „S” w komórce = 50% najgorszy wynik tego typu rzutu (wszyscy gracze/próby) + 50% średnia tego typu. Sortowanie malejąco. Kliknij gracza → próby.</p>
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
 * Render a discipline tab by id.
 * @param {string} tabId
 * @param {any} data
 * @param {{ expandedBasketball?: Set<string> }} [uiState]
 */
export function renderDiscipline(tabId, data, uiState = {}) {
  const disc = data?.disciplines?.[tabId];
  if (!disc) {
    return emptyBlock("Brak danych dla tej dyscypliny.");
  }

  if (tabId === "koszykowka") {
    return `
      <header class="page-header">
        <h1>${esc(disc.title || "Koszykówka")}</h1>
      </header>
      ${renderBasketball(disc, uiState.expandedBasketball || new Set())}
    `;
  }

  if (tabId === "inne") {
    return `
      <header class="page-header">
        <h1>${esc(disc.title || "Inne")}</h1>
      </header>
      ${renderGenericSections(disc.sections)}
    `;
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
    // Mecze → Drużyny → Ranking
    parts.push(renderMatches(disc.matches));
    if (disc.teams?.length) {
      parts.push(renderTeams(disc.teams));
    }
  } else {
    // Badminton: gracze → mecze
    if (disc.players?.length) {
      parts.push(renderPlayersList(disc.players, "Gracze"));
    }
    parts.push(renderMatches(disc.matches));
  }

  if (tabId === "siatkowka") {
    parts.push(
      renderRanking(disc.ranking, {
        scoreLabel: "Zwycięstwa / mecze",
        diffLabel: "Różnica setów",
        notesLabel: "Drużyny",
        splitStats: true,
        hint:
          "Ranking liczony automatycznie z meczów z wynikiem (format X:Y; w arkuszu wpisuj jako tekst, żeby Sheets nie zamienił na godzinę). % zwycięstw ↓, potem różnica setów ↓. Gracz w wielu drużynach — sumowane są mecze wszystkich jego drużyn; w obu składach jednego meczu — liczy się dwukrotnie.",
        emptyMessage:
          "Brak graczy w drużynach — uzupełnij składy w arkuszu Siatkówka.",
      })
    );
  } else if (tabId === "pilka") {
    parts.push(
      renderRanking(disc.ranking, {
        scoreLabel: "Gole / %",
        emptyMessage: "Ranking jest pusty — uzupełnij w arkuszu.",
      })
    );
  } else if (disc.ranking?.length) {
    parts.push(renderRanking(disc.ranking, "Statystyki"));
  }

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
