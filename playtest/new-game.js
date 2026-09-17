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
import { CAREER_ENTRY_STORAGE_KEY } from "/main-menu-model.js";

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

function safeColour(value, fallback) {
  const colour = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback;
}

function teamChoice(team) {
  const primary = safeColour(team.visualIdentity?.colours?.primary, "#3C5A78");
  const secondary = safeColour(team.visualIdentity?.colours?.secondary, "#D9E2EC");
  const logo = team.resolvedMedia?.logo?.url
    ? `<img src="${escapeHtml(team.resolvedMedia.logo.url)}" alt="" loading="lazy">`
    : `<span>${escapeHtml(team.name.slice(0, 2).toUpperCase())}</span>`;
  const drivers = team.drivers?.length
    ? team.drivers.map((driver) => `<span class="ng-team-driver">${driver.carNumber ? `<b>#${escapeHtml(driver.carNumber)}</b>` : ""}<strong>${escapeHtml(driver.name)}</strong></span>`).join("")
    : '<span class="ng-team-missing">Opening drivers unavailable</span>';
  const technical = [
    team.chassis ? `<div><span>Chassis</span><strong>${escapeHtml(team.chassis)}</strong></div>` : "",
    team.engine?.name ? `<div><span>Engine</span><strong>${escapeHtml(team.engine.name)}</strong></div>` : "",
  ].filter(Boolean).join("");

  return `<button type="button" class="ng-team-choice ${team.id === selection.teamId ? "selected" : ""}" data-ng-team="${escapeHtml(team.id)}" style="--team-primary:${primary};--team-secondary:${secondary}">
    <span class="ng-team-accent"></span>
    <div class="ng-team-head">
      <div class="ng-team-logo">${logo}</div>
      <div class="ng-team-title"><small>${escapeHtml(team.nationality ?? "Formula One constructor")}</small><strong>${escapeHtml(team.name)}</strong>${team.constructorName && team.constructorName !== team.name ? `<em>${escapeHtml(team.constructorName)}</em>` : ""}</div>
      <span class="ng-team-check">${team.id === selection.teamId ? "✓" : ""}</span>
    </div>
    <div class="ng-team-section"><span class="ng-team-label">Drivers</span><div class="ng-team-drivers">${drivers}</div></div>
    ${technical ? `<div class="ng-team-technical">${technical}</div>` : ""}
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
      subtitle: `Version ${database.versionLabel}`,
      meta: `${database.seasons.length} career-ready season${database.seasons.length === 1 ? "" : "s"}`,
      attrs: `data-ng-database="${escapeHtml(database.id)}"`,
    })).join("")}</div>${footer()}`;
}

function decadeStep() {
  const decades = decadesForDatabase(catalog, selection.databaseId);
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Decade</div><h1>Choose a decade.</h1><p>Only decades with a validated historical starting season are selectable. Unsupported years are never invented.</p></div>
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
      title: row.name,
      subtitle: `${row.season} starting season`,
      meta: `${row.teams.length} active team${row.teams.length === 1 ? "" : "s"}`,
      attrs: `data-ng-season="${row.season}"`,
    })).join("")}</div>${footer()}`;
}

function teamStep() {
  const season = currentSeason();
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Team</div><h1>Choose the team you will manage.</h1><p>Compare each constructor's opening line-up and technical package. Everything shown comes from the selected historical starting world; later real-world results are not used.</p></div>
    <div class="ng-team-grid">${(season?.teams ?? []).map(teamChoice).join("")}</div>${footer()}`;
}

