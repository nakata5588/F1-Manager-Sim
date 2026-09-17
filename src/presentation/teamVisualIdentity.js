const FALLBACK_PALETTES = Object.freeze([
  ["#3c5a78", "#d9e2ec", "#111820"],
  ["#7a4b3a", "#e8d8c8", "#1a1715"],
  ["#356859", "#d7e6dd", "#101916"],
  ["#6a4f7d", "#e5dced", "#17131a"],
  ["#76632f", "#ece4c6", "#19170f"],
  ["#43506b", "#dce2ef", "#12151d"],
  ["#6e3f52", "#ecd8e0", "#1b1216"],
  ["#43666a", "#d8e7e8", "#11191a"],
]);

function teamIdOf(row = {}) {
  return row.team_id ?? row.id ?? null;
}

function teamRow(saveWorld, teamId) {
  return [...(saveWorld.world?.teams ?? []), ...(saveWorld.world?.futureTeams ?? [])]
    .find((row) => String(teamIdOf(row) ?? "") === String(teamId)) ?? null;
}

function validColour(value) {
  const colour = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : null;
}

function firstColour(...values) {
  for (const value of values) {
    const colour = validColour(value);
    if (colour) return colour;
  }
  return null;
}

function explicitIdentity(row = {}) {
  const nested = row.visualIdentity ?? row.visual_identity ?? row.presentation?.visualIdentity ?? row.presentation?.visual_identity ?? {};
  const colours = nested.colours ?? nested.colors ?? row.colours ?? row.colors ?? {};
  const primary = firstColour(
    nested.primaryColour, nested.primaryColor, colours.primary, row.primary_colour, row.primary_color, row.primaryColour, row.primaryColor,
  );
  const secondary = firstColour(
    nested.secondaryColour, nested.secondaryColor, colours.secondary, row.secondary_colour, row.secondary_color, row.secondaryColour, row.secondaryColor,
  );
  const tertiary = firstColour(
    nested.tertiaryColour, nested.tertiaryColor, colours.tertiary, row.tertiary_colour, row.tertiary_color, row.tertiaryColour, row.tertiaryColor,
  );
  const hasColour = Boolean(primary || secondary || tertiary);
  const templates = {
    carTemplate: nested.carTemplate ?? nested.car_template ?? row.car_template ?? row.carTemplate ?? null,
    liveryTemplate: nested.liveryTemplate ?? nested.livery_template ?? row.livery_template ?? row.liveryTemplate ?? null,
    suitTemplate: nested.suitTemplate ?? nested.suit_template ?? row.suit_template ?? row.suitTemplate ?? null,
  };
  return {
    hasValue: hasColour || Object.values(templates).some(Boolean),
    primary,
    secondary,
    tertiary,
    ...templates,
  };
}

function presentationOverride(saveWorld, teamId) {
  const row = saveWorld.world?.presentation?.teamVisualIdentity?.[teamId]
    ?? saveWorld.world?.presentation?.teamVisualIdentities?.[teamId]
    ?? null;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  return explicitIdentity(row);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackPalette(teamId) {
  return FALLBACK_PALETTES[stableHash(teamId) % FALLBACK_PALETTES.length];
}

export function teamVisualIdentity(saveWorld, teamIdValue, { displayName = null } = {}) {
  const teamId = String(teamIdValue ?? "").trim();
  if (!teamId) throw new Error("A team id is required for visual identity.");
  const sourceRow = teamRow(saveWorld, teamId) ?? {};
  const explicit = explicitIdentity(sourceRow);
  const override = presentationOverride(saveWorld, teamId);
  const fallback = fallbackPalette(teamId);
  const chosen = override?.hasValue ? override : explicit.hasValue ? explicit : null;

  return {
    teamId,
    displayName: displayName ?? sourceRow.team_name ?? sourceRow.display_name ?? sourceRow.name ?? teamId,
    colours: {
      primary: chosen?.primary ?? fallback[0],
      secondary: chosen?.secondary ?? fallback[1],
      tertiary: chosen?.tertiary ?? fallback[2],
    },
    templates: {
      car: chosen?.carTemplate ?? null,
      livery: chosen?.liveryTemplate ?? null,
      suit: chosen?.suitTemplate ?? null,
    },
    media: {
      logo: { kind: "teamLogo", entityId: teamId },
      car: { kind: "car", entityId: teamId },
      backdrop: { kind: "teamBackdrop", entityId: teamId },
    },
    provenance: override?.hasValue
      ? "save_world_presentation_override"
      : explicit.hasValue
        ? "source_presentation_hint"
        : "derived_presentation_fallback",
    simulationAuthority: false,
  };
}
