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
    shipDate: "Tuesday · Jul 21, 2026",
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

const wednesdayShipments = [
  {
    shipmentId: "SHP-WED-201", orderId: "RNB-2902", customer: "kelp_arcade",
    tracking: "7814 0936 3104", destination: "Richmond, VA", coralUnits: 3,
    pack: "ice" as const, handoffAt: "WED · 16:30 ET", status: "blocked" as const,
    blockerIds: ["ADDR-WED-01"],
  },
  {
    shipmentId: "SHP-WED-207", orderId: "WEB-7416", customer: "torchkeeper",
    tracking: "7814 0936 3278", destination: "Pittsburgh, PA", coralUnits: 2,
    pack: "none" as const, handoffAt: "WED · 16:30 ET", status: "held" as const,
    blockerIds: ["DOA-WED-02"],
  },
  {
    shipmentId: "SHP-WED-214", orderId: "EBY-4488", customer: "currentgarden",
    tracking: "7814 0936 3351", destination: "Boston, MA", coralUnits: 4,
    pack: "none" as const, handoffAt: "WED · 16:30 ET", status: "blocked" as const,
    blockerIds: ["QUESTION-WED-03"],
  },
  {
    shipmentId: "SHP-WED-219", orderId: "RNB-2918", customer: "blue_tide88",
    tracking: "7814 0936 3487", destination: "Baltimore, MD", coralUnits: 5,
    pack: "ice" as const, handoffAt: "WED · 16:30 ET", status: "blocked" as const,
    blockerIds: ["PACK-WED-04"],
  },
] satisfies Extract<ComponentSpec, { kind: "shipment_command_board" }>['shipments'];

/** Wednesday's final regular ship day: every unfinished box stays visible. */
export function wednesdayShippingCommand(): ComponentSpec[] {
  return [{
    kind: "shipment_command_board",
    day: "wednesday",
    title: "Finish today's final regular shipments",
    asOf: "WED · 09:30 ET",
    mode: "ship",
    shipDate: "Wednesday · Jul 22, 2026",
    carrierCutoff: "Final regular FedEx handoff · 16:30 ET",
    shipments: wednesdayShipments,
    issues: [
      {
        id: "ADDR-WED-01", kind: "address_change", severity: "urgent",
        customer: "kelp_arcade", orderId: "RNB-2902", shipmentId: "SHP-WED-201",
        tracking: "7814 0936 3104", detectedAt: "WED · 08:42 ET",
        headline: "Apartment number is missing from the final-day label",
        whyBlocked: "The destination is incomplete and cannot be released on the last regular ship day.",
        currentValue: "401 River St, Richmond, VA 23219",
        recommendation: "Confirm Apt 6C, refresh the label preview, and return the box to the handoff queue.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Confirm address + refresh", payload: { issueId: "ADDR-WED-01" }, risk: "gated" }],
      },
      {
        id: "DOA-WED-02", kind: "doa", severity: "urgent",
        customer: "torchkeeper", orderId: "WEB-7416", shipmentId: "SHP-WED-207",
        tracking: "7814 0936 3278", detectedAt: "WED · 08:51 ET",
        headline: "Replacement coral must be confirmed before the final handoff",
        whyBlocked: "The approved replacement is on the order, but the bag label is not yet checked against the packing slip.",
        recommendation: "Confirm the replacement bag and packing-slip line, then release the shipment.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Confirm replacement pack", payload: { issueId: "DOA-WED-02" }, risk: "gated" }],
      },
      {
        id: "QUESTION-WED-03", kind: "customer_question", severity: "urgent",
        customer: "currentgarden", orderId: "EBY-4488", shipmentId: "SHP-WED-214",
        tracking: "7814 0936 3351", detectedAt: "WED · 09:04 ET",
        headline: "Customer needs the verified Thursday delivery window",
        whyBlocked: "The customer asked for confirmation before release and the response has not been recorded.",
        recommendation: "Review the overnight delivery facts and record the simulated response before handoff.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Record delivery answer", payload: { issueId: "QUESTION-WED-03" }, risk: "gated" }],
      },
      {
        id: "PACK-WED-04", kind: "packing_incomplete", severity: "urgent",
        customer: "blue_tide88", orderId: "RNB-2918", shipmentId: "SHP-WED-219",
        tracking: "7814 0936 3487", detectedAt: "WED · 09:12 ET",
        headline: "One final-day box still needs its coral count completed",
        whyBlocked: "Five coral bags are expected, but only four are checked on the final packing pass.",
        recommendation: "Complete the fifth bag check and verify the ice pack before carrier release.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Complete final pack", payload: { issueId: "PACK-WED-04" }, risk: "gated" }],
      },
    ],
  }];
}

