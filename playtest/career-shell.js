import {
  activeCareerNavId,
  buildCareerNavigation,
  continueIntent,
  homeSectionTarget,
  managementTabForHash,
} from "/career-shell-model.js";

const SHELL_ID = "career-shell-sidebar";
const TOPBAR_ID = "career-shell-topbar";
let shellState = null;
let shellBusy = false;

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

function navMarkup(groups) {
  return groups.map((group) => `
    <section class="career-shell-group">
      <div class="career-shell-group-label">${escapeHtml(group.label)}</div>
      ${group.items.map((item) => `<a class="career-shell-link ${item.active ? "active" : ""}" href="${escapeHtml(item.href)}" data-career-nav="${escapeHtml(item.id)}"><span>${escapeHtml(item.label)}</span>${item.badge ? `<b>${item.badge}</b>` : ""}</a>`).join("")}
    </section>`).join("");
}

function statusCopy(state) {
  if (state.raceWeekend && state.raceWeekend.stage !== "completed") {
    return `${state.raceWeekend.name ?? "Race Weekend"} · ${String(state.raceWeekend.stage ?? "live").replaceAll("_", " ")}`;
  }
  if (state.nextRace) return `Next: R${state.nextRace.round ?? "—"} ${state.nextRace.name ?? "Grand Prix"}`;
  return "Championship calendar complete";
}

function renderShell(state, overview = null) {
  const intent = continueIntent(state);
  const groups = buildCareerNavigation(window.location, { unreadInbox: overview?.inbox?.unread ?? 0 });
  document.getElementById(SHELL_ID)?.remove();
  document.getElementById(TOPBAR_ID)?.remove();

  document.body.classList.add("career-shell-active");
  document.body.dataset.careerPage = activeCareerNavId(window.location) ?? "career";

  const sidebar = document.createElement("aside");
  sidebar.id = SHELL_ID;
  sidebar.innerHTML = `
    <a class="career-shell-brand" href="/"><strong>F1</strong><span>MANAGER</span><em>SIM</em></a>
    <nav>${navMarkup(groups)}</nav>
    <div class="career-shell-foot"><span>PHASE 47</span><small>Persistent Career Shell</small></div>`;

  const topbar = document.createElement("header");
  topbar.id = TOPBAR_ID;
  topbar.innerHTML = `
    <div class="career-shell-manager"><strong>${escapeHtml(state.career?.managerName ?? "Manager")}</strong><span>${escapeHtml(state.career?.teamName ?? "No Team")}</span></div>
    <div class="career-shell-context"><strong>${humanDate(state.career?.date)}</strong><span>${escapeHtml(state.career?.season ?? "")} · ${escapeHtml(statusCopy(state))}</span></div>
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
  shellState = await request("/api/state");
  if (shellState.screen === "new_career") {
    if (window.location.pathname !== "/") window.location.replace("/");
    return;
  }

  let overview = null;
  try { overview = await request("/api/management"); } catch { overview = null; }
  renderShell(shellState, overview);
  installDeepLinks();

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shell-continue]");
    if (button) runContinue(button);
  });
}

installCareerShell().catch((error) => {
  console.error("Career Shell could not initialize:", error);
});
