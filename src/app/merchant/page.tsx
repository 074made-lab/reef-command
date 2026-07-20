import type { Metadata } from "next";
import { MerchantChat } from "@/components/chat/MerchantChat";
import { Header } from "@/components/chat/Header";

export const metadata: Metadata = {
  title: "Reef Command — Merchant Cockpit",
};

export default function MerchantPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header surface="merchant" />
      <MerchantChat />
    </div>
  );
}
