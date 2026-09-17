from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace(path, before, after):
    source = read(path)
    if before not in source:
        raise RuntimeError(f"Expected anchor not found in {path}: {before[:150]!r}")
    write(path, source.replace(before, after, 1))

# Fix nullish/logical operator precedence in the new projection.
replace("src/app/entityProfilePlaytest.js",
'''      season: race.season ?? String(race.date ?? "").slice(0, 4) || null,''',
'''      season: race.season ?? (String(race.date ?? "").slice(0, 4) || null),''')

# API route.
replace("scripts/playtest-server.js",
'''import { developerWorld } from "../src/app/worldPlaytest.js";''',
'''import { developerWorld } from "../src/app/worldPlaytest.js";
import { developerEntityProfile } from "../src/app/entityProfilePlaytest.js";''')
replace("scripts/playtest-server.js",
'''    if (url.pathname === "/api/world" && request.method === "GET") {
      return json(response, 200, developerWorld(session, {''',
'''    if (url.pathname === "/api/profile" && request.method === "GET") {
      return json(response, 200, developerEntityProfile(session, url.searchParams.get("type"), url.searchParams.get("id")));
    }
    if (url.pathname === "/api/world" && request.method === "GET") {
      return json(response, 200, developerWorld(session, {''')

# Main career / race surface.
replace("playtest/app.js", '''const root = document.querySelector("#app");''', '''import { entityLink } from "/entity-links.js";

const root = document.querySelector("#app");''')
replace("playtest/app.js",
'''function standingsList(rows) {
  if (!rows?.length) return '<div class="muted">No championship points yet.</div>';
  return `<div class="list">${rows.slice(0, 8).map((row) => `
    <div class="row"><span class="pos">${row.position}</span><span class="grow">${escapeHtml(row.name)}</span><span class="points">${row.points}</span></div>
  `).join("")}</div>`;
}''',
'''function standingsList(rows, type) {
  if (!rows?.length) return '<div class="muted">No championship points yet.</div>';
  return `<div class="list">${rows.slice(0, 8).map((row) => `
    <div class="row"><span class="pos">${row.position}</span><span class="grow">${entityLink(type, row.id, row.name)}</span><span class="points">${row.points}</span></div>
  `).join("")}</div>`;
}''')
replace("playtest/app.js",
'''<div class="manager"><strong>${escapeHtml(state.career.managerName)}</strong><span>${escapeHtml(state.career.teamName)}</span></div>''',
'''<div class="manager"><strong>${escapeHtml(state.career.managerName)}</strong><span>${entityLink("team", state.career.controlledTeamId, state.career.teamName)}</span></div>''')
replace("playtest/app.js",
'''shell(`<section class="hero"><div class="eyebrow">Career Home</div><h1>${escapeHtml(state.career.teamName)}</h1>''',
'''shell(`<section class="hero"><div class="eyebrow">Career Home</div><h1>${entityLink("team", state.career.controlledTeamId, state.career.teamName)}</h1>''')
replace("playtest/app.js",
'''${state.teamDrivers.map((driver) => `<div class="row"><span>${escapeHtml(driver.name)}</span><span class="muted">${escapeHtml(driver.role)}</span></div>`).join("")}''',
'''${state.teamDrivers.map((driver) => `<div class="row"><span>${entityLink("driver", driver.id, driver.name)}</span><span class="muted">${escapeHtml(driver.role)}</span></div>`).join("")}''')
replace("playtest/app.js", '''${standingsList(state.standings.drivers)}''', '''${standingsList(state.standings.drivers, "driver")}''')
replace("playtest/app.js", '''${standingsList(state.standings.constructors)}''', '''${standingsList(state.standings.constructors, "team")}''')
# second occurrence pair in results
source = read("playtest/app.js")
source = source.replace('${standingsList(state.standings.drivers)}', '${standingsList(state.standings.drivers, "driver")}', 1)
source = source.replace('${standingsList(state.standings.constructors)}', '${standingsList(state.standings.constructors, "team")}', 1)
write("playtest/app.js", source)
replace("playtest/app.js", '''<div class="eyebrow">${escapeHtml(driver.driverName)}</div><h2>Car Setup</h2>''', '''<div class="eyebrow">${entityLink("driver", driver.driverId, driver.driverName)}</div><h2>Car Setup</h2>''')
replace("playtest/app.js", '''<td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td><td>${number(row.score)}</td>''', '''<td>${entityLink("driver", row.driverId, row.driverName)}</td><td>${entityLink("team", row.teamId, row.teamName)}</td><td>${number(row.score)}</td>''')
replace("playtest/app.js", '''<td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td></tr>`).join("")}</tbody></table>`;
}''', '''<td>${entityLink("driver", row.driverId, row.driverName)}</td><td>${entityLink("team", row.teamId, row.teamName)}</td></tr>`).join("")}</tbody></table>`;
}''')
replace("playtest/app.js", '''<div class="eyebrow">${escapeHtml(plan.driverName)}</div><h2>Race Strategy</h2>''', '''<div class="eyebrow">${entityLink("driver", plan.driverId, plan.driverName)}</div><h2>Race Strategy</h2>''')
replace("playtest/app.js", '''<article class="pit-card" data-driver="${escapeHtml(plan.driverId)}"><div><strong>${escapeHtml(plan.driverName)}</strong>''', '''<article class="pit-card" data-driver="${escapeHtml(plan.driverId)}"><div><strong>${entityLink("driver", plan.driverId, plan.driverName)}</strong>''')
replace("playtest/app.js", '''<td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td><td>${row.position === 1 ? "LEADER"''', '''<td>${entityLink("driver", row.driverId, row.driverName)}</td><td>${entityLink("team", row.teamId, row.teamName)}</td><td>${row.position === 1 ? "LEADER"''')
replace("playtest/app.js", '''<td>${escapeHtml(row.driverName)}</td><td>${escapeHtml(row.teamName)}</td><td>${escapeHtml(row.status ?? "FINISHED")}</td>''', '''<td>${entityLink("driver", row.driverId, row.driverName)}</td><td>${entityLink("team", row.teamId, row.teamName)}</td><td>${escapeHtml(row.status ?? "FINISHED")}</td>''')

