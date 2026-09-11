const root = document.querySelector("#management-app");

let careerState = null;
let overview = null;
let inbox = { summary: {}, items: [] };
let recruitment = { summary: {}, candidates: [] };
let contracts = { summary: {}, negotiations: [] };
let activeTab = "inbox";
let selectedNegotiation = null;
let errorMessage = "";
let busy = false;

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

function rangeText(range) {
  if (!range) return "Unknown";
  return range.low === range.high ? String(range.low) : `${range.low}–${range.high}`;
}

function humanDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

async function refreshAll() {
  careerState = await api("/api/state");
  if (careerState.screen === "new_career") {
    render();
    return;
  }
  [overview, inbox, recruitment, contracts] = await Promise.all([
    api("/api/management"),
    api("/api/inbox"),
    api("/api/recruitment"),
    api("/api/contracts"),
  ]);
  const stillSelected = contracts.negotiations.find((row) => row.id === selectedNegotiation?.id);
  if (stillSelected) selectedNegotiation = stillSelected;
  render();
}

function tabs() {
  const rows = [
    ["inbox", `Inbox ${overview?.inbox?.unread ? `(${overview.inbox.unread})` : ""}`],
    ["recruitment", "Recruitment"],
    ["contracts", `Contracts ${overview?.contracts?.active ? `(${overview.contracts.active})` : ""}`],
  ];
  return `<div class="management-tabs">${rows.map(([id, label]) => `
    <button class="management-tab ${activeTab === id ? "active" : ""}" data-tab="${id}">${escapeHtml(label)}</button>
  `).join("")}</div>`;
}

function renderInbox() {
  if (!inbox.items.length) return '<div class="management-empty">No messages.</div>';
  return `<div class="management-stack">${inbox.items.map((item) => `
    <article class="management-message ${item.unread ? "unread" : ""}">
      <div class="management-message-head">
        <div><span class="management-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3></div>
        <span class="muted">${humanDate(item.date)}</span>
      </div>
      <p>${escapeHtml(item.body)}</p>
      ${item.decision?.status === "pending" ? `<div class="management-actions">${item.decision.options.map((option) => `
        <button data-decision-item="${escapeHtml(item.id)}" data-decision-option="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>
      `).join("")}</div>` : ""}
      <div class="management-actions subtle">
        ${item.unread ? `<button data-read-item="${escapeHtml(item.id)}">Mark read</button>` : ""}
        <button data-archive-item="${escapeHtml(item.id)}">Archive</button>
      </div>
    </article>
  `).join("")}</div>`;
}

function candidateReport(row) {
  if (!row.report) return '<span class="muted">No scouting report</span>';
  return `<span>CA ${rangeText(row.report.currentAbility)} · PA ${rangeText(row.report.potentialAbility)}</span>`;
}

