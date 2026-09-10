import { createContractMilestoneSystem } from "./contractMilestones.js";
import { createEntityAvailabilitySystem } from "./entityAvailability.js";
import { createCareerLifecycleSystem } from "./careerLifecycle.js";
import { createCareerDevelopmentSystem } from "./careerDevelopment.js";
import { createRetirementSystem } from "./retirement.js";
import { createRetirementEmploymentSystem } from "./retirementEmployment.js";
import { createAiEmploymentDecisionSystem, createEmploymentMarketSystem } from "./employmentMarket.js";
import { createRaceEntrySystem } from "./raceEntry.js";
import { createTeamEconomySystem } from "./teamEconomy.js";
import { createTeamDevelopmentSystem } from "./teamDevelopment.js";
import { createSeasonRolloverSystem } from "./seasonRollover.js";
import { createRaceStrategySystem } from "./raceStrategy.js";
import { createPerformanceCalibrationSystem } from "./performanceCalibration.js";
import { createRaceWeekendSystem } from "./raceWeekend.js";
import { createRaceTimelineSystem } from "./raceTimeline.js";
import { createRaceControlSystem } from "./raceControl.js";
import { createChampionshipSystem } from "./championship.js";

export function createCoreWorldSystems(options = {}) {
  return [
    createEntityAvailabilitySystem(),
    createCareerLifecycleSystem(),
    createCareerDevelopmentSystem(),
    createRetirementSystem(),
    createContractMilestoneSystem(),
    createEmploymentMarketSystem(),
    createRetirementEmploymentSystem(),
    createAiEmploymentDecisionSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      defaultContractYears: options.defaultContractYears ?? 2,
    }),
    // Race participation is a separate concept from employment. The entry
    // system is initialized after employment so Season Pack race entries can
    // override a contractual role without changing the contract itself.
    createRaceEntrySystem(),
    createTeamEconomySystem(),
    createTeamDevelopmentSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      minimumCashReserve: options.minimumCashReserve,
      projectDurationMonths: options.projectDurationMonths,
    }),
    createSeasonRolloverSystem(),
    // Strategy locks before calibration so supplier/track tyre traits can refine
    // the generated stints before raceWeekend archives the GRID_SET event.
    createRaceStrategySystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    // v0.8 calibration reshapes only the active session baseline. Dynamic R&D
    // deltas are preserved and the mutable development car is restored after the race.
    createPerformanceCalibrationSystem(),
    createRaceWeekendSystem(),
    // The temporal layer replaces the aggregate race classification before the
    // championship system consumes RACE_COMPLETED.
    createRaceTimelineSystem(),
    // Race Control reviews only mechanisms made available by the era rules.
    // It deliberately does not rewrite an already-resolved timeline; live
    // neutralisation/restarts belong to the resumable race engine.
    createRaceControlSystem(),
    createChampionshipSystem(),
  ];
}
