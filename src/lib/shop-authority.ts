/** Deterministic customer-side routing. The model may explain the next step,
 * but it does not get to decide whether a non-delegable claim is human-owned. */

export type ShopQuestionRoute = "doa-claim" | "human-intake";

const DEATH_SIGNAL = /\b(dead|died|not alive|did not survive|didn't survive|did not make it|didn't make it)\b/i;
const DELIVERY_SIGNAL = /\b(arrived|arrival|delivered|delivery|shipment|shipped|package|box)\b/i;
const CORAL_SIGNAL = /\b(coral|frag|colony)\b/i;

export function routeShopQuestion(question: string): ShopQuestionRoute {
  const normalized = question.replace(/[’]/g, "'").trim();
  if (/\bdoa\b/i.test(normalized)) return "doa-claim";

  const reportsLoss = DEATH_SIGNAL.test(normalized);
  const hasDeliveryContext = DELIVERY_SIGNAL.test(normalized);
  const namesLivestock = CORAL_SIGNAL.test(normalized);
  return reportsLoss && (hasDeliveryContext || namesLivestock)
    ? "doa-claim"
    : "human-intake";
}
