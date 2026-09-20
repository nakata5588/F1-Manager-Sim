const root = document.querySelector("#technical-app");
let technical = null;
let career = null;
let busy = false;
let errorMessage = "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json; charset=utf-8", ...(options.headers ?? {}) },
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

function label(value) {
  return String(value ?? "").replace(/_spec$/, "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(number) : "—";
}

function post(path, payload) {
  return api(path, { method: "POST", body: JSON.stringify(payload) });
}

async function refresh() {
  [career, technical] = await Promise.all([api("/api/state"), api("/api/technical")]);
  render();
}

function specById(id) {
  return technical?.team?.specifications?.find((row) => row.specId === id) ?? null;
}

function renderCar(slot, title) {
  const ids = technical.team?.car?.fittedCars?.[slot]?.components ?? {};
  const condition = technical.reliability?.cars?.[slot]?.condition?.overall;
  const rows = Object.entries(ids).map(([component, id]) => {
    const spec = specById(id);
    return `<div class="component-row"><span>${escapeHtml(label(component))}</span><strong>${spec ? Number(spec.rating).toFixed(1) : "Base"}</strong></div>`;
  }).join("");
  return `<div class="car-box"><h3>${escapeHtml(title)}</h3>${Number.isFinite(Number(condition)) ? `<div class="technical-muted">Overall condition ${Number(condition).toFixed(1)}</div>` : ""}${rows || '<div class="technical-muted">No fitted component data.</div>'}</div>`;
}


function pct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "—";
}

function renderTechnicalIdentity() {
  const data = technical.team?.evolution;
  if (!data) return "";
  const regulation = data.regulationContext ?? {};
  const strengths = (data.strengths ?? []).map((row) => row.label).join(" · ") || "No dominant discipline";
  const developing = (data.developing ?? []).map((row) => row.label).join(" · ") || "No clear weak familiarity";
  const lastTransition = data.recentTransitions?.at?.(-1) ?? (data.recentTransitions ?? [])[data.recentTransitions?.length - 1];

  return `<section class="technical-card wide technical-identity">
    <div class="technical-identity-head"><div><span class="management-category">Team evolution</span><h2>Technical Identity & Evolution</h2><p>Persistent know-how built from the opening car and the development choices made during this career.</p></div><div class="technical-concept"><span>Current concept</span><strong>${escapeHtml(label(data.concept))}</strong><small>${escapeHtml(label(data.currentSeasonFocus))} season focus</small></div></div>
    <div class="technical-identity-summary"><article><span>Established strengths</span><strong>${escapeHtml(strengths)}</strong></article><article><span>Developing areas</span><strong>${escapeHtml(developing)}</strong></article><article><span>Completed projects</span><strong>${data.totalCompletedProjects ?? 0}</strong></article></div>
    <div class="technical-discipline-grid">${(data.disciplines ?? []).map((row) => `<article class="technical-discipline ${escapeHtml(row.status)}"><div><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(label(row.status))}</span></div><div class="technical-experience"><b>${row.experienceIndex}</b><small>familiarity</small></div><div class="technical-progress"><i style="width:${Math.max(0, Math.min(100, (Number(row.experienceIndex) - 85) / 30 * 100))}%"></i></div><small>${row.completedProjects} completed project${row.completedProjects === 1 ? "" : "s"}</small></article>`).join("")}</div>
    <div class="technical-regulation-strip"><span><b>${pct(regulation.carryoverRetention)}</b> technical carry-over</span><span><b>${pct(regulation.developmentEfficiencyModifier)}</b> development efficiency</span><span><b>${pct(regulation.manufacturingCostModifier)}</b> manufacturing cost</span>${lastTransition ? `<span><b>${lastTransition.season}</b> last identity transition</span>` : ""}</div>
    <div class="technical-muted">Identity familiarity is gameplay know-how, not a single team rating. Staff, facilities, driver feedback, supplier performance and component specifications remain separate systems.</div>
  </section>`;
}

