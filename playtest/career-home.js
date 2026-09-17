import { buildCareerHomeModel } from "/career-home-model.js";

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

function standings(rows = []) {
  if (!rows.length) return '<div class="home-empty">No championship points yet.</div>';
  return `<div class="home-standings">${rows.map((row) => `
    <div class="home-standing-row"><span class="home-position">${row.position ?? "—"}</span><strong>${escapeHtml(row.name ?? row.id)}</strong><span>${Number(row.points ?? 0)} pts</span></div>
  `).join("")}</div>`;
}

function attention(rows = []) {
  if (!rows.length) return '<div class="home-empty">No urgent management actions.</div>';
  return `<div class="home-attention-list">${rows.map((row) => `
    <a class="home-attention ${escapeHtml(row.tone ?? "normal")}" href="${escapeHtml(row.href ?? "/")}"><span>${escapeHtml(row.label)}</span><b>OPEN</b></a>
  `).join("")}</div>`;
}

function inbox(model) {
  const summary = model.inbox.summary ?? {};
  const items = model.inbox.items ?? [];
  return `<article class="home-panel home-inbox">
    <div class="home-panel-head"><div><div class="home-kicker">Inbox</div><h2>Your priorities</h2></div><a href="/management.html#inbox">View Inbox</a></div>
    <div class="home-mini-kpis"><span><strong>${Number(summary.unread ?? 0)}</strong> unread</span><span><strong>${Number(summary.decisionsPending ?? 0)}</strong> decisions</span></div>
    ${items.length ? `<div class="home-inbox-list">${items.map((item) => `<a href="/management.html#inbox" class="${item.unread ? "unread" : ""}"><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.category)} · ${humanDate(item.date)}</small></span>${item.decisionPending ? '<em>DECISION</em>' : ""}</a>`).join("")}</div>` : '<div class="home-empty">Inbox clear.</div>'}
  </article>`;
}

function objectives(board) {
  if (!board?.objectives?.length) return '<div class="home-empty">No active Board objectives.</div>';
  return `<div class="home-objectives">${board.objectives.slice(0, 3).map((row) => `
    <div><span>${escapeHtml(String(row.kind ?? "objective").replaceAll("_", " "))}</span><strong>${escapeHtml(row.status ?? "pending")}</strong></div>
  `).join("")}</div>`;
}

function calendar(model) {
  const next = model.calendar.nextRace;
  const timeline = model.calendar.timeline ?? [];
  return `<section id="career-calendar" class="home-section-anchor home-calendar">
    <div class="home-section-title"><div><div class="home-kicker">Calendar</div><h2>Next Grand Prix</h2></div><a href="/championship.html#calendar">Full calendar</a></div>
    <div class="home-calendar-grid">
      <article class="home-panel home-next-race">${next ? `<span>ROUND ${next.round ?? "—"}</span><h3>${escapeHtml(next.name)}</h3><strong>${humanDate(next.date)}</strong>` : '<span>SEASON</span><h3>Championship calendar complete</h3><strong>Offseason available</strong>'}</article>
      <article class="home-panel"><div class="home-timeline">${timeline.length ? timeline.map((row) => `<div class="${row.status}"><i></i><span>${row.round ? `R${row.round} · ` : ""}${escapeHtml(row.label)}</span><small>${humanDate(row.date)}</small></div>`).join("") : '<div class="home-empty">No race timeline yet.</div>'}</div></article>
    </div>
  </section>`;
}

function technical(model) {
  const summary = model.technical.summary ?? {};
  return `<article class="home-panel">
    <div class="home-panel-head"><div><div class="home-kicker">Car & Development</div><h2>Technical programme</h2></div><a href="/technical.html">Open Technical</a></div>
    <div class="home-stat-grid">
      <div><strong>${Number(summary.activeDesigns ?? 0)}</strong><span>Active designs</span></div>
      <div><strong>${Number(summary.manufacturingJobs ?? 0)}</strong><span>Manufacturing</span></div>
      <div><strong>${Number(summary.readySpecs ?? 0)}</strong><span>Ready specs</span></div>
      <div><strong>${Number(summary.facilityUpgrades ?? 0)}</strong><span>Facility upgrades</span></div>
    </div>
    <div class="home-footnote">Responsibility: <strong>${escapeHtml(model.technical.responsibility ?? "manager")}</strong></div>
  </article>`;
}

