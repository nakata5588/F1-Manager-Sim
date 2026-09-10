import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld, loadSeasonPackPayload } from "../src/index.js";

function matrix(headers, ...rows) {
  return [headers, ...rows];
}

function payload() {
  return {
    version: "0.7",
    type: "season_pack",
    season: 1980,
    created: "2026-09-10T12:45:09Z",
    sheets: {
      "1980_Teams": matrix(
        ["team_id", "team_name", "starting_budget", "engine_id", "engine_name", "power_unit"],
        ["TEAM1", "Williams", 15000000, "eg_0001", "Ford Cosworth DFV V8", "Ford"],
        ["TEAM2", "Renault", 12000000, "eg_0004", "Renault EF1 V6 t", "Renault"],
      ),
      "1980_Team_Brands": matrix(["team_id", "year", "team_name"], ["TEAM1", "1980", "Williams"], ["TEAM2", "1980", "Renault"]),
      "1980_Drivers": matrix(
        ["driver_id", "driver_name", "team_id", "role", "number", "dob"],
        ["D1", "Alan Jones", "TEAM1", "main_driver", 27, "1946-11-02"],
        ["D2", "David Kennedy", "TEAM2", "test_driver", 18, "1953-01-15"],
      ),
      "1980_Driver_Ratings": matrix(["year", "driver_id", "pace", "qualifying"], ["1980", "D1", "84", "83"], ["1980", "D2", "65", "64"]),
      "1980_Driver_Contracts": matrix(["year", "team_id", "driver_id", "role", "driver_number", "salary"], ["1980", "TEAM1", "D1", "main_driver", 27, 800000], ["1980", "TEAM2", "D2", "test_driver", 39, 100000]),
      "1980_Staff": matrix(["staff_id", "staff_name", "team_id", "role"], ["S1", "Patrick Head", "TEAM1", "technical_director"], ["S2", "Context Person", "TEAM1", "former_staff"]),
      "1980_Staff_Ratings": matrix(["year", "staff_id", "technical"], ["1980", "S1", 96], ["1980", "S2", 80]),
      "1980_Staff_Contracts": matrix(["year", "team_id", "staff_id", "role"], ["1980", "TEAM1", "S1", "technical_director"], ["1980", "TEAM1", "S2", "former_staff"]),
      "1980_Staff_Loadout": matrix(["team_id", "staff_id", "import_on_new_1980_save"], ["TEAM1", "S1", true], ["TEAM1", "S2", false]),
      "1980_Team_Facilities": matrix(["team_id", "year", "_chassis_shop_level", "manufacturing_leve", "maintenance_cost"], ["TEAM1", "1980", "7", "7", "2000000"], ["TEAM2", "1980", "7", "7", "2000000"]),
      "1980_Calendar": matrix(
        ["round", "race_id", "gp_name", "race_date", "circuit_id", "circuit_name", "lap_length_km", "default_laps", "overtaking_difficulty", "pit_lane_loss"],
        [2, "RACE2", "Brazilian Grand Prix", "1980-01-27", "CIR18", "Autódromo José Carlos Pace", 4.309, 71, 65, 24],
      ),
      "1980_Circuit_Layouts": matrix(
        ["round", "race_id", "circuit_id", "circuit_name", "historical_layout_name", "lap_length_km", "scheduled_laps", "scheduled_distance_km", "layout_status"],
        [2, "RACE2", "CIR18", "Autódromo de Interlagos", "Original Interlagos layout", 7.873, 40, 314.92, "corrected_from_modern_layout"],
      ),
      "1980_Circuit_Gameplay_Traits": matrix(
        ["round", "circuit_name", "power_sensitivity", "aero_sensitivity", "tyre_wear", "overtaking_difficulty", "incident_risk", "rain_likelihood"],
        [2, "Autódromo de Interlagos", 82, 85, 84, 72, 76, "medium"],
      ),
      "1980_Rules": matrix(["year", "points_system", "refueling_allowed", "safety_car_rules"], ["1980", "9,6,4,3,2,1", null, null]),
      "1980_Qualifying_Rules": matrix(["Year", "Sessions", "Length", "format_code"], ["1980", "2", "1h", "best lap"]),
      "1980_Race_Model_Params": matrix(
        ["parameter_id", "category", "parameter_name", "value", "unit", "load_into_save", "source_confidence", "notes"],
        ["R1", "sporting", "points_system", "9-6-4-3-2-1", "points", "true", "source_supported", "Top six score"],
        ["R2", "operations", "modern_safety_car", "disabled", "bool", "true", "gameplay_default", "No modern SC"],
        ["R3", "reliability", "mechanical_dnf_multiplier", "1.35", "multiplier", "true", "gameplay_estimate", "High attrition"],
      ),
      "1980_Tyre_Packages": matrix(["tyre_id", "tyre_name", "dry_grip", "wet_grip", "durability"], ["goodyear", "Goodyear", 82, 81, 78], ["michelin", "Michelin", 84, 78, 82]),
      "1980_Full_Entrants": matrix(
        ["entrant_id", "team_id", "team_name", "driver_id", "driver_name", "car_number", "tyre_manufacturer", "engine_source_id", "load_into_save_default", "season_start_role"],
        ["williams", "TEAM1", "Williams", "D1", "Alan Jones", 27, "goodyear", "ford-dfv", "true", "round_1_starter"],
        ["renault", "TEAM2", "Renault", "D2", "David Kennedy", 18, "michelin", "renault-ef1", "true", "round_1_starter"],
      ),
      "1980_Engine_Catalog": matrix(
        ["engine_source_id", "engine_name", "manufacturer", "power_rating", "reliability_rating", "fuel_efficiency", "mechanical_reliability_multiplier"],
        ["ford-dfv", "Ford Cosworth DFV 3.0 V8", "Ford", 80, 80, 80, 0.88],
        ["renault-ef1", "Renault-Gordini EF1 1.5 V6 turbo", "Renault", 93, 62, 64, 0.62],
      ),
      "Reference_Engines": matrix(["engine_id", "engine_name", "power", "reliability"], ["eg_0001", "Ford Cosworth DFV V8", "80", "80"], ["eg_0004", "Renault EF1 V6 t", "93", "75"]),
      "1980_Team_Engines": matrix(["year", "team_id", "team name", "engine_id"], ["1980", "TEAM1", "Williams", "eg_0001"], ["1980", "TEAM2", "Renault", "eg_0004"]),
      "1980_Car_Performance": matrix(["team_id", "year", "chassis_spec", "aero_spec"], ["TEAM1", "1980", "88", "85"], ["TEAM2", "1980", "80", "88"]),
      "1980_Sponsor_Contracts": matrix(["year", "team_id", "sponsor_id"], [1980, "TEAM1", "sp1"]),
      "1980_Finance_Ledger": matrix(["year", "team_id", "amount"], [1980, "TEAM1", 1000]),
      "1980_Entrant_Organizations": matrix(["entrant_id", "linked_team_id", "load_into_save_default"], ["williams", "TEAM1", "true"]),
      "1980_Availability_Pool": matrix(["driver_id", "driver_name", "suggested_status_1980_start"], ["F1", "Ayrton Senna", "active_non_f1_pool"]),
      "Future_Entity_Queue_1980": matrix(
        ["event_year", "entity_type", "entity_id", "name", "world_or_talent_activation_year", "eligible_when_reached"],
        [1980, "driver", "F1", "Ayrton Senna", 1980, true],
        [1980, "driver", "D1", "Alan Jones", 1980, true],
      ),
    },
  };
}

