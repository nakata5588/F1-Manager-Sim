const root = document.querySelector("#app");
let state = null;
let selectedTeam = null;
let busy = false;
let errorMessage = "";
let runSpeed = 0;
let autoTimer = null;
let autoAdvancing = false;

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

function number(value, fallback = "—") {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? fallback : Number(value);
}

function standingsList(rows) {
  if (!rows?.length) return '<div class="muted">No championship points yet.</div>';
  return `<div class="list">${rows.slice(0, 8).map((row) => `
    <div class="row"><span class="pos">${row.position}</span><span class="grow">${escapeHtml(row.name)}</span><span class="points">${row.points}</span></div>
  `).join("")}</div>`;
}

function navigation(active = "Home") {
  const entries = ["Home", "Inbox", "Calendar", "Team", "Drivers", "Car", "Development", "Finances", "Standings", "F1 World"];
  return `<aside class="sidebar">
    <div class="brand">F1 <span>MANAGER</span> SIM</div>
    <div class="nav">${entries.map((entry) => `<div class="${entry === active ? "active" : ""}">${entry}</div>`).join("")}</div>
    <div class="version">DEVELOPER PLAYTEST · PHASE 31</div>
  </aside>`;
}

function topbar(showContinue = true) {
  return `<div class="topbar">
    <div class="manager"><strong>${escapeHtml(state.career.managerName)}</strong><span>${escapeHtml(state.career.teamName)}</span></div>
    <div class="date">${humanDate(state.career.date)} · ${state.career.season}</div>
    ${showContinue ? '<button class="continue" data-action="continue">CONTINUE ▶</button>' : ""}
  </div>`;
}

function shell(content, active = "Calendar", showContinue = false) {
  root.innerHTML = `<div class="shell ${busy ? "loading" : ""}">${navigation(active)}<main class="main">${topbar(showContinue)}${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}${content}</main></div>`;
}

function weekendSteps(active) {
  const steps = [
    ["practice", "Practice"],
    ["practice_results", "Setup"],
    ["qualifying_results", "Qualifying"],
    ["pre_race", "Pre-Race"],
    ["race", "Race"],
  ];
  return `<div class="session-strip">${steps.map(([id, label]) => `<span class="${id === active ? "active" : ""}">${label}</span>`).join("")}</div>`;
}

function weekendHero(label, title, copy) {
  const weekend = state.raceWeekend;
  return `${weekendSteps(state.screen)}<section class="hero weekend-hero"><div class="eyebrow">${escapeHtml(label)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p><div class="weekend-meta"><span>Round ${weekend?.round ?? "—"}</span><span>${escapeHtml(weekend?.trackName ?? "Circuit")}</span><span>${humanDate(weekend?.date)}</span><span>${escapeHtml(weekend?.weather ?? "Weather unspecified")}</span></div></section>`;
}

function renderSetup() {
  stopAuto();
  const setup = state.setup;
  root.innerHTML = `<main class="setup-wrap ${busy ? "loading" : ""}"><section class="setup">
    <div class="setup-head"><div class="eyebrow">Developer Playtest · ${setup.season}</div><h1>Start a new career.</h1><p>${escapeHtml(setup.releaseName ?? "Season Database")} · Choose the team you want to manage. Historical data defines the starting world; what happens next belongs to the simulation.</p></div>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
    <div class="form-row"><input id="manager-name" type="text" maxlength="64" placeholder="Manager name" value="Ricardo Nakata"><div class="card"><span class="muted">Database</span><br><strong>${escapeHtml(setup.databaseVersion ?? "local")}</strong></div></div>
    <div class="team-grid">${setup.teams.map((team) => `<button class="team ${selectedTeam === team.id ? "selected" : ""}" data-team="${escapeHtml(team.id)}"><strong>${escapeHtml(team.name)}</strong><small>${escapeHtml(team.nationality ?? "Formula One constructor")}</small></button>`).join("")}</div>
    <button class="start" data-action="start" ${selectedTeam ? "" : "disabled"}>START CAREER</button>
  </section></main>`;
}

