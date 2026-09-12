const app = document.querySelector("#app");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
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

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—";
}

function regulationCard(proposal, controlledTeamId) {
  const vote = proposal.controlledTeamVote?.choice ?? "Not voted";
  const changes = proposal.changes ?? {};
  const technical = changes.technical ?? {};
  const grid = changes.grid ?? {};
  const sporting = changes.sporting?.sourceRulePatch ?? {};
  const detailRows = [
    ["Target season", proposal.targetSeason],
    ["Source", proposal.source],
    ["Provenance", proposal.provenance],
    ["Your vote", vote],
    ["Carry-over", technical.carryoverRetention !== undefined ? pct(technical.carryoverRetention) : null],
    ["Reliability carry-over", technical.reliabilityRetention !== undefined ? pct(technical.reliabilityRetention) : null],
    ["Grid min / max", grid.minTeams !== undefined || grid.maxTeams !== undefined ? `${grid.minTeams ?? "—"} / ${grid.maxTeams ?? "—"}` : null],
    ["Sporting fields", Object.keys(sporting).length ? Object.keys(sporting).join(", ") : null],
  ].filter(([, value]) => value !== null && value !== undefined);
  const buttons = controlledTeamId ? `
    <div class="actions">
      <button class="button primary" data-vote="yes" data-proposal="${escapeHtml(proposal.proposalId)}">Vote Yes</button>
      <button class="button negative" data-vote="no" data-proposal="${escapeHtml(proposal.proposalId)}">Vote No</button>
      <button class="button" data-vote="abstain" data-proposal="${escapeHtml(proposal.proposalId)}">Abstain</button>
    </div>` : "";
  return `
    <article class="card">
      <div class="card-head">
        <h3>${escapeHtml(proposal.title)}</h3>
        <span class="tag">${escapeHtml(proposal.category)}</span>
      </div>
      <p class="muted">${escapeHtml(proposal.rationale ?? "No additional rationale supplied.")}</p>
      <div class="details">${detailRows.map(([label, value]) => `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`).join("")}</div>
      ${buttons}
    </article>`;
}

function entryCard(row) {
  return `
    <article class="card">
      <div class="card-head"><h3>${escapeHtml(row.name ?? row.teamId)}</h3><span class="tag">${escapeHtml(row.status ?? "candidate")}</span></div>
      <div class="details">
        <span>Team ID</span><strong>${escapeHtml(row.teamId)}</strong>
        <span>Readiness</span><strong>${escapeHtml(row.readiness ?? "—")}</strong>
        <span>Reputation</span><strong>${escapeHtml(row.reputation ?? "—")}</strong>
        <span>Target season</span><strong>${escapeHtml(row.targetSeason ?? row.referenceEntryYear ?? "—")}</strong>
      </div>
    </article>`;
}

function resolvedCard(row) {
  return `
    <article class="card">
      <div class="card-head"><h3>${escapeHtml(row.title)}</h3><span class="tag">${escapeHtml(row.status)}</span></div>
      <div class="details">
        <span>Target season</span><strong>${escapeHtml(row.targetSeason)}</strong>
        <span>Yes / No / Abstain</span><strong>${escapeHtml(`${row.resolution?.yes ?? 0} / ${row.resolution?.no ?? 0} / ${row.resolution?.abstain ?? 0}`)}</strong>
        <span>Source</span><strong>${escapeHtml(row.source)}</strong>
      </div>
    </article>`;
}

