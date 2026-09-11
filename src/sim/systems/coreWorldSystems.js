import { createContractMilestoneSystem } from "./contractMilestones.js";
import { createEntityAvailabilitySystem } from "./entityAvailability.js";
import { createCareerLifecycleSystem } from "./careerLifecycle.js";
import { createCareerDevelopmentSystem } from "./careerDevelopment.js";
import { createRetirementSystem } from "./retirement.js";
import { createRetirementEmploymentSystem } from "./retirementEmployment.js";
import { createAiEmploymentDecisionSystem, createEmploymentMarketSystem } from "./employmentMarket.js";
import { createTransferVacancySystem } from "./transferVacancy.js";
import { createPeopleDynamicsSystem } from "./peopleDynamics.js";
import { createScoutingManagementSystem } from "./scoutingManagement.js";
import { createContractNegotiationSystem } from "./contractNegotiation.js";
import { createStaffNegotiationSystem } from "./staffNegotiation.js";
import { createMarketDynamicsSystem } from "./marketDynamics.js";
import { createBoardManagementSystem } from "./boardManagement.js";
import { createManagerCareerSystem } from "./managerCareer.js";
import { createStaffAdviceSystem } from "./staffAdvice.js";
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
    // Transfer vacancy observes the old assignment before employment applies an
    // immediate move. This keeps the origin seat visible to both AI and player.
    createTransferVacancySystem(),
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
    createStaffNegotiationSystem(),
    createMarketDynamicsSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      competingOfferBaseChance: options.competingOfferBaseChance,
      poachingBaseChance: options.poachingBaseChance,
    }),
    createRaceEntrySystem(),
    // Financial and development state must update before the monthly board
    // review so confidence evaluates the current Save World, not stale values.
    createTeamEconomySystem(),
    createTeamDevelopmentSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      minimumCashReserve: options.minimumCashReserve,
      projectDurationMonths: options.projectDurationMonths,
    }),
    createBoardManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createManagerCareerSystem(),
    createStaffAdviceSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createManagementInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createSeasonRolloverSystem(),
    createRaceStrategySystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createPerformanceCalibrationSystem(),
    createRaceWeekendSystem(),
    createRaceTimelineSystem(),
    createRaceControlSystem(),
    createChampionshipSystem(),
  ];
}
