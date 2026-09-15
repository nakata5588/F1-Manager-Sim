import { createContractMilestoneSystem } from "./contractMilestones.js";
import { createTalentPipelineSystem } from "./talentPipeline.js";
import { createTalentRecruitmentSystem } from "./talentRecruitment.js";
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
import { createTeamDevelopmentSystem } from "./teamDevelopment.js";
import { createSeasonRolloverSystem } from "./seasonRollover.js";
import { createOffseasonManagementSystem } from "./offseasonManagement.js";
import { createOffseasonInboxSystem } from "./offseasonInbox.js";
import { createRaceStrategySystem } from "./raceStrategy.js";
import { createPerformanceCalibrationSystem } from "./performanceCalibration.js";
import { createRaceWeekendSystem } from "./raceWeekend.js";
import { createRaceTimelineSystem } from "./raceTimeline.js";
import { createRaceControlSystem } from "./raceControl.js";
import { createChampionshipSystem } from "./championship.js";
import { createWorldNarrativeSystem } from "./worldNarrative.js";

export function createCoreWorldSystems(options = {}) {
  return [
    // Generated talent is Save World state and must exist before the visibility
    // boundary checks whether a junior has reached F1 eligibility this season.
    createTalentPipelineSystem({
      cohortSize: options.generatedTalentCohortSize,
    }),
    createEntityAvailabilitySystem(),
    // Governance deliberately runs immediately after visibility/eligibility.
    // Future teams and historical future rules may therefore become candidates
    // without becoming mandatory outcomes.
    createGovernanceManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createTeamExitCleanupSystem(),
    createGovernanceInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createCareerLifecycleSystem(),
    // Era-aware talent programmes sit between lifecycle/visibility and annual
    // development. They can support juniors and AI recruitment without creating
    // a second employment or development authority.
    createTalentRecruitmentSystem({
      minimumScore: options.talentRecruitmentMinimumScore,
      durationSeasons: options.talentProgrammeDurationSeasons,
    }),
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
    createCommercialManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createCommercialInboxSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    createBoardManagementSystem({ controlledTeamIds: options.controlledTeamIds ?? [] }),
    // Organisation is derived from the authoritative employment/board/team state.
    // It therefore runs after those authorities and before staff advice consumes
    // department workload and quality pressure.
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
    createRaceWeekendSystem(),
    createRaceTimelineSystem(),
    createRaceControlSystem(),
    createChampionshipSystem(),
    // Narrative is a pure projection layer over already-resolved simulation
    // events. It deliberately runs last so news/history can read the updated
    // Save World without becoming an authority over gameplay outcomes.
    createWorldNarrativeSystem(),
  ];
}
