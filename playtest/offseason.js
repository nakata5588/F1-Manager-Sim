const root = document.querySelector("#app");
let state = null;
let career = null;

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

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount) : "—";
}

function statusClass(value) {
  const status = String(value ?? "").toLowerCase();
  if (["ready", "prepared", "open", "on_track", "completed", "secure"].includes(status)) return "good";
  if (["action_required", "behind", "at_risk", "dismissal_risk"].includes(status)) return "bad";
  if (["pending", "watch", "baseline_only", "under_pressure"].includes(status)) return "warn";
  return "neutral";
}

function badge(value) {
  const label = String(value ?? "unknown").replaceAll("_", " ");
  return `<span class="badge ${statusClass(value)}">${escapeHtml(label)}</span>`;
}

function checklistCard(title, item, body) {
  return `<article class="check-card">
    <div class="check-head"><h3>${escapeHtml(title)}</h3>${badge(item?.status)}</div>
    <p>${escapeHtml(body)}</p>
  </article>`;
}

function standings(rows, controlledTeamId) {
  if (!rows?.length) return '<p class="muted">No final constructors classification available.</p>';
  return `<div class="standings">${rows.slice(0, 10).map((row) => `<div class="standing ${String(row.id) === String(controlledTeamId) ? "controlled" : ""}"><strong>P${row.position ?? "—"}</strong><span>${escapeHtml(row.id)}</span><span>${Number(row.points ?? 0)} pts</span></div>`).join("")}</div>`;
}

function renderNoCareer() {
  root.innerHTML = `<section class="empty"><h2>No active career</h2><p>Start a career in the main Developer Playtest first.</p><a class="button" href="/">Return to Career Setup</a></section>`;
}

function renderNoCycle() {
  root.innerHTML = `<section class="hero"><div class="eyebrow">${escapeHtml(career?.career?.season ?? "")}</div><h2>No offseason cycle is active</h2><p>Complete the current championship. The season review opens automatically after the final classified race.</p><div class="actions"><a class="button" href="/">Return to Career</a></div></section>`;
}

