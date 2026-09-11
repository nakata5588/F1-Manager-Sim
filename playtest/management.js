const root = document.querySelector("#management-app");

let careerState = null;
let overview = null;
let inbox = { summary: {}, items: [] };
let recruitment = { summary: {}, candidates: [] };
let contracts = { summary: {}, negotiations: [] };
let people = { summary: {}, drivers: [], staff: [] };
let market = { summary: {}, offers: [] };
let recruitmentRequest = "/api/recruitment";
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

function currentRecruitmentQuery() {
  try { return new URL(recruitmentRequest, window.location.origin).searchParams.get("query") ?? ""; }
  catch { return ""; }
}

function meter(value, label = "") {
  const safe = Math.max(0, Math.min(100, Number(value ?? 0)));
  return `<div class="people-meter"><div><span>${escapeHtml(label)}</span><strong>${Math.round(safe)}</strong></div><div class="people-meter-track"><i style="width:${safe}%"></i></div></div>`;
}

async function refreshAll() {
  careerState = await api("/api/state");
  if (careerState.screen === "new_career") {
    render();
    return;
  }
  [overview, inbox, recruitment, contracts, people, market] = await Promise.all([
    api("/api/management"),
    api("/api/inbox"),
    api(recruitmentRequest),
    api("/api/contracts"),
    api("/api/people"),
    api("/api/market"),
  ]);
  const stillSelected = contracts.negotiations.find((row) => row.id === selectedNegotiation?.id);
  selectedNegotiation = stillSelected ?? null;
  render();
}

