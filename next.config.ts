import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Lets the dev server (HMR, RSC data requests) be reached from the LAN IP
  // used to test the walk-in/new-hiring QR links on an actual phone —
  // without this, Next's dev server can restrict cross-origin dev requests
  // from anything other than localhost.
  allowedDevOrigins: ["192.168.43.198"],
};

export default nextConfig;