function renderHome() {
  stopAuto();
  const next = state.nextRace;
  shell(`<section class="hero"><div class="eyebrow">Career Home</div><h1>${escapeHtml(state.career.teamName)}</h1><p>The world is live. Continue advances the actual Save World to the next Grand Prix weekend.</p></section>
    <section class="grid">
      <article class="card span-4"><h2>Next Grand Prix</h2>${next ? `<div class="kpi">R${next.round}</div><strong>${escapeHtml(next.name)}</strong><div class="muted">${humanDate(next.date)}</div>` : '<div class="muted">Season complete</div>'}</article>
      <article class="card span-4"><h2>Your Drivers</h2><div class="list">${state.teamDrivers.map((driver) => `<div class="row"><span>${escapeHtml(driver.name)}</span><span class="muted">${escapeHtml(driver.role)}</span></div>`).join("")}</div></article>
      <article class="card span-4"><h2>Season</h2><div class="kpi">${state.career.season}</div><div class="muted">Historical start · dynamic future</div></article>
      <article class="card span-6"><h2>Drivers' Championship</h2>${standingsList(state.standings.drivers)}</article>
      <article class="card span-6"><h2>Constructors' Championship</h2>${standingsList(state.standings.constructors)}</article>
    </section>`, "Home", true);
}

function renderPractice() {
  stopAuto();
  shell(`${weekendHero("Race Weekend", state.raceWeekend.name, "Practice is ready. Run the session to build setup knowledge before Qualifying.")}
    <section class="grid"><article class="card span-8"><h2>Session Briefing</h2><div class="row"><span>Track</span><strong>${escapeHtml(state.raceWeekend.trackName ?? "—")}</strong></div><div class="row"><span>Weather</span><strong>${escapeHtml(state.raceWeekend.weather ?? "Unspecified")}</strong></div><div class="row"><span>Drivers entered</span><strong>${state.teamDrivers.length}</strong></div></article><article class="card span-4 action-card"><h2>Practice</h2><p class="muted">The engine will run the era-appropriate Practice windows and return engineering/setup feedback.</p><button class="primary" data-action="advance-weekend">RUN PRACTICE</button></article></section>`);
}

function setupSlider(field, label, value) {
  return `<label class="slider"><span>${escapeHtml(label)} <b data-value-for="${field}">${number(value)}</b></span><input type="range" min="0" max="100" step="1" name="${field}" value="${number(value, 50)}"></label>`;
}

function renderPracticeResults() {
  stopAuto();
  const practice = state.raceWeekend.practice;
  shell(`${weekendHero("Practice Complete", state.raceWeekend.name, "Review driver feedback and adjust the car before Qualifying. The ideal setup remains hidden in the simulation engine.")}
    <section class="grid">${practice.team.map((driver) => `<article class="card span-6 setup-card" data-driver="${escapeHtml(driver.driverId)}"><div class="driver-card-head"><div><div class="eyebrow">${escapeHtml(driver.driverName)}</div><h2>Car Setup</h2></div><div class="setup-score"><strong>${number(driver.setupQuality)}</strong><span>quality</span></div></div><div class="muted small">Setup knowledge ${number(driver.setupKnowledge)}%</div>${setupSlider("aeroBalance", "Aero balance", driver.setup.aeroBalance)}${setupSlider("mechanicalGrip", "Mechanical grip", driver.setup.mechanicalGrip)}${setupSlider("gearing", "Gearing", driver.setup.gearing)}${setupSlider("cooling", "Cooling", driver.setup.cooling)}<button class="secondary" data-action="apply-setup">APPLY SETUP</button></article>`).join("")}
      <article class="card span-12 action-row"><div><h2>Ready for Qualifying?</h2><div class="muted">Setup changes are applied directly to the active Save World weekend.</div></div><button class="primary" data-action="advance-weekend">CONTINUE TO QUALIFYING</button></article>
    </section>`);
}