# Management surface.
replace("playtest/management.js", '''const root = document.querySelector("#management-app");''', '''import { entityLink } from "/entity-links.js";

const root = document.querySelector("#management-app");''')
replace("playtest/management.js", '''<h3>${escapeHtml(row.name)}</h3></div><strong class="morale-badge">''', '''<h3>${entityLink(row.type, row.id, row.name)}</h3></div><strong class="morale-badge">''')
replace("playtest/management.js", '''<td><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")} · ${escapeHtml(row.visibilityState ?? "")}</div></td>''', '''<td><strong>${entityLink("driver", row.id, row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")} · ${escapeHtml(row.visibilityState ?? "")}</div></td>''')
replace("playtest/management.js", '''<td><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")}</div></td><td>${escapeHtml(row.role)}</td>''', '''<td><strong>${entityLink("staff", row.id, row.name)}</strong><div class="muted small">${escapeHtml(row.nationality ?? "—")}</div></td><td>${escapeHtml(row.role)}</td>''')
replace("playtest/management.js", '''<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${Math.round(row.reputation)}</td>''', '''<tr><td><strong>${entityLink("team", row.id, row.name)}</strong></td><td>${Math.round(row.reputation)}</td>''')
replace("playtest/management.js", '''<p><strong>${escapeHtml(row.teamId)}</strong> · future season ${row.startSeason}</p>''', '''<p><strong>${entityLink("team", row.teamId, row.teamName ?? row.teamId)}</strong> · future season ${row.startSeason}</p>''')
replace("playtest/management.js", '''<h2>${escapeHtml(selectedNegotiation.driverName)}</h2>''', '''<h2>${entityLink("driver", selectedNegotiation.driverId, selectedNegotiation.driverName)}</h2>''')
replace("playtest/management.js", '''<td><strong>${escapeHtml(row.driverName)}</strong></td><td>${escapeHtml(row.status)}</td>''', '''<td><strong>${entityLink("driver", row.driverId, row.driverName)}</strong></td><td>${escapeHtml(row.status)}</td>''')
replace("playtest/management.js", '''<h2>${escapeHtml(selectedStaffNegotiation.staffName)}</h2>''', '''<h2>${entityLink("staff", selectedStaffNegotiation.staffId, selectedStaffNegotiation.staffName)}</h2>''')
replace("playtest/management.js", '''<td>${escapeHtml(row.staffName)}</td><td>${escapeHtml(row.status)}</td>''', '''<td>${entityLink("staff", row.staffId, row.staffName)}</td><td>${escapeHtml(row.status)}</td>''')