function news(model) {
  return `<article class="home-panel">
    <div class="home-panel-head"><div><div class="home-kicker">F1 World</div><h2>Latest news</h2></div><a href="/world.html">Open F1 World</a></div>
    ${model.news.length ? `<div class="home-news-list">${model.news.map((row) => `<a href="/world.html"><small>${humanDate(row.date)} · ${escapeHtml(row.category)}</small><strong>${escapeHtml(row.title)}</strong>${row.summary ? `<span>${escapeHtml(row.summary)}</span>` : ""}</a>`).join("")}</div>` : '<div class="home-empty">The world feed will grow as the career evolves.</div>'}
  </article>`;
}

function renderDashboard(model) {
  const main = APP?.querySelector(".shell > .main");
  if (!main) return false;
  const originalTopbar = main.querySelector(":scope > .topbar");
  [...main.children].forEach((child) => { if (child !== originalTopbar) child.remove(); });

  const constructorPosition = model.competition.constructorPosition;
  const drivers = model.competition.drivers ?? [];
  main.insertAdjacentHTML("beforeend", `
    <section class="home-hero">
      <div><div class="home-kicker">Career Home · ${escapeHtml(model.career.season)}</div><h1>${escapeHtml(model.career.teamName ?? "Formula One")}</h1><p>${escapeHtml(model.career.managerName ?? "Manager")} · ${humanDate(model.career.date)}</p></div>
      <div class="home-team-position"><span>Constructors</span><strong>${constructorPosition ? `P${constructorPosition}` : "—"}</strong><small>${model.competition.constructorPoints} pts</small></div>
    </section>

    <section class="home-priority-grid">
      <article class="home-panel home-attention-panel"><div class="home-panel-head"><div><div class="home-kicker">Today</div><h2>Needs attention</h2></div></div>${attention(model.attention)}</article>
      ${inbox(model)}
    </section>

    <section class="home-overview-grid">
      <article class="home-panel"><div class="home-panel-head"><div><div class="home-kicker">Board</div><h2>Confidence & objectives</h2></div><a href="/management.html#board">Open Board</a></div>${model.board ? `<div class="home-confidence"><strong>${Math.round(Number(model.board.confidence ?? 0))}%</strong><span>${escapeHtml(model.board.status ?? "pending")}</span></div>${objectives(model.board)}` : '<div class="home-empty">No active Board state.</div>'}</article>
      <article class="home-panel"><div class="home-panel-head"><div><div class="home-kicker">Drivers</div><h2>Your line-up</h2></div><a href="/management.html#people">Open Team</a></div><div class="home-driver-list">${drivers.map((driver) => `<div><span><strong>${escapeHtml(driver.name)}</strong><small>${escapeHtml(driver.role)}</small></span><b>${driver.position ? `P${driver.position}` : "—"}</b><em>${driver.points} pts</em></div>`).join("") || '<div class="home-empty">No active drivers.</div>'}</div></article>
      ${technical(model)}
      ${news(model)}
    </section>

    ${calendar(model)}

    <section id="career-standings" class="home-section-anchor home-standings-section">
      <div class="home-section-title"><div><div class="home-kicker">Championship</div><h2>Standings</h2></div><a href="/championship.html#standings">Full standings</a></div>
      <div class="home-standings-grid"><article class="home-panel"><h2>Drivers' Championship</h2>${standings(model.competition.topDrivers)}</article><article class="home-panel"><h2>Constructors' Championship</h2>${standings(model.competition.topConstructors)}</article></div>
    </section>
  `);
  main.dataset.phase48Home = "true";
  return true;
}

async function enhanceHome() {
  if (rendering || !APP) return;
  const hero = APP.querySelector(".hero .eyebrow");
  if (!hero || !/career home/i.test(hero.textContent ?? "")) return;
  const main = APP.querySelector(".shell > .main");
  if (main?.dataset.phase48Home === "true") return;

  rendering = true;
  try {
    const [state, management, technical, world, inboxData] = await Promise.all([
      request("/api/state"),
      request("/api/management"),
      request("/api/technical"),
      request("/api/world"),
      request("/api/inbox"),
    ]);
    if (state.screen !== "home") return;
    const model = buildCareerHomeModel({ state, management, technical, world, inbox: inboxData });
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