function qualifyingTable(rows) {
  return `<table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr class="${row.controlled ? "controlled" : ""}"><td><strong>${row.position}</strong></td><td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td><td>${number(row.score)}</td><td><span class="status">${escapeHtml(row.status)}</span></td></tr>`).join("")}</tbody></table>`;
}

function renderQualifyingResults() {
  stopAuto();
  const q = state.raceWeekend.qualifying;
  shell(`${weekendHero("Qualifying Complete", state.raceWeekend.name, `Qualifying used ${q.sessions ?? 1} session${q.sessions === 1 ? "" : "s"}. Review the classification before locking the grid and race strategy.`)}<article class="card"><h2>Qualifying Classification</h2>${qualifyingTable(q.classification)}</article><div class="action-row standalone"><div class="muted">Grid creation also locks the simulation's initial strategy and race calibration.</div><button class="primary" data-action="advance-weekend">BUILD GRID &amp; STRATEGY</button></div>`);
}

function tyreOptions(options, selected) {
  if (!options?.length) return '<option value="">No tyre data</option>';
  return options.map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selected) ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.condition)}</option>`).join("");
}

function gridTable(rows) {
  return `<table><thead><tr><th>Grid</th><th>Driver</th><th>Team</th></tr></thead><tbody>${rows.map((row) => `<tr class="${row.controlled ? "controlled" : ""}"><td><strong>${row.position}</strong></td><td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td></tr>`).join("")}</tbody></table>`;
}

function renderPreRace() {
  stopAuto();
  const weekend = state.raceWeekend;
  const strategies = state.liveRace?.strategies ?? weekend.strategies;
  shell(`${weekendHero("Pre-Race", weekend.name, "The grid is set. Confirm the starting tyre for each car before lights out.")}
    <section class="grid"><article class="card span-7"><h2>Starting Grid</h2>${gridTable(weekend.grid)}</article><div class="span-5 strategy-stack">${strategies.map((plan) => `<article class="card tyre-card" data-driver="${escapeHtml(plan.driverId)}"><div class="eyebrow">${escapeHtml(plan.driverName)}</div><h2>Race Strategy</h2><div class="row"><span>Planned stops</span><strong>${plan.plannedStops}</strong></div><label class="field-label">Starting tyre<select name="startingCompound">${tyreOptions(state.liveRace.tyreOptions, plan.startingCompoundId)}</select></label><button class="secondary" data-action="starting-tyre">APPLY STARTING TYRE</button><div class="stints">${plan.stints.map((stint) => `<span>${stint.stint}: ${escapeHtml(stint.compoundId ?? "N/A")} · ${stint.targetLaps}L</span>`).join("")}</div></article>`).join("")}</div><article class="card span-12 action-row"><div><h2>Ready for lights out</h2><div class="muted">Only the live race result will be committed to history and championship standings.</div></div><button class="primary race-start" data-action="start-race">START RACE</button></article></section>`);
}

function feedLabel(event) {
  const driver = event.driverName ? ` · ${event.driverName}` : "";
  if (event.type === "race_control") return `${String(event.control ?? "race control").replaceAll("_", " ")}${driver}`;
  if (event.type === "weather_change") return `Weather ${event.from ?? "?"} → ${event.to ?? "?"}`;
  if (event.type === "retirement") return `Retirement${driver} · ${event.reason ?? "unknown"}`;
  if (event.type === "incident") return `Incident${driver}${event.sectorName ? ` · ${event.sectorName}` : ""}`;
  if (event.type === "damage") return `Damage${driver}`;
  if (event.type === "strategy_revision") return `Strategy revision${driver}`;
  return `${String(event.type ?? "event").replaceAll("_", " ")}${driver}`;
}

function raceFeed(events) {
  if (!events?.length) return '<div class="muted">No notable events in the last simulated lap.</div>';
  return `<div class="feed">${[...events].reverse().map((event) => `<div class="feed-row"><span class="feed-lap">L${event.lap ?? "—"}</span><span>${escapeHtml(feedLabel(event))}</span></div>`).join("")}</div>`;
}

function pitWallCards(race) {
  return race.strategies.map((plan) => `<article class="pit-card" data-driver="${escapeHtml(plan.driverId)}"><div><strong>${escapeHtml(plan.driverName)}</strong><div class="muted small">Start ${escapeHtml(plan.startingCompoundId ?? "N/A")} · ${plan.plannedStops} planned stop${plan.plannedStops === 1 ? "" : "s"}</div></div><select name="boxCompound">${tyreOptions(race.tyreOptions, plan.startingCompoundId)}</select><button class="secondary compact" data-action="box-driver">BOX NEXT LAP</button></article>`).join("");
}

function renderRace() {
  const race = state.liveRace;
  const weekend = state.raceWeekend;
  const speedButtons = [1, 2, 4, 8].map((speed) => `<button class="${runSpeed === speed ? "selected" : ""}" data-speed="${speed}">${speed}×</button>`).join("");
  shell(`${weekendSteps("race")}<div class="race-head"><div><div class="eyebrow">Live Race · ${escapeHtml(race.weather ?? "conditions unknown")}${race.activeControl ? ` · ${escapeHtml(race.activeControl.replaceAll("_", " "))}` : ""}</div><h1>${escapeHtml(weekend?.name ?? race.gpId ?? "Grand Prix")}</h1></div><div class="lap">LAP ${race.currentLap} / ${race.totalLaps}</div></div>
    <div class="race-controls"><button data-action="pause" class="${runSpeed === 0 ? "selected" : ""}">PAUSE</button>${speedButtons}<button data-race-laps="1">STEP +1</button><button class="finish" data-action="finish-race">SIM TO FINISH</button></div>
    ${race.attentionRequired ? '<div class="attention">Simulation paused on a notable race event.</div>' : ""}
    <section class="grid race-grid"><article class="card span-8"><h2>Live Timing <span class="muted small">Gap Index is simulation-relative, not seconds.</span></h2><div class="table-wrap"><table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Gap Index</th><th>Tyre</th><th>Wear</th><th>Temp</th><th>Fuel</th><th>Status</th></tr></thead><tbody>${race.order.map((row) => `<tr class="${row.controlled ? "controlled" : ""}"><td><strong>${row.position}</strong></td><td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td><td>${row.position === 1 ? "LEADER" : `+${number(row.gapIndex, 0)}`}</td><td>${escapeHtml(row.compoundId ?? "—")}</td><td>${row.tyreWearPercent === null ? "—" : `${row.tyreWearPercent}%`}</td><td>${escapeHtml(row.tyreTemperature ?? "—")}</td><td>${row.fuelKg === null ? "—" : `${row.fuelKg} kg`}</td><td><span class="status">${escapeHtml(row.status)}</span></td></tr>`).join("")}</tbody></table></div></article><div class="span-4 side-stack"><article class="card"><h2>Race Control Feed</h2>${raceFeed(race.latestEvents)}</article><article class="card"><h2>Pit Wall</h2><div class="pit-wall">${pitWallCards(race)}</div></article><article class="card"><h2>Race State</h2><div class="row"><span>Progress</span><strong>${Math.round((race.progress ?? 0) * 100)}%</strong></div><div class="row"><span>Strategy revisions</span><strong>${race.strategyRevisions.length}</strong></div></article></div></section>`);
}

function resultsTable() {
  const rows = state.lastRace?.classification ?? [];
  return `<table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${row.position}</strong></td><td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td><td>${escapeHtml(row.status ?? "FINISHED")}</td></tr>`).join("")}</tbody></table>`;
}

