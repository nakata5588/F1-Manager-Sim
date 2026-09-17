const FALLBACK_PALETTES = Object.freeze([
  ["#3C5A78", "#D9E2EC", "#111820"],
  ["#7A4B3A", "#E8D8C8", "#1A1715"],
  ["#356859", "#D7E6DD", "#101916"],
  ["#6A4F7D", "#E5DCED", "#17131A"],
  ["#76632F", "#ECE4C6", "#19170F"],
  ["#43506B", "#DCE2EF", "#12151D"],
  ["#6E3F52", "#ECD8E0", "#1B1216"],
  ["#43666A", "#D8E7E8", "#11191A"],
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
    nested.primaryColour,
    nested.primaryColor,
    nested.primary_colour,
    nested.primary_color,
    colours.primary,
    row.primary_colour,
    row.primary_color,
    row.primaryColour,
    row.primaryColor,
  );
  const secondary = firstColour(
    nested.secondaryColour,
    nested.secondaryColor,
    nested.secondary_colour,
    nested.secondary_color,
    colours.secondary,
    row.secondary_colour,
    row.secondary_color,
    row.secondaryColour,
    row.secondaryColor,
  );
  const tertiary = firstColour(
    nested.tertiaryColour,
    nested.tertiaryColor,
    nested.tertiary_colour,
    nested.tertiary_color,
    colours.tertiary,
    row.tertiary_colour,
    row.tertiary_color,
    row.tertiaryColour,
    row.tertiaryColor,
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
      primary: (chosen?.primary ?? fallback[0]).toUpperCase(),
      secondary: (chosen?.secondary ?? fallback[1]).toUpperCase(),
      tertiary: (chosen?.tertiary ?? fallback[2]).toUpperCase(),
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
