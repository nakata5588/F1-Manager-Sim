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
import { createCommercialManagementSystem } from "./commercialManagement.js";
import { createCommercialInboxSystem } from "./commercialInbox.js";
import { createTechnicalInboxSystem } from "./technicalInbox.js";
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
    createTransferVacancySystem(),
    createEmploymentMarketSystem(),
    createRetirementEmploymentSystem(),
    createAiEmploymentDecisionSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      defaultContractYears: options.defaultContractYears ?? 2,
    }),
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
    createTeamEconomySystem(),
    createTeamDevelopmentSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      minimumCashReserve: options.minimumCashReserve,
      projectDurationMonths: options.projectDurationMonths,
    }),
    createTechnicalInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createCommercialManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createCommercialInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
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