function renderSupplier() {
  const data = technical.supplier;
  if (!data) return "";
  const active = data.active;
  const future = data.futureDeal;
  const open = (data.negotiations ?? []).findLast?.((row) => ["open", "countered"].includes(row.status))
    ?? [...(data.negotiations ?? [])].reverse().find((row) => ["open", "countered"].includes(row.status));
  const activeValue = active?.annualValueMode === "currency" ? money(active.annualValue) : "Value not source-locked";
  const current = active ? `<div class="technical-kpi"><strong>${escapeHtml(active.engineName)}</strong><span>${escapeHtml(active.manufacturer)} · through ${active.endSeason} · ${escapeHtml(activeValue)}</span></div>` : '<div class="technical-muted">No active supplier assignment.</div>';
  const futureDeal = future ? `<div class="technical-alert"><strong>Future deal:</strong> ${escapeHtml(future.engineName)} from ${future.effectiveSeason} through ${future.endSeason} · ${money(future.annualValue)} / season.</div>` : "";

  let negotiation = "";
  if (open) {
    const counter = open.status === "countered" && open.counter
      ? `<div class="technical-alert"><strong>Counter-offer:</strong> ${money(open.counter.annualValue)} / season for ${open.counter.durationYears} year(s). <button data-supplier-counter="${escapeHtml(open.negotiationId)}">Accept Counter</button></div>`
      : "";
    negotiation = `<div class="facility-card"><strong>Negotiation: ${escapeHtml(open.engineName)}</strong><div class="technical-muted">Effective ${open.effectiveSeason} · expected ${money(open.expectedTerms?.annualValue)} / season</div>${counter}
      ${open.status === "open" ? `<form id="supplier-offer-form" class="technical-form" data-negotiation="${escapeHtml(open.negotiationId)}"><label>Annual value<input name="annualValue" type="number" min="0" value="${Number(open.expectedTerms?.annualValue ?? 0)}"></label><label>Years<input name="durationYears" type="number" min="1" max="4" value="${Number(open.expectedTerms?.durationYears ?? 2)}"></label><button class="primary" type="submit">Submit Offer</button></form>` : ""}
      <button data-supplier-withdraw="${escapeHtml(open.negotiationId)}">Withdraw</button></div>`;
  }

  const market = technical.responsibility === "manager" && !future && !open
    ? `<table class="technical-table"><thead><tr><th>Supplier</th><th>Power</th><th>Reliability</th><th>Interest</th><th>Expected</th><th></th></tr></thead><tbody>${(data.market ?? []).map((row) => `<tr><td><strong>${escapeHtml(row.engineName)}</strong><div class="technical-muted">${escapeHtml(row.manufacturer)}</div></td><td>${Number(row.power).toFixed(1)}</td><td>${Number(row.reliability).toFixed(1)}</td><td>${escapeHtml(label(row.interest?.level))}</td><td>${money(row.expectedTerms?.annualValue)}</td><td>${row.current ? '<span class="technical-muted">Current</span>' : `<button data-supplier-open="${escapeHtml(row.engineId)}">Negotiate</button>`}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<section class="technical-card wide"><span class="management-category">Power unit</span><h2>Engine Supplier</h2>${current}${futureDeal}${negotiation}${market}</section>`;
}

function renderReliabilityCar(slot, title) {
  const car = technical.reliability?.cars?.[slot];
  if (!car) return "";
  const canAct = technical.responsibility === "manager";
  const engine = car.engine ?? {};
  const engineAction = canAct && Number(engine.condition ?? 100) < 95
    ? `<button data-engine-service="${slot}">Service / Rebuild</button>` : "";
  const rows = Object.entries(car.components ?? {}).map(([component, unit]) => {
    const condition = Number(unit.condition ?? 100);
    const status = unit.failed ? "Failed" : condition < 45 ? "Critical" : condition < 65 ? "Worn" : "Serviceable";
    const actions = canAct && condition < 95
      ? `<div class="technical-actions">${Number(unit.inventoryAvailable ?? 0) > 0 ? `<button data-replace-component="${escapeHtml(component)}" data-car="${slot}">Replace from Stock</button>` : ""}<button data-rebuild-component="${escapeHtml(component)}" data-car="${slot}">Rebuild</button></div>`
      : "";
    return `<tr><td><strong>${escapeHtml(label(component))}</strong></td><td>${condition.toFixed(1)}</td><td>${escapeHtml(status)}</td><td>${unit.inventoryAvailable ?? 0}</td><td>${actions}</td></tr>`;
  }).join("");
  return `<article class="technical-card wide"><span class="management-category">${escapeHtml(title)}</span><h2>Condition ${Number(car.condition?.overall ?? 100).toFixed(1)}</h2><div class="technical-kpi"><strong>${Number(engine.condition ?? 100).toFixed(1)}</strong><span>Engine condition · ${engine.racesUsed ?? 0} race(s) used ${engine.failed ? "· FAILED" : ""}</span>${engineAction}</div><table class="technical-table"><thead><tr><th>Component</th><th>Condition</th><th>Status</th><th>Matching stock</th><th>Maintenance</th></tr></thead><tbody>${rows}</tbody></table></article>`;
}

function renderReliability() {
  if (!technical.reliability) return "";
  return `${renderReliabilityCar("car1", "Car 1 Reliability")}${renderReliabilityCar("car2", "Car 2 Reliability")}`;
}

function renderPreseason() {
  const data = technical.preseason;
  if (!data) return "";
  const controls = technical.responsibility === "manager" && data.windowOpen && data.sessionsCompleted < data.maxSessions
    ? `<form id="preseason-form" class="technical-form"><label>Test focus<select name="focus"><option value="balanced">Balanced</option><option value="reliability">Reliability</option><option value="development">Development</option></select></label><button class="primary" type="submit">Run Test Session</button></form>`
    : "";
  return `<section class="technical-card wide"><span class="management-category">Preseason</span><h2>Testing Programme</h2><div class="technical-kpis"><div class="technical-kpi"><strong>${data.sessionsCompleted}/${data.maxSessions}</strong><span>Sessions used</span></div><div class="technical-kpi"><strong>${Number(data.developmentKnowledge ?? 0).toFixed(1)}</strong><span>Development knowledge</span></div><div class="technical-kpi"><strong>${Number(data.reliabilityPrep ?? 0).toFixed(1)}</strong><span>Reliability preparation</span></div><div class="technical-kpi"><strong>${Number(data.setupKnowledge ?? 0).toFixed(1)}</strong><span>Setup knowledge</span></div></div><div class="technical-muted">${data.windowOpen ? `Testing window open${data.firstRaceDate ? ` until the first race on ${escapeHtml(data.firstRaceDate)}` : ""}.` : "Preseason testing is closed for this season."}</div>${controls}</section>`;
}

function renderDesign() {
  const data = technical.team?.design;
  if (!data) return "";
  const active = data.active ?? [];
  const controls = technical.responsibility === "manager" && !active.length
    ? `<form id="design-form" class="technical-form">
        <label>Component<select name="component">${data.availableComponents.map((row) => `<option value="${escapeHtml(row)}">${escapeHtml(label(row))}</option>`).join("")}</select></label>
        <label>Focus<select name="focus"><option value="balanced">Balanced</option><option value="performance">Performance</option><option value="reliability">Reliability</option></select></label>
        <label>Programme<select name="targetSeason"><option value="current">Current season</option><option value="next">Next season research</option></select></label>
        <button class="primary" type="submit" ${busy ? "disabled" : ""}>Start Design</button>
      </form>`
    : "";
  const activeRows = active.length ? `<table class="technical-table"><thead><tr><th>Component</th><th>Discipline</th><th>Focus</th><th>Development</th><th>Target</th><th>Remaining</th><th>Cost</th></tr></thead><tbody>${active.map((row) => `<tr><td><strong>${escapeHtml(label(row.component))}</strong></td><td>${escapeHtml(label(row.technicalDiscipline ?? "general"))}</td><td>${escapeHtml(label(row.focus))}</td><td>${Number.isFinite(Number(row.developmentModifier)) ? pct(row.developmentModifier) : "—"}<div class="technical-muted">identity × regulations</div></td><td>${row.targetSeason}</td><td>${row.monthsRemaining} month(s)</td><td>${money(row.cost)}</td></tr>`).join("")}</tbody></table>` : '<div class="technical-muted">No active design programme.</div>';
  return `<section class="technical-card wide"><span class="management-category">R&D</span><h2>Design Programmes</h2>${activeRows}${controls}</section>`;
}

function renderSpecifications() {
  const rows = technical.team?.specifications ?? [];
  return `<section class="technical-card wide"><span class="management-category">Parts lifecycle</span><h2>Specifications & Stock</h2>
    ${rows.length ? `<table class="technical-table"><thead><tr><th>Component</th><th>Rating</th><th>Reliability</th><th>Status</th><th>Season</th><th>Stock</th><th>Operations</th></tr></thead><tbody>${rows.map((row) => {
      const canManufacture = technical.responsibility === "manager" && row.status === "ready_for_manufacture";
      const canFit = technical.responsibility === "manager" && Number(row.inventory) > 0;
      return `<tr><td><strong>${escapeHtml(label(row.component))}</strong><div class="technical-muted">${escapeHtml(row.source)}</div></td><td>${Number(row.rating).toFixed(1)}${Number(row.gain) ? ` <span class="technical-muted">(+${Number(row.gain).toFixed(1)})</span>` : ""}</td><td>${Number.isFinite(Number(row.reliabilityRating)) ? Number(row.reliabilityRating).toFixed(1) : "—"}</td><td>${escapeHtml(label(row.status))}</td><td>${row.targetSeason}</td><td>${row.inventory ?? 0}</td><td><div class="technical-actions">${canManufacture ? `<button data-manufacture="${escapeHtml(row.specId)}">Manufacture x2</button>` : ""}${canFit ? `<button data-fit="${escapeHtml(row.specId)}" data-car="car1">Fit Car 1</button><button data-fit="${escapeHtml(row.specId)}" data-car="car2">Fit Car 2</button>` : ""}</div></td></tr>`;
    }).join("")}</tbody></table>` : '<div class="technical-muted">No technical specifications available.</div>'}
  </section>`;
}

function renderManufacturing() {
  const data = technical.team?.manufacturing;
  if (!data) return "";
  return `<section class="technical-card"><span class="management-category">Factory</span><h2>Manufacturing</h2><div class="technical-kpi"><strong>${data.active.length}/${data.capacity}</strong><span>Active jobs / capacity</span></div>${data.active.length ? `<table class="technical-table"><thead><tr><th>Part</th><th>Qty</th><th>Remaining</th></tr></thead><tbody>${data.active.map((job) => `<tr><td>${escapeHtml(label(job.component))}</td><td>${job.quantity}</td><td>${job.monthsRemaining} month(s)</td></tr>`).join("")}</tbody></table>` : '<div class="technical-muted">Factory capacity is currently free.</div>'}</section>`;
}

function renderFacilities() {
  const rows = technical.team?.facilities ?? [];
  return `<section class="technical-card wide"><span class="management-category">Infrastructure</span><h2>Facilities</h2><div class="facility-grid">${rows.map((row) => {
    const status = row.availabilityStatus ?? (Number(row.level) > 0 ? "operational" : "available_unbuilt");
    const locked = status === "unavailable_future_technology";
    const levelText = locked ? "Future technology" : Number(row.level) > 0 ? `Level ${Number(row.level).toFixed(1)}` : "Not built";
    const availabilityText = locked
      ? row.unlockSeason ? `Available from ${row.unlockSeason}` : "Not available in this era"
      : status === "upgrading" ? "Upgrade in progress" : label(status);
    const action = row.upgrade
      ? `<div class="technical-muted">Upgrade to ${row.upgrade.toLevel} · ${row.upgrade.monthsRemaining} month(s)</div>`
      : technical.responsibility === "manager" && !locked && Number(row.level ?? 0) < 10
        ? `<button data-facility="${escapeHtml(row.id)}" ${busy ? "disabled" : ""}>${Number(row.level ?? 0) > 0 ? "Upgrade" : "Build"}</button>`
        : "";
    return `<article class="facility-card"><strong>${escapeHtml(row.label)}</strong><div>${escapeHtml(levelText)}</div><div class="technical-muted">${escapeHtml(availabilityText)}</div><div class="technical-muted">${escapeHtml(row.source)}</div>${action}</article>`;
  }).join("") || '<div class="technical-muted">No facilities recorded for this team.</div>'}</div></section>`;
}

function render() {
  if (!technical) return;
  if (career?.screen === "new_career") {
    root.innerHTML = '<div class="technical-shell"><div class="technical-alert">Start a career before opening Technical Operations.</div><a href="/">Return to Career</a></div>';
    return;
  }
  if (!technical.team) {
    root.innerHTML = '<div class="technical-shell"><div class="technical-alert">You are currently unemployed. Technical Operations become available when you manage a team.</div><div class="technical-nav"><a href="/management.html">Management Hub</a><a href="/">Career</a></div></div>';
    return;
  }
  const summary = technical.summary ?? {};
  root.className = "";
  root.innerHTML = `<main class="technical-shell">
    <header class="technical-topbar"><div><span class="management-category">Car & Development</span><h1>Technical Operations</h1><div class="technical-muted">Supplier → Test → Design → Manufacture → Maintain → Race</div></div><nav class="technical-nav"><a href="/management.html">Management Hub</a><a href="/">Career</a></nav></header>
    ${errorMessage ? `<div class="technical-error">${escapeHtml(errorMessage)}</div>` : ""}
    ${technical.responsibility !== "manager" ? '<div class="technical-alert"><strong>Car Development is delegated.</strong> The technical department uses the same supplier, testing, design, manufacturing, maintenance and fitment rules as AI teams. Return the responsibility to Manager in the Management Hub to issue direct orders.</div>' : ""}
    <div class="technical-kpis"><div class="technical-kpi"><strong>${summary.activeDesigns ?? 0}</strong><span>Active designs</span></div><div class="technical-kpi"><strong>${summary.manufacturingJobs ?? 0}</strong><span>Factory jobs</span></div><div class="technical-kpi"><strong>${summary.readySpecs ?? 0}</strong><span>Specs ready</span></div><div class="technical-kpi"><strong>${summary.facilityUpgrades ?? 0}</strong><span>Facility projects</span></div></div>
    <div class="technical-grid">
      ${renderTechnicalIdentity()}
      ${renderSupplier()}
      ${renderPreseason()}
      <section class="technical-card"><span class="management-category">Race cars</span><h2>Fitted Specifications</h2><div class="car-pair">${renderCar("car1", "Car 1")}${renderCar("car2", "Car 2")}</div></section>
      ${renderManufacturing()}
      ${renderReliability()}
      ${renderDesign()}
      ${renderSpecifications()}
      ${renderFacilities()}
    </div>
  </main>`;
  bind();
}

async function action(work) {
  if (busy) return;
  busy = true;
  errorMessage = "";
  render();
  try { await work(); await refresh(); }
  catch (error) { errorMessage = error.message; }
  finally { busy = false; render(); }
}

function bind() {
  document.querySelector("#design-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    action(() => post("/api/technical/design", { component: data.get("component"), focus: data.get("focus"), targetSeason: data.get("targetSeason") }));
  });
  document.querySelector("#preseason-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    action(() => post("/api/technical/preseason-test", { focus: data.get("focus") }));
  });
  document.querySelector("#supplier-offer-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    action(() => post("/api/technical/supplier/offer", { negotiationId: event.currentTarget.dataset.negotiation, annualValue: Number(data.get("annualValue")), durationYears: Number(data.get("durationYears")) }));
  });
  document.querySelectorAll("[data-supplier-open]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/supplier/open", { engineId: button.dataset.supplierOpen }))));
  document.querySelectorAll("[data-supplier-counter]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/supplier/counter", { negotiationId: button.dataset.supplierCounter }))));
  document.querySelectorAll("[data-supplier-withdraw]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/supplier/withdraw", { negotiationId: button.dataset.supplierWithdraw }))));
  document.querySelectorAll("[data-manufacture]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/manufacture", { specId: button.dataset.manufacture, quantity: 2 }))));
  document.querySelectorAll("[data-fit]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/fit", { specId: button.dataset.fit, carSlot: button.dataset.car }))));
  document.querySelectorAll("[data-facility]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/facility", { facilityId: button.dataset.facility }))));
  document.querySelectorAll("[data-replace-component]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/reliability/replace", { carSlot: button.dataset.car, component: button.dataset.replaceComponent }))));
  document.querySelectorAll("[data-rebuild-component]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/reliability/rebuild", { carSlot: button.dataset.car, component: button.dataset.rebuildComponent }))));
  document.querySelectorAll("[data-engine-service]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/reliability/engine", { carSlot: button.dataset.engineService }))));
}

refresh().catch((error) => {
  root.innerHTML = `<div class="technical-shell"><div class="technical-error">${escapeHtml(error.message)}</div><a href="/">Return to Career</a></div>`;
});
