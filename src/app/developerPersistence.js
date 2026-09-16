import { validateSeasonDatabaseAgainstGlobal } from "../data/careerBootstrap.js";
import { deserializeSaveWorld, serializeSaveWorld } from "../save/serialization.js";
import { createCoreWorldSystems } from "../sim/systems/coreWorldSystems.js";
import { initializeSimulation } from "../sim/timeEngine.js";

function text(value) {
  return value === null || value === undefined ? null : String(value);
}

function activeWeekendKey(saveWorld) {
  const rows = Object.values(saveWorld.world?.raceWeekendState?.active ?? {});
  const active = rows.find((row) => row?.phase && row.phase !== "completed")
    ?? rows.at?.(-1)
    ?? rows[rows.length - 1]
    ?? null;
  return active?.key ?? null;
}

function saveWorldFrom(input) {
  if (input?.meta && input?.clock && input?.world) return structuredClone(input);
  return deserializeSaveWorld(input);
}

export function validateDeveloperSaveCompatibility(session, saveWorld) {
  if (!session?.seasonDatabase) throw new TypeError("A DeveloperPlaytestSession with a Season Database is required.");
  if (!saveWorld?.meta || !saveWorld?.clock || !saveWorld?.world) throw new TypeError("A valid Save World is required.");

  const current = {
    season: Number(session.seasonDatabase.season),
    databaseVersion: text(session.seasonDatabase.databaseVersion ?? session.seasonDatabase.snapshot?.databaseVersion),
    sourceChecksum: text(session.seasonDatabase.sourceChecksum ?? session.seasonDatabase.snapshot?.sourceChecksum),
  };
  const saved = saveWorld.meta?.seasonDatabase;
  if (!saved) throw new Error("Save World has no Season Database provenance and cannot be restored safely.");

  const issues = [];
  if (Number(saved.season) !== current.season) {
    issues.push(`save season source ${saved.season} does not match loaded Season Database ${current.season}`);
  }
  if (current.databaseVersion && text(saved.databaseVersion) !== current.databaseVersion) {
    issues.push(`save databaseVersion ${saved.databaseVersion ?? "missing"} does not match ${current.databaseVersion}`);
  }
  if (current.sourceChecksum && text(saved.sourceChecksum) !== current.sourceChecksum) {
    issues.push("save sourceChecksum does not match the loaded Season Database");
  }
  if (issues.length) {
    const error = new Error(`Save / Season Database compatibility failed: ${issues.join("; ")}.`);
    error.issues = issues;
    throw error;
  }

  if (session.globalDatabase) {
    validateSeasonDatabaseAgainstGlobal(session.seasonDatabase, session.globalDatabase, { allowWarnings: true });
  }
  return { ok: true, ...current };
}

export function restoreDeveloperPlaytestSession(session, input) {
  if (!session || typeof session.state !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  const saveWorld = saveWorldFrom(input);
  validateDeveloperSaveCompatibility(session, saveWorld);

  const controlledTeamId = saveWorld.player?.controlledTeamIds?.[0] ?? null;
  const managerName = text(saveWorld.player?.manager?.name)
    ?? text(saveWorld.world?.management?.managerCareer?.name)
    ?? "Manager";

  session.saveWorld = saveWorld;
  session.controlledTeamId = controlledTeamId;
  session.managerName = managerName;
  session.lastWeekendKey = activeWeekendKey(saveWorld);
  session.systems = createCoreWorldSystems({ controlledTeamIds: controlledTeamId ? [controlledTeamId] : [] })
    .filter((system) => !["race.weekend", "race.timeline"].includes(system.id));

  // Current Phase 45 saves already carry __simulationInitialized. Calling the
  // canonical initializer is intentionally idempotent and also gives older
  // valid envelopes a single safe initialization path rather than replaying it
  // unconditionally in the application layer.
  initializeSimulation(session.saveWorld, session.systems);
  return session.state();
}

export function serializeDeveloperPlaytestSession(session, options = {}) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  return serializeSaveWorld(session.requireCareer(), options);
}