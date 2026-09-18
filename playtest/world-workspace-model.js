export const WORLD_VIEWS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "news", label: "News" },
  { id: "drivers", label: "Drivers" },
  { id: "teams", label: "Teams" },
  { id: "history", label: "History" },
  { id: "records", label: "Records" },
]);

const WORLD_VIEW_IDS = new Set(WORLD_VIEWS.map((row) => row.id));

function cleanHash(hash) {
  return String(hash ?? "").replace(/^#/, "").trim().toLowerCase();
}

export function worldViewForHash(hash) {
  const view = cleanHash(hash);
  if (!view) return "overview";
  return WORLD_VIEW_IDS.has(view) ? view : null;
}

export function normalizeWorldView(hash) {
  return worldViewForHash(hash) ?? "overview";
}

export function worldViewLabel(hash) {
  const id = normalizeWorldView(hash);
  return WORLD_VIEWS.find((row) => row.id === id)?.label ?? "Overview";
}

export function worldViewHref(view) {
  return `/world.html#${normalizeWorldView(view)}`;
}
