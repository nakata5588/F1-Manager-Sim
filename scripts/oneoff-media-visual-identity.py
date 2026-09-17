from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Entity profile projection: add presentation-only team visual identity.
replace_once(
    "src/app/entityProfilePlaytest.js",
    'import { staffRecruitmentEligibility } from "../game/management/staffRecruitment.js";\n',
    'import { staffRecruitmentEligibility } from "../game/management/staffRecruitment.js";\nimport { teamVisualIdentity } from "../presentation/teamVisualIdentity.js";\n',
)
replace_once(
    "src/app/entityProfilePlaytest.js",
    '    media: { category: "teamLogo", entityId: String(id), status: "media_pack_pending_resolver" },\n    championship: standingsForTeam(saveWorld, id),',
    '    media: { category: "teamLogo", entityId: String(id), status: "media_pack_pending_resolver" },\n    visualIdentity: teamVisualIdentity(saveWorld, id, { displayName: currentTeamName(saveWorld, id) }),\n    championship: standingsForTeam(saveWorld, id),',
)

# Playtest server: select/load pack, safely serve files, and enrich profile/API metadata.
replace_once(
    "scripts/playtest-server.js",
    'import { developerEntityProfile } from "../src/app/entityProfilePlaytest.js";\n',
    'import { developerEntityProfile } from "../src/app/entityProfilePlaytest.js";\nimport {\n  builtinMediaFallbackSvg,\n  loadMediaPack,\n  mediaContentType,\n  mediaPackSummary,\n  resolveMediaAsset,\n  resolveServedMediaPath,\n} from "../src/media/mediaPack.js";\n',
)
replace_once(
    "scripts/playtest-server.js",
    '  console.error("Usage: npm run playtest -- <season-db.json|json.gz> [--global-world <global.json|json.gz>] [--save-dir <directory>] [--port 3000] [--host 127.0.0.1]");',
    '  console.error("Usage: npm run playtest -- <season-db.json|json.gz> [--global-world <global.json|json.gz>] [--media-pack <directory>] [--save-dir <directory>] [--port 3000] [--host 127.0.0.1]");',
)
replace_once(
    "scripts/playtest-server.js",
    '    globalWorld: null,\n    saveDir: resolve(process.cwd(), "build/playtest-saves"),',
    '    globalWorld: null,\n    mediaPack: resolve(__dirname, "../media-packs/default"),\n    mediaPackExplicit: false,\n    saveDir: resolve(process.cwd(), "build/playtest-saves"),',
)
replace_once(
    "scripts/playtest-server.js",
    '    if (value === "--global-world") args.globalWorld = argv[++index];\n    else if (value === "--save-dir") args.saveDir = resolve(argv[++index]);',
    '    if (value === "--global-world") args.globalWorld = argv[++index];\n    else if (value === "--media-pack") { args.mediaPack = resolve(argv[++index]); args.mediaPackExplicit = true; }\n    else if (value === "--save-dir") args.saveDir = resolve(argv[++index]);',
)
replace_once(
    "scripts/playtest-server.js",
    'const session = new DeveloperPlaytestSession(seasonDatabase, { globalDatabase });\nconst saveStore = new FileSaveSlotStore(args.saveDir);\n',
    'const session = new DeveloperPlaytestSession(seasonDatabase, { globalDatabase });\nconst saveStore = new FileSaveSlotStore(args.saveDir);\nconst mediaPack = loadMediaPack(args.mediaPack, { required: args.mediaPackExplicit });\n',
)
replace_once(
    "scripts/playtest-server.js",
    'function autosavedJson(response, payload) {\n  autosave();\n  return json(response, 200, payload);\n}\n\nconst server = createServer',
    '''function autosavedJson(response, payload) {\n  autosave();\n  return json(response, 200, payload);\n}\n\nfunction profileWithResolvedMedia(profile) {\n  const kind = profile.media?.category ?? (profile.type === "team" ? "teamLogo" : profile.type);\n  const projected = { ...profile, media: resolveMediaAsset(mediaPack, kind, profile.id) };\n  if (profile.visualIdentity?.media) {\n    projected.visualIdentity = {\n      ...profile.visualIdentity,\n      resolvedMedia: Object.fromEntries(Object.entries(profile.visualIdentity.media).map(([slot, descriptor]) => [\n        slot,\n        resolveMediaAsset(mediaPack, descriptor.kind, descriptor.entityId),\n      ])),\n    };\n  }\n  return projected;\n}\n\nconst server = createServer''',
)
replace_once(
    "scripts/playtest-server.js",
    '    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);\n    if (url.pathname === "/api/setup" && request.method === "GET") return json(response, 200, session.setup());',
    '''    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);\n    if (request.method === "GET" && url.pathname.startsWith("/media/fallback/")) {\n      const leaf = url.pathname.slice("/media/fallback/".length);\n      if (!leaf.endsWith(".svg")) return json(response, 404, { error: "Media fallback not found" });\n      const kind = decodeURIComponent(leaf.slice(0, -4));\n      const svg = builtinMediaFallbackSvg(kind);\n      response.writeHead(200, {\n        "content-type": "image/svg+xml; charset=utf-8",\n        "content-length": Buffer.byteLength(svg),\n        "cache-control": "no-store",\n      });\n      response.end(svg);\n      return;\n    }\n    if (request.method === "GET" && url.pathname.startsWith("/media/assets/")) {\n      const encoded = url.pathname.slice("/media/assets/".length);\n      let relativePath;\n      try { relativePath = encoded.split("/").map((segment) => decodeURIComponent(segment)).join("/"); }\n      catch { return json(response, 400, { error: "Invalid media path encoding" }); }\n      const asset = resolveServedMediaPath(mediaPack, relativePath);\n      if (!asset) return json(response, 404, { error: "Media asset not found" });\n      response.writeHead(200, { "content-type": mediaContentType(asset.extension), "cache-control": "no-store" });\n      createReadStream(asset.path).pipe(response);\n      return;\n    }\n    if (url.pathname === "/api/media-pack" && request.method === "GET") return json(response, 200, mediaPackSummary(mediaPack));\n    if (url.pathname === "/api/media/resolve" && request.method === "GET") {\n      return json(response, 200, resolveMediaAsset(mediaPack, url.searchParams.get("kind"), url.searchParams.get("id")));\n    }\n    if (url.pathname === "/api/setup" && request.method === "GET") return json(response, 200, session.setup());''',
)
replace_once(
    "scripts/playtest-server.js",
    '    if (url.pathname === "/api/profile" && request.method === "GET") {\n      return json(response, 200, developerEntityProfile(session, url.searchParams.get("type"), url.searchParams.get("id")));\n    }',
    '    if (url.pathname === "/api/profile" && request.method === "GET") {\n      return json(response, 200, profileWithResolvedMedia(developerEntityProfile(session, url.searchParams.get("type"), url.searchParams.get("id"))));\n    }',
)
replace_once(
    "scripts/playtest-server.js",
    '  console.log(`Save slots: ${args.saveDir}`);\n});',
    '  console.log(`Save slots: ${args.saveDir}`);\n  const media = mediaPackSummary(mediaPack);\n  console.log(`Media Pack: ${media.available ? `${media.name} (${media.id})` : `built-in fallbacks (${media.reason})`}`);\n});',
)

