import {
  NEW_GAME_STEPS,
  buildNewGameCatalog,
  databaseById,
  decadesForDatabase,
  defaultNewGameSelection,
  seasonBySelection,
  seasonsForDecade,
  validateNewGameSelection,
} from "/new-game-flow.js";

const root = document.querySelector("#app");
let setupPayload = null;
let catalog = null;
let selection = null;
let stepIndex = 0;
let submitting = false;
let wizardError = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload;
}

function currentDatabase() {
  return databaseById(catalog, selection.databaseId);
}

function currentSeason() {
  return seasonBySelection(catalog, selection.databaseId, selection.season);
}

function progress() {
  const labels = ["Database", "Decade", "Season", "Team", "Manager"];
  return `<div class="ng-progress">${labels.map((label, index) => `
    <div class="ng-progress-item ${index === stepIndex ? "active" : ""} ${index < stepIndex ? "done" : ""}">
      <span>${index < stepIndex ? "✓" : index + 1}</span><b>${label}</b>
    </div>`).join("")}</div>`;
}

function card(options) {
  const { selected, title, subtitle, meta, attrs = "" } = options;
  return `<button type="button" class="ng-choice ${selected ? "selected" : ""}" ${attrs}>
    <span class="ng-choice-check">${selected ? "✓" : ""}</span>
    <strong>${escapeHtml(title)}</strong>
    ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}
    ${meta ? `<em>${escapeHtml(meta)}</em>` : ""}
  </button>`;
}

function footer({ next = true, create = false } = {}) {
  const back = stepIndex > 0 ? '<button type="button" class="ng-secondary" data-ng-action="back">BACK</button>' : "<span></span>";
  const forward = create
    ? `<button type="button" class="ng-primary" data-ng-action="create" ${submitting ? "disabled" : ""}>${submitting ? "CREATING CAREER…" : "START CAREER"}</button>`
    : next ? '<button type="button" class="ng-primary" data-ng-action="next">CONTINUE</button>' : "";
  return `<div class="ng-footer">${back}${forward}</div>`;
}

function databaseStep() {
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Database</div><h1>Choose your historical database.</h1><p>The database defines the historical starting world. Once the career begins, the future belongs to the simulation.</p></div>
    <div class="ng-choice-grid">${catalog.databases.map((database) => card({
      selected: database.id === selection.databaseId,
      title: database.name,
      subtitle: database.databaseVersion ?? "Local database",
      meta: `${database.seasons.length} career-ready season${database.seasons.length === 1 ? "" : "s"}`,
      attrs: `data-ng-database="${escapeHtml(database.id)}"`,
    })).join("")}</div>${footer()}`;
}

function decadeStep() {
  const decades = decadesForDatabase(catalog, selection.databaseId);
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Decade</div><h1>Choose a decade.</h1><p>Only decades with a validated Season Database are selectable. No unsupported historical world is invented.</p></div>
    <div class="ng-choice-grid compact">${decades.map((row) => card({
      selected: row.decade === Number(selection.decade),
      title: row.label,
      subtitle: "Historical starting point",
      attrs: `data-ng-decade="${row.decade}"`,
    })).join("")}</div>${footer()}`;
}

function seasonStep() {
  const seasons = seasonsForDecade(catalog, selection.databaseId, selection.decade);
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Season</div><h1>Choose your starting season.</h1><p>History is loaded only up to Career Start. Later real-world outcomes never become scripted career events.</p></div>
    <div class="ng-choice-grid compact">${seasons.map((row) => card({
      selected: row.season === Number(selection.season),
      title: String(row.season),
      subtitle: row.releaseName ?? currentDatabase()?.name ?? "Season Database",
      meta: `${row.teams.length} active team${row.teams.length === 1 ? "" : "s"}`,
      attrs: `data-ng-season="${row.season}"`,
    })).join("")}</div>${footer()}`;
}

function teamStep() {
  const season = currentSeason();
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Team</div><h1>Choose the team you will manage.</h1><p>All teams shown here come from the active Season Database snapshot. Hidden future teams are not exposed.</p></div>
    <div class="ng-team-grid">${(season?.teams ?? []).map((team) => card({
      selected: team.id === selection.teamId,
      title: team.name,
      subtitle: team.nationality ?? "Formula One constructor",
      meta: team.constructorName ?? "",
      attrs: `data-ng-team="${escapeHtml(team.id)}"`,
    })).join("")}</div>${footer()}`;
}

