import { buildCareerHomeModel } from "/career-home-model.js";
import { entityLink } from "/entity-links.js";
import { publicLabel } from "/presentation-labels.js";

const APP = document.querySelector("#app");
let rendering = false;

async function request(path) {
  const response = await fetch(path, { headers: { "content-type": "application/json" } });
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
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? raw : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function compactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function safeColour(value, fallback) {
  const colour = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback;
}

function standings(rows = [], type = "driver") {
  if (!rows.length) return '<div class="home-empty">No championship points yet.</div>';
  return `<div class="home-standings">${rows.map((row) => `
    <div class="home-standing-row"><span class="home-position">${row.position ?? "—"}</span><strong>${entityLink(type, row.id, row.name ?? row.id)}</strong><span>${Number(row.points ?? 0)} pts</span></div>
  `).join("")}</div>`;
}

function attention(rows = []) {
  if (!rows.length) return '<div class="home-empty">Nothing urgent requires your attention.</div>';
  return `<div class="home-attention-list">${rows.map((row) => `
    <a class="home-attention ${escapeHtml(row.tone ?? "normal")}" href="${escapeHtml(row.href ?? "/")}"><span>${escapeHtml(row.label)}</span><b>${escapeHtml(row.action ?? "Open")}</b></a>
  `).join("")}</div>`;
}

function inbox(model) {
  const summary = model.inbox.summary ?? {};
  const items = model.inbox.items ?? [];
  return `<article class="home-panel home-inbox">
    <div class="home-panel-head"><div><div class="home-kicker">Inbox</div><h2>Decisions & messages</h2></div><a href="/management.html#inbox">Open Inbox</a></div>
    <div class="home-mini-kpis"><span><strong>${Number(summary.unread ?? 0)}</strong> unread</span><span><strong>${Number(summary.decisionsPending ?? 0)}</strong> decisions</span></div>
    ${items.length ? `<div class="home-inbox-list">${items.map((item) => `<a href="${escapeHtml(item.href)}" class="${item.unread ? "unread" : ""}"><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(publicLabel(item.category, "Management"))} · ${humanDate(item.date)}</small></span>${item.decisionPending ? '<em>DECISION</em>' : ""}</a>`).join("")}</div>` : '<div class="home-empty">Inbox clear.</div>'}
  </article>`;
}

function objectives(board) {
  if (!board?.objectives?.length) return '<div class="home-empty">No active Board objectives.</div>';
  return `<div class="home-objectives">${board.objectives.slice(0, 3).map((row) => `
    <div class="home-objective">
      <span><strong>${escapeHtml(row.label ?? publicLabel(row.kind, "Objective"))}</strong><small>${escapeHtml(row.targetText ?? "Season objective")}</small></span>
      <em class="home-status ${escapeHtml(row.status)}">${escapeHtml(publicLabel(row.status, "Pending"))}</em>
    </div>
  `).join("")}</div>`;
}

function raceFocus(model) {
  const race = model.raceFocus;
  const meta = [race.trackName, race.weather ? publicLabel(race.weather) : null, race.date ? humanDate(race.date) : null].filter(Boolean).join(" · ");
  return `<article class="home-race-focus home-panel">
    <div class="home-race-copy">
      <div class="home-kicker">${escapeHtml(race.eyebrow)}</div>
      <span class="home-race-stage">${escapeHtml(publicLabel(race.stage, "Upcoming"))}</span>
      <h2>${escapeHtml(race.title)}</h2>
      <p>${escapeHtml(meta || "Formula One career event")}</p>
    </div>
    <a class="home-primary-action" href="${escapeHtml(race.href)}">${escapeHtml(race.actionLabel)} <span>→</span></a>
  </article>`;
}

function driversPanel(model) {
  const drivers = model.competition.drivers ?? [];
  return `<article class="home-panel">
    <div class="home-panel-head"><div><div class="home-kicker">Team</div><h2>Your drivers</h2></div><a href="/management.html#people">Open Team</a></div>
    <div class="home-driver-list">${drivers.map((driver) => `<a href="${escapeHtml(driver.profileHref ?? "/management.html#people")}"><span><strong>${escapeHtml(driver.name)}</strong><small>${escapeHtml(publicLabel(driver.role, "Driver"))}</small></span><b>${driver.position ? `P${driver.position}` : "—"}</b><em>${driver.points} pts</em></a>`).join("") || '<div class="home-empty">No active drivers.</div>'}</div>
  </article>`;
}

function boardPanel(model) {
  return `<article class="home-panel">
    <div class="home-panel-head"><div><div class="home-kicker">Board</div><h2>Confidence & objectives</h2></div><a href="/management.html#board">Open Board</a></div>
    ${model.board ? `<div class="home-confidence"><strong>${Math.round(Number(model.board.confidence ?? 0))}%</strong><span>${escapeHtml(publicLabel(model.board.status, "Pending"))}</span></div>${objectives(model.board)}` : '<div class="home-empty">No active Board state.</div>'}
  </article>`;
}

function technicalPanel(model) {
  const summary = model.technical.summary ?? {};
  const ready = Number(summary.readySpecs ?? 0);
  return `<article class="home-panel ${ready > 0 ? "home-panel-highlight" : ""}">
    <div class="home-panel-head"><div><div class="home-kicker">Car & Development</div><h2>Technical programme</h2></div><a href="/technical.html">Open Development</a></div>
    <div class="home-stat-grid">
      <div><strong>${Number(summary.activeDesigns ?? 0)}</strong><span>Active designs</span></div>
      <div><strong>${Number(summary.manufacturingJobs ?? 0)}</strong><span>Factory jobs</span></div>
      <div><strong>${ready}</strong><span>Ready specs</span></div>
      <div><strong>${Number(summary.facilityUpgrades ?? 0)}</strong><span>Facility projects</span></div>
    </div>
    <div class="home-footnote">Responsibility: <strong>${escapeHtml(publicLabel(model.technical.responsibility ?? "manager", "Manager"))}</strong></div>
  </article>`;
}

function financePanel(model) {
  const finance = model.finances;
  return `<article class="home-panel">
    <div class="home-panel-head"><div><div class="home-kicker">Finances & Sponsors</div><h2>Commercial position</h2></div><a href="/management.html#commercial">Open Commercial</a></div>
    <div class="home-finance-main">
      <div><span>Cash balance</span><strong>${compactNumber(finance.cash)}</strong><small>${escapeHtml(publicLabel(finance.status, "Status unavailable"))}</small></div>
      <div><span>Monthly net</span><strong class="${Number(finance.monthlyNet ?? 0) < 0 ? "negative" : ""}">${compactNumber(finance.monthlyNet)}</strong><small>Income ${compactNumber(finance.monthlyIncome)} · Expenses ${compactNumber(finance.monthlyExpenses)}</small></div>
    </div>
    <div class="home-commercial-strip">
      <span><strong>${finance.activeDeals}</strong> active sponsors</span>
      <span><strong>${compactNumber(finance.sponsorIncome)}</strong> sponsor income / month</span>
      <span><strong>${finance.openNegotiations}</strong> negotiations</span>
    </div>
  </article>`;
}

function newsPanel(model) {
  return `<article class="home-panel home-news-panel">
    <div class="home-panel-head"><div><div class="home-kicker">F1 World</div><h2>Latest news</h2></div><a href="/world.html">Open F1 World</a></div>
    ${model.news.length ? `<div class="home-news-list">${model.news.map((row) => `<a href="/world.html"><small>${humanDate(row.date)} · ${escapeHtml(publicLabel(row.category, "World"))}</small><strong>${escapeHtml(row.title)}</strong>${row.summary ? `<span>${escapeHtml(row.summary)}</span>` : ""}</a>`).join("")}</div>` : '<div class="home-empty">The world feed will grow as the career evolves.</div>'}
  </article>`;
}

function calendar(model) {
  const timeline = model.calendar.timeline ?? [];
  return `<section id="career-calendar" class="home-section-anchor">
    <div class="home-section-title"><div><div class="home-kicker">Season</div><h2>Recent & upcoming races</h2></div><a href="/championship.html#calendar">Full Calendar</a></div>
    <article class="home-panel"><div class="home-timeline">${timeline.length ? timeline.map((row) => `<div class="${escapeHtml(row.status)}"><i></i><span>${row.round ? `R${row.round} · ` : ""}${escapeHtml(row.label)}</span><small>${humanDate(row.date)}</small></div>`).join("") : '<div class="home-empty">No race timeline yet.</div>'}</div></article>
  </section>`;
}

function renderDashboard(model) {
  const main = APP?.querySelector(".shell > .main");
  if (!main) return false;
  const originalTopbar = main.querySelector(":scope > .topbar");
  [...main.children].forEach((child) => { if (child !== originalTopbar) child.remove(); });

  const primary = safeColour(model.career.identity?.colours?.primary, "#27364A");
  const secondary = safeColour(model.career.identity?.colours?.secondary, "#D9F158");
  main.style.setProperty("--home-team-primary", primary);
  main.style.setProperty("--home-team-secondary", secondary);

  const constructorPosition = model.competition.constructorPosition;
  main.insertAdjacentHTML("beforeend", `
    <section class="home-command">
      <div class="home-command-copy"><div class="home-kicker">Career HQ · ${escapeHtml(model.career.season)}</div><h1>${escapeHtml(model.career.teamName ?? "Formula One")}</h1><p>${escapeHtml(model.career.managerName ?? "Manager")} · ${humanDate(model.career.date)}</p></div>
      <div class="home-command-kpis">
        <div><span>Constructors</span><strong>${constructorPosition ? `P${constructorPosition}` : "—"}</strong><small>${model.competition.constructorPoints} pts</small></div>
        <div><span>Board</span><strong>${model.board?.confidence === null || model.board?.confidence === undefined ? "—" : `${Math.round(model.board.confidence)}%`}</strong><small>${escapeHtml(publicLabel(model.board?.status, "No review"))}</small></div>
        <div><span>Cash</span><strong>${compactNumber(model.finances.cash)}</strong><small>${escapeHtml(publicLabel(model.finances.status, "Financial status"))}</small></div>
        <div><span>Sponsors</span><strong>${model.finances.activeDeals}</strong><small>${compactNumber(model.finances.sponsorIncome)} / month</small></div>
      </div>
    </section>

    <section class="home-focus-grid">
      ${raceFocus(model)}
      <article class="home-panel home-attention-panel"><div class="home-panel-head"><div><div class="home-kicker">Today</div><h2>Needs attention</h2></div></div>${attention(model.attention)}</article>
    </section>

    <section class="home-priority-grid">
      ${inbox(model)}
      ${boardPanel(model)}
    </section>

    <section class="home-operations-grid">
      ${driversPanel(model)}
      ${technicalPanel(model)}
      ${financePanel(model)}
      ${newsPanel(model)}
    </section>

    <section id="career-standings" class="home-section-anchor">
      <div class="home-section-title"><div><div class="home-kicker">Championship</div><h2>Current standings</h2></div><a href="/championship.html#standings">Full Standings</a></div>
      <div class="home-standings-grid"><article class="home-panel"><h2>Drivers' Championship</h2>${standings(model.competition.topDrivers, "driver")}</article><article class="home-panel"><h2>Constructors' Championship</h2>${standings(model.competition.topConstructors, "team")}</article></div>
    </section>

    ${calendar(model)}
  `);
  main.dataset.careerHomeVersion = "2";
  return true;
}

async function enhanceHome() {
  if (rendering || !APP) return;
  const hero = APP.querySelector(".hero .eyebrow");
  if (!hero || !/career home/i.test(hero.textContent ?? "")) return;
  const main = APP.querySelector(".shell > .main");
  if (main?.dataset.careerHomeVersion === "2") return;

  rendering = true;
  try {
    const state = await request("/api/state");
    if (state.screen !== "home") return;
    const teamId = state.career?.controlledTeamId;
    const [management, technical, world, inboxData, teamProfile] = await Promise.all([
      request("/api/management"),
      request("/api/technical"),
      request("/api/world"),
      request("/api/inbox"),
      teamId ? request(`/api/profile?type=team&id=${encodeURIComponent(teamId)}`).catch(() => null) : Promise.resolve(null),
    ]);
    const model = buildCareerHomeModel({ state, management, technical, world, inbox: inboxData, teamProfile });
    renderDashboard(model);
  } catch (error) {
    console.error("Career Home dashboard could not initialize:", error);
  } finally {
    rendering = false;
  }
}

if (APP) {
  const observer = new MutationObserver(() => enhanceHome());
  observer.observe(APP, { childList: true, subtree: true });
  enhanceHome();
  window.addEventListener("popstate", () => window.setTimeout(enhanceHome, 0));
  window.addEventListener("hashchange", () => window.setTimeout(enhanceHome, 0));
}