function renderResults() {
  stopAuto();
  shell(`<section class="hero"><div class="eyebrow">Race Results</div><h1>${escapeHtml(state.lastRace?.name ?? "Grand Prix complete")}</h1><p>The live result is committed to Save World history and championship standings.</p></section><section class="grid"><article class="card span-8"><h2>Classification</h2>${resultsTable()}</article><article class="card span-4"><h2>Next Grand Prix</h2>${state.nextRace ? `<strong>${escapeHtml(state.nextRace.name)}</strong><div class="muted">${humanDate(state.nextRace.date)}</div>` : '<div class="muted">No remaining race in this season.</div>'}</article><article class="card span-6"><h2>Drivers' Championship</h2>${standingsList(state.standings.drivers)}</article><article class="card span-6"><h2>Constructors' Championship</h2>${standingsList(state.standings.constructors)}</article></section>`, "Standings", true);
}

function render() {
  if (!state) return;
  if (state.screen === "new_career") renderSetup();
  else if (state.screen === "home") renderHome();
  else if (state.screen === "practice") renderPractice();
  else if (state.screen === "practice_results") renderPracticeResults();
  else if (state.screen === "qualifying_results") renderQualifyingResults();
  else if (state.screen === "pre_race") renderPreRace();
  else if (state.screen === "race") renderRace();
  else if (state.screen === "race_results") renderResults();
  else renderHome();
}