# Championship surface.
replace("playtest/championship.js", '''const root = document.querySelector("#championship-app");''', '''import { entityLink } from "/entity-links.js";

const root = document.querySelector("#championship-app");''')
replace("playtest/championship.js", '''${row.winner ? `<strong>${escapeHtml(row.winner.driverName)}</strong><small>${escapeHtml(row.winner.teamName)}</small>`''', '''${row.winner ? `<strong>${entityLink("driver", row.winner.driverId, row.winner.driverName)}</strong><small>${entityLink("team", row.winner.teamId, row.winner.teamName)}</small>`''')
replace("playtest/championship.js", '''function table(title, rows, controlledTeamId = null) {''', '''function table(title, rows, type, controlledTeamId = null) {''')
replace("playtest/championship.js", '''<strong>${escapeHtml(row.name ?? row.id)}</strong><span>${Number(row.wins ?? 0)} W</span>''', '''<strong>${entityLink(type, row.id, row.name ?? row.id)}</strong><span>${Number(row.wins ?? 0)} W</span>''')
replace("playtest/championship.js", '''${table("Drivers' Championship", championship.standings?.drivers ?? [])}${table("Constructors' Championship", championship.standings?.constructors ?? [], championship.controlledTeamId)}''', '''${table("Drivers' Championship", championship.standings?.drivers ?? [], "driver")}${table("Constructors' Championship", championship.standings?.constructors ?? [], "team", championship.controlledTeamId)}''')

# F1 World records.
replace("playtest/world.js", '''const app = document.querySelector("#app");''', '''import { entityLink } from "/entity-links.js";

const app = document.querySelector("#app");''')
replace("playtest/world.js", '''<td><strong>${escapeHtml(row.name ?? row.id)}</strong><span class="sub">${escapeHtml(row.id)}</span></td>''', '''<td><strong>${entityLink(kind === "Driver" ? "driver" : "team", row.id, row.name ?? row.id)}</strong><span class="sub">${escapeHtml(row.id)}</span></td>''')

# Persistent shell topbar.
replace("playtest/career-shell.js", '''import {
  activeCareerNavId,''', '''import { entityLink } from "/entity-links.js";
import {
  activeCareerNavId,''')
replace("playtest/career-shell.js", '''<div class="career-shell-manager"><strong>${escapeHtml(state.career?.managerName ?? "Manager")}</strong><span>${escapeHtml(state.career?.teamName ?? "No Team")}</span></div>''', '''<div class="career-shell-manager"><strong>${escapeHtml(state.career?.managerName ?? "Manager")}</strong><span>${state.career?.controlledTeamId ? entityLink("team", state.career.controlledTeamId, state.career?.teamName ?? state.career.controlledTeamId) : escapeHtml("No Team")}</span></div>''')

# Shared visual link treatment outside the profile-specific stylesheet.
path = "playtest/styles.css"
source = read(path)
if ".entity-link" not in source:
    source += '\n.entity-link{color:inherit;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.22)}\n.entity-link:hover{border-bottom-color:currentColor}\n'
    write(path, source)

print("Entity profile routing and links wired.")
