import { createContractMilestoneSystem } from "./contractMilestones.js";
import { createEntityAvailabilitySystem } from "./entityAvailability.js";
import { createCareerLifecycleSystem } from "./careerLifecycle.js";
import { createAiEmploymentDecisionSystem, createEmploymentMarketSystem } from "./employmentMarket.js";

export function createCoreWorldSystems(options = {}) {
  return [
    createEntityAvailabilitySystem(),
    createCareerLifecycleSystem(),
    createContractMilestoneSystem(),
    createEmploymentMarketSystem(),
    createAiEmploymentDecisionSystem({
      controlledTeamIds: options.controlledTeamIds ?? [],
      defaultContractYears: options.defaultContractYears ?? 2,
    }),
  ];
}
