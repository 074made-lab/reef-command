import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating Next.js dev indicator sits bottom-left — exactly over the
  // composer's first characters — and would show in every screen recording.
  // Production builds never render it; disable it in dev too.
  devIndicators: false,
};

export default nextConfig;
