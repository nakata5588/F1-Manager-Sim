import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, posix, resolve, sep } from "node:path";

export const MEDIA_PACK_FORMAT = "f1-manager-sim-media-pack";
export const MEDIA_PACK_SCHEMA_VERSION = 1;

// User-provided packs are deliberately raster-only. Built-in application
// fallbacks may use generated SVG because their content is controlled by us.
const ALLOWED_EXTENSIONS = new Set(["webp", "png", "jpg", "jpeg"]);

export const MEDIA_KINDS = Object.freeze({
  driver: { directory: "people/drivers", defaultKey: "driver" },
  staff: { directory: "people/staff", defaultKey: "staff" },
  manager: { directory: "people/managers", defaultKey: "manager" },
  teamLogo: { directory: "teams/logos", defaultKey: "teamLogo" },
  car: { directory: "teams/cars", defaultKey: "car" },
  teamBackdrop: { directory: "teams/backdrops", defaultKey: "teamBackdrop" },
  circuit: { directory: "circuits/photos", defaultKey: "circuit" },
  circuitMap: { directory: "circuits/maps", defaultKey: "circuitMap" },
  city: { directory: "cities", defaultKey: "city" },
  flag: { directory: "countries/flags", defaultKey: "flag" },
  sponsor: { directory: "sponsors", defaultKey: "sponsor" },
  engine: { directory: "engines", defaultKey: "engine" },
  tyre: { directory: "tyres", defaultKey: "tyre" },
  championship: { directory: "championships", defaultKey: "championship" },
});

function safeRelativePath(value, label = "media path") {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error(`${label} must not be empty.`);
  if (raw.includes("\0") || isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new Error(`${label} must be relative to the media pack.`);
  }
  const normalized = posix.normalize(raw.replaceAll("\\", "/")).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} escapes the media pack.`);
  }
  return normalized;
}

function containedPath(root, relativePath, label = "media path") {
  const candidate = resolve(root, relativePath);
  const normalizedRoot = resolve(root);
  if (!isContained(normalizedRoot, candidate)) throw new Error(`${label} escapes the media pack.`);
  return candidate;
}

function isContained(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function fileExists(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function realFileInsidePack(pack, path) {
  try {
    const realPackRoot = realpathSync(pack.rootDirectory);
    const realAssetRoot = realpathSync(pack.assetRoot);
    if (!isContained(realPackRoot, realAssetRoot)) return null;
    const realPath = realpathSync(path);
    if (!isContained(realAssetRoot, realPath)) return null;
    return realPath;
  } catch {
    return null;
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Media pack manifest must be a JSON object.");
  }
  if (manifest.format !== MEDIA_PACK_FORMAT) {
    throw new Error(`Unsupported media pack format '${manifest.format ?? "missing"}'.`);
  }
  if (Number(manifest.schemaVersion) !== MEDIA_PACK_SCHEMA_VERSION) {
    throw new Error(`Unsupported media pack schemaVersion '${manifest.schemaVersion ?? "missing"}'.`);
  }
  if (!String(manifest.id ?? "").trim()) throw new Error("Media pack id is required.");
  if (!String(manifest.name ?? "").trim()) throw new Error("Media pack name is required.");

  const extensions = Array.isArray(manifest.supportedExtensions) && manifest.supportedExtensions.length
    ? manifest.supportedExtensions.map((value) => String(value).toLowerCase().replace(/^\./, ""))
    : ["webp", "png", "jpg", "jpeg"];
  for (const extension of extensions) {
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Unsupported media extension '${extension}'.`);
  }

  const assetRoot = manifest.assetRoot === undefined || manifest.assetRoot === null || manifest.assetRoot === "."
    ? "."
    : safeRelativePath(manifest.assetRoot, "manifest assetRoot");

  const defaults = manifest.defaults ?? {};
  if (typeof defaults !== "object" || Array.isArray(defaults)) throw new Error("Media pack defaults must be an object.");
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== null && value !== undefined && value !== "") safeRelativePath(value, `manifest default '${key}'`);
  }

  const overrides = manifest.overrides ?? {};
  if (typeof overrides !== "object" || Array.isArray(overrides)) throw new Error("Media pack overrides must be an object.");
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string") safeRelativePath(value, `manifest override '${key}'`);
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [entityId, path] of Object.entries(value)) {
        if (path !== null && path !== undefined && path !== "") safeRelativePath(path, `manifest override '${key}:${entityId}'`);
      }
    } else if (value !== null && value !== undefined) {
      throw new Error(`Manifest override '${key}' must be a path or entity map.`);
    }
  }

  return { assetRoot, extensions };
}

