import { SIM_EVENT } from "../timeEngine.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import {
  evolveDriverMarketSeason,
  initializeDriverMarket,
  markDriverF1Employed,
  markDriverF1FreeAgent,
  markDriverRetired,
} from "../../game/management/driverMarket.js";

export const DRIVER_MARKET_EVENT = Object.freeze({
  INITIALIZED: "driver.market_initialized",
  LEFT_F1_MARKET: "driver.left_f1_market",
  RETURNED_TO_F1_MARKET: "driver.returned_to_f1_market",
});

export function createDriverMarketLifecycleSystem() {
  return {
    id: "career.driver-market",
    eventTypes: [
      EMPLOYMENT_EVENT.INITIALIZED,
      EMPLOYMENT_EVENT.FREE_AGENT,
      EMPLOYMENT_EVENT.CONTRACT_SIGNED,
      EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED,
      SIM_EVENT.SEASON_STARTED,
      CAREER_EVENT.RETIRED,
    ],
    handle({ saveWorld, event }) {
      if (event.type === EMPLOYMENT_EVENT.INITIALIZED) {
        const summary = initializeDriverMarket(saveWorld, event.date);
        return { type: DRIVER_MARKET_EVENT.INITIALIZED, payload: summary };
      }

      if (event.type === EMPLOYMENT_EVENT.FREE_AGENT && event.payload?.worker_type === "driver") {
        markDriverF1FreeAgent(saveWorld, event.payload?.worker_id, event.payload?.reason ?? "free_agent", event.date);
        return null;
      }

      if ([EMPLOYMENT_EVENT.CONTRACT_SIGNED, EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED].includes(event.type)
        && String(event.payload?.worker_type ?? "driver").toLowerCase() === "driver") {
        markDriverF1Employed(saveWorld, event.payload?.worker_id, "contract", event.date);
        return null;
      }

      if (event.type === CAREER_EVENT.RETIRED && event.payload?.worker_type === "driver") {
        markDriverRetired(saveWorld, event.payload?.worker_id, event.date);
        return null;
      }

      const result = evolveDriverMarketSeason(saveWorld, event.payload?.season ?? saveWorld.clock?.season, event.date);
      return [
        ...result.movedOut.map((driverId) => ({
          type: DRIVER_MARKET_EVENT.LEFT_F1_MARKET,
          payload: { driver_id: driverId, path: "other_motorsport", reason: "prolonged_without_f1_seat" },
        })),
        ...result.returned.map((driverId) => ({
          type: DRIVER_MARKET_EVENT.RETURNED_TO_F1_MARKET,
          payload: { driver_id: driverId, path: "f1_free_agent", reason: "f1_market_return" },
        })),
      ];
    },
  };
}
