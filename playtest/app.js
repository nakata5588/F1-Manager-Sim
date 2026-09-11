const root = document.querySelector("#app");
let state = null;
let selectedTeam = null;
let busy = false;
let errorMessage = "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
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

function humanDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function standingsList(rows) {
  if (!rows?.length) return '<div class="muted">No championship points yet.</div>';
  return `<div class="list">${rows.slice(0, 6).map((row) => `
    <div class="row">
      <span class="pos">${row.position}</span>
      <span style="flex:1">${escapeHtml(row.name)}</span>
      <span class="points">${row.points}</span>
    </div>`).join("")}</div>`;
}

function navigation(active = "Home") {
  const entries = ["Home", "Inbox", "Calendar", "Team", "Drivers", "Car", "Development", "Finances", "Standings", "F1 World"];
  return `<aside class="sidebar">
    <div class="brand">F1 <span>MANAGER</span> SIM</div>
    <div class="nav">${entries.map((entry) => `<div class="${entry === active ? "active" : ""}">${entry}</div>`).join("")}</div>
    <div class="version">DEVELOPER PLAYTEST · PHASE 30</div>
  </aside>`;
}

function topbar(showContinue = true) {
  return `<div class="topbar">
    <div class="manager"><strong>${escapeHtml(state.career.managerName)}</strong><span>${escapeHtml(state.career.teamName)}</span></div>
    <div class="date">${humanDate(state.career.date)} · ${state.career.season}</div>
    ${showContinue ? '<button class="continue" data-action="continue">CONTINUE ▶</button>' : ""}
  </div>`;
}

function renderSetup() {
  const setup = state.setup;
  root.innerHTML = `<main class="setup-wrap ${busy ? "loading" : ""}">
    <section class="setup">
      <div class="setup-head">
        <div class="eyebrow">Developer Playtest · ${setup.season}</div>
        <h1>Start a new career.</h1>
        <p>${escapeHtml(setup.releaseName ?? "Season Database")} · Choose the team you want to manage. Historical data defines the starting world; what happens next belongs to the simulation.</p>
      </div>
      ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
      <div class="form-row">
        <input id="manager-name" type="text" maxlength="64" placeholder="Manager name" value="Ricardo Nakata">
        <div class="card"><span class="muted">Database</span><br><strong>${escapeHtml(setup.databaseVersion ?? "local")}</strong></div>
      </div>
      <div class="team-grid">${setup.teams.map((team) => `
        <button class="team ${selectedTeam === team.id ? "selected" : ""}" data-team="${escapeHtml(team.id)}">
          <strong>${escapeHtml(team.name)}</strong>
          <small>${escapeHtml(team.nationality ?? "Formula One constructor")}</small>
        </button>`).join("")}</div>
      <button class="start" data-action="start" ${selectedTeam ? "" : "disabled"}>START CAREER</button>
    </section>
  </main>`;
}

function renderHome() {
  const next = state.nextRace;
  root.innerHTML = `<div class="shell ${busy ? "loading" : ""}">
    ${navigation("Home")}
    <main class="main">
      ${topbar(true)}
      ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
      <section class="hero">
        <div class="eyebrow">Career Home</div>
        <h1>${escapeHtml(state.career.teamName)}</h1>
        <p>The world is live. Continue advances the actual Save World to the next Grand Prix.</p>
      </section>
      <section class="grid">
        <article class="card span-4"><h2>Next Grand Prix</h2>${next ? `<div class="kpi">R${next.round}</div><strong>${escapeHtml(next.name)}</strong><div class="muted">${humanDate(next.date)}</div>` : '<div class="muted">Season complete</div>'}</article>
        <article class="card span-4"><h2>Your Drivers</h2><div class="list">${state.teamDrivers.map((driver) => `<div class="row"><span>${escapeHtml(driver.name)}</span><span class="muted">${escapeHtml(driver.role)}</span></div>`).join("")}</div></article>
        <article class="card span-4"><h2>Season</h2><div class="kpi">${state.career.season}</div><div class="muted">Historical start · dynamic future</div></article>
        <article class="card span-6"><h2>Drivers' Championship</h2>${standingsList(state.standings.drivers)}</article>
        <article class="card span-6"><h2>Constructors' Championship</h2>${standingsList(state.standings.constructors)}</article>
      </section>
    </main>
  </div>`;
}