/** Wednesday watches every Tuesday box and escalates overnight risk immediately. */
export function wednesdayTuesdayShipmentWatch(): ComponentSpec[] {
  return [{
    kind: "shipment_command_board",
    day: "wednesday",
    title: "Monitor Tuesday's overnight shipments",
    asOf: "WED · 10:05 ET",
    mode: "monitor",
    shipDate: "Shipped Tuesday · Jul 21, 2026",
    carrierCutoff: "Overnight health response · immediate",
    shipments: [
      { ...tuesdayShipments[0], status: "exception", blockerIds: ["EXC-WED-11"] },
      { ...tuesdayShipments[1], status: "delayed", blockerIds: ["DELAY-WED-12"] },
      { ...tuesdayShipments[2], status: "delivered", blockerIds: ["CARE-WED-13"] },
      { ...tuesdayShipments[3], status: "delayed", blockerIds: ["STALL-WED-14"] },
      { ...tuesdayShipments[4], status: "delivered", blockerIds: ["DOA-WED-15"] },
    ],
    issues: [
      {
        id: "EXC-WED-11", kind: "delivery_exception", severity: "urgent",
        customer: "lagoon_riley", orderId: "RNB-2841", shipmentId: "SHP-TUE-104",
        tracking: "7814 0936 2251", detectedAt: "WED · 09:18 ET",
        headline: "Carrier needs the corrected apartment address confirmed",
        whyBlocked: "The package is at the destination station but the corrected unit must be reconfirmed before delivery.",
        recommendation: "Confirm the corrected address with the carrier and record the delivery-exception follow-up.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Confirm carrier correction", payload: { issueId: "EXC-WED-11" }, risk: "gated" }],
      },
      {
        id: "DELAY-WED-12", kind: "carrier_delay", severity: "urgent",
        customer: "mominito", orderId: "WEB-7318", shipmentId: "SHP-TUE-109",
        tracking: "7814 0936 2384", detectedAt: "WED · 09:26 ET",
        headline: "Mominito's overnight box missed the destination sort",
        whyBlocked: "FedEx now shows a delay beyond the planned Wednesday delivery window for a live-coral shipment.",
        recommendation: "Remind the owner to contact FedEx now, then record the escalation for this exact tracking number.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Remind owner · contact FedEx", payload: { issueId: "DELAY-WED-12" }, risk: "gated" }],
      },
      {
        id: "CARE-WED-13", kind: "customer_question", severity: "urgent",
        customer: "reef_roamer", orderId: "RNB-2857", shipmentId: "SHP-TUE-112",
        tracking: "7814 0936 2417", detectedAt: "WED · 09:41 ET",
        headline: "Delivered coral looks stressed; customer asks what to do now",
        whyBlocked: "A post-delivery health question needs an immediate, traceable response while the coral is still acclimating.",
        recommendation: "Send the prepared gentle-flow, stable-temperature recovery guidance and ask the customer to keep monitoring.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Send recovery guidance", payload: { issueId: "CARE-WED-13" }, risk: "gated" }],
      },
      {
        id: "STALL-WED-14", kind: "stalled", severity: "urgent",
        customer: "bluepolyp", orderId: "EBY-4412", shipmentId: "SHP-TUE-118",
        tracking: "7814 0936 2599", detectedAt: "WED · 09:49 ET",
        headline: "Package has not moved since the Tuesday origin scan",
        whyBlocked: "No new carrier event has appeared during the overnight window, so delivery risk is increasing.",
        recommendation: "Remind the owner to contact FedEx and record a no-movement escalation immediately.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Escalate no movement", payload: { issueId: "STALL-WED-14" }, risk: "gated" }],
      },
      {
        id: "DOA-WED-15", kind: "doa", severity: "urgent",
        customer: "tideglass", orderId: "WEB-7340", shipmentId: "SHP-TUE-121",
        tracking: "7814 0936 2632", detectedAt: "WED · 09:57 ET",
        headline: "Customer reports one delivered coral is not doing well",
        whyBlocked: "The live-animal health report arrived minutes after delivery and needs immediate care and claim guidance.",
        recommendation: "Respond now with stabilization guidance, preserve the order and delivery evidence, and direct the customer to /shop/doa-claim.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Send care + DOA path", payload: { issueId: "DOA-WED-15" }, risk: "gated" }],
      },
    ],
  }];
}

