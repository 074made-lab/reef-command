import type { Metadata } from "next";
import { MerchantChat } from "@/components/chat/MerchantChat";
import { Header } from "@/components/chat/Header";

export const metadata: Metadata = {
  title: "Reef Command — Merchant Cockpit",
};

// The cockpit is always open — chat, reports, auction board, merge cards, and
// the read-only label manifest need zero config so a downloaded demo shows its
// value immediately. Only the money-moving "Approve & buy labels" action (and
// its progress) is owner-gated, and it unlocks inline at click time
// (ActionChips → /api/owner/login). See src/lib/owner-auth.ts.
export default function MerchantPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header surface="merchant" />
      <MerchantChat />
    </div>
  );
}
