import { entityLink } from "/entity-links.js";
import { CAREER_ENTRY_STORAGE_KEY } from "/main-menu-model.js";
import {
  activeCareerNavId,
  buildCareerNavigation,
  careerShellContext,
  continueIntent,
  homeSectionTarget,
  managementTabForHash,
} from "/career-shell-model.js";
import { buildTeamLabelMap, resolveTeamLabelsInText } from "/entity-label-model.js";
import { publicLabel, resolvePublicLabelsInText } from "/presentation-labels.js";

const SHELL_ID = "career-shell-sidebar";
const TOPBAR_ID = "career-shell-topbar";
let shellState = null;
let shellBusy = false;
let teamLabels = new Map();
let labelObserver = null;

async function request(path, options = {}) {
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
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? raw : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function safeColour(value, fallback) {
  const colour = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback;
}

function teamInitials(name) {
  return String(name ?? "Team").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function navMarkup(groups) {
  return groups.map((group) => `
    <section class="career-shell-group">
      <div class="career-shell-group-label">${escapeHtml(group.label)}</div>
      ${group.items.map((item) => `<a class="career-shell-link ${item.active ? "active" : ""}" href="${escapeHtml(item.href)}" data-career-nav="${escapeHtml(item.id)}"><span>${escapeHtml(item.label)}</span>${item.badge ? `<b>${item.badge}</b>` : ""}</a>`).join("")}
    </section>`).join("");
}

function statusCopy(state) {
  if (state.raceWeekend && state.raceWeekend.stage !== "completed") {
    return `${state.raceWeekend.name ?? "Race Weekend"} · ${publicLabel(state.raceWeekend.stage ?? "live")}`;
  }
  if (state.nextRace) return `Next: R${state.nextRace.round ?? "—"} ${state.nextRace.name ?? "Grand Prix"}`;
  return "Championship calendar complete";
}

function renderShell(state, overview = null, teamProfile = null) {
  const context = careerShellContext(state, teamProfile, window.location);
  const intent = context.continue;
  const groups = buildCareerNavigation(window.location, { unreadInbox: overview?.inbox?.unread ?? 0 });
  document.getElementById(SHELL_ID)?.remove();
  document.getElementById(TOPBAR_ID)?.remove();

  document.body.classList.add("career-shell-active");
  document.body.dataset.careerPage = activeCareerNavId(window.location) ?? context.page.id ?? "career";

  const primary = safeColour(context.team.colours?.primary, "#27364A");
  const secondary = safeColour(context.team.colours?.secondary, "#E8FF58");
  const logo = context.team.logoUrl
    ? `<img src="${escapeHtml(context.team.logoUrl)}" alt="">`
    : `<span>${escapeHtml(teamInitials(context.team.name))}</span>`;

  const sidebar = document.createElement("aside");
  sidebar.id = SHELL_ID;
  sidebar.style.setProperty("--career-team-primary", primary);
  sidebar.style.setProperty("--career-team-secondary", secondary);
  sidebar.innerHTML = `
    <a class="career-shell-brand" href="/"><strong>F1</strong><span>MANAGER</span><em>SIM</em></a>
    <a class="career-shell-team" href="${context.team.id ? `/profile.html?type=team&id=${encodeURIComponent(context.team.id)}` : "/"}">
      <i class="career-shell-team-accent"></i>
      <div class="career-shell-team-logo">${logo}</div>
      <div class="career-shell-team-copy"><small>${escapeHtml(context.team.nationality ?? "Formula One Team")}</small><strong>${escapeHtml(context.team.name)}</strong><span>${escapeHtml(context.manager.name)}</span></div>
    </a>
    <nav>${navMarkup(groups)}</nav>
    <div class="career-shell-foot"><span>SEASON ${escapeHtml(context.season ?? "—")}</span><small>${humanDate(context.date)}</small></div>`;

  const topbar = document.createElement("header");
  topbar.id = TOPBAR_ID;
  topbar.style.setProperty("--career-team-primary", primary);
  topbar.style.setProperty("--career-team-secondary", secondary);
  topbar.innerHTML = `
    <div class="career-shell-page"><span>${escapeHtml(context.page.group)}</span><strong>${escapeHtml(context.page.label)}</strong></div>
    <div class="career-shell-event"><span>${escapeHtml(context.event.eyebrow)} · ${escapeHtml(publicLabel(context.event.status, "Upcoming"))}</span><strong>${escapeHtml(context.event.title)}</strong><small>${escapeHtml(context.event.meta)}${context.event.date ? ` · ${humanDate(context.event.date)}` : ""}</small></div>
    <div class="career-shell-manager"><strong>${escapeHtml(context.manager.name)}</strong><span>${escapeHtml(context.manager.nationality ?? context.team.name)}</span></div>
    <div class="career-shell-date"><strong>${humanDate(context.date)}</strong><span>${escapeHtml(context.season ? `Season ${context.season}` : "Career")}</span></div>
    ${intent.visible ? `<button type="button" class="career-shell-continue" data-shell-continue data-kind="${escapeHtml(intent.kind)}" data-href="${escapeHtml(intent.href ?? "/")}">${escapeHtml(intent.label)}</button>` : ""}`;

  document.body.prepend(topbar);
  document.body.prepend(sidebar);
}

function syncActiveNavigation() {
  const active = activeCareerNavId(window.location);
  document.body.dataset.careerPage = active ?? "career";
  document.querySelectorAll("[data-career-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.careerNav === active);
  });
}

function flash(message, tone = "error") {
  let node = document.querySelector(".career-shell-toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "career-shell-toast";
    document.body.append(node);
  }
  node.dataset.tone = tone;
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2800);
}