/** Thursday watches all Wednesday boxes against the same live-animal contract. */
export function thursdayWednesdayShipmentWatch(): ComponentSpec[] {
  return [{
    kind: "shipment_command_board",
    day: "thursday",
    title: "Monitor Wednesday's overnight shipments",
    asOf: "THU · 09:20 ET",
    mode: "monitor",
    shipDate: "Shipped Wednesday · Jul 22, 2026",
    carrierCutoff: "Overnight health response · immediate",
    shipments: [
      { ...wednesdayShipments[0], status: "delayed", blockerIds: ["DELAY-THU-21"] },
      { ...wednesdayShipments[1], status: "delivered", blockerIds: ["DOA-THU-22"] },
      { ...wednesdayShipments[2], status: "exception", blockerIds: ["ADDR-THU-23"] },
      { ...wednesdayShipments[3], status: "delivered", blockerIds: ["EXC-THU-24", "CARE-THU-25"] },
    ],
    issues: [
      {
        id: "DELAY-THU-21", kind: "carrier_delay", severity: "urgent",
        customer: "kelp_arcade", orderId: "RNB-2902", shipmentId: "SHP-WED-201",
        tracking: "7814 0936 3104", detectedAt: "THU · 08:37 ET",
        headline: "Overnight box is delayed at the regional hub",
        whyBlocked: "The expected Thursday delivery scan is missing for a live-coral package.",
        recommendation: "Remind the owner to contact FedEx immediately and record the exact tracking escalation.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Remind owner · contact FedEx", payload: { issueId: "DELAY-THU-21" }, risk: "gated" }],
      },
      {
        id: "DOA-THU-22", kind: "doa", severity: "urgent",
        customer: "torchkeeper", orderId: "WEB-7416", shipmentId: "SHP-WED-207",
        tracking: "7814 0936 3278", detectedAt: "THU · 08:49 ET",
        headline: "Customer reports a coral arrived dead",
        whyBlocked: "The report arrived shortly after delivery and needs immediate evidence preservation and claim direction.",
        recommendation: "Respond now, preserve delivery evidence, provide safe stabilization guidance, and direct the customer to /shop/doa-claim.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Send guidance + DOA path", payload: { issueId: "DOA-THU-22" }, risk: "gated" }],
      },
      {
        id: "ADDR-THU-23", kind: "address_change", severity: "urgent",
        customer: "currentgarden", orderId: "EBY-4488", shipmentId: "SHP-WED-214",
        tracking: "7814 0936 3351", detectedAt: "THU · 08:56 ET",
        headline: "Carrier flagged a destination address mismatch",
        whyBlocked: "Delivery cannot complete until the customer-confirmed street suffix is relayed to the station.",
        currentValue: "17 Beacon Rd, Boston, MA 02108",
        recommendation: "Confirm 17 Beacon Road and record the carrier address correction against this shipment.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Confirm address correction", payload: { issueId: "ADDR-THU-23" }, risk: "gated" }],
      },
      {
        id: "EXC-THU-24", kind: "delivery_exception", severity: "urgent",
        customer: "blue_tide88", orderId: "RNB-2918", shipmentId: "SHP-WED-219",
        tracking: "7814 0936 3487", detectedAt: "THU · 09:03 ET",
        headline: "Delivered box was left outside the requested handoff point",
        whyBlocked: "The customer found the live-coral box after an exception scan and needs immediate next steps.",
        recommendation: "Record the delivery exception, confirm the box is indoors, and continue with the prepared health check.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Record delivery exception", payload: { issueId: "EXC-THU-24" }, risk: "gated" }],
      },
      {
        id: "CARE-THU-25", kind: "customer_question", severity: "urgent",
        customer: "blue_tide88", orderId: "RNB-2918", shipmentId: "SHP-WED-219",
        tracking: "7814 0936 3487", detectedAt: "THU · 09:11 ET",
        headline: "Customer asks how to help a stressed coral recover",
        whyBlocked: "A time-sensitive post-delivery care question is still unanswered.",
        recommendation: "Send the prepared stable-temperature and gentle-flow guidance, then point to the DOA claim path if the coral declines.",
        actions: [{ taskId: "resolve-demo-weekday-shipping", label: "Send recovery guidance", payload: { issueId: "CARE-THU-25" }, risk: "gated" }],
      },
    ],
  }];
}