# Profile UI: use resolved media and expose visual identity without making it authoritative.
replace_once(
    "playtest/profile.js",
    'function detail(label, value) {\n  return `<div class="profile-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`;\n}\n',
    '''function detail(label, value) {\n  return `<div class="profile-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`;\n}\n\nfunction profileMedia(profile, fallback) {\n  if (profile.media?.url) return `<img class="profile-media-image" src="${escapeHtml(profile.media.url)}" alt="">`;\n  return escapeHtml(fallback);\n}\n\nfunction visualIdentity(identity) {\n  if (!identity) return "";\n  const colours = Object.values(identity.colours ?? {}).filter(Boolean);\n  const swatches = colours.map((colour) => `<span class="profile-swatch" style="background:${escapeHtml(colour)}" title="${escapeHtml(colour)}"></span>`).join("");\n  const car = identity.resolvedMedia?.car?.url\n    ? `<img class="profile-car-image" src="${escapeHtml(identity.resolvedMedia.car.url)}" alt="Team car media">`\n    : "";\n  return `<article class="profile-card wide"><h2>Visual Identity</h2><div class="profile-identity"><div><div class="profile-swatches">${swatches}</div>${detail("Source", human(identity.provenance))}${detail("Car template", identity.templates?.car)}${detail("Livery template", identity.templates?.livery)}<p class="profile-muted">Presentation only — visual identity does not affect simulation performance.</p></div>${car}</div></article>`;\n}\n''',
)
replace_once(
    "playtest/profile.js",
    '<div class="profile-media">${escapeHtml((profile.name ?? "?").split(/\\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div>',
    '<div class="profile-media">${profileMedia(profile, (profile.name ?? "?").split(/\\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div>',
)
replace_once(
    "playtest/profile.js",
    '<div class="profile-media">${escapeHtml((profile.name ?? "T").split(/\\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div>',
    '<div class="profile-media">${profileMedia(profile, (profile.name ?? "T").split(/\\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div>',
)
replace_once(
    "playtest/profile.js",
    '      ${profile.finances ? `<article class="profile-card wide"><h2>Finances</h2>${detail("Cash", profile.finances.cash)}${detail("Monthly income", profile.finances.monthlyIncome)}${detail("Monthly expenses", profile.finances.monthlyExpenses)}${detail("Monthly net", profile.finances.monthlyNet)}${detail("Status", human(profile.finances.financialStatus))}</article>` : ""}\n      ${roster("Drivers", "driver", profile.drivers)}${roster("Staff", "staff", profile.staff)}',
    '      ${profile.finances ? `<article class="profile-card wide"><h2>Finances</h2>${detail("Cash", profile.finances.cash)}${detail("Monthly income", profile.finances.monthlyIncome)}${detail("Monthly expenses", profile.finances.monthlyExpenses)}${detail("Monthly net", profile.finances.monthlyNet)}${detail("Status", human(profile.finances.financialStatus))}</article>` : ""}\n      ${visualIdentity(profile.visualIdentity)}\n      ${roster("Drivers", "driver", profile.drivers)}${roster("Staff", "staff", profile.staff)}',
)

css_path = Path("playtest/profile.css")
css = css_path.read_text(encoding="utf-8")
css += '\n.profile-media-image{width:100%;height:100%;object-fit:cover;border-radius:11px}.profile-identity{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,420px);gap:24px;align-items:center}.profile-swatches{display:flex;gap:10px;margin:0 0 14px}.profile-swatch{width:52px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,.28)}.profile-car-image{width:100%;max-height:180px;object-fit:contain;border-radius:10px;background:#10161e}@media(max-width:900px){.profile-identity{grid-template-columns:1fr}}\n'
css_path.write_text(css, encoding="utf-8")

# Add parse coverage for the new runtime modules.
replace_once(
    "tests/playtestAssets.test.js",
    '  "src/app/entityProfilePlaytest.js",\n  "src/save/slotStore.js",',
    '  "src/app/entityProfilePlaytest.js",\n  "src/media/mediaPack.js",\n  "src/presentation/teamVisualIdentity.js",\n  "src/save/slotStore.js",',
)
