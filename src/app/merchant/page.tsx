import type { Metadata } from "next";
import { ChatShell } from "@/components/chat/ChatShell";
import { Header } from "@/components/chat/Header";

export const metadata: Metadata = {
  title: "Reef Command — Merchant Cockpit",
};

export default function MerchantPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header surface="merchant" />
      <ChatShell placeholder="Ask the reef — attention, revenue, auction, merges, report…" />
    </div>
  );
}