export function fridayOperations(scope: "social" | "issues"): ComponentSpec[] {
  if (scope === "social") {
    return [{
      kind: "staff_agent_board",
      title: "Social media reminder",
      asOf: "FRI · 15:30 ET",
      note: "One staff action records a simulated team SMS. Filming and posting remain human-owned.",
      tasks: [{
        id: "friday-social-reminder",
        title: "Film + publish the week's best corals",
        owner: "Content team · sales floor",
        agent: "Staff reminder helper",
        source: "Friday content queue · current auction highlights",
        detail: "Send the team a concise checklist while the strongest auction corals are still available to film.",
        checklist: [
          "Film the best corals of the week",
          "Prepare the short-form social content",
          "Post the approved content on Instagram",
          "Post the approved content on TikTok",
        ],
        action: {
          taskId: "send-demo-social-reminder",
          label: "Send team SMS",
          payload: { taskId: "friday-social-reminder" },
          risk: "auto",
        },
      }],
    }];
  }

  return [{
    kind: "customer_resolution_board",
    title: "Resolve remaining customer issues",
    asOf: "FRI · 18:30 ET",
    note: "Every open item from the prior sales cycle has one explicit next action. Customer messages stay simulated.",
    items: [
      {
        id: "FRI-MSG-31", kind: "unanswered_message", customer: "sandbar_amy", orderId: "WEB-7462",
        openedAt: "FRI · 17:42 ET", headline: "Unanswered acclimation message",
        detail: "The customer asked whether the light should stay low after arrival and has not received a response.",
        nextAction: "Review and record the prepared low-light acclimation reply.",
        action: { taskId: "resolve-demo-customer-issue", label: "Record prepared reply", payload: { issueId: "FRI-MSG-31" }, risk: "gated" },
      },
      {
        id: "FRI-SHIP-32", kind: "shipping_problem", customer: "kelp_arcade", orderId: "RNB-2902",
        shipmentId: "SHP-WED-201", tracking: "7814 0936 3104", openedAt: "FRI · 17:48 ET",
        headline: "Carrier escalation needs its final outcome",
        detail: "FedEx delivered the delayed box, but the incident record still lacks the final delivery scan and customer confirmation.",
        nextAction: "Attach the delivered scan and record the customer check-in.",
        action: { taskId: "resolve-demo-customer-issue", label: "Close shipping follow-up", payload: { issueId: "FRI-SHIP-32" }, risk: "gated" },
      },
      {
        id: "FRI-DOA-33", kind: "doa", customer: "torchkeeper", orderId: "WEB-7416",
        shipmentId: "SHP-WED-207", tracking: "7814 0936 3278", openedAt: "FRI · 17:55 ET",
        headline: "DOA evidence submission is still incomplete",
        detail: "The customer received immediate guidance and the claim path, but one required evidence photo is still missing.",
        nextAction: "Send the prepared evidence reminder and keep the case open for human review.",
        action: { taskId: "resolve-demo-customer-issue", label: "Record evidence reminder", payload: { issueId: "FRI-DOA-33" }, risk: "gated" },
      },
      {
        id: "FRI-CREDIT-34", kind: "replacement_credit", customer: "tideglass", orderId: "WEB-7340",
        openedAt: "FRI · 18:02 ET", headline: "Replacement or credit follow-up needs a decision",
        detail: "The case is documented, but the remedy remains with the owner and no outcome may be invented.",
        nextAction: "Route the complete case to the owner for the replacement-or-credit decision.",
        action: { taskId: "resolve-demo-customer-issue", label: "Route owner decision", payload: { issueId: "FRI-CREDIT-34" }, risk: "gated" },
      },
      {
        id: "FRI-ADDR-35", kind: "address_issue", customer: "currentgarden", orderId: "EBY-4488",
        shipmentId: "SHP-WED-214", tracking: "7814 0936 3351", openedAt: "FRI · 18:11 ET",
        headline: "Corrected delivery address needs audit closure",
        detail: "The carrier used the confirmed street suffix, but the resolution is not attached to the order timeline.",
        nextAction: "Record the confirmed address and delivered scan on the order audit trail.",
        action: { taskId: "resolve-demo-customer-issue", label: "Close address audit", payload: { issueId: "FRI-ADDR-35" }, risk: "gated" },
      },
      {
        id: "FRI-ORDER-36", kind: "order_question", customer: "lagoon_riley", orderId: "RNB-2841",
        openedAt: "FRI · 18:18 ET", headline: "Open question about adding a coral next cycle",
        detail: "The customer asked whether a future item can be added to the already delivered order.",
        nextAction: "Record the prepared answer that delivered orders cannot be reopened and route any new purchase separately.",
        action: { taskId: "resolve-demo-customer-issue", label: "Record order answer", payload: { issueId: "FRI-ORDER-36" }, risk: "gated" },
      },
    ],
  }];
}
