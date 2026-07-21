/** Deterministic customer-side routing. The model may explain the next step,
 * but it does not get to decide whether a non-delegable claim is human-owned. */

export type ShopQuestionRoute = "doa-claim" | "direct-answer" | "human-intake";

const DEATH_SIGNAL = /\b(dead|died|not alive|did not survive|didn't survive|did not make it|didn't make it)\b/i;
const DELIVERY_SIGNAL = /\b(arrived|arrival|delivered|delivery|shipment|shipped|package|box)\b/i;
const CORAL_SIGNAL = /\b(coral|frag|colony)\b/i;
const COMBINE_SIGNAL = /\b(combine|combined|same box|one box|ship together|bundle)\b/i;
const ADDON_SIGNAL = /\b(add[ -]?on|auction win|auction order|winning order)\b/i;

export const SHOP_COMBINE_ANSWER =
  "Yes. In this synthetic demo, Teddy can check whether an eligible add-on order can share one shipment with your auction win. The store confirms the match before anything is merged.";

export function routeShopQuestion(question: string): ShopQuestionRoute {
  const normalized = question.replace(/[’]/g, "'").trim();
  if (/\bdoa\b/i.test(normalized)) return "doa-claim";

  const reportsLoss = DEATH_SIGNAL.test(normalized);
  const hasDeliveryContext = DELIVERY_SIGNAL.test(normalized);
  const namesLivestock = CORAL_SIGNAL.test(normalized);
  if (reportsLoss && (hasDeliveryContext || namesLivestock)) return "doa-claim";
  if (COMBINE_SIGNAL.test(normalized) && ADDON_SIGNAL.test(normalized)) return "direct-answer";
  return "human-intake";
}
