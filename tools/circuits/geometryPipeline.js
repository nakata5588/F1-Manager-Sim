import { createHash } from "node:crypto";

const EARTH_RADIUS_KM = 6371.0088;

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCircuitSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractGeoJsonLineString(input) {
  const object = typeof input === "string" ? JSON.parse(input) : input;
  if (!object || typeof object !== "object") return null;
  if (object.type === "LineString") return object.coordinates ?? null;
  if (object.type === "Feature" && object.geometry?.type === "LineString") return object.geometry.coordinates ?? null;
  if (object.type === "FeatureCollection") {
    const feature = (object.features ?? []).find((row) => row?.geometry?.type === "LineString");
    return feature?.geometry?.coordinates ?? null;
  }
  return null;
}

function radians(value) {
  return value * Math.PI / 180;
}

export function haversineDistanceKm(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const lon1 = numeric(a[0]);
  const lat1 = numeric(a[1]);
  const lon2 = numeric(b[0]);
  const lat2 = numeric(b[1]);
  if ([lon1, lat1, lon2, lat2].some((value) => value === null)) return 0;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const p1 = radians(lat1);
  const p2 = radians(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function sameCoordinate(a, b, epsilon = 1e-10) {
  return Math.abs(Number(a?.[0]) - Number(b?.[0])) <= epsilon
    && Math.abs(Number(a?.[1]) - Number(b?.[1])) <= epsilon;
}

export function geoJsonPolylineLengthKm(coordinates, { closeLoop = true } = {}) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineDistanceKm(coordinates[index - 1], coordinates[index]);
  }
  if (closeLoop && coordinates.length > 2 && !sameCoordinate(coordinates[0], coordinates.at(-1))) {
    total += haversineDistanceKm(coordinates.at(-1), coordinates[0]);
  }
  return total;
}

export function projectLonLatToLocalMeters(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) return [];
  const usable = coordinates
    .map((point) => [numeric(point?.[0]), numeric(point?.[1])])
    .filter(([lon, lat]) => lon !== null && lat !== null);
  if (!usable.length) return [];
  const originLon = usable.reduce((sum, row) => sum + row[0], 0) / usable.length;
  const originLat = usable.reduce((sum, row) => sum + row[1], 0) / usable.length;
  const metresPerDegreeLat = 111320;
  const metresPerDegreeLon = metresPerDegreeLat * Math.cos(radians(originLat));
  return usable.map(([lon, lat]) => [
    (lon - originLon) * metresPerDegreeLon,
    (lat - originLat) * metresPerDegreeLat,
  ]);
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  const x = start[0] + t * dx;
  const y = start[1] + t * dy;
  return Math.hypot(point[0] - x, point[1] - y);
}

