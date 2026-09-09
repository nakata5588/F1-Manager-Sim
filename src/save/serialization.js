export const SAVE_FORMAT = "f1-manager-sim-save";
export const SAVE_SCHEMA_VERSION = 1;

export function serializeSaveWorld(saveWorld, options = {}) {
  if (!saveWorld?.meta || !saveWorld?.clock || !saveWorld?.world) {
    throw new TypeError("Invalid Save World.");
  }
  const envelope = {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: options.savedAt ?? new Date().toISOString(),
    save: saveWorld,
  };
  return JSON.stringify(envelope, null, options.pretty === false ? 0 : 2);
}

export function deserializeSaveWorld(serialized) {
  const envelope = typeof serialized === "string" ? JSON.parse(serialized) : structuredClone(serialized);
  if (envelope?.format !== SAVE_FORMAT) throw new Error("Unsupported save format.");
  if (Number(envelope.schemaVersion) !== SAVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported save schema version ${envelope?.schemaVersion}.`);
  }
  if (!envelope.save?.meta || !envelope.save?.clock || !envelope.save?.world) {
    throw new Error("Save payload is incomplete.");
  }
  return structuredClone(envelope.save);
}