function renderRace() {
  const race = state.liveRace;
  root.innerHTML = `<div class="shell ${busy ? "loading" : ""}">
    ${navigation("Calendar")}
    <main class="main">
      ${topbar(false)}
      ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
      <div class="race-head">
        <div><div class="eyebrow">Live Race</div><h1>${escapeHtml(race.gpId ?? "Grand Prix")}</h1></div>
        <div class="lap">LAP ${race.currentLap} / ${race.totalLaps}</div>
      </div>
      <div class="race-controls">
        <button data-race-laps="1">+1 Lap</button>
        <button data-race-laps="5">+5 Laps</button>
        <button data-race-laps="10">+10 Laps</button>
        <button class="finish" data-action="finish-race">Simulate to Finish</button>
      </div>
      <article class="card span-12" style="margin-top:16px">
        <table>
          <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Status</th><th>Laps</th></tr></thead>
          <tbody>${race.order.map((row) => `<tr class="${row.controlled ? "controlled" : ""}">
            <td><strong>${row.position}</strong></td>
            <td>${escapeHtml(row.driverName)}</td>
            <td>${escapeHtml(row.teamName)}</td>
            <td><span class="status">${escapeHtml(row.status)}</span></td>
            <td>${row.completedLaps ?? race.currentLap}</td>
          </tr>`).join("")}</tbody>
        </table>
      </article>
      <div class="grid" style="margin-top:16px">
        <article class="card span-6"><h2>Race Strategy</h2><div class="muted">Strategies are locked by the simulation engine. Live strategy revisions are supported by the application API; the full pit wall controls come in the next UI pass.</div></article>
        <article class="card span-6"><h2>Simulation State</h2><div class="row"><span>Status</span><strong>${escapeHtml(race.status)}</strong></div><div class="row"><span>Revisions</span><strong>${race.strategyRevisions.length}</strong></div></article>
      </div>
    </main>
  </div>`;
}

function resultsTable() {
  const rows = state.lastRace?.classification ?? [];
  return `<table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr>
    <td><strong>${row.position}</strong></td><td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td><td>${escapeHtml(row.status ?? "FINISHED")}</td>
  </tr>`).join("")}</tbody></table>`;
}

function renderResults() {
  root.innerHTML = `<div class="shell ${busy ? "loading" : ""}">
    ${navigation("Standings")}
    <main class="main">
      ${topbar(true)}
      ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
      <section class="hero"><div class="eyebrow">Race Results</div><h1>${escapeHtml(state.lastRace?.name ?? "Grand Prix complete")}</h1><p>The result is now committed to Save World history and championship standings.</p></section>
      <section class="grid">
        <article class="card span-8"><h2>Classification</h2>${resultsTable()}</article>
        <article class="card span-4"><h2>Next Grand Prix</h2>${state.nextRace ? `<strong>${escapeHtml(state.nextRace.name)}</strong><div class="muted">${humanDate(state.nextRace.date)}</div>` : '<div class="muted">No remaining race in this season.</div>'}</article>
        <article class="card span-6"><h2>Drivers' Championship</h2>${standingsList(state.standings.drivers)}</article>
        <article class="card span-6"><h2>Constructors' Championship</h2>${standingsList(state.standings.constructors)}</article>
      </section>
    </main>
  </div>`;
}

function render() {
  if (!state) return;
  if (state.screen === "new_career") renderSetup();
  else if (state.screen === "race") renderRace();
  else if (state.screen === "race_results") renderResults();
  else renderHome();
}

async function action(fn) {
  busy = true;
  errorMessage = "";
  render();
  try { state = await fn(); }
  catch (error) { errorMessage = error.message; }
  finally { busy = false; render(); }
}

root.addEventListener("click", (event) => {
  const team = event.target.closest("[data-team]");
  if (team) {
    selectedTeam = team.dataset.team;
    render();
    return;
  }
  const actionName = event.target.closest("[data-action]")?.dataset.action;
  if (actionName === "start") {
    const managerName = document.querySelector("#manager-name")?.value?.trim();
    action(() => api("/api/career", { method: "POST", body: JSON.stringify({ managerName, teamId: selectedTeam }) }));
  } else if (actionName === "continue") {
    action(() => api("/api/continue", { method: "POST", body: "{}" }));
  } else if (actionName === "finish-race") {
    action(() => api("/api/race/finish", { method: "POST", body: "{}" }));
  }

  const laps = event.target.closest("[data-race-laps]")?.dataset.raceLaps;
  if (laps) action(() => api("/api/race/advance", { method: "POST", body: JSON.stringify({ laps: Number(laps) }) }));
});

action(() => api("/api/state"));
