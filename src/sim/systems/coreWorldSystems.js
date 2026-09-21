import { createContractMilestoneSystem } from "./contractMilestones.js";
import { createTalentPipelineSystem } from "./talentPipeline.js";
import { createTalentRecruitmentSystem } from "./talentRecruitment.js";
import { createEntityAvailabilitySystem } from "./entityAvailability.js";
import { createCareerLifecycleSystem } from "./careerLifecycle.js";
import { createCareerDevelopmentSystem } from "./careerDevelopment.js";
import { createDevelopmentSignalsSystem } from "./developmentSignals.js";
import { createRetirementSystem } from "./retirement.js";
import { createRetirementEmploymentSystem } from "./retirementEmployment.js";
import { createAiEmploymentDecisionSystem, createEmploymentMarketSystem } from "./employmentMarket.js";
import { createOpeningAvailabilityGuardSystem } from "./openingAvailabilityGuard.js";
import { createDriverMarketLifecycleSystem } from "./driverMarketLifecycle.js";
import { createDriverAvailabilitySystem } from "./driverAvailability.js";
import { createReplacementDriverSystem } from "./replacementDrivers.js";
import { createTransferVacancySystem } from "./transferVacancy.js";
import { createPeopleDynamicsSystem } from "./peopleDynamics.js";
import { createScoutingManagementSystem } from "./scoutingManagement.js";
import { createContractNegotiationSystem } from "./contractNegotiation.js";
import { createStaffNegotiationSystem } from "./staffNegotiation.js";
import { createMarketDynamicsSystem } from "./marketDynamics.js";
import { createBoardManagementSystem } from "./boardManagement.js";
import { createOrganizationManagementSystem } from "./organizationManagement.js";
import { createManagerCareerSystem } from "./managerCareer.js";
import { createStaffAdviceSystem } from "./staffAdvice.js";
import { createCommercialManagementSystem } from "./commercialManagement.js";
import { createCommercialInboxSystem } from "./commercialInbox.js";
import { createTechnicalInboxSystem } from "./technicalInbox.js";
import { createTechnicalReliabilitySystem } from "./technicalReliability.js";
import { createGovernanceManagementSystem } from "./governanceManagement.js";
import { createGovernanceInboxSystem } from "./governanceInbox.js";
import { createTeamExitCleanupSystem } from "./teamExitCleanup.js";
import { createManagementInboxSystem } from "./managementInbox.js";
import { createRaceEntrySystem } from "./raceEntry.js";
import { createTeamEconomySystem } from "./teamEconomy.js";
import { createFinancialCrisisSystem } from "./financialCrisis.js";
import { createTeamDevelopmentSystem } from "./teamDevelopment.js";
import { createSeasonRolloverSystem } from "./seasonRollover.js";
import { createOffseasonManagementSystem } from "./offseasonManagement.js";
import { createOffseasonInboxSystem } from "./offseasonInbox.js";
import { createRaceStrategySystem } from "./raceStrategy.js";
import { createPerformanceCalibrationSystem } from "./performanceCalibration.js";
import { createDatabaseWeatherSystem } from "./databaseWeather.js";
import { createRaceWeekendSystem } from "./raceWeekend.js";
import { createRaceTimelineSystem } from "./raceTimeline.js";
import { createRaceControlSystem } from "./raceControl.js";
import { createChampionshipSystem } from "./championship.js";
import { createWorldNarrativeSystem } from "./worldNarrative.js";

export function createCoreWorldSystems(options = {}) {
  return [
    createTalentPipelineSystem({ cohortSize: options.generatedTalentCohortSize }),
    createEntityAvailabilitySystem(),
    createGovernanceManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createTeamExitCleanupSystem(),
    createGovernanceInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createCareerLifecycleSystem(),
    createTalentRecruitmentSystem({
      minimumScore: options.talentRecruitmentMinimumScore,
      durationSeasons: options.talentProgrammeDurationSeasons,
    }),
    createCareerDevelopmentSystem(),
    createDevelopmentSignalsSystem(),
    createRetirementSystem(),
    createContractMilestoneSystem(),
    createTransferVacancySystem(),
    createEmploymentMarketSystem(),
    createOpeningAvailabilityGuardSystem(),
    createDriverMarketLifecycleSystem(),
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
    createFinancialCrisisSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createTeamDevelopmentSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      minimumCashReserve: options.minimumCashReserve,
      projectDurationMonths: options.projectDurationMonths,
    }),
    createCommercialManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createCommercialInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createBoardManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createOrganizationManagementSystem(),
    createManagerCareerSystem(),
    createStaffAdviceSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createManagementInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createSeasonRolloverSystem(),
    createOffseasonManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createOffseasonInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createTechnicalReliabilitySystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createTechnicalInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createRaceStrategySystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createPerformanceCalibrationSystem(),
    // The Season DB provides weather probabilities, not historical outcomes.
    // Generate the actual weekend weather into Save World before session logic.
    createDatabaseWeatherSystem(),
    createRaceWeekendSystem(),
    createRaceTimelineSystem(),
    createDriverAvailabilitySystem(),
    createReplacementDriverSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createRaceControlSystem(),
    createChampionshipSystem(),
    createWorldNarrativeSystem(),
  ];
}
