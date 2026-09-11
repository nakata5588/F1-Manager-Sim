import { addManagementInboxItem, ensureManagementInbox } from "../../game/management/inbox.js";
import { COMMERCIAL_EVENT } from "../../game/management/commercial.js";
import { controlledTeamSet } from "./controlState.js";

export function createCommercialInboxSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "management.commercial-inbox",
    eventTypes: [
      COMMERCIAL_EVENT.NEGOTIATION_COUNTERED,
      COMMERCIAL_EVENT.NEGOTIATION_REJECTED,
      COMMERCIAL_EVENT.DEAL_SIGNED,
      COMMERCIAL_EVENT.DEAL_EXPIRED,
      COMMERCIAL_EVENT.RENEWAL_DUE,
      COMMERCIAL_EVENT.ACTIVITY_DUE,
      COMMERCIAL_EVENT.ACTIVITY_RESOLVED,
      COMMERCIAL_EVENT.BONUS_PAID,
    ],
    handle({ saveWorld, event }) {
      ensureManagementInbox(saveWorld);
      const teamId = String(event.payload?.team_id ?? "");
      if (!teamId || !controlledTeamSet(saveWorld, configured).has(teamId)) return null;

      if (event.type === COMMERCIAL_EVENT.NEGOTIATION_COUNTERED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: "high",
          sourceType: "sponsor_counter",
          sourceId: event.payload?.negotiation_id,
          title: `Sponsor counter-offer: ${event.payload?.sponsor_name ?? "Partner"}`,
          body: "The sponsor has returned revised commercial terms. Accept the counter-offer or end negotiations.",
          decision: {
            kind: "sponsor_contract_counter",
            refId: event.payload?.negotiation_id,
            options: [
              { id: "accept_sponsor_counter", label: "Accept counter-offer" },
              { id: "withdraw_sponsor", label: "End negotiations" },
            ],
          },
        });
        return null;
      }

      if (event.type === COMMERCIAL_EVENT.ACTIVITY_DUE) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: "high",
          sourceType: "sponsor_activity",
          sourceId: event.payload?.activity_id,
          title: `Sponsor activity: ${event.payload?.sponsor_name ?? "Partner"}`,
          body: "A commercial commitment is due. Completing it improves sponsor satisfaction and team marketability; skipping it damages the relationship.",
          decision: {
            kind: "sponsor_activity",
            refId: event.payload?.activity_id,
            options: [
              { id: "fulfil_activity", label: "Fulfil activity" },
              { id: "skip_activity", label: "Skip activity" },
            ],
          },
        });
        return null;
      }

      if (event.type === COMMERCIAL_EVENT.RENEWAL_DUE) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: "normal",
          sourceType: "sponsor_renewal",
          sourceId: event.payload?.deal_id,
          title: `Sponsor renewal due: ${event.payload?.sponsor_name ?? "Partner"}`,
          body: `The ${event.payload?.tier ?? "partner"} agreement expires this season. Current sponsor satisfaction is ${Math.round(Number(event.payload?.satisfaction ?? 0))}/100.`,
        });
        return null;
      }

      if (event.type === COMMERCIAL_EVENT.DEAL_SIGNED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: "high",
          sourceType: "sponsor_deal_signed",
          sourceId: event.payload?.deal_id,
          title: `Commercial agreement signed: ${event.payload?.sponsor_name ?? "Partner"}`,
          body: `${String(event.payload?.tier ?? "partner").replaceAll("_", " ")} sponsorship has been agreed. Annual value: ${Math.round(Number(event.payload?.annual_value ?? 0)).toLocaleString("en-GB")}.`,
        });
        return null;
      }

      if (event.type === COMMERCIAL_EVENT.NEGOTIATION_REJECTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: "normal",
          sourceType: "sponsor_negotiation_rejected",
          sourceId: event.payload?.negotiation_id,
          title: `Sponsor negotiation ended: ${event.payload?.sponsor_name ?? "Partner"}`,
          body: event.payload?.reason === "expired" ? "The negotiation window expired without agreement." : "The sponsor rejected the proposed commercial terms.",
        });
        return null;
      }

      if (event.type === COMMERCIAL_EVENT.DEAL_EXPIRED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: "high",
          sourceType: "sponsor_deal_expired",
          sourceId: event.payload?.deal_id,
          title: `Sponsor agreement expired: ${event.payload?.sponsor_name ?? "Partner"}`,
          body: "The commercial agreement has ended and will no longer contribute monthly sponsor income.",
        });
        return null;
      }

      if (event.type === COMMERCIAL_EVENT.ACTIVITY_RESOLVED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: event.payload?.fulfilled ? "normal" : "high",
          sourceType: "sponsor_activity_resolved",
          sourceId: event.payload?.activity_id,
          title: event.payload?.fulfilled ? "Sponsor activity completed" : "Sponsor activity missed",
          body: `${event.payload?.sponsor_name ?? "The sponsor"} relationship is now ${Math.round(Number(event.payload?.satisfaction ?? 0))}/100 satisfaction.`,
        });
        return null;
      }

      if (event.type === COMMERCIAL_EVENT.BONUS_PAID) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "commercial",
          priority: "normal",
          sourceType: "sponsor_bonus",
          sourceId: `${event.payload?.deal_id}:${event.date}`,
          title: "Sponsor performance bonus earned",
          body: `A race objective was achieved and ${Math.round(Number(event.payload?.amount ?? 0)).toLocaleString("en-GB")} was added to team cash.`,
        });
      }
      return null;
    },
  };
}