export function loadMediaPack(rootDirectory, { required = false } = {}) {
  if (!rootDirectory) {
    return {
      available: false,
      rootDirectory: null,
      assetRoot: null,
      manifest: null,
      extensions: ["webp", "png", "jpg", "jpeg"],
      reason: "no_pack_selected",
    };
  }
  const root = resolve(rootDirectory);
  const manifestPath = containedPath(root, "manifest.json", "manifest path");
  if (!fileExists(manifestPath)) {
    if (required) throw new Error(`Media pack manifest not found at '${manifestPath}'.`);
    return {
      available: false,
      rootDirectory: root,
      assetRoot: root,
      manifest: null,
      extensions: ["webp", "png", "jpg", "jpeg"],
      reason: "manifest_missing",
    };
  }

  try {
    const realRoot = realpathSync(root);
    const realManifest = realpathSync(manifestPath);
    if (!isContained(realRoot, realManifest)) throw new Error("Media pack manifest escapes the selected pack through a symbolic link.");
  } catch (error) {
    if (error instanceof Error && /symbolic link/.test(error.message)) throw error;
    throw new Error(`Media pack manifest cannot be safely resolved: ${error instanceof Error ? error.message : String(error)}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Media pack manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const validated = validateManifest(manifest);
  const assetRoot = validated.assetRoot === "." ? root : containedPath(root, validated.assetRoot, "manifest assetRoot");

  if (existsSync(assetRoot)) {
    try {
      const realRoot = realpathSync(root);
      const realAssetRoot = realpathSync(assetRoot);
      if (!isContained(realRoot, realAssetRoot)) {
        throw new Error("Media pack assetRoot escapes the selected pack through a symbolic link.");
      }
    } catch (error) {
      if (error instanceof Error && /symbolic link/.test(error.message)) throw error;
      throw new Error(`Media pack assetRoot cannot be safely resolved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    available: true,
    rootDirectory: root,
    assetRoot,
    manifest,
    extensions: validated.extensions,
    reason: null,
  };
}

function requireKind(kind) {
  const normalized = String(kind ?? "").trim();
  const config = MEDIA_KINDS[normalized];
  if (!config) throw new Error(`Unsupported media kind '${normalized}'.`);
  return { kind: normalized, config };
}

function overridePath(pack, kind, entityId) {
  const overrides = pack.manifest?.overrides ?? {};
  const flat = overrides[`${kind}:${entityId}`];
  if (typeof flat === "string" && flat.trim()) return safeRelativePath(flat, `manifest override '${kind}:${entityId}'`);
  const nested = overrides[kind];
  const value = nested && typeof nested === "object" && !Array.isArray(nested) ? nested[entityId] : null;
  return typeof value === "string" && value.trim() ? safeRelativePath(value, `manifest override '${kind}:${entityId}'`) : null;
}

function usableAsset(pack, relativePath) {
  if (!pack.available || !relativePath) return null;
  const safe = safeRelativePath(relativePath);
  const path = containedPath(pack.assetRoot, safe);
  if (!fileExists(path)) return null;
  const extension = extname(path).slice(1).toLowerCase();
  if (!pack.extensions.includes(extension)) return null;
  const realPath = realFileInsidePack(pack, path);
  if (!realPath) return null;
  return { relativePath: safe, path: realPath, extension };
}

function safeEntityStem(entityId) {
  const value = String(entityId ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== ".." ? value : null;
}

function assetUrl(relativePath) {
  const encoded = relativePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `/media/assets/${encoded}`;
}

function resolvedResult(kind, entityId, asset, source) {
  return {
    kind,
    entityId: String(entityId),
    source,
    fallback: source === "pack_default" || source === "builtin",
    relativePath: asset?.relativePath ?? null,
    url: asset ? assetUrl(asset.relativePath) : `/media/fallback/${encodeURIComponent(kind)}.svg`,
  };
}

export function resolveMediaAsset(pack, kindValue, entityIdValue) {
  const { kind, config } = requireKind(kindValue);
  const entityId = String(entityIdValue ?? "").trim();
  if (!entityId) throw new Error("A media entity id is required.");
  if (!pack?.available) return resolvedResult(kind, entityId, null, "builtin");

  const override = overridePath(pack, kind, entityId);
  const overrideAsset = override ? usableAsset(pack, override) : null;
  if (overrideAsset) return resolvedResult(kind, entityId, overrideAsset, "override");

  const stem = safeEntityStem(entityId);
  if (stem) {
    for (const extension of pack.extensions) {
      const canonical = usableAsset(pack, `${config.directory}/${stem}.${extension}`);
      if (canonical) return resolvedResult(kind, entityId, canonical, "canonical");
    }
  }

  const defaultValue = pack.manifest?.defaults?.[config.defaultKey];
  if (typeof defaultValue === "string" && defaultValue.trim()) {
    const packDefault = usableAsset(pack, safeRelativePath(defaultValue, `manifest default '${config.defaultKey}'`));
    if (packDefault) return resolvedResult(kind, entityId, packDefault, "pack_default");
  }

  return resolvedResult(kind, entityId, null, "builtin");
}

export function mediaPackSummary(pack) {
  if (!pack?.available) return { available: false, reason: pack?.reason ?? "no_pack_selected" };
  return {
    available: true,
    id: String(pack.manifest.id),
    name: String(pack.manifest.name),
    version: pack.manifest.version ? String(pack.manifest.version) : null,
    schemaVersion: Number(pack.manifest.schemaVersion),
    supportedExtensions: [...pack.extensions],
  };
}

export function resolveServedMediaPath(pack, requestRelativePath) {
  if (!pack?.available) return null;
  let safe;
  try {
    safe = safeRelativePath(requestRelativePath, "requested media path");
  } catch {
    return null;
  }
  const path = containedPath(pack.assetRoot, safe, "requested media path");
  if (!fileExists(path)) return null;
  const extension = extname(path).slice(1).toLowerCase();
  if (!pack.extensions.includes(extension)) return null;
  const realPath = realFileInsidePack(pack, path);
  if (!realPath) return null;
  return { path: realPath, relativePath: safe, extension };
}

export function mediaContentType(extensionValue) {
  const extension = String(extensionValue ?? "").toLowerCase().replace(/^\./, "");
  if (extension === "webp") return "image/webp";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export function builtinMediaFallbackSvg(kindValue) {
  const { kind } = requireKind(kindValue);
  const labels = {
    driver: "DR", staff: "ST", manager: "MG", teamLogo: "TM", car: "CAR", teamBackdrop: "TM",
    circuit: "GP", circuitMap: "MAP", city: "CITY", flag: "FLAG", sponsor: "SP", engine: "ENG",
    tyre: "TYRE", championship: "F1",
  };
  const label = labels[kind] ?? "F1";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Media unavailable"><rect width="256" height="256" rx="24" fill="#151b23"/><rect x="16" y="16" width="224" height="224" rx="18" fill="none" stroke="#384456" stroke-width="4"/><text x="128" y="142" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#edf2f7">${label}</text></svg>`;
}
