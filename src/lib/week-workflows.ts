/**
 * Public-safe weekday fixtures for Reef Command's compressed demo week.
 *
 * Every identity, order, tracking number, amount, folder, timestamp, and
 * decision rule here is synthetic. These fixtures prove the component and
 * orchestration contract; they are not TIA Coral operating data or policy.
 */
import type { ComponentSpec } from "./protocol";

const tuesdayShipments = [
  {
    shipmentId: "SHP-TUE-104",
    orderId: "RNB-2841",
    customer: "lagoon_riley",
    tracking: "7814 0936 2251",
    destination: "Norfolk, VA",
    coralUnits: 4,
    pack: "none" as const,
    handoffAt: "TUE · 17:00 ET",
    status: "blocked" as const,
    blockerIds: ["ADDR-TUE-01"],
  },
  {
    shipmentId: "SHP-TUE-109",
    orderId: "WEB-7318",
    customer: "mominito",
    tracking: "7814 0936 2384",
    destination: "Chicago, IL",
    coralUnits: 3,
    pack: "ice" as const,
    handoffAt: "TUE · 17:00 ET",
    status: "ready" as const,
    blockerIds: ["WEATHER-TUE-04"],
  },
  {
    shipmentId: "SHP-TUE-112",
    orderId: "RNB-2857",
    customer: "reef_roamer",
    tracking: "7814 0936 2417",
    destination: "Austin, TX",
    coralUnits: 5,
    pack: "ice" as const,
    handoffAt: "TUE · 17:00 ET",
    status: "blocked" as const,
    blockerIds: ["QUESTION-TUE-03"],
  },
  {
    shipmentId: "SHP-TUE-118",
    orderId: "EBY-4412",
    customer: "bluepolyp",
    tracking: "7814 0936 2599",
    destination: "Newark, NJ",
    coralUnits: 2,
    pack: "none" as const,
    handoffAt: "TUE · 17:00 ET",
    status: "ready" as const,
    blockerIds: [],
  },
  {
    shipmentId: "SHP-TUE-121",
    orderId: "WEB-7340",
    customer: "tideglass",
    tracking: "7814 0936 2632",
    destination: "Columbus, OH",
    coralUnits: 3,
    pack: "none" as const,
    handoffAt: "TUE · 17:00 ET",
    status: "held" as const,
    blockerIds: ["DOA-TUE-02"],
  },
] satisfies Extract<ComponentSpec, { kind: "shipment_command_board" }>["shipments"];