function render(data, error = null) {
  const current = data.regulations.currentPackage ?? {};
  const technical = current.technical ?? {};
  const grid = data.teamEvolution.grid ?? {};
  const open = data.regulations.openProposals ?? [];
  const candidates = data.teamEvolution.candidates ?? [];
  const applications = data.teamEvolution.applications ?? [];
  const resolved = data.regulations.resolvedProposals ?? [];
  const exited = data.teamEvolution.exited ?? [];
  const rebrands = data.teamEvolution.rebrands ?? [];
  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">Developer Playtest · ${escapeHtml(data.date)}</p>
        <h1>Governance & F1 World</h1>
        <p class="muted">Season ${escapeHtml(data.season)} · Historical future rules are reference inputs, never scripted outcomes.</p>
      </div>
      <nav class="nav">
        <a href="/">Career</a>
        <a href="/management.html">Management</a>
        <a href="/technical.html">Technical</a>
      </nav>
    </header>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <section class="grid">
      <div class="kpis">
        <div class="kpi"><span class="muted">Active teams</span><strong>${escapeHtml(grid.activeTeams ?? 0)}</strong></div>
        <div class="kpi"><span class="muted">Grid range</span><strong>${escapeHtml(`${grid.minTeams ?? "—"}–${grid.maxTeams ?? "—"}`)}</strong></div>
        <div class="kpi"><span class="muted">Technical carry-over</span><strong>${escapeHtml(pct(technical.carryoverRetention))}</strong></div>
        <div class="kpi"><span class="muted">Open proposals</span><strong>${escapeHtml(open.length)}</strong></div>
      </div>
      <section class="panel wide">
        <h2>Regulation proposals</h2>
        ${open.length ? open.map((row) => regulationCard(row, data.controlledTeamId)).join("") : '<p class="empty">No regulation vote is currently open.</p>'}
      </section>
      <section class="panel">
        <h2>Team entry candidates</h2>
        ${candidates.length ? candidates.slice(0, 8).map(entryCard).join("") : '<p class="empty">No eligible future team identities are currently applying.</p>'}
      </section>
      <section class="panel">
        <h2>Applications</h2>
        ${applications.length ? applications.slice(-8).map(entryCard).join("") : '<p class="empty">No team entry applications yet.</p>'}
      </section>
      <section class="panel">
        <h2>Controlled team identity</h2>
        ${data.controlledTeamId ? `
          <p class="muted">Stable team ID: <strong>${escapeHtml(data.controlledTeamId)}</strong>. Rebranding changes presentation identity, not the team ID or historical records.</p>
          <form id="rebrand-form" class="rebrand"><input id="rebrand-name" placeholder="New team display name" required /><button class="button" type="submit">Apply Rebrand</button></form>
        ` : '<p class="empty">The manager is unemployed.</p>'}
        ${rebrands.length ? `<p class="muted">Recent rebrands: ${rebrands.slice(-3).map((row) => `${escapeHtml(row.previousName)} → ${escapeHtml(row.newName)}`).join(" · ")}</p>` : ""}
      </section>
      <section class="panel">
        <h2>Teams that left F1</h2>
        ${exited.length ? exited.slice(-8).map((row) => `<article class="card"><h3>${escapeHtml(row.teamId)}</h3><p class="muted">${escapeHtml(row.season)} · ${escapeHtml(row.reason)}</p></article>`).join("") : '<p class="empty">No team has left the championship in this career.</p>'}
      </section>
      <section class="panel wide">
        <h2>Recent governance results</h2>
        ${resolved.length ? resolved.slice(-8).reverse().map(resolvedCard).join("") : '<p class="empty">No proposal has been resolved yet.</p>'}
      </section>
    </section>`;

  document.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api("/api/governance/vote", {
        method: "POST",
        body: JSON.stringify({ proposalId: button.dataset.proposal, choice: button.dataset.vote }),
      });
      await refresh();
    } catch (err) {
      render(data, err.message);
    }
  }));

  document.querySelector("#rebrand-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = document.querySelector("#rebrand-name").value.trim();
    if (!displayName) return;
    try {
      await api("/api/governance/rebrand", { method: "POST", body: JSON.stringify({ displayName }) });
      await refresh();
    } catch (err) {
      render(data, err.message);
    }
  });
}

async function refresh() {
  try {
    render(await api("/api/governance"));
  } catch (error) {
    app.innerHTML = `<div class="error">${escapeHtml(error.message)}</div><p><a class="button" href="/">Return to Career</a></p>`;
  }
}

refresh();
