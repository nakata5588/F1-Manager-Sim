import { SIM_EVENT } from "../timeEngine.js";

export const CONTRACT_EVENT = Object.freeze({
  EXPIRED: "contract.expired",
});

function contractKey(contract) {
  return [
    contract.team_id ?? "",
    contract.driver_id ?? contract.staff_id ?? "",
    contract.role ?? "",
    contract.contract_start ?? contract.year ?? "",
    contract.contract_until ?? "",
  ].join(":");
}

function endYear(contract) {
  const raw = contract.contract_until ?? contract.contract_until_year ?? contract.end_year;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

export function createContractMilestoneSystem() {
  return {
    id: "contracts.milestones",
    eventTypes: [SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const currentSeason = Number(event.payload?.season ?? saveWorld.clock.season);
      const stateRoot = saveWorld.simulation.systemState;
      const state = stateRoot[this.id] ??= { emittedExpiries: [] };
      const emitted = new Set(state.emittedExpiries);
      const output = [];

      for (const collectionName of ["contracts", "staffContracts"]) {
        for (const contract of saveWorld.world?.[collectionName] ?? []) {
          const until = endYear(contract);
          if (until === null || until >= currentSeason) continue;
          const key = `${collectionName}:${contractKey(contract)}`;
          if (emitted.has(key)) continue;
          emitted.add(key);
          output.push({
            type: CONTRACT_EVENT.EXPIRED,
            payload: {
              contractType: collectionName === "contracts" ? "driver" : "staff",
              team_id: contract.team_id ?? null,
              driver_id: contract.driver_id ?? null,
              staff_id: contract.staff_id ?? null,
              role: contract.role ?? null,
              contract_until: until,
            },
          });
        }
      }

      state.emittedExpiries = [...emitted].sort();
      return output;
    },
  };
}
