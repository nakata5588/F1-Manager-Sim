export const CAREER_NAV_GROUPS = Object.freeze([
  {
    id: "career",
    label: "Career",
    items: [
      { id: "home", label: "Home", href: "/" },
      { id: "inbox", label: "Inbox", href: "/management.html#inbox" },
      { id: "calendar", label: "Calendar", href: "/championship.html#calendar" },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [
      { id: "team", label: "Team", href: "/management.html#people" },
      { id: "drivers", label: "Drivers", href: "/management.html#recruitment" },
      { id: "staff", label: "Staff", href: "/management.html#staff" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "technical", label: "Car & Development", href: "/technical.html" },
      { id: "commercial", label: "Finances & Sponsors", href: "/management.html#commercial" },
    ],
  },
  {
    id: "competition",
    label: "Competition",
    items: [
      { id: "standings", label: "Standings", href: "/championship.html#standings" },
      { id: "world", label: "F1 World", href: "/world.html" },
      { id: "governance", label: "Governance", href: "/governance.html" },
    ],
  },
  {
    id: "season",
    label: "Season",
    items: [
      { id: "offseason", label: "Offseason & New Season", href: "/offseason.html" },
    ],
  },
]);

const MANAGEMENT_HASH_TO_NAV = Object.freeze({
  inbox: "inbox",
  board: "team",
  career: "team",
  people: "team",
  staff: "staff",
  recruitment: "drivers",
  contracts: "drivers",
  market: "drivers",
  commercial: "commercial",
  responsibilities: "team",
});

const MANAGEMENT_TABS = new Set(Object.keys(MANAGEMENT_HASH_TO_NAV));

function cleanPath(pathname) {
  const value = String(pathname || "/").replace(/\/+$/, "");
  return value || "/";
}

function cleanHash(hash) {
  return String(hash || "").replace(/^#/, "").trim().toLowerCase();
}

export function managementTabForHash(hash) {
  const tab = cleanHash(hash);
  return MANAGEMENT_TABS.has(tab) ? tab : null;
}

export function activeCareerNavId(location = {}) {
  const path = cleanPath(location.pathname);
  const hash = cleanHash(location.hash);
  const params = new URLSearchParams(String(location.search || ""));

  if (path === "/management.html") return MANAGEMENT_HASH_TO_NAV[hash] ?? "inbox";
  if (path === "/technical.html") return "technical";
  if (path === "/championship.html") return hash === "standings" ? "standings" : "calendar";
  if (path === "/world.html") return "world";
  if (path === "/governance.html") return "governance";
  if (path === "/offseason.html") return "offseason";
  if (path === "/") {
    if (params.get("section") === "calendar") return "calendar";
    if (params.get("section") === "standings") return "standings";
    return "home";
  }
  return null;
}

export function buildCareerNavigation(location = {}, options = {}) {
  const activeId = activeCareerNavId(location);
  const unread = Math.max(0, Number(options.unreadInbox ?? 0) || 0);
  return CAREER_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      active: item.id === activeId,
      badge: item.id === "inbox" && unread > 0 ? unread : null,
    })),
  }));
}

export function continueIntent(state = {}) {
  if (!state || state.screen === "new_career" || !state.career) {
    return { visible: false, kind: "none", label: null, href: null };
  }

  const weekend = state.raceWeekend;
  if (weekend && weekend.stage && weekend.stage !== "completed") {
    return { visible: true, kind: "navigate", label: "RACE WEEKEND ▶", href: "/" };
  }

  if (!state.nextRace) {
    return { visible: true, kind: "navigate", label: "OFFSEASON ▶", href: "/offseason.html" };
  }

  return { visible: true, kind: "continue", label: "CONTINUE ▶", href: "/" };
}

export function homeSectionTarget(location = {}) {
  if (cleanPath(location.pathname) !== "/") return null;
  const params = new URLSearchParams(String(location.search || ""));
  const section = params.get("section");
  return section === "calendar" || section === "standings" ? section : null;
}

export function careerPageLabel(location = {}) {
  const activeId = activeCareerNavId(location);
  for (const group of CAREER_NAV_GROUPS) {
    const item = group.items.find((row) => row.id === activeId);
    if (item) return { id: item.id, label: item.label, group: group.label };
  }
  const path = cleanPath(location.pathname);
  if (path === "/profile.html") return { id: "profile", label: "Profile", group: "F1 World" };
  return { id: activeId ?? "career", label: "Career", group: "Career" };
}

function teamProfileId(profile) {
  return profile?.id ?? null;
}

export function careerShellContext(state = {}, teamProfile = null, location = {}) {
  const page = careerPageLabel(location);
  const career = state.career ?? {};
  const manager = career.managerProfile ?? {};
  const teamId = career.controlledTeamId ?? teamProfileId(teamProfile);
  const teamName = teamProfile?.name ?? career.teamName ?? teamId ?? "No Team";
  const weekend = state.raceWeekend;
  const nextRace = state.nextRace;

  let event = {
    eyebrow: "Season",
    status: "offseason",
    title: "Championship calendar complete",
    meta: "Offseason available",
    date: null,
  };
  if (weekend && weekend.stage && weekend.stage !== "completed") {
    event = {
      eyebrow: `Round ${weekend.round ?? "—"}`,
      status: weekend.stage,
      title: weekend.name ?? "Race Weekend",
      meta: weekend.trackName ?? "Active race weekend",
      date: weekend.date ?? null,
    };
  } else if (nextRace) {
    event = {
      eyebrow: `Next · Round ${nextRace.round ?? "—"}`,
      status: "upcoming",
      title: nextRace.name ?? "Grand Prix",
      meta: "Upcoming race",
      date: nextRace.date ?? null,
    };
  }

  return {
    page,
    manager: {
      name: career.managerName ?? manager.name ?? "Manager",
      nationality: manager.nationality ?? null,
    },
    team: {
      id: teamId,
      name: teamName,
      nationality: teamProfile?.nationality ?? null,
      logoUrl: teamProfile?.media?.url ?? teamProfile?.resolvedMedia?.logo?.url ?? null,
      colours: teamProfile?.visualIdentity?.colours ?? null,
    },
    season: career.season ?? null,
    date: career.date ?? null,
    event,
    continue: continueIntent(state),
  };
}