function renderRecruitment() {
  return `<div class="management-toolbar">
    <input id="recruitment-query" placeholder="Search drivers" value="">
    <button data-action="search-recruitment">Search</button>
    <button data-action="show-shortlist">Shortlist</button>
    <button data-action="show-all-recruitment">All</button>
  </div>
  <div class="management-table-wrap"><table>
    <thead><tr><th>Driver</th><th>Age</th><th>Team</th><th>Contract</th><th>Knowledge</th><th>Report</th><th></th></tr></thead>
    <tbody>${recruitment.candidates.map((row) => `<tr>
      <td><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")} · ${escapeHtml(row.visibilityState ?? "")}</div></td>
      <td>${row.age ?? "—"}</td>
      <td>${escapeHtml(row.currentTeamId ?? "Free agent")}</td>
      <td>${row.contractUntil ?? "—"}</td>
      <td><strong>${Math.round(row.knowledge)}%</strong></td>
      <td>${candidateReport(row)}</td>
      <td><div class="management-actions compact">
        <button data-shortlist-driver="${escapeHtml(row.id)}" data-shortlisted="${row.shortlisted ? "true" : "false"}">${row.shortlisted ? "Remove" : "Shortlist"}</button>
        <button data-scout-driver="${escapeHtml(row.id)}">Scout</button>
        ${row.visibilityState === "f1_eligible" ? `<button class="primary" data-negotiate-driver="${escapeHtml(row.id)}">Negotiate</button>` : ""}
      </div></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function compensationFields(negotiation) {
  const expected = negotiation.expectedTerms;
  if (expected.compensationMode === "currency") {
    return `<label>Annual salary<input id="offer-salary" type="number" min="1" value="${expected.annualSalary}"></label>
      <label>Signing bonus<input id="offer-bonus" type="number" min="0" value="${expected.signingBonus ?? 0}"></label>`;
  }
  return `<label>Compensation index<input id="offer-index" type="number" min="1" max="120" value="${expected.salaryIndex}"></label>`;
}

function negotiationEditor() {
  if (!selectedNegotiation || !["open", "countered"].includes(selectedNegotiation.status)) return "";
  const terms = selectedNegotiation.status === "countered" && selectedNegotiation.counterTerms
    ? selectedNegotiation.counterTerms
    : selectedNegotiation.expectedTerms;
  return `<article class="management-contract-editor">
    <div class="eyebrow">Negotiation</div>
    <h2>${escapeHtml(selectedNegotiation.driverName)}</h2>
    <p class="muted">Start season ${selectedNegotiation.startSeason} · expires ${humanDate(selectedNegotiation.expiresAt)}</p>
    ${selectedNegotiation.status === "countered" ? '<div class="management-notice">A counter-offer is waiting in your Inbox.</div>' : `
      <div class="management-form-grid">
        ${compensationFields({ ...selectedNegotiation, expectedTerms: terms })}
        <label>Contract length<input id="offer-length" type="number" min="1" max="5" value="${terms.lengthYears}"></label>
        <label>Role<input id="offer-role" value="${escapeHtml(terms.role)}"></label>
      </div>
      <div class="management-actions"><button class="primary" data-submit-offer="${escapeHtml(selectedNegotiation.id)}">Submit offer</button><button data-withdraw-negotiation="${escapeHtml(selectedNegotiation.id)}">Withdraw</button></div>
    `}
  </article>`;
}

function renderContracts() {
  return `${negotiationEditor()}<div class="management-table-wrap"><table>
    <thead><tr><th>Driver</th><th>Status</th><th>Start</th><th>Offers</th><th>Terms mode</th></tr></thead>
    <tbody>${contracts.negotiations.map((row) => `<tr data-contract-row="${escapeHtml(row.id)}" class="${selectedNegotiation?.id === row.id ? "selected-row" : ""}">
      <td><strong>${escapeHtml(row.driverName)}</strong></td><td>${escapeHtml(row.status)}</td><td>${row.startSeason}</td><td>${row.offers.length}</td><td>${escapeHtml(row.expectedTerms.compensationMode)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function render() {
  if (!careerState) return;
  if (careerState.screen === "new_career") {
    root.innerHTML = `<main class="management-standalone"><div class="card"><h1>Management Hub</h1><p>Start a career first.</p><a class="management-link-button" href="/">Back to New Career</a></div></main>`;
    return;
  }
  const content = activeTab === "recruitment" ? renderRecruitment() : activeTab === "contracts" ? renderContracts() : renderInbox();
  root.innerHTML = `<div class="management-shell ${busy ? "loading" : ""}">
    <header class="management-header">
      <div><div class="eyebrow">Phase 32 · Management Core</div><h1>${escapeHtml(careerState.career.teamName)}</h1><p>${escapeHtml(careerState.career.managerName)} · ${humanDate(careerState.career.date)}</p></div>
      <a class="management-link-button" href="/">← Career</a>
    </header>
    <section class="management-kpis">
      <div><span>Unread</span><strong>${overview?.inbox?.unread ?? 0}</strong></div>
      <div><span>Shortlist</span><strong>${overview?.scouting?.shortlist ?? 0}</strong></div>
      <div><span>Scouting</span><strong>${overview?.scouting?.activeAssignments ?? 0}</strong></div>
      <div><span>Negotiations</span><strong>${overview?.contracts?.active ?? 0}</strong></div>
    </section>
    ${tabs()}
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
    <main class="management-content">${content}</main>
  </div>`;
}

async function action(fn) {
  busy = true;
  errorMessage = "";
  render();
  try { await fn(); }
  catch (error) { errorMessage = error.message; }
  finally { busy = false; await refreshAll().catch((error) => { errorMessage = error.message; render(); }); }
}

root.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]")?.dataset.tab;
  if (tab) { activeTab = tab; render(); return; }

  const readItem = event.target.closest("[data-read-item]")?.dataset.readItem;
  if (readItem) return action(() => api("/api/inbox/read", { method: "POST", body: JSON.stringify({ itemId: readItem, read: true }) }));
  const archiveItem = event.target.closest("[data-archive-item]")?.dataset.archiveItem;
  if (archiveItem) return action(() => api("/api/inbox/archive", { method: "POST", body: JSON.stringify({ itemId: archiveItem }) }));
  const decisionButton = event.target.closest("[data-decision-item]");
  if (decisionButton) return action(() => api("/api/inbox/decision", { method: "POST", body: JSON.stringify({ itemId: decisionButton.dataset.decisionItem, optionId: decisionButton.dataset.decisionOption }) }));

  const shortlistButton = event.target.closest("[data-shortlist-driver]");
  if (shortlistButton) return action(() => api("/api/recruitment/shortlist", { method: "POST", body: JSON.stringify({ driverId: shortlistButton.dataset.shortlistDriver, shortlisted: shortlistButton.dataset.shortlisted !== "true" }) }));
  const scoutDriver = event.target.closest("[data-scout-driver]")?.dataset.scoutDriver;
  if (scoutDriver) return action(() => api("/api/recruitment/scout", { method: "POST", body: JSON.stringify({ driverId: scoutDriver }) }));
  const negotiateDriver = event.target.closest("[data-negotiate-driver]")?.dataset.negotiateDriver;
  if (negotiateDriver) return action(async () => {
    const result = await api("/api/contracts/open", { method: "POST", body: JSON.stringify({ driverId: negotiateDriver }) });
    selectedNegotiation = result.negotiation;
    activeTab = "contracts";
  });

  const contractRow = event.target.closest("[data-contract-row]")?.dataset.contractRow;
  if (contractRow) { selectedNegotiation = contracts.negotiations.find((row) => row.id === contractRow) ?? null; render(); return; }
  const withdraw = event.target.closest("[data-withdraw-negotiation]")?.dataset.withdrawNegotiation;
  if (withdraw) return action(() => api("/api/contracts/withdraw", { method: "POST", body: JSON.stringify({ negotiationId: withdraw }) }));
  const submit = event.target.closest("[data-submit-offer]")?.dataset.submitOffer;
  if (submit) return action(() => {
    const negotiation = contracts.negotiations.find((row) => row.id === submit) ?? selectedNegotiation;
    const terms = {
      lengthYears: Number(document.querySelector("#offer-length")?.value),
      role: document.querySelector("#offer-role")?.value,
    };
    if (negotiation.expectedTerms.compensationMode === "currency") {
      terms.annualSalary = Number(document.querySelector("#offer-salary")?.value);
      terms.signingBonus = Number(document.querySelector("#offer-bonus")?.value);
    } else {
      terms.salaryIndex = Number(document.querySelector("#offer-index")?.value);
    }
    return api("/api/contracts/offer", { method: "POST", body: JSON.stringify({ negotiationId: submit, terms }) });
  });

  const actionName = event.target.closest("[data-action]")?.dataset.action;
  if (actionName === "search-recruitment") return action(async () => {
    const query = document.querySelector("#recruitment-query")?.value ?? "";
    recruitment = await api(`/api/recruitment?query=${encodeURIComponent(query)}`);
  });
  if (actionName === "show-shortlist") return action(async () => { recruitment = await api("/api/recruitment?shortlisted=true"); });
  if (actionName === "show-all-recruitment") return action(async () => { recruitment = await api("/api/recruitment"); });
});

refreshAll().catch((error) => {
  errorMessage = error.message;
  careerState = { screen: "new_career" };
  render();
});