function managerStep() {
  let review;
  try {
    review = validateNewGameSelection(catalog, selection);
  } catch {
    review = {
      databaseName: currentDatabase()?.name ?? "Historical Database",
      databaseVersionLabel: currentDatabase()?.versionLabel ?? "Current",
      season: selection.season,
      seasonName: currentSeason()?.name ?? `${selection.season} Formula One World Championship`,
      teamName: currentSeason()?.teams?.find((row) => row.id === selection.teamId)?.name ?? "Team",
    };
  }
  const backgrounds = catalog?.managerBackgrounds ?? [];
  const selectedBackground = backgrounds.find((row) => row.id === selection.managerBackground) ?? null;
  const maxBirthDate = Number.isInteger(Number(selection.season)) ? `${Number(selection.season) - 18}-01-01` : "";
  return `<div class="ng-step-copy"><div class="eyebrow">New Game · Manager</div><h1>Create your manager.</h1><p>Build the identity that will follow you through jobs, results and an alternative Formula One career.</p></div>
    <div class="ng-manager-layout">
      <section class="ng-manager-card">
        <div class="ng-manager-fields">
          <label><span>Manager name</span><input id="ng-manager-name" maxlength="64" autocomplete="name" placeholder="Enter manager name" value="${escapeHtml(selection.managerName)}"></label>
          <label><span>Nationality</span><input id="ng-manager-nationality" maxlength="64" autocomplete="country-name" placeholder="e.g. Portuguese" value="${escapeHtml(selection.managerNationality)}"></label>
          <label><span>Date of birth</span><input id="ng-manager-dob" type="date" ${maxBirthDate ? `max="${maxBirthDate}"` : ""} value="${escapeHtml(selection.managerDateOfBirth)}"></label>
          <label><span>Background / Previous Experience</span><select id="ng-manager-background"><option value="">Select background</option>${backgrounds.map((row) => `<option value="${escapeHtml(row.id)}" ${row.id === selection.managerBackground ? "selected" : ""}>${escapeHtml(row.label)}</option>`).join("")}</select></label>
        </div>
        <div class="ng-manager-note">${escapeHtml(selectedBackground?.description ?? "Your personal profile is stored in this career and remains separate from the immutable historical database.")}</div>
      </section>
      <section class="ng-review-card">
        <div class="eyebrow">Career Setup</div>
        <dl><div><dt>Database</dt><dd>${escapeHtml(review.databaseName)}</dd></div><div><dt>Version</dt><dd>${escapeHtml(review.databaseVersionLabel)}</dd></div><div><dt>Season</dt><dd>${escapeHtml(review.seasonName)}</dd></div><div><dt>Team</dt><dd>${escapeHtml(review.teamName)}</dd></div><div><dt>Manager</dt><dd>${escapeHtml(selection.managerName || "—")}</dd></div><div><dt>Nationality</dt><dd>${escapeHtml(selection.managerNationality || "—")}</dd></div><div><dt>Born</dt><dd>${escapeHtml(selection.managerDateOfBirth || "—")}</dd></div><div><dt>Background</dt><dd>${escapeHtml(selectedBackground?.label ?? "—")}</dd></div></dl>
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
        managerProfile: normalized.managerProfile,
        teamId: normalized.teamId,
        newGame: {
          databaseId: normalized.databaseId,
          decade: normalized.decade,
          season: normalized.season,
        },
      }),
    });
    sessionStorage.setItem(CAREER_ENTRY_STORAGE_KEY, "1");
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
  const id = event.target?.id;
  if (id === "ng-manager-name") selection.managerName = event.target.value;
  else if (id === "ng-manager-nationality") selection.managerNationality = event.target.value;
  else if (id === "ng-manager-dob") selection.managerDateOfBirth = event.target.value;
  else if (id === "ng-manager-background") selection.managerBackground = event.target.value;
  else return;
  wizardError = "";
  if (id === "ng-manager-background") renderWizard();
}

async function installWizard() {
  if (!root) return;
  setupPayload = await request("/api/setup");
  catalog = buildNewGameCatalog(setupPayload);
  selection = defaultNewGameSelection(catalog);

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onInput);

  const observer = new MutationObserver(() => {
    if (root.querySelector(".setup-wrap") && !root.querySelector(".new-game-shell")) renderWizard();
  });
  observer.observe(root, { childList: true, subtree: true });
  if (root.querySelector(".setup-wrap")) renderWizard();
}

installWizard().catch((error) => {
  console.error("New Game flow could not initialize:", error);
});