/** Tuesday's first routine: one board owns blockers and the full ship-today list. */
export function tuesdayShippingCommand(): ComponentSpec[] {
  return [{
    kind: "shipment_command_board",
    day: "tuesday",
    title: "Clear blockers + check today's shipments",
    asOf: "TUE · 08:10 ET",
    mode: "ship",
    shipDate: "Tuesday · Jul 28, 2026",
    carrierCutoff: "FedEx handoff · 17:00 ET",
    shipments: tuesdayShipments,
    issues: [
      {
        id: "ADDR-TUE-01",
        kind: "address_change",
        severity: "urgent",
        customer: "lagoon_riley",
        orderId: "RNB-2841",
        shipmentId: "SHP-TUE-104",
        tracking: "7814 0936 2251",
        detectedAt: "TUE · 07:46 ET",
        headline: "Address update arrived after label preparation",
        whyBlocked: "The prepared label still points to an outdated street address, so the box cannot enter the carrier queue.",
        currentValue: "88 Harbor Ave, Norfolk, VA 23503",
        recommendation: "Verify and replace it with 88 Harbor View Dr, Apt 4B, Norfolk, VA 23503, then regenerate the label preview.",
        actions: [{
          taskId: "update-demo-address",
          label: "Update address + clear",
          payload: { caseId: "ADDR-TUE-01" },
          risk: "gated",
        }],
      },
      {
        id: "DOA-TUE-02",
        kind: "doa",
        severity: "urgent",
        customer: "tideglass",
        orderId: "WEB-7340",
        shipmentId: "SHP-TUE-121",
        tracking: "7814 0936 2632",
        detectedAt: "TUE · 07:58 ET",
        headline: "Approved DOA replacement needs a packing decision",
        whyBlocked: "One replacement coral is approved but has not been confirmed on today's packing slip and bag-label count.",
        recommendation: "Confirm the replacement SKU and refreshed packing slip before releasing the box.",
        actions: [{
          taskId: "review-demo-doa-shipment",
          label: "Confirm replacement",
          payload: { caseId: "DOA-TUE-02" },
          risk: "gated",
        }],
      },
      {
        id: "QUESTION-TUE-03",
        kind: "customer_question",
        severity: "urgent",
        customer: "reef_roamer",
        orderId: "RNB-2857",
        shipmentId: "SHP-TUE-112",
        tracking: "7814 0936 2417",
        detectedAt: "TUE · 08:03 ET",
        headline: "Customer asked whether the Wednesday delivery window is confirmed",
        whyBlocked: "Packing is complete, but the customer needs the verified overnight delivery window before the shipment is released.",
        recommendation: "Review the prepared carrier-status reply and record the simulated response before handoff.",
        actions: [{
          taskId: "record-demo-customer-response",
          label: "Review + record reply",
          payload: { caseId: "QUESTION-TUE-03" },
          risk: "gated",
        }],
      },
      {
        id: "WEATHER-TUE-04",
        kind: "weather",
        severity: "watch",
        customer: "mominito",
        orderId: "WEB-7318",
        shipmentId: "SHP-TUE-109",
        tracking: "7814 0936 2384",
        detectedAt: "TUE · 08:06 ET",
        headline: "Warm arrival window requires the planned ice pack",
        whyBlocked: "The shipment stays release-ready only if the ice pack shown on the packing plan is physically confirmed.",
        recommendation: "Confirm the ice pack during final box check; no address or label change is needed.",
        actions: [{
          taskId: "confirm-demo-pack-check",
          label: "Confirm pack check",
          payload: { caseId: "WEATHER-TUE-04" },
          risk: "auto",
        }],
      },
    ],
  }];
}
export function tuesdayListingPlan(scope: "listings" | "inventory"): ComponentSpec[] {
  if (scope === "inventory") {
    return [{
      kind: "staff_agent_board",
      title: "Physical inventory handoff",
      asOf: "TUE · 16:00 ET",
      note: "This remains a human task. eBay mirrors Shopify in the synthetic demo, but staff must manually verify every quantity before completion.",
      tasks: [{
        id: "inventory-check",
        title: "Inspect + update Shopify inventory",
        owner: "Morgan · inventory station",
        agent: "Inventory audit helper",
        source: "Shopify inventory · physical coral system",
        detail: "The SMS activates the local helper and keeps physical inspection with staff.",
        checklist: [
          "Physically inspect each sale-ready coral",
          "Update Shopify quantities from the observed count",
          "Confirm the current eBay mirror completed",
          "Manually compare Shopify, eBay, and the physical count",
        ],
        action: {
          taskId: "request-demo-inventory-check",
          label: "Send inventory SMS",
          payload: { taskId: "inventory-check" },
          risk: "auto",
        },
      }],
    }];
  }

  return [{
    kind: "staff_agent_board",
    title: "Stage Thursday listings",
    asOf: "TUE · 13:00 ET",
    note: "Staff clicks activate local computer agents by simulated SMS. Listings remain drafts until human review.",
    tasks: [
      {
        id: "reefbid-listings",
        title: "ReefnBid auction lots",
        owner: "Sam · photo station",
        agent: "ReefnBid listing agent",
        source: "Newest folder · 07232026 · 18 coral records",
        detail: "Find the newest auction-ready coral set, build lot drafts, and stage them for Thursday at 12:00 PM.",
        checklist: [
          "Open the newest dated ReefnBid folder",
          "Match all 18 photos to coral records",
          "Create draft lots with required image and field checks",
          "Leave the lot queue staged, not live",
        ],
        action: {
          taskId: "activate-demo-listing-agent",
          label: "Text Sam + activate",
          payload: { taskId: "reefbid-listings" },
          risk: "auto",
        },
      },
      {
        id: "shopify-arrivals",
        title: "Shopify new arrivals",
        owner: "Maya · catalog desk",
        agent: "Shopify catalog agent",
        source: "Newest folder · shopify-07232026 · 12 coral records",
        detail: "Build new-arrival product drafts from the newest photo and product-information folder.",
        checklist: [
          "Open the newest Shopify arrivals folder",
          "Match all 12 photos to product records",
          "Create Shopify product drafts",
          "Leave inventory and publish controls with staff",
        ],
        action: {
          taskId: "activate-demo-listing-agent",
          label: "Text Maya + activate",
          payload: { taskId: "shopify-arrivals" },
          risk: "auto",
        },
      },
    ],
  }];
}
