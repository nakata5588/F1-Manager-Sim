function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function svgPoint(point) {
  const x = clamp(number(point?.x, 0)) * 1000;
  const y = clamp(number(point?.y, 0)) * 1000;
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

function closedPath(points = []) {
  if (!Array.isArray(points) || points.length < 3) return "";
  const rows = points.map(svgPoint);
  return rows.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ") + " Z";
}

function openPolyline(points = []) {
  if (!Array.isArray(points) || points.length < 2) return "";
  return points.map((point) => {
    const projected = svgPoint(point);
    return `${projected.x},${projected.y}`;
  }).join(" ");
}

function markerRows(positions = {}) {
  return (positions.cars ?? []).filter((row) => {
    if (!row.mapPositionAvailable) return false;
    if (!Number.isFinite(Number(row.x)) || !Number.isFinite(Number(row.y))) return false;
    return ["explicit", "sector_progress", "sector_only"].includes(String(row.precision));
  });
}

function sectorMarkers(geometry = {}) {
  if (!geometry.available) return [];
  const starts = [];
  for (const sector of geometry.sectors ?? []) {
    const start = number(sector.startFraction);
    if (start === null) continue;
    const segment = (geometry.segments ?? []).find((row) => start >= Number(row.startFraction) && start < Number(row.endFraction))
      ?? geometry.segments?.[0];
    if (!segment) continue;
    const span = Number(segment.endFraction) - Number(segment.startFraction);
    const local = span > 0 ? (start - Number(segment.startFraction)) / span : 0;
    const from = geometry.centerline?.[segment.fromIndex];
    const to = geometry.centerline?.[segment.toIndex];
    if (!from || !to) continue;
    starts.push({
      id: sector.id,
      name: sector.name,
      x: Number(from.x) + (Number(to.x) - Number(from.x)) * local,
      y: Number(from.y) + (Number(to.y) - Number(from.y)) * local,
    });
  }
  return starts;
}

export function liveRaceMapState({ geometry = null, positions = null } = {}) {
  if (!geometry?.available) {
    return {
      status: "geometry_unavailable",
      drawableCars: 0,
      approximateCars: 0,
      message: "Circuit map unavailable — reviewed coordinate geometry is not available for this circuit.",
    };
  }

  const markers = markerRows(positions ?? {});
  const approximate = markers.filter((row) => row.approximate);
  if (!markers.length) {
    return {
      status: "geometry_only",
      drawableCars: 0,
      approximateCars: 0,
      message: positions?.telemetryMode === "lap_boundary_only"
        ? "Circuit geometry is available, but the current race snapshot only contains whole-lap boundaries. Timing remains authoritative."
        : "Circuit geometry is available, but no drawable car-position telemetry is currently available.",
    };
  }

  return {
    status: approximate.length ? "mixed_precision" : "live_positions",
    drawableCars: markers.length,
    approximateCars: approximate.length,
    message: approximate.length
      ? "Some markers are approximate because only sector-level position is known."
      : "Markers use the current Race Position Projection.",
  };
}

function trackSvg(geometry, positions) {
  const path = closedPath(geometry.centerline);
  if (!path) return "";
  const pit = geometry.pitLane?.available ? openPolyline(geometry.pitLane.points) : "";
  const start = geometry.startFinish ? svgPoint(geometry.startFinish) : null;
  const grid = geometry.startGrid ? svgPoint(geometry.startGrid) : null;
  const sectors = sectorMarkers(geometry);
  const markers = markerRows(positions);

  return `<svg class="live-race-map-svg" viewBox="0 0 1000 1000" role="img" aria-label="Circuit map">
    <path class="live-race-map-track-shadow" d="${path}"></path>
    <path class="live-race-map-track" d="${path}"></path>
    ${pit ? `<polyline class="live-race-map-pit" points="${pit}"></polyline>` : ""}
    ${sectors.map((sector) => {
      const point = svgPoint(sector);
      return `<g class="live-race-map-sector" transform="translate(${point.x} ${point.y})"><circle r="7"></circle><text x="12" y="-10">${escapeHtml(sector.id)}</text></g>`;
    }).join("")}
    ${start ? `<g class="live-race-map-start" transform="translate(${start.x} ${start.y})"><circle r="14"></circle><text x="20" y="5">FINISH</text></g>` : ""}
    ${grid && (!start || Math.hypot(grid.x - start.x, grid.y - start.y) > 8) ? `<g class="live-race-map-grid" transform="translate(${grid.x} ${grid.y})"><circle r="11"></circle><text x="18" y="5">START</text></g>` : ""}
    ${markers.map((row) => {
      const point = svgPoint(row);
      const classes = ["live-race-map-car", row.controlled ? "controlled" : "", row.approximate ? "approximate" : ""].filter(Boolean).join(" ");
      const label = Number.isFinite(Number(row.position)) ? `P${row.position}` : "•";
      return `<g class="${classes}" data-driver="${escapeHtml(row.driverId)}" transform="translate(${point.x} ${point.y})"><circle r="${row.controlled ? 19 : 16}"></circle><text text-anchor="middle" y="4">${escapeHtml(label)}</text><title>${escapeHtml(`${row.driverName ?? row.driverId} · ${row.teamName ?? row.teamId ?? "Team"} · ${row.precision ?? "position"}`)}</title></g>`;
    }).join("")}
  </svg>`;
}

export function renderLiveRaceMap({ geometry = null, positions = null, trackName = null } = {}) {
  const status = liveRaceMapState({ geometry, positions });
  const telemetry = positions?.telemetryMode ?? "unavailable";

  if (!geometry?.available) {
    return `<article class="card span-12 live-race-map-card unavailable">
      <div class="live-race-map-head"><div><div class="eyebrow">Track Map</div><h2>${escapeHtml(trackName ?? geometry?.trackName ?? "Circuit")}</h2></div><span class="live-race-map-mode">Geometry unavailable</span></div>
      <div class="live-race-map-fallback"><strong>No circuit drawing shown</strong><p>${escapeHtml(status.message)}</p><small>Live timing, Race Control and strategy remain authoritative.</small></div>
    </article>`;
  }

  return `<article class="card span-12 live-race-map-card ${escapeHtml(status.status)}">
    <div class="live-race-map-head">
      <div><div class="eyebrow">Live Track Map</div><h2>${escapeHtml(trackName ?? geometry.trackName ?? "Circuit")}</h2></div>
      <div class="live-race-map-badges"><span>${escapeHtml(telemetry.replaceAll("_", " "))}</span><span>${status.drawableCars} marker${status.drawableCars === 1 ? "" : "s"}</span></div>
    </div>
    <div class="live-race-map-stage">
      ${trackSvg(geometry, positions ?? {})}
      ${status.status === "geometry_only" ? `<div class="live-race-map-overlay"><strong>Track positions withheld</strong><p>${escapeHtml(status.message)}</p></div>` : ""}
    </div>
    <div class="live-race-map-foot">
      <span>${escapeHtml(status.message)}</span>
      <span><i class="legend controlled"></i> Your team <i class="legend field"></i> Field ${status.approximateCars ? '<i class="legend approximate"></i> Approximate' : ""}</span>
    </div>
  </article>`;
}
