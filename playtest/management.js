const root = document.querySelector("#management-app");

let careerState = null;
let overview = null;
let inbox = { summary: {}, items: [] };
let recruitment = { summary: {}, candidates: [] };
let contracts = { summary: {}, negotiations: [] };
let people = { summary: {}, drivers: [], staff: [] };
let market = { summary: {}, offers: [] };
let boardData = { board: null, career: null };
let managerCareer = { career: null, vacancies: [] };
let responsibilities = { teamId: null, areas: [] };
let staffRecruitment = { summary: {}, candidates: [] };
let staffContracts = { summary: {}, negotiations: [] };
let recruitmentRequest = "/api/recruitment";
let staffRequest = "/api/staff-recruitment";
let activeTab = "inbox";
let selectedNegotiation = null;
let selectedStaffNegotiation = null;
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

function humanDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function rangeText(range) {
  if (!range) return "Unknown";
  return range.low === range.high ? String(range.low) : `${range.low}–${range.high}`;
}

function meter(value, label = "") {
  const safe = Math.max(0, Math.min(100, Number(value ?? 0)));
  return `<div class="people-meter"><div><span>${escapeHtml(label)}</span><strong>${Math.round(safe)}</strong></div><div class="people-meter-track"><i style="width:${safe}%"></i></div></div>`;
}

function statusPill(value) {
  const text = String(value ?? "unknown").replaceAll("_", " ");
  return `<span class="status-pill status-${escapeHtml(String(value ?? "unknown"))}">${escapeHtml(text)}</span>`;
}

function queryFrom(request) {
  try { return new URL(request, window.location.origin).searchParams.get("query") ?? ""; }
  catch { return ""; }
}

async function refreshAll() {
  careerState = await api("/api/state");
  if (careerState.screen === "new_career") {
    render();
    return;
  }
  [overview, inbox, recruitment, contracts, people, market, boardData, managerCareer, responsibilities, staffRecruitment, staffContracts] = await Promise.all([
    api("/api/management"),
    api("/api/inbox"),
    api(recruitmentRequest),
    api("/api/contracts"),
    api("/api/people"),
    api("/api/market"),
    api("/api/board"),
    api("/api/manager-career"),
    api("/api/responsibilities"),
    api(staffRequest),
    api("/api/staff-contracts"),
  ]);
  selectedNegotiation = contracts.negotiations.find((row) => row.id === selectedNegotiation?.id) ?? null;
  selectedStaffNegotiation = staffContracts.negotiations.find((row) => row.id === selectedStaffNegotiation?.id) ?? null;
  render();
}

function tabs() {
  const rows = [
    ["inbox", `Inbox ${overview?.inbox?.unread ? `(${overview.inbox.unread})` : ""}`],
    ["board", "Board"],
    ["career", "Career"],
    ["people", "People"],
    ["staff", `Staff ${overview?.staffContracts?.active ? `(${overview.staffContracts.active})` : ""}`],
    ["recruitment", "Drivers"],
    ["contracts", `Driver Contracts ${overview?.contracts?.active ? `(${overview.contracts.active})` : ""}`],
    ["market", `Market ${overview?.market?.openOffers ? `(${overview.market.openOffers})` : ""}`],
    ["responsibilities", "Responsibilities"],
  ];
  return `<div class="management-tabs">${rows.map(([id, label]) => `<button class="management-tab ${activeTab === id ? "active" : ""}" data-tab="${id}">${escapeHtml(label)}</button>`).join("")}</div>`;
}