function render() {
  if (!career || career.screen === "new_career") return renderNoCareer();
  const cycle = state?.offseason?.current;
  if (!cycle) return renderNoCycle();
  const team = cycle.team;
  const prep = team?.preparation ?? {};
  const plan = team?.plan ?? {};
  const board = team?.board ?? {};
  const review = cycle.review ?? {};

  const drivers = prep.contracts?.drivers ?? {};
  const staff = prep.contracts?.staff ?? {};
  const supplier = prep.supplier ?? {};
  const commercial = prep.commercial ?? {};
  const governance = prep.governance ?? {};
  const car = prep.nextSeasonCar ?? {};
  const preseason = prep.preseason ?? {};

  root.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">${cycle.closingSeason} → ${cycle.targetSeason}</div>
        <h2>${escapeHtml(team?.teamName ?? "Team")} · ${escapeHtml(String(cycle.stage).replaceAll("_", " "))}</h2>
        <p>The championship has ended. Existing management systems remain authoritative; this page coordinates the transition into the next season.</p>
      </div>
      <div class="hero-actions">
        ${badge(cycle.status)}
        <button id="continue-button">Continue calendar</button>
      </div>
    </section>

    <section class="metrics">
      <article><span>Final position</span><strong>${team?.finalConstructorPosition ? `P${team.finalConstructorPosition}` : "—"}</strong></article>
      <article><span>Final points</span><strong>${team?.finalConstructorPoints ?? "—"}</strong></article>
      <article><span>Board confidence</span><strong>${board?.confidence ?? "—"}</strong>${badge(board?.status)}</article>
      <article><span>Target season</span><strong>${cycle.targetSeason}</strong></article>
    </section>

    <section class="panel">
      <div class="section-head"><div><div class="eyebrow">Season review</div><h2>${cycle.closingSeason} Championship</h2></div><span>${review.racesCompleted ?? 0}/${review.expectedRounds ?? "—"} races</span></div>
      <div class="review-grid">
        <div><p class="muted">Driver champion</p><strong>${escapeHtml(review.driverChampionId ?? review.driverChampionStatus ?? "Unresolved")}</strong></div>
        <div><p class="muted">Constructor champion</p><strong>${escapeHtml(review.constructorChampionId ?? review.constructorChampionStatus ?? "Unresolved")}</strong></div>
      </div>
      ${standings(review.constructorStandings, state.controlledTeamId)}
    </section>

    <section class="panel">
      <div class="section-head"><div><div class="eyebrow">Preparation checklist</div><h2>${cycle.targetSeason} Readiness</h2></div><span>Live Save World status</span></div>
      <div class="check-grid">
        ${checklistCard("Driver & Staff Contracts", prep.contracts, `${drivers.expiring?.length ?? 0} driver contract(s) and ${staff.expiring?.length ?? 0} staff contract(s) need action.`)}
        ${checklistCard("Engine Supplier", supplier, supplier.activeEngineId ? `Current engine ${supplier.activeEngineId}; contract end ${supplier.activeEndSeason ?? "unknown"}.` : "No active engine supplier contract is projected for the target season.")}
        ${checklistCard("Sponsors", commercial, `${commercial.dealsCoveringTargetSeason ?? 0} active deal(s) cover ${cycle.targetSeason}; current monthly income ${money(commercial.monthlySponsorIncome)}.`)}
        ${checklistCard("Governance & Grid", governance, `${governance.openTargetSeasonProposals ?? 0} regulation proposal(s) and ${governance.targetSeasonEntryApplications ?? 0} team application(s) affect the target season.`)}
        ${checklistCard("Next-Season Car", car, `${car.completedTargetSeasonSpecs ?? 0} completed target-season specification(s); ${car.activeTargetSeasonDesigns ?? 0} active design(s).`)}
        ${checklistCard("Preseason Testing", preseason, `${preseason.sessionsCompleted ?? 0}/${preseason.maxSessions ?? 3} test sessions completed. Reliability preparation ${preseason.reliabilityPrep ?? 0}.`)}
      </div>
    </section>

    <section class="panel">
      <div class="section-head"><div><div class="eyebrow">Strategy</div><h2>${cycle.targetSeason} Team Plan</h2></div>${plan.confirmed ? badge("ready") : badge("pending")}</div>
      <form id="plan-form" class="plan-grid">
        <label>Technical focus<select name="technicalFocus"><option value="balanced">Balanced</option><option value="performance">Performance</option><option value="reliability">Reliability</option></select></label>
        <label>Staffing approach<select name="staffingFocus"><option value="retain">Retain</option><option value="selective">Selective changes</option><option value="rebuild">Rebuild</option></select></label>
        <label>Commercial approach<select name="commercialFocus"><option value="retain">Retain partners</option><option value="expand">Expand</option></select></label>
        <label>Financial risk<select name="financialRisk"><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></label>
        <div class="plan-actions"><button type="submit">Save plan</button><button type="button" id="confirm-plan" class="secondary">Confirm plan</button></div>
      </form>
      <p class="muted">Confirmed plans influence existing systems; they do not create a separate budget or duplicate contracts/supplier/commercial authority.</p>
    </section>

    <section class="panel">
      <div class="section-head"><div><div class="eyebrow">Board</div><h2>${cycle.targetSeason} Objectives</h2></div></div>
      <div class="objective-list">${(board.objectives ?? []).map((objective) => `<div class="objective"><div><strong>${escapeHtml(objective.label)}</strong><p>${escapeHtml(objective.targetText)}</p></div>${badge(objective.status)}</div>`).join("") || '<p class="muted">Objectives will be renewed at season start.</p>'}</div>
    </section>`;

  for (const [name, value] of Object.entries({ technicalFocus: plan.technicalFocus, staffingFocus: plan.staffingFocus, commercialFocus: plan.commercialFocus, financialRisk: plan.financialRisk })) {
    const input = document.querySelector(`[name="${name}"]`);
    if (input && value) input.value = value;
  }

  document.querySelector("#plan-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await act(() => api("/api/offseason/plan", { method: "POST", body: JSON.stringify(data) }));
  });
  document.querySelector("#confirm-plan")?.addEventListener("click", () => act(() => api("/api/offseason/confirm", { method: "POST", body: "{}" })));
  document.querySelector("#continue-button")?.addEventListener("click", () => act(() => api("/api/continue", { method: "POST", body: "{}" }), true));
}

async function act(action, continueAction = false) {
  try {
    await action();
    await load();
    if (continueAction && state?.offseason?.current?.stage === "preseason") {
      document.querySelector(".hero")?.scrollIntoView({ behavior: "smooth" });
    }
  } catch (error) {
    alert(error.message);
  }
}

async function load() {
  career = await api("/api/state");
  if (career.screen === "new_career") {
    state = null;
    render();
    return;
  }
  state = await api("/api/offseason");
  render();
}

load().catch((error) => { root.innerHTML = `<section class="empty"><h2>Unable to load</h2><p>${escapeHtml(error.message)}</p></section>`; });
