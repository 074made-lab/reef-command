import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MerchantChat } from "@/components/chat/MerchantChat";
import { Header } from "@/components/chat/Header";
import { OwnerGate } from "@/components/chat/OwnerGate";
import { OWNER_COOKIE, ownerAuthConfigured, verifySessionValue } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Reef Command — Merchant Cockpit",
};

export default async function MerchantPage() {
  // The cockpit gates its money-moving actions behind an owner session (R3-P1).
  // No valid session → the unlock gate instead of the chat surface; the same
  // session is then required by /api/actions and the progress query.
  const jar = await cookies();
  const session = verifySessionValue(jar.get(OWNER_COOKIE)?.value, Date.now());

  return (
    <div className="flex h-dvh flex-col">
      <Header surface="merchant" />
      {session ? <MerchantChat /> : <OwnerGate configured={ownerAuthConfigured()} />}
    </div>
  );
}
