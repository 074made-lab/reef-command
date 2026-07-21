import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating Next.js dev indicator sits over the composer's first
  // characters. Production builds never render it; disable it in dev too.
  devIndicators: false,
};

export default nextConfig;
