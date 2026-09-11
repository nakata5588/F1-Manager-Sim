#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DeveloperPlaytestSession } from "../src/app/developerPlaytest.js";
import {
  developerArchiveInboxItem,
  developerContractNegotiations,
  developerInbox,
  developerManagementOverview,
  developerMarkInboxRead,
  developerMarket,
  developerOpenDriverNegotiation,
  developerPeople,
  developerRecruitment,
  developerResolveInboxDecision,
  developerSetShortlist,
  developerStartScouting,
  developerSubmitDriverOffer,
  developerWithdrawDriverNegotiation,
} from "../src/app/managementPlaytest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = resolve(__dirname, "../playtest");

function usage() {
  console.error("Usage: npm run playtest -- <season-db.json|json.gz> [--global-world <global.json|json.gz>] [--port 3000] [--host 127.0.0.1]");
  process.exit(1);
}

function readPayload(path) {
  const buffer = readFileSync(path);
  const text = path.endsWith(".gz") ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  return JSON.parse(text);
}

function parseArgs(argv) {
  const args = { seasonDb: null, globalWorld: null, port: 3000, host: "127.0.0.1" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--global-world") args.globalWorld = argv[++index];
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
  response.writeHead(200, {
    "content-type": contentType(path),
    "cache-control": "no-store",
  });
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

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/setup" && request.method === "GET") return json(response, 200, session.setup());
    if (url.pathname === "/api/state" && request.method === "GET") return json(response, 200, session.state());

    if (url.pathname === "/api/career" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, session.startCareer(input));
    }
    if (url.pathname === "/api/continue" && request.method === "POST") {
      return json(response, 200, session.continue());
    }
    if (url.pathname === "/api/weekend/advance" && request.method === "POST") {
      return json(response, 200, session.advanceWeekend());
    }
    if (url.pathname === "/api/weekend/setup" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, session.changeSetup(input.driverId, input.setup));
    }
    if (url.pathname === "/api/weekend/starting-tyre" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, session.changeStartingTyre(input.driverId, input.compoundId));
    }
    if (url.pathname === "/api/weekend/start-race" && request.method === "POST") {
      return json(response, 200, session.startRace());
    }
    if (url.pathname === "/api/race/advance" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, session.advanceRace(input.laps ?? 1));
    }
    if (url.pathname === "/api/race/finish" && request.method === "POST") {
      return json(response, 200, session.finishRace());
    }
    if (url.pathname === "/api/race/strategy" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, session.changeStrategy(input.driverId, input.instruction));
    }

    if (url.pathname === "/api/management" && request.method === "GET") {
      return json(response, 200, developerManagementOverview(session));
    }
    if (url.pathname === "/api/people" && request.method === "GET") {
      return json(response, 200, developerPeople(session));
    }
    if (url.pathname === "/api/market" && request.method === "GET") {
      return json(response, 200, developerMarket(session));
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

    if (url.pathname === "/api/recruitment" && request.method === "GET") {
      return json(response, 200, developerRecruitment(session, recruitmentFilters(url)));
    }
    if (url.pathname === "/api/recruitment/shortlist" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSetShortlist(session, input.driverId, input.shortlisted !== false));
    }
    if (url.pathname === "/api/recruitment/scout" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerStartScouting(session, input.driverId, {
        focus: input.focus,
        durationDays: input.durationDays,
      }));
    }

    if (url.pathname === "/api/contracts" && request.method === "GET") {
      return json(response, 200, developerContractNegotiations(session));
    }
    if (url.pathname === "/api/contracts/open" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerOpenDriverNegotiation(session, input.driverId, {
        role: input.role,
        startSeason: input.startSeason,
      }));
    }
    if (url.pathname === "/api/contracts/offer" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerSubmitDriverOffer(session, input.negotiationId, input.terms));
    }
    if (url.pathname === "/api/contracts/withdraw" && request.method === "POST") {
      const input = await body(request);
      return json(response, 200, developerWithdrawDriverNegotiation(session, input.negotiationId));
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
});
