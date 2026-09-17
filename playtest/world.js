import { entityLink } from "/entity-links.js";

const app = document.querySelector("#app");

async function api(path) {
  const response = await fetch(path, { headers: { "content-type": "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function recordTable(rows, kind) {
  if (!rows.length) return '<p class="empty">No simulated career records yet.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>${kind}</th><th>Starts</th><th>Wins</th><th>Podiums</th><th>Titles</th></tr></thead>
    <tbody>${rows.slice(0, 12).map((row) => `<tr>
      <td><strong>${entityLink(kind === "Driver" ? "driver" : "team", row.id, row.name ?? row.id)}</strong><span class="sub">${escapeHtml(row.id)}</span></td>
      <td>${escapeHtml(row.starts)}</td><td>${escapeHtml(row.wins)}</td><td>${escapeHtml(row.podiums)}</td><td>${escapeHtml(row.championships)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function storyCard(row) {
  return `<article class="story ${escapeHtml(row.importance)}">
    <div class="story-meta"><span>${escapeHtml(row.date)}</span><span>${escapeHtml(row.category)}</span><span>${escapeHtml(row.importance)}</span></div>
    <h3>${escapeHtml(row.headline)}</h3>
    <p>${escapeHtml(row.summary)}</p>
  </article>`;
}

function historyRow(row) {
  return `<article class="history-row">
    <time>${escapeHtml(row.date)}</time>
    <div><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.summary)}</p></div>
    <span class="tag">${escapeHtml(row.category)}</span>
  </article>`;
}

function championRow(row) {
  return `<tr>
    <td><strong>${escapeHtml(row.season)}</strong></td>
    <td>${escapeHtml(row.driverChampionName ?? "Unresolved")}</td>
    <td>${escapeHtml(row.constructorChampionName ?? "Unresolved")}</td>
    <td>${escapeHtml(row.standingsStatus ?? "—")}</td>
  </tr>`;
}

function render(data) {
  const summary = data.summary ?? {};
  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">F1 World · ${escapeHtml(data.date)}</p>
        <h1>F1 World</h1>
        <p class="muted">Season ${escapeHtml(data.season)} · News, history and records reflect your evolving Formula One world.</p>
      </div>
      <nav class="nav">
        <a href="/">Career</a>
        <a href="/management.html">Management</a>
        <a href="/technical.html">Technical</a>
        <a href="/governance.html">Governance</a>
        <a href="/offseason.html">Offseason</a>
      </nav>
    </header>

    <section class="kpis">
      <div class="kpi"><span>Active teams</span><strong>${escapeHtml(summary.activeTeams ?? 0)}</strong></div>
      <div class="kpi"><span>Active drivers</span><strong>${escapeHtml(summary.activeDrivers ?? 0)}</strong></div>
      <div class="kpi"><span>Races archived</span><strong>${escapeHtml(summary.racesArchived ?? 0)}</strong></div>
      <div class="kpi"><span>News stories</span><strong>${escapeHtml(summary.newsStories ?? 0)}</strong></div>
      <div class="kpi"><span>History events</span><strong>${escapeHtml(summary.historyEvents ?? 0)}</strong></div>
      <div class="kpi"><span>Milestones</span><strong>${escapeHtml(summary.milestones ?? 0)}</strong></div>
    </section>

    <section class="layout">
      <section class="panel wide">
        <div class="panel-head"><div><p class="eyebrow">Latest</p><h2>World News</h2></div><span class="tag">Simulation-owned</span></div>
        <div class="story-grid">${data.news.length ? data.news.map(storyCard).join("") : '<p class="empty">Advance the career to generate world news.</p>'}</div>
      </section>

      <section class="panel">
        <p class="eyebrow">Career leaderboard</p><h2>Driver Records</h2>
        ${recordTable(data.records?.drivers ?? [], "Driver")}
      </section>
      <section class="panel">
        <p class="eyebrow">Career leaderboard</p><h2>Constructor Records</h2>
        ${recordTable(data.records?.teams ?? [], "Team")}
      </section>

      <section class="panel wide">
        <p class="eyebrow">Alternative history</p><h2>Championship Archive</h2>
        ${(data.records?.championships ?? []).length ? `<div class="table-wrap"><table><thead><tr><th>Season</th><th>Drivers' Champion</th><th>Constructors' Champion</th><th>Status</th></tr></thead><tbody>${data.records.championships.map(championRow).join("")}</tbody></table></div>` : '<p class="empty">No completed championship has been archived yet.</p>'}
      </section>

      <section class="panel wide">
        <p class="eyebrow">Career chronology</p><h2>World History</h2>
        <div class="timeline">${data.history.length ? data.history.map(historyRow).join("") : '<p class="empty">No world-history events recorded yet.</p>'}</div>
      </section>
    </section>`;
}

async function refresh() {
  try {
    render(await api("/api/world"));
  } catch (error) {
    app.innerHTML = `<div class="error">${escapeHtml(error.message)}</div><p><a class="button" href="/">Return to Career</a></p>`;
  }
}

refresh();
