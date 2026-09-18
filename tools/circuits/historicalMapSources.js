function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function layoutId(row) {
  return text(row?.layout_id ?? row?.layoutId) || null;
}

export function classifyHistoricalMapLicense(value) {
  const license = text(value).toLowerCase();
  if (!license) return "UNKNOWN";
  if (license.includes("public domain") || license.startsWith("pd-") || license === "pd") return "PUBLIC_DOMAIN";
  if (license.includes("cc0")) return "CC0";
  if (license.includes("cc by-sa") || license.includes("cc-by-sa")) return "CC_BY_SA";
  if (license.includes("cc by") || license.includes("cc-by")) return "CC_BY";
  if (license.includes("odbl")) return "ODBL";
  return "OTHER";
}

export function validateHistoricalMapSources({ layouts = [], sources = [], requireCoverage = false } = {}) {
  const issues = [];
  const layoutIds = new Set((layouts ?? []).map(layoutId).filter(Boolean));
  const sourceIds = new Set();
  const coveredLayouts = new Set();

  for (const row of sources ?? []) {
    const sourceId = text(row?.source_id ?? row?.sourceId);
    const targetLayoutId = layoutId(row);
    if (!sourceId) issues.push("Historical map source is missing source_id.");
    else if (sourceIds.has(sourceId)) issues.push("Duplicate historical map source_id '" + sourceId + "'.");
    else sourceIds.add(sourceId);

    if (!targetLayoutId) issues.push("Historical map source '" + (sourceId || "<unknown>") + "' is missing layout_id.");
    else {
      coveredLayouts.add(targetLayoutId);
      if (layoutIds.size && !layoutIds.has(targetLayoutId)) {
        issues.push("Historical map source '" + sourceId + "' references unknown layout_id '" + targetLayoutId + "'.");
      }
    }

    if (!text(row?.url)) issues.push("Historical map source '" + (sourceId || "<unknown>") + "' is missing url.");
    if (!text(row?.license)) issues.push("Historical map source '" + (sourceId || "<unknown>") + "' is missing license.");
    if (!text(row?.source_status ?? row?.sourceStatus)) issues.push("Historical map source '" + (sourceId || "<unknown>") + "' is missing source_status.");
    if (!text(row?.source_role ?? row?.sourceRole)) issues.push("Historical map source '" + (sourceId || "<unknown>") + "' is missing source_role.");
  }

  if (requireCoverage) {
    for (const id of layoutIds) {
      if (!coveredLayouts.has(id)) issues.push("Historical layout '" + id + "' has no historical map source.");
    }
  }

  return { ok: issues.length === 0, issues };
}

export function summarizeHistoricalMapSources({ layouts = [], sources = [] } = {}) {
  const layoutIds = new Set((layouts ?? []).map(layoutId).filter(Boolean));
  const covered = new Set();
  const licenseBuckets = {};
  const statusBuckets = {};
  const extractionReady = [];

  for (const row of sources ?? []) {
    const targetLayoutId = layoutId(row);
    if (targetLayoutId && (!layoutIds.size || layoutIds.has(targetLayoutId))) covered.add(targetLayoutId);

    const licenseClass = classifyHistoricalMapLicense(row?.license);
    licenseBuckets[licenseClass] = (licenseBuckets[licenseClass] ?? 0) + 1;

    const status = text(row?.source_status ?? row?.sourceStatus) || "UNKNOWN";
    statusBuckets[status] = (statusBuckets[status] ?? 0) + 1;

    if (status === "HISTORICAL_MAP_READY" && targetLayoutId) {
      extractionReady.push({
        layout_id: targetLayoutId,
        source_id: row.source_id ?? row.sourceId ?? null,
        license_class: licenseClass,
        media_type: row.media_type ?? row.mediaType ?? null,
      });
    }
  }

  return {
    layouts: layoutIds.size,
    coveredLayouts: covered.size,
    missingLayouts: Math.max(0, layoutIds.size - covered.size),
    sourceCount: sources?.length ?? 0,
    extractionReadyCount: extractionReady.length,
    licenseBuckets,
    statusBuckets,
    extractionReady,
  };
}

export function historicalMapSourceByLayout(sources = []) {
  const map = new Map();
  for (const row of sources ?? []) {
    const id = layoutId(row);
    if (!id || map.has(id)) continue;
    map.set(id, structuredClone(row));
  }
  return map;
}