export function simplifyPolyline(points, tolerance = 0) {
  if (!Array.isArray(points) || points.length <= 2 || !(tolerance > 0)) return structuredClone(points ?? []);
  let furthestDistance = 0;
  let furthestIndex = 0;
  const start = points[0];
  const end = points.at(-1);
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], start, end);
    if (distance > furthestDistance) {
      furthestDistance = distance;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= tolerance) return [structuredClone(start), structuredClone(end)];
  const left = simplifyPolyline(points.slice(0, furthestIndex + 1), tolerance);
  const right = simplifyPolyline(points.slice(furthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

export function normalizePolyline(points, padding = 0) {
  if (!Array.isArray(points) || !points.length) return [];
  const xs = points.map((row) => Number(row[0]));
  const ys = points.map((row) => Number(row[1]));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.max(width, height);
  if (!(scale > 0)) return [];
  const usable = Math.max(0, Math.min(0.45, Number(padding) || 0));
  const span = 1 - usable * 2;
  const xInset = (scale - width) / (2 * scale);
  const yInset = (scale - height) / (2 * scale);
  return points.map(([x, y]) => [
    Number((usable + span * (xInset + (x - minX) / scale)).toFixed(6)),
    Number((usable + span * (yInset + (y - minY) / scale)).toFixed(6)),
  ]);
}

export function geometryHash(points) {
  const canonical = (points ?? []).map((row) => [Number(row[0].toFixed(7)), Number(row[1].toFixed(7))]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function importGeoJsonFeature(feature, provenance = {}, options = {}) {
  if (feature?.geometry?.type !== "LineString") throw new TypeError("Circuit GeoJSON feature must contain a LineString geometry.");
  const coordinates = structuredClone(feature.geometry.coordinates ?? []);
  if (coordinates.length < 3) throw new Error("Circuit GeoJSON LineString requires at least three points.");
  const local = projectLonLatToLocalMeters(coordinates);
  const simplificationToleranceM = Math.max(0, numeric(options.simplificationToleranceM, 0));
  const simplified = simplificationToleranceM > 0 ? simplifyPolyline(local, simplificationToleranceM) : local;
  const normalized = normalizePolyline(simplified);
  const declaredLengthKm = numeric(feature.properties?.length) === null ? null : numeric(feature.properties.length) / 1000;
  return {
    candidate_id: String(provenance.libraryId ?? "geojson") + ":" + String(feature.properties?.id ?? geometryHash(normalized).slice(0, 12)),
    upstream_id: feature.properties?.id ?? null,
    location: feature.properties?.Location ?? feature.properties?.location ?? null,
    name: feature.properties?.Name ?? feature.properties?.name ?? null,
    declared_length_km: declaredLengthKm === null ? null : Number(declaredLengthKm.toFixed(3)),
    computed_length_km: Number(geoJsonPolylineLengthKm(coordinates).toFixed(3)),
    point_count: coordinates.length,
    simplified_point_count: normalized.length,
    closed_source_loop: sameCoordinate(coordinates[0], coordinates.at(-1)),
    geometry_hash: geometryHash(normalized),
    geometry_status: "candidate_only",
    geometry_source: provenance.geometrySource ?? "GeoJSON LineString",
    source_url: provenance.sourceUrl ?? null,
    source_repository: provenance.sourceRepository ?? null,
    original_source: provenance.originalSource ?? null,
    license: provenance.license ?? null,
    retrieved_at: provenance.retrievedAt ?? null,
    centerline: options.includeGeometry === false ? undefined : normalized,
  };
}

function aliasScore(layout, candidate) {
  const sourceAliases = Array.isArray(layout?.candidate_aliases) && layout.candidate_aliases.length
    ? layout.candidate_aliases
    : [layout?.layout_name, layout?.configuration_name];
  const aliases = sourceAliases.map(normalizeCircuitSearchText).filter(Boolean);
  const candidateTokens = [candidate?.name, candidate?.location, candidate?.upstream_id]
    .map(normalizeCircuitSearchText)
    .filter(Boolean);
  let score = 0;
  const stopwords = new Set(["circuit", "grand", "prix", "course", "track", "autodromo", "international", "street"]);
  for (const alias of aliases) {
    for (const value of candidateTokens) {
      if (alias === value) score = Math.max(score, 100);
      else if (alias.includes(value) || value.includes(alias)) score = Math.max(score, 70);
      else {
        const words = alias.split(" ").filter((word) => word.length >= 4 && !stopwords.has(word));
        const valueWords = value.split(" ");
        const overlap = words.filter((word) => valueWords.includes(word)).length;
        if (overlap) score = Math.max(score, 20 + overlap * 10);
      }
    }
  }
  return score;
}

export function rankGeometryCandidates(layout, candidates = []) {
  const requiredLength = numeric(layout?.lap_length_km ?? layout?.lapLengthKm);
  return (candidates ?? [])
    .map((candidate) => {
      const venueScore = aliasScore(layout, candidate);
      const candidateLength = numeric(candidate?.declared_length_km ?? candidate?.declaredLengthKm ?? candidate?.computed_length_km);
      const lengthDifferencePercent = requiredLength && candidateLength
        ? ((candidateLength - requiredLength) / requiredLength) * 100
        : null;
      const lengthScore = lengthDifferencePercent === null ? 0 : Math.max(0, 30 - Math.abs(lengthDifferencePercent));
      return {
        candidate,
        venueScore,
        lengthDifferencePercent: lengthDifferencePercent === null ? null : Number(lengthDifferencePercent.toFixed(2)),
        score: Number((venueScore + lengthScore).toFixed(2)),
      };
    })
    .filter((row) => row.venueScore > 0)
    .sort((a, b) => b.score - a.score || Math.abs(a.lengthDifferencePercent ?? 999) - Math.abs(b.lengthDifferencePercent ?? 999));
}

export function automaticCandidateStatus(match) {
  if (!match) return "GEOMETRY_MISSING";
  const difference = Math.abs(numeric(match.lengthDifferencePercent, 999));
  if (difference > 5) return "CANDIDATE_LENGTH_MISMATCH";
  return "MATCHED_NEEDS_REVIEW";
}
