export const MANAGEMENT_PRIMARY_SECTIONS = Object.freeze([
  { id: "inbox", label: "Inbox", href: "#inbox" },
  { id: "team", label: "Team", href: "#team" },
  { id: "drivers", label: "Drivers", href: "#drivers" },
  { id: "staff", label: "Staff", href: "#staff" },
  { id: "board", label: "Board", href: "#board" },
  { id: "commercial", label: "Finances & Sponsors", href: "#commercial" },
  { id: "career", label: "Career", href: "#career" },
]);

export const MANAGEMENT_SUBSECTIONS = Object.freeze({
  team: [
    { id: "team", label: "Overview" },
    { id: "responsibilities", label: "Responsibilities" },
  ],
  drivers: [
    { id: "drivers", label: "Current Drivers" },
    { id: "recruitment", label: "Recruitment" },
    { id: "contracts", label: "Contracts" },
    { id: "market", label: "Market Activity" },
  ],
  staff: [
    { id: "staff", label: "Current Staff" },
    { id: "staff-market", label: "Recruitment & Contracts" },
  ],
});

const LEGACY_ALIASES = Object.freeze({
  people: "team",
});

const VIEW_TO_PRIMARY = Object.freeze({
  inbox: "inbox",
  team: "team",
  responsibilities: "team",
  drivers: "drivers",
  recruitment: "drivers",
  contracts: "drivers",
  market: "drivers",
  staff: "staff",
  "staff-market": "staff",
  board: "board",
  commercial: "commercial",
  career: "career",
});

function cleanHash(hash) {
  return String(hash ?? "").replace(/^#/, "").trim().toLowerCase();
}

export function normalizeManagementView(hash) {
  const raw = cleanHash(hash);
  const aliased = LEGACY_ALIASES[raw] ?? raw;
  return Object.hasOwn(VIEW_TO_PRIMARY, aliased) ? aliased : "inbox";
}

export function primarySectionForView(view) {
  return VIEW_TO_PRIMARY[normalizeManagementView(view)] ?? "inbox";
}

export function subsectionsForView(view) {
  const primary = primarySectionForView(view);
  return MANAGEMENT_SUBSECTIONS[primary] ?? [];
}

export function managementViewHref(view) {
  return `/management.html#${normalizeManagementView(view)}`;
}
