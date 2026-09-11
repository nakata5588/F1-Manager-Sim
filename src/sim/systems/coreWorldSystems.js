import { createContractMilestoneSystem } from "./contractMilestones.js";
import { createEntityAvailabilitySystem } from "./entityAvailability.js";
import { createCareerLifecycleSystem } from "./careerLifecycle.js";
import { createCareerDevelopmentSystem } from "./careerDevelopment.js";
import { createRetirementSystem } from "./retirement.js";
import { createRetirementEmploymentSystem } from "./retirementEmployment.js";
import { createAiEmploymentDecisionSystem, createEmploymentMarketSystem } from "./employmentMarket.js";
import { createPeopleDynamicsSystem } from "./peopleDynamics.js";
import { createScoutingManagementSystem } from "./scoutingManagement.js";
import { createContractNegotiationSystem } from "./contractNegotiation.js";
import { createMarketDynamicsSystem } from "./marketDynamics.js";
import { createManagementInboxSystem } from "./managementInbox.js";
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
    // People state is dynamic Save World state. Historical personality fields are
    // optional inputs; morale, satisfaction, relationships and representatives
    // never become authoritative historical outcomes.
    createPeopleDynamicsSystem(),
    createScoutingManagementSystem(),
    createContractNegotiationSystem(),
    createMarketDynamicsSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      competingOfferBaseChance: options.competingOfferBaseChance,
      poachingBaseChance: options.poachingBaseChance,
    }),
    createManagementInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
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
    createRaceStrategySystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createPerformanceCalibrationSystem(),
    createRaceWeekendSystem(),
    createRaceTimelineSystem(),
    createRaceControlSystem(),
    createChampionshipSystem(),
  ];
}
