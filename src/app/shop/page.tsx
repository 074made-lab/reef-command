import type { Metadata } from "next";
import { ChatShell } from "@/components/chat/ChatShell";
import { Header } from "@/components/chat/Header";

export const metadata: Metadata = {
  title: "Reef Command — Customer Concierge",
};

export default function ShopPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header surface="shop" />
      <ChatShell
        disabled
        placeholder="Concierge opens tomorrow…"
        initialMessages={[
          {
            verdict: "Concierge opens tomorrow — order tracking & DOA claims.",
            components: [
              {
                kind: "verdict_card",
                verdict:
                  "This is the customer-facing side of the same chat protocol. When it opens, buyers track combined shipments, file DOA claims with photo evidence, and add corals to an open box — all as components, never a wall of text.",
                confidence: "high",
                evidence: [
                  {
                    label: "order tracking",
                    detail: "live timeline of your combined shipment",
                  },
                  {
                    label: "DOA claims",
                    detail: "guided evidence intake, human decides",
                  },
                  {
                    label: "add-on window",
                    detail: "one shipping fee covers everything in the box",
                  },
                ],
              },
            ],
          },
        ]}
      />
    </div>
  );
}