function managerStep() {
  let review;
  try {
    review = validateNewGameSelection(catalog, selection);
  } catch {
    review = {
      databaseName: currentDatabase()?.name ?? "Database",
      season: selection.season,
      teamName: currentSeason()?.teams?.find((row) => row.id === selection.teamId)?.name ?? "Team",
    };
  }
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Manager</div><h1>Create your manager.</h1><p>This creates a new independent Save World. The Historical World Database remains immutable.</p></div>
    <div class="ng-manager-layout">
      <section class="ng-manager-card">
        <label for="ng-manager-name">Manager name</label>
        <input id="ng-manager-name" maxlength="64" autocomplete="name" placeholder="Enter manager name" value="${escapeHtml(selection.managerName)}">
        <div class="ng-manager-note">Your team, contracts, results and alternative history will evolve inside this save only.</div>
      </section>
      <section class="ng-review-card">
        <div class="eyebrow">Career Setup</div>
        <dl><div><dt>Database</dt><dd>${escapeHtml(review.databaseName)}</dd></div><div><dt>Decade</dt><dd>${escapeHtml(`${selection.decade}s`)}</dd></div><div><dt>Season</dt><dd>${escapeHtml(review.season)}</dd></div><div><dt>Team</dt><dd>${escapeHtml(review.teamName)}</dd></div></dl>
        <div class="ng-boundary">Historical starting conditions.<br><strong>Dynamic alternative future.</strong></div>
      </section>
    </div>${footer({ create: true })}`;
}

function renderWizard() {
  if (!root || !catalog || !selection) return;
  const existing = root.querySelector(".setup-wrap");
  if (!existing && !root.querySelector(".new-game-shell")) return;
  const step = NEW_GAME_STEPS[stepIndex];
  const body = step === "database" ? databaseStep()
    : step === "decade" ? decadeStep()
      : step === "season" ? seasonStep()
        : step === "team" ? teamStep()
          : managerStep();

  root.innerHTML = `<main class="new-game-shell ${submitting ? "loading" : ""}">
    <section class="new-game-panel">
      <div class="ng-brand">F1 <span>MANAGER</span> SIM</div>
      ${progress()}
      ${wizardError ? `<div class="ng-error">${escapeHtml(wizardError)}</div>` : ""}
      <div class="ng-step">${body}</div>
    </section>
  </main>`;
  root.querySelector("#ng-manager-name")?.focus();
}

function resetBelow(level) {
  const database = currentDatabase();
  if (!database) return;
  if (level <= 0) {
    const firstSeason = database.seasons[0];
    selection.decade = firstSeason.decade;
    selection.season = firstSeason.season;
    selection.teamId = firstSeason.teams[0]?.id ?? null;
    return;
  }
  if (level <= 1) {
    const firstSeason = seasonsForDecade(catalog, selection.databaseId, selection.decade)[0];
    selection.season = firstSeason?.season ?? null;
    selection.teamId = firstSeason?.teams?.[0]?.id ?? null;
    return;
  }
  if (level <= 2) {
    selection.teamId = currentSeason()?.teams?.[0]?.id ?? null;
  }
}

function validateCurrentStep() {
  if (stepIndex === 0 && !currentDatabase()) throw new Error("Select a database.");
  if (stepIndex === 1 && !decadesForDatabase(catalog, selection.databaseId).some((row) => row.decade === Number(selection.decade))) throw new Error("Select a decade.");
  if (stepIndex === 2 && !currentSeason()) throw new Error("Select a season.");
  if (stepIndex === 3 && !currentSeason()?.teams?.some((row) => row.id === selection.teamId)) throw new Error("Select a team.");
}

async function createCareer() {
  const normalized = validateNewGameSelection(catalog, selection);
  submitting = true;
  wizardError = "";
  renderWizard();
  try {
    await request("/api/career", {
      method: "POST",
      body: JSON.stringify({
        managerName: normalized.managerName,
        teamId: normalized.teamId,
        newGame: {
          databaseId: normalized.databaseId,
          decade: normalized.decade,
          season: normalized.season,
        },
      }),
    });
    window.location.reload();
  } catch (error) {
    submitting = false;
    wizardError = error.message;
    renderWizard();
  }
}

function onClick(event) {
  const database = event.target.closest("[data-ng-database]");
  if (database) {
    selection.databaseId = database.dataset.ngDatabase;
    resetBelow(0);
    wizardError = "";
    renderWizard();
    return;
  }

  const decade = event.target.closest("[data-ng-decade]");
  if (decade) {
    selection.decade = Number(decade.dataset.ngDecade);
    resetBelow(1);
    wizardError = "";
    renderWizard();
    return;
  }

  const season = event.target.closest("[data-ng-season]");
  if (season) {
    selection.season = Number(season.dataset.ngSeason);
    resetBelow(2);
    wizardError = "";
    renderWizard();
    return;
  }

  const team = event.target.closest("[data-ng-team]");
  if (team) {
    selection.teamId = team.dataset.ngTeam;
    wizardError = "";
    renderWizard();
    return;
  }

  const action = event.target.closest("[data-ng-action]")?.dataset.ngAction;
  if (action === "back") {
    stepIndex = Math.max(0, stepIndex - 1);
    wizardError = "";
    renderWizard();
  } else if (action === "next") {
    try {
      validateCurrentStep();
      stepIndex = Math.min(NEW_GAME_STEPS.length - 1, stepIndex + 1);
      wizardError = "";
    } catch (error) {
      wizardError = error.message;
    }
    renderWizard();
  } else if (action === "create" && !submitting) {
    createCareer().catch((error) => {
      submitting = false;
      wizardError = error.message;
      renderWizard();
    });
  }
}

function onInput(event) {
  if (event.target?.id !== "ng-manager-name") return;
  selection.managerName = event.target.value;
  wizardError = "";
}

async function installWizard() {
  if (!root) return;
  setupPayload = await request("/api/setup");
  catalog = buildNewGameCatalog(setupPayload);
  selection = defaultNewGameSelection(catalog);

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);

  const observer = new MutationObserver(() => {
    if (root.querySelector(".setup-wrap") && !root.querySelector(".new-game-shell")) renderWizard();
  });
  observer.observe(root, { childList: true, subtree: true });
  if (root.querySelector(".setup-wrap")) renderWizard();
}

installWizard().catch((error) => {
  console.error("New Game flow could not initialize:", error);
});
