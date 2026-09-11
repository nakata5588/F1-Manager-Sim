#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DeveloperPlaytestSession } from "../src/app/developerPlaytest.js";

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
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
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
