from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace(path, before, after):
    source = read(path)
    if before not in source:
        raise RuntimeError(f"Expected patch anchor not found in {path}: {before[:120]!r}")
    write(path, source.replace(before, after, 1))


path = "src/game/management/technical.js"
replace(path, '''    if (!availability.available) {
      if (!current) {
        team.facilities[id] = {
          id,
          label: definition.label,
          level: null,
          availabilityStatus: "unavailable_future_technology",
          unlockSeason: availability.unlockSeason,
          availabilitySource: availability.source,
          source: "era_locked",
          sourceField: null,
          ignoredOpeningLevel: null,
          maintenanceDeltaAnnual: 0,
        };
      }
      continue;
    }''', '''    if (!availability.available) {
      if (!current || current.availabilityStatus !== "unavailable_future_technology") {
        team.facilities[id] = {
          id,
          label: definition.label,
          level: null,
          availabilityStatus: "unavailable_future_technology",
          unlockSeason: availability.unlockSeason,
          availabilitySource: availability.source,
          source: "era_locked",
          sourceField: current?.sourceField ?? null,
          ignoredOpeningLevel: current?.ignoredOpeningLevel ?? numeric(current?.level),
          maintenanceDeltaAnnual: 0,
        };
      } else {
        current.unlockSeason = availability.unlockSeason;
        current.availabilitySource = availability.source;
      }
      for (const upgrade of team.facilityUpgrades ?? []) {
        if (upgrade.facilityId !== id || upgrade.status !== "active") continue;
        upgrade.status = "cancelled_era_unavailable";
        upgrade.cancelledAt = saveWorld.clock?.date ?? null;
        upgrade.cancellationReason = "unavailable_future_technology";
      }
      continue;
    }''')

replace(path, '''export function advanceTechnicalMonth(saveWorld, date = saveWorld.clock.date) {
  const events = [];
  for (const team of Object.values(ensureTechnicalWorld(saveWorld).teams)) {
    for (const project of team.designProjects) {''', '''export function advanceTechnicalMonth(saveWorld, date = saveWorld.clock.date) {
  const events = [];
  for (const team of Object.values(ensureTechnicalWorld(saveWorld).teams)) {
    refreshFacilityAvailability(saveWorld, team);
    for (const project of team.designProjects) {''')

path = "tests/playtestCorrectionsPass02.test.js"
source = read(path)
source = source.replace('''  ensureTechnicalTeam,
  facilityEraAvailability,
  startFacilityUpgrade,''', '''  advanceTechnicalMonth,
  ensureTechnicalTeam,
  facilityEraAvailability,
  startFacilityUpgrade,''')
anchor = '''test("future-era facility metadata can explicitly unlock a previously unavailable simulator", () => {'''
insert = '''test("existing saves quarantine legacy simulator state and cancel stale upgrades before monthly processing", () => {
  const save = baseSave();
  const team = ensureTechnicalTeam(save, "T1");
  team.facilities.simulator = {
    id: "simulator",
    label: "Simulator",
    level: 4,
    availabilityStatus: "operational",
    source: "save_world_upgraded",
    sourceField: "simulator_level",
    maintenanceDeltaAnnual: 42000,
  };
  team.facilityUpgrades.push({
    upgradeId: "legacy-simulator-upgrade",
    teamId: "T1",
    facilityId: "simulator",
    fromLevel: 4,
    toLevel: 5,
    cost: 250000,
    status: "active",
    startedAt: "1980-01-01",
    durationMonths: 1,
    monthsRemaining: 1,
  });

  const events = advanceTechnicalMonth(save, "1980-02-01");
  assert.equal(team.facilities.simulator.availabilityStatus, "unavailable_future_technology");
  assert.equal(team.facilities.simulator.level, null);
  assert.equal(team.facilities.simulator.ignoredOpeningLevel, 4);
  assert.equal(team.facilities.simulator.maintenanceDeltaAnnual, 0);
  assert.equal(team.facilityUpgrades[0].status, "cancelled_era_unavailable");
  assert.equal(team.facilityUpgrades[0].cancellationReason, "unavailable_future_technology");
  assert.equal(events.some((event) => event.payload?.facility_id === "simulator"), false);
});

'''
if anchor not in source:
    raise RuntimeError("Could not find test insertion anchor")
source = source.replace(anchor, insert + anchor, 1)
write(path, source)

print("Existing-save era facility migration hardened.")