function tabs() {
  const rows = [
    ["inbox", `Inbox ${overview?.inbox?.unread ? `(${overview.inbox.unread})` : ""}`],
    ["people", "People"],
    ["recruitment", "Recruitment"],
    ["contracts", `Contracts ${overview?.contracts?.active ? `(${overview.contracts.active})` : ""}`],
    ["market", `Market ${overview?.market?.openOffers ? `(${overview.market.openOffers})` : ""}`],
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

function personalityLine(row) {
  const traits = row.personality?.traits ?? {};
  const historical = row.personality?.historicalTraitCount ?? 0;
  return `<div class="people-traits">
    <span>Amb ${Math.round(traits.ambition ?? 50)}</span><span>Loy ${Math.round(traits.loyalty ?? 50)}</span>
    <span>Pro ${Math.round(traits.professionalism ?? 50)}</span><span>Adapt ${Math.round(traits.adaptability ?? 50)}</span>
    <span>Comp ${Math.round(traits.composure ?? 50)}</span><span>Team ${Math.round(traits.teamwork ?? 50)}</span>
    <em>${historical ? `${historical} sourced trait${historical === 1 ? "" : "s"}` : "neutral fallback"}</em>
  </div>`;
}

function personCard(row) {
  const mentality = row.mentality ?? {};
  const rep = row.representative ?? {};
  return `<article class="people-card">
    <div class="people-card-head"><div><span class="management-category">${escapeHtml(row.type)} · ${escapeHtml(row.role)}</span><h3>${escapeHtml(row.name)}</h3></div><strong class="morale-badge">${Math.round(mentality.morale ?? 50)} morale</strong></div>
    <div class="people-grid">
      ${meter(mentality.confidence, "Confidence")}${meter(mentality.teamSatisfaction, "Team")}
      ${meter(mentality.roleSatisfaction, "Role")}${meter(mentality.contractSatisfaction, "Contract")}
      ${meter(mentality.transferOpenness, "Transfer openness")}${meter(100 - Number(mentality.pressure ?? 40), "Composure state")}
    </div>
    ${personalityLine(row)}
    <div class="people-representative"><strong>Representative:</strong> ${escapeHtml(rep.name ?? rep.style ?? "Simulation profile")} <span class="muted">· ${escapeHtml(rep.source ?? "")}</span></div>
  </article>`;
}

function renderPeople() {
  const drivers = people.drivers.length ? people.drivers.map(personCard).join("") : '<div class="management-empty">No controlled-team drivers.</div>';
  const staff = people.staff.length ? people.staff.map(personCard).join("") : '<div class="management-empty">No staff data available.</div>';
  return `<div class="management-section-title"><div><span class="management-category">Team dynamics</span><h2>Drivers</h2></div></div><div class="people-cards">${drivers}</div>
    <div class="management-section-title"><div><span class="management-category">Team dynamics</span><h2>Staff</h2></div></div><div class="people-cards">${staff}</div>`;
}

function candidateReport(row) {
  if (!row.report) return '<span class="muted">No scouting report</span>';
  return `<span>CA ${rangeText(row.report.currentAbility)} · PA ${rangeText(row.report.potentialAbility)}</span>`;
}

function interestText(row) {
  if (!row.transferInterest) return '<span class="muted">Scout to assess</span>';
  const reasons = (row.transferInterest.reasons ?? []).map((reason) => reason.replaceAll("_", " ")).join(", ");
  return `<strong class="interest ${escapeHtml(row.transferInterest.level)}">${escapeHtml(row.transferInterest.level.replaceAll("_", " "))}</strong><div class="muted small">${escapeHtml(reasons || "No strong signal")}</div>`;
}

function renderRecruitment() {
  return `<div class="management-toolbar">
    <input id="recruitment-query" placeholder="Search drivers" value="${escapeHtml(currentRecruitmentQuery())}">
    <button data-action="search-recruitment">Search</button>
    <button data-action="show-shortlist">Shortlist</button>
    <button data-action="show-all-recruitment">All</button>
  </div>
  <div class="management-table-wrap"><table>
    <thead><tr><th>Driver</th><th>Age</th><th>Team</th><th>Contract</th><th>Knowledge</th><th>Report</th><th>Interest</th><th></th></tr></thead>
    <tbody>${recruitment.candidates.map((row) => `<tr>
      <td><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")} · ${escapeHtml(row.visibilityState ?? "")}</div></td>
      <td>${row.age ?? "—"}</td>
      <td>${escapeHtml(row.currentTeamId ?? "Free agent")}</td>
      <td>${row.contractUntil ?? "—"}</td>
      <td><strong>${Math.round(row.knowledge)}%</strong></td>
      <td>${candidateReport(row)}</td><td>${interestText(row)}</td>
      <td><div class="management-actions compact">
        <button data-shortlist-driver="${escapeHtml(row.id)}" data-shortlisted="${row.shortlisted ? "true" : "false"}">${row.shortlisted ? "Remove" : "Shortlist"}</button>
        <button data-scout-driver="${escapeHtml(row.id)}">Scout</button>
        ${row.visibilityState === "f1_eligible" ? `<button class="primary" data-negotiate-driver="${escapeHtml(row.id)}">Future deal</button><button data-negotiate-now-driver="${escapeHtml(row.id)}">Approach now</button>` : ""}
      </div></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function compensationFields(terms) {
  if (terms.compensationMode === "currency") {
    return `<label>Annual salary<input id="offer-salary" type="number" min="1" value="${terms.annualSalary}"></label>
      <label>Signing bonus<input id="offer-bonus" type="number" min="0" value="${terms.signingBonus ?? 0}"></label>`;
  }
  return `<label>Compensation index<input id="offer-index" type="number" min="1" max="120" value="${terms.salaryIndex}"></label>`;
}

function transferFields(negotiation, counter = false) {
  const required = negotiation.transferCompensation;
  if (!required?.required) return "";
  const counterTransfer = counter ? negotiation.counterTerms?.transferCompensation : null;
  const value = counterTransfer?.value ?? required.value;
  if (required.mode === "currency") {
    return `<label>Transfer / release fee<input id="offer-transfer-fee" type="number" min="0" value="${value}"></label>`;
  }
  return `<label>Transfer compensation index<input id="offer-transfer-index" type="number" min="0" max="150" value="${value}"></label>`;
}

function negotiationEditor() {
  if (!selectedNegotiation || !["open", "countered"].includes(selectedNegotiation.status)) return "";
  const isCounter = selectedNegotiation.status === "countered" && selectedNegotiation.counterTerms;
  const terms = isCounter ? selectedNegotiation.counterTerms : selectedNegotiation.expectedTerms;
  const interest = selectedNegotiation.interest;
  const representative = selectedNegotiation.representative;
  const transfer = selectedNegotiation.transferCompensation;
  return `<article class="management-contract-editor">
    <div class="eyebrow">Negotiation</div>
    <h2>${escapeHtml(selectedNegotiation.driverName)}</h2>
    <p class="muted">Start season ${selectedNegotiation.startSeason} · expires ${humanDate(selectedNegotiation.expiresAt)} · representative ${escapeHtml(representative?.name ?? representative?.style ?? "unknown")}</p>
    ${interest ? `<div class="negotiation-context"><strong>Interest: ${escapeHtml(interest.level.replaceAll("_", " "))}</strong><span>${Math.round(interest.score)}/100</span></div>` : ""}
    ${transfer?.required ? `<div class="management-notice">Current-team release required: ${escapeHtml(transfer.mode)} ${escapeHtml(transfer.value)} · ${escapeHtml(transfer.source)}</div>` : ""}
    ${isCounter ? '<div class="management-notice">A counter-offer is waiting in your Inbox. Accept or withdraw from the Inbox decision.</div>' : `
      <div class="management-form-grid">
        ${compensationFields(terms)}${transferFields(selectedNegotiation)}
        <label>Contract length<input id="offer-length" type="number" min="1" max="5" value="${terms.lengthYears}"></label>
        <label>Role<input id="offer-role" value="${escapeHtml(terms.role)}"></label>
      </div>
      <div class="management-actions"><button class="primary" data-submit-offer="${escapeHtml(selectedNegotiation.id)}">Submit offer</button><button data-withdraw-negotiation="${escapeHtml(selectedNegotiation.id)}">Withdraw</button></div>
    `}
  </article>`;
}

function renderContracts() {
  return `${negotiationEditor()}<div class="management-table-wrap"><table>
    <thead><tr><th>Driver</th><th>Status</th><th>Start</th><th>Offers</th><th>Interest</th><th>Release</th><th>Terms</th></tr></thead>
    <tbody>${contracts.negotiations.map((row) => `<tr data-contract-row="${escapeHtml(row.id)}" class="${selectedNegotiation?.id === row.id ? "selected-row" : ""}">
      <td><strong>${escapeHtml(row.driverName)}</strong></td><td>${escapeHtml(row.status)}</td><td>${row.startSeason}</td><td>${row.offers.length}</td>
      <td>${escapeHtml(row.interest?.level?.replaceAll("_", " ") ?? "—")}</td>
      <td>${row.transferCompensation?.required ? `${escapeHtml(row.transferCompensation.mode)} ${escapeHtml(row.transferCompensation.value)}` : "None"}</td>
      <td>${escapeHtml(row.expectedTerms.compensationMode)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function renderMarket() {
  if (!market.offers.length) return '<div class="management-empty">No active rival approaches relevant to your team or recruitment targets.</div>';
  return `<div class="management-stack">${market.offers.map((row) => `<article class="management-message">
    <div class="management-message-head"><div><span class="management-category">${escapeHtml(row.source)}</span><h3>${escapeHtml(row.driverName)}</h3></div><span class="muted">expires ${humanDate(row.expiresAt)}</span></div>
    <p><strong>${escapeHtml(row.teamId)}</strong> · future season ${row.startSeason} · ${escapeHtml(row.terms?.compensationMode ?? "")}${row.terms?.salaryIndex ? ` ${row.terms.salaryIndex}` : ""}</p>
    <div class="negotiation-context"><strong>Driver interest</strong><span>${Math.round(row.interest?.score ?? 0)}/100 · ${escapeHtml(row.interest?.level?.replaceAll("_", " ") ?? "unknown")}</span></div>
  </article>`).join("")}</div>`;
}

function render() {
  if (!careerState) return;
  if (careerState.screen === "new_career") {
    root.innerHTML = `<main class="management-standalone"><div class="card"><h1>Management Hub</h1><p>Start a career first.</p><a class="management-link-button" href="/">Back to New Career</a></div></main>`;
    return;
  }
  const content = activeTab === "people" ? renderPeople()
    : activeTab === "recruitment" ? renderRecruitment()
      : activeTab === "contracts" ? renderContracts()
        : activeTab === "market" ? renderMarket()
          : renderInbox();
  root.innerHTML = `<div class="management-shell ${busy ? "loading" : ""}">
    <header class="management-header">
      <div><div class="eyebrow">Phase 33 · People, Mentality & Market Dynamics</div><h1>${escapeHtml(careerState.career.teamName)}</h1><p>${escapeHtml(careerState.career.managerName)} · ${humanDate(careerState.career.date)}</p></div>
      <a class="management-link-button" href="/">← Career</a>
    </header>
    <section class="management-kpis">
      <div><span>Unread</span><strong>${overview?.inbox?.unread ?? 0}</strong></div>
      <div><span>Low morale</span><strong>${overview?.people?.lowMoraleDrivers ?? 0}</strong></div>
      <div><span>Negotiations</span><strong>${overview?.contracts?.active ?? 0}</strong></div>
      <div><span>Rival offers</span><strong>${overview?.market?.openOffers ?? 0}</strong></div>
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

async function openNegotiation(driverId, startSeason = undefined) {
  const result = await api("/api/contracts/open", { method: "POST", body: JSON.stringify({ driverId, startSeason }) });
  selectedNegotiation = result.negotiation;
  activeTab = "contracts";
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
  if (negotiateDriver) return action(() => openNegotiation(negotiateDriver));
  const negotiateNow = event.target.closest("[data-negotiate-now-driver]")?.dataset.negotiateNowDriver;
  if (negotiateNow) return action(() => openNegotiation(negotiateNow, careerState.career.season));

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
    if (negotiation.transferCompensation?.required) {
      if (negotiation.transferCompensation.mode === "currency") terms.transferFee = Number(document.querySelector("#offer-transfer-fee")?.value);
      else terms.transferCompensationIndex = Number(document.querySelector("#offer-transfer-index")?.value);
    }
    return api("/api/contracts/offer", { method: "POST", body: JSON.stringify({ negotiationId: submit, terms }) });
  });

  const actionName = event.target.closest("[data-action]")?.dataset.action;
  if (actionName === "search-recruitment") return action(async () => {
    const query = document.querySelector("#recruitment-query")?.value ?? "";
    recruitmentRequest = `/api/recruitment?query=${encodeURIComponent(query)}`;
  });
  if (actionName === "show-shortlist") return action(async () => { recruitmentRequest = "/api/recruitment?shortlisted=true"; });
  if (actionName === "show-all-recruitment") return action(async () => { recruitmentRequest = "/api/recruitment"; });
});

refreshAll().catch((error) => {
  errorMessage = error.message;
  careerState = { screen: "new_career" };
  render();
});