function renderInbox() {
  if (!inbox.items.length) return '<div class="management-empty">No messages.</div>';
  return `<div class="management-stack">${inbox.items.map((item) => `
    <article class="management-message ${item.unread ? "unread" : ""}">
      <div class="management-message-head"><div><span class="management-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3></div><span class="muted">${humanDate(item.date)}</span></div>
      <p>${escapeHtml(item.body)}</p>
      ${item.decision?.status === "pending" ? `<div class="management-actions">${item.decision.options.map((option) => `<button data-decision-item="${escapeHtml(item.id)}" data-decision-option="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>`).join("")}</div>` : ""}
      <div class="management-actions subtle">${item.unread ? `<button data-read-item="${escapeHtml(item.id)}">Mark read</button>` : ""}<button data-archive-item="${escapeHtml(item.id)}">Archive</button></div>
    </article>`).join("")}</div>`;
}

function renderBoard() {
  const board = boardData.board;
  if (!board) return '<div class="management-empty"><strong>No board relationship.</strong><br>You are currently unemployed. Use the Career tab to find another team.</div>';
  return `<div class="board-hero">
    <div><span class="management-category">Board confidence</span><h2>${escapeHtml(board.teamName)}</h2><p>${statusPill(board.status)} · reviewed ${board.reviewCount} time${board.reviewCount === 1 ? "" : "s"}</p></div>
    <div class="confidence-ring"><strong>${Math.round(board.confidence)}</strong><span>/100</span></div>
  </div>
  <div class="management-section-title"><div><span class="management-category">Season expectations</span><h2>Objectives</h2></div></div>
  <div class="objective-grid">${board.objectives.map((row) => `<article class="objective-card"><div class="management-message-head"><strong>${escapeHtml(row.label)}</strong>${statusPill(row.status)}</div><p>${escapeHtml(row.targetText)}</p><div class="muted small">Current: ${escapeHtml(row.current ?? "Pending")}</div></article>`).join("")}</div>
  <div class="management-section-title"><div><span class="management-category">Board access</span><h2>Requests</h2></div></div>
  <div class="management-actions"><button class="primary" data-board-request="development_budget">Request development budget</button><button data-board-request="staff_capacity">Request staff capacity</button></div>
  ${board.requests.length ? `<div class="management-table-wrap compact-table"><table><thead><tr><th>Request</th><th>Status</th><th>Submitted</th><th>Outcome</th></tr></thead><tbody>${board.requests.slice().reverse().map((row) => `<tr><td>${escapeHtml(row.kind.replaceAll("_", " "))}</td><td>${statusPill(row.status)}</td><td>${humanDate(row.submittedAt)}</td><td>${escapeHtml(row.value ?? row.reason ?? "Pending")}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
}

function renderCareer() {
  const career = managerCareer.career ?? {};
  const openOffers = career.jobOffers ?? [];
  return `<div class="career-hero">
    <div><span class="management-category">Manager career</span><h2>${escapeHtml(career.name ?? "Manager")}</h2><p>${statusPill(career.status)} · ${escapeHtml(career.currentTeamName ?? "No team")}</p></div>
    <div class="reputation-score"><strong>${Math.round(career.reputation ?? 0)}</strong><span>Paddock reputation</span></div>
  </div>
  ${openOffers.length ? `<div class="management-section-title"><div><span class="management-category">Direct approaches</span><h2>Job offers</h2></div></div><div class="objective-grid">${openOffers.map((offer) => `<article class="objective-card"><strong>${escapeHtml(offer.teamName ?? offer.teamId)}</strong><p>Team reputation ${Math.round(offer.teamReputation ?? 0)} · expires ${humanDate(offer.expiresAt)}</p><div class="muted small">Respond through the Inbox.</div></article>`).join("")}</div>` : ""}
  <div class="management-section-title"><div><span class="management-category">Job Centre</span><h2>F1 opportunities</h2></div></div>
  <div class="management-table-wrap"><table><thead><tr><th>Team</th><th>Reputation</th><th>Career fit</th><th></th></tr></thead><tbody>${managerCareer.vacancies.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${Math.round(row.reputation)}</td><td>${Math.abs(Number(row.reputation) - Number(career.reputation ?? 0)) <= 15 ? "Realistic" : "Stretch"}</td><td><button data-manager-apply="${escapeHtml(row.id)}">Apply</button></td></tr>`).join("")}</tbody></table></div>
  <div class="management-section-title"><div><span class="management-category">Record</span><h2>Career history</h2></div></div>
  <div class="career-timeline">${(career.history ?? []).slice().reverse().map((row) => `<div><strong>${escapeHtml(row.type.replaceAll("_", " "))}</strong><span>${escapeHtml(row.teamId ?? row.reason ?? "")}</span><time>${humanDate(row.date)}</time></div>`).join("") || '<div class="management-empty">No career history yet.</div>'}</div>`;
}

function personalityLine(row) {
  const traits = row.personality?.traits ?? {};
  const historical = row.personality?.historicalTraitCount ?? 0;
  return `<div class="people-traits"><span>Amb ${Math.round(traits.ambition ?? 50)}</span><span>Loy ${Math.round(traits.loyalty ?? 50)}</span><span>Pro ${Math.round(traits.professionalism ?? 50)}</span><span>Adapt ${Math.round(traits.adaptability ?? 50)}</span><span>Comp ${Math.round(traits.composure ?? 50)}</span><span>Team ${Math.round(traits.teamwork ?? 50)}</span><em>${historical ? `${historical} sourced trait${historical === 1 ? "" : "s"}` : "neutral fallback"}</em></div>`;
}

function personCard(row) {
  const mentality = row.mentality ?? {};
  const rep = row.representative ?? {};
  return `<article class="people-card"><div class="people-card-head"><div><span class="management-category">${escapeHtml(row.type)} · ${escapeHtml(row.role)}</span><h3>${escapeHtml(row.name)}</h3></div><strong class="morale-badge">${Math.round(mentality.morale ?? 50)} morale</strong></div><div class="people-grid">${meter(mentality.confidence, "Confidence")}${meter(mentality.teamSatisfaction, "Team")}${meter(mentality.roleSatisfaction, "Role")}${meter(mentality.contractSatisfaction, "Contract")}${meter(mentality.transferOpenness, "Transfer openness")}${meter(100 - Number(mentality.pressure ?? 40), "Composure state")}</div>${personalityLine(row)}<div class="people-representative"><strong>Representative:</strong> ${escapeHtml(rep.name ?? rep.style ?? "Simulation profile")} <span class="muted">· ${escapeHtml(rep.source ?? "")}</span></div></article>`;
}

function renderPeople() {
  const drivers = people.drivers.length ? people.drivers.map(personCard).join("") : '<div class="management-empty">No controlled-team drivers.</div>';
  const staffRows = people.staff.length ? people.staff.map(personCard).join("") : '<div class="management-empty">No controlled-team staff.</div>';
  return `<div class="management-section-title"><div><span class="management-category">Team dynamics</span><h2>Drivers</h2></div></div><div class="people-cards">${drivers}</div><div class="management-section-title"><div><span class="management-category">Team dynamics</span><h2>Staff</h2></div></div><div class="people-cards">${staffRows}</div>`;
}

function driverInterest(row) {
  if (!row.transferInterest) return '<span class="muted">Scout to assess</span>';
  const reasons = (row.transferInterest.reasons ?? []).map((reason) => reason.replaceAll("_", " ")).join(", ");
  return `<strong class="interest ${escapeHtml(row.transferInterest.level)}">${escapeHtml(row.transferInterest.level.replaceAll("_", " "))}</strong><div class="muted small">${escapeHtml(reasons || "No strong signal")}</div>`;
}

function renderRecruitment() {
  return `<div class="management-toolbar"><input id="recruitment-query" placeholder="Search drivers" value="${escapeHtml(queryFrom(recruitmentRequest))}"><button data-action="search-recruitment">Search</button><button data-action="show-shortlist">Shortlist</button><button data-action="show-all-recruitment">All</button></div><div class="management-table-wrap"><table><thead><tr><th>Driver</th><th>Age</th><th>Team</th><th>Contract</th><th>Knowledge</th><th>Report</th><th>Interest</th><th></th></tr></thead><tbody>${recruitment.candidates.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")} · ${escapeHtml(row.visibilityState ?? "")}</div></td><td>${row.age ?? "—"}</td><td>${escapeHtml(row.currentTeamId ?? "Free agent")}</td><td>${row.contractUntil ?? "—"}</td><td><strong>${Math.round(row.knowledge)}%</strong></td><td>${row.report ? `CA ${rangeText(row.report.currentAbility)} · PA ${rangeText(row.report.potentialAbility)}` : '<span class="muted">No scouting report</span>'}</td><td>${driverInterest(row)}</td><td><div class="management-actions compact"><button data-shortlist-driver="${escapeHtml(row.id)}" data-shortlisted="${row.shortlisted ? "true" : "false"}">${row.shortlisted ? "Remove" : "Shortlist"}</button><button data-scout-driver="${escapeHtml(row.id)}">Scout</button>${row.visibilityState === "f1_eligible" ? `<button class="primary" data-negotiate-driver="${escapeHtml(row.id)}">Future deal</button><button data-negotiate-now-driver="${escapeHtml(row.id)}">Approach now</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`;
}

function compensationFields(terms, prefix = "offer") {
  if (terms.compensationMode === "currency") return `<label>Annual salary<input id="${prefix}-salary" type="number" min="1" value="${terms.annualSalary}"></label><label>Signing bonus<input id="${prefix}-bonus" type="number" min="0" value="${terms.signingBonus ?? 0}"></label>`;
  return `<label>Compensation index<input id="${prefix}-index" type="number" min="1" max="120" value="${terms.salaryIndex}"></label>`;
}

function renderDriverContracts() {
  const editor = selectedNegotiation && ["open", "countered"].includes(selectedNegotiation.status) ? (() => {
    const isCounter = selectedNegotiation.status === "countered" && selectedNegotiation.counterTerms;
    const terms = isCounter ? selectedNegotiation.counterTerms : selectedNegotiation.expectedTerms;
    return `<article class="management-contract-editor"><div class="eyebrow">Driver negotiation</div><h2>${escapeHtml(selectedNegotiation.driverName)}</h2><p class="muted">Start ${selectedNegotiation.startSeason} · expires ${humanDate(selectedNegotiation.expiresAt)}</p>${isCounter ? '<div class="management-notice">A counter-offer is waiting in your Inbox.</div>' : `<div class="management-form-grid">${compensationFields(terms)}<label>Contract length<input id="offer-length" type="number" min="1" max="5" value="${terms.lengthYears}"></label><label>Role<input id="offer-role" value="${escapeHtml(terms.role)}"></label>${selectedNegotiation.transferCompensation?.required ? selectedNegotiation.transferCompensation.mode === "currency" ? `<label>Transfer / release fee<input id="offer-transfer-fee" type="number" min="0" value="${selectedNegotiation.transferCompensation.value}"></label>` : `<label>Transfer compensation index<input id="offer-transfer-index" type="number" min="0" max="150" value="${selectedNegotiation.transferCompensation.value}"></label>` : ""}</div><div class="management-actions"><button class="primary" data-submit-offer="${escapeHtml(selectedNegotiation.id)}">Submit offer</button><button data-withdraw-negotiation="${escapeHtml(selectedNegotiation.id)}">Withdraw</button></div>`}</article>`;
  })() : "";
  return `${editor}<div class="management-table-wrap"><table><thead><tr><th>Driver</th><th>Status</th><th>Start</th><th>Offers</th><th>Interest</th><th>Release</th><th>Terms</th></tr></thead><tbody>${contracts.negotiations.map((row) => `<tr data-contract-row="${escapeHtml(row.id)}" class="${selectedNegotiation?.id === row.id ? "selected-row" : ""}"><td><strong>${escapeHtml(row.driverName)}</strong></td><td>${escapeHtml(row.status)}</td><td>${row.startSeason}</td><td>${row.offers.length}</td><td>${escapeHtml(row.interest?.level?.replaceAll("_", " ") ?? "—")}</td><td>${row.transferCompensation?.required ? `${escapeHtml(row.transferCompensation.mode)} ${escapeHtml(row.transferCompensation.value)}` : "None"}</td><td>${escapeHtml(row.expectedTerms.compensationMode)}</td></tr>`).join("")}</tbody></table></div>`;
}

function staffInterest(row) {
  const interest = row.interest;
  if (!interest) return "—";
  return `<strong class="interest ${escapeHtml(interest.level)}">${escapeHtml(interest.level.replaceAll("_", " "))}</strong><div class="muted small">${Math.round(interest.score)}/100</div>`;
}

function staffEditor() {
  if (!selectedStaffNegotiation || !["open", "countered"].includes(selectedStaffNegotiation.status)) return "";
  const isCounter = selectedStaffNegotiation.status === "countered" && selectedStaffNegotiation.counterTerms;
  const terms = isCounter ? selectedStaffNegotiation.counterTerms : selectedStaffNegotiation.expectedTerms;
  return `<article class="management-contract-editor"><div class="eyebrow">Staff negotiation</div><h2>${escapeHtml(selectedStaffNegotiation.staffName)}</h2><p class="muted">${escapeHtml(selectedStaffNegotiation.role)} · start ${selectedStaffNegotiation.startSeason} · expires ${humanDate(selectedStaffNegotiation.expiresAt)}</p>${isCounter ? '<div class="management-notice">A staff counter-offer is waiting in your Inbox.</div>' : `<div class="management-form-grid">${compensationFields(terms, "staff-offer")}<label>Contract length<input id="staff-offer-length" type="number" min="1" max="5" value="${terms.lengthYears}"></label><label>Role<input id="staff-offer-role" value="${escapeHtml(terms.role)}"></label></div><div class="management-actions"><button class="primary" data-submit-staff-offer="${escapeHtml(selectedStaffNegotiation.id)}">Submit offer</button><button data-withdraw-staff="${escapeHtml(selectedStaffNegotiation.id)}">Withdraw</button></div>`}</article>`;
}

function renderStaff() {
  return `${staffEditor()}<div class="management-toolbar staff-toolbar"><input id="staff-query" placeholder="Search staff or role" value="${escapeHtml(queryFrom(staffRequest))}"><button data-action="search-staff">Search</button><button data-action="show-all-staff">All staff</button></div><div class="management-table-wrap"><table><thead><tr><th>Staff</th><th>Role</th><th>Team</th><th>Ability</th><th>Technical</th><th>Leadership</th><th>Strategy</th><th>Scouting</th><th>Interest</th><th></th></tr></thead><tbody>${staffRecruitment.candidates.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")}</div></td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.currentTeamId ?? "Free agent")}</td><td>${Math.round(row.ability)}</td><td>${row.technical ?? "—"}</td><td>${row.leadership ?? "—"}</td><td>${row.strategy ?? "—"}</td><td>${row.scouting ?? "—"}</td><td>${staffInterest(row)}</td><td><button class="primary" data-negotiate-staff="${escapeHtml(row.id)}">Negotiate</button></td></tr>`).join("")}</tbody></table></div><div class="management-section-title"><div><span class="management-category">Negotiations</span><h2>Staff contracts</h2></div></div><div class="management-table-wrap compact-table"><table><thead><tr><th>Staff</th><th>Status</th><th>Start</th><th>Role</th><th>Terms</th></tr></thead><tbody>${staffContracts.negotiations.map((row) => `<tr data-staff-contract-row="${escapeHtml(row.id)}" class="${selectedStaffNegotiation?.id === row.id ? "selected-row" : ""}"><td>${escapeHtml(row.staffName)}</td><td>${escapeHtml(row.status)}</td><td>${row.startSeason}</td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.expectedTerms.compensationMode)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderMarket() {
  if (!market.offers.length) return '<div class="management-empty">No active rival approaches relevant to your team or recruitment targets.</div>';
  return `<div class="management-stack">${market.offers.map((row) => `<article class="management-message"><div class="management-message-head"><div><span class="management-category">${escapeHtml(row.source)}</span><h3>${escapeHtml(row.driverName)}</h3></div><span class="muted">expires ${humanDate(row.expiresAt)}</span></div><p><strong>${escapeHtml(row.teamId)}</strong> · future season ${row.startSeason}</p><div class="negotiation-context"><strong>Driver interest</strong><span>${Math.round(row.interest?.score ?? 0)}/100 · ${escapeHtml(row.interest?.level?.replaceAll("_", " ") ?? "unknown")}</span></div></article>`).join("")}</div>`;
}

function renderResponsibilities() {
  if (!responsibilities.teamId) return '<div class="management-empty">Responsibilities become available when you are employed by a team.</div>';
  return `<div class="management-notice">Delegation does not create separate rules. Delegated departments use the same underlying simulation systems as AI teams wherever implemented.</div><div class="responsibility-grid">${responsibilities.areas.map((row) => `<article class="responsibility-card"><div><span class="management-category">${escapeHtml(row.id)}</span><h3>${escapeHtml(row.label)}</h3></div><div class="responsibility-toggle"><button class="${row.owner === "manager" ? "active" : ""}" data-responsibility="${escapeHtml(row.id)}" data-owner="manager">Manager</button><button class="${row.owner === "delegated" ? "active" : ""}" data-responsibility="${escapeHtml(row.id)}" data-owner="delegated">Delegated</button></div></article>`).join("")}</div>`;
}

function render() {
  if (!careerState) return;
  if (careerState.screen === "new_career") {
    root.innerHTML = '<div class="management-standalone"><div><h1>No active career</h1><p>Start a career from the main Developer Playtest first.</p><a class="management-link-button" href="/">Return to Career Setup</a></div></div>';
    return;
  }
  const content = activeTab === "board" ? renderBoard()
    : activeTab === "career" ? renderCareer()
      : activeTab === "people" ? renderPeople()
        : activeTab === "staff" ? renderStaff()
          : activeTab === "recruitment" ? renderRecruitment()
            : activeTab === "contracts" ? renderDriverContracts()
              : activeTab === "market" ? renderMarket()
                : activeTab === "responsibilities" ? renderResponsibilities()
                  : renderInbox();
  const career = managerCareer.career ?? overview?.career ?? {};
  root.innerHTML = `<div class="management-shell ${busy ? "busy" : ""}"><header class="management-header"><div><div class="eyebrow">Developer Playtest · Management</div><h1>${escapeHtml(career.currentTeamName ?? "F1 Job Centre")}</h1><p>${escapeHtml(career.name ?? careerState.career?.managerName ?? "Manager")} · ${careerState.career?.season ?? "—"} · ${humanDate(careerState.career?.date)}</p></div><a class="management-link-button" href="/">Career / Race Weekend</a></header><section class="management-kpis"><div><span>Board</span><strong>${boardData.board ? Math.round(boardData.board.confidence) : "—"}</strong></div><div><span>Reputation</span><strong>${Math.round(career.reputation ?? 0)}</strong></div><div><span>Unread</span><strong>${overview?.inbox?.unread ?? 0}</strong></div><div><span>Open deals</span><strong>${(overview?.contracts?.active ?? 0) + (overview?.staffContracts?.active ?? 0)}</strong></div></section>${tabs()}${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}<main class="management-content">${content}</main></div>`;
}

async function action(fn) {
  busy = true;
  errorMessage = "";
  render();
  try { await fn(); }
  catch (error) { errorMessage = error.message; }
  finally { busy = false; await refreshAll().catch((error) => { errorMessage = error.message; render(); }); }
}

async function openDriverNegotiation(driverId, startSeason = undefined) {
  const result = await api("/api/contracts/open", { method: "POST", body: JSON.stringify({ driverId, startSeason }) });
  selectedNegotiation = result.negotiation;
  activeTab = "contracts";
}

async function openStaffNegotiation(staffId) {
  const result = await api("/api/staff-contracts/open", { method: "POST", body: JSON.stringify({ staffId }) });
  selectedStaffNegotiation = result.negotiation;
  activeTab = "staff";
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

  const boardRequest = event.target.closest("[data-board-request]")?.dataset.boardRequest;
  if (boardRequest) return action(() => api("/api/board/request", { method: "POST", body: JSON.stringify({ kind: boardRequest }) }));
  const managerApply = event.target.closest("[data-manager-apply]")?.dataset.managerApply;
  if (managerApply) return action(() => api("/api/manager-career/apply", { method: "POST", body: JSON.stringify({ teamId: managerApply }) }));
  const responsibilityButton = event.target.closest("[data-responsibility]");
  if (responsibilityButton) return action(() => api("/api/responsibilities/set", { method: "POST", body: JSON.stringify({ area: responsibilityButton.dataset.responsibility, owner: responsibilityButton.dataset.owner }) }));

  const shortlistButton = event.target.closest("[data-shortlist-driver]");
  if (shortlistButton) return action(() => api("/api/recruitment/shortlist", { method: "POST", body: JSON.stringify({ driverId: shortlistButton.dataset.shortlistDriver, shortlisted: shortlistButton.dataset.shortlisted !== "true" }) }));
  const scoutDriver = event.target.closest("[data-scout-driver]")?.dataset.scoutDriver;
  if (scoutDriver) return action(() => api("/api/recruitment/scout", { method: "POST", body: JSON.stringify({ driverId: scoutDriver }) }));
  const negotiateDriver = event.target.closest("[data-negotiate-driver]")?.dataset.negotiateDriver;
  if (negotiateDriver) return action(() => openDriverNegotiation(negotiateDriver));
  const negotiateNow = event.target.closest("[data-negotiate-now-driver]")?.dataset.negotiateNowDriver;
  if (negotiateNow) return action(() => openDriverNegotiation(negotiateNow, careerState.career?.season));

  const contractRow = event.target.closest("[data-contract-row]")?.dataset.contractRow;
  if (contractRow) { selectedNegotiation = contracts.negotiations.find((row) => row.id === contractRow) ?? null; render(); return; }
  const withdraw = event.target.closest("[data-withdraw-negotiation]")?.dataset.withdrawNegotiation;
  if (withdraw) return action(() => api("/api/contracts/withdraw", { method: "POST", body: JSON.stringify({ negotiationId: withdraw }) }));
  const submit = event.target.closest("[data-submit-offer]")?.dataset.submitOffer;
  if (submit) return action(() => {
    const negotiation = contracts.negotiations.find((row) => row.id === submit) ?? selectedNegotiation;
    const terms = { lengthYears: Number(document.querySelector("#offer-length")?.value), role: document.querySelector("#offer-role")?.value };
    if (negotiation.expectedTerms.compensationMode === "currency") {
      terms.annualSalary = Number(document.querySelector("#offer-salary")?.value);
      terms.signingBonus = Number(document.querySelector("#offer-bonus")?.value);
    } else terms.salaryIndex = Number(document.querySelector("#offer-index")?.value);
    if (negotiation.transferCompensation?.required) {
      if (negotiation.transferCompensation.mode === "currency") terms.transferFee = Number(document.querySelector("#offer-transfer-fee")?.value);
      else terms.transferCompensationIndex = Number(document.querySelector("#offer-transfer-index")?.value);
    }
    return api("/api/contracts/offer", { method: "POST", body: JSON.stringify({ negotiationId: submit, terms }) });
  });

  const negotiateStaff = event.target.closest("[data-negotiate-staff]")?.dataset.negotiateStaff;
  if (negotiateStaff) return action(() => openStaffNegotiation(negotiateStaff));
  const staffRow = event.target.closest("[data-staff-contract-row]")?.dataset.staffContractRow;
  if (staffRow) { selectedStaffNegotiation = staffContracts.negotiations.find((row) => row.id === staffRow) ?? null; render(); return; }
  const withdrawStaff = event.target.closest("[data-withdraw-staff]")?.dataset.withdrawStaff;
  if (withdrawStaff) return action(() => api("/api/staff-contracts/withdraw", { method: "POST", body: JSON.stringify({ negotiationId: withdrawStaff }) }));
  const submitStaff = event.target.closest("[data-submit-staff-offer]")?.dataset.submitStaffOffer;
  if (submitStaff) return action(() => {
    const negotiation = staffContracts.negotiations.find((row) => row.id === submitStaff) ?? selectedStaffNegotiation;
    const terms = { lengthYears: Number(document.querySelector("#staff-offer-length")?.value), role: document.querySelector("#staff-offer-role")?.value };
    if (negotiation.expectedTerms.compensationMode === "currency") {
      terms.annualSalary = Number(document.querySelector("#staff-offer-salary")?.value);
      terms.signingBonus = Number(document.querySelector("#staff-offer-bonus")?.value);
    } else terms.salaryIndex = Number(document.querySelector("#staff-offer-index")?.value);
    return api("/api/staff-contracts/offer", { method: "POST", body: JSON.stringify({ negotiationId: submitStaff, terms }) });
  });

  const actionName = event.target.closest("[data-action]")?.dataset.action;
  if (actionName === "search-recruitment") return action(async () => { recruitmentRequest = `/api/recruitment?query=${encodeURIComponent(document.querySelector("#recruitment-query")?.value ?? "")}`; });
  if (actionName === "show-shortlist") return action(async () => { recruitmentRequest = "/api/recruitment?shortlisted=true"; });
  if (actionName === "show-all-recruitment") return action(async () => { recruitmentRequest = "/api/recruitment"; });
  if (actionName === "search-staff") return action(async () => { staffRequest = `/api/staff-recruitment?query=${encodeURIComponent(document.querySelector("#staff-query")?.value ?? "")}`; });
  if (actionName === "show-all-staff") return action(async () => { staffRequest = "/api/staff-recruitment"; });
});

refreshAll().catch((error) => {
  errorMessage = error.message;
  careerState = { screen: "new_career" };
  render();
});
