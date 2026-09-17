const LABELS = Object.freeze({
  main_driver: "First Driver",
  first_driver: "First Driver",
  lead_driver: "First Driver",
  second_driver: "Second Driver",
  race_driver: "Race Driver",
  reserve_driver: "Reserve Driver",
  test_driver: "Test Driver",
  technical_director: "Technical Director",
  sporting_director: "Sporting Director",
  team_principal: "Team Principal",
  team_manager_operations: "Team Manager",
  race_engineer: "Race Engineer",
  chief_designer: "Chief Designer",
  head_of_aerodynamics: "Head of Aerodynamics",
  aero_lead: "Aerodynamics Lead",
  chief_mechanic: "Chief Mechanic",
  performance_engineer: "Performance Engineer",
  strategy_engineer: "Strategy Engineer",
  commercial_director: "Commercial Director",
  scout: "Scout",
  employed: "Employed",
  available: "Available",
  free_agent: "Free Agent",
  unemployed: "Unemployed",
  pending: "Pending",
  open: "Open",
  countered: "Countered",
  agreed: "Agreed",
  accepted: "Accepted",
  rejected: "Rejected",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
  active: "Active",
  completed: "Completed",
  stable: "Stable",
  warning: "Under Review",
  critical: "Critical",
  practice: "Practice",
  practice_results: "Practice & Setup",
  practice_completed: "Practice Completed",
  qualifying: "Qualifying",
  qualifying_results: "Qualifying Results",
  qualifying_completed: "Qualifying Completed",
  pre_race: "Pre-Race",
  race_live: "Race",
  race_results: "Race Results",
  offseason: "Offseason",
  preseason: "Pre-Season",
  world_visible: "World Visible",
  talent_visible: "Scouting Visible",
  f1_eligible: "F1 Eligible",
  hidden: "Hidden",
  source_presentation_hint: "Historical Presentation",
  save_world_presentation_override: "Career Presentation",
  derived_presentation_fallback: "Default Presentation",
  manager: "Manager",
  staff: "Staff",
  driver: "Driver",
  team: "Team",
});

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function titleWord(value) {
  const lower = value.toLowerCase();
  if (lower === "f1") return "F1";
  if (lower === "rd" || lower === "r&d") return "R&D";
  if (/^v\d+$/.test(lower)) return lower.toUpperCase();
  return lower ? lower[0].toUpperCase() + lower.slice(1) : "";
}

export function publicLabel(value, fallback = "—") {
  const raw = text(value);
  if (!raw) return fallback;
  const key = raw.toLowerCase();
  if (LABELS[key]) return LABELS[key];
  if (!/[_-]/.test(raw)) return titleWord(raw);
  return raw.split(/[_-]+/).filter(Boolean).map(titleWord).join(" ");
}

const TOKEN_ENTRIES = Object.entries(LABELS)
  .sort(([a], [b]) => b.length - a.length)
  .map(([token, label]) => ({
    token,
    label,
    pattern: new RegExp("(^|[^A-Za-z0-9_])" + token.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&") + "(?=$|[^A-Za-z0-9_])", "gi"),
  }));

export function resolvePublicLabelsInText(value) {
  let result = String(value ?? "");
  for (const { pattern, label } of TOKEN_ENTRIES) {
    result = result.replace(pattern, (match, prefix) => `${prefix}${label}`);
  }
  return result;
}

export function publicLabelMap() {
  return { ...LABELS };
}
