import { entityLink } from "/entity-links.js";

const root = document.querySelector("#championship-app");
let payload = null;

async function request(path) {
  const response = await fetch(path, { headers: { "content-type": "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
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

function activeView() {
  return window.location.hash === "#standings" ? "standings" : "calendar";
}

function statusLabel(status) {
  if (status === "completed") return "COMPLETED";
  if (status === "current") return "IN PROGRESS";
  if (status === "unresolved") return "AWAITING RESULT";
  return "UPCOMING";
}

function calendarView(championship) {
  const rows = championship.calendar ?? [];
  return `<section class="championship-panel championship-calendar">
    <div class="championship-panel-head"><div><span>Season Calendar</span><h2>${escapeHtml(championship.season)} Formula One Championship</h2></div><strong>${championship.summary.completedRounds}/${championship.summary.totalRounds} rounds</strong></div>
    <div class="championship-round-list">${rows.map((row) => `
      <article class="championship-round ${escapeHtml(row.status)}">
        <div class="championship-round-number"><small>ROUND</small><strong>${row.round ?? "—"}</strong></div>
        <div class="championship-round-main"><small>${humanDate(row.date)}${row.country ? ` · ${escapeHtml(row.country)}` : ""}</small><h3>${escapeHtml(row.name)}</h3><span>${escapeHtml(row.trackName)}</span></div>
        <div class="championship-round-result"><em>${statusLabel(row.status)}</em>${row.winner ? `<strong>${entityLink("driver", row.winner.driverId, row.winner.driverName)}</strong><small>${entityLink("team", row.winner.teamId, row.winner.teamName)}</small>` : `<strong>${row.laps ? `${row.laps} laps` : "—"}</strong><small>${row.championshipStatus === "championship" ? "Championship round" : escapeHtml(row.championshipStatus)}</small>`}</div>
      </article>`).join("") || '<p class="championship-empty">No races are present in the current calendar.</p>'}
    </div>
  </section>`;
}

function table(title, rows, type, controlledTeamId = null) {
  return `<article class="championship-panel"><div class="championship-panel-head"><div><span>Standings</span><h2>${escapeHtml(title)}</h2></div></div>
    <div class="championship-table">${rows.map((row) => `<div class="championship-standing ${controlledTeamId && String(row.id) === String(controlledTeamId) ? "controlled" : ""}"><b>${row.position ?? "—"}</b><strong>${entityLink(type, row.id, row.name ?? row.id)}</strong><span>${Number(row.wins ?? 0)} W</span><em>${Number(row.points ?? 0)} pts</em></div>`).join("") || '<p class="championship-empty">No championship standings yet.</p>'}</div>
  </article>`;
}

function archiveView(archive = []) {
  if (!archive.length) return "";
  return `<section class="championship-panel championship-archive"><div class="championship-panel-head"><div><span>History</span><h2>Championship Archive</h2></div></div><div class="championship-archive-list">${archive.map((row) => `<div><strong>${row.season ?? "—"}</strong><span>${escapeHtml(row.driverChampionName ?? "Driver title unresolved")}</span><em>${escapeHtml(row.constructorChampionName ?? "Constructor title unresolved")}</em></div>`).join("")}</div></section>`;
}

function standingsView(championship) {
  return `<section class="championship-standings-grid">${table("Drivers' Championship", championship.standings?.drivers ?? [], "driver")}${table("Constructors' Championship", championship.standings?.constructors ?? [], "team", championship.controlledTeamId)}</section>${archiveView(championship.archive)}`;
}

function render() {
  if (!root || !payload?.championship) return;
  const championship = payload.championship;
  const view = activeView();
  root.innerHTML = `<header class="championship-hero"><div><span>F1 World · Championship</span><h1>${escapeHtml(championship.season)} Season</h1><p>${humanDate(championship.date)} · ${championship.summary.completedRounds} completed · ${championship.summary.remainingRounds} remaining</p></div><div class="championship-progress"><strong>${championship.summary.championshipComplete ? "COMPLETE" : `R${championship.summary.currentRound ?? "—"}`}</strong><small>${championship.summary.championshipComplete ? "Season complete" : "Current / next round"}</small></div></header>
    <nav class="championship-tabs"><a href="#calendar" class="${view === "calendar" ? "active" : ""}">CALENDAR</a><a href="#standings" class="${view === "standings" ? "active" : ""}">STANDINGS</a></nav>
    ${view === "standings" ? standingsView(championship) : calendarView(championship)}`;
}

async function load() {
  payload = await request("/api/world");
  render();
}

window.addEventListener("hashchange", render);
load().catch((error) => {
  if (root) root.innerHTML = `<p class="championship-error">${escapeHtml(error.message)}</p>`;
});
