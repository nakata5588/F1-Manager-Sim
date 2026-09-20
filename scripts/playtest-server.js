#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DeveloperPlaytestSession } from "../src/app/developerPlaytest.js";
import { restoreDeveloperPlaytestSession, validateDeveloperSaveCompatibility } from "../src/app/developerPersistence.js";
import { AUTOSAVE_SLOT, FileSaveSlotStore } from "../src/save/slotStore.js";
import {
  developerApplyManagerJob,
  developerArchiveInboxItem,
  developerBoard,
  developerCommercial,
  developerContractNegotiations,
  developerInbox,
  developerManagementOverview,
  developerManagementPlanning,
  developerManagerCareer,
  developerMarkInboxRead,
  developerMarket,
  developerOpenDriverNegotiation,
  developerOpenSponsorNegotiation,
  developerOpenStaffNegotiation,
  developerPeople,
  developerRecruitment,
  developerResolveInboxDecision,
  developerResolveSponsorActivity,
  developerResponsibilities,
  developerSetResponsibility,
  developerSetShortlist,
  developerStaffContractNegotiations,
  developerStaffRecruitment,
  developerStartScouting,
  developerSubmitBoardRequest,
  developerSubmitDriverOffer,
  developerSubmitSponsorOffer,
  developerSubmitStaffOffer,
  developerWithdrawDriverNegotiation,
  developerWithdrawSponsorNegotiation,
  developerWithdrawStaffNegotiation,
} from "../src/app/managementPlaytest.js";
import {
  developerAcceptSupplierCounter,
  developerFitTechnicalSpec,
  developerOpenSupplierNegotiation,
  developerRebuildComponent,
  developerReplaceWornComponent,
  developerRunPreseasonTest,
  developerServiceEngine,
  developerStartFacilityUpgrade,
  developerStartManufacturing,
  developerStartTechnicalDesign,
  developerSubmitSupplierOffer,
  developerTechnical,
  developerWithdrawSupplierNegotiation,
} from "../src/app/technicalPlaytest.js";
import {
  developerCastGovernanceVote,
  developerGovernance,
  developerRebrandControlledTeam,
} from "../src/app/governancePlaytest.js";
import {
  developerConfirmOffseasonPlan,
  developerContinueCalendar,
  developerOffseason,
  developerUpdateOffseasonPlan,
} from "../src/app/offseasonPlaytest.js";
import { developerWorld } from "../src/app/worldPlaytest.js";
import { developerEntityProfile } from "../src/app/entityProfilePlaytest.js";
import {
  builtinMediaFallbackSvg,
  loadMediaPack,
  mediaContentType,
  mediaPackSummary,
  resolveMediaAsset,
  resolveServedMediaPath,
} from "../src/media/mediaPack.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = resolve(__dirname, "../playtest");

function usage() {
  console.error("Usage: npm run playtest -- <season-db.json|json.gz> [--global-world <global.json|json.gz>] [--media-pack <directory>] [--save-dir <directory>] [--port 3000] [--host 127.0.0.1]");
  process.exit(1);
}

function readPayload(path) {
  const buffer = readFileSync(path);
  const text = path.endsWith(".gz") ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  return JSON.parse(text);
}

function parseArgs(argv) {
  const args = {
    seasonDb: null,
    globalWorld: null,
    mediaPack: resolve(__dirname, "../media-packs/default"),
    mediaPackExplicit: false,
    saveDir: resolve(process.cwd(), "build/playtest-saves"),
    port: 3000,
    host: "127.0.0.1",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--global-world") args.globalWorld = argv[++index];
    else if (value === "--media-pack") { args.mediaPack = resolve(argv[++index]); args.mediaPackExplicit = true; }
    else if (value === "--save-dir") args.saveDir = resolve(argv[++index]);
    else if (value === "--port") args.port = Number(argv[++index]);
    else if (value === "--host") args.host = argv[++index];
    else if (!value.startsWith("-") && !args.seasonDb) args.seasonDb = value;
    else usage();
  }
  if (!args.seasonDb || !Number.isInteger(args.port) || args.port < 1 || args.port > 65535) usage();
  return args;
}

