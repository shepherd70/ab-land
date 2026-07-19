import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it external so Next does not bundle it.
  serverExternalPackages: ["better-sqlite3"],
  // Dev-only: let LAN devices (e.g. a tablet on the home network) reach dev
  // endpoints like the HMR websocket when browsing via the network URL.
  allowedDevOrigins: ["10.0.0.*"],
};

export default nextConfig;
