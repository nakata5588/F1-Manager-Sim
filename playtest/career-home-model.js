function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function priorityRank(item = {}) {
  if (item.decision?.status === "pending") return 0;
  if (item.priority === "urgent") return 1;
  if (item.priority === "high") return 2;
  if (item.unread) return 3;
  return 4;
}

function recentInboxItems(inbox = {}) {
  return [...(inbox.items ?? [])]
    .filter((item) => !item.archived)
    .sort((a, b) => priorityRank(a) - priorityRank(b)
      || String(b.date ?? "").localeCompare(String(a.date ?? ""))
      || String(b.id ?? "").localeCompare(String(a.id ?? "")))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      date: item.date ?? null,
      category: item.category ?? "management",
      priority: item.priority ?? "normal",
      title: item.title ?? "Management update",
      unread: Boolean(item.unread),
      decisionPending: item.decision?.status === "pending",
    }));
}

function teamDrivers(state = {}) {
  const standings = new Map((state.standings?.drivers ?? []).map((row) => [String(row.id), row]));
  return (state.teamDrivers ?? []).map((driver) => {
    const championship = standings.get(String(driver.id));
    return {
      id: driver.id,
      name: driver.name,
      role: driver.role,
      position: championship?.position ?? null,
      points: number(championship?.points, 0),
      wins: number(championship?.wins, 0),
    };
  });
}

function raceTimeline(state = {}, world = {}) {
  const recent = (world.history ?? [])
    .filter((row) => row?.category === "race" || /race|grand prix/i.test(`${row?.type ?? ""} ${row?.title ?? ""}`))
    .slice(0, 5)
    .reverse()
    .map((row) => ({
      id: row.id ?? `${row.date ?? ""}:${row.title ?? row.type ?? "race"}`,
      date: row.date ?? null,
      label: row.title ?? row.headline ?? "Grand Prix",
      status: "completed",
      round: number(row.round),
    }));

  if (state.nextRace) {
    recent.push({
      id: state.nextRace.id,
      date: state.nextRace.date,
      label: state.nextRace.name,
      status: "next",
      round: number(state.nextRace.round),
    });
  }
  return recent;
}

function attentionItems({ state = {}, management = {}, technical = {}, inbox = {} } = {}) {
  const rows = [];
  const summary = inbox.summary ?? management.inbox ?? {};
  const pending = number(summary.decisionsPending, 0);
  const unread = number(summary.unread, 0);
  const board = management.board ?? null;
  const tech = technical.summary ?? {};

  if (pending > 0) rows.push({
    id: "pending-decisions",
    tone: "critical",
    label: `${pending} decision${pending === 1 ? "" : "s"} waiting in Inbox`,
    href: "/management.html#inbox",
  });
  if (unread > 0) rows.push({
    id: "unread-inbox",
    tone: pending > 0 ? "normal" : "attention",
    label: `${unread} unread Inbox item${unread === 1 ? "" : "s"}`,
    href: "/management.html#inbox",
  });
  if (board && number(board.confidence, 100) < 45) rows.push({
    id: "board-pressure",
    tone: number(board.confidence, 100) < 25 ? "critical" : "attention",
    label: `Board confidence is ${Math.round(number(board.confidence, 0))}%`,
    href: "/management.html#board",
  });
  if (number(tech.readySpecs, 0) > 0) rows.push({
    id: "ready-specs",
    tone: "positive",
    label: `${number(tech.readySpecs, 0)} car specification${number(tech.readySpecs, 0) === 1 ? " is" : "s are"} ready for manufacture`,
    href: "/technical.html",
  });
  if (state.raceWeekend && state.raceWeekend.stage !== "completed") rows.push({
    id: "race-weekend",
    tone: "attention",
    label: `${state.raceWeekend.name ?? "Race Weekend"} is in progress`,
    href: "/",
  });
  else if (state.nextRace) rows.push({
    id: "next-race",
    tone: "normal",
    label: `Next: R${state.nextRace.round ?? "—"} ${state.nextRace.name ?? "Grand Prix"}`,
    href: "/championship.html#calendar",
  });
  return rows.slice(0, 6);
}

export function buildCareerHomeModel(input = {}) {
  const state = input.state ?? {};
  const management = input.management ?? {};
  const technical = input.technical ?? {};
  const world = input.world ?? {};
  const inbox = input.inbox ?? {};
  const controlledTeamId = state.career?.controlledTeamId ?? null;
  const constructor = (state.standings?.constructors ?? []).find((row) => String(row.id) === String(controlledTeamId)) ?? null;
  const board = management.board ?? null;
  const commercial = management.commercial ?? {};

  return {
    career: {
      managerName: state.career?.managerName ?? null,
      teamId: controlledTeamId,
      teamName: state.career?.teamName ?? null,
      season: number(state.career?.season),
      date: state.career?.date ?? null,
    },
    attention: attentionItems({ state, management, technical, inbox }),
    inbox: {
      summary: { ...(inbox.summary ?? management.inbox ?? {}) },
      items: recentInboxItems(inbox),
    },
    competition: {
      constructorPosition: constructor?.position ?? null,
      constructorPoints: number(constructor?.points, 0),
      drivers: teamDrivers(state),
      topDrivers: (state.standings?.drivers ?? []).slice(0, 5).map((row) => ({ ...row })),
      topConstructors: (state.standings?.constructors ?? []).slice(0, 5).map((row) => ({ ...row })),
    },
    calendar: {
      nextRace: state.nextRace ? { ...state.nextRace } : null,
      timeline: raceTimeline(state, world),
      racesArchived: number(world.summary?.racesArchived, 0),
    },
    board: board ? {
      confidence: number(board.confidence),
      status: board.status ?? null,
      objectives: (board.objectives ?? []).map((row) => ({ ...row })),
    } : null,
    technical: {
      responsibility: technical.responsibility ?? null,
      summary: { ...(technical.summary ?? {}) },
      supplier: technical.supplier?.active ?? technical.supplier?.current ?? technical.supplier ?? null,
    },
    commercial: {
      activeDeals: number(commercial.activeDeals ?? commercial.deals ?? commercial.active, 0),
      openNegotiations: number(commercial.openNegotiations ?? commercial.negotiations ?? commercial.activeNegotiations, 0),
      pendingActivities: number(commercial.pendingActivities ?? commercial.activitiesPending, 0),
    },
    news: (world.news ?? []).slice(0, 5).map((row) => ({
      id: row.id ?? null,
      date: row.date ?? null,
      category: row.category ?? "world",
      title: row.title ?? row.headline ?? "F1 World update",
      summary: row.summary ?? row.body ?? "",
      importance: row.importance ?? null,
    })),
  };
}