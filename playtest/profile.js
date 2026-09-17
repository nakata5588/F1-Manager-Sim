import { entityLink } from "/entity-links.js";

const root = document.querySelector("#profile-app");

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

function human(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replaceAll("_", " ");
}

function detail(label, value) {
  return `<div class="profile-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`;
}

function profileMedia(profile, fallback) {
  if (profile.media?.url) return `<img class="profile-media-image" src="${escapeHtml(profile.media.url)}" alt="">`;
  return escapeHtml(fallback);
}

function visualIdentity(identity) {
  if (!identity) return "";
  const colours = Object.values(identity.colours ?? {}).filter(Boolean);
  const swatches = colours.map((colour) => `<span class="profile-swatch" style="background:${escapeHtml(colour)}" title="${escapeHtml(colour)}"></span>`).join("");
  const car = identity.resolvedMedia?.car?.url
    ? `<img class="profile-car-image" src="${escapeHtml(identity.resolvedMedia.car.url)}" alt="Team car media">`
    : "";
  return `<article class="profile-card wide"><h2>Visual Identity</h2><div class="profile-identity"><div><div class="profile-swatches">${swatches}</div>${detail("Source", human(identity.provenance))}${detail("Car template", identity.templates?.car)}${detail("Livery template", identity.templates?.livery)}<p class="profile-muted">Presentation only — visual identity does not affect simulation performance.</p></div>${car}</div></article>`;
}

function attributes(values) {
  if (!values || !Object.keys(values).length) return '<p class="profile-muted">Exact attributes are not available at the current knowledge level.</p>';
  return `<div class="profile-attributes">${Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `<div class="profile-attribute"><span>${escapeHtml(human(key))}</span><strong>${Math.round(Number(value))}</strong></div>`).join("")}</div>`;
}

function person(profile) {
  const employment = profile.employment ?? {};
  const team = employment.teamId ? entityLink("team", employment.teamId, employment.teamName ?? employment.teamId) : "Free agent";
  const recent = profile.recentResults ?? [];
  return `<main class="profile-shell">
    <section class="profile-hero">
      <div class="profile-media">${profileMedia(profile, (profile.name ?? "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div>
      <div><div class="profile-eyebrow">${escapeHtml(profile.type)} profile · ${escapeHtml(profile.id)}</div><h1>${escapeHtml(profile.name)}</h1><div class="profile-subtitle">${escapeHtml(profile.nationality ?? "Nationality unknown")} · ${profile.age ?? "Age unknown"} · ${team}</div></div>
      <div class="profile-status">${escapeHtml(human(profile.visibilityState))}</div>
    </section>
    <section class="profile-grid">
      <article class="profile-card"><h2>Career Status</h2>${detail("Role", human(employment.role))}${detail("Status", human(employment.status))}${detail("Contract until", employment.contractUntil)}${profile.type === "driver" ? detail("Scouting knowledge", `${Math.round(profile.scoutingKnowledge ?? 0)}%`) : detail("Recruitment", profile.recruitment?.eligible ? "Available through staff market" : human(profile.recruitment?.reason))}</article>
      <article class="profile-card"><h2>Current State</h2>${profile.careerState ? `${detail("Current ability", profile.careerState.currentAbility)}${detail("Potential ability", profile.careerState.potentialAbility)}${detail("Reputation", profile.careerState.reputation)}${detail("Morale", profile.careerState.morale)}` : '<p class="profile-muted">Detailed internal state is only shown for people employed by your team.</p>'}</article>
      <article class="profile-card wide"><h2>Attributes</h2>${attributes(profile.attributes)}</article>
      ${profile.type === "driver" ? `<article class="profile-card wide"><h2>Recent Race Results</h2>${recent.length ? `<div class="profile-list">${recent.map((row) => `<div class="profile-list-row"><div><strong>${escapeHtml(row.raceName)}</strong><div class="profile-muted">${humanDate(row.date)}${row.teamId ? ` · ${entityLink("team", row.teamId, row.teamName ?? row.teamId)}` : ""}</div></div><span>P${row.position ?? "—"}</span><span>${row.points ?? 0} pts</span></div>`).join("")}</div>` : '<p class="profile-muted">No archived race results yet.</p>'}</article>` : ""}
    </section>
  </main>`;
}

function roster(title, type, rows) {
  return `<article class="profile-card"><h2>${escapeHtml(title)}</h2>${rows?.length ? `<div class="profile-list">${rows.map((row) => `<div class="profile-list-row"><strong>${entityLink(type, row.id, row.name)}</strong><span>${escapeHtml(human(row.role))}</span><span></span></div>`).join("")}</div>` : '<p class="profile-muted">No current records.</p>'}</article>`;
}

function team(profile) {
  return `<main class="profile-shell">
    <section class="profile-hero">
      <div class="profile-media">${profileMedia(profile, (profile.name ?? "T").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div>
      <div><div class="profile-eyebrow">Team profile · ${escapeHtml(profile.id)}</div><h1>${escapeHtml(profile.name)}</h1><div class="profile-subtitle">${escapeHtml(profile.nationality ?? "Formula One constructor")}</div></div>
      <div class="profile-status">${profile.controlled ? "Your team" : escapeHtml(human(profile.visibilityState))}</div>
    </section>
    <section class="profile-grid">
      <article class="profile-card"><h2>Championship</h2>${detail("Points", profile.championship?.points ?? 0)}${detail("Wins", profile.championship?.wins ?? 0)}${detail("Reputation", profile.reputation)}</article>
      <article class="profile-card"><h2>Organisation</h2>${detail("Drivers", profile.drivers?.length ?? 0)}${detail("Staff", profile.staff?.length ?? 0)}${detail("Entered season", profile.evolution?.enteredSeason)}</article>
      ${profile.finances ? `<article class="profile-card wide"><h2>Finances</h2>${detail("Cash", profile.finances.cash)}${detail("Monthly income", profile.finances.monthlyIncome)}${detail("Monthly expenses", profile.finances.monthlyExpenses)}${detail("Monthly net", profile.finances.monthlyNet)}${detail("Status", human(profile.finances.financialStatus))}</article>` : ""}
      ${visualIdentity(profile.visualIdentity)}
      ${roster("Drivers", "driver", profile.drivers)}${roster("Staff", "staff", profile.staff)}
    </section>
  </main>`;
}

async function load() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const id = params.get("id");
  if (!type || !id) throw new Error("Profile type and id are required.");
  const response = await fetch(`/api/profile?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { headers: { "content-type": "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Profile request failed (${response.status})`);
  document.title = `${payload.name} — F1 Manager Sim`;
  root.innerHTML = payload.type === "team" ? team(payload) : person(payload);
}

load().catch((error) => {
  root.innerHTML = `<div class="profile-error"><strong>Profile unavailable</strong><p>${escapeHtml(error.message)}</p><a class="profile-back" href="/">Return to Career</a></div>`;
});
