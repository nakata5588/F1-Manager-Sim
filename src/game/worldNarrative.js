function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const IMPORTANCE_ORDER = Object.freeze({ low: 0, normal: 1, high: 2, major: 3 });

function normalizeImportance(value) {
  const key = text(value, "normal").trim().toLowerCase();
  return Object.hasOwn(IMPORTANCE_ORDER, key) ? key : "normal";
}

function normalizeEntityRefs(rows = []) {
  const output = [];
  const seen = new Set();
  for (const row of rows ?? []) {
    const type = text(row?.type).trim();
    const id = text(row?.id).trim();
    if (!type || !id) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ type, id, name: row?.name ?? null });
  }
  return output;
}

function ensureHistory(saveWorld) {
  saveWorld.history ??= {};
  saveWorld.history.events ??= [];
  saveWorld.history.records ??= [];
  saveWorld.history.races ??= [];
  saveWorld.history.championships ??= [];
  return saveWorld.history;
}

export function ensureWorldNarrative(saveWorld) {
  saveWorld.world ??= {};
  saveWorld.world.media ??= {};
  saveWorld.world.media.news ??= { nextId: 1, stories: [] };
  const news = saveWorld.world.media.news;
  news.nextId = Math.max(1, Number(news.nextId ?? 1));
  news.stories ??= [];
  ensureHistory(saveWorld);
  return news;
}

function duplicateBySource(rows, sourceEventId, storyKey) {
  if (!sourceEventId) return null;
  return rows.find((row) => row.sourceEventId === sourceEventId && row.storyKey === storyKey) ?? null;
}

export function publishWorldStory(saveWorld, input = {}) {
  const news = ensureWorldNarrative(saveWorld);
  const storyKey = text(input.storyKey ?? input.category, "world").trim() || "world";
  const sourceEventId = input.sourceEventId ?? null;
  const duplicate = duplicateBySource(news.stories, sourceEventId, storyKey);
  if (duplicate) return structuredClone(duplicate);

  const serial = news.nextId++;
  const story = {
    id: `news:${String(serial).padStart(7, "0")}`,
    date: text(input.date ?? saveWorld.clock?.date).slice(0, 10),
    season: numeric(input.season ?? saveWorld.clock?.season),
    category: text(input.category, "world").trim() || "world",
    importance: normalizeImportance(input.importance),
    headline: text(input.headline, "Formula One world update").trim() || "Formula One world update",
    summary: text(input.summary).trim(),
    sourceEventId,
    sourceEventType: input.sourceEventType ?? null,
    storyKey,
    entities: normalizeEntityRefs(input.entities),
    tags: [...new Set((input.tags ?? []).map((value) => text(value).trim()).filter(Boolean))],
    provenance: "simulation_event_projection",
  };
  news.stories.push(story);
  return structuredClone(story);
}

export function appendWorldHistoryEvent(saveWorld, input = {}) {
  const history = ensureHistory(saveWorld);
  const storyKey = text(input.storyKey ?? input.type, "world").trim() || "world";
  const sourceEventId = input.sourceEventId ?? null;
  const duplicate = duplicateBySource(history.events, sourceEventId, storyKey);
  if (duplicate) return structuredClone(duplicate);

  const row = {
    id: `history:${String(history.events.length + 1).padStart(8, "0")}`,
    date: text(input.date ?? saveWorld.clock?.date).slice(0, 10),
    season: numeric(input.season ?? saveWorld.clock?.season),
    type: text(input.type, "world_event").trim() || "world_event",
    category: text(input.category, "world").trim() || "world",
    importance: normalizeImportance(input.importance),
    title: text(input.title ?? input.headline, "World event").trim() || "World event",
    summary: text(input.summary).trim(),
    sourceEventId,
    sourceEventType: input.sourceEventType ?? null,
    storyKey,
    entities: normalizeEntityRefs(input.entities),
    data: structuredClone(input.data ?? {}),
    provenance: "simulation_event_history",
  };
  history.events.push(row);
  return structuredClone(row);
}

export function appendWorldRecord(saveWorld, input = {}) {
  const history = ensureHistory(saveWorld);
  const recordKey = text(input.recordKey).trim();
  if (!recordKey) throw new TypeError("A stable recordKey is required for a world record.");
  const duplicate = history.records.find((row) => row.recordKey === recordKey);
  if (duplicate) return structuredClone(duplicate);

  const row = {
    id: `record:${String(history.records.length + 1).padStart(8, "0")}`,
    recordKey,
    date: text(input.date ?? saveWorld.clock?.date).slice(0, 10),
    season: numeric(input.season ?? saveWorld.clock?.season),
    recordType: text(input.recordType, "milestone").trim() || "milestone",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    value: numeric(input.value),
    title: text(input.title, "Career record").trim() || "Career record",
    context: structuredClone(input.context ?? {}),
    sourceEventId: input.sourceEventId ?? null,
    provenance: "simulation_record",
  };
  history.records.push(row);
  return structuredClone(row);
}