function shouldResolveTextNode(node) {
  const parent = node?.parentElement;
  if (!parent) return false;
  return !parent.closest("script, style, textarea, input, select, option, [data-show-entity-id]");
}

function resolveTextNode(node) {
  if (!shouldResolveTextNode(node)) return;
  const current = node.nodeValue ?? "";
  const withTeams = teamLabels.size ? resolveTeamLabelsInText(current, teamLabels) : current;
  const resolved = resolvePublicLabelsInText(withTeams);
  if (resolved !== current) node.nodeValue = resolved;
}

function applyPresentationLabels(root = document.body) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    resolveTextNode(root);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) resolveTextNode(walker.currentNode);
}

async function installPresentationLabels(state, setup = null) {
  const rows = [
    ...(setup?.teams ?? []),
    ...(state?.standings?.constructors ?? []),
  ];
  if (state?.career?.controlledTeamId && state?.career?.teamName) {
    rows.push({ id: state.career.controlledTeamId, name: state.career.teamName });
  }
  teamLabels = buildTeamLabelMap(rows);
  applyPresentationLabels(document.body);

  labelObserver?.disconnect();
  labelObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        resolveTextNode(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) applyPresentationLabels(node);
    }
  });
  labelObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

async function runContinue(button) {
  if (shellBusy) return;
  const kind = button.dataset.kind;
  const href = button.dataset.href || "/";
  if (kind === "navigate") {
    window.location.assign(href);
    return;
  }
  shellBusy = true;
  button.disabled = true;
  button.textContent = "ADVANCING…";
  try {
    await request("/api/continue", { method: "POST", body: "{}" });
    window.location.assign(href);
  } catch (error) {
    shellBusy = false;
    button.disabled = false;
    button.textContent = "CONTINUE ▶";
    flash(error.message);
  }
}

function applyManagementDeepLink() {
  if (window.location.pathname !== "/management.html") return false;
  const tab = managementTabForHash(window.location.hash);
  if (!tab) return false;
  const button = document.querySelector(`[data-tab="${CSS.escape(tab)}"]`);
  if (!button) return false;
  if (!button.classList.contains("active")) button.click();
  return true;
}

function applyHomeDeepLink() {
  const target = homeSectionTarget(window.location);
  if (!target) return false;
  const headings = [...document.querySelectorAll("#app h2")];
  const match = target === "calendar"
    ? headings.find((node) => /next grand prix/i.test(node.textContent ?? ""))
    : headings.find((node) => /drivers['’] championship|constructors['’] championship/i.test(node.textContent ?? ""));
  if (!match) return false;
  match.closest("article,section,div")?.scrollIntoView({ block: "start" });
  return true;
}

function applyDeepLink() {
  syncActiveNavigation();
  return applyManagementDeepLink() || applyHomeDeepLink();
}

function installDeepLinks() {
  applyDeepLink();
  const observer = new MutationObserver(() => applyDeepLink());
  const root = document.querySelector("#app, #management-app, #technical-app") ?? document.body;
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 3000);
  window.addEventListener("hashchange", applyDeepLink);
  window.addEventListener("popstate", applyDeepLink);
}

async function installCareerShell() {
  if (sessionStorage.getItem(CAREER_ENTRY_STORAGE_KEY) !== "1") return;
  shellState = await request("/api/state");
  if (shellState.screen === "new_career") {
    if (window.location.pathname !== "/") window.location.replace("/");
    return;
  }

  let overview = null;
  let setup = null;
  let teamProfile = null;
  try { overview = await request("/api/management"); } catch { overview = null; }
  try { setup = await request("/api/setup"); } catch { setup = null; }
  if (shellState.career?.controlledTeamId) {
    try {
      teamProfile = await request(`/api/profile?type=team&id=${encodeURIComponent(shellState.career.controlledTeamId)}`);
    } catch {
      teamProfile = setup?.teams?.find((row) => String(row.id) === String(shellState.career.controlledTeamId)) ?? null;
    }
  }
  renderShell(shellState, overview, teamProfile);
  await installPresentationLabels(shellState, setup);
  installDeepLinks();

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shell-continue]");
    if (button) runContinue(button);
  });
}

installCareerShell().catch((error) => {
  console.error("Career Shell could not initialize:", error);
});