function stopAuto() {
  runSpeed = 0;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = null;
}

function scheduleAuto() {
  if (!runSpeed || state?.screen !== "race" || autoAdvancing) return;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(autoTick, Math.max(120, 1100 / runSpeed));
}

async function autoTick() {
  if (!runSpeed || state?.screen !== "race" || autoAdvancing) return;
  autoAdvancing = true;
  const previousAttention = state.liveRace?.attentionToken ?? null;
  try {
    state = await api("/api/race/advance", { method: "POST", body: JSON.stringify({ laps: 1 }) });
    const nextAttention = state.liveRace?.attentionToken ?? null;
    if (state.screen !== "race" || (nextAttention && nextAttention !== previousAttention)) stopAuto();
    render();
  } catch (error) {
    stopAuto();
    errorMessage = error.message;
    render();
  } finally {
    autoAdvancing = false;
    scheduleAuto();
  }
}

async function action(fn) {
  stopAuto();
  busy = true;
  errorMessage = "";
  render();
  try { state = await fn(); }
  catch (error) { errorMessage = error.message; }
  finally { busy = false; render(); }
}

root.addEventListener("input", (event) => {
  if (event.target.matches('input[type="range"]')) {
    const label = event.target.closest(".slider");
    const value = label?.querySelector(`[data-value-for="${event.target.name}"]`);
    if (value) value.textContent = event.target.value;
  }
});

root.addEventListener("click", (event) => {
  const team = event.target.closest("[data-team]");
  if (team) {
    selectedTeam = team.dataset.team;
    render();
    return;
  }

  const speed = event.target.closest("[data-speed]")?.dataset.speed;
  if (speed) {
    runSpeed = Number(speed);
    errorMessage = "";
    render();
    scheduleAuto();
    return;
  }

  const actionName = event.target.closest("[data-action]")?.dataset.action;
  if (actionName === "start") {
    const managerName = document.querySelector("#manager-name")?.value?.trim();
    action(() => api("/api/career", { method: "POST", body: JSON.stringify({ managerName, teamId: selectedTeam }) }));
  } else if (actionName === "continue") {
    action(() => api("/api/continue", { method: "POST", body: "{}" }));
  } else if (actionName === "advance-weekend") {
    action(() => api("/api/weekend/advance", { method: "POST", body: "{}" }));
  } else if (actionName === "apply-setup") {
    const card = event.target.closest(".setup-card");
    const setup = Object.fromEntries([...card.querySelectorAll('input[type="range"]')].map((input) => [input.name, Number(input.value)]));
    action(() => api("/api/weekend/setup", { method: "POST", body: JSON.stringify({ driverId: card.dataset.driver, setup }) }));
  } else if (actionName === "starting-tyre") {
    const card = event.target.closest(".tyre-card");
    const compoundId = card.querySelector('select[name="startingCompound"]')?.value;
    action(() => api("/api/weekend/starting-tyre", { method: "POST", body: JSON.stringify({ driverId: card.dataset.driver, compoundId }) }));
  } else if (actionName === "start-race") {
    action(() => api("/api/weekend/start-race", { method: "POST", body: "{}" }));
  } else if (actionName === "pause") {
    stopAuto();
    render();
  } else if (actionName === "finish-race") {
    action(() => api("/api/race/finish", { method: "POST", body: "{}" }));
  } else if (actionName === "box-driver") {
    const card = event.target.closest(".pit-card");
    const compoundId = card.querySelector('select[name="boxCompound"]')?.value;
    action(() => api("/api/race/strategy", { method: "POST", body: JSON.stringify({ driverId: card.dataset.driver, instruction: { action: "box", compoundId, pitAfterLap: (state.liveRace?.currentLap ?? 0) + 1, reason: "player_pit_wall" } }) }));
  }

  const laps = event.target.closest("[data-race-laps]")?.dataset.raceLaps;
  if (laps) action(() => api("/api/race/advance", { method: "POST", body: JSON.stringify({ laps: Number(laps) }) }));
});

action(() => api("/api/state"));