export class SeasonPackOverlayError extends Error {
  constructor(message) {
    super(message);
    this.name = "SeasonPackOverlayError";
  }
}

function clone(value) {
  return structuredClone(value);
}

export function applySeasonPackOverlay(basePayload, overlay) {
  if (!basePayload || basePayload.type !== "season_pack") {
    throw new SeasonPackOverlayError("Season Pack overlay requires a valid base season_pack payload.");
  }
  if (!overlay || overlay.format !== "f1-manager-sim-season-pack-overlay") {
    throw new SeasonPackOverlayError("Unsupported Season Pack overlay format.");
  }
  if (String(basePayload.version ?? "") !== String(overlay.baseVersion ?? "")) {
    throw new SeasonPackOverlayError(`Overlay expects base version '${overlay.baseVersion}', received '${basePayload.version}'.`);
  }
  if (Number(basePayload.season) !== Number(overlay.season)) {
    throw new SeasonPackOverlayError(`Overlay targets season ${overlay.season}, received ${basePayload.season}.`);
  }
  if (!overlay.targetVersion) throw new SeasonPackOverlayError("Overlay targetVersion is required.");
  if (!overlay.sheets || typeof overlay.sheets !== "object") throw new SeasonPackOverlayError("Overlay sheets are required.");

  const output = clone(basePayload);
  Object.assign(output, clone(overlay.topLevel ?? {}));
  output.version = String(overlay.targetVersion);
  output.sheets ??= {};
  for (const [name, matrix] of Object.entries(overlay.sheets)) output.sheets[name] = clone(matrix);
  return output;
}

export function overlaySourceChecksum(overlay) {
  const value = String(overlay?.sourcePayloadSha256 ?? "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