function json(response, status, payload) {
  const bodyText = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(bodyText),
    "cache-control": "no-store",
  });
  response.end(bodyText);
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function contentType(path) {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

function staticPath(urlPath) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const relative = normalize(requested).replace(/^([/\\])+/, "");
  const candidate = resolve(STATIC_ROOT, relative);
  if (candidate !== STATIC_ROOT && !candidate.startsWith(`${STATIC_ROOT}${sep}`)) return null;
  return candidate;
}

function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const path = staticPath(url.pathname);
  if (!path || !existsSync(path) || !statSync(path).isFile()) return false;
  response.writeHead(200, { "content-type": contentType(path), "cache-control": "no-store" });
  createReadStream(path).pipe(response);
  return true;
}

function apiError(response, error) {
  json(response, 400, { error: error instanceof Error ? error.message : String(error) });
}

function recruitmentFilters(url) {
  const number = (name) => {
    const value = url.searchParams.get(name);
    if (value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    query: url.searchParams.get("query") ?? undefined,
    nationality: url.searchParams.get("nationality") ?? undefined,
    availability: url.searchParams.get("availability") ?? undefined,
    minAge: number("minAge"),
    maxAge: number("maxAge"),
    shortlisted: url.searchParams.get("shortlisted") === "true" ? true : undefined,
  };
}

const args = parseArgs(process.argv.slice(2));
const seasonDatabase = readPayload(args.seasonDb);
const globalDatabase = args.globalWorld ? readPayload(args.globalWorld) : null;
const session = new DeveloperPlaytestSession(seasonDatabase, { globalDatabase });
const saveStore = new FileSaveSlotStore(args.saveDir);
const mediaPack = loadMediaPack(args.mediaPack, { required: args.mediaPackExplicit });

function syncManagerControl() {
  if (!session.saveWorld) return;
  developerManagementOverview(session);
}

function autosave() {
  if (!session.saveWorld) return null;
  return saveStore.save(AUTOSAVE_SLOT, session.requireCareer(), { pretty: false });
}

function autosavedJson(response, payload) {
  autosave();
  return json(response, 200, payload);
}

function projectedSaveSlots() {
  return saveStore.list().map((row) => {
    if (row.invalid) return { ...row, compatible: false, compatibilityError: "Invalid save file." };
    try {
      const loaded = saveStore.load(row.slot);
      validateDeveloperSaveCompatibility(session, loaded.saveWorld);
      return { ...row, compatible: true };
    } catch (error) {
      return {
        ...row,
        compatible: false,
        compatibilityError: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function loadSaveSlot(slot) {
  const loaded = saveStore.load(slot);
  validateDeveloperSaveCompatibility(session, loaded.saveWorld);
  const state = restoreDeveloperPlaytestSession(session, loaded.saveWorld);
  syncManagerControl();
  return { save: loaded.summary, slots: projectedSaveSlots(), state };
}

function continueLatestSave() {
  const latest = projectedSaveSlots().find((row) => !row.invalid && row.compatible);
  if (!latest) throw new Error("No compatible save is available to continue.");
  return loadSaveSlot(latest.slot);
}

function setupWithResolvedMedia() {
  const setup = session.setup();
  return {
    ...setup,
    teams: (setup.teams ?? []).map((team) => ({
      ...team,
      resolvedMedia: {
        logo: team.media?.logo
          ? resolveMediaAsset(mediaPack, team.media.logo.kind, team.media.logo.entityId)
          : null,
        car: team.media?.car
          ? resolveMediaAsset(mediaPack, team.media.car.kind, team.media.car.entityId)
          : null,
      },
    })),
  };
}

function profileWithResolvedMedia(profile) {
  const kind = profile.media?.category ?? (profile.type === "team" ? "teamLogo" : profile.type);
  const projected = { ...profile, media: resolveMediaAsset(mediaPack, kind, profile.id) };
  if (profile.visualIdentity?.media) {
    projected.visualIdentity = {
      ...profile.visualIdentity,
      resolvedMedia: Object.fromEntries(Object.entries(profile.visualIdentity.media).map(([slot, descriptor]) => [
        slot,
        resolveMediaAsset(mediaPack, descriptor.kind, descriptor.entityId),
      ])),
    };
  }
  return projected;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname.startsWith("/media/fallback/")) {
      const leaf = url.pathname.slice("/media/fallback/".length);
      if (!leaf.endsWith(".svg")) return json(response, 404, { error: "Media fallback not found" });
      const kind = decodeURIComponent(leaf.slice(0, -4));
      const svg = builtinMediaFallbackSvg(kind);
      response.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-length": Buffer.byteLength(svg),
        "cache-control": "no-store",
      });
      response.end(svg);
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/media/assets/")) {
      const encoded = url.pathname.slice("/media/assets/".length);
      let relativePath;
      try { relativePath = encoded.split("/").map((segment) => decodeURIComponent(segment)).join("/"); }
      catch { return json(response, 400, { error: "Invalid media path encoding" }); }
      const asset = resolveServedMediaPath(mediaPack, relativePath);
      if (!asset) return json(response, 404, { error: "Media asset not found" });
      response.writeHead(200, { "content-type": mediaContentType(asset.extension), "cache-control": "no-store" });
      createReadStream(asset.path).pipe(response);
      return;
    }
    if (url.pathname === "/api/media-pack" && request.method === "GET") return json(response, 200, mediaPackSummary(mediaPack));
    if (url.pathname === "/api/media/resolve" && request.method === "GET") {
      return json(response, 200, resolveMediaAsset(mediaPack, url.searchParams.get("kind"), url.searchParams.get("id")));
    }
    if (url.pathname === "/api/setup" && request.method === "GET") return json(response, 200, setupWithResolvedMedia());
    if (url.pathname === "/api/state" && request.method === "GET") {
      syncManagerControl();
      return json(response, 200, session.state());
    }
    if (url.pathname === "/api/saves" && request.method === "GET") {
      return json(response, 200, { slots: projectedSaveSlots() });
    }
    if (url.pathname === "/api/saves" && request.method === "POST") {
      const input = await body(request);
      const summary = saveStore.save(input.slot ?? "manual-1", session.requireCareer());
      return json(response, 200, { save: summary, slots: projectedSaveSlots(), state: session.state() });
    }
    if (url.pathname === "/api/saves/load" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, loadSaveSlot(input.slot));
    }
    if (url.pathname === "/api/saves/continue" && request.method === "POST") {
      return json(response, 200, continueLatestSave());
    }
    if (url.pathname === "/api/saves/delete" && request.method === "POST") {
      const input = await body(request);
      const deleted = saveStore.delete(input.slot);
      return json(response, 200, { deleted, slots: projectedSaveSlots() });
    }
    if (url.pathname === "/api/profile" && request.method === "GET") {
      return json(response, 200, profileWithResolvedMedia(developerEntityProfile(session, url.searchParams.get("type"), url.searchParams.get("id"))));
    }
    if (url.pathname === "/api/world" && request.method === "GET") {
      return json(response, 200, developerWorld(session, {
        category: url.searchParams.get("category") ?? undefined,
        minImportance: url.searchParams.get("minImportance") ?? undefined,
        season: url.searchParams.get("season") ?? undefined,
      }));
    }

    if (url.pathname === "/api/career" && request.method === "POST") {
      const input = await body(request);
      return autosavedJson(response, session.startCareer(input));
    }
    if (url.pathname === "/api/continue" && request.method === "POST") {
      const state = developerContinueCalendar(session);
      syncManagerControl();
      return autosavedJson(response, state);
    }
    if (url.pathname === "/api/weekend/advance" && request.method === "POST") return autosavedJson(response, session.advanceWeekend());
    if (url.pathname === "/api/weekend/setup" && request.method === "POST") {
      const input = await body(request);
      return autosavedJson(response, session.changeSetup(input.driverId, input.setup));
    }
    if (url.pathname === "/api/weekend/starting-tyre" && request.method === "POST") {
      const input = await body(request);
      return autosavedJson(response, session.changeStartingTyre(input.driverId, input.compoundId));
    }
    if (url.pathname === "/api/weekend/start-race" && request.method === "POST") return autosavedJson(response, session.startRace());
    if (url.pathname === "/api/race/advance" && request.method === "POST") {
      const input = await body(request);
      return autosavedJson(response, session.advanceRace(input.laps ?? 1));
    }
    if (url.pathname === "/api/race/finish" && request.method === "POST") return autosavedJson(response, session.finishRace());
    if (url.pathname === "/api/race/strategy" && request.method === "POST") {
      const input = await body(request);
      return autosavedJson(response, session.changeStrategy(input.driverId, input.instruction));
    }

    if (url.pathname === "/api/management" && request.method === "GET") return json(response, 200, developerManagementOverview(session));
    if (url.pathname === "/api/management/planning" && request.method === "GET") return json(response, 200, developerManagementPlanning(session));
    if (url.pathname === "/api/people" && request.method === "GET") return json(response, 200, developerPeople(session));
    if (url.pathname === "/api/market" && request.method === "GET") return json(response, 200, developerMarket(session));
    if (url.pathname === "/api/board" && request.method === "GET") return json(response, 200, developerBoard(session));
    if (url.pathname === "/api/board/request" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSubmitBoardRequest(session, input.kind));
    }
    if (url.pathname === "/api/manager-career" && request.method === "GET") return json(response, 200, developerManagerCareer(session));
    if (url.pathname === "/api/manager-career/apply" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerApplyManagerJob(session, input.teamId));
    }
    if (url.pathname === "/api/responsibilities" && request.method === "GET") return json(response, 200, developerResponsibilities(session));
    if (url.pathname === "/api/responsibilities/set" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSetResponsibility(session, input.area, input.owner));
    }

    if (url.pathname === "/api/inbox" && request.method === "GET") {
      return json(response, 200, developerInbox(session, {
        unreadOnly: url.searchParams.get("unreadOnly") === "true",
        includeArchived: url.searchParams.get("includeArchived") === "true",
      }));
    }
    if (url.pathname === "/api/inbox/read" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerMarkInboxRead(session, input.itemId, input.read !== false));
    }
    if (url.pathname === "/api/inbox/archive" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerArchiveInboxItem(session, input.itemId));
    }
    if (url.pathname === "/api/inbox/decision" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerResolveInboxDecision(session, input.itemId, input.optionId));
    }

    if (url.pathname === "/api/recruitment" && request.method === "GET") return json(response, 200, developerRecruitment(session, recruitmentFilters(url)));
    if (url.pathname === "/api/recruitment/shortlist" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSetShortlist(session, input.driverId, input.shortlisted !== false));
    }
    if (url.pathname === "/api/recruitment/scout" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerStartScouting(session, input.driverId, { focus: input.focus, durationDays: input.durationDays }));
    }

    if (url.pathname === "/api/contracts" && request.method === "GET") return json(response, 200, developerContractNegotiations(session));
    if (url.pathname === "/api/contracts/open" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerOpenDriverNegotiation(session, input.driverId, { role: input.role, startSeason: input.startSeason }));
    }
    if (url.pathname === "/api/contracts/offer" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSubmitDriverOffer(session, input.negotiationId, input.terms));
    }
    if (url.pathname === "/api/contracts/withdraw" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerWithdrawDriverNegotiation(session, input.negotiationId));
    }

    if (url.pathname === "/api/staff-recruitment" && request.method === "GET") return json(response, 200, developerStaffRecruitment(session, { query: url.searchParams.get("query") ?? undefined }));
    if (url.pathname === "/api/staff-contracts" && request.method === "GET") return json(response, 200, developerStaffContractNegotiations(session));
    if (url.pathname === "/api/staff-contracts/open" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerOpenStaffNegotiation(session, input.staffId, { role: input.role, startSeason: input.startSeason }));
    }
    if (url.pathname === "/api/staff-contracts/offer" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSubmitStaffOffer(session, input.negotiationId, input.terms));
    }
    if (url.pathname === "/api/staff-contracts/withdraw" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerWithdrawStaffNegotiation(session, input.negotiationId));
    }

    if (url.pathname === "/api/commercial" && request.method === "GET") {
      return json(response, 200, developerCommercial(session, {
        query: url.searchParams.get("query") ?? undefined,
        tier: url.searchParams.get("tier") ?? "partner",
        includeActive: url.searchParams.get("includeActive") === "true",
      }));
    }
    if (url.pathname === "/api/commercial/open" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerOpenSponsorNegotiation(session, input.sponsorId, {
        tier: input.tier,
        renewDealId: input.renewDealId,
      }));
    }
    if (url.pathname === "/api/commercial/offer" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSubmitSponsorOffer(session, input.negotiationId, input.terms));
    }
    if (url.pathname === "/api/commercial/withdraw" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerWithdrawSponsorNegotiation(session, input.negotiationId));
    }
    if (url.pathname === "/api/commercial/activity" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerResolveSponsorActivity(session, input.activityId, input.fulfilled !== false));
    }

    if (url.pathname === "/api/governance" && request.method === "GET") return json(response, 200, developerGovernance(session));
    if (url.pathname === "/api/governance/vote" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerCastGovernanceVote(session, input.proposalId, input.choice));
    }
    if (url.pathname === "/api/governance/rebrand" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerRebrandControlledTeam(session, input.displayName));
    }

    if (url.pathname === "/api/offseason" && request.method === "GET") return json(response, 200, developerOffseason(session));
    if (url.pathname === "/api/offseason/plan" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerUpdateOffseasonPlan(session, input));
    }
    if (url.pathname === "/api/offseason/confirm" && request.method === "POST") return json(response, 200, developerConfirmOffseasonPlan(session));

    if (url.pathname === "/api/technical" && request.method === "GET") return json(response, 200, developerTechnical(session));
    if (url.pathname === "/api/technical/design" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerStartTechnicalDesign(session, input));
    }
    if (url.pathname === "/api/technical/manufacture" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerStartManufacturing(session, input));
    }
    if (url.pathname === "/api/technical/fit" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerFitTechnicalSpec(session, input));
    }
    if (url.pathname === "/api/technical/facility" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerStartFacilityUpgrade(session, input.facilityId));
    }
    if (url.pathname === "/api/technical/supplier/open" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerOpenSupplierNegotiation(session, input));
    }
    if (url.pathname === "/api/technical/supplier/offer" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSubmitSupplierOffer(session, input));
    }
    if (url.pathname === "/api/technical/supplier/counter" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerAcceptSupplierCounter(session, input.negotiationId));
    }
    if (url.pathname === "/api/technical/supplier/withdraw" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerWithdrawSupplierNegotiation(session, input.negotiationId));
    }
    if (url.pathname === "/api/technical/reliability/replace" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerReplaceWornComponent(session, input));
    }
    if (url.pathname === "/api/technical/reliability/rebuild" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerRebuildComponent(session, input));
    }
    if (url.pathname === "/api/technical/reliability/engine" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerServiceEngine(session, input.carSlot));
    }
    if (url.pathname === "/api/technical/preseason-test" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerRunPreseasonTest(session, input));
    }

    if (request.method === "GET" && serveStatic(request, response)) return;
    json(response, 404, { error: "Not found" });
  } catch (error) {
    apiError(response, error);
  }
});

server.listen(args.port, args.host, () => {
  console.log(`F1 Manager Sim Developer Playtest: http://${args.host}:${args.port}`);
  console.log(`Season Database: ${join(process.cwd(), args.seasonDb)}`);
  if (args.globalWorld) console.log(`Global Database: ${join(process.cwd(), args.globalWorld)}`);
  console.log(`Save slots: ${args.saveDir}`);
  const media = mediaPackSummary(mediaPack);
  console.log(`Media Pack: ${media.available ? `${media.name} (${media.id})` : `built-in fallbacks (${media.reason})`}`);
});