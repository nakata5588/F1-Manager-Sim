import { entityLink } from "/entity-links.js";
import { publicLabel } from "/presentation-labels.js";
import { WORLD_VIEWS, normalizeWorldView } from "/world-workspace-model.js";

const app = document.querySelector("#app");
let payload = null;
let newsCategory = "all";

async function api(path) {
  const response = await fetch(path, { headers: { "content-type": "application/json" } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed: ${response.status}`);
  return result;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function humanDate(value) {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? raw : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function entityChips(rows = []) {
  if (!rows.length) return "";
  return `<div class="world-entities">${rows.map((row) => ["driver", "team", "staff"].includes(String(row.type)) ? entityLink(row.type, row.id, row.name ?? row.id) : `<span>${escapeHtml(row.name ?? publicLabel(row.type, "World"))}</span>`).join("")}</div>`;
}

function storyCard(row, compact = false) {
  return `<article class="world-story ${escapeHtml(row.importance ?? "normal")} ${compact ? "compact" : ""}">
    <div class="world-meta"><span>${humanDate(row.date)}</span><span>${escapeHtml(publicLabel(row.category, "World"))}</span><span>${escapeHtml(publicLabel(row.importance, "Normal"))}</span></div>
    <h3>${escapeHtml(row.headline)}</h3>
    ${row.summary ? `<p>${escapeHtml(row.summary)}</p>` : ""}
    ${entityChips(row.entities)}
  </article>`;
}

function historyRow(row) {
  return `<article class="world-history-row ${escapeHtml(row.importance ?? "normal")}">
    <time>${humanDate(row.date)}</time>
    <div><span>${escapeHtml(publicLabel(row.category, "World"))}</span><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.summary)}</p>${entityChips(row.entities)}</div>
    <em>${escapeHtml(publicLabel(row.type, "Event"))}</em>
  </article>`;
}

function primaryTabs(view) {
  return `<nav class="world-tabs">${WORLD_VIEWS.map((row) => `<a href="#${row.id}" class="${view === row.id ? "active" : ""}">${escapeHtml(row.label)}</a>`).join("")}</nav>`;
}

function leaderCard(title, row, type) {
  if (!row) return `<article class="world-leader"><span>${escapeHtml(title)}</span><strong>—</strong><small>No classified standings yet</small></article>`;
  return `<article class="world-leader"><span>${escapeHtml(title)}</span><strong>${entityLink(type, row.id, row.name ?? row.id)}</strong><small>P${row.position ?? "—"} · ${Number(row.points ?? 0)} pts · ${Number(row.wins ?? 0)} wins</small></article>`;
}

function overviewView(data) {
  const driverLeader = data.championship?.standings?.drivers?.[0] ?? null;
  const teamLeader = data.championship?.standings?.constructors?.[0] ?? null;
  const recentNews = (data.news ?? []).slice(0, 6);
  const recentHistory = (data.history ?? []).slice(0, 6);
  return `
    <section class="world-overview-grid">
      <article class="world-panel world-season-status">
        <div class="world-panel-head"><div><span>Current World</span><h2>${escapeHtml(data.season)} Formula One Season</h2></div><a href="/championship.html#standings">Championship</a></div>
        <div class="world-stat-grid">
          <div><strong>${escapeHtml(data.summary?.activeTeams ?? 0)}</strong><span>Active teams</span></div>
          <div><strong>${escapeHtml(data.summary?.activeDrivers ?? 0)}</strong><span>Active drivers</span></div>
          <div><strong>${escapeHtml(data.summary?.racesArchived ?? 0)}</strong><span>Races completed</span></div>
          <div><strong>${escapeHtml(data.summary?.championshipsArchived ?? 0)}</strong><span>Championships archived</span></div>
        </div>
        <div class="world-leaders">${leaderCard("Drivers' leader", driverLeader, "driver")}${leaderCard("Constructors' leader", teamLeader, "team")}</div>
      </article>
      <article class="world-panel world-milestone-summary">
        <div class="world-panel-head"><div><span>Career Memory</span><h2>Alternative history</h2></div><a href="#records">Records</a></div>
        <div class="world-memory-kpis"><div><strong>${escapeHtml(data.summary?.newsStories ?? 0)}</strong><span>News stories</span></div><div><strong>${escapeHtml(data.summary?.historyEvents ?? 0)}</strong><span>History events</span></div><div><strong>${escapeHtml(data.summary?.milestones ?? 0)}</strong><span>Milestones</span></div></div>
        <p>Only events created by this career are recorded here. Real-world future results are not part of the archive.</p>
      </article>
    </section>
    <section class="world-panel">
      <div class="world-panel-head"><div><span>Latest</span><h2>World News</h2></div><a href="#news">All News</a></div>
      <div class="world-story-grid">${recentNews.length ? recentNews.map((row) => storyCard(row, true)).join("") : '<p class="world-empty">Advance the career to generate world news.</p>'}</div>
    </section>
    <section class="world-panel">
      <div class="world-panel-head"><div><span>Chronology</span><h2>Recent History</h2></div><a href="#history">Full History</a></div>
      <div class="world-history-list">${recentHistory.length ? recentHistory.map(historyRow).join("") : '<p class="world-empty">No world-history events recorded yet.</p>'}</div>
    </section>`;
}

function newsView(data) {
  const rows = data.news ?? [];
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort();
  const visible = newsCategory === "all" ? rows : rows.filter((row) => row.category === newsCategory);
  return `<section class="world-panel">
    <div class="world-panel-head"><div><span>Media</span><h2>F1 World News</h2></div><strong>${visible.length} stories</strong></div>
    <div class="world-filter-row"><button data-news-category="all" class="${newsCategory === "all" ? "active" : ""}">All</button>${categories.map((category) => `<button data-news-category="${escapeHtml(category)}" class="${newsCategory === category ? "active" : ""}">${escapeHtml(publicLabel(category))}</button>`).join("")}</div>
    <div class="world-story-grid">${visible.length ? visible.map(storyCard).join("") : '<p class="world-empty">No stories match this category.</p>'}</div>
  </section>`;
}

function driverRow(row) {
  return `<a class="world-directory-row" href="/profile.html?type=driver&id=${encodeURIComponent(row.driverId)}">
    <b>${row.championshipPosition ? `P${row.championshipPosition}` : "—"}</b>
    <span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.nationality ?? "Nationality unavailable")}</small></span>
    <span><strong>${escapeHtml(row.teamName ?? "Free Agent")}</strong><small>${escapeHtml(publicLabel(row.role, row.employmentStatus === "employed" ? "Driver" : "Available"))}</small></span>
    <em>${Number(row.championshipPoints ?? 0)} pts</em><i>${Number(row.championshipWins ?? 0)} W</i>
  </a>`;
}

function driversView(data) {
  return `<section class="world-panel">
    <div class="world-panel-head"><div><span>Paddock</span><h2>Active Drivers</h2></div><strong>${data.activeDrivers?.length ?? 0} visible</strong></div>
    <div class="world-directory-head"><span>Pos.</span><span>Driver</span><span>Current Team</span><span>Points</span><span>Wins</span></div>
    <div class="world-directory">${(data.activeDrivers ?? []).map(driverRow).join("") || '<p class="world-empty">No active drivers are visible.</p>'}</div>
  </section>`;
}

function teamRow(row) {
  return `<a class="world-directory-row team" href="/profile.html?type=team&id=${encodeURIComponent(row.teamId)}">
    <b>${row.championshipPosition ? `P${row.championshipPosition}` : "—"}</b>
    <span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.nationality ?? "Nationality unavailable")}</small></span>
    <span><strong>${row.activeDriverCount}</strong><small>active drivers</small></span>
    <em>${Number(row.championshipPoints ?? 0)} pts</em><i>${Number(row.championshipWins ?? 0)} W</i>
  </a>`;
}

function teamsView(data) {
  return `<section class="world-panel">
    <div class="world-panel-head"><div><span>Constructors</span><h2>Active Teams</h2></div><strong>${data.activeTeams?.length ?? 0} active</strong></div>
    <div class="world-directory-head"><span>Pos.</span><span>Team</span><span>Drivers</span><span>Points</span><span>Wins</span></div>
    <div class="world-directory">${(data.activeTeams ?? []).map(teamRow).join("") || '<p class="world-empty">No active teams are visible.</p>'}</div>
  </section>`;
}

function historyView(data) {
  const groups = new Map();
  for (const row of data.history ?? []) {
    const season = Number(row.season ?? String(row.date ?? "").slice(0, 4)) || data.season;
    if (!groups.has(season)) groups.set(season, []);
    groups.get(season).push(row);
  }
  const seasons = [...groups.keys()].sort((a, b) => b - a);
  return `<section class="world-panel">
    <div class="world-panel-head"><div><span>Career Chronology</span><h2>World History</h2></div><strong>${data.history?.length ?? 0} events</strong></div>
    ${seasons.length ? seasons.map((season) => `<section class="world-history-season"><h3>${season} Season</h3><div class="world-history-list">${groups.get(season).map(historyRow).join("")}</div></section>`).join("") : '<p class="world-empty">No world-history events recorded yet.</p>'}
  </section>`;
}

function recordTable(rows, kind) {
  if (!rows.length) return '<p class="world-empty">No simulated career records yet.</p>';
  return `<div class="world-record-table"><div class="world-record-head"><span>${kind}</span><span>Starts</span><span>Wins</span><span>Podiums</span><span>Titles</span></div>${rows.slice(0, 20).map((row) => `<a href="/profile.html?type=${kind === "Driver" ? "driver" : "team"}&id=${encodeURIComponent(row.id)}"><strong>${escapeHtml(row.name ?? row.id)}</strong><span>${row.starts}</span><span>${row.wins}</span><span>${row.podiums}</span><span>${row.championships}</span></a>`).join("")}</div>`;
}

function recordsView(data) {
  const championships = data.records?.championships ?? [];
  const milestones = [...(data.records?.milestones ?? [])].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  return `
    <section class="world-record-grid">
      <article class="world-panel"><div class="world-panel-head"><div><span>Career Records</span><h2>Drivers</h2></div></div>${recordTable(data.records?.drivers ?? [], "Driver")}</article>
      <article class="world-panel"><div class="world-panel-head"><div><span>Career Records</span><h2>Constructors</h2></div></div>${recordTable(data.records?.teams ?? [], "Team")}</article>
    </section>
    <section class="world-panel">
      <div class="world-panel-head"><div><span>Alternative Champions</span><h2>Championship Archive</h2></div><strong>${championships.length} seasons</strong></div>
      ${championships.length ? `<div class="world-champion-list">${championships.map((row) => `<div><strong>${row.season ?? "—"}</strong><span>${row.driverChampionId ? entityLink("driver", row.driverChampionId, row.driverChampionName) : "Driver title unresolved"}</span><em>${row.constructorChampionId ? entityLink("team", row.constructorChampionId, row.constructorChampionName) : "Constructor title unresolved"}</em></div>`).join("")}</div>` : '<p class="world-empty">No completed championship has been archived yet.</p>'}
    </section>
    <section class="world-panel">
      <div class="world-panel-head"><div><span>Milestones</span><h2>Career Records & Firsts</h2></div><strong>${milestones.length}</strong></div>
      <div class="world-milestones">${milestones.length ? milestones.map((row) => `<article><time>${humanDate(row.date)}</time><div><span>${escapeHtml(publicLabel(row.recordType, "Milestone"))}</span><strong>${escapeHtml(row.title)}</strong></div>${row.entityType && row.entityId && ["driver", "team", "staff"].includes(String(row.entityType)) ? entityLink(row.entityType, row.entityId, "View profile") : ""}</article>`).join("") : '<p class="world-empty">No milestones recorded yet.</p>'}</div>
    </section>`;
}

function contentFor(view, data) {
  if (view === "news") return newsView(data);
  if (view === "drivers") return driversView(data);
  if (view === "teams") return teamsView(data);
  if (view === "history") return historyView(data);
  if (view === "records") return recordsView(data);
  return overviewView(data);
}

function render(data) {
  const view = normalizeWorldView(window.location.hash);
  app.innerHTML = `
    <header class="world-hero">
      <div><span>F1 World · ${humanDate(data.date)}</span><h1>Formula One World</h1><p>Season ${escapeHtml(data.season)} · Your career's evolving teams, drivers, stories, history and records.</p></div>
      <div class="world-hero-stat"><strong>${escapeHtml(data.summary?.racesArchived ?? 0)}</strong><small>races in career history</small></div>
    </header>
    ${primaryTabs(view)}
    <main class="world-content">${contentFor(view, data)}</main>`;
}

app.addEventListener("click", (event) => {
  const category = event.target.closest("[data-news-category]")?.dataset.newsCategory;
  if (!category) return;
  newsCategory = category;
  render(payload);
});

window.addEventListener("hashchange", () => {
  if (payload) render(payload);
});

async function refresh() {
  try {
    payload = await api("/api/world");
    render(payload);
  } catch (error) {
    app.innerHTML = `<div class="world-error">${escapeHtml(error.message)}</div><p><a class="world-button" href="/">Return to Career</a></p>`;
  }
}

refresh();
