export const RACE_WEEKEND_STEPS = Object.freeze([
  { id: "practice", label: "Practice" },
  { id: "practice_results", label: "Setup" },
  { id: "qualifying_results", label: "Qualifying" },
  { id: "pre_race", label: "Grid & Strategy" },
  { id: "race", label: "Race" },
  { id: "race_results", label: "Results" },
]);

function clean(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function weekendStepRows(active) {
  const activeIndex = RACE_WEEKEND_STEPS.findIndex((row) => row.id === active);
  return RACE_WEEKEND_STEPS.map((row, index) => ({
    ...row,
    state: index === activeIndex ? "active" : activeIndex >= 0 && index < activeIndex ? "complete" : "upcoming",
  }));
}

export function raceControlPresentation(activeControl) {
  const value = clean(activeControl);
  if (!value) return {
    tone: "green",
    label: "Green Flag",
    detail: "Race running under normal conditions.",
  };
  if (value.includes("red")) return {
    tone: "red",
    label: "Red Flag",
    detail: "Race Control has suspended normal racing conditions.",
  };
  if (value.includes("virtual") || value === "vsc") return {
    tone: "yellow",
    label: "Virtual Safety Car",
    detail: "Race Control restrictions are active.",
  };
  if (value.includes("safety")) return {
    tone: "yellow",
    label: "Safety Car",
    detail: "The field is under Safety Car conditions.",
  };
  if (value.includes("yellow")) return {
    tone: "yellow",
    label: "Yellow Flag",
    detail: "Race Control restrictions are active.",
  };
  return {
    tone: "neutral",
    label: String(activeControl).replaceAll("_", " "),
    detail: "Race Control state is active.",
  };
}

export function strategyTimeline(plan = {}, currentLap = 0) {
  let cursor = 1;
  return (plan.stints ?? []).map((stint, index) => {
    const targetLaps = Math.max(0, Number(stint.targetLaps ?? 0));
    const startLap = cursor;
    const endLap = Math.max(startLap, startLap + targetLaps - 1);
    cursor = endLap + 1;
    const lap = Number(currentLap ?? 0);
    const state = lap > endLap ? "complete" : lap >= startLap ? "current" : "upcoming";
    return {
      index,
      stint: stint.stint ?? index + 1,
      compoundId: stint.compoundId ?? null,
      condition: stint.condition ?? null,
      targetLaps,
      startLap,
      endLap,
      state,
    };
  });
}

export function raceDeskSummary(race = {}) {
  const rows = race.order ?? [];
  const running = rows.filter((row) => ["RUNNING", "READY", "FINISHED"].includes(String(row.status ?? "").toUpperCase()));
  const retired = rows.length - running.length;
  const controlled = rows.filter((row) => row.controlled);
  return {
    fieldSize: rows.length,
    running: running.length,
    retired,
    controlled,
    leader: rows[0] ?? null,
    progressPercent: Math.round(Math.max(0, Math.min(1, Number(race.progress ?? 0))) * 100),
    weather: race.weather ?? null,
    control: raceControlPresentation(race.activeControl),
    mapPrecision: race.trackPositions?.telemetryMode ?? "unavailable",
  };
}

export function eventTone(type) {
  const value = clean(type);
  if (value === "race_control") return "control";
  if (value === "retirement") return "retirement";
  if (value === "incident" || value === "damage") return "incident";
  if (value === "weather_change") return "weather";
  if (value === "strategy_revision") return "strategy";
  return "neutral";
}