test("season-pack loader materializes corrected period layout over legacy calendar values", () => {
  const world = loadSeasonPackPayload(payload());
  assert.equal(world.calendar[0].track_id, "CIR18");
  assert.equal(world.calendar[0].lap_length_km, 7.873);
  assert.equal(world.calendar[0].laps, 40);
  assert.equal(world.calendar[0].overtaking_difficulty, 72);
  assert.equal(world.tracks[0].historical_layout_name, "Original Interlagos layout");
});

test("season-pack loader obeys explicit staff loadout and normalizes legacy column aliases", () => {
  const world = loadSeasonPackPayload(payload());
  assert.deepEqual(world.staff.map((row) => row.staff_id), ["S1"]);
  assert.deepEqual(world.staffContracts.map((row) => row.staff_id), ["S1"]);
  assert.equal(world.facilities[0].chassis_shop_level, 7);
  assert.equal(world.facilities[0].manufacturing_level, 7);
});

test("race-model parameters become canonical era rules without inventing modern safety car", () => {
  const world = loadSeasonPackPayload(payload());
  assert.equal(world.rules.points_system, "9-6-4-3-2-1");
  assert.equal(world.qualifyingRules.session_count, 2);
  assert.equal(world.raceModelParams.modern_safety_car, false);
  assert.equal(world.eraSafety.modern_safety_car, false);
  assert.equal(world.accidentModel.mechanical_dnf_multiplier, 1.35);
});

test("season-pack materializes tyre suppliers, starting entries and calibrated engine package", () => {
  const world = loadSeasonPackPayload(payload());
  assert.equal(world.tyres.length, 2);
  assert.equal(world.teamTyreSuppliers.TEAM1, "goodyear");
  assert.equal(world.teamTyreSuppliers.TEAM2, "michelin");
  assert.equal(world.startingRaceEntries.length, 2);
  assert.equal(world.startingRaceEntries.find((row) => row.driver_id === "D2").car_number, 18);
  assert.equal(world.engines.find((row) => row.engine_id === "eg_0004").reliability, 62);
});

test("future queue excludes already-active entities and Save World preserves Season Pack provenance", () => {
  const world = loadSeasonPackPayload(payload());
  assert.deepEqual(world.futureEntities.map((row) => row.entity_id), ["F1"]);
  const save = createSaveWorld(world, { seed: "v07" });
  assert.equal(save.meta.historicalDatabase.databaseVersion, "season-pack-0.7");
  assert.equal(save.world.sourcePackage.version, "0.7");
  assert.equal(save.world.calendar[0].laps, 40);
});