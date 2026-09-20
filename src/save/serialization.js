export const SAVE_FORMAT = "f1-manager-sim-save";
export const SAVE_SCHEMA_VERSION = 2;
export const MIN_SUPPORTED_SAVE_SCHEMA_VERSION = 1;

function cloneEnvelope(serialized) {
  return typeof serialized === "string" ? JSON.parse(serialized) : structuredClone(serialized);
}

function requireSavePayload(envelope) {
  if (!envelope?.save?.meta || !envelope.save?.clock || !envelope.save?.world) {
    throw new Error("Save payload is incomplete.");
  }
}

function migrateV1ToV2(envelope) {
  const next = structuredClone(envelope);
  requireSavePayload(next);
  next.schemaVersion = 2;
  next.save.meta ??= {};
  next.save.meta.saveSchemaVersion = 2;
  next.migrations = [
    ...(Array.isArray(next.migrations) ? next.migrations : []),
    {
      id: "save-schema-v1-to-v2",
      from: 1,
      to: 2,
      policy: "structural_metadata_only_no_gameplay_recalculation",
    },
  ];
  return next;
}

const MIGRATIONS = new Map([
  [1, migrateV1ToV2],
]);

export function migrateSaveEnvelope(serialized) {
  let envelope = cloneEnvelope(serialized);
  if (envelope?.format !== SAVE_FORMAT) throw new Error("Unsupported save format.");

  let version = Number(envelope.schemaVersion);
  if (!Number.isInteger(version)) throw new Error(`Unsupported save schema version ${envelope?.schemaVersion}.`);
  if (version > SAVE_SCHEMA_VERSION) {
    throw new Error(`Save schema version ${version} is newer than supported version ${SAVE_SCHEMA_VERSION}.`);
  }
  if (version < MIN_SUPPORTED_SAVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported save schema version ${version}.`);
  }

  while (version < SAVE_SCHEMA_VERSION) {
    const migrate = MIGRATIONS.get(version);
    if (!migrate) throw new Error(`No save migration path exists from schema version ${version}.`);
    envelope = migrate(envelope);
    const nextVersion = Number(envelope.schemaVersion);
    if (!Number.isInteger(nextVersion) || nextVersion <= version) {
      throw new Error(`Save migration from schema version ${version} did not advance the schema.`);
    }
    version = nextVersion;
  }

  requireSavePayload(envelope);
  return envelope;
}

export function serializeSaveWorld(saveWorld, options = {}) {
  if (!saveWorld?.meta || !saveWorld?.clock || !saveWorld?.world) {
    throw new TypeError("Invalid Save World.");
  }
  const save = structuredClone(saveWorld);
  save.meta.saveSchemaVersion = SAVE_SCHEMA_VERSION;
  const envelope = {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: options.savedAt ?? new Date().toISOString(),
    migrations: [],
    save,
  };
  return JSON.stringify(envelope, null, options.pretty === false ? 0 : 2);
}

export function deserializeSaveWorld(serialized) {
  const envelope = migrateSaveEnvelope(serialized);
  return structuredClone(envelope.save);
}