export function listWorldNews(saveWorld, options = {}) {
  const news = ensureWorldNarrative(saveWorld);
  let rows = [...news.stories];
  if (options.category) rows = rows.filter((row) => row.category === options.category);
  if (options.entityId) rows = rows.filter((row) => row.entities.some((entity) => String(entity.id) === String(options.entityId)));
  if (options.minImportance) {
    const floor = IMPORTANCE_ORDER[normalizeImportance(options.minImportance)];
    rows = rows.filter((row) => IMPORTANCE_ORDER[row.importance] >= floor);
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || Number(b.season ?? 0) - Number(a.season ?? 0) || b.id.localeCompare(a.id));
  const limit = Number(options.limit ?? 100);
  return structuredClone(Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows);
}

export function listWorldHistory(saveWorld, options = {}) {
  const history = ensureHistory(saveWorld);
  let rows = [...history.events];
  if (options.category) rows = rows.filter((row) => row.category === options.category);
  if (options.type) rows = rows.filter((row) => row.type === options.type);
  if (options.entityId) rows = rows.filter((row) => row.entities.some((entity) => String(entity.id) === String(options.entityId)));
  if (options.season !== undefined) rows = rows.filter((row) => Number(row.season) === Number(options.season));
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const limit = Number(options.limit ?? 200);
  return structuredClone(Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows);
}

function driverName(saveWorld, id) {
  const row = [...(saveWorld.world?.drivers ?? []), ...(saveWorld.world?.futureDrivers ?? [])]
    .find((entry) => String(entry?.driver_id ?? entry?.id) === String(id));
  return row?.display_name ?? row?.driver_name ?? row?.name ?? id;
}

function teamName(saveWorld, id) {
  const row = [...(saveWorld.world?.teams ?? []), ...(saveWorld.world?.inactiveTeams ?? []), ...(saveWorld.world?.futureTeams ?? [])]
    .find((entry) => String(entry?.team_id ?? entry?.id) === String(id));
  return row?.team_name ?? row?.display_name ?? row?.name ?? id;
}

function ensureStat(bucket, id, name) {
  bucket[id] ??= { id, name, starts: 0, wins: 0, podiums: 0, championships: 0 };
  return bucket[id];
}

export function worldRecordsSummary(saveWorld) {
  const history = ensureHistory(saveWorld);
  const drivers = {};
  const teams = {};

  for (const race of history.races ?? []) {
    for (const result of race?.classification ?? []) {
      const driverId = result?.driverId ?? result?.driver_id ?? null;
      const teamId = result?.teamId ?? result?.team_id ?? null;
      if (!driverId || !teamId) continue;
      const driver = ensureStat(drivers, driverId, driverName(saveWorld, driverId));
      const team = ensureStat(teams, teamId, teamName(saveWorld, teamId));
      driver.starts += 1;
      team.starts += 1;
      const position = numeric(result?.position);
      if (position === 1) {
        driver.wins += 1;
        team.wins += 1;
      }
      if (position !== null && position <= 3 && position >= 1) {
        driver.podiums += 1;
        team.podiums += 1;
      }
    }
  }

  const championships = [];
  for (const season of history.championships ?? []) {
    const driverChampionId = season?.driverChampionId ?? season?.driver_champion_id ?? null;
    const constructorChampionId = season?.constructorChampionId ?? season?.constructor_champion_id ?? null;
    if (driverChampionId) ensureStat(drivers, driverChampionId, driverName(saveWorld, driverChampionId)).championships += 1;
    if (constructorChampionId) ensureStat(teams, constructorChampionId, teamName(saveWorld, constructorChampionId)).championships += 1;
    championships.push({
      season: numeric(season?.season),
      driverChampionId,
      driverChampionName: driverChampionId ? driverName(saveWorld, driverChampionId) : null,
      constructorChampionId,
      constructorChampionName: constructorChampionId ? teamName(saveWorld, constructorChampionId) : null,
      standingsStatus: season?.standingsStatus ?? season?.standings_status ?? null,
    });
  }

  const sortStats = (rows) => Object.values(rows).sort((a, b) => b.championships - a.championships || b.wins - a.wins || b.podiums - a.podiums || b.starts - a.starts || String(a.id).localeCompare(String(b.id)));
  return {
    drivers: sortStats(drivers),
    teams: sortStats(teams),
    championships: championships.sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0)),
    milestones: structuredClone(history.records ?? []),
  };
}
