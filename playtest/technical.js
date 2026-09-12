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
  const rows = Object.entries(ids).map(([component, id]) => {
    const spec = specById(id);
    return `<div class="component-row"><span>${escapeHtml(label(component))}</span><strong>${spec ? Number(spec.rating).toFixed(1) : "Base"}</strong></div>`;
  }).join("");
  return `<div class="car-box"><h3>${escapeHtml(title)}</h3>${rows || '<div class="technical-muted">No fitted component data.</div>'}</div>`;
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
  const activeRows = active.length ? `<table class="technical-table"><thead><tr><th>Component</th><th>Focus</th><th>Target</th><th>Remaining</th><th>Cost</th></tr></thead><tbody>${active.map((row) => `<tr><td><strong>${escapeHtml(label(row.component))}</strong></td><td>${escapeHtml(label(row.focus))}</td><td>${row.targetSeason}</td><td>${row.monthsRemaining} month(s)</td><td>${money(row.cost)}</td></tr>`).join("")}</tbody></table>` : '<div class="technical-muted">No active design programme.</div>';
  return `<section class="technical-card wide"><span class="management-category">R&D</span><h2>Design Programmes</h2>${activeRows}${controls}</section>`;
}

function renderSpecifications() {
  const rows = technical.team?.specifications ?? [];
  return `<section class="technical-card wide"><span class="management-category">Parts lifecycle</span><h2>Specifications & Stock</h2>
    ${rows.length ? `<table class="technical-table"><thead><tr><th>Component</th><th>Rating</th><th>Status</th><th>Season</th><th>Stock</th><th>Operations</th></tr></thead><tbody>${rows.map((row) => {
      const canManufacture = technical.responsibility === "manager" && row.status === "ready_for_manufacture";
      const canFit = technical.responsibility === "manager" && Number(row.inventory) > 0;
      return `<tr><td><strong>${escapeHtml(label(row.component))}</strong><div class="technical-muted">${escapeHtml(row.source)}</div></td><td>${Number(row.rating).toFixed(1)}${Number(row.gain) ? ` <span class="technical-muted">(+${Number(row.gain).toFixed(1)})</span>` : ""}</td><td>${escapeHtml(label(row.status))}</td><td>${row.targetSeason}</td><td>${row.inventory ?? 0}</td><td><div class="technical-actions">${canManufacture ? `<button data-manufacture="${escapeHtml(row.specId)}">Manufacture x2</button>` : ""}${canFit ? `<button data-fit="${escapeHtml(row.specId)}" data-car="car1">Fit Car 1</button><button data-fit="${escapeHtml(row.specId)}" data-car="car2">Fit Car 2</button>` : ""}</div></td></tr>`;
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
  return `<section class="technical-card wide"><span class="management-category">Infrastructure</span><h2>Facilities</h2><div class="facility-grid">${rows.map((row) => `<article class="facility-card"><strong>${escapeHtml(row.label)}</strong><div>Level ${Number(row.level).toFixed(1)}</div><div class="technical-muted">${escapeHtml(row.source)}</div>${row.upgrade ? `<div class="technical-muted">Upgrade to ${row.upgrade.toLevel} · ${row.upgrade.monthsRemaining} month(s)</div>` : technical.responsibility === "manager" && Number(row.level) < 10 ? `<button data-facility="${escapeHtml(row.id)}" ${busy ? "disabled" : ""}>Upgrade</button>` : ""}</article>`).join("") || '<div class="technical-muted">No facilities recorded for this team.</div>'}</div></section>`;
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
    <header class="technical-topbar"><div><span class="management-category">Phase 36</span><h1>Technical Operations</h1><div class="technical-muted">Design → Manufacture → Stock → Fit → Race</div></div><nav class="technical-nav"><a href="/management.html">Management Hub</a><a href="/">Career</a></nav></header>
    ${errorMessage ? `<div class="technical-error">${escapeHtml(errorMessage)}</div>` : ""}
    ${technical.responsibility !== "manager" ? '<div class="technical-alert"><strong>Car Development is delegated.</strong> The technical department is using the same design, manufacturing and fitting rules as AI teams. Return the responsibility to Manager in the Management Hub to issue direct orders.</div>' : ""}
    <div class="technical-kpis"><div class="technical-kpi"><strong>${summary.activeDesigns ?? 0}</strong><span>Active designs</span></div><div class="technical-kpi"><strong>${summary.manufacturingJobs ?? 0}</strong><span>Factory jobs</span></div><div class="technical-kpi"><strong>${summary.readySpecs ?? 0}</strong><span>Specs ready</span></div><div class="technical-kpi"><strong>${summary.facilityUpgrades ?? 0}</strong><span>Facility projects</span></div></div>
    <div class="technical-grid">
      <section class="technical-card"><span class="management-category">Race cars</span><h2>Fitted Specifications</h2><div class="car-pair">${renderCar("car1", "Car 1")}${renderCar("car2", "Car 2")}</div></section>
      ${renderManufacturing()}
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
  document.querySelectorAll("[data-manufacture]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/manufacture", { specId: button.dataset.manufacture, quantity: 2 }))));
  document.querySelectorAll("[data-fit]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/fit", { specId: button.dataset.fit, carSlot: button.dataset.car }))));
  document.querySelectorAll("[data-facility]").forEach((button) => button.addEventListener("click", () => action(() => post("/api/technical/facility", { facilityId: button.dataset.facility }))));
}

refresh().catch((error) => {
  root.innerHTML = `<div class="technical-shell"><div class="technical-error">${escapeHtml(error.message)}</div><a href="/">Return to Career</a></div>`;
});
